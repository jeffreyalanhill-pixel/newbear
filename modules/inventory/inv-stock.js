// AutoBook — modules/inventory/inv-stock.js
// Upgraded Stock tab: search, sort, filter, grouping, export, brand/notes/status,
// clickable part detail drawer, and expanded Add/Edit form.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import { openInvDrawer, closeInvDrawer, refreshInventoryApp } from './inventory-app.js';
import { downloadCSV, copyToClipboard, printHTML } from '../../lib/export.js';

// ---------------------------------------------------------------------------
// Schema migration — backfill brand/notes/status/updatedAt on parts that were
// stored before these fields existed, and add new demo parts if missing.
// ---------------------------------------------------------------------------
const _PART_META = {
  p_oilfilter:   { brand: 'Wix',           notes: 'Change with every oil service.',         status: 'active' },
  p_5qtsyn:      { brand: 'Mobil 1',        notes: '5W-30 synthetic — best seller.',          status: 'active' },
  p_pads_front:  { brand: 'Monroe',         notes: 'Semi-metallic — good for daily drivers.', status: 'active' },
  p_pads_rear:   { brand: 'Monroe',         notes: '',                                        status: 'active' },
  p_rotors:      { brand: 'ACDelco',        notes: '',                                        status: 'active' },
  p_refrigerant: { brand: 'Interdynamics',  notes: 'R-134a only — do not mix refrigerants.', status: 'active' },
  p_cabinfilter: { brand: 'Bosch',          notes: '',                                        status: 'active' },
  p_engfilter:   { brand: 'Fram',           notes: '',                                        status: 'active' },
  p_sparkplugs:  { brand: 'Denso',          notes: 'Replace every 30k mi per OEM spec.',      status: 'active' },
  p_battery:     { brand: 'Interstate',     notes: 'Core charge $18 — return old battery.',  status: 'active' },
  p_coolant:     { brand: 'Prestone',       notes: 'Green universal — check compatibility.', status: 'active' },
  p_serpentine:  { brand: 'Gates',          notes: '⚠ Critical — inspect every 60k mi.',     status: 'active' },
  p_wipers:      { brand: 'Rain-X',         notes: '',                                        status: 'active' },
  p_transfluid:  { brand: 'Valvoline',      notes: 'Multi-vehicle ATF.',                      status: 'active' },
  p_oxsensor:    { brand: 'Bosch',          notes: 'Downstream sensor — fits most models.',  status: 'active' },
  p_brakefluid:  { brand: 'Prestone',       notes: 'DOT 3 — check compatibility.',            status: 'active' },
  p_lugnuts:     { brand: 'Dorman',         notes: '',                                        status: 'active' },
  p_thermostat:  { brand: 'Gates',          notes: '',                                        status: 'active' },
  p_headlight:   { brand: 'Sylvania',       notes: '',                                        status: 'active' },
  p_tirevalve:   { brand: 'JACO',           notes: '',                                        status: 'active' },
  p_startermotor:{ brand: 'ACDelco',        notes: 'High demand — keep 2 on hand.',           status: 'active' },
  p_fuelpump:    { brand: 'Delphi',         notes: 'Discontinued — use updated PN when available.', status: 'discontinued' },
};

const _NEW_DEMO_PARTS = [
  { id: 'p_startermotor', name: 'Starter Motor',         sku: 'SM-2000', category: 'Electrical',  cost: 85, price: 189.99, qtyOnHand: 0, reorderPoint: 2, reorderQty: 4, vendor: 'ACDelco',   primaryLocation: 'loc_main' },
  { id: 'p_fuelpump',     name: 'Fuel Pump (universal)', sku: 'FP-2100', category: 'Fuel System', cost: 55, price: 129.99, qtyOnHand: 3, reorderPoint: 2, reorderQty: 4, vendor: 'Delphi',    primaryLocation: 'loc_main' },
];

function _migrateParts() {
  const parts = db.parts();
  let changed = false;
  _NEW_DEMO_PARTS.forEach((np) => {
    if (!parts.find((p) => p.id === np.id)) {
      const meta = _PART_META[np.id] || {};
      parts.push({ ...np, brand: meta.brand || '', notes: meta.notes || '', status: meta.status || 'active', updatedAt: new Date().toISOString() });
      changed = true;
    }
  });
  parts.forEach((p) => {
    const meta = _PART_META[p.id] || {};
    let dirty = false;
    if (p.brand == null)      { p.brand = meta.brand || '';            dirty = true; }
    if (p.notes == null)      { p.notes = meta.notes || '';            dirty = true; }
    if (!p.status)            { p.status = meta.status || 'active';   dirty = true; }
    if (!p.updatedAt)         { p.updatedAt = new Date().toISOString(); dirty = true; }
    if (!p.primaryLocation)   { p.primaryLocation = 'loc_main';       dirty = true; }
    if (dirty) changed = true;
  });
  if (changed) db.saveParts(parts);
}

// ---------------------------------------------------------------------------
// View state (module-level — persists across re-renders within the same tab)
// ---------------------------------------------------------------------------
let _st = {
  search: '', filterCat: '', filterBrand: '', filterVendor: '', filterStatus: '',
  hasNotesOnly: false, sortKey: 'name', sortDir: 1, groupBy: 'none',
};

const STATUS_META = {
  in_stock:     { label: 'In Stock',     cls: 'badge-green' },
  low_stock:    { label: 'Low Stock',    cls: 'badge-amber' },
  out_of_stock: { label: 'Out of Stock', cls: 'badge-red'   },
  on_order:     { label: 'On Order',     cls: 'badge-blue'  },
  discontinued: { label: 'Discontinued', cls: 'badge-gray'  },
  inactive:     { label: 'Inactive',     cls: 'badge-gray'  },
};

function _stockStatus(p) {
  if (p.status === 'discontinued') return 'discontinued';
  if (p.status === 'inactive')     return 'inactive';
  if (p.qtyOnHand === 0)           return 'out_of_stock';
  if (p.qtyOnHand <= (p.reorderPoint || 0)) return 'low_stock';
  return 'in_stock';
}

function _canSeeCost() {
  const r = util.currentRole();
  return !r || ['owner', 'general_manager', 'parts', 'bookkeeper', 'service_manager'].includes(r);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export function renderInvStock(mount) {
  _migrateParts();

  const allParts = db.parts();
  const cats    = [...new Set(allParts.map((p) => p.category).filter(Boolean))].sort();
  const brands  = [...new Set(allParts.map((p) => p.brand).filter(Boolean))].sort();
  const vendors = [...new Set(allParts.map((p) => p.vendor).filter(Boolean))].sort();
  const showCost = _canSeeCost();

  mount.innerHTML = `
    <div id="low-stock-banner" style="margin-bottom:var(--s3)"></div>

    <div class="card" style="margin-bottom:var(--s3)">
      <div class="card-body" style="padding:var(--s3)">
        <div class="row" style="gap:var(--s2);flex-wrap:wrap;align-items:center">
          <input class="input" id="inv-search" placeholder="Search name, SKU, brand, notes…" value="${_st.search}" style="flex:1;min-width:180px;max-width:320px">
          <select class="select" id="inv-cat" style="width:auto">
            <option value="">All categories</option>
            ${cats.map((c) => `<option value="${c}" ${_st.filterCat === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <select class="select" id="inv-brand" style="width:auto">
            <option value="">All brands</option>
            ${brands.map((b) => `<option value="${b}" ${_st.filterBrand === b ? 'selected' : ''}>${b}</option>`).join('')}
          </select>
          <select class="select" id="inv-vendor" style="width:auto">
            <option value="">All vendors</option>
            ${vendors.map((v) => `<option value="${v}" ${_st.filterVendor === v ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          <select class="select" id="inv-status" style="width:auto">
            <option value="">All statuses</option>
            ${Object.entries(STATUS_META).map(([k, m]) => `<option value="${k}" ${_st.filterStatus === k ? 'selected' : ''}>${m.label}</option>`).join('')}
          </select>
          <label style="display:flex;align-items:center;gap:5px;font-size:var(--t-13);cursor:pointer;white-space:nowrap">
            <input type="checkbox" id="inv-hasnotes" ${_st.hasNotesOnly ? 'checked' : ''}> Has notes
          </label>
          <button class="btn btn-secondary btn-sm" id="inv-clear">Clear filters</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head" style="flex-wrap:wrap;gap:var(--s2)">
        <div class="row" style="gap:var(--s2);align-items:center">
          <div class="card-title">Parts</div>
          <span class="badge badge-gray" id="inv-count"></span>
        </div>
        <div class="row" style="gap:var(--s2);flex-wrap:wrap">
          <select class="select" id="inv-group" style="width:auto;font-size:var(--t-13)">
            <option value="none"     ${_st.groupBy === 'none'     ? 'selected' : ''}>No grouping</option>
            <option value="category" ${_st.groupBy === 'category' ? 'selected' : ''}>By category</option>
            <option value="brand"    ${_st.groupBy === 'brand'    ? 'selected' : ''}>By brand</option>
            <option value="vendor"   ${_st.groupBy === 'vendor'   ? 'selected' : ''}>By vendor</option>
          </select>
          <button class="btn btn-secondary btn-sm" id="inv-export-all">Export CSV</button>
          <button class="btn btn-secondary btn-sm" id="inv-export-low">Low Stock CSV</button>
          <button class="btn btn-secondary btn-sm" id="inv-copy">Copy summary</button>
          <button class="btn btn-secondary btn-sm" id="inv-print">Print</button>
          <button class="btn btn-primary btn-sm" id="add-part-btn">+ Add Part</button>
        </div>
      </div>
      <div class="card-body" style="overflow-x:auto;padding:0">
        <table class="table" id="inv-table">
          <thead><tr>
            <th data-sort="name" style="cursor:pointer">Name <span id="si-name"></span></th>
            <th data-sort="sku" style="cursor:pointer">SKU <span id="si-sku"></span></th>
            <th data-sort="brand" style="cursor:pointer">Brand <span id="si-brand"></span></th>
            <th data-sort="category" style="cursor:pointer">Category <span id="si-category"></span></th>
            <th data-sort="vendor" style="cursor:pointer">Vendor <span id="si-vendor"></span></th>
            <th class="num" data-sort="qtyOnHand" style="cursor:pointer">On Hand <span id="si-qtyOnHand"></span></th>
            <th class="num" data-sort="totalAvail" style="cursor:pointer">Available <span id="si-totalAvail"></span></th>
            <th class="num" data-sort="reorderPoint" style="cursor:pointer">Reorder Pt <span id="si-reorderPoint"></span></th>
            ${showCost ? `
            <th class="num" data-sort="cost" style="cursor:pointer">Cost <span id="si-cost"></span></th>
            <th class="num" data-sort="price" style="cursor:pointer">Price <span id="si-price"></span></th>
            <th class="num" data-sort="margin" style="cursor:pointer">Margin <span id="si-margin"></span></th>
            ` : ''}
            <th data-sort="stockStatus" style="cursor:pointer">Status <span id="si-stockStatus"></span></th>
            <th>Notes</th>
            <th data-sort="updatedAt" style="cursor:pointer">Updated <span id="si-updatedAt"></span></th>
            <th></th>
          </tr></thead>
          <tbody id="parts-table-body"></tbody>
        </table>
      </div>
    </div>
  `;

  // Wire filter controls
  document.getElementById('inv-search').addEventListener('input', (e) => { _st.search = e.target.value; _renderTable(); });
  document.getElementById('inv-cat').addEventListener('change',     (e) => { _st.filterCat = e.target.value;    _renderTable(); });
  document.getElementById('inv-brand').addEventListener('change',   (e) => { _st.filterBrand = e.target.value;  _renderTable(); });
  document.getElementById('inv-vendor').addEventListener('change',  (e) => { _st.filterVendor = e.target.value; _renderTable(); });
  document.getElementById('inv-status').addEventListener('change',  (e) => { _st.filterStatus = e.target.value; _renderTable(); });
  document.getElementById('inv-hasnotes').addEventListener('change',(e) => { _st.hasNotesOnly = e.target.checked; _renderTable(); });
  document.getElementById('inv-clear').addEventListener('click', () => {
    _st.search = ''; _st.filterCat = ''; _st.filterBrand = ''; _st.filterVendor = ''; _st.filterStatus = ''; _st.hasNotesOnly = false;
    document.getElementById('inv-search').value = '';
    document.getElementById('inv-cat').value    = '';
    document.getElementById('inv-brand').value  = '';
    document.getElementById('inv-vendor').value = '';
    document.getElementById('inv-status').value = '';
    document.getElementById('inv-hasnotes').checked = false;
    _renderTable();
  });
  document.getElementById('inv-group').addEventListener('change', (e) => { _st.groupBy = e.target.value; _renderTable(); });

  // Wire sort headers
  mount.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.sort;
    if (_st.sortKey === k) _st.sortDir *= -1;
    else { _st.sortKey = k; _st.sortDir = 1; }
    _renderTable();
  }));

  // Wire export / action buttons
  document.getElementById('add-part-btn').addEventListener('click', () => openPartModal());
  document.getElementById('inv-export-all').addEventListener('click', () => _exportCSV(db.parts(), 'inventory-stock'));
  document.getElementById('inv-export-low').addEventListener('click', () => {
    const low = db.parts().filter((p) => ['low_stock', 'out_of_stock'].includes(_stockStatus(p)));
    if (!low.length) { toast('No low-stock parts right now.', 'info'); return; }
    _exportCSV(low, 'inventory-low-stock');
  });
  document.getElementById('inv-copy').addEventListener('click', async () => {
    const parts = _getFiltered();
    const lines = [`Stock summary — ${parts.length} of ${db.parts().length} parts`, ''];
    parts.forEach((p) => lines.push(`${p.name} (${p.sku || '—'}) · ${p.qtyOnHand} on hand · ${STATUS_META[_stockStatus(p)]?.label}`));
    await copyToClipboard(lines.join('\n'));
    toast('Copied to clipboard.', 'success');
  });
  document.getElementById('inv-print').addEventListener('click', () => {
    const parts = _getFiltered();
    const sc = _canSeeCost();
    printHTML('Parts Stock List', `
      <table border="1" cellpadding="4" cellspacing="0">
        <thead><tr><th>Name</th><th>SKU</th><th>Brand</th><th>Category</th><th>Vendor</th><th>On Hand</th><th>Available</th><th>Reorder Pt</th>${sc ? '<th>Cost</th><th>Price</th><th>Margin</th>' : ''}<th>Status</th><th>Notes</th></tr></thead>
        <tbody>${parts.map((p) => {
          const sc2 = _canSeeCost();
          const m = p.price && p.cost ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
          return `<tr><td>${p.name}</td><td>${p.sku || '—'}</td><td>${p.brand || '—'}</td><td>${p.category || '—'}</td><td>${p.vendor || '—'}</td><td>${p.qtyOnHand}</td><td>${util.totalAvailableQty(p.id)}</td><td>${p.reorderPoint || 0}</td>${sc2 ? `<td>${util.fmtMoney(p.cost)}</td><td>${util.fmtMoney(p.price)}</td><td>${m}%</td>` : ''}<td>${STATUS_META[_stockStatus(p)]?.label || ''}</td><td>${p.notes || ''}</td></tr>`;
        }).join('')}</tbody>
      </table>
    `);
  });

  _renderBanner();
  _renderTable();
}

// ---------------------------------------------------------------------------
// Export helper
// ---------------------------------------------------------------------------
function _exportCSV(parts, filename) {
  const sc = _canSeeCost();
  const cols = [
    { key: 'name',     label: 'Name'     },
    { key: 'sku',      label: 'SKU'      },
    { key: 'brand',    label: 'Brand'    },
    { key: 'category', label: 'Category' },
    { key: 'vendor',   label: 'Vendor'   },
    { key: 'primaryLocation', label: 'Primary Location' },
    { key: 'qtyOnHand',       label: 'On Hand'          },
    { label: 'Total Available', value: (p) => util.totalAvailableQty(p.id) },
    { key: 'reorderPoint',    label: 'Reorder Point'    },
    { key: 'reorderQty',      label: 'Reorder Qty'      },
    ...(sc ? [
      { key: 'cost',  label: 'Cost'  },
      { key: 'price', label: 'Price' },
      { label: 'Margin %', value: (p) => p.price && p.cost ? Math.round(((p.price - p.cost) / p.price) * 100) : 0 },
    ] : []),
    { label: 'Stock Status', value: (p) => STATUS_META[_stockStatus(p)]?.label || _stockStatus(p) },
    { key: 'notes',     label: 'Notes'        },
    { key: 'updatedAt', label: 'Last Updated' },
  ];
  downloadCSV(filename, parts, cols);
  toast(`Exported ${parts.length} part${parts.length === 1 ? '' : 's'}.`, 'success');
}

// ---------------------------------------------------------------------------
// Filter + sort
// ---------------------------------------------------------------------------
function _getFiltered() {
  const q = _st.search.toLowerCase();
  return db.parts().filter((p) => {
    if (q && !`${p.name} ${p.sku || ''} ${p.brand || ''} ${p.category || ''} ${p.vendor || ''} ${p.notes || ''}`.toLowerCase().includes(q)) return false;
    if (_st.filterCat    && p.category !== _st.filterCat)          return false;
    if (_st.filterBrand  && (p.brand || '') !== _st.filterBrand)   return false;
    if (_st.filterVendor && (p.vendor || '') !== _st.filterVendor) return false;
    if (_st.filterStatus && _stockStatus(p) !== _st.filterStatus)  return false;
    if (_st.hasNotesOnly && !(p.notes || '').trim())               return false;
    return true;
  });
}

function _getSorted(parts) {
  const k = _st.sortKey;
  const d = _st.sortDir;
  return parts.slice().sort((a, b) => {
    let va, vb;
    if (k === 'totalAvail') { va = util.totalAvailableQty(a.id); vb = util.totalAvailableQty(b.id); }
    else if (k === 'margin') {
      va = a.price && a.cost ? (a.price - a.cost) / a.price : 0;
      vb = b.price && b.cost ? (b.price - b.cost) / b.price : 0;
    }
    else if (k === 'stockStatus') { va = _stockStatus(a); vb = _stockStatus(b); }
    else { va = a[k] ?? ''; vb = b[k] ?? ''; }
    return typeof va === 'string' ? d * va.localeCompare(vb) : d * (va - vb);
  });
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------
function _renderBanner() {
  const oos = db.parts().filter((p) => _stockStatus(p) === 'out_of_stock');
  const low = db.parts().filter((p) => _stockStatus(p) === 'low_stock');
  const banner = document.getElementById('low-stock-banner');
  if (!banner) return;
  if (!oos.length && !low.length) { banner.innerHTML = ''; return; }
  const total = oos.length + low.length;
  banner.innerHTML = `
    <div class="alert alert-amber" id="low-stock-alert" style="cursor:pointer">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>
      <div>
        <b>${oos.length ? oos.length + ' out of stock · ' : ''}${low.length} at or below reorder point</b>
        <span style="font-size:var(--t-13);opacity:.75"> — click to filter</span><br>
        <span style="font-size:var(--t-13)">${[...oos, ...low].map((p) => p.name).join(', ')}</span>
      </div>
    </div>`;
  document.getElementById('low-stock-alert').addEventListener('click', () => {
    _st.filterStatus = 'low_stock';
    const sel = document.getElementById('inv-status');
    if (sel) sel.value = 'low_stock';
    _renderTable();
  });
}

// ---------------------------------------------------------------------------
// Table render
// ---------------------------------------------------------------------------
const _IND = { 1: ' ▲', '-1': ' ▼' };

function _renderTable() {
  // Update sort indicators
  document.querySelectorAll('th[data-sort] span').forEach((sp) => { sp.textContent = ''; });
  const indEl = document.getElementById(`si-${_st.sortKey}`);
  if (indEl) indEl.textContent = _IND[String(_st.sortDir)] || '';

  const filtered = _getFiltered();
  const parts = _getSorted(filtered);
  const showCost = _canSeeCost();

  const countEl = document.getElementById('inv-count');
  if (countEl) countEl.textContent = `${parts.length} part${parts.length === 1 ? '' : 's'}`;

  if (!parts.length) {
    document.getElementById('parts-table-body').innerHTML = `<tr><td colspan="20"><div class="empty" style="padding:var(--s5) 0"><div class="empty-title">No parts match</div><div class="empty-sub">Try clearing filters or your search.</div></div></td></tr>`;
    return;
  }

  let rows = '';
  if (_st.groupBy !== 'none') {
    const gk = _st.groupBy; // 'category' | 'brand' | 'vendor'
    const groups = {};
    parts.forEach((p) => {
      const g = p[gk] || `No ${gk}`;
      if (!groups[g]) groups[g] = [];
      groups[g].push(p);
    });
    const colCount = 11 + (showCost ? 3 : 0);
    Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).forEach(([g, gp]) => {
      const valSum = showCost ? gp.reduce((s, p) => s + (p.cost || 0) * p.qtyOnHand, 0) : 0;
      rows += `<tr style="background:var(--canvas,#f5f6f8)"><td colspan="${colCount}" style="font-weight:700;font-size:var(--t-13);color:var(--ink-soft);padding:6px var(--s3);letter-spacing:.04em;text-transform:uppercase">${g} <span class="badge badge-gray" style="font-size:10px;font-weight:400">${gp.length}</span>${valSum ? ` <span class="tnum" style="font-weight:400;font-size:var(--t-13)">${util.fmtMoney0(valSum)} value</span>` : ''}</td></tr>`;
      rows += gp.map((p) => _row(p, showCost)).join('');
    });
  } else {
    rows = parts.map((p) => _row(p, showCost)).join('');
  }

  document.getElementById('parts-table-body').innerHTML = rows;

  // Wire row clicks → part drawer
  document.querySelectorAll('[data-open-part]').forEach((el) =>
    el.addEventListener('click', () => openPartDrawer(el.dataset.openPart)));

  // Wire +/- buttons
  document.querySelectorAll('[data-adjust]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const delta = Number(btn.dataset.delta);
      db.adjustPartQty(btn.dataset.adjust, delta);
      util.logInventoryTransaction(btn.dataset.adjust, 'loc_main', 'manual_adjustment', delta, 'manual', null, 'Quick +/- adjust');
      const ps = db.parts();
      const p = ps.find((x) => x.id === btn.dataset.adjust);
      if (p) { p.updatedAt = new Date().toISOString(); db.saveParts(ps); }
      _renderBanner();
      _renderTable();
      refreshInventoryApp();
    }));

  // Wire Edit buttons
  document.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', (e) => { e.stopPropagation(); openPartModal(btn.dataset.edit); }));
}

function _row(p, showCost) {
  const ss = _stockStatus(p);
  const sm = STATUS_META[ss] || { label: ss, cls: 'badge-gray' };
  const total = util.totalAvailableQty(p.id);
  const low   = ss === 'low_stock' || ss === 'out_of_stock';
  const margin = p.price && p.cost ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
  const hasNotes = !!(p.notes || '').trim();
  const rowBg = low ? 'background:var(--amber-lt,#fffbec);' : '';
  return `
  <tr style="${rowBg}cursor:pointer" data-open-part="${p.id}">
    <td class="strong">${p.name}</td>
    <td class="muted tnum">${p.sku || '—'}</td>
    <td>${p.brand || '<span class="muted">—</span>'}</td>
    <td>${p.category || '<span class="muted">—</span>'}</td>
    <td>${p.vendor || '<span class="muted">—</span>'}</td>
    <td class="num">
      <div class="qty-adjust" style="justify-content:flex-end">
        <button data-adjust="${p.id}" data-delta="-1">−</button>
        <span style="min-width:28px;text-align:center;font-weight:700">${p.qtyOnHand}</span>
        <button data-adjust="${p.id}" data-delta="1">+</button>
      </div>
    </td>
    <td class="num tnum">${total}</td>
    <td class="num tnum">${p.reorderPoint || 0}</td>
    ${showCost ? `
    <td class="num tnum">${util.fmtMoney(p.cost || 0)}</td>
    <td class="num tnum">${util.fmtMoney(p.price || 0)}</td>
    <td class="num tnum">${margin}%</td>
    ` : ''}
    <td><span class="badge ${sm.cls}" style="font-size:10px">${sm.label}</span></td>
    <td style="font-size:var(--t-13)">${hasNotes ? `<span title="${p.notes.replace(/"/g, '&quot;')}" style="cursor:help;color:var(--blue)">●</span>` : '<span class="muted">—</span>'}</td>
    <td class="muted" style="font-size:var(--t-xs)">${p.updatedAt ? util.fmtDate(p.updatedAt) : '—'}</td>
    <td><button class="btn btn-secondary btn-sm" data-edit="${p.id}">Edit</button></td>
  </tr>`;
}

// ---------------------------------------------------------------------------
// Part detail drawer
// ---------------------------------------------------------------------------
function openPartDrawer(partId) {
  const p = db.partById(partId);
  if (!p) return;
  const locs = db.inventoryLocations();
  const txs = db.transactionsForPart(partId).slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  const ss = _stockStatus(p);
  const sm = STATUS_META[ss] || { label: ss, cls: 'badge-gray' };
  const total = util.totalAvailableQty(partId);
  const showCost = _canSeeCost();
  const margin = p.price && p.cost ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;

  openInvDrawer(`
    <div class="modal-head">
      <div>
        <div class="modal-title">${p.name}</div>
        <div class="muted" style="font-size:var(--t-13)">${p.sku || 'No SKU'} · ${p.brand || ''} · <span class="badge ${sm.cls}" style="font-size:10px">${sm.label}</span></div>
      </div>
      <button class="icon-btn" id="close-inv-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">

      <div class="grid-2" style="gap:var(--s3);margin-bottom:var(--s4)">
        <div><div class="section-label">Brand</div><div>${p.brand || '<span class="muted">No brand</span>'}</div></div>
        <div><div class="section-label">Category</div><div>${p.category || '<span class="muted">—</span>'}</div></div>
        <div><div class="section-label">Vendor</div><div>${p.vendor || '<span class="muted">No vendor</span>'}</div></div>
        <div><div class="section-label">Primary Location</div><div>${db.inventoryLocationById(p.primaryLocation || 'loc_main')?.name || 'Main Shop'}</div></div>
        <div><div class="section-label">On Hand</div><div class="tnum strong" style="font-size:var(--t-lg)">${p.qtyOnHand}</div></div>
        <div><div class="section-label">Total Available</div><div class="tnum strong" style="font-size:var(--t-lg)">${total}</div></div>
        <div><div class="section-label">Reorder Point</div><div class="tnum">${p.reorderPoint || '—'}</div></div>
        <div><div class="section-label">Reorder Qty</div><div class="tnum">${p.reorderQty || 0}</div></div>
        ${showCost ? `
        <div><div class="section-label">Cost</div><div class="tnum">${util.fmtMoney(p.cost || 0)}</div></div>
        <div><div class="section-label">Price</div><div class="tnum">${util.fmtMoney(p.price || 0)}</div></div>
        <div><div class="section-label">Margin</div><div class="tnum">${margin}%</div></div>
        ` : ''}
        <div><div class="section-label">Status</div><div><span class="badge ${sm.cls}">${sm.label}</span></div></div>
        ${p.notes ? `<div style="grid-column:1/-1"><div class="section-label">Notes</div><div style="font-size:var(--t-13)">${p.notes}</div></div>` : ''}
      </div>

      <div class="section-label" style="margin-bottom:var(--s2)">Stock by location</div>
      <div class="loc-grid" style="margin-bottom:var(--s4)">
        ${locs.map((loc) => {
          const stock = util.locationStock(partId, loc.id);
          const detail = [
            stock.reservedQty    ? stock.reservedQty    + ' reserved'    : '',
            stock.onOrderQty     ? stock.onOrderQty     + ' on order'    : '',
            stock.damagedQty     ? stock.damagedQty     + ' damaged'     : '',
            stock.quarantinedQty ? stock.quarantinedQty + ' quarantined' : '',
          ].filter(Boolean).join(' · ');
          return `
          <div class="loc-card">
            <div class="strong" style="font-size:var(--t-13)">${loc.name}${loc.isPlaceholder ? ' <span class="badge badge-gray" style="font-size:9px">placeholder</span>' : ''}</div>
            <div class="tnum" style="font-size:var(--t-lg);font-weight:800;margin:4px 0">${stock.availableQty || 0}</div>
            <div class="muted" style="font-size:var(--t-xs)">${detail || 'No holds'}</div>
            ${!loc.isPlaceholder ? `<div class="row" style="gap:4px;margin-top:6px"><button class="btn-ghost" data-damage="${loc.id}" style="font-size:10px;padding:2px 4px">Damage</button><button class="btn-ghost" data-quarantine="${loc.id}" style="font-size:10px;padding:2px 4px">Quarantine</button></div>` : ''}
          </div>`;
        }).join('')}
      </div>

      <div class="row" style="gap:var(--s2);flex-wrap:wrap;margin-bottom:var(--s4)">
        <button class="btn btn-secondary btn-sm" id="pd-edit">Edit Part</button>
        <button class="btn btn-secondary btn-sm" id="pd-adjust">Adjust Stock</button>
        <button class="btn btn-secondary btn-sm" id="pd-export">Export Part CSV</button>
      </div>

      <div class="section-label" style="margin-bottom:var(--s2)">Recent transactions</div>
      ${txs.length
        ? txs.map((t) => `
          <div class="row between" style="padding:4px 0;border-bottom:1px solid var(--rule);font-size:var(--t-13)">
            <span>${t.type.replace(/_/g, ' ')} · ${db.inventoryLocationById(t.locationId)?.name || t.locationId}</span>
            <span class="row" style="gap:8px">
              <span class="tnum">${t.quantityChange > 0 ? '+' : ''}${t.quantityChange}</span>
              <span class="muted">${util.fmtDate(t.date)}</span>
            </span>
          </div>`).join('')
        : '<div class="empty-sub">No transactions logged for this part yet.</div>'}
    </div>
  `);

  document.getElementById('close-inv-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('pd-edit').addEventListener('click', () => { closeInvDrawer(); openPartModal(partId); });
  document.getElementById('pd-adjust').addEventListener('click', () => _openAdjustModal(partId));
  document.getElementById('pd-export').addEventListener('click', () => _exportCSV([p], `part-${p.sku || p.id}`));

  document.querySelectorAll('[data-damage]').forEach((btn) => btn.addEventListener('click', async () => {
    const loc = db.inventoryLocationById(btn.dataset.damage);
    const ok = await confirmDialog(`Mark 1 unit of ${p.name} as damaged at ${loc?.name}?`, { confirmLabel: 'Mark Damaged' });
    if (!ok) return;
    try { util.markDamaged(partId, btn.dataset.damage, 1, 'Marked damaged from Stock view'); toast('Marked damaged.', 'success'); openPartDrawer(partId); refreshInventoryApp(); } catch (e) { toast(e.message, 'error'); }
  }));
  document.querySelectorAll('[data-quarantine]').forEach((btn) => btn.addEventListener('click', async () => {
    const loc = db.inventoryLocationById(btn.dataset.quarantine);
    const ok = await confirmDialog(`Quarantine 1 unit of ${p.name} at ${loc?.name}?`, { confirmLabel: 'Quarantine' });
    if (!ok) return;
    try { util.markQuarantined(partId, btn.dataset.quarantine, 1, 'Quarantined from Stock view'); toast('Quarantined.', 'success'); openPartDrawer(partId); refreshInventoryApp(); } catch (e) { toast(e.message, 'error'); }
  }));
}

// ---------------------------------------------------------------------------
// Adjust stock modal
// ---------------------------------------------------------------------------
function _openAdjustModal(partId) {
  const p = db.partById(partId);
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:360px">
      <div class="modal-head"><div class="modal-title">Adjust Stock — ${p.name}</div><button class="icon-btn" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
      <div class="modal-body">
        <div class="muted" style="margin-bottom:var(--s3)">Current on hand (Main): <b class="tnum">${p.qtyOnHand}</b></div>
        <div class="field"><label class="label">Adjustment (+/−)</label><input class="input" type="number" id="adj-delta" placeholder="e.g. −2 or +5"></div>
        <div class="field"><label class="label">Reason</label><input class="input" id="adj-reason" placeholder="e.g. Cycle count correction"></div>
      </div>
      <div class="modal-foot"><button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" id="adj-save">Apply</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => overlay.remove()));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#adj-save').addEventListener('click', () => {
    const delta = Number(overlay.querySelector('#adj-delta').value);
    const reason = overlay.querySelector('#adj-reason').value.trim() || 'Manual adjustment';
    if (isNaN(delta) || delta === 0) { toast('Enter a non-zero number.', 'error'); return; }
    db.adjustPartQty(partId, delta);
    util.logInventoryTransaction(partId, 'loc_main', 'manual_adjustment', delta, 'manual', null, reason);
    const ps = db.parts();
    const part = ps.find((x) => x.id === partId);
    if (part) { part.updatedAt = new Date().toISOString(); db.saveParts(ps); }
    toast(`Adjusted by ${delta > 0 ? '+' : ''}${delta}.`, 'success');
    overlay.remove();
    openPartDrawer(partId);
    _renderBanner();
    _renderTable();
    refreshInventoryApp();
  });
}

// ---------------------------------------------------------------------------
// Add / Edit Part modal (drawn in the inv-drawer slot)
// ---------------------------------------------------------------------------
const _BRANDS = ['ACDelco','AutoZone','Bosch','Delphi','Denso','Dorman','Fram','Gates','Interstate','JACO','Interdynamics','Mobil 1','Monroe','Motorcraft','NAPA',"O'Reilly",'Prestone','Rain-X','Sylvania','Valvoline','Wix'];
const _CATS   = ['AC','Brakes','Electrical','Engine','Exterior','Filters','Fluids','Fuel System','Suspension','Tires','Other'];

function openPartModal(partId) {
  const p = partId ? db.partById(partId) : null;
  const locs = db.inventoryLocations().filter((l) => !l.isPlaceholder);
  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">${p ? 'Edit Part' : 'Add Part'}</div>
      <button class="icon-btn" id="close-inv-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="field"><label class="label">Name <span style="color:var(--red,#e03)">*</span></label><input class="input" id="pf-name" value="${p?.name || ''}"></div>
      <div class="grid-2">
        <div class="field"><label class="label">SKU</label><input class="input" id="pf-sku" value="${p?.sku || ''}" placeholder="Auto-generated if blank"></div>
        <div class="field">
          <label class="label">Brand / Manufacturer</label>
          <input class="input" id="pf-brand" value="${p?.brand || ''}" list="pf-brand-list" placeholder="e.g. Bosch">
          <datalist id="pf-brand-list">${_BRANDS.map((b) => `<option value="${b}">`).join('')}</datalist>
        </div>
        <div class="field">
          <label class="label">Category</label>
          <input class="input" id="pf-category" value="${p?.category || ''}" list="pf-cat-list">
          <datalist id="pf-cat-list">${_CATS.map((c) => `<option value="${c}">`).join('')}</datalist>
        </div>
        <div class="field"><label class="label">Vendor</label><input class="input" id="pf-vendor" value="${p?.vendor || ''}"></div>
        <div class="field"><label class="label">Cost ($)</label><input class="input" type="number" step="0.01" min="0" id="pf-cost" value="${p?.cost ?? ''}"></div>
        <div class="field"><label class="label">Price ($)</label><input class="input" type="number" step="0.01" min="0" id="pf-price" value="${p?.price ?? ''}"></div>
        <div class="field"><label class="label">Qty on hand (Main Shop)</label><input class="input" type="number" id="pf-qty" value="${p?.qtyOnHand ?? 0}"></div>
        <div class="field"><label class="label">Reorder point</label><input class="input" type="number" id="pf-reorder" value="${p?.reorderPoint ?? 0}"></div>
        <div class="field"><label class="label">Reorder qty</label><input class="input" type="number" id="pf-reorderqty" value="${p?.reorderQty ?? 0}"></div>
        <div class="field">
          <label class="label">Primary location</label>
          <select class="select" id="pf-location">
            ${locs.length
              ? locs.map((l) => `<option value="${l.id}" ${(p?.primaryLocation || 'loc_main') === l.id ? 'selected' : ''}>${l.name}</option>`).join('')
              : `<option value="loc_main">Main Shop</option>`}
          </select>
        </div>
        <div class="field">
          <label class="label">Status</label>
          <select class="select" id="pf-status">
            <option value="active"       ${(!p?.status || p.status === 'active')       ? 'selected' : ''}>Active</option>
            <option value="inactive"     ${p?.status === 'inactive'                    ? 'selected' : ''}>Inactive</option>
            <option value="discontinued" ${p?.status === 'discontinued'                ? 'selected' : ''}>Discontinued</option>
          </select>
        </div>
      </div>
      <div class="field"><label class="label">Notes</label><textarea class="textarea" id="pf-notes" rows="3" placeholder="Supplier notes, fitment, reorder reminders…">${p?.notes || ''}</textarea></div>
      ${p ? '<hr style="border:none;border-top:1px solid var(--rule);margin:var(--s3) 0"><button class="btn btn-danger btn-sm" id="pf-delete">Delete Part</button>' : ''}
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="pf-save">${p ? 'Save Changes' : 'Add Part'}</button>
    </div>
  `);

  document.getElementById('close-inv-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('modal-cancel').addEventListener('click', closeInvDrawer);
  document.getElementById('pf-save').addEventListener('click', () => savePart(partId));
  document.getElementById('pf-delete')?.addEventListener('click', async () => {
    const ok = await confirmDialog(`Delete ${p.name}? This can't be undone.`, { confirmLabel: 'Delete' });
    if (!ok) return;
    db.saveParts(db.parts().filter((x) => x.id !== partId));
    toast('Part deleted.', 'success');
    closeInvDrawer();
    _renderBanner();
    _renderTable();
    refreshInventoryApp();
  });
}

function savePart(partId) {
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { toast('Part name is required.', 'error'); return; }
  const qty = parseInt(document.getElementById('pf-qty').value, 10);
  if (isNaN(qty)) { toast('Quantity must be a number.', 'error'); return; }
  let sku = document.getElementById('pf-sku').value.trim();
  if (!sku) sku = `SKU-${Date.now().toString(36).toUpperCase()}`;

  const fields = {
    name, sku,
    brand:          document.getElementById('pf-brand').value.trim(),
    category:       document.getElementById('pf-category').value.trim(),
    vendor:         document.getElementById('pf-vendor').value.trim(),
    cost:           parseFloat(document.getElementById('pf-cost').value) || 0,
    price:          parseFloat(document.getElementById('pf-price').value) || 0,
    qtyOnHand:      qty,
    reorderPoint:   parseInt(document.getElementById('pf-reorder').value, 10)    || 0,
    reorderQty:     parseInt(document.getElementById('pf-reorderqty').value, 10) || 0,
    primaryLocation:document.getElementById('pf-location').value,
    status:         document.getElementById('pf-status').value,
    notes:          document.getElementById('pf-notes').value.trim(),
    updatedAt:      new Date().toISOString(),
  };

  const parts = db.parts();
  if (partId) {
    const part = parts.find((x) => x.id === partId);
    Object.assign(part, fields);
  } else {
    parts.push({ id: db.nextId('p'), ...fields });
  }
  db.saveParts(parts);
  toast(partId ? 'Part updated.' : 'Part added.', 'success');
  closeInvDrawer();
  _renderBanner();
  _renderTable();
  refreshInventoryApp();
}
