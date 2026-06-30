// AutoBook — modules/invoices/inv-expenses.js
// Expenses — tracking foundation, not real accounting. Real CRUD via
// util.createExpense/setExpenseStatus.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import { openInvDrawer, closeInvDrawer } from './invoices-app.js';
import { downloadCSV, copyToClipboard, printHTML } from '../../lib/export.js';
import { renderControlBar, wireControls, wireSortHeaders, sortRows, updateCount } from './inv-controls.js';

const CATEGORIES = [
  { value: 'parts_purchase', label: 'Parts Purchase' },
  { value: 'shop_supplies', label: 'Shop Supplies' },
  { value: 'tools_equipment', label: 'Tools / Equipment' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'rent', label: 'Rent' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'payroll', label: 'Payroll (placeholder)' },
  { value: 'software', label: 'Software' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'misc', label: 'Miscellaneous' },
];
const STATUS_BADGE = { draft: 'badge-gray', recorded: 'badge-blue', reimbursed: 'badge-green', void: 'badge-red' };

const sortState = { key: 'date', dir: 'desc' };
let getValues = () => ({ search: '', filters: {} });

export function renderInvExpenses(mount) {
  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">Expenses</div><button class="btn btn-primary btn-sm" id="add-exp-btn">+ Add Expense</button></div>
      <div class="card-body">
        ${renderControlBar({
          searchPlaceholder: 'Search vendor, category, notes…',
          filters: [
            { key: 'category', all: 'All categories', options: CATEGORIES.map(c => ({ value: c.value, label: c.label })) },
            { key: 'status', all: 'All statuses', options: [
              { value: 'draft', label: 'Draft' }, { value: 'recorded', label: 'Recorded' },
              { value: 'reimbursed', label: 'Reimbursed' }, { value: 'void', label: 'Void' },
            ]},
          ],
          actions: [
            { key: 'csv', label: 'Export CSV' }, { key: 'print', label: 'Print' }, { key: 'copy', label: 'Copy' },
          ],
        })}
        <div id="exp-list"></div>
      </div>
    </div>`;
  document.getElementById('add-exp-btn').addEventListener('click', openCreateExpense);
  getValues = wireControls(mount, renderList);
  mount.querySelector('[data-tbl-action="csv"]')?.addEventListener('click', exportCSV);
  mount.querySelector('[data-tbl-action="print"]')?.addEventListener('click', exportPrint);
  mount.querySelector('[data-tbl-action="copy"]')?.addEventListener('click', exportCopy);
  renderList();
}

function allRows() {
  return db.expenses().map(e => ({
    ...e,
    categoryLabel: CATEGORIES.find(c => c.value === e.category)?.label || e.category,
  }));
}

function filteredRows() {
  const { search, filters } = getValues();
  let rows = allRows();
  if (filters.category) rows = rows.filter(e => e.category === filters.category);
  if (filters.status)   rows = rows.filter(e => e.status === filters.status);
  if (search) rows = rows.filter(e =>
    `${e.vendor} ${e.categoryLabel} ${e.notes || ''} ${e.paymentMethod}`.toLowerCase().includes(search));
  const typeMap = { date: 'date', amount: 'money', vendor: 'text', categoryLabel: 'text', status: 'text' };
  return sortRows(rows, sortState.key, sortState.dir, typeMap[sortState.key] || 'text');
}

function renderList() {
  const rows = filteredRows();
  const all  = allRows();
  const listEl = document.getElementById('exp-list');
  if (!listEl) return;
  const nonVoidTotal = rows.filter(e => e.status !== 'void').reduce((s, e) => s + e.amount, 0);
  listEl.innerHTML = `
    <div class="row between" style="margin-bottom:var(--s3);font-size:var(--t-13)">
      <span class="muted">Total (excl. void)</span>
      <span class="strong tnum">${util.fmtMoney(nonVoidTotal)}</span>
    </div>
    <table class="table">
      <thead>
        <tr>
          <th data-sort="date" data-sort-type="date">Date</th>
          <th data-sort="vendor" data-sort-type="text">Vendor</th>
          <th data-sort="categoryLabel" data-sort-type="text">Category</th>
          <th class="num" data-sort="amount" data-sort-type="money">Amount</th>
          <th>Method</th>
          <th data-sort="status" data-sort-type="text">Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${rows.length ? rows.map(e => `
          <tr>
            <td>${util.fmtDate(e.date)}</td>
            <td>${e.vendor || '—'}</td>
            <td>${e.categoryLabel}</td>
            <td class="num tnum">${util.fmtMoney(e.amount)}</td>
            <td>${e.paymentMethod || '—'}</td>
            <td><span class="badge ${STATUS_BADGE[e.status] || 'badge-gray'}">${e.status}</span></td>
            <td>${e.status !== 'void' ? `<button class="btn btn-danger btn-sm" data-void-exp="${e.id}">Void</button>` : ''}</td>
          </tr>`).join('') : '<tr><td colspan="7"><div class="empty-sub">No expenses match.</div></td></tr>'}
      </tbody>
    </table>`;
  listEl.querySelectorAll('[data-void-exp]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Void this expense?', { confirmLabel: 'Void' });
      if (!confirmed) return;
      util.setExpenseStatus(btn.dataset.voidExp, 'void');
      toast('Expense voided.');
      renderList();
    });
  });
  wireSortHeaders(listEl.querySelector('thead'), sortState, renderList);
  const ctrl = document.querySelector('.tbl-ctrl');
  if (ctrl) updateCount(ctrl.parentElement, rows.length, all.length);
}

function exportCSV() {
  downloadCSV('expenses.csv', filteredRows().map(e => ({
    date: e.date, vendor: e.vendor, category: e.categoryLabel, amount: e.amount,
    method: e.paymentMethod, status: e.status, notes: e.notes || '',
  })), [
    { key: 'date', label: 'Date' }, { key: 'vendor', label: 'Vendor' },
    { key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount' },
    { key: 'method', label: 'Method' }, { key: 'status', label: 'Status' }, { key: 'notes', label: 'Notes' },
  ]);
}
function exportPrint() {
  const rows = filteredRows().filter(e => e.status !== 'void');
  const total = rows.reduce((s, e) => s + e.amount, 0);
  printHTML('Expenses', `
    <table>
      <thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th class="num">Amount</th><th>Method</th><th>Status</th></tr></thead>
      <tbody>${rows.map(e => `<tr><td>${util.fmtDate(e.date)}</td><td>${e.vendor}</td><td>${e.categoryLabel}</td><td class="num">$${e.amount.toFixed(2)}</td><td>${e.paymentMethod}</td><td>${e.status}</td></tr>`).join('')}</tbody>
    </table>
    <p style="text-align:right;margin-top:12px"><strong>Total: $${total.toFixed(2)}</strong></p>
  `);
}
function exportCopy() {
  copyToClipboard(filteredRows().map(e =>
    `${e.date}  ${e.vendor}  ${e.categoryLabel}  $${e.amount.toFixed(2)}  ${e.status}`
  ).join('\n'));
}

function openCreateExpense() {
  openInvDrawer(`
    <div class="modal-head">
      <div class="modal-title">Add Expense</div>
      <button class="icon-btn" id="close-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="grid-2">
        <div class="field"><label class="label">Date</label><input class="input" type="date" id="exp-date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field"><label class="label">Vendor</label><input class="input" id="exp-vendor"></div>
        <div class="field"><label class="label">Category</label><select class="select" id="exp-category">${CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Amount</label><input class="input" type="number" min="0.01" step="0.01" id="exp-amount"></div>
        <div class="field"><label class="label">Payment method</label>
          <select class="select" id="exp-method"><option value="card">Card</option><option value="cash">Cash</option><option value="check">Check</option><option value="ach">ACH</option></select>
        </div>
      </div>
      <div class="field" style="margin-top:var(--s3)"><label class="label">Notes</label><textarea class="textarea" id="exp-notes"></textarea></div>
      <div class="muted" style="font-size:var(--t-xs);margin-top:var(--s2)">Linked PO / linked inventory item are placeholders here — this is expense tracking, not full accounting.</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="exp-cancel">Cancel</button>
      <button class="btn btn-primary" id="exp-create">Add Expense</button>
    </div>
  `);
  document.getElementById('close-drawer').addEventListener('click', closeInvDrawer);
  document.getElementById('exp-cancel').addEventListener('click', closeInvDrawer);
  document.getElementById('exp-create').addEventListener('click', () => {
    const vendor = document.getElementById('exp-vendor').value.trim();
    const amount = Number(document.getElementById('exp-amount').value);
    if (!vendor || !amount || amount <= 0) { toast('Vendor and an amount greater than $0 are required.', 'error'); return; }
    util.createExpense({
      date: document.getElementById('exp-date').value, vendor, category: document.getElementById('exp-category').value,
      amount, paymentMethod: document.getElementById('exp-method').value, notes: document.getElementById('exp-notes').value.trim(),
    });
    toast('Expense added.', 'success');
    closeInvDrawer();
    renderList();
  });
}
