// AutoBook — modules/crm/crm-app.js
// CRM sub-app shell: shared icon-rail + hash-routed secondary views.
// Phase 1 scope (§C, build order step 11): Dashboard, Leads, Customers.

import { db } from '../../lib/data.js';
import { renderNav } from '../../lib/nav.js';
import { renderCrmDashboard } from './crm-dashboard.js';
import { renderLeads } from './leads.js';
import { renderCustomers, wireCustomerSearch } from './customers.js';

const VIEWS = {
  dashboard: renderCrmDashboard,
  leads: renderLeads,
  customers: renderCustomers,
};

export function renderCrm() {
  renderNav('#icon-rail', 'crm.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();

  document.getElementById('crm-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'crm-overlay') closeCrmDrawer();
  });
  wireCustomerSearch();

  document.getElementById('crm-tabs').addEventListener('click', (e) => {
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
  document.querySelectorAll('#crm-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  fn(document.getElementById('crm-view-body'));
}

export function closeCrmDrawer() {
  document.getElementById('crm-overlay').classList.remove('open');
}
export function openCrmDrawer(html) {
  document.getElementById('crm-drawer').innerHTML = html;
  document.getElementById('crm-overlay').classList.add('open');
}
