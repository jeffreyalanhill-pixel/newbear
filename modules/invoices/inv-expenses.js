// AutoBook — modules/invoices/inv-expenses.js
// Expenses — tracking foundation, not real accounting. Real CRUD via
// util.createExpense/setExpenseStatus.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import { openInvDrawer, closeInvDrawer } from './invoices-app.js';

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

export function renderInvExpenses(mount) {
  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">Expenses</div><button class="btn btn-primary btn-sm" id="add-exp-btn">+ Add Expense</button></div>
      <div class="card-body" id="exp-list"></div>
    </div>
  `;
  document.getElementById('add-exp-btn').addEventListener('click', openCreateExpense);
  renderList();
}

function renderList() {
  const expenses = db.expenses().slice().sort((a, b) => b.date.localeCompare(a.date));
  const total = expenses.filter((e) => e.status !== 'void').reduce((s, e) => s + e.amount, 0);
  document.getElementById('exp-list').innerHTML = `
    <div class="row between" style="margin-bottom:var(--s3)"><span class="muted">Total (excluding void)</span><span class="strong tnum">${util.fmtMoney(total)}</span></div>
    <table class="table">
      <thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th class="num">Amount</th><th>Method</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${expenses.length ? expenses.map((e) => `
          <tr>
            <td>${util.fmtDate(e.date)}</td>
            <td>${e.vendor}</td>
            <td>${CATEGORIES.find((c) => c.value === e.category)?.label || e.category}</td>
            <td class="num tnum">${util.fmtMoney(e.amount)}</td>
            <td>${e.paymentMethod}</td>
            <td><span class="badge ${STATUS_BADGE[e.status] || 'badge-gray'}">${e.status}</span></td>
            <td>${e.status !== 'void' ? `<button class="btn btn-danger btn-sm" data-void-exp="${e.id}">Void</button>` : ''}</td>
          </tr>`).join('') : '<tr><td colspan="7"><div class="empty-sub">No expenses recorded yet.</div></td></tr>'}
      </tbody>
    </table>
  `;
  document.querySelectorAll('[data-void-exp]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Void this expense?', { confirmLabel: 'Void' });
      if (!confirmed) return;
      util.setExpenseStatus(btn.dataset.voidExp, 'void');
      toast('Expense voided.');
      renderList();
    });
  });
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
