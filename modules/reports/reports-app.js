// AutoBook — modules/reports/reports-app.js
// Reports Center shell — tab router + shared date-range state.
// Sub-modules import getRepState() / inRange() from this file.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { renderNav } from '../../lib/nav.js';
import { printHTML as _printHTML, copyToClipboard } from '../../lib/export.js';
import { renderRepOverview } from './rep-overview.js';
import { renderRepSales } from './rep-sales.js';
import { renderRepOrders } from './rep-orders.js';
import { renderRepPayments } from './rep-payments.js';
import { renderRepLabor } from './rep-labor.js';
import { renderRepInventory } from './rep-inventory.js';
import { renderRepCrm } from './rep-crm.js';
import { renderRepRewards } from './rep-rewards.js';

// ---------------------------------------------------------------------------
// Shared date-range state — all sub-modules read via getRepState()
// ---------------------------------------------------------------------------
let _days = 30;
let _start = null;
let _end = null;

function applyDays(n) {
  _days = n;
  _end = new Date(); _end.setHours(23, 59, 59, 999);
  _start = new Date(); _start.setDate(_start.getDate() - (n - 1)); _start.setHours(0, 0, 0, 0);
}
applyDays(30);

export function getRepState() {
  return { days: _days, start: new Date(_start), end: new Date(_end) };
}
export function inRange(dateStr, start, end) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !isNaN(d) && d >= start && d <= end;
}
export function safeNum(n) {
  return (typeof n === 'number' && isFinite(n)) ? n : 0;
}

// ---------------------------------------------------------------------------
// Tab routing
// ---------------------------------------------------------------------------
const VIEWS = {
  overview:  renderRepOverview,
  sales:     renderRepSales,
  orders:    renderRepOrders,
  payments:  renderRepPayments,
  labor:     renderRepLabor,
  inventory: renderRepInventory,
  crm:       renderRepCrm,
  rewards:   renderRepRewards,
};

export function renderReports() {
  renderNav('#icon-rail', 'reports.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();

  document.getElementById('range-toggle').addEventListener('click', e => {
    const btn = e.target.closest('button[data-range]');
    if (!btn) return;
    document.querySelectorAll('#range-toggle button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyDays(Number(btn.dataset.range));
    renderCurrentView();
  });

  document.getElementById('reports-tabs').addEventListener('click', e => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    location.hash = btn.dataset.view;
  });

  window.addEventListener('hashchange', renderCurrentView);
  if (!location.hash || location.hash === '#') location.hash = 'overview';
  else renderCurrentView();
}

function renderCurrentView() {
  const view = (location.hash || '#overview').slice(1);
  const fn = VIEWS[view] || VIEWS.overview;
  document.querySelectorAll('#reports-tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  fn(document.getElementById('reports-view-body'));
}

// ---------------------------------------------------------------------------
// Shared HTML helpers used across sub-modules
// ---------------------------------------------------------------------------
export function repLabel(start, end) {
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function repStatCard(label, value, sub, color) {
  const icon = color === 'green' ? icoCheck() : color === 'red' ? icoAlert() : color === 'amber' ? icoClock() : icoDoc();
  return `<div class="stat-card">
    <div class="stat-head"><span class="stat-icon ${color || 'blue'}">${icon}</span><span class="stat-label">${label}</span></div>
    <div class="stat-value tnum">${value}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
  </div>`;
}

export function repTable(cols, rows, idPrefix) {
  if (!rows.length) return '<div class="empty-sub">No records in this date range.</div>';
  return `<table class="table">
    <thead><tr>${cols.map(c => `<th${c.num ? ' class="num"' : ''}${c.sort ? ` data-sort="${c.key}"` : ''}>${c.label}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr>${cols.map(c => `<td${c.num ? ' class="num tnum"' : ''}>${r[c.key] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

export function repMiniBar(value, max, color) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return `<div style="display:flex;align-items:center;gap:6px">
    <div style="flex:1;height:6px;background:var(--canvas);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${color || 'var(--accent)'};border-radius:3px"></div></div>
    <span style="font-size:10px;color:var(--ink-3);min-width:28px;text-align:right">${pct}%</span>
  </div>`;
}

export function repSection(title, badge, body, actions) {
  return `<div class="card" style="margin-bottom:var(--s4)">
    <div class="card-head">
      <div class="card-title">${title}${badge != null ? ` <span class="badge badge-gray" style="margin-left:6px;font-size:10px">${badge}</span>` : ''}</div>
      ${actions ? `<div class="row" style="gap:var(--s2)">${actions}</div>` : ''}
    </div>
    <div class="card-body" style="overflow-x:auto">${body}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Shared export helpers — sub-modules call these instead of lib/export.js directly
// ---------------------------------------------------------------------------
export function custLink(id, name) {
  const display = (name || '').trim();
  if (!id || !display) return display || '—';
  return `<a href="crm.html?customerId=${id}" style="color:var(--accent);font-weight:600;text-decoration:none" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${display}</a>`;
}

export function repCsv(rows2d, filename) {
  const csv = rows2d.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
export function repPrint(title, html) { _printHTML(title, html); }
export { copyToClipboard };

function icoCheck() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>'; }
function icoAlert() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>'; }
function icoClock() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'; }
function icoDoc() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>'; }
