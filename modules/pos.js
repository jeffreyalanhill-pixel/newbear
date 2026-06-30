// AutoBook — modules/pos.js (§11.14)
// Counter checkout: pay an RO/invoice or ring a counter sale, with split
// tender, change, receipts, refunds/voids, and end-of-day close. All money
// movement goes through the §9.1 util.* POS transactions.

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import { renderNav, toast, confirmDialog } from '../lib/nav.js';
import { getCustomerReward, pointsForAmount, pointsValue, tierBadge } from '../lib/rewards.js';

let ticket = null;
let cashierId = null;

export function renderPos() {
  renderNav('#icon-rail', 'pos.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();
  document.getElementById('pos-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'pos-overlay') closeModal();
  });
  render();
}

function render() {
  const register = db.openRegister();
  if (!register) {
    ticket = null;
    document.getElementById('register-status').textContent = 'No drawer open.';
    document.getElementById('close-drawer-btn').style.display = 'none';
    document.getElementById('pos-main').style.display = 'none';
    renderGate();
    return;
  }
  cashierId = cashierId || register.openedBy;
  const cashier = db.employeeById(register.openedBy);
  document.getElementById('register-status').textContent = `Register: OPEN · drawer ${util.fmtMoney(register.openingFloat)} float · cashier ${cashier ? cashier.firstName : ''}`;
  document.getElementById('close-drawer-btn').style.display = '';
  document.getElementById('close-drawer-btn').onclick = openCloseDrawerModal;
  document.getElementById('register-gate').innerHTML = '';
  document.getElementById('pos-main').style.display = '';

  document.getElementById('mode-ro-btn').onclick = openRoSearchModal;
  document.getElementById('mode-counter-btn').onclick = () => {
    ticket = util.newTicket({});
    ticket.cashierId = cashierId;
    renderTicket();
  };

  renderTicket();
  renderRecentSales(register);
}

function renderGate() {
  document.getElementById('register-gate').innerHTML = `
    <div class="card" style="max-width:420px">
      <div class="card-head"><div class="card-title">Open Drawer</div></div>
      <div class="card-body">
        <div class="field" style="margin-bottom:var(--s4)">
          <label class="label">Cashier</label>
          <select class="select" id="open-cashier">
            ${db.employees().map((e) => `<option value="${e.id}">${e.firstName} ${e.lastName}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="margin-bottom:var(--s4)">
          <label class="label">Opening float</label>
          <input type="number" class="input" id="open-float" value="200" step="1" min="0">
        </div>
        <button class="btn btn-primary" id="open-drawer-btn">Open Drawer</button>
      </div>
    </div>
  `;
  document.getElementById('open-drawer-btn').addEventListener('click', () => {
    const employeeId = document.getElementById('open-cashier').value;
    const floatAmt = Number(document.getElementById('open-float').value) || 0;
    try {
      util.openRegister(employeeId, floatAmt);
      cashierId = employeeId;
      toast('Drawer opened.', 'success');
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// RO/Invoice search modal
// ---------------------------------------------------------------------------
function openRoSearchModal() {
  const unpaid = db.invoices().filter((i) => i.balance > 0);
  showModal(`
    <div class="modal-head">
      <div class="modal-title">Pay an RO/Invoice</div>
      <button class="icon-btn" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      ${unpaid.length
        ? unpaid.map((inv) => {
            const c = db.customerById(inv.customerId);
            return `
            <div class="flag" data-pick-invoice="${inv.id}">
              <span class="dot dot-amber"></span>
              <div class="flag-body">
                <div class="flag-title">${inv.number} · ${util.customerName(c)}</div>
                <div class="flag-sub">Balance ${util.fmtMoney(inv.balance)}</div>
              </div>
              <span class="flag-chev">›</span>
            </div>`;
          }).join('')
        : '<div class="empty-sub">No unpaid invoices right now.</div>'}
    </div>
  `);
  document.querySelectorAll('[data-pick-invoice]').forEach((el) => {
    el.addEventListener('click', () => {
      ticket = util.newTicket({ invoiceId: el.dataset.pickInvoice });
      ticket.cashierId = cashierId;
      closeModal();
      renderTicket();
    });
  });
}

// ---------------------------------------------------------------------------
// Ticket + tender rendering
// ---------------------------------------------------------------------------
function lineRow(line) {
  return `
    <div class="pos-line-row">
      <span>${line.name}</span>
      <span>${line.qty || ''}</span>
      <span class="tnum">${util.fmtMoney(line.unitPrice || 0)}</span>
      <span class="tnum strong">${util.fmtMoney(line.total)}</span>
      ${ticket.type === 'counter_sale' ? `<button class="btn-ghost" data-remove-line="${line.id}" style="padding:2px">✕</button>` : '<span></span>'}
    </div>`;
}

function renderTicket() {
  const body = document.getElementById('ticket-body');
  if (!ticket) {
    body.innerHTML = `<div class="empty"><div class="empty-title">No ticket open</div><div class="empty-sub">Choose a mode above to start.</div></div>`;
    renderTender();
    return;
  }

  const services = db.services();
  const parts = db.parts();

  const posInv = ticket.invoiceId ? db.invoiceById(ticket.invoiceId) : null;
  const posCustomerId = posInv?.customerId || ticket.customerId || null;
  const posCr = posCustomerId ? getCustomerReward(posCustomerId) : null;
  const posCustomer = posCustomerId ? db.customerById(posCustomerId) : null;
  const posEarnPts = posCr?.membershipStatus === 'active' ? pointsForAmount(ticket.total || 0, posCr.membershipPlanId) : 0;

  body.innerHTML = `
    <div class="badge ${ticket.type === 'ro_payment' ? 'badge-blue' : 'badge-green'}" style="margin-bottom:var(--s3)">${ticket.type === 'ro_payment' ? 'RO / Invoice Payment' : 'Counter Sale'}</div>
    ${posCustomer && posCr?.membershipStatus === 'active' ? `
    <div style="background:var(--canvas);border:1px solid var(--rule);border-radius:var(--r-md);padding:var(--s3) var(--s4);margin-bottom:var(--s3);display:flex;justify-content:space-between;align-items:center;gap:var(--s3)">
      <div>
        <div style="font-size:var(--t-13);font-weight:600">${util.customerName(posCustomer)} ${tierBadge(posCr.tier)}</div>
        <div class="muted" style="font-size:var(--t-xs)">${(posCr.pointsBalance || 0).toLocaleString()} pts on file (${util.fmtMoney(pointsValue(posCr.pointsBalance || 0))}) · Est. earn today: +${posEarnPts} pts</div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="alert('Redeem is a placeholder — point redemption is coming in a future update.')">Redeem <span class="badge badge-gray" style="font-size:9px">placeholder</span></button>
    </div>` : `<div class="muted" style="font-size:var(--t-xs);margin-bottom:var(--s3)">Rewards appear here when the ticket is linked to a rewards member.</div>`}
    <div class="pos-line-row head"><span>Item</span><span>Qty</span><span>Unit</span><span>Total</span><span></span></div>
    ${ticket.lineItems.map(lineRow).join('') || '<div class="empty-sub" style="padding:var(--s2) 0">No lines yet.</div>'}
    ${ticket.type === 'counter_sale' ? `
      <div class="add-line-row" style="display:flex;gap:var(--s2);margin-top:var(--s3);flex-wrap:wrap">
        <select id="add-service-select"><option value="">+ Add service…</option>${services.map((s) => `<option value="${s.id}">${s.name} (${util.fmtMoney(s.basePrice)})</option>`).join('')}</select>
        <select id="add-part-select"><option value="">+ Add part…</option>${parts.map((p) => `<option value="${p.id}">${p.name} (${util.fmtMoney(p.price)}, ${p.qtyOnHand} in stock)</option>`).join('')}</select>
      </div>` : ''}
    <div class="pos-totals">
      <span>Subtotal: <b class="tnum">${util.fmtMoney(ticket.subtotal)}</b></span>
      <span>Tax: <b class="tnum">${util.fmtMoney(ticket.tax)}</b></span>
      <span class="grand tnum">TOTAL: ${util.fmtMoney(ticket.total)}</span>
    </div>
  `;

  document.getElementById('add-service-select')?.addEventListener('change', (e) => {
    const svc = db.serviceById(e.target.value);
    if (!svc) return;
    util.addTicketLine(ticket, { type: 'service', refId: svc.id, name: svc.name, qty: 1, unitPrice: svc.basePrice });
    renderTicket();
  });
  document.getElementById('add-part-select')?.addEventListener('change', (e) => {
    const part = db.partById(e.target.value);
    if (!part) return;
    if (part.qtyOnHand <= 0) {
      toast(`${part.name} is out of stock.`, 'error');
      e.target.value = '';
      return;
    }
    util.addTicketLine(ticket, { type: 'retail', refId: part.id, name: part.name, qty: 1, unitPrice: part.price });
    renderTicket();
  });
  document.querySelectorAll('[data-remove-line]').forEach((btn) => {
    btn.addEventListener('click', () => {
      util.removeTicketLine(ticket, btn.dataset.removeLine);
      renderTicket();
    });
  });

  renderTender();
}

function renderTender() {
  const body = document.getElementById('tender-body');
  if (!ticket) {
    body.innerHTML = `<div class="empty-sub">Start a ticket to take payment.</div>`;
    return;
  }

  body.innerHTML = `
    <div class="pos-totals" style="align-items:stretch;margin-bottom:var(--s4)">
      <div class="row between"><span class="muted">Total</span><span class="tnum strong">${util.fmtMoney(ticket.total)}</span></div>
      <div class="row between"><span class="muted">Tendered</span><span class="tnum strong">${util.fmtMoney(ticket.amountTendered)}</span></div>
      <div class="row between"><span class="muted">Balance</span><span class="tnum strong" style="color:${ticket.balance > 0 ? 'var(--red)' : 'var(--green)'}">${util.fmtMoney(ticket.balance)}</span></div>
      ${ticket.changeDue > 0 ? `<div class="row between"><span class="muted">Change due</span><span class="tnum strong">${util.fmtMoney(ticket.changeDue)}</span></div>` : ''}
    </div>
    ${ticket.tenders.length ? `
      <div style="margin-bottom:var(--s3)">
        ${ticket.tenders.map((t) => `<div class="tender-row"><span>${t.method}</span><span class="tnum">${util.fmtMoney(t.amount)}</span></div>`).join('')}
      </div>` : ''}
    ${ticket.balance > 0.001 ? `
      <div class="field" style="margin-bottom:var(--s3)">
        <label class="label">Amount</label>
        <input type="number" class="input" id="tender-amount" value="${ticket.balance.toFixed(2)}" step="0.01" min="0.01">
      </div>
      <div class="tender-btn-row">
        <button class="btn btn-secondary btn-sm" data-tender="cash">Cash</button>
        <button class="btn btn-secondary btn-sm" data-tender="card">Card</button>
        <button class="btn btn-secondary btn-sm" data-tender="check">Check</button>
      </div>` : ''}
    <button class="btn btn-primary" id="complete-sale-btn" ${ticket.balance > 0.001 ? 'disabled' : ''} style="width:100%">Complete Sale</button>
  `;

  document.querySelectorAll('[data-tender]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const amount = Number(document.getElementById('tender-amount').value);
      if (!amount || amount <= 0) {
        toast('Enter an amount greater than $0.', 'error');
        return;
      }
      util.addTender(ticket, { method: btn.dataset.tender, amount });
      renderTicket();
    });
  });

  document.getElementById('complete-sale-btn').addEventListener('click', () => {
    try {
      const sale = util.completeSale(ticket);
      showReceipt(sale);
      ticket = null;
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// Receipt / recent sales / refund/void / close drawer
// ---------------------------------------------------------------------------
function showReceipt(sale) {
  const settings = db.settings();
  showModal(`
    <div class="modal-head">
      <div class="modal-title">Receipt — ${sale.number}</div>
      <button class="icon-btn" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div style="font-weight:800">${settings.name || 'My Shop'}</div>
      <div class="muted" style="font-size:var(--t-13);margin-bottom:var(--s3)">${util.fmtDateTime(sale.createdAt)}</div>
      ${sale.lineItems.map((l) => `<div class="row between" style="font-size:var(--t-13)"><span>${l.name}${l.qty > 1 ? ' × ' + l.qty : ''}</span><span class="tnum">${util.fmtMoney(l.total)}</span></div>`).join('')}
      <div class="pos-totals" style="margin-top:var(--s3)">
        <span>Tax: <b class="tnum">${util.fmtMoney(sale.tax)}</b></span>
        <span class="grand tnum">TOTAL: ${util.fmtMoney(sale.total)}</span>
        ${sale.tenders.map((t) => `<span>${t.method}: <b class="tnum">${util.fmtMoney(t.amount)}</b></span>`).join('')}
        ${sale.changeDue > 0 ? `<span>Change: <b class="tnum">${util.fmtMoney(sale.changeDue)}</b></span>` : ''}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="receipt-print-btn">Print</button>
      <button class="btn btn-primary" data-close>Done</button>
    </div>
  `);
  document.getElementById('receipt-print-btn').addEventListener('click', () => window.print());
}

function renderRecentSales(register) {
  const sales = db.salesForRegister(register.id).slice().reverse();
  document.getElementById('recent-sales-body').innerHTML = sales.length
    ? sales.map((s) => {
        const c = s.customerId ? db.customerById(s.customerId) : null;
        return `
        <div class="recent-sale-row">
          <span>${s.number} · ${s.type === 'refund' ? 'Refund' : s.type === 'ro_payment' ? 'RO Payment' : 'Counter Sale'}${c ? ' · ' + util.customerName(c) : ''}</span>
          <span class="row" style="gap:var(--s2)">
            <span class="tnum" style="color:${s.total < 0 ? 'var(--red)' : 'var(--ink)'}">${util.fmtMoney(s.total)}</span>
            <span class="badge ${s.status === 'voided' ? 'badge-gray' : 'badge-green'}">${s.status}</span>
            ${s.status === 'completed' && s.type !== 'refund' ? `<button class="btn btn-secondary btn-sm" data-refund="${s.id}">Refund</button><button class="btn btn-danger btn-sm" data-void="${s.id}">Void</button>` : ''}
          </span>
        </div>`;
      }).join('')
    : `<div class="empty-sub">No sales yet today.</div>`;

  document.querySelectorAll('[data-refund]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Refund this sale? Parts will be restocked.', { confirmLabel: 'Refund' });
      if (!confirmed) return;
      util.refundSale(btn.dataset.refund);
      toast('Sale refunded.', 'success');
      render();
    });
  });
  document.querySelectorAll('[data-void]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Void this sale? This reverses any linked invoice payment.', { confirmLabel: 'Void' });
      if (!confirmed) return;
      util.voidSale(btn.dataset.void);
      toast('Sale voided.', 'success');
      render();
    });
  });
}

function openCloseDrawerModal() {
  const register = db.openRegister();
  showModal(`
    <div class="modal-head">
      <div class="modal-title">Close Drawer</div>
      <button class="icon-btn" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="field">
        <label class="label">Counted cash in drawer</label>
        <input type="number" class="input" id="counted-cash" step="0.01" min="0">
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" data-close>Cancel</button>
      <button class="btn btn-primary" id="close-confirm-btn">Close &amp; Run Z-Report</button>
    </div>
  `);
  document.getElementById('close-confirm-btn').addEventListener('click', () => {
    const counted = Number(document.getElementById('counted-cash').value);
    if (Number.isNaN(counted)) {
      toast('Enter the counted cash amount.', 'error');
      return;
    }
    const z = util.closeRegister(register.id, counted);
    showZReport(z);
  });
}

function showZReport(z) {
  showModal(`
    <div class="modal-head">
      <div class="modal-title">Z-Report</div>
      <button class="icon-btn" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="row between"><span class="muted">Sales count</span><span class="strong">${z.salesCount}</span></div>
      ${Object.entries(z.totalsByTender).map(([method, amt]) => `<div class="row between"><span class="muted">${method}</span><span class="tnum">${util.fmtMoney(amt)}</span></div>`).join('')}
      <div class="row between" style="margin-top:var(--s3)"><span class="muted">Expected cash</span><span class="tnum">${util.fmtMoney(z.expectedCash)}</span></div>
      <div class="row between"><span class="muted">Counted cash</span><span class="tnum">${util.fmtMoney(z.countedCash)}</span></div>
      <div class="row between"><span class="muted">Over/Short</span><span class="tnum strong" style="color:${z.overShort === 0 ? 'var(--green)' : 'var(--red)'}">${util.fmtMoney(z.overShort)}</span></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-primary" data-close>Done</button>
    </div>
  `, () => render());
}

// ---------------------------------------------------------------------------
// Generic modal helper
// ---------------------------------------------------------------------------
function showModal(html, onClose) {
  document.getElementById('pos-modal').innerHTML = html;
  document.getElementById('pos-overlay').classList.add('open');
  document.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeModal(onClose));
  });
}
function closeModal(onClose) {
  document.getElementById('pos-overlay').classList.remove('open');
  if (onClose) onClose();
}
