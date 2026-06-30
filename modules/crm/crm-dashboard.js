// AutoBook — modules/crm/crm-dashboard.js (§C, CRM redesign)
// Owner/Manager Command Center: stat rows (high-value, declined-work value,
// due-for-service, unassigned/stale leads, overdue follow-ups, pipeline
// value) + Follow-Up Center (real candidates, now opens the real Outreach
// panel) + team performance table + a global activity timeline merged
// across all customers. Only rendered for manager-tier roles — see
// crm-app.js's isManagerView().
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import * as workflow from '../../lib/workflow.js';
import { openOutreachPanel } from './outreach.js';
import { openCrmDrawer, closeCrmDrawer } from './crm-app.js';

export function renderCrmDashboard(mount) {
  const leads = db.leads();
  const bySource = {};
  leads.forEach((l) => { bySource[l.source] = (bySource[l.source] || 0) + 1; });

  const highValue = db.segmentMembers('seg_high_value').length;
  const declinedCustomers = db.segmentMembers('seg_declined');
  const declinedValue = workflow.getDeclinedWorkCandidates().reduce((s, d) => s + d.declinedValue, 0);
  const dueService = new Set([...db.segmentMembers('seg_due_oil'), ...db.segmentMembers('seg_due_tire')].map((c) => c.id)).size;
  const unassigned = workflow.unassignedLeads();
  const stale = workflow.staleLeads();
  const overdue = workflow.overdueFollowUpTasks();
  const pendingQuotes = db.quotes().filter((q) => ['sent', 'viewed', 'partially_approved'].includes(q.status));
  const pipelineValue = pendingQuotes.reduce((s, q) => s + (q.total || 0), 0);
  const team = workflow.crmTeamMetrics();

  mount.innerHTML = `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card" style="cursor:pointer" data-drill="high-value">
        <div class="stat-head"><span class="stat-icon purple">${iconStar()}</span><span class="stat-label">High-Value Customers <span class="badge badge-amber" style="font-size:10px;margin-left:4px">assumption</span></span></div>
        <div class="stat-value">${highValue}</div>
        <div class="stat-sub">$400+ lifetime invoiced — tap to view</div>
      </div>
      <div class="stat-card" style="cursor:pointer" data-drill="declined-work">
        <div class="stat-head"><span class="stat-icon red">${iconAlert()}</span><span class="stat-label">Declined Work</span></div>
        <div class="stat-value tnum">${util.fmtMoney0(declinedValue)}</div>
        <div class="stat-sub">${declinedCustomers.length} customer${declinedCustomers.length === 1 ? '' : 's'} — tap to view</div>
      </div>
      <div class="stat-card" style="cursor:pointer" data-drill="due-service">
        <div class="stat-head"><span class="stat-icon amber">${iconWrench()}</span><span class="stat-label">Due for Service</span></div>
        <div class="stat-value">${dueService}</div>
        <div class="stat-sub">oil change or tire rotation — tap to view</div>
      </div>
    </div>
    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card" style="cursor:pointer" data-drill="unassigned-leads">
        <div class="stat-head"><span class="stat-icon ${unassigned.length ? 'amber' : 'green'}">${iconUsers()}</span><span class="stat-label">Unassigned Leads</span></div>
        <div class="stat-value">${unassigned.length}</div>
        <div class="stat-sub">${stale.length} stale — tap to assign</div>
      </div>
      <div class="stat-card" style="cursor:pointer" data-drill="overdue-followups">
        <div class="stat-head"><span class="stat-icon ${overdue.length ? 'red' : 'green'}">${iconClock()}</span><span class="stat-label">Overdue Follow-ups</span></div>
        <div class="stat-value">${overdue.length}</div>
        <div class="stat-sub">across the whole team — tap to view</div>
      </div>
      <div class="stat-card" style="cursor:pointer" data-drill="pipeline">
        <div class="stat-head"><span class="stat-icon blue">${iconTrend()}</span><span class="stat-label">Pipeline Value</span></div>
        <div class="stat-value tnum">${util.fmtMoney0(pipelineValue)}</div>
        <div class="stat-sub">${pendingQuotes.length} quote${pendingQuotes.length === 1 ? '' : 's'} — tap to view</div>
      </div>
    </div>

    <div class="crm-grid" style="margin-bottom:var(--s4)">
      <div class="card">
        <div class="card-head"><div class="card-title">Follow-Up Center</div><span class="badge badge-gray">actions are placeholders</span></div>
        <div class="card-body" id="followup-list"></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Leads by source</div></div>
        <div class="card-body">
          ${Object.keys(bySource).length
            ? Object.entries(bySource).map(([src, count]) => `
              <div style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
                <div class="row between"><span>${sourceLabel(src)}</span><span class="badge badge-blue">${count}</span></div>
                <div class="crm-bar-track"><div class="crm-bar-fill" style="width:${(count / leads.length) * 100}%"></div></div>
              </div>`).join('')
            : '<div class="empty-sub">No leads yet.</div>'}
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Team performance</div></div>
      <div class="card-body" style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>Employee</th><th>Role</th><th class="num">Leads</th><th class="num">Contacted</th><th class="num">Overdue</th><th class="num">Quotes Sent</th><th class="num">Approval Rate</th><th class="num">Won Value</th><th class="num">Pipeline</th><th>Status</th></tr></thead>
          <tbody>
            ${team.length ? team.map((row) => `
              <tr>
                <td class="strong">${row.employee.firstName} ${row.employee.lastName}</td>
                <td>${db.roleById(row.employee.role)?.name || row.employee.role}</td>
                <td class="num">${row.assignedLeads}</td>
                <td class="num">${row.contactedLeads}</td>
                <td class="num">${row.overdueFollowUps}</td>
                <td class="num">${row.quotesSent}</td>
                <td class="num">${row.approvalRate}%</td>
                <td class="num">${util.fmtMoney0(row.wonValue)}</td>
                <td class="num">${util.fmtMoney0(row.pipelineValue)}</td>
                <td><span class="badge ${row.statusBadge}">${row.overdueFollowUps > 2 ? 'Behind' : row.overdueFollowUps > 0 ? 'Watch' : 'On track'}</span></td>
              </tr>`).join('') : `<tr><td colspan="10"><div class="empty-sub">No sales-role employees on file.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">Recent activity</div></div>
      <div class="card-body" id="crm-activity"></div>
    </div>
  `;

  renderFollowUps();
  renderActivity();

  mount.querySelectorAll('[data-drill]').forEach((card) => card.addEventListener('click', () => {
    const drill = card.dataset.drill;
    if (drill === 'high-value') drillHighValue();
    else if (drill === 'declined-work') drillDeclinedWork();
    else if (drill === 'due-service') drillDueService();
    else if (drill === 'unassigned-leads') drillUnassignedLeads();
    else if (drill === 'overdue-followups') drillOverdueFollowUps();
    else if (drill === 'pipeline') drillPipeline();
  }));
}

const TL_ICON = {
  booking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
  repair_order: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="M9 11h6M9 15h6"/></svg>',
  invoice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/><path d="M9 7h6M9 11h6"/></svg>',
  communication: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
  quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>',
};

// Global feed: merges every customer's timeline, newest first. Real data —
// same events the per-customer drawer shows, just aggregated across everyone.
function renderActivity() {
  const events = db.customers().flatMap((c) => db.customerTimeline(c.id).map((e) => ({ ...e, customer: c })));
  events.sort((a, b) => new Date(b.at) - new Date(a.at));
  const recent = events.slice(0, 8);
  document.getElementById('crm-activity').innerHTML = recent.length
    ? recent.map((e) => `
      <div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
        <span class="row" style="gap:var(--s2)">
          <span class="insight-bubble" style="background:var(--canvas);color:var(--ink-3);width:26px;height:26px">${TL_ICON[e.type] || ''}</span>
          <span>${e.label} <span class="muted">· ${util.customerName(e.customer)}</span></span>
        </span>
        <span class="muted" style="font-size:var(--t-13)">${util.fmtDate(e.at)}</span>
      </div>`).join('')
    : '<div class="empty-sub">No activity yet.</div>';
}

// Real candidates (leads due for follow-up, declined-service / inactive /
// due-for-service customers). Quote rows still send the manager to the
// Quotes page (acting on a quote belongs there); everything else opens the
// real Outreach panel (email/text preview, call task, campaign enrollment).
function renderFollowUps() {
  const leads = db.leads();
  const dueLeads = leads.filter((l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt) <= new Date() && !['converted', 'lost'].includes(l.status));
  const declinedCustomers = db.segmentMembers('seg_declined').slice(0, 3);
  const inactiveCustomers = db.segmentMembers('seg_inactive').slice(0, 3);
  const dueServiceCustomers = db.segmentMembers('seg_due_oil').slice(0, 3);

  const quoteFollowUps = util.quotesNeedingFollowUp().slice(0, 3).map((q) => ({
    name: `${util.customerName(db.customerById(q.customerId))} — ${q.quoteNumber}`,
    reason: q.status === 'declined' ? 'Quote declined — win-back opportunity' : `Quote waiting approval (${util.quoteStatusMeta(q.status).label.toLowerCase()})`,
    action: 'Open quote', href: 'quotes.html',
  }));

  const rows = [
    ...dueLeads.map((l) => ({ name: `${l.firstName} ${l.lastName}`, reason: 'Call customer — follow-up due', action: 'Outreach', lead: l })),
    ...quoteFollowUps,
    ...declinedCustomers.map((c) => ({ name: util.customerName(c), reason: 'Declined-service follow-up', action: 'Outreach', customer: c })),
    ...dueServiceCustomers.map((c) => ({ name: util.customerName(c), reason: 'Maintenance reminder due', action: 'Outreach', customer: c })),
    ...inactiveCustomers.map((c) => ({ name: util.customerName(c), reason: 'Win back inactive customer', action: 'Outreach', customer: c })),
  ];

  document.getElementById('followup-list').innerHTML = rows.length
    ? rows.map((r, i) => `
      <div class="followup-row">
        <div>
          <div class="strong" style="color:var(--ink)">${r.name}</div>
          <div class="muted" style="font-size:var(--t-13)">${r.reason}</div>
        </div>
        ${r.href ? `<a class="btn btn-secondary btn-sm" href="${r.href}">${r.action}</a>` : `<button class="btn btn-secondary btn-sm" data-followup="${i}">${r.action}</button>`}
      </div>`).join('')
    : '<div class="empty-sub">Nothing due right now.</div>';

  document.querySelectorAll('[data-followup]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = rows[Number(btn.dataset.followup)];
      openOutreachPanel(row.lead ? { lead: row.lead } : { customer: row.customer });
    });
  });
}

// ---------------------------------------------------------------------------
// Drill-down drawers — one per metric card
// ---------------------------------------------------------------------------

function drawerHeader(title, count) {
  return `
    <div class="modal-head" style="padding:var(--s5)">
      <div><div class="modal-title">${title}</div>${count != null ? `<div class="muted" style="font-size:var(--t-13)">${count} record${count === 1 ? '' : 's'}</div>` : ''}</div>
      <button class="icon-btn" id="close-drill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>`;
}
function wireDrillClose() {
  document.getElementById('close-drill')?.addEventListener('click', closeCrmDrawer);
}
function wireCustomerRows(mount) {
  mount.querySelectorAll('[data-drill-customer]').forEach((row) => row.addEventListener('click', (e) => {
    if (e.target.closest('[data-stop-row]')) return;
    import('./customers.js').then((m) => m.openCustomerDrawer(row.dataset.drillCustomer));
  }));
}
function wireLeadRows(mount) {
  mount.querySelectorAll('[data-drill-lead]').forEach((row) => row.addEventListener('click', (e) => {
    if (e.target.closest('[data-stop-row]')) return;
    import('./leads.js').then((m) => m.openLeadDrawer(row.dataset.drillLead));
  }));
}
function wireFollowUpRows(mount) {
  mount.querySelectorAll('[data-drill-fu]').forEach((row) => row.addEventListener('click', () => {
    import('./crm-drawers.js').then((m) => m.openFollowUpDrawer(row.dataset.drillFu));
  }));
}
function wireQuoteRows(mount) {
  mount.querySelectorAll('[data-drill-quote]').forEach((row) => row.addEventListener('click', (e) => {
    if (e.target.closest('[data-stop-row]')) return;
    import('./crm-drawers.js').then((m) => m.openQuoteDrawer(row.dataset.drillQuote));
  }));
}

function drillHighValue() {
  const customers = db.segmentMembers('seg_high_value');
  const employees = db.employees();
  const empName = (id) => { const e = employees.find((x) => x.id === id); return e ? `${e.firstName} ${e.lastName}` : 'Unassigned'; };
  const html = customers.length ? customers.map((c) => {
    const ltv = util.customerLifetimeValue(c.id);
    const ownerId = workflow.customerOwnerId(c);
    const nextActions = workflow.nextBestActionsForCustomer(c);
    return `<div class="cust-row" style="cursor:pointer;flex-wrap:wrap;gap:var(--s2)" data-drill-customer="${c.id}">
      <div style="flex:1;min-width:0">
        <div class="strong">${util.customerName(c)}</div>
        <div class="muted" style="font-size:var(--t-13)">${c.phone || 'No phone'}${c.email ? ' · ' + c.email : ''}</div>
        ${nextActions.length ? `<div class="muted" style="font-size:var(--t-13);margin-top:2px">Next: ${nextActions[0].recommendation}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="tnum strong">${util.fmtMoney(ltv)}</div>
        <div class="muted" style="font-size:var(--t-13)">${empName(ownerId)}</div>
      </div>
    </div>`;
  }).join('') : '<div class="empty-sub">No high-value customers yet. Rule: $400+ lifetime invoiced.</div>';

  openCrmDrawer(drawerHeader('High-Value Customers', customers.length) +
    `<div style="padding:0 var(--s5) var(--s5)">
      <div class="alert alert-amber" style="margin-bottom:var(--s4);font-size:var(--t-13)">Rule: lifetime invoiced ≥ $400 (MVP assumption cutoff — not a configurable setting yet).</div>
      ${html}
    </div>`);
  wireDrillClose();
  wireCustomerRows(document.getElementById('crm-drawer'));
}

function drillDeclinedWork() {
  const candidates = workflow.getDeclinedWorkCandidates();
  const html = candidates.length ? candidates.map((d) => {
    const c = d.customer;
    if (!c) return '';
    const vehicles = db.vehiclesForCustomer(c.id);
    const vehicle = vehicles[0];
    const ownerId = workflow.customerOwnerId(c);
    const employees = db.employees();
    const empName = (id) => { const e = employees.find((x) => x.id === id); return e ? `${e.firstName} ${e.lastName}` : 'Unassigned'; };
    const openFU = workflow.openFollowUpTasks().find((t) => t.customerId === c.id && t.taskType === 'declined_work');
    return `<div class="cust-row" style="cursor:pointer;flex-direction:column;align-items:flex-start;gap:var(--s2)" data-drill-customer="${c.id}">
      <div class="row between" style="width:100%">
        <div class="strong">${util.customerName(c)}</div>
        <span class="tnum strong">${util.fmtMoney0(d.declinedValue)}</span>
      </div>
      <div class="muted" style="font-size:var(--t-13)">${vehicle ? util.vehicleLabel(vehicle) : 'No vehicle on file'} · Owner: ${empName(ownerId)}</div>
      <div class="muted" style="font-size:var(--t-13)">${d.items.map((i) => i.label || 'Declined item').join(', ')}</div>
      ${openFU ? `<div class="muted" style="font-size:var(--t-13)">Follow-up: ${util.fmtDate(openFU.dueAt)}</div>` : '<div class="muted" style="font-size:var(--t-13)">No follow-up scheduled</div>'}
      <div class="row" style="gap:var(--s2)" data-stop-row>
        <button class="btn btn-secondary btn-sm" data-outreach-declined="${c.id}">Outreach</button>
      </div>
    </div>`;
  }).join('') : '<div class="empty-sub">No declined-work candidates on record.</div>';

  openCrmDrawer(drawerHeader('Declined Work Follow-ups', candidates.length) +
    `<div style="padding:0 var(--s5) var(--s5)">${html}</div>`);
  wireDrillClose();
  const drawer = document.getElementById('crm-drawer');
  wireCustomerRows(drawer);
  drawer.querySelectorAll('[data-outreach-declined]').forEach((btn) => btn.addEventListener('click', () => {
    const c = db.customerById(btn.dataset.outreachDeclined);
    if (c) openOutreachPanel({ customer: c });
  }));
}

function drillDueService() {
  const oilCustomers = db.segmentMembers('seg_due_oil');
  const tireCustomers = db.segmentMembers('seg_due_tire');
  const seenIds = new Set();
  const combined = [...oilCustomers.map((c) => ({ c, reason: 'Oil change due' })), ...tireCustomers.map((c) => ({ c, reason: 'Tire rotation due' }))].filter(({ c }) => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });
  const employees = db.employees();
  const empName = (id) => { const e = employees.find((x) => x.id === id); return e ? `${e.firstName} ${e.lastName}` : 'Unassigned'; };

  const html = combined.length ? combined.map(({ c, reason }) => {
    const vehicles = db.vehiclesForCustomer(c.id);
    const vehicle = vehicles[0];
    const timeline = db.customerTimeline(c.id);
    const lastVisit = timeline[0];
    const ownerId = workflow.customerOwnerId(c);
    return `<div class="cust-row" style="cursor:pointer;flex-direction:column;align-items:flex-start;gap:var(--s2)" data-drill-customer="${c.id}">
      <div class="row between" style="width:100%">
        <div class="strong">${util.customerName(c)}</div>
        <span class="badge badge-amber">${reason}</span>
      </div>
      <div class="muted" style="font-size:var(--t-13)">${vehicle ? util.vehicleLabel(vehicle) : 'No vehicle'} · ${empName(ownerId)}</div>
      <div class="muted" style="font-size:var(--t-13)">Last service: ${lastVisit ? util.fmtDate(lastVisit.at) : 'No service history'}</div>
      <div data-stop-row><button class="btn btn-secondary btn-sm" data-outreach-service="${c.id}">Send reminder</button></div>
    </div>`;
  }).join('') : '<div class="empty-sub">No customers currently due for service.</div>';

  openCrmDrawer(drawerHeader('Due for Service', combined.length) +
    `<div style="padding:0 var(--s5) var(--s5)">${html}</div>`);
  wireDrillClose();
  const drawer = document.getElementById('crm-drawer');
  wireCustomerRows(drawer);
  drawer.querySelectorAll('[data-outreach-service]').forEach((btn) => btn.addEventListener('click', () => {
    const c = db.customerById(btn.dataset.outreachService);
    if (c) openOutreachPanel({ customer: c });
  }));
}

function drillUnassignedLeads() {
  const leads = workflow.unassignedLeads().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const advisors = db.employees().filter((e) => !['technician', 'apprentice', 'parts'].includes(e.role));
  const me = db.employeeById(db.settings().currentUserId);

  const html = leads.length ? leads.map((l) => {
    const ageMs = Date.now() - new Date(l.createdAt).getTime();
    const stale = ageMs > 7 * 86400000;
    return `<div class="lead-card" style="cursor:pointer" data-drill-lead="${l.id}">
      <div class="lc-head">
        <div>
          <div class="lc-name">${l.firstName} ${l.lastName}</div>
          <div class="lc-sub">${l.phone || 'No phone'}${l.email ? ' · ' + l.email : ''}</div>
        </div>
        <span class="badge ${stale ? 'badge-red' : 'badge-amber'}">Unassigned${stale ? ' · Stale' : ''}</span>
      </div>
      <div class="lc-sub">${(l.serviceInterest || []).join(', ') || 'No service interest noted'}</div>
      <div class="lc-meta">
        <span class="badge badge-gray">${sourceLabel(l.source)}</span>
        <span class="badge badge-gray">${util.timeAgo(l.createdAt)}</span>
        ${l.priority === 'high' ? '<span class="badge badge-red">High priority</span>' : ''}
      </div>
      <div class="lc-actions" data-stop-row>
        <select class="select" data-assign-lead="${l.id}" style="width:auto;font-size:var(--t-13)">
          <option value="">Assign to…</option>
          ${advisors.map((e) => `<option value="${e.id}">${e.firstName} ${e.lastName}</option>`).join('')}
        </select>
        ${me ? `<button class="btn btn-secondary btn-sm" data-claim-lead="${l.id}">Assign to me</button>` : ''}
      </div>
    </div>`;
  }).join('') : '<div class="empty-sub">No unassigned leads — great!</div>';

  openCrmDrawer(drawerHeader('Unassigned Leads', leads.length) +
    `<div style="padding:0 var(--s5) var(--s5)">${html}</div>`);
  wireDrillClose();
  const drawer = document.getElementById('crm-drawer');
  wireLeadRows(drawer);
  drawer.querySelectorAll('[data-assign-lead]').forEach((sel) => sel.addEventListener('change', () => {
    if (!sel.value) return;
    workflow.assignLeadOwner(sel.dataset.assignLead, sel.value);
    import('../../lib/nav.js').then((m) => m.toast('Lead assigned.', 'success'));
    drillUnassignedLeads();
  }));
  drawer.querySelectorAll('[data-claim-lead]').forEach((btn) => btn.addEventListener('click', () => {
    workflow.assignLeadOwner(btn.dataset.claimLead, me.id);
    import('../../lib/nav.js').then((m) => m.toast('Lead assigned to you.', 'success'));
    drillUnassignedLeads();
  }));
}

function drillOverdueFollowUps() {
  const tasks = workflow.overdueFollowUpTasks().sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const employees = db.employees();
  const empName = (id) => { const e = employees.find((x) => x.id === id); return e ? `${e.firstName} ${e.lastName}` : 'Unassigned'; };
  const relName = (t) => {
    if (t.customerId) { const c = db.customerById(t.customerId); return c ? util.customerName(c) : null; }
    if (t.relatedType === 'lead' && t.relatedId) { const l = db.leadById(t.relatedId); return l ? `${l.firstName} ${l.lastName}` : null; }
    return null;
  };

  const html = tasks.length ? tasks.map((t) => {
    const related = relName(t);
    return `<div class="followup-row" style="cursor:pointer" data-drill-fu="${t.id}">
      <div>
        <div class="strong" style="color:var(--ink)">${t.title || 'Follow-up'}</div>
        <div class="muted" style="font-size:var(--t-13)">${empName(t.ownerId)} · <span style="color:var(--red)">Overdue</span> ${util.fmtDate(t.dueAt)}${related ? ' · ' + related : ''}${t.reason ? ' · ' + t.reason : ''}</div>
      </div>
      <span class="badge badge-gray">${(t.taskType || 'other').replace(/_/g, ' ')}</span>
    </div>`;
  }).join('') : '<div class="empty-sub">No overdue follow-ups — the team is caught up!</div>';

  openCrmDrawer(drawerHeader('Overdue Follow-ups', tasks.length) +
    `<div style="padding:0 var(--s5) var(--s5)">${html}</div>`);
  wireDrillClose();
  wireFollowUpRows(document.getElementById('crm-drawer'));
}

function drillPipeline() {
  const quotes = db.quotes().filter((q) => ['sent', 'viewed', 'partially_approved'].includes(q.status)).sort((a, b) => (b.total || 0) - (a.total || 0));
  const employees = db.employees();
  const empName = (id) => { const e = employees.find((x) => x.id === id); return e ? `${e.firstName} ${e.lastName}` : 'Unassigned'; };

  const html = quotes.length ? quotes.map((q) => {
    const c = q.customerId ? db.customerById(q.customerId) : null;
    const meta = util.quoteStatusMeta(q.status);
    const openFU = workflow.openFollowUpTasks().find((t) => t.relatedId === q.id || t.customerId === q.customerId);
    return `<div class="cust-row" style="cursor:pointer;flex-direction:column;align-items:flex-start;gap:var(--s2)" data-drill-quote="${q.id}">
      <div class="row between" style="width:100%">
        <div><div class="strong">${q.quoteNumber || 'Quote'}</div><div class="muted" style="font-size:var(--t-13)">${c ? util.customerName(c) : 'No customer'} · ${empName(q.advisorId)}</div></div>
        <span class="row" style="gap:6px"><span class="tnum strong">${util.fmtMoney(q.total)}</span><span class="badge ${meta.badgeClass}" style="font-size:10px">${meta.label}</span></span>
      </div>
      <div class="muted" style="font-size:var(--t-13)">Sent: ${q.sentAt ? util.fmtDate(q.sentAt) : 'Not sent'} · Follow-up: ${openFU ? util.fmtDate(openFU.dueAt) : 'No follow-up scheduled'}</div>
      <div data-stop-row>
        ${c ? `<button class="btn btn-secondary btn-sm" data-outreach-quote="${q.customerId}" data-qid="${q.id}">Send follow-up</button>` : ''}
      </div>
    </div>`;
  }).join('') : '<div class="empty-sub">No quotes currently waiting on approval.</div>';

  openCrmDrawer(drawerHeader('Pipeline — Quotes Waiting Approval', quotes.length) +
    `<div style="padding:0 var(--s5) var(--s5)">${html}</div>`);
  wireDrillClose();
  const drawer = document.getElementById('crm-drawer');
  wireQuoteRows(drawer);
  drawer.querySelectorAll('[data-outreach-quote]').forEach((btn) => btn.addEventListener('click', () => {
    const c = db.customerById(btn.dataset.outreachQuote);
    const q = db.quotes().find((x) => x.id === btn.dataset.qid);
    if (c) openOutreachPanel({ customer: c, quote: q });
  }));
}

function sourceLabel(s) {
  return { phone: 'Phone', walk_in: 'Walk-in', website_form: 'Website form', facebook: 'Facebook', gbp: 'Google Business', referral: 'Referral', manual: 'Manual' }[s] || s;
}

function iconStar() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>'; }
function iconAlert() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>'; }
function iconWrench() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>'; }
function iconUsers() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>'; }
function iconClock() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'; }
function iconTrend() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l6-6 4 4 8-8"/></svg>'; }
