// AutoBook — modules/marketing/mkt-app.js
// Marketing sub-app shell: shared icon-rail + a navy command-center banner
// (same kpi-strip component the main dashboard uses, just applied here for
// the first time) + hash-routed secondary views. Scope: Dashboard, Segments,
// Campaigns, Automations — see each module's header comment for what's real
// vs. placeholder.

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { renderNav } from '../../lib/nav.js';
import { renderMktDashboard } from './mkt-dashboard.js';
import { renderSegments } from './segments.js';
import { renderCampaigns } from './mkt-campaigns.js';
import { renderAutomations } from './mkt-automations.js';

const VIEWS = {
  dashboard: renderMktDashboard,
  segments: renderSegments,
  campaigns: renderCampaigns,
  automations: renderAutomations,
};

// A "Create" button on a suggested campaign jumps to the Campaigns tab and
// pre-fills the builder. This is the one piece of state shared across views.
let pendingPrefill = null;
export function setCampaignPrefill(data) {
  pendingPrefill = data;
  location.hash = 'campaigns';
}
export function takeCampaignPrefill() {
  const p = pendingPrefill;
  pendingPrefill = null;
  return p;
}

export function renderMarketing() {
  renderNav('#icon-rail', 'marketing.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();

  renderBanner();

  document.getElementById('mkt-tabs').addEventListener('click', (e) => {
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
  document.querySelectorAll('#mkt-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  fn(document.getElementById('mkt-view-body'));
}

// The "command center" banner — reuses the exact navy .kpi-strip component
// from dashboard.html (no new visual language), so Marketing immediately
// reads as its own zone of the app without breaking the shared design system.
function renderBanner() {
  const reachable = db.customers().filter((c) => !c.doNotContact).length;
  const active = db.campaigns().filter((c) => c.status === 'sent' || c.status === 'scheduled').length;
  const automationsOn = db.automations().filter((a) => a.status === 'on').length;

  document.getElementById('mkt-banner').innerHTML = `
    <div class="kpi-strip" style="display:flex;align-items:center;justify-content:space-between;gap:var(--s5)">
      <div style="display:flex;align-items:center;gap:var(--s4)">
        <span style="width:48px;height:48px;border-radius:50%;background:var(--panel-2);display:grid;place-items:center;flex-shrink:0">
          ${iconMegaphone()}
        </span>
        <div>
          <div style="color:#fff;font-weight:800;font-size:var(--t-lg);letter-spacing:-.01em">Marketing Command Center</div>
          <div style="color:var(--panel-txt);font-size:var(--t-13)">Turn customer, vehicle, and repair-order history into repeat visits.</div>
        </div>
      </div>
      <div class="row" style="gap:var(--s6);flex-shrink:0">
        ${bannerStat('Reachable', reachable)}
        ${bannerStat('Active', active)}
        ${bannerStat('Automations On', automationsOn)}
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

function iconMegaphone() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="22" height="22"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a2 2 0 11-3.2 2.4"/></svg>';
}
