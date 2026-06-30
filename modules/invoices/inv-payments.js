// AutoBook — modules/invoices/inv-payments.js
// Payments Received — flattened from every invoice's real payments array
// (util.allPaymentsReceived()); no separate payments entity exists.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { copyToClipboard, downloadCSV, printHTML } from '../../lib/export.js';
import { goToCustomer } from '../../lib/nav.js';
import { renderControlBar, wireControls, wireSortHeaders, sortRows, updateCount } from './inv-controls.js';

const TENDER_LABEL = {
  cash: 'Cash', card: 'Card', ach: 'ACH (placeholder)', check: 'Check',
  financing: 'Financing (placeholder)', deposit: 'Deposit', store_credit: 'Store Credit (placeholder)',
  credit_note: 'Credit Note', other: 'Other',
};

const sortState = { key: 'date', dir: 'desc' };
let getValues = () => ({ search: '', filters: {} });

export function renderInvPayments(mount) {
  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">Payments Received</div></div>
      <div class="card-body">
        ${renderControlBar({
          searchPlaceholder: 'Search customer, invoice, reference…',
          filters: [
            { key: 'method', all: 'All methods', options: [
              { value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' },
              { value: 'check', label: 'Check' }, { value: 'ach', label: 'ACH' },
              { value: 'credit_note', label: 'Credit Note' }, { value: 'other', label: 'Other' },
            ]},
          ],
          actions: [
            { key: 'csv', label: 'Export CSV' },
            { key: 'print', label: 'Print' },
            { key: 'copy', label: 'Copy' },
          ],
        })}
        <table class="table">
          <thead>
            <tr>
              <th data-sort="date" data-sort-type="date">Date</th>
              <th data-sort="customer" data-sort-type="text">Customer</th>
              <th data-sort="invoiceNumber" data-sort-type="text">Invoice #</th>
              <th class="num" data-sort="amount" data-sort-type="money">Amount</th>
              <th data-sort="method" data-sort-type="text">Method</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody id="pay-tbody"></tbody>
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
  return util.allPaymentsReceived().map(p => ({
    ...p,
    customer: util.customerName(db.customerById(p.customerId)),
  }));
}

function filtered() {
  const { search, filters } = getValues();
  let rows = allRows();
  if (filters.method) rows = rows.filter(p => p.method === filters.method);
  if (search) rows = rows.filter(p =>
    `${p.customer} ${p.invoiceNumber} ${p.reference || ''} ${p.method}`.toLowerCase().includes(search));
  return sortRows(rows, sortState.key, sortState.dir, mount_sortType());
}

function mount_sortType() {
  const types = { date: 'date', amount: 'money', customer: 'text', invoiceNumber: 'text', method: 'text' };
  return types[sortState.key] || 'text';
}

function renderList() {
  const rows = filtered();
  const all  = allRows();
  const tbody = document.getElementById('pay-tbody');
  if (!tbody) return;
  tbody.innerHTML = rows.length
    ? rows.map(p => `
        <tr>
          <td>${util.fmtDate(p.date)}</td>
          <td>${p.customerId
            ? `<button class="cust-name-link" data-open-customer="${p.customerId}">${p.customer || '—'}</button>`
            : (p.customer || '—')}</td>
          <td class="strong">${p.invoiceNumber || '—'}</td>
          <td class="num tnum">${util.fmtMoney(p.amount)}</td>
          <td>${TENDER_LABEL[p.method] || p.method}</td>
          <td>${p.reference || '—'}</td>
        </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-sub">No payments match.</div></td></tr>`;
  tbody.querySelectorAll('[data-open-customer]').forEach(btn =>
    btn.addEventListener('click', () => goToCustomer(btn.dataset.openCustomer)));
  const ctrl = document.querySelector('.tbl-ctrl');
  if (ctrl) updateCount(ctrl.parentElement, rows.length, all.length);
}

function exportCSV() {
  downloadCSV('payments-received.csv', filtered(), [
    { key: 'date', label: 'Date' }, { key: 'customer', label: 'Customer' },
    { key: 'invoiceNumber', label: 'Invoice #' }, { key: 'amount', label: 'Amount' },
    { key: 'method', label: 'Method' }, { key: 'reference', label: 'Reference' },
  ]);
}
function exportPrint() {
  const rows = filtered();
  const total = rows.reduce((s, p) => s + p.amount, 0);
  printHTML('Payments Received', `
    <table>
      <thead><tr><th>Date</th><th>Customer</th><th>Invoice</th><th class="num">Amount</th><th>Method</th><th>Reference</th></tr></thead>
      <tbody>${rows.map(p => `<tr><td>${util.fmtDate(p.date)}</td><td>${p.customer}</td><td>${p.invoiceNumber}</td><td class="num">$${p.amount.toFixed(2)}</td><td>${TENDER_LABEL[p.method]||p.method}</td><td>${p.reference||''}</td></tr>`).join('')}</tbody>
    </table>
    <p style="text-align:right;margin-top:12px"><strong>Total: $${total.toFixed(2)}</strong></p>
  `);
}
function exportCopy() {
  const rows = filtered();
  const total = rows.reduce((s, p) => s + p.amount, 0);
  copyToClipboard(
    rows.map(p => `${util.fmtDate(p.date)}  ${p.customer}  ${p.invoiceNumber}  $${p.amount.toFixed(2)}  ${TENDER_LABEL[p.method]||p.method}`).join('\n')
    + `\n\nTotal: $${total.toFixed(2)}`
  );
}
