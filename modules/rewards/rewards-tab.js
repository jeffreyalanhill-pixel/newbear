// AutoBook — modules/rewards/rewards-tab.js
// CRM Rewards & Membership dashboard tab.
// Shows program stats, full member list, quick-enroll modal, and per-member
// action buttons (adjust points, change plan, unenroll).
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast } from '../../lib/nav.js';
import * as rewards from '../../lib/rewards.js';

export function renderRewardsTab(mount) {
  renderView(mount);
}

function renderView(mount) {
  const prog = rewards.getRewardProgram();
  const crs = db.customerRewards();
  const active = crs.filter(r => r.membershipStatus === 'active');
  const totalPts = active.reduce((s, r) => s + (r.pointsBalance || 0), 0);
  const txns = db.rewardTransactions();
  const thisMonth = new Date();
  thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);
  const ptsEarnedMonth = txns.filter(t => t.pointsChange > 0 && new Date(t.createdAt) >= thisMonth).reduce((s, t) => s + t.pointsChange, 0);

  mount.innerHTML = `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      ${stat('Members Enrolled', active.length)}
      ${stat('Points in Circulation', totalPts.toLocaleString())}
      ${stat('Redemption Value', util.fmtMoney(rewards.pointsValue(totalPts)))}
    </div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head">
        <div class="card-title">Member List</div>
        <button class="btn btn-primary btn-sm" id="rw-enroll-btn">+ Enroll Customer</button>
      </div>
      <div class="card-body" style="padding:0">
        ${renderMemberTable(active)}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">Points Earned This Month</div></div>
      <div class="card-body">
        <div style="font-size:var(--t-2xl);font-weight:800;color:var(--ink)">${ptsEarnedMonth.toLocaleString()} <span style="font-size:var(--t-md);font-weight:400;color:var(--ink-3)">pts</span></div>
        <div class="muted" style="font-size:var(--t-13);margin-top:var(--s2)">Program config: ${prog.pointsPerDollar} pt per $1 · ${util.fmtMoney(prog.redemptionRate)} per pt · ${prog.minimumPointsToRedeem} pt minimum to redeem</div>
        <div class="muted" style="font-size:var(--t-13);margin-top:4px">Edit program rules in <a href="settings.html#rewards" style="color:var(--accent)">Settings → Rewards</a>.</div>
      </div>
    </div>
  `;

  document.getElementById('rw-enroll-btn').addEventListener('click', () => openEnrollModal(mount));
  mount.querySelectorAll('[data-rw-adjust]').forEach(btn => btn.addEventListener('click', () => openAdjustModal(mount, btn.dataset.rwAdjust)));
  mount.querySelectorAll('[data-rw-unenroll]').forEach(btn => btn.addEventListener('click', () => {
    rewards.unenrollCustomer(btn.dataset.rwUnenroll);
    toast('Member unenrolled.', 'success');
    renderView(mount);
  }));
  mount.querySelectorAll('[data-rw-plan]').forEach(btn => btn.addEventListener('click', () => openChangePlanModal(mount, btn.dataset.rwPlan)));
}

function renderMemberTable(active) {
  if (!active.length) return '<div class="empty" style="padding:var(--s5)"><div class="empty-title">No members yet</div><div class="empty-sub">Enroll your first customer above.</div></div>';
  const plans = db.membershipPlans();
  const planName = id => plans.find(p => p.id === id)?.name || id;

  return `
    <table class="table">
      <thead><tr>
        <th>Customer</th>
        <th>Tier</th>
        <th>Plan</th>
        <th class="num">Balance</th>
        <th class="num">Value</th>
        <th>Member since</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${active.map(cr => {
          const c = db.customerById(cr.customerId);
          if (!c) return '';
          const t = rewards.tierMeta(cr.tier);
          return `
          <tr>
            <td class="strong">${util.customerName(c)}</td>
            <td><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:100px;background:${t.bg};color:${t.color};text-transform:uppercase">${t.label}</span></td>
            <td>${planName(cr.membershipPlanId)}</td>
            <td class="num tnum">${(cr.pointsBalance || 0).toLocaleString()} pts</td>
            <td class="num tnum">${util.fmtMoney(rewards.pointsValue(cr.pointsBalance || 0))}</td>
            <td class="muted" style="font-size:var(--t-13)">${util.fmtDate(cr.enrolledAt)}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-secondary btn-sm" data-rw-adjust="${cr.customerId}" style="margin-right:4px">Pts</button>
              <button class="btn btn-secondary btn-sm" data-rw-plan="${cr.customerId}" style="margin-right:4px">Plan</button>
              <button class="btn btn-secondary btn-sm" data-rw-unenroll="${cr.customerId}">Remove</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------
function openEnrollModal(mount) {
  const enrolled = new Set(db.customerRewards().filter(r => r.membershipStatus === 'active').map(r => r.customerId));
  const available = db.customers().filter(c => !enrolled.has(c.id));
  const plans = db.membershipPlans();

  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div class="modal-head"><div class="modal-title">Enroll Customer</div><button class="icon-btn" data-close>${closeIcon()}</button></div>
      <div class="modal-body">
        <div class="field"><label class="label">Customer</label>
          <select class="select" id="rw-enroll-customer">
            <option value="">Select customer…</option>
            ${available.map(c => `<option value="${c.id}">${util.customerName(c)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label class="label">Plan</label>
          <select class="select" id="rw-enroll-plan">
            ${plans.map(p => `<option value="${p.id}">${p.name}${p.price ? ' — $' + p.price + '/mo' : ' — Free'}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" data-close>Cancel</button>
        <button class="btn btn-primary" id="rw-enroll-submit">Enroll</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => overlay.remove()));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#rw-enroll-submit').addEventListener('click', () => {
    const customerId = overlay.querySelector('#rw-enroll-customer').value;
    const planId = overlay.querySelector('#rw-enroll-plan').value;
    if (!customerId) { toast('Select a customer.', 'error'); return; }
    rewards.enrollCustomer(customerId, planId);
    overlay.remove();
    toast('Customer enrolled in Rewards.', 'success');
    renderView(mount);
  });
}

function openAdjustModal(mount, customerId) {
  const cr = db.customerRewardByCustomerId(customerId);
  const c = db.customerById(customerId);
  if (!cr || !c) return;

  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-head"><div class="modal-title">Adjust Points — ${util.customerName(c)}</div><button class="icon-btn" data-close>${closeIcon()}</button></div>
      <div class="modal-body">
        <div class="muted" style="font-size:var(--t-13);margin-bottom:var(--s3)">Current balance: <b>${(cr.pointsBalance || 0).toLocaleString()} pts</b></div>
        <div class="field"><label class="label">Points to add (use − for deductions)</label><input class="input" type="number" id="rw-pts-delta" value="100"></div>
        <div class="field"><label class="label">Reason</label><input class="input" id="rw-pts-reason" placeholder="e.g. Goodwill adjustment"></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" data-close>Cancel</button>
        <button class="btn btn-primary" id="rw-pts-submit">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => overlay.remove()));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#rw-pts-submit').addEventListener('click', () => {
    const delta = parseInt(overlay.querySelector('#rw-pts-delta').value, 10);
    const reason = overlay.querySelector('#rw-pts-reason').value.trim() || 'Manual adjustment';
    if (!delta) { toast('Enter a non-zero adjustment.', 'error'); return; }
    rewards.awardPoints(customerId, delta, reason, 'manual');
    overlay.remove();
    toast(`${delta > 0 ? '+' : ''}${delta} pts recorded.`, 'success');
    renderView(mount);
  });
}

function openChangePlanModal(mount, customerId) {
  const cr = db.customerRewardByCustomerId(customerId);
  const c = db.customerById(customerId);
  const plans = db.membershipPlans();
  if (!cr || !c) return;

  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:360px">
      <div class="modal-head"><div class="modal-title">Change Plan — ${util.customerName(c)}</div><button class="icon-btn" data-close>${closeIcon()}</button></div>
      <div class="modal-body">
        <div class="field"><label class="label">Plan</label>
          <select class="select" id="rw-chg-plan">
            ${plans.map(p => `<option value="${p.id}" ${p.id === cr.membershipPlanId ? 'selected' : ''}>${p.name}${p.price ? ' — $' + p.price + '/mo' : ' — Free'}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" data-close>Cancel</button>
        <button class="btn btn-primary" id="rw-chg-submit">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => overlay.remove()));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#rw-chg-submit').addEventListener('click', () => {
    const planId = overlay.querySelector('#rw-chg-plan').value;
    rewards.enrollCustomer(customerId, planId);
    overlay.remove();
    toast('Plan updated.', 'success');
    renderView(mount);
  });
}

function stat(label, value) {
  return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;
}

function closeIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
}
