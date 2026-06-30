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
import { renderLeads, openLeadDrawer } from './leads.js';
import { renderCustomers, wireCustomerSearch, openCustomerDrawer } from './customers.js';
import { renderMyWorkspace } from './my-workspace.js';
import { openFollowUpDrawer, openQuoteDrawer } from './crm-drawers.js';
import { renderRewardsTab } from '../rewards/rewards-tab.js';
import { renderTeamCrm } from './team-crm.js';

workflow.ensureSeeded();

const VIEWS = {
  dashboard: renderCrmDashboard,
  pipeline: renderPipeline,
  leads: renderLeads,
  customers: renderCustomers,
  workspace: renderMyWorkspace,
  'team-crm': renderTeamCrm,
  followups: renderFollowUpsTab,
  activity: renderActivityTab,
  reports: renderReportsTab,
  rewards: renderRewardsTab,
  'my-leads': renderMyLeadsTab,
  'my-followups': renderMyFollowUpsTab,
  'my-customers': renderMyCustomersTab,
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

// Views only managers can reach
const MANAGER_ONLY_VIEWS = new Set(['dashboard', 'pipeline', 'followups', 'reports', 'rewards', 'team-crm']);
// Views only non-managers see
const NON_MANAGER_ONLY_VIEWS = new Set(['my-leads', 'my-followups', 'my-customers']);

function renderCurrentView() {
  const manager = isManagerView();
  let view = (location.hash || (manager ? '#dashboard' : '#workspace')).slice(1);
  // Guard: non-managers can't access manager-only views
  if (!manager && MANAGER_ONLY_VIEWS.has(view)) view = 'workspace';
  // Guard: managers redirected from non-manager-specific views to workspace
  if (manager && NON_MANAGER_ONLY_VIEWS.has(view)) view = 'workspace';
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

// ---------------------------------------------------------------------------
// Follow-Ups tab — shop-wide open tasks for managers
// ---------------------------------------------------------------------------
function renderFollowUpsTab(mount) {
  const now = Date.now();
  const tasks = db.followUpTasks().filter((t) => t.status === 'open').sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const employees = db.employees();
  const empName = (id) => { const e = employees.find((x) => x.id === id); return e ? `${e.firstName} ${e.lastName}` : 'Unassigned'; };
  const customerName = (id) => { const c = db.customerById(id); return c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : null; };

  const overdue = tasks.filter((t) => new Date(t.dueAt).getTime() < now);
  const dueToday = tasks.filter((t) => { const d = new Date(t.dueAt); return d.getTime() >= now && d.toDateString() === new Date().toDateString(); });
  const upcoming = tasks.filter((t) => new Date(t.dueAt).getTime() >= now && new Date(t.dueAt).toDateString() !== new Date().toDateString());

  const section = (title, items, badgeClass) => items.length ? `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">${title}</div><span class="badge ${badgeClass}">${items.length}</span></div>
      <div class="card-body">
        ${items.map((t) => {
          const related = t.customerId ? customerName(t.customerId) || null : null;
          return `<div class="followup-row" style="cursor:pointer" data-open-fu="${t.id}">
            <div>
              <div class="strong" style="color:var(--ink)">${t.title || 'Follow-up'}</div>
              <div class="muted" style="font-size:var(--t-13)">${empName(t.ownerId)} · Due ${util.fmtDate(t.dueAt)}${related ? ' · ' + related : ''}${t.reason ? ' · ' + t.reason : ''}</div>
            </div>
            <span class="badge badge-gray">${(t.taskType || 'other').replace(/_/g, ' ')}</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  mount.innerHTML = section('Overdue', overdue, 'badge-red') +
    section('Due Today', dueToday, 'badge-amber') +
    section('Upcoming', upcoming, 'badge-blue') +
    (!tasks.length ? '<div class="empty"><div class="empty-title">No open follow-ups</div><div class="empty-sub">The team is all caught up.</div></div>' : '');
  mount.querySelectorAll('[data-open-fu]').forEach((row) => row.addEventListener('click', () => openFollowUpDrawer(row.dataset.openFu)));
}

// ---------------------------------------------------------------------------
// Activity tab — global feed across all customers/leads
// ---------------------------------------------------------------------------
const TL_ICON = {
  booking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
  repair_order: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="M9 11h6M9 15h6"/></svg>',
  invoice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/><path d="M9 7h6M9 11h6"/></svg>',
  communication: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
  quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>',
};
function tlIcon(type) {
  if (TL_ICON[type]) return TL_ICON[type];
  if (type && type.startsWith('quote')) return TL_ICON.quote;
  if (type && (type.startsWith('invoice') || type.startsWith('payment'))) return TL_ICON.invoice;
  if (type && (type.startsWith('ro_') || type === 'customer_checked_in')) return TL_ICON.repair_order;
  return TL_ICON.communication;
}

function renderActivityTab(mount) {
  const events = db.customers().flatMap((c) => db.customerTimeline(c.id).map((e) => ({ ...e, customer: c })));
  events.sort((a, b) => new Date(b.at) - new Date(a.at));
  const recent = events.slice(0, 50);
  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">All activity</div><span class="badge badge-gray">${recent.length}${events.length > 50 ? '+' : ''}</span></div>
      <div class="card-body">
        ${recent.length ? recent.map((e) => `
          <div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule);cursor:pointer" data-open-customer="${e.customer.id}">
            <span class="row" style="gap:var(--s2)">
              <span class="insight-bubble" style="background:var(--canvas);color:var(--ink-3);width:26px;height:26px">${tlIcon(e.type)}</span>
              <span>${e.label || e.type} <span class="muted">· ${util.customerName(e.customer)}</span></span>
            </span>
            <span class="muted" style="font-size:var(--t-13)">${util.fmtDate(e.at)}</span>
          </div>`).join('') : '<div class="empty-sub">No activity yet.</div>'}
      </div>
    </div>`;
  mount.querySelectorAll('[data-open-customer]').forEach((row) => row.addEventListener('click', () => openCustomerDrawer(row.dataset.openCustomer)));
}

// ---------------------------------------------------------------------------
// Reports tab — CRM KPI summary for managers
// ---------------------------------------------------------------------------
function renderReportsTab(mount) {
  const leads = db.leads();
  const openLeads = leads.filter((l) => !['converted', 'lost'].includes(l.status));
  const convertedLeads = leads.filter((l) => l.status === 'converted');
  const contactedLeads = leads.filter((l) => l.lastContactedAt);
  const unassigned = leads.filter((l) => !l.assignedAdvisorId && !['converted', 'lost'].includes(l.status));
  const team = workflow.crmTeamMetrics();
  const pendingQuotes = db.quotes().filter((q) => ['sent', 'viewed', 'partially_approved'].includes(q.status));
  const pipelineValue = pendingQuotes.reduce((s, q) => s + (q.total || 0), 0);
  const wonQuotes = db.quotes().filter((q) => ['approved', 'partially_approved', 'converted'].includes(q.status));
  const wonValue = wonQuotes.reduce((s, q) => s + (q.lineItems || []).filter((l) => l.status === 'approved').reduce((a, l) => a + (l.total || 0), 0), 0);
  const conversionRate = leads.length ? Math.round((convertedLeads.length / leads.length) * 100) : 0;
  const contactRate = openLeads.length ? Math.round((contactedLeads.filter((l) => !['converted','lost'].includes(l.status)).length / openLeads.length) * 100) : 0;

  mount.innerHTML = `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon blue">${icoUsers()}</span><span class="stat-label">Total Leads</span></div>
        <div class="stat-value">${leads.length}</div>
        <div class="stat-sub">${openLeads.length} open · ${convertedLeads.length} converted · ${conversionRate}% rate</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon amber">${icoPhone()}</span><span class="stat-label">Contact Rate</span></div>
        <div class="stat-value">${contactRate}%</div>
        <div class="stat-sub">${unassigned.length} lead${unassigned.length === 1 ? '' : 's'} unassigned</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon green">${icoTrend()}</span><span class="stat-label">Pipeline Value</span></div>
        <div class="stat-value tnum">${util.fmtMoney0(pipelineValue)}</div>
        <div class="stat-sub">${util.fmtMoney0(wonValue)} won this period</div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">Performance by Owner</div></div>
      <div class="card-body" style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>Employee</th><th>Role</th><th class="num">Leads</th><th class="num">Contacted</th><th class="num">Open Opps</th><th class="num">Overdue</th><th class="num">Quotes Sent</th><th class="num">Approvals</th><th class="num">Rate</th><th class="num">Won</th><th class="num">Pipeline</th><th>Status</th></tr></thead>
          <tbody>
            ${team.length ? team.map((row) => `
              <tr>
                <td class="strong">${row.employee.firstName} ${row.employee.lastName}</td>
                <td>${db.roleById(row.employee.role)?.name || row.employee.role}</td>
                <td class="num">${row.assignedLeads}</td>
                <td class="num">${row.contactedLeads}</td>
                <td class="num">${row.openOpportunities}</td>
                <td class="num">${row.overdueFollowUps}</td>
                <td class="num">${row.quotesSent}</td>
                <td class="num">${row.approvals}</td>
                <td class="num">${row.approvalRate}%</td>
                <td class="num tnum">${util.fmtMoney0(row.wonValue)}</td>
                <td class="num tnum">${util.fmtMoney0(row.pipelineValue)}</td>
                <td><span class="badge ${row.statusBadge}">${row.overdueFollowUps > 2 ? 'Behind' : row.overdueFollowUps > 0 ? 'Watch' : 'On track'}</span></td>
              </tr>`).join('') : `<tr><td colspan="12"><div class="empty-sub">No sales-role employees on file.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Non-manager personal tabs (scoped to current employee only)
// ---------------------------------------------------------------------------
function renderMyLeadsTab(mount) {
  const me = db.employeeById(db.settings().currentUserId);
  if (!me) { mount.innerHTML = '<div class="empty-sub">No current user set.</div>'; return; }
  const leads = db.leads().filter((l) => l.assignedAdvisorId === me.id && !['converted', 'lost'].includes(l.status));
  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">My Leads</div><span class="badge badge-gray">${leads.length}</span></div>
      <div class="card-body" id="my-leads-list">
        ${leads.length ? leads.map((l) => `
          <div class="lead-card" style="cursor:pointer" data-open-lead="${l.id}">
            <div class="lc-head">
              <div><div class="lc-name">${l.firstName} ${l.lastName}</div><div class="lc-sub">${l.phone}${l.email ? ' · ' + l.email : ''}</div></div>
              <span class="badge ${l.status === 'new' ? 'badge-blue' : l.status === 'contacted' ? 'badge-amber' : 'badge-gray'}">${l.status.replace('_', ' ')}</span>
            </div>
            <div class="lc-sub">${(l.serviceInterest || []).join(', ') || 'No service interest noted'}</div>
            <div class="lc-meta">
              <span class="badge badge-gray">${util.timeAgo(l.createdAt)}</span>
              ${l.lastContactedAt ? '' : '<span class="badge badge-amber">Not contacted</span>'}
              ${l.nextFollowUpAt ? `<span class="badge badge-blue">Follow-up ${util.fmtDate(l.nextFollowUpAt)}</span>` : ''}
            </div>
            ${l.notes ? `<div class="lc-sub" style="margin-top:var(--s2)">${l.notes}</div>` : ''}
          </div>`).join('')
        : '<div class="empty-sub">No leads assigned to you.</div>'}
      </div>
    </div>`;
  mount.querySelectorAll('[data-open-lead]').forEach((card) => card.addEventListener('click', () => openLeadDrawer(card.dataset.openLead)));
}

function renderMyFollowUpsTab(mount) {
  const me = db.employeeById(db.settings().currentUserId);
  if (!me) { mount.innerHTML = '<div class="empty-sub">No current user set.</div>'; return; }
  const now = Date.now();
  const tasks = db.followUpTasks().filter((t) => t.ownerId === me.id && t.status === 'open').sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const overdue = tasks.filter((t) => new Date(t.dueAt).getTime() < now);
  const upcoming = tasks.filter((t) => new Date(t.dueAt).getTime() >= now);
  const customerName = (id) => { const c = db.customerById(id); return c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : null; };

  const rows = (items) => items.map((t) => {
    const related = t.customerId ? customerName(t.customerId) || null : null;
    return `<div class="followup-row" style="cursor:pointer" data-open-fu="${t.id}">
      <div>
        <div class="strong" style="color:var(--ink)">${t.title || 'Follow-up'}</div>
        <div class="muted" style="font-size:var(--t-13)">${new Date(t.dueAt).getTime() < now ? '<span style="color:var(--red)">Overdue</span> · ' : ''}Due ${util.fmtDate(t.dueAt)}${related ? ' · ' + related : ''}${t.reason ? ' · ' + t.reason : ''}</div>
      </div>
      <span class="badge badge-gray">${(t.taskType || 'other').replace(/_/g, ' ')}</span>
    </div>`;
  }).join('');

  mount.innerHTML = `
    ${overdue.length ? `<div class="card" style="margin-bottom:var(--s4)"><div class="card-head"><div class="card-title">Overdue</div><span class="badge badge-red">${overdue.length}</span></div><div class="card-body">${rows(overdue)}</div></div>` : ''}
    <div class="card">
      <div class="card-head"><div class="card-title">Upcoming follow-ups</div><span class="badge badge-gray">${upcoming.length}</span></div>
      <div class="card-body">${upcoming.length ? rows(upcoming) : '<div class="empty-sub">No upcoming follow-ups.</div>'}</div>
    </div>`;
  mount.querySelectorAll('[data-open-fu]').forEach((row) => row.addEventListener('click', () => openFollowUpDrawer(row.dataset.openFu)));
}

function renderMyCustomersTab(mount) {
  const me = db.employeeById(db.settings().currentUserId);
  if (!me) { mount.innerHTML = '<div class="empty-sub">No current user set.</div>'; return; }
  const myCustomers = workflow.getMyCustomers(me.id);
  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">My Customers / Accounts</div><span class="badge badge-gray">${myCustomers.length}</span></div>
      <div class="card-body">
        ${myCustomers.length ? myCustomers.map((c) => {
          const jobs = db.jobsForCustomer(c.id);
          const lastJob = jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
          return `<div class="cust-row" style="cursor:pointer" data-open-customer="${c.id}">
            <div>
              <div class="strong">${util.customerName(c)}</div>
              <div class="muted" style="font-size:var(--t-13)">${c.phone || 'No phone'} · ${jobs.length} visit${jobs.length === 1 ? '' : 's'}${lastJob ? ' · Last: ' + util.fmtDate(lastJob.createdAt) : ''}</div>
            </div>
            <span class="badge badge-gray">${c.email || 'No email'}</span>
          </div>`;
        }).join('')
        : '<div class="empty-sub">No customers assigned to you yet.</div>'}
      </div>
    </div>`;
  mount.querySelectorAll('[data-open-customer]').forEach((row) => row.addEventListener('click', () => openCustomerDrawer(row.dataset.openCustomer)));
}

function icoUsers() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>'; }
function icoPhone() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.8 19.8 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>'; }
function icoTrend() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l6-6 4 4 8-8"/></svg>'; }
