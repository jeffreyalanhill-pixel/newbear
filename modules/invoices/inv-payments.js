// AutoBook — modules/invoices/inv-payments.js
// Payments Received — flattened from every invoice's real payments array
// (util.allPaymentsReceived()); no separate payments entity exists, so this
// list IS the ledger, not a derived approximation.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';

const TENDER_LABEL = {
  cash: 'Cash', card: 'Card', ach: 'ACH (placeholder)', check: 'Check',
  financing: 'Financing/BNPL (placeholder)', deposit: 'Deposit', store_credit: 'Store Credit (placeholder)',
  credit_note: 'Credit Note', other: 'Other',
};

export function renderInvPayments(mount) {
  const payments = util.allPaymentsReceived().slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">Payments Received</div></div>
      <div class="card-body">
        <table class="table">
          <thead><tr><th>Date</th><th>Customer</th><th>Invoice #</th><th class="num">Amount</th><th>Tender Type</th><th>Reference</th><th>Status</th><th>Received By</th></tr></thead>
          <tbody>
            ${payments.length ? payments.map((p) => `
              <tr>
                <td>${util.fmtDate(p.date)}</td>
                <td>${util.customerName(db.customerById(p.customerId))}</td>
                <td class="strong">${p.invoiceNumber}</td>
                <td class="num tnum">${util.fmtMoney(p.amount)}</td>
                <td>${TENDER_LABEL[p.method] || p.method}</td>
                <td>${p.reference || '—'}</td>
                <td><span class="badge badge-green">received</span></td>
                <td class="muted">— <span class="badge badge-gray" style="font-size:9px">placeholder</span></td>
              </tr>`).join('') : '<tr><td colspan="8"><div class="empty-sub">No payments recorded yet.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
