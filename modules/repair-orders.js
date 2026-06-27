// AutoBook — modules/repair-orders.js (§11.2)
// RO list + full detail drawer. All status changes go through util's §9
// transitions; all line-item math goes through util.recalcRO. This page never
// sets ro.status directly.

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import { renderNav, toast, confirmDialog } from '../lib/nav.js';

let currentRoId = null;

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
  renderDrawer();
  document.getElementById('ro-overlay').classList.add('open');
}

function closeDrawer() {
  document.getElementById('ro-overlay').classList.remove('open');
  currentRoId = null;
}

function lineRow(line) {
  return `
    <div class="li-row">
      <span>${line.name}${line.type === 'part' ? ' <span class="muted" style="font-size:var(--t-xs)">(part)</span>' : line.type === 'labor' ? ' <span class="muted" style="font-size:var(--t-xs)">(labor)</span>' : ''}</span>
      <span>${line.qty || ''}</span>
      <span>${line.hours ? line.hours + 'h' : ''}</span>
      <span class="tnum">${util.fmtMoney(line.unitPrice || 0)}</span>
      <span class="tnum strong">${util.fmtMoney(line.total)}</span>
      <button class="btn-ghost" data-remove-line="${line.id}" title="Remove" style="padding:2px">✕</button>
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

function renderDrawer() {
  const ro = db.jobById(currentRoId);
  if (!ro) return;
  const c = db.customerById(ro.customerId);
  const v = db.vehicleById(ro.vehicleId);
  const meta = util.statusMeta(ro.status);
  const services = db.services();
  const parts = db.parts();

  document.getElementById('ro-drawer').innerHTML = `
    <div class="modal-head">
      <div>
        <div class="modal-title">${ro.ro} <span class="badge ${meta.badgeClass}" style="margin-left:8px">${meta.label}</span></div>
        <div class="muted" style="font-size:var(--t-13);margin-top:4px">${util.customerName(c)} · ${util.vehicleLabel(v)} · ${(v?.mileage || 0).toLocaleString()} mi</div>
      </div>
      <button class="icon-btn" id="close-drawer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="ro-detail-section">
        <h4>Line items</h4>
        <div class="li-row head"><span>Item</span><span>Qty</span><span>Hrs</span><span>Unit</span><span>Total</span><span></span></div>
        ${(ro.lineItems || []).map(lineRow).join('') || '<div class="empty-sub" style="padding:var(--s2) 0">No line items yet.</div>'}
        <div class="add-line-row">
          <select id="add-service-select"><option value="">+ Add service…</option>${services.map((s) => `<option value="${s.id}">${s.name} (${util.fmtMoney(s.basePrice)})</option>`).join('')}</select>
          <select id="add-part-select"><option value="">+ Add part…</option>${parts.map((p) => `<option value="${p.id}">${p.name} (${util.fmtMoney(p.price)}, ${p.qtyOnHand} in stock)</option>`).join('')}</select>
        </div>
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
        <div class="field"><label class="label">Customer notes</label><textarea class="textarea" id="notes-field" placeholder="Symptoms or concerns…">${ro.notes || ''}</textarea></div>
        <div class="field" style="margin-top:var(--s3)"><label class="label">Internal notes</label><textarea class="textarea" id="internal-notes-field" placeholder="Tech/advisor notes…">${ro.internalNotes || ''}</textarea></div>
      </div>

      <div class="ro-detail-section">
        <h4>Status actions</h4>
        <div class="status-actions">${statusActionButtons(ro)}</div>
      </div>
    </div>
  `;

  wireDrawerEvents(ro);
}

function refreshAfterChange() {
  renderDrawer();
  renderList();
}

function wireDrawerEvents(ro) {
  document.getElementById('close-drawer').addEventListener('click', closeDrawer);

  document.getElementById('add-service-select').addEventListener('change', (e) => {
    const svc = db.serviceById(e.target.value);
    if (!svc) return;
    util.addLineItem(ro.id, { type: 'service', refId: svc.id, name: svc.name, qty: 1, unitPrice: svc.basePrice, hours: svc.baseHours });
    refreshAfterChange();
  });
  document.getElementById('add-part-select').addEventListener('change', (e) => {
    const part = db.partById(e.target.value);
    if (!part) return;
    if (part.qtyOnHand <= 0) {
      toast(`${part.name} is out of stock.`, 'error');
      e.target.value = '';
      return;
    }
    util.addLineItem(ro.id, { type: 'part', refId: part.id, name: part.name, qty: 1, unitPrice: part.price });
    refreshAfterChange();
  });
  document.querySelectorAll('[data-remove-line]').forEach((btn) => {
    btn.addEventListener('click', () => {
      util.removeLineItem(ro.id, btn.dataset.removeLine);
      refreshAfterChange();
    });
  });

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

  document.getElementById('notes-field')?.addEventListener('blur', (e) => {
    const j = db.jobById(ro.id);
    j.notes = e.target.value;
    db.saveJobs(db.jobs().map((x) => (x.id === j.id ? j : x)));
  });
  document.getElementById('internal-notes-field')?.addEventListener('blur', (e) => {
    const j = db.jobById(ro.id);
    j.internalNotes = e.target.value;
    db.saveJobs(db.jobs().map((x) => (x.id === j.id ? j : x)));
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
