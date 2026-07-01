// Torklio — lib/timing.js
// Appointment timing helpers: tracks scheduled vs actual times, elapsed work,
// timing status, and stamps history events to localStorage.
//
// Data is fully localStorage-compatible (ISO strings + numbers).
// Future reports can query timingHistory to compute:
//   • avg drop-off delay (checkedInAt - scheduledStartAt)
//   • avg job cycle time (workCompletedAt - workStartedAt)
//   • avg wait-for-approval duration (work_resumed.at - work_paused.at groupings)
//   • tech efficiency ratio (elapsed / estimatedMinutes)
//   • on-time completion rate (jobs where timingStatus never reached 'overdue')
//   • bottleneck stage dwell time (lastStageChangedAt deltas per stage)

import { db } from './data.js';

// ── Field defaults ────────────────────────────────────────────────────────────
const TIMING_DEFAULTS = {
  scheduledStartAt:   null,   // ISO — mapped from scheduledDate+scheduledTime
  scheduledEndAt:     null,   // ISO — scheduledStartAt + estimatedMinutes
  estimatedMinutes:   60,     // Backfilled from lineItems[].hours if available
  checkedInAt:        null,   // ISO — stamped on checkIn/droppedOff action
  droppedOffAt:       null,   // ISO — alias for checkedInAt (drop-off visit type)
  workStartedAt:      null,   // ISO — stamped when tech starts work
  workPausedAt:       null,   // ISO — set on pause, cleared on resume
  totalPausedMinutes: 0,      // Accumulated pause time (minutes)
  workCompletedAt:    null,   // ISO — stamped when marked ready/complete
  readyAt:            null,   // ISO — stamped on markReady
  pickedUpAt:         null,   // ISO — stamped when customer picks up
  lastStageChangedAt:    null,   // ISO — updated on any stage transition
  currentStage:          null,   // current workflow stage ID
  currentStageEnteredAt: null,   // ISO — when the job entered the current stage
  stageHistory:          [],     // [{stage, enteredAt, exitedAt}] ordered oldest→newest
  timingHistory:         [],     // [{type, at, label}] ordered oldest→newest
};

// Merge timing defaults onto a record without overwriting existing values.
// Backfills scheduledStartAt from scheduledDate+scheduledTime and
// estimatedMinutes from lineItems[].hours. Safe to call on every render.
export function ensureTimingFields(record) {
  const r = { ...TIMING_DEFAULTS, ...record };

  // Backfill scheduledStartAt from legacy date+time fields
  if (!r.scheduledStartAt && r.scheduledDate && r.scheduledTime) {
    r.scheduledStartAt = `${r.scheduledDate}T${r.scheduledTime}:00`;
  }

  // Backfill estimatedMinutes from lineItems duration if still at default
  if (r.estimatedMinutes === 60 && Array.isArray(r.lineItems)) {
    const sum = r.lineItems.reduce((s, l) => s + ((l.hours || 0) * 60), 0);
    if (sum > 0) r.estimatedMinutes = sum;
  }

  if (!Array.isArray(r.timingHistory)) r.timingHistory = [];
  if (!Array.isArray(r.stageHistory))  r.stageHistory  = [];
  return r;
}

// ── Getters ───────────────────────────────────────────────────────────────────
export function getScheduledStart(record) {
  if (record.scheduledStartAt) return new Date(record.scheduledStartAt);
  if (record.scheduledDate && record.scheduledTime) {
    return new Date(`${record.scheduledDate}T${record.scheduledTime}:00`);
  }
  if (record.scheduledDate) return new Date(`${record.scheduledDate}T09:00:00`);
  return null;
}

export function getEstimatedMinutes(record) {
  return record.estimatedMinutes || 60;
}

// Elapsed net work minutes = wall time since workStartedAt minus accumulated pauses.
// Uses workCompletedAt as the end point if work is done.
export function getElapsedWorkMinutes(record, now = new Date()) {
  if (!record.workStartedAt) return 0;
  const end = record.workCompletedAt ? new Date(record.workCompletedAt) : now;
  const wallMs = end - new Date(record.workStartedAt);
  const wallMins = Math.max(0, wallMs / 60000);
  return Math.max(0, wallMins - (record.totalPausedMinutes || 0));
}

// Delta in minutes between actual arrival and scheduled time.
// Positive = arrived late. Negative = arrived early.
export function getScheduleDeltaMinutes(record, now = new Date()) {
  const scheduled = getScheduledStart(record);
  if (!scheduled) return null;
  const actualArrival = record.checkedInAt || record.droppedOffAt;
  if (actualArrival) return (new Date(actualArrival) - scheduled) / 60000;
  return (now - scheduled) / 60000;
}

// ── Timing status ─────────────────────────────────────────────────────────────
// Returns one of:
//   upcoming | early | on_time | late        (not yet/just arrived)
//   on_schedule | watch | behind | overdue   (in progress)
//   waiting_approval | waiting_parts         (on_hold sub-states)
//   dropped_off                              (waiting for bay)
//   completed                               (done)
//   no_data                                 (no schedule info)
export function getTimingStatus(record, now = new Date()) {
  // Completed / final states — work is done, nothing to track
  if (['closed', 'invoiced', 'ready'].includes(record.status)
      || record.workCompletedAt
      || ['ready_for_pickup', 'picked_up_closed'].includes(record.workflowStatus)) {
    return 'completed';
  }

  // Quality Check — show stage duration vs 30/60 min thresholds
  if (record.status === 'quality_check') {
    const enteredAt = record.currentStageEnteredAt || null;
    if (!enteredAt) return 'no_data';
    const mins = Math.max(0, (now - new Date(enteredAt)) / 60000);
    if (mins < 30) return 'on_schedule';
    if (mins < 60) return 'watch';
    return 'overdue';
  }

  // In progress — compare elapsed work time to estimate
  if (record.status === 'in_progress' && record.workStartedAt) {
    const elapsed = getElapsedWorkMinutes(record, now);
    const est = getEstimatedMinutes(record);
    const pct = est > 0 ? elapsed / est : 0;
    if (pct < 0.75) return 'on_schedule';
    if (pct < 1.00) return 'watch';
    if (pct < 1.25) return 'behind';
    return 'overdue';
  }

  // On hold — granular sub-states
  if (record.status === 'on_hold') {
    if (record.holdReason === 'parts_ordered') return 'waiting_parts';
    return 'waiting_approval';
  }

  // Dropped off / waiting for bay
  if (record.status === 'waiting') return 'dropped_off';

  // Not yet arrived — compare scheduled time to now
  const scheduled = getScheduledStart(record);
  if (!scheduled) return 'no_data';

  const arrived = record.checkedInAt || record.droppedOffAt;
  if (arrived) {
    const delta = (new Date(arrived) - scheduled) / 60000;
    if (delta < -15) return 'early';
    if (delta <= 15)  return 'on_time';
    return 'late';
  }

  // Still not here
  const minsUntil = (scheduled - now) / 60000;
  if (minsUntil > 15) return 'upcoming';
  if ((now - scheduled) / 60000 > 15) return 'late';
  return 'on_time';
}

// ── Formatting ────────────────────────────────────────────────────────────────
export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || isNaN(minutes)) return '—';
  const m = Math.round(Math.max(0, minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

export function formatTimestamp(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return '—'; }
}

// ── Stamp timing event ────────────────────────────────────────────────────────
// Known event types and which field they stamp:
const EVENT_META = {
  checked_in:     { field: 'checkedInAt',      label: 'Checked in' },
  dropped_off:    { field: 'droppedOffAt',     label: 'Dropped off' },
  work_started:   { field: 'workStartedAt',    label: 'Work started' },
  work_paused:    { field: 'workPausedAt',     label: 'Work paused' },
  work_resumed:   { field: null,               label: 'Work resumed' }, // clears workPausedAt, accumulates pause time
  work_completed: { field: 'workCompletedAt',  label: 'Work completed' },
  ready:          { field: 'readyAt',          label: 'Ready for pickup' },
  picked_up:      { field: 'pickedUpAt',       label: 'Picked up' },
};

// Stamps a timing event on a job record and persists to localStorage.
// Idempotent for one-time fields — won't re-stamp if field is already set.
// Pass force=true to override (e.g. repeated pause/resume cycles).
// Returns the updated job record.
export function stampTimingEvent(jobId, eventType, force = false) {
  const jobs = db.jobs();
  const idx = jobs.findIndex((j) => j.id === jobId);
  if (idx < 0) throw new Error('Job not found: ' + jobId);

  const meta = EVENT_META[eventType];
  if (!meta) throw new Error('Unknown timing event: ' + eventType);

  const job = ensureTimingFields({ ...jobs[idx] });
  const now = new Date().toISOString();

  // Idempotency: skip if the one-time field is already set
  if (meta.field && job[meta.field] && !force) return job;

  if (meta.field) job[meta.field] = now;

  // Resume: accumulate pause duration into totalPausedMinutes, clear workPausedAt
  if (eventType === 'work_resumed' && job.workPausedAt) {
    const pausedMs = new Date(now) - new Date(job.workPausedAt);
    job.totalPausedMinutes = (job.totalPausedMinutes || 0) + Math.max(0, pausedMs / 60000);
    job.workPausedAt = null;
  }

  job.lastStageChangedAt = now;
  job.timingHistory = [
    ...(job.timingHistory || []),
    { type: eventType, at: now, label: meta.label },
  ];

  jobs[idx] = job;
  db.saveJobs(jobs);
  return job;
}

// ── Stage transition stamp ────────────────────────────────────────────────────
// Called once per workflow stage move. Idempotent: skips if job is already
// in this stage. Closes the previous stageHistory entry with exitedAt +
// durationMinutes, then appends the new entry.
//
// opts: { label, changedVia, changedBy }
//   label      — human-readable stage name (e.g. "Dropped Off / Checked In")
//   changedVia — 'drag_drop' | 'drawer_dropdown' | 'action_button' | 'edit_mode' |
//                'walk_in_created' | 'pending_confirmed' | 'unknown'
//   changedBy  — user identifier (defaults to 'demo-user')
export function stampStageTransition(jobId, stageId, opts = {}) {
  const jobs = db.jobs();
  const idx  = jobs.findIndex((j) => j.id === jobId);
  if (idx < 0) return;
  const job = jobs[idx];
  if (job.currentStage === stageId) return; // already in this stage — no-op
  const now    = new Date().toISOString();
  const nowMs  = Date.now();
  const history = Array.isArray(job.stageHistory) ? [...job.stageHistory] : [];

  // Close the previous open entry: stamp exitedAt + compute durationMinutes
  if (history.length > 0 && !history[history.length - 1].exitedAt) {
    const prev     = history[history.length - 1];
    const enteredMs = prev.enteredAt ? new Date(prev.enteredAt).getTime() : nowMs;
    const durMins   = Math.max(0, Math.round((nowMs - enteredMs) / 60000));
    history[history.length - 1] = { ...prev, exitedAt: now, durationMinutes: durMins };
  }

  // Append new entry
  history.push({
    id:              `sh_${nowMs.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    stage:           stageId,
    label:           opts.label     || stageId,
    enteredAt:       now,
    exitedAt:        null,
    durationMinutes: null,
    changedBy:       opts.changedBy  || 'demo-user',
    changedVia:      opts.changedVia || 'unknown',
  });

  jobs[idx] = {
    ...job,
    currentStage:          stageId,
    currentStageEnteredAt: now,
    lastStageChangedAt:    now,
    stageHistory:          history,
  };
  db.saveJobs(jobs);
}

// How long (minutes) the job has been in its current stage.
// Uses currentStageEnteredAt when available; falls back to lastStageChangedAt
// for jobs created before stage tracking was added (~approximate).
export function getStageDurationMinutes(job, now = new Date()) {
  const enteredAt = job.currentStageEnteredAt || job.lastStageChangedAt || null;
  if (!enteredAt) return null;
  return Math.max(0, (now - new Date(enteredAt)) / 60000);
}
