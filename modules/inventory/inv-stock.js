// AutoBook — modules/inventory/inv-stock.js
// Parts table (same db.parts()/db.adjustPartQty single-location behavior
// POS/RO already depend on — untouched) + a per-part drawer showing real
// stock by location, with damage/quarantine actions that go through
// util.adjustStockBucket (always logged).
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import { openInvDrawer, closeInvDrawer, refreshInventoryApp } from './inventory-app.js';

export function renderInvStock(mount) {
  mount.innerHTML = `
    <div id="low-stock-banner" style="margin-bottom:var(--s4)"></div>
    <div class="card">
      <div class="card-head"><div class="card-title">Parts</div><button class="btn btn-primary btn-sm" id="add-part-btn">+ Add Part</button></div>
      <div class="card-body">
        <table class="table">
          <thead><tr><th>Name</th><th>SKU</th><th>Category</th><th class="num">On Hand (Main)</th><th class="num">Total Available</th><th class="num">Reorder Pt</th><th class="num">Cost</th><th class="num">Price</th><th>Vendor</th><th></th></tr></thead>
          <tbody id="parts-table-body"></tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('add-part-btn').addEventListener('click', () => openPartModal());
  render();
}

function render() {
  renderBanner();
  renderTable();
}

function renderBanner() {
  const low = db.lowStockParts();
  document.getElementById('low-stock-banner').innerHTML = low.length
    ? `<div class="alert alert-amber">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>
        <div><b>${low.length} part${low.length === 1 ? '' : 's'} at or below reorder point at Main Shop</b><br>${low.map((p) => p.name).join(', ')}</div>
      </div>`
    : '';
}

function renderTable() {
  const parts = db.parts().slice().sort((a, b) => a.name.localeCompare(b.name));
  document.getElementById('parts-table-body').innerHTML = parts.map((p) => {
    const low = p.qtyOnHand <= p.reorderPoint;
    const total = util.totalAvailableQty(p.id);
    return `
    <tr style="${low ? 'background:var(--amber-lt)' : ''}">
      <td class="strong" style="cursor:pointer" data-open-part="${p.id}">${p.name}</td>
      <td class="muted">${p.sku}</td>
      <td>${p.category}</td>
      <td class="num tnum">
        <div class="qty-adjust" style="justify-content:flex-end">
          <button data-adjust="${p.id}" data-delta="-1">−</button>
          <span style="min-width:28px;text-align:center">${p.qtyOnHand}</span>
          <button data-adjust="${p.id}" data-delta="1">+</button>
        </div>
      </td>
      <td class="num tnum">${total}</td>
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
      util.logInventoryTransaction(btn.dataset.adjust, 'loc_main', 'manual_adjustment', Number(btn.dataset.delta), 'manual', null, 'Quick +/- adjust');
      render();
      refreshInventoryApp();
    });
  });
  document.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openPartModal(btn.dataset.edit)));
  document.querySelectorAll('[data-open-part]').forEach((cell) => cell.addEventListener('click', () => openPartLocationsDrawer(cell.dataset.openPart)));
}

// ---------------------------------------------------------------------------
// Per-part "stock by location" drawer — real numbers from
// util.locationStock for every real location, plus damage/quarantine
// actions (util.markDamaged/markQuarantined — both logged).
// ---------------------------------------------------------------------------
function openPartLocationsDrawer(partId) {
  const part = db.partById(partId);
  const locations = db.inventoryLocations();
  const txs = db.transactionsForPart(partId).slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">${part.name}</div>
      <button class="icon-btn" id="close-inv-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="muted" style="font-size:var(--t-13)">${part.sku} · ${part.category} · Total available: <b class="tnum">${util.totalAvailableQty(partId)}</b></div>

      <div class="section-label" style="margin:var(--s4) 0 var(--s2)">Stock by location</div>
      <div class="loc-grid">
        ${locations.map((loc) => {
          const stock = util.locationStock(partId, loc.id);
          return `
          <div class="loc-card${loc.isPlaceholder ? '' : ''}">
            <div class="strong" style="color:var(--ink);font-size:var(--t-13)">${loc.name}${loc.isPlaceholder ? ' <span class="badge badge-gray" style="font-size:9px">placeholder</span>' : ''}</div>
            <div class="tnum" style="font-size:var(--t-lg);font-weight:800;margin:4px 0">${stock.availableQty}</div>
            <div class="muted" style="font-size:var(--t-xs)">${stock.reservedQty ? stock.reservedQty + ' reserved · ' : ''}${stock.onOrderQty ? stock.onOrderQty + ' on order · ' : ''}${stock.damagedQty ? stock.damagedQty + ' damaged · ' : ''}${stock.quarantinedQty ? stock.quarantinedQty + ' quarantined' : ''}</div>
            ${!loc.isPlaceholder ? `<div class="row" style="gap:4px;margin-top:6px"><button class="btn-ghost" data-damage="${loc.id}" title="Mark 1 damaged" style="font-size:10px;padding:2px 4px">Damage</button><button class="btn-ghost" data-quarantine="${loc.id}" title="Quarantine 1" style="font-size:10px;padding:2px 4px">Quarantine</button></div>` : ''}
          </div>`;
        }).join('')}
      </div>

      <div class="section-label" style="margin:var(--s4) 0 var(--s2)">Recent transactions</div>
      ${txs.length
        ? txs.map((t) => `<div class="row between" style="padding:4px 0;border-bottom:1px solid var(--rule);font-size:var(--t-13)"><span>${t.type.replace(/_/g, ' ')} · ${db.inventoryLocationById(t.locationId)?.name || t.locationId}</span><span class="tnum ${t.quantityChange < 0 ? '' : ''}">${t.quantityChange > 0 ? '+' : ''}${t.quantityChange}</span></div>`).join('')
        : '<div class="empty-sub">No transactions logged for this part yet.</div>'}
    </div>
  `);

  document.getElementById('close-inv-drawer').addEventListener('click', closeInvDrawer);
  document.querySelectorAll('[data-damage]').forEach((btn) => btn.addEventListener('click', async () => {
    const confirmed = await confirmDialog(`Mark 1 unit of ${part.name} as damaged at ${db.inventoryLocationById(btn.dataset.damage).name}?`, { confirmLabel: 'Mark Damaged' });
    if (!confirmed) return;
    try {
      util.markDamaged(partId, btn.dataset.damage, 1, 'Marked damaged from Stock view');
      toast('Marked damaged.', 'success');
      openPartLocationsDrawer(partId);
      refreshInventoryApp();
    } catch (err) { toast(err.message, 'error'); }
  }));
  document.querySelectorAll('[data-quarantine]').forEach((btn) => btn.addEventListener('click', async () => {
    const confirmed = await confirmDialog(`Quarantine 1 unit of ${part.name} at ${db.inventoryLocationById(btn.dataset.quarantine).name}?`, { confirmLabel: 'Quarantine' });
    if (!confirmed) return;
    try {
      util.markQuarantined(partId, btn.dataset.quarantine, 1, 'Quarantined from Stock view');
      toast('Quarantined.', 'success');
      openPartLocationsDrawer(partId);
      refreshInventoryApp();
    } catch (err) { toast(err.message, 'error'); }
  }));
}

// ---------------------------------------------------------------------------
function openPartModal(partId) {
  const part = partId ? db.partById(partId) : null;
  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">${part ? 'Edit Part' : 'Add Part'}</div>
      <button class="icon-btn" id="close-inv-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="field"><label class="label">Name</label><input class="input" id="pf-name" value="${part?.name || ''}"></div>
      <div class="grid-2">
        <div class="field"><label class="label">SKU</label><input class="input" id="pf-sku" value="${part?.sku || ''}"></div>
        <div class="field"><label class="label">Category</label><input class="input" id="pf-category" value="${part?.category || ''}"></div>
        <div class="field"><label class="label">Cost</label><input class="input" type="number" step="0.01" id="pf-cost" value="${part?.cost ?? ''}"></div>
        <div class="field"><label class="label">Price</label><input class="input" type="number" step="0.01" id="pf-price" value="${part?.price ?? ''}"></div>
        <div class="field"><label class="label">Qty on hand (Main Shop)</label><input class="input" type="number" id="pf-qty" value="${part?.qtyOnHand ?? 0}"></div>
        <div class="field"><label class="label">Reorder point</label><input class="input" type="number" id="pf-reorder" value="${part?.reorderPoint ?? 0}"></div>
        <div class="field"><label class="label">Reorder qty</label><input class="input" type="number" id="pf-reorderqty" value="${part?.reorderQty ?? 0}"></div>
        <div class="field"><label class="label">Vendor</label><input class="input" id="pf-vendor" value="${part?.vendor || ''}"></div>
      </div>
      ${part ? '<button class="btn btn-danger btn-sm" id="pf-delete">Delete Part</button>' : ''}
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="pf-save">${part ? 'Save Changes' : 'Add Part'}</button>
    </div>
  `);
  document.getElementById('close-inv-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('modal-cancel').addEventListener('click', closeInvDrawer);
  document.getElementById('pf-save').addEventListener('click', () => savePart(partId));
  document.getElementById('pf-delete')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog(`Delete ${part.name}? This can't be undone.`, { confirmLabel: 'Delete' });
    if (!confirmed) return;
    db.saveParts(db.parts().filter((p) => p.id !== partId));
    toast('Part deleted.');
    closeInvDrawer();
    render();
    refreshInventoryApp();
  });
}

function savePart(partId) {
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { toast('Part name is required.', 'error'); return; }
  const fields = {
    name,
    sku: document.getElementById('pf-sku').value.trim(),
    category: document.getElementById('pf-category').value.trim(),
    cost: Number(document.getElementById('pf-cost').value) || 0,
    price: Number(document.getElementById('pf-price').value) || 0,
    qtyOnHand: Number(document.getElementById('pf-qty').value) || 0,
    reorderPoint: Number(document.getElementById('pf-reorder').value) || 0,
    reorderQty: Number(document.getElementById('pf-reorderqty').value) || 0,
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
  closeInvDrawer();
  render();
  refreshInventoryApp();
}
