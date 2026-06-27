// AutoBook — modules/crm/customers.js (§C.3/C.4, Phase 1)
// Customer list + profile with the merged activity timeline (db.customerTimeline).

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { openCrmDrawer, closeCrmDrawer } from './crm-app.js';

let searchTerm = '';

export function wireCustomerSearch() {
  document.getElementById('crm-search').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    if ((location.hash || '#dashboard').slice(1) === 'customers') renderList();
  });
}

export function renderCustomers(mount) {
  mount.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">Customers</div></div><div class="card-body" id="customers-list"></div></div>`;
  renderList();
}

function renderList() {
  const list = document.getElementById('customers-list');
  if (!list) return;
  let customers = db.customers();
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
        const jobs = db.jobsForCustomer(c.id);
        return `
        <div class="cust-row" data-customer-id="${c.id}">
          <div>
            <div class="strong" style="color:var(--ink)">${util.customerName(c)}</div>
            <div class="muted" style="font-size:var(--t-13)">${c.phone}${c.email ? ' · ' + c.email : ''} · ${vehicles.map(util.vehicleLabel).join(', ') || 'No vehicles on file'}</div>
          </div>
          <span class="badge badge-gray">${jobs.length} RO${jobs.length === 1 ? '' : 's'}</span>
        </div>`;
      }).join('')
    : '<div class="empty"><div class="empty-title">No customers match</div><div class="empty-sub">Try a different search.</div></div>';

  list.querySelectorAll('[data-customer-id]').forEach((row) => {
    row.addEventListener('click', () => openProfile(row.dataset.customerId));
  });
}

const TL_ICON = {
  booking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
  repair_order: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="M9 11h6M9 15h6"/></svg>',
  invoice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/><path d="M9 7h6M9 11h6"/></svg>',
};

function openProfile(customerId) {
  const c = db.customerById(customerId);
  const vehicles = db.vehiclesForCustomer(customerId);
  const timeline = db.customerTimeline(customerId);
  const meta = (status) => util.statusMeta(status);

  openCrmDrawer(`
    <div class="modal-head">
      <div class="modal-title">${util.customerName(c)}</div>
      <button class="icon-btn" id="close-crm-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="muted" style="font-size:var(--t-13)">${c.phone}${c.email ? ' · ' + c.email : ''}</div>
      <div class="muted" style="font-size:var(--t-13)">Customer since ${util.fmtDate(c.createdAt)}</div>

      <div style="margin-top:var(--s5)">
        <div class="section-label" style="margin-bottom:var(--s2)">Vehicles</div>
        ${vehicles.length
          ? vehicles.map((v) => `<div class="row between" style="padding:6px 0"><span>${util.vehicleLabel(v)}</span><span class="muted">${util.vehicleSub(v)}</span></div>`).join('')
          : '<div class="empty-sub">No vehicles on file.</div>'}
      </div>

      <div style="margin-top:var(--s5)">
        <div class="section-label" style="margin-bottom:var(--s3)">Activity timeline</div>
        ${timeline.length
          ? timeline.map((e) => `
            <div class="tl-event">
              <span class="insight-bubble" style="background:var(--canvas);color:var(--ink-3)">${TL_ICON[e.type] || ''}</span>
              <div style="flex:1">
                <div class="row between"><span class="strong" style="color:var(--ink)">${e.label}</span>${e.total != null ? `<span class="tnum">${util.fmtMoney(e.total)}</span>` : ''}</div>
                <div class="muted" style="font-size:var(--t-13)">${util.fmtDate(e.at)} · <span class="badge ${meta(e.status).badgeClass}">${meta(e.status).label}</span></div>
              </div>
            </div>`).join('')
          : '<div class="empty-sub">No activity yet — no bookings, repair orders, or invoices on record.</div>'}
        <div class="muted" style="font-size:var(--t-xs);margin-top:var(--s2)">Estimates and declined-work history aren't tracked yet — that arrives in a later CRM phase.</div>
      </div>
    </div>
  `);
  document.getElementById('close-crm-drawer').addEventListener('click', closeCrmDrawer);
}
