// AutoBook — modules/quotes/quotes-app.js
// Quotes sub-app shell: shared icon-rail + a navy command-center banner +
// hash-routed secondary views (Dashboard, Builder, Templates). Same pattern
// as crm-app.js/mkt-app.js — purpose-built layout, same design language.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { renderNav } from '../../lib/nav.js';
import { renderQuotesDashboard } from './quotes-dashboard.js';
import { renderQuoteBuilder } from './quote-builder.js';
import { renderQuoteTemplates } from './quote-templates.js';

const VIEWS = {
  dashboard: renderQuotesDashboard,
  builder: renderQuoteBuilder,
  templates: renderQuoteTemplates,
};

// "Use this template" / "Edit in builder" shared-state handoff — same
// pattern as Marketing's setCampaignPrefill/takeCampaignPrefill.
let pendingPrefill = null;
export function setBuilderPrefill(data) {
  pendingPrefill = data;
  location.hash = 'builder';
}
export function takeBuilderPrefill() {
  const p = pendingPrefill;
  pendingPrefill = null;
  return p;
}

export function renderQuotesApp() {
  renderNav('#icon-rail', 'quotes.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();
  document.getElementById('quote-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'quote-overlay') closeQuoteDrawer();
  });

  // Real (not a placeholder): no cron exists in this MVP, so expiration is
  // checked opportunistically whenever the app loads — see util.autoExpireQuotes.
  util.autoExpireQuotes();

  renderBanner();

  document.getElementById('quote-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    location.hash = btn.dataset.view;
  });
  window.addEventListener('hashchange', renderCurrentView);
  renderCurrentView();
}

function renderCurrentView() {
  const view = (location.hash || '#dashboard').slice(1);
  const fn = VIEWS[view] || VIEWS.dashboard;
  document.querySelectorAll('#quote-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  fn(document.getElementById('quote-view-body'));
}

function renderBanner() {
  const m = util.quoteMetrics();
  document.getElementById('quote-banner').innerHTML = `
    <div class="kpi-strip" style="display:flex;align-items:center;justify-content:space-between;gap:var(--s5)">
      <div style="display:flex;align-items:center;gap:var(--s4)">
        <span style="width:48px;height:48px;border-radius:50%;background:var(--panel-2);display:grid;place-items:center;flex-shrink:0">
          ${iconFile()}
        </span>
        <div>
          <div style="color:#fff;font-weight:800;font-size:var(--t-lg);letter-spacing:-.01em">Estimating Command Center</div>
          <div style="color:var(--panel-txt);font-size:var(--t-13)">Price it, send it, get it approved, put it to work.</div>
        </div>
      </div>
      <div class="row" style="gap:var(--s6);flex-shrink:0">
        ${bannerStat('Waiting Approval', m.waitingApproval)}
        ${bannerStat('Approved Revenue', util.fmtMoney0(m.approvedQuotedRevenue))}
        ${bannerStat('Close Rate', m.closeRate + '%')}
        ${bannerStat('Avg Quote', util.fmtMoney0(m.avgQuoteValue))}
      </div>
    </div>
  `;
}

function bannerStat(label, value) {
  return `
    <div style="text-align:right">
      <div class="tnum" style="color:#fff;font-weight:800;font-size:var(--t-2xl);line-height:1">${value}</div>
      <div style="color:var(--panel-txt);font-size:var(--t-13)">${label}</div>
    </div>`;
}

function iconFile() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="22" height="22"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>';
}

export function closeQuoteDrawer() {
  document.getElementById('quote-overlay').classList.remove('open');
}
export function openQuoteDrawer(html) {
  document.getElementById('quote-drawer').innerHTML = html;
  document.getElementById('quote-overlay').classList.add('open');
}

// Re-render whichever tab is active (used after an action mutates a quote
// so dashboard counts / banner stay in sync without a full page reload).
export function refreshQuotesApp() {
  renderBanner();
  renderCurrentView();
}
