// AutoBook — modules/crm/crm-app.js
// CRM sub-app shell: shared icon-rail + a navy command-center banner (same
// kpi-strip pattern Marketing uses) + hash-routed secondary views.
// Phase 1 scope (§C, build order step 11): Dashboard, Pipeline, Leads, Customers.
import { db } from '../../lib/data.js';
import { renderNav } from '../../lib/nav.js';
import { renderCrmDashboard } from './crm-dashboard.js';
import { renderPipeline } from './pipeline.js';
import { renderLeads } from './leads.js';
import { renderCustomers, wireCustomerSearch } from './customers.js';

const VIEWS = {
  dashboard: renderCrmDashboard,
  pipeline: renderPipeline,
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

  renderBanner();

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

// Command-center banner — reuses the exact navy .kpi-strip component (same
// one Marketing and the main dashboard use), so CRM reads as its own zone of
// the app without introducing any new visual language.
function renderBanner() {
  const customers = db.customers();
  const leads = db.leads();
  const openLeads = leads.filter((l) => !['converted', 'lost'].includes(l.status)).length;
  const followUpsDue = leads.filter((l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt) <= new Date() && !['converted', 'lost'].includes(l.status)).length;
  const atRisk = db.segmentMembers('seg_inactive').length;

  document.getElementById('crm-banner').innerHTML = `
    <div class="kpi-strip" style="display:flex;align-items:center;justify-content:space-between;gap:var(--s5)">
      <div style="display:flex;align-items:center;gap:var(--s4)">
        <span style="width:48px;height:48px;border-radius:50%;background:var(--panel-2);display:grid;place-items:center;flex-shrink:0">
          ${iconUsers()}
        </span>
        <div>
          <div style="color:#fff;font-weight:800;font-size:var(--t-lg);letter-spacing:-.01em">Customer Relationship Command Center</div>
          <div style="color:var(--panel-txt);font-size:var(--t-13)">Every lead, customer, and follow-up in one place.</div>
        </div>
      </div>
      <div class="row" style="gap:var(--s6);flex-shrink:0">
        ${bannerStat('Customers', customers.length)}
        ${bannerStat('Open Leads', openLeads)}
        ${bannerStat('Follow-ups Due', followUpsDue)}
        ${bannerStat('At Risk', atRisk)}
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

function iconUsers() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="22" height="22"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>';
}

export function closeCrmDrawer() {
  document.getElementById('crm-overlay').classList.remove('open');
}
export function openCrmDrawer(html) {
  document.getElementById('crm-drawer').innerHTML = html;
  document.getElementById('crm-overlay').classList.add('open');
}
