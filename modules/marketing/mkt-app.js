// AutoBook — modules/marketing/mkt-app.js
// Marketing sub-app shell: shared icon-rail + hash-routed secondary views.
// Scope: Dashboard, Segments, Campaigns, Automations (foundation step — see
// each module's header comment for what's real vs. placeholder).

import { db } from '../../lib/data.js';
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

export function renderMarketing() {
  renderNav('#icon-rail', 'marketing.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();

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
