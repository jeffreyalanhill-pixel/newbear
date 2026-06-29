// AutoBook — modules/inventory/inv-transfers.js
// Location-to-location transfers. Quantity only actually moves on receipt
// (util.receiveTransfer) — draft/in-transit are just status, no stock change.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import { openInvDrawer, closeInvDrawer, refreshInventoryApp } from './inventory-app.js';

const XFER_BADGE = { draft: 'badge-gray', in_transit: 'badge-amber', received: 'badge-green', canceled: 'badge-red' };

export function renderInvTransfers(mount) {
  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">Transfers</div><button class="btn btn-primary btn-sm" id="add-xfer-btn">+ Create Transfer</button></div>
      <div class="card-body" id="xfer-list"></div>
    </div>
  `;
  document.getElementById('add-xfer-btn').addEventListener('click', openCreateTransfer);
  renderList();
}

function renderList() {
  const transfers = db.inventoryTransfers().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  document.getElementById('xfer-list').innerHTML = transfers.length
    ? transfers.map((x) => {
        const src = db.inventoryLocationById(x.sourceLocationId);
        const dest = db.inventoryLocationById(x.destinationLocationId);
        return `
        <div class="row between" style="padding:var(--s3) 0;border-bottom:1px solid var(--rule)">
          <div>
            <div class="strong" style="color:var(--ink)">${x.number}</div>
            <div class="muted" style="font-size:var(--t-13)">${src?.name || '—'} → ${dest?.name || '—'} · ${x.items.length} item${x.items.length === 1 ? '' : 's'}</div>
          </div>
          <div class="row" style="gap:var(--s2)">
            <span class="badge ${XFER_BADGE[x.status] || 'badge-gray'}">${x.status.replace('_', ' ')}</span>
            <button class="btn btn-secondary btn-sm" data-open-xfer="${x.id}">Open</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty"><div class="empty-title">No transfers yet</div><div class="empty-sub">Move stock between locations here.</div></div>';

  document.querySelectorAll('[data-open-xfer]').forEach((btn) => btn.addEventListener('click', () => openTransferDrawer(btn.dataset.openXfer)));
}

function openTransferDrawer(transferId) {
  const x = db.inventoryTransferById(transferId);
  const src = db.inventoryLocationById(x.sourceLocationId);
  const dest = db.inventoryLocationById(x.destinationLocationId);

  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">${x.number} <span class="badge ${XFER_BADGE[x.status] || 'badge-gray'}" style="margin-left:8px">${x.status.replace('_', ' ')}</span></div>
      <button class="icon-btn" id="close-inv-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="row between" style="padding:4px 0"><span class="muted">Source</span><span>${src?.name || '—'}</span></div>
      <div class="row between" style="padding:4px 0"><span class="muted">Destination</span><span>${dest?.name || '—'}</span></div>
      ${x.notes ? `<div class="muted" style="font-size:var(--t-13);margin-top:4px">${x.notes}</div>` : ''}
      <div class="section-label" style="margin:var(--s4) 0 var(--s2)">Items</div>
      ${x.items.map((it) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)"><span>${db.partById(it.partId)?.name || it.partId}</span><span class="tnum">${it.qty}</span></div>`).join('')}
    </div>
    <div class="modal-foot">
      ${x.status === 'draft' ? '<button class="btn btn-danger" id="xfer-cancel" style="margin-right:auto">Cancel</button>' : ''}
      ${x.status === 'draft' ? '<button class="btn btn-secondary" id="xfer-in-transit">Mark In Transit</button>' : ''}
      ${['draft', 'in_transit'].includes(x.status) ? '<button class="btn btn-primary" id="xfer-receive">Receive Transfer</button>' : ''}
      <button class="btn btn-secondary" id="xfer-done">Close</button>
    </div>
  `);

  document.getElementById('close-inv-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('xfer-done').addEventListener('click', closeInvDrawer);
  document.getElementById('xfer-cancel')?.addEventListener('click', () => {
    util.cancelTransfer(transferId);
    toast('Transfer canceled.');
    closeInvDrawer();
    renderList();
    refreshInventoryApp();
  });
  document.getElementById('xfer-in-transit')?.addEventListener('click', () => {
    util.markTransferInTransit(transferId);
    toast('Marked in transit.', 'success');
    openTransferDrawer(transferId);
    renderList();
  });
  document.getElementById('xfer-receive')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog(`Receive ${x.number}? This moves stock from ${src?.name} to ${dest?.name}.`, { confirmLabel: 'Receive', danger: false });
    if (!confirmed) return;
    try {
      util.receiveTransfer(transferId);
      toast('Transfer received — stock updated at both locations.', 'success');
      closeInvDrawer();
      renderList();
      refreshInventoryApp();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function openCreateTransfer() {
  const locations = db.inventoryLocations().filter((l) => !l.isPlaceholder);
  const parts = db.parts().slice().sort((a, b) => a.name.localeCompare(b.name));

  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">Create Transfer</div>
      <button class="icon-btn" id="close-inv-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="grid-2">
        <div class="field"><label class="label">Source location</label><select class="select" id="xfer-src">${locations.map((l) => `<option value="${l.id}">${l.name}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Destination location</label><select class="select" id="xfer-dest">${locations.map((l) => `<option value="${l.id}">${l.name}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Part</label><select class="select" id="xfer-part">${parts.map((p) => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}</select></div>
        <div class="field"><label class="label">Quantity</label><input class="input" type="number" min="1" id="xfer-qty" value="1"></div>
      </div>
      <div class="muted" style="font-size:var(--t-xs);margin-top:var(--s2)">Single-line transfer for this demo foundation.</div>
      <div class="field" style="margin-top:var(--s3)"><label class="label">Notes</label><textarea class="textarea" id="xfer-notes"></textarea></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="xfer-cancel-create">Cancel</button>
      <button class="btn btn-primary" id="xfer-create">Create Transfer</button>
    </div>
  `);
  document.getElementById('close-inv-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('xfer-cancel-create').addEventListener('click', closeInvDrawer);
  document.getElementById('xfer-create').addEventListener('click', () => {
    const sourceLocationId = document.getElementById('xfer-src').value;
    const destinationLocationId = document.getElementById('xfer-dest').value;
    const partId = document.getElementById('xfer-part').value;
    const qty = Number(document.getElementById('xfer-qty').value) || 0;
    if (sourceLocationId === destinationLocationId) { toast('Source and destination must be different.', 'error'); return; }
    if (qty <= 0) { toast('Quantity must be greater than 0.', 'error'); return; }
    const available = util.locationStock(partId, sourceLocationId).availableQty;
    if (qty > available) { toast(`Only ${available} available at the source location.`, 'error'); return; }
    const xfer = util.createTransfer({ sourceLocationId, destinationLocationId, items: [{ partId, qty }], notes: document.getElementById('xfer-notes').value.trim() });
    toast(`${xfer.number} created.`, 'success');
    closeInvDrawer();
    renderList();
    refreshInventoryApp();
  });
}
