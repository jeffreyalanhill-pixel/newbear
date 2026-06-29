// AutoBook — modules/inventory/inv-returns-counts.js
// Returns workflow (create -> choose disposition -> util.postReturnDisposition
// updates real stock + logs a transaction) and Cycle Counts (create ->
// enter counted qty -> util.postCycleCount posts the variance as a logged
// transaction). Combined into one tab to keep the sub-app's tab count sane.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import { openInvDrawer, closeInvDrawer, refreshInventoryApp } from './inventory-app.js';

const RETURN_TYPES = [
  { value: 'customer_return', label: 'Customer Return' },
  { value: 'supplier_return', label: 'Supplier Return' },
  { value: 'core_return', label: 'Core Return' },
  { value: 'warranty_return', label: 'Warranty Return' },
  { value: 'damaged_return', label: 'Damaged Return' },
];
const DISPOSITIONS = [
  { value: 'return_to_stock', label: 'Return to Stock' },
  { value: 'quarantine', label: 'Quarantine' },
  { value: 'write_off', label: 'Write Off' },
  { value: 'send_to_supplier', label: 'Send to Supplier' },
  { value: 'exchange', label: 'Exchange' },
  { value: 'refund', label: 'Refund (placeholder)' },
];
const RETURN_BADGE = { pending: 'badge-amber', posted: 'badge-green' };
const COUNT_BADGE = { draft: 'badge-gray', counted: 'badge-blue', posted: 'badge-green' };

export function renderInvReturnsCounts(mount) {
  mount.innerHTML = `
    <div class="grid-2" style="align-items:start;gap:var(--s4)">
      <div class="card">
        <div class="card-head"><div class="card-title">Returns</div><button class="btn btn-primary btn-sm" id="add-return-btn">+ Create Return</button></div>
        <div class="card-body" id="returns-list"></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Cycle Counts</div><button class="btn btn-primary btn-sm" id="add-count-btn">+ Start Cycle Count</button></div>
        <div class="card-body" id="counts-list"></div>
      </div>
    </div>
  `;
  document.getElementById('add-return-btn').addEventListener('click', openCreateReturn);
  document.getElementById('add-count-btn').addEventListener('click', openCreateCount);
  renderReturns();
  renderCounts();
}

// ---------------------------------------------------------------------------
function renderReturns() {
  const returns = db.returns().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  document.getElementById('returns-list').innerHTML = returns.length
    ? returns.map((r) => {
        const part = db.partById(r.partId);
        return `
        <div class="row between" style="padding:var(--s3) 0;border-bottom:1px solid var(--rule)">
          <div>
            <div class="strong" style="color:var(--ink)">${r.number} <span class="muted" style="font-size:var(--t-13)">· ${RETURN_TYPES.find((t) => t.value === r.type)?.label || r.type}</span></div>
            <div class="muted" style="font-size:var(--t-13)">${part?.name || r.partId} × ${r.qty} · ${db.inventoryLocationById(r.locationId)?.name || r.locationId}</div>
          </div>
          <div class="row" style="gap:var(--s2)">
            <span class="badge ${RETURN_BADGE[r.status] || 'badge-gray'}">${r.disposition ? r.disposition.replace(/_/g, ' ') : r.status}</span>
            ${r.status === 'pending' ? `<button class="btn btn-secondary btn-sm" data-open-return="${r.id}">Choose Disposition</button>` : ''}
          </div>
        </div>`;
      }).join('')
    : '<div class="empty-sub">No returns logged yet.</div>';

  document.querySelectorAll('[data-open-return]').forEach((btn) => btn.addEventListener('click', () => openReturnDisposition(btn.dataset.openReturn)));
}

function openCreateReturn() {
  const parts = db.parts().slice().sort((a, b) => a.name.localeCompare(b.name));
  const locations = db.inventoryLocations().filter((l) => !l.isPlaceholder);
  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">Create Return</div>
      <button class="icon-btn" id="close-inv-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="grid-2">
        <div class="field"><label class="label">Return type</label><select class="select" id="ret-type">${RETURN_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Location</label><select class="select" id="ret-location">${locations.map((l) => `<option value="${l.id}">${l.name}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Part</label><select class="select" id="ret-part">${parts.map((p) => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}</select></div>
        <div class="field"><label class="label">Quantity</label><input class="input" type="number" min="1" id="ret-qty" value="1"></div>
      </div>
      <div class="field" style="margin-top:var(--s3)"><label class="label">Reason</label><input class="input" id="ret-reason" placeholder="e.g. Wrong part ordered"></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="ret-cancel">Cancel</button>
      <button class="btn btn-primary" id="ret-create">Create Return</button>
    </div>
  `);
  document.getElementById('close-inv-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('ret-cancel').addEventListener('click', closeInvDrawer);
  document.getElementById('ret-create').addEventListener('click', () => {
    const qty = Number(document.getElementById('ret-qty').value) || 0;
    if (qty <= 0) { toast('Quantity must be greater than 0.', 'error'); return; }
    const ret = util.createReturn({
      type: document.getElementById('ret-type').value, partId: document.getElementById('ret-part').value,
      qty, locationId: document.getElementById('ret-location').value, reason: document.getElementById('ret-reason').value.trim(),
    });
    toast(`${ret.number} created — choose a disposition to update stock.`, 'success');
    closeInvDrawer();
    renderReturns();
    refreshInventoryApp();
  });
}

function openReturnDisposition(returnId) {
  const ret = db.returnById(returnId);
  const part = db.partById(ret.partId);
  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">${ret.number}</div>
      <button class="icon-btn" id="close-inv-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="row between" style="padding:4px 0"><span class="muted">Part</span><span>${part?.name}</span></div>
      <div class="row between" style="padding:4px 0"><span class="muted">Quantity</span><span>${ret.qty}</span></div>
      <div class="row between" style="padding:4px 0"><span class="muted">Location</span><span>${db.inventoryLocationById(ret.locationId)?.name}</span></div>
      ${ret.reason ? `<div class="muted" style="font-size:var(--t-13);margin-top:4px">Reason: ${ret.reason}</div>` : ''}
      <div class="field" style="margin-top:var(--s4)">
        <label class="label">Disposition</label>
        <select class="select" id="ret-disposition">${DISPOSITIONS.map((d) => `<option value="${d.value}">${d.label}</option>`).join('')}</select>
      </div>
      <div class="muted" style="font-size:var(--t-xs);margin-top:var(--s2)">Return to Stock/Exchange add the qty back to available. Quarantine moves it to quarantined (not sellable). Write Off/Send to Supplier/Refund remove it from your stock with no net inventory gain — still logged.</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="ret-disp-cancel">Cancel</button>
      <button class="btn btn-primary" id="ret-disp-confirm">Post Disposition</button>
    </div>
  `);
  document.getElementById('close-inv-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('ret-disp-cancel').addEventListener('click', closeInvDrawer);
  document.getElementById('ret-disp-confirm').addEventListener('click', () => {
    try {
      util.postReturnDisposition(returnId, document.getElementById('ret-disposition').value);
      toast('Disposition posted.', 'success');
      closeInvDrawer();
      renderReturns();
      refreshInventoryApp();
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ---------------------------------------------------------------------------
function renderCounts() {
  const counts = db.cycleCounts().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  document.getElementById('counts-list').innerHTML = counts.length
    ? counts.map((c) => `
      <div class="row between" style="padding:var(--s3) 0;border-bottom:1px solid var(--rule)">
        <div>
          <div class="strong" style="color:var(--ink)">${c.number}</div>
          <div class="muted" style="font-size:var(--t-13)">${db.inventoryLocationById(c.locationId)?.name || c.locationId} · ${db.itemsForCycleCount(c.id).length} item${db.itemsForCycleCount(c.id).length === 1 ? '' : 's'}</div>
        </div>
        <div class="row" style="gap:var(--s2)">
          <span class="badge ${COUNT_BADGE[c.status] || 'badge-gray'}">${c.status}</span>
          ${c.status !== 'posted' ? `<button class="btn btn-secondary btn-sm" data-open-count="${c.id}">Open</button>` : ''}
        </div>
      </div>`).join('')
    : '<div class="empty-sub">No cycle counts started yet.</div>';

  document.querySelectorAll('[data-open-count]').forEach((btn) => btn.addEventListener('click', () => openCountDrawer(btn.dataset.openCount)));
}

function openCreateCount() {
  const locations = db.inventoryLocations().filter((l) => !l.isPlaceholder);
  const parts = db.parts().slice().sort((a, b) => a.name.localeCompare(b.name));
  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">Start Cycle Count</div>
      <button class="icon-btn" id="close-inv-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="field"><label class="label">Location</label><select class="select" id="cc-location">${locations.map((l) => `<option value="${l.id}">${l.name}</option>`).join('')}</select></div>
      <div class="field" style="margin-top:var(--s3)">
        <label class="label">Parts to count</label>
        <div class="grid-2" style="max-height:220px;overflow-y:auto">
          ${parts.map((p) => `<label class="row" style="gap:6px;font-size:var(--t-13)"><input type="checkbox" data-cc-part="${p.id}"> ${p.name}</label>`).join('')}
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="cc-cancel">Cancel</button>
      <button class="btn btn-primary" id="cc-start">Start Count</button>
    </div>
  `);
  document.getElementById('close-inv-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('cc-cancel').addEventListener('click', closeInvDrawer);
  document.getElementById('cc-start').addEventListener('click', () => {
    const locationId = document.getElementById('cc-location').value;
    const partIds = [...document.querySelectorAll('[data-cc-part]:checked')].map((el) => el.dataset.ccPart);
    if (!partIds.length) { toast('Select at least one part to count.', 'error'); return; }
    const count = util.createCycleCount(locationId, partIds);
    toast(`${count.number} started.`, 'success');
    closeInvDrawer();
    renderCounts();
    openCountDrawer(count.id);
  });
}

function openCountDrawer(countId) {
  const count = db.cycleCountById(countId);
  const items = db.itemsForCycleCount(countId);
  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">${count.number} <span class="badge ${COUNT_BADGE[count.status] || 'badge-gray'}" style="margin-left:8px">${count.status}</span></div>
      <button class="icon-btn" id="close-inv-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="muted" style="font-size:var(--t-13)">${db.inventoryLocationById(count.locationId)?.name}</div>
      <table class="li-table" style="margin-top:var(--s3)">
        <thead><tr><th>Part</th><th>Expected</th><th>Counted</th><th>Variance</th></tr></thead>
        <tbody>
          ${items.map((i) => {
            const variance = i.countedQty != null ? i.countedQty - i.expectedQty : null;
            return `<tr>
              <td>${db.partById(i.partId)?.name || i.partId}</td>
              <td>${i.expectedQty}</td>
              <td>${count.status === 'posted' ? (i.countedQty ?? '—') : `<input class="input" type="number" min="0" value="${i.countedQty ?? i.expectedQty}" data-count-input="${i.id}" style="width:70px;padding:4px 6px">`}</td>
              <td class="${variance ? (variance < 0 ? '' : '') : ''}">${variance != null ? (variance > 0 ? '+' : '') + variance : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="modal-foot">
      ${count.status !== 'posted' ? '<button class="btn btn-secondary" id="cc-save-counts">Save Counts</button>' : ''}
      ${count.status !== 'posted' ? '<button class="btn btn-primary" id="cc-post">Post Adjustment</button>' : ''}
      <button class="btn btn-secondary" id="cc-done">Close</button>
    </div>
  `);
  document.getElementById('close-inv-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('cc-done').addEventListener('click', closeInvDrawer);
  document.getElementById('cc-save-counts')?.addEventListener('click', () => {
    document.querySelectorAll('[data-count-input]').forEach((input) => {
      util.setCountedQty(input.dataset.countInput, Number(input.value) || 0);
    });
    toast('Counts saved.', 'success');
    openCountDrawer(countId);
    renderCounts();
  });
  document.getElementById('cc-post')?.addEventListener('click', async () => {
    document.querySelectorAll('[data-count-input]').forEach((input) => {
      util.setCountedQty(input.dataset.countInput, Number(input.value) || 0);
    });
    const confirmed = await confirmDialog(`Post ${count.number}? This adjusts inventory for any variance and logs a transaction per item.`, { confirmLabel: 'Post', danger: false });
    if (!confirmed) return;
    util.postCycleCount(countId);
    toast('Cycle count posted.', 'success');
    closeInvDrawer();
    renderCounts();
    refreshInventoryApp();
  });
}
