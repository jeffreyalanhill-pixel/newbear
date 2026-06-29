// AutoBook — modules/invoices/inv-credit-notes.js
// Credit Notes / Refunds — real CRUD via util.createCreditNote/issueCreditNote/
// applyCreditNoteToInvoice/voidCreditNote. Applying a credit note reduces an
// invoice's balance through the same payments-array mechanism
// util.recordPayment uses — it never deletes or rewrites the original invoice.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import { openInvDrawer, closeInvDrawer, refreshInvoicesApp } from './invoices-app.js';

const STATUS_BADGE = { draft: 'badge-gray', issued: 'badge-blue', applied: 'badge-green', void: 'badge-red' };
const REASONS = [
  { value: 'refund', label: 'Refund' },
  { value: 'goodwill', label: 'Goodwill Credit' },
  { value: 'warranty', label: 'Warranty Credit' },
  { value: 'overpayment', label: 'Overpayment Credit' },
  { value: 'adjustment', label: 'Adjustment' },
];

export function renderInvCreditNotes(mount) {
  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">Credit Notes / Refunds</div><button class="btn btn-primary btn-sm" id="add-cn-btn">+ Add Credit Note</button></div>
      <div class="card-body" id="cn-list"></div>
    </div>
  `;
  document.getElementById('add-cn-btn').addEventListener('click', openCreateCreditNote);
  renderList();
}

function renderList() {
  const notes = db.creditNotes().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  document.getElementById('cn-list').innerHTML = notes.length
    ? `<table class="table">
        <thead><tr><th>Customer</th><th>Invoice</th><th class="num">Amount</th><th>Reason</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody>
          ${notes.map((cn) => `
            <tr>
              <td>${util.customerName(db.customerById(cn.customerId))}</td>
              <td>${cn.invoiceId ? db.invoiceById(cn.invoiceId)?.number || cn.invoiceId : '—'}</td>
              <td class="num tnum">${util.fmtMoney(cn.amount)}</td>
              <td>${REASONS.find((r) => r.value === cn.reason)?.label || cn.reason}</td>
              <td><span class="badge ${STATUS_BADGE[cn.status] || 'badge-gray'}">${cn.status}</span></td>
              <td>${util.fmtDate(cn.createdAt)}</td>
              <td><button class="btn btn-secondary btn-sm" data-open-cn="${cn.id}">Open</button></td>
            </tr>`).join('')}
        </tbody>
      </table>`
    : '<div class="empty-sub">No credit notes yet.</div>';
  document.querySelectorAll('[data-open-cn]').forEach((btn) => btn.addEventListener('click', () => openCreditNoteDrawer(btn.dataset.openCn)));
}

function openCreditNoteDrawer(cnId) {
  const cn = db.creditNoteById(cnId);
  const customer = db.customerById(cn.customerId);
  const unpaidInvoices = db.invoices().filter((i) => i.customerId === cn.customerId && i.balance > 0);

  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">Credit Note <span class="badge ${STATUS_BADGE[cn.status] || 'badge-gray'}" style="margin-left:8px">${cn.status}</span></div>
      <button class="icon-btn" id="close-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="row between" style="padding:4px 0"><span class="muted">Customer</span><span>${util.customerName(customer)}</span></div>
      <div class="row between" style="padding:4px 0"><span class="muted">Amount</span><span class="tnum">${util.fmtMoney(cn.amount)}</span></div>
      <div class="row between" style="padding:4px 0"><span class="muted">Reason</span><span>${REASONS.find((r) => r.value === cn.reason)?.label || cn.reason}</span></div>
      ${cn.invoiceId ? `<div class="row between" style="padding:4px 0"><span class="muted">Applied to invoice</span><span>${db.invoiceById(cn.invoiceId)?.number}</span></div>` : ''}
      ${cn.notes ? `<div class="muted" style="font-size:var(--t-13);margin-top:4px">${cn.notes}</div>` : ''}

      ${cn.status === 'issued' ? `
        <div class="field" style="margin-top:var(--s4)">
          <label class="label">Apply to invoice</label>
          <select class="select" id="cn-apply-target"><option value="">Select an unpaid invoice…</option>${unpaidInvoices.map((i) => `<option value="${i.id}">${i.number} — balance ${util.fmtMoney(i.balance)}</option>`).join('')}</select>
        </div>` : ''}
    </div>
    <div class="modal-foot">
      ${cn.status === 'draft' ? '<button class="btn btn-primary" id="cn-issue">Issue Credit Note</button>' : ''}
      ${cn.status === 'issued' ? '<button class="btn btn-primary" id="cn-apply">Apply to Invoice</button>' : ''}
      ${['draft', 'issued'].includes(cn.status) ? '<button class="btn btn-danger" id="cn-void">Void</button>' : ''}
      <button class="btn btn-secondary" id="cn-done">Close</button>
    </div>
  `);
  document.getElementById('close-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('cn-done').addEventListener('click', closeInvDrawer);
  document.getElementById('cn-issue')?.addEventListener('click', () => {
    util.issueCreditNote(cnId);
    toast('Credit note issued.', 'success');
    openCreditNoteDrawer(cnId);
    renderList();
  });
  document.getElementById('cn-apply')?.addEventListener('click', () => {
    const targetId = document.getElementById('cn-apply-target').value;
    if (!targetId) { toast('Select an invoice to apply this credit to.', 'error'); return; }
    try {
      util.applyCreditNoteToInvoice(cnId, targetId);
      toast('Credit note applied to invoice.', 'success');
      closeInvDrawer();
      renderList();
      refreshInvoicesApp();
    } catch (err) { toast(err.message, 'error'); }
  });
  document.getElementById('cn-void')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog('Void this credit note?', { confirmLabel: 'Void' });
    if (!confirmed) return;
    util.voidCreditNote(cnId);
    toast('Credit note voided.');
    closeInvDrawer();
    renderList();
  });
}

function openCreateCreditNote() {
  const customers = db.customers().slice().sort((a, b) => a.firstName.localeCompare(b.firstName));
  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">Add Credit Note</div>
      <button class="icon-btn" id="close-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="grid-2">
        <div class="field"><label class="label">Customer</label><select class="select" id="cn-customer"><option value="">Select…</option>${customers.map((c) => `<option value="${c.id}">${util.customerName(c)}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Amount</label><input class="input" type="number" min="0.01" step="0.01" id="cn-amount"></div>
        <div class="field"><label class="label">Reason</label><select class="select" id="cn-reason">${REASONS.map((r) => `<option value="${r.value}">${r.label}</option>`).join('')}</select></div>
      </div>
      <div class="field" style="margin-top:var(--s3)"><label class="label">Notes</label><textarea class="textarea" id="cn-notes"></textarea></div>
      <div class="muted" style="font-size:var(--t-xs);margin-top:var(--s2)">This does not delete or change any original invoice. It starts as a draft — issue it, then apply it to an unpaid invoice when ready.</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="cn-cancel">Cancel</button>
      <button class="btn btn-primary" id="cn-create">Create Credit Note</button>
    </div>
  `);
  document.getElementById('close-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('cn-cancel').addEventListener('click', closeInvDrawer);
  document.getElementById('cn-create').addEventListener('click', () => {
    const customerId = document.getElementById('cn-customer').value;
    const amount = Number(document.getElementById('cn-amount').value);
    if (!customerId || !amount || amount <= 0) { toast('Customer and an amount greater than $0 are required.', 'error'); return; }
    util.createCreditNote({ customerId, amount, reason: document.getElementById('cn-reason').value, notes: document.getElementById('cn-notes').value.trim() });
    toast('Credit note created (draft).', 'success');
    closeInvDrawer();
    renderList();
  });
}
