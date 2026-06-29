// AutoBook — modules/invoices/inv-customers.js
// Customer Balances — real, derived from util.customerFinanceSummary() per
// customer (unpaid invoices, payments, deposits, credits, total balance,
// last payment date). "Print Statement"/"Email Statement Preview" are
// simple placeholders reusing the existing export/preview helpers.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { printHTML, showMessagePreview } from '../../lib/export.js';

export function renderInvCustomers(mount) {
  const customers = db.customers().slice().sort((a, b) => a.firstName.localeCompare(b.firstName));
  const rows = customers.map((c) => ({ c, s: util.customerFinanceSummary(c.id) })).filter((r) => r.s.unpaidInvoices.length || r.s.payments.length);

  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">Customer Balances</div></div>
      <div class="card-body">
        <table class="table">
          <thead><tr><th>Customer</th><th class="num">Unpaid Invoices</th><th class="num">Total Balance</th><th class="num">Credits</th><th>Last Payment</th><th></th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(({ c, s }) => `
              <tr>
                <td class="strong">${util.customerName(c)}</td>
                <td class="num">${s.unpaidInvoices.length}</td>
                <td class="num tnum" style="${s.totalBalance > 0 ? 'color:var(--red)' : ''}">${util.fmtMoney(s.totalBalance)}</td>
                <td class="num tnum">${s.credits.filter((cr) => cr.status === 'issued').length}</td>
                <td>${s.lastPaymentDate ? util.fmtDate(s.lastPaymentDate) : '—'}</td>
                <td><button class="btn btn-secondary btn-sm" data-statement="${c.id}">Statement</button></td>
              </tr>`).join('') : '<tr><td colspan="6"><div class="empty-sub">No customers with invoice activity yet.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.querySelectorAll('[data-statement]').forEach((btn) => {
    btn.addEventListener('click', () => openStatement(btn.dataset.statement));
  });
}

function openStatement(customerId) {
  const c = db.customerById(customerId);
  const s = util.customerFinanceSummary(customerId);
  const lines = [
    `Statement for ${util.customerName(c)}`,
    `Total balance due: ${util.fmtMoney(s.totalBalance)}`,
    '',
    'Unpaid invoices:',
    ...s.unpaidInvoices.map((i) => `  ${i.number} — ${util.fmtMoney(i.balance)} due`),
    '',
    'Recent payments:',
    ...s.payments.slice(0, 5).map((p) => `  ${util.fmtDate(p.date)} — ${util.fmtMoney(p.amount)} (${p.method})`),
  ];
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-head"><div class="modal-title">Customer Statement</div><button class="icon-btn" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
      <div class="modal-body"><pre style="white-space:pre-wrap;font-family:inherit;font-size:var(--t-13)">${lines.join('\n')}</pre></div>
      <div class="modal-foot">
        <button class="btn btn-secondary" data-close>Close</button>
        <button class="btn btn-secondary" id="stmt-print">Print Statement</button>
        <button class="btn btn-primary" id="stmt-email">Email Statement Preview</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#stmt-print').addEventListener('click', () => printHTML('Statement', `<pre>${lines.join('\n')}</pre>`));
  overlay.querySelector('#stmt-email').addEventListener('click', () => showMessagePreview({ channel: 'email', to: c?.email || '', subject: `Your statement from ${db.settings().name || 'My Shop'}`, body: lines.join('\n') }));
}
