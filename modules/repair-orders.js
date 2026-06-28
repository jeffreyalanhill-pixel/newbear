// AutoBook — modules/repair-orders.js (§11.2)
// RO list + full detail drawer. All status changes go through util's §9
// transitions; all line-item math goes through util.recalcRO. This page never
// sets ro.status directly. Edit mode (this step) works on a local draft —
// nothing touches localStorage until Save, and Save always goes through the
// single util.updateRO write path.

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import { renderNav, toast, confirmDialog } from '../lib/nav.js';

let currentRoId = null;
let editDraft = null; // null = view mode; otherwise a local, unsaved copy of editable fields

export function renderRepairOrders() {
  renderNav('#icon-rail', 'repair-orders.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();
  populateTechFilter();
  renderList();

  document.getElementById('filter-status').addEventListener('change', renderList);
  document.getElementById('filter-tech').addEventListener('change', renderList);
  document.getElementById('filter-date').addEventListener('change', renderList);
  document.getElementById('search-input').addEventListener('input', renderList);

  document.getElementById('ro-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'ro-overlay') closeDrawer();
  });
}

function populateTechFilter() {
  const sel = document.getElementById('filter-tech');
  db.techs().forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.firstName} ${t.lastName}`;
    sel.appendChild(opt);
  });
}

function getFilters() {
  return {
    status: document.getElementById('filter-status').value,
    tech: document.getElementById('filter-tech').value,
    date: document.getElementById('filter-date').value,
    search: document.getElementById('search-input').value.trim().toLowerCase(),
  };
}

function renderList() {
  const f = getFilters();
  let jobs = db.jobs();
  if (f.status) jobs = jobs.filter((j) => j.status === f.status);
  if (f.tech) jobs = jobs.filter((j) => j.techId === f.tech);
  if (f.date) jobs = jobs.filter((j) => j.scheduledDate === f.date);
  if (f.search) {
    jobs = jobs.filter((j) => {
      const c = db.customerById(j.customerId);
      const v = db.vehicleById(j.vehicleId);
      const hay = `${j.ro} ${util.customerName(c)} ${util.vehicleLabel(v)}`.toLowerCase();
      return hay.includes(f.search);
    });
  }
  jobs = jobs.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const tbody = document.getElementById('ro-table-body');
  tbody.innerHTML = jobs.length
    ? jobs.map((j) => {
        const c = db.customerById(j.customerId);
        const v = db.vehicleById(j.vehicleId);
        const tech = db.techById(j.techId);
        const meta = util.statusMeta(j.status);
        return `
        <tr>
          <td class="strong">${j.ro}</td>
          <td>${util.customerName(c)}</td>
          <td>${util.vehicleLabel(v)}</td>
          <td><span class="badge ${meta.badgeClass}">${meta.label}</span></td>
          <td>${tech ? tech.firstName : '—'}</td>
          <td class="num tnum">${util.fmtMoney(j.total)}</td>
          <td><button class="btn btn-secondary btn-sm" data-open="${j.id}">Open ›</button></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="7"><div class="empty"><div class="empty-title">No repair orders match</div><div class="empty-sub">Try clearing filters.</div></div></td></tr>`;

  tbody.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => openDrawer(btn.dataset.open));
  });
}

// ---------------------------------------------------------------------------
// Detail drawer
// ---------------------------------------------------------------------------
function openDrawer(roId) {
  currentRoId = roId;
  editDraft = null;
  renderDrawer();
  document.getElementById('ro-overlay').classList.add('open');
}

function closeDrawer() {
  document.getElementById('ro-overlay').classList.remove('open');
  currentRoId = null;
  editDraft = null;
}

function lineRow(line) {
  const typeLabel = { part: '(part)', labor: '(labor)', fee: '(fee)', discount: '(discount)' }[line.type] || '';
  return `
    <div class="li-row">
      <span>${line.name}${typeLabel ? ` <span class="muted" style="font-size:var(--t-xs)">${typeLabel}</span>` : ''}</span>
      <span>${line.qty || ''}</span>
      <span>${line.hours ? line.hours + 'h' : ''}</span>
      <span class="tnum">${util.fmtMoney(line.unitPrice || 0)}</span>
      <span class="tnum strong">${util.fmtMoney(line.total)}</span>
      <span></span>
    </div>`;
}

function statusActionButtons(ro) {
  const buttons = [];
  if (ro.status === 'scheduled') buttons.push({ label: 'Check In', action: 'checkIn' });
  if (ro.status === 'waiting' || ro.status === 'on_hold') buttons.push({ label: 'Start Job', action: 'startJob' });
  if (ro.status === 'in_progress') buttons.push({ label: 'Hold', action: 'holdJob', secondary: true });
  if (ro.status === 'in_progress') buttons.push({ label: 'Mark Ready', action: 'markReady' });
  if (ro.status === 'on_hold') buttons.push({ label: 'Resume', action: 'resumeJob' });
  if (ro.status === 'ready' && !ro.invoiceId) buttons.push({ label: 'Convert to Invoice', action: 'createInvoiceFromRO' });
  if (!['closed', 'cancelled', 'invoiced'].includes(ro.status)) buttons.push({ label: 'Cancel RO', action: 'cancelRO', danger: true });
  return buttons
    .map((b) => `<button class="btn ${b.danger ? 'btn-danger' : b.secondary ? 'btn-secondary' : 'btn-primary'} btn-sm" data-action="${b.action}">${b.label}</button>`)
    .join('');
}

const DVI_ITEMS = ['Brakes', 'Tires', 'Fluids', 'Battery', 'Lights', 'Belts/Hoses'];

function headerActions(ro) {
  const locked = util.isROLocked(ro);
  return `
    <button class="icon-btn" id="print-ro-btn" title="Print">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
    </button>
    <button class="icon-btn" id="email-ro-btn" title="Email">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
    </button>
    ${locked ? '' : '<button class="btn btn-secondary btn-sm" id="edit-ro-btn">Edit</button>'}
    <button class="icon-btn" id="close-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
  `;
}

function renderDrawer() {
  const ro = db.jobById(currentRoId);
  if (!ro) return;
  document.getElementById('ro-drawer').innerHTML = editDraft ? editDrawerHtml(ro) : viewDrawerHtml(ro);
  wireDrawerEvents(ro);
}

// ---------------------------------------------------------------------------
// View mode
// ---------------------------------------------------------------------------
function viewDrawerHtml(ro) {
  const c = db.customerById(ro.customerId);
  const v = db.vehicleById(ro.vehicleId);
  const tech = db.techById(ro.techId);
  const bay = db.bayById(ro.bayId);
  const meta = util.statusMeta(ro.status);
  const locked = util.isROLocked(ro);

  return `
    <div class="modal-head">
      <div>
        <div class="modal-title">${ro.ro} <span class="badge ${meta.badgeClass}" style="margin-left:8px">${meta.label}</span></div>
        <div class="muted" style="font-size:var(--t-13);margin-top:4px">${util.customerName(c)} · ${util.vehicleLabel(v)} · ${(v?.mileage || 0).toLocaleString()} mi</div>
      </div>
      <div class="row" style="gap:var(--s2)">${headerActions(ro)}</div>
    </div>
    <div class="modal-body">
      ${locked ? `<div class="alert alert-amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg><div>This RO is <b>${ro.status}</b> — its totals may already be reflected on an invoice/payment. Changes need an adjustment/change order, not a direct edit.</div></div>` : ''}

      <div class="ro-detail-section">
        <h4>Assigned</h4>
        <div class="row between" style="padding:4px 0"><span class="muted">Technician</span><span>${tech ? tech.firstName + ' ' + tech.lastName : '—'}</span></div>
        <div class="row between" style="padding:4px 0"><span class="muted">Bay</span><span>${bay?.name || '—'}</span></div>
        <div class="row between" style="padding:4px 0"><span class="muted">Promised</span><span>${ro.promisedAt ? util.fmtDate(ro.promisedAt) : '—'}</span></div>
      </div>

      <div class="ro-detail-section">
        <h4>Line items</h4>
        <div class="li-row head"><span>Item</span><span>Qty</span><span>Hrs</span><span>Unit</span><span>Total</span><span></span></div>
        ${(ro.lineItems || []).map(lineRow).join('') || '<div class="empty-sub" style="padding:var(--s2) 0">No line items yet.</div>'}
        <div class="li-totals">
          <span>Subtotal: <b class="tnum">${util.fmtMoney(ro.subtotal)}</b></span>
          <span>Discount: <b class="tnum">-${util.fmtMoney(ro.discount || 0)}</b></span>
          <span>Tax: <b class="tnum">${util.fmtMoney(ro.tax)}</b></span>
          <span class="grand tnum">TOTAL: ${util.fmtMoney(ro.total)}</span>
        </div>
      </div>

      <div class="ro-detail-section">
        <h4>DVI checklist</h4>
        ${DVI_ITEMS.map((item) => {
          const existing = (ro.dvi || []).find((d) => d.item === item);
          const status = existing?.status;
          return `
          <div class="dvi-row">
            <span>${item}</span>
            <span class="dvi-pill">
              <button class="green${status === 'green' ? ' active' : ''}" data-dvi="${item}" data-status="green" title="OK"></button>
              <button class="yellow${status === 'yellow' ? ' active' : ''}" data-dvi="${item}" data-status="yellow" title="Watch"></button>
              <button class="red${status === 'red' ? ' active' : ''}" data-dvi="${item}" data-status="red" title="Needs attention"></button>
            </span>
          </div>`;
        }).join('')}
      </div>

      <div class="ro-detail-section">
        <h4>Recommended (from DVI)</h4>
        ${(ro.recommended || []).length
          ? `<ul style="list-style:disc;padding-left:18px;font-size:var(--t-13);color:var(--ink-2)">${ro.recommended.map((r) => `<li>${r.name}</li>`).join('')}</ul>
             <div class="row" style="margin-top:var(--s3);gap:var(--s2)">
               <span class="badge ${ro.approvalStatus === 'approved' ? 'badge-green' : ro.approvalStatus === 'declined' ? 'badge-red' : ro.approvalStatus === 'pending' ? 'badge-amber' : 'badge-gray'}">
                 ${ro.approvalStatus ? ro.approvalStatus.charAt(0).toUpperCase() + ro.approvalStatus.slice(1) : 'Not requested'}
               </span>
               ${!ro.approvalStatus || ro.approvalStatus === 'declined' ? '<button class="btn btn-secondary btn-sm" id="request-approval-btn">Send for Approval</button>' : ''}
               ${ro.approvalStatus === 'pending' ? '<button class="btn btn-primary btn-sm" id="approve-btn">Approved</button><button class="btn btn-danger btn-sm" id="decline-btn">Declined</button>' : ''}
             </div>`
          : '<div class="empty-sub">No recommended work yet — mark a DVI item yellow/red to add one.</div>'}
      </div>

      <div class="ro-detail-section">
        <h4>Notes</h4>
        <div class="row between" style="padding:4px 0"><span class="muted">Customer-facing</span></div>
        <div style="font-size:var(--t-13);color:var(--ink-2)">${ro.notes || '—'}</div>
        <div class="row between" style="padding:4px 0;margin-top:var(--s3)"><span class="muted">Internal</span></div>
        <div style="font-size:var(--t-13);color:var(--ink-2)">${ro.internalNotes || '—'}</div>
      </div>

      <div class="ro-detail-section">
        <h4>Status actions</h4>
        <div class="status-actions">${statusActionButtons(ro)}</div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Edit mode — works entirely on `editDraft` until Save; nothing is written
// to localStorage until then, so Cancel can discard freely.
// ---------------------------------------------------------------------------
function startEdit(ro) {
  editDraft = {
    notes: ro.notes || '',
    internalNotes: ro.internalNotes || '',
    techId: ro.techId || '',
    bayId: ro.bayId || '',
    promisedAt: ro.promisedAt ? ro.promisedAt.slice(0, 10) : '',
    lineItems: (ro.lineItems || []).map((l, i) => ({ ...l, _key: l.id || `new_${i}` })),
  };
  renderDrawer();
}

function editLineRow(line, idx) {
  const typeLabel = { part: 'Part', labor: 'Labor', fee: 'Fee', discount: 'Discount', service: 'Service' }[line.type] || line.type;
  return `
    <div class="li-row" data-line-key="${line._key}">
      <span class="row" style="gap:6px"><span class="muted" style="font-size:var(--t-xs);width:46px;flex-shrink:0">${typeLabel}</span><input class="input" data-edit-field="name" data-idx="${idx}" value="${line.name || ''}" style="font-size:var(--t-13);padding:4px 6px"></span>
      <input class="input" type="number" min="0" step="1" data-edit-field="qty" data-idx="${idx}" value="${line.qty ?? ''}" style="font-size:var(--t-13);padding:4px 6px">
      <input class="input" type="number" min="0" step="0.25" data-edit-field="hours" data-idx="${idx}" value="${line.hours ?? ''}" style="font-size:var(--t-13);padding:4px 6px">
      <input class="input" type="number" min="0" step="0.01" data-edit-field="unitPrice" data-idx="${idx}" value="${line.unitPrice ?? ''}" style="font-size:var(--t-13);padding:4px 6px">
      <span class="tnum strong" data-line-total="${idx}">${util.fmtMoney(previewLineTotal(line))}</span>
      <button class="btn-ghost" data-remove-line-idx="${idx}" title="Remove" style="padding:2px">✕</button>
    </div>`;
}

// Mirrors util.quoteLineTotal's labor formula / the qty*unitPrice formula
// recalcRO uses — display-only preview while editing; util.recalcRO is the
// real calculation that runs on Save.
function previewLineTotal(line) {
  const laborRate = db.settings().laborRate || 0;
  const n = (x) => Number(x) || 0;
  if (line.type === 'labor') return Math.round(n(line.hours) * laborRate * 100) / 100;
  return Math.round(n(line.qty) * n(line.unitPrice) * 100) / 100;
}

function previewTotals(lineItems) {
  const taxRate = db.settings().taxRate || 0;
  const subtotal = Math.round(lineItems.reduce((s, l) => s + previewLineTotal(l), 0) * 100) / 100;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}

function editDrawerHtml(ro) {
  const c = db.customerById(ro.customerId);
  const v = db.vehicleById(ro.vehicleId);
  const meta = util.statusMeta(ro.status);
  const services = db.services();
  const parts = db.parts();
  const techs = db.techs();
  const bays = db.bays();
  const t = previewTotals(editDraft.lineItems);

  return `
    <div class="modal-head">
      <div>
        <div class="modal-title">Edit ${ro.ro} <span class="badge ${meta.badgeClass}" style="margin-left:8px">${meta.label}</span></div>
        <div class="muted" style="font-size:var(--t-13);margin-top:4px">${util.customerName(c)} · ${util.vehicleLabel(v)}</div>
      </div>
      <button class="icon-btn" id="close-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="ro-detail-section">
        <h4>Assigned</h4>
        <div class="grid-2">
          <div class="field">
            <label class="label">Technician</label>
            <select class="select" id="edit-tech">
              <option value="">Unassigned</option>
              ${techs.map((tch) => `<option value="${tch.id}" ${editDraft.techId === tch.id ? 'selected' : ''}>${tch.firstName} ${tch.lastName}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="label">Bay</label>
            <select class="select" id="edit-bay">
              <option value="">Unassigned</option>
              ${bays.map((b) => `<option value="${b.id}" ${editDraft.bayId === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="grid-column:1/-1">
            <label class="label">Promised date</label>
            <input class="input" type="date" id="edit-promised" value="${editDraft.promisedAt}">
          </div>
        </div>
      </div>

      <div class="ro-detail-section">
        <h4>Line items</h4>
        <div class="li-row head"><span>Item</span><span>Qty</span><span>Hrs</span><span>Unit</span><span>Total</span><span></span></div>
        <div id="edit-lines">${editDraft.lineItems.map((l, i) => editLineRow(l, i)).join('') || '<div class="empty-sub" style="padding:var(--s2) 0">No line items yet.</div>'}</div>
        <div class="add-line-row">
          <select id="add-service-select"><option value="">+ Add service…</option>${services.map((s) => `<option value="${s.id}">${s.name} (${util.fmtMoney(s.basePrice)})</option>`).join('')}</select>
          <select id="add-part-select"><option value="">+ Add part…</option>${parts.map((p) => `<option value="${p.id}">${p.name} (${util.fmtMoney(p.price)}, ${p.qtyOnHand} in stock)</option>`).join('')}</select>
          <button class="btn btn-secondary btn-sm" id="add-labor-btn">+ Add labor</button>
        </div>
        <div class="li-totals" id="edit-totals">
          <span>Subtotal: <b class="tnum" id="edit-subtotal">${util.fmtMoney(t.subtotal)}</b></span>
          <span>Tax: <b class="tnum" id="edit-tax">${util.fmtMoney(t.tax)}</b></span>
          <span class="grand tnum" id="edit-grand">TOTAL: ${util.fmtMoney(t.total)}</span>
        </div>
      </div>

      <div class="ro-detail-section">
        <h4>Notes</h4>
        <div class="field"><label class="label">Customer-facing</label><textarea class="textarea" id="edit-notes" placeholder="Symptoms or concerns…">${editDraft.notes}</textarea></div>
        <div class="field" style="margin-top:var(--s3)"><label class="label">Internal</label><textarea class="textarea" id="edit-internal-notes" placeholder="Tech/advisor notes…">${editDraft.internalNotes}</textarea></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="cancel-edit-btn">Cancel</button>
      <button class="btn btn-primary" id="save-edit-btn">Save</button>
    </div>
  `;
}

function recalcEditPreview() {
  const t = previewTotals(editDraft.lineItems);
  document.getElementById('edit-subtotal').textContent = util.fmtMoney(t.subtotal);
  document.getElementById('edit-tax').textContent = util.fmtMoney(t.tax);
  document.getElementById('edit-grand').textContent = `TOTAL: ${util.fmtMoney(t.total)}`;
}

// ---------------------------------------------------------------------------
function refreshAfterChange() {
  renderDrawer();
  renderList();
}

function wireDrawerEvents(ro) {
  document.getElementById('close-drawer').addEventListener('click', closeDrawer);

  if (editDraft) {
    wireEditEvents(ro);
    return;
  }

  document.getElementById('edit-ro-btn')?.addEventListener('click', () => startEdit(ro));
  document.getElementById('print-ro-btn').addEventListener('click', () => printRO(ro));
  document.getElementById('email-ro-btn').addEventListener('click', () => openEmailPreview(ro));

  document.querySelectorAll('[data-dvi]').forEach((btn) => {
    btn.addEventListener('click', () => {
      util.setDviItem(ro.id, btn.dataset.dvi, btn.dataset.status, '');
      refreshAfterChange();
    });
  });

  document.getElementById('request-approval-btn')?.addEventListener('click', () => {
    util.requestApproval(ro.id);
    refreshAfterChange();
  });
  document.getElementById('approve-btn')?.addEventListener('click', () => {
    util.resolveApproval(ro.id, true);
    refreshAfterChange();
  });
  document.getElementById('decline-btn')?.addEventListener('click', () => {
    util.resolveApproval(ro.id, false);
    refreshAfterChange();
  });

  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await runAction(btn.dataset.action, ro.id);
      } catch (err) {
        toast(err.message, 'error');
      }
      refreshAfterChange();
    });
  });
}

function wireEditEvents(ro) {
  document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    editDraft = null;
    renderDrawer();
  });
  document.getElementById('save-edit-btn').addEventListener('click', () => saveEdit(ro));

  document.getElementById('edit-tech').addEventListener('change', (e) => { editDraft.techId = e.target.value; });
  document.getElementById('edit-bay').addEventListener('change', (e) => { editDraft.bayId = e.target.value; });
  document.getElementById('edit-promised').addEventListener('change', (e) => { editDraft.promisedAt = e.target.value; });
  document.getElementById('edit-notes').addEventListener('input', (e) => { editDraft.notes = e.target.value; });
  document.getElementById('edit-internal-notes').addEventListener('input', (e) => { editDraft.internalNotes = e.target.value; });

  document.querySelectorAll('[data-edit-field]').forEach((input) => {
    input.addEventListener('input', () => {
      const idx = Number(input.dataset.idx);
      const field = input.dataset.editField;
      const line = editDraft.lineItems[idx];
      line[field] = field === 'name' ? input.value : Number(input.value) || 0;
      const totalEl = document.querySelector(`[data-line-total="${idx}"]`);
      if (totalEl) totalEl.textContent = util.fmtMoney(previewLineTotal(line));
      recalcEditPreview();
    });
  });

  document.querySelectorAll('[data-remove-line-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editDraft.lineItems.splice(Number(btn.dataset.removeLineIdx), 1);
      renderDrawer();
    });
  });

  document.getElementById('add-service-select').addEventListener('change', (e) => {
    const svc = db.serviceById(e.target.value);
    if (!svc) return;
    editDraft.lineItems.push({ _key: `new_${Date.now()}`, type: 'service', refId: svc.id, name: svc.name, qty: 1, unitPrice: svc.basePrice, hours: svc.baseHours });
    renderDrawer();
  });
  document.getElementById('add-part-select').addEventListener('change', (e) => {
    const part = db.partById(e.target.value);
    if (!part) return;
    editDraft.lineItems.push({ _key: `new_${Date.now()}`, type: 'part', refId: part.id, name: part.name, qty: 1, unitPrice: part.price });
    renderDrawer();
  });
  document.getElementById('add-labor-btn').addEventListener('click', () => {
    editDraft.lineItems.push({ _key: `new_${Date.now()}`, type: 'labor', name: 'Labor', hours: 1, qty: 1, unitPrice: db.settings().laborRate || 0 });
    renderDrawer();
  });
}

function saveEdit(ro) {
  try {
    const lineItems = editDraft.lineItems.map(({ _key, ...l }) => l);
    util.updateRO(ro.id, {
      notes: editDraft.notes,
      internalNotes: editDraft.internalNotes,
      techId: editDraft.techId,
      bayId: editDraft.bayId,
      promisedAt: editDraft.promisedAt ? new Date(editDraft.promisedAt + 'T00:00:00').toISOString() : null,
      lineItems,
    });
    editDraft = null;
    toast(`${ro.ro} updated.`, 'success');
    refreshAfterChange();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function runAction(action, roId) {
  const ro = db.jobById(roId);
  switch (action) {
    case 'checkIn':
      return util.checkIn(roId);
    case 'startJob':
      return util.startJob(roId, ro.bayId, ro.techId);
    case 'holdJob':
      return util.holdJob(roId, 'waiting_approval');
    case 'resumeJob':
      return util.resumeJob(roId);
    case 'markReady':
      if (!ro.lineItems?.length) throw new Error('Cannot mark ready: this RO has no line items.');
      return util.markReady(roId);
    case 'createInvoiceFromRO': {
      if (ro.invoiceId) throw new Error('This RO is already invoiced.');
      const invoice = util.createInvoiceFromRO(roId);
      toast(`Invoice ${invoice.number} created for ${util.fmtMoney(invoice.total)}.`, 'success');
      return invoice;
    }
    case 'cancelRO': {
      const confirmed = await confirmDialog(`Cancel ${ro.ro}? This restocks any parts already added.`, { confirmLabel: 'Cancel RO' });
      if (!confirmed) return;
      return util.cancelRO(roId);
    }
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// Print — browser print, no external libraries. Builds a standalone
// printable document in a new window/tab and calls window.print().
// ---------------------------------------------------------------------------
function printRO(ro) {
  const c = db.customerById(ro.customerId);
  const v = db.vehicleById(ro.vehicleId);
  const tech = db.techById(ro.techId);
  const bay = db.bayById(ro.bayId);
  const shop = db.settings();
  const meta = util.statusMeta(ro.status);

  const win = window.open('', '_blank');
  if (!win) {
    toast('Allow pop-ups to print this repair order.', 'error');
    return;
  }
  win.document.write(`
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>${ro.ro} — ${shop.name || 'My Shop'}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;color:#15181E;padding:32px;max-width:760px;margin:0 auto}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #071A3D;padding-bottom:16px;margin-bottom:20px}
      .brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:20px}
      h1{font-size:18px;margin:0 0 4px}
      .muted{color:#6B7280;font-size:13px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #E5E7EB;font-size:13px}
      th{text-transform:uppercase;font-size:11px;color:#6B7280}
      .num{text-align:right}
      .totals{margin-top:12px;text-align:right;font-size:14px}
      .totals .grand{font-size:18px;font-weight:800;margin-top:6px}
      .section{margin-top:20px}
      .section h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#6B7280;margin:0 0 6px}
    </style></head>
    <body>
      <div class="head">
        <div class="brand">
          <svg viewBox="0 0 256 256" width="30" height="30"><defs><linearGradient id="tb" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7DD3FC"/><stop offset="50%" stop-color="#1E88FF"/><stop offset="100%" stop-color="#2563EB"/></linearGradient></defs><circle cx="128" cy="132" r="62" fill="#071A3D"/><circle cx="128" cy="132" r="34" fill="#FFFFFF"/><path d="M 67 72 A 92 92 0 0 1 197 81" fill="none" stroke="url(#tb)" stroke-width="18"/><path d="M 120 144 L 205 59 L 143 158 Z" fill="url(#tb)"/><circle cx="128" cy="132" r="13" fill="#FFFFFF" stroke="#1E88FF" stroke-width="5"/></svg>
          Torklio
        </div>
        <div style="text-align:right">
          <h1>${ro.ro}</h1>
          <div class="muted">${meta.label} · ${util.fmtDate(ro.createdAt)}</div>
        </div>
      </div>
      <div class="muted">${shop.name || ''} · ${shop.address || ''} · ${shop.phone || ''}</div>

      <div class="section">
        <h2>Customer</h2>
        <div>${util.customerName(c)} — ${c?.phone || ''} ${c?.email ? '· ' + c.email : ''}</div>
        <h2 style="margin-top:10px">Vehicle</h2>
        <div>${util.vehicleLabel(v)} — ${(v?.mileage || 0).toLocaleString()} mi</div>
      </div>

      ${ro.notes ? `<div class="section"><h2>Concern</h2><div>${ro.notes}</div></div>` : ''}

      <div class="section">
        <h2>Line items</h2>
        <table>
          <thead><tr><th>Item</th><th class="num">Qty/Hrs</th><th class="num">Unit</th><th class="num">Total</th></tr></thead>
          <tbody>
            ${(ro.lineItems || []).map((l) => `<tr><td>${l.name}</td><td class="num">${l.type === 'labor' ? (l.hours || 0) + ' hr' : (l.qty || '')}</td><td class="num">${util.fmtMoney(l.unitPrice || 0)}</td><td class="num">${util.fmtMoney(l.total)}</td></tr>`).join('')}
          </tbody>
        </table>
        <div class="totals">
          <div>Subtotal: ${util.fmtMoney(ro.subtotal)}</div>
          ${ro.discount ? `<div>Discount: -${util.fmtMoney(ro.discount)}</div>` : ''}
          <div>Tax: ${util.fmtMoney(ro.tax)}</div>
          <div class="grand">Total: ${util.fmtMoney(ro.total)}</div>
        </div>
      </div>

      <div class="section">
        <h2>Assigned</h2>
        <div>Technician: ${tech ? tech.firstName + ' ' + tech.lastName : '—'} · Bay: ${bay?.name || '—'}</div>
      </div>

      ${ro.internalNotes ? `<div class="section"><h2>Notes</h2><div>${ro.internalNotes}</div></div>` : ''}
    </body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

// ---------------------------------------------------------------------------
// Email placeholder — preview modal only, no real send. "Log Email (Demo)"
// writes a real Communication record (util.logROEmail) so it shows up on
// the customer's activity timeline, same entity Marketing campaigns use.
// ---------------------------------------------------------------------------
function openEmailPreview(ro) {
  const preview = util.buildROEmailPreview(ro.id);
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-head">
        <div class="modal-title">Email Preview <span class="badge badge-gray" style="margin-left:8px">placeholder — no real email sent</span></div>
        <button class="icon-btn" id="close-email-preview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="modal-body">
        <div class="field"><label class="label">To</label><input class="input" value="${preview.to || 'No email on file'}" disabled></div>
        <div class="field"><label class="label">Subject</label><input class="input" value="${preview.subject}" disabled></div>
        <div class="field"><label class="label">Message</label><textarea class="textarea" disabled>${preview.body}</textarea></div>
        <div class="muted" style="font-size:var(--t-13)">${ro.ro} · ${util.fmtMoney(ro.total)} · ${(ro.lineItems || []).length} line item${(ro.lineItems || []).length === 1 ? '' : 's'}</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" id="cancel-email-preview">Cancel</button>
        <button class="btn btn-primary" id="log-email-btn">Log Email (Demo)</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const cleanup = () => overlay.remove();
  overlay.querySelector('#close-email-preview').addEventListener('click', cleanup);
  overlay.querySelector('#cancel-email-preview').addEventListener('click', cleanup);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
  overlay.querySelector('#log-email-btn').addEventListener('click', () => {
    util.logROEmail(ro.id);
    toast('Email logged (demo only — nothing was actually sent).', 'success');
    cleanup();
  });
}
