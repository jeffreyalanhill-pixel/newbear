// AutoBook — lib/auth.js (§B.2, Phase 1)
// Light, honor-system permission gating for the localStorage MVP: a "current
// user" (an Employee id, set in Settings/seed), role-based default
// permissions, per-employee overrides, and an audit log. Real auth + RLS
// enforcement arrives with the Supabase swap — this just structures the seam.

import { db } from './data.js';

export const auth = {};

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
