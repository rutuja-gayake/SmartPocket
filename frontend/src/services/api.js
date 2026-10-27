/**
 * SmartPocket React API Client
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

    let timerId = null;
    const timeoutMs = options.timeout || 10000;
    if (!fetchOptions.signal && typeof AbortController !== 'undefined') {
      const controller = new AbortController();
      fetchOptions.signal = controller.signal;
      timerId = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs);
    }

    try {
      const response = await fetch(endpoint, fetchOptions);
      if (timerId) clearTimeout(timerId);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data.error || 'We could not complete your request. Please try again.';
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
        const timeoutError = new Error('This is taking longer than expected. Please try again.');
        timeoutError.isTimeout = true;
        throw timeoutError;
      }
      throw err;
    }
  },

  auth: {
    register: (payload, options = {}) => api.request('/api/auth/register', { method: 'POST', body: payload, ...options }),
    login: (payload, options = {}) => api.request('/api/auth/login', { method: 'POST', body: payload, ...options }),
    logout: (options = {}) => api.request('/api/auth/logout', { method: 'POST', ...options }),
    me: (options = {}) => api.request('/api/auth/me', options),
    setup2fa: () => api.request('/api/auth/2fa/setup', { method: 'POST' }),
    verify2fa: (payload) => api.request('/api/auth/2fa/verify', { method: 'POST', body: payload }),
    disable2fa: (payload) => api.request('/api/auth/2fa/disable', { method: 'POST', body: payload })
  },

  transactions: {
    list: (params = '') => api.request(`/api/transactions${params ? `?${params}` : ''}`),
    create: (payload) => api.request('/api/transactions', { method: 'POST', body: payload }),
    update: (id, payload) => api.request(`/api/transactions/${id}`, { method: 'PATCH', body: payload }),
    delete: (id) => api.request(`/api/transactions/${id}`, { method: 'DELETE' })
  },

  budgets: {
    get: (period) => api.request(`/api/budgets/${period}`),
    save: (period, payload) => api.request(`/api/budgets/${period}`, { method: 'PUT', body: payload })
  },

  allowances: {
    get: (period) => api.request(`/api/allowances${period ? `?period=${period}` : ''}`),
    save: (period, payload) => api.request(`/api/allowances/${period}`, { method: 'PUT', body: payload }),
    history: () => api.request('/api/allowances/history')
  },

  goals: {
    list: () => api.request('/api/goals'),
    create: (payload) => api.request('/api/goals', { method: 'POST', body: payload }),
    movement: (id, payload) => api.request(`/api/goals/${id}/movements`, { method: 'POST', body: payload }),
    allMovements: () => api.request('/api/goals/movements/all'),
    delete: (id) => api.request(`/api/goals/${id}`, { method: 'DELETE' })
  },

  categories: {
    list: () => api.request('/api/categories')
  },

  advisor: {
    query: (payload) => api.request('/api/advisor/query', { method: 'POST', body: payload }),
    suggestions: () => api.request('/api/advisor/suggestions')
  }
};

