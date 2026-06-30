// AutoBook — modules/crm/team-crm.js
// Team CRM — manager-only view of subordinate CRM work.
// Provides: team overview cards, employee performance table, employee CRM
// detail drawer, team activity log, drill-down panels, manager reassignment.
// Permission: gated at renderCrm() → managers only. This module never checks
// auth itself — the router (crm-app.js MANAGER_ONLY_VIEWS) blocks non-managers.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import * as workflow from '../../lib/workflow.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import { openCrmDrawer, closeCrmDrawer } from './crm-app.js';
import { openFollowUpDrawer, openQuoteDrawer } from './crm-drawers.js';
import { copyToClipboard, downloadCSV, printHTML } from '../../lib/export.js';

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------
export function renderTeamCrm(mount) {
  const team = buildTeamRows();
  const overview = buildOverviewMetrics(team);

  mount.innerHTML = `
    ${overviewCards(overview)}
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head">
        <div class="card-title">Team CRM Performance</div>
        <div class="row" style="gap:var(--s2)">
          <button class="btn btn-secondary btn-sm" id="team-crm-csv">Export CSV</button>
          <button class="btn btn-secondary btn-sm" id="team-crm-print">Print</button>
          <button class="btn btn-secondary btn-sm" id="team-crm-copy">Copy</button>
        </div>
      </div>
      <div class="card-body" style="overflow-x:auto">
        ${employeeTable(team)}
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">Team Activity</div>
        <div class="row" style="gap:var(--s2)">
          <select class="select" id="team-act-emp" style="font-size:var(--t-13);padding:4px 8px;height:auto">
            <option value="">All team members</option>
            ${team.map(r => `<option value="${r.employee.id}">${r.employee.firstName} ${r.employee.lastName}</option>`).join('')}
          </select>
          <select class="select" id="team-act-type" style="font-size:var(--t-13);padding:4px 8px;height:auto">
            <option value="">All activity</option>
            <option value="lead">Lead events</option>
            <option value="followup">Follow-ups</option>
            <option value="quote">Quotes</option>
            <option value="invoice">Invoices</option>
            <option value="communication">Communications</option>
          </select>
        </div>
      </div>
      <div class="card-body" id="team-activity-feed"></div>
    </div>
  `;

  wireOverviewCards(mount, team, overview);
  wireEmployeeTable(mount);
  wireExports(mount, team);
  renderActivityFeed(mount, null, null);

  mount.querySelector('#team-act-emp').addEventListener('change', () => rerenderFeed(mount));
  mount.querySelector('#team-act-type').addEventListener('change', () => rerenderFeed(mount));
}

function rerenderFeed(mount) {
  const empId = mount.querySelector('#team-act-emp').value || null;
  const typeFilter = mount.querySelector('#team-act-type').value || null;
  renderActivityFeed(mount, empId, typeFilter);
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------
function buildTeamRows() {
  const allFollowUps = db.followUpTasks();
  const allQuotes = db.quotes();
  const activityEvents = db.activityEvents();

  return workflow.crmTeamMetrics().map(row => {
    const empId = row.employee.id;
    const myCustomers = workflow.getMyCustomers(empId);
    const openFollowUps = allFollowUps.filter(t => t.ownerId === empId && t.status === 'open');
    const lastEvent = activityEvents.filter(e => e.actorId === empId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const lostQuotes = allQuotes.filter(q => q.advisorId === empId && q.status === 'declined').length;
    return {
      ...row,
      customers: myCustomers.length,
      openFollowUps: openFollowUps.length,
      lostQuotes,
      lastActivity: lastEvent ? lastEvent.createdAt : null,
    };
  });
}

function buildOverviewMetrics(team) {
  const openLeads = db.leads().filter(l => !['converted', 'lost'].includes(l.status));
  const overdue = workflow.overdueFollowUpTasks();
  const pendingQuotes = db.quotes().filter(q => ['sent', 'viewed', 'partially_approved'].includes(q.status));
  const pipelineValue = pendingQuotes.reduce((s, q) => s + (q.total || 0), 0);
  const stale = workflow.staleLeads();
  const unassigned = workflow.unassignedLeads();
  const declinedCandidates = workflow.getDeclinedWorkCandidates();
  const declinedValue = declinedCandidates.reduce((s, d) => s + (d.declinedValue || 0), 0);
  const wonQuotes = db.quotes().filter(q => ['approved', 'partially_approved', 'converted'].includes(q.status));
  const wonValue = wonQuotes.reduce((s, q) => s + (q.lineItems || []).filter(l => l.status === 'approved').reduce((a, l) => a + (l.total || 0), 0), 0);
  const overdueByEmp = team.filter(r => r.overdueFollowUps > 0).length;
  return { openLeads, overdue, pendingQuotes, pipelineValue, stale, unassigned, declinedCandidates, declinedValue, wonValue, wonQuotes, overdueByEmp };
}

// ---------------------------------------------------------------------------
// Overview cards
// ---------------------------------------------------------------------------
function overviewCards(o) {
  const cards = [
    { label: 'Open Leads', value: o.openLeads.length, sub: `${o.unassigned.length} unassigned`, icon: iconUsers(), color: 'blue', drill: 'open-leads' },
    { label: 'Overdue Follow-ups', value: o.overdue.length, sub: `${o.overdueByEmp} employee${o.overdueByEmp === 1 ? '' : 's'} with overdue`, icon: iconClock(), color: o.overdue.length ? 'red' : 'green', drill: 'overdue-followups' },
    { label: 'Quotes Waiting Approval', value: o.pendingQuotes.length, sub: util.fmtMoney0(o.pipelineValue) + ' pipeline', icon: iconDoc(), color: 'amber', drill: 'pending-quotes' },
    { label: 'Stale Leads', value: o.stale.length, sub: '7+ days no contact', icon: iconAlert(), color: o.stale.length ? 'amber' : 'green', drill: 'stale-leads' },
    { label: 'Pipeline Value', value: util.fmtMoney0(o.pipelineValue), sub: `${o.pendingQuotes.length} active quote${o.pendingQuotes.length === 1 ? '' : 's'}`, icon: iconTrend(), color: 'blue', drill: 'pending-quotes' },
    { label: 'Won Value', value: util.fmtMoney0(o.wonValue), sub: `${o.wonQuotes.length} won`, icon: iconCheck(), color: 'green', drill: 'won-quotes' },
    { label: 'Unassigned Leads', value: o.unassigned.length, sub: 'Need an owner', icon: iconWarn(), color: o.unassigned.length ? 'amber' : 'green', drill: 'unassigned-leads' },
    { label: 'Declined Work Value', value: util.fmtMoney0(o.declinedValue), sub: `${o.declinedCandidates.length} customer${o.declinedCandidates.length === 1 ? '' : 's'}`, icon: iconWrench(), color: o.declinedValue > 0 ? 'red' : 'green', drill: 'declined-work' },
  ];
  return `<div class="grid-4" style="margin-bottom:var(--s4)">
    ${cards.map(c => `
      <div class="stat-card" style="cursor:pointer" data-team-drill="${c.drill}">
        <div class="stat-head"><span class="stat-icon ${c.color}">${c.icon}</span><span class="stat-label">${c.label}</span></div>
        <div class="stat-value tnum">${c.value}</div>
        <div class="stat-sub">${c.sub}</div>
      </div>`).join('')}
  </div>`;
}

function wireOverviewCards(mount, team, overview) {
  mount.querySelectorAll('[data-team-drill]').forEach(card => card.addEventListener('click', () => {
    openDrillDrawer(card.dataset.teamDrill, team, overview);
  }));
}

// ---------------------------------------------------------------------------
// Employee table
// ---------------------------------------------------------------------------
function employeeTable(team) {
  if (!team.length) return '<div class="empty-sub">No sales-role employees on file.</div>';
  const maxLeads = Math.max(1, ...team.map(r => r.assignedLeads));
  const maxPipeline = Math.max(1, ...team.map(r => r.pipelineValue));
  return `
    <table class="table">
      <thead>
        <tr>
          <th>Employee</th>
          <th>Role</th>
          <th class="num">Leads</th>
          <th class="num">Customers</th>
          <th class="num">Follow-ups</th>
          <th class="num">Overdue</th>
          <th class="num">Q. Sent</th>
          <th class="num">Approved</th>
          <th class="num">Rate</th>
          <th class="num">Pipeline</th>
          <th>Last Activity</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${team.map(r => {
          const leadsBar = miniBar(r.assignedLeads, maxLeads, 'var(--accent)');
          const pipeBar = miniBar(r.pipelineValue, maxPipeline, 'var(--green)');
          return `
          <tr style="cursor:pointer" data-open-emp="${r.employee.id}">
            <td class="strong">${r.employee.firstName} ${r.employee.lastName}</td>
            <td class="muted">${db.roleById(r.employee.role)?.name || r.employee.role}</td>
            <td class="num">
              <div>${r.assignedLeads}</div>
              ${leadsBar}
            </td>
            <td class="num">${r.customers}</td>
            <td class="num">${r.openFollowUps}</td>
            <td class="num">${r.overdueFollowUps > 0 ? `<span style="color:var(--red);font-weight:700">${r.overdueFollowUps}</span>` : '0'}</td>
            <td class="num">${r.quotesSent}</td>
            <td class="num">${r.approvals}</td>
            <td class="num">${r.approvalRate}%</td>
            <td class="num">
              <div class="tnum">${util.fmtMoney0(r.pipelineValue)}</div>
              ${pipeBar}
            </td>
            <td class="muted" style="font-size:var(--t-13)">${r.lastActivity ? util.timeAgo(r.lastActivity) : 'No activity'}</td>
            <td><span class="badge ${r.statusBadge}">${r.overdueFollowUps > 2 ? 'Behind' : r.overdueFollowUps > 0 ? 'Watch' : 'On track'}</span></td>
            <td data-stop-row><button class="btn btn-secondary btn-sm" data-view-emp="${r.employee.id}">View CRM</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function miniBar(value, max, color) {
  const pct = Math.round((value / max) * 100);
  return `<div style="height:4px;background:var(--canvas);border-radius:2px;overflow:hidden;margin-top:3px"><div style="height:100%;width:${pct}%;background:${color};border-radius:2px"></div></div>`;
}

function wireEmployeeTable(mount) {
  mount.querySelectorAll('[data-open-emp]').forEach(row => row.addEventListener('click', e => {
    if (e.target.closest('[data-stop-row]')) return;
    openEmpDrawer(row.dataset.openEmp);
  }));
  mount.querySelectorAll('[data-view-emp]').forEach(btn => btn.addEventListener('click', () => openEmpDrawer(btn.dataset.viewEmp)));
}

// ---------------------------------------------------------------------------
// Team activity feed
// ---------------------------------------------------------------------------
function renderActivityFeed(mount, empId, typeFilter) {
  const TL_ICON = {
    booking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
    followup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>',
    invoice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/></svg>',
    communication: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    lead: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  };
  function getIcon(type) {
    if (!type) return TL_ICON.communication;
    if (type.startsWith('lead')) return TL_ICON.lead;
    if (type.startsWith('followup') || type === 'followup_created' || type === 'followup_reassigned') return TL_ICON.followup;
    if (type.startsWith('quote')) return TL_ICON.quote;
    if (type.startsWith('invoice') || type.startsWith('payment')) return TL_ICON.invoice;
    if (type === 'booking' || type.startsWith('ro_') || type === 'customer_checked_in') return TL_ICON.booking;
    return TL_ICON.communication;
  }
  function matchType(evType, filter) {
    if (!filter) return true;
    if (filter === 'lead') return evType && evType.startsWith('lead');
    if (filter === 'followup') return evType && (evType.startsWith('followup') || evType === 'manager_coaching_note');
    if (filter === 'quote') return evType && evType.startsWith('quote');
    if (filter === 'invoice') return evType && (evType.startsWith('invoice') || evType.startsWith('payment'));
    if (filter === 'communication') return evType && (evType.startsWith('communication') || evType === 'outreach_sent');
    return true;
  }

  const employees = db.employees();
  let events = db.activityEvents()
    .filter(e => !empId || e.actorId === empId)
    .filter(e => matchType(e.type, typeFilter));
  events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const recent = events.slice(0, 40);

  const feed = mount.querySelector('#team-activity-feed');
  if (!feed) return;
  if (!recent.length) { feed.innerHTML = '<div class="empty-sub">No activity found for the selected filters.</div>'; return; }

  feed.innerHTML = recent.map(e => {
    const actor = employees.find(x => x.id === e.actorId);
    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : (e.actorName || 'System');
    const customer = e.customerId ? db.customerById(e.customerId) : null;
    return `<div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
      <span class="row" style="gap:var(--s2);flex:1;min-width:0">
        <span style="background:var(--canvas);color:var(--ink-3);width:24px;height:24px;border-radius:50%;display:grid;place-items:center;flex-shrink:0">${getIcon(e.type)}</span>
        <span style="min-width:0">
          <span class="strong" style="font-size:var(--t-13)">${e.title || e.type}</span>
          <span class="muted" style="font-size:var(--t-xs)"> · ${actorName}${customer ? ' · ' + util.customerName(customer) : ''}</span>
        </span>
      </span>
      <span class="muted" style="font-size:var(--t-xs);white-space:nowrap;margin-left:var(--s3)">${util.fmtDate(e.createdAt)}</span>
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------
function wireExports(mount, team) {
  mount.querySelector('#team-crm-csv')?.addEventListener('click', () => {
    downloadCSV('team-crm.csv', team.map(r => ({
      employee: `${r.employee.firstName} ${r.employee.lastName}`,
      role: r.employee.role,
      leads: r.assignedLeads,
      customers: r.customers,
      openFollowUps: r.openFollowUps,
      overdue: r.overdueFollowUps,
      quotesSent: r.quotesSent,
      approvals: r.approvals,
      approvalRate: r.approvalRate + '%',
      pipeline: r.pipelineValue,
      lastActivity: r.lastActivity ? util.fmtDate(r.lastActivity) : '',
      status: r.overdueFollowUps > 2 ? 'Behind' : r.overdueFollowUps > 0 ? 'Watch' : 'On track',
    })), [
      { key: 'employee', label: 'Employee' }, { key: 'role', label: 'Role' },
      { key: 'leads', label: 'Leads' }, { key: 'customers', label: 'Customers' },
      { key: 'openFollowUps', label: 'Open Follow-ups' }, { key: 'overdue', label: 'Overdue' },
      { key: 'quotesSent', label: 'Quotes Sent' }, { key: 'approvals', label: 'Approvals' },
      { key: 'approvalRate', label: 'Approval Rate' }, { key: 'pipeline', label: 'Pipeline Value' },
      { key: 'lastActivity', label: 'Last Activity' }, { key: 'status', label: 'Status' },
    ]);
  });
  mount.querySelector('#team-crm-print')?.addEventListener('click', () => {
    printHTML('Team CRM Performance', `
      <table>
        <thead><tr><th>Employee</th><th>Role</th><th>Leads</th><th>Customers</th><th>Overdue</th><th>Quotes</th><th>Rate</th><th>Pipeline</th><th>Status</th></tr></thead>
        <tbody>${team.map(r => `<tr>
          <td>${r.employee.firstName} ${r.employee.lastName}</td>
          <td>${r.employee.role}</td>
          <td>${r.assignedLeads}</td>
          <td>${r.customers}</td>
          <td>${r.overdueFollowUps}</td>
          <td>${r.quotesSent}</td>
          <td>${r.approvalRate}%</td>
          <td>$${r.pipelineValue.toFixed(2)}</td>
          <td>${r.overdueFollowUps > 2 ? 'Behind' : r.overdueFollowUps > 0 ? 'Watch' : 'On track'}</td>
        </tr>`).join('')}</tbody>
      </table>
    `);
  });
  mount.querySelector('#team-crm-copy')?.addEventListener('click', () => {
    copyToClipboard(team.map(r =>
      `${r.employee.firstName} ${r.employee.lastName}  Leads: ${r.assignedLeads}  Overdue: ${r.overdueFollowUps}  Pipeline: $${r.pipelineValue.toFixed(2)}  ${r.overdueFollowUps > 2 ? 'Behind' : r.overdueFollowUps > 0 ? 'Watch' : 'On track'}`
    ).join('\n'));
  });
}

// ---------------------------------------------------------------------------
// Employee CRM detail drawer
// ---------------------------------------------------------------------------
function openEmpDrawer(employeeId) {
  const emp = db.employeeById(employeeId);
  if (!emp) { toast('Employee not found.', 'error'); return; }
  const m = workflow.crmMetricsForEmployee(employeeId);
  const myLeads = workflow.getMyLeads(employeeId).filter(l => !['converted', 'lost'].includes(l.status));
  const myCustomers = workflow.getMyCustomers(employeeId);
  const myFollowUps = db.followUpTasks().filter(t => t.ownerId === employeeId && t.status === 'open').sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const pendingQuotes = db.quotes().filter(q => q.advisorId === employeeId && ['sent', 'viewed', 'partially_approved'].includes(q.status));
  const wonQuotes = db.quotes().filter(q => q.advisorId === employeeId && ['approved', 'partially_approved', 'converted'].includes(q.status));
  const lostQuotes = db.quotes().filter(q => q.advisorId === employeeId && q.status === 'declined');
  const overdueFollowUps = workflow.overdueFollowUpTasks().filter(t => t.ownerId === employeeId);
  const activityEvents = db.activityEvents().filter(e => e.actorId === employeeId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const coachingNotes = activityEvents.filter(e => e.type === 'manager_coaching_note');
  const recentActivity = activityEvents.slice(0, 8);
  const now = Date.now();

  const statusBadge = m.overdueFollowUps > 2 ? 'badge-red' : m.overdueFollowUps > 0 ? 'badge-amber' : 'badge-green';
  const statusLabel = m.overdueFollowUps > 2 ? 'Behind' : m.overdueFollowUps > 0 ? 'Watch' : 'On track';
  const roleName = db.roleById(emp.role)?.name || emp.role;

  openCrmDrawer(`
    <div class="modal-head" style="padding:var(--s5)">
      <div>
        <div style="display:flex;align-items:center;gap:var(--s3);margin-bottom:4px">
          <span style="width:38px;height:38px;border-radius:50%;background:var(--canvas);display:grid;place-items:center;font-size:var(--t-md);font-weight:700;color:var(--ink-3);flex-shrink:0">${emp.firstName.charAt(0)}${emp.lastName.charAt(0)}</span>
          <div>
            <div style="font-size:var(--t-md);font-weight:700;color:var(--ink)">${emp.firstName} ${emp.lastName}</div>
            <div class="muted" style="font-size:var(--t-13)">${roleName} · ${emp.email || 'No email'}</div>
          </div>
        </div>
        <div class="row" style="gap:var(--s2)">
          <span class="badge ${statusBadge}">${statusLabel}</span>
          ${overdueFollowUps.length ? `<span class="badge badge-red">${overdueFollowUps.length} overdue</span>` : ''}
          ${myLeads.length ? `<span class="badge badge-blue">${myLeads.length} lead${myLeads.length === 1 ? '' : 's'}</span>` : ''}
        </div>
      </div>
      <button class="icon-btn" id="close-emp-drawer">${icoX()}</button>
    </div>

    <div style="padding:0 var(--s5) var(--s5);display:flex;flex-direction:column;gap:var(--s4)">

      <!-- Metric summary -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--s3)">
        ${empMetricCard('Leads', m.assignedLeads, `${m.contactedLeads} contacted`)}
        ${empMetricCard('Customers', myCustomers.length, `${myCustomers.length} accounts`)}
        ${empMetricCard('Follow-ups', myFollowUps.length, `${overdueFollowUps.length} overdue`)}
        ${empMetricCard('Quotes Sent', m.quotesSent, `${m.approvalRate}% approval`)}
        ${empMetricCard('Pipeline', util.fmtMoney0(m.pipelineValue), `${pendingQuotes.length} pending`)}
        ${empMetricCard('Won', util.fmtMoney0(m.wonValue), `${wonQuotes.length} won · ${lostQuotes.length} lost`)}
      </div>

      <!-- Actions -->
      <div>
        <div style="font-size:var(--t-xs);font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin-bottom:var(--s2)">Manager Actions</div>
        <div class="row" style="flex-wrap:wrap;gap:var(--s2)">
          <button class="btn btn-secondary btn-sm" id="emp-add-coaching">Add Coaching Note</button>
          <button class="btn btn-secondary btn-sm" id="emp-create-followup">Create Follow-up</button>
          <button class="btn btn-secondary btn-sm" id="emp-reassign-lead" ${!myLeads.length ? 'disabled' : ''}>Reassign Lead</button>
          <button class="btn btn-secondary btn-sm" id="emp-reassign-fu" ${!myFollowUps.length ? 'disabled' : ''}>Reassign Follow-up</button>
          <button class="btn btn-secondary btn-sm" id="emp-print-report">Print Report</button>
          <button class="btn btn-secondary btn-sm" id="emp-export-report">Export CSV</button>
        </div>
      </div>

      <!-- Open leads -->
      ${sectionCard('Open Leads', myLeads.length, myLeads.length ? myLeads.slice(0, 5).map(l => `
        <div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule);cursor:pointer" data-emp-open-lead="${l.id}">
          <div>
            <div class="strong" style="font-size:var(--t-13)">${l.firstName} ${l.lastName}</div>
            <div class="muted" style="font-size:var(--t-xs)">${l.lastContactedAt ? 'Contacted ' + util.fmtDate(l.lastContactedAt) : 'Not contacted'} · ${l.status}</div>
          </div>
          <div class="row" style="gap:var(--s2)">
            <span class="badge ${l.status === 'new' ? 'badge-blue' : l.status === 'contacted' ? 'badge-amber' : 'badge-gray'}">${l.status.replace('_', ' ')}</span>
            <button class="btn btn-secondary btn-sm" data-reassign-lead="${l.id}">Reassign</button>
          </div>
        </div>`).join('') + (myLeads.length > 5 ? `<div class="muted" style="font-size:var(--t-xs);padding-top:var(--s2)">+ ${myLeads.length - 5} more</div>` : '') : '<div class="empty-sub">No open leads.</div>')}

      <!-- Open follow-ups -->
      ${sectionCard('Open Follow-ups', myFollowUps.length, myFollowUps.length ? myFollowUps.slice(0, 5).map(t => {
        const isOverdue = new Date(t.dueAt).getTime() < now;
        const related = t.customerId ? db.customerById(t.customerId) : null;
        return `<div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
          <div>
            <div class="strong" style="font-size:var(--t-13)">${t.title || 'Follow-up'}</div>
            <div class="muted" style="font-size:var(--t-xs)">${isOverdue ? '<span style="color:var(--red)">Overdue</span> · ' : ''}Due ${util.fmtDate(t.dueAt)}${related ? ' · ' + util.customerName(related) : ''}</div>
          </div>
          <div class="row" style="gap:var(--s2)">
            <span class="badge badge-gray">${(t.taskType || 'other').replace(/_/g, ' ')}</span>
            <button class="btn btn-secondary btn-sm" data-reassign-fu="${t.id}">Reassign</button>
          </div>
        </div>`;
      }).join('') + (myFollowUps.length > 5 ? `<div class="muted" style="font-size:var(--t-xs);padding-top:var(--s2)">+ ${myFollowUps.length - 5} more</div>` : '') : '<div class="empty-sub">No open follow-ups.</div>')}

      <!-- Quotes pending -->
      ${sectionCard('Quotes Waiting Approval', pendingQuotes.length, pendingQuotes.length ? pendingQuotes.slice(0, 5).map(q => {
        const c = db.customerById(q.customerId);
        const meta = util.quoteStatusMeta(q.status);
        return `<div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule);cursor:pointer" data-emp-open-quote="${q.id}">
          <div>
            <div class="strong" style="font-size:var(--t-13)">${q.quoteNumber || 'Quote'} · ${c ? util.customerName(c) : 'Unknown'}</div>
            <div class="muted" style="font-size:var(--t-xs)">${q.sentAt ? 'Sent ' + util.fmtDate(q.sentAt) : 'Not sent'}</div>
          </div>
          <span class="row" style="gap:6px"><span class="tnum" style="font-size:var(--t-13)">${util.fmtMoney(q.total)}</span><span class="badge ${meta.badgeClass}">${meta.label}</span></span>
        </div>`;
      }).join('') : '<div class="empty-sub">No quotes waiting approval.</div>')}

      <!-- Coaching notes -->
      ${coachingNotes.length ? `
        <div>
          <div style="font-size:var(--t-xs);font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin-bottom:var(--s2)">Coaching Notes</div>
          ${coachingNotes.slice(0, 3).map(n => `
            <div style="background:var(--canvas);border:1px solid var(--rule);border-radius:var(--r-md);padding:var(--s3) var(--s4);margin-bottom:var(--s2)">
              <div style="font-size:var(--t-13);color:var(--ink);line-height:1.5">${n.description || n.title}</div>
              <div class="muted" style="font-size:var(--t-xs);margin-top:4px">By ${n.actorName || 'Manager'} · ${util.fmtDate(n.createdAt)}</div>
            </div>`).join('')}
        </div>` : ''}

      <!-- Recent activity -->
      ${sectionCard('Recent Activity', recentActivity.length, recentActivity.length ? recentActivity.map(e => `
        <div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)">
          <span style="font-size:var(--t-13)">${e.title || e.type}</span>
          <span class="muted" style="font-size:var(--t-xs);white-space:nowrap">${util.fmtDate(e.createdAt)}</span>
        </div>`).join('') : '<div class="empty-sub">No recent activity.</div>')}

    </div>
  `);

  const drawer = document.getElementById('crm-drawer');
  drawer.querySelector('#close-emp-drawer').addEventListener('click', closeCrmDrawer);

  // Open lead from drawer
  drawer.querySelectorAll('[data-emp-open-lead]').forEach(el => el.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    import('./leads.js').then(m => m.openLeadDrawer(el.dataset.empOpenLead));
  }));
  // Open quote from drawer
  drawer.querySelectorAll('[data-emp-open-quote]').forEach(el => el.addEventListener('click', () => openQuoteDrawer(el.dataset.empOpenQuote)));

  // Inline reassign-lead buttons
  drawer.querySelectorAll('[data-reassign-lead]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    openReassignLeadModal(btn.dataset.reassignLead, () => openEmpDrawer(employeeId));
  }));
  // Inline reassign-followup buttons
  drawer.querySelectorAll('[data-reassign-fu]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    openReassignFollowUpModal(btn.dataset.reassignFu, () => openEmpDrawer(employeeId));
  }));

  // Action buttons
  drawer.querySelector('#emp-add-coaching').addEventListener('click', () => openCoachingNoteModal(employeeId, () => openEmpDrawer(employeeId)));
  drawer.querySelector('#emp-create-followup').addEventListener('click', () => openCreateFollowUpModal(employeeId, () => openEmpDrawer(employeeId)));
  drawer.querySelector('#emp-reassign-lead').addEventListener('click', () => {
    if (!myLeads.length) return;
    openReassignLeadModal(myLeads[0].id, () => openEmpDrawer(employeeId));
  });
  drawer.querySelector('#emp-reassign-fu').addEventListener('click', () => {
    if (!myFollowUps.length) return;
    openReassignFollowUpModal(myFollowUps[0].id, () => openEmpDrawer(employeeId));
  });
  drawer.querySelector('#emp-print-report').addEventListener('click', () => printEmpReport(emp, m, myLeads, myCustomers, myFollowUps, pendingQuotes));
  drawer.querySelector('#emp-export-report').addEventListener('click', () => exportEmpCsv(emp, m, myLeads, myCustomers, myFollowUps, pendingQuotes));
}

function empMetricCard(label, value, sub) {
  return `<div style="background:var(--canvas);border:1px solid var(--rule);border-radius:var(--r-md);padding:var(--s3) var(--s4);text-align:center">
    <div class="tnum" style="font-size:var(--t-lg);font-weight:800;color:var(--ink)">${value}</div>
    <div style="font-size:var(--t-xs);font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">${label}</div>
    <div class="muted" style="font-size:10px">${sub}</div>
  </div>`;
}

function sectionCard(title, count, bodyHtml) {
  return `<div>
    <div style="font-size:var(--t-xs);font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin-bottom:var(--s2);display:flex;align-items:center;gap:var(--s2)">${title}<span class="badge badge-gray" style="font-size:10px">${count}</span></div>
    <div style="border:1px solid var(--rule);border-radius:var(--r-md);overflow:hidden">
      <div style="padding:var(--s2) var(--s4)">${bodyHtml}</div>
    </div>
  </div>`;
}

function printEmpReport(emp, m, leads, customers, followUps, quotes) {
  printHTML(`CRM Report — ${emp.firstName} ${emp.lastName}`, `
    <h2>${emp.firstName} ${emp.lastName} — ${emp.role}</h2>
    <table>
      <tr><td>Assigned Leads</td><td>${m.assignedLeads}</td></tr>
      <tr><td>Contacted Leads</td><td>${m.contactedLeads}</td></tr>
      <tr><td>Customers/Accounts</td><td>${customers.length}</td></tr>
      <tr><td>Open Follow-ups</td><td>${followUps.length}</td></tr>
      <tr><td>Overdue Follow-ups</td><td>${m.overdueFollowUps}</td></tr>
      <tr><td>Quotes Sent</td><td>${m.quotesSent}</td></tr>
      <tr><td>Approvals</td><td>${m.approvals}</td></tr>
      <tr><td>Approval Rate</td><td>${m.approvalRate}%</td></tr>
      <tr><td>Pipeline Value</td><td>$${m.pipelineValue.toFixed(2)}</td></tr>
      <tr><td>Won Value</td><td>$${m.wonValue.toFixed(2)}</td></tr>
    </table>
    <h3>Open Leads</h3>
    ${leads.length ? `<ul>${leads.map(l => `<li>${l.firstName} ${l.lastName} — ${l.status}</li>`).join('')}</ul>` : '<p>None</p>'}
    <h3>Quotes Waiting Approval</h3>
    ${quotes.length ? `<ul>${quotes.map(q => `<li>${q.quoteNumber} — $${(q.total||0).toFixed(2)}</li>`).join('')}</ul>` : '<p>None</p>'}
  `);
}

function exportEmpCsv(emp, m, leads, customers, followUps, quotes) {
  const rows = [
    { metric: 'Assigned Leads', value: m.assignedLeads },
    { metric: 'Contacted Leads', value: m.contactedLeads },
    { metric: 'Customers', value: customers.length },
    { metric: 'Open Follow-ups', value: followUps.length },
    { metric: 'Overdue Follow-ups', value: m.overdueFollowUps },
    { metric: 'Quotes Sent', value: m.quotesSent },
    { metric: 'Approvals', value: m.approvals },
    { metric: 'Approval Rate', value: m.approvalRate + '%' },
    { metric: 'Pipeline Value', value: '$' + m.pipelineValue.toFixed(2) },
    { metric: 'Won Value', value: '$' + m.wonValue.toFixed(2) },
  ];
  downloadCSV(`crm-report-${emp.firstName}-${emp.lastName}.csv`, rows, [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }]);
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------
function openReassignLeadModal(leadId, onDone) {
  const lead = db.leadById(leadId);
  if (!lead) { toast('Lead not found.', 'error'); return; }
  const advisors = db.employees().filter(e => e.employmentStatus === 'active' && !['technician', 'apprentice', 'parts', 'bookkeeper'].includes(e.role));
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-head"><div class="modal-title">Reassign Lead — ${lead.firstName} ${lead.lastName}</div><button class="icon-btn" data-close>${icoX()}</button></div>
      <div class="modal-body">
        <div class="field">
          <label class="label">Assign to</label>
          <select class="select" id="reassign-lead-emp">
            <option value="">Unassign</option>
            ${advisors.map(e => `<option value="${e.id}" ${e.id === lead.assignedAdvisorId ? 'selected' : ''}>${e.firstName} ${e.lastName} (${e.role})</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-foot"><button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" id="reassign-lead-save">Reassign</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#reassign-lead-save').addEventListener('click', () => {
    const empId = overlay.querySelector('#reassign-lead-emp').value || null;
    try {
      workflow.assignLeadOwner(leadId, empId);
      const emp = empId ? db.employeeById(empId) : null;
      workflow.recordWorkflowEvent('lead', leadId, 'manager_reassignment', emp ? `Lead reassigned to ${emp.firstName} ${emp.lastName}` : 'Lead unassigned', { leadId, customerId: lead.customerId || null, metadata: { by: db.settings().currentUserId } });
      toast('Lead reassigned.', 'success');
      close();
      if (onDone) onDone();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function openReassignFollowUpModal(taskId, onDone) {
  const task = db.followUpTasks().find(t => t.id === taskId);
  if (!task) { toast('Follow-up not found.', 'error'); return; }
  const advisors = db.employees().filter(e => e.employmentStatus === 'active' && !['technician', 'apprentice', 'parts', 'bookkeeper'].includes(e.role));
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-head"><div class="modal-title">Reassign Follow-up — ${task.title || 'Follow-up'}</div><button class="icon-btn" data-close>${icoX()}</button></div>
      <div class="modal-body">
        <div class="field">
          <label class="label">Assign to</label>
          <select class="select" id="reassign-fu-emp">
            <option value="">Unassign</option>
            ${advisors.map(e => `<option value="${e.id}" ${e.id === task.ownerId ? 'selected' : ''}>${e.firstName} ${e.lastName} (${e.role})</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-foot"><button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" id="reassign-fu-save">Reassign</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#reassign-fu-save').addEventListener('click', () => {
    const empId = overlay.querySelector('#reassign-fu-emp').value || null;
    try {
      workflow.reassignFollowUp(taskId, empId);
      toast('Follow-up reassigned.', 'success');
      close();
      if (onDone) onDone();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function openCoachingNoteModal(employeeId, onDone) {
  const emp = db.employeeById(employeeId);
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div class="modal-head"><div class="modal-title">Coaching Note — ${emp ? emp.firstName + ' ' + emp.lastName : 'Employee'}</div><button class="icon-btn" data-close>${icoX()}</button></div>
      <div class="modal-body">
        <div class="field">
          <label class="label">Note</label>
          <textarea class="textarea" id="coaching-note-text" rows="4" placeholder="Coaching observations, goals, or feedback…"></textarea>
        </div>
        <div class="muted" style="font-size:var(--t-xs);margin-top:var(--s2)">Recorded in activity log. Not visible to the employee in this version.</div>
      </div>
      <div class="modal-foot"><button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" id="coaching-note-save">Save Note</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#coaching-note-save').addEventListener('click', () => {
    const text = overlay.querySelector('#coaching-note-text').value.trim();
    if (!text) { toast('Enter a note.', 'error'); return; }
    workflow.recordWorkflowEvent('employee', employeeId, 'manager_coaching_note', `Coaching note for ${emp ? emp.firstName : 'employee'}`, { description: text, metadata: { targetEmployeeId: employeeId, by: db.settings().currentUserId } });
    toast('Coaching note saved.', 'success');
    close();
    if (onDone) onDone();
  });
}

function openCreateFollowUpModal(forEmployeeId, onDone) {
  const emp = db.employeeById(forEmployeeId);
  const customers = db.customers().sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''));
  const leads = db.leads().filter(l => !['converted', 'lost'].includes(l.status));
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-head"><div class="modal-title">Create Follow-up${emp ? ' for ' + emp.firstName : ''}</div><button class="icon-btn" data-close>${icoX()}</button></div>
      <div class="modal-body">
        <div class="field"><label class="label">Title</label><input class="input" id="cfu-title" placeholder="What needs to happen?"></div>
        <div class="grid-2">
          <div class="field">
            <label class="label">Type</label>
            <select class="select" id="cfu-type">
              ${workflow.FOLLOWUP_TASK_TYPES.map(t => `<option value="${t}">${t.replace(/_/g, ' ')}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label class="label">Due date</label><input class="input" type="date" id="cfu-due" value="${new Date(Date.now() + 3*86400000).toISOString().slice(0,10)}"></div>
        </div>
        <div class="field">
          <label class="label">Customer (optional)</label>
          <select class="select" id="cfu-customer">
            <option value="">No customer</option>
            ${customers.map(c => `<option value="${c.id}">${util.customerName(c)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label class="label">Notes</label><textarea class="textarea" id="cfu-notes" rows="2"></textarea></div>
      </div>
      <div class="modal-foot"><button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" id="cfu-save">Create</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#cfu-save').addEventListener('click', () => {
    const title = overlay.querySelector('#cfu-title').value.trim();
    const due = overlay.querySelector('#cfu-due').value;
    if (!title || !due) { toast('Title and due date required.', 'error'); return; }
    try {
      workflow.createFollowUpTask({
        title,
        taskType: overlay.querySelector('#cfu-type').value,
        dueAt: new Date(due + 'T12:00:00').toISOString(),
        ownerId: forEmployeeId,
        customerId: overlay.querySelector('#cfu-customer').value || null,
        notes: overlay.querySelector('#cfu-notes').value.trim(),
        createdByEmployeeId: db.settings().currentUserId,
      });
      toast('Follow-up created.', 'success');
      close();
      if (onDone) onDone();
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ---------------------------------------------------------------------------
// Drill-down drawers (overview card clicks)
// ---------------------------------------------------------------------------
function openDrillDrawer(drill, team, overview) {
  let title = '';
  let html = '';

  if (drill === 'open-leads') {
    title = `Open Leads (${overview.openLeads.length})`;
    html = overview.openLeads.length ? overview.openLeads.map(l => {
      const owner = l.assignedAdvisorId ? db.employeeById(l.assignedAdvisorId) : null;
      return `<div class="row between" style="padding:var(--s3) 0;border-bottom:1px solid var(--rule)">
        <div>
          <div class="strong">${l.firstName} ${l.lastName}</div>
          <div class="muted" style="font-size:var(--t-13)">Owner: ${owner ? owner.firstName + ' ' + owner.lastName : '<span style="color:var(--amber)">Unassigned</span>'} · ${l.status}</div>
        </div>
        <div class="row" style="gap:var(--s2)">
          <span class="badge ${l.status === 'new' ? 'badge-blue' : l.status === 'contacted' ? 'badge-amber' : 'badge-gray'}">${l.status.replace('_', ' ')}</span>
          <button class="btn btn-secondary btn-sm" data-drill-open-lead="${l.id}">Open</button>
        </div>
      </div>`;
    }).join('') : '<div class="empty-sub">No open leads.</div>';
  } else if (drill === 'overdue-followups') {
    title = `Overdue Follow-ups (${overview.overdue.length})`;
    html = overview.overdue.length ? overview.overdue.map(t => {
      const owner = t.ownerId ? db.employeeById(t.ownerId) : null;
      const customer = t.customerId ? db.customerById(t.customerId) : null;
      return `<div class="row between" style="padding:var(--s3) 0;border-bottom:1px solid var(--rule)">
        <div>
          <div class="strong">${t.title || 'Follow-up'}</div>
          <div class="muted" style="font-size:var(--t-13)">${owner ? owner.firstName + ' ' + owner.lastName : 'Unassigned'} · <span style="color:var(--red)">Overdue</span> ${util.fmtDate(t.dueAt)}${customer ? ' · ' + util.customerName(customer) : ''}</div>
        </div>
        <span class="badge badge-gray">${(t.taskType || 'other').replace(/_/g, ' ')}</span>
      </div>`;
    }).join('') : '<div class="empty-sub">No overdue follow-ups.</div>';
  } else if (drill === 'pending-quotes') {
    title = `Quotes Waiting Approval (${overview.pendingQuotes.length})`;
    html = overview.pendingQuotes.length ? overview.pendingQuotes.map(q => {
      const c = db.customerById(q.customerId);
      const owner = q.advisorId ? db.employeeById(q.advisorId) : null;
      const meta = util.quoteStatusMeta(q.status);
      return `<div class="row between" style="padding:var(--s3) 0;border-bottom:1px solid var(--rule);cursor:pointer" data-drill-open-quote="${q.id}">
        <div>
          <div class="strong">${q.quoteNumber || 'Quote'}</div>
          <div class="muted" style="font-size:var(--t-13)">${c ? util.customerName(c) : 'Unknown'} · ${owner ? owner.firstName + ' ' + owner.lastName : 'Unassigned'}</div>
        </div>
        <span class="row" style="gap:6px"><span class="tnum">${util.fmtMoney(q.total)}</span><span class="badge ${meta.badgeClass}">${meta.label}</span></span>
      </div>`;
    }).join('') : '<div class="empty-sub">No quotes waiting approval.</div>';
  } else if (drill === 'stale-leads') {
    title = `Stale Leads — 7+ Days No Contact (${overview.stale.length})`;
    html = overview.stale.length ? overview.stale.map(l => {
      const owner = l.assignedAdvisorId ? db.employeeById(l.assignedAdvisorId) : null;
      const lastTouch = l.lastContactedAt || l.createdAt;
      const daysSince = Math.floor((Date.now() - new Date(lastTouch).getTime()) / 86400000);
      return `<div class="row between" style="padding:var(--s3) 0;border-bottom:1px solid var(--rule)">
        <div>
          <div class="strong">${l.firstName} ${l.lastName}</div>
          <div class="muted" style="font-size:var(--t-13)">${owner ? owner.firstName + ' ' + owner.lastName : '<span style="color:var(--amber)">Unassigned</span>'} · No contact in ${daysSince} days</div>
        </div>
        <div class="row" style="gap:var(--s2)">
          <span class="badge badge-amber">${daysSince}d stale</span>
          <button class="btn btn-secondary btn-sm" data-drill-reassign-lead="${l.id}">Reassign</button>
        </div>
      </div>`;
    }).join('') : '<div class="empty-sub">No stale leads.</div>';
  } else if (drill === 'won-quotes') {
    title = `Won Quotes (${overview.wonQuotes.length})`;
    html = overview.wonQuotes.length ? overview.wonQuotes.map(q => {
      const c = db.customerById(q.customerId);
      const owner = q.advisorId ? db.employeeById(q.advisorId) : null;
      const val = (q.lineItems || []).filter(l => l.status === 'approved').reduce((s, l) => s + (l.total || 0), 0);
      return `<div class="row between" style="padding:var(--s3) 0;border-bottom:1px solid var(--rule)">
        <div>
          <div class="strong">${q.quoteNumber || 'Quote'}</div>
          <div class="muted" style="font-size:var(--t-13)">${c ? util.customerName(c) : 'Unknown'} · ${owner ? owner.firstName + ' ' + owner.lastName : 'Unassigned'}</div>
        </div>
        <span class="tnum" style="color:var(--green);font-weight:700">${util.fmtMoney(val || q.total)}</span>
      </div>`;
    }).join('') : '<div class="empty-sub">No won quotes.</div>';
  } else if (drill === 'unassigned-leads') {
    title = `Unassigned Leads (${overview.unassigned.length})`;
    const advisors = db.employees().filter(e => e.employmentStatus === 'active' && !['technician', 'apprentice', 'parts', 'bookkeeper'].includes(e.role));
    html = overview.unassigned.length ? overview.unassigned.map(l => `
      <div class="row between" style="padding:var(--s3) 0;border-bottom:1px solid var(--rule)">
        <div>
          <div class="strong">${l.firstName} ${l.lastName}</div>
          <div class="muted" style="font-size:var(--t-13)">${l.phone || 'No phone'} · ${util.timeAgo(l.createdAt)}</div>
        </div>
        <div class="row" style="gap:var(--s2)" data-stop-row>
          <select class="select" data-assign-lead="${l.id}" style="font-size:var(--t-13);padding:4px 8px;height:auto">
            <option value="">Assign to…</option>
            ${advisors.map(e => `<option value="${e.id}">${e.firstName} ${e.lastName}</option>`).join('')}
          </select>
        </div>
      </div>`).join('') : '<div class="empty-sub">No unassigned leads.</div>';
  } else if (drill === 'declined-work') {
    title = `Declined Work (${overview.declinedCandidates.length} customers)`;
    html = overview.declinedCandidates.length ? overview.declinedCandidates.filter(d => d.customer).map(d => `
      <div class="row between" style="padding:var(--s3) 0;border-bottom:1px solid var(--rule)">
        <div>
          <div class="strong">${util.customerName(d.customer)}</div>
          <div class="muted" style="font-size:var(--t-13)">${d.items.map(i => i.label || 'Declined item').join(', ')}</div>
        </div>
        <span class="tnum" style="color:var(--red);font-weight:700">${util.fmtMoney0(d.declinedValue)}</span>
      </div>`).join('') : '<div class="empty-sub">No declined-work candidates.</div>';
  }

  openCrmDrawer(`
    <div class="modal-head" style="padding:var(--s5)">
      <div class="modal-title">${title}</div>
      <button class="icon-btn" id="close-drill-drawer">${icoX()}</button>
    </div>
    <div style="padding:0 var(--s5) var(--s5)">${html}</div>
  `);

  const drawer = document.getElementById('crm-drawer');
  drawer.querySelector('#close-drill-drawer').addEventListener('click', closeCrmDrawer);
  drawer.querySelectorAll('[data-drill-open-lead]').forEach(btn => btn.addEventListener('click', () => import('./leads.js').then(m => m.openLeadDrawer(btn.dataset.drillOpenLead))));
  drawer.querySelectorAll('[data-drill-open-quote]').forEach(el => el.addEventListener('click', e => { if (!e.target.closest('button')) openQuoteDrawer(el.dataset.drillOpenQuote); }));
  drawer.querySelectorAll('[data-drill-reassign-lead]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    openReassignLeadModal(btn.dataset.drillReassignLead, () => openDrillDrawer(drill, team, overview));
  }));
  drawer.querySelectorAll('[data-assign-lead]').forEach(sel => sel.addEventListener('change', () => {
    if (!sel.value) return;
    workflow.assignLeadOwner(sel.dataset.assignLead, sel.value);
    toast('Lead assigned.', 'success');
    openDrillDrawer(drill, team, buildOverviewMetrics(buildTeamRows()));
  }));
}

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------
function iconUsers() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>'; }
function iconClock() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'; }
function iconDoc() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>'; }
function iconAlert() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>'; }
function iconTrend() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l6-6 4 4 8-8"/></svg>'; }
function iconCheck() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>'; }
function iconWarn() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'; }
function iconWrench() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>'; }
function icoX() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'; }
