// AutoBook — modules/booking.js (§11.3)
// Public 4-step booking wizard. Writes a pending Booking via util.submitBooking
// (never localStorage directly) and upserts the customer/vehicle into the CRM
// at submission time. Falls back to a built-in service list so the widget still
// works if db.services() is ever empty (true standalone/embed use).

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import { toast } from '../lib/nav.js';

const FALLBACK_SERVICES = [
  { id: 'fb_oil', name: 'Oil Change', description: 'Synthetic or conventional', durationMin: 45 },
  { id: 'fb_tires', name: 'Tire Install / Rotation', description: 'Install, rotate, balance, inspect', durationMin: 75 },
  { id: 'fb_brakes', name: 'Brake Inspection', description: 'Noise, vibration, pad check', durationMin: 60 },
  { id: 'fb_diag', name: 'Diagnostic / Check Engine', description: 'Lights, noise, leaks, drivability', durationMin: 90 },
  { id: 'fb_align', name: 'Alignment', description: 'Pulling, uneven wear, off-center wheel', durationMin: 60 },
];

const state = {
  step: 1,
  selectedServiceIds: [],
  date: '',
  window: null, // { start, end, label }
  coupon: null, // { valid, discount, label, code }
  visitType: 'drop_off',
};

function isEmbed() {
  return new URLSearchParams(location.search).get('embed') === '1';
}

function getServiceCatalog() {
  const real = db.services();
  return real.length ? real : FALLBACK_SERVICES;
}

export function renderBooking() {
  if (isEmbed()) document.body.classList.add('embed');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('date-input').value = tomorrow.toISOString().slice(0, 10);
  document.getElementById('date-input').min = new Date().toISOString().slice(0, 10);
  state.date = document.getElementById('date-input').value;

  renderServicePicker();
  wireStep1();
  wireStep2();
  wireStep3();
  document.getElementById('book-another-btn').addEventListener('click', resetWizard);
  goToStep(1);

  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => goToStep(Number(btn.dataset.back)));
  });
}

function goToStep(n) {
  state.step = n;
  document.querySelectorAll('.step-panel').forEach((p) => p.classList.toggle('active', Number(p.dataset.step) === n));
  renderStepper();
}

const STEP_LABELS = ['Services', 'Time', 'Contact', 'Done'];
function renderStepper() {
  document.getElementById('stepper').innerHTML = STEP_LABELS.map((label, i) => {
    const n = i + 1;
    const cls = n < state.step ? 'done' : n === state.step ? 'active' : '';
    return `
      <div class="step ${cls}"><span class="step-num">${n < state.step ? '✓' : n}</span><span>${label}</span></div>
      ${n < STEP_LABELS.length ? '<div class="step-line"></div>' : ''}
    `;
  }).join('');
}

// ---------------------------------------------------------------------------
// Step 1: services
// ---------------------------------------------------------------------------
function totalDurationMin() {
  const catalog = getServiceCatalog();
  return state.selectedServiceIds.reduce((sum, id) => {
    const svc = catalog.find((s) => s.id === id);
    return sum + (svc?.durationMin || 0);
  }, 0);
}

function renderServicePicker() {
  const catalog = getServiceCatalog();
  document.getElementById('service-pick').innerHTML = catalog.map((s) => `
    <div class="service-pick-card${state.selectedServiceIds.includes(s.id) ? ' selected' : ''}" data-service-id="${s.id}">
      <div>
        <div style="font-weight:700;color:var(--ink)">${s.name}</div>
        <div style="font-size:var(--t-13);color:var(--ink-3)">${s.description || ''} · Est. time ${s.durationMin || 0} min</div>
      </div>
      <div class="check"><input type="checkbox" ${state.selectedServiceIds.includes(s.id) ? 'checked' : ''} tabindex="-1"></div>
    </div>
  `).join('') || '<div class="empty-sub">No services selected yet.</div>';

  document.querySelectorAll('[data-service-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.serviceId;
      const idx = state.selectedServiceIds.indexOf(id);
      if (idx === -1) state.selectedServiceIds.push(id);
      else state.selectedServiceIds.splice(idx, 1);
      state.window = null; // selection changed → previously chosen window may no longer fit
      renderServicePicker();
      updateDurationTotal();
    });
  });
  updateDurationTotal();
}

function updateDurationTotal() {
  const total = totalDurationMin();
  document.getElementById('duration-total').textContent = state.selectedServiceIds.length
    ? `Total estimated time: ${total} min`
    : '';
  document.getElementById('step1-next').disabled = state.selectedServiceIds.length === 0;
}

function wireStep1() {
  document.getElementById('step1-next').addEventListener('click', () => {
    renderTimeWindows();
    goToStep(2);
  });
}

// ---------------------------------------------------------------------------
// Step 2: preferred time
// ---------------------------------------------------------------------------
function renderTimeWindows() {
  const helper = document.getElementById('step2-helper');
  const grid = document.getElementById('time-windows');
  const nextBtn = document.getElementById('step2-next');

  if (!state.selectedServiceIds.length) {
    helper.textContent = 'Select one or more services to view available time slots.';
    grid.innerHTML = '';
    nextBtn.disabled = true;
    return;
  }

  const totalMin = totalDurationMin();
  const windows = util.generateTimeWindows(state.date, totalMin);
  helper.textContent = windows.length
    ? `Time windows sized to your ${totalMin}-minute visit.`
    : 'The shop is closed that day — pick another date.';

  grid.innerHTML = windows.map((w) => `
    <div class="time-window-card${state.window?.start === w.start ? ' selected' : ''}" data-start="${w.start}" data-end="${w.end}" data-label="${w.label}">${w.label}</div>
  `).join('') || '<div class="empty-sub">No windows available.</div>';

  grid.querySelectorAll('[data-start]').forEach((card) => {
    card.addEventListener('click', () => {
      state.window = { start: card.dataset.start, end: card.dataset.end, label: card.dataset.label };
      renderTimeWindows();
    });
  });

  nextBtn.disabled = !state.window;
}

function wireStep2() {
  document.getElementById('date-input').addEventListener('change', (e) => {
    state.date = e.target.value;
    state.window = null;
    renderTimeWindows();
  });
  document.getElementById('step2-next').addEventListener('click', () => goToStep(3));
}

// ---------------------------------------------------------------------------
// Step 3: contact & vehicle
// ---------------------------------------------------------------------------
function wireStep3() {
  document.getElementById('apply-coupon-btn').addEventListener('click', () => {
    const code = document.getElementById('coupon-input').value.trim();
    const msg = document.getElementById('coupon-msg');
    if (!code) {
      msg.textContent = '';
      state.coupon = null;
      return;
    }
    const result = util.validateCoupon(code, 100); // subtotal unknown pre-quote; validity/label don't depend on amount
    if (result.valid) {
      state.coupon = result;
      msg.innerHTML = `<span style="color:var(--green);font-weight:600">Coupon applied: ${result.label}</span>`;
    } else {
      state.coupon = null;
      msg.innerHTML = `<span style="color:var(--red);font-weight:600">That coupon code isn't valid or has expired.</span>`;
    }
  });

  document.getElementById('visit-type-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-visit]');
    if (!btn) return;
    state.visitType = btn.dataset.visit;
    document.querySelectorAll('#visit-type-toggle button').forEach((b) => b.classList.toggle('active', b === btn));
  });

  document.getElementById('submit-btn').addEventListener('click', submit);
}

function validateStep3() {
  const fields = {
    first: { val: document.getElementById('f-first').value.trim(), msg: 'First name is required.' },
    last: { val: document.getElementById('f-last').value.trim(), msg: 'Last name is required.' },
    phone: { val: document.getElementById('f-phone').value.trim(), msg: 'A phone number is required so the shop can reach you.' },
    email: { val: document.getElementById('f-email').value.trim(), msg: 'An email is required for your confirmation.' },
    year: { val: document.getElementById('v-year').value.trim(), msg: 'Vehicle year is required.' },
    make: { val: document.getElementById('v-make').value.trim(), msg: 'Vehicle make is required.' },
    model: { val: document.getElementById('v-model').value.trim(), msg: 'Vehicle model is required.' },
  };

  let valid = true;
  Object.entries(fields).forEach(([key, { val, msg }]) => {
    const errEl = document.getElementById(`err-${key}`);
    if (errEl) {
      if (!val) {
        errEl.textContent = msg;
        valid = false;
      } else {
        errEl.textContent = '';
      }
    }
  });

  if (fields.email.val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.val)) {
    document.getElementById('err-email').textContent = 'Enter a valid email address.';
    valid = false;
  }
  if (fields.year.val && !/^\d{4}$/.test(fields.year.val)) {
    document.getElementById('err-year').textContent = 'Enter a 4-digit year.';
    valid = false;
  }

  return { valid, fields };
}

function submit() {
  const { valid, fields } = validateStep3();
  if (!valid) {
    toast('Please fix the highlighted fields.', 'error');
    return;
  }

  util.submitBooking({
    serviceIds: state.selectedServiceIds,
    preferredDate: state.date,
    preferredSlot: state.window?.start,
    customer: { name: `${fields.first.val} ${fields.last.val}`, phone: fields.phone.val, email: fields.email.val },
    vehicle: {
      year: Number(document.getElementById('v-year').value),
      make: document.getElementById('v-make').value.trim(),
      model: document.getElementById('v-model').value.trim(),
      mileage: Number(document.getElementById('v-mileage').value) || 0,
      vin: document.getElementById('v-vin').value.trim(),
      visitType: state.visitType,
    },
    couponCode: state.coupon?.code || '',
    notes: document.getElementById('f-notes').value.trim(),
  });

  goToStep(4);
}

function resetWizard() {
  state.step = 1;
  state.selectedServiceIds = [];
  state.window = null;
  state.coupon = null;
  state.visitType = 'drop_off';
  ['f-first', 'f-last', 'f-phone', 'f-email', 'v-year', 'v-make', 'v-model', 'v-mileage', 'v-vin', 'f-notes', 'coupon-input'].forEach((id) => {
    document.getElementById(id).value = '';
  });
  document.getElementById('coupon-msg').innerHTML = '';
  document.querySelectorAll('#visit-type-toggle button').forEach((b, i) => b.classList.toggle('active', i === 0));
  renderServicePicker();
  goToStep(1);
}
