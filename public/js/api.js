/**
 * SmartPocket API Client
 */

export const api = {
  async request(endpoint, options = {}) {
    const defaultHeaders = {
      'Accept': 'application/json'
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      options.body = JSON.stringify(options.body);
      defaultHeaders['Content-Type'] = 'application/json';
    }

    const fetchOptions = {
      ...options,
      headers: { ...defaultHeaders, ...options.headers },
      credentials: 'include'
    };

    // Attach timeout if not explicitly provided with a custom signal
    let timerId = null;
    const timeoutMs = options.timeout || 10000;
    if (!fetchOptions.signal && typeof AbortController !== 'undefined') {
      const controller = new AbortController();
      fetchOptions.signal = controller.signal;
      timerId = setTimeout(() => {
        controller.abort(new Error('Request timed out'));
      }, timeoutMs);
    }

    try {
      const response = await fetch(endpoint, fetchOptions);
      if (timerId) clearTimeout(timerId);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data.error || `Server returned error (${response.status})`;
        const error = new Error(errorMsg);
        error.status = response.status;
        error.data = data;

        if (response.status === 401 && !endpoint.includes('/api/auth/')) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('smartpocket:unauthorized'));
          }
        }

        throw error;
      }

      return data;
    } catch (err) {
      if (timerId) clearTimeout(timerId);
      if (err.name === 'AbortError' || err.message?.includes('timed out')) {
        const timeoutError = new Error('Connection timed out. Please try again.');
        timeoutError.isTimeout = true;
        throw timeoutError;
      }
      if (!window.navigator.onLine || err.name === 'TypeError') {
        err.isOffline = true;
      }
      throw err;
    }
  },

  // Auth
  auth: {
    register: (payload, options = {}) => api.request('/api/auth/register', { method: 'POST', body: payload, ...options }),
    login: (payload, options = {}) => api.request('/api/auth/login', { method: 'POST', body: payload, ...options }),
    logout: (options = {}) => api.request('/api/auth/logout', { method: 'POST', ...options }),
    me: (options = {}) => api.request('/api/auth/me', options),
    setup2fa: () => api.request('/api/auth/2fa/setup', { method: 'POST' }),
    verify2fa: (payload) => api.request('/api/auth/2fa/verify', { method: 'POST', body: payload }),
    recovery2fa: (payload) => api.request('/api/auth/2fa/recovery', { method: 'POST', body: payload }),
    disable2fa: (payload) => api.request('/api/auth/2fa/disable', { method: 'POST', body: payload })
  },

  // Transactions
  transactions: {
    list: (params = '') => api.request(`/api/transactions${params ? `?${params}` : ''}`),
    create: (payload) => api.request('/api/transactions', { method: 'POST', body: payload }),
    update: (id, payload) => api.request(`/api/transactions/${id}`, { method: 'PATCH', body: payload }),
    delete: (id) => api.request(`/api/transactions/${id}`, { method: 'DELETE' })
  },

  // Budgets
  budgets: {
    get: (period) => api.request(`/api/budgets${period ? `?period=${period}` : ''}`),
    save: (period, payload) => api.request(`/api/budgets/${period}`, { method: 'PUT', body: payload })
  },

  // Goals
  goals: {
    list: () => api.request('/api/goals'),
    create: (payload) => api.request('/api/goals', { method: 'POST', body: payload }),
    update: (id, payload) => api.request(`/api/goals/${id}`, { method: 'PATCH', body: payload }),
    delete: (id) => api.request(`/api/goals/${id}`, { method: 'DELETE' }),
    movement: (id, payload) => api.request(`/api/goals/${id}/movements`, { method: 'POST', body: payload }),
    goalMovements: (id) => api.request(`/api/goals/${id}/movements`),
    allMovements: () => api.request('/api/goals/movements/all')
  },

  // Categories
  categories: {
    list: () => api.request('/api/categories'),
    create: (payload) => api.request('/api/categories', { method: 'POST', body: payload })
  },

  // Advisor
  advisor: {
    query: (payload) => api.request('/api/advisor/query', { method: 'POST', body: payload }),
    predictions: () => api.request('/api/advisor/predictions')
  },

  // Sync
  sync: {
    pull: (since) => api.request(`/api/sync/pull${since ? `?since=${since}` : ''}`),
    push: (operations) => api.request('/api/sync/push', { method: 'POST', body: { operations } })
  }
};

