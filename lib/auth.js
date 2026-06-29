// AutoBook — lib/auth.js (§B.2, Phase 1)
// Light, honor-system permission gating for the localStorage MVP: a "current
// user" (an Employee id, set in Settings/seed), role-based default
// permissions, per-employee overrides, and an audit log. Real auth + RLS
// enforcement arrives with the Supabase swap — this just structures the seam.
//
// SECURITY WARNING (role+permissions foundation task): everything in this
// file is a frontend-only convenience for the demo UI. It hides/shows
// buttons and tabs and nothing more — any user can open devtools and call
// db.saveEmployees() directly to grant themselves any role, because there is
// no server. When this app moves to Supabase/a real backend, permissions
// MUST be re-enforced server-side (Postgres RLS policies, API route guards,
// etc). Do not treat anything here as real access control.

import { db } from './data.js';
import { util } from './util.js';

export const auth = {};

// Job Role: the employee's normal job title/category (separate from the
// free-text employee.jobTitle, which is a display string like "Senior
// Technician" — jobRole is the stable category id used for grouping/filtering).
export const JOB_ROLES = [
  { id: 'owner', label: 'Owner' },
  { id: 'general_manager', label: 'General Manager' },
  { id: 'service_manager', label: 'Service Manager' },
  { id: 'service_advisor', label: 'Service Advisor' },
  { id: 'front_desk', label: 'Front Desk' },
  { id: 'technician', label: 'Technician / Mechanic' },
  { id: 'apprentice_technician', label: 'Apprentice Technician' },
  { id: 'parts_inventory', label: 'Parts / Inventory' },
  { id: 'bookkeeper_finance', label: 'Bookkeeper / Finance' },
  { id: 'marketing_crm', label: 'Marketing / CRM' },
  { id: 'viewer', label: 'Viewer / Read Only' },
];

// Shift Role: which role an employee is covering on a specific shift. This
// is intentionally NOT the same list/field as Permission Role — a
// Technician's permission role never changes just because today's shift
// role is "Manager on Duty".
export const SHIFT_ROLES = [
  { id: 'technician', label: 'Technician' },
  { id: 'service_advisor', label: 'Service Advisor' },
  { id: 'front_desk', label: 'Front Desk' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'manager_on_duty', label: 'Manager on Duty' },
];

// Roles assignable to a normal shop employee from the Team UI — excludes
// the Platform Admin placeholder role, which is reserved for Torklio's own
// internal support staff once a real multi-tenant backend exists.
auth.assignableRoles = () => db.roles().filter((r) => !r.isPlatformInternal);

// Default landing page per Permission Role — foundation only; nothing
// currently redirects a logged-in user here automatically (there is no real
// login to redirect after). Used by the demo "View app as" switcher so
// switching roles takes you somewhere sensible for that role.
const DEFAULT_LANDING_BY_ROLE = {
  owner: 'dashboard.html', general_manager: 'dashboard.html', service_manager: 'repair-orders.html', advisor: 'appointments.html',
  technician: 'repair-orders.html', apprentice: 'repair-orders.html', front_desk: 'appointments.html',
  parts: 'inventory.html', bookkeeper: 'invoices.html', marketing: 'crm.html', viewer: 'dashboard.html',
  platform_admin: 'dashboard.html',
};
auth.getDefaultLandingPageForRole = (roleId) => DEFAULT_LANDING_BY_ROLE[roleId] || 'dashboard.html';

// Returns { modules, access } — the module-access matrix for a role (see
// util.moduleAccessForRole). Foundation/demo only — see the module-level
// warning above and the 'placeholder — not enforced yet' badge in the UI.
auth.getRolePermissions = (roleId) => util.moduleAccessForRole(roleId);

// action: one of 'view'|'create'|'edit'|'delete'|'approve'|'export'|'admin'.
// Foundation/demo only — nothing currently calls this to block a page; it
// exists so future screens have a single function to ask "can this role do
// X in module Y" without re-deriving the access-level → action mapping.
auth.canUser = (roleId, module, action) => {
  const { access } = util.moduleAccessForRole(roleId);
  return util.actionsForAccessLevel(access[module]).includes(action);
};

// Team-section UI tier (role-presets follow-up — "Team UI for lower roles").
// Maps the existing Team module access level onto three UI experiences:
//   'admin'    (Team: full)    — Owner/Admin, General Manager: full employee
//               management (Add/Edit, Roles & Permissions, account status).
//   'coverage' (Team: limited) — Service Manager: team/bay coverage and a
//               directory, but no admin actions.
//   'personal' (Team: none)    — everyone else: a "My Team" personal view
//               (own profile/schedule/PTO/time clock) + a safe directory.
// Demo/UI-only — see the SECURITY WARNING at the top of this file. Real
// enforcement must happen server-side after the Supabase/backend migration.
auth.teamAccessTier = (roleId) => {
  const level = util.moduleAccessForRole(roleId).access.Team;
  if (level === 'full') return 'admin';
  if (level === 'limited') return 'coverage';
  return 'personal';
};

// Nav items whose role-based module access is anything other than 'none'.
// `navItems` is an array of { label, href, module } — callers supply their
// own nav list (e.g. from lib/nav.js) since auth.js doesn't own page routing.
// Foundation/demo only — lib/nav.js's renderNav() does not currently call
// this; every nav link is shown to every employee regardless of role.
auth.getVisibleNavForRole = (roleId, navItems) => {
  const { access } = util.moduleAccessForRole(roleId);
  return navItems.filter((item) => (access[item.module] || 'none') !== 'none');
};

auth.currentUser = () => db.employeeById(db.settings().currentUserId);

auth.can = (permission, employeeId) => {
  const employee = employeeId ? db.employeeById(employeeId) : auth.currentUser();
  if (!employee) return false;
  if (employee.permissionOverrides && permission in employee.permissionOverrides) {
    return !!employee.permissionOverrides[permission];
  }
  const role = db.roleById(employee.role);
  return !!role?.permissions?.[permission];
};

auth.requireOrHide = (el, permission) => {
  if (!el) return;
  el.style.display = auth.can(permission) ? '' : 'none';
};

auth.log = (action, targetType, targetId, oldValue, newValue) => {
  const logs = db.auditLogs();
  logs.push({
    id: db.nextId('audit'),
    userId: auth.currentUser()?.id || null,
    action,
    targetType,
    targetId,
    oldValue,
    newValue,
    at: new Date().toISOString(),
  });
  db.saveAuditLogs(logs);
};
