// AutoBook — modules/invoices/inv-items.js
// Items / Services catalog — reusable charges for invoices/estimates.
// Separate entity from db.services() (RO-specific). Real CRUD via
// util.createInvoiceItem/updateInvoiceItem/setInvoiceItemActive.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast } from '../../lib/nav.js';
import { openInvDrawer, closeInvDrawer } from './invoices-app.js';

const TYPES = [
  { value: 'labor', label: 'Labor Service' }, { value: 'part', label: 'Part' }, { value: 'tire', label: 'Tire' },
  { value: 'fluid', label: 'Fluid' }, { value: 'fee', label: 'Fee' }, { value: 'discount', label: 'Discount' },
  { value: 'shop_supply', label: 'Shop Supply' }, { value: 'misc_charge', label: 'Misc Charge' },
];

export function renderInvItems(mount) {
  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">Items / Services</div><button class="btn btn-primary btn-sm" id="add-item-btn">+ Add Item / Service</button></div>
      <div class="card-body" id="item-list"></div>
    </div>
  `;
  document.getElementById('add-item-btn').addEventListener('click', () => openItemForm());
  renderList();
}

function renderList() {
  const items = db.invoiceItems().slice().sort((a, b) => a.name.localeCompare(b.name));
  document.getElementById('item-list').innerHTML = `
    <table class="table">
      <thead><tr><th>Name</th><th>Type</th><th>SKU</th><th class="num">Price</th><th>Taxable</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${items.length ? items.map((i) => `
          <tr style="${i.active ? '' : 'opacity:.5'}">
            <td class="strong">${i.name}</td>
            <td>${TYPES.find((t) => t.value === i.type)?.label || i.type}</td>
            <td class="muted">${i.sku || '—'}</td>
            <td class="num tnum">${util.fmtMoney(i.defaultPrice)}</td>
            <td>${i.taxable ? 'Yes' : 'No'}</td>
            <td><span class="badge ${i.active ? 'badge-green' : 'badge-gray'}">${i.active ? 'active' : 'inactive'}</span></td>
            <td><button class="btn btn-secondary btn-sm" data-edit-item="${i.id}">Edit</button></td>
          </tr>`).join('') : '<tr><td colspan="7"><div class="empty-sub">No items yet.</div></td></tr>'}
      </tbody>
    </table>
  `;
  document.querySelectorAll('[data-edit-item]').forEach((btn) => btn.addEventListener('click', () => openItemForm(btn.dataset.editItem)));
}

function openItemForm(itemId) {
  const item = itemId ? db.invoiceItemById(itemId) : null;
  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">${item ? 'Edit Item' : 'Add Item / Service'}</div>
      <button class="icon-btn" id="close-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="field"><label class="label">Name</label><input class="input" id="it-name" value="${item?.name || ''}"></div>
      <div class="grid-2">
        <div class="field"><label class="label">Type</label><select class="select" id="it-type">${TYPES.map((t) => `<option value="${t.value}" ${item?.type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}</select></div>
        <div class="field"><label class="label">SKU / item code</label><input class="input" id="it-sku" value="${item?.sku || ''}"></div>
        <div class="field"><label class="label">Default price</label><input class="input" type="number" step="0.01" id="it-price" value="${item?.defaultPrice ?? ''}"></div>
        <div class="field"><label class="label">Default cost <span class="badge badge-gray" style="font-size:9px">placeholder</span></label><input class="input" type="number" step="0.01" id="it-cost" value="${item?.defaultCost ?? ''}"></div>
      </div>
      <label class="row" style="gap:6px;margin-top:var(--s3);font-size:var(--t-13)"><input type="checkbox" id="it-taxable" ${item?.taxable ? 'checked' : ''}> Taxable</label>
      ${item ? `<label class="row" style="gap:6px;margin-top:var(--s2);font-size:var(--t-13)"><input type="checkbox" id="it-active" ${item.active ? 'checked' : ''}> Active</label>` : ''}
      <div class="muted" style="font-size:var(--t-xs);margin-top:var(--s3)">Linked inventory item is a placeholder link — no live sync with Inventory stock yet.</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="it-cancel">Cancel</button>
      <button class="btn btn-primary" id="it-save">${item ? 'Save Changes' : 'Add Item'}</button>
    </div>
  `);
  document.getElementById('close-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('it-cancel').addEventListener('click', closeInvDrawer);
  document.getElementById('it-save').addEventListener('click', () => {
    const name = document.getElementById('it-name').value.trim();
    if (!name) { toast('Item name is required.', 'error'); return; }
    const fields = {
      name, type: document.getElementById('it-type').value, sku: document.getElementById('it-sku').value.trim(),
      defaultPrice: Number(document.getElementById('it-price').value) || 0, defaultCost: Number(document.getElementById('it-cost').value) || 0,
      taxable: document.getElementById('it-taxable').checked,
    };
    if (item) {
      fields.active = document.getElementById('it-active').checked;
      util.updateInvoiceItem(item.id, fields);
    } else {
      util.createInvoiceItem(fields);
    }
    toast(item ? 'Item updated.' : 'Item added.', 'success');
    closeInvDrawer();
    renderList();
  });
}
