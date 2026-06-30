// AutoBook — modules/invoices/inv-closeout.js
// Daily Closeout — real numbers from util.dailyCloseout() (derived from
// today's real payments + credit notes). "Close batch" is a placeholder —
// no real end-of-day lock workflow exists yet.
import { util } from '../../lib/util.js';
import { toast } from '../../lib/nav.js';
import { copyToClipboard, printHTML } from '../../lib/export.js';

export function renderInvCloseout(mount) {
  const c = util.dailyCloseout();
  mount.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">Daily Closeout — ${util.fmtDate(c.date)}</div>
        <div style="display:flex;gap:var(--s2);align-items:center">
          <button class="btn btn-secondary btn-sm" id="closeout-print">Print</button>
          <button class="btn btn-secondary btn-sm" id="closeout-copy">Copy</button>
          <button class="btn btn-secondary btn-sm" id="closeout-close-batch">Close Batch <span class="badge badge-gray" style="font-size:9px">placeholder</span></button>
        </div>
      </div>
      <div class="card-body">
        <div class="grid-3" style="margin-bottom:var(--s3)">
          ${statCard('Cash Collected', util.fmtMoney(c.cash))}
          ${statCard('Card', util.fmtMoney(c.card))}
          ${statCard('ACH', util.fmtMoney(c.ach), true)}
          ${statCard('Checks', util.fmtMoney(c.check))}
          ${statCard('Financing', util.fmtMoney(c.financing), true)}
          ${statCard('Deposits', util.fmtMoney(c.deposits))}
        </div>
        <div class="grid-3" style="margin-bottom:var(--s3)">
          ${statCard('Refunds', util.fmtMoney(c.refunds))}
          ${statCard('Net Collected', util.fmtMoney(c.netCollected))}
          ${statCard('Invoices Paid Today', c.invoicesPaidToday)}
        </div>
        <div class="card-head" style="padding:0;margin-top:var(--s3)"><div class="card-title" style="font-size:var(--t-md)">Payment exceptions</div></div>
        <div class="empty-sub">${c.paymentExceptions.length ? c.paymentExceptions.join(', ') : 'No payment exceptions today.'}</div>
      </div>
    </div>`;
  document.getElementById('closeout-close-batch').addEventListener('click', () => toast('Close Batch is a placeholder — no end-of-day lock workflow exists yet.'));
  document.getElementById('closeout-print').addEventListener('click', () => {
    printHTML(`Daily Closeout — ${util.fmtDate(c.date)}`, `
      <table>
        <tr><td>Cash Collected</td><td class="num">${util.fmtMoney(c.cash)}</td></tr>
        <tr><td>Card</td><td class="num">${util.fmtMoney(c.card)}</td></tr>
        <tr><td>ACH (placeholder)</td><td class="num">${util.fmtMoney(c.ach)}</td></tr>
        <tr><td>Checks</td><td class="num">${util.fmtMoney(c.check)}</td></tr>
        <tr><td>Financing (placeholder)</td><td class="num">${util.fmtMoney(c.financing)}</td></tr>
        <tr><td>Deposits</td><td class="num">${util.fmtMoney(c.deposits)}</td></tr>
        <tr><td>Refunds</td><td class="num">-${util.fmtMoney(c.refunds)}</td></tr>
        <tr style="font-weight:700"><td>Net Collected</td><td class="num">${util.fmtMoney(c.netCollected)}</td></tr>
        <tr><td>Invoices Paid Today</td><td class="num">${c.invoicesPaidToday}</td></tr>
      </table>
      <p style="margin-top:12px"><strong>Payment exceptions:</strong> ${c.paymentExceptions.length ? c.paymentExceptions.join(', ') : 'None'}</p>
    `);
  });
  document.getElementById('closeout-copy').addEventListener('click', () => {
    copyToClipboard([
      `Daily Closeout — ${util.fmtDate(c.date)}`,
      `Cash: ${util.fmtMoney(c.cash)}`,
      `Card: ${util.fmtMoney(c.card)}`,
      `ACH: ${util.fmtMoney(c.ach)}`,
      `Checks: ${util.fmtMoney(c.check)}`,
      `Deposits: ${util.fmtMoney(c.deposits)}`,
      `Refunds: -${util.fmtMoney(c.refunds)}`,
      `Net Collected: ${util.fmtMoney(c.netCollected)}`,
      `Invoices Paid Today: ${c.invoicesPaidToday}`,
      `Exceptions: ${c.paymentExceptions.length ? c.paymentExceptions.join(', ') : 'None'}`,
    ].join('\n'));
  });
}

function statCard(label, value, placeholder) {
  return `<div class="stat-card"><div class="stat-label">${label}${placeholder ? ' <span class="badge badge-gray" style="font-size:10px">placeholder</span>' : ''}</div><div class="stat-value">${value}</div></div>`;
}
