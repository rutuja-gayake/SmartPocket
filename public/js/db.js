/**
 * SmartPocket IndexedDB Layer (smartpocket_idb)
 * Provides offline-first local persistence for all user financial data.
 */

const DB_NAME = 'smartpocket_idb';
const DB_VERSION = 1;

let dbPromise = null;

export function openLocalDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Transactions Store
      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('date', 'date', { unique: false });
        txStore.createIndex('type', 'type', { unique: false });
        txStore.createIndex('classification', 'classification', { unique: false });
        txStore.createIndex('user_id', 'user_id', { unique: false });
      }

      // Budgets Store
      if (!db.objectStoreNames.contains('budgets')) {
        db.createObjectStore('budgets', { keyPath: 'period' });
      }

      // Savings Goals Store
      if (!db.objectStoreNames.contains('goals')) {
        db.createObjectStore('goals', { keyPath: 'id' });
      }

      // Categories Store
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }

      // Pending Synchronization Queue Store
      if (!db.objectStoreNames.contains('pendingSyncQueue')) {
        const syncStore = db.createObjectStore('pendingSyncQueue', { keyPath: 'operationId' });
        syncStore.createIndex('status', 'status', { unique: false });
        syncStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // App Metadata Store
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });

  return dbPromise;
}

/**
 * Generic promise wrapper for IndexedDB transactions
 */
async function perform(storeName, mode, callback) {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = callback(store);

    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
  });
}

// Transactions
export async function getAllLocalTransactions() {
  return perform('transactions', 'readonly', (store) => store.getAll());
}

export async function saveLocalTransaction(tx) {
  return perform('transactions', 'readwrite', (store) => store.put(tx));
}

export async function saveLocalTransactionsBatch(txList) {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('transactions', 'readwrite');
    const store = transaction.objectStore('transactions');
    for (const tx of txList) {
      store.put(tx);
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteLocalTransaction(id) {
  return perform('transactions', 'readwrite', (store) => store.delete(id));
}

// Budgets
export async function getLocalBudget(period) {
  return perform('budgets', 'readonly', (store) => store.get(period));
}

export async function saveLocalBudget(budget) {
  return perform('budgets', 'readwrite', (store) => store.put(budget));
}

// Goals
export async function getAllLocalGoals() {
  return perform('goals', 'readonly', (store) => store.getAll());
}

export async function saveLocalGoal(goal) {
  return perform('goals', 'readwrite', (store) => store.put(goal));
}

export async function deleteLocalGoal(id) {
  return perform('goals', 'readwrite', (store) => store.delete(id));
}

// Categories
export async function getAllLocalCategories() {
  return perform('categories', 'readonly', (store) => store.getAll());
}

export async function saveLocalCategoriesBatch(categories) {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('categories', 'readwrite');
    const store = transaction.objectStore('categories');
    for (const cat of categories) {
      store.put(cat);
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Synchronization Queue
export async function enqueueSyncOp(op) {
  return perform('pendingSyncQueue', 'readwrite', (store) => store.put(op));
}

export async function getPendingSyncOps() {
  return perform('pendingSyncQueue', 'readonly', (store) => store.getAll());
}

export async function removeSyncOp(operationId) {
  return perform('pendingSyncQueue', 'readwrite', (store) => store.delete(operationId));
}

export async function clearUserData() {
  const db = await openLocalDb();
  const storeNames = ['transactions', 'budgets', 'goals', 'categories', 'pendingSyncQueue', 'metadata'];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
