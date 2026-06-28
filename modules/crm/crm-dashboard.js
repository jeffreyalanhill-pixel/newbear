// AutoBook — modules/crm/crm-dashboard.js (§C, CRM redesign)
// CRM home: stat row (high-value, declined-services, due-for-service) + a
// Follow-Up Center (real candidates, placeholder actions — no auto-send
// engine exists yet, same caveat as Marketing's automations) + a global
// activity timeline merged across all customers.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast } from '../../lib/nav.js';

export function renderCrmDashboard(mount) {
  const leads = db.leads();
  const bySource = {};
  leads.forEach((l) => { bySource[l.source] = (bySource[l.source] || 0) + 1; });

  const highValue = db.segmentMembers('seg_high_value').length;
  const declined = db.segmentMembers('seg_declined').length;
  const dueService = new Set([...db.segmentMembers('seg_due_oil'), ...db.segmentMembers('seg_due_tire')].map((c) => c.id)).size;

  mount.innerHTML = `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon purple">${iconStar()}</span><span class="stat-label">High-Value Customers <span class="badge badge-amber" style="font-size:10px;margin-left:4px">assumption</span></span></div>
        <div class="stat-value">${highValue}</div>
        <div class="stat-sub">$400+ lifetime invoiced — documented MVP cutoff</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon red">${iconAlert()}</span><span class="stat-label">Declined-Service Follow-ups</span></div>
        <div class="stat-value">${declined}</div>
        <div class="stat-sub">customers with a declined repair order</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon amber">${iconWrench()}</span><span class="stat-label">Due for Service</span></div>
        <div class="stat-value">${dueService}</div>
        <div class="stat-sub">oil change or tire rotation overdue</div>
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

    <div class="card">
      <div class="card-head"><div class="card-title">Recent activity</div></div>
      <div class="card-body" id="crm-activity"></div>
    </div>
  `;

  renderFollowUps();
  renderActivity();
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
// due-for-service customers); the action buttons are placeholders — clicking
// just confirms intent, since no email/SMS sending pipeline exists for CRM yet.
function renderFollowUps() {
  const leads = db.leads();
  const dueLeads = leads.filter((l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt) <= new Date() && !['converted', 'lost'].includes(l.status));
  const declinedCustomers = db.segmentMembers('seg_declined').slice(0, 3);
  const inactiveCustomers = db.segmentMembers('seg_inactive').slice(0, 3);
  const dueServiceCustomers = db.segmentMembers('seg_due_oil').slice(0, 3);

  const quoteFollowUps = util.quotesNeedingFollowUp().slice(0, 3).map((q) => ({
    name: `${util.customerName(db.customerById(q.customerId))} — ${q.quoteNumber}`,
    reason: q.status === 'declined' ? 'Quote declined — win-back opportunity' : `Quote waiting approval (${util.quoteStatusMeta(q.status).label.toLowerCase()})`,
    action: 'Open quote',
  }));

  const rows = [
    ...dueLeads.map((l) => ({ name: `${l.firstName} ${l.lastName}`, reason: 'Call customer — follow-up due', action: 'Call' })),
    ...quoteFollowUps,
    ...declinedCustomers.map((c) => ({ name: util.customerName(c), reason: 'Declined-service follow-up', action: 'Send reminder' })),
    ...dueServiceCustomers.map((c) => ({ name: util.customerName(c), reason: 'Maintenance reminder due', action: 'Send reminder' })),
    ...inactiveCustomers.map((c) => ({ name: util.customerName(c), reason: 'Win back inactive customer', action: 'Reach out' })),
  ];

  document.getElementById('followup-list').innerHTML = rows.length
    ? rows.map((r, i) => `
      <div class="followup-row">
        <div>
          <div class="strong" style="color:var(--ink)">${r.name}</div>
          <div class="muted" style="font-size:var(--t-13)">${r.reason}</div>
        </div>
        <button class="btn btn-secondary btn-sm" data-followup="${i}" data-action="${r.action}">${r.action}</button>
      </div>`).join('')
    : '<div class="empty-sub">Nothing due right now.</div>';

  document.querySelectorAll('[data-followup]').forEach((btn) => {
    btn.addEventListener('click', () => toast(`"${btn.dataset.action}" recorded as a placeholder — no real send pipeline yet.`));
  });
}

function sourceLabel(s) {
  return { phone: 'Phone', walk_in: 'Walk-in', website_form: 'Website form', facebook: 'Facebook', gbp: 'Google Business', referral: 'Referral', manual: 'Manual' }[s] || s;
}

function iconStar() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>'; }
function iconAlert() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>'; }
function iconWrench() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>'; }
