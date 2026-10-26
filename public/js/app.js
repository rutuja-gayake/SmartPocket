/**
 * SmartPocket Application Controller & Single Page Application Router
 */

import { api } from './api.js';
import { checkAuth, getCurrentUser, setCurrentUser, logoutUser } from './auth.js';
import {
  formatINR,
  formatRupeesPlain,
  rupeesToPaise,
  getCurrentPeriod,
  calculateSafeDailySpending,
  calculateAvailableBalance,
  calculate503020Metrics,
  calculateGoalProgress
} from './calculations.js';
import {
  getAllLocalTransactions,
  saveLocalTransaction,
  deleteLocalTransaction,
  getAllLocalGoals,
  saveLocalGoal,
  deleteLocalGoal,
  getLocalBudget,
  saveLocalBudget,
  getAllLocalCategories
} from './db.js';
import { synchronize, subscribeSyncState, queueOfflineAction, updatePendingCount } from './sync.js';
import { renderSpendingTrendChart, renderCategoryDistributionChart } from './charts.js';
import { showToast, openModal, closeModal, getStatusBadgeHtml } from './ui.js';

let activeView = 'dashboard';
let currentPeriod = getCurrentPeriod();
let cachedCategories = [];
let pending2faTempToken = null;

/**
 * Switch Active View
 */
export function navigateTo(viewName) {
  const user = getCurrentUser();
  if (!user && viewName !== 'auth' && viewName !== 'welcome') {
    showToast('Please sign in to access your finances.', 'info');
    viewName = 'auth';
  }

  activeView = viewName;

  // Toggle sections
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');

  // Toggle nav buttons
  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(el => {
    if (el.dataset.view === viewName) el.classList.add('active');
    else el.classList.remove('active');
  });

  // Update Topbar title
  const titles = {
    welcome: 'Welcome to SmartPocket',
    auth: 'Sign In / Register',
    dashboard: 'Financial Dashboard',
    transactions: 'Transaction History',
    budgets: 'Budgets & 50/30/20 Analysis',
    goals: 'Savings Goals',
    advisor: 'Pocket AI Advisor',
    security: 'Security & 2FA Settings'
  };
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = titles[viewName] || 'SmartPocket';

  // Load view-specific data
  if (user) {
    if (viewName === 'dashboard') loadDashboard();
    if (viewName === 'transactions') loadTransactions();
    if (viewName === 'budgets') loadBudgets();
    if (viewName === 'goals') loadGoals();
    if (viewName === 'security') loadSecurity();
  }
}

/**
 * Dashboard Loader
 */
async function loadDashboard() {
  try {
    let txs = [];
    let budget = null;
    let goals = [];

    if (window.navigator.onLine) {
      const [txRes, budgetRes, goalsRes] = await Promise.all([
        api.transactions.list(`period=${currentPeriod}`),
        api.budgets.get(currentPeriod),
        api.goals.list()
      ]);
      txs = txRes.transactions || [];
      budget = budgetRes.budget || null;
      goals = goalsRes.goals || [];
    } else {
      const allLocal = await getAllLocalTransactions();
      txs = allLocal.filter(t => t.date.startsWith(currentPeriod));
      budget = await getLocalBudget(currentPeriod);
      goals = await getAllLocalGoals();
    }

    // Calculate metrics
    let totalIncome = 0;
    let totalExpense = 0;
    let needsExpense = 0;
    let wantsExpense = 0;
    let savingsTransfers = 0;

    const dailyMap = new Map();

    for (const t of txs) {
      if (t.type === 'income') totalIncome += t.amount_paise;
      else if (t.type === 'expense') {
        totalExpense += t.amount_paise;
        if (t.classification === 'need') needsExpense += t.amount_paise;
        if (t.classification === 'want') wantsExpense += t.amount_paise;

        const dayTotal = dailyMap.get(t.date) || 0;
        dailyMap.set(t.date, dayTotal + t.amount_paise);
      } else if (t.type === 'transfer_savings') {
        savingsTransfers += t.amount_paise;
      }
    }

    const availableBalancePaise = calculateAvailableBalance({
      totalIncomePaise: totalIncome,
      totalExpensePaise: totalExpense,
      netSavingsTransfersPaise: savingsTransfers
    });

    const monthlyBudgetPaise = budget ? budget.total_budget_paise : 0;
    const safeDaily = calculateSafeDailySpending({
      availableBalancePaise,
      monthlyBudgetPaise,
      currentMonthExpensePaise: totalExpense,
      currentDate: new Date(),
      totalTransactionCount: txs.length
    });

    // Populate UI elements
    document.getElementById('dash-available-balance').textContent = formatINR(availableBalancePaise);
    document.getElementById('dash-safe-daily').textContent = formatINR(safeDaily.safeDailyPaise);
    document.getElementById('dash-safe-daily-desc').textContent = safeDaily.message;
    document.getElementById('dash-safe-status-badge').innerHTML = getStatusBadgeHtml(safeDaily.status);

    document.getElementById('dash-income').textContent = formatINR(totalIncome);
    document.getElementById('dash-expense').textContent = formatINR(totalExpense);
    document.getElementById('dash-budget-total').textContent = monthlyBudgetPaise > 0 ? formatINR(monthlyBudgetPaise) : 'No Budget Set';

    // 50/30/20 Guideline metrics
    const metrics503020 = calculate503020Metrics({
      incomePaise: totalIncome,
      needsPaise: needsExpense,
      wantsPaise: wantsExpense,
      savingsPaise: savingsTransfers
    });

    document.getElementById('dash-needs-pct').textContent = `${metrics503020.actual.actualNeedsPct}%`;
    document.getElementById('dash-needs-amount').textContent = formatINR(needsExpense);
    document.getElementById('dash-wants-pct').textContent = `${metrics503020.actual.actualWantsPct}%`;
    document.getElementById('dash-wants-amount').textContent = formatINR(wantsExpense);

    // Render Recent Transactions
    const recentList = document.getElementById('dash-recent-tx');
    if (recentList) {
      if (txs.length === 0) {
        recentList.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 24px; color: var(--color-text-muted);">No transactions recorded this month. Click "+ Add Transaction" to begin.</td></tr>';
      } else {
        recentList.innerHTML = txs.slice(0, 5).map(t => `
          <tr>
            <td>${t.date}</td>
            <td><strong>${escapeHtml(t.category_name)}</strong><br><small style="color:var(--color-text-muted)">${escapeHtml(t.description || '')}</small></td>
            <td><span class="badge-tag badge-${t.classification}">${t.classification}</span></td>
            <td class="amount-${t.type}" style="text-align:right;">${t.type === 'income' ? '+' : '-'}${formatINR(t.amount_paise)}</td>
          </tr>
        `).join('');
      }
    }

    // Render Charts
    const trendData = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, amountPaise]) => ({ date, amountPaise }));

    renderSpendingTrendChart(
      document.getElementById('trend-chart'),
      trendData,
      safeDaily.safeDailyPaise
    );

    // Category aggregation
    const catMap = new Map();
    for (const t of txs) {
      if (t.type === 'expense') {
        const existing = catMap.get(t.category_name) || 0;
        catMap.set(t.category_name, existing + t.amount_paise);
      }
    }
    const catTotals = Array.from(catMap.entries()).map(([name, total]) => ({
      category_name: name,
      total_paise: total
    }));

    renderCategoryDistributionChart(
      document.getElementById('category-chart'),
      catTotals
    );

  } catch (err) {
    console.error('Failed to load dashboard:', err);
    showToast('Failed to load dashboard data.', 'error');
  }
}

/**
 * Transaction History Loader
 */
async function loadTransactions() {
  try {
    const searchVal = document.getElementById('tx-search')?.value || '';
    const typeVal = document.getElementById('tx-filter-type')?.value || '';
    const classVal = document.getElementById('tx-filter-class')?.value || '';

    let txs = [];
    if (window.navigator.onLine) {
      let params = `period=${currentPeriod}`;
      if (typeVal) params += `&type=${typeVal}`;
      if (classVal) params += `&classification=${classVal}`;
      if (searchVal) params += `&search=${encodeURIComponent(searchVal)}`;

      const res = await api.transactions.list(params);
      txs = res.transactions || [];
    } else {
      const allLocal = await getAllLocalTransactions();
      txs = allLocal.filter(t => {
        if (!t.date.startsWith(currentPeriod)) return false;
        if (typeVal && t.type !== typeVal) return false;
        if (classVal && t.classification !== classVal) return false;
        if (searchVal && !t.category_name.toLowerCase().includes(searchVal.toLowerCase()) && !t.description.toLowerCase().includes(searchVal.toLowerCase())) return false;
        return true;
      });
    }

    const tbody = document.getElementById('tx-table-body');
    if (!tbody) return;

    if (txs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 32px; color: var(--color-text-muted);">No matching transactions found.</td></tr>';
      return;
    }

    tbody.innerHTML = txs.map(t => `
      <tr>
        <td>${t.date}</td>
        <td>
          <strong>${escapeHtml(t.category_name)}</strong>
          ${t.description ? `<div style="font-size:0.78rem; color:var(--color-text-muted);">${escapeHtml(t.description)}</div>` : ''}
        </td>
        <td><span class="badge-tag badge-${t.classification}">${t.classification}</span></td>
        <td class="amount-${t.type}">
          ${t.type === 'income' ? '+' : '-'}${formatINR(t.amount_paise)}
        </td>
        <td style="text-align:right;">
          <button class="btn btn-secondary btn-sm" onclick="window.SmartPocket.deleteTransaction('${t.id}')">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load transactions:', err);
    showToast('Failed to load transactions.', 'error');
  }
}

/**
 * Budgets & 50/30/20 Loader
 */
async function loadBudgets() {
  try {
    let budgetData = null;
    if (window.navigator.onLine) {
      budgetData = await api.budgets.get(currentPeriod);
    } else {
      const b = await getLocalBudget(currentPeriod);
      budgetData = { budget: b, periodStats: { income_paise: 0, expense_paise: 0 } };
    }

    const budget = budgetData.budget;
    const input = document.getElementById('budget-total-input');
    if (input && budget) {
      input.value = paiseToRupees(budget.total_budget_paise);
    }

    const safeDaily = budgetData.safeDaily;
    if (safeDaily) {
      document.getElementById('budget-safe-daily').textContent = formatINR(safeDaily.safeDailyPaise);
      document.getElementById('budget-safe-msg').textContent = safeDaily.message;
    }
  } catch (err) {
    console.error('Failed to load budget:', err);
  }
}

/**
 * Savings Goals Loader
 */
async function loadGoals() {
  try {
    let goals = [];
    if (window.navigator.onLine) {
      const res = await api.goals.list();
      goals = res.goals || [];
    } else {
      goals = await getAllLocalGoals();
    }

    const container = document.getElementById('goals-container');
    if (!container) return;

    if (goals.length === 0) {
      container.innerHTML = '<div class="card" style="text-align:center; padding: 48px;"><p>No savings goals set yet. Save for semester books, a college trip, or tech gear!</p><button class="btn btn-primary" style="margin-top: 16px;" onclick="window.SmartPocket.openAddGoalModal()">+ Create Your First Goal</button></div>';
      return;
    }

    container.innerHTML = goals.map(g => {
      const analysis = g.analysis || calculateGoalProgress(g, new Date());
      return `
        <div class="card" style="margin-bottom: 16px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 12px;">
            <div>
              <h3 style="font-size:1.15rem; color:var(--color-primary);">${escapeHtml(g.title)}</h3>
              <p style="font-size:0.82rem; margin-top:2px;">Target: ${formatINR(g.target_amount_paise)} ${g.target_date ? `• By ${g.target_date}` : ''}</p>
            </div>
            <span class="status-badge ${g.status === 'completed' ? 'healthy' : 'near_limit'}">${g.status}</span>
          </div>

          <!-- Progress Bar -->
          <div style="background-color: var(--color-mint); border-radius: var(--radius-full); height: 10px; overflow: hidden; margin-bottom: 8px;">
            <div style="background-color: var(--color-savings); height: 100%; width: ${analysis.progressPct}%; transition: width 0.3s ease;"></div>
          </div>

          <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--color-text-muted); margin-bottom: 16px;">
            <span>Saved: <strong>${formatINR(g.current_saved_paise)}</strong> (${analysis.progressPct}%)</span>
            <span>Remaining: <strong>${formatINR(analysis.remainingPaise)}</strong></span>
          </div>

          ${analysis.suggestedWeeklyPaise ? `<p style="font-size:0.82rem; color:var(--color-primary); margin-bottom: 16px;">💡 Suggested pace: Save <strong>${formatINR(analysis.suggestedWeeklyPaise)}/week</strong> to reach target on time.</p>` : ''}

          <div style="display:flex; gap: 8px;">
            <button class="btn btn-primary btn-sm" onclick="window.SmartPocket.openGoalMovementModal('${g.id}', 'deposit')">+ Deposit</button>
            <button class="btn btn-secondary btn-sm" onclick="window.SmartPocket.openGoalMovementModal('${g.id}', 'withdrawal')">- Withdraw</button>
            <button class="btn btn-secondary btn-sm" style="margin-left:auto;" onclick="window.SmartPocket.deleteGoal('${g.id}')">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load goals:', err);
  }
}

/**
 * Security View Loader
 */
async function loadSecurity() {
  const user = getCurrentUser();
  const statusEl = document.getElementById('security-2fa-status');
  const btnEl = document.getElementById('btn-toggle-2fa');
  if (!user || !statusEl || !btnEl) return;

  if (user.totpEnabled) {
    statusEl.innerHTML = '<span class="status-badge healthy">Enabled</span>';
    btnEl.textContent = 'Disable Two-Factor Authentication';
    btnEl.className = 'btn btn-danger';
  } else {
    statusEl.innerHTML = '<span class="status-badge no_budget">Disabled</span>';
    btnEl.textContent = 'Enable Two-Factor Authentication';
    btnEl.className = 'btn btn-primary';
  }
}

/**
 * Advisor Chat Handler
 */
async function askAdvisor(queryText) {
  const input = document.getElementById('advisor-input');
  const query = queryText || input?.value;
  if (!query || query.trim().length === 0) return;

  if (input) input.value = '';

  const messagesContainer = document.getElementById('advisor-messages');
  if (!messagesContainer) return;

  // Append user bubble
  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user';
  userBubble.textContent = query;
  messagesContainer.appendChild(userBubble);

  // Append thinking bubble
  const assistantBubble = document.createElement('div');
  assistantBubble.className = 'chat-bubble assistant';
  assistantBubble.textContent = 'Analyzing your pocket finances...';
  messagesContainer.appendChild(assistantBubble);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  try {
    const preferCloud = document.getElementById('advisor-cloud-toggle')?.checked || false;
    const res = await api.advisor.query({ query, preferCloud });

    assistantBubble.innerHTML = `
      <div>${escapeHtml(res.answer)}</div>
      <div style="margin-top: 6px; font-size: 0.72rem; color: var(--color-text-muted);">
        Mode: ${res.mode === 'cloud' ? `☁️ Cloud AI (${res.provider})` : '🔒 Offline Deterministic Engine'}
      </div>
    `;
  } catch (err) {
    assistantBubble.textContent = 'Unable to evaluate query at the moment. Please verify your connection or try a simpler question.';
  }
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Helper: Escapes HTML to prevent XSS
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Switch Auth Tabs (Sign In vs Register)
 */
export function showAuthTab(tab) {
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');

  if (tab === 'login') {
    if (formLogin) formLogin.style.display = 'block';
    if (formRegister) formRegister.style.display = 'none';
    if (tabLogin) {
      tabLogin.style.borderBottom = '2px solid var(--color-primary)';
      tabLogin.style.fontWeight = '600';
    }
    if (tabRegister) {
      tabRegister.style.borderBottom = 'none';
      tabRegister.style.fontWeight = 'normal';
    }
  } else {
    if (formLogin) formLogin.style.display = 'none';
    if (formRegister) formRegister.style.display = 'block';
    if (tabLogin) {
      tabLogin.style.borderBottom = 'none';
      tabLogin.style.fontWeight = 'normal';
    }
    if (tabRegister) {
      tabRegister.style.borderBottom = '2px solid var(--color-primary)';
      tabRegister.style.fontWeight = '600';
    }
  }
}
window.showAuthTab = showAuthTab;

/**
 * 1-Click Demo Login Helper
 */
export async function loginDemoUser() {
  try {
    showToast('Signing in with demo student account...', 'info');
    const res = await api.auth.login({
      email: 'student@example.edu',
      password: 'Password123!'
    });
    setCurrentUser(res.user);
    updateUserBadges(res.user);
    showToast('Welcome, Aarav! (Demo Account Active)', 'success');
    navigateTo('dashboard');
  } catch (err) {
    showToast('Demo sign-in failed: ' + err.message, 'error');
  }
}
window.loginDemoUser = loginDemoUser;

/**
 * Global App API exposed on window.SmartPocket for inline event handlers
 */
window.SmartPocket = {
  navigateTo,
  showAuthTab,
  loginDemoUser,
  openAddTransactionModal: () => {
    const user = getCurrentUser();
    if (!user) {
      showToast('Please sign in to add transactions.', 'info');
      navigateTo('auth');
      return;
    }
    populateCategoryDropdown();
    document.getElementById('tx-date').value = new Date().toISOString().slice(0, 10);
    openModal('modal-add-tx');
  },
  openAddGoalModal: () => {
    const user = getCurrentUser();
    if (!user) {
      showToast('Please sign in to manage savings goals.', 'info');
      navigateTo('auth');
      return;
    }
    openModal('modal-add-goal');
  },
  openGoalMovementModal: (goalId, type) => {
    document.getElementById('movement-goal-id').value = goalId;
    document.getElementById('movement-type').value = type;
    document.getElementById('movement-modal-title').textContent = type === 'deposit' ? 'Deposit into Goal' : 'Withdraw from Goal';
    openModal('modal-goal-movement');
  },
  deleteTransaction: async (id) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    try {
      if (window.navigator.onLine) {
        await api.transactions.delete(id);
      } else {
        await queueOfflineAction('transaction', 'delete', id, {});
        await deleteLocalTransaction(id);
      }
      showToast('Transaction deleted.', 'info');
      loadTransactions();
      loadDashboard();
    } catch (err) {
      showToast('Failed to delete transaction.', 'error');
    }
  },
  deleteGoal: async (id) => {
    if (!confirm('Are you sure you want to delete this savings goal?')) return;
    try {
      if (window.navigator.onLine) {
        await api.goals.delete(id);
      } else {
        await queueOfflineAction('goal', 'delete', id, {});
        await deleteLocalGoal(id);
      }
      showToast('Savings goal deleted.', 'info');
      loadGoals();
    } catch (err) {
      showToast('Failed to delete goal.', 'error');
    }
  },
  triggerManualSync: async () => {
    showToast('Synchronizing with server...', 'info');
    const res = await synchronize();
    if (res.success) {
      showToast('Synchronization complete!', 'success');
      loadDashboard();
    } else {
      showToast('Sync failed. Changes remain securely stored offline.', 'error');
    }
  },
  askAdvisor
};

/**
 * Populates category dropdown dynamically
 */
async function populateCategoryDropdown() {
  const select = document.getElementById('tx-category-select');
  if (!select) return;

  if (cachedCategories.length === 0) {
    try {
      if (window.navigator.onLine) {
        const res = await api.categories.list();
        cachedCategories = res.categories || [];
      } else {
        cachedCategories = await getAllLocalCategories();
      }
    } catch (_) {}
  }

  select.innerHTML = cachedCategories.map(c => `
    <option value="${c.name}" data-type="${c.type}">${c.name} (${c.type})</option>
  `).join('');
}

/**
 * Initializes Event Listeners for Forms and Modals
 */
function setupEventHandlers() {
  // Navigation clicks
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(el.dataset.view);
    });
  });

  // Auth tab switchers
  const tabLogin = document.getElementById('tab-login');
  if (tabLogin) {
    tabLogin.addEventListener('click', (e) => {
      e.preventDefault();
      showAuthTab('login');
    });
  }
  const tabRegister = document.getElementById('tab-register');
  if (tabRegister) {
    tabRegister.addEventListener('click', (e) => {
      e.preventDefault();
      showAuthTab('register');
    });
  }

  // Quick Demo Login buttons
  document.querySelectorAll('.btn-demo-login').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      loginDemoUser();
    });
  });

  // Topbar + Add Transaction button
  const topbarAddBtn = document.getElementById('topbar-btn-add-tx');
  if (topbarAddBtn) {
    topbarAddBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.SmartPocket.openAddTransactionModal();
    });
  }

  // Modal Closers
  document.querySelectorAll('.modal-close, [data-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    });
  });

  // Register Form
  const regForm = document.getElementById('form-register');
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('reg-email').value;
      const password = document.getElementById('reg-password').value;
      const fullName = document.getElementById('reg-name').value;

      try {
        const res = await api.auth.register({ email, password, fullName });
        setCurrentUser(res.user);
        updateUserBadges(res.user);
        showToast('Welcome to SmartPocket!', 'success');
        navigateTo('dashboard');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Login Form
  const loginForm = document.getElementById('form-login');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;

      try {
        const res = await api.auth.login({ email, password });
        if (res.requires2fa) {
          pending2faTempToken = res.tempToken;
          document.getElementById('login-credentials-section').style.display = 'none';
          document.getElementById('login-2fa-section').style.display = 'block';
          showToast('Enter your 6-digit authenticator code.', 'info');
          return;
        }

        setCurrentUser(res.user);
        updateUserBadges(res.user);
        showToast('Signed in successfully.', 'success');
        navigateTo('dashboard');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 2FA Login Completion
  const btnVerifyLogin = document.getElementById('btn-verify-2fa-login');
  if (btnVerifyLogin) {
    btnVerifyLogin.addEventListener('click', async () => {
      const token = document.getElementById('login-2fa-code').value;
      if (!token) return showToast('Please enter your 6-digit code.', 'error');

      try {
        const res = await api.auth.verify2fa({ tempToken: pending2faTempToken, token });
        setCurrentUser(res.user);
        updateUserBadges(res.user);
        showToast('Authenticated with 2FA!', 'success');
        navigateTo('dashboard');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Logout Buttons
  document.querySelectorAll('.btn-logout').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await logoutUser();
      showToast('Signed out.', 'info');
      updateUserBadges(null);
      navigateTo('welcome');
    });
  });

  // Add Transaction Form
  const addTxForm = document.getElementById('form-add-tx');
  if (addTxForm) {
    addTxForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = document.getElementById('tx-amount').value;
      const type = document.getElementById('tx-type').value;
      const categorySelect = document.getElementById('tx-category-select');
      const category_name = categorySelect.value;
      const classification = document.getElementById('tx-classification').value;
      const description = document.getElementById('tx-desc').value;
      const date = document.getElementById('tx-date').value;

      const txPayload = {
        amount,
        type,
        category_name,
        classification,
        description,
        date
      };

      try {
        if (window.navigator.onLine) {
          await api.transactions.create(txPayload);
        } else {
          const localId = `tx_${Date.now()}`;
          const localTx = {
            id: localId,
            ...txPayload,
            amount_paise: rupeesToPaise(amount),
            version: 1,
            created_at: new Date().toISOString()
          };
          await saveLocalTransaction(localTx);
          await queueOfflineAction('transaction', 'create', localId, txPayload);
        }

        closeModal('modal-add-tx');
        addTxForm.reset();
        showToast('Transaction saved successfully!', 'success');
        loadDashboard();
        if (activeView === 'transactions') loadTransactions();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Add Goal Form
  const addGoalForm = document.getElementById('form-add-goal');
  if (addGoalForm) {
    addGoalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('goal-title').value;
      const target_amount = document.getElementById('goal-target-amount').value;
      const target_date = document.getElementById('goal-target-date').value;
      const description = document.getElementById('goal-desc').value;

      const payload = { title, target_amount, target_date, description };

      try {
        if (window.navigator.onLine) {
          await api.goals.create(payload);
        } else {
          const goalId = `goal_${Date.now()}`;
          const localGoal = {
            id: goalId,
            title,
            target_amount_paise: rupeesToPaise(target_amount),
            current_saved_paise: 0,
            target_date,
            description,
            status: 'active',
            version: 1
          };
          await saveLocalGoal(localGoal);
          await queueOfflineAction('goal', 'create', goalId, payload);
        }

        closeModal('modal-add-goal');
        addGoalForm.reset();
        showToast('Goal created successfully!', 'success');
        loadGoals();
        loadDashboard();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Goal Movement Form
  const movementForm = document.getElementById('form-goal-movement');
  if (movementForm) {
    movementForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const goalId = document.getElementById('movement-goal-id').value;
      const type = document.getElementById('movement-type').value;
      const amount = document.getElementById('movement-amount').value;
      const note = document.getElementById('movement-note').value;

      try {
        await api.goals.movement(goalId, { amount, type, note });
        closeModal('modal-goal-movement');
        movementForm.reset();
        showToast(type === 'deposit' ? 'Goal deposit recorded!' : 'Withdrawal recorded!', 'success');
        loadGoals();
        loadDashboard();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Save Budget Form
  const budgetForm = document.getElementById('form-set-budget');
  if (budgetForm) {
    budgetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const total_budget = document.getElementById('budget-total-input').value;
      const needs_target_pct = document.getElementById('budget-needs-pct-input').value || 50;
      const wants_target_pct = document.getElementById('budget-wants-pct-input').value || 30;
      const savings_target_pct = document.getElementById('budget-savings-pct-input').value || 20;

      try {
        await api.budgets.save(currentPeriod, {
          total_budget,
          needs_target_pct,
          wants_target_pct,
          savings_target_pct
        });
        showToast('Monthly budget updated!', 'success');
        loadBudgets();
        loadDashboard();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 2FA Setup Flow in Security Tab
  const btnToggle2fa = document.getElementById('btn-toggle-2fa');
  if (btnToggle2fa) {
    btnToggle2fa.addEventListener('click', async () => {
      const user = getCurrentUser();
      if (user.totpEnabled) {
        const password = prompt('Enter your current account password to disable 2FA:');
        if (!password) return;
        try {
          await api.auth.disable2fa({ password });
          user.totpEnabled = false;
          showToast('2FA has been disabled.', 'info');
          loadSecurity();
        } catch (err) {
          showToast(err.message, 'error');
        }
      } else {
        try {
          const setup = await api.auth.setup2fa();
          document.getElementById('2fa-qr-image').src = setup.qrCodeDataUrl;
          document.getElementById('2fa-manual-secret').textContent = setup.secret;
          document.getElementById('2fa-enrollment-secret').value = setup.secret;
          openModal('modal-enroll-2fa');
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });
  }

  // Confirm 2FA Enrollment Form
  const formConfirm2fa = document.getElementById('form-confirm-2fa');
  if (formConfirm2fa) {
    formConfirm2fa.addEventListener('submit', async (e) => {
      e.preventDefault();
      const secret = document.getElementById('2fa-enrollment-secret').value;
      const token = document.getElementById('2fa-verify-code').value;

      try {
        const res = await api.auth.verify2fa({ secret, token });
        closeModal('modal-enroll-2fa');
        const user = getCurrentUser();
        if (user) user.totpEnabled = true;

        // Display recovery codes
        const codeList = document.getElementById('recovery-codes-list');
        if (codeList && res.recoveryCodes) {
          codeList.innerHTML = res.recoveryCodes.map(c => `<li><code>${c}</code></li>`).join('');
          openModal('modal-recovery-codes');
        }

        showToast('Two-factor authentication successfully enabled!', 'success');
        loadSecurity();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Filter triggers
  ['tx-search', 'tx-filter-type', 'tx-filter-class'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => loadTransactions());
  });

  // Advisor Send
  const btnSendAdvisor = document.getElementById('btn-advisor-send');
  if (btnSendAdvisor) {
    btnSendAdvisor.addEventListener('click', () => askAdvisor());
  }
  const advisorInput = document.getElementById('advisor-input');
  if (advisorInput) {
    advisorInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') askAdvisor();
    });
  }
}

/**
 * Updates UI with authenticated user identity
 */
function updateUserBadges(user) {
  const profileSection = document.getElementById('user-profile-badge');
  if (!profileSection) return;

  if (user) {
    profileSection.style.display = 'flex';
    document.getElementById('user-name-label').textContent = user.fullName;
    document.getElementById('user-email-label').textContent = user.email;
    document.getElementById('user-avatar-initial').textContent = user.fullName.charAt(0).toUpperCase();
  } else {
    profileSection.style.display = 'none';
  }
}

/**
 * Sync status listener
 */
subscribeSyncState((state) => {
  const pill = document.getElementById('sync-status-pill');
  const label = document.getElementById('sync-status-label');
  if (!pill || !label) return;

  pill.className = `sync-pill ${state.status}`;

  if (state.status === 'offline') {
    label.textContent = state.pendingCount > 0 ? `Offline (${state.pendingCount} queued)` : 'Offline';
  } else if (state.status === 'syncing') {
    label.textContent = 'Syncing...';
  } else if (state.status === 'error') {
    label.textContent = 'Sync Error';
  } else {
    label.textContent = 'Online • Synced';
  }
});

/**
 * Bootstrap Application
 */
async function initApp() {
  setupEventHandlers();

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/service-worker.js');
    } catch (_) {}
  }

  // Check auth
  const user = await checkAuth();
  if (user) {
    updateUserBadges(user);
    navigateTo('dashboard');
    synchronize();
  } else {
    navigateTo('welcome');
  }
}

window.addEventListener('DOMContentLoaded', initApp);

