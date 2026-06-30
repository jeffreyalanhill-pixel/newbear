// AutoBook — modules/invoices/inv-invoices-list.js
// Invoices tab — full tork-drawer standard, clickable CRM links, notes, related
// records, full action bar, communication previews, and reward points hook.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, goToCustomer } from '../../lib/nav.js';
import { openInvDrawer, closeInvDrawer } from './invoices-app.js';
import { downloadCSV, downloadJSON, copyToClipboard, printHTML, showMessagePreview } from '../../lib/export.js';
import { renderControlBar, wireControls, wireSortHeaders, sortRows, updateCount } from './inv-controls.js';
import { torkDrawerHeader, torkSummaryCard, torkSection, torkDetailGrid, torkTotalsBox, torkNoteBlock, wireTorkNotes, torkActionBar } from '../../lib/drawer.js';
import { awardPointsForInvoicePaid, getCustomerReward, pointsValue, tierBadge } from '../../lib/rewards.js';

let currentInvoiceId = null;

const STATUS_BADGE = { draft: 'badge-gray', sent: 'badge-blue', partial: 'badge-amber', paid: 'badge-green', overdue: 'badge-red' };

const sortState = { key: 'issuedAt', dir: 'desc' };
let getValues = () => ({ search: '', filters: {} });

function effectiveStatus(inv) {
  if (inv.status === 'sent' || inv.status === 'partial') {
    if (inv.dueAt && new Date(inv.dueAt).getTime() < Date.now() && inv.balance > 0) return 'overdue';
  }
  return inv.status;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------
export function renderInvInvoicesList(mount) {
  mount.innerHTML = `
    <div class="card">
      <div class="card-body">
        ${renderControlBar({
          searchPlaceholder: 'Search invoice #, customer…',
          filters: [
            { key: 'status', all: 'All statuses', options: [
              { value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' },
              { value: 'partial', label: 'Partial' }, { value: 'paid', label: 'Paid' },
              { value: 'overdue', label: 'Overdue' },
            ]},
          ],
          actions: [
            { key: 'csv', label: 'Export CSV' }, { key: 'print', label: 'Print' }, { key: 'copy', label: 'Copy' },
          ],
        })}
        <table class="table" id="inv-table">
          <thead>
            <tr>
              <th data-sort="number" data-sort-type="text">Number</th>
              <th data-sort="customer" data-sort-type="text">Customer</th>
              <th>Vehicle</th>
              <th data-sort="issuedAt" data-sort-type="date">Issued</th>
              <th class="num" data-sort="total" data-sort-type="money">Total</th>
              <th class="num" data-sort="balance" data-sort-type="money">Balance</th>
              <th data-sort="status" data-sort-type="text">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="inv-table-body"></tbody>
        </table>
      </div>
    </div>`;

  getValues = wireControls(mount, renderList);
  wireSortHeaders(mount.querySelector('thead'), sortState, renderList);
  mount.querySelector('[data-tbl-action="csv"]')?.addEventListener('click', exportCSV);
  mount.querySelector('[data-tbl-action="print"]')?.addEventListener('click', exportPrint);
  mount.querySelector('[data-tbl-action="copy"]')?.addEventListener('click', exportCopy);
  renderList();
}

function allRows() {
  return db.invoices().map(inv => {
    const c = db.customerById(inv.customerId);
    const v = db.vehicleById(inv.vehicleId);
    return { ...inv, customer: util.customerName(c), vehicle: util.vehicleLabel(v), c, v, status: effectiveStatus(inv) };
  });
}

function filteredRows() {
  const { search, filters } = getValues();
  let rows = allRows();
  if (filters.status) rows = rows.filter(i => i.status === filters.status);
  if (search) rows = rows.filter(i =>
    `${i.number} ${i.customer}`.toLowerCase().includes(search));
  const typeMap = { number: 'text', customer: 'text', issuedAt: 'date', total: 'money', balance: 'money', status: 'text' };
  return sortRows(rows, sortState.key, sortState.dir, typeMap[sortState.key] || 'text');
}

function renderList() {
  const rows = filteredRows();
  const all  = allRows();
  const tbody = document.getElementById('inv-table-body');
  if (!tbody) return;

  tbody.innerHTML = rows.length
    ? rows.map(inv => `
        <tr>
          <td class="strong">${inv.number}</td>
          <td>${inv.customerId
            ? `<button class="cust-name-link" data-open-customer="${inv.customerId}">${inv.customer}</button>`
            : (inv.customer || '—')}</td>
          <td>${inv.vehicle || '—'}</td>
          <td>${util.fmtDate(inv.issuedAt)}</td>
          <td class="num tnum">${util.fmtMoney(inv.total)}</td>
          <td class="num tnum">${util.fmtMoney(inv.balance)}</td>
          <td><span class="badge ${STATUS_BADGE[inv.status] || 'badge-gray'}">${inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}</span></td>
          <td><button class="btn btn-secondary btn-sm" data-open="${inv.id}">Open ›</button></td>
        </tr>`).join('')
    : `<tr><td colspan="8"><div class="empty"><div class="empty-title">No invoices match</div><div class="empty-sub">Try clearing filters.</div></div></td></tr>`;

  tbody.querySelectorAll('[data-open-customer]').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); goToCustomer(btn.dataset.openCustomer); }));
  tbody.querySelectorAll('[data-open]').forEach(btn =>
    btn.addEventListener('click', () => openDrawer(btn.dataset.open)));
  const ctrl = document.querySelector('.tbl-ctrl');
  if (ctrl) updateCount(ctrl.parentElement, rows.length, all.length);
}

function exportCSV() {
  downloadCSV('invoices.csv', filteredRows().map(i => ({
    number: i.number, customer: i.customer, vehicle: i.vehicle,
    issued: util.fmtDate(i.issuedAt), total: i.total, balance: i.balance, status: i.status,
  })), [
    { key: 'number', label: 'Invoice #' }, { key: 'customer', label: 'Customer' },
    { key: 'vehicle', label: 'Vehicle' }, { key: 'issued', label: 'Issued' },
    { key: 'total', label: 'Total' }, { key: 'balance', label: 'Balance' }, { key: 'status', label: 'Status' },
  ]);
}
function exportPrint() {
  const rows = filteredRows();
  printHTML('Invoices', `
    <table>
      <thead><tr><th>Invoice #</th><th>Customer</th><th>Issued</th><th class="num">Total</th><th class="num">Balance</th><th>Status</th></tr></thead>
      <tbody>${rows.map(i => `<tr><td>${i.number}</td><td>${i.customer}</td><td>${util.fmtDate(i.issuedAt)}</td><td class="num">$${i.total.toFixed(2)}</td><td class="num">$${i.balance.toFixed(2)}</td><td>${i.status}</td></tr>`).join('')}</tbody>
    </table>
  `);
}
function exportCopy() {
  copyToClipboard(filteredRows().map(i =>
    `${i.number}  ${i.customer}  ${util.fmtDate(i.issuedAt)}  Total: $${i.total.toFixed(2)}  Balance: $${i.balance.toFixed(2)}  ${i.status}`
  ).join('\n'));
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------
function openDrawer(invoiceId) {
  currentInvoiceId = invoiceId;
  renderDrawer();
}

function saveInvoiceField(invoiceId, field, value) {
  const list = db.invoices();
  const idx = list.findIndex(i => i.id === invoiceId);
  if (idx === -1) return false;
  list[idx][field] = value;
  list[idx].updatedAt = new Date().toISOString();
  db.saveInvoices(list);
  return true;
}

function renderDrawer() {
  const inv = db.invoiceById(currentInvoiceId);
  if (!inv) return;
  const c = db.customerById(inv.customerId);
  const v = db.vehicleById(inv.vehicleId);
  const settings = db.settings();
  const status = effectiveStatus(inv);
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const isPaid = status === 'paid';

  // ---- payment rows ----
  const paymentRows = (inv.payments || []).length
    ? inv.payments.map(p => `
        <div class="tork-pay-row">
          <span>${util.fmtDate(p.date)} · ${p.method}${p.reference ? ' · ' + p.reference : ''}</span>
          <span class="tnum">${util.fmtMoney(p.amount)}</span>
        </div>`).join('')
    : '<div class="empty-sub" style="font-size:var(--t-13)">No payments recorded yet.</div>';

  // ---- related records ----
  const relatedJobs    = db.jobsForCustomer(inv.customerId).slice(0, 3);
  const relatedQuotes  = db.quotesForCustomer(inv.customerId).slice(0, 3);
  const creditNotes    = db.creditNotesForCustomer(inv.customerId).filter(cn => cn.invoiceId === inv.id);
  const followUps      = db.followUpTasks().filter(t => t.customerId === inv.customerId && t.status !== 'completed').slice(0, 3);

  const relatedRows = [
    c && { label: 'Customer', value: util.customerName(c), link: true, action: `data-open-customer="${inv.customerId}"` },
    v && { label: 'Vehicle', value: util.vehicleLabel(v) },
    ...relatedJobs.map(j => ({ label: 'RO', value: `${j.ro} · ${util.statusMeta(j.status).label}` })),
    ...relatedQuotes.map(q => ({ label: 'Quote', value: `${q.quoteNumber} · ${util.quoteStatusMeta(q.status).label}` })),
    ...creditNotes.map(cn => ({ label: 'Credit Note', value: `${util.fmtMoney(cn.amount)} · ${cn.status}` })),
    ...followUps.map(t => ({ label: 'Follow-up', value: `${t.title} · Due ${util.fmtDate(t.dueAt)}` })),
  ].filter(Boolean);

  // ---- rewards ----
  const cr = getCustomerReward(inv.customerId);
  const rewardsSection = (cr && cr.membershipStatus === 'active')
    ? torkSection('Rewards',
        `<div class="tork-dr"><div class="tork-dl">Member tier</div><div class="tork-dv">${tierBadge(cr.tier)}</div></div>` +
        `<div class="tork-dr"><div class="tork-dl">Points balance</div><div class="tork-dv tnum">${(cr.pointsBalance || 0).toLocaleString()} pts = ${util.fmtMoney(pointsValue(cr.pointsBalance || 0))}</div></div>`)
    : '';

  // ---- action bar ----
  const primaryActions =
    (inv.balance > 0
      ? `<button class="btn btn-primary btn-sm" id="record-payment-btn">Record Payment</button>`
      : `<button class="btn btn-secondary btn-sm" disabled style="opacity:.5">Paid in full</button>`) +
    `<button class="btn btn-secondary btn-sm" id="send-preview-btn">Send Invoice ▸</button>` +
    `<button class="btn btn-secondary btn-sm" id="print-btn">Print</button>` +
    `<button class="btn btn-secondary btn-sm" id="copy-summary-btn">Copy Summary</button>`;

  const secondaryActions =
    `<button class="btn btn-secondary btn-sm" id="email-preview-btn">Email Preview</button>` +
    `<button class="btn btn-secondary btn-sm" id="sms-preview-btn">Text Preview</button>` +
    `<button class="btn btn-secondary btn-sm" id="export-csv-btn">Export CSV</button>` +
    `<button class="btn btn-secondary btn-sm" id="export-json-btn">Export JSON</button>` +
    (c ? `<button class="btn btn-secondary btn-sm" id="open-customer-btn" data-open-customer="${inv.customerId}">Open Customer</button>` : '') +
    `<button class="btn btn-secondary btn-sm" id="open-crm-btn">Open CRM</button>`;

  openInvDrawer(
    torkDrawerHeader({
      eyebrow: inv.number,
      title: c ? util.customerName(c) : 'Unknown Customer',
      subtitle: v ? util.vehicleLabel(v) : '',
      badges: [`<span class="badge ${STATUS_BADGE[status] || 'badge-gray'}">${statusLabel}</span>`],
    }) +

    `<div class="tork-db">` +

    // print-only shop header
    `<div class="inv-print-head" style="display:flex;justify-content:space-between;margin-bottom:var(--s4)">
      <div>
        <div style="font-weight:800;font-size:var(--t-lg)">${settings.name || 'My Shop'}</div>
        <div class="muted" style="font-size:var(--t-13)">${settings.address || ''}</div>
        <div class="muted" style="font-size:var(--t-13)">${settings.phone || ''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:800">${inv.number}</div>
        <div class="muted" style="font-size:var(--t-13)">Issued ${util.fmtDate(inv.issuedAt)}</div>
        ${inv.dueAt ? `<div class="muted" style="font-size:var(--t-13)">Due ${util.fmtDate(inv.dueAt)}</div>` : ''}
      </div>
    </div>` +

    torkSummaryCard(
      {
        label: isPaid ? 'Paid in full' : 'Balance due',
        amount: `<span style="color:${inv.balance > 0 ? 'var(--red)' : 'var(--green)'}">${util.fmtMoney(inv.balance)}</span>`,
        sub: `Total ${util.fmtMoney(inv.total)} · Paid ${util.fmtMoney(inv.amountPaid)}`,
      },
      inv.dueAt ? `<span class="muted" style="font-size:var(--t-13)">Due<br>${util.fmtDate(inv.dueAt)}</span>` : ''
    ) +

    torkSection('Bill To',
      torkDetailGrid([
        c
          ? { label: 'Customer', value: util.customerName(c), link: true, action: `data-open-customer="${inv.customerId}"` }
          : { label: 'Customer', value: 'Customer record unavailable' },
        c?.phone && { label: 'Phone', value: c.phone },
        c?.email && { label: 'Email', value: c.email },
        v && { label: 'Vehicle', value: util.vehicleLabel(v) },
        v?.mileage && { label: 'Mileage', value: `${(v.mileage || 0).toLocaleString()} mi` },
        { label: 'Issued', value: util.fmtDate(inv.issuedAt) },
        inv.dueAt && { label: 'Due', value: util.fmtDate(inv.dueAt) },
      ].filter(Boolean))
    ) +

    torkSection('Line Items',
      `<table class="tork-li-table">
        <thead><tr>
          <th>Item</th>
          <th class="c">Qty</th>
          <th class="r">Unit</th>
          <th class="r">Total</th>
        </tr></thead>
        <tbody>
          ${(inv.lineItems || []).map(l => `
            <tr>
              <td><div class="tork-li-name">${l.name || '—'}</div></td>
              <td class="c tnum">${l.qty || 1}</td>
              <td class="r tnum">${util.fmtMoney(l.unitPrice || 0)}</td>
              <td class="r tnum" style="font-weight:700">${util.fmtMoney(l.total)}</td>
            </tr>`).join('')}
        </tbody>
      </table>` +
      torkTotalsBox([
        { label: 'Subtotal', value: util.fmtMoney(inv.subtotal) },
        inv.discount > 0 && { label: 'Discount', value: `− ${util.fmtMoney(inv.discount)}` },
        inv.tax > 0 && { label: 'Tax', value: util.fmtMoney(inv.tax) },
        { label: 'Total', value: util.fmtMoney(inv.total), grand: true },
        { label: 'Paid', value: util.fmtMoney(inv.amountPaid) },
        { label: 'Balance', value: `<span style="color:${inv.balance > 0 ? 'var(--red)' : 'var(--green)'}">${util.fmtMoney(inv.balance)}</span>`, grand: true },
      ].filter(Boolean))
    ) +

    torkSection('Payments', paymentRows) +

    torkSection('Notes',
      torkNoteBlock('customerNotes', 'Customer-facing notes', inv.customerNotes, true, 'printed on invoice') +
      torkNoteBlock('internalNotes', 'Internal finance notes', inv.internalNotes, true, 'not printed') +
      torkNoteBlock('paymentNotes', 'Payment notes', inv.paymentNotes, true, 'internal')
    ) +

    (relatedRows.length ? torkSection('Related Records', torkDetailGrid(relatedRows)) : '') +

    rewardsSection +

    `<div class="tork-ds inv-no-print">
      <div class="tork-ds-title">Actions</div>
      ${torkActionBar(primaryActions, secondaryActions)}
    </div>` +

    `</div>`
  );

  // close
  document.getElementById('close-drawer').addEventListener('click', closeInvDrawer);

  // customer links inside drawer
  document.querySelectorAll('[data-open-customer]').forEach(btn =>
    btn.addEventListener('click', () => goToCustomer(btn.dataset.openCustomer)));

  // notes
  wireTorkNotes(document.getElementById('inv-drawer') || document, (field, value) => {
    saveInvoiceField(inv.id, field, value);
  });

  // primary
  document.getElementById('record-payment-btn')?.addEventListener('click', () => openPaymentModal(inv));
  document.getElementById('send-preview-btn')?.addEventListener('click', () => openEmailPreview(inv, c, settings));
  document.getElementById('print-btn')?.addEventListener('click', () => window.print());
  document.getElementById('copy-summary-btn')?.addEventListener('click', () => copySummary(inv, c, v));

  // secondary
  document.getElementById('email-preview-btn')?.addEventListener('click', () => openEmailPreview(inv, c, settings));
  document.getElementById('sms-preview-btn')?.addEventListener('click', () => openSmsPreview(inv, c, settings));
  document.getElementById('export-csv-btn')?.addEventListener('click', () => exportInvoiceCSV(inv, c, v));
  document.getElementById('export-json-btn')?.addEventListener('click', () => downloadJSON(`invoice-${inv.number}.json`, inv));
  document.getElementById('open-customer-btn')?.addEventListener('click', () => goToCustomer(inv.customerId));
  document.getElementById('open-crm-btn')?.addEventListener('click', () => { window.location.href = 'crm.html'; });
}

// ---------------------------------------------------------------------------
// Communication previews
// ---------------------------------------------------------------------------
function buildEmailBody(inv, c, settings) {
  const name = c?.firstName || util.customerName(c) || 'Customer';
  const shop = settings.name || 'Our Shop';
  const paidLine = inv.balance > 0
    ? `Balance due: ${util.fmtMoney(inv.balance)}\n\nPlease contact us at ${settings.phone || shop} to arrange payment.`
    : `This invoice is paid in full. Thank you!`;
  return `Hi ${name},\n\nPlease find your invoice ${inv.number} from ${shop} below.\n\nTotal: ${util.fmtMoney(inv.total)}\nPaid: ${util.fmtMoney(inv.amountPaid)}\n${paidLine}\n\nThank you for your business.\n– ${shop}`;
}

function buildSmsBody(inv, c, settings) {
  const name = c?.firstName || util.customerName(c) || 'Customer';
  const shop = settings.name || 'Our Shop';
  const balanceLine = inv.balance > 0
    ? `has a balance due of ${util.fmtMoney(inv.balance)}`
    : 'is paid in full';
  return `Hi ${name}, your invoice ${inv.number} from ${shop} ${balanceLine}. Call ${settings.phone || 'us'} if you need anything. Reply STOP to opt out.`;
}

function openEmailPreview(inv, c, settings) {
  showMessagePreview({
    channel: 'email',
    to: c?.email || 'Not on file',
    subject: `Invoice ${inv.number} from ${settings.name || 'Our Shop'}`,
    body: buildEmailBody(inv, c, settings),
  });
}

function openSmsPreview(inv, c, settings) {
  showMessagePreview({
    channel: 'sms',
    to: c?.phone || 'Not on file',
    body: buildSmsBody(inv, c, settings),
  });
}

// ---------------------------------------------------------------------------
// Copy summary
// ---------------------------------------------------------------------------
function copySummary(inv, c, v) {
  const lines = [
    `Invoice ${inv.number}`,
    `Customer: ${util.customerName(c)}`,
    v ? `Vehicle: ${util.vehicleLabel(v)}` : null,
    `Status: ${effectiveStatus(inv)}`,
    `Issued: ${util.fmtDate(inv.issuedAt)}`,
    inv.dueAt ? `Due: ${util.fmtDate(inv.dueAt)}` : null,
    '',
    'Line Items:',
    ...(inv.lineItems || []).map(l => `  ${l.name || '—'}  ×${l.qty || 1}  @${util.fmtMoney(l.unitPrice || 0)}  = ${util.fmtMoney(l.total)}`),
    '',
    `Subtotal: ${util.fmtMoney(inv.subtotal)}`,
    inv.discount > 0 ? `Discount: − ${util.fmtMoney(inv.discount)}` : null,
    inv.tax > 0 ? `Tax: ${util.fmtMoney(inv.tax)}` : null,
    `Total: ${util.fmtMoney(inv.total)}`,
    `Paid: ${util.fmtMoney(inv.amountPaid)}`,
    `Balance: ${util.fmtMoney(inv.balance)}`,
    '',
    'Payments:',
    ...((inv.payments || []).length
      ? inv.payments.map(p => `  ${util.fmtDate(p.date)} · ${p.method}${p.reference ? ' · ' + p.reference : ''}  ${util.fmtMoney(p.amount)}`)
      : ['  None']),
  ].filter(l => l !== null).join('\n');
  copyToClipboard(lines);
}

// ---------------------------------------------------------------------------
// Per-invoice CSV export (line items)
// ---------------------------------------------------------------------------
function exportInvoiceCSV(inv, c, v) {
  downloadCSV(`${inv.number}-lines.csv`, (inv.lineItems || []).map(l => ({
    invoice: inv.number, customer: util.customerName(c), vehicle: util.vehicleLabel(v),
    item: l.name, qty: l.qty || 1, unitPrice: l.unitPrice || 0, total: l.total,
  })), [
    { key: 'invoice', label: 'Invoice #' }, { key: 'customer', label: 'Customer' },
    { key: 'vehicle', label: 'Vehicle' }, { key: 'item', label: 'Item' },
    { key: 'qty', label: 'Qty' }, { key: 'unitPrice', label: 'Unit Price' }, { key: 'total', label: 'Total' },
  ]);
}

// ---------------------------------------------------------------------------
// Record Payment modal
// ---------------------------------------------------------------------------
function openPaymentModal(inv) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-head">
        <div class="modal-title">Record Payment</div>
        <button class="icon-btn" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="modal-body">
        <div class="muted" style="font-size:var(--t-13)">Balance due: <b>${util.fmtMoney(inv.balance)}</b></div>
        <div class="field">
          <label class="label">Amount</label>
          <input type="number" class="input" id="pay-amount" value="${inv.balance.toFixed(2)}" step="0.01" min="0.01" max="${inv.balance}">
        </div>
        <div class="field">
          <label class="label">Method</label>
          <select class="select" id="pay-method">
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="ach">ACH <span style="font-size:9px">(placeholder)</span></option>
            <option value="deposit">Deposit</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="field">
          <label class="label">Reference # <span class="muted" style="font-size:10px">optional</span></label>
          <input class="input" id="pay-reference" placeholder="Check #, auth code, etc.">
        </div>
        <div class="field-error" id="pay-error" style="color:var(--red);font-size:var(--t-13)"></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" data-close>Cancel</button>
        <button class="btn btn-primary" id="pay-submit-btn">Record Payment</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', close));
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#pay-submit-btn').addEventListener('click', () => {
    const amount = Number(overlay.querySelector('#pay-amount').value);
    const method = overlay.querySelector('#pay-method').value;
    const errEl = overlay.querySelector('#pay-error');
    if (!amount || amount <= 0) { errEl.textContent = 'Enter an amount greater than $0.'; return; }
    if (amount > inv.balance + 0.001) { errEl.textContent = `Amount can't exceed the balance due (${util.fmtMoney(inv.balance)}).`; return; }
    const updated = util.recordPayment(inv.id, amount, method, { reference: overlay.querySelector('#pay-reference').value.trim() });
    if (updated.status === 'paid') {
      const awarded = awardPointsForInvoicePaid(updated);
      if (awarded) toast(`Payment recorded — ${awarded.pointsBalance.toLocaleString()} pts on account.`, 'success');
      else toast(`Payment of ${util.fmtMoney(amount)} recorded — invoice now ${updated.status}.`, 'success');
    } else {
      toast(`Payment of ${util.fmtMoney(amount)} recorded — invoice now ${updated.status}.`, 'success');
    }
    close();
    renderDrawer();
    renderList();
  });
}
