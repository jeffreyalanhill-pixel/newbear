// AutoBook — modules/settings.js (§11.13)
// Tabbed shop settings. Every tab writes through db.save* — other pages
// reflect changes on next render since nothing caches settings/services/bays.

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import { renderNav, toast, confirmDialog } from '../lib/nav.js';

const VIEWS = { shop: renderShop, services: renderServices, bays: renderBays, coupons: renderCoupons };

export function renderSettings() {
  renderNav('#icon-rail', 'settings.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();

  document.getElementById('settings-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
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
