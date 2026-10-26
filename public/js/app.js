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
  getLocalGoal,
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
let cachedGoals = [];
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
    let budgetRes = null;

    if (window.navigator.onLine) {
      const [txRes, bRes, goalsRes] = await Promise.all([
        api.transactions.list(`period=${currentPeriod}`),
        api.budgets.get(currentPeriod),
        api.goals.list()
      ]);
      txs = txRes.transactions || [];
      budgetRes = bRes;
      budget = budgetRes?.budget || null;
      goals = goalsRes.goals || [];
      cachedGoals = goals;
      for (const g of goals) {
        saveLocalGoal(g).catch(() => {});
      }
    } else {
      const allLocal = await getAllLocalTransactions();
      txs = allLocal.filter(t => t.date.startsWith(currentPeriod));
      budget = await getLocalBudget(currentPeriod);
      goals = await getAllLocalGoals();
      cachedGoals = goals;
    }

    // Synchronize global period selector if present
    const globalPeriodSelect = document.getElementById('global-period-select');
    if (globalPeriodSelect && globalPeriodSelect.value !== currentPeriod) {
      globalPeriodSelect.value = currentPeriod;
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

    // Financial calculation model:
    // Available Pocket Cash = Total Available Funds − Actual Expenses − Net Savings Transfers
    const totalAvailableFundsPaise = (budgetRes && typeof budgetRes.totalAvailableFundsPaise === 'number')
      ? budgetRes.totalAvailableFundsPaise
      : totalIncome;

    const actualExpensesPaise = (budgetRes && typeof budgetRes.periodStats?.expense_paise === 'number')
      ? budgetRes.periodStats.expense_paise
      : totalExpense;

    const totalSavedInGoalsPaise = goals.reduce((acc, g) => acc + (g.current_saved_paise || 0), 0);
    const netSavingsPaise = (budgetRes && typeof budgetRes.netSavingsTransfersPaise === 'number')
      ? budgetRes.netSavingsTransfersPaise
      : (savingsTransfers !== 0 ? savingsTransfers : totalSavedInGoalsPaise);

    let availableBalancePaise;
    if (budgetRes && typeof budgetRes.availableBalancePaise === 'number') {
      availableBalancePaise = budgetRes.availableBalancePaise;
    } else {
      availableBalancePaise = calculateAvailableBalance({
        totalIncomePaise: totalAvailableFundsPaise,
        totalExpensePaise: actualExpensesPaise,
        netSavingsTransfersPaise: netSavingsPaise
      });
    }

    const monthlyBudgetPaise = budget ? budget.total_budget_paise : 0;
    const remainingBudgetPaise = monthlyBudgetPaise > 0 ? (monthlyBudgetPaise - actualExpensesPaise) : 0;

    // Use date context corresponding to currentPeriod
    const today = new Date();
    const todayPeriod = getCurrentPeriod(today);
    let dateForPeriod = today;
    if (currentPeriod !== todayPeriod) {
      const [y, m] = currentPeriod.split('-').map(Number);
      dateForPeriod = new Date(y, m - 1, 1);
    }

    const safeDaily = calculateSafeDailySpending({
      availableBalancePaise,
      monthlyBudgetPaise,
      currentMonthExpensePaise: actualExpensesPaise,
      currentDate: dateForPeriod,
      totalTransactionCount: txs.length
    });

    // Populate UI elements
    document.getElementById('dash-available-balance').textContent = formatINR(availableBalancePaise);
    const formulaEl = document.getElementById('dash-available-formula');
    if (formulaEl) {
      formulaEl.textContent = `${formatINR(totalAvailableFundsPaise, false)} − ${formatINR(actualExpensesPaise, false)} − ${formatINR(netSavingsPaise, false)}`;
    }
    document.getElementById('dash-safe-daily').textContent = formatINR(safeDaily.safeDailyPaise);
    document.getElementById('dash-safe-daily-desc').textContent = safeDaily.message;
    document.getElementById('dash-safe-status-badge').innerHTML = getStatusBadgeHtml(safeDaily.status);

    document.getElementById('dash-income').textContent = formatINR(totalAvailableFundsPaise);
    document.getElementById('dash-expense').textContent = formatINR(actualExpensesPaise);
    const dashSavingsEl = document.getElementById('dash-savings-total');
    if (dashSavingsEl) {
      dashSavingsEl.textContent = formatINR(totalSavedInGoalsPaise);
    }

    // Populate Monthly Budget Card on Dashboard
    const dashBudgetTotalEl = document.getElementById('dash-budget-total');
    const dashBudgetSpentEl = document.getElementById('dash-budget-spent');
    const dashBudgetRemainingEl = document.getElementById('dash-budget-remaining');
    const dashBudgetProgressEl = document.getElementById('dash-budget-progress-bar');
    const dashBudgetStatusEl = document.getElementById('dash-budget-status');
    const dashBudgetSubtextEl = document.getElementById('dash-budget-subtext');

    if (monthlyBudgetPaise > 0) {
      if (dashBudgetTotalEl) dashBudgetTotalEl.textContent = formatINR(monthlyBudgetPaise);
      if (dashBudgetSpentEl) dashBudgetSpentEl.textContent = formatINR(actualExpensesPaise);

      const pctSpent = Math.min(100, Math.max(0, Math.round((actualExpensesPaise / monthlyBudgetPaise) * 100)));
      if (dashBudgetProgressEl) {
        dashBudgetProgressEl.style.width = `${pctSpent}%`;
        if (actualExpensesPaise > monthlyBudgetPaise) {
          dashBudgetProgressEl.style.backgroundColor = 'var(--color-danger, #ef4444)';
        } else if (pctSpent >= 85) {
          dashBudgetProgressEl.style.backgroundColor = 'var(--color-warning, #f59e0b)';
        } else {
          dashBudgetProgressEl.style.backgroundColor = 'var(--color-primary, #6366f1)';
        }
      }

      if (dashBudgetRemainingEl) {
        if (remainingBudgetPaise < 0) {
          dashBudgetRemainingEl.textContent = `-${formatINR(Math.abs(remainingBudgetPaise))}`;
          dashBudgetRemainingEl.style.color = 'var(--color-danger, #ef4444)';
        } else {
          dashBudgetRemainingEl.textContent = formatINR(remainingBudgetPaise);
          dashBudgetRemainingEl.style.color = 'var(--color-text-main)';
        }
      }

      if (dashBudgetStatusEl) {
        dashBudgetStatusEl.style.display = 'inline-block';
        if (actualExpensesPaise > monthlyBudgetPaise) {
          dashBudgetStatusEl.className = 'status-badge budget_exceeded';
          dashBudgetStatusEl.textContent = 'Exceeded';
          dashBudgetStatusEl.style.backgroundColor = '#fee2e2';
          dashBudgetStatusEl.style.color = '#b91c1c';
        } else if (pctSpent >= 85) {
          dashBudgetStatusEl.className = 'status-badge near_limit';
          dashBudgetStatusEl.textContent = 'Near Limit';
          dashBudgetStatusEl.style.backgroundColor = '#fef3c7';
          dashBudgetStatusEl.style.color = '#b45309';
        } else {
          dashBudgetStatusEl.className = 'status-badge healthy';
          dashBudgetStatusEl.textContent = 'Healthy';
          dashBudgetStatusEl.style.backgroundColor = 'var(--color-mint, #d1fae5)';
          dashBudgetStatusEl.style.color = 'var(--color-primary, #047857)';
        }
      }

      if (dashBudgetSubtextEl) {
        if (remainingBudgetPaise < 0) {
          dashBudgetSubtextEl.textContent = `Over budget by ${formatINR(Math.abs(remainingBudgetPaise))}`;
          dashBudgetSubtextEl.style.color = 'var(--color-danger, #ef4444)';
        } else {
          dashBudgetSubtextEl.textContent = `${pctSpent}% of budget used (${formatINR(remainingBudgetPaise)} left)`;
          dashBudgetSubtextEl.style.color = 'var(--color-text-muted)';
        }
      }
    } else {
      if (dashBudgetTotalEl) dashBudgetTotalEl.textContent = 'No Budget Set';
      if (dashBudgetSpentEl) dashBudgetSpentEl.textContent = formatINR(actualExpensesPaise);
      if (dashBudgetRemainingEl) {
        dashBudgetRemainingEl.textContent = '—';
        dashBudgetRemainingEl.style.color = 'var(--color-text-muted)';
      }
      if (dashBudgetProgressEl) {
        dashBudgetProgressEl.style.width = '0%';
        dashBudgetProgressEl.style.backgroundColor = 'var(--color-primary, #6366f1)';
      }
      if (dashBudgetStatusEl) dashBudgetStatusEl.style.display = 'none';
      if (dashBudgetSubtextEl) {
        dashBudgetSubtextEl.textContent = 'Target spending cap';
        dashBudgetSubtextEl.style.color = 'var(--color-text-muted)';
      }
    }

    // 50/30/20 Guideline metrics
    const metrics503020 = calculate503020Metrics({
      incomePaise: totalAvailableFundsPaise,
      needsPaise: needsExpense,
      wantsPaise: wantsExpense,
      savingsPaise: netSavingsPaise
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
        recentList.innerHTML = txs.slice(0, 5).map(t => {
          let badgeHtml = '';
          let amountHtml = '';
          if (t.type === 'transfer_savings') {
            if (t.amount_paise >= 0) {
              badgeHtml = '<span class="badge-tag" style="background-color:var(--color-mint); color:var(--color-primary); font-weight:600;">⇄ Savings Deposit</span>';
              amountHtml = `<td style="text-align:right; color:var(--color-primary); font-weight:600;">⇄ ${formatINR(t.amount_paise)}</td>`;
            } else {
              badgeHtml = '<span class="badge-tag" style="background-color:var(--color-mint); color:var(--color-savings); font-weight:600;">← Savings Withdrawal</span>';
              amountHtml = `<td style="text-align:right; color:var(--color-savings); font-weight:600;">+ ${formatINR(Math.abs(t.amount_paise))}</td>`;
            }
          } else if (t.type === 'income') {
            badgeHtml = `<span class="badge-tag badge-${t.classification}">${t.classification}</span>`;
            amountHtml = `<td class="amount-income" style="text-align:right;">+ ${formatINR(t.amount_paise)}</td>`;
          } else {
            badgeHtml = `<span class="badge-tag badge-${t.classification}">${t.classification}</span>`;
            amountHtml = `<td class="amount-expense" style="text-align:right;">- ${formatINR(t.amount_paise)}</td>`;
          }
          return `
            <tr>
              <td>${t.date}</td>
              <td><strong>${escapeHtml(t.category_name)}</strong><br><small style="color:var(--color-text-muted)">${escapeHtml(t.description || '')}</small></td>
              <td>${badgeHtml}</td>
              ${amountHtml}
            </tr>
          `;
        }).join('');
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

    // Render Active Goals on Dashboard
    renderDashboardGoals(goals);

    // Load Real Groq AI Predictions & Insights
    loadAiPredictions();

  } catch (err) {
    console.error('Failed to load dashboard:', err);
    showToast('Failed to load dashboard data.', 'error');
  }
}

/**
 * Loads real AI financial predictions and recommendations from Groq
 */
async function loadAiPredictions() {
  const predEl = document.getElementById('dash-ai-prediction');
  const alertEl = document.getElementById('dash-ai-alert');
  const tipEl = document.getElementById('dash-ai-tip');
  const badgeEl = document.getElementById('ai-provider-badge');

  if (!predEl) return;

  try {
    const res = await api.advisor.predictions();
    if (res) {
      if (predEl && res.prediction) predEl.textContent = res.prediction;
      if (alertEl && res.alert) alertEl.textContent = res.alert;
      if (tipEl && res.tip) tipEl.textContent = res.tip;
      if (badgeEl) {
        badgeEl.textContent = res.mode === 'cloud' ? `Live ${res.provider?.toUpperCase()} AI` : 'Offline AI Engine';
      }
    }
  } catch (err) {
    console.warn('AI predictions load error:', err);
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

    tbody.innerHTML = txs.map(t => {
      let badgeHtml = '';
      let amountHtml = '';
      if (t.type === 'transfer_savings') {
        if (t.amount_paise >= 0) {
          badgeHtml = '<span class="badge-tag" style="background-color:var(--color-mint); color:var(--color-primary); font-weight:600;">⇄ Savings Deposit</span>';
          amountHtml = `<td style="color:var(--color-primary); font-weight:600;">⇄ ${formatINR(t.amount_paise)}</td>`;
        } else {
          badgeHtml = '<span class="badge-tag" style="background-color:var(--color-mint); color:var(--color-savings); font-weight:600;">← Savings Withdrawal</span>';
          amountHtml = `<td style="color:var(--color-savings); font-weight:600;">+ ${formatINR(Math.abs(t.amount_paise))}</td>`;
        }
      } else if (t.type === 'income') {
        badgeHtml = `<span class="badge-tag badge-${t.classification}">${t.classification}</span>`;
        amountHtml = `<td class="amount-income">+ ${formatINR(t.amount_paise)}</td>`;
      } else {
        badgeHtml = `<span class="badge-tag badge-${t.classification}">${t.classification}</span>`;
        amountHtml = `<td class="amount-expense">- ${formatINR(t.amount_paise)}</td>`;
      }

      return `
        <tr>
          <td>${t.date}</td>
          <td>
            <strong>${escapeHtml(t.category_name)}</strong>
            ${t.description ? `<div style="font-size:0.78rem; color:var(--color-text-muted);">${escapeHtml(t.description)}</div>` : ''}
          </td>
          <td>${badgeHtml}</td>
          ${amountHtml}
          <td style="text-align:right;">
            <button class="btn btn-secondary btn-sm" onclick="window.SmartPocket.deleteTransaction('${t.id}')">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
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

    const budget = budgetData?.budget || null;
    const periodInput = document.getElementById('budget-period-input');
    if (periodInput) {
      periodInput.value = currentPeriod;
    }

    const totalInput = document.getElementById('budget-total-input');
    if (totalInput) {
      totalInput.value = budget ? paiseToRupees(budget.total_budget_paise) : '';
    }

    const needsInput = document.getElementById('budget-needs-pct-input');
    const wantsInput = document.getElementById('budget-wants-pct-input');
    const savingsInput = document.getElementById('budget-savings-pct-input');
    if (needsInput) needsInput.value = budget ? budget.needs_target_pct : 50;
    if (wantsInput) wantsInput.value = budget ? budget.wants_target_pct : 30;
    if (savingsInput) savingsInput.value = budget ? budget.savings_target_pct : 20;

    const safeDaily = budgetData?.safeDaily;
    if (safeDaily) {
      const safeDailyEl = document.getElementById('budget-safe-daily');
      const safeMsgEl = document.getElementById('budget-safe-msg');
      if (safeDailyEl) safeDailyEl.textContent = formatINR(safeDaily.safeDailyPaise);
      if (safeMsgEl) safeMsgEl.textContent = safeDaily.message;
    }
  } catch (err) {
    console.error('Failed to load budget:', err);
  }
}

/**
 * Renders Active Goals Overview on Dashboard
 */
function renderDashboardGoals(goals) {
  const dashGoalsEl = document.getElementById('dash-goals-container');
  if (!dashGoalsEl) return;

  const activeGoals = (goals || []).filter(g => g.status !== 'completed');
  if (activeGoals.length === 0) {
    dashGoalsEl.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 24px; color: var(--color-text-muted); background: var(--color-surface-subtle); border-radius: var(--radius-md);">
        <p style="margin-bottom: 8px;">No active savings goals yet. Save pocket money for textbooks, laptops, or college events!</p>
        <button class="btn btn-primary btn-sm" onclick="window.SmartPocket.openAddGoalModal()">+ Create a Savings Goal</button>
      </div>
    `;
    return;
  }

  dashGoalsEl.innerHTML = activeGoals.map(g => {
    const analysis = g.analysis || calculateGoalProgress(g, new Date());
    const pct = analysis.progressPct;
    const remaining = analysis.remainingPaise;
    return `
      <div style="background: var(--color-surface-subtle); border-radius: var(--radius-md); padding: 16px; border: 1px solid var(--color-border);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
          <strong style="color:var(--color-primary); font-size:1rem;">${escapeHtml(g.title)}</strong>
          <span class="status-badge healthy" style="font-size:0.75rem;">${pct}%</span>
        </div>
        <div style="font-size:0.82rem; color:var(--color-text-muted); margin-bottom: 6px;">
          Target: ${formatINR(g.target_amount_paise)} ${g.target_date ? `• By ${g.target_date}` : ''}
        </div>

        <!-- Progress Bar -->
        <div style="background-color: var(--color-mint); border-radius: var(--radius-full); height: 8px; overflow: hidden; margin-bottom: 6px;">
          <div style="background-color: var(--color-savings); height: 100%; width: ${pct}%; transition: width 0.4s ease;"></div>
        </div>

        <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom: 8px;">
          <span>Saved: <strong style="color:var(--color-primary);">${formatINR(g.current_saved_paise)}</strong></span>
          <span style="color:var(--color-text-muted);">Remaining: <strong>${formatINR(remaining)}</strong></span>
        </div>

        <!-- Milestones -->
        <div style="display:flex; gap:4px; font-size:0.7rem; margin-bottom: 10px;">
          <span style="padding:2px 6px; border-radius:4px; background:${pct >= 25 ? 'var(--color-mint)' : '#eee'}; color:${pct >= 25 ? 'var(--color-savings)' : '#888'}; font-weight:600;">25%</span>
          <span style="padding:2px 6px; border-radius:4px; background:${pct >= 50 ? 'var(--color-mint)' : '#eee'}; color:${pct >= 50 ? 'var(--color-savings)' : '#888'}; font-weight:600;">50%</span>
          <span style="padding:2px 6px; border-radius:4px; background:${pct >= 75 ? 'var(--color-mint)' : '#eee'}; color:${pct >= 75 ? 'var(--color-savings)' : '#888'}; font-weight:600;">75%</span>
          <span style="padding:2px 6px; border-radius:4px; background:${pct >= 100 ? 'var(--color-mint)' : '#eee'}; color:${pct >= 100 ? 'var(--color-savings)' : '#888'}; font-weight:600;">100%</span>
        </div>

        ${analysis.suggestedWeeklyPaise ? `<p style="font-size:0.78rem; color:var(--color-primary); margin-bottom: 10px;">💡 Suggested pace: Save <strong>${formatINR(analysis.suggestedWeeklyPaise)}/week</strong></p>` : ''}

        <div style="display:flex; gap: 8px;">
          <button class="btn btn-primary btn-sm" style="flex:1;" onclick="window.SmartPocket.openGoalMovementModal('${g.id}', 'deposit')">+ Deposit</button>
          <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="window.SmartPocket.openGoalMovementModal('${g.id}', 'withdrawal')">- Withdraw</button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Renders Goals List in Savings Goals View
 */
function renderGoalsList(goals) {
  const container = document.getElementById('goals-container');
  if (!container) return;

  if (!goals || goals.length === 0) {
    container.innerHTML = '<div class="card" style="text-align:center; padding: 48px;"><p>No savings goals set yet. Save for semester books, a college trip, or tech gear!</p><button class="btn btn-primary" style="margin-top: 16px;" onclick="window.SmartPocket.openAddGoalModal()">+ Create Your First Goal</button></div>';
    return;
  }

  container.innerHTML = goals.map(g => {
    const analysis = g.analysis || calculateGoalProgress(g, new Date());
    const pct = analysis.progressPct;
    const remaining = analysis.remainingPaise;
    const isDone = g.status === 'completed' || pct >= 100;

    return `
      <div class="card" style="margin-bottom: 16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 12px;">
          <div>
            <h3 style="font-size:1.15rem; color:var(--color-primary);">${escapeHtml(g.title)}</h3>
            <p style="font-size:0.82rem; margin-top:2px;">Target: ${formatINR(g.target_amount_paise)} ${g.target_date ? `• By ${g.target_date}` : ''}</p>
          </div>
          <span class="status-badge ${isDone ? 'healthy' : 'near_limit'}">${isDone ? 'Completed' : 'Active'}</span>
        </div>

        <!-- Progress Bar -->
        <div style="background-color: var(--color-mint); border-radius: var(--radius-full); height: 10px; overflow: hidden; margin-bottom: 8px;">
          <div style="background-color: var(--color-savings); height: 100%; width: ${pct}%; transition: width 0.4s ease;"></div>
        </div>

        <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--color-text-muted); margin-bottom: 8px;">
          <span>Saved: <strong style="color:var(--color-primary);">${formatINR(g.current_saved_paise)}</strong> (${pct}%)</span>
          <span>Remaining: <strong>${formatINR(remaining)}</strong></span>
        </div>

        <!-- Milestones -->
        <div style="display:flex; gap:6px; font-size:0.75rem; margin-bottom: 14px;">
          <span style="padding:2px 8px; border-radius:4px; background:${pct >= 25 ? 'var(--color-mint)' : '#f3f4f6'}; color:${pct >= 25 ? 'var(--color-savings)' : '#9ca3af'}; font-weight:600;">25%</span>
          <span style="padding:2px 8px; border-radius:4px; background:${pct >= 50 ? 'var(--color-mint)' : '#f3f4f6'}; color:${pct >= 50 ? 'var(--color-savings)' : '#9ca3af'}; font-weight:600;">50%</span>
          <span style="padding:2px 8px; border-radius:4px; background:${pct >= 75 ? 'var(--color-mint)' : '#f3f4f6'}; color:${pct >= 75 ? 'var(--color-savings)' : '#9ca3af'}; font-weight:600;">75%</span>
          <span style="padding:2px 8px; border-radius:4px; background:${pct >= 100 ? 'var(--color-mint)' : '#f3f4f6'}; color:${pct >= 100 ? 'var(--color-savings)' : '#9ca3af'}; font-weight:600;">100% Reached</span>
        </div>

        ${analysis.suggestedWeeklyPaise && !isDone ? `<p style="font-size:0.82rem; color:var(--color-primary); margin-bottom: 16px;">💡 Suggested pace: Save <strong>${formatINR(analysis.suggestedWeeklyPaise)}/week</strong> to reach target on time.</p>` : ''}

        <div style="display:flex; gap: 8px;">
          <button class="btn btn-primary btn-sm" onclick="window.SmartPocket.openGoalMovementModal('${g.id}', 'deposit')">+ Deposit</button>
          <button class="btn btn-secondary btn-sm" onclick="window.SmartPocket.openGoalMovementModal('${g.id}', 'withdrawal')">- Withdraw</button>
          <button class="btn btn-secondary btn-sm" style="margin-left:auto;" onclick="window.SmartPocket.deleteGoal('${g.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
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
      cachedGoals = goals;
      for (const g of goals) {
        saveLocalGoal(g).catch(() => {});
      }
    } else {
      goals = await getAllLocalGoals();
      cachedGoals = goals;
    }

    renderGoalsList(goals);
    renderDashboardGoals(goals);

    // Render Savings Activity History
    const activityContainer = document.getElementById('goals-activity-table-body');
    if (activityContainer) {
      try {
        let movements = [];
        if (window.navigator.onLine) {
          const mvtRes = await api.goals.allMovements();
          movements = mvtRes.movements || [];
        } else {
          const allTxs = await getAllLocalTransactions();
          movements = allTxs
            .filter(t => t.type === 'transfer_savings')
            .map(t => ({
              id: t.id,
              goal_title: t.description?.replace(/^(Deposit to |Withdrawal from )/, '') || 'Goal',
              amount_paise: t.amount_paise,
              note: t.description || '',
              created_at: t.date
            }));
        }

        if (movements.length === 0) {
          activityContainer.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 24px; color: var(--color-text-muted);">No savings deposits or withdrawals yet.</td></tr>';
        } else {
          activityContainer.innerHTML = movements.map(m => `
            <tr>
              <td>${m.created_at ? m.created_at.slice(0, 10) : '-'}</td>
              <td><strong>${escapeHtml(m.goal_title || 'Goal')}</strong></td>
              <td>
                <span class="badge-tag" style="background-color:var(--color-mint); color:${m.amount_paise >= 0 ? 'var(--color-primary)' : 'var(--color-savings)'}; font-weight:600;">
                  ${m.amount_paise >= 0 ? '+ Deposit' : '- Withdrawal'}
                </span>
              </td>
              <td style="font-weight:600; color:${m.amount_paise >= 0 ? 'var(--color-primary)' : 'var(--color-savings)'};">
                ${m.amount_paise >= 0 ? '+' : '-'}${formatINR(Math.abs(m.amount_paise))}
              </td>
              <td style="color:var(--color-text-muted); font-size:0.85rem;">${escapeHtml(m.note || '-')}</td>
            </tr>
          `).join('');
        }
      } catch (err) {
        console.warn('Failed to load goal movements:', err);
      }
    }
  } catch (err) {
    console.error('Failed to load goals:', err);
  }
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
  assistantBubble.textContent = 'Consulting Groq AI with your real financial ledger...';
  messagesContainer.appendChild(assistantBubble);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  try {
    const res = await api.advisor.query({ query, preferCloud: true });

    assistantBubble.innerHTML = `
      <div>${escapeHtml(res.answer)}</div>
      <div style="margin-top: 6px; font-size: 0.72rem; color: var(--color-text-muted);">
        Mode: ${res.mode === 'cloud' ? `☁️ Real Groq AI (${res.provider?.toUpperCase() || 'GROQ'})` : '🔒 Offline Engine'}
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
  openGoalMovementModal: async (goalId, type) => {
    let goal = cachedGoals.find(g => g.id === goalId);
    if (!goal) {
      goal = await getLocalGoal(goalId);
    }

    document.getElementById('movement-goal-id').value = goalId;
    document.getElementById('movement-type').value = type;

    const titleEl = document.getElementById('movement-modal-title');
    const subTitleEl = document.getElementById('movement-modal-subtitle');
    const amountInput = document.getElementById('movement-amount');
    const hintEl = document.getElementById('movement-limit-hint');
    const submitBtn = document.getElementById('btn-submit-movement');

    const goalTitle = goal ? goal.title : 'Goal';
    const targetRupees = goal ? paiseToRupees(goal.target_amount_paise) : 0;
    const savedRupees = goal ? paiseToRupees(goal.current_saved_paise) : 0;
    const remainingRupees = Math.max(0, targetRupees - savedRupees);

    if (type === 'deposit') {
      if (titleEl) titleEl.textContent = `Deposit into "${goalTitle}"`;
      if (subTitleEl) subTitleEl.textContent = `Target: ₹${targetRupees.toFixed(2)} • Saved: ₹${savedRupees.toFixed(2)} • Remaining: ₹${remainingRupees.toFixed(2)}`;
      if (submitBtn) submitBtn.textContent = 'Confirm Deposit';

      const availText = document.getElementById('dash-available-balance')?.textContent || '₹0.00';
      if (hintEl) hintEl.textContent = `Available Pocket Cash to spend/save: ${availText}`;
    } else {
      if (titleEl) titleEl.textContent = `Withdraw from "${goalTitle}"`;
      if (subTitleEl) subTitleEl.textContent = `Saved in this goal: ₹${savedRupees.toFixed(2)} (Available to withdraw: ₹${savedRupees.toFixed(2)})`;
      if (submitBtn) submitBtn.textContent = 'Confirm Withdrawal';
      if (hintEl) hintEl.textContent = `Max withdrawable amount: ₹${savedRupees.toFixed(2)}`;
    }

    if (amountInput) {
      amountInput.value = '';
    }

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
  askAdvisor,
  refreshAiPredictions: loadAiPredictions
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

  // Category & Type synchronization in Add Transaction Modal
  const txCategorySelect = document.getElementById('tx-category-select');
  const txTypeSelect = document.getElementById('tx-type');
  const txClassSelect = document.getElementById('tx-classification');

  if (txCategorySelect && txTypeSelect && txClassSelect) {
    txCategorySelect.addEventListener('change', () => {
      const selectedOption = txCategorySelect.selectedOptions[0];
      const catType = selectedOption?.dataset?.type;
      if (catType === 'savings' || txCategorySelect.value === 'Savings Goal Deposit') {
        txTypeSelect.value = 'transfer_savings';
        txClassSelect.value = 'savings';
      } else if (catType === 'income') {
        txTypeSelect.value = 'income';
        txClassSelect.value = 'income';
      } else if (catType === 'need') {
        txTypeSelect.value = 'expense';
        txClassSelect.value = 'need';
      } else if (catType === 'want') {
        txTypeSelect.value = 'expense';
        txClassSelect.value = 'want';
      }
    });

    txTypeSelect.addEventListener('change', () => {
      if (txTypeSelect.value === 'transfer_savings') {
        txClassSelect.value = 'savings';
        for (const opt of txCategorySelect.options) {
          if (opt.value === 'Savings Goal Deposit') {
            txCategorySelect.value = opt.value;
            break;
          }
        }
      } else if (txTypeSelect.value === 'income') {
        txClassSelect.value = 'income';
      } else if (txTypeSelect.value === 'expense' && txClassSelect.value === 'income') {
        txClassSelect.value = 'need';
      }
    });
  }

  // Goal Movement Form (Deposit & Withdrawal)
  const movementForm = document.getElementById('form-goal-movement');
  if (movementForm) {
    movementForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btn-submit-movement') || movementForm.querySelector('button[type="submit"]');
      const goalId = document.getElementById('movement-goal-id').value;
      const type = document.getElementById('movement-type').value;
      const amountVal = document.getElementById('movement-amount').value;
      const note = document.getElementById('movement-note').value;

      if (!amountVal || isNaN(Number(amountVal)) || Number(amountVal) <= 0) {
        showToast('Please enter a valid amount greater than zero.', 'error');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = type === 'deposit' ? 'Processing deposit...' : 'Processing withdrawal...';
      }

      const movementId = `mvt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const payload = { id: movementId, amount: amountVal, type, note };

      try {
        let updatedGoal = null;
        if (window.navigator.onLine) {
          const res = await api.goals.movement(goalId, payload);
          updatedGoal = res.goal;
          if (updatedGoal) {
            await saveLocalGoal(updatedGoal);
            const idx = cachedGoals.findIndex(g => g.id === goalId);
            if (idx >= 0) cachedGoals[idx] = updatedGoal;
            else cachedGoals.push(updatedGoal);
          }
        } else {
          // Offline handling: update local goal state and queue offline action
          const localGoal = await getLocalGoal(goalId);
          if (localGoal) {
            const amountPaise = rupeesToPaise(amountVal);
            const delta = type === 'withdrawal' ? -amountPaise : amountPaise;
            if (type === 'withdrawal' && amountPaise > localGoal.current_saved_paise) {
              throw new Error(`Cannot withdraw more than current saved amount (₹${(localGoal.current_saved_paise / 100).toFixed(2)}).`);
            }
            localGoal.current_saved_paise = Math.max(0, localGoal.current_saved_paise + delta);
            localGoal.status = localGoal.current_saved_paise >= localGoal.target_amount_paise ? 'completed' : 'active';
            localGoal.analysis = calculateGoalProgress(localGoal, new Date());
            await saveLocalGoal(localGoal);
            updatedGoal = localGoal;
            const idx = cachedGoals.findIndex(g => g.id === goalId);
            if (idx >= 0) cachedGoals[idx] = localGoal;
            else cachedGoals.push(localGoal);
          }
          await queueOfflineAction('goal_movement', 'create', movementId, { goal_id: goalId, ...payload });
        }

        closeModal('modal-goal-movement');
        movementForm.reset();
        const formattedAmount = `₹${Number(amountVal).toFixed(2)}`;
        showToast(
          type === 'deposit'
            ? `Successfully deposited ${formattedAmount} into savings goal!`
            : `Successfully withdrew ${formattedAmount} from savings goal!`,
          'success'
        );

        await Promise.all([
          loadGoals(),
          loadDashboard()
        ]);

        if (activeView === 'budgets') await loadBudgets();
        if (activeView === 'transactions') await loadTransactions();
      } catch (err) {
        showToast(err.message || 'Movement failed.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Confirm Movement';
        }
      }
    });
  }

  // Global Period Selector in Topbar
  const globalPeriodSelect = document.getElementById('global-period-select');
  if (globalPeriodSelect) {
    globalPeriodSelect.value = currentPeriod;
    globalPeriodSelect.addEventListener('change', async (e) => {
      const selected = e.target.value;
      if (selected && /^\d{4}-(0[1-9]|1[0-2])$/.test(selected)) {
        currentPeriod = selected;
        const budgetPeriodInput = document.getElementById('budget-period-input');
        if (budgetPeriodInput) budgetPeriodInput.value = selected;
        if (activeView === 'dashboard') await loadDashboard();
        else if (activeView === 'budgets') await loadBudgets();
        else if (activeView === 'transactions') await loadTransactions();
      }
    });
  }

  // Budget Period Picker in Budgets view
  const budgetPeriodInput = document.getElementById('budget-period-input');
  if (budgetPeriodInput) {
    budgetPeriodInput.value = currentPeriod;
    budgetPeriodInput.addEventListener('change', async (e) => {
      const selected = e.target.value;
      if (selected && /^\d{4}-(0[1-9]|1[0-2])$/.test(selected)) {
        currentPeriod = selected;
        if (globalPeriodSelect) globalPeriodSelect.value = selected;
        await loadBudgets();
      }
    });
  }

  // Save Budget Form
  const budgetForm = document.getElementById('form-set-budget');
  if (budgetForm) {
    budgetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const periodInput = document.getElementById('budget-period-input');
      const selectedPeriod = periodInput?.value || currentPeriod;
      const total_budget = document.getElementById('budget-total-input')?.value;
      const needs_target_pct = document.getElementById('budget-needs-pct-input')?.value || 50;
      const wants_target_pct = document.getElementById('budget-wants-pct-input')?.value || 30;
      const savings_target_pct = document.getElementById('budget-savings-pct-input')?.value || 20;

      if (!selectedPeriod || !/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedPeriod)) {
        showToast('Please select a valid month in YYYY-MM format.', 'error');
        return;
      }

      if (total_budget === undefined || total_budget === '' || isNaN(Number(total_budget)) || Number(total_budget) < 0) {
        showToast('Please enter a valid non-negative budget amount.', 'error');
        return;
      }

      try {
        currentPeriod = selectedPeriod;
        if (globalPeriodSelect) globalPeriodSelect.value = selectedPeriod;

        if (window.navigator.onLine) {
          const res = await api.budgets.save(selectedPeriod, {
            total_budget,
            needs_target_pct,
            wants_target_pct,
            savings_target_pct
          });
          if (res?.budget) {
            await saveLocalBudget(res.budget);
          }
        } else {
          const offlineBudget = {
            id: 'offline-' + Date.now(),
            period: selectedPeriod,
            total_budget_paise: rupeesToPaise(total_budget),
            needs_target_pct: parseInt(needs_target_pct, 10),
            wants_target_pct: parseInt(wants_target_pct, 10),
            savings_target_pct: parseInt(savings_target_pct, 10),
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          await saveLocalBudget(offlineBudget);
          await queueOfflineAction({
            action: 'PUT',
            endpoint: `/api/budgets/${selectedPeriod}`,
            payload: {
              total_budget,
              needs_target_pct,
              wants_target_pct,
              savings_target_pct
            }
          });
        }

        showToast(`Monthly budget for ${selectedPeriod} saved successfully!`, 'success');
        await loadBudgets();
        await loadDashboard();
      } catch (err) {
        showToast(err.message || 'Failed to save budget.', 'error');
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

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

