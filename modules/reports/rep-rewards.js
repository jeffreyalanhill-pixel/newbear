// AutoBook — modules/reports/rep-rewards.js
// Rewards & Membership tab: Points Summary, Tier Distribution, Redemptions
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { getRepState, inRange, safeNum, repLabel, repSection, repTable, repCsv, repPrint, custLink } from './reports-app.js';

export function renderRepRewards(mount) {
  const { start, end } = getRepState();
  const label = repLabel(start, end);

  const rewards = db.customerRewards ? db.customerRewards() : [];
  const transactions = db.rewardTransactions ? db.rewardTransactions() : [];
  const programs = db.rewardsPrograms ? db.rewardsPrograms() : [];
  const membershipPlans = db.membershipPlans ? db.membershipPlans() : [];
  const custs = Object.fromEntries(db.customers().map(c => [c.id, c]));

  const txInRange = transactions.filter(t => inRange(t.createdAt, start, end));

  mount.innerHTML = `
    ${renderProgramSummary(rewards, programs, membershipPlans)}
    ${renderTierDistribution(rewards, programs)}
    ${renderRedemptions(txInRange, custs, label)}
    ${renderPointsActivity(txInRange, custs, label)}
  `;

  wireExports(mount, rewards, txInRange, custs, label);
}

// ---------------------------------------------------------------------------
// Program Summary
// ---------------------------------------------------------------------------
function renderProgramSummary(rewards, programs, membershipPlans) {
  const totalMembers = rewards.length;
  const totalPoints = rewards.reduce((s, r) => s + safeNum(r.points || r.balance || 0), 0);
  const activeMemberships = rewards.filter(r => r.membershipPlanId && r.membershipStatus === 'active').length;

  if (!rewards.length) {
    return `<div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Rewards & Membership</div></div>
      <div class="card-body"><div class="empty-sub">No rewards program members yet.</div></div>
    </div>`;
  }

  return `<div class="grid-4" style="margin-bottom:var(--s4)">
    <div class="stat-card"><div class="stat-head"><span class="stat-label">Members</span></div><div class="stat-value tnum">${totalMembers}</div></div>
    <div class="stat-card"><div class="stat-head"><span class="stat-label">Points Outstanding</span></div><div class="stat-value tnum">${totalPoints.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-head"><span class="stat-label">Active Memberships</span></div><div class="stat-value tnum">${activeMemberships}</div></div>
    <div class="stat-card"><div class="stat-head"><span class="stat-label">Programs</span></div><div class="stat-value tnum">${programs.length + membershipPlans.length}</div></div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Tier Distribution
// ---------------------------------------------------------------------------
function renderTierDistribution(rewards, programs) {
  if (!rewards.length) return '';

  const tierMap = {};
  rewards.forEach(r => {
    const tier = r.tier || r.level || 'standard';
    if (!tierMap[tier]) tierMap[tier] = { count: 0, points: 0 };
    tierMap[tier].count++;
    tierMap[tier].points += safeNum(r.points || r.balance || 0);
  });

  const total = rewards.length;
  const rows = Object.entries(tierMap).sort((a,b) => b[1].count - a[1].count).map(([tier, m]) => ({
    tier: capitalize(tier),
    count: m.count,
    pct: `${(m.count / total * 100).toFixed(1)}%`,
    avgPoints: Math.round(m.points / m.count).toLocaleString(),
    totalPoints: m.points.toLocaleString(),
  }));

  const cols = [
    { key: 'tier', label: 'Tier' },
    { key: 'count', label: 'Members', num: true },
    { key: 'pct', label: '% of Total', num: true },
    { key: 'avgPoints', label: 'Avg Points', num: true },
    { key: 'totalPoints', label: 'Total Points', num: true },
  ];

  return repSection('Tier Distribution', `${Object.keys(tierMap).length} tiers`, repTable(cols, rows));
}

// ---------------------------------------------------------------------------
// Redemptions in date range
// ---------------------------------------------------------------------------
function renderRedemptions(txInRange, custs, label) {
  const redemptions = txInRange.filter(t => t.type === 'redemption' || t.type === 'redeem');

  const rows = [...redemptions].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).map(t => {
    const c = custs[t.customerId];
    return {
      date: fmtDate((t.createdAt||'').slice(0,10)),
      customer: custLink(t.customerId, c ? `${c.firstName||''} ${c.lastName||''}`.trim() : ''),
      points: safeNum(t.points || t.amount || 0),
      value: util.fmtMoney(safeNum(t.dollarValue || t.value || 0)),
      desc: t.description || t.note || '—',
    };
  });

  const totalPoints = redemptions.reduce((s, t) => s + safeNum(t.points || t.amount || 0), 0);
  const totalValue = redemptions.reduce((s, t) => s + safeNum(t.dollarValue || t.value || 0), 0);

  const footer = rows.length ? `<div style="text-align:right;margin-top:var(--s3)">
    <strong>${totalPoints.toLocaleString()} pts redeemed</strong> · <strong>${util.fmtMoney(totalValue)} value</strong>
  </div>` : '';

  const cols = [
    { key: 'date', label: 'Date' },
    { key: 'customer', label: 'Customer' },
    { key: 'points', label: 'Points', num: true },
    { key: 'value', label: 'Dollar Value', num: true },
    { key: 'desc', label: 'Description' },
  ];

  return repSection('Redemptions', `${rows.length} in range`,
    repTable(cols, rows) + footer,
    `<button class="btn btn-sm btn-ghost" data-export="red-csv">CSV</button>`
  );
}

// ---------------------------------------------------------------------------
// Points Activity (earned + redeemed)
// ---------------------------------------------------------------------------
function renderPointsActivity(txInRange, custs, label) {
  const earned = txInRange.filter(t => t.type === 'earn' || t.type === 'earned' || t.type === 'bonus');
  const redeemed = txInRange.filter(t => t.type === 'redemption' || t.type === 'redeem');
  const expired = txInRange.filter(t => t.type === 'expired' || t.type === 'expire');
  const adjusted = txInRange.filter(t => t.type === 'adjustment' || t.type === 'adjust');

  const rows = [...txInRange].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).slice(0, 100).map(t => {
    const c = custs[t.customerId];
    return {
      date: fmtDate((t.createdAt||'').slice(0,10)),
      customer: custLink(t.customerId, c ? `${c.firstName||''} ${c.lastName||''}`.trim() : ''),
      type: capitalize(t.type || '—'),
      points: safeNum(t.points || t.amount || 0),
      desc: t.description || t.note || '—',
    };
  });

  const summary = txInRange.length ? `<div class="row" style="gap:var(--s5);flex-wrap:wrap;margin-bottom:var(--s4)">
    <div><span class="tnum" style="font-weight:700;color:var(--green)">+${earned.reduce((s,t)=>s+safeNum(t.points||t.amount||0),0).toLocaleString()}</span><div style="font-size:var(--t-xs);color:var(--ink-3)">Earned</div></div>
    <div><span class="tnum" style="font-weight:700;color:var(--red)">−${redeemed.reduce((s,t)=>s+safeNum(t.points||t.amount||0),0).toLocaleString()}</span><div style="font-size:var(--t-xs);color:var(--ink-3)">Redeemed</div></div>
    ${expired.length ? `<div><span class="tnum" style="font-weight:700;color:var(--ink-3)">−${expired.reduce((s,t)=>s+safeNum(t.points||t.amount||0),0).toLocaleString()}</span><div style="font-size:var(--t-xs);color:var(--ink-3)">Expired</div></div>` : ''}
  </div>` : '';

  const cols = [
    { key: 'date', label: 'Date' },
    { key: 'customer', label: 'Customer' },
    { key: 'type', label: 'Type' },
    { key: 'points', label: 'Points', num: true },
    { key: 'desc', label: 'Description' },
  ];

  const badge = txInRange.length > 100 ? `${txInRange.length} (showing 100 most recent)` : `${txInRange.length}`;

  return repSection('Points Activity', badge, summary + repTable(cols, rows),
    `<button class="btn btn-sm btn-ghost" data-export="pts-csv">CSV</button>`
  );
}

// ---------------------------------------------------------------------------
// Wire exports
// ---------------------------------------------------------------------------
function wireExports(mount, rewards, txInRange, custs, label) {
  mount.querySelectorAll('button[data-export]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.export;
      if (key === 'red-csv') {
        const rows = [['Date','Customer','Points','Dollar Value','Description']];
        txInRange.filter(t=>t.type==='redemption'||t.type==='redeem').sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).forEach(t => {
          const c=custs[t.customerId];
          rows.push([(t.createdAt||'').slice(0,10), c?`${c.firstName||''} ${c.lastName||''}`.trim():'', safeNum(t.points||t.amount||0), safeNum(t.dollarValue||t.value||0).toFixed(2), t.description||t.note||'']);
        });
        repCsv(rows,'redemptions.csv');
      } else if (key === 'pts-csv') {
        const rows = [['Date','Customer','Type','Points','Description']];
        txInRange.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).forEach(t => {
          const c=custs[t.customerId];
          rows.push([(t.createdAt||'').slice(0,10), c?`${c.firstName||''} ${c.lastName||''}`.trim():'', t.type||'', safeNum(t.points||t.amount||0), t.description||t.note||'']);
        });
        repCsv(rows,'points-activity.csv');
      }
    };
  });
}

function fmtDate(d) {
  if (!d) return '—';
  const [y,m,day] = d.split('-');
  return `${Number(m)}/${Number(day)}/${y}`;
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
