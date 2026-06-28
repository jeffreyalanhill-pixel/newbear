// AutoBook — modules/signup.js (Phase E — Platform Signup Foundation)
// Public pricing page + 5-step signup wizard (Owner → Shop → Plan → Setup →
// Done). The final step calls util.createSignupAccount — the one place that
// writes real Account/Shop/Subscription/User/Membership/OnboardingProgress
// records — then routes into the existing dashboard.html. There is no real
// multi-tenant scoping in this MVP: the new shop is a real platform-layer
// record, but the operational app still reads the single global demo
// dataset. No real auth/Stripe/email — see the placeholder badges in the UI.
import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import { toast } from '../lib/nav.js';

const FEATURES = [
  { key: 'booking', label: 'Online booking' },
  { key: 'crm', label: 'CRM' },
  { key: 'quotes', label: 'Quotes / estimates' },
  { key: 'repairOrders', label: 'Repair orders' },
  { key: 'invoices', label: 'Invoicing' },
  { key: 'pos', label: 'Point of sale' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'team', label: 'Team management' },
  { key: 'monitors', label: 'Live monitor & waiting room' },
  { key: 'quickbooksExport', label: 'QuickBooks export', placeholder: true },
  { key: 'stripePayments', label: 'Stripe payments', placeholder: true },
  { key: 'multiLocation', label: 'Multi-location support', placeholder: true },
];

const STEPS = ['owner', 'shop', 'plan', 'setup', 'done'];
const STEP_LABEL = { owner: 'Owner Info', shop: 'Shop Info', plan: 'Plan', setup: 'Setup', done: 'Done' };

let state = null;
function freshState() {
  return {
    step: null,
    ownerName: '', ownerEmail: '', ownerPhone: '', ownerPassword: '',
    shopName: '', shopAddress: '', shopCity: '', shopState: '', shopZip: '', shopPhone: '', shopWebsite: '', timezone: 'America/Chicago', bays: 2, techCount: 2,
    planId: '', billingCycle: 'monthly',
    servicesOffered: new Set(db.services().slice(0, 6).map((s) => s.id)),
    bookingPreference: 'drop_off', taxRate: 7.0, logoFileName: '',
    result: null,
  };
}

export function renderSignup() {
  state = freshState();
  renderPricing();
}

// ---------------------------------------------------------------------------
// Pricing section
// ---------------------------------------------------------------------------
let billingCycle = 'monthly';

function renderPricing() {
  const plans = db.plans();
  document.getElementById('su-pricing').innerHTML = `
    <div class="su-cycle-toggle">
      <div class="seg" id="su-cycle">
        <button data-cycle="monthly" class="${billingCycle === 'monthly' ? 'active' : ''}">Monthly</button>
        <button data-cycle="annual" class="${billingCycle === 'annual' ? 'active' : ''}">Annual <span class="badge badge-green" style="margin-left:4px">save ~17%</span></button>
      </div>
    </div>
    <div class="plan-grid">
      ${plans.map((p) => planCard(p)).join('')}
    </div>
    <div class="compare-table">
      <div class="section-label" style="margin-bottom:var(--s4)">Compare features</div>
      <table>
        <thead><tr><th>Feature</th>${plans.map((p) => `<th>${p.name}</th>`).join('')}</tr></thead>
        <tbody>
          ${FEATURES.map((f) => `
            <tr>
              <td>${f.label}${f.placeholder ? ' <span class="badge badge-gray" style="font-size:10px">placeholder</span>' : ''}</td>
              ${plans.map((p) => `<td>${p.features[f.key] ? checkIcon() : '<span class="no">—</span>'}</td>`).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.querySelectorAll('[data-cycle]').forEach((b) => b.addEventListener('click', () => { billingCycle = b.dataset.cycle; renderPricing(); }));
  document.querySelectorAll('[data-start-trial]').forEach((b) => {
    b.addEventListener('click', () => {
      state.planId = b.dataset.startTrial;
      state.billingCycle = billingCycle;
      state.step = 'owner';
      renderWizard();
      document.getElementById('su-wizard').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function planCard(p) {
  const price = billingCycle === 'annual' ? p.annualPrice : p.monthlyPrice;
  const per = billingCycle === 'annual' ? '/yr' : '/mo';
  return `
    <div class="plan-card${p.highlight ? ' highlight' : ''}">
      <div class="plan-name">${p.name}</div>
      <div class="plan-tagline">${p.tagline}</div>
      <div class="plan-price">${util.fmtMoney0(price)}<small>${per}</small></div>
      <ul class="plan-features">
        ${FEATURES.slice(0, 7).map((f) => `<li class="${p.features[f.key] ? '' : 'off'}">${checkIcon()}${f.label}</li>`).join('')}
      </ul>
      <button class="btn ${p.highlight ? 'btn-primary' : 'btn-secondary'}" data-start-trial="${p.id}">Start Free Trial</button>
    </div>`;
}

function checkIcon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>'; }

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------
function renderWizard() {
  const mount = document.getElementById('su-wizard');
  if (!state.step) { mount.innerHTML = ''; return; }
  const stepIdx = STEPS.indexOf(state.step);

  mount.innerHTML = `
    <div class="wizard-steps">
      ${STEPS.map((s, i) => `<div class="wizard-step${s === state.step ? ' active' : i < stepIdx ? ' done' : ''}">${i + 1}. ${STEP_LABEL[s]}</div>`).join('')}
    </div>
    <div class="card"><div class="card-body" id="su-step-body"></div></div>
  `;
  renderStepBody();
}

function renderStepBody() {
  const body = document.getElementById('su-step-body');
  if (state.step === 'owner') body.innerHTML = ownerStep();
  else if (state.step === 'shop') body.innerHTML = shopStep();
  else if (state.step === 'plan') body.innerHTML = planStep();
  else if (state.step === 'setup') body.innerHTML = setupStep();
  else if (state.step === 'done') body.innerHTML = doneStep();
  wireStep();
}

function ownerStep() {
  return `
    <div class="card-title" style="margin-bottom:var(--s4)">Owner info</div>
    <div class="grid-2">
      <div class="field" style="grid-column:1/-1"><label class="label">Full name</label><input class="input" id="su-owner-name" value="${state.ownerName}"></div>
      <div class="field"><label class="label">Email</label><input class="input" type="email" id="su-owner-email" value="${state.ownerEmail}"></div>
      <div class="field"><label class="label">Phone</label><input class="input" id="su-owner-phone" value="${state.ownerPhone}"></div>
      <div class="field" style="grid-column:1/-1">
        <label class="label">Password <span class="badge badge-gray" style="font-size:10px">placeholder — no real auth yet</span></label>
        <input class="input" type="password" id="su-owner-password" value="${state.ownerPassword}" placeholder="Not actually stored or checked anywhere yet">
      </div>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:var(--s5)"><button class="btn btn-primary" data-next>Continue</button></div>
  `;
}

function shopStep() {
  return `
    <div class="card-title" style="margin-bottom:var(--s4)">Shop info</div>
    <div class="grid-2">
      <div class="field" style="grid-column:1/-1"><label class="label">Shop name</label><input class="input" id="su-shop-name" value="${state.shopName}"></div>
      <div class="field" style="grid-column:1/-1"><label class="label">Address</label><input class="input" id="su-shop-address" value="${state.shopAddress}"></div>
      <div class="field"><label class="label">City</label><input class="input" id="su-shop-city" value="${state.shopCity}"></div>
      <div class="field">
        <label class="label">State</label><input class="input" id="su-shop-state" value="${state.shopState}" maxlength="2" style="text-transform:uppercase">
      </div>
      <div class="field"><label class="label">ZIP</label><input class="input" id="su-shop-zip" value="${state.shopZip}"></div>
      <div class="field"><label class="label">Phone</label><input class="input" id="su-shop-phone" value="${state.shopPhone}"></div>
      <div class="field"><label class="label">Website (optional)</label><input class="input" id="su-shop-website" value="${state.shopWebsite}"></div>
      <div class="field">
        <label class="label">Timezone</label>
        <select class="select" id="su-shop-timezone">
          ${['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'].map((tz) => `<option value="${tz}" ${state.timezone === tz ? 'selected' : ''}>${tz}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label class="label">Number of bays</label><input class="input" type="number" min="1" id="su-shop-bays" value="${state.bays}"></div>
      <div class="field"><label class="label">Number of technicians</label><input class="input" type="number" min="1" id="su-shop-techs" value="${state.techCount}"></div>
    </div>
    <div class="row" style="justify-content:space-between;margin-top:var(--s5)">
      <button class="btn btn-secondary" data-back>Back</button>
      <button class="btn btn-primary" data-next>Continue</button>
    </div>
  `;
}

function planStep() {
  const plans = db.plans();
  return `
    <div class="card-title" style="margin-bottom:var(--s2)">Plan selection</div>
    <div class="muted" style="font-size:var(--t-13);margin-bottom:var(--s4)">Trial status: <span class="badge badge-blue">14-day free trial</span> · Billing status: <span class="badge badge-gray">placeholder — no real Stripe billing yet</span></div>
    <div class="field" style="margin-bottom:var(--s4)">
      <label class="label">Billing cycle</label>
      <div class="seg" id="su-plan-cycle">
        <button data-plan-cycle="monthly" class="${state.billingCycle === 'monthly' ? 'active' : ''}">Monthly</button>
        <button data-plan-cycle="annual" class="${state.billingCycle === 'annual' ? 'active' : ''}">Annual</button>
      </div>
    </div>
    <div class="grid-2" style="gap:var(--s3)">
      ${plans.map((p) => `
        <div class="item-row" data-select-plan="${p.id}" style="cursor:pointer;${state.planId === p.id ? 'border-color:var(--accent);background:var(--accent-lt)' : ''}">
          <div>
            <div class="strong" style="color:var(--ink)">${p.name}</div>
            <div class="muted" style="font-size:var(--t-13)">${util.fmtMoney0(state.billingCycle === 'annual' ? p.annualPrice : p.monthlyPrice)}${state.billingCycle === 'annual' ? '/yr' : '/mo'}</div>
          </div>
          ${state.planId === p.id ? '<span class="badge badge-blue">Selected</span>' : ''}
        </div>`).join('')}
    </div>
    <div class="row" style="justify-content:space-between;margin-top:var(--s5)">
      <button class="btn btn-secondary" data-back>Back</button>
      <button class="btn btn-primary" data-next>Continue</button>
    </div>
  `;
}

function setupStep() {
  const services = db.services();
  return `
    <div class="card-title" style="margin-bottom:var(--s4)">Initial setup</div>
    <div class="field" style="margin-bottom:var(--s4)">
      <label class="label">Services offered</label>
      <div class="grid-2">
        ${services.map((s) => `<label class="row" style="gap:6px;font-size:var(--t-13)"><input type="checkbox" data-svc-check="${s.id}" ${state.servicesOffered.has(s.id) ? 'checked' : ''}> ${s.name}</label>`).join('')}
      </div>
    </div>
    <div class="grid-2" style="margin-bottom:var(--s4)">
      <div class="field"><label class="label">Default booking preference</label>
        <select class="select" id="su-booking-pref"><option value="drop_off" ${state.bookingPreference === 'drop_off' ? 'selected' : ''}>Drop off</option><option value="wait" ${state.bookingPreference === 'wait' ? 'selected' : ''}>Wait at shop</option></select>
      </div>
      <div class="field"><label class="label">Tax rate (%) <span class="badge badge-gray" style="font-size:10px">placeholder</span></label><input class="input" type="number" step="0.01" id="su-tax-rate" value="${state.taxRate}"></div>
    </div>
    <div class="field" style="margin-bottom:var(--s4)">
      <label class="label">Business hours</label>
      <div class="muted" style="font-size:var(--t-13)">Using standard Mon–Sat hours for now — fine-tune these later in Settings → Shop.</div>
    </div>
    <div class="field">
      <label class="label">Logo <span class="badge badge-gray" style="font-size:10px">placeholder — not actually uploaded anywhere yet</span></label>
      <input class="input" type="file" id="su-logo-upload" disabled>
    </div>
    <div class="row" style="justify-content:space-between;margin-top:var(--s5)">
      <button class="btn btn-secondary" data-back>Back</button>
      <button class="btn btn-primary" data-create>Create Shop Account &amp; Enter Dashboard</button>
    </div>
  `;
}

function doneStep() {
  const r = state.result;
  if (!r) return '<div class="empty-sub">Something went wrong — go back and try again.</div>';
  const plan = db.planById(r.subscription.planId);
  return `
    <div class="alert alert-green" style="margin-bottom:var(--s4)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
      <div><b>${r.shop.name} is set up.</b><br>Trial started on the ${plan.name} plan — ends ${util.fmtDate(r.subscription.trialEndsAt)}.</div>
    </div>
    <div class="row between" style="padding:6px 0"><span class="muted">Owner</span><span>${r.user.name} · ${r.user.email}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Shop</span><span>${r.shop.name} — ${r.shop.city}, ${r.shop.state}</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Plan</span><span>${plan.name} (${r.subscription.billingCycle})</span></div>
    <div class="row between" style="padding:6px 0"><span class="muted">Membership</span><span class="badge badge-blue">owner</span></div>
    <div class="muted" style="font-size:var(--t-xs);margin-top:var(--s3)">This created real platform records (account/shop/subscription/membership). The dashboard you're about to see still shows Torklio's single demo-shop data — there's no per-shop workspace isolation yet (Phase 2).</div>
    <div class="row" style="justify-content:flex-end;margin-top:var(--s5)"><a class="btn btn-primary" href="dashboard.html">Enter Dashboard →</a></div>
  `;
}

function wireStep() {
  document.querySelector('[data-back]')?.addEventListener('click', () => goStep(-1));
  document.querySelector('[data-next]')?.addEventListener('click', () => { if (validateStep()) { syncStep(); goStep(1); } });
  document.querySelector('[data-create]')?.addEventListener('click', createAccount);

  document.querySelectorAll('[data-svc-check]').forEach((cb) => cb.addEventListener('change', () => {
    if (cb.checked) state.servicesOffered.add(cb.dataset.svcCheck);
    else state.servicesOffered.delete(cb.dataset.svcCheck);
  }));
  document.querySelectorAll('[data-select-plan]').forEach((el) => el.addEventListener('click', () => { state.planId = el.dataset.selectPlan; renderStepBody(); }));
  document.querySelectorAll('[data-plan-cycle]').forEach((b) => b.addEventListener('click', () => { state.billingCycle = b.dataset.planCycle; renderStepBody(); }));
}

function syncStep() {
  if (state.step === 'owner') {
    state.ownerName = document.getElementById('su-owner-name').value.trim();
    state.ownerEmail = document.getElementById('su-owner-email').value.trim();
    state.ownerPhone = document.getElementById('su-owner-phone').value.trim();
    state.ownerPassword = document.getElementById('su-owner-password').value;
  } else if (state.step === 'shop') {
    state.shopName = document.getElementById('su-shop-name').value.trim();
    state.shopAddress = document.getElementById('su-shop-address').value.trim();
    state.shopCity = document.getElementById('su-shop-city').value.trim();
    state.shopState = document.getElementById('su-shop-state').value.trim().toUpperCase();
    state.shopZip = document.getElementById('su-shop-zip').value.trim();
    state.shopPhone = document.getElementById('su-shop-phone').value.trim();
    state.shopWebsite = document.getElementById('su-shop-website').value.trim();
    state.timezone = document.getElementById('su-shop-timezone').value;
    state.bays = Number(document.getElementById('su-shop-bays').value) || 1;
    state.techCount = Number(document.getElementById('su-shop-techs').value) || 1;
  } else if (state.step === 'setup') {
    state.bookingPreference = document.getElementById('su-booking-pref').value;
    state.taxRate = Number(document.getElementById('su-tax-rate').value) || 0;
  }
}

function validateStep() {
  if (state.step === 'owner') {
    if (!document.getElementById('su-owner-name').value.trim() || !document.getElementById('su-owner-email').value.trim()) {
      toast('Owner name and email are required.', 'error');
      return false;
    }
  } else if (state.step === 'shop') {
    if (!document.getElementById('su-shop-name').value.trim() || !document.getElementById('su-shop-address').value.trim()) {
      toast('Shop name and address are required.', 'error');
      return false;
    }
  } else if (state.step === 'plan') {
    if (!state.planId) {
      toast('Select a plan to continue.', 'error');
      return false;
    }
  }
  return true;
}

function goStep(dir) {
  const idx = STEPS.indexOf(state.step);
  state.step = STEPS[Math.max(0, Math.min(STEPS.length - 1, idx + dir))];
  renderWizard();
}

function createAccount() {
  syncStep();
  try {
    state.result = util.createSignupAccount({
      owner: { name: state.ownerName, email: state.ownerEmail, phone: state.ownerPhone },
      shop: { name: state.shopName, address: state.shopAddress, city: state.shopCity, state: state.shopState, zip: state.shopZip, phone: state.shopPhone, website: state.shopWebsite, timezone: state.timezone, bays: state.bays, techCount: state.techCount },
      planId: state.planId,
      billingCycle: state.billingCycle,
      setup: { servicesOffered: [...state.servicesOffered], businessHours: db.settings().hours, bookingPreferences: { defaultVisitType: state.bookingPreference }, taxRate: state.taxRate / 100 },
    });
    toast(`${state.result.shop.name} created.`, 'success');
    state.step = 'done';
    renderWizard();
  } catch (err) {
    toast(err.message, 'error');
  }
}
