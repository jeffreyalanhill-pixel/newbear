// AutoBook — modules/team/roles.js (§B.4.8, Phase 1)
// View + edit each role's default permission flags. Changing a permission
// writes an audit entry (§B.6).

import { db } from '../../lib/data.js';
import { auth } from '../../lib/auth.js';
import { toast } from '../../lib/nav.js';

export function renderRoles(mount) {
  mount.innerHTML = `<div id="roles-list"></div>`;
  renderList();
}

function renderList() {
  const roles = db.roles();
  document.getElementById('roles-list').innerHTML = roles.map((r) => `
    <div class="role-card">
      <div class="row between">
        <div class="strong" style="color:var(--ink);font-size:var(--t-md)">${r.name}</div>
        <span class="badge badge-gray">${db.employees().filter((e) => e.role === r.id).length} employee${db.employees().filter((e) => e.role === r.id).length === 1 ? '' : 's'}</span>
      </div>
      <div class="perm-grid">
        ${Object.entries(r.permissions).map(([perm, val]) => `
          <label class="check" style="font-size:var(--t-13)">
            <input type="checkbox" data-role="${r.id}" data-perm="${perm}" ${val ? 'checked' : ''}>
            ${perm}
          </label>`).join('')}
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-role]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const roles = db.roles();
      const role = roles.find((r) => r.id === cb.dataset.role);
      const oldValue = role.permissions[cb.dataset.perm];
      role.permissions[cb.dataset.perm] = cb.checked;
      db.saveRoles(roles);
      auth.log('role.permission_changed', 'role', role.id, { [cb.dataset.perm]: oldValue }, { [cb.dataset.perm]: cb.checked });
      toast(`${role.name}: ${cb.dataset.perm} ${cb.checked ? 'enabled' : 'disabled'}.`);
    });
  });
}
