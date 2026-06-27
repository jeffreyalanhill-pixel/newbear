// AutoBook — modules/inventory.js (§11.11)
// Parts table with low-stock banner, add/edit, and quick qty +/- adjust via
// db.adjustPartQty (the same function repair-orders.js/pos.js use when a
// part is added to/removed from a line item — so stock stays consistent).

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import { renderNav, toast, confirmDialog } from '../lib/nav.js';

export function renderInventory() {
  renderNav('#icon-rail', 'inventory.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();
  document.getElementById('add-part-btn').addEventListener('click', () => openPartModal());
  document.getElementById('inv-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'inv-overlay') closeModal();
  });
  render();
}

function render() {
  renderBanner();
  renderTable();
}

function renderBanner() {
  const low = db.lowStockParts();
  const banner = document.getElementById('low-stock-banner');
  banner.innerHTML = low.length
    ? `<div class="alert alert-amber" style="margin-bottom:var(--s4)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>
        <div><b>${low.length} part${low.length === 1 ? '' : 's'} at or below reorder point</b><br>${low.map((p) => p.name).join(', ')}</div>
      </div>`
    : '';
}

function renderTable() {
  const parts = db.parts().slice().sort((a, b) => a.name.localeCompare(b.name));
  document.getElementById('parts-table-body').innerHTML = parts.map((p) => {
    const low = p.qtyOnHand <= p.reorderPoint;
    return `
    <tr style="${low ? 'background:var(--amber-lt)' : ''}">
      <td class="strong">${p.name}</td>
      <td class="muted">${p.sku}</td>
      <td>${p.category}</td>
      <td class="num tnum">
        <div class="qty-adjust" style="justify-content:flex-end">
          <button data-adjust="${p.id}" data-delta="-1">−</button>
          <span style="min-width:28px;text-align:center">${p.qtyOnHand}</span>
          <button data-adjust="${p.id}" data-delta="1">+</button>
        </div>
      </td>
      <td class="num tnum">${p.reorderPoint}</td>
      <td class="num tnum">${util.fmtMoney(p.cost)}</td>
      <td class="num tnum">${util.fmtMoney(p.price)}</td>
      <td>${p.vendor}</td>
      <td><button class="btn btn-secondary btn-sm" data-edit="${p.id}">Edit</button></td>
    </tr>`;
  }).join('');

  document.querySelectorAll('[data-adjust]').forEach((btn) => {
    btn.addEventListener('click', () => {
      db.adjustPartQty(btn.dataset.adjust, Number(btn.dataset.delta));
      render();
    });
  });
  document.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openPartModal(btn.dataset.edit));
  });
}

function openPartModal(partId) {
  const part = partId ? db.partById(partId) : null;
  document.getElementById('inv-modal').innerHTML = `
    <div class="modal-head">
      <div class="modal-title">${part ? 'Edit Part' : 'Add Part'}</div>
      <button class="icon-btn" id="modal-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="field"><label class="label">Name</label><input class="input" id="pf-name" value="${part?.name || ''}"></div>
      <div class="grid-2">
        <div class="field"><label class="label">SKU</label><input class="input" id="pf-sku" value="${part?.sku || ''}"></div>
        <div class="field"><label class="label">Category</label><input class="input" id="pf-category" value="${part?.category || ''}"></div>
        <div class="field"><label class="label">Cost</label><input class="input" type="number" step="0.01" id="pf-cost" value="${part?.cost ?? ''}"></div>
        <div class="field"><label class="label">Price</label><input class="input" type="number" step="0.01" id="pf-price" value="${part?.price ?? ''}"></div>
        <div class="field"><label class="label">Qty on hand</label><input class="input" type="number" id="pf-qty" value="${part?.qtyOnHand ?? 0}"></div>
        <div class="field"><label class="label">Reorder point</label><input class="input" type="number" id="pf-reorder" value="${part?.reorderPoint ?? 0}"></div>
        <div class="field" style="grid-column:1/-1"><label class="label">Vendor</label><input class="input" id="pf-vendor" value="${part?.vendor || ''}"></div>
      </div>
      ${part ? '<button class="btn btn-danger btn-sm" id="pf-delete">Delete Part</button>' : ''}
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="pf-save">${part ? 'Save Changes' : 'Add Part'}</button>
    </div>
  `;
  document.getElementById('inv-overlay').classList.add('open');
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('pf-save').addEventListener('click', () => savePart(partId));
  document.getElementById('pf-delete')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog(`Delete ${part.name}? This can't be undone.`, { confirmLabel: 'Delete' });
    if (!confirmed) return;
    const parts = db.parts().filter((p) => p.id !== partId);
    db.saveParts(parts);
    toast('Part deleted.');
    closeModal();
    render();
  });
}

function savePart(partId) {
  const name = document.getElementById('pf-name').value.trim();
  if (!name) {
    toast('Part name is required.', 'error');
    return;
  }
  const fields = {
    name,
    sku: document.getElementById('pf-sku').value.trim(),
    category: document.getElementById('pf-category').value.trim(),
    cost: Number(document.getElementById('pf-cost').value) || 0,
    price: Number(document.getElementById('pf-price').value) || 0,
    qtyOnHand: Number(document.getElementById('pf-qty').value) || 0,
    reorderPoint: Number(document.getElementById('pf-reorder').value) || 0,
    vendor: document.getElementById('pf-vendor').value.trim(),
  };
  const parts = db.parts();
  if (partId) {
    const part = parts.find((p) => p.id === partId);
    Object.assign(part, fields);
  } else {
    parts.push({ id: db.nextId('p'), ...fields });
  }
  db.saveParts(parts);
  toast(partId ? 'Part updated.' : 'Part added.', 'success');
  closeModal();
  render();
}

function closeModal() {
  document.getElementById('inv-overlay').classList.remove('open');
}
