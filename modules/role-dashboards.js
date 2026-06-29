// AutoBook — modules/role-dashboards.js
// One config per non-Owner App Permission Role, each describing its own
// dashboard using the shared widgets in modules/dashboard-widgets.js. Owner/
// Admin keeps the original rich dashboard (modules/dashboard.js's
// renderOwnerDashboard) — that dashboard is also the fallback for any role
// not listed here (or with no role at all), per the "safest version to
// preserve existing functionality" requirement.
//
// SECURITY/SCOPE NOTE: this entire file is demo/UI-only role filtering — it
// decides what to render in the browser based on the "View app as" demo
// switcher (settings.currentUserId). Real role enforcement must happen
// server-side after the Supabase/backend migration; nothing here is
// production access control.

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import {
  kpiCard, queueCard, tableCard, warningCard, quickActionCard,
  scheduleCard, financialSummaryCard,
} from './dashboard-widgets.js';

function customerName(id) { const c = db.customerById(id); return c ? `${c.firstName} ${c.lastName}` : '—'; }
function vehicleName(id) { const v = db.vehicleById(id); return v ? `${v.year} ${v.make} ${v.model}` : '—'; }
function jobTitle(j) { return `${j.ro} · ${customerName(j.customerId)}`; }
function jobSub(j) { return vehicleName(j.vehicleId); }

// ---------------------------------------------------------------------------
// General Manager — operations dashboard: appointments, active ROs, jobs
// waiting on approval/parts, team coverage, PTO, bottlenecks.
// ---------------------------------------------------------------------------
function buildGeneralManager() {
  const k = util.computeKPIs();
  const jobs = db.jobs();
  const waitingApproval = jobs.filter((j) => j.approvalStatus === 'pending');
  const waitingParts = jobs.filter((j) => j.status === 'on_hold' && j.approvalStatus !== 'pending');
  const techs = db.techs();
  const clockedIn = techs.filter((t) => t.clockStatus === 'in');
  const ptoPending = db.ptoRequests().filter((p) => p.status === 'pending');
  const flags = util.computeFlags();

  return `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      ${kpiCard({ label: 'Active Repair Orders', value: k.wipCount, color: 'blue' })}
      ${kpiCard({ label: 'Jobs Today (Open)', value: k.jobsTodayOpen, color: 'amber' })}
      ${kpiCard({ label: 'Waiting Approval', value: waitingApproval.length, color: 'amber' })}
      ${kpiCard({ label: 'Waiting on Parts', value: waitingParts.length, color: 'amber' })}
      ${kpiCard({ label: 'Team Coverage', value: `${clockedIn.length}/${techs.length}`, sub: 'techs clocked in', color: 'green' })}
      ${kpiCard({ label: 'PTO Pending', value: ptoPending.length, color: 'gray' })}
    </div>
    ${warningCard({ title: 'Shop warnings', items: flags.map((f) => ({ title: f.title })) })}
    <div class="grid-2" style="margin-bottom:var(--s4);align-items:start">
      ${queueCard({ title: 'Jobs waiting approval', items: waitingApproval.map((j) => ({ title: jobTitle(j), sub: jobSub(j), badge: 'pending', badgeClass: 'badge-amber' })), emptyText: 'Nothing waiting on customer approval.' })}
      ${queueCard({ title: 'Jobs waiting on parts', items: waitingParts.map((j) => ({ title: jobTitle(j), sub: jobSub(j), badge: 'on hold', badgeClass: 'badge-amber' })), emptyText: 'No parts-related holds right now.' })}
    </div>
    ${queueCard({ title: 'PTO / absence requests', items: ptoPending.map((p) => ({ title: `${db.employeeById(p.employeeId)?.firstName || ''} ${db.employeeById(p.employeeId)?.lastName || ''}`, sub: `${p.type} · ${util.fmtDate(p.startDate)}–${util.fmtDate(p.endDate)}`, badge: 'pending', badgeClass: 'badge-amber' })), emptyText: 'No pending time-off requests.' })}
    ${quickActionCard({ actions: [{ label: 'Team Schedule', href: 'team.html#schedule' }, { label: 'Repair Orders', href: 'repair-orders.html' }, { label: 'Reports', href: 'reports.html' }] })}
  `;
}

// ---------------------------------------------------------------------------
// Service Manager — shop floor & production: tech assignments, bay usage,
// overdue jobs, quality/final-inspection queue.
// ---------------------------------------------------------------------------
function buildServiceManager() {
  const jobs = db.jobs().filter((j) => !['done', 'invoiced', 'closed'].includes(j.status));
  const bays = db.bays();
  const inProgress = jobs.filter((j) => j.status === 'in_progress');
  const overdue = jobs.filter((j) => j.scheduledDate && j.scheduledDate < new Date().toISOString().slice(0, 10) && j.status !== 'ready');
  const qualityQueue = jobs.filter((j) => j.approvalStatus === 'pending');
  const byTech = {};
  jobs.forEach((j) => { if (j.techId) (byTech[j.techId] = byTech[j.techId] || []).push(j); });

  return `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      ${kpiCard({ label: 'In Progress', value: inProgress.length, color: 'blue' })}
      ${kpiCard({ label: 'Bays In Use', value: `${bays.filter((b) => jobs.some((j) => j.bayId === b.id)).length}/${bays.length}`, color: 'amber' })}
      ${kpiCard({ label: 'Overdue Jobs', value: overdue.length, color: 'red' })}
      ${kpiCard({ label: 'Quality Check Queue', value: qualityQueue.length, color: 'amber' })}
    </div>
    <div class="grid-2" style="margin-bottom:var(--s4);align-items:start">
      ${tableCard({
        title: 'Tech assignments', columns: [{ key: 'tech', label: 'Tech' }, { key: 'jobs', label: 'Active jobs' }, { key: 'bay', label: 'Bay' }],
        rows: Object.keys(byTech).map((techId) => { const t = db.employeeById(techId); const bay = db.bayById(t?.bayId); return { tech: t ? `${t.firstName} ${t.lastName}` : techId, jobs: byTech[techId].length, bay: bay?.name || '—' }; }),
        emptyText: 'No techs currently assigned to active jobs.',
      })}
      ${queueCard({ title: 'Overdue / delayed jobs', items: overdue.map((j) => ({ title: jobTitle(j), sub: jobSub(j), badge: util.statusMeta(j.status).label, badgeClass: util.statusMeta(j.status).badgeClass })), emptyText: 'Nothing running behind schedule.' })}
    </div>
    ${queueCard({ title: 'Quality check / final inspection queue', items: qualityQueue.map((j) => ({ title: jobTitle(j), sub: jobSub(j), badge: 'needs review', badgeClass: 'badge-amber' })), emptyText: 'No jobs waiting on final review.' })}
    ${quickActionCard({ actions: [{ label: 'Live Monitor', href: 'live_monitor.html' }, { label: 'Repair Orders', href: 'repair-orders.html' }, { label: 'Team Schedule', href: 'team.html#schedule' }] })}
  `;
}

// ---------------------------------------------------------------------------
// Service Advisor — customer-facing workflow: appointments, estimates,
// approvals, pickup list, invoices ready.
// ---------------------------------------------------------------------------
function buildServiceAdvisor(employee) {
  const today = new Date().toISOString().slice(0, 10);
  const myJobs = db.jobs().filter((j) => j.advisorId === employee.id);
  const apptsToday = db.bookings().filter((b) => b.preferredDate === today);
  const pendingApproval = myJobs.filter((j) => j.approvalStatus === 'pending');
  const readyForPickup = myJobs.filter((j) => j.status === 'ready');
  const quotesFollowUp = util.quotesNeedingFollowUp();

  return `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      ${kpiCard({ label: "Today's Appointments", value: apptsToday.length, color: 'blue' })}
      ${kpiCard({ label: 'Pending Approvals', value: pendingApproval.length, color: 'amber' })}
      ${kpiCard({ label: 'Ready for Pickup', value: readyForPickup.length, color: 'green' })}
      ${kpiCard({ label: 'Quotes Needing Follow-up', value: quotesFollowUp.length, color: 'amber' })}
    </div>
    <div class="grid-2" style="margin-bottom:var(--s4);align-items:start">
      ${queueCard({ title: "Today's appointments", items: apptsToday.map((b) => ({ title: `${b.preferredSlot || ''} · ${b.customer?.name || customerName(b.customerId)}`, sub: b.notes || '', badge: b.status, badgeClass: 'badge-blue' })), emptyText: 'No appointments today.' })}
      ${queueCard({ title: 'Pending customer approvals', items: pendingApproval.map((j) => ({ title: jobTitle(j), sub: jobSub(j), badge: 'pending', badgeClass: 'badge-amber' })), emptyText: 'Nothing waiting on a customer decision.' })}
    </div>
    ${queueCard({ title: 'Inspections to review', items: [], emptyText: 'No distinct digital-inspection queue exists yet — placeholder.', placeholder: true })}
    ${queueCard({ title: 'Ready for pickup / invoice', items: readyForPickup.map((j) => ({ title: jobTitle(j), sub: jobSub(j), badge: 'ready', badgeClass: 'badge-green' })), emptyText: 'Nothing ready for pickup right now.' })}
    ${quickActionCard({ actions: [{ label: 'New Quote', href: 'quotes.html' }, { label: 'Appointments', href: 'appointments.html' }, { label: 'Repair Orders', href: 'repair-orders.html' }] })}
  `;
}

// ---------------------------------------------------------------------------
// Front Desk — intake & basic customer workflow.
// ---------------------------------------------------------------------------
function buildFrontDesk() {
  const today = new Date().toISOString().slice(0, 10);
  const pending = db.pendingBookings();
  const checkedInToday = db.jobs().filter((j) => j.checkedInAt && j.checkedInAt.slice(0, 10) === today);
  const arrivingToday = db.bookings().filter((b) => b.preferredDate === today && b.status === 'confirmed');
  const waiting = db.jobs().filter((j) => j.status === 'waiting');

  return `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      ${kpiCard({ label: 'Booking Requests', value: pending.length, color: 'amber' })}
      ${kpiCard({ label: 'Checked In Today', value: checkedInToday.length, color: 'green' })}
      ${kpiCard({ label: 'Arriving Today', value: arrivingToday.length, color: 'blue' })}
      ${kpiCard({ label: 'Customers Waiting', value: waiting.length, color: 'amber' })}
    </div>
    <div class="grid-2" style="align-items:start">
      ${queueCard({ title: 'Booking requests', items: pending.map((b) => ({ title: b.customer?.name || customerName(b.customerId), sub: `${b.preferredDate || ''} ${b.preferredSlot || ''}`, badge: 'pending', badgeClass: 'badge-amber' })), emptyText: 'No pending booking requests.' })}
      ${queueCard({ title: 'Arriving today', items: arrivingToday.map((b) => ({ title: b.customer?.name || customerName(b.customerId), sub: `${b.preferredSlot || ''}`, badge: 'confirmed', badgeClass: 'badge-blue' })), emptyText: 'Nothing else scheduled to arrive today.' })}
    </div>
    ${queueCard({ title: 'No-shows', items: [], emptyText: 'No-show tracking is not a distinct field yet — placeholder.', placeholder: true })}
    ${quickActionCard({ actions: [{ label: 'Customer Lookup', href: 'crm.html' }, { label: 'Appointments', href: 'appointments.html' }] })}
  `;
}

// ---------------------------------------------------------------------------
// Technician / Apprentice — assigned work only.
// ---------------------------------------------------------------------------
function buildTechnician(employee, isApprentice) {
  const myJobs = db.jobs().filter((j) => j.techId === employee.id && !['done', 'invoiced', 'closed'].includes(j.status));
  const today = new Date().toISOString().slice(0, 10);
  const myShiftsToday = db.shiftsForEmployee(employee.id).filter((s) => s.date === today);
  const bay = db.bayById(employee.bayId);
  const mentor = employee.managerId ? db.employeeById(employee.managerId) : null;

  return `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      ${kpiCard({ label: 'My Assigned Jobs', value: myJobs.length, color: 'blue' })}
      ${kpiCard({ label: 'Bay', value: bay?.name || 'Unassigned', color: 'gray' })}
      ${kpiCard({ label: 'Time Clock', value: employee.clockStatus === 'in' ? 'Clocked In' : 'Clocked Out', color: employee.clockStatus === 'in' ? 'green' : 'gray' })}
    </div>
    ${queueCard({ title: 'My assigned repair orders', items: myJobs.map((j) => ({ title: jobTitle(j), sub: jobSub(j), badge: util.statusMeta(j.status).label, badgeClass: util.statusMeta(j.status).badgeClass })), emptyText: 'No jobs assigned to you right now.' })}
    ${scheduleCard({ title: "Today's schedule", rows: myShiftsToday.map((s) => ({ time: s.start, title: s.roleForShift || 'Shift', sub: `until ${s.end}` })), emptyText: 'No shift scheduled today.' })}
    ${queueCard({ title: isApprentice ? 'Inspection checklist items' : 'Job notes needing attention', items: [], emptyText: 'No distinct checklist/notes queue exists yet — placeholder.', placeholder: true })}
    ${isApprentice
      ? queueCard({ title: 'Mentor / lead tech', items: mentor ? [{ title: `${mentor.firstName} ${mentor.lastName}`, sub: mentor.jobTitle || '' }] : [], emptyText: 'No mentor assigned yet.' })
      : ''}
    ${isApprentice ? queueCard({ title: 'Training', items: [], emptyText: 'Training/certification tracking is a placeholder — not built yet.', placeholder: true }) : ''}
    ${quickActionCard({ actions: [{ label: 'My Repair Orders', href: 'repair-orders.html' }, { label: 'My Schedule', href: 'team.html#schedule' }] })}
  `;
}

// ---------------------------------------------------------------------------
// Parts / Inventory — reuses the real InventoryOps dashboard metrics.
// ---------------------------------------------------------------------------
function buildParts() {
  const m = util.inventoryDashboardMetrics();
  const suggestions = util.reorderSuggestions();
  const openPOs = db.purchaseOrders().filter((po) => po.status === 'open');
  const pendingReturns = db.returns().filter((r) => r.status === 'pending');
  const transfersOpen = db.inventoryTransfers().filter((t) => t.status !== 'received' && t.status !== 'canceled');

  return `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      ${kpiCard({ label: 'Low Stock Items', value: m.lowStockCount, color: 'amber' })}
      ${kpiCard({ label: 'Open Purchase Orders', value: m.openPOCount, color: 'blue' })}
      ${kpiCard({ label: 'Items On Order', value: m.itemsOnOrder, color: 'blue' })}
      ${kpiCard({ label: 'Pending Returns', value: m.pendingReturns, color: 'amber' })}
      ${kpiCard({ label: 'Transfers In Progress', value: transfersOpen.length, color: 'gray' })}
      ${kpiCard({ label: 'Cycle Counts Due', value: m.cycleCountsDue, color: 'gray' })}
    </div>
    <div class="grid-2" style="margin-bottom:var(--s4);align-items:start">
      ${queueCard({ title: 'Reorder suggestions', items: suggestions.map((s) => ({ title: s.part.name, sub: `${s.totalAvailable} available`, badge: `order ${s.suggestedQty}`, badgeClass: 'badge-amber' })), emptyText: 'Nothing needs reordering.' })}
      ${queueCard({ title: 'Open purchase orders', items: openPOs.map((po) => ({ title: po.number, sub: db.supplierById(po.supplierId)?.name || '', badge: po.status, badgeClass: 'badge-blue' })), emptyText: 'No open purchase orders.' })}
    </div>
    ${queueCard({ title: 'Returns / cores awaiting disposition', items: pendingReturns.map((r) => ({ title: r.number, sub: db.partById(r.partId)?.name || '', badge: 'pending', badgeClass: 'badge-amber' })), emptyText: 'No pending returns.' })}
    ${quickActionCard({ actions: [{ label: 'Inventory', href: 'inventory.html' }, { label: 'Purchase Orders', href: 'inventory.html#purchase-orders' }, { label: 'Transfers', href: 'inventory.html#transfers' }] })}
  `;
}

// ---------------------------------------------------------------------------
// Bookkeeper / Finance.
// ---------------------------------------------------------------------------
function buildBookkeeper() {
  const invoices = db.invoices();
  const unpaid = invoices.filter((i) => i.status !== 'paid');
  const today = new Date().toISOString().slice(0, 10);
  const paidToday = invoices.filter((i) => i.status === 'paid' && (i.paidAt || '').slice(0, 10) === today);
  const unpaidTotal = unpaid.reduce((s, i) => s + (i.total || 0), 0);
  const paidTodayTotal = paidToday.reduce((s, i) => s + (i.total || 0), 0);

  return `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      ${kpiCard({ label: 'Unpaid Invoices', value: unpaid.length, sub: util.fmtMoney0(unpaidTotal), color: 'amber' })}
      ${kpiCard({ label: 'Paid Today', value: paidToday.length, sub: util.fmtMoney0(paidTodayTotal), color: 'green' })}
      ${kpiCard({ label: 'Refunds', value: '—', sub: 'placeholder', color: 'gray' })}
      ${kpiCard({ label: 'Deposits', value: '—', sub: 'placeholder', color: 'gray' })}
    </div>
    ${queueCard({ title: 'Unpaid invoices', items: unpaid.map((i) => ({ title: `Invoice ${i.id}`, sub: customerName(i.customerId), badge: util.fmtMoney(i.total), badgeClass: 'badge-amber' })), emptyText: 'No unpaid invoices.' })}
    ${financialSummaryCard({ title: 'AR aging', rows: [{ label: '0–30 / 31–60 / 61–90+ days', value: 'placeholder' }], placeholder: true })}
    ${financialSummaryCard({ title: 'Daily closeout & accounting export', rows: [{ label: 'QuickBooks / Xero / Sage export', value: 'placeholder' }], placeholder: true })}
    ${quickActionCard({ actions: [{ label: 'Invoices', href: 'invoices.html' }, { label: 'Reports', href: 'reports.html' }] })}
  `;
}

// ---------------------------------------------------------------------------
// Marketing / CRM.
// ---------------------------------------------------------------------------
function buildMarketing() {
  const campaigns = db.campaigns();
  const drafts = campaigns.filter((c) => c.status === 'draft');
  const segments = db.segments();
  const declinedWork = db.jobs().filter((j) => j.approvalStatus === 'declined');
  const suggestions = util.suggestedCampaigns();

  return `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      ${kpiCard({ label: 'Campaign Drafts', value: drafts.length, color: 'blue' })}
      ${kpiCard({ label: 'Segments', value: segments.length, color: 'gray' })}
      ${kpiCard({ label: 'Declined Work Follow-ups', value: declinedWork.length, color: 'amber' })}
      ${kpiCard({ label: 'Review Requests', value: '—', sub: 'placeholder', color: 'gray' })}
    </div>
    <div class="grid-2" style="margin-bottom:var(--s4);align-items:start">
      ${queueCard({ title: 'Campaign drafts', items: drafts.map((c) => ({ title: c.name, sub: c.type || '', badge: 'draft', badgeClass: 'badge-gray' })), emptyText: 'No drafts in progress.' })}
      ${queueCard({ title: 'Suggested campaigns', items: suggestions.map((s) => ({ title: s.name, sub: `${s.audienceSize} potential recipient${s.audienceSize === 1 ? '' : 's'}`, badge: 'suggested', badgeClass: 'badge-blue' })), emptyText: 'No suggestions right now.' })}
    </div>
    ${queueCard({ title: 'Declined work — follow up', items: declinedWork.map((j) => ({ title: jobTitle(j), sub: jobSub(j), badge: 'declined', badgeClass: 'badge-red' })), emptyText: 'No declined work to follow up on.' })}
    ${queueCard({ title: 'Lapsed customers / email-SMS preview queue', items: [], emptyText: 'Lapsed-customer detection and a send-preview queue are placeholders — not built yet.', placeholder: true })}
    ${quickActionCard({ actions: [{ label: 'Campaigns', href: 'marketing.html' }, { label: 'CRM Segments', href: 'crm.html' }] })}
  `;
}

// ---------------------------------------------------------------------------
// Viewer / Read Only — counts only, no dollar figures, no action buttons.
// ---------------------------------------------------------------------------
function buildViewer() {
  const k = util.computeKPIs();
  const today = new Date().toISOString().slice(0, 10);
  const apptsToday = db.bookings().filter((b) => b.preferredDate === today);

  return `
    <div class="alert alert-amber" style="margin-bottom:var(--s4)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>
      <div>View-only — no edit, delete, approve, or export actions are shown for this role.</div>
    </div>
    <div class="grid-3" style="margin-bottom:var(--s4)">
      ${kpiCard({ label: 'Jobs Today (Open)', value: k.jobsTodayOpen, color: 'blue' })}
      ${kpiCard({ label: "Today's Appointments", value: apptsToday.length, color: 'blue' })}
      ${kpiCard({ label: 'Active Repair Orders', value: k.wipCount, color: 'gray' })}
    </div>
    ${queueCard({ title: 'Today at a glance', items: db.jobs().filter((j) => j.scheduledDate === today).map((j) => ({ title: jobTitle(j), sub: jobSub(j), badge: util.statusMeta(j.status).label, badgeClass: util.statusMeta(j.status).badgeClass })), emptyText: 'Nothing scheduled today.' })}
  `;
}

// ---------------------------------------------------------------------------
const ROLE_DASHBOARDS = {
  general_manager: { title: 'General Manager Dashboard', subtitle: 'Operations across the shop — appointments, active ROs, approvals, parts holds, and team coverage.', build: buildGeneralManager },
  service_manager: { title: 'Service Manager Dashboard', subtitle: 'Shop floor & production — tech assignments, bay usage, overdue jobs, and the quality check queue.', build: buildServiceManager },
  advisor: { title: 'Service Advisor Dashboard', subtitle: "Today's customer workflow — appointments, approvals, and pickups.", build: buildServiceAdvisor },
  front_desk: { title: 'Front Desk Dashboard', subtitle: 'Intake, check-ins, and booking requests.', build: buildFrontDesk },
  technician: { title: 'My Dashboard', subtitle: 'Your assigned work, schedule, and time clock.', build: (e) => buildTechnician(e, false) },
  apprentice: { title: 'My Dashboard', subtitle: 'Your assigned work, training, and schedule.', build: (e) => buildTechnician(e, true) },
  parts: { title: 'Parts / Inventory Dashboard', subtitle: 'Stock health, purchase orders, transfers, and returns.', build: buildParts },
  bookkeeper: { title: 'Bookkeeper / Finance Dashboard', subtitle: 'Invoices, payments, and accounting placeholders.', build: buildBookkeeper },
  marketing: { title: 'Marketing / CRM Dashboard', subtitle: 'Campaigns, segments, and follow-ups.', build: buildMarketing },
  viewer: { title: 'Dashboard (View Only)', subtitle: 'A safe, read-only summary.', build: buildViewer },
};

export function hasRoleDashboard(roleId) {
  return !!ROLE_DASHBOARDS[roleId];
}

// Renders into the existing .page-body element; pageBodyEl's previous content
// (the Owner dashboard's many specific #ids) is fully replaced — safe because
// this only ever runs for non-Owner roles, never touching the Owner path.
export function renderRoleDashboard(pageBodyEl, roleId, employee) {
  const config = ROLE_DASHBOARDS[roleId];
  if (!config) return false;
  pageBodyEl.innerHTML = config.build(employee);
  return true;
}

export function roleDashboardMeta(roleId) {
  return ROLE_DASHBOARDS[roleId] || null;
}
