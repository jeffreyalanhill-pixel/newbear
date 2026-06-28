// AutoBook — modules/platform.js (Phase E — platform/admin placeholder)
// Read-only operator view across every signed-up shop: totals, plan mix,
// recent signups, and per-shop feature flags. All numbers are real
// (computed from db.shops()/db.subscriptions()/db.plans() via
// util.platformMetrics) — only the "billing status" column is a labeled
// placeholder, since there's no real Stripe integration yet.
import { db } from '../lib/data.js';
import { util } from '../lib/util.js';

const STATUS_BADGE = { trialing: 'badge-blue', active: 'badge-green', past_due: 'badge-amber', canceled: 'badge-red', paused: 'badge-gray' };

export function renderPlatform() {
  const m = util.platformMetrics();

  document.getElementById('pf-body').innerHTML = `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon blue">${iconShop()}</span><span class="stat-label">Total Shops</span></div>
        <div class="stat-value">${m.totalShops}</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon green">${iconCheck()}</span><span class="stat-label">Active Subscriptions</span></div>
        <div class="stat-value">${m.activeSubscriptions}</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon amber">${iconClock()}</span><span class="stat-label">Trialing Shops</span></div>
        <div class="stat-value">${m.trialingShops}</div>
      </div>
    </div>
    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon amber">${iconAlert()}</span><span class="stat-label">Past Due <span class="badge badge-gray" style="font-size:10px;margin-left:4px">placeholder</span></span></div>
        <div class="stat-value">${m.pastDue}</div>
        <div class="stat-sub">No real billing/dunning exists yet</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon red">${iconX()}</span><span class="stat-label">Canceled</span></div>
        <div class="stat-value">${m.canceled}</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon purple">${iconLayers()}</span><span class="stat-label">Plans Offered</span></div>
        <div class="stat-value">${db.plans().length}</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Plan mix</div></div>
      <div class="card-body">
        ${m.planMix.length
          ? m.planMix.map((pm) => `
            <div style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
              <div class="row between"><span>${pm.plan?.name || 'Unknown plan'}</span><span class="badge badge-blue">${pm.count} shop${pm.count === 1 ? '' : 's'}</span></div>
              <div class="crm-bar-track"><div class="crm-bar-fill" style="width:${(pm.count / m.totalShops) * 100}%"></div></div>
            </div>`).join('')
          : '<div class="empty-sub">No subscriptions yet.</div>'}
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Recent signups</div></div>
      <div class="card-body">
        <table class="table">
          <thead><tr><th>Shop</th><th>Plan</th><th>Status</th><th>Billing status</th><th>Signed up</th></tr></thead>
          <tbody>
            ${m.recentSignups.map((shop) => {
              const sub = db.subscriptionForShop(shop.id);
              const plan = sub ? db.planById(sub.planId) : null;
              return `
              <tr>
                <td class="strong">${shop.name}<div class="muted" style="font-size:var(--t-13)">${shop.city}, ${shop.state}</div></td>
                <td>${plan?.name || '—'}</td>
                <td>${sub ? `<span class="badge ${STATUS_BADGE[sub.status] || 'badge-gray'}">${sub.status}</span>` : '—'}</td>
                <td><span class="badge badge-gray">placeholder — no Stripe yet</span></td>
                <td>${util.fmtDate(shop.createdAt)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">Feature flags by plan</div><span class="badge badge-gray">demo logic — not enforced anywhere in the app yet</span></div>
      <div class="card-body">
        <table class="table">
          <thead><tr><th>Feature</th>${db.plans().map((p) => `<th>${p.name}</th>`).join('')}</tr></thead>
          <tbody>
            ${Object.keys(db.plans()[0]?.features || {}).map((key) => `
              <tr>
                <td>${key}</td>
                ${db.plans().map((p) => `<td>${p.features[key] ? '<span class="badge badge-green">on</span>' : '<span class="badge badge-gray">off</span>'}</td>`).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function iconShop() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l1-5h16l1 5M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9M4 9h16"/></svg>'; }
function iconCheck() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>'; }
function iconClock() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'; }
function iconAlert() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>'; }
function iconX() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'; }
function iconLayers() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5M3 17l9 5 9-5"/></svg>'; }
