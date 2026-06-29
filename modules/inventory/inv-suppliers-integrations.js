// AutoBook — modules/inventory/inv-suppliers-integrations.js
// Supplier/vendor records (real CRUD) + a clearly-labeled "Plug & Play
// Integrations" placeholder grid. No external APIs — nothing here connects
// to QuickBooks/Xero/Shopify/Amazon/carriers/distributors yet.
import { db } from '../../lib/data.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import { openInvDrawer, closeInvDrawer } from './inventory-app.js';

const INTEGRATIONS = [
  { name: 'QuickBooks', desc: 'Sync inventory value and COGS to QuickBooks Online.' },
  { name: 'Xero', desc: 'Accounting sync for inventory valuation.' },
  { name: 'Sage', desc: 'Accounting sync for inventory valuation.' },
  { name: 'Stripe', desc: 'Payment reconciliation for POS/RO sales.' },
  { name: 'Shopify', desc: 'Online store channel sync.' },
  { name: 'eBay', desc: 'Marketplace channel sync.' },
  { name: 'Amazon / FBA', desc: 'Marketplace + fulfillment channel sync.' },
  { name: '3PL Fulfillment', desc: 'Outsourced warehousing/fulfillment.' },
  { name: 'Shipping Carriers', desc: 'Rate shopping and label printing.' },
  { name: 'Parts Distributor', desc: 'Live parts pricing/availability lookup.' },
  { name: 'Tire Distributor', desc: 'Live tire pricing/availability lookup.' },
];

export function renderInvSuppliers(mount) {
  mount.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Suppliers</div><button class="btn btn-primary btn-sm" id="add-supplier-btn">+ Add Supplier</button></div>
      <div class="card-body" id="suppliers-list"></div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">Plug &amp; Play Integrations</div><span class="badge badge-gray">not connected — future integrations</span></div>
      <div class="card-body"><div class="grid-3" id="integrations-grid"></div></div>
    </div>
  `;
  document.getElementById('add-supplier-btn').addEventListener('click', () => openSupplierModal());
  renderSuppliers();
  renderIntegrations();
}

function renderSuppliers() {
  const suppliers = db.suppliers().slice().sort((a, b) => a.name.localeCompare(b.name));
  document.getElementById('suppliers-list').innerHTML = suppliers.length
    ? suppliers.map((s) => `
      <div class="row between" style="padding:var(--s3) 0;border-bottom:1px solid var(--rule)">
        <div>
          <div class="strong" style="color:var(--ink)">${s.name}${s.preferred ? ' <span class="badge badge-green" style="font-size:10px">preferred</span>' : ''}</div>
          <div class="muted" style="font-size:var(--t-13)">${s.contact || ''}${s.phone ? ' · ' + s.phone : ''}${s.email ? ' · ' + s.email : ''}</div>
          <div class="muted" style="font-size:var(--t-13)">Lead time ${s.leadTimeDays ?? '—'} day(s) · Min order ${s.minimumOrder != null ? '$' + s.minimumOrder : '—'} · ${s.paymentTerms || ''}</div>
        </div>
        <button class="btn btn-secondary btn-sm" data-edit-supplier="${s.id}">Edit</button>
      </div>`).join('')
    : '<div class="empty-sub">No suppliers yet.</div>';

  document.querySelectorAll('[data-edit-supplier]').forEach((btn) => btn.addEventListener('click', () => openSupplierModal(btn.dataset.editSupplier)));
}

function openSupplierModal(supplierId) {
  const s = supplierId ? db.supplierById(supplierId) : null;
  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">${s ? 'Edit Supplier' : 'Add Supplier'}</div>
      <button class="icon-btn" id="close-inv-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="field"><label class="label">Name</label><input class="input" id="sup-name" value="${s?.name || ''}"></div>
      <div class="grid-2">
        <div class="field"><label class="label">Contact</label><input class="input" id="sup-contact" value="${s?.contact || ''}"></div>
        <div class="field"><label class="label">Email</label><input class="input" id="sup-email" value="${s?.email || ''}"></div>
        <div class="field"><label class="label">Phone</label><input class="input" id="sup-phone" value="${s?.phone || ''}"></div>
        <div class="field"><label class="label">Lead time (days)</label><input class="input" type="number" id="sup-lead" value="${s?.leadTimeDays ?? ''}"></div>
        <div class="field"><label class="label">Minimum order ($)</label><input class="input" type="number" id="sup-min" value="${s?.minimumOrder ?? ''}"></div>
        <div class="field"><label class="label">Payment terms</label><input class="input" id="sup-terms" value="${s?.paymentTerms || ''}" placeholder="e.g. Net 30"></div>
      </div>
      <label class="row" style="gap:6px;margin-top:var(--s3);font-size:var(--t-13)"><input type="checkbox" id="sup-preferred" ${s?.preferred ? 'checked' : ''}> Preferred supplier</label>
      <div class="muted" style="font-size:var(--t-xs);margin-top:var(--s3)">Order history is a placeholder — POs already created for this supplier show on the Purchase Orders tab.</div>
      ${s ? '<button class="btn btn-danger btn-sm" id="sup-delete" style="margin-top:var(--s3)">Delete Supplier</button>' : ''}
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="sup-cancel">Cancel</button>
      <button class="btn btn-primary" id="sup-save">${s ? 'Save Changes' : 'Add Supplier'}</button>
    </div>
  `);
  document.getElementById('close-inv-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('sup-cancel').addEventListener('click', closeInvDrawer);
  document.getElementById('sup-delete')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog(`Delete ${s.name}?`, { confirmLabel: 'Delete' });
    if (!confirmed) return;
    db.saveSuppliers(db.suppliers().filter((sup) => sup.id !== supplierId));
    toast('Supplier deleted.');
    closeInvDrawer();
    renderSuppliers();
  });
  document.getElementById('sup-save').addEventListener('click', () => {
    const name = document.getElementById('sup-name').value.trim();
    if (!name) { toast('Supplier name is required.', 'error'); return; }
    const fields = {
      name, contact: document.getElementById('sup-contact').value.trim(), email: document.getElementById('sup-email').value.trim(),
      phone: document.getElementById('sup-phone').value.trim(), leadTimeDays: Number(document.getElementById('sup-lead').value) || 0,
      minimumOrder: Number(document.getElementById('sup-min').value) || 0, paymentTerms: document.getElementById('sup-terms').value.trim(),
      preferred: document.getElementById('sup-preferred').checked,
    };
    const suppliers = db.suppliers();
    if (supplierId) {
      Object.assign(suppliers.find((sup) => sup.id === supplierId), fields);
    } else {
      suppliers.push({ id: db.nextId('sup'), partsSupplied: [], ...fields });
    }
    db.saveSuppliers(suppliers);
    toast(supplierId ? 'Supplier updated.' : 'Supplier added.', 'success');
    closeInvDrawer();
    renderSuppliers();
  });
}

function renderIntegrations() {
  document.getElementById('integrations-grid').innerHTML = INTEGRATIONS.map((i) => `
    <div class="stat-card">
      <div class="stat-label">${i.name}</div>
      <div class="muted" style="font-size:var(--t-13);margin:6px 0">${i.desc}</div>
      <span class="badge badge-gray">not connected</span>
    </div>`).join('');
}
