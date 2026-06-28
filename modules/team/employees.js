// AutoBook — modules/team/employees.js (§B.4.2/B.4.3, Phase 1)
// Directory + profile (Overview / Role & Permissions / Activity tabs) +
// basic Add/Edit Employee (this step). Saving always goes through
// db.employees()/db.saveEmployees — same localStorage pattern every other
// module uses, no new persistence mechanism introduced.

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { auth } from '../../lib/auth.js';
import { toast } from '../../lib/nav.js';
import { openTeamDrawer, closeTeamDrawer } from './team-app.js';

const EMPLOYMENT_STATUSES = ['active', 'inactive', 'on_leave', 'terminated'];
const WORK_STATUSES = ['working', 'idle', 'waiting'];
// Roles whose employees are technicians (drives bay assignment + floor
// status, same as the existing `isTech`/`techs()` convention elsewhere).
const TECH_ROLES = ['technician', 'apprentice'];

export function renderEmployees(mount) {
  mount.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">Employees</div><button class="btn btn-primary btn-sm" id="add-employee-btn">+ Add Employee</button></div><div class="card-body" id="employees-list"></div></div>`;
  document.getElementById('add-employee-btn').addEventListener('click', () => openEmployeeForm(null));
  renderList();
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
            <div class="muted" style="font-size:var(--t-13)">${e.jobTitle || ''} · ${role?.name || e.role}</div>
          </div>
        </div>
        <div class="row" style="gap:var(--s2)">
          ${e.isTech ? `<span class="badge ${e.workStatus === 'working' ? 'badge-green' : e.workStatus === 'idle' ? 'badge-amber' : 'badge-blue'}">${e.workStatus}</span>` : ''}
          <span class="badge ${e.employmentStatus === 'active' ? 'badge-gray' : 'badge-red'}">${e.employmentStatus}</span>
        </div>
      </div>`;
  }).join('');

  document.querySelectorAll('[data-employee-id]').forEach((row) => {
    row.addEventListener('click', () => openProfile(row.dataset.employeeId));
  });
}

function openProfile(employeeId) {
  renderProfileDrawer(employeeId, 'overview');
}

function renderProfileDrawer(employeeId, tab) {
  const e = db.employeeById(employeeId);
  const role = db.roleById(e.role);
  const bay = db.bayById(e.bayId);
  const activity = db.employeeActivity(employeeId);
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
      <div class="tabs" style="margin-bottom:var(--s4)">
        <div class="tab${tab === 'overview' ? ' active' : ''}" data-tab="overview">Overview</div>
        <div class="tab${tab === 'role' ? ' active' : ''}" data-tab="role">Role &amp; Permissions</div>
        <div class="tab${tab === 'activity' ? ' active' : ''}" data-tab="activity">Activity</div>
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
  if (tab === 'overview') {
    body.innerHTML = `
      <div class="row between" style="padding:6px 0"><span class="muted">Job title</span><span>${e.jobTitle || '—'}</span></div>
      <div class="row between" style="padding:6px 0"><span class="muted">Role</span><span>${role?.name || e.role}</span></div>
      <div class="row between" style="padding:6px 0"><span class="muted">Phone</span><span>${e.phone || '—'}</span></div>
      <div class="row between" style="padding:6px 0"><span class="muted">Email</span><span>${e.email || '—'}</span></div>
      <div class="row between" style="padding:6px 0"><span class="muted">Hired</span><span>${e.hireDate ? util.fmtDate(e.hireDate) : '—'}</span></div>
      ${e.isTech ? `<div class="row between" style="padding:6px 0"><span class="muted">Bay</span><span>${bay?.name || 'Unassigned'}</span></div>` : ''}
      <div class="row between" style="padding:6px 0"><span class="muted">Status</span><span class="badge ${e.employmentStatus === 'active' ? 'badge-green' : 'badge-gray'}">${e.employmentStatus}</span></div>
      ${e.isTech ? `<div class="row between" style="padding:6px 0"><span class="muted">Floor status</span><span class="badge badge-blue">${e.workStatus}</span></div>` : ''}
    `;
  } else if (tab === 'role') {
    if (!hrVisible) {
      body.innerHTML = '<div class="empty-sub">You don\'t have permission to view role/permission details.</div>';
      return;
    }
    body.innerHTML = `
      <div class="muted" style="font-size:var(--t-13);margin-bottom:var(--s3)">Default permissions from the <b>${role?.name || e.role}</b> role. Overrides are per-employee.</div>
      <div class="perm-grid">
        ${Object.entries(role?.permissions || {}).map(([perm, val]) => `
          <div class="perm-toggle">
            <span class="dot ${val ? 'dot-green' : 'dot-red'}"></span>
            <span>${perm}</span>
          </div>`).join('') || '<div class="empty-sub">No permissions on this role.</div>'}
      </div>
    `;
  } else if (tab === 'activity') {
    body.innerHTML = activity.length
      ? activity.map((a) => `
        <div class="activity-row">
          <span>${a.ro} <span class="badge badge-gray" style="margin-left:4px">${a.role}</span></span>
          <span class="row" style="gap:var(--s2)"><span class="muted">${util.fmtDate(a.at)}</span><span class="badge ${util.statusMeta(a.status).badgeClass}">${util.statusMeta(a.status).label}</span></span>
        </div>`).join('')
      : '<div class="empty-sub">No repair order activity yet.</div>';
  }
}

// ---------------------------------------------------------------------------
// Add / Edit Employee form. Same drawer, just a different body — Cancel
// returns to the read-only profile (Edit) or closes the drawer (Add).
// ---------------------------------------------------------------------------
function openEmployeeForm(employeeId) {
  const e = employeeId ? db.employeeById(employeeId) : null;
  const roles = db.roles();
  const bays = db.bays();

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
        <div class="field">
          <label class="label">Role</label>
          <select class="select" id="ef-role">
            <option value="">Select role…</option>
            ${roles.map((r) => `<option value="${r.id}" ${e?.role === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}
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
        <div class="field" style="grid-column:1/-1">
          <label class="label">Employment status</label>
          <select class="select" id="ef-empstatus">
            ${EMPLOYMENT_STATUSES.map((s) => `<option value="${s}" ${(e?.employmentStatus || 'active') === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}
          </select>
        </div>
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
    phone: document.getElementById('ef-phone').value.trim(),
    email: document.getElementById('ef-email').value.trim(),
    bayId: document.getElementById('ef-bay').value || null,
    workStatus: document.getElementById('ef-workstatus').value,
    employmentStatus: document.getElementById('ef-empstatus').value,
  };

  let savedId = employeeId;
  if (employeeId) {
    const existing = employees.find((emp) => emp.id === employeeId);
    Object.assign(existing, fields);
  } else {
    savedId = db.nextId('emp');
    employees.push({
      id: savedId,
      avatar: (firstName.charAt(0) + lastName.charAt(0)).toUpperCase(),
      payType: 'hourly', payRate: 0, clockStatus: 'out',
      hireDate: new Date().toISOString().slice(0, 10), permissionOverrides: {},
      ...fields,
    });
  }
  db.saveEmployees(employees);
  toast(employeeId ? 'Employee updated.' : 'Employee added.', 'success');
  renderList();
  renderProfileDrawer(savedId, 'overview');
}
