// AutoBook — modules/crm/customers.js (§C, CRM redesign)
// Customer list (vehicle, last visit, lifetime spend, tags, next action) +
// profile drawer (contact, vehicles, linked-record badges, activity timeline,
// tags, lifetime value, open follow-ups). "Schedule follow-up" creates a real
// lib/workflow.js followUpTask; "Add note" / "Create estimate" stay
// placeholders — there's still no persisted note field or Estimate entity.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast } from '../../lib/nav.js';
import { openCrmDrawer, closeCrmDrawer, isManagerView } from './crm-app.js';
import * as workflow from '../../lib/workflow.js';
import { openOutreachPanel } from './outreach.js';
import * as rewards from '../../lib/rewards.js';

workflow.ensureSeeded();

let searchTerm = '';

export function wireCustomerSearch() {
  document.getElementById('crm-search').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    if ((location.hash || '#dashboard').slice(1) === 'customers') renderList();
  });
}

export function renderCustomers(mount) {
  mount.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">Customers</div>
        <button class="btn btn-secondary btn-sm" id="add-customer-btn">+ Add Customer</button>
      </div>
      <div class="card-body" id="customers-list"></div>
    </div>`;
  document.getElementById('add-customer-btn').addEventListener('click', () => toast('Add Customer is a placeholder — customers are created automatically from bookings or converted leads.'));
  renderList();
}

function renderList() {
  const list = document.getElementById('customers-list');
  if (!list) return;
  const manager = isManagerView();
  const me = db.employeeById(db.settings().currentUserId);
  // Personal CRM: never show a peer's accounts — same filter the Personal
  // Workspace view uses (lib/workflow.js's getMyCustomers).
  let customers = manager ? db.customers() : workflow.getMyCustomers(me?.id);
  if (searchTerm) {
    customers = customers.filter((c) => {
      const v = db.vehiclesForCustomer(c.id).map(util.vehicleLabel).join(' ');
      return `${util.customerName(c)} ${c.phone} ${c.email} ${v}`.toLowerCase().includes(searchTerm);
    });
  }
  customers = customers.slice().sort((a, b) => util.customerName(a).localeCompare(util.customerName(b)));

  list.innerHTML = customers.length
    ? customers.map((c) => {
        const vehicles = db.vehiclesForCustomer(c.id);
        const timeline = db.customerTimeline(c.id);
        const lastVisit = timeline[0];
        const ltv = util.customerLifetimeValue(c.id);
        const tags = util.customerTags(c.id);
        return `
        <div class="cust-row" data-customer-id="${c.id}">
          <div style="flex:1;min-width:0">
            <div class="strong" style="color:var(--ink)">${util.customerName(c)}</div>
            <div class="muted" style="font-size:var(--t-13)">${vehicles.map(util.vehicleLabel).join(', ') || 'No vehicles on file'}</div>
            <div class="tag-row">${tags.map((t) => `<span class="badge ${t.badgeClass}" style="font-size:10px">${t.label}</span>`).join('')}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div class="muted" style="font-size:var(--t-13)">Last visit</div>
            <div class="tnum" style="font-size:var(--t-13)">${lastVisit ? util.fmtDate(lastVisit.at) : '—'}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div class="muted" style="font-size:var(--t-13)">Lifetime spend</div>
            <div class="tnum strong" style="color:var(--ink)">${util.fmtMoney(ltv)}</div>
          </div>
          <div class="row" style="gap:6px;flex-shrink:0" data-stop-row>
            <button class="icon-btn" title="Outreach" data-outreach="${c.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg></button>
          </div>
        </div>`;
      }).join('')
    : `<div class="empty"><div class="empty-title">No customers ${manager ? 'match' : 'assigned to you'}</div><div class="empty-sub">${manager ? 'Try a different search.' : 'Customers you advise will show up here.'}</div></div>`;

  list.querySelectorAll('[data-customer-id]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-stop-row]')) return;
      openProfile(row.dataset.customerId);
    });
  });
  list.querySelectorAll('[data-outreach]').forEach((btn) => btn.addEventListener('click', () => openOutreachPanel({ customer: db.customerById(btn.dataset.outreach) })));
}

const TL_ICON = {
  booking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
  repair_order: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="M9 11h6M9 15h6"/></svg>',
  invoice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/><path d="M9 7h6M9 11h6"/></svg>',
  communication: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
  quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>',
};
// Cross-module workflow events (lib/workflow.js) use fine-grained `type`
// strings (e.g. "quote_sent", "ro_started", "payment_recorded") rather than
// the 5 coarse buckets above — bucket them so the timeline still shows an icon.
function timelineIconKey(type) {
  if (TL_ICON[type]) return type;
  if (type.startsWith('booking')) return 'booking';
  if (type.startsWith('quote')) return 'quote';
  if (type.startsWith('invoice') || type.startsWith('payment') || type.startsWith('refund') || type.startsWith('credit_note')) return 'invoice';
  if (type.startsWith('ro_') || type.startsWith('dvi') || type.startsWith('approval') || type === 'customer_checked_in') return 'repair_order';
  return 'communication';
}

function renderRewardsCard(customerId, manager) {
  const prog = rewards.getRewardProgram();
  if (!prog.isActive) return '';
  const cr = rewards.getCustomerReward(customerId);
  if (!cr || cr.membershipStatus !== 'active') {
    return `
      <div style="margin-top:var(--s5)">
        <div class="section-label" style="margin-bottom:var(--s2)">Rewards</div>
        <div class="muted" style="font-size:var(--t-13)">Not enrolled in any rewards plan.</div>
        ${manager ? `<button class="btn btn-secondary btn-sm" style="margin-top:var(--s2)" id="cp-rw-enroll" data-rw-enroll="${customerId}">Enroll in Rewards</button>` : ''}
      </div>`;
  }
  const t = rewards.tierMeta(cr.tier);
  const plan = db.membershipPlanById(cr.membershipPlanId);
  const val = rewards.pointsValue(cr.pointsBalance || 0);
  return `
    <div style="margin-top:var(--s5)">
      <div class="row between" style="margin-bottom:var(--s2)">
        <div class="section-label">Rewards</div>
        <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:100px;background:${t.bg};color:${t.color};text-transform:uppercase">${t.label}</span>
      </div>
      <div class="grid-2" style="gap:var(--s2);margin-bottom:var(--s3)">
        <div class="stat-card" style="padding:var(--s3)">
          <div class="muted" style="font-size:var(--t-13)">Points balance</div>
          <div class="stat-value tnum" style="font-size:var(--t-xl)">${(cr.pointsBalance || 0).toLocaleString()}</div>
        </div>
        <div class="stat-card" style="padding:var(--s3)">
          <div class="muted" style="font-size:var(--t-13)">Redemption value</div>
          <div class="stat-value tnum" style="font-size:var(--t-xl)">${util.fmtMoney(val)}</div>
        </div>
      </div>
      <div class="muted" style="font-size:var(--t-13)">Plan: <b>${plan?.name || cr.membershipPlanId}</b> · Member since ${util.fmtDate(cr.enrolledAt)}</div>
      ${manager ? `
      <div class="row" style="gap:var(--s2);margin-top:var(--s2);flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" id="cp-rw-adjust" data-rw-adjust="${customerId}">Adjust Points</button>
        <button class="btn btn-secondary btn-sm" id="cp-rw-redeem" data-rw-redeem="${customerId}">Redeem <span class="badge badge-gray" style="font-size:9px">placeholder</span></button>
      </div>` : ''}
    </div>`;
}

export function openCustomerDrawer(customerId) { openProfile(customerId); }
function openProfile(customerId) {
  const c = db.customerById(customerId);
  const vehicles = db.vehiclesForCustomer(customerId);
  const timeline = db.customerTimeline(customerId);
  const tags = util.customerTags(customerId);
  const ltv = util.customerLifetimeValue(customerId);
  const allJobs = db.jobsForCustomer(customerId);
  const declinedJobs = allJobs.filter((j) => j.approvalStatus === 'declined');
  const upcoming = allJobs.filter((j) => j.scheduledDate && j.scheduledDate >= new Date().toISOString().slice(0, 10) && ['scheduled', 'waiting'].includes(j.status));
  const meta = (status) => util.statusMeta(status);
  const badges = workflow.getEntityBadges('customer', customerId);
  const openFollowUps = workflow.openFollowUpTasks().filter((t) => t.customerId === customerId);
  const ownerId = workflow.customerOwnerId(c);
  const owner = ownerId ? db.employeeById(ownerId) : null;
  const manager = isManagerView();
  const advisors = db.employees().filter((e) => !['technician', 'apprentice', 'parts'].includes(e.role));
  const campaignLinks = workflow.getLinkedEntities('customer', customerId).filter((l) => l.relationshipType === 'campaign_to_customer');
  const nextActions = workflow.nextBestActionsForCustomer(c);

  openCrmDrawer(`
    <div class="modal-head">
      <div class="modal-title">${util.customerName(c)}</div>
      <button class="icon-btn" id="close-crm-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="muted" style="font-size:var(--t-13)">${c.phone}${c.email ? ' · ' + c.email : ''}</div>
      <div class="muted" style="font-size:var(--t-13)">Customer since ${util.fmtDate(c.createdAt)}</div>
      <div class="row between" style="margin-top:var(--s2)">
        <span class="muted" style="font-size:var(--t-13)">Account owner</span>
        ${manager ? `<select class="select" id="cp-owner" style="width:auto;font-size:var(--t-13)">
          <option value="">Unassigned</option>
          ${advisors.map((e) => `<option value="${e.id}" ${e.id === ownerId ? 'selected' : ''}>${e.firstName} ${e.lastName}</option>`).join('')}
        </select>` : `<span class="badge ${owner ? 'badge-blue' : 'badge-amber'}">${owner ? `${owner.firstName} ${owner.lastName}` : 'Unassigned'}</span>`}
      </div>
      <div class="tag-row">${tags.length ? tags.map((t) => `<span class="badge ${t.badgeClass}">${t.label}</span>`).join('') : '<span class="empty-sub" style="font-size:var(--t-13)">No segment tags.</span>'}</div>
      <div class="tag-row">
        <span class="badge badge-gray">${badges.ros} RO${badges.ros === 1 ? '' : 's'}</span>
        <span class="badge badge-gray">${badges.quotes} quote${badges.quotes === 1 ? '' : 's'}</span>
        <span class="badge badge-gray">${badges.invoices} invoice${badges.invoices === 1 ? '' : 's'}</span>
        ${badges.followUps ? `<span class="badge badge-amber">${badges.followUps} follow-up${badges.followUps === 1 ? '' : 's'} due</span>` : ''}
      </div>

      ${nextActions.length ? `
      <div class="alert alert-amber" style="margin-top:var(--s3)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        <div><b>Next best action:</b> ${nextActions[0].recommendation}</div>
      </div>` : ''}

      <div class="row" style="gap:var(--s2);margin-top:var(--s3)">
        <button class="btn btn-secondary btn-sm" id="cp-outreach">Outreach</button>
      </div>

      <div class="grid-2" style="margin-top:var(--s4);gap:var(--s3)">
        <div class="stat-card" style="padding:var(--s3)">
          <div class="muted" style="font-size:var(--t-13)">Lifetime value</div>
          <div class="stat-value tnum" style="font-size:var(--t-xl)">${util.fmtMoney(ltv)}</div>
        </div>
        <div class="stat-card" style="padding:var(--s3)">
          <div class="muted" style="font-size:var(--t-13)">Repair orders</div>
          <div class="stat-value tnum" style="font-size:var(--t-xl)">${db.jobsForCustomer(customerId).length}</div>
        </div>
      </div>

      ${db.quotesForCustomer(customerId).length ? `
      <div style="margin-top:var(--s5)">
        <div class="section-label" style="margin-bottom:var(--s2)">Open quotes</div>
        ${db.quotesForCustomer(customerId).map((q) => {
          const meta = util.quoteStatusMeta(q.status);
          return `<div class="row between" style="padding:6px 0"><span>${q.quoteNumber} — ${q.title}</span><span class="row" style="gap:6px"><span class="tnum">${util.fmtMoney(q.total)}</span><span class="badge ${meta.badgeClass}" style="font-size:10px">${meta.label}</span></span></div>`;
        }).join('')}
        <div class="muted" style="font-size:var(--t-xs);margin-top:var(--s2)">Open the Quotes page to act on these — see quotes.html.</div>
      </div>` : ''}

      <div style="margin-top:var(--s5)">
        <div class="section-label" style="margin-bottom:var(--s2)">Vehicles</div>
        ${vehicles.length
          ? vehicles.map((v) => `<div class="row between" style="padding:6px 0"><span>${util.vehicleLabel(v)}</span><span class="muted">${util.vehicleSub(v)}</span></div>`).join('')
          : '<div class="empty-sub">No vehicles on file.</div>'}
      </div>

      ${upcoming.length ? `
      <div style="margin-top:var(--s5)">
        <div class="section-label" style="margin-bottom:var(--s2)">Upcoming appointments</div>
        ${upcoming.map((j) => `<div class="row between" style="padding:6px 0"><span>${j.ro} — ${util.fmtDate(j.scheduledDate)}</span><span class="badge ${util.statusMeta(j.status).badgeClass}" style="font-size:10px">${util.statusMeta(j.status).label}</span></div>`).join('')}
      </div>` : ''}

      ${campaignLinks.length ? `
      <div style="margin-top:var(--s5)">
        <div class="section-label" style="margin-bottom:var(--s2)">Campaign activity</div>
        ${campaignLinks.map((l) => { const camp = db.campaignById(l.sourceId); return `<div class="row between" style="padding:6px 0"><span>${camp?.name || 'Campaign'}</span><span class="muted" style="font-size:var(--t-13)">${util.fmtDate(l.createdAt)}</span></div>`; }).join('')}
      </div>` : ''}

      ${declinedJobs.length ? `
      <div style="margin-top:var(--s5)">
        <div class="section-label" style="margin-bottom:var(--s2)">Declined services</div>
        ${declinedJobs.map((j) => `<div class="row between" style="padding:6px 0"><span>${j.ro}</span><span class="badge badge-red">declined</span></div>`).join('')}
      </div>` : ''}

      ${renderRewardsCard(customerId, manager)}

      <div style="margin-top:var(--s5)">
        <div class="row between" style="margin-bottom:var(--s3)">
          <div class="section-label">Notes &amp; follow-up</div>
        </div>
        ${openFollowUps.length ? openFollowUps.map((t) => `
          <div class="followup-row">
            <div><div class="strong" style="font-size:var(--t-13)">${t.title}</div><div class="muted" style="font-size:var(--t-13)">Due ${util.fmtDate(t.dueAt)}${t.reason ? ` · ${t.reason}` : ''}</div></div>
            <button class="btn btn-secondary btn-sm" data-complete-followup="${t.id}">Mark done</button>
          </div>`).join('') : ''}
        <div class="row" style="gap:var(--s2);flex-wrap:wrap;margin-top:${openFollowUps.length ? 'var(--s2)' : '0'}">
          <button class="btn btn-secondary btn-sm" id="cp-add-note">+ Add note</button>
          <button class="btn btn-secondary btn-sm" id="cp-schedule-followup">+ Schedule follow-up</button>
          <button class="btn btn-secondary btn-sm" id="cp-create-estimate">+ Create estimate</button>
        </div>
      </div>

      <div style="margin-top:var(--s5)">
        <div class="section-label" style="margin-bottom:var(--s3)">Activity timeline</div>
        ${timeline.length
          ? timeline.map((e) => `
            <div class="tl-event">
              <span class="insight-bubble" style="background:var(--canvas);color:var(--ink-3)">${TL_ICON[timelineIconKey(e.type)] || ''}</span>
              <div style="flex:1">
                <div class="row between"><span class="strong" style="color:var(--ink)">${e.label}</span>${e.total != null ? `<span class="tnum">${util.fmtMoney(e.total)}</span>` : ''}</div>
                <div class="muted" style="font-size:var(--t-13)">${util.fmtDate(e.at)}${e.status ? ` · <span class="badge ${meta(e.status).badgeClass}">${meta(e.status).label}</span>` : ''}</div>
              </div>
            </div>`).join('')
          : '<div class="empty-sub">No activity yet — no bookings, repair orders, or invoices on record.</div>'}
        <div class="muted" style="font-size:var(--t-xs);margin-top:var(--s2)">Estimates and declined-work history aren't fully tracked yet — that arrives in a later CRM phase.</div>
      </div>
    </div>
  `);
  document.getElementById('close-crm-drawer').addEventListener('click', closeCrmDrawer);
  document.getElementById('cp-owner')?.addEventListener('change', (e) => {
    workflow.assignCustomerOwner(customerId, e.target.value || null);
    toast('Account owner updated.', 'success');
    openProfile(customerId);
  });
  document.getElementById('cp-outreach').addEventListener('click', () => openOutreachPanel({ customer: c }));
  document.getElementById('cp-rw-enroll')?.addEventListener('click', () => {
    const plans = db.membershipPlans();
    rewards.enrollCustomer(customerId, plans[0]?.id || 'plan_free');
    toast('Customer enrolled in Rewards.', 'success');
    openProfile(customerId);
  });
  document.getElementById('cp-rw-adjust')?.addEventListener('click', () => {
    const pts = parseInt(prompt('Points to add (use − for deduction):') || '0', 10);
    if (!pts) return;
    rewards.awardPoints(customerId, pts, 'Manual adjustment from CRM', 'manual');
    toast(`${pts > 0 ? '+' : ''}${pts} pts recorded.`, 'success');
    openProfile(customerId);
  });
  document.getElementById('cp-rw-redeem')?.addEventListener('click', () => toast('Redeem is a placeholder — point redemption will be available in a future update.'));
  document.getElementById('cp-add-note').addEventListener('click', () => toast('Add note is a placeholder — there is no persisted note field on Customer yet.'));
  document.getElementById('cp-schedule-followup').addEventListener('click', () => {
    workflow.createFollowUpTask({ title: `Follow up with ${util.customerName(c)}`, reason: 'Manually scheduled from CRM', customerId: c.id, relatedType: 'customer', relatedId: c.id });
    toast('Follow-up scheduled', 'success');
    openProfile(customerId);
  });
  document.getElementById('cp-create-estimate').addEventListener('click', () => toast('Create estimate is a placeholder — Estimates aren\'t a real entity in this MVP yet.'));
  document.querySelectorAll('[data-complete-followup]').forEach((btn) => btn.addEventListener('click', () => {
    const tasks = db.followUpTasks();
    const t = tasks.find((x) => x.id === btn.dataset.completeFollowup);
    if (t) { t.status = 'completed'; t.completedAt = new Date().toISOString(); db.saveFollowUpTasks(tasks); }
    toast('Follow-up marked done', 'success');
    openProfile(customerId);
  }));
}
