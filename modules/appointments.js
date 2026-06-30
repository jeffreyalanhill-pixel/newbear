// Torklio — modules/appointments.js
// Appointments Scheduler: Daily Shop Workflow Board alongside the time-grid
// Calendar view. Real data sources: db.jobs/db.bookings/db.employees/
// db.bays/db.settings via util.* RO/booking transitions.

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import { renderNav, toast, confirmDialog } from '../lib/nav.js';
import {
  ensureTimingFields, getTimingStatus, getElapsedWorkMinutes, getEstimatedMinutes,
  getScheduleDeltaMinutes, formatDuration, formatTimestamp, stampTimingEvent,
} from '../lib/timing.js';

let selectedDate = new Date().toISOString().slice(0, 10);
let viewMode = 'day'; // day | week | month
let dayMode = 'workflow'; // workflow | calendar (Day view only)
let filterStatus = '';
let filterSearch = '';
let filterTech = '';
let filterBay = '';
let filterType = '';
let timingInterval = null; // single board-refresh interval for live in-progress timers

// ---------------------------------------------------------------------------
// Adapter: normalize a RepairOrder/job into the calendar's appointment shape
// ---------------------------------------------------------------------------
function deriveAppointmentType(job) {
  if (job.status === 'cancelled') return job.noShow ? 'no_show' : 'cancelled';
  if (job.status === 'ready' || job.status === 'invoiced' || job.status === 'closed') return 'ready';
  if (job.status === 'on_hold') return job.approvalStatus === 'pending' ? 'waiting_approval' : 'waiting_parts';
  if (job.status === 'in_progress') return job.stage === 'inspection' ? 'diagnostic' : 'in_progress';
  if (job.status === 'waiting') return job.visitType === 'wait' ? 'wait' : 'drop_off';
  return 'scheduled';
}
const APPT_TYPE_META = {
  diagnostic: { label: 'Diagnostic / Inspection', color: '#F59E0B' },
  drop_off: { label: 'Drop-off', color: '#7C3AED' },
  wait: { label: 'Wait at shop', color: '#2563EB' },
  waiting_approval: { label: 'Waiting Approval', color: '#FBBF24' },
  waiting_parts: { label: 'Waiting Parts', color: '#FB923C' },
  in_progress: { label: 'In Progress', color: '#6366F1' },
  ready: { label: 'Ready / Finished', color: '#16A34A' },
  scheduled: { label: 'Scheduled / Confirmed', color: '#94A3B8' },
  cancelled: { label: 'Cancelled', color: '#EF4444' },
  no_show: { label: 'No-Show', color: '#EF4444' },
};

// §2/§4 — workflow-board stage, a SEPARATE (but related) classification from
// the calendar's appointment "type" above. approvalStatus is checked before
// job.status so "Mark Waiting Approval" (util.requestApproval, which never
// touches status) correctly moves a card here regardless of its status.
function deriveWorkflowStage(job) {
  if (job.status === 'cancelled') return job.noShow ? 'no_show' : 'cancelled';
  if (['closed', 'invoiced'].includes(job.status)) return 'completed';
  if (job.status === 'ready') return 'ready_pickup';
  if (job.approvalStatus === 'pending') return 'waiting_approval';
  if (job.status === 'on_hold') return job.holdReason === 'parts_ordered' ? 'waiting_parts' : 'waiting_approval';
  if (job.status === 'in_progress') return 'in_progress';
  if (job.status === 'waiting') return 'dropped_off';
  return 'estimates_requests'; // scheduled-but-not-checked-in, or a raw pending booking
}
const WORKFLOW_STAGES = [
  { id: 'estimates_requests', label: 'Estimates / Requests', color: '#2563EB' },
  { id: 'dropped_off', label: 'Dropped Off', color: '#7C3AED' },
  { id: 'waiting_approval', label: 'Waiting Approval', color: '#F59E0B' },
  { id: 'waiting_parts', label: 'Waiting Parts', color: '#FB923C' },
  { id: 'in_progress', label: 'In Progress', color: '#6366F1' },
  { id: 'quality_check', label: 'Quality Check', color: '#8B5CF6' },
  { id: 'ready_pickup', label: 'Ready for Pickup', color: '#16A34A' },
  { id: 'completed', label: 'Completed / Closed', color: '#94A3B8' },
];
const STAGE_META = Object.fromEntries(WORKFLOW_STAGES.map((s) => [s.id, s]));
STAGE_META.cancelled = { id: 'cancelled', label: 'Canceled', color: '#EF4444' };
STAGE_META.no_show = { id: 'no_show', label: 'No-Show', color: '#94A3B8' };
// Stage -> the real util.* transition that produces it, used by both drag-drop
// and the drawer's "Move Stage" buttons so neither path can drift from the
// other or from the real status machine. Picks the transition based on the
// job's CURRENT real status (not just the target), so backward moves and
// same-column drops resolve correctly instead of throwing the wrong guard.
function moveToStage(jobId, stageId) {
  let job = db.jobById(jobId);
  if (!job) throw new Error('Appointment not found');

  // deriveWorkflowStage checks approvalStatus BEFORE status, so a card stuck
  // in Waiting Approval would silently snap back there on the next render
  // unless this gets cleared first whenever dragging it anywhere else.
  if (job.approvalStatus === 'pending' && stageId !== 'waiting_approval') {
    util.resolveApproval(jobId, true);
    job = db.jobById(jobId);
  }

  switch (stageId) {
    case 'dropped_off':
      if (job.status === 'waiting') return job; // already here
      if (job.status === 'scheduled') return util.checkIn(jobId);
      if (job.status === 'in_progress') return util.returnToWaiting(jobId);
      throw new Error(`Can't move ${job.ro} back to Dropped Off from "${job.status}".`);
    case 'in_progress':
      if (job.status === 'in_progress') return job; // already here (e.g. just cleared an approval)
      if (['waiting', 'on_hold'].includes(job.status)) return util.startJob(jobId, job.bayId, job.techId);
      throw new Error(`${job.ro} has to be checked in (Dropped Off) before it can start.`);
    case 'waiting_parts':
      if (job.status === 'on_hold' && job.holdReason === 'parts_ordered') return job; // already here
      if (job.status === 'in_progress') return util.holdJob(jobId, 'parts_ordered');
      throw new Error(`${job.ro} has to be In Progress before it can wait on parts.`);
    case 'waiting_approval':
      return util.requestApproval(jobId);
    case 'ready_pickup':
      if (job.status === 'ready') return job; // already here
      if (job.status === 'in_progress') return util.markReady(jobId);
      throw new Error(`${job.ro} has to be In Progress before it can be marked ready.`);
    case 'quality_check':
      throw new Error('Quality Check isn\'t a tracked stage yet — there\'s no backing status for it.');
    case 'completed':
      throw new Error('Completed jobs are closed via Invoices, not moved here directly.');
    case 'estimates_requests':
      throw new Error('Cards leave Estimates/Requests by checking in — they don\'t move back into it.');
    default:
      throw new Error(`Can't move directly to "${STAGE_META[stageId]?.label || stageId}".`);
  }
}

function normalizeAppointment(job) {
  const c = db.customerById(job.customerId);
  const v = db.vehicleById(job.vehicleId);
  const tech = job.techId ? db.employeeById(job.techId) : null;
  const bay = job.bayId ? db.bayById(job.bayId) : null;
  const services = (job.lineItems || []).filter((l) => l.type === 'service').map((l) => l.name);
  return {
    id: job.id,
    date: job.scheduledDate,
    startTime: job.scheduledTime,
    duration: (job.lineItems || []).reduce((sum, l) => sum + (l.hours || 0), 0) * 60 || 60,
    customerName: util.customerName(c),
    vehicleLabel: util.vehicleLabel(v),
    roNumber: job.ro,
    services,
    status: job.status,
    appointmentType: deriveAppointmentType(job),
    workflowStage: deriveWorkflowStage(job),
    visitType: job.visitType || null,
    total: job.total || 0,
    techId: job.techId || null,
    techName: tech ? `${tech.firstName} ${tech.lastName}` : '',
    bayId: job.bayId || null,
    bayName: bay ? bay.name : '',
    sourceType: 'job',
    sourceId: job.id,
    _job: job,
  };
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------
function currentEmployee() {
  return db.employeeById(db.settings().currentUserId);
}
function accessLevel() {
  const role = currentEmployee()?.role;
  return util.moduleAccessForRole(role).access['Appointments'] || 'none';
}
function can(action) {
  return util.actionsForAccessLevel(accessLevel()).includes(action);
}
function isSchedulingAdmin() {
  return ['owner', 'general_manager', 'service_manager'].includes(currentEmployee()?.role);
}
function canDrag() {
  return ['owner', 'general_manager', 'service_manager', 'advisor', 'front_desk'].includes(currentEmployee()?.role) && can('edit');
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------
function visibleJobs() {
  const jobs = db.jobs();
  const role = currentEmployee()?.role;
  if (['technician', 'apprentice'].includes(role)) {
    const me = currentEmployee();
    return jobs.filter((j) => j.techId === me.id);
  }
  return jobs;
}

function dayAbbrev(dateStr) {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(dateStr + 'T00:00:00').getDay()];
}
function shopHoursFor(dateStr) {
  const hrs = db.settings().hours?.[dayAbbrev(dateStr)];
  if (!hrs || hrs.closed) return { open: '07:00', close: '18:00', closed: !!hrs?.closed };
  return hrs;
}

// §10 — capacity/data-quality warnings, including the two new ones (ready
// but not invoiced, completed but unpaid) added for the workflow board.
function getWarnings(appt, allApptsSameDay) {
  const warnings = [];
  const job = appt._job;
  const active = ['waiting', 'in_progress', 'on_hold', 'ready'];
  if (active.includes(appt.status)) {
    if (!appt.techId) warnings.push('No technician assigned');
    if (!appt.bayId) warnings.push('No bay assigned');
  }
  const others = allApptsSameDay.filter((a) => a.id !== appt.id);
  if (appt.techId && others.some((a) => a.techId === appt.techId && a.startTime === appt.startTime)) warnings.push('Technician double-booked');
  if (appt.bayId && others.some((a) => a.bayId === appt.bayId && a.startTime === appt.startTime)) warnings.push('Bay double-booked');
  const hours = shopHoursFor(appt.date);
  if (hours.closed) warnings.push('Outside shop hours — shop closed this day');
  else if (appt.startTime && (appt.startTime < hours.open || appt.startTime >= hours.close)) warnings.push('Outside shop hours');
  const dailyCap = Math.max(db.bays().length, 1) * 8;
  if (allApptsSameDay.length > dailyCap) warnings.push('Over daily appointment cap (heuristic)');
  if (job?.status === 'ready' && !job.invoiceId) warnings.push('Ready but not invoiced');
  if (['invoiced', 'closed'].includes(job?.status)) {
    const inv = job.invoiceId ? db.invoiceById(job.invoiceId) : null;
    if (inv && inv.balance > 0) warnings.push('Completed but unpaid');
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export function renderAppointments() {
  try {
    renderNav('#icon-rail', 'appointments.html');
    document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();

    if (accessLevel() === 'none') {
      document.getElementById('scheduler-root').style.display = 'none';
      document.getElementById('locked-mount').innerHTML = `
        <div class="locked">
          <div class="lock-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg></div>
          <div style="font-weight:700;font-size:var(--t-md);margin-top:var(--s2)">No access to Appointments</div>
          <div class="muted" style="margin-top:4px">Your current role doesn't have access to the scheduler.</div>
        </div>`;
      return;
    }
    if (!isSchedulingAdmin()) document.getElementById('admin-section').style.display = 'none';

    document.getElementById('cal-date').value = selectedDate;
    document.getElementById('cal-date').addEventListener('change', (e) => { selectedDate = e.target.value; updateDateLabel(); renderSchedule(); });
    document.getElementById('filter-status').addEventListener('change', (e) => { filterStatus = e.target.value; renderSchedule(); });
    document.getElementById('filter-search').addEventListener('input', (e) => { filterSearch = e.target.value; renderSchedule(); });
    document.getElementById('filter-tech').addEventListener('change', (e) => { filterTech = e.target.value; renderSchedule(); });
    document.getElementById('filter-bay').addEventListener('change', (e) => { filterBay = e.target.value; renderSchedule(); });
    document.getElementById('filter-type').addEventListener('change', (e) => { filterType = e.target.value; renderSchedule(); });

    const techSelect = document.getElementById('filter-tech');
    db.employees().filter((e) => e.isTech).forEach((t) => techSelect.insertAdjacentHTML('beforeend', `<option value="${t.id}">${t.firstName} ${t.lastName}</option>`));
    const baySelect = document.getElementById('filter-bay');
    db.bays().forEach((b) => baySelect.insertAdjacentHTML('beforeend', `<option value="${b.id}">${b.name}</option>`));

    ['day', 'week', 'month'].forEach((mode) => {
      document.getElementById(`view-${mode}`).addEventListener('click', () => {
        viewMode = mode;
        document.querySelectorAll('#scheduler-root .sched2-viewbtns button[id^="view-"]').forEach((b) => b.classList.remove('active'));
        document.getElementById(`view-${mode}`).classList.add('active');
        document.getElementById('day-mode-row').style.display = mode === 'day' ? '' : 'none';
        updateDateLabel();
        renderSchedule();
      });
    });
    document.getElementById('view-day').classList.add('active');

    ['workflow', 'calendar'].forEach((mode) => {
      document.getElementById(`daymode-${mode}`).addEventListener('click', () => {
        dayMode = mode;
        document.querySelectorAll('#day-mode-row button').forEach((b) => b.classList.remove('active'));
        document.getElementById(`daymode-${mode}`).classList.add('active');
        renderSchedule();
      });
    });
    document.getElementById('daymode-workflow').classList.add('active');

    renderSummary();
    renderPending();
    renderWaitlist();
    updateDateLabel();
    renderSchedule();
    renderLegend();
    if (isSchedulingAdmin()) renderAdmin();

    // Live timer: refresh workflow board every 60s so in-progress elapsed times
    // and timing badges update without a manual refresh. One interval per page load.
    if (timingInterval) clearInterval(timingInterval);
    timingInterval = setInterval(() => {
      if (viewMode === 'day' && dayMode === 'workflow') renderDayWorkflowView();
    }, 60000);

    // Overlay click-away and Escape key dismiss — wired once per page load.
    wireDrawerDismiss();
  } catch (e) {
    console.error('Error in renderAppointments:', e);
    toast('Something went wrong rendering the scheduler — see console.', 'error');
  }
}

window.goToday = () => { selectedDate = new Date().toISOString().slice(0, 10); document.getElementById('cal-date').value = selectedDate; updateDateLabel(); renderSchedule(); };
window.goPrevious = () => shiftDate(-1);
window.goNext = () => shiftDate(1);
function shiftDate(dir) {
  const d = new Date(selectedDate + 'T00:00:00');
  if (viewMode === 'day') d.setDate(d.getDate() + dir);
  else if (viewMode === 'week') d.setDate(d.getDate() + dir * 7);
  else d.setMonth(d.getMonth() + dir);
  selectedDate = d.toISOString().slice(0, 10);
  document.getElementById('cal-date').value = selectedDate;
  updateDateLabel();
  renderSchedule();
}

function updateDateLabel() {
  const d = new Date(selectedDate + 'T00:00:00');
  let label;
  if (viewMode === 'day') label = util.fmtDate(selectedDate, 'long');
  else if (viewMode === 'week') {
    const start = new Date(d); start.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const end = new Date(start); end.setDate(start.getDate() + 6);
    label = `${util.fmtDate(start.toISOString().slice(0, 10))} – ${util.fmtDate(end.toISOString().slice(0, 10))}`;
  } else label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
  document.getElementById('date-label').textContent = label;
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------
function renderSummary() {
  const today = new Date().toISOString().slice(0, 10);
  const todays = visibleJobs().filter((j) => j.scheduledDate === today);
  const cards = [
    { label: 'Today', value: todays.length, sub: 'Appointments today' },
    { label: 'Pending Requests', value: db.pendingBookings().length, sub: 'Awaiting confirm' },
    { label: 'Confirmed', value: todays.filter((j) => j.status === 'scheduled').length, sub: 'Not checked in yet' },
    { label: 'Checked In', value: todays.filter((j) => j.status === 'waiting').length, sub: 'Waiting on a bay' },
    { label: 'In Progress', value: todays.filter((j) => j.status === 'in_progress').length, sub: 'Active jobs' },
    { label: 'No-Show / Cancelled', value: todays.filter((j) => j.status === 'cancelled').length, sub: 'Today' },
  ];
  document.getElementById('summary-cards').innerHTML = cards.map((c) => `
    <div class="card" style="padding:var(--s4)">
      <div style="font-size:var(--t-13);color:var(--ink-3);margin-bottom:6px">${c.label}</div>
      <div style="font-size:var(--t-2xl);font-weight:800;color:var(--ink)">${c.value}</div>
      <div style="font-size:var(--t-13);color:var(--ink-3)">${c.sub}</div>
    </div>`).join('');
}

// ---------------------------------------------------------------------------
// Pending requests panel (side panel) — confirming one re-renders the board
// so it shows up immediately in Estimates/Requests.
// ---------------------------------------------------------------------------
function renderPending() {
  const pending = db.pendingBookings().slice().sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  document.getElementById('pending-count').textContent = pending.length;
  const body = document.getElementById('pending-body');
  if (!pending.length) {
    body.innerHTML = `<div class="empty" style="padding:var(--s5)"><div class="empty-title">No pending requests</div><div class="empty-sub">New booking requests will appear here.</div></div>`;
    return;
  }
  body.innerHTML = pending.map((b) => {
    const services = (b.serviceIds || []).map((id) => db.serviceById(id)?.name).filter(Boolean).join(', ') || 'No services listed';
    const slot = /^\d{2}:\d{2}$/.test(b.preferredSlot) ? util.fmtTime(b.preferredSlot) : b.preferredSlot;
    return `
      <div class="sched2-pending-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-weight:700">${b.customer.name || 'Customer not assigned'}</div>
            <div class="muted" style="font-size:var(--t-13)">${b.vehicle.year || ''} ${b.vehicle.make || ''} ${b.vehicle.model || ''}</div>
          </div>
          <span class="badge badge-amber">Pending</span>
        </div>
        <div class="muted" style="font-size:var(--t-13);margin:6px 0">${services}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:var(--s3)">
          <span class="badge badge-gray">${util.fmtDate(b.preferredDate)} · ${slot}</span>
          <span class="badge badge-gray">${util.visitTypeLabel(b.vehicle.visitType)}</span>
          ${b.couponCode ? `<span class="badge badge-purple">${b.couponCode}</span>` : ''}
        </div>
        ${can('create') ? `
        <div style="display:flex;gap:var(--s2)">
          <button class="btn btn-primary btn-sm" data-confirm-booking="${b.id}">Confirm</button>
          <button class="btn btn-secondary btn-sm" data-decline-booking="${b.id}">Decline</button>
        </div>` : ''}
      </div>`;
  }).join('');

  body.querySelectorAll('[data-confirm-booking]').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        // util.confirmBooking already guards against a second RO from the
        // same booking (throws if booking.roId is already set).
        util.confirmBooking(btn.dataset.confirmBooking);
        toast('Booking confirmed and placed on the board', 'success');
        renderAll();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
  body.querySelectorAll('[data-decline-booking]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog('Decline this booking request?', { confirmLabel: 'Decline' });
      if (!ok) return;
      util.declineBooking(btn.dataset.declineBooking);
      toast('Booking declined', 'success');
      renderAll();
    });
  });
}

function renderWaitlist() {
  document.getElementById('waitlist-body').innerHTML = `
    <div class="empty" style="padding:var(--s5)">
      <div class="empty-title">No waitlist data source yet</div>
      <div class="empty-sub">Waitlist tracking isn't wired up to a real data source in this build — placeholder only.</div>
    </div>`;
}
function renderAll() {
  renderSummary();
  renderPending();
  renderSchedule();
}

// ---------------------------------------------------------------------------
// Filtering shared by every view
// ---------------------------------------------------------------------------
function filteredAppointments(jobs) {
  let list = jobs.filter((j) => !(j.status === 'cancelled' && filterStatus && filterStatus !== 'cancelled')).map(normalizeAppointment);
  if (filterStatus) list = list.filter((a) => a.status === filterStatus);
  if (filterTech) list = list.filter((a) => a.techId === filterTech);
  if (filterBay) list = list.filter((a) => a.bayId === filterBay);
  if (filterType) list = list.filter((a) => a.visitType === filterType);
  if (filterSearch) {
    const q = filterSearch.toLowerCase();
    list = list.filter((a) => a.roNumber?.toLowerCase().includes(q) || a.customerName?.toLowerCase().includes(q) || a.vehicleLabel?.toLowerCase().includes(q));
  }
  return list;
}

function renderSchedule() {
  if (viewMode === 'day') (dayMode === 'workflow' ? renderDayWorkflowView() : renderDayCalendarView());
  else if (viewMode === 'week') renderWeekView();
  else renderMonthView();
}

// ---------------------------------------------------------------------------
// DAY — Workflow View (default): 8 status-stage columns, real drag/drop for
// manager-tier roles (mirrors the same dragstart/drop pattern already proven
// in modules/dashboard.js's Live Jobs kanban — same real transitions, just
// more columns).
// ---------------------------------------------------------------------------
function renderDayWorkflowView() {
  const calBody = document.getElementById('cal-body');
  const todaysJobs = visibleJobs().filter((j) => j.scheduledDate === selectedDate);
  const appts = filteredAppointments(todaysJobs);
  const allApptsToday = todaysJobs.map(normalizeAppointment);

  // Pending bookings for this date double as "Estimates / Requests" cards —
  // they're not jobs yet, so they're rendered separately, not through
  // normalizeAppointment/filteredAppointments.
  const role = currentEmployee()?.role;
  const pendingForDay = role === 'parts' ? [] : db.pendingBookings().filter((b) => b.preferredDate === selectedDate);

  const stagesToShow = role === 'parts' ? WORKFLOW_STAGES.filter((s) => s.id === 'waiting_parts') : WORKFLOW_STAGES;

  const byStage = {};
  stagesToShow.forEach((s) => { byStage[s.id] = appts.filter((a) => a.workflowStage === s.id); });

  // ── Timing summary row ───────────────────────────────────────────────────────
  const tNow = new Date();
  const tCounts = { on_schedule: 0, watch: 0, behind: 0, overdue: 0, late: 0, dropped_off: 0 };
  appts.forEach((a) => {
    const ts = getTimingStatus(ensureTimingFields({ ...a._job }), tNow);
    if (ts in tCounts) tCounts[ts]++;
  });
  const tTotal = Object.values(tCounts).reduce((s, n) => s + n, 0);
  const summaryChips = [
    tCounts.on_schedule > 0 ? `<span class="badge badge-green">${tCounts.on_schedule} on schedule</span>` : '',
    tCounts.dropped_off > 0 ? `<span class="badge badge-amber">${tCounts.dropped_off} checked in</span>` : '',
    tCounts.watch > 0       ? `<span class="badge badge-amber">${tCounts.watch} watch</span>` : '',
    tCounts.behind > 0      ? `<span class="badge" style="background:#FEF2E2;color:#C2410C">${tCounts.behind} behind</span>` : '',
    tCounts.overdue > 0     ? `<span class="badge badge-red">${tCounts.overdue} overdue</span>` : '',
    tCounts.late > 0        ? `<span class="badge badge-red">${tCounts.late} late check-in</span>` : '',
  ].filter(Boolean).join('');
  const timingSummaryHtml = tTotal > 0
    ? `<div style="display:flex;gap:var(--s2);flex-wrap:wrap;align-items:center;margin-bottom:var(--s3);padding:var(--s2) 0">
        <span style="font-size:var(--t-xs);color:var(--ink-3);font-weight:600;text-transform:uppercase;letter-spacing:.04em">Today's timing:</span>
        ${summaryChips}
       </div>`
    : '';

  let html = timingSummaryHtml + `<div class="wfb-board">`;
  stagesToShow.forEach((stage) => {
    const items = byStage[stage.id] || [];
    const extraPending = stage.id === 'estimates_requests' ? pendingForDay : [];
    const total = items.length + extraPending.length;
    html += `
      <div class="wfb-col" data-stage="${stage.id}" style="border-top-color:${stage.color}">
        <div class="wfb-col-head">
          <span class="wfb-col-title">${stage.label}</span>
          <span class="row" style="gap:6px">
            <span class="badge badge-gray">${total}</span>
            <button class="icon-btn" style="width:22px;height:22px" title="More (placeholder)" data-col-menu="${stage.id}">⋯</button>
          </span>
        </div>
        ${extraPending.map(pendingCardHtml).join('')}
        ${items.length ? items.map((a) => workflowCardHtml(a, allApptsToday)).join('') : (!extraPending.length ? `<div class="empty-sub" style="font-size:var(--t-13);padding:var(--s3) 0">Nothing here.</div>` : '')}
      </div>`;
  });
  html += `</div>`;
  calBody.innerHTML = html;

  document.querySelectorAll('[data-col-menu]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); toast('Column actions — placeholder, coming soon.'); }));
  bindApptCards(calBody);
  bindPendingCards(calBody);
  if (canDrag()) wireDragDrop(calBody);
  else calBody.querySelectorAll('.wfb-card').forEach((c) => { c.removeAttribute('draggable'); });
}

function pendingCardHtml(b) {
  const services = (b.serviceIds || []).map((id) => db.serviceById(id)?.name).filter(Boolean).join(', ') || 'No service listed';
  return `
    <div class="wfb-card" data-pending-id="${b.id}" style="border-left-color:${STAGE_META.estimates_requests.color}">
      <div style="font-weight:700">${b.customer?.name || 'Customer not assigned'}</div>
      <div class="muted">${[b.vehicle?.year, b.vehicle?.make, b.vehicle?.model].filter(Boolean).join(' ') || 'Vehicle not assigned'}</div>
      <div class="muted">${services}</div>
      <span class="badge badge-amber" style="margin-top:4px">Pending request</span>
    </div>`;
}
function bindPendingCards(root) {
  root.querySelectorAll('[data-pending-id]').forEach((card) => {
    card.addEventListener('click', (e) => {
      // Don't trigger on nested button clicks (buttons inside the drawer, not on the card itself,
      // but guard here in case any future child elements are added to the card html).
      if (e.target.closest('button')) return;
      openPendingDrawer(card.dataset.pendingId);
    });
  });
}

function openPendingDrawer(bookingId) {
  const b = db.pendingBookings().find((x) => x.id === bookingId);
  if (!b) { toast('Pending request not found.', 'error'); return; }

  const services = (b.serviceIds || []).map((id) => db.serviceById(id)?.name).filter(Boolean).join(', ') || 'No services listed';
  const slot = /^\d{2}:\d{2}$/.test(b.preferredSlot) ? util.fmtTime(b.preferredSlot) : (b.preferredSlot || '—');
  const vehicle = [b.vehicle?.year, b.vehicle?.make, b.vehicle?.model].filter(Boolean).join(' ') || 'Vehicle not assigned';
  const visitType = b.vehicle?.visitType ? util.visitTypeLabel(b.vehicle.visitType) : null;

  document.getElementById('drawer-title').textContent = `Pending request — ${b.customer?.name || 'Customer not assigned'}`;
  document.getElementById('drawer-body').innerHTML = `
    <div class="stack">
      <div class="row between"><span class="muted">Status</span><span class="badge badge-amber">Pending request</span></div>
      <div class="row between"><span class="muted">Customer</span><span>${b.customer?.name || '—'}</span></div>
      ${b.customer?.phone ? `<div class="row between"><span class="muted">Phone</span><span>${b.customer.phone}</span></div>` : ''}
      ${b.customer?.email ? `<div class="row between"><span class="muted">Email</span><span>${b.customer.email}</span></div>` : ''}
      <div class="row between"><span class="muted">Vehicle</span><span>${vehicle}</span></div>
      <div class="row between"><span class="muted">Requested service</span><span>${services}</span></div>
      <div class="row between"><span class="muted">Preferred date</span><span>${util.fmtDate(b.preferredDate)}</span></div>
      <div class="row between"><span class="muted">Preferred time</span><span>${slot}</span></div>
      ${visitType ? `<div class="row between"><span class="muted">Visit type</span><span>${visitType}</span></div>` : ''}
      ${b.couponCode ? `<div class="row between"><span class="muted">Coupon</span><span class="badge badge-purple">${b.couponCode}</span></div>` : ''}
      ${b.source ? `<div class="row between"><span class="muted">Source</span><span>${b.source}</span></div>` : ''}
      ${b.notes ? `<div><div class="muted" style="margin-bottom:4px">Notes</div><div style="background:var(--canvas);border-radius:var(--r-md);padding:var(--s3);font-size:var(--t-13)">${b.notes}</div></div>` : ''}
      <div class="alert" style="background:var(--canvas);border:1px solid var(--rule);border-radius:var(--r-md);padding:var(--s3);font-size:var(--t-13);color:var(--ink-3)">
        This request has not been confirmed yet. Confirm it to add it to the workflow board.
      </div>
      <div class="section-label">Actions</div>
      <div class="row wrapf" style="gap:var(--s2)">
        ${can('create') ? `<button class="btn btn-primary btn-sm" id="pd-confirm">Confirm Request</button>` : ''}
        <button class="btn btn-secondary btn-sm" id="pd-view-panel">View Pending Requests</button>
        <button class="btn btn-secondary btn-sm" id="pd-close">Dismiss</button>
      </div>
    </div>`;

  document.getElementById('pd-confirm')?.addEventListener('click', () => {
    try {
      util.confirmBooking(bookingId);
      toast('Booking confirmed and placed on the board', 'success');
      closeDrawer();
      renderAll();
    } catch (e) { toast(e.message, 'error'); }
  });
  document.getElementById('pd-view-panel')?.addEventListener('click', () => {
    closeDrawer();
    document.getElementById('pending-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('pd-close')?.addEventListener('click', closeDrawer);

  document.getElementById('appt-drawer-overlay').classList.add('open');
}

// Timing badge meta: maps getTimingStatus() return values → badge display
const TIMING_BADGE_META = {
  on_schedule:      { cls: 'badge-green',  label: 'On schedule' },
  watch:            { cls: 'badge-amber',  label: 'Watch' },
  behind:           { cls: '',             label: 'Behind',           style: 'background:#FEF2E2;color:#C2410C' },
  overdue:          { cls: 'badge-red',    label: 'Overdue' },
  on_time:          { cls: 'badge-green',  label: 'On time' },
  late:             { cls: 'badge-red',    label: 'Late' },
  early:            { cls: 'badge-gray',   label: 'Early' },
  upcoming:         { cls: 'badge-gray',   label: 'Upcoming' },
  waiting_approval: { cls: 'badge-amber',  label: 'Waiting approval' },
  waiting_parts:    { cls: 'badge-amber',  label: 'Waiting parts' },
  dropped_off:      { cls: 'badge-amber',  label: 'Checked in' },
  completed:        { cls: 'badge-green',  label: 'Done' },
  no_data:          null,
};
const PROGRESS_BAR_COLOR = { on_schedule: 'var(--green)', watch: 'var(--amber)', behind: '#FB923C', overdue: 'var(--red)' };

function workflowCardHtml(a, allApptsSameDay) {
  const meta = STAGE_META[a.workflowStage] || STAGE_META.estimates_requests;
  const svc = a.services[0] ? a.services[0] + (a.services.length > 1 ? ` +${a.services.length - 1}` : '') : 'No service listed';
  const job = a._job;
  const quote = job.quoteId ? db.quoteById(job.quoteId) : null;
  const invoice = job.invoiceId ? db.invoiceById(job.invoiceId) : null;
  const warnings = getWarnings(a, allApptsSameDay);

  // ── Timing ──────────────────────────────────────────────────────────────────
  const tj      = ensureTimingFields({ ...job });
  const cardNow = new Date();
  const tStatus = getTimingStatus(tj, cardNow);
  const tbadge  = TIMING_BADGE_META[tStatus] || null;
  const elapsed = getElapsedWorkMinutes(tj, cardNow);
  const estMins = getEstimatedMinutes(tj);
  const schedTime = tj.scheduledStartAt
    ? formatTimestamp(tj.scheduledStartAt)
    : (job.scheduledTime ? util.fmtTime(job.scheduledTime) : null);
  const arrivedAt   = tj.checkedInAt || tj.droppedOffAt;
  const arrivedTime = arrivedAt ? formatTimestamp(arrivedAt) : null;
  const inProgress  = job.status === 'in_progress' && tj.workStartedAt;
  const pct = inProgress && estMins > 0 ? Math.min(100, Math.round((elapsed / estMins) * 100)) : null;
  const barColor = PROGRESS_BAR_COLOR[tStatus] || 'var(--accent)';

  const timingRow = (schedTime || tbadge)
    ? `<div class="row between" style="margin-top:4px">
        ${schedTime ? `<span class="muted" style="font-size:var(--t-xs)">Sched ${schedTime}</span>` : '<span></span>'}
        ${tbadge ? `<span class="badge ${tbadge.cls}" style="font-size:10px;${tbadge.style || ''}">${tbadge.label}</span>` : ''}
       </div>`
    : '';
  const arrivedRow = arrivedTime
    ? `<div class="muted" style="font-size:var(--t-xs);margin-top:1px">Arrived ${arrivedTime}</div>`
    : '';
  const progressBlock = pct !== null
    ? `<div class="row between" style="margin-top:4px">
        <span class="muted" style="font-size:var(--t-xs)">${formatDuration(elapsed)} / ${formatDuration(estMins)}</span>
        <span class="muted" style="font-size:var(--t-xs)">${pct}%</span>
       </div>
       <div style="height:4px;background:var(--rule);border-radius:2px;margin-top:3px;overflow:hidden">
         <div style="height:100%;width:${pct}%;background:${barColor};border-radius:2px"></div>
       </div>`
    : '';

  return `
    <div class="wfb-card" draggable="true" data-appt-id="${a.id}" style="border-left-color:${meta.color}">
      <div class="row between"><span class="strong">${a.roNumber || 'RO pending'}</span>${a.startTime ? `<span class="muted tnum" style="font-size:var(--t-xs)">${util.fmtTime(a.startTime)}</span>` : ''}</div>
      <div>${a.customerName || 'Customer not assigned'}</div>
      <div class="muted">${a.vehicleLabel || 'Vehicle not assigned'}</div>
      <div class="muted">${svc}</div>
      <div class="row between" style="margin-top:4px">
        <span class="badge ${util.statusMeta(a.status).badgeClass}" style="font-size:10px">${util.statusMeta(a.status).label}</span>
        ${a.visitType ? `<span class="badge badge-gray" style="font-size:10px">${util.visitTypeLabel(a.visitType)}</span>` : ''}
      </div>
      <div class="muted" style="font-size:var(--t-xs);margin-top:4px">${a.techName || 'Unassigned tech'} · ${a.bayName || 'No bay assigned'}</div>
      <div class="row between" style="margin-top:4px">
        <span class="tnum" style="font-size:var(--t-xs)">${a.total ? util.fmtMoney(a.total) : 'No estimated total'}</span>
        ${quote ? `<span class="badge ${util.quoteStatusMeta(quote.status).badgeClass}" style="font-size:10px">${util.quoteStatusMeta(quote.status).label}</span>` : ''}
        ${invoice ? `<span class="badge ${invoice.balance > 0 ? 'badge-amber' : 'badge-green'}" style="font-size:10px">${invoice.balance > 0 ? 'Balance due' : 'Paid'}</span>` : ''}
      </div>
      ${timingRow}
      ${arrivedRow}
      ${progressBlock}
      ${warnings.length ? `<div class="wfb-warn">⚠ ${warnings[0]}${warnings.length > 1 ? ` +${warnings.length - 1} more` : ''}</div>` : ''}
    </div>`;
}

function bindApptCards(root) {
  root.querySelectorAll('[data-appt-id]').forEach((card) => {
    card.addEventListener('click', () => openDrawer(card.dataset.apptId));
  });
}

// Same drag/drop pattern already proven in modules/dashboard.js's Live Jobs
// kanban: dragstart/dragend toggle a class, the column handles drop and
// calls a real util.* transition via moveToStage(). Invalid moves (e.g. into
// Quality Check, or a transition the status machine doesn't allow) just
// toast the real error instead of silently failing.
function wireDragDrop(root) {
  root.querySelectorAll('.wfb-card[data-appt-id]').forEach((card) => {
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
  root.querySelectorAll('.wfb-col').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('dragover'); });
    col.addEventListener('dragleave', () => col.classList.remove('dragover'));
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('dragover');
      const dragging = root.querySelector('.wfb-card.dragging');
      if (!dragging) return;
      try {
        moveToStage(dragging.dataset.apptId, col.dataset.stage);
        toast('Moved.', 'success');
      } catch (err) { toast(err.message, 'error'); }
      renderAll();
    });
  });
}

// ---------------------------------------------------------------------------
// DAY — Calendar View: time slots x technician/bay columns (unchanged logic
// from modules/appointments.js, kept as the secondary daily mode).
// ---------------------------------------------------------------------------
function renderDayCalendarView() {
  const calBody = document.getElementById('cal-body');
  const dayAppts = filteredAppointments(visibleJobs().filter((j) => j.scheduledDate === selectedDate));

  if (!dayAppts.length) {
    calBody.innerHTML = `<div class="empty" style="padding:var(--s8)"><div class="empty-title">Nothing scheduled</div><div class="empty-sub">No appointments on ${util.fmtDate(selectedDate)}.</div></div>`;
    return;
  }
  const techs = db.employees().filter((e) => e.isTech);
  const bays = db.bays();
  let columns, colKind;
  if (techs.length) { columns = techs; colKind = 'tech'; }
  else if (bays.length) { columns = bays; colKind = 'bay'; }
  else { columns = [{ id: null, name: 'Shop Schedule' }]; colKind = 'shop'; }

  const hours = shopHoursFor(selectedDate);
  const [startHr] = (hours.closed ? '07:00' : hours.open).split(':').map(Number);
  const [endHr] = (hours.closed ? '18:00' : hours.close).split(':').map(Number);
  const slots = [];
  for (let h = startHr; h < endHr; h++) { slots.push(`${String(h).padStart(2, '0')}:00`); slots.push(`${String(h).padStart(2, '0')}:30`); }

  let html = `<div class="sched2-day-grid" style="grid-template-columns:80px repeat(${columns.length},minmax(160px,1fr))">`;
  html += `<div style="background:var(--canvas);padding:var(--s2)"></div>`;
  columns.forEach((col) => {
    const colAppts = colKind === 'tech' ? dayAppts.filter((a) => a.techId === col.id) : colKind === 'bay' ? dayAppts.filter((a) => a.bayId === col.id) : dayAppts;
    const overbooked = colAppts.length > 8;
    const name = colKind === 'shop' ? col.name : colKind === 'tech' ? `${col.firstName} ${col.lastName}` : col.name;
    html += `<div style="background:var(--canvas);padding:var(--s2);text-align:center">
      <div style="font-weight:700;font-size:var(--t-13)">${name}</div>
      <div style="font-size:var(--t-xs);color:var(--ink-3)">${colAppts.length} appt${colAppts.length === 1 ? '' : 's'} ${overbooked ? '<span class="badge badge-red" style="margin-left:4px">Busy</span>' : ''}</div>
    </div>`;
  });
  slots.forEach((slot) => {
    html += `<div style="background:var(--canvas);padding:6px;font-size:var(--t-xs);font-weight:600;color:var(--ink-3);text-align:center">${util.fmtTime(slot)}</div>`;
    columns.forEach((col) => {
      const cellAppts = dayAppts.filter((a) => {
        const matches = colKind === 'tech' ? a.techId === col.id : colKind === 'bay' ? a.bayId === col.id : true;
        return matches && (a.startTime || '').startsWith(slot.substring(0, 4));
      });
      html += `<div style="background:var(--card);padding:4px;min-height:54px">`;
      cellAppts.forEach((a) => { html += calendarCardHtml(a); });
      if (!cellAppts.length) html += `<div style="color:var(--ink-4);font-size:var(--t-xs);padding:4px">—</div>`;
      html += `</div>`;
    });
  });
  html += `</div>`;
  calBody.innerHTML = html;
  bindApptCards(calBody);
}
function calendarCardHtml(a) {
  const meta = APPT_TYPE_META[a.appointmentType] || APPT_TYPE_META.scheduled;
  const svc = a.services[0] ? a.services[0] + (a.services.length > 1 ? ` +${a.services.length - 1}` : '') : 'No service listed';
  return `
    <div class="sched2-card" data-appt-id="${a.id}" style="border-left-color:${meta.color}">
      <div style="font-weight:700;font-size:var(--t-13)">${a.roNumber || ''} ${a.startTime ? util.fmtTime(a.startTime) : ''}</div>
      <div style="color:var(--ink-2)">${a.customerName || 'Customer not assigned'}</div>
      <div class="muted">${a.vehicleLabel || 'Vehicle not assigned'}</div>
      <div class="muted">${svc}</div>
      <span class="badge ${util.statusMeta(a.status).badgeClass}" style="margin-top:4px">${util.statusMeta(a.status).label}</span>
    </div>`;
}

// ---------------------------------------------------------------------------
// WEEK — unchanged from modules/appointments.js
// ---------------------------------------------------------------------------
function renderWeekView() {
  const calBody = document.getElementById('cal-body');
  const d = new Date(selectedDate + 'T00:00:00');
  const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => { const x = new Date(monday); x.setDate(monday.getDate() + i); return x.toISOString().slice(0, 10); });
  const weekJobs = visibleJobs().filter((j) => weekDays.includes(j.scheduledDate));
  const appts = filteredAppointments(weekJobs);
  const today = new Date().toISOString().slice(0, 10);

  let html = `<div class="sched2-week-grid">`;
  weekDays.forEach((dateStr) => {
    const dayAppts = appts.filter((a) => a.date === dateStr).sort((x, y) => (x.startTime || '').localeCompare(y.startTime || ''));
    html += `<div class="sched2-week-day${dateStr === today ? ' today' : ''}" style="${dateStr === today ? 'border-color:var(--accent);border-width:2px' : ''}">
      <div style="font-weight:700;font-size:var(--t-13);text-align:center;border-bottom:1px solid var(--rule);padding-bottom:6px;margin-bottom:6px">
        ${util.fmtDate(dateStr).split(',')[0]}<br><span class="muted">${dateStr.slice(5)}</span>
      </div>
      ${dayAppts.length ? dayAppts.map(calendarCardHtml).join('') : `<div class="muted" style="font-size:var(--t-xs);text-align:center">No appts</div>`}
    </div>`;
  });
  html += `</div>`;
  calBody.innerHTML = html;
  bindApptCards(calBody);
}

// ---------------------------------------------------------------------------
// MONTH — unchanged from modules/appointments.js
// ---------------------------------------------------------------------------
function renderMonthView() {
  const calBody = document.getElementById('cal-body');
  const d = new Date(selectedDate + 'T00:00:00');
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
  const gridStart = new Date(monthStart); gridStart.setDate(monthStart.getDate() - ((monthStart.getDay() + 6) % 7));
  const today = new Date().toISOString().slice(0, 10);
  const appts = filteredAppointments(visibleJobs());

  let html = `<div class="sched2-month-grid">`;
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((lbl) => { html += `<div style="background:var(--canvas);padding:6px;text-align:center;font-weight:700;font-size:var(--t-xs)">${lbl}</div>`; });
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(gridStart); cellDate.setDate(gridStart.getDate() + i);
    const cellStr = cellDate.toISOString().slice(0, 10);
    const inMonth = cellDate.getMonth() === d.getMonth();
    const cellAppts = appts.filter((a) => a.date === cellStr);
    const colors = [...new Set(cellAppts.map((a) => (APPT_TYPE_META[a.appointmentType] || APPT_TYPE_META.scheduled).color))].slice(0, 3);
    html += `<div class="sched2-month-cell${!inMonth ? ' other-month' : ''}${cellStr === today ? ' today' : ''}" data-date="${cellStr}">
      <div style="font-size:var(--t-13);font-weight:600">${cellDate.getDate()}</div>
      ${cellAppts.length ? `<div style="font-size:var(--t-xs);color:var(--ink-3)">${cellAppts.length} appt${cellAppts.length === 1 ? '' : 's'}</div>` : ''}
      <div style="display:flex;gap:3px;margin-top:4px">${colors.map((c) => `<span style="width:8px;height:8px;border-radius:2px;background:${c};display:inline-block"></span>`).join('')}</div>
    </div>`;
  }
  html += `</div>`;
  calBody.innerHTML = html;
  calBody.querySelectorAll('[data-date]').forEach((cell) => {
    cell.addEventListener('click', () => {
      selectedDate = cell.dataset.date;
      viewMode = 'day';
      document.getElementById('cal-date').value = selectedDate;
      document.querySelectorAll('#scheduler-root .sched2-viewbtns button[id^="view-"]').forEach((b) => b.classList.remove('active'));
      document.getElementById('view-day').classList.add('active');
      document.getElementById('day-mode-row').style.display = '';
      updateDateLabel();
      renderSchedule();
    });
  });
}

// ---------------------------------------------------------------------------
// Color legend
// ---------------------------------------------------------------------------
function renderLegend() {
  const items = viewMode === 'day' && dayMode === 'workflow'
    ? [...WORKFLOW_STAGES, STAGE_META.cancelled]
    : Object.values(APPT_TYPE_META).filter((m, i, arr) => arr.findIndex((x) => x.label === m.label) === i && m.label !== 'Cancelled');
  document.getElementById('legend').innerHTML = items.map((m) => `<div class="sched2-legend-item"><span class="sched2-chip" style="background:${m.color}"></span>${m.label}</div>`).join('');
}

// ---------------------------------------------------------------------------
// Appointment detail drawer
// ---------------------------------------------------------------------------
function openDrawer(jobId) {
  const job = db.jobById(jobId);
  if (!job) return;
  const a = normalizeAppointment(job);
  const c = db.customerById(job.customerId);
  const advisor = job.advisorId ? db.employeeById(job.advisorId) : null;
  const sameDayAppts = visibleJobs().filter((j) => j.scheduledDate === job.scheduledDate).map(normalizeAppointment);
  const warnings = getWarnings(a, sameDayAppts);
  const quote = job.quoteId ? db.quoteById(job.quoteId) : null;
  const invoice = job.invoiceId ? db.invoiceById(job.invoiceId) : null;
  const meta = util.statusMeta(job.status);
  const stageMeta = STAGE_META[a.workflowStage] || STAGE_META.estimates_requests;

  // ── Timing data for drawer ──────────────────────────────────────────────────
  const tj       = ensureTimingFields({ ...job });
  const drawerNow = new Date();
  const tStatus  = getTimingStatus(tj, drawerNow);
  const tbadge   = TIMING_BADGE_META[tStatus] || null;
  const elapsed  = getElapsedWorkMinutes(tj, drawerNow);
  const estMins  = getEstimatedMinutes(tj);
  const pct      = job.status === 'in_progress' && tj.workStartedAt && estMins > 0
    ? Math.min(100, Math.round((elapsed / estMins) * 100)) : null;
  const barColor = PROGRESS_BAR_COLOR[tStatus] || 'var(--accent)';

  const timingRows = [
    ['Scheduled',     tj.scheduledStartAt ? formatTimestamp(tj.scheduledStartAt) : (job.scheduledTime ? util.fmtTime(job.scheduledTime) : '—')],
    ['Est. duration', formatDuration(estMins)],
    ['Checked in',    tj.checkedInAt || tj.droppedOffAt ? formatTimestamp(tj.checkedInAt || tj.droppedOffAt) : '—'],
    ['Work started',  formatTimestamp(tj.workStartedAt)],
    ['Work paused',   formatTimestamp(tj.workPausedAt)],
    ['Paused total',  tj.totalPausedMinutes > 0 ? formatDuration(tj.totalPausedMinutes) : '—'],
    ['Elapsed',       tj.workStartedAt ? formatDuration(elapsed) : '—'],
    ['Work completed',formatTimestamp(tj.workCompletedAt)],
    ['Ready at',      formatTimestamp(tj.readyAt)],
    ['Picked up',     formatTimestamp(tj.pickedUpAt)],
  ].map(([lbl, val]) => `<div class="row between" style="font-size:var(--t-13)"><span class="muted">${lbl}</span><span>${val}</span></div>`).join('');

  const progressHtml = pct !== null
    ? `<div class="row between" style="margin-top:var(--s2);font-size:var(--t-13)">
        <span class="muted">Progress</span>
        <span>${formatDuration(elapsed)} / ${formatDuration(estMins)} (${pct}%)</span>
       </div>
       <div style="height:6px;background:var(--rule);border-radius:3px;margin-top:6px;overflow:hidden">
         <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width .3s"></div>
       </div>`
    : '';

  const historyHtml = tj.timingHistory.length
    ? tj.timingHistory.map((h) => `
        <div class="tl-item">
          <div class="tl-dot"></div>
          <div class="tl-body">
            <div class="tl-title">${h.label}</div>
            <div class="tl-meta">${util.fmtDateTime ? util.fmtDateTime(h.at) : h.at}</div>
          </div>
        </div>`).join('')
    : `<div class="tl-item"><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">No timing events recorded yet</div></div></div>`;

  document.getElementById('drawer-title').textContent = `${job.ro || 'Appointment'} — ${a.customerName || 'Customer not assigned'}`;
  document.getElementById('drawer-body').innerHTML = `
    <div class="stack">
      <div class="row between"><span class="muted">Customer</span><span>${a.customerName || 'Customer not assigned'}</span></div>
      ${c?.phone ? `<div class="row between"><span class="muted">Phone</span><span>${c.phone}</span></div>` : ''}
      ${c?.email ? `<div class="row between"><span class="muted">Email</span><span>${c.email}</span></div>` : ''}
      <div class="row between"><span class="muted">Vehicle</span><span>${a.vehicleLabel || 'Vehicle not assigned'}</span></div>
      <div class="row between"><span class="muted">Services</span><span>${a.services.join(', ') || 'No service listed'}</span></div>
      <div class="row between"><span class="muted">Date / Time</span><span>${util.fmtDate(a.date)} · ${a.startTime ? util.fmtTime(a.startTime) : '—'}</span></div>
      <div class="row between"><span class="muted">Duration</span><span>~${Math.round(a.duration)} min</span></div>
      <div class="row between"><span class="muted">Workflow Stage</span><span class="badge" style="background:${stageMeta.color}22;color:${stageMeta.color}">${stageMeta.label}</span></div>
      <div class="row between"><span class="muted">Exact Status</span><span class="badge ${meta.badgeClass}">${meta.label}</span></div>
      ${tbadge ? `<div class="row between"><span class="muted">Timing</span><span class="badge ${tbadge.cls}" style="${tbadge.style || ''}">${tbadge.label}</span></div>` : ''}
      <div class="row between"><span class="muted">Advisor</span><span>${advisor ? `${advisor.firstName} ${advisor.lastName}` : '—'}</span></div>
      <div class="row between"><span class="muted">Technician</span><span>${a.techName || 'Unassigned tech'}</span></div>
      <div class="row between"><span class="muted">Bay</span><span>${a.bayName || 'No bay assigned'}</span></div>
      <div class="row between"><span class="muted">Linked Quote</span><span>${quote ? `${quote.quoteNumber} (${util.quoteStatusMeta(quote.status).label})` : 'No quote linked'}</span></div>
      <div class="row between"><span class="muted">Approval Status</span><span>${job.approvalStatus ? job.approvalStatus : 'Not applicable'}</span></div>
      <div class="row between"><span class="muted">Linked Invoice</span><span>${invoice ? `${invoice.number} (${invoice.balance > 0 ? 'balance due' : 'paid'})` : 'No invoice linked'}</span></div>
      ${job.notes ? `<div><div class="muted" style="margin-bottom:4px">Notes</div><div style="background:var(--canvas);border-radius:var(--r-md);padding:var(--s3);font-size:var(--t-13)">${job.notes}</div></div>` : ''}
      ${warnings.length ? `<div class="alert alert-amber">⚠ ${warnings.join(' · ')}</div>` : ''}
      <div class="section-label">Timing</div>
      ${timingRows}
      ${progressHtml}
      <div class="section-label">Timing Actions</div>
      <div class="row wrapf" style="gap:var(--s2)">
        ${can('edit') && !tj.checkedInAt && !tj.droppedOffAt ? `<button class="btn btn-secondary btn-sm" id="drawer-stamp-checkin">Stamp Check-in</button>` : ''}
        ${can('edit') && job.status === 'in_progress' && !tj.workStartedAt ? `<button class="btn btn-secondary btn-sm" id="drawer-stamp-start">Stamp Work Started</button>` : ''}
        ${can('edit') && job.status === 'in_progress' && tj.workStartedAt && !tj.workPausedAt ? `<button class="btn btn-secondary btn-sm" id="drawer-stamp-pause">Pause</button>` : ''}
        ${can('edit') && job.status === 'in_progress' && tj.workPausedAt ? `<button class="btn btn-secondary btn-sm" id="drawer-stamp-resume">Resume</button>` : ''}
        ${can('edit') && ['ready', 'invoiced'].includes(job.status) && !tj.pickedUpAt ? `<button class="btn btn-secondary btn-sm" id="drawer-stamp-pickup">Mark Picked Up</button>` : ''}
      </div>
      <div class="section-label">Timing History</div>
      <div class="timeline">${historyHtml}</div>
      <div class="section-label">Activity</div>
      <div class="timeline"><div class="tl-item"><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">Created</div><div class="tl-meta">${util.fmtDateTime(job.createdAt)}</div></div></div></div>
      <div class="section-label">Actions</div>
      <div class="row wrapf" style="gap:var(--s2)">
        ${can('edit') && !util.isROLocked(job) ? `<button class="btn btn-secondary btn-sm" id="drawer-reschedule">Reschedule</button>` : ''}
        ${can('edit') && job.status === 'scheduled' ? `<button class="btn btn-primary btn-sm" id="drawer-checkin">Check In</button>` : ''}
        ${can('edit') && job.approvalStatus !== 'pending' ? `<button class="btn btn-secondary btn-sm" id="drawer-waiting-approval">Mark Waiting Approval</button>` : ''}
        ${can('edit') && job.status === 'in_progress' ? `<button class="btn btn-secondary btn-sm" id="drawer-waiting-parts">Mark Waiting Parts</button>` : ''}
        ${can('edit') && ['waiting', 'on_hold'].includes(job.status) ? `<button class="btn btn-secondary btn-sm" id="drawer-in-progress">Mark In Progress</button>` : ''}
        ${can('edit') && job.status === 'in_progress' ? `<button class="btn btn-secondary btn-sm" id="drawer-ready">Mark Ready for Pickup</button>` : ''}
        ${can('delete') && job.status === 'scheduled' ? `<button class="btn btn-secondary btn-sm" id="drawer-noshow">Mark No-Show</button>` : ''}
        ${can('delete') && !util.isROLocked(job) ? `<button class="btn btn-danger btn-sm" id="drawer-cancel">Cancel</button>` : ''}
        <button class="btn btn-secondary btn-sm" id="drawer-open-ro">Open Repair Order</button>
        <button class="btn btn-secondary btn-sm" id="drawer-open-quote">${quote ? 'Open Quote' : 'Create Quote'}</button>
        <button class="btn btn-secondary btn-sm" id="drawer-open-invoice">${invoice ? 'Open Invoice' : 'Create Invoice'}</button>
        <button class="btn btn-secondary btn-sm" id="drawer-reminder">Send Reminder Preview</button>
      </div>
    </div>`;

  const run = (fn, msg) => { try { fn(); toast(msg, 'success'); closeDrawer(); renderAll(); } catch (e) { toast(e.message, 'error'); } };
  const stamp = (eventType, force = false) => { try { stampTimingEvent(job.id, eventType, force); } catch (e) { /* non-fatal */ } };

  document.getElementById('drawer-reschedule')?.addEventListener('click', () => openRescheduleModal(job.id));
  // Check In: stamp checked_in / dropped_off timing event alongside workflow transition
  document.getElementById('drawer-checkin')?.addEventListener('click', () => {
    run(() => {
      util.checkIn(job.id);
      stamp(job.visitType === 'drop_off' ? 'dropped_off' : 'checked_in');
    }, 'Checked in');
  });
  document.getElementById('drawer-waiting-approval')?.addEventListener('click', () => run(() => util.requestApproval(job.id), 'Marked waiting approval'));
  document.getElementById('drawer-waiting-parts')?.addEventListener('click', () => run(() => moveToStage(job.id, 'waiting_parts'), 'Marked waiting on parts'));
  // Mark In Progress: stamp work_started timing event alongside workflow transition
  document.getElementById('drawer-in-progress')?.addEventListener('click', () => {
    run(() => {
      util.startJob(job.id, job.bayId, job.techId);
      stamp('work_started');
    }, 'Marked in progress');
  });
  // Mark Ready: stamp work_completed + ready timing events
  document.getElementById('drawer-ready')?.addEventListener('click', () => {
    run(() => {
      util.markReady(job.id);
      stamp('work_completed');
      stamp('ready');
    }, 'Marked ready for pickup');
  });

  // ── Timing-only actions (no workflow status change) ──────────────────────────
  document.getElementById('drawer-stamp-checkin')?.addEventListener('click', () => {
    stamp(job.visitType === 'drop_off' ? 'dropped_off' : 'checked_in');
    toast('Check-in time recorded', 'success'); closeDrawer(); renderAll();
  });
  document.getElementById('drawer-stamp-start')?.addEventListener('click', () => {
    stamp('work_started');
    toast('Work start time recorded', 'success'); closeDrawer(); renderAll();
  });
  document.getElementById('drawer-stamp-pause')?.addEventListener('click', () => {
    stamp('work_paused', true);
    toast('Work paused — timer suspended', 'success'); closeDrawer(); renderAll();
  });
  document.getElementById('drawer-stamp-resume')?.addEventListener('click', () => {
    stamp('work_resumed', true);
    toast('Work resumed — timer running', 'success'); closeDrawer(); renderAll();
  });
  document.getElementById('drawer-stamp-pickup')?.addEventListener('click', () => {
    stamp('picked_up');
    toast('Picked-up time recorded', 'success'); closeDrawer(); renderAll();
  });
  document.getElementById('drawer-noshow')?.addEventListener('click', () => markNoShow(job.id));
  document.getElementById('drawer-cancel')?.addEventListener('click', async () => {
    const ok = await confirmDialog(`Cancel ${job.ro}?`, { confirmLabel: 'Cancel appointment' });
    if (!ok) return;
    run(() => util.cancelRO(job.id), 'Appointment cancelled');
  });
  document.getElementById('drawer-open-ro')?.addEventListener('click', () => toast('Opens the full Repair Order workflow — placeholder, not wired to repair-orders.html in this build.'));
  document.getElementById('drawer-open-quote')?.addEventListener('click', () => toast(quote ? `Opens ${quote.quoteNumber} in Quotes — placeholder, not wired to quotes.html in this build.` : 'Create Quote — placeholder, not wired to the Quotes builder in this build.'));
  document.getElementById('drawer-open-invoice')?.addEventListener('click', () => toast(invoice ? `Opens ${invoice.number} in Invoices — placeholder, not wired to invoices.html in this build.` : 'Create Invoice — placeholder; an invoice can only be created once the RO is ready, from the Invoices module.'));
  document.getElementById('drawer-reminder')?.addEventListener('click', () => {
    const preview = util.buildROEmailPreview(job.id);
    toast(`Reminder preview — To: ${preview.to || 'no email on file'} · "${preview.subject}"`);
  });

  document.getElementById('appt-drawer-overlay').classList.add('open');
}
window.closeDrawer = closeDrawer;
function closeDrawer() { document.getElementById('appt-drawer-overlay').classList.remove('open'); }

// Wire overlay click-away and Escape key once per page load.
// Guard via data attribute so repeated renderAppointments() calls don't stack listeners.
function wireDrawerDismiss() {
  const overlay = document.getElementById('appt-drawer-overlay');
  if (!overlay || overlay.dataset.dismissWired) return;
  overlay.dataset.dismissWired = '1';

  // Click on the backdrop (not inside the .drawer panel) closes the drawer.
  // e.target === overlay is true only when clicking the dark backdrop itself,
  // not when clicking any child element inside .drawer.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDrawer();
  });

  // Escape key closes while open.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeDrawer();
  });
}

function markNoShow(jobId) {
  try {
    util.cancelRO(jobId);
    const jobs = db.jobs();
    const j = jobs.find((x) => x.id === jobId);
    if (j) { j.noShow = true; db.saveJobs(jobs); }
    toast('Marked as no-show', 'success');
    closeDrawer();
    renderAll();
  } catch (e) { toast(e.message, 'error'); }
}

// ---------------------------------------------------------------------------
// Reschedule modal — unchanged from modules/appointments.js
// ---------------------------------------------------------------------------
function openRescheduleModal(jobId) {
  const job = db.jobById(jobId);
  const techs = db.employees().filter((e) => e.isTech);
  const bays = db.bays();
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-head"><div class="modal-title">Reschedule ${job.ro}</div><button class="icon-btn" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
      <div class="modal-body">
        <div class="field"><label class="label">Date</label><input type="date" class="input" id="rs-date" value="${job.scheduledDate || ''}"></div>
        <div class="field"><label class="label">Time</label><input type="time" class="input" id="rs-time" value="${job.scheduledTime || ''}"></div>
        <div class="field"><label class="label">Technician</label><select class="select" id="rs-tech"><option value="">Unassigned</option>${techs.map((t) => `<option value="${t.id}" ${t.id === job.techId ? 'selected' : ''}>${t.firstName} ${t.lastName}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Bay</label><select class="select" id="rs-bay"><option value="">Unassigned</option>${bays.map((b) => `<option value="${b.id}" ${b.id === job.bayId ? 'selected' : ''}>${b.name}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Reason / note (optional)</label><textarea class="textarea" id="rs-note"></textarea></div>
      </div>
      <div class="modal-foot"><button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" id="rs-save">Save</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => overlay.remove()));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#rs-save').addEventListener('click', () => {
    const date = overlay.querySelector('#rs-date').value;
    const time = overlay.querySelector('#rs-time').value;
    const techId = overlay.querySelector('#rs-tech').value || null;
    const bayId = overlay.querySelector('#rs-bay').value || null;
    const note = overlay.querySelector('#rs-note').value.trim();
    if (!date || !time) { toast('Date and time are required', 'error'); return; }
    if (util.isROLocked(job)) { toast(`${job.ro} is ${job.status} — cannot reschedule.`, 'error'); return; }
    const jobs = db.jobs();
    const idx = jobs.findIndex((j) => j.id === job.id);
    jobs[idx].scheduledDate = date;
    jobs[idx].scheduledTime = time;
    jobs[idx].techId = techId;
    jobs[idx].bayId = bayId;
    if (note) jobs[idx].internalNotes = `${jobs[idx].internalNotes ? jobs[idx].internalNotes + '\n' : ''}Rescheduled: ${note}`;
    db.saveJobs(jobs);
    overlay.remove();
    toast('Appointment rescheduled', 'success');
    selectedDate = date;
    document.getElementById('cal-date').value = selectedDate;
    updateDateLabel();
    renderAll();
  });
}

// ---------------------------------------------------------------------------
// Admin — unchanged from modules/appointments.js
// ---------------------------------------------------------------------------
function renderAdmin() {
  const hours = db.settings().hours || {};
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const names = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  document.getElementById('shop-hours-list').innerHTML = order.map((d) => {
    const h = hours[d];
    return `<div class="row between" style="padding:4px 0"><span class="muted">${names[d]}</span><span>${h?.closed ? 'Closed' : `${util.fmtTime(h.open)} – ${util.fmtTime(h.close)}`}</span></div>`;
  }).join('') + `<div class="muted" style="font-size:var(--t-13);margin-top:var(--s2)">Edit hours in the Settings module.</div>`;
  document.getElementById('booking-rules-list').innerHTML = `<div class="muted" style="font-size:var(--t-13)">Booking-rule configuration (lead time, max per day, etc.) isn't wired to a real data source in this build — placeholder.</div>`;
  document.getElementById('blocked-dates-note').innerHTML = `<div class="empty-title" style="font-size:var(--t-base)">No blocked-dates source yet</div><div class="empty-sub">Holiday/blackout dates aren't wired up to real data in this build.</div>`;
}
