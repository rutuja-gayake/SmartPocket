/**
 * SmartPocket UI Helper Module
 */

export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

export function openModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) {
    overlay.classList.add('active');
    const firstInput = overlay.querySelector('input:not([type=hidden]), select');
    if (firstInput) firstInput.focus();
  }
}

export function closeModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) {
    overlay.classList.remove('active');
  }
}

export function getStatusBadgeHtml(status) {
  const statusLabels = {
    HEALTHY: { text: 'Healthy Budget', class: 'healthy' },
    NEAR_LIMIT: { text: 'Near Limit', class: 'near_limit' },
    BUDGET_EXCEEDED: { text: 'Budget Exceeded', class: 'exceeded' },
    NO_FUNDS: { text: 'No Funds', class: 'no_funds' },
    NO_BUDGET: { text: 'No Budget Set', class: 'no_budget' },
    NEW_USER: { text: 'New Account', class: 'new_user' }
  };

  const item = statusLabels[status] || { text: status, class: 'no_budget' };
  return `<span class="status-badge ${item.class}">${item.text}</span>`;
}
