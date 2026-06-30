// AutoBook — modules/settings.js (§11.13)
// Tabbed shop settings. Every tab writes through db.save* — other pages
// reflect changes on next render since nothing caches settings/services/bays.

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import { renderNav, toast, confirmDialog } from '../lib/nav.js';
import { auth } from '../lib/auth.js';
import * as rewardsLib from '../lib/rewards.js';

const VIEWS = { shop: renderShop, services: renderServices, bays: renderBays, coupons: renderCoupons, roles: renderRolesSettings, subscription: renderSubscription, data: renderDataSettings, rewards: renderRewardsSettings };

// Only owner/admin and general_manager can access Roles & Permissions.
function canManageRoles() {
  const emp = db.employeeById(db.settings().currentUserId);
  if (!emp) return true; // no demo user set — fail open
  return ['owner', 'general_manager'].includes(emp.role);
}

export function renderSettings() {
  renderNav('#icon-rail', 'settings.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();

  // Hide Roles & Permissions tab for non-admin roles
  if (!canManageRoles()) {
    document.querySelector('#settings-tabs button[data-view="roles"]')?.remove();
  }

  document.getElementById('settings-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    // Guard: non-admins can't navigate to roles via URL hash either
    if (btn.dataset.view === 'roles' && !canManageRoles()) return;
    location.hash = btn.dataset.view;
  });
  window.addEventListener('hashchange', renderCurrentView);
  renderCurrentView();
}

function renderCurrentView() {
  const view = (location.hash || '#shop').slice(1);
  const fn = VIEWS[view] || VIEWS.shop;
  document.querySelectorAll('#settings-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  fn(document.getElementById('settings-view-body'));
}

// ---------------------------------------------------------------------------
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

function renderShop(mount) {
  const s = db.settings();
  mount.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Shop info</div></div>
      <div class="card-body grid-2">
        <div class="field"><label class="label">Shop name</label><input class="input" id="s-name" value="${s.name || ''}"></div>
        <div class="field"><label class="label">Owner</label><input class="input" id="s-owner" value="${s.owner || ''}"></div>
        <div class="field"><label class="label">Phone</label><input class="input" id="s-phone" value="${s.phone || ''}"></div>
        <div class="field"><label class="label">Email</label><input class="input" id="s-email" value="${s.email || ''}"></div>
        <div class="field" style="grid-column:1/-1"><label class="label">Address</label><input class="input" id="s-address" value="${s.address || ''}"></div>
      </div>
    </div>
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Operations</div></div>
      <div class="card-body grid-2">
        <div class="field"><label class="label">Capacity (hrs/day)</label><input class="input" type="number" id="s-capacity" value="${s.capacityHours ?? 0}"></div>
        <div class="field"><label class="label">ARO target</label><input class="input" type="number" id="s-aro" value="${s.aroTarget ?? 0}"></div>
        <div class="field"><label class="label">Labor rate ($/hr)</label><input class="input" type="number" id="s-labor" value="${s.laborRate ?? 0}"></div>
        <div class="field"><label class="label">Tax rate (%)</label><input class="input" type="number" step="0.01" id="s-tax" value="${((s.taxRate ?? 0) * 100).toFixed(2)}"></div>
      </div>
    </div>
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Business hours</div></div>
      <div class="card-body">
        ${DAYS.map((d) => {
          const h = s.hours?.[d] || {};
          return `
          <div class="row" style="gap:var(--s3);margin-bottom:var(--s2)">
            <span style="width:100px" class="muted">${DAY_LABEL[d]}</span>
            <label class="check"><input type="checkbox" id="h-${d}-closed" ${h.closed ? 'checked' : ''}> Closed</label>
            <input class="input" type="time" id="h-${d}-open" value="${h.open || '08:00'}" style="width:auto" ${h.closed ? 'disabled' : ''}>
            <span class="muted">to</span>
            <input class="input" type="time" id="h-${d}-close" value="${h.close || '17:30'}" style="width:auto" ${h.closed ? 'disabled' : ''}>
          </div>`;
        }).join('')}
      </div>
    </div>
    <button class="btn btn-primary" id="save-shop-btn">Save Changes</button>
  `;

  DAYS.forEach((d) => {
    document.getElementById(`h-${d}-closed`).addEventListener('change', (e) => {
      document.getElementById(`h-${d}-open`).disabled = e.target.checked;
      document.getElementById(`h-${d}-close`).disabled = e.target.checked;
    });
  });

  document.getElementById('save-shop-btn').addEventListener('click', () => {
    const settings = db.settings();
    settings.name = document.getElementById('s-name').value.trim();
    settings.owner = document.getElementById('s-owner').value.trim();
    settings.phone = document.getElementById('s-phone').value.trim();
    settings.email = document.getElementById('s-email').value.trim();
    settings.address = document.getElementById('s-address').value.trim();
    settings.capacityHours = Number(document.getElementById('s-capacity').value) || 0;
    settings.aroTarget = Number(document.getElementById('s-aro').value) || 0;
    settings.laborRate = Number(document.getElementById('s-labor').value) || 0;
    settings.taxRate = (Number(document.getElementById('s-tax').value) || 0) / 100;
    settings.hours = settings.hours || {};
    DAYS.forEach((d) => {
      settings.hours[d] = {
        closed: document.getElementById(`h-${d}-closed`).checked,
        open: document.getElementById(`h-${d}-open`).value,
        close: document.getElementById(`h-${d}-close`).value,
      };
    });
    db.saveSettings(settings);
    toast('Shop settings saved.', 'success');
  });
}

// ---------------------------------------------------------------------------
function renderServices(mount) {
  mount.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">New Service</div></div>
      <div class="card-body grid-2">
        <div class="field"><label class="label">Name</label><input class="input" id="sv-name"></div>
        <div class="field"><label class="label">Category</label><input class="input" id="sv-category"></div>
        <div class="field"><label class="label">Price</label><input class="input" type="number" step="0.01" id="sv-price"></div>
        <div class="field"><label class="label">Hours</label><input class="input" type="number" step="0.25" id="sv-hours"></div>
        <div style="grid-column:1/-1"><button class="btn btn-primary" id="add-service-btn">Add Service</button></div>
      </div>
    </div>
    <div class="card"><div class="card-head"><div class="card-title">Service Catalog</div></div><div class="card-body" id="services-list"></div></div>
  `;
  document.getElementById('add-service-btn').addEventListener('click', () => {
    const name = document.getElementById('sv-name').value.trim();
    if (!name) {
      toast('Service name is required.', 'error');
      return;
    }
    const services = db.services();
    services.push({
      id: db.nextId('s'), name,
      category: document.getElementById('sv-category').value.trim(),
      basePrice: Number(document.getElementById('sv-price').value) || 0,
      baseHours: Number(document.getElementById('sv-hours').value) || 0,
      durationMin: Math.round((Number(document.getElementById('sv-hours').value) || 0) * 60),
    });
    db.saveServices(services);
    toast('Service added.', 'success');
    ['sv-name', 'sv-category', 'sv-price', 'sv-hours'].forEach((id) => (document.getElementById(id).value = ''));
    renderServicesList();
  });
  renderServicesList();
}

function renderServicesList() {
  const services = db.services().slice().sort((a, b) => a.name.localeCompare(b.name));
  document.getElementById('services-list').innerHTML = services.map((s) => `
    <div class="item-row">
      <div>
        <div class="strong" style="color:var(--ink)">${s.name}</div>
        <div class="muted" style="font-size:var(--t-13)">${s.category || ''} · ${util.fmtMoney(s.basePrice)} · ${s.baseHours}h</div>
      </div>
      <button class="btn btn-danger btn-sm" data-delete-service="${s.id}">Delete</button>
    </div>
  `).join('');
  document.querySelectorAll('[data-delete-service]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Delete this service from the catalog?', { confirmLabel: 'Delete' });
      if (!confirmed) return;
      db.saveServices(db.services().filter((s) => s.id !== btn.dataset.deleteService));
      toast('Service deleted.');
      renderServicesList();
    });
  });
}

// ---------------------------------------------------------------------------
function renderBays(mount) {
  mount.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">New Bay</div></div>
      <div class="card-body grid-2">
        <div class="field"><label class="label">Name</label><input class="input" id="bay-name" placeholder="e.g. Bay 5"></div>
        <div class="field">
          <label class="label">Assigned tech</label>
          <select class="select" id="bay-tech">
            <option value="">Unassigned</option>
            ${db.techs().map((t) => `<option value="${t.id}">${t.firstName} ${t.lastName}</option>`).join('')}
          </select>
        </div>
        <div style="grid-column:1/-1"><button class="btn btn-primary" id="add-bay-btn">Add Bay</button></div>
      </div>
    </div>
    <div class="card"><div class="card-head"><div class="card-title">Bays</div></div><div class="card-body" id="bays-list"></div></div>
  `;
  document.getElementById('add-bay-btn').addEventListener('click', () => {
    const name = document.getElementById('bay-name').value.trim();
    if (!name) {
      toast('Bay name is required.', 'error');
      return;
    }
    const bays = db.bays();
    bays.push({ id: db.nextId('b'), name, type: 'general', techId: document.getElementById('bay-tech').value || null });
    db.saveBays(bays);
    toast('Bay added.', 'success');
    document.getElementById('bay-name').value = '';
    renderBaysList();
  });
  renderBaysList();
}

function renderBaysList() {
  const bays = db.bays();
  document.getElementById('bays-list').innerHTML = bays.map((b) => {
    const tech = db.techById(b.techId);
    return `
    <div class="item-row">
      <div>
        <div class="strong" style="color:var(--ink)">${b.name}</div>
        <div class="muted" style="font-size:var(--t-13)">${tech ? tech.firstName + ' ' + tech.lastName : 'Unassigned'}</div>
      </div>
      <button class="btn btn-danger btn-sm" data-delete-bay="${b.id}">Delete</button>
    </div>`;
  }).join('');
  document.querySelectorAll('[data-delete-bay]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Delete this bay?', { confirmLabel: 'Delete' });
      if (!confirmed) return;
      db.saveBays(db.bays().filter((b) => b.id !== btn.dataset.deleteBay));
      toast('Bay deleted.');
      renderBaysList();
    });
  });
}

// ---------------------------------------------------------------------------
function renderCoupons(mount) {
  mount.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">New Coupon</div></div>
      <div class="card-body grid-2">
        <div class="field"><label class="label">Code</label><input class="input" id="cp-code" placeholder="e.g. SUMMER10"></div>
        <div class="field">
          <label class="label">Type</label>
          <select class="select" id="cp-type"><option value="percent">Percent off</option><option value="fixed">Fixed amount off</option></select>
        </div>
        <div class="field"><label class="label">Value</label><input class="input" type="number" step="0.01" id="cp-value"></div>
        <div style="grid-column:1/-1"><button class="btn btn-primary" id="add-coupon-btn">Add Coupon</button></div>
      </div>
    </div>
    <div class="card"><div class="card-head"><div class="card-title">Coupons</div></div><div class="card-body" id="coupons-list"></div></div>
  `;
  document.getElementById('add-coupon-btn').addEventListener('click', () => {
    const code = document.getElementById('cp-code').value.trim().toUpperCase();
    if (!code) {
      toast('Coupon code is required.', 'error');
      return;
    }
    const settings = db.settings();
    settings.coupons = settings.coupons || [];
    if (settings.coupons.some((c) => c.code === code)) {
      toast('That coupon code already exists.', 'error');
      return;
    }
    settings.coupons.push({ code, type: document.getElementById('cp-type').value, value: Number(document.getElementById('cp-value').value) || 0, active: true });
    db.saveSettings(settings);
    toast('Coupon added.', 'success');
    document.getElementById('cp-code').value = '';
    document.getElementById('cp-value').value = '';
    renderCouponsList();
  });
  renderCouponsList();
}

function renderCouponsList() {
  const coupons = db.settings().coupons || [];
  document.getElementById('coupons-list').innerHTML = coupons.length
    ? coupons.map((c) => `
      <div class="item-row">
        <div>
          <div class="strong" style="color:var(--ink)">${c.code}</div>
          <div class="muted" style="font-size:var(--t-13)">${c.type === 'percent' ? c.value + '% off' : util.fmtMoney(c.value) + ' off'}</div>
        </div>
        <div class="row" style="gap:var(--s2)">
          <span class="badge ${c.active ? 'badge-green' : 'badge-gray'}">${c.active ? 'Active' : 'Inactive'}</span>
          <button class="btn btn-secondary btn-sm" data-toggle-coupon="${c.code}">${c.active ? 'Deactivate' : 'Activate'}</button>
        </div>
      </div>`).join('')
    : '<div class="empty-sub">No coupons yet.</div>';

  document.querySelectorAll('[data-toggle-coupon]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const settings = db.settings();
      const coupon = settings.coupons.find((c) => c.code === btn.dataset.toggleCoupon);
      coupon.active = !coupon.active;
      db.saveSettings(settings);
      toast(`${coupon.code} ${coupon.active ? 'activated' : 'deactivated'}.`);
      renderCouponsList();
    });
  });
}

// ---------------------------------------------------------------------------
// Phase E — read-only Subscription tab. Shows the demo shop's real platform
// record (lib/data.js seeds `shop_demo`/`sub_demo`) — there is no real
// Stripe billing or plan-change flow yet, so this is intentionally view-only
// with a link out to the signup/pricing page for changing plans.
function renderSubscription(mount) {
  const shop = db.shopById('shop_demo');
  const sub = shop ? db.subscriptionForShop(shop.id) : null;
  const plan = sub ? db.planById(sub.planId) : null;

  if (!shop || !sub || !plan) {
    mount.innerHTML = '<div class="empty"><div class="empty-title">No subscription on file</div><div class="empty-sub">This demo shop hasn\'t been linked to a platform subscription.</div></div>';
    return;
  }

  mount.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Current plan</div><span class="badge badge-blue">${sub.status}</span></div>
      <div class="card-body">
        <div class="row between" style="padding:6px 0"><span class="muted">Plan</span><span class="strong" style="color:var(--ink)">${plan.name}</span></div>
        <div class="row between" style="padding:6px 0"><span class="muted">Billing cycle</span><span>${sub.billingCycle}</span></div>
        <div class="row between" style="padding:6px 0"><span class="muted">Current period</span><span>${util.fmtDate(sub.currentPeriodStart)} – ${util.fmtDate(sub.currentPeriodEnd)}</span></div>
        <div class="row between" style="padding:6px 0"><span class="muted">Seats included</span><span>${sub.seatsIncluded}</span></div>
        <div class="row between" style="padding:6px 0"><span class="muted">Locations included</span><span>${sub.locationsIncluded}</span></div>
        <div class="row between" style="padding:6px 0"><span class="muted">Billing status <span class="badge badge-gray" style="font-size:10px;margin-left:4px">placeholder</span></span><span class="badge badge-gray">no real Stripe billing yet</span></div>
        <a href="signup.html" class="btn btn-secondary btn-sm" style="margin-top:var(--s3)">Change plan</a>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">Feature access</div><span class="badge badge-gray">demo logic — not enforced elsewhere yet</span></div>
      <div class="card-body">
        ${Object.entries(plan.features).map(([key, on]) => `<div class="row between" style="padding:6px 0"><span>${key}</span><span class="badge ${on ? 'badge-green' : 'badge-gray'}">${on ? 'on' : 'off'}</span></div>`).join('')}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Roles & Permissions — admin-only view moved from Team page
// ---------------------------------------------------------------------------
function renderRolesSettings(mount) {
  if (!canManageRoles()) {
    mount.innerHTML = `<div class="card"><div class="card-body"><div class="empty"><div class="empty-title">Access restricted</div><div class="empty-sub">Only Owner and General Manager can manage roles and permissions.</div></div></div></div>`;
    return;
  }

  const roles = db.roles().filter((r) => !r.isPlatformInternal);
  mount.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head">
        <div class="card-title">Roles &amp; Permissions</div>
        <span class="badge badge-gray">changes save immediately</span>
      </div>
      <div class="card-body">
        <p class="muted" style="font-size:var(--t-13);margin-bottom:var(--s4)">Each role controls what employees with that role can see and do. Overrides can be set per employee in the Employees tab. These are UI-layer guards — enforce access server-side once a real backend exists.</p>
        <div id="roles-list"></div>
      </div>
    </div>`;

  document.getElementById('roles-list').innerHTML = roles.map((r) => `
    <div class="role-card" style="margin-bottom:var(--s3)">
      <div class="row between" style="margin-bottom:var(--s2)">
        <div>
          <span class="strong" style="color:var(--ink);font-size:var(--t-md)">${r.name}</span>
          ${r.description ? `<div class="muted" style="font-size:var(--t-13);margin-top:2px">${r.description}</div>` : ''}
        </div>
        <span class="badge badge-gray">${db.employees().filter((e) => e.role === r.id).length} employee${db.employees().filter((e) => e.role === r.id).length === 1 ? '' : 's'}</span>
      </div>
      <div class="perm-grid">
        ${Object.entries(r.permissions).map(([perm, val]) => `
          <label class="check" style="font-size:var(--t-13)">
            <input type="checkbox" data-role="${r.id}" data-perm="${perm}" ${val ? 'checked' : ''}>
            ${perm}
          </label>`).join('')}
      </div>
    </div>`).join('');

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

// ---------------------------------------------------------------------------
// Data / Demo Reset
// ---------------------------------------------------------------------------
function renderDataSettings(mount) {
  mount.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Demo Data</div></div>
      <div class="card-body">
        <p class="muted" style="font-size:var(--t-13);margin-bottom:var(--s4)">All data lives in your browser's localStorage. Resetting restores the full demo data set including employees, appointments, invoices, inventory, and schedule shifts.</p>
        <div class="row" style="gap:var(--s2)">
          <button class="btn btn-danger btn-sm" id="settings-reset-demo">Reset to Demo Data</button>
        </div>
        <p class="muted" style="font-size:var(--t-xs);margin-top:var(--s3)">This cannot be undone — all changes you've made in this session will be lost.</p>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">Storage</div></div>
      <div class="card-body">
        <div class="row between" style="padding:6px 0"><span class="muted">Storage type</span><span>Browser localStorage</span></div>
        <div class="row between" style="padding:6px 0"><span class="muted">Keys</span><span id="settings-storage-count" class="tnum">—</span></div>
        <div class="row between" style="padding:6px 0"><span class="muted">Approx. size</span><span id="settings-storage-size" class="tnum">—</span></div>
        <button class="btn btn-secondary btn-sm" style="margin-top:var(--s3)" id="settings-clear-storage">Clear All Data (hard reset)</button>
      </div>
    </div>`;

  // Storage stats
  let keys = 0, bytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('ab_')) {
      keys++;
      bytes += (localStorage.getItem(k) || '').length * 2;
    }
  }
  document.getElementById('settings-storage-count').textContent = `${keys} keys`;
  document.getElementById('settings-storage-size').textContent = bytes > 1024 ? `~${(bytes / 1024).toFixed(1)} KB` : `${bytes} bytes`;

  document.getElementById('settings-reset-demo').addEventListener('click', async () => {
    const ok = await confirmDialog('Reset all data to the demo set? Every change you made will be lost.', { confirmLabel: 'Reset to Demo' });
    if (!ok) return;
    db.reset();
    toast('Demo data restored — reloading…', 'success');
    setTimeout(() => location.reload(), 500);
  });
  document.getElementById('settings-clear-storage').addEventListener('click', async () => {
    const ok = await confirmDialog('Clear ALL localStorage data? The app will reload with a fresh seed.', { confirmLabel: 'Clear Everything' });
    if (!ok) return;
    localStorage.clear();
    toast('Storage cleared — reloading…', 'success');
    setTimeout(() => location.reload(), 500);
  });
}

// ---------------------------------------------------------------------------
// Rewards settings
// ---------------------------------------------------------------------------
function renderRewardsSettings(mount) {
  const prog = rewardsLib.getRewardProgram();

  mount.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Rewards Program</div></div>
      <div class="card-body">
        <div class="field"><label class="check"><input type="checkbox" id="rw-active" ${prog.isActive ? 'checked' : ''}> Program active</label></div>
        <div class="grid-2" style="margin-top:var(--s3)">
          <div class="field"><label class="label">Points per $1 spent</label><input class="input" type="number" id="rw-ppd" value="${prog.pointsPerDollar}" min="0.1" step="0.1"></div>
          <div class="field"><label class="label">$ per point (redemption rate)</label><input class="input" type="number" id="rw-rate" value="${prog.redemptionRate}" min="0.001" step="0.001"></div>
          <div class="field"><label class="label">Minimum points to redeem</label><input class="input" type="number" id="rw-min" value="${prog.minimumPointsToRedeem}" min="1" step="1"></div>
        </div>
        <button class="btn btn-primary" style="margin-top:var(--s3)" id="rw-save-btn">Save Rewards Settings</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Membership Plans</div></div>
      <div class="card-body">
        ${db.membershipPlans().map(p => `
          <div class="item-row">
            <div>
              <div class="strong">${p.name}</div>
              <div class="muted" style="font-size:var(--t-13)">${p.description} · ${p.price ? '$' + p.price + '/mo' : 'Free'} · ${p.pointsMultiplier}× points</div>
            </div>
            <span class="badge badge-gray">${p.billingCycle || 'free'}</span>
          </div>`).join('')}
        <div class="muted" style="font-size:var(--t-13);margin-top:var(--s3)">Plan editing coming in a future update. Manage members from CRM → Rewards.</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">Birthday Reward <span class="badge badge-gray" style="font-size:10px">placeholder</span></div></div>
      <div class="card-body">
        <div class="muted" style="font-size:var(--t-13)">Automatic birthday point bonuses are not yet implemented. This will send a configurable point bonus to members in their birthday month.</div>
      </div>
    </div>
  `;

  document.getElementById('rw-save-btn').addEventListener('click', () => {
    const programs = db.rewardsPrograms();
    if (!programs.length) return;
    programs[0].isActive = document.getElementById('rw-active').checked;
    programs[0].pointsPerDollar = parseFloat(document.getElementById('rw-ppd').value) || 1;
    programs[0].redemptionRate = parseFloat(document.getElementById('rw-rate').value) || 0.01;
    programs[0].minimumPointsToRedeem = parseInt(document.getElementById('rw-min').value, 10) || 500;
    db.saveRewardsPrograms(programs);
    toast('Rewards settings saved.', 'success');
  });
}
