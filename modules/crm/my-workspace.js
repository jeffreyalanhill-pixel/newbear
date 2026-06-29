// AutoBook — modules/crm/my-workspace.js
// Personal CRM Workspace (sales-engine task, §1B/§9) — the default CRM view
// for any non-manager role. Shows only the current employee's own leads,
// customers, follow-ups, and quotes — never a peer's. All data is filtered
// from the same real sources the Command Center uses (lib/workflow.js's
// getMyLeads/getMyCustomers/crmMetricsForEmployee), nothing dashboard-only.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import * as workflow from '../../lib/workflow.js';
import { openOutreachPanel } from './outreach.js';

export function renderMyWorkspace(mount) {
  const me = db.employeeById(db.settings().currentUserId);
  if (!me) {
    mount.innerHTML = '<div class="empty"><div class="empty-title">No current user</div><div class="empty-sub">Set a current user in Settings to see a personal CRM workspace.</div></div>';
    return;
  }
  const m = workflow.crmMetricsForEmployee(me.id);
  const myLeads = workflow.getMyLeads(me.id).filter((l) => !['converted', 'lost'].includes(l.status));
  const myCustomers = workflow.getMyCustomers(me.id);
  const myFollowUps = db.followUpTasks().filter((t) => t.ownerId === me.id && t.status === 'open').sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const myQuotesPending = db.quotes().filter((q) => q.advisorId === me.id && ['sent', 'viewed'].includes(q.status));
  const wonQuotes = db.quotes().filter((q) => q.advisorId === me.id && ['approved', 'partially_approved', 'converted'].includes(q.status));
  const lostQuotes = db.quotes().filter((q) => q.advisorId === me.id && q.status === 'declined');

  const nextActions = [
    ...myLeads.flatMap((l) => workflow.nextBestActionsForLead(l).map((a) => ({ ...a, name: `${l.firstName} ${l.lastName}`, kind: 'lead', record: l }))),
    ...myCustomers.flatMap((c) => workflow.nextBestActionsForCustomer(c).map((a) => ({ ...a, name: util.customerName(c), kind: 'customer', record: c }))),
  ].slice(0, 6);

  const recentActivity = myCustomers
    .flatMap((c) => workflow.getCustomerTimeline(c.id).map((e) => ({ ...e, customer: c })))
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 6);

  mount.innerHTML = `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon blue">${iconUsers()}</span><span class="stat-label">My Leads &amp; Customers</span></div>
        <div class="stat-value">${myLeads.length}<small style="font-size:var(--t-md);color:var(--ink-3)"> leads · ${myCustomers.length} accounts</small></div>
        <div class="stat-sub">${m.contactedLeads}/${m.assignedLeads || 0} leads contacted</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon ${m.overdueFollowUps ? 'red' : 'green'}">${iconClock()}</span><span class="stat-label">Follow-ups</span></div>
        <div class="stat-value">${myFollowUps.length}<small style="font-size:var(--t-md);color:var(--ink-3)"> open</small></div>
        <div class="stat-sub">${m.overdueFollowUps ? `<span class="amber">${m.overdueFollowUps} overdue</span>` : 'None overdue'} · ${m.completedFollowUps} completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon purple">${iconTrend()}</span><span class="stat-label">Quotes</span></div>
        <div class="stat-value">${m.quotesSent}<small style="font-size:var(--t-md);color:var(--ink-3)"> sent</small></div>
        <div class="stat-sub">${m.approvalRate}% approval rate · ${util.fmtMoney0(m.pipelineValue)} pipeline</div>
      </div>
    </div>

    <div class="crm-grid" style="margin-bottom:var(--s4)">
      <div class="card">
        <div class="card-head"><div class="card-title">My follow-ups</div><span class="badge badge-gray">${myFollowUps.length}</span></div>
        <div class="card-body" id="my-followups"></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Next best actions</div></div>
        <div class="card-body" id="my-next-actions"></div>
      </div>
    </div>

    <div class="crm-grid" style="margin-bottom:var(--s4)">
      <div class="card">
        <div class="card-head"><div class="card-title">My leads</div><span class="badge badge-gray">${myLeads.length}</span></div>
        <div class="card-body" id="my-leads"></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">My quotes waiting approval</div><span class="badge badge-amber">${myQuotesPending.length}</span></div>
        <div class="card-body" id="my-quotes"></div>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:var(--s4);gap:var(--s4)">
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon green">${iconCheck()}</span><span class="stat-label">Won</span></div>
        <div class="stat-value tnum">${util.fmtMoney0(m.wonValue)}</div>
        <div class="stat-sub">${wonQuotes.length} quote${wonQuotes.length === 1 ? '' : 's'} won</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon red">${iconX()}</span><span class="stat-label">Lost</span></div>
        <div class="stat-value">${lostQuotes.length}</div>
        <div class="stat-sub">declined quote${lostQuotes.length === 1 ? '' : 's'}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">My recent activity</div></div>
      <div class="card-body" id="my-activity"></div>
    </div>
  `;

  renderFollowUps(myFollowUps);
  renderNextActions(nextActions);
  renderMyLeads(myLeads);
  renderMyQuotes(myQuotesPending);
  renderActivity(recentActivity);
}

function openOutcomeModal(taskId) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-head"><div class="modal-title">Mark follow-up done</div><button class="icon-btn" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
      <div class="modal-body">
        <div class="field">
          <label class="label">Outcome</label>
          <select class="select" id="outcome-select">
            ${workflow.FOLLOWUP_OUTCOMES.map((o) => `<option value="${o}">${o.replace(/_/g, ' ')}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-foot"><button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" id="outcome-save">Save</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => overlay.remove()));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#outcome-save').addEventListener('click', () => {
    try {
      workflow.completeFollowUpTask(taskId, overlay.querySelector('#outcome-select').value);
      toast('Follow-up marked done.', 'success');
      overlay.remove();
      renderMyWorkspace(document.getElementById('crm-view-body'));
    } catch (e) { toast(e.message, 'error'); }
  });
}

function renderFollowUps(tasks) {
  const now = Date.now();
  document.getElementById('my-followups').innerHTML = tasks.length
    ? tasks.map((t) => {
        const overdue = new Date(t.dueAt).getTime() < now;
        return `
        <div class="followup-row">
          <div>
            <div class="strong" style="color:var(--ink)">${t.title}</div>
            <div class="muted" style="font-size:var(--t-13)">${overdue ? '<span class="red">Overdue</span> · ' : ''}Due ${util.fmtDate(t.dueAt)}${t.reason ? ` · ${t.reason}` : ''}</div>
          </div>
          <button class="btn btn-secondary btn-sm" data-complete-task="${t.id}">Mark done</button>
        </div>`;
      }).join('')
    : '<div class="empty-sub">No follow-up scheduled.</div>';

  document.querySelectorAll('[data-complete-task]').forEach((btn) => btn.addEventListener('click', () => openOutcomeModal(btn.dataset.completeTask)));
}

function renderNextActions(actions) {
  document.getElementById('my-next-actions').innerHTML = actions.length
    ? actions.map((a) => `
      <div class="followup-row">
        <div>
          <div class="strong" style="color:var(--ink)">${a.name}</div>
          <div class="muted" style="font-size:var(--t-13)">${a.title} — ${a.recommendation}</div>
        </div>
      </div>`).join('')
    : '<div class="empty-sub">Nothing urgent — you\'re caught up.</div>';
}

function renderMyLeads(leads) {
  document.getElementById('my-leads').innerHTML = leads.length
    ? leads.map((l) => `
      <div class="followup-row">
        <div>
          <div class="strong" style="color:var(--ink)">${l.firstName} ${l.lastName}</div>
          <div class="muted" style="font-size:var(--t-13)">${l.lastContactedAt ? `Last contacted ${util.fmtDate(l.lastContactedAt)}` : 'Not contacted yet'}</div>
        </div>
        <button class="btn btn-secondary btn-sm" data-outreach-lead="${l.id}">Outreach</button>
      </div>`).join('')
    : '<div class="empty-sub">No leads assigned to you.</div>';

  document.querySelectorAll('[data-outreach-lead]').forEach((btn) => btn.addEventListener('click', () => {
    openOutreachPanel({ lead: db.leadById(btn.dataset.outreachLead) });
  }));
}

function renderMyQuotes(quotes) {
  document.getElementById('my-quotes').innerHTML = quotes.length
    ? quotes.map((q) => {
        const c = db.customerById(q.customerId);
        return `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)"><span>${q.quoteNumber} — ${util.customerName(c) || 'Customer not assigned'}</span><span class="row" style="gap:6px"><span class="tnum">${util.fmtMoney(q.total)}</span><span class="badge ${util.quoteStatusMeta(q.status).badgeClass}">${util.quoteStatusMeta(q.status).label}</span></span></div>`;
      }).join('')
    : '<div class="empty-sub">No quotes waiting on approval.</div>';
}

const TL_ICON = {
  booking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
  repair_order: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="M9 11h6M9 15h6"/></svg>',
  invoice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/><path d="M9 7h6M9 11h6"/></svg>',
  communication: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
  quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>',
};
function iconKey(type) {
  if (TL_ICON[type]) return type;
  if (type.startsWith('quote')) return 'quote';
  if (type.startsWith('invoice') || type.startsWith('payment')) return 'invoice';
  if (type.startsWith('ro_') || type === 'customer_checked_in') return 'repair_order';
  return 'communication';
}
function renderActivity(events) {
  document.getElementById('my-activity').innerHTML = events.length
    ? events.map((e) => `
      <div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
        <span class="row" style="gap:var(--s2)">
          <span class="insight-bubble" style="background:var(--canvas);color:var(--ink-3);width:26px;height:26px">${TL_ICON[iconKey(e.type)] || ''}</span>
          <span>${e.label} <span class="muted">· ${util.customerName(e.customer)}</span></span>
        </span>
        <span class="muted" style="font-size:var(--t-13)">${util.fmtDate(e.at)}</span>
      </div>`).join('')
    : '<div class="empty-sub">No activity yet.</div>';
}

function iconUsers() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>'; }
function iconClock() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'; }
function iconTrend() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l6-6 4 4 8-8"/></svg>'; }
function iconCheck() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>'; }
function iconX() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'; }
