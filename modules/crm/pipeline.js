// AutoBook — modules/crm/pipeline.js (§C CRM redesign)
// Customer Pipeline board. There is no first-class Opportunity/Estimate
// entity in this MVP (that's a later CRM phase per CLAUDE.md scope), so
// stages are derived from existing real fields: Lead.status and
// RepairOrder.status/approvalStatus. "Estimate Sent" used to have no backing
// field and was a placeholder column — it's now real: a quote can carry an
// optional `leadId` (added for the quote send/approval/CRM-chain task), so a
// lead with a sent/viewed quote linked via that field moves here.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';

const STAGES = [
  { id: 'new_lead', title: 'New Lead' },
  { id: 'contacted', title: 'Contacted' },
  { id: 'estimate_needed', title: 'Estimate Needed' },
  { id: 'estimate_sent', title: 'Estimate Sent' },
  { id: 'waiting_approval', title: 'Waiting Approval' },
  { id: 'appointment_booked', title: 'Appointment Booked' },
  { id: 'won', title: 'Won' },
  { id: 'lost_inactive', title: 'Lost / Inactive' },
];

function leadHasSentQuote(leadId) {
  return db.quotes().some((q) => q.leadId === leadId && ['sent', 'viewed'].includes(q.status));
}

export function renderPipeline(mount) {
  const leads = db.leads();
  const jobs = db.jobs();
  const inactiveCustomerIds = new Set(db.segmentMembers('seg_inactive').map((c) => c.id));

  const cards = {
    new_lead: leads.filter((l) => l.status === 'new').map(leadCard),
    contacted: leads.filter((l) => ['contacted', 'waiting'].includes(l.status)).map(leadCard),
    estimate_needed: leads.filter((l) => l.status === 'estimate_needed' && !leadHasSentQuote(l.id)).map(leadCard),
    estimate_sent: leads.filter((l) => l.status === 'estimate_needed' && leadHasSentQuote(l.id)).map(leadCard),
    waiting_approval: jobs.filter((j) => j.approvalStatus === 'pending').map(jobCard),
    appointment_booked: jobs.filter((j) => ['scheduled', 'waiting'].includes(j.status)).map(jobCard),
    won: jobs.filter((j) => ['ready', 'invoiced', 'closed'].includes(j.status)).map(jobCard),
    lost_inactive: [
      ...leads.filter((l) => l.status === 'lost').map(leadCard),
      ...db.customers().filter((c) => inactiveCustomerIds.has(c.id)).map(customerCard),
    ],
  };

  mount.innerHTML = `
    <div class="alert alert-amber" style="margin-bottom:var(--s4)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>
      <div><b>Stages are derived from lead and repair-order/quote status, not a separate pipeline/opportunity entity.</b><br>There's still no first-class Opportunity record — every column here reads real Lead/Quote/RepairOrder fields directly.</div>
    </div>
    <div class="pipeline-board">
      ${STAGES.map((s) => `
        <div class="pipeline-col">
          <div class="pipeline-col-head">
            <span class="pipeline-col-title">${s.title}</span>
            <span class="badge badge-gray">${cards[s.id].length}</span>
          </div>
          ${cards[s.id].length ? cards[s.id].join('') : '<div class="empty-sub" style="font-size:var(--t-xs)">Empty.</div>'}
        </div>`).join('')}
    </div>
  `;
}

function leadCard(l) {
  return `
    <div class="pipeline-card">
      <div class="pc-name">${l.firstName} ${l.lastName}</div>
      <div class="pc-sub">${(l.serviceInterest || []).join(', ') || 'No service interest noted'}</div>
      <div class="pc-sub">${util.timeAgo(l.createdAt)}</div>
    </div>`;
}

function jobCard(j) {
  const c = db.customerById(j.customerId);
  return `
    <div class="pipeline-card">
      <div class="pc-name">${c ? util.customerName(c) : 'Unknown customer'}</div>
      <div class="pc-sub">${j.ro}${j.total != null ? ' · ' + util.fmtMoney(j.total) : ''}</div>
    </div>`;
}

function customerCard(c) {
  return `
    <div class="pipeline-card">
      <div class="pc-name">${util.customerName(c)}</div>
      <div class="pc-sub">No activity in 90+ days</div>
    </div>`;
}
