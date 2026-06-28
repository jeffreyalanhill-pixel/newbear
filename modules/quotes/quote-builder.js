// AutoBook — modules/quotes/quote-builder.js
// Quote Builder: pick customer/vehicle, start from a concern or a suggested
// template, add line items by category, preview live totals, save as draft
// or mark ready to send. Saving calls util.createQuote — the only place a
// Quote is created — so totals are always computed from line items, never
// hardcoded here.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast } from '../../lib/nav.js';
import { takeBuilderPrefill, refreshQuotesApp } from './quotes-app.js';
import { openQuoteDetail } from './quote-detail.js';

const TYPES = [
  { value: 'service', label: 'Service' },
  { value: 'labor', label: 'Labor' },
  { value: 'parts', label: 'Part' },
  { value: 'tires', label: 'Tire' },
  { value: 'fluids', label: 'Fluid' },
  { value: 'fees', label: 'Fee / Shop Supply' },
  { value: 'discount', label: 'Discount' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'diagnostic', label: 'Diagnostic' },
];

let state = null;

function freshState() {
  return {
    customerId: '', vehicleId: '', title: '', concern: '', diagnosisNotes: '',
    priority: 'normal', validUntil: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    internalNotes: '', customerNotes: '', source: 'manual',
    lines: [],
  };
}

export function renderQuoteBuilder(mount) {
  const prefill = takeBuilderPrefill();
  state = freshState();
  if (prefill?.lines) state.lines = prefill.lines.map((l) => ({ ...l, _id: cryptoId(), status: l.status || 'recommended', taxable: l.taxable !== false }));
  if (prefill?.title) state.title = prefill.title;

  mount.innerHTML = `
    <div class="crm-grid">
      <div>
        <div class="card" style="margin-bottom:var(--s4)">
          <div class="card-head"><div class="card-title">Customer &amp; Vehicle</div></div>
          <div class="card-body grid-2">
            <div class="field">
              <label class="label">Customer</label>
              <select class="select" id="qb-customer">
                <option value="">Select customer…</option>
                <option value="__new__">+ New Customer…</option>
                ${db.customers().slice().sort((a, b) => util.customerName(a).localeCompare(util.customerName(b))).map((c) => `<option value="${c.id}">${util.customerName(c)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label class="label">Vehicle</label>
              <select class="select" id="qb-vehicle"><option value="">Select customer first…</option></select>
            </div>
            <div class="field" id="qb-new-customer-fields" style="grid-column:1/-1;display:none;border:1px solid var(--rule);border-radius:var(--r-md);padding:var(--s4);gap:var(--s3)">
              <div class="section-label">New customer</div>
              <div class="grid-2">
                <div class="field"><label class="label">First name</label><input class="input" id="qb-nc-first"></div>
                <div class="field"><label class="label">Last name</label><input class="input" id="qb-nc-last"></div>
                <div class="field"><label class="label">Phone</label><input class="input" id="qb-nc-phone"></div>
                <div class="field"><label class="label">Email</label><input class="input" id="qb-nc-email"></div>
              </div>
              <div class="section-label">New vehicle</div>
              <div class="grid-2">
                <div class="field"><label class="label">Year</label><input class="input" id="qb-nc-year" type="number"></div>
                <div class="field"><label class="label">Make</label><input class="input" id="qb-nc-make"></div>
                <div class="field"><label class="label">Model</label><input class="input" id="qb-nc-model"></div>
                <div class="field"><label class="label">Mileage</label><input class="input" id="qb-nc-mileage" type="number"></div>
              </div>
              <div class="muted" style="font-size:var(--t-xs)">Saved when you save the quote — matched against existing customers by phone/email first, so this never creates a duplicate.</div>
            </div>
            <div class="field" style="grid-column:1/-1"><label class="label">Quote title</label><input class="input" id="qb-title" placeholder="e.g. Front brake service" value="${state.title}"></div>
            <div class="field" style="grid-column:1/-1"><label class="label">Customer concern</label><textarea class="textarea" id="qb-concern" placeholder="What did the customer say is wrong?"></textarea></div>
            <div class="field" style="grid-column:1/-1"><label class="label">Diagnosis notes (internal)</label><textarea class="textarea" id="qb-diagnosis"></textarea></div>
            <div class="field">
              <label class="label">Priority</label>
              <select class="select" id="qb-priority"><option value="low">Low</option><option value="normal" selected>Normal</option><option value="urgent">Urgent</option></select>
            </div>
            <div class="field"><label class="label">Valid until</label><input class="input" type="date" id="qb-valid" value="${state.validUntil}"></div>
          </div>
        </div>

        <div class="card" style="margin-bottom:var(--s4)" id="qb-suggestions-card" style="display:none">
          <div class="card-head"><div class="card-title">Suggested for this vehicle/customer</div></div>
          <div class="card-body" id="qb-suggestions"></div>
        </div>

        <div class="card" style="margin-bottom:var(--s4)">
          <div class="card-head"><div class="card-title">Line Items</div></div>
          <div class="card-body">
            <div class="row" style="gap:var(--s2);flex-wrap:wrap;margin-bottom:var(--s3)">
              <select class="select" id="qb-add-type" style="max-width:160px">${TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}</select>
              <select class="select" id="qb-add-catalog" style="max-width:240px"><option value="">Custom / manual line…</option></select>
              <button class="btn btn-secondary btn-sm" id="qb-add-line">+ Add Line</button>
            </div>
            <table class="li-table">
              <thead><tr><th>Item</th><th style="width:90px">Qty/Hrs</th><th style="width:90px">Price/Rate</th><th style="width:90px">Required?</th><th class="num" style="width:80px">Total</th><th></th></tr></thead>
              <tbody id="qb-lines"></tbody>
            </table>
            <div class="totals-box" id="qb-totals" style="margin-top:var(--s3)"></div>
          </div>
        </div>

        <div class="card" style="margin-bottom:var(--s4)">
          <div class="card-head"><div class="card-title">Distributor Lookup <span class="badge badge-gray">placeholder</span></div></div>
          <div class="card-body">
            <div class="row" style="gap:var(--s2)">
              <input class="input" id="qb-distributor-search" placeholder="Search by part number or vehicle…">
              <button class="btn btn-secondary btn-sm" id="qb-distributor-go">Search</button>
            </div>
            <div id="qb-distributor-results" style="margin-top:var(--s3)"></div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="card-title">Notes &amp; Save</div></div>
          <div class="card-body">
            <div class="field"><label class="label">Internal notes</label><textarea class="textarea" id="qb-internal-notes"></textarea></div>
            <div class="field"><label class="label">Customer-facing notes</label><textarea class="textarea" id="qb-customer-notes"></textarea></div>
            <div class="row" style="gap:var(--s2);margin-top:var(--s3)">
              <button class="btn btn-secondary" id="qb-save-draft">Save as Draft</button>
              <button class="btn btn-primary" id="qb-save-ready">Save &amp; Mark Ready to Send</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="position:sticky;top:var(--s4)">
        <div class="card-head"><div class="card-title">Preview</div></div>
        <div class="card-body" id="qb-preview"></div>
      </div>
    </div>
  `;

  wireCustomerVehicle();
  wireCatalogSelect();
  document.getElementById('qb-add-line').addEventListener('click', addLine);
  document.getElementById('qb-distributor-go').addEventListener('click', distributorSearch);
  document.getElementById('qb-save-draft').addEventListener('click', () => save(false));
  document.getElementById('qb-save-ready').addEventListener('click', () => save(true));
  ['qb-title', 'qb-concern', 'qb-diagnosis', 'qb-priority', 'qb-valid', 'qb-internal-notes', 'qb-customer-notes'].forEach((id) => {
    document.getElementById(id).addEventListener('input', syncFieldsToState);
  });

  renderLines();
}

function syncFieldsToState() {
  state.title = document.getElementById('qb-title').value;
  state.concern = document.getElementById('qb-concern').value;
  state.diagnosisNotes = document.getElementById('qb-diagnosis').value;
  state.priority = document.getElementById('qb-priority').value;
  state.validUntil = document.getElementById('qb-valid').value;
  state.internalNotes = document.getElementById('qb-internal-notes').value;
  state.customerNotes = document.getElementById('qb-customer-notes').value;
}

function wireCustomerVehicle() {
  document.getElementById('qb-customer').addEventListener('change', (e) => {
    state.customerId = e.target.value;
    state.vehicleId = '';
    const vehicleSelect = document.getElementById('qb-vehicle');
    const newCustomerFields = document.getElementById('qb-new-customer-fields');

    if (state.customerId === '__new__') {
      newCustomerFields.style.display = '';
      vehicleSelect.innerHTML = `<option value="">New vehicle entered above</option>`;
      vehicleSelect.disabled = true;
      document.getElementById('qb-suggestions-card').style.display = 'none';
      return;
    }
    newCustomerFields.style.display = 'none';
    vehicleSelect.disabled = false;

    const vehicles = state.customerId ? db.vehiclesForCustomer(state.customerId) : [];
    vehicleSelect.innerHTML = vehicles.length
      ? `<option value="">Select vehicle…</option>${vehicles.map((v) => `<option value="${v.id}">${util.vehicleLabel(v)}</option>`).join('')}`
      : `<option value="">No vehicles on file</option>`;
    renderSuggestions();
  });
  document.getElementById('qb-vehicle').addEventListener('change', (e) => {
    state.vehicleId = e.target.value;
    renderSuggestions();
  });
}

function collectNewCustomerFields() {
  return {
    firstName: document.getElementById('qb-nc-first').value.trim(),
    lastName: document.getElementById('qb-nc-last').value.trim(),
    phone: document.getElementById('qb-nc-phone').value.trim(),
    email: document.getElementById('qb-nc-email').value.trim(),
    year: Number(document.getElementById('qb-nc-year').value) || null,
    make: document.getElementById('qb-nc-make').value.trim(),
    model: document.getElementById('qb-nc-model').value.trim(),
    mileage: Number(document.getElementById('qb-nc-mileage').value) || 0,
  };
}

function renderSuggestions() {
  const card = document.getElementById('qb-suggestions-card');
  if (!state.customerId && !state.vehicleId) { card.style.display = 'none'; return; }
  const suggestions = util.suggestTemplatesFor({ vehicleId: state.vehicleId, customerId: state.customerId, concern: state.concern });
  if (!suggestions.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  document.getElementById('qb-suggestions').innerHTML = suggestions.map((s, i) => `
    <div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)">
      <span>${s.template.name} <span class="muted" style="font-size:var(--t-13)">· ${s.reason}</span></span>
      <button class="btn btn-secondary btn-sm" data-use-suggestion="${i}">+ Add to quote</button>
    </div>`).join('');
  document.querySelectorAll('[data-use-suggestion]').forEach((b) => {
    b.addEventListener('click', () => {
      const tpl = suggestions[Number(b.dataset.useSuggestion)].template;
      tpl.lines.forEach((l) => state.lines.push({ ...l, _id: cryptoId(), status: 'recommended', taxable: l.taxable !== false }));
      renderLines();
      toast(`Added "${tpl.name}" lines.`);
    });
  });
}

function wireCatalogSelect() {
  const typeSelect = document.getElementById('qb-add-type');
  const catalogSelect = document.getElementById('qb-add-catalog');
  function refreshCatalog() {
    const type = typeSelect.value;
    if (['service', 'inspection', 'diagnostic'].includes(type)) {
      catalogSelect.innerHTML = `<option value="">Custom / manual line…</option>${db.services().map((s) => `<option value="${s.id}">${s.name} — ${util.fmtMoney(s.basePrice)}</option>`).join('')}`;
    } else if (['parts', 'tires', 'fluids'].includes(type)) {
      catalogSelect.innerHTML = `<option value="">Custom / manual line…</option>${db.parts().map((p) => `<option value="${p.id}">${p.name} — ${util.fmtMoney(p.price)}${p.qtyOnHand <= 0 ? ' (special order)' : p.qtyOnHand <= p.reorderPoint ? ' (low stock)' : ''}</option>`).join('')}`;
    } else {
      catalogSelect.innerHTML = `<option value="">Custom / manual line…</option>`;
    }
  }
  typeSelect.addEventListener('change', refreshCatalog);
  refreshCatalog();
}

function addLine() {
  const type = document.getElementById('qb-add-type').value;
  const catalogId = document.getElementById('qb-add-catalog').value;
  let line = { type, status: 'recommended', taxable: type !== 'fees', qty: 1, unitPrice: 0, hours: 0 };
  if (catalogId && ['service', 'inspection', 'diagnostic'].includes(type)) {
    const svc = db.serviceById(catalogId);
    line = { ...line, refId: svc.id, name: svc.name, unitPrice: svc.basePrice, hours: svc.baseHours };
  } else if (catalogId && ['parts', 'tires', 'fluids'].includes(type)) {
    const part = db.partById(catalogId);
    line = { ...line, refId: part.id, partId: part.id, name: part.name, unitPrice: part.price, unitCost: part.cost };
  } else {
    line.name = type === 'labor' ? 'Labor' : type === 'discount' ? 'Discount' : 'New line item';
    if (type === 'labor') line.laborRate = db.settings().laborRate || 120;
  }
  state.lines.push({ ...line, _id: cryptoId() });
  renderLines();
}

function renderLines() {
  const tbody = document.getElementById('qb-lines');
  tbody.innerHTML = state.lines.length
    ? state.lines.map((l) => {
        const total = util.quoteLineTotal(l);
        const stock = l.partId ? stockBadge(l.partId) : '';
        return `
        <tr data-line="${l._id}">
          <td><input class="input" data-field="name" value="${l.name || ''}" style="font-size:var(--t-13)">${stock}</td>
          <td>${l.type === 'labor' ? `<input class="input" data-field="hours" type="number" step="0.25" value="${l.hours || 0}">` : `<input class="input" data-field="qty" type="number" step="1" value="${l.qty || 1}">`}</td>
          <td><input class="input" data-field="unitPrice" type="number" step="0.01" value="${l.type === 'labor' ? (l.laborRate || db.settings().laborRate || 120) : (l.unitPrice || 0)}"></td>
          <td><select class="select" data-field="status" style="font-size:var(--t-13)"><option value="recommended" ${l.status === 'recommended' ? 'selected' : ''}>Required</option><option value="optional" ${l.status === 'optional' ? 'selected' : ''}>Optional</option></select></td>
          <td class="num">${util.fmtMoney(total)}</td>
          <td><button class="icon-btn" data-remove style="width:24px;height:24px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg></button></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="6"><div class="empty-sub" style="padding:var(--s3) 0">No line items yet — add one above or use a suggested template.</div></td></tr>`;

  tbody.querySelectorAll('tr[data-line]').forEach((tr) => {
    const id = tr.dataset.line;
    const line = state.lines.find((l) => l._id === id);
    tr.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('input', () => {
        const field = input.dataset.field;
        if (field === 'unitPrice' && line.type === 'labor') line.laborRate = Number(input.value) || 0;
        else if (field === 'hours' || field === 'qty' || field === 'unitPrice') line[field] = Number(input.value) || 0;
        else line[field] = input.value;
        renderLines();
      });
    });
    tr.querySelector('[data-remove]').addEventListener('click', () => {
      state.lines = state.lines.filter((l) => l._id !== id);
      renderLines();
    });
  });

  renderTotalsPreview();
}

function stockBadge(partId) {
  const p = db.partById(partId);
  if (!p) return '';
  if (p.qtyOnHand <= 0) return ' <span class="stock-pill out">Special Order</span>';
  if (p.qtyOnHand <= p.reorderPoint) return ` <span class="stock-pill low">Low Stock (${p.qtyOnHand})</span>`;
  return ` <span class="stock-pill in">In Stock (${p.qtyOnHand})</span>`;
}

function computeTotals() {
  const taxRate = db.settings().taxRate || 0;
  const billable = state.lines.filter((l) => l.type !== 'discount');
  const discounts = state.lines.filter((l) => l.type === 'discount');
  const subtotal = round2(billable.reduce((s, l) => s + util.quoteLineTotal(l), 0));
  const discountTotal = round2(discounts.reduce((s, l) => s + Math.abs(util.quoteLineTotal(l)), 0));
  const taxableSubtotal = round2(billable.filter((l) => l.taxable !== false).reduce((s, l) => s + util.quoteLineTotal(l), 0));
  const taxTotal = round2(Math.max(taxableSubtotal - discountTotal, 0) * taxRate);
  const total = round2(Math.max(subtotal - discountTotal, 0) + taxTotal);
  return { subtotal, discountTotal, taxTotal, total };
}
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function renderTotalsPreview() {
  const t = computeTotals();
  const html = `
    <div class="tr-row"><span>Subtotal</span><span>${util.fmtMoney(t.subtotal)}</span></div>
    ${t.discountTotal ? `<div class="tr-row"><span>Discount</span><span>-${util.fmtMoney(t.discountTotal)}</span></div>` : ''}
    <div class="tr-row"><span>Tax</span><span>${util.fmtMoney(t.taxTotal)}</span></div>
    <div class="tr-row grand"><span>Total</span><span>${util.fmtMoney(t.total)}</span></div>
  `;
  document.getElementById('qb-totals').innerHTML = html;
  const c = state.customerId ? db.customerById(state.customerId) : null;
  const v = state.vehicleId ? db.vehicleById(state.vehicleId) : null;
  document.getElementById('qb-preview').innerHTML = `
    ${c ? `<div class="strong" style="color:var(--ink)">${util.customerName(c)}</div>` : '<div class="empty-sub">No customer selected.</div>'}
    ${v ? `<div class="muted" style="font-size:var(--t-13)">${util.vehicleLabel(v)}</div>` : ''}
    <div style="margin-top:var(--s3)" class="section-label">${state.title || 'Untitled quote'}</div>
    <div class="muted" style="font-size:var(--t-13);margin-top:4px">${state.lines.length} line item${state.lines.length === 1 ? '' : 's'}</div>
    <div class="totals-box" style="margin-top:var(--s4)">${html}</div>
  `;
}

function distributorSearch() {
  const term = document.getElementById('qb-distributor-search').value.trim();
  // Placeholder only — no live distributor integration yet (Phase 2). A
  // couple of static example results so the workflow shape exists.
  const results = term
    ? [
        { name: `${term} — Vendor A`, price: 0, availability: 'Special order, 2-3 days' },
        { name: `${term} — Vendor B`, price: 0, availability: 'In stock at warehouse' },
      ]
    : [];
  document.getElementById('qb-distributor-results').innerHTML = results.length
    ? results.map((r, i) => `
      <div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)">
        <span>${r.name} <span class="muted" style="font-size:var(--t-13)">· ${r.availability}</span></span>
        <button class="btn btn-secondary btn-sm" data-add-distributor="${i}">+ Add as special order</button>
      </div>`).join('')
    : '<div class="empty-sub">Enter a part number or vehicle to search (placeholder — not connected to a real distributor yet).</div>';
  document.querySelectorAll('[data-add-distributor]').forEach((b) => {
    b.addEventListener('click', () => {
      state.lines.push({ _id: cryptoId(), type: 'parts', status: 'recommended', taxable: true, qty: 1, unitPrice: 0, name: results[Number(b.dataset.addDistributor)].name, source: 'distributor_placeholder' });
      renderLines();
      toast('Added as a special-order placeholder line — price TBD from distributor.');
    });
  });
}

function save(readyToSend) {
  syncFieldsToState();

  if (state.customerId === '__new__') {
    const nc = collectNewCustomerFields();
    if (!nc.firstName || !nc.phone) { toast('New customer needs at least a first name and phone.', 'error'); return; }
    if (!nc.make || !nc.model) { toast('New customer needs a vehicle (year/make/model) for this quote.', 'error'); return; }
    const { customer, vehicle } = util.createCustomer(nc, nc);
    state.customerId = customer.id;
    state.vehicleId = vehicle?.id || '';
    toast(`Created customer ${util.customerName(customer)}.`, 'success');
  }

  if (!state.customerId || !state.vehicleId) { toast('Select a customer and vehicle first.', 'error'); return; }
  if (!state.lines.length) { toast('Add at least one line item.', 'error'); return; }
  try {
    const q = util.createQuote({
      customerId: state.customerId,
      vehicleId: state.vehicleId,
      title: state.title || 'Untitled Quote',
      concern: state.concern,
      diagnosisNotes: state.diagnosisNotes,
      priority: state.priority,
      validUntil: state.validUntil,
      internalNotes: state.internalNotes,
      customerNotes: state.customerNotes,
      source: state.source,
      lineItems: state.lines.map(({ _id, ...l }) => l),
    });
    if (readyToSend) util.markQuoteReadyToSend(q.id);
    toast(`${q.quoteNumber} saved${readyToSend ? ' and marked ready to send' : ' as a draft'}.`, 'success');
    refreshQuotesApp();
    location.hash = 'dashboard';
    setTimeout(() => openQuoteDetail(q.id), 50);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function cryptoId() { return 'tmp_' + Math.random().toString(36).slice(2, 10); }
