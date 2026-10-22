/**
 * Amber Learn — хранилище на IndexedDB.
 * Аккаунты и прогресс живут локально в браузере, без сервера.
 */

const DB_NAME = 'amber-learn';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('users')) {
        const users = db.createObjectStore('users', { keyPath: 'id' });
        users.createIndex('email', 'email', { unique: true });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'userId' });
      }
      if (!db.objectStoreNames.contains('progress')) {
        const p = db.createObjectStore('progress', { keyPath: ['userId', 'lessonId'] });
        p.createIndex('userId', 'userId');
      }
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: ['userId', 'taskId'] });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(store, mode).objectStore(store);
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const storage = {
  async get(store, key) { return wrap((await tx(store)).get(key)); },
  async put(store, value) { return wrap((await tx(store, 'readwrite')).put(value)); },
  async delete(store, key) { return wrap((await tx(store, 'readwrite')).delete(key)); },
  async getAll(store) { return wrap((await tx(store)).getAll()); },
  async getAllByIndex(store, indexName, key) {
    const s = await tx(store);
    return wrap(s.index(indexName).getAll(key));
  },

  async createUser(user) { return this.put('users', user); },
  async findUserByEmail(email) {
    const s = await tx('users');
    return wrap(s.index('email').get(email));
  },
  async getUser(id) { return this.get('users', id); },

  async saveSession(session) { return this.put('sessions', session); },
  async getSession() {
    const all = await this.getAll('sessions');
    return all[0] || null;
  },
  async clearSession() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction('sessions', 'readwrite');
      t.objectStore('sessions').clear();
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async setProgress(userId, lessonId, patch) {
    const key = [userId, lessonId];
    const existing = (await this.get('progress', key)) || {
      userId, lessonId, status: 'not-started', tasks: {}, quiz: {}, updatedAt: 0
    };
    const merged = {
      ...existing, ...patch,
      tasks: { ...existing.tasks, ...(patch.tasks || {}) },
      quiz: { ...existing.quiz, ...(patch.quiz || {}) },
      updatedAt: Date.now(),
    };
    return this.put('progress', merged);
  },
  async getProgress(userId, lessonId) { return this.get('progress', [userId, lessonId]); },
  async getAllProgress(userId) { return this.getAllByIndex('progress', 'userId', userId); },

  async saveDraft(userId, taskId, code) {
    return this.put('drafts', { userId, taskId, code, updatedAt: Date.now() });
  },
  async getDraft(userId, taskId) { return this.get('drafts', [userId, taskId]); },

  async setMeta(key, value) { return this.put('meta', { key, value }); },
  async getMeta(key) {
    const r = await this.get('meta', key);
    return r ? r.value : null;
  },
};
