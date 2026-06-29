// AutoBook — modules/team/schedule.js (§B.4.4 Phase 1 → TeamOps Scheduling
// Phase 2 → Future Scheduling). Editable weekly schedule for ANY week (past,
// current, or future) + Copy Week + per-week Publish/Lock + a month
// lookahead + Time Clock/Messaging/Integrations placeholders + computed
// coverage warnings. Still a local/demo system — no real time-tracking
// compliance or payroll. Shift CRUD goes through
// util.addShift/updateShift/removeShift/copyWeek (same db.shifts() pattern
// the rest of the app already uses).

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import { openTeamDrawer, closeTeamDrawer } from './team-app.js';
import { renderShareMenu, downloadCSV, downloadJSON, downloadICS, copyToClipboard, printHTML, showMessagePreview, buildICS } from '../../lib/export.js';
import { SHIFT_ROLES } from '../../lib/auth.js';

// Shift Role is a fixed list (Technician/Service Advisor/Front Desk/
// Inventory/Manager on Duty) — distinct from an employee's Permission Role.
// Falls back to a free-text "Custom…" option so older shifts saved with a
// different label (e.g. seed data's "Bay tech") still display correctly.
function shiftRoleOptionsHtml(currentValue) {
  const knownLabels = SHIFT_ROLES.map((r) => r.label);
  const isCustom = currentValue && !knownLabels.includes(currentValue);
  return `<option value="">No shift role</option>
    ${SHIFT_ROLES.map((r) => `<option value="${r.label}" ${currentValue === r.label ? 'selected' : ''}>${r.label}</option>`).join('')}
    ${isCustom ? `<option value="${currentValue}" selected>${currentValue} (custom)</option>` : ''}`;
}

const STATUS_BADGE = { scheduled: 'badge-blue', completed: 'badge-gray', missed: 'badge-red', swapped: 'badge-purple', canceled: 'badge-gray', open: 'badge-amber' };
const PTO_BADGE = { pending: 'badge-amber', approved: 'badge-green' };
const SEVERITY_BADGE = { red: 'badge-red', amber: 'badge-amber', gray: 'badge-gray' };
const CLOCK_BADGE = { not_clocked_in: 'badge-gray', clocked_in: 'badge-green', on_break: 'badge-amber', clocked_out: 'badge-blue' };
const WEEK_BADGE = { draft: 'badge-gray', published: 'badge-green', locked: 'badge-red', reopened: 'badge-amber' };

// `selectedDate` (any day in the week being viewed) is the single source of
// truth — the week grid, month lookahead, and header all derive from it.
// Never hardcoded to "this week": Prev/Next/Today/date-picker/month-click
// all just reassign this and re-render.
let selectedDate = new Date().toISOString().slice(0, 10);
let showMonth = false;

function currentWeekStart() { return util.weekStartForDate(selectedDate); }

export function renderSchedule(mount) {
  selectedDate = new Date().toISOString().slice(0, 10);
  showMonth = false;
  mount.innerHTML = `
    <div class="grid-3" id="sched-header" style="margin-bottom:var(--s4)"></div>
    <div class="grid-3" id="sched-labor-summary" style="margin-bottom:var(--s4)"></div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-body">
        <div class="row between" style="flex-wrap:wrap;gap:var(--s2)">
          <div class="row" style="gap:var(--s2);flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" id="sched-prev">‹ Prev week</button>
            <button class="btn btn-secondary btn-sm" id="sched-today">Today</button>
            <button class="btn btn-secondary btn-sm" id="sched-next">Next week ›</button>
            <input class="input" type="date" id="sched-datepicker" style="width:auto">
            <button class="btn btn-secondary btn-sm" id="sched-month-toggle">Month view</button>
          </div>
          <div class="row" style="gap:var(--s2)">
            <span id="sched-share-mount"></span>
            <button class="btn btn-secondary btn-sm" id="sched-copy-week">Copy Week ›</button>
            <button class="btn btn-secondary btn-sm" id="sched-add-open-shift">+ Open Shift</button>
            <button class="btn btn-primary btn-sm" id="sched-add-shift">+ Add Shift</button>
          </div>
        </div>
      </div>
    </div>

    <div id="sched-month-panel" style="margin-bottom:var(--s4);display:none"></div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head">
        <div class="row" style="gap:var(--s2);align-items:center">
          <div class="card-title" id="sched-week-label">This week</div>
          <span class="badge" id="sched-week-status-badge"></span>
        </div>
        <div class="row" style="gap:var(--s2)" id="sched-week-actions"></div>
      </div>
      <div class="card-body">
        <div class="sched-grid" id="sched-grid"></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Coverage warnings</div></div>
      <div class="card-body" id="sched-warnings"></div>
    </div>

    <div class="grid-2" style="margin-bottom:var(--s4)">
      <div class="card">
        <div class="card-head"><div class="card-title">Time Clock</div><span class="badge badge-gray">demo — no real time-tracking compliance yet</span></div>
        <div class="card-body" id="time-clock-list"></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Team Messaging</div><span class="badge badge-gray">placeholder — no real send</span></div>
        <div class="card-body" id="team-messaging"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">Payroll, Compliance &amp; Integrations</div><span class="badge badge-gray">coming later</span></div>
      <div class="card-body"><div class="grid-3" id="sched-integrations"></div></div>
    </div>
  `;

  document.getElementById('sched-prev').addEventListener('click', () => { shiftSelectedDate(-7); });
  document.getElementById('sched-next').addEventListener('click', () => { shiftSelectedDate(7); });
  document.getElementById('sched-today').addEventListener('click', () => { selectedDate = new Date().toISOString().slice(0, 10); renderAll(); });
  document.getElementById('sched-datepicker').addEventListener('change', (e) => { if (e.target.value) { selectedDate = e.target.value; renderAll(); } });
  document.getElementById('sched-month-toggle').addEventListener('click', () => { showMonth = !showMonth; renderMonthPanel(); });
  document.getElementById('sched-add-shift').addEventListener('click', () => openShiftEditor(null, { date: selectedDate }));
  document.getElementById('sched-add-open-shift').addEventListener('click', openOpenShiftEditor);
  document.getElementById('sched-copy-week').addEventListener('click', openCopyWeekModal);
  renderShareMenu(document.getElementById('sched-share-mount'), [
    { label: 'Print Weekly Schedule', onClick: printWeeklySchedule },
    { label: 'Export CSV', onClick: exportScheduleCSV },
    { label: 'Export JSON', onClick: exportScheduleJSON },
    { label: 'Copy Weekly Summary', onClick: copyScheduleSummary },
    { divider: true },
    { label: 'Email Preview (per employee)…', onClick: () => openRecipientPicker('email') },
    { label: 'Text Preview (per employee)…', onClick: () => openRecipientPicker('sms') },
    { divider: true },
    { label: 'Download Calendar (.ics) — Whole Team', onClick: () => downloadScheduleICS(null) },
    { label: 'Download Calendar (.ics) — Select Employee…', onClick: openIcsEmployeePicker },
  ]);

  renderAll();
  renderIntegrations();
}

function shiftSelectedDate(days) {
  const d = new Date(selectedDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  selectedDate = d.toISOString().slice(0, 10);
  renderAll();
}

function renderAll() {
  document.getElementById('sched-datepicker').value = selectedDate;
  renderHeader();
  renderLaborSummary();
  renderWeekStatusBar();
  renderGrid();
  renderWarnings();
  renderTimeClock();
  renderMessaging();
  renderMonthPanel();
}

// ---------------------------------------------------------------------------
function renderHeader() {
  const today = new Date().toISOString().slice(0, 10);
  const todayShifts = db.shiftsForDate(today).filter((s) => s.status !== 'canceled');
  const techsToday = todayShifts.filter((s) => db.employeeById(s.employeeId)?.isTech).length;
  const ptoToday = db.ptoForDate(today).length;
  const warnings = util.scheduleWarnings(currentWeekStart());
  const overtimeCount = warnings.filter((w) => w.type === 'overtime').length;
  const openToday = todayShifts.filter((s) => s.status === 'open' || !s.employeeId).length;

  const cards = [
    { label: 'Employees Scheduled Today', value: todayShifts.length },
    { label: 'Techs Working Today', value: techsToday },
    { label: 'Open Shifts Today', value: openToday },
    { label: 'PTO / Time Off Today', value: ptoToday },
    { label: 'Overtime Risk', value: overtimeCount },
    { label: 'Coverage Warnings', value: warnings.length },
  ];
  document.getElementById('sched-header').innerHTML = cards.map((c) => `
    <div class="stat-card">
      <div class="stat-label">${c.label}${c.placeholder ? ' <span class="badge badge-gray" style="font-size:10px">placeholder</span>' : ''}</div>
      <div class="stat-value">${c.value}</div>
    </div>`).join('');
}

// Labor/overtime/coverage — real for this selected week (util.weekLaborSummary).
// Labor cost is explicitly badged an estimate (hourly/flat-rate pay × hours
// only — no taxes/benefits/OT multiplier, and salaried staff excluded).
function renderLaborSummary() {
  const ws = currentWeekStart();
  const s = util.weekLaborSummary(ws);
  const cards = [
    { label: 'Scheduled Hours (week)', value: `${s.scheduledHours}h` },
    { label: 'Est. Labor Cost', value: util.fmtMoney0(s.laborCost), placeholder: true },
    { label: 'Open Shifts (week)', value: s.openShiftsCount },
    { label: 'PTO Hours (week)', value: s.ptoHours },
    { label: 'Tech Coverage', value: `${s.techCoveragePct}%` },
    { label: 'Advisor Coverage', value: `${s.advisorCoveragePct}%` },
  ];
  document.getElementById('sched-labor-summary').innerHTML = cards.map((c) => `
    <div class="stat-card">
      <div class="stat-label">${c.label}${c.placeholder ? ' <span class="badge badge-gray" style="font-size:10px">estimate</span>' : ''}</div>
      <div class="stat-value">${c.value}</div>
    </div>`).join('');
}

// ---------------------------------------------------------------------------
function renderWeekStatusBar() {
  const ws = currentWeekStart();
  const weekStatus = util.getWeekStatus(ws);
  const warnings = util.scheduleWarnings(ws);
  const ptoCount = db.ptoRequests().filter((p) => p.status !== 'denied' && p.status !== 'canceled' && p.startDate <= weekEnd(ws) && p.endDate >= ws).length;

  document.getElementById('sched-week-status-badge').innerHTML = `
    <span class="badge ${WEEK_BADGE[weekStatus.status] || 'badge-gray'}">${weekStatus.status}</span>
    ${warnings.length ? `<span class="badge badge-amber" style="margin-left:4px">${warnings.length} warning${warnings.length === 1 ? '' : 's'}</span>` : ''}
    ${ptoCount ? `<span class="badge badge-blue" style="margin-left:4px">${ptoCount} PTO/off</span>` : ''}
  `;

  const actions = [];
  if (['draft', 'reopened'].includes(weekStatus.status)) actions.push('<button class="btn btn-primary btn-sm" id="wk-publish">Publish Week</button>');
  if (weekStatus.status === 'published') {
    actions.push('<button class="btn btn-secondary btn-sm" id="wk-lock">Lock Week</button>');
    actions.push('<button class="btn btn-secondary btn-sm" id="wk-reopen">Reopen</button>');
  }
  if (weekStatus.status === 'locked') actions.push('<button class="btn btn-secondary btn-sm" id="wk-reopen">Reopen</button>');
  document.getElementById('sched-week-actions').innerHTML = actions.join('');

  document.getElementById('wk-publish')?.addEventListener('click', () => {
    util.publishWeek(ws);
    toast('Week published.', 'success');
    renderAll();
  });
  document.getElementById('wk-lock')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog('Lock this week? Shifts will become read-only until reopened.', { confirmLabel: 'Lock' });
    if (!confirmed) return;
    util.lockWeek(ws);
    toast('Week locked.', 'success');
    renderAll();
  });
  document.getElementById('wk-reopen')?.addEventListener('click', () => {
    util.reopenWeek(ws);
    toast('Week reopened for editing.', 'success');
    renderAll();
  });
}

function weekEnd(weekStartIso) {
  const d = new Date(weekStartIso + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Grid supports drag-and-drop: drag any shift chip onto another day/employee
// cell (or onto the Open Shifts row to unassign it) to move it — same
// "draggable card, droppable cell" pattern Live Monitor already uses for
// jobs/bays. Dropping is blocked while the week is locked.
function renderGrid() {
  const start = currentWeekStart();
  const locked = util.getWeekStatus(start).status === 'locked';
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start + 'T00:00:00');
    d.setDate(d.getDate() + i);
    return d;
  });
  const startLabel = days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = days[4].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  document.getElementById('sched-week-label').textContent = `${startLabel} – ${endLabel}`;

  const employees = db.employees().slice().sort((a, b) => a.firstName.localeCompare(b.firstName));
  const shifts = db.shiftsForWeek(start);
  const openShifts = shifts.filter((s) => s.status === 'open' || !s.employeeId);

  const shiftChip = (shift, extraBadge) => {
    const bay = db.bayById(shift.bayId);
    return `
      <div class="sched-chip" draggable="${locked ? 'false' : 'true'}" data-drag-shift="${shift.id}">
        ${extraBadge || ''}
        <div class="tnum" style="font-weight:600">${shift.start}–${shift.end}</div>
        <div class="muted" style="font-size:var(--t-xs)">${shift.roleForShift || ''}${bay ? ' · ' + bay.name : ''}</div>
        <span class="badge ${STATUS_BADGE[shift.status] || 'badge-gray'}" style="font-size:10px;margin-top:2px">${shift.status}</span>
      </div>`;
  };

  const cellHtml = (employee, day) => {
    const dateStr = day.toISOString().slice(0, 10);
    const shift = shifts.find((s) => s.employeeId === employee.id && s.date === dateStr);
    const pto = db.ptoForDate(dateStr).find((p) => p.employeeId === employee.id);
    const unavailable = !pto && !util.isAvailable(employee.id, dateStr);
    const conflict = shift && (pto || unavailable);

    let inner;
    if (shift && pto) {
      inner = shiftChip(shift, '<span class="badge badge-red" style="font-size:10px">PTO conflict</span>');
    } else if (shift && unavailable) {
      inner = shiftChip(shift, '<span class="badge badge-red" style="font-size:10px">Unavailable</span>');
    } else if (pto) {
      inner = `<span class="badge ${PTO_BADGE[pto.status] || 'badge-gray'}" style="font-size:10px">${pto.type} ${pto.status === 'pending' ? '(pending)' : ''}</span>`;
    } else if (shift) {
      inner = shiftChip(shift);
    } else if (unavailable) {
      inner = `<span class="badge badge-gray" style="font-size:10px">Unavailable</span>`;
    } else {
      inner = `<span class="muted" style="font-size:var(--t-13)">${locked ? '—' : '+ Add'}</span>`;
    }
    return `<div class="sched-cell sched-cell-shift${conflict ? ' sched-conflict' : ''}${locked ? ' sched-locked' : ''}" data-employee="${employee.id}" data-date="${dateStr}" data-shift="${shift?.id || ''}">${inner}</div>`;
  };

  const openCellHtml = (day) => {
    const dateStr = day.toISOString().slice(0, 10);
    const dayOpenShifts = openShifts.filter((s) => s.date === dateStr);
    return `<div class="sched-cell sched-cell-shift sched-open-cell${locked ? ' sched-locked' : ''}" data-date="${dateStr}" data-open-row="1">
      ${dayOpenShifts.map((s) => shiftChip(s)).join('') || '<span class="muted" style="font-size:var(--t-13)">—</span>'}
    </div>`;
  };

  document.getElementById('sched-grid').innerHTML = `
    <div class="sched-cell head">Employee</div>
    ${days.map((d) => `<div class="sched-cell head">${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}</div>`).join('')}
    <div class="sched-cell name" style="color:var(--amber)">Open Shifts</div>
    ${days.map((d) => openCellHtml(d)).join('')}
    ${employees.map((e) => `
      <div class="sched-cell name">${e.firstName} ${e.lastName}${e.isTech ? '' : ' <span class="muted" style="font-size:var(--t-xs)">· ' + (db.roleById(e.role)?.name || '') + '</span>'}</div>
      ${days.map((d) => cellHtml(e, d)).join('')}
    `).join('')}
  `;

  document.querySelectorAll('.sched-cell-shift').forEach((cell) => {
    cell.addEventListener('click', (ev) => {
      if (locked) {
        toast('This week is locked — reopen it to make changes.', 'error');
        return;
      }
      const shiftId = cell.dataset.shift || ev.target.closest('[data-drag-shift]')?.dataset.dragShift;
      if (shiftId) openShiftEditor(shiftId);
      else if (cell.dataset.employee) openShiftEditor(null, { employeeId: cell.dataset.employee, date: cell.dataset.date });
    });
    cell.addEventListener('dragover', (e) => { if (!locked) { e.preventDefault(); cell.classList.add('drag-over'); } });
    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      cell.classList.remove('drag-over');
      if (locked) return;
      const draggingId = document.querySelector('.sched-chip.dragging')?.dataset.dragShift;
      if (!draggingId) return;
      const targetEmployeeId = cell.dataset.openRow ? null : cell.dataset.employee;
      try {
        util.moveShift(draggingId, { employeeId: targetEmployeeId, date: cell.dataset.date });
        toast('Shift moved.', 'success');
        renderAll();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  document.querySelectorAll('[data-drag-shift]').forEach((chip) => {
    chip.addEventListener('dragstart', () => chip.classList.add('dragging'));
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
  });
}

// ---------------------------------------------------------------------------
function renderWarnings() {
  const warnings = util.scheduleWarnings(currentWeekStart());
  document.getElementById('sched-warnings').innerHTML = warnings.length
    ? warnings.map((w) => `<div class="row" style="gap:var(--s2);padding:6px 0;border-bottom:1px solid var(--rule)"><span class="badge ${SEVERITY_BADGE[w.severity] || 'badge-gray'}">${w.type.replace('_', ' ')}</span><span style="font-size:var(--t-13)">${w.message}</span></div>`).join('')
    : '<div class="empty-sub">No coverage warnings for this week.</div>';
}

// ---------------------------------------------------------------------------
function renderTimeClock() {
  const today = new Date().toISOString().slice(0, 10);
  const employees = db.employees().filter((e) => e.employmentStatus === 'active');
  document.getElementById('time-clock-list').innerHTML = employees.map((e) => {
    const entry = db.timeClockEntryFor(e.id, today);
    const status = entry?.status || 'not_clocked_in';
    return `
      <div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
        <span>${e.firstName} ${e.lastName}</span>
        <span class="row" style="gap:var(--s2)">
          ${entry?.totalHours != null ? `<span class="muted tnum" style="font-size:var(--t-13)">${entry.totalHours} hrs</span>` : ''}
          <span class="badge ${CLOCK_BADGE[status] || 'badge-gray'}">${status.replace('_', ' ')}</span>
          ${clockActionButton(e.id, status)}
        </span>
      </div>`;
  }).join('');

  document.querySelectorAll('[data-clock-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        const fn = { clock_in: util.clockIn, start_break: util.startBreak, end_break: util.endBreak, clock_out: util.clockOut }[btn.dataset.clockAction];
        fn(btn.dataset.employee);
        toast('Time clock updated (demo).', 'success');
        renderTimeClock();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
  document.querySelectorAll('[data-correct-entry]').forEach((btn) => {
    btn.addEventListener('click', () => toast('Time entry correction is a placeholder — no audit workflow yet.'));
  });
}

function clockActionButton(employeeId, status) {
  const action = { not_clocked_in: ['clock_in', 'Clock In'], clocked_in: ['start_break', 'Start Break'], on_break: ['end_break', 'End Break'], clocked_out: null }[status];
  if (!action) return `<button class="btn btn-secondary btn-sm" data-correct-entry data-employee="${employeeId}">Correct</button>`;
  return `<button class="btn btn-secondary btn-sm" data-clock-action="${action[0]}" data-employee="${employeeId}">${action[1]}</button>${status !== 'not_clocked_in' ? `<button class="btn btn-secondary btn-sm" data-clock-action="clock_out" data-employee="${employeeId}">Clock Out</button>` : ''}`;
}

// ---------------------------------------------------------------------------
function renderMessaging() {
  const recent = db.teamMessages().slice().sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5);
  const today = new Date().toISOString().slice(0, 10);
  const scheduledCount = db.shiftsForDate(today).length;
  document.getElementById('team-messaging').innerHTML = `
    <div class="row" style="gap:var(--s2);flex-wrap:wrap;margin-bottom:var(--s3)">
      <button class="btn btn-secondary btn-sm" id="msg-announce">Schedule Announcement</button>
      <button class="btn btn-secondary btn-sm" id="msg-all-scheduled">Message All Scheduled (${scheduledCount})</button>
    </div>
    <div class="section-label" style="margin-bottom:6px">Recent messages</div>
    ${recent.length
      ? recent.map((m) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)"><span>${m.subject}</span><span class="muted" style="font-size:var(--t-13)">${util.fmtDate(m.at)}</span></div>`).join('')
      : '<div class="empty-sub">No messages logged yet.</div>'}
  `;

  document.getElementById('msg-announce').addEventListener('click', () => openMessageComposer('all_scheduled', null, 'Schedule announcement'));
  document.getElementById('msg-all-scheduled').addEventListener('click', () => openMessageComposer('all_scheduled', null, `Message to ${scheduledCount} scheduled employee${scheduledCount === 1 ? '' : 's'}`));
}

function openMessageComposer(scope, employeeId, title) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-head">
        <div class="modal-title">${title} <span class="badge badge-gray" style="margin-left:8px">placeholder — not actually sent</span></div>
        <button class="icon-btn" id="msg-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="modal-body">
        <div class="field"><label class="label">Subject</label><input class="input" id="msg-subject" placeholder="e.g. Shift change this Friday"></div>
        <div class="field"><label class="label">Message</label><textarea class="textarea" id="msg-body" placeholder="Type your message…"></textarea></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" id="msg-cancel">Cancel</button>
        <button class="btn btn-primary" id="msg-send">Log Message (Demo)</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const cleanup = () => overlay.remove();
  overlay.querySelector('#msg-close').addEventListener('click', cleanup);
  overlay.querySelector('#msg-cancel').addEventListener('click', cleanup);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
  overlay.querySelector('#msg-send').addEventListener('click', () => {
    const subject = overlay.querySelector('#msg-subject').value.trim();
    const body = overlay.querySelector('#msg-body').value.trim();
    if (!subject || !body) { toast('Subject and message are required.', 'error'); return; }
    util.sendTeamMessage({ scope, employeeId, subject, body });
    toast('Message logged (demo only — nothing was actually sent).', 'success');
    cleanup();
    renderMessaging();
  });
}

// ---------------------------------------------------------------------------
const INTEGRATIONS = [
  { name: 'Payroll Export', desc: 'Export approved hours to a payroll provider.' },
  { name: 'Overtime Tracking', desc: 'Automatic overtime alerts and reporting.' },
  { name: 'Compliance Notes', desc: 'Break/rest-period compliance tracking by state.' },
  { name: 'Automated Scheduling', desc: 'Auto-fill open shifts based on availability.' },
  { name: 'Calendar Sync', desc: 'Sync shifts to Google/Outlook calendars.' },
  { name: 'Payroll Integration', desc: 'Connect to Gusto, ADP, or QuickBooks Payroll.' },
];

function renderIntegrations() {
  document.getElementById('sched-integrations').innerHTML = INTEGRATIONS.map((i) => `
    <div class="stat-card">
      <div class="stat-label">${i.name}</div>
      <div class="muted" style="font-size:var(--t-13);margin:6px 0">${i.desc}</div>
      <span class="badge badge-gray">coming later</span>
    </div>`).join('');
}

// ---------------------------------------------------------------------------
// Month lookahead — compact, real data only: a dot if shifts exist that day,
// an amber ring if PTO/off exists, and the week's status color on the row.
// ---------------------------------------------------------------------------
function renderMonthPanel() {
  const panel = document.getElementById('sched-month-panel');
  panel.style.display = showMonth ? '' : 'none';
  if (!showMonth) return;

  const anchor = new Date(selectedDate + 'T00:00:00');
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7)); // back to Monday

  // Always exactly enough Monday-start rows to cover the month (max 6).
  const weeks = [];
  const cursor = new Date(gridStart);
  for (let row = 0; row < 6; row++) {
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(cursor);
      d.setDate(d.getDate() + i);
      return d;
    });
    weeks.push(week);
    cursor.setDate(cursor.getDate() + 7);
    if (cursor > monthEnd) break;
  }

  panel.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">${anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div></div>
      <div class="card-body">
        <div class="month-grid">
          ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="month-cell head">${d}</div>`).join('')}
          ${weeks.flat().map((d) => {
            const dateStr = d.toISOString().slice(0, 10);
            const inMonth = d.getMonth() === anchor.getMonth();
            const ws = util.weekStartForDate(dateStr);
            const weekStatus = util.getWeekStatus(ws).status;
            const hasShifts = db.shiftsForDate(dateStr).length > 0;
            const hasPto = db.ptoForDate(dateStr).length > 0;
            return `
              <div class="month-cell${inMonth ? '' : ' dim'}${dateStr === selectedDate ? ' selected' : ''}" data-month-date="${dateStr}">
                <div class="month-daynum">${d.getDate()}</div>
                <div class="row" style="gap:3px;justify-content:center">
                  ${hasShifts ? '<span class="month-dot dot-blue" title="Shifts scheduled"></span>' : ''}
                  ${hasPto ? '<span class="month-dot dot-amber" title="PTO/off"></span>' : ''}
                  ${weekStatus === 'published' ? '<span class="month-dot dot-green" title="Published"></span>' : ''}
                  ${weekStatus === 'locked' ? '<span class="month-dot dot-red" title="Locked"></span>' : ''}
                </div>
              </div>`;
          }).join('')}
        </div>
        <div class="muted" style="font-size:var(--t-xs);margin-top:var(--s3)">Blue = shifts scheduled · Amber = PTO/off · Green = week published · Red = week locked. Click a day to jump to its week.</div>
      </div>
    </div>
  `;

  document.querySelectorAll('[data-month-date]').forEach((cell) => {
    cell.addEventListener('click', () => {
      selectedDate = cell.dataset.monthDate;
      renderAll();
    });
  });
}

// ---------------------------------------------------------------------------
// Copy Week — copies every shift from the current week to the next week (or
// any selected future week). Warns before overwriting onto a week that
// already has shifts, per the "don't silently duplicate" rule.
// ---------------------------------------------------------------------------
function openCopyWeekModal() {
  const fromWeek = currentWeekStart();
  const defaultTarget = new Date(fromWeek + 'T00:00:00');
  defaultTarget.setDate(defaultTarget.getDate() + 7);

  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:440px">
      <div class="modal-head">
        <div class="modal-title">Copy Week</div>
        <button class="icon-btn" id="cw-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="modal-body">
        <div class="muted" style="font-size:var(--t-13);margin-bottom:var(--s3)">Copy shifts from the week of ${util.fmtDate(fromWeek)} to:</div>
        <div class="field"><label class="label">Target week (any date in that week)</label><input class="input" type="date" id="cw-target" value="${defaultTarget.toISOString().slice(0, 10)}"></div>
        <label class="row" style="gap:6px;margin-top:var(--s3);font-size:var(--t-13)"><input type="checkbox" id="cw-include-pto"> Include employees who are on PTO/off in the target week</label>
        <div class="alert alert-amber" style="margin-top:var(--s4)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>
          <div>Recurring shifts (repeat weekly / repeat until a date) aren't built yet — copying one week forward at a time is the real feature for now.</div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" id="cw-cancel">Cancel</button>
        <button class="btn btn-primary" id="cw-copy">Copy Week</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const cleanup = () => overlay.remove();
  overlay.querySelector('#cw-close').addEventListener('click', cleanup);
  overlay.querySelector('#cw-cancel').addEventListener('click', cleanup);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
  overlay.querySelector('#cw-copy').addEventListener('click', async () => {
    const targetDate = overlay.querySelector('#cw-target').value;
    if (!targetDate) { toast('Pick a target week.', 'error'); return; }
    const toWeek = util.weekStartForDate(targetDate);
    if (toWeek === fromWeek) { toast('Target week is the same as the current week.', 'error'); return; }

    if (util.weekHasShifts(toWeek)) {
      const confirmed = await confirmDialog(`The week of ${util.fmtDate(toWeek)} already has shifts. Copy anyway? This adds to what's already there — it won't remove existing shifts.`, { confirmLabel: 'Copy Anyway' });
      if (!confirmed) return;
    }
    const includePto = overlay.querySelector('#cw-include-pto').checked;
    const result = util.copyWeek(fromWeek, toWeek, { includePto });
    toast(`Copied ${result.copied} shift${result.copied === 1 ? '' : 's'}${result.skipped ? ` (${result.skipped} skipped for PTO/off)` : ''} to the week of ${util.fmtDate(toWeek)}.`, 'success');
    cleanup();
    renderAll();
  });
}

// ---------------------------------------------------------------------------
// Shift editor — same drawer the Employees tab uses (team-app.js owns the
// single #team-drawer mount). Save/Cancel/Remove all go through
// util.addShift/updateShift/removeShift.
// ---------------------------------------------------------------------------
function openShiftEditor(shiftId, prefill) {
  const shift = shiftId ? db.shifts().find((s) => s.id === shiftId) : null;
  const employees = db.employees().slice().sort((a, b) => a.firstName.localeCompare(b.firstName));
  const bays = db.bays();
  const employeeId = shift?.employeeId || prefill?.employeeId || '';
  const date = shift?.date || prefill?.date || '';

  openTeamDrawer(`
    <div class="modal-head">
      <div class="modal-title">${shift ? 'Edit Shift' : 'Add Shift'}</div>
      <button class="icon-btn" id="close-team-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="field" style="margin-bottom:var(--s4)">
        <label class="label">Apply template <span class="badge badge-gray" style="font-size:10px">fills the fields below</span></label>
        <select class="select" id="se-template">
          <option value="">None — fill in manually</option>
          ${db.scheduleTemplates().map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}
        </select>
      </div>
      <div class="grid-2">
        <div class="field">
          <label class="label">Employee</label>
          <select class="select" id="se-employee">
            <option value="">Select employee…</option>
            ${employees.map((e) => `<option value="${e.id}" ${employeeId === e.id ? 'selected' : ''}>${e.firstName} ${e.lastName}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label class="label">Date</label><input class="input" type="date" id="se-date" value="${date}"></div>
        <div class="field"><label class="label">Start time</label><input class="input" type="time" id="se-start" value="${shift?.start || '08:00'}"></div>
        <div class="field"><label class="label">End time</label><input class="input" type="time" id="se-end" value="${shift?.end || '17:00'}"></div>
        <div class="field"><label class="label">Shift role <span class="badge badge-gray" style="font-size:9px">not the same as permission role</span></label><select class="select" id="se-role">${shiftRoleOptionsHtml(shift?.roleForShift)}</select></div>
        <div class="field">
          <label class="label">Assigned bay</label>
          <select class="select" id="se-bay">
            <option value="">No bay</option>
            ${bays.map((b) => `<option value="${b.id}" ${shift?.bayId === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label class="label">Break <span class="badge badge-gray" style="font-size:10px">placeholder</span></label><input class="input" type="number" min="0" step="5" id="se-break" value="${shift?.breakMinutes ?? 30}"> <span class="muted" style="font-size:var(--t-13)">minutes</span></div>
        <div class="field">
          <label class="label">Status</label>
          <select class="select" id="se-status">
            ${['scheduled', 'completed', 'missed', 'swapped', 'canceled'].map((s) => `<option value="${s}" ${(shift?.status || 'scheduled') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="grid-column:1/-1"><label class="label">Notes / availability</label><input class="input" id="se-notes" value="${shift?.note || ''}"></div>
      </div>
    </div>
    <div class="modal-foot">
      ${shift ? '<button class="btn btn-danger" id="se-remove" style="margin-right:auto">Remove Shift</button>' : ''}
      <button class="btn btn-secondary" id="se-save-template">Save as Template</button>
      <button class="btn btn-secondary" id="se-cancel">Cancel</button>
      <button class="btn btn-primary" id="se-save">Save Shift</button>
    </div>
  `);

  document.getElementById('close-team-drawer').addEventListener('click', closeTeamDrawer);
  document.getElementById('se-cancel').addEventListener('click', closeTeamDrawer);
  document.getElementById('se-template').addEventListener('change', (e) => {
    const tpl = db.scheduleTemplates().find((t) => t.id === e.target.value);
    if (!tpl) return;
    document.getElementById('se-start').value = tpl.start;
    document.getElementById('se-end').value = tpl.end;
    document.getElementById('se-role').value = tpl.roleForShift || '';
    document.getElementById('se-bay').value = tpl.bayId || '';
    document.getElementById('se-break').value = tpl.breakMinutes || 0;
  });
  document.getElementById('se-save-template').addEventListener('click', () => {
    const name = (document.getElementById('se-role').value.trim() || 'Shift') + ' template';
    util.saveShiftAsTemplate({
      roleForShift: document.getElementById('se-role').value.trim(),
      start: document.getElementById('se-start').value,
      end: document.getElementById('se-end').value,
      breakMinutes: Number(document.getElementById('se-break').value) || 0,
      bayId: document.getElementById('se-bay').value || null,
    }, name);
    toast(`Saved as template "${name}".`, 'success');
  });
  document.getElementById('se-remove')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog('Remove this shift?', { confirmLabel: 'Remove' });
    if (!confirmed) return;
    util.removeShift(shift.id);
    toast('Shift removed.');
    closeTeamDrawer();
    renderAll();
  });
  document.getElementById('se-save').addEventListener('click', () => saveShiftEditor(shift));
}

// "+ Open Shift" — a shift with no employee yet, claimable later via drag
// onto an employee row or the Edit Shift form.
function openOpenShiftEditor() {
  const bays = db.bays();
  openTeamDrawer(`
    <div class="modal-head">
      <div class="modal-title">Create Open Shift</div>
      <button class="icon-btn" id="close-team-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="field" style="margin-bottom:var(--s4)">
        <label class="label">Apply template</label>
        <select class="select" id="os-template">
          <option value="">None — fill in manually</option>
          ${db.scheduleTemplates().map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}
        </select>
      </div>
      <div class="grid-2">
        <div class="field"><label class="label">Date</label><input class="input" type="date" id="os-date" value="${selectedDate}"></div>
        <div class="field"><label class="label">Shift role <span class="badge badge-gray" style="font-size:9px">not the same as permission role</span></label><select class="select" id="os-role">${shiftRoleOptionsHtml('')}</select></div>
        <div class="field"><label class="label">Start time</label><input class="input" type="time" id="os-start" value="08:00"></div>
        <div class="field"><label class="label">End time</label><input class="input" type="time" id="os-end" value="17:00"></div>
        <div class="field">
          <label class="label">Assigned bay</label>
          <select class="select" id="os-bay"><option value="">No bay</option>${bays.map((b) => `<option value="${b.id}">${b.name}</option>`).join('')}</select>
        </div>
        <div class="field"><label class="label">Break</label><input class="input" type="number" min="0" step="5" id="os-break" value="30"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="os-cancel">Cancel</button>
      <button class="btn btn-primary" id="os-save">Create Open Shift</button>
    </div>
  `);
  document.getElementById('close-team-drawer').addEventListener('click', closeTeamDrawer);
  document.getElementById('os-cancel').addEventListener('click', closeTeamDrawer);
  document.getElementById('os-template').addEventListener('change', (e) => {
    const tpl = db.scheduleTemplates().find((t) => t.id === e.target.value);
    if (!tpl) return;
    document.getElementById('os-start').value = tpl.start;
    document.getElementById('os-end').value = tpl.end;
    document.getElementById('os-role').value = tpl.roleForShift || '';
    document.getElementById('os-bay').value = tpl.bayId || '';
    document.getElementById('os-break').value = tpl.breakMinutes || 0;
  });
  document.getElementById('os-save').addEventListener('click', () => {
    const date = document.getElementById('os-date').value;
    const start = document.getElementById('os-start').value;
    const end = document.getElementById('os-end').value;
    if (!date || !start || !end) { toast('Date, start, and end time are required.', 'error'); return; }
    if (timeToMinutesLocal(end) <= timeToMinutesLocal(start)) { toast('End time must be after start time.', 'error'); return; }
    util.createOpenShift({
      date, start, end, roleForShift: document.getElementById('os-role').value.trim(),
      bayId: document.getElementById('os-bay').value || null, breakMinutes: Number(document.getElementById('os-break').value) || 0,
    });
    selectedDate = date;
    toast('Open shift created.', 'success');
    closeTeamDrawer();
    renderAll();
  });
}

function saveShiftEditor(existingShift) {
  const empId = document.getElementById('se-employee').value;
  const date = document.getElementById('se-date').value;
  const start = document.getElementById('se-start').value;
  const end = document.getElementById('se-end').value;
  if (!empId || !date || !start || !end) {
    toast('Employee, date, start, and end time are required.', 'error');
    return;
  }
  if (timeToMinutesLocal(end) <= timeToMinutesLocal(start)) {
    toast('End time must be after start time.', 'error');
    return;
  }

  const data = {
    date, start, end,
    roleForShift: document.getElementById('se-role').value.trim(),
    bayId: document.getElementById('se-bay').value || null,
    breakMinutes: Number(document.getElementById('se-break').value) || 0,
    note: document.getElementById('se-notes').value.trim(),
  };

  // Warn (don't block) on an overlapping shift for the same employee.
  const sameDay = db.shifts().filter((s) => s.employeeId === empId && s.date === date && s.id !== existingShift?.id && s.status !== 'canceled');
  const overlaps = sameDay.some((s) => timeToMinutesLocal(start) < timeToMinutesLocal(s.end) && timeToMinutesLocal(s.start) < timeToMinutesLocal(end));

  if (existingShift) {
    util.updateShift(existingShift.id, { ...data, status: document.getElementById('se-status').value });
  } else {
    util.addShift(empId, data);
  }
  selectedDate = date;
  toast(overlaps ? 'Shift saved — but it overlaps another shift for this employee.' : 'Shift saved.', overlaps ? 'error' : 'success');
  closeTeamDrawer();
  renderAll();
}

function timeToMinutesLocal(t) {
  const [h, m] = (t || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
}

// ---------------------------------------------------------------------------
// Share / Export — Team Schedule. All data comes from db.shiftsForWeek/etc.,
// nothing hardcoded. See lib/export.js for the underlying CSV/ICS/print/
// clipboard primitives.
// ---------------------------------------------------------------------------
function weekShiftRows() {
  const ws = currentWeekStart();
  return db.shiftsForWeek(ws).filter((s) => s.status !== 'canceled').map((s) => {
    const e = db.employeeById(s.employeeId);
    const bay = db.bayById(s.bayId);
    const day = new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
    return { ...s, employeeName: e ? `${e.firstName} ${e.lastName}` : 'Unknown', day, bayName: bay?.name || '' };
  }).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

function printWeeklySchedule() {
  const rows = weekShiftRows();
  const ws = currentWeekStart();
  printHTML(`Weekly Schedule — week of ${util.fmtDate(ws)}`, `
    <table>
      <thead><tr><th>Employee</th><th>Day</th><th>Date</th><th>Start</th><th>End</th><th>Role</th><th>Bay</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map((r) => `<tr><td>${r.employeeName}</td><td>${r.day}</td><td>${util.fmtDate(r.date)}</td><td>${r.start}</td><td>${r.end}</td><td>${r.roleForShift || ''}</td><td>${r.bayName}</td><td>${r.status}</td></tr>`).join('') || '<tr><td colspan="8">No shifts scheduled this week.</td></tr>'}
      </tbody>
    </table>
  `);
}

function exportScheduleCSV() {
  const rows = weekShiftRows();
  downloadCSV(`schedule-${currentWeekStart()}`, rows, [
    { key: 'employeeName', label: 'Employee' }, { key: 'day', label: 'Day' }, { key: 'date', label: 'Date' },
    { key: 'start', label: 'Start' }, { key: 'end', label: 'End' }, { key: 'roleForShift', label: 'Role' },
    { key: 'bayName', label: 'Bay' }, { key: 'breakMinutes', label: 'Break (min)' }, { key: 'status', label: 'Status' }, { key: 'note', label: 'Notes' },
  ]);
  toast('Schedule exported as CSV.', 'success');
}

function exportScheduleJSON() {
  downloadJSON(`schedule-${currentWeekStart()}`, weekShiftRows());
  toast('Schedule exported as JSON.', 'success');
}

function copyScheduleSummary() {
  const ws = currentWeekStart();
  const rows = weekShiftRows();
  const byEmployee = {};
  rows.forEach((r) => { (byEmployee[r.employeeName] = byEmployee[r.employeeName] || []).push(r); });
  const lines = [`Schedule — week of ${util.fmtDate(ws)}`, ''];
  Object.entries(byEmployee).forEach(([name, shifts]) => {
    lines.push(name + ':');
    shifts.forEach((s) => lines.push(`  ${s.day} ${util.fmtDate(s.date)}: ${s.start}–${s.end}${s.roleForShift ? ' · ' + s.roleForShift : ''}${s.bayName ? ' · ' + s.bayName : ''}`));
  });
  if (!rows.length) lines.push('No shifts scheduled this week.');
  copyToClipboard(lines.join('\n'));
}

function shiftToIcsEvent(s) {
  const e = db.employeeById(s.employeeId);
  const bay = db.bayById(s.bayId);
  const role = s.roleForShift || 'Shift';
  const descParts = [`Role: ${role}.`];
  if (bay) descParts.push(`Bay: ${bay.name}.`);
  if (s.note) descParts.push(`Notes: ${s.note}.`);
  return {
    uid: s.id, title: `Torklio Shift — ${role}`, description: `${e ? e.firstName + ' ' + e.lastName + '. ' : ''}${descParts.join(' ')}`,
    location: bay?.name || '', date: s.date, start: s.start, end: s.end,
  };
}

function downloadScheduleICS(employeeId) {
  const ws = currentWeekStart();
  let rows = db.shiftsForWeek(ws).filter((s) => s.status !== 'canceled');
  if (employeeId) rows = rows.filter((s) => s.employeeId === employeeId);
  if (!rows.length) { toast('No shifts to export for that selection.', 'error'); return; }
  const ics = buildICS(rows.map(shiftToIcsEvent));
  const namePart = employeeId ? (db.employeeById(employeeId)?.firstName || 'employee').toLowerCase() : 'team';
  downloadICS(`schedule-${namePart}-${ws}`, ics);
  toast('Calendar file downloaded.', 'success');
}

function openIcsEmployeePicker() {
  openSmallPickerModal('Download Calendar (.ics)', 'Download', (employeeId) => downloadScheduleICS(employeeId || null));
}

function openRecipientPicker(channel) {
  openSmallPickerModal(channel === 'sms' ? 'Text Preview' : 'Email Preview', 'Preview', (employeeId) => {
    if (!employeeId) { toast('Select an employee.', 'error'); return; }
    const e = db.employeeById(employeeId);
    const ws = currentWeekStart();
    const rows = weekShiftRows().filter((r) => r.employeeId === employeeId);
    const shopName = db.settings().name || 'My Shop';
    const body = rows.length
      ? `Hi ${e.firstName}, here's your schedule for the week of ${util.fmtDate(ws)}:\n` + rows.map((r) => `${r.day} ${util.fmtDate(r.date)}: ${r.start}–${r.end}${r.roleForShift ? ' · ' + r.roleForShift : ''}`).join('\n')
      : `Hi ${e.firstName}, you have no shifts scheduled for the week of ${util.fmtDate(ws)}.`;
    showMessagePreview({
      channel, to: channel === 'sms' ? (e.phone || '') : (e.accountEmail || e.email || ''),
      subject: `Your ${shopName} schedule — week of ${util.fmtDate(ws)}`, body,
    });
  }, true);
}

// Shared tiny "pick an employee" modal used by the .ics and email/text preview menu items.
function openSmallPickerModal(title, actionLabel, onConfirm, required) {
  const employees = db.employees().filter((e) => e.employmentStatus === 'active');
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-head">
        <div class="modal-title">${title}</div>
        <button class="icon-btn" id="pk-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label class="label">Employee</label>
          <select class="select" id="pk-employee">
            ${required ? '<option value="">Select employee…</option>' : '<option value="">Whole team</option>'}
            ${employees.map((e) => `<option value="${e.id}">${e.firstName} ${e.lastName}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" id="pk-cancel">Cancel</button>
        <button class="btn btn-primary" id="pk-confirm">${actionLabel}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const cleanup = () => overlay.remove();
  overlay.querySelector('#pk-close').addEventListener('click', cleanup);
  overlay.querySelector('#pk-cancel').addEventListener('click', cleanup);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
  overlay.querySelector('#pk-confirm').addEventListener('click', () => {
    const val = overlay.querySelector('#pk-employee').value;
    cleanup();
    onConfirm(val);
  });
}
