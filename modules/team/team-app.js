// AutoBook — modules/team/team-app.js
// TeamOps sub-app shell: shared icon-rail + hash-routed secondary views.
// Phase 1 scope (§B, build order step 13): Employees, Roles & Permissions,
// Schedule. Time Clock/Timecards/PTO/Documents/Performance/Payroll are
// later phases (§B.8).

import { db } from '../../lib/data.js';
import { renderNav } from '../../lib/nav.js';
import { renderEmployees } from './employees.js';
import { renderRoles } from './roles.js';
import { renderSchedule } from './schedule.js';

const VIEWS = {
  employees: renderEmployees,
  roles: renderRoles,
  schedule: renderSchedule,
};

export function renderTeam() {
  renderNav('#icon-rail', 'team.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();

  document.getElementById('team-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'team-overlay') closeTeamDrawer();
  });

  document.getElementById('team-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    location.hash = btn.dataset.view;
  });

  window.addEventListener('hashchange', renderCurrentView);
  renderCurrentView();
}

function renderCurrentView() {
  const view = (location.hash || '#employees').slice(1);
  const fn = VIEWS[view] || VIEWS.employees;
  document.querySelectorAll('#team-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  fn(document.getElementById('team-view-body'));
}

export function closeTeamDrawer() {
  document.getElementById('team-overlay').classList.remove('open');
}
export function openTeamDrawer(html) {
  document.getElementById('team-drawer').innerHTML = html;
  document.getElementById('team-overlay').classList.add('open');
}
