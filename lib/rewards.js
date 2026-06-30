// AutoBook — lib/rewards.js
// Rewards & Membership engine: tier computation, plan helpers, points CRUD.
// All writes go through db.save* — nothing here touches localStorage directly.
import { db } from './data.js';

// Tier thresholds are based on lifetime invoiced total (all-time paid invoices).
export const TIERS = [
  { id: 'none',   label: 'Not enrolled', color: '#525C6B', bg: '#E8ECF2' },
  { id: 'bronze', label: 'Bronze',        color: '#92400e', bg: '#fef3c7' },
  { id: 'silver', label: 'Silver',        color: '#374151', bg: '#f3f4f6' },
  { id: 'gold',   label: 'Gold',          color: '#92400e', bg: '#fef9c3' },
  { id: 'vip',    label: 'VIP',           color: '#5b21b6', bg: '#ede9fe' },
];

// ---------------------------------------------------------------------------
// Tier from lifetime spend (used to recompute tier on enroll / after payment).
// ---------------------------------------------------------------------------
export function computeTier(lifetimeSpend) {
  if (lifetimeSpend >= 2500) return 'vip';
  if (lifetimeSpend >= 1000) return 'gold';
  if (lifetimeSpend >= 500)  return 'silver';
  return 'bronze';
}

export function tierMeta(tierId) {
  return TIERS.find(t => t.id === tierId) || TIERS[0];
}

export function tierBadge(tierId) {
  if (!tierId || tierId === 'none') return '';
  const t = tierMeta(tierId);
  return `<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:100px;background:${t.bg};color:${t.color};letter-spacing:.04em;text-transform:uppercase">${t.label}</span>`;
}

// ---------------------------------------------------------------------------
// Program config
// ---------------------------------------------------------------------------
export function getRewardProgram() {
  return db.rewardsPrograms()[0] || {
    isActive: true, pointsPerDollar: 1, redemptionRate: 0.01, minimumPointsToRedeem: 500,
  };
}

// Points → dollar value
export function pointsValue(points) {
  const prog = getRewardProgram();
  return Math.round(points * (prog.redemptionRate || 0.01) * 100) / 100;
}

// Points earned for a given invoice amount (considering plan multiplier)
export function pointsForAmount(amount, planId) {
  const prog = getRewardProgram();
  const plan = db.membershipPlanById(planId);
  const mult = plan?.pointsMultiplier || 1;
  return Math.floor(amount * (prog.pointsPerDollar || 1) * mult);
}

// ---------------------------------------------------------------------------
// Customer reward record access
// ---------------------------------------------------------------------------
export function getCustomerReward(customerId) {
  return db.customerRewardByCustomerId(customerId) || null;
}

// ---------------------------------------------------------------------------
// Enroll or update plan for a customer. Creates record if none exists.
// ---------------------------------------------------------------------------
export function enrollCustomer(customerId, planId) {
  const list = db.customerRewards();
  const idx = list.findIndex(r => r.customerId === customerId);
  const ltv = db.invoices().filter(i => i.customerId === customerId && i.status === 'paid').reduce((s, i) => s + i.total, 0);
  const tier = computeTier(ltv);

  if (idx !== -1) {
    list[idx] = { ...list[idx], membershipPlanId: planId, membershipStatus: 'active', tier };
    db.saveCustomerRewards(list);
    return list[idx];
  }

  const cr = {
    id: db.nextId('cr'),
    customerId,
    pointsBalance: 0,
    lifetimePoints: 0,
    membershipPlanId: planId,
    membershipStatus: 'active',
    tier,
    enrolledAt: new Date().toISOString(),
    notes: '',
  };
  list.push(cr);
  db.saveCustomerRewards(list);
  return cr;
}

// ---------------------------------------------------------------------------
// Unenroll (cancel) a customer's reward membership.
// ---------------------------------------------------------------------------
export function unenrollCustomer(customerId) {
  const list = db.customerRewards();
  const idx = list.findIndex(r => r.customerId === customerId);
  if (idx === -1) return;
  list[idx].membershipStatus = 'canceled';
  db.saveCustomerRewards(list);
}

// ---------------------------------------------------------------------------
// Award (or deduct) points for a customer. Logs a transaction.
// pointsChange: positive = earn, negative = redeem/adjust.
// ---------------------------------------------------------------------------
export function awardPoints(customerId, pointsChange, description, sourceType = 'manual', sourceId = null) {
  const list = db.customerRewards();
  const idx = list.findIndex(r => r.customerId === customerId);
  if (idx === -1) return null;
  list[idx].pointsBalance = Math.max(0, (list[idx].pointsBalance || 0) + pointsChange);
  if (pointsChange > 0) list[idx].lifetimePoints = (list[idx].lifetimePoints || 0) + pointsChange;
  db.saveCustomerRewards(list);

  const txns = db.rewardTransactions();
  txns.push({
    id: db.nextId('rt'),
    customerId,
    sourceType,
    sourceId,
    pointsChange,
    description,
    createdAt: new Date().toISOString(),
    createdByEmployeeId: db.settings().currentUserId || null,
  });
  db.saveRewardTransactions(txns);
  return list[idx];
}

// ---------------------------------------------------------------------------
// Award points when an invoice is paid (hook called from inv-invoices-list.js).
// ---------------------------------------------------------------------------
export function awardPointsForInvoicePaid(invoice) {
  const cr = getCustomerReward(invoice.customerId);
  if (!cr || cr.membershipStatus !== 'active') return null;
  const pts = pointsForAmount(invoice.total, cr.membershipPlanId);
  if (!pts) return null;
  const plan = db.membershipPlanById(cr.membershipPlanId);
  const multNote = (plan?.pointsMultiplier || 1) > 1 ? ` — ${plan.pointsMultiplier}× ${plan.name}` : '';
  return awardPoints(invoice.customerId, pts, `Invoice ${invoice.number}${multNote}`, 'invoice', invoice.id);
}
