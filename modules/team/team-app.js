// AutoBook — modules/team/team-app.js
// TeamOps sub-app shell: shared icon-rail + hash-routed secondary views.
// Phase 1 scope (§B, build order step 13): Employees, Roles & Permissions,
// Schedule. Time Clock/Timecards/PTO/Documents/Performance/Payroll are
// later phases (§B.8).

import { db } from '../../lib/data.js';
import { auth } from '../../lib/auth.js';
import { renderNav, toast } from '../../lib/nav.js';
import { renderEmployees } from './employees.js';
import { renderRoles } from './roles.js';
import { renderSchedule } from './schedule.js';

// Demo "View app as" switcher (role+permissions foundation task, §6).
// Just swaps settings.currentUserId — the same single-user mechanism
// auth.currentUser() already reads — then reloads. Lets you preview how
// permission-gated UI (e.g. the Role & Permissions tab, employees.view-gated
// tabs) looks for each role without building real multi-user login.
// One demo employee per normal app permission role (excludes the inactive
// Platform Admin placeholder) — covers all 11 roles named in the role-presets spec.
const DEMO_SWITCH_EMPLOYEE_IDS = ['e_jeff', 'e_priya', 'e_omar', 'e_sara', 'e_robin', 't_marcus', 't_tyler', 'e_dana', 'e_felix', 'e_nina', 'e_walt'];
const OWNER_DEMO_EMPLOYEE_ID = 'e_jeff';

function renderDemoSwitcher() {
  const select = document.getElementById('demo-view-as');
  const resetBtn = document.getElementById('demo-view-reset');
  if (!select) return;
  const currentUserId = db.settings().currentUserId;
  select.innerHTML = DEMO_SWITCH_EMPLOYEE_IDS.map((id) => {
    const emp = db.employeeById(id);
    if (!emp) return '';
    const role = db.roleById(emp.role);
    return `<option value="${id}" ${id === currentUserId ? 'selected' : ''}>${role?.name || emp.role} (${emp.firstName} ${emp.lastName})</option>`;
  }).join('');

  const switchTo = (id) => {
    const settings = db.settings();
    settings.currentUserId = id;
    db.saveSettings(settings);
    toast(`Viewing as ${db.employeeById(id)?.firstName} — reloading…`, 'success');
    setTimeout(() => location.reload(), 400);
  };
  select.addEventListener('change', () => switchTo(select.value));
  // Always-available escape hatch back to Owner/Admin — nothing in this demo
  // switcher should be able to strand you on a role with no way back.
  resetBtn?.addEventListener('click', () => switchTo(OWNER_DEMO_EMPLOYEE_ID));
}

const VIEWS = {
  employees: renderEmployees,
  roles: renderRoles,
  schedule: renderSchedule,
};

// Team UI role tiers (role-presets follow-up) — Roles & Permissions is an
// admin-only tab. Demo/UI-only: see auth.teamAccessTier()'s doc comment and
// the SECURITY WARNING at the top of lib/auth.js.
function currentTeamTier() {
  const employee = db.employeeById(db.settings().currentUserId);
  return employee ? auth.teamAccessTier(employee.role) : 'admin';
}

export function renderTeam() {
  renderNav('#icon-rail', 'team.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();

  const tier = currentTeamTier();
  const rolesTabBtn = document.querySelector('#team-tabs button[data-view="roles"]');
  if (tier !== 'admin') rolesTabBtn?.remove();
  const employeesTabBtn = document.querySelector('#team-tabs button[data-view="employees"]');
  if (employeesTabBtn) employeesTabBtn.textContent = tier === 'admin' ? 'Employees' : tier === 'coverage' ? 'Team' : 'My Team';

  document.getElementById('team-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'team-overlay') closeTeamDrawer();
  });

  document.getElementById('team-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    location.hash = btn.dataset.view;
  });

  // Demo-only guard, not real routing security — if the URL hash is typed
  // directly as #roles by a non-admin tier, fall back to the employees view
  // rather than rendering an admin tab with no way to have reached it via UI.
  window.addEventListener('hashchange', () => {
    if (location.hash === '#roles' && currentTeamTier() !== 'admin') { location.hash = 'employees'; return; }
    renderCurrentView();
  });
  if (location.hash === '#roles' && tier !== 'admin') location.hash = 'employees';
  else renderCurrentView();
  renderDemoSwitcher();
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
