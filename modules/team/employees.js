// AutoBook — modules/team/employees.js (§B.4.2/B.4.3 Phase 1 + TeamOps Phase 2)
// Directory (with summary cards) + a fuller employee profile drawer
// (Overview / User Account / Schedule / PTO / Role & Permissions /
// Performance / Documents / Activity) + Add/Edit Employee. Still a local
// demo system — no real auth, payroll, or HR compliance. Every write goes
// through db.employees()/db.shifts()/db.ptoRequests()/etc. via lib/util.js's
// TeamOps Phase 2 helpers — same localStorage pattern as the rest of the app.

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { auth } from '../../lib/auth.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import { openTeamDrawer, closeTeamDrawer } from './team-app.js';

const EMPLOYMENT_STATUSES = ['active', 'inactive', 'on_leave', 'terminated'];
const WORK_STATUSES = ['working', 'idle', 'waiting'];
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contractor', 'seasonal'];
const ACCOUNT_STATUSES = ['invited', 'active', 'suspended', 'deactivated'];
const ACCOUNT_BADGE = { invited: 'badge-blue', active: 'badge-green', suspended: 'badge-amber', deactivated: 'badge-red' };
const PTO_BADGE = { pending: 'badge-amber', approved: 'badge-green', denied: 'badge-red', canceled: 'badge-gray' };
const ACCESS_BADGE = { full: 'badge-green', limited: 'badge-blue', read_only: 'badge-gray', none: 'badge-red' };
// Roles whose employees are technicians (drives bay assignment + floor
// status, same as the existing `isTech`/`techs()` convention elsewhere).
const TECH_ROLES = ['technician', 'apprentice'];

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'account', label: 'User Account' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'pto', label: 'PTO / Time Off' },
  { id: 'role', label: 'Role & Permissions' },
  { id: 'performance', label: 'Performance' },
  { id: 'documents', label: 'Documents' },
  { id: 'activity', label: 'Activity' },
];

export function renderEmployees(mount) {
  mount.innerHTML = `
    <div class="grid-3" id="team-metrics" style="margin-bottom:var(--s4)"></div>
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Employees</div><button class="btn btn-primary btn-sm" id="add-employee-btn">+ Add Employee</button></div>
      <div class="card-body" id="employees-list"></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-head"><div class="card-title">Today's schedule</div></div>
        <div class="card-body" id="team-today-schedule"></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">PTO requests</div></div>
        <div class="card-body" id="team-pto-summary"></div>
      </div>
    </div>
  `;
  document.getElementById('add-employee-btn').addEventListener('click', () => openEmployeeForm(null));
  renderMetrics();
  renderList();
  renderTodaySchedule();
  renderPtoSummary();
}

function renderMetrics() {
  const m = util.teamMetrics();
  const cards = [
    { label: 'Total Employees', value: m.totalEmployees },
    { label: 'Active Employees', value: m.activeEmployees },
    { label: 'Techs Working Today', value: m.techsWorkingToday },
    { label: 'PTO Pending', value: m.ptoPending },
    { label: 'Open Shifts', value: m.openShifts, placeholder: true },
    { label: 'Suspended/Deactivated', value: m.inactiveOrSuspended },
  ];
  document.getElementById('team-metrics').innerHTML = cards.map((c) => `
    <div class="stat-card">
      <div class="stat-label">${c.label}${c.placeholder ? ' <span class="badge badge-gray" style="font-size:10px">placeholder</span>' : ''}</div>
      <div class="stat-value">${c.value}</div>
    </div>`).join('');
}

function renderTodaySchedule() {
  const today = new Date().toISOString().slice(0, 10);
  const shifts = db.shifts().filter((s) => s.date === today);
  document.getElementById('team-today-schedule').innerHTML = shifts.length
    ? shifts.map((s) => {
        const e = db.employeeById(s.employeeId);
        return `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)"><span>${e ? e.firstName + ' ' + e.lastName : '—'}</span><span class="muted">${s.start}–${s.end} · ${s.roleForShift || ''}</span></div>`;
      }).join('')
    : '<div class="empty-sub">No shifts scheduled today.</div>';
}

function renderPtoSummary() {
  const pending = db.ptoRequests().filter((p) => p.status === 'pending');
  document.getElementById('team-pto-summary').innerHTML = pending.length
    ? pending.map((p) => {
        const e = db.employeeById(p.employeeId);
        return `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)"><span>${e ? e.firstName + ' ' + e.lastName : '—'} <span class="muted">· ${p.type}</span></span><span class="badge ${PTO_BADGE[p.status]}">${p.status}</span></div>`;
      }).join('')
    : '<div class="empty-sub">No pending PTO requests.</div>';
}

function renderList() {
  const employees = db.employees().slice().sort((a, b) => a.firstName.localeCompare(b.firstName));
  document.getElementById('employees-list').innerHTML = employees.map((e) => {
    const role = db.roleById(e.role);
    return `
      <div class="emp-row" data-employee-id="${e.id}">
        <div class="row" style="gap:var(--s3)">
          <div class="emp-avatar">${e.avatar}</div>
          <div>
            <div class="strong" style="color:var(--ink)">${e.firstName} ${e.lastName}</div>
            <div class="muted" style="font-size:var(--t-13)">${e.jobTitle || ''} · ${role?.name || e.role}${e.department ? ' · ' + e.department : ''}</div>
          </div>
        </div>
        <div class="row" style="gap:var(--s2)">
          ${e.isTech ? `<span class="badge ${e.workStatus === 'working' ? 'badge-green' : e.workStatus === 'idle' ? 'badge-amber' : 'badge-blue'}">${e.workStatus}</span>` : ''}
          <span class="badge ${ACCOUNT_BADGE[e.accountStatus] || 'badge-gray'}">${e.accountStatus || 'active'}</span>
          <span class="badge ${e.employmentStatus === 'active' ? 'badge-gray' : 'badge-red'}">${e.employmentStatus}</span>
        </div>
      </div>`;
  }).join('');

  document.querySelectorAll('[data-employee-id]').forEach((row) => {
    row.addEventListener('click', () => openProfile(row.dataset.employeeId));
  });
}

function refreshDashboard() {
  renderMetrics();
  renderList();
  renderTodaySchedule();
  renderPtoSummary();
}

function openProfile(employeeId) {
  renderProfileDrawer(employeeId, 'overview');
}

// ---------------------------------------------------------------------------
function renderProfileDrawer(employeeId, tab) {
  const e = db.employeeById(employeeId);
  const hrVisible = auth.can('employees.view'); // §B.2: HR-sensitive tabs gated

  openTeamDrawer(`
    <div class="modal-head">
      <div class="modal-title">${e.firstName} ${e.lastName}</div>
      <div class="row" style="gap:var(--s2)">
        <button class="btn btn-secondary btn-sm" id="edit-employee-btn">Edit</button>
        <button class="icon-btn" id="close-team-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
    </div>
    <div class="modal-body">
      <div class="tabs" id="profile-tabs" style="margin-bottom:var(--s4);flex-wrap:wrap">
        ${TABS.map((t) => `<div class="tab${tab === t.id ? ' active' : ''}" data-tab="${t.id}">${t.label}</div>`).join('')}
      </div>
      <div id="profile-tab-body"></div>
    </div>
  `);

  document.getElementById('close-team-drawer').addEventListener('click', closeTeamDrawer);
  document.getElementById('edit-employee-btn').addEventListener('click', () => openEmployeeForm(e.id));
  document.querySelectorAll('[data-tab]').forEach((t) => {
    t.addEventListener('click', () => renderProfileDrawer(employeeId, t.dataset.tab));
  });

  const body = document.getElementById('profile-tab-body');
  const renderers = {
    overview: renderOverviewTab, account: renderAccountTab, schedule: renderScheduleTab,
    pto: renderPtoTab, role: renderRoleTab, performance: renderPerformanceTab,
    documents: renderDocumentsTab, activity: renderActivityTab,
  };
  (renderers[tab] || renderOverviewTab)(body, e, hrVisible);
}

function refreshDrawer(employeeId, tab) {
  refreshDashboard();
  renderProfileDrawer(employeeId, tab);
}

// ---------------------------------------------------------------------------
function renderOverviewTab(body, e) {
  const role = db.roleById(e.role);
  const bay = db.bayById(e.bayId);
  const manager = e.managerId ? db.employeeById(e.managerId) : null;
  body.innerHTML = `
    <div class="row between" style="padding:6px 0"><span class="muted">Full name</span><span>${e.firstName} ${e.lastName}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Job title</span><span>${e.jobTitle || '—'}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Department</span><span>${e.department || '—'}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Role</span><span>${role?.name || e.role}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Employment type</span><span>${(e.employmentType || '—').replace('_', ' ')}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Employment status</span><span class="badge ${e.employmentStatus === 'active' ? 'badge-green' : 'badge-gray'}">${e.employmentStatus}</span></div>
    ${e.isTech ? `<div class="row between" style="padding:6px 0"><span class="muted">Floor status</span><span class="badge badge-blue">${e.workStatus}</span></div>` : ''}
    <div class="row between" style="padding:6px 0"><span class="muted">Phone</span><span>${e.phone || '—'}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Email</span><span>${e.email || '—'}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Emergency contact <span class="badge badge-gray" style="font-size:10px">placeholder</span></span><span>${e.emergencyContactName ? `${e.emergencyContactName} · ${e.emergencyContactPhone || ''}` : '—'}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Hired</span><span>${e.hireDate ? util.fmtDate(e.hireDate) : '—'}</span></div>
    ${e.isTech ? `<div class="row between" style="padding:6px 0"><span class="muted">Bay</span><span>${bay?.name || 'Unassigned'}</span></div>` : ''}
    <div class="row between" style="padding:6px 0"><span class="muted">Manager</span><span>${manager ? manager.firstName + ' ' + manager.lastName : '—'}</span></div>
    ${e.isTech ? `<div class="row between" style="padding:6px 0"><span class="muted">Skill level</span><span>${e.skillLevel || '—'}</span></div>` : ''}
    <div class="row between" style="padding:6px 0"><span class="muted">Certifications <span class="badge badge-gray" style="font-size:10px">placeholder</span></span><span>${(e.certifications || []).join(', ') || '—'}</span></div>
    <div style="margin-top:var(--s3)"><div class="muted" style="margin-bottom:4px">Notes</div><div style="font-size:var(--t-13);color:var(--ink-2)">${e.notes || '—'}</div></div>
  `;
}

// ---------------------------------------------------------------------------
function renderAccountTab(body, e) {
  body.innerHTML = `
    <div class="alert alert-amber" style="margin-bottom:var(--s4)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>
      <div><b>No real authentication exists yet.</b> These fields and actions are placeholders that conceptually mirror the Platform/signup Membership model — nothing here actually creates a login.</div>
    </div>
    <div class="row between" style="padding:6px 0"><span class="muted">Account email</span><span>${e.accountEmail || e.email || '—'}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Display name</span><span>${e.firstName} ${e.lastName}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Account status</span><span class="badge ${ACCOUNT_BADGE[e.accountStatus] || 'badge-gray'}">${e.accountStatus || 'active'}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Last login <span class="badge badge-gray" style="font-size:10px">placeholder</span></span><span>${e.lastLoginAt ? util.fmtDateTime(e.lastLoginAt) : 'Never'}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Invite sent <span class="badge badge-gray" style="font-size:10px">placeholder</span></span><span>${e.inviteSentAt ? util.fmtDate(e.inviteSentAt) : '—'}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Role / membership</span><span>${db.roleById(e.role)?.name || e.role}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Shop access</span><span>${db.settings().name || 'My Shop'}</span></div>

    <div class="row" style="gap:var(--s2);flex-wrap:wrap;margin-top:var(--s4)">
      <button class="btn btn-secondary btn-sm" id="acct-invite">Send Invite</button>
      <button class="btn btn-secondary btn-sm" id="acct-reset">Reset Password</button>
      ${e.accountStatus === 'suspended' || e.accountStatus === 'deactivated'
        ? '<button class="btn btn-primary btn-sm" id="acct-reactivate">Reactivate Account</button>'
        : '<button class="btn btn-danger btn-sm" id="acct-suspend">Suspend Account</button>'}
    </div>
  `;

  document.getElementById('acct-invite').addEventListener('click', () => {
    util.sendAccountInvite(e.id);
    toast(`Invite sent (demo only) to ${e.accountEmail || e.email}.`, 'success');
    refreshDrawer(e.id, 'account');
  });
  document.getElementById('acct-reset').addEventListener('click', () => {
    util.requestPasswordReset(e.id);
    toast('Password reset requested (placeholder — no real auth yet).', 'success');
    refreshDrawer(e.id, 'account');
  });
  document.getElementById('acct-suspend')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog(`Suspend ${e.firstName}'s account?`, { confirmLabel: 'Suspend' });
    if (!confirmed) return;
    util.setAccountStatus(e.id, 'suspended');
    toast('Account suspended.', 'success');
    refreshDrawer(e.id, 'account');
  });
  document.getElementById('acct-reactivate')?.addEventListener('click', () => {
    util.setAccountStatus(e.id, 'active');
    toast('Account reactivated.', 'success');
    refreshDrawer(e.id, 'account');
  });
}

// ---------------------------------------------------------------------------
function renderScheduleTab(body, e) {
  const bays = db.bays();
  body.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Add shift</div></div>
      <div class="card-body grid-2">
        <div class="field"><label class="label">Date</label><input class="input" type="date" id="sh-date"></div>
        <div class="field"><label class="label">Bay/role for shift</label>
          <select class="select" id="sh-bay"><option value="">No bay</option>${bays.map((b) => `<option value="${b.id}">${b.name}</option>`).join('')}</select>
        </div>
        <div class="field"><label class="label">Start time</label><input class="input" type="time" id="sh-start" value="08:00"></div>
        <div class="field"><label class="label">End time</label><input class="input" type="time" id="sh-end" value="17:00"></div>
        <div class="field" style="grid-column:1/-1"><label class="label">Availability notes <span class="badge badge-gray" style="font-size:10px">placeholder</span></label><input class="input" id="sh-note" placeholder="e.g. lunch 12–12:30, overtime ok"></div>
        <div style="grid-column:1/-1"><button class="btn btn-primary btn-sm" id="sh-add">+ Add Shift</button></div>
      </div>
    </div>
    <div class="card"><div class="card-head"><div class="card-title">Upcoming &amp; recent shifts</div></div><div class="card-body" id="shift-list"></div></div>
  `;

  let editingShiftId = null;

  const renderShiftList = () => {
    const list = db.shiftsForEmployee(e.id).slice().sort((a, b) => a.date.localeCompare(b.date));
    document.getElementById('shift-list').innerHTML = list.length
      ? list.map((s) => {
          const bay = db.bayById(s.bayId);
          if (s.id === editingShiftId) {
            return `
            <div class="row" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule);gap:var(--s2);flex-wrap:wrap;align-items:center">
              <span class="muted" style="font-size:var(--t-13)">${util.fmtDate(s.date)}</span>
              <input class="input" type="time" id="sh-edit-start" value="${s.start}" style="width:auto">
              <span class="muted">–</span>
              <input class="input" type="time" id="sh-edit-end" value="${s.end}" style="width:auto">
              <button class="btn btn-primary btn-sm" data-save-shift="${s.id}">Save</button>
              <button class="btn btn-secondary btn-sm" data-cancel-shift-edit>Cancel</button>
            </div>`;
          }
          return `
          <div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
            <span>${util.fmtDate(s.date)} · ${s.start}–${s.end}${bay ? ' · ' + bay.name : ''}${s.roleForShift ? ' · ' + s.roleForShift : ''}</span>
            <span class="row" style="gap:var(--s2)">
              <span class="badge badge-gray">${s.status || 'scheduled'}</span>
              <button class="icon-btn" data-edit-shift="${s.id}" title="Edit" style="width:26px;height:26px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg></button>
              <button class="icon-btn" data-remove-shift="${s.id}" title="Remove" style="width:26px;height:26px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            </span>
          </div>`;
        }).join('')
      : '<div class="empty-sub">No shifts scheduled yet.</div>';

    document.querySelectorAll('[data-remove-shift]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const confirmed = await confirmDialog('Remove this shift?', { confirmLabel: 'Remove' });
        if (!confirmed) return;
        util.removeShift(btn.dataset.removeShift);
        toast('Shift removed.');
        renderShiftList();
      });
    });
    document.querySelectorAll('[data-edit-shift]').forEach((btn) => {
      btn.addEventListener('click', () => {
        editingShiftId = btn.dataset.editShift;
        renderShiftList();
      });
    });
    document.querySelector('[data-cancel-shift-edit]')?.addEventListener('click', () => {
      editingShiftId = null;
      renderShiftList();
    });
    document.querySelector('[data-save-shift]')?.addEventListener('click', (ev) => {
      const start = document.getElementById('sh-edit-start').value;
      const end = document.getElementById('sh-edit-end').value;
      try {
        util.updateShift(ev.target.dataset.saveShift, { start, end });
        toast('Shift updated.', 'success');
        editingShiftId = null;
        renderShiftList();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  };

  document.getElementById('sh-add').addEventListener('click', () => {
    const date = document.getElementById('sh-date').value;
    const start = document.getElementById('sh-start').value;
    const end = document.getElementById('sh-end').value;
    if (!date || !start || !end) {
      toast('Date, start, and end time are required.', 'error');
      return;
    }
    util.addShift(e.id, { date, start, end, bayId: document.getElementById('sh-bay').value || null, note: document.getElementById('sh-note').value.trim() });
    toast('Shift added.', 'success');
    renderShiftList();
  });

  renderShiftList();
}

// ---------------------------------------------------------------------------
function renderPtoTab(body, e) {
  body.innerHTML = `
    <div class="grid-2" style="margin-bottom:var(--s4)">
      <div class="stat-card"><div class="stat-label">PTO Balance</div><div class="stat-value">${e.ptoBalanceHours ?? 0}<small style="font-size:var(--t-md)"> hrs</small></div></div>
      <div class="stat-card"><div class="stat-label">Sick Balance <span class="badge badge-gray" style="font-size:10px">placeholder</span></div><div class="stat-value">${e.sickBalanceHours ?? 0}<small style="font-size:var(--t-md)"> hrs</small></div></div>
    </div>
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Request time off</div></div>
      <div class="card-body grid-2">
        <div class="field"><label class="label">Type</label>
          <select class="select" id="pto-type"><option value="pto">PTO</option><option value="sick">Sick</option><option value="unpaid">Unpaid</option><option value="bereavement">Bereavement</option><option value="other">Other</option></select>
        </div>
        <div class="field"><label class="label">Hours requested</label><input class="input" type="number" min="0" id="pto-hours" value="8"></div>
        <div class="field"><label class="label">Start date</label><input class="input" type="date" id="pto-start"></div>
        <div class="field"><label class="label">End date</label><input class="input" type="date" id="pto-end"></div>
        <div class="field" style="grid-column:1/-1"><label class="label">Reason</label><input class="input" id="pto-reason" placeholder="Optional"></div>
        <div style="grid-column:1/-1"><button class="btn btn-primary btn-sm" id="pto-request">Request Time Off</button></div>
      </div>
    </div>
    <div class="card"><div class="card-head"><div class="card-title">Requests</div></div><div class="card-body" id="pto-list"></div></div>
  `;

  const renderPtoList = () => {
    const list = db.ptoForEmployee(e.id).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    document.getElementById('pto-list').innerHTML = list.length
      ? list.map((p) => `
        <div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
          <span>${p.type} · ${util.fmtDate(p.startDate)} – ${util.fmtDate(p.endDate)} · ${p.hours} hrs${p.reason ? ' · ' + p.reason : ''}</span>
          <span class="row" style="gap:var(--s2)">
            <span class="badge ${PTO_BADGE[p.status] || 'badge-gray'}">${p.status}</span>
            ${p.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-pto-approve="${p.id}">Approve</button><button class="btn btn-danger btn-sm" data-pto-deny="${p.id}">Deny</button><button class="btn btn-secondary btn-sm" data-pto-cancel="${p.id}">Cancel</button>` : ''}
          </span>
        </div>
        ${p.managerNote ? `<div class="muted" style="font-size:var(--t-13);padding:0 0 var(--s2)">Manager note: ${p.managerNote}</div>` : ''}`).join('')
      : '<div class="empty-sub">No time-off requests yet.</div>';

    document.querySelectorAll('[data-pto-approve]').forEach((btn) => btn.addEventListener('click', () => {
      util.setPtoStatus(btn.dataset.ptoApprove, 'approved', 'Approved.');
      toast('Request approved.', 'success');
      refreshDrawerKeepTab();
    }));
    document.querySelectorAll('[data-pto-deny]').forEach((btn) => btn.addEventListener('click', () => {
      util.setPtoStatus(btn.dataset.ptoDeny, 'denied', 'Denied.');
      toast('Request denied.');
      refreshDrawerKeepTab();
    }));
    document.querySelectorAll('[data-pto-cancel]').forEach((btn) => btn.addEventListener('click', () => {
      util.cancelPto(btn.dataset.ptoCancel);
      toast('Request canceled.');
      refreshDrawerKeepTab();
    }));
  };

  const refreshDrawerKeepTab = () => refreshDrawer(e.id, 'pto');

  document.getElementById('pto-request').addEventListener('click', () => {
    const startDate = document.getElementById('pto-start').value;
    const endDate = document.getElementById('pto-end').value;
    const hours = document.getElementById('pto-hours').value;
    if (!startDate || !endDate) {
      toast('Start and end date are required.', 'error');
      return;
    }
    util.requestPto(e.id, { type: document.getElementById('pto-type').value, startDate, endDate, hours, reason: document.getElementById('pto-reason').value.trim() });
    toast('Time off requested.', 'success');
    refreshDrawerKeepTab();
  });

  renderPtoList();
}

// ---------------------------------------------------------------------------
function renderRoleTab(body, e, hrVisible) {
  if (!hrVisible) {
    body.innerHTML = '<div class="empty-sub">You don\'t have permission to view role/permission details.</div>';
    return;
  }
  const roles = db.roles();
  const role = db.roleById(e.role);
  const moduleAccess = util.moduleAccessForRole(e.role);
  const overrides = e.permissionOverrides || {};
  // Union of every permission key across all roles, not just this employee's
  // current role — an override can grant something the role doesn't.
  const allPerms = [...new Set(roles.flatMap((r) => Object.keys(r.permissions)))].sort();

  body.innerHTML = `
    <div class="field" style="margin-bottom:var(--s4);max-width:280px">
      <label class="label">Role</label>
      <select class="select" id="role-select">
        ${roles.map((r) => `<option value="${r.id}" ${e.role === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}
      </select>
    </div>

    <div class="row between" style="margin-bottom:var(--s2)">
      <div class="section-label">Permission overrides</div>
      <span class="badge badge-green">real — enforced by auth.can()</span>
    </div>
    <div class="muted" style="font-size:var(--t-13);margin-bottom:var(--s3)">Default comes from the <b>${role?.name || e.role}</b> role. Toggle a permission to override it just for ${e.firstName}; "Reset" clears the override and falls back to the role default.</div>
    <table class="table" style="margin-bottom:var(--s4)">
      <tbody>
        ${allPerms.map((perm) => {
          const hasOverride = perm in overrides;
          const effective = hasOverride ? overrides[perm] : !!role?.permissions?.[perm];
          return `
          <tr>
            <td>${perm}${hasOverride ? ' <span class="badge badge-amber" style="font-size:10px">override</span>' : ''}</td>
            <td style="text-align:right">
              <label class="row" style="gap:6px;justify-content:flex-end">
                <input type="checkbox" data-perm-toggle="${perm}" ${effective ? 'checked' : ''}>
                <span class="muted" style="font-size:var(--t-13)">${effective ? 'Allow' : 'Deny'}</span>
              </label>
            </td>
            <td style="width:70px;text-align:right">${hasOverride ? `<button class="btn-ghost" data-perm-reset="${perm}" title="Reset to role default" style="padding:2px">↺</button>` : ''}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <div class="row between" style="margin-bottom:var(--s2)">
      <div class="section-label">Module access</div>
      <span class="badge badge-gray">placeholder — not enforced yet</span>
    </div>
    <table class="table">
      <tbody>
        ${moduleAccess.modules.map((m) => `<tr><td>${m}</td><td style="text-align:right"><span class="badge ${ACCESS_BADGE[moduleAccess.access[m]] || 'badge-gray'}">${(moduleAccess.access[m] || 'none').replace('_', ' ')}</span></td></tr>`).join('')}
      </tbody>
    </table>
  `;

  document.getElementById('role-select').addEventListener('change', (ev) => {
    util.setEmployeeRole(e.id, ev.target.value);
    toast(`Role changed to ${db.roleById(ev.target.value)?.name}.`, 'success');
    refreshDrawer(e.id, 'role');
  });
  document.querySelectorAll('[data-perm-toggle]').forEach((cb) => {
    cb.addEventListener('change', () => {
      util.setPermissionOverride(e.id, cb.dataset.permToggle, cb.checked);
      toast(`${cb.dataset.permToggle} ${cb.checked ? 'allowed' : 'denied'} for ${e.firstName}.`, 'success');
      refreshDrawer(e.id, 'role');
    });
  });
  document.querySelectorAll('[data-perm-reset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      util.setPermissionOverride(e.id, btn.dataset.permReset, null);
      toast(`${btn.dataset.permReset} reset to role default.`);
      refreshDrawer(e.id, 'role');
    });
  });
}

// ---------------------------------------------------------------------------
function renderPerformanceTab(body, e) {
  const perf = util.employeePerformance(e.id);
  body.innerHTML = `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card"><div class="stat-label">Active Jobs</div><div class="stat-value">${perf.activeJobs}</div></div>
      <div class="stat-card"><div class="stat-label">Completed Jobs</div><div class="stat-value">${perf.completedJobs}</div></div>
      <div class="stat-card"><div class="stat-label">Avg RO Value</div><div class="stat-value">${util.fmtMoney0(perf.avgRoValue)}</div></div>
    </div>
    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card"><div class="stat-label">Billed Hours <span class="badge badge-gray" style="font-size:10px">placeholder</span></div><div class="stat-value">—</div></div>
      <div class="stat-card"><div class="stat-label">Efficiency <span class="badge badge-gray" style="font-size:10px">placeholder</span></div><div class="stat-value">—</div></div>
      <div class="stat-card"><div class="stat-label">Comebacks <span class="badge badge-gray" style="font-size:10px">placeholder</span></div><div class="stat-value">—</div></div>
    </div>
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Coaching notes <span class="badge badge-gray" style="font-size:10px">placeholder</span></div></div>
      <div class="card-body"><div class="empty-sub">No coaching notes yet.</div></div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">Recent repair orders</div></div>
      <div class="card-body">
        ${perf.recentRos.length
          ? perf.recentRos.map((a) => `
            <div class="activity-row">
              <span>${a.ro} <span class="badge badge-gray" style="margin-left:4px">${a.role}</span></span>
              <span class="row" style="gap:var(--s2)"><span class="muted">${util.fmtDate(a.at)}</span><span class="badge ${util.statusMeta(a.status).badgeClass}">${util.statusMeta(a.status).label}</span></span>
            </div>`).join('')
          : '<div class="empty-sub">No repair order activity yet.</div>'}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
const DOC_TYPES = [
  { value: 'employment_agreement', label: 'Employment Agreement' },
  { value: 'certification', label: 'Certification' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'training', label: 'Training Doc' },
  { value: 'handbook_acknowledgement', label: 'Handbook Acknowledgement' },
  { value: 'payroll', label: 'Tax/Payroll Doc' },
];

function renderDocumentsTab(body, e) {
  body.innerHTML = `
    <div class="alert alert-amber" style="margin-bottom:var(--s4)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>
      <div>Document records only — no real file upload/storage exists yet.</div>
    </div>
    <div class="row" style="gap:var(--s2);margin-bottom:var(--s4);flex-wrap:wrap">
      <select class="select" id="doc-type" style="max-width:220px">${DOC_TYPES.map((d) => `<option value="${d.value}">${d.label}</option>`).join('')}</select>
      <input class="input" id="doc-expires" type="date" style="max-width:160px" placeholder="Expiration (optional)">
      <button class="btn btn-secondary btn-sm" id="doc-add">+ Upload Document (placeholder)</button>
    </div>
    <div class="card"><div class="card-body" id="doc-list"></div></div>
  `;

  const renderDocList = () => {
    const docs = db.documentsForEmployee(e.id);
    document.getElementById('doc-list').innerHTML = docs.length
      ? docs.map((d) => `
        <div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
          <span>${d.name}${d.expiresAt ? ` <span class="muted" style="font-size:var(--t-13)">· expires ${util.fmtDate(d.expiresAt)}</span>` : ''}</span>
          <span class="row" style="gap:var(--s2)">
            <span class="badge ${d.status === 'expiring_soon' ? 'badge-amber' : 'badge-gray'}">${(d.status || 'on_file').replace('_', ' ')}</span>
            <button class="btn btn-secondary btn-sm" data-view-doc="${d.id}">View</button>
          </span>
        </div>`).join('')
      : '<div class="empty-sub">No documents on file.</div>';

    document.querySelectorAll('[data-view-doc]').forEach((btn) => btn.addEventListener('click', () => toast('Document preview is a placeholder — no real file storage yet.')));
  };

  document.getElementById('doc-add').addEventListener('click', () => {
    const type = document.getElementById('doc-type').value;
    const label = DOC_TYPES.find((d) => d.value === type)?.label || type;
    const docs = db.employeeDocuments();
    docs.push({ id: db.nextId('doc'), employeeId: e.id, name: label, type, status: 'on_file', expiresAt: document.getElementById('doc-expires').value || null, uploadedAt: new Date().toISOString() });
    db.saveEmployeeDocuments(docs);
    toast('Document record added (placeholder — no real file was uploaded).', 'success');
    renderDocList();
  });

  renderDocList();
}

// ---------------------------------------------------------------------------
const TEAM_ACTIVITY_LABEL = {
  shift_added: 'Shift added', shift_edited: 'Shift edited', shift_removed: 'Shift removed',
  pto_requested: 'PTO requested', pto_approved: 'PTO approved', pto_denied: 'PTO denied', pto_canceled: 'PTO canceled',
  invite_sent: 'Account invite sent', account_status_changed: 'Account status changed',
  password_reset_requested: 'Password reset requested', role_changed: 'Role/profile updated',
  employee_created: 'Employee created', employee_updated: 'Employee updated',
};

function renderActivityTab(body, e) {
  const teamActivity = db.teamActivityFor(e.id).slice().sort((a, b) => new Date(b.at) - new Date(a.at));
  const roActivity = db.employeeActivity(e.id);

  body.innerHTML = `
    <div class="ro-detail-section" style="border-bottom:1px solid var(--rule);padding-bottom:var(--s4);margin-bottom:var(--s4)">
      <div class="section-label" style="margin-bottom:var(--s3)">Team activity</div>
      ${teamActivity.length
        ? teamActivity.map((a) => `
          <div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)">
            <span>${TEAM_ACTIVITY_LABEL[a.type] || a.type}${a.detail ? ` <span class="muted">· ${a.detail}</span>` : ''}</span>
            <span class="muted" style="font-size:var(--t-13)">${util.fmtDate(a.at)}</span>
          </div>`).join('')
        : '<div class="empty-sub">No team activity yet.</div>'}
    </div>
    <div class="section-label" style="margin-bottom:var(--s3)">Repair order activity</div>
    ${roActivity.length
      ? roActivity.map((a) => `
        <div class="activity-row">
          <span>${a.ro} <span class="badge badge-gray" style="margin-left:4px">${a.role}</span></span>
          <span class="row" style="gap:var(--s2)"><span class="muted">${util.fmtDate(a.at)}</span><span class="badge ${util.statusMeta(a.status).badgeClass}">${util.statusMeta(a.status).label}</span></span>
        </div>`).join('')
      : '<div class="empty-sub">No repair order activity yet.</div>'}
  `;
}

// ---------------------------------------------------------------------------
// Add / Edit Employee form. Same drawer, just a different body — Cancel
// returns to the read-only profile (Edit) or closes the drawer (Add).
// ---------------------------------------------------------------------------
function openEmployeeForm(employeeId) {
  const e = employeeId ? db.employeeById(employeeId) : null;
  const roles = db.roles();
  const bays = db.bays();
  const managers = db.employees().filter((emp) => emp.id !== employeeId);

  openTeamDrawer(`
    <div class="modal-head">
      <div class="modal-title">${e ? `Edit ${e.firstName} ${e.lastName}` : 'New Employee'}</div>
      <button class="icon-btn" id="close-team-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="grid-2">
        <div class="field"><label class="label">First name</label><input class="input" id="ef-first" value="${e?.firstName || ''}"></div>
        <div class="field"><label class="label">Last name</label><input class="input" id="ef-last" value="${e?.lastName || ''}"></div>
        <div class="field"><label class="label">Job title</label><input class="input" id="ef-title" value="${e?.jobTitle || ''}"></div>
        <div class="field"><label class="label">Department</label><input class="input" id="ef-department" value="${e?.department || ''}"></div>
        <div class="field">
          <label class="label">Role</label>
          <select class="select" id="ef-role">
            <option value="">Select role…</option>
            ${roles.map((r) => `<option value="${r.id}" ${e?.role === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="label">Manager</label>
          <select class="select" id="ef-manager">
            <option value="">None</option>
            ${managers.map((m) => `<option value="${m.id}" ${e?.managerId === m.id ? 'selected' : ''}>${m.firstName} ${m.lastName}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label class="label">Phone</label><input class="input" id="ef-phone" value="${e?.phone || ''}"></div>
        <div class="field"><label class="label">Email</label><input class="input" type="email" id="ef-email" value="${e?.email || ''}"></div>
        <div class="field">
          <label class="label">Assigned bay</label>
          <select class="select" id="ef-bay">
            <option value="">Unassigned</option>
            ${bays.map((b) => `<option value="${b.id}" ${e?.bayId === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="label">Work status</label>
          <select class="select" id="ef-workstatus">
            ${WORK_STATUSES.map((s) => `<option value="${s}" ${(e?.workStatus || 'idle') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="label">Employment type</label>
          <select class="select" id="ef-emptype">
            ${EMPLOYMENT_TYPES.map((s) => `<option value="${s}" ${(e?.employmentType || 'full_time') === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="label">Employment status</label>
          <select class="select" id="ef-empstatus">
            ${EMPLOYMENT_STATUSES.map((s) => `<option value="${s}" ${(e?.employmentStatus || 'active') === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label class="label">Skill level <span class="badge badge-gray" style="font-size:10px">if applicable</span></label><input class="input" id="ef-skill" value="${e?.skillLevel || ''}"></div>
        <div class="field"><label class="label">Emergency contact name</label><input class="input" id="ef-ec-name" value="${e?.emergencyContactName || ''}"></div>
        <div class="field"><label class="label">Emergency contact phone</label><input class="input" id="ef-ec-phone" value="${e?.emergencyContactPhone || ''}"></div>
        <div class="field" style="grid-column:1/-1"><label class="label">Notes</label><textarea class="textarea" id="ef-notes">${e?.notes || ''}</textarea></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="ef-cancel">Cancel</button>
      <button class="btn btn-primary" id="ef-save">Save</button>
    </div>
  `);

  document.getElementById('close-team-drawer').addEventListener('click', closeTeamDrawer);
  document.getElementById('ef-cancel').addEventListener('click', () => {
    if (e) renderProfileDrawer(e.id, 'overview');
    else closeTeamDrawer();
  });
  document.getElementById('ef-save').addEventListener('click', () => saveEmployeeForm(employeeId));
}

function saveEmployeeForm(employeeId) {
  const firstName = document.getElementById('ef-first').value.trim();
  const lastName = document.getElementById('ef-last').value.trim();
  const role = document.getElementById('ef-role').value;
  if (!firstName || !lastName || !role) {
    toast('First name, last name, and role are required.', 'error');
    return;
  }

  const employees = db.employees();
  const isTech = TECH_ROLES.includes(role);
  const fields = {
    firstName, lastName, role, isTech,
    jobTitle: document.getElementById('ef-title').value.trim(),
    department: document.getElementById('ef-department').value.trim(),
    managerId: document.getElementById('ef-manager').value || null,
    phone: document.getElementById('ef-phone').value.trim(),
    email: document.getElementById('ef-email').value.trim(),
    bayId: document.getElementById('ef-bay').value || null,
    workStatus: document.getElementById('ef-workstatus').value,
    employmentType: document.getElementById('ef-emptype').value,
    employmentStatus: document.getElementById('ef-empstatus').value,
    skillLevel: document.getElementById('ef-skill').value.trim(),
    emergencyContactName: document.getElementById('ef-ec-name').value.trim(),
    emergencyContactPhone: document.getElementById('ef-ec-phone').value.trim(),
    notes: document.getElementById('ef-notes').value.trim(),
  };

  let savedId = employeeId;
  if (employeeId) {
    const existing = employees.find((emp) => emp.id === employeeId);
    Object.assign(existing, fields);
    db.saveEmployees(employees);
    util.logTeamActivity(employeeId, 'employee_updated', 'Profile updated');
  } else {
    savedId = db.nextId('emp');
    employees.push({
      id: savedId,
      avatar: (firstName.charAt(0) + lastName.charAt(0)).toUpperCase(),
      payType: 'hourly', payRate: 0, clockStatus: 'out',
      hireDate: new Date().toISOString().slice(0, 10), permissionOverrides: {},
      accountStatus: 'invited', accountEmail: fields.email, lastLoginAt: null, inviteSentAt: null,
      ptoBalanceHours: 0, sickBalanceHours: 0, certifications: [],
      ...fields,
    });
    db.saveEmployees(employees);
    util.logTeamActivity(savedId, 'employee_created', `${firstName} ${lastName} added as ${fields.jobTitle || role}`);
  }
  toast(employeeId ? 'Employee updated.' : 'Employee added.', 'success');
  refreshDashboard();
  renderProfileDrawer(savedId, 'overview');
}
