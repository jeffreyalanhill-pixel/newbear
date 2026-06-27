// AutoBook — modules/invoices.js (§11.10)
// Invoice list + detail drawer. Recording a payment goes through
// util.recordPayment, which can also close the linked RO — never set
// invoice/RO status directly here.

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import { renderNav, toast } from '../lib/nav.js';

let currentInvoiceId = null;

export function renderInvoices() {
  renderNav('#icon-rail', 'invoices.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();

  renderList();
  document.getElementById('filter-status').addEventListener('change', renderList);
  document.getElementById('search-input').addEventListener('input', renderList);
  document.getElementById('inv-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'inv-overlay') closeDrawer();
  });
}

function effectiveStatus(inv) {
  if (inv.status === 'sent' || inv.status === 'partial') {
    if (inv.dueAt && new Date(inv.dueAt).getTime() < Date.now() && inv.balance > 0) return 'overdue';
  }
  return inv.status;
}

const STATUS_BADGE = {
  draft: 'badge-gray',
  sent: 'badge-blue',
  partial: 'badge-amber',
  paid: 'badge-green',
  overdue: 'badge-red',
};

function renderList() {
  const statusFilter = document.getElementById('filter-status').value;
  const search = document.getElementById('search-input').value.trim().toLowerCase();

  let invoices = db.invoices();
  if (statusFilter) invoices = invoices.filter((i) => effectiveStatus(i) === statusFilter);
  if (search) {
    invoices = invoices.filter((i) => {
      const c = db.customerById(i.customerId);
      const hay = `${i.number} ${util.customerName(c)}`.toLowerCase();
      return hay.includes(search);
    });
  }
  invoices = invoices.slice().sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));

  document.getElementById('inv-table-body').innerHTML = invoices.length
    ? invoices.map((inv) => {
        const c = db.customerById(inv.customerId);
        const v = db.vehicleById(inv.vehicleId);
        const status = effectiveStatus(inv);
        return `
        <tr>
          <td class="strong">${inv.number}</td>
          <td>${util.customerName(c)}</td>
          <td>${util.vehicleLabel(v)}</td>
          <td>${util.fmtDate(inv.issuedAt)}</td>
          <td class="num tnum">${util.fmtMoney(inv.total)}</td>
          <td class="num tnum">${util.fmtMoney(inv.balance)}</td>
          <td><span class="badge ${STATUS_BADGE[status] || 'badge-gray'}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></td>
          <td><button class="btn btn-secondary btn-sm" data-open="${inv.id}">Open ›</button></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="8"><div class="empty"><div class="empty-title">No invoices match</div><div class="empty-sub">Try clearing filters.</div></div></td></tr>`;

  document.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => openDrawer(btn.dataset.open));
  });
}

function openDrawer(invoiceId) {
  currentInvoiceId = invoiceId;
  renderDrawer();
  document.getElementById('inv-overlay').classList.add('open');
}
function closeDrawer() {
  document.getElementById('inv-overlay').classList.remove('open');
  currentInvoiceId = null;
}

function renderDrawer() {
  const inv = db.invoiceById(currentInvoiceId);
  if (!inv) return;
  const c = db.customerById(inv.customerId);
  const v = db.vehicleById(inv.vehicleId);
  const settings = db.settings();
  const status = effectiveStatus(inv);

  document.getElementById('inv-drawer').innerHTML = `
    <div class="modal-head inv-no-print">
      <div class="modal-title">${inv.number} <span class="badge ${STATUS_BADGE[status] || 'badge-gray'}" style="margin-left:8px">${status.charAt(0).toUpperCase() + status.slice(1)}</span></div>
      <button class="icon-btn" id="close-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="inv-print-head">
        <div>
          <div style="font-weight:800;font-size:var(--t-lg)">${settings.name || 'AutoBook Shop'}</div>
          <div class="muted" style="font-size:var(--t-13)">${settings.address || ''}</div>
          <div class="muted" style="font-size:var(--t-13)">${settings.phone || ''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800">${inv.number}</div>
          <div class="muted" style="font-size:var(--t-13)">Issued ${util.fmtDate(inv.issuedAt)}</div>
          ${inv.dueAt ? `<div class="muted" style="font-size:var(--t-13)">Due ${util.fmtDate(inv.dueAt)}</div>` : ''}
        </div>
      </div>

      <div class="inv-detail-section">
        <h4>Bill to</h4>
        <div>${util.customerName(c)}</div>
        <div class="muted" style="font-size:var(--t-13)">${c?.phone || ''} ${c?.email ? '· ' + c.email : ''}</div>
        <div class="muted" style="font-size:var(--t-13)">${util.vehicleLabel(v)}${v ? ' · ' + (v.mileage || 0).toLocaleString() + ' mi' : ''}</div>
      </div>

      <div class="inv-detail-section">
        <h4>Line items</h4>
        <div class="inv-li-row head"><span>Item</span><span>Qty</span><span>Unit</span><span>Total</span></div>
        ${inv.lineItems.map((l) => `
          <div class="inv-li-row">
            <span>${l.name}</span>
            <span>${l.qty || ''}</span>
            <span class="tnum">${util.fmtMoney(l.unitPrice || 0)}</span>
            <span class="tnum strong">${util.fmtMoney(l.total)}</span>
          </div>`).join('')}
        <div class="inv-totals">
          <span>Subtotal: <b class="tnum">${util.fmtMoney(inv.subtotal)}</b></span>
          <span>Discount: <b class="tnum">-${util.fmtMoney(inv.discount || 0)}</b></span>
          <span>Tax: <b class="tnum">${util.fmtMoney(inv.tax)}</b></span>
          <span class="grand tnum">TOTAL: ${util.fmtMoney(inv.total)}</span>
        </div>
      </div>

      <div class="inv-detail-section">
        <h4>Payments</h4>
        ${inv.payments.length
          ? inv.payments.map((p) => `<div class="payment-row"><span>${util.fmtDate(p.date)} · ${p.method}</span><span class="tnum">${util.fmtMoney(p.amount)}</span></div>`).join('')
          : '<div class="empty-sub">No payments recorded yet.</div>'}
        <div class="inv-totals" style="margin-top:var(--s2)">
          <span>Amount Paid: <b class="tnum">${util.fmtMoney(inv.amountPaid)}</b></span>
          <span class="grand tnum" style="color:${inv.balance > 0 ? 'var(--red)' : 'var(--green)'}">Balance: ${util.fmtMoney(inv.balance)}</span>
        </div>
      </div>

      <div class="inv-detail-section inv-no-print">
        <h4>Actions</h4>
        <div class="row" style="gap:var(--s2)">
          ${inv.balance > 0 ? `<button class="btn btn-primary btn-sm" id="record-payment-btn">Record Payment</button>` : ''}
          <button class="btn btn-secondary btn-sm" id="print-btn">Print</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('close-drawer').addEventListener('click', closeDrawer);
  document.getElementById('print-btn').addEventListener('click', () => window.print());
  document.getElementById('record-payment-btn')?.addEventListener('click', () => openPaymentModal(inv));
}

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
            <option value="other">Other</option>
          </select>
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
  overlay.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('#pay-submit-btn').addEventListener('click', () => {
    const amount = Number(overlay.querySelector('#pay-amount').value);
    const method = overlay.querySelector('#pay-method').value;
    const errEl = overlay.querySelector('#pay-error');
    if (!amount || amount <= 0) {
      errEl.textContent = 'Enter an amount greater than $0.';
      return;
    }
    if (amount > inv.balance + 0.001) {
      errEl.textContent = `Amount can't exceed the balance due (${util.fmtMoney(inv.balance)}).`;
      return;
    }
    const updated = util.recordPayment(inv.id, amount, method);
    toast(`Payment of ${util.fmtMoney(amount)} recorded — invoice now ${updated.status}.`, 'success');
    close();
    renderDrawer();
    renderList();
  });
}
