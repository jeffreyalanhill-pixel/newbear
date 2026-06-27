// AutoBook — modules/team/employees.js (§B.4.2/B.4.3, Phase 1)
// Directory + profile (Overview / Role & Permissions / Activity tabs).

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { auth } from '../../lib/auth.js';
import { openTeamDrawer, closeTeamDrawer } from './team-app.js';

export function renderEmployees(mount) {
  mount.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">Employees</div></div><div class="card-body" id="employees-list"></div></div>`;
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
      <button class="icon-btn" id="close-team-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
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
