// AutoBook — modules/quotes/quote-detail.js
// Shared quote-detail drawer: shop-facing status/actions view + a customer
// "Approval View" toggle (§4 — not a real public page yet, but the structure
// exists and drives the same real approve/decline/defer functions). Send
// Quote (email/text preview + print) and the customer approval preview are
// built on lib/export.js's existing showMessagePreview/printHTML — no new
// preview/print plumbing, no real send pipeline.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import { openQuoteDrawer, closeQuoteDrawer, refreshQuotesApp } from './quotes-app.js';
import * as workflow from '../../lib/workflow.js';
import { showMessagePreview, printHTML, copyToClipboard } from '../../lib/export.js';

const TYPE_LABEL = { service: 'Service', labor: 'Labor', parts: 'Part', tires: 'Tire', fluids: 'Fluid', fees: 'Fee', discount: 'Discount', inspection: 'Inspection', diagnostic: 'Diagnostic' };
const LINE_STATUS_BADGE = { recommended: 'badge-blue', approved: 'badge-green', declined: 'badge-red', deferred: 'badge-purple', optional: 'badge-amber' };
// Customer approval preview groups every line into one of these buckets.
const GROUP_FOR_TYPE = { labor: 'Labor', parts: 'Parts', tires: 'Parts', fluids: 'Parts', fees: 'Fees', discount: 'Fees', service: 'Services', inspection: 'Services', diagnostic: 'Services' };
const GROUP_ORDER = ['Services', 'Labor', 'Parts', 'Fees'];

// Pending per-line decisions for the customer-approval preview — pure client
// state until "Submit Selections" is clicked; nothing here touches db.*.
let pendingDecisions = {};

export function openQuoteDetail(quoteId) {
  pendingDecisions = {};
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
        <button class="btn btn-secondary btn-sm" id="toggle-preview">${customerPreview ? '← Shop view' : 'Customer Approval Preview →'}</button>
      </div>
      ${customerPreview ? customerPreviewBody(q, c, v, util.canUser('Quotes', 'edit')) : shopBody(q, c, v, ro)}
    </div>
  `);

  document.getElementById('close-quote-drawer').addEventListener('click', closeQuoteDrawer);
  document.getElementById('toggle-preview').addEventListener('click', () => { pendingDecisions = {}; renderDrawer(quoteId, !customerPreview); });
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

  const lead = q.leadId ? db.leadById(q.leadId) : null;
  const dviLink = workflow.getLinkedEntities('quote', q.id).find((l) => l.relationshipType === 'dvi_to_quote');
  const sourceRo = dviLink ? db.jobById(dviLink.sourceType === 'job' ? dviLink.sourceId : dviLink.targetId) : null;
  const followUps = workflow.openFollowUpTasks().filter((t) => t.relatedType === 'quote' && t.relatedId === q.id);
  const canEdit = util.canUser('Quotes', 'edit');
  const canCreate = util.canUser('Quotes', 'create');
  const canDelete = util.canUser('Quotes', 'delete');

  return `
    ${customerSummaryCard(c, v)}
    <div class="grid-2" style="margin-top:var(--s3);gap:var(--s2)">
      <div class="muted" style="font-size:var(--t-13)">Advisor: ${db.employeeById(q.advisorId)?.firstName || '—'}</div>
      <div class="muted" style="font-size:var(--t-13);text-align:right">Valid until ${util.fmtDate(q.validUntil)}</div>
    </div>
    ${lead ? `<div class="row" style="margin-top:var(--s2)"><span class="badge badge-purple">Linked CRM lead: ${lead.firstName} ${lead.lastName}</span></div>` : ''}
    ${q.concern ? `<div style="margin-top:var(--s3)"><div class="section-label" style="margin-bottom:4px">Concern</div><div style="font-size:var(--t-13)">${q.concern}</div></div>` : ''}
    ${q.diagnosisNotes ? `<div style="margin-top:var(--s2)"><div class="section-label" style="margin-bottom:4px">Diagnosis</div><div style="font-size:var(--t-13)">${q.diagnosisNotes}</div></div>` : ''}

    ${canCreate ? `<div class="row" style="gap:var(--s2);flex-wrap:wrap;margin-top:var(--s4)">
      <button class="btn btn-secondary btn-sm" id="open-send-modal">Send Quote</button>
      <button class="btn btn-secondary btn-sm" id="print-quote">Print</button>
    </div>` : ''}

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
                ${['sent', 'viewed'].includes(q.status) && canEdit ? `
                  <button class="icon-btn" title="Approve this item" data-line-approve="${l.id}" style="width:24px;height:24px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M20 6L9 17l-5-5"/></svg></button>
                  <button class="icon-btn" title="Decline this item" data-line-decline="${l.id}" style="width:24px;height:24px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
                  <button class="icon-btn" title="Defer this item" data-line-defer="${l.id}" style="width:24px;height:24px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></button>
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
    ${ro ? `<div class="alert alert-green" style="margin-top:var(--s3)">Converted to <b>${ro.ro}</b> (${util.statusMeta(ro.status).label}).</div>` : ''}
    ${sourceRo && !ro ? `<div class="alert alert-amber" style="margin-top:var(--s3)">Built from ${sourceRo.ro}'s inspection findings.</div>` : ''}

    <div style="margin-top:var(--s4)">
      <div class="row between" style="margin-bottom:var(--s2)"><div class="section-label">Follow-ups</div>${canCreate ? '<button class="btn btn-secondary btn-sm" id="create-followup">+ Create Follow-Up Task</button>' : ''}</div>
      ${followUps.length ? followUps.map((t) => `<div class="followup-row"><div><div class="strong" style="font-size:var(--t-13)">${t.title}</div><div class="muted" style="font-size:var(--t-13)">Due ${util.fmtDate(t.dueAt)}</div></div></div>`).join('') : '<div class="empty-sub" style="font-size:var(--t-13)">None open.</div>'}
    </div>

    <div class="row" style="gap:var(--s2);flex-wrap:wrap;margin-top:var(--s4)">${actionButtons(q, ro, sourceRo, dviLink, { canEdit, canCreate, canDelete })}</div>
  `;
}

function actionButtons(q, ro, sourceRo, dviLink, perms) {
  const btn = (label, attr, cls = 'btn-secondary') => `<button class="btn ${cls} btn-sm" ${attr}>${label}</button>`;
  const out = [];
  switch (q.status) {
    case 'draft':
    case 'review_required':
      if (perms.canEdit) out.push(btn('Mark Ready to Send', 'data-ready', 'btn-primary'));
      break;
    case 'ready_to_send':
      if (perms.canCreate) out.push(btn('Send Quote', 'data-send', 'btn-primary'));
      break;
    case 'sent':
      if (perms.canEdit) out.push(btn('Mark Viewed', 'data-viewed'));
      if (perms.canEdit) out.push(btn('Approve All', 'data-approve', 'btn-primary'));
      if (perms.canDelete) out.push(btn('Decline', 'data-decline', 'btn-danger'));
      break;
    case 'viewed':
      if (perms.canEdit) out.push(btn('Approve All', 'data-approve', 'btn-primary'));
      if (perms.canDelete) out.push(btn('Decline', 'data-decline', 'btn-danger'));
      break;
    case 'approved':
    case 'partially_approved':
      if (perms.canEdit) {
        if (!ro) out.push(btn('Convert to Repair Order', 'data-convert', 'btn-primary'));
        else if (dviLink) out.push(btn(`Add Approved Items to ${ro.ro}`, 'data-add-approved', 'btn-primary'));
        if (ro?.status === 'ready') out.push(btn('Create Invoice', 'data-invoice', 'btn-primary'));
      }
      break;
    case 'declined':
    case 'expired':
    case 'converted':
    default:
      break;
  }
  return out.join('');
}

function customerPreviewBody(q, c, v, canEdit) {
  const interactive = ['sent', 'viewed'].includes(q.status) && canEdit;
  const groups = GROUP_ORDER.map((g) => ({ name: g, lines: (q.lineItems || []).filter((l) => GROUP_FOR_TYPE[l.type] === g) })).filter((g) => g.lines.length);
  const decisionRow = (l) => {
    const current = pendingDecisions[l.id] || (['approved', 'declined', 'deferred'].includes(l.status) ? l.status : 'approved');
    pendingDecisions[l.id] = current;
    return `
      <div class="row between" style="padding:8px 0;border-bottom:1px solid var(--rule);gap:var(--s2)">
        <div style="flex:1;min-width:0">
          <div>${l.name}</div>
          <div class="muted" style="font-size:var(--t-xs)">${TYPE_LABEL[l.type] || l.type}</div>
        </div>
        <span class="tnum" style="flex-shrink:0">${util.fmtMoney(l.total)}</span>
        <div class="seg" style="flex-shrink:0" data-decision-group="${l.id}">
          <button data-decide="approved" data-line="${l.id}" class="${current === 'approved' ? 'active' : ''}">Approve</button>
          <button data-decide="declined" data-line="${l.id}" class="${current === 'declined' ? 'active' : ''}">Decline</button>
          <button data-decide="deferred" data-line="${l.id}" class="${current === 'deferred' ? 'active' : ''}">Defer</button>
        </div>
      </div>`;
  };

  return `
    <div class="approval-card" style="margin-top:var(--s3)">
      <div class="muted" style="font-size:var(--t-13)">${db.settings().name} · ${db.settings().phone}</div>
      ${customerSummaryCard(c, v)}
      <div class="muted" style="font-size:var(--t-13);margin-top:var(--s3)">${q.quoteNumber}${q.title ? ' — ' + q.title : ''}</div>
      ${q.concern ? `<div class="muted" style="font-size:var(--t-13)">${q.concern}</div>` : ''}

      ${interactive ? groups.map((g) => `
        <div style="margin-top:var(--s4)">
          <div class="section-label" style="margin-bottom:6px">${g.name}</div>
          ${g.lines.map(decisionRow).join('')}
        </div>`).join('') : `
        <div style="margin-top:var(--s4)">
          ${groups.map((g) => g.lines.map((l) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)"><span>${l.name}</span><span class="row" style="gap:6px"><span class="tnum">${util.fmtMoney(l.total)}</span><span class="badge ${LINE_STATUS_BADGE[l.status] || 'badge-gray'}" style="font-size:10px">${l.status}</span></span></div>`).join('')).join('')}
        </div>`}

      <div class="totals-box" style="margin-top:var(--s4)">
        <div class="tr-row grand"><span>Total</span><span>${util.fmtMoney(q.total)}</span></div>
      </div>

      ${interactive ? `
        <div class="row" style="gap:var(--s2);margin-top:var(--s4);flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="cust-approve-all">Approve All</button>
          <button class="btn btn-secondary btn-sm" id="cust-decline-all">Decline All</button>
        </div>
        <div class="field" style="margin-top:var(--s3)">
          <label class="label">Questions or comments</label>
          <textarea class="textarea" id="cust-comments" placeholder="Optional — sent along with your selections."></textarea>
        </div>
        <label class="check" style="margin-top:var(--s3)">
          <input type="checkbox" id="cust-consent">
          I authorize ${db.settings().name || 'the shop'} to perform the approved work above.
        </label>
        <div class="row" style="margin-top:var(--s3)">
          <button class="btn btn-primary btn-sm" id="cust-submit" disabled>Submit Selections</button>
        </div>
      ` : `<div class="empty-sub" style="margin-top:var(--s4)">${!canEdit ? 'Your role is view-only for quotes — no approval action available.' : `This quote is ${util.quoteStatusMeta(q.status).label.toLowerCase()} — no customer action available.`}</div>`}
    </div>
  `;
}

function wireActions(quoteId, customerPreview) {
  const run = (fn, successMsg) => {
    try {
      fn();
      toast(successMsg, 'success');
      refreshQuotesApp();
      pendingDecisions = {};
      renderDrawer(quoteId, customerPreview);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  document.querySelector('[data-ready]')?.addEventListener('click', () => run(() => util.markQuoteReadyToSend(quoteId), 'Marked ready to send.'));
  document.querySelector('[data-send]')?.addEventListener('click', () => openSendQuoteModal(quoteId, () => renderDrawer(quoteId, customerPreview)));
  document.getElementById('open-send-modal')?.addEventListener('click', () => openSendQuoteModal(quoteId, () => renderDrawer(quoteId, customerPreview)));
  document.getElementById('print-quote')?.addEventListener('click', () => printQuote(quoteId));
  document.getElementById('create-followup')?.addEventListener('click', () => {
    const q = db.quoteById(quoteId);
    workflow.createFollowUpTask({ title: `Follow up on ${q.quoteNumber}`, reason: 'Manually created from quote detail', customerId: q.customerId, relatedType: 'quote', relatedId: q.id, ownerId: q.advisorId });
    toast('Follow-up task created.', 'success');
    renderDrawer(quoteId, customerPreview);
  });
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
  document.querySelector('[data-add-approved]')?.addEventListener('click', async () => {
    const q = db.quoteById(quoteId);
    const dviLink = workflow.getLinkedEntities('quote', q.id).find((l) => l.relationshipType === 'dvi_to_quote');
    const roId = dviLink.sourceType === 'job' ? dviLink.sourceId : dviLink.targetId;
    if (!await confirmDialog(`Add the approved items to ${db.jobById(roId)?.ro}?`, { confirmLabel: 'Add', danger: false })) return;
    run(() => util.addApprovedQuoteItemsToRO(quoteId, roId), 'Approved items added to the repair order.');
  });
  document.querySelector('[data-invoice]')?.addEventListener('click', async () => {
    if (!await confirmDialog('Create an invoice for this repair order?', { confirmLabel: 'Create Invoice', danger: false })) return;
    run(() => util.createInvoiceFromQuote(quoteId), 'Invoice created.');
  });
  document.querySelectorAll('[data-line-approve]').forEach((b) => b.addEventListener('click', () => run(() => util.setQuoteLineItemStatus(quoteId, b.dataset.lineApprove, 'approved'), 'Line item approved.')));
  document.querySelectorAll('[data-line-decline]').forEach((b) => b.addEventListener('click', () => run(() => util.setQuoteLineItemStatus(quoteId, b.dataset.lineDecline, 'declined'), 'Line item declined.')));
  document.querySelectorAll('[data-line-defer]').forEach((b) => b.addEventListener('click', () => run(() => util.setQuoteLineItemStatus(quoteId, b.dataset.lineDefer, 'deferred'), 'Line item deferred.')));

  // Customer-preview actions — same real functions, reached through the
  // simplified customer-facing card instead of the shop view.
  document.querySelectorAll('[data-decide]').forEach((btn) => btn.addEventListener('click', () => {
    pendingDecisions[btn.dataset.line] = btn.dataset.decide;
    document.querySelectorAll(`[data-decision-group="${btn.dataset.line}"] button`).forEach((b) => b.classList.toggle('active', b.dataset.decide === btn.dataset.decide));
  }));
  document.getElementById('cust-approve-all')?.addEventListener('click', () => {
    document.querySelectorAll('[data-decide="approved"]').forEach((b) => b.click());
  });
  document.getElementById('cust-decline-all')?.addEventListener('click', () => {
    document.querySelectorAll('[data-decide="declined"]').forEach((b) => b.click());
  });
  const consentBox = document.getElementById('cust-consent');
  const submitBtn = document.getElementById('cust-submit');
  consentBox?.addEventListener('change', () => { submitBtn.disabled = !consentBox.checked; });
  submitBtn?.addEventListener('click', () => {
    const note = document.getElementById('cust-comments')?.value.trim() || '';
    run(() => util.submitQuoteApproval(quoteId, { ...pendingDecisions }, note), 'Selections submitted.');
  });
}

// ---------------------------------------------------------------------------
// Send Quote modal — Email Preview / Text Preview / Print / Copy Approval
// Link. Reuses lib/export.js's showMessagePreview (which already shows the
// "Preview only — not sent" badge + Copy button) for the email/text cases.
// ---------------------------------------------------------------------------
function openSendQuoteModal(quoteId, onAfterAction) {
  const q = db.quoteById(quoteId);
  const c = db.customerById(q.customerId);
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-head"><div class="modal-title">Send ${q.quoteNumber} <span class="badge badge-gray" style="margin-left:8px">Preview only — not sent</span></div><button class="icon-btn" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
      <div class="modal-body">
        <button class="btn btn-secondary" id="sq-email" style="justify-content:flex-start">Email Preview</button>
        <button class="btn btn-secondary" id="sq-sms" style="justify-content:flex-start">Text / SMS Preview</button>
        <button class="btn btn-secondary" id="sq-print" style="justify-content:flex-start">Print</button>
        <button class="btn btn-secondary" id="sq-copy-link" style="justify-content:flex-start">Copy Approval Link</button>
      </div>
      <div class="modal-foot"><button class="btn btn-secondary" data-close>Close</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const cleanup = () => overlay.remove();
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', cleanup));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });

  overlay.querySelector('#sq-email').addEventListener('click', () => {
    showMessagePreview({
      channel: 'email', to: c?.email, subject: emailSubject(q), body: emailBody(q, c),
      onLog: () => { util.logQuoteDelivery(quoteId, 'email'); onAfterAction(); },
    });
  });
  overlay.querySelector('#sq-sms').addEventListener('click', () => {
    showMessagePreview({
      channel: 'sms', to: c?.phone, body: smsBody(q, c),
      onLog: () => { util.logQuoteDelivery(quoteId, 'sms'); onAfterAction(); },
    });
  });
  overlay.querySelector('#sq-print').addEventListener('click', () => { cleanup(); printQuote(quoteId); });
  overlay.querySelector('#sq-copy-link').addEventListener('click', () => copyToClipboard(approvalLinkPlaceholder(q)));
}

function approvalLinkPlaceholder(q) {
  return `[Approval link placeholder — no public customer portal yet. Token: ${q.approvalToken || 'will be generated on send'}]`;
}
function emailSubject(q) {
  return `Your estimate from ${db.settings().name || 'My Shop'}`;
}
function emailBody(q, c) {
  const v = db.vehicleById(q.vehicleId);
  return `Hi ${c?.firstName || 'there'}, your estimate for your ${util.vehicleLabel(v)} is ready. Please review the recommended work and approve the items you would like us to complete.\n\nQuote ${q.quoteNumber} — Total: ${util.fmtMoney(q.total)}\n\nReview and approve: ${approvalLinkPlaceholder(q)}\n\n${db.settings().name || 'My Shop'} · ${db.settings().phone || ''}`;
}
function smsBody(q, c) {
  return `Hi ${c?.firstName || 'there'}, your estimate from ${db.settings().name || 'My Shop'} is ready. Total: ${util.fmtMoney(q.total)}. Review and approve here: ${approvalLinkPlaceholder(q)}`;
}

// ---------------------------------------------------------------------------
// Print — browser print only (lib/export.js's printHTML), no PDF library.
// ---------------------------------------------------------------------------
function printQuote(quoteId) {
  const q = db.quoteById(quoteId);
  const c = db.customerById(q.customerId);
  const v = db.vehicleById(q.vehicleId);
  const ro = q.roId ? db.jobById(q.roId) : null;
  const advisor = q.advisorId ? db.employeeById(q.advisorId) : null;

  const rows = (q.lineItems || []).map((l) => `
    <tr>
      <td>${l.name}</td>
      <td>${TYPE_LABEL[l.type] || l.type}</td>
      <td class="num">${l.type === 'labor' ? (l.hours || 0) + ' hr' : (l.qty || 1)}</td>
      <td class="num">${util.fmtMoney(l.total)}</td>
      <td>${l.status}</td>
    </tr>`).join('');

  const body = `
    <div class="muted" style="margin-bottom:10px">
      <b>${q.quoteNumber}</b> — ${q.title}<br>
      ${util.customerName(c)} · ${c?.phone || ''}${c?.email ? ' · ' + c.email : ''}<br>
      Vehicle: ${util.vehicleLabel(v)}${ro ? ` · RO: ${ro.ro}` : ''}<br>
      Advisor: ${advisor ? `${advisor.firstName} ${advisor.lastName}` : '—'}
    </div>
    <table>
      <thead><tr><th>Item</th><th>Type</th><th>Qty/Hrs</th><th class="num">Total</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table style="margin-top:16px;max-width:280px;margin-left:auto">
      <tr><td>Subtotal</td><td class="num">${util.fmtMoney(q.subtotal)}</td></tr>
      ${q.discountTotal ? `<tr><td>Discount</td><td class="num">-${util.fmtMoney(q.discountTotal)}</td></tr>` : ''}
      <tr><td>Tax</td><td class="num">${util.fmtMoney(q.taxTotal)}</td></tr>
      <tr style="font-weight:800"><td>Total</td><td class="num">${util.fmtMoney(q.total)}</td></tr>
    </table>
    ${q.customerNotes ? `<div style="margin-top:16px"><b>Customer notes:</b> ${q.customerNotes}</div>` : ''}
    <div class="muted" style="margin-top:16px">Valid until ${util.fmtDate(q.validUntil)}. Prices subject to change after this date.</div>
    <div style="margin-top:40px;border-top:1px solid #E5E7EB;padding-top:8px;display:flex;justify-content:space-between">
      <div>Customer signature: ____________________</div>
      <div>Date: ____________</div>
    </div>
  `;
  printHTML(`Estimate ${q.quoteNumber}`, body);
  workflow.recordWorkflowEvent('quote', q.id, 'quote_printed', `${q.quoteNumber} printed`, { customerId: q.customerId, quoteId: q.id, channel: 'print' });
}
