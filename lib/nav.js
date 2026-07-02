// AutoBook — lib/nav.js
// Renders the shared icon-rail (`.icon-rail`, §5.2 of style.css) into a page's
// `#icon-rail` mount point, marks the current page active, and shows live
// badge counts (pending bookings, low-stock parts). One source of nav truth —
// pages never hand-roll their own rail markup.

import { db } from './data.js';
import { util } from './util.js';

// Part A pages only (CRM/TeamOps/Marketing/Platform pages are added to this
// list when those modules are built). `module` maps each page to a name in
// lib/util.js's MODULE_LIST so the demo role nav filter below can look up
// that role's access level for the page.
const NAV_ITEMS = [
  { href: 'dashboard.html', label: 'Dashboard', icon: 'grid', module: 'Dashboard' },
  { href: 'repair-orders.html', label: 'Repair Orders', icon: 'clipboard', module: 'Repair Orders' },
  { href: 'appointments.html', label: 'Appointments', icon: 'calendar', badge: 'pendingBookings', module: 'Appointments' },
  { href: 'live_monitor.html', label: 'Live Monitor', icon: 'car', module: 'Live Monitor' },
  { href: 'crm.html', label: 'CRM', icon: 'users', module: 'CRM' },
  { href: 'customer-care.html', label: 'Customer Care', icon: 'heart', module: 'Customer Care' },
  { href: 'quotes.html', label: 'Quotes', icon: 'fileText', badge: 'quotesWaiting', module: 'Quotes' },
  { href: 'marketing.html', label: 'Marketing', icon: 'megaphone', module: 'Marketing' },
  // Team is exempt from the demo nav filter (see renderNav) — it's where the
  // "View app as" switcher lives, so it must always stay reachable or a demo
  // role with no Team access would have no way back to Owner/Admin.
  { href: 'team.html', label: 'Team', icon: 'badge', module: 'Team' },
  { href: 'invoices.html', label: 'Invoices', icon: 'receipt', module: 'Invoices' },
  { href: 'pos.html', label: 'Point of Sale', icon: 'dollar', module: 'POS' },
  { href: 'inventory.html', label: 'Inventory', icon: 'box', badge: 'lowStock', module: 'Inventory' },
  { href: 'reports.html', label: 'Reports', icon: 'chart', module: 'Reports' },
  { href: 'settings.html', label: 'Settings', icon: 'gear', module: 'Settings' },
];
const NAV_FILTER_EXEMPT_HREFS = ['team.html'];

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="M9 11h6M9 15h6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
  car: '<path d="M5 17h14l-1.5-5a2 2 0 00-1.9-1.4H8.4A2 2 0 006.5 12L5 17zM5 17v2M19 17v2"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>',
  receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/><path d="M9 7h6M9 11h6"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.97 7.97 0 000-2l2-1.5-2-3.5-2.3.9a8 8 0 00-1.7-1l-.3-2.4h-4l-.3 2.4a8 8 0 00-1.7 1L6.6 5.5l-2 3.5L6.6 11a8 8 0 000 2l-2 1.5 2 3.5 2.3-.9a8 8 0 001.7 1l.3 2.4h4l.3-2.4a8 8 0 001.7-1l2.3.9 2-3.5L19.4 13z"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
  users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
  dollar: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>',
  megaphone: '<path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a2 2 0 11-3.2 2.4"/>',
  badge: '<circle cx="12" cy="8" r="5"/><path d="M8.5 13.5L7 22l5-3 5 3-1.5-8.5"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 16l4-6 3 3 5-8"/>',
  fileText: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
};

function svgIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

function badgeCount(kind) {
  if (kind === 'pendingBookings') return db.pendingBookings().length;
  if (kind === 'lowStock') return db.lowStockParts().length;
  if (kind === 'quotesWaiting') return db.quotes().filter((q) => ['sent', 'viewed'].includes(q.status)).length;
  return 0;
}

// Demo-only "View app as" nav filtering (role-presets task, follow-up). This
// dims rail items the current demo role has 'none' module access to — it
// is purely visual: the <a href> is left intact, so clicking through or
// typing the URL directly still works. Nothing here is page routing/access
// control, and nothing here is real security — see the SECURITY WARNING at
// the top of lib/auth.js. Real enforcement must happen server-side once this
// app moves to Supabase/a real backend.
function currentDemoRoleAccess() {
  const employee = db.employeeById(db.settings().currentUserId);
  if (!employee) return null;
  return util.moduleAccessForRole(employee.role).access;
}

export function renderNav(mountSelector = '#icon-rail', currentFile) {
  const mount = document.querySelector(mountSelector);
  if (!mount) return;
  const file = currentFile || location.pathname.split('/').pop();
  const access = currentDemoRoleAccess();

  const items = NAV_ITEMS.map((item) => {
    const active = item.href === file;
    const count = item.badge ? badgeCount(item.badge) : 0;
    const level = access && !NAV_FILTER_EXEMPT_HREFS.includes(item.href) ? (access[item.module] || 'none') : null;
    const disabled = level === 'none';
    const title = disabled ? `${item.label} — no access for the current demo role (UI only, not enforced)` : item.label;
    return `
      <a class="rail-item${active ? ' active' : ''}${disabled ? ' rail-item-disabled' : ''}" href="${item.href}" title="${title}">
        ${svgIcon(item.icon)}
        <span class="rail-item-label">${item.label}</span>
        ${count > 0 ? `<span class="rail-dot"></span>` : ''}
      </a>`;
  }).join('');

  const shopName = db.settings().name || 'My Shop';
  const demoEmployee = db.employeeById(db.settings().currentUserId);
  const demoRoleName = demoEmployee && demoEmployee.role !== 'owner' ? db.roleById(demoEmployee.role)?.name : null;

  // .rail-inner is the actual visual panel; it's absolutely positioned inside
  // the fixed-width .icon-rail (see style.css) so expanding on hover overlays
  // the page instead of reflowing it.
  mount.innerHTML = `
    <div class="rail-inner">
      <div class="rail-logo">
        <svg viewBox="0 0 256 256" width="24" height="24" aria-hidden="true">
          <defs><linearGradient id="torklioBlueRail" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7DD3FC"/><stop offset="50%" stop-color="#1E88FF"/><stop offset="100%" stop-color="#2563EB"/></linearGradient></defs>
          <circle cx="128" cy="132" r="62" fill="#071A3D"/>
          <circle cx="128" cy="132" r="34" fill="#FFFFFF"/>
          <path d="M 67 72 A 92 92 0 0 1 197 81" fill="none" stroke="url(#torklioBlueRail)" stroke-width="18" stroke-linecap="butt"/>
          <path d="M 120 144 L 205 59 L 143 158 Z" fill="url(#torklioBlueRail)"/>
          <circle cx="128" cy="132" r="13" fill="#FFFFFF" stroke="#1E88FF" stroke-width="5"/>
        </svg>
        <span class="rail-shop-name">${shopName}</span>
      </div>
      ${demoRoleName ? `<div class="rail-item-label" style="opacity:1;padding:0 13px;color:var(--amber);font-size:11px;font-weight:700;margin-bottom:4px" title="Demo-only nav filtering — visually dims pages this role can't access. Not real security.">Viewing as ${demoRoleName} (demo)</div>` : ''}
      ${items}
      <div class="rail-spacer"></div>
      <a class="rail-item" href="index.html" title="Log out">${svgIcon('logout')}<span class="rail-item-label">Log out</span></a>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Shared non-blocking feedback (§3 quality floor: never silently fail, but also
// never use native alert()/confirm() — they block the page and the test harness).
// ---------------------------------------------------------------------------
function toastStack() {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

export function toast(message, kind = 'default') {
  const stack = toastStack();
  const el = document.createElement('div');
  el.className = `toast${kind === 'error' ? ' toast-error' : kind === 'success' ? ' toast-success' : ''}`;
  el.textContent = message;
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 200);
  }, 3000);
}

// Navigate to a customer's CRM profile. Shared by invoice, estimate, and any
// other module that needs to deep-link to a customer record.
export function goToCustomer(customerId) {
  if (!customerId) { toast('Customer record unavailable.', 'error'); return; }
  window.location.href = `crm.html?customerId=${encodeURIComponent(customerId)}`;
}

export function confirmDialog(message, { confirmLabel = 'Confirm', danger = true } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay open';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px">
        <div class="modal-body">
          <div style="font-size:var(--t-base);color:var(--ink-2)">${message}</div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-secondary" data-cancel>Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };
    overlay.querySelector('[data-cancel]').addEventListener('click', () => cleanup(false));
    overlay.querySelector('[data-confirm]').addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
  });
}
