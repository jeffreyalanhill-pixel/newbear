// AutoBook — modules/crm/crm-dashboard.js (§C.3, Phase 1)
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';

export function renderCrmDashboard(mount) {
  const leads = db.leads();
  const open = leads.filter((l) => !['converted', 'lost'].includes(l.status));
  const converted = leads.filter((l) => l.status === 'converted');
  const customers = db.customers();
  const stats = util.periodStats('today');

  const bySource = {};
  leads.forEach((l) => {
    bySource[l.source] = (bySource[l.source] || 0) + 1;
  });

  mount.innerHTML = `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon blue">${iconUsers()}</span><span class="stat-label">Open Leads</span></div>
        <div class="stat-value">${open.length}</div>
        <div class="stat-sub">${converted.length} converted all-time</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon green">${iconUsers()}</span><span class="stat-label">Total Customers</span></div>
        <div class="stat-value">${customers.length}</div>
        <div class="stat-sub">Across the full CRM</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon purple">${iconTrend()}</span><span class="stat-label">Collected Today</span></div>
        <div class="stat-value tnum">${util.fmtMoney0(stats.collected)}</div>
        <div class="stat-sub">${stats.count} invoice${stats.count === 1 ? '' : 's'} today</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">Leads by source</div></div>
      <div class="card-body">
        ${Object.keys(bySource).length
          ? Object.entries(bySource).map(([source, count]) => `
            <div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
              <span class="muted">${sourceLabel(source)}</span>
              <span class="strong tnum">${count}</span>
            </div>`).join('')
          : '<div class="empty-sub">No leads yet.</div>'}
      </div>
    </div>
  `;
}

function sourceLabel(s) {
  return { phone: 'Phone', walk_in: 'Walk-in', website_form: 'Website form', facebook: 'Facebook', gbp: 'Google Business', referral: 'Referral', manual: 'Manual' }[s] || s;
}
function iconUsers() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>';
}
function iconTrend() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l6-6 4 4 8-8"/></svg>';
}
