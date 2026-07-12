/**
 * IndexedDBAdapter.js
 *
 * Thin promise-based wrapper around IndexedDB for storing multiple named
 * projects (as opposed to the single-slot `localStorage` autosave handled
 * by `StorageManager`). Kept dependency-free and isolated behind a small
 * class so `StorageManager` — and everything above it — never touches the
 * raw IndexedDB callback API directly.
 */

const DB_NAME = 'openccna-simulator';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

/**
 * Wraps an IDBRequest in a Promise.
 * @param {IDBRequest} request
 * @returns {Promise<any>}
 */
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDBAdapter {
  constructor() {
    /** @type {Promise<IDBDatabase>|null} */
    this._dbPromise = null;
  }

  /**
   * Lazily opens (and, on first run, creates) the database.
   * @returns {Promise<IDBDatabase>}
   */
  _open() {
    if (this._dbPromise) return this._dbPromise;

    this._dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this._dbPromise;
  }

  /**
   * @param {string} mode - "readonly" | "readwrite"
   * @returns {Promise<IDBObjectStore>}
   */
  async _getStore(mode) {
    const db = await this._open();
    const tx = db.transaction(STORE_NAME, mode);
    return tx.objectStore(STORE_NAME);
  }

  /**
   * Saves (creates or overwrites) a named project.
   * @param {{id: string, name: string, data: object}} project
   * @returns {Promise<void>}
   */
  async saveProject({ id, name, data }) {
    const store = await this._getStore('readwrite');
    const record = { id, name, data, updatedAt: Date.now() };
    await promisifyRequest(store.put(record));
  }

  /**
   * Lists all saved projects, most recently updated first. Includes the
   * full `data` payload — callers that only need names/timestamps can
   * ignore it.
   * @returns {Promise<Array<{id: string, name: string, data: object, updatedAt: number}>>}
   */
  async listProjects() {
    const store = await this._getStore('readonly');
    const records = await promisifyRequest(store.getAll());
    return records.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * @param {string} id
   * @returns {Promise<{id: string, name: string, data: object, updatedAt: number}|undefined>}
   */
  async loadProject(id) {
    const store = await this._getStore('readonly');
    return promisifyRequest(store.get(id));
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteProject(id) {
    const store = await this._getStore('readwrite');
    await promisifyRequest(store.delete(id));
  }
}
