/**
 * Amber Learn — авторизация через IndexedDB + WebCrypto.
 */

import { storage } from './storage.js?v=5';

const PBKDF2_ITERATIONS = 150000;

function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key, 256
  );
  return toHex(bits);
}

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : randomHex(16);
}

function normalize(user) {
  if (!user) return null;
  return { ...user, username: user.username || user.name || 'студент' };
}

export const auth = {
  async register({ email, username, password }) {
    email = email.trim().toLowerCase();
    username = (username || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Некорректный email');
    if (username.length < 3) throw new Error('Имя пользователя минимум 3 символа');
    if (password.length < 8) throw new Error('Пароль минимум 8 символов');

    const existing = await storage.findUserByEmail(email);
    if (existing) throw new Error('Пользователь с таким email уже существует');

    const salt = randomHex(16);
    const hash = await pbkdf2(password, salt);

    const user = { id: uuid(), email, username, salt, hash, createdAt: Date.now() };
    await storage.createUser(user);
    await storage.saveSession({ userId: user.id, startedAt: Date.now() });
    return normalize(user);
  },

  async login({ email, password }) {
    email = email.trim().toLowerCase();
    const user = await storage.findUserByEmail(email);
    if (!user) throw new Error('Пользователь не найден');
    const hash = await pbkdf2(password, user.salt);
    if (hash !== user.hash) throw new Error('Неверный пароль');
    await storage.saveSession({ userId: user.id, startedAt: Date.now() });
    return normalize(user);
  },

  async logout() { await storage.clearSession(); },

  async current() {
    const session = await storage.getSession();
    if (!session) return null;
    const user = await storage.getUser(session.userId);
    return user ? normalize(user) : null;
  },
};
