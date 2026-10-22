/**
 * Amber Learn — общие утилиты.
 */

import { auth } from './auth.js?v=5';

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getQuery(param) {
  const url = new URL(window.location.href);
  return url.searchParams.get(param);
}

export function toast(message, type = 'info') {
  let host = document.getElementById('toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast ${type === 'info' ? '' : type}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, 3000);
}

export async function renderHeader(active) {
  const user = await auth.current();
  const header = document.querySelector('.app-header');
  if (!header) return;

  header.innerHTML = `
    ${document.querySelector('.sidebar') ? '<button class="menu-toggle" id="menuToggle" aria-label="Меню" aria-expanded="false">☰</button>' : ''}
    <a href="./index.html" class="logo" aria-label="Amber Learn — главная">
      <span class="logo-text"><span style="color:#f0f0f0">AMBER</span> <span style="color:#fcee0a">LEARN</span></span>
    </a>
    <nav>
      <a href="./index.html" class="${active === 'home' ? 'active' : ''}">Курсы</a>
      ${user ? `<a href="./dashboard.html" class="${active === 'dash' ? 'active' : ''}">Кабинет</a>` : ''}
    </nav>
    <span class="spacer"></span>
    <div class="user-menu">
      ${user
        ? `<span class="user-name" aria-label="Пользователь">▸ ${escapeHtml(user.username)}</span>
           <button class="btn btn-ghost btn-sm" id="logoutBtn" aria-label="Выйти">Выход</button>`
        : `<a href="./login.html" class="btn btn-primary btn-sm">Вход</a>`
      }
    </div>
  `;

  const logoutBtn = header.querySelector('#logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await auth.logout();
      location.href = './index.html';
    });
  }

  const menuToggle = header.querySelector('#menuToggle');
  if (menuToggle) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = document.body.classList.toggle('menu-open');
      menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    document.addEventListener('click', (e) => {
      if (!document.body.classList.contains('menu-open')) return;
      if (e.target.closest('.sidebar') || e.target.closest('#menuToggle')) return;
      document.body.classList.remove('menu-open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  }
}
