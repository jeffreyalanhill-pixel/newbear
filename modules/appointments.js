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
  stampStageTransition, getStageDurationMinutes,
} from '../lib/timing.js';
import {
  PHOTO_CATEGORIES, PHOTO_CATEGORY_MAP, createPhotoRecord,
  addJobPhoto, removeJobPhoto, updateJobPhoto, getJobPhotos, formatPhotoSize,
} from '../lib/photos.js';

let selectedDate = new Date().toISOString().slice(0, 10);
let viewMode = 'day'; // day | week | month
let dayMode = 'workflow'; // workflow | calendar (Day view only)
let filterStatus = '';
let filterSearch = '';
let filterTech = '';
let filterBay = '';
let filterType = '';
let timingInterval = null; // single board-refresh interval for live in-progress timers
let boardMetricView = 'overview'; // overview | money | time | capacity | techs | bottlenecks
let boardCardView   = 'minimal';  // minimal | detailed — persisted to settings
let collapsedCols   = {};         // stageId → true — persisted to settings
const expandedCards = new Set();  // IDs of individually-expanded cards (in-memory only)

// Backfill multi-tech fields from legacy single-tech fields.
// Non-destructive — safe to call on every render.
function ensureAssignmentFields(job) {
  const legacyId = job.leadTechId || job.techId || job.technicianId || null;
  const assignedTechIds = Array.isArray(job.assignedTechIds)
    ? job.assignedTechIds
    : (legacyId ? [legacyId] : []);
  const leadTechId = job.leadTechId || assignedTechIds[0] || null;
  return { ...job, assignedTechIds, leadTechId };
}

// Card-level tech display: "Mike R." or "Mike R. +2"
function techDisplayLabel(a) {
  if (!(a.assignedTechIds?.length > 0)) return 'Unassigned tech';
  const extra = a.assignedTechIds.length - 1;
  return extra > 0 ? `${a.techName || 'Tech'} +${extra}` : (a.techName || 'Tech');
}
// Two-letter initials: "Marcus Johnson" → "MJ"
function techInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts.length ? parts[0][0].toUpperCase() : '?';
}
// Deterministic muted avatar color pair [bg, fg] from name string
const _AV_PALETTES = [
  ['#DBEAFE','#1E40AF'],['#D1FAE5','#065F46'],['#EDE9FE','#5B21B6'],
  ['#FEE2E2','#991B1B'],['#FEF3C7','#92400E'],['#E0F2FE','#0369A1'],
  ['#FCE7F3','#9D174D'],['#ECFDF5','#064E3B'],['#FFF7ED','#9A3412'],
];
function techAvatarColors(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + (name.charCodeAt(i))) & 0xFFFF;
  return _AV_PALETTES[h % _AV_PALETTES.length];
}

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

// Write workflowStatus + optional timing fields directly to localStorage.
// Used for stages with no backing util.* function (e.g. waiting_bay,
// picked_up_closed) or as a permissive fallback when the util.* guard
// doesn't apply to the job's current status. Does NOT change job.status —
// deriveWorkflowStage reads workflowStatus first so the card moves correctly.
function setJobWorkflowStatus(jobId, stageId, opts = {}) {
  const jobs = db.jobs();
  const idx  = jobs.findIndex((j) => j.id === jobId);
  if (idx < 0) throw new Error('Job not found');
  const now  = new Date().toISOString();
  const job  = { ...jobs[idx], workflowStatus: stageId, lastStageChangedAt: now };
  if (opts.pickedUpAt      && !job.pickedUpAt)      job.pickedUpAt      = now;
  if (opts.readyAt         && !job.readyAt)          job.readyAt         = now;
  if (opts.workCompletedAt && !job.workCompletedAt)  job.workCompletedAt = now;
  if (opts.walkInAt        && !job.walkInAt)         job.walkInAt        = now;
  if (opts.arrivedAt       && !job.arrivedAt)        job.arrivedAt       = now;
  jobs[idx] = job;
  db.saveJobs(jobs);
  return job;
}

// Flat map: every known status/workflowStatus value → canonical stage ID.
// on_hold is NOT in the flat map because it's context-dependent (holdReason).
// cancelled/canceled are treated as the same stage ID ('cancelled').
const WORKFLOW_STATUS_MAP = {
  // estimates / request variants
  request:             'estimates_requests',
  estimate:            'estimates_requests',
  request_pending:     'estimates_requests',
  pending_request:     'estimates_requests',
  booking_request:     'estimates_requests',
  estimates_requests:  'estimates_requests',
  // walk-in
  walkin:              'walk_in',
  walk_in:             'walk_in',
  // scheduled
  scheduled:           'scheduled',
  confirmed:           'scheduled',
  // dropped off / checked in
  waiting:             'dropped_off',   // legacy util.js status key
  checked_in:          'dropped_off',
  dropped_off:         'dropped_off',
  // waiting bay
  waiting_bay:         'waiting_bay',
  // in progress
  in_progress:         'in_progress',
  // hold states (flat — on_hold still handled contextually in deriveWorkflowStage)
  waiting_approval:    'waiting_approval',
  waiting_parts:       'waiting_parts',
  // quality check
  quality_check:       'quality_check',
  // ready for pickup
  ready:               'ready_for_pickup',
  ready_for_pickup:    'ready_for_pickup',
  // picked up / closed
  completed:           'picked_up_closed',
  closed:              'picked_up_closed',
  invoiced:            'picked_up_closed',
  picked_up:           'picked_up_closed',
  picked_up_closed:    'picked_up_closed',
  // canceled (both spellings)
  cancelled:           'cancelled',
  canceled:            'cancelled',
  // no-show
  no_show:             'no_show',
};

// Returns the canonical board stage ID for any status string.
// Returns null for unknown/context-dependent values (caller falls through
// to the context-aware logic in deriveWorkflowStage).
function normalizeWorkflowStatus(status) {
  if (!status) return null;
  return WORKFLOW_STATUS_MAP[status] || null;
}

// §2/§4 — Canonical workflow stage derived from job state.
// Uses normalizeWorkflowStatus for the flat mapping; handles context-dependent
// cases (on_hold sub-states, approvalStatus, noShow flag) directly.
function deriveWorkflowStage(job) {
  // Explicit board override: normalize it too so stale workflowStatus values don't break
  if (job.workflowStatus) {
    return normalizeWorkflowStatus(job.workflowStatus) || job.workflowStatus;
  }
  // Context-dependent cases — need additional fields to decide
  if (job.status === 'cancelled' || job.status === 'canceled') return job.noShow ? 'no_show' : 'cancelled';
  if (job.approvalStatus === 'pending') return 'waiting_approval';
  if (job.status === 'on_hold') return job.holdReason === 'parts_ordered' ? 'waiting_parts' : 'waiting_approval';
  // Flat-map everything else
  return normalizeWorkflowStatus(job.status) || 'estimates_requests';
}
// Primary flow — left-to-right normal job progression.
const PRIMARY_STAGES = [
  { id: 'estimates_requests', label: 'Requests / Estimates',       color: '#2563EB', bgTint: 'rgba(37,99,235,0.05)'   },
  { id: 'walk_in',            label: 'Walk-Ins',                   color: '#0891B2', bgTint: 'rgba(8,145,178,0.05)',  isWalkIn: true },
  { id: 'scheduled',          label: 'Scheduled',                  color: '#3B82F6', bgTint: 'rgba(59,130,246,0.05)'  },
  { id: 'dropped_off',        label: 'Dropped Off / Checked In',   color: '#7C3AED', bgTint: 'rgba(124,58,237,0.05)'  },
  { id: 'waiting_bay',        label: 'Assigned / Waiting Bay',     color: '#9333EA', bgTint: 'rgba(147,51,234,0.05)'  },
  { id: 'in_progress',        label: 'In Progress',                color: '#6366F1', bgTint: 'rgba(99,102,241,0.06)'  },
  { id: 'quality_check',      label: 'Quality Check / Wrap Up',    color: '#8B5CF6', bgTint: 'rgba(139,92,246,0.05)'  },
  { id: 'ready_for_pickup',   label: 'Ready for Pickup',           color: '#16A34A', bgTint: 'rgba(22,163,74,0.05)'   },
  { id: 'picked_up_closed',   label: 'Picked Up / Closed',         color: '#94A3B8', bgTint: 'rgba(148,163,184,0.05)' },
];
// Hold / interruption lanes — not linear steps; entered from any active stage.
const HOLD_STAGES = [
  { id: 'waiting_approval', label: 'Waiting Approval', color: '#F59E0B', bgTint: 'rgba(245,158,11,0.06)', isHold: true },
  { id: 'waiting_parts',    label: 'Waiting Parts',    color: '#FB923C', bgTint: 'rgba(251,146,60,0.06)', isHold: true },
];
// Combined for STAGE_META lookups — order is primary first, hold last.
const WORKFLOW_STAGES = [...PRIMARY_STAGES, ...HOLD_STAGES];
const STAGE_META = Object.fromEntries(WORKFLOW_STAGES.map((s) => [s.id, s]));
STAGE_META.cancelled = { id: 'cancelled', label: 'Canceled',  color: '#EF4444' };
STAGE_META.no_show   = { id: 'no_show',   label: 'No-Show',   color: '#94A3B8' };

// Attempt the preferred util.* transition first; fall back to setJobWorkflowStatus
// so every visible lane is always a valid drag/drop target without a red toast.
function moveToStage(jobId, stageId, via = 'unknown') {
  let job = db.jobById(jobId);
  if (!job) throw new Error('Appointment not found');

  // Already in this stage — no-op, no stamp
  if (deriveWorkflowStage(job) === stageId) return job;

  // Clear pending approval when dragging anywhere except waiting_approval so the
  // card doesn't snap back on the next render.
  if (job.approvalStatus === 'pending' && stageId !== 'waiting_approval') {
    util.resolveApproval(jobId, true);
    job = db.jobById(jobId);
  }

  let result;
  switch (stageId) {
    // ── Soft-move only stages (no util.* transition) ─────────────────────
    case 'estimates_requests':
      result = setJobWorkflowStatus(jobId, 'estimates_requests'); break;

    case 'walk_in':
      result = setJobWorkflowStatus(jobId, 'walk_in', { walkInAt: true, arrivedAt: true }); break;

    case 'scheduled':
      // Soft move: workflowStatus override places card in Scheduled lane.
      // Preserves scheduledDate/scheduledTime so the appointment still appears correctly.
      result = setJobWorkflowStatus(jobId, 'scheduled'); break;

    // ── Primary transitions (util.* preferred, soft fallback if guard fails) ──
    case 'dropped_off':
      if (job.status === 'scheduled') { result = util.checkIn(jobId); break; }
      result = setJobWorkflowStatus(jobId, 'dropped_off'); break;

    case 'waiting_bay':
      result = setJobWorkflowStatus(jobId, 'waiting_bay'); break;

    case 'in_progress':
      if (['waiting', 'on_hold'].includes(job.status)) {
        result = util.startJob(jobId, job.bayId, job.techId); break;
      }
      result = setJobWorkflowStatus(jobId, 'in_progress'); break; // soft move (e.g. from quality_check back)

    case 'waiting_approval':
      try { result = util.requestApproval(jobId); }
      catch { result = setJobWorkflowStatus(jobId, 'waiting_approval'); }
      break;

    case 'waiting_parts':
      if (job.status === 'in_progress') { result = util.holdJob(jobId, 'parts_ordered'); break; }
      result = setJobWorkflowStatus(jobId, 'waiting_parts'); break;

    case 'quality_check':
      if (job.status === 'in_progress') { result = util.moveToQualityCheck(jobId); break; }
      result = setJobWorkflowStatus(jobId, 'quality_check'); break;

    case 'ready_for_pickup':
      if (['in_progress', 'quality_check'].includes(job.status)) {
        result = util.markReady(jobId); break;
      }
      result = setJobWorkflowStatus(jobId, 'ready_for_pickup', { readyAt: true, workCompletedAt: true }); break;

    case 'picked_up_closed':
      result = setJobWorkflowStatus(jobId, 'picked_up_closed', { pickedUpAt: true }); break;

    case 'cancelled':
    case 'canceled':
      // Soft workflowStatus move — real cancellation with audit trail uses drawer Cancel button
      result = setJobWorkflowStatus(jobId, 'cancelled'); break;

    case 'no_show':
      result = setJobWorkflowStatus(jobId, 'no_show'); break;

    default:
      throw new Error(`Unknown stage: "${stageId}".`);
  }
  // Stamp stage entry after every real transition (non-fatal — never blocks the move)
  const stageLabelForHistory = STAGE_META[stageId]?.label || stageId;
  try { stampStageTransition(jobId, stageId, { label: stageLabelForHistory, changedVia: via }); } catch { /* non-fatal */ }
  // Log collaboration activity for stage change
  try {
    const actor = getCurrentActor();
    appendJobActivity(jobId, {
      id: nextCollabId('act'),
      type: 'stage_changed',
      label: `Moved to ${stageLabelForHistory}`,
      actorId: actor.id,
      actorName: actor.name,
      createdAt: new Date().toISOString(),
      metadata: { to: stageId, via },
    });
  } catch { /* non-fatal */ }
  return result;
}

function normalizeAppointment(job) {
  const c = db.customerById(job.customerId);
  const v = db.vehicleById(job.vehicleId);
  const ej = ensureAssignmentFields(job);
  const tech = ej.leadTechId ? db.employeeById(ej.leadTechId) : null;
  const bay = job.bayId ? db.bayById(job.bayId) : null;
  const services = (job.lineItems || []).filter((l) => l.type === 'service').map((l) => l.name);
  return {
    id: job.id,
    date: job.scheduledDate,
    startTime: job.scheduledTime || (job.walkInAt ? job.walkInAt.slice(11, 16) : null),
    duration: (job.lineItems || []).reduce((sum, l) => sum + (l.hours || 0), 0) * 60 || 60,
    customerName: util.customerName(c) || job.walkInCustomerName || (job.status === 'walk_in' || job.workflowStatus === 'walk_in' ? 'Walk-in customer' : 'Customer not assigned'),
    vehicleLabel: util.vehicleLabel(v) || job.walkInVehicle || '',
    roNumber: job.ro,
    services,
    status: job.status,
    appointmentType: deriveAppointmentType(job),
    workflowStage: deriveWorkflowStage(job),
    visitType: job.visitType || null,
    total: job.total || 0,
    techId: ej.leadTechId || null,
    techName: tech ? `${tech.firstName} ${tech.lastName}` : '',
    leadTechId: ej.leadTechId,
    assignedTechIds: ej.assignedTechIds,
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
  const active = new Set(['dropped_off', 'waiting_bay', 'in_progress', 'quality_check', 'waiting_approval', 'waiting_parts', 'ready_for_pickup']);
  if (active.has(appt.workflowStage)) {
    if (!(appt.assignedTechIds?.length > 0)) warnings.push('No technician assigned');
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
// Board metric view — state + persistence
// ---------------------------------------------------------------------------
function loadBoardMetricView() {
  boardMetricView = db.settings().boardMetricView || 'overview';
}
function saveBoardMetricView(v) {
  boardMetricView = v;
  try { const s = db.settings(); s.boardMetricView = v; db.saveSettings(s); } catch { /* non-fatal */ }
}
function loadBoardCardView() {
  boardCardView = db.settings().boardCardView || 'minimal';
}
function saveBoardCardView(v) {
  boardCardView = v;
  expandedCards.clear(); // reset individual overrides when global mode changes
  try { const s = db.settings(); s.boardCardView = v; db.saveSettings(s); } catch { /* non-fatal */ }
}
function loadCollapsedCols() {
  collapsedCols = db.settings().collapsedWorkflowColumns || {};
}
function saveCollapsedCols() {
  try { const s = db.settings(); s.collapsedWorkflowColumns = { ...collapsedCols }; db.saveSettings(s); } catch { /* non-fatal */ }
}
function toggleColCollapse(stageId) {
  collapsedCols = { ...collapsedCols, [stageId]: !collapsedCols[stageId] };
  saveCollapsedCols();
  renderDayWorkflowView();
}

function boardCardViewToggleHtml() {
  const isDetailed = boardCardView === 'detailed';
  const cls = (active) => `sb-card-btn${active ? ' active' : ''}`;
  return `<div class="sb-card-tabs">
    <button data-card-view="minimal" class="${cls(!isDetailed)}">Minimal</button>
    <button data-card-view="detailed" class="${cls(isDetailed)}">Detailed</button>
  </div>`;
}

// ── Metric helpers ────────────────────────────────────────────────────────────
function formatMoney(v) {
  const n = Number(v);
  if (!n || isNaN(n)) return '$0';
  return '$' + Math.round(n).toLocaleString();
}
function formatMetricDuration(minutes) {
  if (minutes === null || minutes === undefined || isNaN(minutes)) return '—';
  const m = Math.round(Math.max(0, minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}
function getJobValue(job) {
  if (job.invoiceId) { const inv = db.invoiceById(job.invoiceId); if (inv?.total) return Number(inv.total) || 0; }
  if (job.quoteId)   { const q   = db.quoteById(job.quoteId);    if (q?.total)   return Number(q.total)   || 0; }
  if (job.total) return Number(job.total) || 0;
  if (Array.isArray(job.lineItems)) return job.lineItems.reduce((s, l) => s + ((Number(l.price) || 0) * (Number(l.qty) || 1)), 0);
  return 0;
}
function getStageAge(job) {
  const entered = job.currentStageEnteredAt || job.lastStageChangedAt;
  if (!entered) return null;
  return Math.max(0, (Date.now() - new Date(entered)) / 60000);
}
function getBayElapsed(job) {
  if (!job.workStartedAt) return null;
  return getElapsedWorkMinutes(ensureTimingFields({ ...job }));
}
function getRemainingMinutes(job) {
  const tj = ensureTimingFields({ ...job });
  const elapsed = getElapsedWorkMinutes(tj);
  const est = getEstimatedMinutes(tj);
  return Math.max(0, est - elapsed);
}

// Per-stage aging thresholds (minutes).
const STAGE_AGING_THRESHOLD = {
  waiting_approval: 20,
  waiting_parts:    30,
  dropped_off:      30,
  waiting_bay:      30,
  ready_for_pickup: 120,
  in_progress:      null, // uses timing status instead
};

function getLaneMetrics(stageId, appts, now = new Date()) {
  const jobs = appts.map((a) => a._job);
  const ages = jobs.map(getStageAge).filter((a) => a !== null);
  const oldestAge = ages.length ? Math.max(...ages) : null;
  const avgAge    = ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : null;

  const tc = { on_schedule: 0, watch: 0, behind: 0, overdue: 0 };
  jobs.forEach((j) => {
    const ts = getTimingStatus(ensureTimingFields({ ...j }), now);
    if (ts in tc) tc[ts]++;
  });
  const attentionCount = tc.watch + tc.behind + tc.overdue;

  const totalValue          = jobs.reduce((s, j) => s + getJobValue(j), 0);
  const approvedValue       = jobs.filter((j) => j.approvalStatus !== 'pending').reduce((s, j) => s + getJobValue(j), 0);
  const waitingApprovalValue = jobs.filter((j) => j.approvalStatus === 'pending').reduce((s, j) => s + getJobValue(j), 0);
  const invoicedValue       = jobs.filter((j) => j.invoiceId).reduce((s, j) => {
    const inv = db.invoiceById(j.invoiceId); return s + (Number(inv?.total) || 0);
  }, 0);
  const totalLaborHours = jobs.reduce((s, j) => s + getEstimatedMinutes(ensureTimingFields({ ...j })) / 60, 0);

  const unassignedTechs = jobs.filter((j) => !(ensureAssignmentFields(j).assignedTechIds?.length > 0)).length;
  const unassignedBay   = jobs.filter((j) => !j.bayId).length;

  const threshold = STAGE_AGING_THRESHOLD[stageId] ?? null;
  const agingCount = threshold !== null
    ? jobs.filter((j) => { const a = getStageAge(j); return a !== null && a > threshold; }).length
    : tc.behind + tc.overdue;

  return { count: appts.length, oldestAge, avgAge, attentionCount, timingCounts: tc,
           totalValue, approvedValue, waitingApprovalValue, invoicedValue,
           totalLaborHours, unassignedTechs, unassignedBay, agingCount };
}

function getBayMetrics(bayId, allAppts) {
  const bay = db.bayById(bayId);
  if (!bay) return null;
  const activeStages = new Set(['dropped_off', 'waiting_bay', 'in_progress', 'quality_check', 'waiting_parts', 'waiting_approval']);
  const bayAppts = allAppts.filter((a) => a.bayId === bayId && activeStages.has(a.workflowStage));
  const ipAppts  = bayAppts.filter((a) => a.workflowStage === 'in_progress');
  const currentJob = ipAppts.length ? ipAppts[0]._job : (bayAppts.length ? bayAppts[0]._job : null);
  const occupied = bayAppts.length > 0;
  const value    = currentJob ? getJobValue(currentJob) : 0;
  const elapsed  = currentJob ? getBayElapsed(currentJob) : null;
  const remaining = currentJob ? getRemainingMinutes(currentJob) : null;
  const est      = currentJob ? getEstimatedMinutes(ensureTimingFields({ ...currentJob })) : null;
  const ej = currentJob ? ensureAssignmentFields(currentJob) : null;
  const leadTech = ej?.leadTechId ? db.employeeById(ej.leadTechId) : null;
  const techLabel = ej?.assignedTechIds?.length > 0
    ? (leadTech ? `${leadTech.firstName} ${leadTech.lastName.charAt(0)}.` : 'Tech')
      + (ej.assignedTechIds.length > 1 ? ` +${ej.assignedTechIds.length - 1}` : '')
    : null;
  return { bay, occupied, currentJob, value, elapsed, remaining, est, techLabel };
}

// ── Per-lane metric strip HTML ────────────────────────────────────────────────
function laneMetricStripHtml(stageId, metrics, view) {
  if (!metrics.count) return '';
  const m = metrics;
  if (view === 'overview') {
    const parts = [];
    if (m.attentionCount > 0) parts.push(`<span style="color:var(--amber)">${m.attentionCount} need attention</span>`);
    if (m.oldestAge !== null) parts.push(`oldest ${formatMetricDuration(m.oldestAge)}`);
    return parts.join(' · ');
  }
  if (view === 'money') {
    const parts = [`<span style="font-weight:600">${formatMoney(m.totalValue)}</span>`];
    if (m.approvedValue > 0 && m.waitingApprovalValue > 0) parts.push(`${formatMoney(m.approvedValue)} approved`);
    if (m.waitingApprovalValue > 0) parts.push(`<span style="color:var(--amber)">${formatMoney(m.waitingApprovalValue)} pending</span>`);
    if (m.invoicedValue > 0) parts.push(`${formatMoney(m.invoicedValue)} invoiced`);
    return parts.join(' · ');
  }
  if (view === 'time') {
    const parts = [];
    if (m.avgAge !== null) parts.push(`avg ${formatMetricDuration(m.avgAge)}`);
    if (m.oldestAge !== null) parts.push(`oldest ${formatMetricDuration(m.oldestAge)}`);
    if (m.agingCount > 0) parts.push(`<span style="color:var(--amber)">${m.agingCount} aging</span>`);
    return parts.join(' · ');
  }
  if (view === 'capacity') {
    const parts = [`${m.count} job${m.count !== 1 ? 's' : ''}`];
    if (m.totalLaborHours > 0) parts.push(`${m.totalLaborHours.toFixed(1)}h labor`);
    return parts.join(' · ');
  }
  if (view === 'techs') {
    const assigned = m.count - m.unassignedTechs;
    const parts = [];
    if (m.unassignedTechs > 0) parts.push(`<span style="color:var(--red)">${m.unassignedTechs} unassigned</span>`);
    if (assigned > 0) parts.push(`${assigned} assigned`);
    return parts.join(' · ') || '—';
  }
  if (view === 'bottlenecks') {
    const parts = [];
    if (m.timingCounts.overdue > 0) parts.push(`<span style="color:var(--red)">${m.timingCounts.overdue} overdue</span>`);
    if (m.timingCounts.behind > 0)  parts.push(`<span style="color:var(--amber)">${m.timingCounts.behind} behind</span>`);
    if (m.agingCount > 0 && stageId !== 'in_progress') parts.push(`<span style="color:var(--amber)">${m.agingCount} aging</span>`);
    if (m.unassignedTechs > 0) parts.push(`<span style="color:var(--red)">${m.unassignedTechs} no tech</span>`);
    if (m.unassignedBay > 0)   parts.push(`${m.unassignedBay} no bay`);
    if (m.waitingApprovalValue > 0 && stageId === 'waiting_approval') parts.push(`${formatMoney(m.waitingApprovalValue)} held`);
    return parts.join(' · ') || `<span style="color:var(--green)">All clear</span>`;
  }
  return '';
}

// ── Toggle row HTML ───────────────────────────────────────────────────────────
const METRIC_VIEW_LABELS = { overview: 'Overview', money: 'Money', time: 'Time', capacity: 'Capacity', techs: 'Techs', bottlenecks: 'Bottlenecks' };
function boardMetricToggleHtml() {
  return `<div id="board-metric-toggles" class="sb-metric-tabs">
    ${Object.entries(METRIC_VIEW_LABELS).map(([v, label]) => {
      const active = boardMetricView === v;
      return `<button data-metric-view="${v}" class="sb-metric-btn${active ? ' active' : ''}">${label}</button>`;
    }).join('')}
  </div>`;
}

// ── Bay metric section HTML ───────────────────────────────────────────────────
function bayMetricSectionHtml(allAppts, view) {
  const bays = db.bays();
  if (!bays.length) return '';
  const cards = bays.map((bay) => {
    const m = getBayMetrics(bay.id, allAppts);
    if (!m) return '';
    let inner = '';
    if (!m.occupied) {
      inner = `<div style="color:var(--green);font-size:var(--t-xs);font-weight:600">Available</div>`;
    } else {
      const ro = m.currentJob?.ro || '—';
      const overdue = m.elapsed !== null && m.est > 0 && m.elapsed > m.est * 1.25;
      const behind  = !overdue && m.elapsed !== null && m.est > 0 && m.elapsed > m.est;
      if (view === 'overview') {
        inner = `<div style="font-size:var(--t-xs);font-weight:600">${ro}</div>`
          + (m.techLabel ? `<div style="font-size:var(--t-xs);color:var(--ink-3)">${m.techLabel}</div>` : '');
      } else if (view === 'money') {
        inner = `<div style="font-size:var(--t-xs);font-weight:600">${formatMoney(m.value)}</div>`
          + `<div style="font-size:var(--t-xs);color:var(--ink-3)">${ro}</div>`;
      } else if (view === 'time') {
        const eStr = m.elapsed !== null ? formatMetricDuration(m.elapsed) : '—';
        const tStr = m.est     !== null ? formatMetricDuration(m.est)     : '—';
        const rStr = m.remaining !== null ? formatMetricDuration(m.remaining) : '—';
        const timeColor = overdue ? 'var(--red)' : behind ? 'var(--amber)' : 'var(--ink-3)';
        inner = `<div style="font-size:var(--t-xs);font-weight:600;color:${timeColor}">${eStr} / ${tStr}</div>`
          + `<div style="font-size:var(--t-xs);color:var(--ink-3)">${rStr} left</div>`;
      } else if (view === 'capacity') {
        const pct = m.elapsed !== null && m.est > 0 ? Math.min(100, Math.round((m.elapsed / m.est) * 100)) : null;
        inner = `<div style="font-size:var(--t-xs);font-weight:600">Occupied${pct !== null ? ` · ${pct}%` : ''}</div>`
          + (m.remaining !== null ? `<div style="font-size:var(--t-xs);color:var(--ink-3)">${formatMetricDuration(m.remaining)} left</div>` : '');
      } else if (view === 'techs') {
        inner = `<div style="font-size:var(--t-xs);font-weight:600">${m.techLabel || `<span style="color:var(--red)">No tech</span>`}</div>`
          + `<div style="font-size:var(--t-xs);color:var(--ink-3)">${ro}</div>`;
      } else if (view === 'bottlenecks') {
        const problems = [];
        if (!m.techLabel)  problems.push(`<span style="color:var(--red)">No tech</span>`);
        if (overdue)       problems.push(`<span style="color:var(--red)">Overdue</span>`);
        else if (behind)   problems.push(`<span style="color:var(--amber)">Behind</span>`);
        inner = problems.length
          ? `<div style="font-size:var(--t-xs)">${problems.join(' · ')}</div>`
          : `<div style="font-size:var(--t-xs);color:var(--green)">OK</div>`;
        inner += `<div style="font-size:var(--t-xs);color:var(--ink-3)">${ro}</div>`;
      }
    }
    const topColor = m.occupied ? 'var(--accent)' : 'var(--green)';
    return `<div style="flex:0 0 130px;background:var(--canvas);border-radius:var(--r-md);border:1px solid var(--rule);border-top:3px solid ${topColor};padding:var(--s2) var(--s3)">
      <div style="font-size:var(--t-xs);font-weight:700;color:var(--ink);margin-bottom:3px">${m.bay.name}</div>
      ${inner}
    </div>`;
  }).join('');
  return `<div style="margin-bottom:var(--s3)">
    <div style="font-size:10px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--s2)">Bays</div>
    <div style="display:flex;gap:var(--s2);flex-wrap:wrap">${cards}</div>
  </div>`;
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

    // Populate walk-in button in header slot (once at init, permission-gated)
    if (can('create')) {
      const slot = document.getElementById('walkin-slot');
      if (slot) slot.innerHTML = `<button id="btn-new-walkin">+ Walk-In</button>`;
      document.getElementById('btn-new-walkin')?.addEventListener('click', openWalkInModal);
    }

    loadBoardMetricView();
    loadBoardCardView();
    loadCollapsedCols();
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
// Walk-In creation modal
// ---------------------------------------------------------------------------
function openWalkInModal() {
  const employees = db.employees().filter((e) =>
    ['owner', 'general_manager', 'service_manager', 'advisor', 'front_desk'].includes(e.role)
  );
  const overlay = document.getElementById('appt-drawer-overlay');
  document.getElementById('drawer-title').textContent = 'New Walk-In';
  document.getElementById('drawer-body').innerHTML = `
    <div class="stack">
      <div class="field">
        <label class="label">Customer name <span style="color:var(--red)">*</span></label>
        <input class="input" id="wi-customer-name" placeholder="Jane Smith" autocomplete="off">
      </div>
      <div class="field">
        <label class="label">Phone (optional)</label>
        <input class="input" id="wi-phone" placeholder="(555) 000-0000" type="tel" autocomplete="off">
      </div>
      <div class="field">
        <label class="label">Vehicle (year / make / model)</label>
        <input class="input" id="wi-vehicle" placeholder="2019 Toyota Camry" autocomplete="off">
      </div>
      <div class="field">
        <label class="label">Service / concern <span style="color:var(--red)">*</span></label>
        <input class="input" id="wi-service" placeholder="Oil change, noise from front right…" autocomplete="off">
      </div>
      <div class="field">
        <label class="label">Priority</label>
        <select class="select" id="wi-priority">
          <option value="normal">Normal</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>
      ${employees.length ? `
      <div class="field">
        <label class="label">Advisor</label>
        <select class="select" id="wi-advisor">
          <option value="">No advisor assigned</option>
          ${employees.map((e) => `<option value="${e.id}">${e.firstName} ${e.lastName}</option>`).join('')}
        </select>
      </div>` : ''}
      <div class="field">
        <label class="label">Est. duration (minutes)</label>
        <input class="input" id="wi-duration" type="number" min="15" step="15" value="60">
      </div>
      <div class="field">
        <label class="label">Notes</label>
        <textarea class="input" id="wi-notes" rows="3" placeholder="Customer notes, symptoms, history…" style="resize:vertical"></textarea>
      </div>
      <div class="row wrapf" style="gap:var(--s2)">
        <button class="btn btn-primary" id="wi-save">Create Walk-In</button>
        <button class="btn btn-secondary" id="wi-cancel">Cancel</button>
      </div>
    </div>`;
  overlay.classList.add('open');

  document.getElementById('wi-cancel').addEventListener('click', closeDrawer);
  document.getElementById('wi-save').addEventListener('click', () => {
    const customerName = (document.getElementById('wi-customer-name')?.value || '').trim();
    const service      = (document.getElementById('wi-service')?.value || '').trim();
    if (!customerName) { toast('Customer name is required.', 'error'); return; }
    if (!service)      { toast('Service / concern is required.', 'error'); return; }

    const now      = new Date().toISOString();
    const date     = selectedDate;
    const duration = parseInt(document.getElementById('wi-duration')?.value, 10) || 60;
    const advisorId = document.getElementById('wi-advisor')?.value || null;
    const newJob = {
      id:                    db.nextId('j'),
      ro:                    db.nextRO(),
      status:                'walk_in',
      workflowStatus:        'walk_in',
      walkInAt:              now,
      arrivedAt:             now,
      currentStage:          'walk_in',
      currentStageEnteredAt: now,
      stageHistory:          [{ id: `sh_${Date.now().toString(36)}`, stage: 'walk_in', label: 'Walk-In', enteredAt: now, exitedAt: null, durationMinutes: null, changedBy: 'demo-user', changedVia: 'walk_in_created' }],
      timingHistory:         [{ type: 'walk_in_created', at: now, label: 'Walk-in created' }],
      scheduledDate:         date,
      scheduledTime:         now.slice(11, 16),
      walkInCustomerName:    customerName,
      walkInPhone:           (document.getElementById('wi-phone')?.value || '').trim() || null,
      walkInVehicle:         (document.getElementById('wi-vehicle')?.value || '').trim() || null,
      walkInService:         service,
      walkInPriority:        document.getElementById('wi-priority')?.value || 'normal',
      advisorId,
      estimatedMinutes:      duration,
      lineItems:             [{ id: db.nextId('li'), type: 'service', name: service, hours: duration / 60, qty: 1, price: 0 }],
      notes:                 (document.getElementById('wi-notes')?.value || '').trim() || null,
      customerId:            null,
      vehicleId:             null,
      createdAt:             now,
      lastStageChangedAt:    now,
    };
    const jobs = db.jobs();
    jobs.push(newJob);
    db.saveJobs(jobs);
    toast(`Walk-in created — ${newJob.ro}`, 'success');
    closeDrawer();
    renderAll();
  });
}

// ---------------------------------------------------------------------------
// Filtering shared by every view
// ---------------------------------------------------------------------------
function filteredAppointments(jobs) {
  let list = jobs.filter((j) => !(j.status === 'cancelled' && filterStatus && filterStatus !== 'cancelled')).map(normalizeAppointment);
  if (filterStatus) list = list.filter((a) => a.workflowStage === filterStatus || a.status === filterStatus);
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
  const finalStatuses = new Set(['picked_up_closed', 'cancelled', 'invoiced', 'closed']);
  const todaysJobs = visibleJobs().filter((j) =>
    j.scheduledDate === selectedDate ||
    // Active walk-ins always show on today's board regardless of their scheduledDate
    (deriveWorkflowStage(j) === 'walk_in' && !finalStatuses.has(j.status) && !finalStatuses.has(j.workflowStatus))
  );
  const appts = filteredAppointments(todaysJobs);
  const allApptsToday = todaysJobs.map(normalizeAppointment);

  // Pending bookings for this date double as "Estimates / Requests" cards —
  // they're not jobs yet, so they're rendered separately, not through
  // normalizeAppointment/filteredAppointments.
  const role = currentEmployee()?.role;
  const pendingForDay = role === 'parts' ? [] : db.pendingBookings().filter((b) => b.preferredDate === selectedDate);

  const stagesToShow = role === 'parts' ? HOLD_STAGES.filter((s) => s.id === 'waiting_parts') : WORKFLOW_STAGES;

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
  // ── Row 2: board tools injected into #sb-r2-tools ──────────────────────────
  const timingChips = tTotal > 0
    ? `<div class="sb-timing-chips">${summaryChips}</div><span class="sb-tools-sep"></span>`
    : '';
  const r2tools = document.getElementById('sb-r2-tools');
  if (r2tools) {
    r2tools.innerHTML = boardMetricToggleHtml()
      + `<span class="sb-tools-sep"></span>`
      + boardCardViewToggleHtml()
      + `<span class="sb-tools-sep"></span>`
      + `<button data-col-collapse-empty class="sb-tool-btn">Collapse Empty</button>`
      + `<button data-col-collapse-all class="sb-tool-btn">Collapse All</button>`
      + `<button data-col-expand-all class="sb-tool-btn">Expand All</button>`
      + (tTotal > 0 ? `<span class="sb-tools-sep"></span>${timingChips}` : '');
  }
  let html = bayMetricSectionHtml(allApptsToday, boardMetricView);
  html += `<div class="wfb-board">`;
  let holdDividerDone = false;
  stagesToShow.forEach((stage) => {
    // Insert visual divider before the first hold lane
    if (stage.isHold && !holdDividerDone) {
      holdDividerDone = true;
      html += `
        <div style="align-self:stretch;display:flex;flex-direction:column;align-items:center;gap:var(--s2);padding:0 var(--s1);flex-shrink:0" aria-hidden="true">
          <div style="width:2px;flex:1;background:var(--amber);opacity:.35;border-radius:1px"></div>
          <span style="font-size:10px;color:var(--amber);font-weight:700;white-space:nowrap;text-transform:uppercase;letter-spacing:.06em;writing-mode:vertical-rl;transform:rotate(180deg)">Hold States</span>
          <div style="width:2px;flex:1;background:var(--amber);opacity:.35;border-radius:1px"></div>
        </div>`;
    }
    const items = byStage[stage.id] || [];
    const extraPending = stage.id === 'estimates_requests' ? pendingForDay : [];
    const total = items.length + extraPending.length;
    const lm = getLaneMetrics(stage.id, items, tNow);
    const metricLine = laneMetricStripHtml(stage.id, lm, boardMetricView);
    const hdrStyle = `background:${stage.color}`;
    if (collapsedCols[stage.id]) {
      html += `
        <div class="wfb-col is-collapsed" data-stage="${stage.id}" title="${stage.label} · ${total} car${total !== 1 ? 's' : ''}">
          <div class="wfb-col-header" style="${hdrStyle}">
            <button class="wfb-col-toggle" data-col-toggle="${stage.id}" title="Expand ${stage.label}">＋</button>
          </div>
          <div class="wfb-col-collapsed-body">
            <div class="wfb-col-collapsed-label">${stage.label}</div>
            <span class="wfb-col-collapsed-count">${total}</span>
            ${lm.attentionCount > 0 ? `<span class="wfb-col-collapsed-count" style="background:#FEF3C7;color:#92400E" title="${lm.attentionCount} need attention">!</span>` : ''}
          </div>
        </div>`;
    } else {
      html += `
        <div class="wfb-col" data-stage="${stage.id}">
          <div class="wfb-col-header" style="${hdrStyle}">
            <span class="wfb-col-header-title">${stage.label}</span>
            ${stage.isHold ? `<span style="font-size:9px;background:rgba(255,255,255,.2);border-radius:8px;padding:1px 5px;color:#fff;font-weight:600;flex-shrink:0">hold</span>` : ''}
            <span class="wfb-col-header-count">${total}</span>
            <button class="wfb-col-toggle wfb-col-header-btn" data-col-toggle="${stage.id}" title="Collapse ${stage.label}">–</button>
          </div>
          <div class="wfb-col-body">
            ${metricLine ? `<div style="font-size:10px;color:var(--ink-3);padding:3px 0 6px;border-bottom:1px solid #DDE3EC;margin-bottom:6px;line-height:1.4">${metricLine}</div>` : ''}
            ${extraPending.map(pendingCardHtml).join('')}
            ${items.length ? items.map((a) => workflowCardHtml(a, allApptsToday)).join('') : (!extraPending.length ? `<div class="wfb-col-empty">Empty</div>` : '')}
          </div>
        </div>`;
    }
  });
  html += `</div>`;
  calBody.innerHTML = html;

  // Wire metric/card toggles and collapse buttons (in #sb-r2-tools)
  const toolsEl = document.getElementById('sb-r2-tools');
  if (toolsEl) {
    toolsEl.querySelectorAll('[data-metric-view]').forEach((btn) => {
      btn.addEventListener('click', () => { saveBoardMetricView(btn.dataset.metricView); renderDayWorkflowView(); });
    });
    toolsEl.querySelectorAll('[data-card-view]').forEach((btn) => {
      btn.addEventListener('click', () => { saveBoardCardView(btn.dataset.cardView); renderDayWorkflowView(); });
    });
    toolsEl.querySelector('[data-col-collapse-empty]')?.addEventListener('click', () => {
      stagesToShow.forEach((s) => {
        const stageItems = byStage[s.id] || [];
        const stagePending = s.id === 'estimates_requests' ? pendingForDay : [];
        if (stageItems.length === 0 && stagePending.length === 0) collapsedCols[s.id] = true;
      });
      saveCollapsedCols(); renderDayWorkflowView();
    });
    toolsEl.querySelector('[data-col-collapse-all]')?.addEventListener('click', () => {
      WORKFLOW_STAGES.forEach((s) => { collapsedCols[s.id] = true; });
      saveCollapsedCols(); renderDayWorkflowView();
    });
    toolsEl.querySelector('[data-col-expand-all]')?.addEventListener('click', () => {
      collapsedCols = {};
      saveCollapsedCols(); renderDayWorkflowView();
    });
  }
  // Wire column collapse toggles (still in calBody)
  calBody.querySelectorAll('[data-col-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleColCollapse(btn.dataset.colToggle); });
  });
  document.querySelectorAll('[data-col-menu]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); toast('Column actions — placeholder, coming soon.'); }));
  bindApptCards(calBody);
  bindPendingCards(calBody);
  if (canDrag()) wireDragDrop(calBody);
  else calBody.querySelectorAll('.wfb-card').forEach((c) => { c.removeAttribute('draggable'); });
}

function pendingCardHtml(b) {
  const services = (b.serviceIds || []).map((id) => db.serviceById(id)?.name).filter(Boolean).join(', ') || 'No service listed';
  return `
    <div class="wfb-card" draggable="true" data-pending-id="${b.id}" style="border-left-color:${STAGE_META.estimates_requests.color}">
      <div class="wfb-card-collapsed">
        <div style="font-weight:700;font-size:var(--t-sm);color:var(--ink);margin-bottom:2px">${b.customer?.name || 'Customer not assigned'}</div>
        <div style="font-size:var(--t-xs);color:var(--ink-3);margin-bottom:3px">${[b.vehicle?.year, b.vehicle?.make, b.vehicle?.model].filter(Boolean).join(' ') || 'Vehicle not assigned'}</div>
        <div style="font-size:var(--t-xs);color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${services}</div>
      </div>
      <div class="wfb-card-footer">
        <span class="badge badge-amber" style="font-size:9px;padding:1px 5px">Pending request</span>
      </div>
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

// Motion class: maps workflow stage + timing status → CSS animation class.
// Uses deriveWorkflowStage so workflowStatus overrides affect animation too.
function getMotionClass(job, tStatus) {
  const stage = deriveWorkflowStage(job);
  if (stage === 'in_progress') {
    if (tStatus === 'watch')   return 'is-watch';
    if (tStatus === 'behind')  return 'is-behind';
    if (tStatus === 'overdue') return 'is-overdue';
    return 'is-in-progress';
  }
  if (stage === 'quality_check')   return 'is-in-progress';
  if (stage === 'waiting_bay' || stage === 'waiting_approval' || stage === 'waiting_parts') return 'is-waiting';
  if (stage === 'ready_for_pickup' || stage === 'picked_up_closed') return 'is-ready';
  return '';
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

// Returns stageHistory array, or a synthetic single-entry backfill if empty.
function effectiveStageHistory(job) {
  if (Array.isArray(job.stageHistory) && job.stageHistory.length > 0) return job.stageHistory;
  const stage = job.currentStage || job.workflowStatus || 'unknown';
  const enteredAt = job.currentStageEnteredAt || job.lastStageChangedAt || job.scheduledDate || null;
  return [{ id: 'backfill', stage, label: STAGE_META[stage]?.label || stage, enteredAt, exitedAt: null, durationMinutes: null, changedBy: null, changedVia: 'backfill' }];
}

// ---------------------------------------------------------------------------
// Collaboration helpers — notes + activity on job records
// ---------------------------------------------------------------------------

// Unique ID for collab records. Not crypto-secure — fine for localStorage demo.
function nextCollabId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// Current actor for authorship. Falls back to "Demo User" if no employee selected.
function getCurrentActor() {
  const emp = currentEmployee();
  if (emp && emp.id) return { id: emp.id, name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Unknown' };
  return { id: null, name: 'Demo User' };
}

// Appends a note to job.colabNotes (separate from job.notes plain-text field).
function appendJobNote(jobId, note) {
  try {
    const jobs = db.jobs();
    const idx = jobs.findIndex((j) => j.id === jobId);
    if (idx < 0) return;
    const existing = Array.isArray(jobs[idx].colabNotes) ? jobs[idx].colabNotes : [];
    jobs[idx] = { ...jobs[idx], colabNotes: [...existing, note] };
    db.saveJobs(jobs);
  } catch { /* non-fatal */ }
}

// Appends a system activity event to job.colabActivity.
function appendJobActivity(jobId, event) {
  try {
    const jobs = db.jobs();
    const idx = jobs.findIndex((j) => j.id === jobId);
    if (idx < 0) return;
    const existing = Array.isArray(jobs[idx].colabActivity) ? jobs[idx].colabActivity : [];
    jobs[idx] = { ...jobs[idx], colabActivity: [...existing, event] };
    db.saveJobs(jobs);
  } catch { /* non-fatal */ }
}

// "42m ago", "2h ago", "3d ago" — rough relative time from ISO string.
function formatRelative(isoStr) {
  if (!isoStr) return '';
  try {
    const diffMs = Date.now() - new Date(isoStr).getTime();
    const mins = Math.max(0, Math.round(diffMs / 60000));
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ''; }
}

function workflowCardHtml(a, allApptsSameDay) {
  const meta = STAGE_META[a.workflowStage] || STAGE_META.estimates_requests;
  const svc = a.services[0] ? a.services[0] + (a.services.length > 1 ? ` +${a.services.length - 1}` : '') : 'No service listed';
  const job = a._job;
  const quote = job.quoteId ? db.quoteById(job.quoteId) : null;
  const invoice = job.invoiceId ? db.invoiceById(job.invoiceId) : null;
  const rwRecord = job.customerId ? db.customerRewardByCustomerId(job.customerId) : null;
  const rwTierLabel = rwRecord ? ({ vip: 'VIP', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' }[rwRecord.tier] || 'Member') : null;
  const crownChip = rwRecord ? `<span class="badge rw-crown-chip" title="Rewards ${rwTierLabel} · ${rwRecord.pointsBalance || 0} pts">👑 ${rwTierLabel}</span>` : '';
  const colabNotes = Array.isArray(job.colabNotes) ? job.colabNotes : [];
  const noteCount = colabNotes.length;
  const latestNote = noteCount > 0 ? colabNotes[noteCount - 1] : null;
  const warnings = getWarnings(a, allApptsSameDay);
  const photos    = Array.isArray(job.photos) ? job.photos : [];
  const photoCount = photos.length;
  const latestThumb = photoCount > 0 ? photos[photos.length - 1].thumbnailDataUrl : null;

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
  const mClass      = getMotionClass(job, tStatus);
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
  const stageMins   = getStageDurationMinutes(job, cardNow);
  const stageApprox = stageMins !== null && !job.currentStageEnteredAt; // fallback = approximate
  const stageTimerRow = stageMins !== null
    ? `<div class="muted" style="font-size:var(--t-xs);margin-top:2px">In this stage: ${stageApprox ? '~' : ''}${formatDuration(Math.round(stageMins))}</div>`
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

  // Stage history helpers
  const sh = effectiveStageHistory(job);
  const moveCount = sh.length;
  const lastMove = sh[sh.length - 1];
  const lastMoveRelative = lastMove?.enteredAt ? formatRelative(lastMove.enteredAt) : '';
  const lastMoveLine = lastMove ? `Moved to ${lastMove.label || lastMove.stage}${lastMoveRelative ? ` · ${lastMoveRelative}` : ''}` : '';

  // Collapsed warning pills (critical only)
  const warnPills = warnings.map((w) => `<span class="badge badge-red" style="font-size:9px;padding:1px 5px">${w}</span>`).join('');

  // Compact tech + bay line for collapsed view
  const techBayLine = `${techDisplayLabel(a)}${a.bayName ? ` · ${a.bayName}` : ' · No bay'}`;

  // Stage timer compact line for collapsed view
  const stageTimerCompact = stageMins !== null
    ? `${stageApprox ? '~' : ''}${formatDuration(Math.round(stageMins))} in stage`
    : null;
  const progressCompact = pct !== null ? `${formatDuration(elapsed)} / ${formatDuration(estMins)}` : null;
  const stageProgressLine = [stageTimerCompact, progressCompact].filter(Boolean).join(' · ');

  // ── Card footer ─────────────────────────────────────────────────────────────
  const assignedIds  = Array.isArray(a.assignedTechIds) ? a.assignedTechIds : (a.techId ? [a.techId] : []);
  const extraTechs   = Math.max(0, assignedIds.length - 1);
  const leadInitials = a.techName ? techInitials(a.techName) : null;
  const [avBg, avFg] = leadInitials ? techAvatarColors(a.techName) : ['#EBF0F7','#8A97AA'];
  const techAvatarHtml = leadInitials
    ? `<span class="wfb-av" style="background:${avBg};color:${avFg}" title="${a.techName}">${leadInitials}</span>${extraTechs > 0 ? `<span class="wfb-av-overflow">+${extraTechs}</span>` : ''}`
    : `<span class="wfb-av wfb-av-unassigned" title="Unassigned">–</span>`;
  // Compact timer: just duration, no "in stage" suffix
  const footerDuration = stageMins !== null
    ? `${stageApprox ? '~' : ''}${formatDuration(Math.round(stageMins))}`
    : (schedTime || null);
  const timerCls = tStatus === 'watch' ? 'is-watch' : tStatus === 'behind' ? 'is-behind' : tStatus === 'overdue' ? 'is-overdue' : '';
  const hasStats = noteCount > 0 || photoCount > 0 || rwRecord || warnings.length > 0;

  const cardFooterHtml = `
    <div class="wfb-card-footer">
      ${techAvatarHtml}
      ${hasStats ? `<span class="wfb-ft-divider"></span>` : ''}
      ${noteCount > 0 ? `<span class="wfb-ft-stat" title="${noteCount} note${noteCount !== 1 ? 's' : ''}"><span class="wfb-ft-stat-icon">💬</span>${noteCount}</span>` : ''}
      ${photoCount > 0 ? `<span class="wfb-ft-stat" title="${photoCount} photo${photoCount !== 1 ? 's' : ''}"><span class="wfb-ft-stat-icon">📷</span>${photoCount}</span>` : ''}
      ${rwRecord ? `<span class="wfb-ft-crown" title="Rewards ${rwTierLabel} · ${rwRecord.pointsBalance || 0} pts">👑</span>` : ''}
      ${warnings.length ? `<span class="wfb-ft-stat" style="color:#B91C1C" title="${warnings[0]}">⚠</span>` : ''}
      ${footerDuration ? `<span class="wfb-ft-timer${timerCls ? ` ${timerCls}` : ''}">${footerDuration}</span>` : ''}
    </div>`;

  const isExpanded = boardCardView === 'detailed' || expandedCards.has(a.id);
  const arrowLabel = isExpanded ? 'Collapse card details' : 'Expand card details';
  const handleArrow = isExpanded ? '⌃' : '⌄';

  return `
    <div class="wfb-card${mClass ? ` ${mClass}` : ''}" draggable="true" data-appt-id="${a.id}" style="border-left-color:${meta.color}">

      <!-- ── Top: RO, customer, vehicle, service, status ───────────────────── -->
      <div class="wfb-card-collapsed">
        <!-- 1. RO + Customer -->
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:2px">
          <span style="font-weight:700;font-size:var(--t-sm);color:var(--ink)">${a.roNumber || 'RO–'}</span>
          <span style="font-size:var(--t-sm);color:var(--ink-2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.customerName || 'Customer'}</span>
        </div>
        <!-- 2. Vehicle -->
        <div style="font-size:var(--t-xs);color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px">${a.vehicleLabel || 'Vehicle not assigned'}</div>
        <!-- 3. Service + status chips -->
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:3px">
          <span style="font-size:var(--t-xs);color:var(--ink-3);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${svc}</span>
          ${tbadge ? `<span class="badge ${tbadge.cls}" style="font-size:9px;padding:1px 4px;flex-shrink:0;${tbadge.style || ''}">${tbadge.label}</span>` : ''}
          ${warnPills}
        </div>
      </div>

      <!-- ── Expanded details ───────────────────────────────────────────────── -->
      <div class="wfb-card-expanded" style="${isExpanded ? '' : 'display:none'}">
        <div style="padding:6px 10px 4px;border-top:1px solid #F0F3F8">
          <div class="row between" style="margin-bottom:3px">
            <span style="font-size:var(--t-xs);color:var(--ink-3)">${techDisplayLabel(a)} · ${a.bayName || 'No bay'}</span>
            ${a.visitType ? `<span class="badge badge-gray" style="font-size:9px">${util.visitTypeLabel(a.visitType)}</span>` : ''}
          </div>
          <div class="row between" style="margin-bottom:3px">
            <span class="tnum" style="font-size:var(--t-xs);color:var(--ink-3)">${a.total ? util.fmtMoney(a.total) : '—'}</span>
            ${quote ? `<span class="badge ${util.quoteStatusMeta(quote.status).badgeClass}" style="font-size:9px">${util.quoteStatusMeta(quote.status).label}</span>` : ''}
            ${invoice ? `<span class="badge ${invoice.balance > 0 ? 'badge-amber' : 'badge-green'}" style="font-size:9px">${invoice.balance > 0 ? 'Balance due' : 'Paid'}</span>` : ''}
          </div>
          ${timingRow}
          ${arrivedRow}
          ${stageTimerRow}
          ${progressBlock}
          ${latestThumb ? `<div style="margin-top:6px;display:flex;align-items:center;gap:6px"><img src="${latestThumb}" style="width:44px;height:33px;object-fit:cover;border-radius:4px;border:1px solid #E8ECF2" alt="Latest photo"><span style="font-size:var(--t-xs);color:var(--ink-3)">${photoCount} photo${photoCount !== 1 ? 's' : ''}</span></div>` : ''}
          ${lastMoveLine ? `<div style="font-size:var(--t-xs);color:var(--ink-4);margin-top:4px">↔ ${lastMoveLine}</div>` : ''}
          ${latestNote ? `<div style="margin-top:5px;padding-top:5px;border-top:1px solid #F0F3F8;font-size:var(--t-xs)"><span style="color:var(--ink-3)">💬 ${latestNote.authorName || 'Note'}:</span> <span style="color:var(--ink-3)">${(latestNote.body || '').slice(0, 70)}${(latestNote.body || '').length > 70 ? '…' : ''}</span></div>` : ''}
          ${warnings.length ? `<div class="wfb-warn" style="display:flex;justify-content:space-between;align-items:center;gap:4px;margin-top:4px"><span>⚠ ${warnings[0]}${warnings.length > 1 ? ` +${warnings.length - 1} more` : ''}</span><span style="font-size:10px;color:var(--accent);font-weight:600;white-space:nowrap;cursor:pointer">Assign →</span></div>` : ''}
        </div>
      </div>

      <!-- ── Footer: people, counts, rewards, timer ────────────────────────── -->
      ${cardFooterHtml}

      <!-- ── Expand / collapse handle ──────────────────────────────────────── -->
      <div class="card-expand-handle" data-expanded="${isExpanded}" title="${arrowLabel}" role="button" aria-label="${arrowLabel}" aria-expanded="${isExpanded}">
        <span class="card-expand-arrow">${handleArrow}</span>
      </div>

    </div>`;
}

function bindApptCards(root) {
  // Expand/collapse handle — bind before card-level click so stopPropagation works
  root.querySelectorAll('.card-expand-handle').forEach((handle) => {
    handle.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = handle.closest('[data-appt-id]');
      if (!card) return;
      const id = card.dataset.apptId;
      const details = card.querySelector('.wfb-card-expanded');
      const arrow = handle.querySelector('.card-expand-arrow');
      const nowExpanded = handle.dataset.expanded === 'true';
      if (nowExpanded) {
        expandedCards.delete(id);
        if (details) details.style.display = 'none';
        handle.dataset.expanded = 'false';
        handle.setAttribute('aria-expanded', 'false');
        handle.title = 'Expand card details';
        handle.setAttribute('aria-label', 'Expand card details');
        if (arrow) arrow.textContent = '⌄';
      } else {
        expandedCards.add(id);
        if (details) details.style.display = '';
        handle.dataset.expanded = 'true';
        handle.setAttribute('aria-expanded', 'true');
        handle.title = 'Collapse card details';
        handle.setAttribute('aria-label', 'Collapse card details');
        if (arrow) arrow.textContent = '⌃';
      }
    });
  });

  // Card body click → drawer (expand button's stopPropagation keeps it from bubbling here)
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
  // Wire job cards (data-appt-id) and pending/booking cards (data-pending-id)
  root.querySelectorAll('.wfb-card[data-appt-id], .wfb-card[data-pending-id]').forEach((card) => {
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend',   () => card.classList.remove('dragging'));
  });
  root.querySelectorAll('.wfb-col').forEach((col) => {
    col.addEventListener('dragover',  (e) => { e.preventDefault(); col.classList.add('dragover'); });
    col.addEventListener('dragleave', ()  => col.classList.remove('dragover'));
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('dragover');
      const dragging = root.querySelector('.wfb-card.dragging');
      if (!dragging) return;
      const targetStage = col.dataset.stage;
      let finalJobId = dragging.dataset.apptId || null;
      let moveOk = false;

      try {
        if (dragging.dataset.pendingId) {
          // Pending booking → confirm it into a job first, then move to target stage
          const ro = util.confirmBooking(dragging.dataset.pendingId);
          finalJobId = ro.id;
          // If the target is estimates_requests (same lane), just confirm and stay there
          if (targetStage !== 'estimates_requests') {
            moveToStage(ro.id, targetStage, 'drag_drop');
          }
          toast('Request confirmed and moved.', 'success');
        } else {
          moveToStage(finalJobId, targetStage, 'drag_drop');
          toast('Moved.', 'success');
        }
        moveOk = true;
      } catch (err) { toast(err.message, 'error'); }

      renderAll();
      // Auto-open drawer when dropping into In Progress with no assignment
      if (moveOk && finalJobId && targetStage === 'in_progress') {
        const movedJob = db.jobById(finalJobId);
        if (movedJob && (!ensureAssignmentFields(movedJob).assignedTechIds.length || !movedJob.bayId)) {
          setTimeout(() => openDrawer(finalJobId), 60);
        }
      }
    });
  });
}

// ---------------------------------------------------------------------------
// DAY — Calendar View: time slots x technician/bay columns (unchanged logic
// from modules/appointments.js, kept as the secondary daily mode).
// ---------------------------------------------------------------------------
function renderDayCalendarView() {
  const r2t = document.getElementById('sb-r2-tools'); if (r2t) r2t.innerHTML = '';
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
  const r2t = document.getElementById('sb-r2-tools'); if (r2t) r2t.innerHTML = '';
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
  const r2t = document.getElementById('sb-r2-tools'); if (r2t) r2t.innerHTML = '';
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
// Photo lightbox viewer
// ---------------------------------------------------------------------------
function openPhotoViewer(photo, jobId) {
  const existing = document.getElementById('photo-viewer-overlay');
  if (existing) existing.remove();

  const catLabel    = PHOTO_CATEGORY_MAP[photo.category] || 'Other';
  const visLabel    = photo.isCustomerVisible ? 'Customer visible' : 'Internal only';
  const visBadgeCls = photo.isCustomerVisible ? 'badge-green' : 'badge-gray';
  const dateStr     = photo.createdAt ? new Date(photo.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const overlay = document.createElement('div');
  overlay.id = 'photo-viewer-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:1100;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:var(--s4)';
  overlay.innerHTML = `
    <div style="background:var(--card);border-radius:var(--r-panel);max-width:680px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--s4);border-bottom:1px solid var(--rule)">
        <div>
          <div style="font-weight:700;font-size:var(--t-md)">${photo.label || catLabel}</div>
          <div class="muted" style="font-size:var(--t-xs)">${photo.fileName || ''}${photo.sizeBytes ? ` · ${formatPhotoSize(photo.sizeBytes)}` : ''}</div>
        </div>
        <button id="photo-viewer-close" style="background:none;border:none;cursor:pointer;padding:var(--s2);color:var(--ink-3);font-size:20px;line-height:1" title="Close (Esc)" aria-label="Close photo viewer">×</button>
      </div>
      <div style="padding:var(--s4)">
        <img src="${photo.imageDataUrl}" style="width:100%;border-radius:var(--r-md);display:block;margin-bottom:var(--s4)" alt="${photo.label || catLabel}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--s3);margin-bottom:var(--s3)">
          <div><div class="muted" style="font-size:var(--t-xs);margin-bottom:2px">Category</div><span class="badge badge-gray">${catLabel}</span></div>
          <div><div class="muted" style="font-size:var(--t-xs);margin-bottom:2px">Visibility</div><span class="badge ${visBadgeCls}">${visLabel}</span></div>
          <div><div class="muted" style="font-size:var(--t-xs);margin-bottom:2px">Added</div><span style="font-size:var(--t-xs)">${dateStr}</span></div>
          <div><div class="muted" style="font-size:var(--t-xs);margin-bottom:2px">By</div><span style="font-size:var(--t-xs)">${photo.createdBy || '—'}</span></div>
        </div>
        ${photo.notes ? `<div style="margin-bottom:var(--s3)"><div class="muted" style="font-size:var(--t-xs);margin-bottom:2px">Notes</div><div style="font-size:var(--t-sm)">${photo.notes}</div></div>` : ''}
        <div style="display:flex;gap:var(--s2)">
          ${can('delete') ? `<button id="photo-viewer-delete" class="btn btn-danger btn-sm">Remove Photo</button>` : ''}
          <button id="photo-viewer-close2" class="btn btn-secondary btn-sm">Close</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.getElementById('photo-viewer-close')?.addEventListener('click', close);
  document.getElementById('photo-viewer-close2')?.addEventListener('click', close);

  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('remove', () => document.removeEventListener('keydown', onKey));

  document.getElementById('photo-viewer-delete')?.addEventListener('click', () => {
    try {
      removeJobPhoto(jobId, photo.id);
      close();
      // Refresh the grid if drawer is still open
      const grid = document.getElementById('drawer-photo-grid');
      if (grid) {
        const badge = document.getElementById('drawer-photo-badge');
        if (badge) badge.textContent = getJobPhotos(jobId).length;
        // Re-render grid by triggering a synthetic filter click is complex — just rebuild inline
        const photos = getJobPhotos(jobId);
        if (photos.length === 0) {
          grid.innerHTML = `<div class="muted" style="grid-column:1/-1;font-size:var(--t-xs);padding:var(--s2) 0">No photos yet.</div>`;
        } else {
          // Trigger full drawer refresh to keep filter state clean
          openDrawer(jobId);
        }
      }
      renderAll();
      toast('Photo removed', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ---------------------------------------------------------------------------
// Appointment detail drawer
// ---------------------------------------------------------------------------
function openDrawer(jobId, editMode = false) {
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

  // ── Assignment data ─────────────────────────────────────────────────────────
  // Stages where tech is expected; bay is strongly required only in_progress.
  const ASSIGN_TECH_STAGES = new Set(['dropped_off', 'waiting_bay', 'waiting_approval', 'waiting_parts', 'in_progress', 'quality_check', 'ready_for_pickup']);
  const techs = db.employees().filter((e) => e.isTech || ['technician', 'mechanic', 'apprentice'].includes(e.role));
  const bays  = db.bays();
  const ej = ensureAssignmentFields(job);
  const showAssign = !ej.assignedTechIds.length || !job.bayId;
  const drawerRwRecord = job.customerId ? db.customerRewardByCustomerId(job.customerId) : null;
  const drawerRwTierLabel = drawerRwRecord ? ({ vip: 'VIP', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' }[drawerRwRecord.tier] || 'Member') : null;

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

  const stageHistoryEntries = effectiveStageHistory(job);
  const stageHistoryHtml = stageHistoryEntries.map((entry, idx) => {
    const isCurrent = idx === stageHistoryEntries.length - 1 && !entry.exitedAt;
    const dotStyle = isCurrent ? 'background:var(--accent);box-shadow:0 0 0 3px rgba(31,94,224,.15)' : '';
    const enteredFmt = entry.enteredAt ? (util.fmtDateTime ? util.fmtDateTime(entry.enteredAt) : entry.enteredAt) : '—';
    const exitedFmt  = entry.exitedAt  ? (util.fmtDateTime ? util.fmtDateTime(entry.exitedAt)  : entry.exitedAt)  : null;
    const durFmt     = entry.durationMinutes != null ? formatDuration(entry.durationMinutes) : (isCurrent ? formatDuration(Math.round(getStageDurationMinutes(job) || 0)) + ' so far' : '—');
    const viaLabel   = { drag_drop: 'drag & drop', drawer_dropdown: 'dropdown', action_button: 'button', edit_mode: 'edit', walk_in_created: 'walk-in', pending_confirmed: 'confirmed', backfill: 'before tracking', unknown: '' }[entry.changedVia] || entry.changedVia || '';
    return `<div class="tl-item">
      <div class="tl-dot" style="${dotStyle}"></div>
      <div class="tl-body">
        <div class="tl-title" style="${isCurrent ? 'font-weight:700;color:var(--ink)' : ''}">${entry.label || entry.stage}${isCurrent ? ' <span class="badge badge-blue" style="font-size:9px;vertical-align:middle">current</span>' : ''}</div>
        <div class="tl-meta">${enteredFmt}${exitedFmt ? ` → ${exitedFmt}` : ''}${durFmt ? ` · ${durFmt}` : ''}${viaLabel ? ` · via ${viaLabel}` : ''}</div>
      </div>
    </div>`;
  }).join('');

  // ── Edit mode helpers ─────────────────────────────────────────────────────────
  const advisors = db.employees().filter((e) =>
    ['owner', 'general_manager', 'service_manager', 'advisor', 'front_desk'].includes(e.role)
  );
  const EDITABLE_STATUSES = [
    { v: 'scheduled',     l: 'Scheduled' },
    { v: 'waiting',       l: 'Waiting (checked in)' },
    { v: 'in_progress',   l: 'In Progress' },
    { v: 'on_hold',       l: 'On Hold' },
    { v: 'quality_check', l: 'Quality Check' },
    { v: 'ready',         l: 'Ready for Pickup' },
    { v: 'invoiced',      l: 'Invoiced' },
    { v: 'completed',     l: 'Completed' },
    { v: 'cancelled',     l: 'Cancelled' },
  ];
  const APPROVAL_STATUSES = [
    { v: '',          l: 'Not applicable' },
    { v: 'pending',   l: 'Pending approval' },
    { v: 'approved',  l: 'Approved' },
    { v: 'rejected',  l: 'Rejected' },
  ];
  // Vehicle description for editing (walk-in uses plain text; CRM vehicles show compound)
  const vehicleEditValue = job.walkInVehicle || a.vehicleLabel || '';
  const isWalkIn = job.workflowStatus === 'walk_in' || job.status === 'walk_in';

  // ── Drawer section helpers ────────────────────────────────────────────────────
  const dSection = (title, body, badge = '') => `
    <div class="drawer-section">
      <div class="drawer-section-head">
        <span class="drawer-section-title">${title}</span>${badge ? `<span>${badge}</span>` : ''}
      </div>
      <div>${body}</div>
    </div>`;
  const dRow = (label, value) =>
    `<div class="drawer-drow"><span class="drawer-drow-label">${label}</span><span class="drawer-drow-value">${value}</span></div>`;

  // ── Shared read-only sections E–I (identical in view and edit) ────────────────

  // E. Timing
  const timingActionBtns = [
    can('edit') && !tj.checkedInAt && !tj.droppedOffAt ? `<button class="btn btn-secondary btn-sm" id="drawer-stamp-checkin">Stamp Check-in</button>` : '',
    can('edit') && job.status === 'in_progress' && !tj.workStartedAt ? `<button class="btn btn-secondary btn-sm" id="drawer-stamp-start">Stamp Work Started</button>` : '',
    can('edit') && job.status === 'in_progress' && tj.workStartedAt && !tj.workPausedAt ? `<button class="btn btn-secondary btn-sm" id="drawer-stamp-pause">Pause</button>` : '',
    can('edit') && job.status === 'in_progress' && tj.workPausedAt ? `<button class="btn btn-secondary btn-sm" id="drawer-stamp-resume">Resume</button>` : '',
    can('edit') && ['ready', 'invoiced'].includes(job.status) && !tj.pickedUpAt ? `<button class="btn btn-secondary btn-sm" id="drawer-stamp-pickup">Mark Picked Up</button>` : '',
  ].filter(Boolean).join('');
  const sectionE = dSection('Timing', `
    ${timingRows}
    ${progressHtml}
    ${timingActionBtns ? `<div class="row wrapf" style="gap:var(--s2);margin-top:var(--s2)">${timingActionBtns}</div>` : ''}
    <div class="timeline" style="margin-top:var(--s3)">${historyHtml}</div>
  `);

  // F. Photos
  const sectionF = dSection('Photos', `
    <div id="drawer-photos-root">
      <div id="drawer-photo-filters" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:var(--s2)">
        <button class="btn btn-secondary btn-sm active" data-pf="all" style="font-size:var(--t-xs);padding:3px 10px">All</button>
        ${PHOTO_CATEGORIES.map((cat) => `<button class="btn btn-secondary btn-sm" data-pf="${cat.id}" style="font-size:var(--t-xs);padding:3px 10px">${cat.label}</button>`).join('')}
      </div>
      <div id="drawer-photo-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:var(--s3)"></div>
      <div style="border-top:1px solid var(--rule);padding-top:var(--s3)">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--s2);margin-bottom:var(--s2)">
          <div class="field" style="margin:0">
            <label class="label" style="font-size:var(--t-xs)">Category</label>
            <select class="select" id="drawer-photo-category">
              ${PHOTO_CATEGORIES.map((cat) => `<option value="${cat.id}">${cat.label}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="margin:0">
            <label class="label" style="font-size:var(--t-xs)">Notes</label>
            <input type="text" class="input" id="drawer-photo-notes" placeholder="Optional label">
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:var(--s2);font-size:var(--t-xs);cursor:pointer;margin-bottom:var(--s2)">
          <input type="checkbox" id="drawer-photo-visible"> Customer visible
        </label>
        <label class="btn btn-secondary btn-sm" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Add Photos
          <input type="file" id="drawer-photo-input" accept="image/*" multiple style="display:none">
        </label>
        <span id="drawer-photo-upload-status" style="font-size:var(--t-xs);color:var(--ink-3);margin-left:var(--s2)"></span>
      </div>
    </div>
  `, `<span id="drawer-photo-badge" class="badge badge-gray" style="font-size:9px">${(job.photos || []).length || 0}</span>`);

  // G. Stage History
  const sectionG = dSection('Stage History', `<div class="timeline">${stageHistoryHtml}</div>`);

  // J. Team Notes
  const jobColabNotes = Array.isArray(job.colabNotes) ? job.colabNotes : [];
  const jobNoteCount  = jobColabNotes.length;
  const notesListHtml = jobNoteCount === 0
    ? `<div class="muted" style="font-size:var(--t-xs);padding:var(--s2) 0">No notes yet. Add one below.</div>`
    : jobColabNotes.slice().reverse().map((n) => {
        const visBadge = n.visibility === 'customer_visible'
          ? `<span class="badge badge-green" style="font-size:9px;padding:1px 4px">Customer visible</span>`
          : `<span class="badge badge-gray" style="font-size:9px;padding:1px 4px">Internal</span>`;
        const safeBody = (n.body || '').replace(/</g, '&lt;').replace(/@(\w+)/g, '<span class="note-mention">@$1</span>');
        const timeStr  = n.createdAt ? formatRelative(n.createdAt) : '';
        return `<div class="collab-note">
          <div class="collab-note-meta">
            <span style="font-weight:600;font-size:var(--t-xs)">${n.authorName || 'Unknown'}</span>
            <span class="muted" style="font-size:var(--t-xs)">${timeStr}</span>
            ${visBadge}
          </div>
          <div class="collab-note-body">${safeBody}</div>
        </div>`;
      }).join('');
  const sectionJ = dSection('Team Notes', `
    <div id="note-list" style="margin-bottom:var(--s3)">${notesListHtml}</div>
    <div style="border-top:1px solid var(--rule);padding-top:var(--s3)">
      <textarea id="note-composer" class="input" rows="2" placeholder="Add an internal note or update for the team…" style="font-size:var(--t-13);resize:vertical;min-height:56px;width:100%"></textarea>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:var(--s2)">
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--t-xs);color:var(--ink-3);cursor:pointer">
          <input type="checkbox" id="note-customer-visible"> Customer visible
        </label>
        <button class="btn btn-secondary btn-sm" id="note-add-btn" style="font-size:var(--t-xs)">Add Note</button>
      </div>
      <div class="muted" style="font-size:var(--t-xs);margin-top:4px">Tip: use @Name to mention a team member.</div>
    </div>
    <!-- TODO: Supabase production — job_notes (RLS by shop_id), job_activity_events, job_mentions, notifications tables; Supabase Realtime for live board updates; role-based note visibility; notification delivery; audit trail -->
  `, jobNoteCount > 0 ? `<span class="badge badge-gray" style="font-size:9px">💬 ${jobNoteCount}</span>` : '');

  // H. Activity
  const jobColabActivity = Array.isArray(job.colabActivity) ? job.colabActivity : [];
  const ACTIVITY_ICON = { stage_changed: '→', note_added: '💬', assignment_changed: '👤', bay_changed: '🅿', photo_added: '📷', job_created: '✦' };
  const allEvents = [
    { id: 'act_created', type: 'job_created', label: 'Job created', actorId: null, actorName: null, createdAt: job.createdAt || null, metadata: {} },
    ...jobColabActivity,
  ].filter((e) => e.createdAt).sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt));
  const activityHtml = allEvents.length
    ? allEvents.map((ev) => {
        const icon    = ACTIVITY_ICON[ev.type] || '·';
        const actor   = ev.actorName ? `<span style="font-weight:600">${ev.actorName}</span>` : '<span class="muted">System</span>';
        const timeStr = ev.createdAt ? formatRelative(ev.createdAt) : '';
        return `<div class="tl-item">
          <div class="tl-dot"></div>
          <div class="tl-body">
            <div class="tl-title">${icon} ${ev.label || ev.type}</div>
            <div class="tl-meta">${actor}${timeStr ? ` · ${timeStr}` : ''}</div>
          </div>
        </div>`;
      }).join('')
    : `<div class="tl-item"><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">No activity recorded yet</div></div></div>`;
  const sectionH = dSection('Activity', `<div class="timeline">${activityHtml}</div>`,
    jobColabActivity.length > 0 ? `<span class="badge badge-gray" style="font-size:9px">${allEvents.length}</span>` : '');

  // I. Actions
  const sectionI = dSection('Actions', `
    <div style="margin-bottom:var(--s3)">
      <div class="drawer-drow-label" style="font-size:var(--t-xs);margin-bottom:4px">Move to Stage</div>
      <select class="select" id="drawer-stage-select">
        ${WORKFLOW_STAGES.concat([STAGE_META.cancelled, STAGE_META.no_show]).map((s) =>
          `<option value="${s.id}"${a.workflowStage === s.id ? ' selected' : ''}>${s.label}</option>`
        ).join('')}
      </select>
    </div>
    <div class="row wrapf" style="gap:var(--s2)">
      ${can('edit') && !util.isROLocked(job) ? `<button class="btn btn-secondary btn-sm" id="drawer-reschedule">Reschedule</button>` : ''}
      ${can('edit') && (['estimates_requests', 'walk_in'].includes(a.workflowStage) || job.status === 'scheduled') ? `<button class="btn btn-primary btn-sm" id="drawer-checkin">${job.status === 'scheduled' ? 'Check In' : 'Check In / Drop Off'}</button>` : ''}
      ${can('edit') && a.workflowStage === 'estimates_requests' ? `<button class="btn btn-secondary btn-sm" id="drawer-convert-walkin">Convert to Walk-In</button>` : ''}
      ${can('edit') && job.approvalStatus !== 'pending' ? `<button class="btn btn-secondary btn-sm" id="drawer-waiting-approval">Mark Waiting Approval</button>` : ''}
      ${can('edit') && job.status === 'in_progress' ? `<button class="btn btn-secondary btn-sm" id="drawer-waiting-parts">Mark Waiting Parts</button>` : ''}
      ${can('edit') && (['waiting', 'on_hold', 'walk_in'].includes(job.status) || a.workflowStage === 'waiting_bay') ? `<button class="btn btn-secondary btn-sm" id="drawer-in-progress">Start Work / In Progress</button>` : ''}
      ${can('edit') && job.status === 'in_progress' ? `<button class="btn btn-secondary btn-sm" id="drawer-quality-check">Mark Quality Check</button>` : ''}
      ${can('edit') && ['in_progress', 'quality_check'].includes(job.status) ? `<button class="btn btn-secondary btn-sm" id="drawer-ready">Mark Ready for Pickup</button>` : ''}
      ${can('edit') && (job.status === 'ready' || deriveWorkflowStage(job) === 'ready_for_pickup') ? `<button class="btn btn-primary btn-sm" id="drawer-pickedup">Mark Picked Up / Closed</button>` : ''}
      ${can('delete') && job.status === 'scheduled' ? `<button class="btn btn-secondary btn-sm" id="drawer-noshow">Mark No-Show</button>` : ''}
      ${can('delete') && !util.isROLocked(job) ? `<button class="btn btn-danger btn-sm" id="drawer-cancel">Cancel</button>` : ''}
      <button class="btn btn-secondary btn-sm" id="drawer-open-ro">Open Repair Order</button>
      <button class="btn btn-secondary btn-sm" id="drawer-open-quote">${quote ? 'Open Quote' : 'Create Quote'}</button>
      <button class="btn btn-secondary btn-sm" id="drawer-open-invoice">${invoice ? 'Open Invoice' : 'Create Invoice'}</button>
      <button class="btn btn-secondary btn-sm" id="drawer-reminder">Send Reminder Preview</button>
    </div>
  `);

  // ── A. Job Summary (view) ─────────────────────────────────────────────────────
  const sectionA_view = dSection('Job Summary', `
    ${dRow('Customer', a.customerName || 'Not assigned')}
    ${drawerRwRecord ? dRow('Rewards', `<span class="badge rw-crown-chip">👑 ${drawerRwTierLabel}</span> · ${(drawerRwRecord.pointsBalance || 0).toLocaleString()} pts`) : ''}
    ${c?.phone ? dRow('Phone', c.phone) : ''}
    ${c?.email ? dRow('Email', c.email) : ''}
    ${dRow('Vehicle', a.vehicleLabel || 'Not assigned')}
    ${dRow('Services', a.services.join(', ') || 'No service listed')}
    ${job.notes ? `<div style="margin-top:var(--s2)"><div class="drawer-drow-label" style="font-size:var(--t-xs);margin-bottom:3px">Notes</div><div style="background:var(--canvas);border-radius:var(--r-md);padding:var(--s3);font-size:var(--t-13)">${job.notes}</div></div>` : ''}
  `);

  // ── B. Schedule & Status (view) ───────────────────────────────────────────────
  const sectionB_view = dSection('Schedule & Status', `
    ${dRow('Date / Time', `${util.fmtDate(a.date)} · ${a.startTime ? util.fmtTime(a.startTime) : '—'}`)}
    ${dRow('Duration', `~${Math.round(a.duration)} min`)}
    ${dRow('Workflow Stage', `<span class="badge" style="background:${stageMeta.color}22;color:${stageMeta.color}">${stageMeta.label}</span>`)}
    ${dRow('Exact Status', `<span class="badge ${meta.badgeClass}">${meta.label}</span>`)}
    ${tbadge ? dRow('Timing', `<span class="badge ${tbadge.cls}" style="${tbadge.style || ''}">${tbadge.label}</span>`) : ''}
    ${dRow('Approval', job.approvalStatus || 'Not applicable')}
  `);

  // ── C. Assignment (view) ──────────────────────────────────────────────────────
  const additionalTechsLabel = ej.assignedTechIds.length > 1
    ? ej.assignedTechIds.slice(1).map((id) => { const t = db.employeeById(id); return t ? `${t.firstName} ${t.lastName[0]}.` : id; }).join(', ')
    : null;
  const sectionC_view = dSection('Assignment', `
    ${dRow('Advisor', advisor ? `${advisor.firstName} ${advisor.lastName}` : '—')}
    ${dRow('Lead tech', a.techName || 'Unassigned tech')}
    ${additionalTechsLabel ? dRow('Also assigned', additionalTechsLabel) : ''}
    ${dRow('Bay', a.bayName || 'No bay assigned')}
    ${warnings.length ? `<div class="alert alert-amber" style="margin-top:var(--s2)">⚠ ${warnings.join(' · ')}</div>` : ''}
    ${showAssign ? `
      <div id="drawer-assign-section" style="margin-top:var(--s3);padding-top:var(--s3);border-top:1px solid var(--rule)">
        <div class="field">
          <label class="label" style="font-size:var(--t-xs)">Lead tech</label>
          <select class="select" id="drawer-assign-lead-tech">
            <option value="">Unassigned tech</option>
            ${techs.map((t) => `<option value="${t.id}"${t.id === ej.leadTechId ? ' selected' : ''}>${t.firstName} ${t.lastName}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="label" style="font-size:var(--t-xs)">Additional techs</label>
          <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
            ${techs.map((t) => `<label style="display:flex;align-items:center;gap:var(--s2);font-size:var(--t-13);cursor:pointer"><input type="checkbox" value="${t.id}" class="drawer-additional-tech"${ej.assignedTechIds.includes(t.id) && t.id !== ej.leadTechId ? ' checked' : ''}> ${t.firstName} ${t.lastName}</label>`).join('')}
          </div>
        </div>
        <div class="field">
          <label class="label" style="font-size:var(--t-xs)">Bay</label>
          <select class="select" id="drawer-assign-bay">
            <option value="">No bay assigned</option>
            ${bays.map((b) => `<option value="${b.id}"${b.id === job.bayId ? ' selected' : ''}>${b.name}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary btn-sm" id="drawer-save-assign">Save Assignment</button>
      </div>` : ''}
  `);

  // ── D. Financial (view) ───────────────────────────────────────────────────────
  const sectionD_view = dSection('Financial', `
    <div class="drawer-drow">
      <span class="drawer-drow-label">Linked Quote</span>
      <span class="drawer-drow-value">${quote
        ? `${quote.quoteNumber} · <span class="badge ${util.quoteStatusMeta(quote.status).badgeClass}" style="font-size:10px">${util.quoteStatusMeta(quote.status).label}</span>`
        : '<span class="muted">No quote linked</span>'}</span>
    </div>
    <div class="drawer-drow" style="margin-top:3px">
      <span class="drawer-drow-label">Linked Invoice</span>
      <span class="drawer-drow-value">${invoice
        ? `${invoice.number} · <span class="badge ${invoice.balance > 0 ? 'badge-amber' : 'badge-green'}" style="font-size:10px">${invoice.balance > 0 ? 'Balance due' : 'Paid'}</span>`
        : '<span class="muted">No invoice linked</span>'}</span>
    </div>
  `);

  // ── viewDetailsHtml ───────────────────────────────────────────────────────────
  const viewDetailsHtml = sectionA_view + sectionB_view + sectionC_view + sectionD_view + sectionE + sectionF + sectionG + sectionJ + sectionH + sectionI;

  // ── Edit mode section A (Job Summary fields) ──────────────────────────────────
  const sectionA_edit = dSection('Job Summary', `
    <div id="drawer-edit-errors" class="alert alert-red" style="display:none;margin-bottom:var(--s3)"></div>
    <div class="field">
      <label class="label" style="font-size:var(--t-xs)">Customer name</label>
      <input type="text" class="input drawer-edit-input" id="de-name" value="${(a.customerName || '').replace(/"/g, '&quot;')}" placeholder="Customer name">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--s2)">
      <div class="field" style="margin:0">
        <label class="label" style="font-size:var(--t-xs)">Phone</label>
        <input type="tel" class="input drawer-edit-input" id="de-phone" value="${(c?.phone || '').replace(/"/g, '&quot;')}" placeholder="555-000-0000">
      </div>
      <div class="field" style="margin:0">
        <label class="label" style="font-size:var(--t-xs)">Email</label>
        <input type="email" class="input drawer-edit-input" id="de-email" value="${(c?.email || '').replace(/"/g, '&quot;')}" placeholder="email@example.com">
      </div>
    </div>
    <div class="field">
      <label class="label" style="font-size:var(--t-xs)">Vehicle ${isWalkIn ? '' : '<span class="muted" style="font-weight:400">(year make model)</span>'}</label>
      <input type="text" class="input drawer-edit-input" id="de-vehicle" value="${vehicleEditValue.replace(/"/g, '&quot;')}" placeholder="e.g. 2018 Toyota Camry">
    </div>
    <div class="field">
      <label class="label" style="font-size:var(--t-xs)">Concern / notes</label>
      <textarea class="input drawer-edit-input" id="de-notes" rows="2" placeholder="Customer concern or internal notes">${(job.notes || '').replace(/</g, '&lt;')}</textarea>
    </div>
  `);

  // ── Edit mode section B (Schedule & Status fields) ────────────────────────────
  const sectionB_edit = dSection('Schedule & Status', `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--s2)">
      <div class="field" style="margin:0">
        <label class="label" style="font-size:var(--t-xs)">Date</label>
        <input type="date" class="input drawer-edit-input" id="de-date" value="${job.scheduledDate || ''}">
      </div>
      <div class="field" style="margin:0">
        <label class="label" style="font-size:var(--t-xs)">Time</label>
        <input type="time" class="input drawer-edit-input" id="de-time" value="${job.scheduledTime || ''}">
      </div>
      <div class="field" style="margin:0">
        <label class="label" style="font-size:var(--t-xs)">Duration (min)</label>
        <input type="number" class="input drawer-edit-input" id="de-duration" value="${estMins}" min="5" max="600" step="5">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--s2)">
      <div class="field" style="margin:0">
        <label class="label" style="font-size:var(--t-xs)">Workflow Stage</label>
        <select class="select drawer-edit-select" id="de-stage">
          ${WORKFLOW_STAGES.concat([STAGE_META.cancelled, STAGE_META.no_show]).map((s) =>
            `<option value="${s.id}"${a.workflowStage === s.id ? ' selected' : ''}>${s.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field" style="margin:0">
        <label class="label" style="font-size:var(--t-xs)">Exact Status</label>
        <select class="select drawer-edit-select" id="de-status">
          ${EDITABLE_STATUSES.map((s) => `<option value="${s.v}"${job.status === s.v ? ' selected' : ''}>${s.l}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field">
      <label class="label" style="font-size:var(--t-xs)">Approval status</label>
      <select class="select drawer-edit-select" id="de-approval">
        ${APPROVAL_STATUSES.map((s) => `<option value="${s.v}"${(job.approvalStatus || '') === s.v ? ' selected' : ''}>${s.l}</option>`).join('')}
      </select>
    </div>
  `);

  // ── Edit mode section C (Assignment fields) ───────────────────────────────────
  const sectionC_edit = dSection('Assignment', `
    <div class="field">
      <label class="label" style="font-size:var(--t-xs)">Advisor</label>
      <select class="select drawer-edit-select" id="de-advisor">
        <option value="">No advisor</option>
        ${advisors.map((e) => `<option value="${e.id}"${e.id === job.advisorId ? ' selected' : ''}>${e.firstName} ${e.lastName}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label class="label" style="font-size:var(--t-xs)">Lead tech</label>
      <select class="select drawer-edit-select" id="de-lead-tech">
        <option value="">Unassigned</option>
        ${techs.map((t) => `<option value="${t.id}"${t.id === ej.leadTechId ? ' selected' : ''}>${t.firstName} ${t.lastName}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label class="label" style="font-size:var(--t-xs)">Additional techs</label>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px;padding:var(--s2) var(--s3);background:#fff;border:1.5px solid #93C5FD;border-radius:var(--r-md)">
        ${techs.map((t) => `<label style="display:flex;align-items:center;gap:var(--s2);font-size:var(--t-13);cursor:pointer"><input type="checkbox" value="${t.id}" class="de-extra-tech"${ej.assignedTechIds.includes(t.id) && t.id !== ej.leadTechId ? ' checked' : ''}> ${t.firstName} ${t.lastName}</label>`).join('')}
      </div>
    </div>
    <div class="field">
      <label class="label" style="font-size:var(--t-xs)">Bay</label>
      <select class="select drawer-edit-select" id="de-bay">
        <option value="">No bay assigned</option>
        ${bays.map((b) => `<option value="${b.id}"${b.id === job.bayId ? ' selected' : ''}>${b.name}</option>`).join('')}
      </select>
    </div>
    ${warnings.length ? `<div class="alert alert-amber">⚠ ${warnings.join(' · ')}</div>` : ''}
  `);

  // ── editDetailsHtml ───────────────────────────────────────────────────────────
  const editDetailsHtml = `
    <div class="drawer-edit-mode">
      <div class="drawer-edit-actions">
        <span class="edit-mode-chip">Editing</span>
        <div style="display:flex;gap:var(--s2)">
          <button class="btn btn-primary btn-sm" id="drawer-save-details">Save Changes</button>
          <button class="btn btn-secondary btn-sm" id="drawer-cancel-edit">Cancel</button>
        </div>
      </div>
      ${sectionA_edit}${sectionB_edit}${sectionC_edit}${sectionE}${sectionF}${sectionG}${sectionJ}${sectionH}${sectionI}
      <div style="display:flex;gap:var(--s2);padding-top:var(--s3);border-top:1px solid var(--rule);margin-top:var(--s2)">
        <button class="btn btn-primary btn-sm" id="drawer-save-details-bottom">Save Changes</button>
        <button class="btn btn-secondary btn-sm" id="drawer-cancel-edit-bottom">Cancel</button>
      </div>
    </div>`;

  // ── Set header ────────────────────────────────────────────────────────────────
  document.getElementById('drawer-title').textContent = `${job.ro || 'Appointment'} — ${a.customerName || 'Customer not assigned'}`;
  const subtitleEl = document.getElementById('drawer-subtitle');
  if (subtitleEl) {
    const vehiclePart = a.vehicleLabel || '';
    const stagePart = `<span class="badge" style="background:${stageMeta.color}22;color:${stageMeta.color};font-size:10px">${stageMeta.label}</span>`;
    const timingPart = tbadge ? `<span class="badge ${tbadge.cls}" style="${tbadge.style || ''};font-size:10px">${tbadge.label}</span>` : '';
    subtitleEl.innerHTML = [vehiclePart, stagePart, timingPart].filter(Boolean).join(' · ');
  }
  const headerActionsEl = document.getElementById('drawer-header-actions');
  if (headerActionsEl) {
    headerActionsEl.innerHTML = can('edit') && !editMode
      ? `<button class="btn btn-secondary btn-sm" id="drawer-edit-details" style="font-size:var(--t-xs)">Edit Details</button>`
      : '';
  }

  // ── Set body ──────────────────────────────────────────────────────────────────
  document.getElementById('drawer-body').innerHTML = `<div class="stack">${editMode ? editDetailsHtml : viewDetailsHtml}</div>`;

  const run = (fn, msg) => { try { fn(); toast(msg, 'success'); closeDrawer(); renderAll(); } catch (e) { toast(e.message, 'error'); } };
  const stamp = (eventType, force = false) => { try { stampTimingEvent(job.id, eventType, force); } catch (e) { /* non-fatal */ } };

  // ── Edit Details button ───────────────────────────────────────────────────────
  document.getElementById('drawer-edit-details')?.addEventListener('click', () => openDrawer(jobId, true));

  // ── Add Note handler ─────────────────────────────────────────────────────────
  document.getElementById('note-add-btn')?.addEventListener('click', () => {
    const body = (document.getElementById('note-composer')?.value || '').trim();
    if (!body) { toast('Note is empty — type something first.', 'error'); return; }
    const isCustomerVisible = document.getElementById('note-customer-visible')?.checked ?? false;
    const actor = getCurrentActor();
    const mentions = [...body.matchAll(/@(\w+)/g)].map((m) => m[1]);
    appendJobNote(job.id, {
      id: nextCollabId('note'),
      type: 'comment',
      body,
      visibility: isCustomerVisible ? 'customer_visible' : 'internal',
      authorId: actor.id,
      authorName: actor.name,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      mentions,
    });
    appendJobActivity(job.id, {
      id: nextCollabId('act'),
      type: 'note_added',
      label: `Added ${isCustomerVisible ? 'customer-visible' : 'internal'} note`,
      actorId: actor.id,
      actorName: actor.name,
      createdAt: new Date().toISOString(),
      metadata: { visibility: isCustomerVisible ? 'customer_visible' : 'internal', mentions },
    });
    toast('Note added', 'success');
    openDrawer(jobId, editMode); // refresh drawer in same mode
  });

  // ── Save / Cancel edit handlers ───────────────────────────────────────────────
  const handleSaveDetails = () => {
    const errEl = document.getElementById('drawer-edit-errors');
    const errors = [];

    // Read form values
    const newName     = document.getElementById('de-name')?.value?.trim() || '';
    const newPhone    = document.getElementById('de-phone')?.value?.trim() || '';
    const newEmail    = document.getElementById('de-email')?.value?.trim() || '';
    const newVehicle  = document.getElementById('de-vehicle')?.value?.trim() || '';
    const newNotes    = document.getElementById('de-notes')?.value || '';
    const newDate     = document.getElementById('de-date')?.value || '';
    const newTime     = document.getElementById('de-time')?.value || '';
    const newDuration = parseInt(document.getElementById('de-duration')?.value || '0', 10);
    const newStage    = document.getElementById('de-stage')?.value || a.workflowStage;
    const newStatus   = document.getElementById('de-status')?.value || job.status;
    const newAdvisor  = document.getElementById('de-advisor')?.value || '';
    const newLeadTech = document.getElementById('de-lead-tech')?.value || '';
    const extraTechs  = [...document.querySelectorAll('.de-extra-tech:checked')].map((cb) => cb.value);
    const newBay      = document.getElementById('de-bay')?.value || '';
    const newApproval = document.getElementById('de-approval')?.value || '';

    // Validation
    if (!newName) errors.push('Customer name is required.');
    if (newDuration < 5) errors.push('Duration must be at least 5 minutes.');
    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) errors.push('Email format looks invalid.');
    if (newLeadTech && !db.employeeById(newLeadTech)) errors.push('Selected lead tech not found.');
    if (newBay && !db.bayById(newBay)) errors.push('Selected bay not found.');

    if (errors.length) {
      if (errEl) { errEl.textContent = errors.join(' '); errEl.style.display = ''; }
      return;
    }
    if (errEl) errEl.style.display = 'none';

    try {
      // ── Update customer record ───────────────────────────────────────────────
      if (job.customerId) {
        const customers = db.customers();
        const ci = customers.findIndex((cu) => cu.id === job.customerId);
        if (ci >= 0) {
          customers[ci] = { ...customers[ci], name: newName };
          if (newPhone) customers[ci].phone = newPhone;
          if (newEmail) customers[ci].email = newEmail;
          db.saveCustomers(customers);
        }
      }

      // ── Update vehicle record ────────────────────────────────────────────────
      // For walk-ins: update walkInVehicle on the job.
      // For CRM vehicles: update the vehicle's description / mileage note.
      // We parse "year make model" loosely into the existing vehicle record.
      let vehiclePatch = {};
      if (isWalkIn) {
        vehiclePatch = { walkInVehicle: newVehicle };
      } else if (job.vehicleId && newVehicle) {
        const vehicles = db.vehicles();
        const vi = vehicles.findIndex((v) => v.id === job.vehicleId);
        if (vi >= 0) {
          // Try to parse "YYYY Make Model" — update what we can, leave VIN alone
          const parts = newVehicle.trim().split(/\s+/);
          const yearNum = parts[0] && /^\d{4}$/.test(parts[0]) ? parseInt(parts[0], 10) : null;
          if (yearNum && parts.length >= 3) {
            vehicles[vi] = { ...vehicles[vi], year: yearNum, make: parts[1], model: parts.slice(2).join(' ') };
          } else if (parts.length >= 2) {
            vehicles[vi] = { ...vehicles[vi], make: parts[0], model: parts.slice(1).join(' ') };
          }
          db.saveVehicles(vehicles);
        }
      }

      // ── Build assignment arrays ──────────────────────────────────────────────
      const assignedTechIds = newLeadTech
        ? [newLeadTech, ...extraTechs.filter((id) => id !== newLeadTech)]
        : extraTechs;

      // ── Derive updated timing fields ─────────────────────────────────────────
      const scheduledStartAt = newDate && newTime ? `${newDate}T${newTime}:00` : (newDate ? `${newDate}T09:00:00` : job.scheduledStartAt || null);
      const scheduledEndAt   = scheduledStartAt && newDuration ? new Date(new Date(scheduledStartAt).getTime() + newDuration * 60000).toISOString() : null;

      // ── Patch the job record ─────────────────────────────────────────────────
      const jobs = db.jobs();
      const idx  = jobs.findIndex((j) => j.id === job.id);
      if (idx < 0) throw new Error('Job not found');

      const walkInName = isWalkIn ? newName : jobs[idx].walkInCustomerName;
      jobs[idx] = {
        ...jobs[idx],
        // Customer/vehicle
        walkInCustomerName: walkInName,
        ...vehiclePatch,
        // Schedule
        scheduledDate:      newDate      || jobs[idx].scheduledDate,
        scheduledTime:      newTime      || jobs[idx].scheduledTime,
        estimatedMinutes:   newDuration  || jobs[idx].estimatedMinutes,
        scheduledStartAt,
        scheduledEndAt,
        // Assignment
        advisorId:          newAdvisor   || null,
        leadTechId:         newLeadTech  || null,
        techId:             newLeadTech  || null,  // keep legacy field in sync
        assignedTechIds,
        bayId:              newBay       || null,
        // Misc
        notes:              newNotes,
        approvalStatus:     newApproval  || null,
        // Exact status — only update if user changed it and it's different
        ...(newStatus !== job.status ? { status: newStatus } : {}),
      };
      db.saveJobs(jobs);

      // ── Stage change: run through canonical moveToStage ─────────────────────
      if (newStage !== a.workflowStage) {
        try { moveToStage(job.id, newStage, 'edit_mode'); } catch (e) { /* non-fatal — soft fallback */ setJobWorkflowStatus(job.id, newStage); try { stampStageTransition(job.id, newStage, { label: STAGE_META[newStage]?.label || newStage, changedVia: 'edit_mode' }); } catch { /* non-fatal */ } }
      }

      toast('Details saved', 'success');
      renderAll();
      openDrawer(job.id, false); // reopen in view mode, drawer stays open
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const handleCancelEdit = () => openDrawer(jobId, false);

  ['drawer-save-details', 'drawer-save-details-bottom'].forEach((id) =>
    document.getElementById(id)?.addEventListener('click', handleSaveDetails)
  );
  ['drawer-cancel-edit', 'drawer-cancel-edit-bottom'].forEach((id) =>
    document.getElementById(id)?.addEventListener('click', handleCancelEdit)
  );

  // ── Save assignment handler ───────────────────────────────────────────────────
  document.getElementById('drawer-save-assign')?.addEventListener('click', () => {
    const leadTechId = document.getElementById('drawer-assign-lead-tech')?.value || null;
    const additionalTechs = [...document.querySelectorAll('.drawer-additional-tech:checked')].map((cb) => cb.value);
    const assignedTechIds = leadTechId
      ? [leadTechId, ...additionalTechs.filter((id) => id !== leadTechId)]
      : additionalTechs;
    const bayId  = document.getElementById('drawer-assign-bay')?.value || null;
    try {
      const jobs = db.jobs();
      const idx  = jobs.findIndex((j) => j.id === job.id);
      if (idx < 0) { toast('Job not found', 'error'); return; }
      // Sync lead/multi-tech + keep legacy techId in step
      jobs[idx] = { ...jobs[idx], leadTechId, assignedTechIds, techId: leadTechId, bayId };
      db.saveJobs(jobs);
      // Log assignment activity
      try {
        const actor = getCurrentActor();
        const parts = [];
        if (leadTechId) { const t = db.employeeById(leadTechId); if (t) parts.push(`${t.firstName} ${t.lastName} as lead tech`); }
        if (bayId) { const b = db.bayById(bayId); if (b) parts.push(`${b.name} as bay`); }
        if (parts.length) {
          appendJobActivity(job.id, {
            id: nextCollabId('act'),
            type: 'assignment_changed',
            label: `Assigned ${parts.join(', ')}`,
            actorId: actor.id,
            actorName: actor.name,
            createdAt: new Date().toISOString(),
            metadata: { leadTechId, bayId },
          });
        }
      } catch { /* non-fatal */ }
      toast('Assignment saved', 'success');
      closeDrawer();
      renderAll();
    } catch (e) { toast(e.message, 'error'); }
  });

  // ── Photos section ───────────────────────────────────────────────────────────
  let activePhotoFilter = 'all';

  function refreshPhotoGrid() {
    const photos = getJobPhotos(job.id);
    const filtered = activePhotoFilter === 'all' ? photos : photos.filter((p) => p.category === activePhotoFilter);
    const badge = document.getElementById('drawer-photo-badge');
    if (badge) badge.textContent = photos.length;
    const grid = document.getElementById('drawer-photo-grid');
    if (!grid) return;
    if (filtered.length === 0) {
      grid.innerHTML = `<div class="muted" style="grid-column:1/-1;font-size:var(--t-xs);padding:var(--s2) 0">No photos${activePhotoFilter !== 'all' ? ' in this category' : ' yet'}.</div>`;
      return;
    }
    grid.innerHTML = filtered.map((p) => `
      <div style="position:relative;cursor:pointer" data-photo-view="${p.id}" title="${p.label || PHOTO_CATEGORY_MAP[p.category] || 'Photo'}">
        <img src="${p.thumbnailDataUrl}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--r-chip);border:1px solid var(--rule);display:block" alt="${p.label || p.category}">
        <div style="position:absolute;bottom:0;left:0;right:0;padding:2px 4px;background:rgba(0,0,0,.45);border-radius:0 0 var(--r-chip) var(--r-chip);display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:9px;color:#fff;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${PHOTO_CATEGORY_MAP[p.category] || 'Other'}</span>
          ${p.isCustomerVisible ? '<span style="font-size:9px;color:#86efac">Visible</span>' : ''}
        </div>
        ${can('delete') ? `<button data-photo-remove="${p.id}" title="Remove photo" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.55);border:none;border-radius:50%;width:18px;height:18px;cursor:pointer;color:#fff;font-size:11px;line-height:18px;text-align:center;padding:0">×</button>` : ''}
      </div>`).join('');

    // Thumbnail click → lightbox
    grid.querySelectorAll('[data-photo-view]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-photo-remove]')) return;
        const photoId = el.dataset.photoView;
        const photo = getJobPhotos(job.id).find((p) => p.id === photoId);
        if (photo) openPhotoViewer(photo, job.id);
      });
    });

    // Remove button
    grid.querySelectorAll('[data-photo-remove]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const photoId = btn.dataset.photoRemove;
        try { removeJobPhoto(job.id, photoId); refreshPhotoGrid(); renderAll(); }
        catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  refreshPhotoGrid();

  // Category filter tabs
  document.getElementById('drawer-photo-filters')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pf]');
    if (!btn) return;
    activePhotoFilter = btn.dataset.pf;
    document.getElementById('drawer-photo-filters')?.querySelectorAll('[data-pf]').forEach((b) => b.classList.toggle('active', b.dataset.pf === activePhotoFilter));
    refreshPhotoGrid();
  });

  // File input → compress + attach
  document.getElementById('drawer-photo-input')?.addEventListener('change', async (e) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    const statusEl = document.getElementById('drawer-photo-upload-status');
    const category = document.getElementById('drawer-photo-category')?.value || 'other';
    const notes    = document.getElementById('drawer-photo-notes')?.value?.trim() || '';
    const isCustomerVisible = document.getElementById('drawer-photo-visible')?.checked ?? false;
    if (statusEl) statusEl.textContent = `Processing ${files.length} file${files.length !== 1 ? 's' : ''}…`;
    let added = 0;
    let errors = [];
    for (const file of files) {
      try {
        const record = await createPhotoRecord(file, { category, notes, isCustomerVisible });
        addJobPhoto(job.id, record);
        added++;
      } catch (err) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }
    e.target.value = ''; // reset so same file can be re-picked
    if (statusEl) statusEl.textContent = added > 0 ? `${added} photo${added !== 1 ? 's' : ''} added` : '';
    if (errors.length) toast(errors.join('\n'), 'error');
    if (added > 0) {
      try {
        const actor = getCurrentActor();
        appendJobActivity(job.id, {
          id: nextCollabId('act'),
          type: 'photo_added',
          label: `Added ${added} photo${added !== 1 ? 's' : ''}`,
          actorId: actor.id,
          actorName: actor.name,
          createdAt: new Date().toISOString(),
          metadata: { count: added, category },
        });
      } catch { /* non-fatal */ }
    }
    refreshPhotoGrid();
    renderAll(); // update card photo count on board
  });

  // Stage dropdown: move card to any visible lane directly
  document.getElementById('drawer-stage-select')?.addEventListener('change', (e) => {
    const targetStage = e.target.value;
    if (targetStage === a.workflowStage) return;
    run(() => moveToStage(job.id, targetStage, 'drawer_dropdown'), `Moved to ${STAGE_META[targetStage]?.label || targetStage}`);
  });

  document.getElementById('drawer-convert-walkin')?.addEventListener('click', () => {
    run(() => moveToStage(job.id, 'walk_in', 'action_button'), 'Converted to Walk-In');
  });

  document.getElementById('drawer-reschedule')?.addEventListener('click', () => openRescheduleModal(job.id));
  // Check In / Drop Off: handles both scheduled and request/walk_in starting points
  document.getElementById('drawer-checkin')?.addEventListener('click', () => {
    run(() => {
      if (job.status === 'scheduled') {
        util.checkIn(job.id);
        try { stampStageTransition(job.id, 'dropped_off', { label: 'Dropped Off / Checked In', changedVia: 'action_button' }); } catch { /* non-fatal */ }
      } else { moveToStage(job.id, 'dropped_off', 'action_button'); }
      stamp(job.visitType === 'drop_off' ? 'dropped_off' : 'checked_in');
    }, 'Checked in / dropped off');
  });
  document.getElementById('drawer-waiting-approval')?.addEventListener('click', () => run(() => {
    util.requestApproval(job.id);
    try { stampStageTransition(job.id, 'waiting_approval', { label: 'Waiting Approval', changedVia: 'action_button' }); } catch { /* non-fatal */ }
  }, 'Marked waiting approval'));
  document.getElementById('drawer-waiting-parts')?.addEventListener('click', () => run(() => moveToStage(job.id, 'waiting_parts', 'action_button'), 'Marked waiting on parts'));
  // Mark In Progress: try util.startJob first, fall back to soft move for walk-in/waiting_bay
  document.getElementById('drawer-in-progress')?.addEventListener('click', () => {
    run(() => {
      try { util.startJob(job.id, job.bayId, job.techId); }
      catch { setJobWorkflowStatus(job.id, 'in_progress'); }
      stamp('work_started');
      try { stampStageTransition(job.id, 'in_progress', { label: 'In Progress', changedVia: 'action_button' }); } catch { /* non-fatal */ }
    }, 'Marked in progress');
  });
  // Move to Quality Check: stamp stage transition
  document.getElementById('drawer-quality-check')?.addEventListener('click', () => {
    run(() => {
      util.moveToQualityCheck(job.id);
      try { stampStageTransition(job.id, 'quality_check', { label: 'Quality Check / Wrap Up', changedVia: 'action_button' }); } catch { /* non-fatal */ }
    }, 'Moved to Quality Check');
  });
  // Mark Ready: stamp work_completed + ready timing events; accepts quality_check too
  document.getElementById('drawer-ready')?.addEventListener('click', () => {
    run(() => {
      util.markReady(job.id);
      stamp('work_completed');
      stamp('ready');
      try { stampStageTransition(job.id, 'ready_for_pickup', { label: 'Ready for Pickup', changedVia: 'action_button' }); } catch { /* non-fatal */ }
    }, 'Marked ready for pickup');
  });
  // Mark Picked Up / Closed: soft workflowStatus override + stamp pickup time
  document.getElementById('drawer-pickedup')?.addEventListener('click', () => {
    run(() => {
      setJobWorkflowStatus(job.id, 'picked_up_closed', { pickedUpAt: true });
      stamp('picked_up');
      try { stampStageTransition(job.id, 'picked_up_closed', { label: 'Picked Up / Closed', changedVia: 'action_button' }); } catch { /* non-fatal */ }
    }, 'Marked picked up / closed');
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
    try { stampStageTransition(job.id, 'cancelled', { label: 'Cancelled', changedVia: 'action_button' }); } catch { /* non-fatal */ }
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
    try { stampStageTransition(jobId, 'no_show', { label: 'No-Show', changedVia: 'action_button' }); } catch { /* non-fatal */ }
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
