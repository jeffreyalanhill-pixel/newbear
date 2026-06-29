// Torklio — lib/workflow.js
// Shared cross-module workflow/activity layer (Phase 1). Depends ONLY on
// lib/data.js — never imports lib/util.js — so util.js can safely import
// *this* file to fire events/links from the real RO/quote/invoice/booking
// transitions without a circular import.
//
// Two new, plain localStorage-backed stores (same db.get/db.set pattern as
// everything else in lib/data.js): db.entityLinks() and db.activityEvents().
// Nothing here mutates an existing entity — it only records what happened
// and how records relate, so existing modules/pages keep working unchanged.

import { db } from './data.js';

export const RELATIONSHIP_TYPES = [
  'booking_to_appointment', 'appointment_to_ro', 'ro_to_dvi', 'dvi_to_quote',
  'quote_to_crm_opportunity', 'quote_to_ro', 'quote_to_invoice', 'ro_to_invoice',
  'invoice_to_payment', 'customer_to_vehicle', 'crm_lead_to_customer', 'crm_lead_to_quote',
  'inventory_part_to_ro', 'purchase_order_to_inventory', 'campaign_to_customer', 'declined_work_to_campaign',
];

// Note on this codebase's real shape: there is no standalone "appointment"
// entity — a confirmed booking/appointment IS a RepairOrder (job). And DVI
// isn't a separate top-level entity either — `job.dvi` (checklist) and
// `job.recommended` (red/yellow findings, set by util.setDviItem) live ON
// the job. So 'booking_to_appointment'/'appointment_to_ro' links point at
// entityType 'job', and 'dvi_to_quote' links also use that same job.

function actorInfo() {
  const emp = db.employeeById(db.settings().currentUserId);
  return { actorType: 'employee', actorId: emp?.id || null, actorName: emp ? `${emp.firstName} ${emp.lastName}` : 'System' };
}

// ---------------------------------------------------------------------------
// Activity events
// ---------------------------------------------------------------------------
export function recordWorkflowEvent(entityType, entityId, type, title, opts = {}) {
  const events = db.activityEvents();
  // Idempotency: opts.dedupeKey lets a caller guarantee "this exact moment"
  // is only ever logged once (e.g. re-running a seed/backfill pass).
  if (opts.dedupeKey && events.some((e) => e.dedupeKey === opts.dedupeKey)) {
    return events.find((e) => e.dedupeKey === opts.dedupeKey);
  }
  const actor = actorInfo();
  const event = {
    id: db.nextId('ae'),
    entityType, entityId,
    customerId: opts.customerId || null,
    vehicleId: opts.vehicleId || null,
    bookingId: opts.bookingId || null,
    appointmentId: opts.appointmentId || null,
    roId: opts.roId || null,
    dviId: opts.dviId || null,
    quoteId: opts.quoteId || null,
    invoiceId: opts.invoiceId || null,
    paymentId: opts.paymentId || null,
    leadId: opts.leadId || null,
    opportunityId: opts.opportunityId || null,
    inventoryItemId: opts.inventoryItemId || null,
    campaignId: opts.campaignId || null,
    type,
    title,
    description: opts.description || '',
    channel: opts.channel || null,
    status: opts.status || null,
    actorType: opts.actorType || actor.actorType,
    actorId: opts.actorId || actor.actorId,
    actorName: opts.actorName || actor.actorName,
    createdAt: opts.createdAt || new Date().toISOString(),
    metadata: opts.metadata || {},
    dedupeKey: opts.dedupeKey || null,
  };
  events.push(event);
  db.saveActivityEvents(events);
  return event;
}
export const recordEvent = recordWorkflowEvent; // short alias used internally
export function addStatusHistory(entityType, entityId, status, opts = {}) {
  return recordWorkflowEvent(entityType, entityId, 'status_change', `Status changed to ${status}`, { ...opts, status });
}
export function getActivityForEntity(entityType, entityId) {
  return db.activityEvents()
    .filter((e) => e.entityType === entityType && e.entityId === entityId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ---------------------------------------------------------------------------
// Entity links — idempotent: the same (source,target,relationshipType) pair
// is never linked twice.
// ---------------------------------------------------------------------------
export function linkEntities(sourceType, sourceId, targetType, targetId, relationshipType, opts = {}) {
  const links = db.entityLinks();
  const existing = links.find((l) =>
    l.sourceType === sourceType && l.sourceId === sourceId &&
    l.targetType === targetType && l.targetId === targetId &&
    l.relationshipType === relationshipType);
  if (existing) return existing;
  const link = {
    id: db.nextId('lnk'),
    sourceType, sourceId, targetType, targetId, relationshipType,
    createdAt: new Date().toISOString(),
    createdById: opts.createdById || db.settings().currentUserId || null,
    note: opts.note || '',
  };
  links.push(link);
  db.saveEntityLinks(links);
  return link;
}
export function getLinkedEntities(entityType, entityId) {
  return db.entityLinks().filter((l) =>
    (l.sourceType === entityType && l.sourceId === entityId) ||
    (l.targetType === entityType && l.targetId === entityId));
}

// Breadth-first walk across entityLinks starting at one node — small,
// depth-limited (demo-scale data only), used to show "the whole chain" for
// an entity (e.g. booking -> job -> quote -> invoice).
export function getWorkflowChain(entityType, entityId, maxDepth = 4) {
  const visited = new Set([`${entityType}:${entityId}`]);
  let frontier = [{ type: entityType, id: entityId, depth: 0 }];
  const chain = [...frontier];
  while (frontier.length && frontier[0].depth < maxDepth) {
    const next = [];
    frontier.forEach((node) => {
      getLinkedEntities(node.type, node.id).forEach((l) => {
        const other = l.sourceType === node.type && l.sourceId === node.id
          ? { type: l.targetType, id: l.targetId }
          : { type: l.sourceType, id: l.sourceId };
        const key = `${other.type}:${other.id}`;
        if (!visited.has(key)) {
          visited.add(key);
          const entry = { ...other, depth: node.depth + 1, via: l.relationshipType };
          next.push(entry);
          chain.push(entry);
        }
      });
    });
    frontier = next;
  }
  return chain;
}

// ---------------------------------------------------------------------------
// Follow-up tasks (lightweight — owner, due date, related record, status)
// ---------------------------------------------------------------------------
export function createFollowUpTask(opts) {
  const tasks = db.followUpTasks();
  if (opts.dedupeKey && tasks.some((t) => t.dedupeKey === opts.dedupeKey)) {
    return tasks.find((t) => t.dedupeKey === opts.dedupeKey);
  }
  const task = {
    id: db.nextId('fu'),
    title: opts.title,
    reason: opts.reason || '',
    dueAt: opts.dueAt || new Date(Date.now() + 3 * 86400000).toISOString(),
    ownerId: opts.ownerId || db.settings().currentUserId || null,
    customerId: opts.customerId || null,
    relatedType: opts.relatedType || null,
    relatedId: opts.relatedId || null,
    status: 'open',
    createdAt: new Date().toISOString(),
    completedAt: null,
    dedupeKey: opts.dedupeKey || null,
  };
  tasks.push(task);
  db.saveFollowUpTasks(tasks);
  if (opts.customerId) {
    recordWorkflowEvent('followup', task.id, 'followup_created', opts.title, { customerId: opts.customerId, relatedType: opts.relatedType, roId: opts.relatedType === 'job' ? opts.relatedId : null, quoteId: opts.relatedType === 'quote' ? opts.relatedId : null });
  }
  return task;
}
export function completeFollowUpTasksFor(relatedType, relatedId) {
  const tasks = db.followUpTasks();
  let changed = false;
  tasks.forEach((t) => {
    if (t.relatedType === relatedType && t.relatedId === relatedId && t.status === 'open') {
      t.status = 'completed';
      t.completedAt = new Date().toISOString();
      changed = true;
    }
  });
  if (changed) db.saveFollowUpTasks(tasks);
  return tasks.filter((t) => t.relatedType === relatedType && t.relatedId === relatedId);
}
export function openFollowUpTasks() {
  return db.followUpTasks().filter((t) => t.status === 'open');
}
export function overdueFollowUpTasks() {
  const now = Date.now();
  return openFollowUpTasks().filter((t) => new Date(t.dueAt).getTime() < now);
}

// ---------------------------------------------------------------------------
// Customer timeline — merges activityEvents with the existing computed
// db.customerTimeline() entries (booking/job/invoice/quote/comm). Most pages
// should keep using db.customerTimeline() directly (it already includes
// activityEvents — see lib/data.js); this wrapper exists for callers that
// also want role-based filtering applied.
// ---------------------------------------------------------------------------
const ROLE_HIDDEN_EVENT_TYPES = {
  technician: ['invoice_created', 'payment_recorded', 'refund_issued', 'quote_sent', 'quote_viewed', 'quote_approved', 'quote_partially_approved', 'quote_declined'],
  apprentice: ['invoice_created', 'payment_recorded', 'refund_issued', 'quote_sent', 'quote_viewed', 'quote_approved', 'quote_partially_approved', 'quote_declined'],
  marketing: ['payment_recorded', 'refund_issued', 'invoice_created'],
  parts: ['payment_recorded', 'refund_issued', 'invoice_created', 'quote_sent', 'quote_viewed', 'quote_approved', 'quote_partially_approved', 'quote_declined'],
};
export function getCustomerTimeline(customerId, opts = {}) {
  const events = db.customerTimeline(customerId);
  const role = opts.role;
  const hidden = role ? ROLE_HIDDEN_EVENT_TYPES[role] : null;
  return hidden ? events.filter((e) => !hidden.includes(e.type)) : events;
}

// ---------------------------------------------------------------------------
// Page-level linked-record badges (counts) for a CRM customer/lead, RO,
// quote, invoice, or appointment.
// ---------------------------------------------------------------------------
export function getEntityBadges(entityType, entityId) {
  if (entityType === 'customer') {
    return {
      quotes: db.quotesForCustomer(entityId).length,
      appointments: db.jobsForCustomer(entityId).length,
      ros: db.jobsForCustomer(entityId).length,
      invoices: db.invoices().filter((i) => i.customerId === entityId).length,
      followUps: openFollowUpTasks().filter((t) => t.customerId === entityId).length,
    };
  }
  if (entityType === 'job') {
    const job = db.jobById(entityId);
    const links = getLinkedEntities('job', entityId);
    return {
      quote: links.find((l) => l.relationshipType === 'dvi_to_quote' || l.relationshipType === 'quote_to_ro')?.sourceId || job?.quoteId || null,
      invoice: job?.invoiceId || null,
      booking: job?.bookingId || null,
      partsStatus: job?.partsStatus || (job?.lineItems || []).some((l) => l.type === 'part') ? 'requested' : 'not_requested',
    };
  }
  if (entityType === 'quote') {
    const quote = db.quoteById(entityId);
    return { ro: quote?.roId || null, customer: quote?.customerId || null, status: quote?.status || null };
  }
  if (entityType === 'invoice') {
    const invoice = db.invoiceById(entityId);
    return { ro: invoice?.roId || null, customer: invoice?.customerId || null, payments: (invoice?.payments || []).length, balance: invoice?.balance ?? null };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Declined-work marketing candidates (section 13): customers with a declined
// quote OR a declined RO approval — feeds the existing seg_declined segment
// (see the OR-condition added in lib/data.js's declined_services case).
// ---------------------------------------------------------------------------
export function getDeclinedWorkCandidates() {
  const declinedQuotes = db.quotes().filter((q) => q.status === 'declined' || (q.lineItems || []).some((l) => l.status === 'declined'));
  const byCustomer = new Map();
  declinedQuotes.forEach((q) => {
    if (!byCustomer.has(q.customerId)) byCustomer.set(q.customerId, []);
    byCustomer.get(q.customerId).push({ type: 'quote', id: q.id, label: q.title, value: q.total });
  });
  db.jobs().filter((j) => j.approvalStatus === 'declined').forEach((j) => {
    if (!byCustomer.has(j.customerId)) byCustomer.set(j.customerId, []);
    byCustomer.get(j.customerId).push({ type: 'job', id: j.id, label: j.ro, value: j.total });
  });
  return [...byCustomer.entries()].map(([customerId, items]) => ({
    customerId,
    customer: db.customerById(customerId),
    items,
    declinedValue: items.reduce((s, i) => s + (i.value || 0), 0),
  }));
}

// ---------------------------------------------------------------------------
// Computed manager/owner/advisor/technician workflow metrics (section 14).
// Real where the underlying data exists; everything here is derived live
// from db.* — nothing is a stored/cached metric that can go stale.
// ---------------------------------------------------------------------------
export function workflowMetrics() {
  const jobs = db.jobs();
  const quotes = db.quotes();
  const invoices = db.invoices();
  const bookings = db.bookings();

  const sentOrLater = quotes.filter((q) => q.sentAt);
  const approvedLike = quotes.filter((q) => ['approved', 'partially_approved'].includes(q.status));
  const byAdvisor = {};
  quotes.forEach((q) => {
    if (!q.advisorId) return;
    byAdvisor[q.advisorId] = byAdvisor[q.advisorId] || { sent: 0, approved: 0 };
    if (q.sentAt) byAdvisor[q.advisorId].sent += 1;
    if (['approved', 'partially_approved'].includes(q.status)) byAdvisor[q.advisorId].approved += 1;
  });
  const quoteApprovalRateByAdvisor = Object.fromEntries(
    Object.entries(byAdvisor).map(([advisorId, v]) => [advisorId, v.sent ? Math.round((v.approved / v.sent) * 100) : 0])
  );

  const cycleTimes = jobs.filter((j) => j.completedAt && j.createdAt)
    .map((j) => (new Date(j.completedAt) - new Date(j.createdAt)) / 3600000);
  const roCycleTimeHours = cycleTimes.length ? Math.round((cycleTimes.reduce((s, n) => s + n, 0) / cycleTimes.length) * 10) / 10 : null;

  const closedBookings = bookings.filter((b) => b.status !== 'pending');
  const apptToRoConversion = closedBookings.length ? Math.round((closedBookings.filter((b) => b.roId).length / closedBookings.length) * 100) : null;

  const noShowJobs = jobs.filter((j) => j.noShow).length;
  const scheduledOrPastJobs = jobs.filter((j) => j.scheduledDate).length;

  const quoteToApprovalConversion = sentOrLater.length ? Math.round((approvedLike.length / sentOrLater.length) * 100) : null;
  const approvalToInvoiceConversion = approvedLike.length ? Math.round((invoices.filter((i) => i.roId && quotes.some((q) => q.roId === i.roId)).length / approvedLike.length) * 100) : null;

  const paidInvoices = invoices.filter((i) => i.paidAt);
  const invoiceToPaymentHours = paidInvoices.length
    ? Math.round((paidInvoices.reduce((s, i) => s + (new Date(i.paidAt) - new Date(i.issuedAt)) / 3600000, 0) / paidInvoices.length) * 10) / 10
    : null;

  const declined = getDeclinedWorkCandidates();
  const declinedWorkValue = declined.reduce((s, d) => s + d.declinedValue, 0);

  const openFollowUps = openFollowUpTasks();
  const overdueFollowUps = overdueFollowUpTasks();

  return {
    manager: {
      quoteApprovalRateByAdvisor,
      followUpCompletionByOwner: null, // placeholder — needs per-owner completion history beyond MVP scope
      overdueFollowUpsByOwner: groupCountBy(overdueFollowUps, 'ownerId'),
      roCycleTimeHours,
      inspectionToQuoteConversion: null, // placeholder — would need a real DVI entity to count "inspections"
      quoteToApprovalConversion,
      approvalToInvoiceConversion,
      invoiceToPaymentHours,
      declinedWorkValue,
      partsDelays: db.purchaseOrders().filter((p) => p.status === 'backordered').length,
      noShowRate: scheduledOrPastJobs ? Math.round((noShowJobs / scheduledOrPastJobs) * 100) : 0,
      appointmentToRoConversion: apptToRoConversion,
    },
    owner: {
      pipelineValue: quotes.filter((q) => ['sent', 'viewed'].includes(q.status)).reduce((s, q) => s + q.total, 0),
      approvedEstimateValue: approvedLike.reduce((s, q) => s + q.total, 0),
      outstandingReceivables: invoices.filter((i) => i.balance > 0).reduce((s, i) => s + i.balance, 0),
      revenueFromLeads: null, // placeholder — needs lead->invoice attribution beyond MVP scope
      revenueByAdvisor: groupSumBy(invoices.filter((i) => i.roId), (i) => jobs.find((j) => j.id === i.roId)?.advisorId, (i) => i.total),
      laborSoldVsCompleted: null, // placeholder — billedHours exists on some jobs but not a real "sold vs completed" split
      inventoryStockoutImpact: null, // placeholder
    },
    advisor: {
      quotesSent: sentOrLater.length,
      approvals: approvedLike.length,
      declinedWork: quotes.filter((q) => q.status === 'declined').length,
      followUpsDue: openFollowUps.length,
      appointmentsCreated: bookings.filter((b) => b.roId).length,
      roConversions: jobs.filter((j) => j.source === 'booking').length,
    },
    technician: {
      assignedROs: groupCountBy(jobs.filter((j) => j.techId), 'techId'),
      completedDVIs: null, // placeholder — no standalone DVI entity exists yet
      findings: groupCountBy(jobs.flatMap((j) => (j.recommended || []).map((r) => ({ techId: j.techId, ...r }))), 'techId'),
      jobsCompleted: groupCountBy(jobs.filter((j) => ['ready', 'invoiced', 'closed'].includes(j.status)), 'techId'),
      actualVsBilledLabor: null, // placeholder
    },
  };
}
function groupCountBy(arr, key) {
  const out = {};
  arr.forEach((x) => { const k = x[key]; if (k) out[k] = (out[k] || 0) + 1; });
  return out;
}
function groupSumBy(arr, keyFn, valFn) {
  const out = {};
  arr.forEach((x) => { const k = keyFn(x); if (k) out[k] = (out[k] || 0) + (valFn(x) || 0); });
  return out;
}

// ---------------------------------------------------------------------------
// Idempotent demo backfill — derives entityLinks + activityEvents from
// relationships that already exist in the seeded data (shared IDs) rather
// than fabricating new customers/records. Lazily runs once, the first time
// any workflow.* function is used, from whichever page loads first.
// ---------------------------------------------------------------------------
let _seedAttempted = false;
export function ensureSeeded() {
  if (_seedAttempted) return;
  _seedAttempted = true;
  if (db.activityEvents().length || db.entityLinks().length) return; // already backfilled in a prior session
  seedDemoLinks();
}
export function seedDemoLinks() {
  db.vehicles().forEach((v) => {
    if (v.customerId) linkEntities('customer', v.customerId, 'vehicle', v.id, 'customer_to_vehicle');
  });

  db.bookings().forEach((b) => {
    recordWorkflowEvent('booking', b.id, 'booking_requested', 'Booking request submitted', { customerId: b.customerId, bookingId: b.id, createdAt: b.submittedAt, dedupeKey: `seed_booking_${b.id}` });
    if (b.roId) {
      linkEntities('booking', b.id, 'job', b.roId, 'booking_to_appointment');
      recordWorkflowEvent('booking', b.id, 'booking_confirmed', 'Booking confirmed', { customerId: b.customerId, bookingId: b.id, roId: b.roId, createdAt: b.submittedAt, dedupeKey: `seed_booking_confirmed_${b.id}` });
    }
  });

  db.jobs().forEach((j) => {
    recordWorkflowEvent('job', j.id, 'ro_created', `${j.ro} created`, { customerId: j.customerId, vehicleId: j.vehicleId, roId: j.id, createdAt: j.createdAt, dedupeKey: `seed_ro_${j.id}` });
    if (j.checkedInAt) recordWorkflowEvent('job', j.id, 'customer_checked_in', `Customer checked in for ${j.ro}`, { customerId: j.customerId, roId: j.id, createdAt: j.checkedInAt, dedupeKey: `seed_checkin_${j.id}` });
    if (j.startedAt) recordWorkflowEvent('job', j.id, 'ro_started', `${j.ro} started`, { customerId: j.customerId, roId: j.id, createdAt: j.startedAt, dedupeKey: `seed_started_${j.id}` });
    if (j.completedAt) recordWorkflowEvent('job', j.id, 'ro_ready', `${j.ro} marked ready`, { customerId: j.customerId, roId: j.id, createdAt: j.completedAt, dedupeKey: `seed_ready_${j.id}` });
    if (j.status === 'cancelled') recordWorkflowEvent('job', j.id, j.noShow ? 'no_show' : 'ro_cancelled', `${j.ro} ${j.noShow ? 'no-show' : 'cancelled'}`, { customerId: j.customerId, roId: j.id, createdAt: j.createdAt, dedupeKey: `seed_cancel_${j.id}` });
    if (j.quoteId) linkEntities('quote', j.quoteId, 'job', j.id, 'quote_to_ro');
    if (j.invoiceId) linkEntities('job', j.id, 'invoice', j.invoiceId, 'ro_to_invoice');
  });

  db.quotes().forEach((q) => {
    recordWorkflowEvent('quote', q.id, 'quote_created', `${q.quoteNumber} created`, { customerId: q.customerId, quoteId: q.id, createdAt: q.createdAt, dedupeKey: `seed_quote_${q.id}` });
    if (q.sentAt) recordWorkflowEvent('quote', q.id, 'quote_sent', `${q.quoteNumber} sent`, { customerId: q.customerId, quoteId: q.id, createdAt: q.sentAt, dedupeKey: `seed_quote_sent_${q.id}` });
    if (q.status === 'approved') recordWorkflowEvent('quote', q.id, 'quote_approved', `${q.quoteNumber} approved`, { customerId: q.customerId, quoteId: q.id, createdAt: q.approvedAt || q.updatedAt, dedupeKey: `seed_quote_approved_${q.id}` });
    if (q.status === 'partially_approved') recordWorkflowEvent('quote', q.id, 'quote_partially_approved', `${q.quoteNumber} partially approved`, { customerId: q.customerId, quoteId: q.id, createdAt: q.approvedAt || q.updatedAt, dedupeKey: `seed_quote_partial_${q.id}` });
    if (q.status === 'declined') recordWorkflowEvent('quote', q.id, 'quote_declined', `${q.quoteNumber} declined`, { customerId: q.customerId, quoteId: q.id, createdAt: q.declinedAt || q.updatedAt, dedupeKey: `seed_quote_declined_${q.id}` });
    if (q.roId) linkEntities('quote', q.id, 'job', q.roId, 'quote_to_ro');
  });

  db.invoices().forEach((i) => {
    recordWorkflowEvent('invoice', i.id, 'invoice_created', `${i.number} created`, { customerId: i.customerId, invoiceId: i.id, roId: i.roId || null, createdAt: i.issuedAt, dedupeKey: `seed_invoice_${i.id}` });
    if (i.roId) linkEntities('job', i.roId, 'invoice', i.id, 'ro_to_invoice');
    (i.payments || []).forEach((p) => {
      recordWorkflowEvent('invoice', i.id, 'payment_recorded', `${p.method === 'credit_note' ? 'Credit applied' : 'Payment'} of ${p.amount} on ${i.number}`, { customerId: i.customerId, invoiceId: i.id, paymentId: p.id, createdAt: p.date, dedupeKey: `seed_payment_${p.id}` });
    });
  });
}
