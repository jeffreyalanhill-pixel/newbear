// AutoBook — modules/invoices/inv-estimates.js
// Finance-side VIEW of the quote/estimate system. Source of truth is db.quotes()
// (written by modules/quotes/). This module renders a read-only summary list and
// detail drawer for the Invoices → Estimates tab; it does not maintain a separate
// estimate data model. All quote creation and editing flows through quotes.html.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { openInvDrawer, closeInvDrawer } from './invoices-app.js';
import { copyToClipboard, downloadCSV, downloadJSON, printHTML, showMessagePreview } from '../../lib/export.js';
import { goToCustomer, toast } from '../../lib/nav.js';
import { recordWorkflowEvent } from '../../lib/workflow.js';
import { torkDrawerHeader, torkSummaryCard, torkSection, torkDetailGrid, torkTotalsBox, torkNoteBlock, wireTorkNotes, torkActionBar } from '../../lib/drawer.js';

const STATUS_BADGE = {
  draft: 'badge-gray',
  ready_to_send: 'badge-gray',
  sent: 'badge-blue',
  viewed: 'badge-blue',
  approved: 'badge-green',
  partially_approved: 'badge-amber',
  declined: 'badge-red',
  expired: 'badge-red',
};

const STATUS_LABEL = {
  draft: 'Draft',
  ready_to_send: 'Ready to send',
  sent: 'Sent',
  viewed: 'Viewed',
  approved: 'Approved',
  partially_approved: 'Partially approved',
  declined: 'Declined',
  expired: 'Expired',
};

const PRIORITY_BADGE = { urgent: 'badge-red', high: 'badge-amber', normal: 'badge-blue', low: 'badge-gray' };

const LINE_TYPE_LABEL = { labor: 'Labor', parts: 'Parts', service: 'Service', diagnostic: 'Diagnostic', inspection: 'Inspection' };

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------
export function renderInvEstimates(mount) {
  const quotes = db.quotes().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  mount.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">Estimates</div>
        <a class="btn btn-primary btn-sm" href="quotes.html">+ New Estimate</a>
      </div>
      <div class="card-body" style="padding:0">
        <table class="table">
          <thead>
            <tr>
              <th>Quote #</th>
              <th>Customer</th>
              <th>Title</th>
              <th>Priority</th>
              <th class="num">Total</th>
              <th>Status</th>
              <th>Valid until</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${quotes.length ? quotes.map((q) => {
              const customer = db.customerById(q.customerId);
              const expired = q.validUntil && new Date(q.validUntil) < new Date() && !['approved','declined','expired'].includes(q.status);
              return `
              <tr>
                <td class="strong tnum">${q.quoteNumber}</td>
                <td>${util.customerName(customer)}</td>
                <td>${q.title || '—'}</td>
                <td>${q.priority ? `<span class="badge ${PRIORITY_BADGE[q.priority] || 'badge-gray'}">${q.priority}</span>` : '—'}</td>
                <td class="num tnum">${util.fmtMoney(q.total)}</td>
                <td><span class="badge ${STATUS_BADGE[q.status] || 'badge-gray'}">${STATUS_LABEL[q.status] || q.status}</span></td>
                <td class="${expired ? 'text-error' : ''}">${q.validUntil ? util.fmtDate(q.validUntil) : '—'}</td>
                <td><button class="btn btn-secondary btn-sm" data-quote-id="${q.id}">Open ›</button></td>
              </tr>`;
            }).join('') : '<tr><td colspan="8"><div class="empty-sub" style="padding:2rem">No estimates yet.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  mount.querySelectorAll('[data-quote-id]').forEach((btn) => {
    btn.addEventListener('click', () => openQuoteDrawer(btn.dataset.quoteId));
  });
}


// ---------------------------------------------------------------------------
// Detail drawer
// ---------------------------------------------------------------------------
function openQuoteDrawer(quoteId) {
  const q = db.quoteById(quoteId);
  if (!q) return;

  const customer   = db.customerById(q.customerId);
  const vehicle    = q.vehicleId ? db.vehicleById(q.vehicleId) : null;
  const advisor    = q.advisorId ? db.employeeById(q.advisorId) : null;
  const tech       = q.techId ? db.employeeById(q.techId) : null;
  const linkedRO   = q.roId ? db.jobById(q.roId) : null;
  const linkedInv  = linkedRO?.invoiceId ? db.invoiceById(linkedRO.invoiceId) : null;
  const role       = util.currentRole();
  const canEdit    = util.canUser('Quotes', 'edit') || ['owner','admin','general_manager','service_advisor'].includes(role);
  const canFinance = util.canUser('Invoices', 'view') || ['owner','admin','general_manager','bookkeeper'].includes(role);

  const lines = q.lineItems || [];
  const subtotal  = q.subtotal ?? lines.reduce((s, l) => s + (l.total ?? 0), 0);
  const discount  = q.discountTotal ?? 0;
  const tax       = q.taxTotal ?? 0;
  const total     = q.total ?? 0;

  const expired = q.validUntil && new Date(q.validUntil) < new Date() && !['approved','declined'].includes(q.status);

  // ---- line items table rows ----
  const lineRows = lines.map((l) => {
    const qty      = l.qty ?? 1;
    const unit     = l.unitPrice ?? (l.hours != null ? l.hours * (l.laborRate ?? 0) : 0);
    const lineTotal = l.total ?? (qty * unit);
    const statusBadge = l.status && l.status !== 'recommended'
      ? `<span class="badge ${l.status === 'approved' ? 'badge-green' : l.status === 'declined' ? 'badge-red' : 'badge-gray'}" style="font-size:10px;padding:2px 6px">${l.status}</span>`
      : '';
    const typeTag = l.type ? `<span class="tork-li-type">${LINE_TYPE_LABEL[l.type] || l.type}</span>` : '';
    const qtyDisplay = l.type === 'labor' ? `${l.hours ?? 1} hr` : qty;
    return `
      <tr>
        <td>
          <div class="tork-li-name">${l.name || l.description || '—'}</div>
          ${typeTag || statusBadge ? `<div class="tork-li-meta">${typeTag}${statusBadge}</div>` : ''}
        </td>
        <td class="c tnum">${qtyDisplay}</td>
        <td class="r tnum">${util.fmtMoney(unit)}</td>
        <td class="r tnum" style="font-weight:700;color:var(--ink)">${util.fmtMoney(lineTotal)}</td>
      </tr>`;
  }).join('');

  const asideDates = [
    `Created ${util.fmtDate(q.createdAt)}`,
    q.sentAt ? `Sent ${util.fmtDate(q.sentAt)}` : '',
    q.approvedAt ? `<span style="color:var(--green);font-weight:600">✓ Approved ${util.fmtDate(q.approvedAt)}</span>` : '',
    q.declinedAt ? `<span style="color:var(--red)">✗ Declined ${util.fmtDate(q.declinedAt)}</span>` : '',
  ].filter(Boolean).join('<br>');

  openInvDrawer(
    torkDrawerHeader({
      eyebrow: q.quoteNumber,
      title: q.title || 'Untitled estimate',
      badges: [
        `<span class="badge ${STATUS_BADGE[q.status] || 'badge-gray'}">${STATUS_LABEL[q.status] || q.status}</span>`,
        q.priority && q.priority !== 'normal' ? `<span class="badge ${PRIORITY_BADGE[q.priority] || 'badge-gray'}">${q.priority}</span>` : '',
        expired ? '<span class="badge badge-red">Expired</span>' : '',
      ].filter(Boolean),
    }) +
    `<div class="tork-db">` +
    torkSummaryCard(
      {
        label: 'Estimate total',
        amount: util.fmtMoney(total),
        sub: q.validUntil ? `<span style="color:${expired ? 'var(--red)' : 'var(--ink-3)'}">Valid until ${util.fmtDate(q.validUntil)}${expired ? ' · expired' : ''}</span>` : '',
      },
      asideDates
    ) +
    torkSection('Customer & Vehicle',
      torkDetailGrid([
        customer && { label: 'Customer', value: util.customerName(customer), link: true, action: `data-open-customer="${q.customerId}"` },
        customer?.phone && { label: 'Phone', value: customer.phone },
        customer?.email && { label: 'Email', value: customer.email },
        vehicle && { label: 'Vehicle', value: util.vehicleLabel(vehicle) },
        vehicle?.vin && { label: 'VIN', value: `<span style="font-family:'Space Mono',monospace;font-size:12px">${vehicle.vin}</span>` },
        vehicle?.mileage && { label: 'Mileage', value: `${vehicle.mileage.toLocaleString()} mi` },
      ].filter(Boolean))
    ) +
    torkSection('Quote Details',
      torkDetailGrid([
        advisor && { label: 'Advisor', value: `${advisor.firstName} ${advisor.lastName}` },
        tech && { label: 'Technician', value: `${tech.firstName} ${tech.lastName}` },
        q.source && { label: 'Source', value: q.source.replace(/_/g, ' ') },
        linkedRO && { label: 'Repair Order', value: linkedRO.ro, link: true, action: `data-open-ro="${linkedRO.id}"` },
        linkedInv && { label: 'Invoice', value: `${linkedInv.number} · ${util.fmtMoney(linkedInv.total)}`, link: true, action: `data-open-inv="${linkedInv.id}"` },
        q.concern && { label: 'Concern', value: q.concern },
        q.diagnosisNotes && { label: 'Diagnosis', value: q.diagnosisNotes },
      ].filter(Boolean))
    ) +
    torkSection('Line Items',
      `<table class="tork-li-table">
        <thead><tr>
          <th style="width:99%">Description</th>
          <th class="r" style="min-width:52px">Qty</th>
          <th class="r" style="min-width:72px">Unit</th>
          <th class="r" style="min-width:72px">Total</th>
        </tr></thead>
        <tbody>${lineRows || '<tr><td colspan="4" style="color:var(--ink-3);padding:12px 8px;font-size:13px">No line items.</td></tr>'}</tbody>
      </table>` +
      torkTotalsBox([
        { label: 'Subtotal', value: util.fmtMoney(subtotal) },
        discount > 0 && { label: 'Discount', value: `<span style="color:var(--green)">− ${util.fmtMoney(discount)}</span>` },
        tax > 0 && { label: 'Tax', value: util.fmtMoney(tax) },
        { label: 'Total', value: util.fmtMoney(total), grand: true },
      ].filter(Boolean))
    ) +
    torkSection('Notes',
      torkNoteBlock('customerNotes', 'Customer-facing', q.customerNotes, canEdit, 'Visible on printed and shared quotes') +
      torkNoteBlock('internalNotes', 'Internal only', q.internalNotes, canEdit, 'Not shown to customers')
    ) +
    torkSection('Actions',
      torkActionBar(
        [
          canEdit ? `<a href="quotes.html" class="btn btn-primary btn-sm">Edit in Quote Builder</a>` : '',
          canEdit && ['approved','partially_approved'].includes(q.status) && !linkedRO ? `<button class="btn btn-secondary btn-sm" data-action="convert">Convert to RO</button>` : '',
          customer ? `<button class="btn btn-secondary btn-sm" data-open-customer="${q.customerId}">Open Customer</button>` : '',
        ].filter(Boolean).join(''),
        `<button class="btn btn-secondary btn-sm" data-action="email-preview">Email Preview</button>
         <button class="btn btn-secondary btn-sm" data-action="sms-preview">SMS Preview</button>
         <button class="btn btn-secondary btn-sm" data-action="print">Print</button>
         <button class="btn btn-secondary btn-sm" data-action="copy-summary">Copy Summary</button>
         <button class="btn btn-secondary btn-sm" data-action="csv">Export CSV</button>
         <button class="btn btn-secondary btn-sm" data-action="json">Export JSON</button>`
      )
    ) +
    `</div>`
  );

  // ---- wire up action buttons ----
  const drawer = document.getElementById('inv-drawer');

  drawer.querySelector('[data-action="print"]')?.addEventListener('click', () => printQuote(q, customer, vehicle, advisor, lines, subtotal, discount, tax, total));
  drawer.querySelector('[data-action="copy-summary"]')?.addEventListener('click', () => copyQuoteSummary(q, customer, vehicle, lines, total));
  drawer.querySelector('[data-action="csv"]')?.addEventListener('click', () => exportQuoteCSV(q, customer, lines));
  drawer.querySelector('[data-action="json"]')?.addEventListener('click', () => downloadJSON(`${q.quoteNumber}.json`, q));
  drawer.querySelector('[data-action="email-preview"]')?.addEventListener('click', () => emailPreview(q, customer, vehicle, lines, total));
  drawer.querySelector('[data-action="sms-preview"]')?.addEventListener('click', () => smsPreview(q, customer, total));
  drawer.querySelector('[data-action="convert"]')?.addEventListener('click', () => convertToROPlaceholder(q));

  drawer.querySelectorAll('[data-open-customer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.openCustomer;
      if (cid && db.customerById(cid)) {
        closeInvDrawer();
        goToCustomer(cid);
      } else {
        toast('Customer record unavailable.', 'error');
      }
    });
  });

  drawer.querySelectorAll('[data-open-ro]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.location.href = `repair-orders.html?roId=${btn.dataset.openRo}`;
    });
  });

  drawer.querySelectorAll('[data-open-inv]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeInvDrawer();
      location.hash = 'invoices';
    });
  });

  // ---- wire up editable note fields via shared helper ----
  wireTorkNotes(drawer, (field, value) => {
    saveQuoteNote(q, field, value);
    q[field] = value;
  });
}

function saveQuoteNote(q, field, value) {
  const quotes = db.quotes();
  const idx = quotes.findIndex((r) => r.id === q.id);
  if (idx === -1) return;
  const updated = { ...quotes[idx], [field]: value };
  if ('updatedAt' in updated) updated.updatedAt = new Date().toISOString();
  quotes[idx] = updated;
  db.saveQuotes(quotes);

  try {
    const labelMap = { customerNotes: 'customer notes', internalNotes: 'internal notes' };
    recordWorkflowEvent('quote', q.id, 'note_updated', `${q.quoteNumber}: ${labelMap[field] || field} updated`, { customerId: q.customerId, quoteId: q.id });
  } catch (_) { /* workflow logging is best-effort */ }
}

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------
function printQuote(q, customer, vehicle, advisor, lines, subtotal, discount, tax, total) {
  const lineRows = lines.map((l) => {
    const qty   = l.qty ?? 1;
    const unit  = l.unitPrice ?? (l.hours != null ? l.hours * (l.laborRate ?? 0) : 0);
    const lt    = l.total ?? qty * unit;
    return `<tr><td>${l.name || l.description || ''}</td><td>${l.type || ''}</td><td class="num">${l.type === 'labor' ? (l.hours ?? 1) + ' hr' : qty}</td><td class="num">$${unit.toFixed(2)}</td><td class="num">$${lt.toFixed(2)}</td></tr>`;
  }).join('');

  printHTML(q.quoteNumber, `
    <div style="margin-bottom:20px">
      <h1 style="margin:0">${q.quoteNumber}${q.title ? ' — ' + q.title : ''}</h1>
      <p class="muted">${q.status.replace(/_/g,' ')} · Created ${new Date(q.createdAt).toLocaleDateString()}</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div><strong>Customer</strong><br>${util.customerName(customer)}<br>${customer?.phone || ''}<br>${customer?.email || ''}</div>
      <div><strong>Vehicle</strong><br>${vehicle ? util.vehicleLabel(vehicle) : '—'}${vehicle?.vin ? '<br>VIN: ' + vehicle.vin : ''}</div>
    </div>
    ${advisor ? `<p class="muted">Advisor: ${advisor.firstName} ${advisor.lastName}</p>` : ''}
    ${q.concern ? `<p><strong>Customer concern:</strong> ${q.concern}</p>` : ''}
    <table>
      <thead><tr><th>Description</th><th>Type</th><th class="num">Qty/Hrs</th><th class="num">Unit</th><th class="num">Total</th></tr></thead>
      <tbody>${lineRows}</tbody>
    </table>
    <div style="margin-top:16px;text-align:right">
      <p class="muted">Subtotal: $${subtotal.toFixed(2)}</p>
      ${discount > 0 ? `<p class="muted">Discount: −$${discount.toFixed(2)}</p>` : ''}
      ${tax > 0 ? `<p class="muted">Tax: $${tax.toFixed(2)}</p>` : ''}
      <p><strong>Total: $${total.toFixed(2)}</strong></p>
    </div>
    ${q.customerNotes ? `<div style="margin-top:20px;padding:12px;border:1px solid #E5E7EB;border-radius:4px"><strong>Notes:</strong> ${q.customerNotes}</div>` : ''}
    <p class="muted" style="margin-top:24px">Valid until: ${q.validUntil ? new Date(q.validUntil).toLocaleDateString() : 'N/A'}</p>
  `);
}

// ---------------------------------------------------------------------------
// Copy summary
// ---------------------------------------------------------------------------
function copyQuoteSummary(q, customer, vehicle, lines, total) {
  const lineText = lines.map((l) => {
    const qty  = l.qty ?? 1;
    const unit = l.unitPrice ?? (l.hours != null ? l.hours * (l.laborRate ?? 0) : 0);
    const lt   = l.total ?? qty * unit;
    return `  • ${l.name || l.description || ''} — $${lt.toFixed(2)}`;
  }).join('\n');

  const text = [
    `${q.quoteNumber}${q.title ? ' — ' + q.title : ''}`,
    `Customer: ${util.customerName(customer)}`,
    vehicle ? `Vehicle: ${util.vehicleLabel(vehicle)}` : '',
    `Status: ${STATUS_LABEL[q.status] || q.status}`,
    '',
    'Services:',
    lineText,
    '',
    `Total: ${util.fmtMoney(total)}`,
    q.validUntil ? `Valid until: ${util.fmtDate(q.validUntil)}` : '',
  ].filter((l) => l !== null && l !== undefined).join('\n');

  copyToClipboard(text);
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
function exportQuoteCSV(q, customer, lines) {
  const rows = lines.map((l) => {
    const qty  = l.qty ?? 1;
    const unit = l.unitPrice ?? (l.hours != null ? l.hours * (l.laborRate ?? 0) : 0);
    return { quote: q.quoteNumber, customer: util.customerName(customer), type: l.type || '', description: l.name || l.description || '', qty, unitPrice: unit, total: l.total ?? qty * unit };
  });
  downloadCSV(`${q.quoteNumber}-lines.csv`, rows, [
    { key: 'quote', label: 'Quote #' },
    { key: 'customer', label: 'Customer' },
    { key: 'type', label: 'Type' },
    { key: 'description', label: 'Description' },
    { key: 'qty', label: 'Qty' },
    { key: 'unitPrice', label: 'Unit Price' },
    { key: 'total', label: 'Total' },
  ]);
}

// ---------------------------------------------------------------------------
// Email preview
// ---------------------------------------------------------------------------
function emailPreview(q, customer, vehicle, lines, total) {
  const shopName = db.settings().name || 'Our Shop';
  const subject = `Your estimate from ${shopName} — ${q.quoteNumber}`;
  const body = [
    `Hi ${customer?.firstName || 'there'},`,
    '',
    `Thanks for bringing your ${vehicle ? util.vehicleLabel(vehicle) : 'vehicle'} in. Here's a summary of the work we're recommending:`,
    '',
    `Quote: ${q.quoteNumber}${q.title ? ' — ' + q.title : ''}`,
    ...(lines.map((l) => `  • ${l.name || l.description || ''} — ${util.fmtMoney(l.total ?? 0)}`)),
    '',
    `Total: ${util.fmtMoney(total)}`,
    q.validUntil ? `This estimate is valid until ${util.fmtDate(q.validUntil)}.` : '',
    '',
    q.customerNotes ? `Notes: ${q.customerNotes}` : '',
    '',
    `Please reply to this email or call us to approve. Thank you!`,
    '',
    `— ${shopName}`,
  ].filter((l) => l !== null && l !== undefined).join('\n');

  showMessagePreview({ channel: 'email', to: customer?.email || '', subject, body });
}

// ---------------------------------------------------------------------------
// SMS preview
// ---------------------------------------------------------------------------
function smsPreview(q, customer, total) {
  const shopName = db.settings().name || 'Our Shop';
  const body = `Hi ${customer?.firstName || 'there'}, your estimate from ${shopName} is ready: ${q.quoteNumber} — ${util.fmtMoney(total)}. Call us or reply to approve. ${q.validUntil ? 'Valid until ' + util.fmtDate(q.validUntil) + '.' : ''}`;
  showMessagePreview({ channel: 'sms', to: customer?.phone || '', body });
}

// ---------------------------------------------------------------------------
// Convert to RO placeholder
// ---------------------------------------------------------------------------
function convertToROPlaceholder(q) {
  toast(`Convert to RO: open ${q.quoteNumber} in Quote Builder and use "Convert to Repair Order" there.`, 'info');
}
