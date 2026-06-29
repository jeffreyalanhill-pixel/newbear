// AutoBook — modules/invoices/inv-estimates.js
// Estimates tab — a real summary list pulled from db.quotes() (the existing
// Quotes entity; no duplicate "estimate" entity created). Full quote
// building/editing stays in quotes.html — this is InvoiceOps's finance-side
// view of the same data, with a link through for full editing.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';

const STATUS_BADGE = {
  draft: 'badge-gray', ready_to_send: 'badge-gray', sent: 'badge-blue', viewed: 'badge-blue',
  approved: 'badge-green', partially_approved: 'badge-amber', declined: 'badge-red', expired: 'badge-red',
};

export function renderInvEstimates(mount) {
  const quotes = db.quotes().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">Estimates</div><a class="btn btn-primary btn-sm" href="quotes.html">+ Add Estimate / Quote</a></div>
      <div class="card-body">
        <table class="table">
          <thead><tr><th>Quote #</th><th>Customer</th><th>Title</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${quotes.length ? quotes.map((q) => `
              <tr>
                <td class="strong">${q.quoteNumber}</td>
                <td>${util.customerName(db.customerById(q.customerId))}</td>
                <td>${q.title || ''}</td>
                <td class="num tnum">${util.fmtMoney(q.total)}</td>
                <td><span class="badge ${STATUS_BADGE[q.status] || 'badge-gray'}">${q.status.replace(/_/g, ' ')}</span></td>
                <td><a class="btn btn-secondary btn-sm" href="quotes.html">Open ›</a></td>
              </tr>`).join('') : '<tr><td colspan="6"><div class="empty-sub">No estimates yet.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
