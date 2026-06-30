// AutoBook — modules/invoices/inv-customers.js
// Customer Balances — real, derived from util.customerFinanceSummary() per customer.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { printHTML, showMessagePreview, copyToClipboard, downloadCSV } from '../../lib/export.js';
import { goToCustomer, toast } from '../../lib/nav.js';
import { renderControlBar, wireControls, wireSortHeaders, sortRows, updateCount } from './inv-controls.js';

const sortState = { key: 'name', dir: 'asc' };
let getValues = () => ({ search: '', filters: {} });

export function renderInvCustomers(mount) {
  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">Customer Balances</div></div>
      <div class="card-body">
        ${renderControlBar({
          searchPlaceholder: 'Search name, phone, email…',
          filters: [
            { key: 'balance', all: 'All balances', options: [
              { value: 'has_balance', label: 'Has balance' },
              { value: 'no_balance', label: 'No balance' },
              { value: 'has_credits', label: 'Has credits' },
              { value: 'unpaid_invoices', label: 'Has unpaid invoices' },
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
              <th data-sort="name" data-sort-type="text">Customer</th>
              <th class="num" data-sort="unpaid" data-sort-type="number">Unpaid Invoices</th>
              <th class="num" data-sort="balance" data-sort-type="money">Total Balance</th>
              <th class="num" data-sort="credits" data-sort-type="number">Credits</th>
              <th data-sort="lastPayment" data-sort-type="date">Last Payment</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="cust-tbody"></tbody>
        </table>
      </div>
    </div>`;

  getValues = wireControls(mount, renderList);
  wireSortHeaders(mount.querySelector('thead'), sortState, renderList);
  mount.querySelector('[data-tbl-action="csv"]')?.addEventListener('click', exportCSV);
  mount.querySelector('[data-tbl-action="print"]')?.addEventListener('click', exportPrint);
  mount.querySelector('[data-tbl-action="copy"]')?.addEventListener('click', exportCopy);
  renderList();

  mount.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-customer]');
    if (!btn) return;
    const cid = btn.dataset.openCustomer;
    if (cid && db.customerById(cid)) { goToCustomer(cid); }
    else { toast('Customer record unavailable.', 'error'); }
  });

  mount.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-statement]');
    if (btn) openStatement(btn.dataset.statement);
  });
}

function allRows() {
  return db.customers()
    .map(c => {
      const s = util.customerFinanceSummary(c.id);
      return {
        c, s,
        name: util.customerName(c),
        unpaid: s.unpaidInvoices.length,
        balance: s.totalBalance,
        credits: s.credits.filter(cr => cr.status === 'issued').length,
        lastPayment: s.lastPaymentDate || '',
      };
    })
    .filter(r => r.s.unpaidInvoices.length || r.s.payments.length);
}

function filtered() {
  const { search, filters } = getValues();
  let rows = allRows();
  if (filters.balance === 'has_balance')      rows = rows.filter(r => r.balance > 0);
  if (filters.balance === 'no_balance')       rows = rows.filter(r => r.balance <= 0);
  if (filters.balance === 'has_credits')      rows = rows.filter(r => r.credits > 0);
  if (filters.balance === 'unpaid_invoices')  rows = rows.filter(r => r.unpaid > 0);
  if (search) rows = rows.filter(r =>
    `${r.name} ${r.c.phone || ''} ${r.c.email || ''}`.toLowerCase().includes(search));
  const typeMap = { name: 'text', unpaid: 'number', balance: 'money', credits: 'number', lastPayment: 'date' };
  return sortRows(rows, sortState.key, sortState.dir, typeMap[sortState.key] || 'text');
}

function renderList() {
  const rows = filtered();
  const all  = allRows();
  const tbody = document.getElementById('cust-tbody');
  if (!tbody) return;
  tbody.innerHTML = rows.length
    ? rows.map(({ c, s, name, unpaid, balance, credits, lastPayment }) => `
        <tr>
          <td><button class="cust-name-link" data-open-customer="${c.id}">${name}</button></td>
          <td class="num">${unpaid}</td>
          <td class="num tnum" style="${balance > 0 ? 'color:var(--red)' : ''}">${util.fmtMoney(balance)}</td>
          <td class="num tnum">${credits}</td>
          <td>${lastPayment ? util.fmtDate(lastPayment) : '—'}</td>
          <td><button class="btn btn-secondary btn-sm" data-statement="${c.id}">Statement</button></td>
        </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-sub">No customers match.</div></td></tr>`;
  const ctrl = document.querySelector('.tbl-ctrl');
  if (ctrl) updateCount(ctrl.parentElement, rows.length, all.length);
}

function exportCSV() {
  downloadCSV('customer-balances.csv', filtered().map(r => ({
    customer: r.name, phone: r.c.phone || '', email: r.c.email || '',
    unpaidInvoices: r.unpaid, totalBalance: r.balance, credits: r.credits,
    lastPayment: r.lastPayment ? util.fmtDate(r.lastPayment) : '',
  })), [
    { key: 'customer', label: 'Customer' }, { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' }, { key: 'unpaidInvoices', label: 'Unpaid Invoices' },
    { key: 'totalBalance', label: 'Total Balance' }, { key: 'credits', label: 'Credits' },
    { key: 'lastPayment', label: 'Last Payment' },
  ]);
}
function exportPrint() {
  const rows = filtered();
  printHTML('Customer Balances', `
    <table>
      <thead><tr><th>Customer</th><th class="num">Unpaid</th><th class="num">Balance</th><th class="num">Credits</th><th>Last Payment</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${r.name}</td><td class="num">${r.unpaid}</td><td class="num">$${r.balance.toFixed(2)}</td><td class="num">${r.credits}</td><td>${r.lastPayment ? util.fmtDate(r.lastPayment) : '—'}</td></tr>`).join('')}</tbody>
    </table>
  `);
}
function exportCopy() {
  const rows = filtered();
  copyToClipboard(rows.map(r =>
    `${r.name}  Balance: $${r.balance.toFixed(2)}  Unpaid: ${r.unpaid}  Last payment: ${r.lastPayment ? util.fmtDate(r.lastPayment) : 'none'}`
  ).join('\n'));
}

function openStatement(customerId) {
  const c = db.customerById(customerId);
  if (!c) { toast('Customer record unavailable.', 'error'); return; }
  const s = util.customerFinanceSummary(customerId);
  const lines = [
    `Statement for ${util.customerName(c)}`,
    `Total balance due: ${util.fmtMoney(s.totalBalance)}`,
    '',
    'Unpaid invoices:',
    ...s.unpaidInvoices.map(i => `  ${i.number} — ${util.fmtMoney(i.balance)} due`),
    '',
    'Recent payments:',
    ...s.payments.slice(0, 5).map(p => `  ${util.fmtDate(p.date)} — ${util.fmtMoney(p.amount)} (${p.method})`),
  ];
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-head">
        <div class="modal-title">Statement —
          <button class="cust-name-link" style="font-size:inherit" data-open-cust="${customerId}">${util.customerName(c)}</button>
        </div>
        <button class="icon-btn" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="modal-body"><pre style="white-space:pre-wrap;font-family:inherit;font-size:var(--t-13)">${lines.join('\n')}</pre></div>
      <div class="modal-foot">
        <button class="btn btn-secondary" data-close>Close</button>
        <button class="btn btn-secondary" id="stmt-print">Print</button>
        <button class="btn btn-primary" id="stmt-email">Email Preview</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', close));
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-open-cust]')?.addEventListener('click', () => { close(); goToCustomer(customerId); });
  overlay.querySelector('#stmt-print').addEventListener('click', () => printHTML('Statement', `<pre>${lines.join('\n')}</pre>`));
  overlay.querySelector('#stmt-email').addEventListener('click', () => showMessagePreview({
    channel: 'email', to: c?.email || '',
    subject: `Your statement from ${db.settings().name || 'My Shop'}`,
    body: lines.join('\n'),
  }));
}
