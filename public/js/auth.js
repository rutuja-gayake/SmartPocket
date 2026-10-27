/**
 * SmartPocket Client Authentication State
 */

import { api } from './api.js';
import { clearUserData } from './db.js';

let currentUser = null;

export function getCurrentUser() {
  return currentUser;
}

export function setCurrentUser(user) {
  currentUser = user;
}

export async function checkAuth(options = {}) {
  try {
    const res = await api.auth.me(options);
    if (res && res.user && res.user.id) {
      currentUser = res.user;
      return { authenticated: true, user: currentUser, error: null, isUnauthenticated: false };
    }
    currentUser = null;
    return { authenticated: false, user: null, error: new Error('Malformed user payload'), isUnauthenticated: true };
  } catch (err) {
    currentUser = null;
    // 401 Unauthorized or 403 Forbidden is a normal unauthenticated session
    if (err.status === 401 || err.status === 403) {
      return { authenticated: false, user: null, error: null, isUnauthenticated: true };
    }
    // Network error, connection refused, or request timeout
    return { authenticated: false, user: null, error: err, isUnauthenticated: false };
  }
}

export async function logoutUser() {
  try {
    await api.auth.logout();
  } catch (_) {}

  currentUser = null;
  // Clear local IndexedDB stores upon logout to enforce multi-user privacy
  await clearUserData();
  localStorage.removeItem('smartpocket_last_sync');
}

