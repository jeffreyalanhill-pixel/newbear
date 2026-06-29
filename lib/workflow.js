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
    // Normally "now" — overridable only for backdating a real historical
    // moment (e.g. seedCrmDemoData links a campaign at its own real sentAt,
    // not today, so attribution math sees activity that happened after it).
    createdAt: opts.createdAt || new Date().toISOString(),
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
// Follow-up tasks. `ownerId` IS "assignedToEmployeeId" (same field, original
// name kept since workflowMetrics/getEntityBadges already group by it) —
// opts.assignedToEmployeeId is accepted as an alias so callers can use
// either name. `status` is open/completed/canceled only — "overdue" is never
// stored (it would drift out of sync with the clock); it's always computed
// live by overdueFollowUpTasks() from status + dueAt.
// ---------------------------------------------------------------------------
export const FOLLOWUP_TASK_TYPES = ['call', 'email', 'text', 'quote_follow_up', 'declined_work', 'review_request', 'service_reminder', 'fleet_follow_up', 'win_back', 'other'];
export const FOLLOWUP_OUTCOMES = ['contacted', 'left_message', 'no_response', 'booked_appointment', 'sent_quote', 'not_interested', 'won', 'lost'];

export function createFollowUpTask(opts) {
  const tasks = db.followUpTasks();
  if (opts.dedupeKey && tasks.some((t) => t.dedupeKey === opts.dedupeKey)) {
    return tasks.find((t) => t.dedupeKey === opts.dedupeKey);
  }
  const task = {
    id: db.nextId('fu'),
    title: opts.title,
    reason: opts.reason || '',
    notes: opts.notes || '',
    taskType: FOLLOWUP_TASK_TYPES.includes(opts.taskType) ? opts.taskType : 'other',
    dueAt: opts.dueAt || new Date(Date.now() + 3 * 86400000).toISOString(),
    ownerId: opts.ownerId || opts.assignedToEmployeeId || db.settings().currentUserId || null,
    createdByEmployeeId: opts.createdByEmployeeId || db.settings().currentUserId || null,
    customerId: opts.customerId || null,
    leadId: opts.leadId || null,
    relatedType: opts.relatedType || null,
    relatedId: opts.relatedId || null,
    status: 'open',
    outcome: null,
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
// Bulk-complete by related record (e.g. every open follow-up tied to a quote
// once it's approved) — no per-task outcome, used by automatic transitions.
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
// Complete ONE task by id with an explicit outcome — the real path for a
// person closing out their own follow-up (vs. the automatic bulk path above).
export function completeFollowUpTask(taskId, outcome) {
  const tasks = db.followUpTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Follow-up task ${taskId} not found`);
  task.status = 'completed';
  task.completedAt = new Date().toISOString();
  task.outcome = FOLLOWUP_OUTCOMES.includes(outcome) ? outcome : task.outcome;
  db.saveFollowUpTasks(tasks);
  return task;
}
export function cancelFollowUpTask(taskId) {
  const tasks = db.followUpTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Follow-up task ${taskId} not found`);
  task.status = 'canceled';
  db.saveFollowUpTasks(tasks);
  return task;
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
    byAdvisor[q.advisorId] = byAdvisor[q.advisorId] || { sent: 0, approved: 0, quotedValue: 0, approvedValue: 0, declinedValue: 0 };
    const a = byAdvisor[q.advisorId];
    if (q.sentAt) { a.sent += 1; a.quotedValue += q.total || 0; }
    // q.lineItems[].total is always precomputed by util.recalcQuote — sum
    // those directly rather than depending on util.js (this file must stay
    // a leaf dependency util.js can safely import without a cycle).
    if (['approved', 'partially_approved'].includes(q.status)) { a.approved += 1; a.approvedValue += (q.lineItems || []).filter((l) => l.status === 'approved').reduce((s, l) => s + (l.total || 0), 0); }
    if (q.status === 'declined') a.declinedValue += q.total || 0;
  });
  const quoteApprovalRateByAdvisor = Object.fromEntries(
    Object.entries(byAdvisor).map(([advisorId, v]) => [advisorId, v.sent ? Math.round((v.approved / v.sent) * 100) : 0])
  );
  const quotesSentByAdvisor = Object.fromEntries(Object.entries(byAdvisor).map(([id, v]) => [id, v.sent]));
  const quotedValueByAdvisor = Object.fromEntries(Object.entries(byAdvisor).map(([id, v]) => [id, round2(v.quotedValue)]));
  const approvedValueByAdvisor = Object.fromEntries(Object.entries(byAdvisor).map(([id, v]) => [id, round2(v.approvedValue)]));
  const declinedValueByAdvisor = Object.fromEntries(Object.entries(byAdvisor).map(([id, v]) => [id, round2(v.declinedValue)]));

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
      quotesSentByAdvisor,
      quotedValueByAdvisor,
      approvedValueByAdvisor,
      declinedValueByAdvisor,
      avgTimeToApprovalHours: (() => {
        const times = quotes.filter((q) => q.sentAt && q.approvedAt).map((q) => (new Date(q.approvedAt) - new Date(q.sentAt)) / 3600000);
        return times.length ? round2(times.reduce((s, n) => s + n, 0) / times.length) : null;
      })(),
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
function round2(n) { return Math.round((n || 0) * 100) / 100; }
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
function fmt0(n) { return '$' + Math.round(n || 0).toLocaleString('en-US'); }

// ---------------------------------------------------------------------------
// CRM ownership. Lead ownership is a real, already-existing field
// (Lead.assignedAdvisorId, set at creation — just never assigned anywhere
// until now). Customer ownership is new but additive: most customers won't
// have it set explicitly, so customerOwnerId() falls back to whoever advised
// their most recent job/quote — "my customers" works immediately on existing
// data with no backfill required.
// ---------------------------------------------------------------------------
export function assignLeadOwner(leadId, employeeId) {
  const leads = db.leads();
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);
  lead.assignedAdvisorId = employeeId || null;
  db.saveLeads(leads);
  const emp = employeeId ? db.employeeById(employeeId) : null;
  recordWorkflowEvent('lead', leadId, 'lead_assigned', emp ? `Lead assigned to ${emp.firstName}` : 'Lead unassigned', { leadId, customerId: lead.customerId || null });
  return lead;
}
export function assignCustomerOwner(customerId, employeeId) {
  const customers = db.customers();
  const customer = customers.find((c) => c.id === customerId);
  if (!customer) throw new Error(`Customer ${customerId} not found`);
  customer.assignedAdvisorId = employeeId || null;
  db.saveCustomers(customers);
  const emp = employeeId ? db.employeeById(employeeId) : null;
  recordWorkflowEvent('customer', customerId, 'owner_assigned', emp ? `${emp.firstName} assigned as account owner` : 'Account owner unassigned', { customerId });
  return customer;
}
export function customerOwnerId(customer) {
  if (customer.assignedAdvisorId) return customer.assignedAdvisorId;
  const jobs = db.jobsForCustomer(customer.id).filter((j) => j.advisorId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (jobs.length) return jobs[0].advisorId;
  const quotes = db.quotesForCustomer(customer.id).filter((q) => q.advisorId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return quotes.length ? quotes[0].advisorId : null;
}
export function getMyLeads(employeeId) {
  return db.leads().filter((l) => l.assignedAdvisorId === employeeId);
}
export function getMyCustomers(employeeId) {
  return db.customers().filter((c) => customerOwnerId(c) === employeeId);
}
export function unassignedLeads() {
  return db.leads().filter((l) => !l.assignedAdvisorId && !['converted', 'lost'].includes(l.status));
}
const STALE_LEAD_DAYS = 7;
export function staleLeads() {
  const now = Date.now();
  return db.leads().filter((l) => {
    if (['converted', 'lost'].includes(l.status)) return false;
    const lastTouch = l.lastContactedAt || l.createdAt;
    return (now - new Date(lastTouch).getTime()) / 86400000 > STALE_LEAD_DAYS;
  });
}
export function markLeadContacted(leadId) {
  const leads = db.leads();
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);
  lead.lastContactedAt = new Date().toISOString();
  db.saveLeads(leads);
  recordWorkflowEvent('lead', leadId, 'lead_contacted', 'Customer contacted by phone', { leadId, customerId: lead.customerId || null });
  return lead;
}

// ---------------------------------------------------------------------------
// Next Best Action — simple, rule-based (no AI/ML). Every rule reads real
// fields; nothing here is fabricated. customer-scoped rules need the
// customer's quotes/jobs, which is why these take the full record rather
// than just an id.
// ---------------------------------------------------------------------------
export function nextBestActionsForLead(lead) {
  const actions = [];
  if (!['converted', 'lost'].includes(lead.status)) {
    if (!lead.assignedAdvisorId) actions.push({ rule: 'no_owner', title: 'No owner assigned', recommendation: 'Assign an owner so this lead gets worked.' });
    else if (!lead.lastContactedAt) actions.push({ rule: 'not_contacted', title: 'Not contacted yet', recommendation: 'Call today — first contact is overdue.' });
  }
  return actions;
}
export function nextBestActionsForCustomer(customer) {
  const actions = [];
  const quotes = db.quotesForCustomer(customer.id);
  const pending = quotes.filter((q) => ['sent', 'viewed'].includes(q.status));
  if (pending.length) actions.push({ rule: 'quote_pending', title: `${pending.length} quote${pending.length > 1 ? 's' : ''} sent, not approved`, recommendation: 'Send a quote follow-up.', quoteId: pending[0].id });
  if (getDeclinedWorkCandidates().some((d) => d.customerId === customer.id)) {
    actions.push({ rule: 'declined_work', title: 'Has declined work on file', recommendation: 'Add to the declined-work campaign.' });
  }
  if (db.jobsForCustomer(customer.id).some((j) => ['ready', 'invoiced', 'closed'].includes(j.status) && (Date.now() - new Date(j.completedAt || j.createdAt).getTime()) / 86400000 < 7)) {
    actions.push({ rule: 'review_request', title: 'Recently completed service', recommendation: 'Send a review request.' });
  }
  if (db.segmentMembers('seg_due_oil').some((c) => c.id === customer.id) || db.segmentMembers('seg_due_tire').some((c) => c.id === customer.id)) {
    actions.push({ rule: 'service_due', title: 'Overdue for routine service', recommendation: 'Add to the service reminder campaign.' });
  }
  if (db.segmentMembers('seg_inactive').some((c) => c.id === customer.id)) {
    actions.push({ rule: 'lapsed', title: 'Lapsed customer', recommendation: 'Add to the win-back campaign.' });
  }
  if (db.segmentMembers('seg_fleet').some((c) => c.id === customer.id) && db.segmentMembers('seg_inactive').some((c) => c.id === customer.id)) {
    actions.push({ rule: 'fleet_inactive', title: 'Fleet account gone quiet', recommendation: 'Account-manager follow-up call.' });
  }
  const aroTarget = db.settings().aroTarget || 0;
  const highValuePending = pending.find((q) => q.total > aroTarget * 1.5);
  if (aroTarget && highValuePending) {
    actions.push({ rule: 'high_value', title: `High-value quote pending (${fmt0(highValuePending.total)})`, recommendation: 'Manager review — worth a personal call.', quoteId: highValuePending.id });
  }
  return actions;
}
// Command Center feed: every open lead/customer's actions, flattened with
// enough context (name, link) to render a list — capped by the caller.
export function topNextBestActions() {
  const items = [];
  db.leads().filter((l) => !['converted', 'lost'].includes(l.status)).forEach((l) => {
    nextBestActionsForLead(l).forEach((a) => items.push({ ...a, entityType: 'lead', entityId: l.id, name: `${l.firstName} ${l.lastName}` }));
  });
  db.customers().forEach((c) => {
    nextBestActionsForCustomer(c).forEach((a) => items.push({ ...a, entityType: 'customer', entityId: c.id, name: `${c.firstName} ${c.lastName}` }));
  });
  // High-value first, then a stable enough order for the rest.
  return items.sort((a, b) => (a.rule === 'high_value') - (b.rule === 'high_value')).reverse();
}

// ---------------------------------------------------------------------------
// CRM performance — one employee at a time, and the team table (manager
// view maps over crmTeamMetrics(); personal view just reads its own row).
// "Opportunity" has no standalone entity in this codebase — an open
// opportunity here means an unconverted lead OR a sent/viewed/partially
// approved quote, owned by this employee.
// ---------------------------------------------------------------------------
export function crmMetricsForEmployee(employeeId) {
  const myLeads = getMyLeads(employeeId).filter((l) => !['converted', 'lost'].includes(l.status));
  const contactedLeads = myLeads.filter((l) => l.lastContactedAt);
  const myQuotes = db.quotes().filter((q) => q.advisorId === employeeId);
  const sentQuotes = myQuotes.filter((q) => q.sentAt);
  const openQuotes = myQuotes.filter((q) => ['sent', 'viewed', 'partially_approved'].includes(q.status));
  const approvedQuotes = myQuotes.filter((q) => ['approved', 'partially_approved', 'converted'].includes(q.status));
  const myFollowUps = db.followUpTasks().filter((t) => t.ownerId === employeeId);
  const overdue = overdueFollowUpTasks().filter((t) => t.ownerId === employeeId);
  const completed = myFollowUps.filter((t) => t.status === 'completed');
  const bookedAppointments = db.jobs().filter((j) => j.advisorId === employeeId).length;
  const wonValue = round2(approvedQuotes.reduce((s, q) => s + (q.lineItems || []).filter((l) => l.status === 'approved').reduce((a, l) => a + (l.total || 0), 0), 0));
  const pipelineValue = round2(openQuotes.reduce((s, q) => s + (q.total || 0), 0));

  return {
    assignedLeads: myLeads.length,
    contactedLeads: contactedLeads.length,
    openOpportunities: myLeads.length + openQuotes.length,
    overdueFollowUps: overdue.length,
    completedFollowUps: completed.length,
    quotesSent: sentQuotes.length,
    approvals: approvedQuotes.length,
    approvalRate: sentQuotes.length ? Math.round((approvedQuotes.length / sentQuotes.length) * 100) : 0,
    bookedAppointments,
    wonValue,
    pipelineValue,
  };
}
const SALES_ROLES = ['owner', 'general_manager', 'service_manager', 'advisor', 'front_desk', 'marketing'];
export function crmTeamMetrics() {
  return db.employees()
    .filter((e) => e.employmentStatus === 'active' && SALES_ROLES.includes(e.role))
    .map((e) => {
      const m = crmMetricsForEmployee(e.id);
      const statusBadge = m.overdueFollowUps > 2 ? 'badge-red' : m.overdueFollowUps > 0 ? 'badge-amber' : 'badge-green';
      return { employee: e, ...m, statusBadge };
    });
}

// ---------------------------------------------------------------------------
// Marketing campaign attribution (placeholder, clearly labeled as such where
// rendered). Computed from the real campaign_to_customer entityLinks this
// file already creates in util.sendCampaign — not a separate stored entity.
// "Influenced" means the customer has a quote/job/invoice created AFTER the
// link was made; this is a simulated attribution model, not real tracking.
// ---------------------------------------------------------------------------
export function campaignAttribution(campaignId) {
  const links = db.entityLinks().filter((l) => l.relationshipType === 'campaign_to_customer' && l.sourceType === 'campaign' && l.sourceId === campaignId);
  const since = (link) => new Date(link.createdAt).getTime();
  let appointmentsBooked = 0, quotesCreated = 0, invoicePaid = 0, revenueInfluenced = 0;
  const followUpNeeded = [];
  links.forEach((link) => {
    const ts = since(link);
    const jobs = db.jobsForCustomer(link.targetId).filter((j) => new Date(j.createdAt).getTime() >= ts);
    const quotes = db.quotesForCustomer(link.targetId).filter((q) => new Date(q.createdAt).getTime() >= ts);
    if (jobs.length) appointmentsBooked += 1;
    if (quotes.length) quotesCreated += 1;
    const paidInvoices = db.invoices().filter((i) => i.customerId === link.targetId && i.paidAt && new Date(i.paidAt).getTime() >= ts);
    if (paidInvoices.length) { invoicePaid += 1; revenueInfluenced += paidInvoices.reduce((s, i) => s + (i.total || 0), 0); }
    if (!jobs.length && !quotes.length) followUpNeeded.push(link.targetId);
  });
  return { customersTargeted: links.length, appointmentsBooked, quotesCreated, invoicePaid, revenueInfluenced: round2(revenueInfluenced), followUpNeededCustomerIds: followUpNeeded };
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
  ensureCrmSegments();
  if (!db.activityEvents().length && !db.entityLinks().length) seedDemoLinks();
  seedCrmDemoData(); // independently idempotent (dedupeKey / exact-link-match) — safe to always run
}
// CRM sales-engine demo backfill: follow-up tasks for quotes that were
// already sent/declined before this session's workflow.js existed (so
// "overdue follow-up" / "due today" appear from real, already-backdated
// quote timestamps rather than always being 3/14 days from right now), and
// campaign_to_customer links for already-'sent' seeded campaigns (backdated
// to the campaign's own sentAt) so their existing metrics.booked/revenue
// numbers become traceable to real records via campaignAttribution().
export function seedCrmDemoData() {
  db.quotes().forEach((q) => {
    if (q.sentAt && ['sent', 'viewed', 'partially_approved'].includes(q.status)) {
      createFollowUpTask({
        title: `Follow up on ${q.quoteNumber}`, taskType: 'quote_follow_up', reason: 'Quote sent, awaiting customer response',
        customerId: q.customerId, relatedType: 'quote', relatedId: q.id, ownerId: q.advisorId,
        dueAt: new Date(new Date(q.sentAt).getTime() + 3 * 86400000).toISOString(),
        dedupeKey: `quote_followup_${q.id}`,
      });
    }
    if (q.status === 'declined' && q.declinedAt) {
      createFollowUpTask({
        title: `Declined-work follow-up — ${q.quoteNumber}`, taskType: 'declined_work', reason: 'Quote declined',
        customerId: q.customerId, relatedType: 'quote', relatedId: q.id, ownerId: q.advisorId,
        dueAt: new Date(new Date(q.declinedAt).getTime() + 14 * 86400000).toISOString(),
        dedupeKey: `quote_declined_followup_${q.id}`,
      });
    }
  });

  db.campaigns().filter((c) => c.status === 'sent' && c.sentAt).forEach((c) => {
    db.segmentMembers(c.segmentId).forEach((customer) => {
      linkEntities('campaign', c.id, 'customer', customer.id, 'campaign_to_customer', { createdAt: c.sentAt });
    });
  });
}
// Two segment kinds (no_show, unpaid_invoices) were added to lib/data.js's
// segmentMembers() switch without touching the large seed() function — their
// Segment records are added here instead, idempotently (checked by id).
export function ensureCrmSegments() {
  const segments = db.segments();
  const have = new Set(segments.map((s) => s.id));
  const toAdd = [
    { id: 'seg_no_show', name: 'No-Show Customers', criteria: { kind: 'no_show' }, computed: true, description: 'Real: has an RO marked no-show.' },
    { id: 'seg_unpaid', name: 'Unpaid Invoices', criteria: { kind: 'unpaid_invoices' }, computed: true, description: 'Real: has an invoice with a positive balance.' },
  ].filter((s) => !have.has(s.id));
  if (toAdd.length) db.saveSegments([...segments, ...toAdd]);
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
