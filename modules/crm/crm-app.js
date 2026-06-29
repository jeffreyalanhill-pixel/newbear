// AutoBook — modules/crm/crm-app.js
// CRM sub-app shell: shared icon-rail + a navy command-center banner (same
// kpi-strip pattern Marketing uses) + hash-routed secondary views.
// Role-aware (sales-engine task): Owner/Admin/General Manager/Service
// Manager (if allowed)/Marketing see the full Command Center + Pipeline
// (team-wide). Everyone else gets "My Workspace" as the default view instead,
// and Leads/Customers are filtered to their own assignments — see
// lib/workflow.js's getMyLeads/getMyCustomers, the actual filtering logic.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import * as workflow from '../../lib/workflow.js';
import { renderNav } from '../../lib/nav.js';
import { renderCrmDashboard } from './crm-dashboard.js';
import { renderPipeline } from './pipeline.js';
import { renderLeads } from './leads.js';
import { renderCustomers, wireCustomerSearch } from './customers.js';
import { renderMyWorkspace } from './my-workspace.js';

workflow.ensureSeeded();

const VIEWS = {
  dashboard: renderCrmDashboard,
  pipeline: renderPipeline,
  leads: renderLeads,
  customers: renderCustomers,
  workspace: renderMyWorkspace,
};

// Roles that see team-wide CRM data (Command Center + Pipeline). Matches the
// task's explicit list — Service Manager and Marketing/CRM are included
// "if allowed", which here means: they have at least 'limited' CRM access.
export function isManagerView() {
  const role = util.currentRole();
  if (['owner', 'general_manager'].includes(role)) return true;
  return ['view', 'create', 'edit'].some((a) => util.canUser('CRM', a)) && ['service_manager', 'marketing'].includes(role);
}

export function renderCrm() {
  renderNav('#icon-rail', 'crm.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();
  document.getElementById('crm-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'crm-overlay') closeCrmDrawer();
  });
  wireCustomerSearch();

  const manager = isManagerView();
  document.querySelectorAll('[data-manager-only]').forEach((b) => { b.style.display = manager ? '' : 'none'; });
  document.querySelectorAll('[data-manager-hide]').forEach((b) => { b.style.display = manager ? 'none' : ''; });

  renderBanner(manager);

  document.getElementById('crm-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    location.hash = btn.dataset.view;
  });
  window.addEventListener('hashchange', renderCurrentView);
  if (!location.hash) location.hash = manager ? 'dashboard' : 'workspace';
  else renderCurrentView();
}

function renderCurrentView() {
  const manager = isManagerView();
  let view = (location.hash || (manager ? '#dashboard' : '#workspace')).slice(1);
  // A non-manager can't reach team-wide views even by typing the hash directly.
  if (!manager && ['dashboard', 'pipeline'].includes(view)) view = 'workspace';
  const fn = VIEWS[view] || VIEWS[manager ? 'dashboard' : 'workspace'];
  document.querySelectorAll('#crm-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  fn(document.getElementById('crm-view-body'));
}

// Command-center banner — reuses the exact navy .kpi-strip component (same
// one Marketing and the main dashboard use), so CRM reads as its own zone of
// the app without introducing any new visual language. Non-managers see
// their own numbers instead of the team-wide ones.
function renderBanner(manager) {
  const employee = db.employeeById(db.settings().currentUserId);
  const title = manager ? 'Customer Relationship Command Center' : 'My CRM Workspace';
  const sub = manager ? 'Every lead, customer, and follow-up in one place.' : `Your assigned leads, customers, and follow-ups, ${employee?.firstName || ''}.`;

  let stats;
  if (manager) {
    const customers = db.customers();
    const openLeads = db.leads().filter((l) => !['converted', 'lost'].includes(l.status)).length;
    const followUpsDue = workflow.overdueFollowUpTasks().length;
    const atRisk = db.segmentMembers('seg_inactive').length;
    stats = [['Customers', customers.length], ['Open Leads', openLeads], ['Follow-ups Due', followUpsDue], ['At Risk', atRisk]];
  } else {
    const m = employee ? workflow.crmMetricsForEmployee(employee.id) : { assignedLeads: 0, overdueFollowUps: 0, pipelineValue: 0, openOpportunities: 0 };
    stats = [['My Leads', m.assignedLeads], ['My Opportunities', m.openOpportunities], ['Overdue Follow-ups', m.overdueFollowUps], ['My Pipeline', util.fmtMoney0(m.pipelineValue)]];
  }

  document.getElementById('crm-banner').innerHTML = `
    <div class="kpi-strip" style="display:flex;align-items:center;justify-content:space-between;gap:var(--s5)">
      <div style="display:flex;align-items:center;gap:var(--s4)">
        <span style="width:48px;height:48px;border-radius:50%;background:var(--panel-2);display:grid;place-items:center;flex-shrink:0">
          ${iconUsers()}
        </span>
        <div>
          <div style="color:#fff;font-weight:800;font-size:var(--t-lg);letter-spacing:-.01em">${title}</div>
          <div style="color:var(--panel-txt);font-size:var(--t-13)">${sub}</div>
        </div>
      </div>
      <div class="row" style="gap:var(--s6);flex-shrink:0">
        ${stats.map(([label, value]) => bannerStat(label, value)).join('')}
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
