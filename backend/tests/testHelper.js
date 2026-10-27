import { createApp } from '../src/server.js';
import { getDb, closeDb, setDb, initDb } from '../src/database/db.js';
import { DatabaseSync } from 'node:sqlite';

/**
 * Creates an ephemeral test environment with an in-memory SQLite database.
 */
export async function createTestApp() {
  // Use in-memory SQLite for complete test isolation and speed
  const testDb = new DatabaseSync(':memory:');
  setDb(testDb);
  initDb(testDb);

  const app = createApp();

  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const baseUrl = `http://127.0.0.1:${port}`;

      async function request(path, options = {}) {
        const url = `${baseUrl}${path}`;
        const headers = options.headers || {};
        if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
          options.body = JSON.stringify(options.body);
          headers['Content-Type'] = 'application/json';
        }
        options.headers = headers;
        return fetch(url, options);
      }

      function close() {
        return new Promise((res) => {
          server.close(() => {
            closeDb();
            res();
          });
        });
      }

      resolve({ server, baseUrl, request, close, db: testDb });
    });
  });
}

