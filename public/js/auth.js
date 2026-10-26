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

export async function checkAuth() {
  try {
    const res = await api.auth.me();
    currentUser = res.user;
    return currentUser;
  } catch (err) {
    currentUser = null;
    return null;
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

