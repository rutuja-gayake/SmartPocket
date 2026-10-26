/**
 * SmartPocket Synchronization Manager
 * Coordinates offline operations queue, background synchronization, and server pull.
 */

import { api } from './api.js';
import {
  getPendingSyncOps,
  removeSyncOp,
  enqueueSyncOp,
  saveLocalTransactionsBatch,
  saveLocalBudget,
  saveLocalGoal,
  saveLocalCategoriesBatch
} from './db.js';

let syncState = {
  isOnline: window.navigator.onLine,
  status: window.navigator.onLine ? 'synced' : 'offline', // 'synced' | 'offline' | 'syncing' | 'error'
  pendingCount: 0,
  lastSyncTime: localStorage.getItem('smartpocket_last_sync') || null
};

const listeners = new Set();

export function subscribeSyncState(fn) {
  listeners.add(fn);
  fn(syncState);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) {
    try { fn(syncState); } catch (_) {}
  }
}

/**
 * Updates pending operation count and refreshes sync pill
 */
export async function updatePendingCount() {
  try {
    const ops = await getPendingSyncOps();
    syncState.pendingCount = ops.length;
    if (!window.navigator.onLine) {
      syncState.status = 'offline';
    } else if (ops.length > 0) {
      syncState.status = 'syncing';
    } else {
      syncState.status = 'synced';
    }
    notify();
  } catch (_) {}
}

/**
 * Enqueues an offline action into IndexedDB and updates status
 */
export async function queueOfflineAction(entity, type, recordId, payload) {
  const operationId = `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const op = {
    operationId,
    entity,
    type,
    recordId,
    payload,
    timestamp: new Date().toISOString(),
    status: 'pending',
    retryCount: 0
  };

  await enqueueSyncOp(op);
  await updatePendingCount();
}

/**
 * Triggers a full push and pull synchronization cycle
 */
export async function synchronize() {
  if (!window.navigator.onLine) {
    syncState.status = 'offline';
    notify();
    return { success: false, reason: 'offline' };
  }

  syncState.status = 'syncing';
  notify();

  try {
    // 1. Push pending offline operations
    const pendingOps = await getPendingSyncOps();
    if (pendingOps.length > 0) {
      const pushResult = await api.sync.push(pendingOps);
      if (pushResult && pushResult.processed) {
        for (const proc of pushResult.processed) {
          await removeSyncOp(proc.operationId);
        }
      }
    }

    // 2. Pull server changes
    const pullResult = await api.sync.pull(syncState.lastSyncTime);
    if (pullResult && pullResult.records) {
      if (pullResult.records.transactions?.length) {
        await saveLocalTransactionsBatch(pullResult.records.transactions);
      }
      if (pullResult.records.budgets?.length) {
        for (const b of pullResult.records.budgets) {
          await saveLocalBudget(b);
        }
      }
      if (pullResult.records.goals?.length) {
        for (const g of pullResult.records.goals) {
          await saveLocalGoal(g);
        }
      }
      if (pullResult.records.categories?.length) {
        await saveLocalCategoriesBatch(pullResult.records.categories);
      }
    }

    syncState.lastSyncTime = new Date().toISOString();
    localStorage.setItem('smartpocket_last_sync', syncState.lastSyncTime);
    syncState.status = 'synced';
    await updatePendingCount();

    return { success: true };
  } catch (err) {
    console.warn('Sync failed:', err);
    syncState.status = 'error';
    notify();
    return { success: false, error: err };
  }
}

// Window connectivity listeners
window.addEventListener('online', () => {
  syncState.isOnline = true;
  synchronize();
});

window.addEventListener('offline', () => {
  syncState.isOnline = false;
  syncState.status = 'offline';
  notify();
});
