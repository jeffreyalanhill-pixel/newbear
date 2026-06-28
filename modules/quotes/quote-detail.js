// AutoBook — modules/quotes/quote-detail.js
// Shared quote-detail drawer: shop-facing status/actions view + a customer
// "Approval View" placeholder toggle (§8 — not a real public page yet, but
// the structure exists and drives the same real approve/decline functions).
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import { openQuoteDrawer, closeQuoteDrawer, refreshQuotesApp } from './quotes-app.js';

const TYPE_LABEL = { service: 'Service', labor: 'Labor', parts: 'Part', tires: 'Tire', fluids: 'Fluid', fees: 'Fee', discount: 'Discount', inspection: 'Inspection', diagnostic: 'Diagnostic' };
const LINE_STATUS_BADGE = { recommended: 'badge-blue', approved: 'badge-green', declined: 'badge-red', optional: 'badge-amber' };

export function openQuoteDetail(quoteId) {
  renderDrawer(quoteId, false);
}

function renderDrawer(quoteId, customerPreview) {
  const q = db.quoteById(quoteId);
  if (!q) return;
  const c = db.customerById(q.customerId);
  const v = db.vehicleById(q.vehicleId);
  const meta = util.quoteStatusMeta(q.status);
  const ro = q.roId ? db.jobById(q.roId) : null;

  openQuoteDrawer(`
    <div class="modal-head">
      <div>
        <div class="modal-title">${q.quoteNumber}</div>
        <div class="muted" style="font-size:var(--t-13)">${q.title}</div>
      </div>
      <button class="icon-btn" id="close-quote-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="row between">
        <span class="badge ${meta.badgeClass}">${meta.label}</span>
        <button class="btn btn-secondary btn-sm" id="toggle-preview">${customerPreview ? '← Shop view' : 'Preview as customer →'}</button>
      </div>
      ${customerPreview ? customerPreviewBody(q, c, v) : shopBody(q, c, v, ro)}
    </div>
  `);

  document.getElementById('close-quote-drawer').addEventListener('click', closeQuoteDrawer);
  document.getElementById('toggle-preview').addEventListener('click', () => renderDrawer(quoteId, !customerPreview));
  wireActions(quoteId, customerPreview);
}

function customerSummaryCard(c, v) {
  return `
    <div class="card" style="padding:var(--s4);margin-top:var(--s3)">
      <div class="row between">
        <div>
          <div class="strong" style="color:var(--ink)">${util.customerName(c)}</div>
          <div class="muted" style="font-size:var(--t-13)">${c?.phone || ''}${c?.email ? ' · ' + c.email : ''}</div>
        </div>
        <div style="text-align:right">
          <div class="strong" style="color:var(--ink)">${util.vehicleLabel(v)}</div>
          <div class="muted" style="font-size:var(--t-13)">${util.vehicleSub(v)}</div>
        </div>
      </div>
    </div>`;
}

function shopBody(q, c, v, ro) {
  const stockBadge = (line) => {
    if (!line.partId) return '';
    const p = db.partById(line.partId);
    if (!p) return '';
    if (p.qtyOnHand <= 0) return '<span class="stock-pill out">Special Order</span>';
    if (p.qtyOnHand <= p.reorderPoint) return `<span class="stock-pill low">Low Stock (${p.qtyOnHand})</span>`;
    return `<span class="stock-pill in">In Stock (${p.qtyOnHand})</span>`;
  };

  return `
    ${customerSummaryCard(c, v)}
    <div class="grid-2" style="margin-top:var(--s3);gap:var(--s2)">
      <div class="muted" style="font-size:var(--t-13)">Advisor: ${db.employeeById(q.advisorId)?.firstName || '—'}</div>
      <div class="muted" style="font-size:var(--t-13);text-align:right">Valid until ${util.fmtDate(q.validUntil)}</div>
    </div>
    ${q.concern ? `<div style="margin-top:var(--s3)"><div class="section-label" style="margin-bottom:4px">Concern</div><div style="font-size:var(--t-13)">${q.concern}</div></div>` : ''}
    ${q.diagnosisNotes ? `<div style="margin-top:var(--s2)"><div class="section-label" style="margin-bottom:4px">Diagnosis</div><div style="font-size:var(--t-13)">${q.diagnosisNotes}</div></div>` : ''}

    <div style="margin-top:var(--s4)">
      <div class="section-label" style="margin-bottom:var(--s2)">Line items</div>
      <table class="li-table">
        <thead><tr><th>Item</th><th>Type</th><th class="num">Qty/Hrs</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${(q.lineItems || []).map((l) => `
            <tr>
              <td>${l.name}${stockBadge(l) ? '<br>' + stockBadge(l) : ''}</td>
              <td>${TYPE_LABEL[l.type] || l.type}</td>
              <td class="num">${l.type === 'labor' ? (l.hours || 0) + ' hr' : (l.qty || 1)}</td>
              <td class="num">${util.fmtMoney(l.total)}</td>
              <td><span class="badge ${LINE_STATUS_BADGE[l.status] || 'badge-gray'}" style="font-size:10px">${l.status}</span></td>
              <td>
                ${['sent', 'viewed'].includes(q.status) ? `
                  <button class="icon-btn" title="Approve this item" data-line-approve="${l.id}" style="width:24px;height:24px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M20 6L9 17l-5-5"/></svg></button>
                  <button class="icon-btn" title="Decline this item" data-line-decline="${l.id}" style="width:24px;height:24px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
                ` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="totals-box" style="margin-top:var(--s3)">
        <div class="tr-row"><span>Subtotal</span><span>${util.fmtMoney(q.subtotal)}</span></div>
        ${q.discountTotal ? `<div class="tr-row"><span>Discount</span><span>-${util.fmtMoney(q.discountTotal)}</span></div>` : ''}
        <div class="tr-row"><span>Tax</span><span>${util.fmtMoney(q.taxTotal)}</span></div>
        <div class="tr-row grand"><span>Total</span><span>${util.fmtMoney(q.total)}</span></div>
      </div>
    </div>

    ${q.internalNotes ? `<div class="alert alert-amber" style="margin-top:var(--s3)"><div>${q.internalNotes}</div></div>` : ''}
    ${q.customerNotes ? `<div style="margin-top:var(--s2)"><div class="section-label" style="margin-bottom:4px">Customer notes</div><div style="font-size:var(--t-13)">${q.customerNotes}</div></div>` : ''}
    ${ro ? `<div class="alert alert-green" style="margin-top:var(--s3)">Converted to <b>${ro.ro}</b>.</div>` : ''}

    <div class="row" style="gap:var(--s2);flex-wrap:wrap;margin-top:var(--s4)">${actionButtons(q)}</div>
  `;
}

function customerPreviewBody(q, c, v) {
  const required = (q.lineItems || []).filter((l) => l.status !== 'optional');
  const optional = (q.lineItems || []).filter((l) => l.status === 'optional');
  const lineRow = (l) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)"><span>${l.name}</span><span class="tnum">${util.fmtMoney(l.total)}</span></div>`;

  return `
    <div class="approval-card" style="margin-top:var(--s3)">
      <div class="muted" style="font-size:var(--t-13)">${db.settings().name} · ${db.settings().phone}</div>
      ${customerSummaryCard(c, v)}
      <div style="margin-top:var(--s4)">
        <div class="section-label" style="margin-bottom:6px">Recommended work</div>
        ${required.length ? required.map(lineRow).join('') : '<div class="empty-sub">Nothing required.</div>'}
      </div>
      ${optional.length ? `
        <div style="margin-top:var(--s4)">
          <div class="section-label" style="margin-bottom:6px">Optional</div>
          ${optional.map((l) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)"><label class="row" style="gap:6px"><input type="checkbox" data-optional-check="${l.id}"> ${l.name}</label><span class="tnum">${util.fmtMoney(l.total)}</span></div>`).join('')}
        </div>` : ''}
      <div class="totals-box" style="margin-top:var(--s4)">
        <div class="tr-row grand"><span>Total</span><span>${util.fmtMoney(q.total)}</span></div>
      </div>
      <div class="row" style="gap:var(--s2);margin-top:var(--s4);flex-wrap:wrap">
        ${['sent', 'viewed'].includes(q.status) ? `
          <button class="btn btn-primary btn-sm" id="cust-approve-all">Approve All</button>
          <button class="btn btn-secondary btn-sm" id="cust-approve-selected">Approve Selected</button>
          <button class="btn btn-danger btn-sm" id="cust-decline">Decline</button>
        ` : `<span class="empty-sub">This quote is ${util.quoteStatusMeta(q.status).label.toLowerCase()} — no customer action available.</span>`}
      </div>
      <div class="field" style="margin-top:var(--s3)">
        <label class="label">Questions or comments (placeholder)</label>
        <textarea class="textarea" id="cust-comments" placeholder="No real two-way messaging yet — this is a structure placeholder."></textarea>
      </div>
    </div>
  `;
}

function actionButtons(q) {
  const btn = (label, attr, cls = 'btn-secondary') => `<button class="btn ${cls} btn-sm" ${attr}>${label}</button>`;
  switch (q.status) {
    case 'draft':
    case 'review_required':
      return btn('Mark Ready to Send', 'data-ready', 'btn-primary');
    case 'ready_to_send':
      return btn('Send Quote', 'data-send', 'btn-primary');
    case 'sent':
      return [btn('Mark Viewed', 'data-viewed'), btn('Approve All', 'data-approve', 'btn-primary'), btn('Decline', 'data-decline', 'btn-danger')].join('');
    case 'viewed':
      return [btn('Approve All', 'data-approve', 'btn-primary'), btn('Decline', 'data-decline', 'btn-danger')].join('');
    case 'approved':
    case 'partially_approved':
      return q.roId ? '' : btn('Convert to Repair Order', 'data-convert', 'btn-primary');
    case 'declined':
    case 'expired':
    case 'converted':
    default:
      return '';
  }
}

function wireActions(quoteId, customerPreview) {
  const run = (fn, successMsg) => {
    try {
      fn();
      toast(successMsg, 'success');
      refreshQuotesApp();
      renderDrawer(quoteId, customerPreview);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  document.querySelector('[data-ready]')?.addEventListener('click', () => run(() => util.markQuoteReadyToSend(quoteId), 'Marked ready to send.'));
  document.querySelector('[data-send]')?.addEventListener('click', () => run(() => util.sendQuote(quoteId), 'Quote sent (placeholder — no real email/SMS yet).'));
  document.querySelector('[data-viewed]')?.addEventListener('click', () => run(() => util.markQuoteViewed(quoteId), 'Marked as viewed by customer.'));
  document.querySelector('[data-approve]')?.addEventListener('click', async () => {
    if (!await confirmDialog('Approve the full quote?', { confirmLabel: 'Approve', danger: false })) return;
    run(() => util.approveQuote(quoteId), 'Quote approved.');
  });
  document.querySelector('[data-decline]')?.addEventListener('click', async () => {
    if (!await confirmDialog('Decline this quote? It will be flagged as a CRM follow-up opportunity.')) return;
    run(() => util.declineQuote(quoteId), 'Quote declined.');
  });
  document.querySelector('[data-convert]')?.addEventListener('click', async () => {
    if (!await confirmDialog('Convert the approved line items into a repair order?', { confirmLabel: 'Convert', danger: false })) return;
    run(() => util.convertQuoteToRO(quoteId), 'Converted to a repair order.');
  });
  document.querySelectorAll('[data-line-approve]').forEach((b) => b.addEventListener('click', () => run(() => util.setQuoteLineItemStatus(quoteId, b.dataset.lineApprove, 'approved'), 'Line item approved.')));
  document.querySelectorAll('[data-line-decline]').forEach((b) => b.addEventListener('click', () => run(() => util.setQuoteLineItemStatus(quoteId, b.dataset.lineDecline, 'declined'), 'Line item declined.')));

  // Customer-preview placeholder actions — same real functions, just reached
  // through the simplified customer-facing card instead of the shop view.
  document.getElementById('cust-approve-all')?.addEventListener('click', async () => {
    if (!await confirmDialog('Approve the full quote as the customer?', { confirmLabel: 'Approve', danger: false })) return;
    run(() => util.approveQuote(quoteId), 'Customer approved the full quote.');
  });
  document.getElementById('cust-approve-selected')?.addEventListener('click', () => {
    const ids = [...document.querySelectorAll('[data-optional-check]:checked')].map((el) => el.dataset.optionalCheck);
    const q = db.quoteById(quoteId);
    const requiredIds = q.lineItems.filter((l) => l.status !== 'optional').map((l) => l.id);
    run(() => util.partiallyApproveQuote(quoteId, [...requiredIds, ...ids]), 'Customer approved selected items.');
  });
  document.getElementById('cust-decline')?.addEventListener('click', async () => {
    if (!await confirmDialog('Decline this quote as the customer?')) return;
    const note = document.getElementById('cust-comments')?.value || '';
    run(() => util.declineQuote(quoteId, note), 'Customer declined the quote.');
  });
}
