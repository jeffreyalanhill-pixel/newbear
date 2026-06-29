// AutoBook — modules/inventory/inv-purchase-orders.js
// Purchase order list + create form + receive/partial-receive/backorder/
// close/cancel actions. Receiving goes through util.receivePOItem, which
// always increases real stock at the PO's destination and logs a
// transaction — never a silent number change.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import { openInvDrawer, closeInvDrawer, refreshInventoryApp } from './inventory-app.js';

const PO_BADGE = { open: 'badge-blue', received: 'badge-green', backordered: 'badge-amber', closed: 'badge-gray', canceled: 'badge-red' };

export function renderInvPurchaseOrders(mount) {
  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">Purchase Orders</div><button class="btn btn-primary btn-sm" id="add-po-btn">+ Create PO</button></div>
      <div class="card-body" id="po-list"></div>
    </div>
  `;
  document.getElementById('add-po-btn').addEventListener('click', openCreatePO);
  renderList();
}

function renderList() {
  const pos = db.purchaseOrders().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  document.getElementById('po-list').innerHTML = pos.length
    ? `<table class="table">
        <thead><tr><th>PO #</th><th>Supplier</th><th>Destination</th><th>Status</th><th>Expected</th><th class="num">Lines</th><th></th></tr></thead>
        <tbody>
          ${pos.map((po) => {
            const supplier = db.supplierById(po.supplierId);
            const dest = db.inventoryLocationById(po.destinationLocationId);
            return `<tr>
              <td class="strong">${po.number}</td>
              <td>${supplier?.name || '—'}</td>
              <td>${dest?.name || '—'}</td>
              <td><span class="badge ${PO_BADGE[po.status] || 'badge-gray'}">${po.status}</span></td>
              <td>${po.expectedDate ? util.fmtDate(po.expectedDate) : '—'}</td>
              <td class="num">${db.itemsForPO(po.id).length}</td>
              <td><button class="btn btn-secondary btn-sm" data-open-po="${po.id}">Open</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`
    : '<div class="empty"><div class="empty-title">No purchase orders yet</div><div class="empty-sub">Create one to start tracking incoming stock.</div></div>';

  document.querySelectorAll('[data-open-po]').forEach((btn) => btn.addEventListener('click', () => openPODrawer(btn.dataset.openPo)));
}

function openPODrawer(poId) {
  const po = db.purchaseOrderById(poId);
  const supplier = db.supplierById(po.supplierId);
  const dest = db.inventoryLocationById(po.destinationLocationId);
  const items = db.itemsForPO(poId);
  const locked = ['closed', 'canceled'].includes(po.status);

  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">${po.number} <span class="badge ${PO_BADGE[po.status] || 'badge-gray'}" style="margin-left:8px">${po.status}</span></div>
      <button class="icon-btn" id="close-inv-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="row between" style="padding:4px 0"><span class="muted">Supplier</span><span>${supplier?.name || '—'}</span></div>
      <div class="row between" style="padding:4px 0"><span class="muted">Destination</span><span>${dest?.name || '—'}</span></div>
      <div class="row between" style="padding:4px 0"><span class="muted">Expected</span><span>${po.expectedDate ? util.fmtDate(po.expectedDate) : '—'}</span></div>
      ${po.notes ? `<div class="muted" style="font-size:var(--t-13);margin-top:4px">${po.notes}</div>` : ''}

      <div class="section-label" style="margin:var(--s4) 0 var(--s2)">Line items</div>
      <table class="li-table">
        <thead><tr><th>Part</th><th>Ordered</th><th>Received</th><th>Backordered</th><th>Receive qty</th><th></th></tr></thead>
        <tbody>
          ${items.map((i) => {
            const part = db.partById(i.partId);
            const remaining = i.qtyOrdered - i.qtyReceived;
            return `<tr>
              <td>${part?.name || i.partId}</td>
              <td>${i.qtyOrdered}</td>
              <td>${i.qtyReceived}</td>
              <td>${i.backordered || 0}</td>
              <td>${!locked && remaining > 0 ? `<input class="input" type="number" min="1" max="${remaining}" value="${remaining}" id="receive-qty-${i.partId}" style="width:70px;padding:4px 6px">` : ''}</td>
              <td>
                ${!locked && remaining > 0 ? `<button class="btn btn-secondary btn-sm" data-receive="${i.partId}">Receive</button>` : ''}
                ${!locked && remaining > 0 ? `<button class="btn-ghost" data-backorder="${i.partId}" data-remaining="${remaining}" style="font-size:11px">Backorder</button>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="modal-foot">
      ${!locked ? '<button class="btn btn-danger" id="po-cancel" style="margin-right:auto">Cancel PO</button>' : ''}
      ${!locked ? '<button class="btn btn-secondary" id="po-close">Close PO</button>' : ''}
      <button class="btn btn-secondary" id="po-done">Close</button>
    </div>
  `);

  document.getElementById('close-inv-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('po-done').addEventListener('click', closeInvDrawer);
  document.getElementById('po-close')?.addEventListener('click', () => {
    util.closePurchaseOrder(poId);
    toast('PO closed.', 'success');
    openPODrawer(poId);
    renderList();
    refreshInventoryApp();
  });
  document.getElementById('po-cancel')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog(`Cancel ${po.number}? This does not reverse any items already received.`, { confirmLabel: 'Cancel PO' });
    if (!confirmed) return;
    util.cancelPurchaseOrder(poId);
    toast('PO canceled.', 'success');
    closeInvDrawer();
    renderList();
    refreshInventoryApp();
  });
  document.querySelectorAll('[data-receive]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const qty = Number(document.getElementById(`receive-qty-${btn.dataset.receive}`)?.value) || 0;
      if (qty <= 0) { toast('Enter a quantity to receive.', 'error'); return; }
      try {
        util.receivePOItem(poId, btn.dataset.receive, qty);
        toast(`Received ${qty} unit(s).`, 'success');
        openPODrawer(poId);
        renderList();
        refreshInventoryApp();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
  document.querySelectorAll('[data-backorder]').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        util.markPOItemBackordered(poId, btn.dataset.backorder, Number(btn.dataset.remaining));
        toast('Marked backordered.', 'success');
        openPODrawer(poId);
        renderList();
        refreshInventoryApp();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

function openCreatePO() {
  const suppliers = db.suppliers();
  const locations = db.inventoryLocations().filter((l) => !l.isPlaceholder);
  const parts = db.parts().slice().sort((a, b) => a.name.localeCompare(b.name));

  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">Create Purchase Order</div>
      <button class="icon-btn" id="close-inv-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="grid-2">
        <div class="field"><label class="label">Supplier</label><select class="select" id="po-supplier"><option value="">Select…</option>${suppliers.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Destination location</label><select class="select" id="po-dest">${locations.map((l) => `<option value="${l.id}">${l.name}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Expected date</label><input class="input" type="date" id="po-expected"></div>
        <div class="field"><label class="label">Part</label><select class="select" id="po-part">${parts.map((p) => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}</select></div>
        <div class="field"><label class="label">Quantity</label><input class="input" type="number" min="1" id="po-qty" value="10"></div>
        <div class="field"><label class="label">Unit cost</label><input class="input" type="number" step="0.01" id="po-cost" value=""></div>
      </div>
      <div class="muted" style="font-size:var(--t-xs);margin-top:var(--s2)">Single-line PO for this demo foundation — add more lines later from the PO detail view.</div>
      <div class="field" style="margin-top:var(--s3)"><label class="label">Notes</label><textarea class="textarea" id="po-notes"></textarea></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="po-cancel-create">Cancel</button>
      <button class="btn btn-primary" id="po-create">Create PO</button>
    </div>
  `);
  document.getElementById('close-inv-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('po-cancel-create').addEventListener('click', closeInvDrawer);
  document.getElementById('po-part').addEventListener('change', (e) => {
    document.getElementById('po-cost').value = db.partById(e.target.value)?.cost || '';
  });
  document.getElementById('po-create').addEventListener('click', () => {
    const supplierId = document.getElementById('po-supplier').value;
    const partId = document.getElementById('po-part').value;
    const qty = Number(document.getElementById('po-qty').value) || 0;
    if (!supplierId || !partId || qty <= 0) { toast('Supplier, part, and a quantity greater than 0 are required.', 'error'); return; }
    const po = util.createPurchaseOrder({
      supplierId, destinationLocationId: document.getElementById('po-dest').value,
      expectedDate: document.getElementById('po-expected').value, notes: document.getElementById('po-notes').value.trim(),
      items: [{ partId, qty, unitCost: Number(document.getElementById('po-cost').value) || undefined }],
    });
    toast(`${po.number} created.`, 'success');
    closeInvDrawer();
    renderList();
    refreshInventoryApp();
  });
}
