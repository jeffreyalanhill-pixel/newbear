// AutoBook — lib/util.js
// Pure formatting/label/calc helpers + the RO lifecycle transition functions (§9).
// Imports `db` and is the ONLY place that mutates RepairOrder.status — pages never
// set `job.status` inline, they call these transitions.

import { db } from './data.js';

export const util = {};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
util.fmtMoney = (n) => {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
util.fmtMoney0 = (n) => {
  const v = Number(n) || 0;
  return '$' + Math.round(v).toLocaleString('en-US');
};
util.fmtDate = (iso, style) => {
  if (!iso) return '';
  // Date-only strings ("YYYY-MM-DD") must be parsed as local midnight, not UTC —
  // `new Date("2026-06-27")` is UTC and can render as the previous day in
  // negative-UTC-offset timezones. Date*time* strings parse normally.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(iso);
  if (style === 'long') {
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};
util.fmtTime = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
};
util.fmtDateTime = (iso) => {
  if (!iso) return '';
  return `${util.fmtDate(iso)} ${new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};
util.timeAgo = (iso) => {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
};

// ---------------------------------------------------------------------------
// Date predicates
// ---------------------------------------------------------------------------
// Shared safe parse: date-only strings are local midnight, not UTC (see fmtDate).
const parseLocal = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(iso));
const sameDay = (a, b) => a.toDateString() === b.toDateString();
util.isToday = (iso) => !!iso && sameDay(parseLocal(iso), new Date());
util.isThisWeek = (iso) => {
  if (!iso) return false;
  const d = parseLocal(iso);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return d >= start && d < end;
};
util.isThisMonth = (iso) => {
  if (!iso) return false;
  const d = parseLocal(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};
util.inRange = (iso, startIso, endIso) => {
  const t = parseLocal(iso).getTime();
  return t >= parseLocal(startIso).getTime() && t <= parseLocal(endIso).getTime();
};

// ---------------------------------------------------------------------------
// Labels & badges
// ---------------------------------------------------------------------------
// §10.7 make badge colors
const MAKE_COLORS = {
  Ford: { bg: '#003478', txt: '#fff' },
  Chevy: { bg: '#D4A017', txt: '#000' },
  Chevrolet: { bg: '#D4A017', txt: '#000' },
  Toyota: { bg: '#EB0A1E', txt: '#fff' },
  Honda: { bg: '#CC0000', txt: '#fff' },
  Dodge: { bg: '#1B1B1B', txt: '#fff' },
  Ram: { bg: '#1B1B1B', txt: '#fff' },
  Jeep: { bg: '#2C5234', txt: '#fff' },
  BMW: { bg: '#0066B1', txt: '#fff' },
  Mercedes: { bg: '#1A1A1A', txt: '#fff' },
  Nissan: { bg: '#C3002F', txt: '#fff' },
  Hyundai: { bg: '#002C5F', txt: '#fff' },
  Kia: { bg: '#05141F', txt: '#fff' },
  Subaru: { bg: '#013C7D', txt: '#fff' },
  VW: { bg: '#001E50', txt: '#fff' },
  Audi: { bg: '#BB0A30', txt: '#fff' },
  GMC: { bg: '#CC0000', txt: '#fff' },
  Cadillac: { bg: '#1A1A1A', txt: '#fff' },
  Lexus: { bg: '#1A1A1A', txt: '#C8A96E' },
  Mazda: { bg: '#910000', txt: '#fff' },
};
util.makeBadge = (make) => {
  const c = MAKE_COLORS[make] || { bg: '#374151', txt: '#fff' };
  return { bg: c.bg, txt: c.txt, letter: (make || '?').charAt(0).toUpperCase() };
};

util.customerName = (c) => (c ? `${c.firstName} ${c.lastName}`.trim() : '');
util.customerShort = (c) => (c ? `${c.firstName} ${(c.lastName || '').charAt(0)}.`.trim() : '');
util.vehicleLabel = (v) => (v ? `${v.year} ${v.make} ${v.model}` : '');
util.vehicleSub = (v) => (v ? `${v.color ? v.color + ' · ' : ''}${(v.mileage || 0).toLocaleString()} mi` : '');
util.visitTypeLabel = (t) => ({ drop_off: 'Drop off', wait: 'Wait at shop', shuttle: 'Shuttle' }[t] || t || '');

// Real, derived from invoices — no separate ledger entity exists.
util.customerLifetimeValue = (customerId) => db.invoices().filter((i) => i.customerId === customerId).reduce((s, i) => s + (i.total || 0), 0);

// §C CRM — per-customer tag chips, computed on the fly (no persisted `tags`
// field on Customer, so a tag can never drift from the data it describes).
// Same membership rules as db.segmentMembers(); see that function's inline
// comments for which of these are exact vs. a documented MVP assumption.
util.customerTags = (customerId) => {
  const c = db.customerById(customerId);
  if (!c) return [];
  const tags = [];
  const DAY = 86400000;
  const now = Date.now();
  const vehicles = db.vehiclesForCustomer(customerId);
  const jobs = db.jobsForCustomer(customerId);
  const ltv = util.customerLifetimeValue(customerId);

  if (ltv >= 400) tags.push({ label: 'VIP', badgeClass: 'badge-purple' }); // ASSUMPTION: same $400 cutoff as seg_high_value
  if (vehicles.length >= 3) tags.push({ label: 'Fleet', badgeClass: 'badge-blue' }); // ASSUMPTION: same heuristic as seg_fleet
  if ((now - new Date(c.createdAt).getTime()) / DAY <= 30) tags.push({ label: 'New Customer', badgeClass: 'badge-green' });
  if (jobs.length && (now - Math.max(...jobs.map((j) => new Date(j.createdAt).getTime()))) / DAY > 90) tags.push({ label: 'At Risk', badgeClass: 'badge-red' });
  if (vehicles.some((v) => isDueForServiceTag(v.id, 's_oil', 150) || isDueForServiceTag(v.id, 's_rotate', 180))) tags.push({ label: 'Due for Service', badgeClass: 'badge-amber' });
  if (jobs.some((j) => j.approvalStatus === 'declined')) tags.push({ label: 'Declined Work', badgeClass: 'badge-red' });
  if (jobs.some((j) => j.approvalStatus === 'pending')) tags.push({ label: 'Waiting Approval', badgeClass: 'badge-amber' });
  const lead = db.leads().find((l) => l.customerId === customerId && l.status === 'estimate_needed');
  if (lead) tags.push({ label: 'Needs Estimate', badgeClass: 'badge-purple' });
  const quotes = db.quotesForCustomer(customerId);
  if (quotes.some((q) => ['sent', 'viewed'].includes(q.status))) tags.push({ label: 'Quote Pending', badgeClass: 'badge-amber' });
  if (quotes.some((q) => q.status === 'declined')) tags.push({ label: 'Declined Quote', badgeClass: 'badge-red' });
  return tags;
};
function isDueForServiceTag(vehicleId, serviceId, intervalDays) {
  const jobs = db.jobsForVehicle(vehicleId).filter((j) => (j.lineItems || []).some((l) => l.refId === serviceId));
  if (!jobs.length) return true;
  const last = Math.max(...jobs.map((j) => new Date(j.createdAt).getTime()));
  return (Date.now() - last) / 86400000 > intervalDays;
}

// §10.8 status map
const STATUS_META = {
  scheduled: { label: 'Scheduled', badgeClass: 'badge-gray', kanbanCol: null },
  waiting: { label: 'Waiting', badgeClass: 'badge-amber', kanbanCol: 'waiting' },
  in_progress: { label: 'In Progress', badgeClass: 'badge-blue', kanbanCol: 'in_progress' },
  on_hold: { label: 'On Hold', badgeClass: 'badge-purple', kanbanCol: 'in_progress' },
  ready: { label: 'Ready', badgeClass: 'badge-green', kanbanCol: 'ready' },
  invoiced: { label: 'Invoiced', badgeClass: 'badge-blue', kanbanCol: null },
  closed: { label: 'Closed', badgeClass: 'badge-gray', kanbanCol: null },
  cancelled: { label: 'Cancelled', badgeClass: 'badge-red', kanbanCol: null },
};
util.statusMeta = (status) => STATUS_META[status] || { label: status, badgeClass: 'badge-gray', kanbanCol: null };

// Quote/estimate status map (separate from RO's STATUS_META above — these
// are two different lifecycles that never share a status value).
const QUOTE_STATUS_META = {
  draft: { label: 'Draft', badgeClass: 'badge-gray' },
  review_required: { label: 'Review Required', badgeClass: 'badge-purple' },
  ready_to_send: { label: 'Ready to Send', badgeClass: 'badge-blue' },
  sent: { label: 'Sent', badgeClass: 'badge-amber' },
  viewed: { label: 'Viewed', badgeClass: 'badge-amber' },
  approved: { label: 'Approved', badgeClass: 'badge-green' },
  partially_approved: { label: 'Partially Approved', badgeClass: 'badge-green' },
  declined: { label: 'Declined', badgeClass: 'badge-red' },
  expired: { label: 'Expired', badgeClass: 'badge-gray' },
  converted: { label: 'Converted', badgeClass: 'badge-blue' },
};
util.quoteStatusMeta = (status) => QUOTE_STATUS_META[status] || { label: status, badgeClass: 'badge-gray' };

// Customer-facing translation (used by waiting-room/board; harmless to expose now)
util.customerStatus = (ro) => {
  if (!ro) return { text: '', color: 'gray' };
  if (ro.status === 'ready') {
    return ro.invoiceId == null
      ? { text: 'Ready at Counter', color: 'green' }
      : { text: 'Ready for Pickup', color: 'green' };
  }
  if (ro.status === 'on_hold') {
    if (ro.holdReason === 'waiting_approval') return { text: 'See Advisor ⚠️', color: 'amber' };
    if (ro.holdReason === 'parts_ordered') return { text: 'Waiting on Parts', color: 'amber' };
  }
  if (ro.status === 'in_progress') {
    if (ro.stage === 'qc_test_drive') return { text: 'Quality Check', color: 'blue' };
    if (['repair', 'dvi', 'inspection'].includes(ro.stage)) return { text: 'In Service', color: 'blue' };
    if (ro.stage === 'assigned_to_bay') return { text: 'Moving to Bay', color: 'blue' };
    return { text: 'In Service', color: 'blue' };
  }
  if (ro.status === 'waiting' || ro.status === 'scheduled') return { text: 'Queued', color: 'gray' };
  return { text: util.statusMeta(ro.status).label, color: 'gray' };
};

// stable hash → "T-###" (100-999), privacy-safe ticket id for board display
util.ticketId = (roId) => {
  let h = 0;
  for (let i = 0; i < roId.length; i++) h = (h * 31 + roId.charCodeAt(i)) >>> 0;
  return 'T-' + (100 + (h % 900));
};

// ---------------------------------------------------------------------------
// RO computation (§10.2)
// ---------------------------------------------------------------------------
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

util.lineTotal = (line, laborRate) => {
  if (line.type === 'labor') return round2((line.hours || 0) * laborRate);
  return round2((line.qty || 0) * (line.unitPrice || 0));
};

util.recalcRO = (ro) => {
  const settings = db.settings();
  const laborRate = ro.laborRate || settings.laborRate || 0;
  const taxRate = settings.taxRate || 0;

  ro.lineItems = (ro.lineItems || []).map((l) => ({ ...l, total: util.lineTotal(l, laborRate) }));
  ro.estHours = ro.lineItems
    .filter((l) => l.type === 'service' || l.type === 'labor')
    .reduce((s, l) => s + (l.hours || 0), 0);
  // billedHours tracks actual time on the job; if not separately set, mirrors estHours
  // (real per-line time clocking can refine this later — see §10.2 note).
  if (ro.billedHours == null) ro.billedHours = ro.estHours;

  ro.subtotal = round2(ro.lineItems.reduce((s, l) => s + l.total, 0));
  const discountAmt = ro.discount || 0;
  const taxable = Math.max(ro.subtotal - discountAmt, 0);
  ro.tax = round2(taxable * taxRate);
  ro.total = round2(taxable + ro.tax);
  ro.laborRate = laborRate;
  return ro;
};

util.validateCoupon = (code, subtotal) => {
  const settings = db.settings();
  const coupon = (settings.coupons || []).find(
    (c) => c.active && c.code.toLowerCase() === String(code || '').toLowerCase()
  );
  if (!coupon) return { valid: false };
  const discount =
    coupon.type === 'percent' ? round2(subtotal * coupon.value / 100) : Math.min(coupon.value, subtotal);
  const label = coupon.type === 'percent' ? `${coupon.value}% off` : `${util.fmtMoney(coupon.value)} off`;
  return { valid: true, discount, label, code: coupon.code };
};

// §11.3 — booking time windows, sized to the total estimated duration of the
// selected services, generated from the shop's hours for that weekday.
// Returns [{ start: "08:00", end: "09:15", label: "8:00 – 9:15 AM" }, ...].
util.generateTimeWindows = (dateStr, totalMinutes) => {
  if (!dateStr || !totalMinutes) return [];
  const settings = db.settings();
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(dateStr + 'T00:00:00').getDay()];
  const hours = (settings.hours || {})[weekday];
  if (!hours || hours.closed) return [];

  const toMin = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const fromMin = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

  const open = toMin(hours.open);
  const close = toMin(hours.close);
  const windows = [];
  for (let start = open; start + totalMinutes <= close; start += 30) {
    const end = start + totalMinutes;
    windows.push({ start: fromMin(start), end: fromMin(end), label: `${util.fmtTime(fromMin(start))} – ${util.fmtTime(fromMin(end))}` });
  }
  return windows;
};

// ---------------------------------------------------------------------------
// Aggregate computation (§10.1, §10.4, §10.6, §10.9, §10.10)
// ---------------------------------------------------------------------------
util.computeKPIs = () => {
  const settings = db.settings();
  const jobs = db.jobs();
  const todayJobs = jobs.filter((j) => util.isToday(j.createdAt));
  const billed = todayJobs.reduce((s, j) => s + (j.billedHours || 0), 0);
  const cap = settings.capacityHours || 0;
  const pct = cap ? Math.round((billed / cap) * 100) : 0;

  const invoices = db.invoices();
  const paidToday = invoices.reduce(
    (s, inv) => s + (inv.payments || []).filter((p) => util.isToday(p.date)).reduce((a, p) => a + p.amount, 0),
    0
  );
  const invoicedToday = invoices.filter((i) => util.isToday(i.issuedAt)).reduce((s, i) => s + i.total, 0);

  const readyNotInvoiced = jobs.filter((j) => j.status === 'ready' && !j.invoiceId);
  const outstanding = readyNotInvoiced.reduce((s, j) => s + j.total, 0);

  const open = db.openJobs();
  // "Cars in Shop (WIP)" on the dashboard means anything physically on premises
  // today (waiting + in_progress + on_hold), not just in_progress — §11.1's stat
  // card reads as a shop-floor count, broader than §10.1's literal "WIP = in_progress".
  const wip = db.activeJobs();

  const aro = util.periodStats('today').aro;

  return {
    billed,
    capacity: cap,
    billedPct: pct,
    collectedToday: paidToday,
    invoicedToday,
    outstanding,
    outstandingCount: readyNotInvoiced.length,
    openJobsCount: open.length,
    wipCount: wip.length,
    jobsToday: todayJobs.length,
    jobsTodayOpen: todayJobs.filter((j) => ['scheduled', 'waiting', 'in_progress', 'on_hold'].includes(j.status)).length,
    jobsTodayDone: todayJobs.filter((j) => ['ready', 'closed', 'invoiced'].includes(j.status)).length,
    aro,
    aroTarget: settings.aroTarget || 0,
  };
};

util.computeFlags = () => {
  const flags = [];
  const jobs = db.jobs();

  const readyNotInvoiced = jobs.filter((j) => j.status === 'ready' && !j.invoiceId);
  if (readyNotInvoiced.length) {
    const total = readyNotInvoiced.reduce((s, j) => s + j.total, 0);
    flags.push({
      level: 'red',
      icon: 'invoice',
      title: `${readyNotInvoiced.length} completed job${readyNotInvoiced.length > 1 ? 's' : ''} not invoiced`,
      sub: `${util.fmtMoney0(total)} waiting to be billed`,
      href: '#repair-orders',
      roIds: readyNotInvoiced.map((j) => j.id),
    });
  }

  const overEstimate = jobs.filter((j) => j.status === 'in_progress' && j.billedHours > j.estHours);
  overEstimate.forEach((j) => {
    const overMin = Math.round((j.billedHours - j.estHours) * 60);
    flags.push({
      level: 'red',
      icon: 'clock',
      title: `${util.vehicleLabel(db.vehicleById(j.vehicleId))} past estimate ${overMin} min`,
      sub: `${j.bayId ? db.bayById(j.bayId)?.name + ' • ' : ''}${db.techById(j.techId)?.firstName || ''}`,
      href: `#repair-orders/${j.id}`,
      roIds: [j.id],
    });
  });

  const approvalStalled = jobs.filter((j) => j.status === 'on_hold' && j.approvalStatus === 'pending');
  approvalStalled.forEach((j) => {
    const v = db.vehicleById(j.vehicleId);
    flags.push({
      level: 'amber',
      icon: 'part',
      title: j.holdReason === 'parts_ordered' ? 'Parts not arrived' : 'Approval pending',
      sub: `${v?.make || ''} ${v?.model || ''} • ${j.ro}`,
      href: `#repair-orders/${j.id}`,
      roIds: [j.id],
    });
  });

  const tomorrow = util.tomorrowPreview();
  if (tomorrow.overCapacity) {
    flags.push({
      level: 'red',
      icon: 'calendar',
      title: 'Tomorrow over capacity',
      sub: `${tomorrow.appts} jobs booked • ${round2(tomorrow.estHours - tomorrow.capacity)} hrs over`,
      href: '#appointments',
      roIds: [],
    });
  }

  if (db.lowStockParts().length) {
    flags.push({
      level: 'amber',
      icon: 'inventory',
      title: `${db.lowStockParts().length} part${db.lowStockParts().length > 1 ? 's' : ''} low on stock`,
      sub: db.lowStockParts().map((p) => p.name).join(', '),
      href: '#inventory',
      roIds: [],
    });
  }

  const COMEBACK_WINDOW_DAYS = 14;
  jobs
    .filter((j) => util.isToday(j.createdAt))
    .forEach((j) => {
      const priorClosed = jobs.filter(
        (other) =>
          other.id !== j.id &&
          other.vehicleId === j.vehicleId &&
          other.status === 'closed' &&
          other.completedAt &&
          (Date.now() - new Date(other.completedAt).getTime()) / 86400000 <= COMEBACK_WINDOW_DAYS
      );
      if (priorClosed.length && j.isComeback) {
        const v = db.vehicleById(j.vehicleId);
        flags.push({
          level: 'blue',
          icon: 'comeback',
          title: '1 comeback opened today',
          sub: `${util.vehicleLabel(v)} • ${j.ro}`,
          href: `#repair-orders/${j.id}`,
          roIds: [j.id],
        });
      }
    });

  return flags;
};

util.utilization = () => {
  const settings = db.settings();
  const capacity = settings.capacityHours || 0;
  const bookedHours = db.activeJobs().reduce((s, j) => s + (j.estHours || 0), 0);
  const pct = capacity ? Math.min(bookedHours / capacity, 1.2) : 0;
  return { bookedHours, capacity, pct };
};

util.tomorrowPreview = () => {
  const settings = db.settings();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const jobs = db.jobs().filter((j) => j.scheduledDate === tomorrowStr);
  const estHours = round2(jobs.reduce((s, j) => s + (j.estHours || 0), 0));
  const capacity = settings.capacityHours || 0;
  return { appts: jobs.length, estHours, capacity, overCapacity: estHours > capacity };
};

util.periodStats = (period) => {
  const invoices = db.invoices();
  const pred = period === 'week' ? util.isThisWeek : period === 'month' ? util.isThisMonth : util.isToday;
  const inPeriod = invoices.filter((i) => pred(i.issuedAt));
  const collected = inPeriod.reduce(
    (s, inv) => s + (inv.payments || []).filter((p) => pred(p.date)).reduce((a, p) => a + p.amount, 0),
    0
  );
  const invoiced = inPeriod.reduce((s, i) => s + i.total, 0);
  const aro = inPeriod.length ? round2(invoiced / inPeriod.length) : 0;
  return { collected, invoiced, count: inPeriod.length, aro };
};

util.techLoad = (techId) => db.activeJobs().filter((j) => j.techId === techId).length;

util.techStats = (techId) => {
  const jobs = db.jobs().filter((j) => j.techId === techId);
  const todayJobs = jobs.filter((j) => util.isToday(j.createdAt) || util.isToday(j.completedAt));
  const billedHoursToday = todayJobs.reduce((s, j) => s + (j.billedHours || 0), 0);
  const revenueToday = todayJobs
    .filter((j) => ['closed', 'invoiced', 'ready'].includes(j.status))
    .reduce((s, j) => s + (j.total || 0), 0);
  const activeJobs = jobs.filter((j) => ['waiting', 'in_progress', 'on_hold'].includes(j.status)).length;
  const tech = db.techById(techId);
  const status = tech?.workStatus
    ? tech.workStatus.charAt(0).toUpperCase() + tech.workStatus.slice(1)
    : activeJobs > 0
      ? 'Working'
      : 'Idle';
  const comebacksThisWeek = jobs.filter((j) => j.isComeback && util.isThisWeek(j.createdAt)).length;
  // Real efficiency (billed ÷ clocked hours) needs TimeClockEvent/Timecard data,
  // which doesn't exist until TeamOps (Part B) is built — null rather than a
  // fabricated number until then.
  const efficiencyPct = null;
  return { billedHoursToday, revenueToday, activeJobs, status, comebacksThisWeek, efficiencyPct };
};

util.coachingInsights = () => {
  const insights = [];
  const kpis = util.computeKPIs();
  const hour = new Date().getHours();
  const expectedByNow = kpis.capacity * Math.min(1, Math.max(0, (hour - 8) / 9.5));
  if (expectedByNow - kpis.billed > 1) {
    const behind = round2(expectedByNow - kpis.billed);
    const techs = db.techs().filter((t) => t.workStatus === 'working');
    insights.push({
      icon: 'clock',
      title: `Team is ${behind} billed hrs behind pace`,
      body: techs.length ? `each active tech needs ${round2(behind / techs.length)} more hrs before close.` : '',
    });
  }
  const idleTech = db.techs().find((t) => t.workStatus === 'idle' && util.techLoad(t.id) === 0);
  const waitingCount = db.jobs().filter((j) => j.status === 'waiting').length;
  if (idleTech && waitingCount > 0) {
    insights.push({
      icon: 'idle',
      title: `${idleTech.firstName} has been idle while ${waitingCount} job${waitingCount > 1 ? 's are' : ' is'} waiting`,
      body: 'Assign a waiting job or check for blockers.',
    });
  }
  const onHoldParts = db.jobs().filter((j) => j.status === 'on_hold' && j.holdReason === 'parts_ordered');
  if (onHoldParts.length) {
    const v = db.vehicleById(onHoldParts[0].vehicleId);
    insights.push({
      icon: 'part',
      title: `${util.vehicleLabel(v)} is delayed on parts`,
      body: 'Check ETA or offer a loaner/reschedule.',
    });
  }
  const comebackTechs = new Set(
    db.jobs().filter((j) => j.isComeback && util.isThisWeek(j.createdAt)).map((j) => j.techId)
  );
  comebackTechs.forEach((techId) => {
    const tech = db.techById(techId);
    if (tech) {
      insights.push({
        icon: 'quality',
        title: `${tech.firstName} has a comeback flag this week`,
        body: 'Review the job for a quality follow-up.',
      });
    }
  });
  return insights;
};

util.sparkline = (values, w = 80, h = 24) => {
  if (!values || !values.length) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1 || 1);
  const points = values.map((v, i) => [round2(i * step), round2(h - ((v - min) / range) * h)]);
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
};

// ---------------------------------------------------------------------------
// §9 — Repair Order lifecycle transitions (the only functions allowed to set
// ro.status). Each loads from db, validates precondition, mutates, saves.
// ---------------------------------------------------------------------------
function findOrCreateCustomer(customerInfo) {
  const customers = db.customers();
  const [firstName, ...rest] = (customerInfo.name || '').split(' ');
  const lastName = rest.join(' ');
  let customer = customers.find((c) => c.phone === customerInfo.phone || c.email === customerInfo.email);
  if (!customer) {
    customer = {
      id: db.nextId('c'),
      firstName: firstName || customerInfo.name || '',
      lastName: lastName || '',
      phone: customerInfo.phone || '',
      email: customerInfo.email || '',
      createdAt: new Date().toISOString(),
    };
    customers.push(customer);
    db.saveCustomers(customers);
  }
  return customer;
}

function findOrCreateVehicle(customerId, vehicleInfo) {
  const vehicles = db.vehicles();
  let vehicle = vehicles.find(
    (v) =>
      (vehicleInfo.vin && v.vin === vehicleInfo.vin) ||
      (v.customerId === customerId &&
        v.year === vehicleInfo.year &&
        v.make === vehicleInfo.make &&
        v.model === vehicleInfo.model)
  );
  if (!vehicle) {
    vehicle = {
      id: db.nextId('v'),
      customerId,
      year: vehicleInfo.year,
      make: vehicleInfo.make,
      model: vehicleInfo.model,
      mileage: vehicleInfo.mileage || 0,
      vin: vehicleInfo.vin || '',
    };
    vehicles.push(vehicle);
    db.saveVehicles(vehicles);
  }
  return vehicle;
}

// Direct customer creation for UI flows that need one on the spot (e.g. the
// Quote Builder's "+ New Customer" option) without going through a Booking
// or Lead. Reuses the exact same upsert helpers booking/lead conversion use,
// so it never creates a duplicate of an existing phone/email match.
util.createCustomer = ({ firstName, lastName, phone, email }, vehicleInfo) => {
  const customer = findOrCreateCustomer({ name: `${firstName} ${lastName}`.trim(), phone, email });
  let vehicle = null;
  if (vehicleInfo?.make && vehicleInfo?.model) {
    vehicle = findOrCreateVehicle(customer.id, vehicleInfo);
  }
  return { customer, vehicle };
};

// §C — CRM Lead → Customer conversion. MVP simplification: this is the ONLY
// path that creates a Customer from a Lead. Public booking requests never
// touch Lead records — they upsert the Customer directly at submission (see
// util.submitBooking below) because that flow is already tested end-to-end.
// Leads exist for non-booked prospects (phone/walk-in/web-form/campaign) that
// an advisor is manually working toward a first visit.
util.convertLead = (leadId) => {
  const leads = db.leads();
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);
  if (lead.status === 'converted') throw new Error('Lead is already converted.');

  const customer = findOrCreateCustomer({ name: `${lead.firstName} ${lead.lastName}`, phone: lead.phone, email: lead.email });
  let vehicle = null;
  if (lead.vehicle?.make && lead.vehicle?.model) {
    vehicle = findOrCreateVehicle(customer.id, lead.vehicle);
  }

  lead.status = 'converted';
  lead.customerId = customer.id;
  db.saveLeads(leads);

  return { customer, vehicle };
};

// §11.3 — public booking submission. Creates a pending Booking and upserts
// the customer/vehicle into the CRM immediately (the spec is explicit that
// this happens at submission, not just at confirmation) — but does NOT create
// a RepairOrder; that only happens when the shop confirms (§11.5/confirmBooking).
util.submitBooking = ({ serviceIds, preferredDate, preferredSlot, customer, vehicle, couponCode, notes }) => {
  const c = findOrCreateCustomer(customer);
  const v = findOrCreateVehicle(c.id, vehicle);

  const booking = {
    id: db.nextId('bk'),
    status: 'pending',
    customer: { name: util.customerName(c), phone: c.phone, email: c.email },
    vehicle: { year: v.year, make: v.make, model: v.model, mileage: v.mileage, vin: v.vin, visitType: vehicle.visitType || 'drop_off' },
    customerId: c.id,
    vehicleId: v.id,
    serviceIds: serviceIds || [],
    preferredDate,
    preferredSlot,
    couponCode: couponCode || '',
    notes: notes || '',
    submittedAt: new Date().toISOString(),
    roId: null,
  };
  const bookings = db.bookings();
  bookings.push(booking);
  db.saveBookings(bookings);
  return booking;
};

util.confirmBooking = (bookingId, opts = {}) => {
  const bookings = db.bookings();
  const booking = bookings.find((b) => b.id === bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const customer = findOrCreateCustomer(booking.customer);
  const vehicle = findOrCreateVehicle(customer.id, booking.vehicle);

  const services = db.services();
  const lineItems = (booking.serviceIds || []).map((sid, i) => {
    const svc = services.find((s) => s.id === sid);
    return {
      id: `li_${i}_${Date.now()}`,
      type: 'service',
      refId: sid,
      name: svc?.name || 'Service',
      qty: 1,
      unitPrice: svc?.basePrice || 0,
      hours: svc?.baseHours || 0,
    };
  });

  const jobs = db.jobs();
  const ro = util.recalcRO({
    id: db.nextId('j'),
    ro: db.nextRO(),
    customerId: customer.id,
    vehicleId: vehicle.id,
    status: 'scheduled',
    source: 'booking',
    bookingId: booking.id,
    techId: opts.techId || null,
    bayId: opts.bayId || null,
    advisorId: opts.advisorId || null,
    createdById: db.settings().currentUserId || null,
    confirmedById: db.settings().currentUserId || null,
    scheduledDate: booking.preferredDate,
    scheduledTime: /^\d{2}:\d{2}$/.test(booking.preferredSlot) ? booking.preferredSlot : null,
    visitType: booking.vehicle?.visitType || 'drop_off',
    lineItems,
    discount: 0,
    notes: booking.notes || '',
    createdAt: new Date().toISOString(),
  });
  jobs.push(ro);
  db.saveJobs(jobs);

  booking.status = 'confirmed';
  booking.roId = ro.id;
  db.saveBookings(bookings);

  return ro;
};

util.declineBooking = (bookingId) => {
  const bookings = db.bookings();
  const booking = bookings.find((b) => b.id === bookingId);
  if (!booking) throw new Error(`Booking ${bookingId} not found`);
  booking.status = 'declined';
  db.saveBookings(bookings);
  return booking;
};

function requireStatus(ro, allowed) {
  if (!allowed.includes(ro.status)) {
    throw new Error(`RO ${ro.ro} is ${ro.status}, expected one of: ${allowed.join(', ')}`);
  }
}

function saveJob(ro) {
  const jobs = db.jobs();
  const idx = jobs.findIndex((j) => j.id === ro.id);
  if (idx === -1) jobs.push(ro);
  else jobs[idx] = ro;
  db.saveJobs(jobs);
  return ro;
}

util.checkIn = (roId) => {
  const ro = db.jobById(roId);
  requireStatus(ro, ['scheduled']);
  ro.status = 'waiting';
  ro.checkedInAt = new Date().toISOString();
  return saveJob(ro);
};

util.startJob = (roId, bayId, techId) => {
  const ro = db.jobById(roId);
  requireStatus(ro, ['waiting', 'on_hold']);
  ro.status = 'in_progress';
  if (bayId) ro.bayId = bayId;
  if (techId) ro.techId = techId;
  if (!ro.startedAt) ro.startedAt = new Date().toISOString();
  if (techId) {
    const employees = db.employees();
    const tech = employees.find((e) => e.id === techId);
    if (tech) {
      tech.workStatus = 'working';
      db.saveEmployees(employees);
    }
  }
  return saveJob(ro);
};

// §11.6 Live Monitor — reassign an already-in-progress RO to a different
// bay (drag bay -> bay). Status is preserved; only the floor location (and,
// if the new bay has its own tech, the tech) changes — same "bay's tech
// takes over" convention startJob already uses.
util.moveToBay = (roId, bayId) => {
  const ro = db.jobById(roId);
  requireStatus(ro, ['in_progress']);
  ro.bayId = bayId;
  const bay = db.bayById(bayId);
  if (bay?.techId) ro.techId = bay.techId;
  return saveJob(ro);
};

// §11.6 Live Monitor — send an in-progress RO back to the waiting queue
// (drag bay -> waiting list). The reverse of startJob: clears bayId and
// reverts status to 'waiting', the same status startJob requires before a
// job can enter a bay. techId is intentionally left alone (don't lose the
// tech assignment) — only location and status move.
util.returnToWaiting = (roId) => {
  const ro = db.jobById(roId);
  requireStatus(ro, ['in_progress']);
  ro.status = 'waiting';
  ro.bayId = null;
  return saveJob(ro);
};

util.holdJob = (roId, reason) => {
  const ro = db.jobById(roId);
  requireStatus(ro, ['in_progress']);
  ro.status = 'on_hold';
  ro.holdReason = reason;
  ro.internalNotes = `${ro.internalNotes ? ro.internalNotes + '\n' : ''}${reason}`;
  return saveJob(ro);
};

util.resumeJob = (roId) => {
  const ro = db.jobById(roId);
  requireStatus(ro, ['on_hold']);
  ro.status = 'in_progress';
  return saveJob(ro);
};

util.markReady = (roId) => {
  const ro = db.jobById(roId);
  requireStatus(ro, ['in_progress']);
  ro.status = 'ready';
  ro.completedAt = new Date().toISOString();
  return saveJob(ro);
};

util.addLineItem = (roId, line) => {
  const ro = db.jobById(roId);
  const newLine = { id: db.nextId('li'), ...line };
  ro.lineItems = [...(ro.lineItems || []), newLine];
  if (line.type === 'part' && line.refId) db.adjustPartQty(line.refId, -(line.qty || 1));
  util.recalcRO(ro);
  return saveJob(ro);
};

util.removeLineItem = (roId, lineId) => {
  const ro = db.jobById(roId);
  const line = (ro.lineItems || []).find((l) => l.id === lineId);
  if (line && line.type === 'part' && line.refId) db.adjustPartQty(line.refId, line.qty || 1);
  ro.lineItems = (ro.lineItems || []).filter((l) => l.id !== lineId);
  util.recalcRO(ro);
  return saveJob(ro);
};

util.setDviItem = (roId, item, status, note) => {
  const ro = db.jobById(roId);
  ro.dvi = ro.dvi || [];
  const existing = ro.dvi.find((d) => d.item === item);
  if (existing) {
    existing.status = status;
    existing.note = note;
  } else {
    ro.dvi.push({ id: db.nextId('dvi'), category: item, item, status, note });
  }
  if (status === 'yellow' || status === 'red') {
    ro.recommended = ro.recommended || [];
    if (!ro.recommended.find((r) => r.name === item)) {
      ro.recommended.push({ name: item, price: 0, hours: 0 });
    }
  }
  return saveJob(ro);
};

util.requestApproval = (roId) => {
  const ro = db.jobById(roId);
  ro.approvalStatus = 'pending';
  return saveJob(ro);
};

util.resolveApproval = (roId, approved) => {
  const ro = db.jobById(roId);
  ro.approvalStatus = approved ? 'approved' : 'declined';
  if (approved && ro.recommended?.length) {
    const newLines = ro.recommended.map((r) => ({
      id: db.nextId('li'),
      type: 'service',
      name: r.name,
      qty: 1,
      unitPrice: r.price || 0,
      hours: r.hours || 0,
    }));
    ro.lineItems = [...(ro.lineItems || []), ...newLines];
    ro.recommended = [];
    util.recalcRO(ro);
  }
  return saveJob(ro);
};

util.createInvoiceFromRO = (roId) => {
  const ro = db.jobById(roId);
  requireStatus(ro, ['ready']);
  if (!ro.lineItems?.length) throw new Error('Cannot invoice an RO with no line items');
  const issuedAt = new Date().toISOString();
  const dueAt = new Date(Date.now() + 14 * 86400000).toISOString();
  const invoice = {
    id: db.nextId('inv'),
    number: db.nextInvoiceNumber(),
    roId: ro.id,
    customerId: ro.customerId,
    vehicleId: ro.vehicleId,
    lineItems: ro.lineItems,
    discount: ro.discount || 0,
    subtotal: ro.subtotal,
    tax: ro.tax,
    total: ro.total,
    status: 'sent',
    payments: [],
    amountPaid: 0,
    balance: ro.total,
    issuedAt,
    dueAt,
  };
  const invoices = db.invoices();
  invoices.push(invoice);
  db.saveInvoices(invoices);

  ro.status = 'invoiced';
  ro.invoiceId = invoice.id;
  saveJob(ro);

  return invoice;
};

util.recordPayment = (invoiceId, amount, method) => {
  const invoices = db.invoices();
  const invoice = invoices.find((i) => i.id === invoiceId);
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
  invoice.payments = invoice.payments || [];
  invoice.payments.push({ id: db.nextId('pay'), amount, method, date: new Date().toISOString() });
  invoice.amountPaid = round2(invoice.payments.reduce((s, p) => s + p.amount, 0));
  invoice.balance = round2(invoice.total - invoice.amountPaid);
  invoice.status = invoice.balance <= 0 ? 'paid' : 'partial';
  if (invoice.status === 'paid') invoice.paidAt = new Date().toISOString();
  db.saveInvoices(invoices);

  if (invoice.status === 'paid' && invoice.roId) {
    const ro = db.jobById(invoice.roId);
    if (ro) {
      ro.status = 'closed';
      saveJob(ro);
    }
  }
  return invoice;
};

util.cancelRO = (roId) => {
  const ro = db.jobById(roId);
  if (ro.status === 'closed') throw new Error('Cannot cancel a closed RO');
  (ro.lineItems || []).filter((l) => l.type === 'part' && l.refId).forEach((l) => db.adjustPartQty(l.refId, l.qty || 1));
  ro.status = 'cancelled';
  return saveJob(ro);
};

// ---------------------------------------------------------------------------
// Quote / Estimate system (Phase 1). Quotes are a separate entity from
// RepairOrder — they never touch ro.status, and the only path from a Quote
// to an RO is util.convertQuoteToRO below, which is the ONLY place quote
// line items become RO line items. Booking/CRM/invoice flows are untouched.
// ---------------------------------------------------------------------------
function saveQuote(q) {
  const quotes = db.quotes();
  const idx = quotes.findIndex((x) => x.id === q.id);
  if (idx === -1) quotes.push(q);
  else quotes[idx] = q;
  db.saveQuotes(quotes);
  return q;
}

function requireQuoteStatus(q, allowed) {
  if (!allowed.includes(q.status)) {
    throw new Error(`Quote ${q.quoteNumber} is ${q.status}, expected one of: ${allowed.join(', ')}`);
  }
}

// A line's total is always computed, never stored as truth — same rule as
// RO line items. 'labor' bills hours × that line's own laborRate (falls back
// to the shop default); everything else bills qty × unitPrice. 'discount'
// lines are still computed this way but their amount is subtracted in
// util.recalcQuote rather than added to the taxable subtotal.
util.quoteLineTotal = (line) => {
  const shopLaborRate = db.settings().laborRate || 120;
  if (line.type === 'labor') return round2((line.hours || 0) * (line.laborRate || shopLaborRate));
  return round2((line.qty || 0) * (line.unitPrice || 0));
};

// Recomputes subtotal/discountTotal/taxTotal/total from line items — same
// convention as RO totals: the quote-level total is the full quoted amount
// regardless of each line's approve/decline status (status governs which
// lines convert to a real RO later, in util.convertQuoteToRO, not whether
// they count toward what was quoted — otherwise "Declined Revenue" reporting
// would always read zero). 'discount' lines are summed separately and
// subtracted rather than added to the subtotal.
util.recalcQuote = (q) => {
  const taxRate = db.settings().taxRate || 0;
  q.lineItems = (q.lineItems || []).map((l) => ({ ...l, total: util.quoteLineTotal(l) }));
  const billable = q.lineItems.filter((l) => l.type !== 'discount');
  const discounts = q.lineItems.filter((l) => l.type === 'discount');
  q.subtotal = round2(billable.reduce((s, l) => s + l.total, 0));
  q.discountTotal = round2(discounts.reduce((s, l) => s + Math.abs(l.total), 0));
  const taxableSubtotal = round2(billable.filter((l) => l.taxable !== false).reduce((s, l) => s + l.total, 0));
  const taxableAmt = Math.max(taxableSubtotal - q.discountTotal, 0);
  q.taxTotal = round2(taxableAmt * taxRate);
  q.total = round2(Math.max(q.subtotal - q.discountTotal, 0) + q.taxTotal);
  q.updatedAt = new Date().toISOString();
  return q;
};

// Real-only sum: total of line items with status 'approved' across a quote
// (used by the approval drawer/partial-approval preview and conversion).
util.quoteApprovedTotal = (q) => round2((q.lineItems || []).filter((l) => l.status === 'approved').reduce((s, l) => s + util.quoteLineTotal(l), 0));

util.createQuote = (data) => {
  const quotes = db.quotes();
  const id = db.nextId('q');
  const q = util.recalcQuote({
    id,
    quoteNumber: db.nextQuoteNumber(),
    customerId: data.customerId,
    vehicleId: data.vehicleId,
    bookingId: data.bookingId || null,
    roId: null,
    title: data.title || 'New Quote',
    concern: data.concern || '',
    diagnosisNotes: data.diagnosisNotes || '',
    status: 'draft',
    priority: data.priority || 'normal',
    validUntil: data.validUntil || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sentAt: null, approvedAt: null, declinedAt: null, convertedAt: null,
    advisorId: data.advisorId || db.settings().currentUserId || null,
    techId: data.techId || null,
    internalNotes: data.internalNotes || '',
    customerNotes: data.customerNotes || '',
    approvalToken: null,
    source: data.source || 'manual',
    lineItems: (data.lineItems || []).map((l, i) => ({ id: db.nextId('qli'), quoteId: id, status: 'recommended', taxable: true, source: 'manual', ...l })),
  });
  quotes.push(q);
  db.saveQuotes(quotes);
  return q;
};

util.addQuoteLineItem = (quoteId, line) => {
  const q = db.quoteById(quoteId);
  q.lineItems = [...(q.lineItems || []), { id: db.nextId('qli'), quoteId, status: 'recommended', taxable: true, source: 'manual', ...line }];
  util.recalcQuote(q);
  return saveQuote(q);
};

util.removeQuoteLineItem = (quoteId, lineId) => {
  const q = db.quoteById(quoteId);
  q.lineItems = (q.lineItems || []).filter((l) => l.id !== lineId);
  util.recalcQuote(q);
  return saveQuote(q);
};

util.setQuoteLineItemStatus = (quoteId, lineId, status) => {
  const q = db.quoteById(quoteId);
  const line = (q.lineItems || []).find((l) => l.id === lineId);
  if (line) line.status = status;
  util.recalcQuote(q);
  return saveQuote(q);
};

util.markQuoteReadyToSend = (quoteId) => {
  const q = db.quoteById(quoteId);
  requireQuoteStatus(q, ['draft', 'review_required']);
  if (!q.lineItems?.length) throw new Error('Add at least one line item before marking a quote ready to send.');
  q.status = 'ready_to_send';
  q.updatedAt = new Date().toISOString();
  return saveQuote(q);
};

// Placeholder — no real email/SMS pipeline exists yet (Phase 2). Just moves
// the status forward and stamps sentAt/an approvalToken for the customer
// approval-view placeholder to reference.
util.sendQuote = (quoteId) => {
  const q = db.quoteById(quoteId);
  requireQuoteStatus(q, ['draft', 'review_required', 'ready_to_send']);
  q.status = 'sent';
  q.sentAt = new Date().toISOString();
  q.approvalToken = q.approvalToken || db.nextId('tok');
  q.updatedAt = q.sentAt;
  return saveQuote(q);
};

util.markQuoteViewed = (quoteId) => {
  const q = db.quoteById(quoteId);
  requireQuoteStatus(q, ['sent']);
  q.status = 'viewed';
  q.updatedAt = new Date().toISOString();
  return saveQuote(q);
};

// Full approval: every non-declined line becomes 'approved'.
util.approveQuote = (quoteId) => {
  const q = db.quoteById(quoteId);
  requireQuoteStatus(q, ['sent', 'viewed']);
  q.lineItems.forEach((l) => { if (l.status !== 'declined') l.status = 'approved'; });
  q.status = 'approved';
  q.approvedAt = new Date().toISOString();
  util.recalcQuote(q);
  return saveQuote(q);
};

// Partial approval: caller supplies exactly which line ids the customer
// approved; everything else (still required, optional, etc.) is left as a
// declined recommendation so it stays visible as future work.
util.partiallyApproveQuote = (quoteId, approvedLineIds) => {
  const q = db.quoteById(quoteId);
  requireQuoteStatus(q, ['sent', 'viewed']);
  const approvedSet = new Set(approvedLineIds);
  q.lineItems.forEach((l) => { l.status = approvedSet.has(l.id) ? 'approved' : 'declined'; });
  q.status = 'partially_approved';
  q.approvedAt = new Date().toISOString();
  util.recalcQuote(q);
  return saveQuote(q);
};

util.declineQuote = (quoteId, reason) => {
  const q = db.quoteById(quoteId);
  requireQuoteStatus(q, ['sent', 'viewed']);
  q.lineItems.forEach((l) => { l.status = 'declined'; });
  q.status = 'declined';
  q.declinedAt = new Date().toISOString();
  if (reason) q.customerNotes = reason;
  util.recalcQuote(q);
  return saveQuote(q);
};

// Real (not a placeholder), but simple: any sent/viewed quote past its
// validUntil date is expired. No cron exists in this MVP, so this is called
// opportunistically (e.g. when the Quotes dashboard loads) rather than on a
// schedule — see CLAUDE.md Phase 2 for real expiration automation.
util.autoExpireQuotes = () => {
  const quotes = db.quotes();
  const today = new Date().toISOString().slice(0, 10);
  let changed = false;
  quotes.forEach((q) => {
    if (['sent', 'viewed'].includes(q.status) && q.validUntil && q.validUntil < today) {
      q.status = 'expired';
      q.updatedAt = new Date().toISOString();
      changed = true;
    }
  });
  if (changed) db.saveQuotes(quotes);
  return quotes;
};

// Converts an approved/partially-approved quote into a real RepairOrder.
// Guards: a quote can only be converted once (q.roId is the duplicate guard —
// checked first, before anything else happens), and only 'approved' line
// items are copied as billable RO work. Declined/optional lines are NOT
// copied — they're attached to the new RO's `recommended` list instead (the
// same field util.setDviItem/resolveApproval already use for future-work
// recommendations), so they stay visible without inflating the RO total.
// Part-type approved lines reduce inventory here — the same point an RO
// would normally gain that line item — never earlier, per the no-reserve-
// until-approved rule.
util.convertQuoteToRO = (quoteId, opts = {}) => {
  const q = db.quoteById(quoteId);
  if (!q) throw new Error(`Quote ${quoteId} not found`);
  if (q.roId) throw new Error(`Quote ${q.quoteNumber} was already converted to ${db.jobById(q.roId)?.ro || q.roId}.`);
  requireQuoteStatus(q, ['approved', 'partially_approved']);

  const approvedLines = q.lineItems.filter((l) => l.status === 'approved');
  if (!approvedLines.length) throw new Error('No approved line items to convert.');
  const otherLines = q.lineItems.filter((l) => l.status !== 'approved');

  const lineItems = approvedLines.map((l, i) => {
    const roType = l.type === 'labor' ? 'labor' : (l.partId || l.type === 'parts' || l.type === 'tires' || l.type === 'fluids') ? 'part' : 'service';
    if (roType === 'part' && (l.partId || l.refId)) db.adjustPartQty(l.partId || l.refId, -(l.qty || 1));
    return { id: db.nextId('li'), type: roType, refId: l.partId || l.refId || null, name: l.name, qty: l.qty || 1, unitPrice: l.unitPrice || 0, hours: l.hours || 0 };
  });

  const jobs = db.jobs();
  const ro = util.recalcRO({
    id: db.nextId('j'),
    ro: db.nextRO(),
    customerId: q.customerId,
    vehicleId: q.vehicleId,
    status: 'scheduled',
    source: 'quote',
    quoteId: q.id,
    bookingId: q.bookingId || null,
    techId: q.techId || opts.techId || null,
    bayId: opts.bayId || null,
    advisorId: q.advisorId || null,
    createdById: db.settings().currentUserId || null,
    confirmedById: db.settings().currentUserId || null,
    scheduledDate: opts.scheduledDate || null,
    scheduledTime: opts.scheduledTime || null,
    visitType: opts.visitType || 'drop_off',
    lineItems,
    discount: q.discountTotal || 0,
    notes: q.customerNotes || '',
    internalNotes: q.internalNotes || '',
    recommended: otherLines.map((l) => ({ name: l.name, price: l.unitPrice || 0, hours: l.hours || 0 })),
    createdAt: new Date().toISOString(),
  });
  jobs.push(ro);
  db.saveJobs(jobs);

  q.status = 'converted';
  q.roId = ro.id;
  q.convertedAt = new Date().toISOString();
  q.updatedAt = q.convertedAt;
  saveQuote(q);

  return ro;
};

// §6 — auto quote suggestions. Each template references real seeded
// services/parts ids; estimatedTotal is always computed from those lines via
// util.quoteLineTotal, never hardcoded. This is a structured demo foundation
// only — see CLAUDE.md Phase 2 for real labor-guide/distributor integration.
const QUOTE_TEMPLATES = [
  { id: 'tpl_oil', name: 'Oil Change', notes: 'Standard synthetic oil change.', lines: [
    { type: 'service', refId: 's_oil', name: 'Oil Change', qty: 1, unitPrice: 59.99, hours: 0.5 },
  ] },
  { id: 'tpl_brake', name: 'Brake Pad/Rotor Service', notes: 'Assumes front pads + rotors; rear axle not included.', lines: [
    { type: 'service', refId: 's_brake_pad', name: 'Brake Pad Replacement', qty: 1, unitPrice: 199.99, hours: 1.5 },
    { type: 'parts', refId: 'p_pads_front', partId: 'p_pads_front', name: 'Brake Pads — Front Set', qty: 1, unitPrice: 59.99 },
    { type: 'parts', refId: 'p_rotors', partId: 'p_rotors', name: 'Rotors (pair)', qty: 1, unitPrice: 99.99 },
  ] },
  { id: 'tpl_battery', name: 'Battery Replacement', notes: 'Group 35 battery — confirm fitment by VIN before sending.', lines: [
    { type: 'service', refId: 's_battery', name: 'Battery', qty: 1, unitPrice: 179.99, hours: 0.5 },
    { type: 'parts', refId: 'p_battery', partId: 'p_battery', name: 'Battery (Group 35)', qty: 1, unitPrice: 139.99 },
  ] },
  { id: 'tpl_tires', name: 'Tire Install (set of 4)', notes: 'Mount/balance only — tire cost itself is not in the seeded parts catalog yet.', lines: [
    { type: 'service', refId: 's_tires', name: 'Tires (mount/balance, 4)', qty: 4, unitPrice: 129.99, hours: 1 },
    { type: 'parts', refId: 'p_lugnuts', partId: 'p_lugnuts', name: 'Lug Nuts (set)', qty: 1, unitPrice: 14.99 },
  ] },
  { id: 'tpl_align', name: 'Alignment', notes: 'Standalone 4-wheel alignment.', lines: [
    { type: 'service', refId: 's_align', name: 'Alignment', qty: 1, unitPrice: 89.99, hours: 1 },
  ] },
  { id: 'tpl_diag', name: 'Diagnostic', notes: 'Diagnostic charge only — repair lines added after the cause is found.', lines: [
    { type: 'diagnostic', refId: 's_eng_diag', name: 'Engine Diagnostic', qty: 1, unitPrice: 99.99, hours: 1 },
  ] },
  { id: 'tpl_wipers', name: 'Wiper Blades', notes: 'Front pair only.', lines: [
    { type: 'parts', refId: 'p_wipers', partId: 'p_wipers', name: 'Wiper Blades (pair)', qty: 1, unitPrice: 19.99 },
  ] },
  { id: 'tpl_coolant', name: 'Coolant Service', notes: 'Flush + refill, no thermostat included.', lines: [
    { type: 'service', refId: 's_coolant', name: 'Coolant Flush', qty: 1, unitPrice: 119.99, hours: 1 },
    { type: 'fluids', refId: 'p_coolant', partId: 'p_coolant', name: 'Coolant (1gal)', qty: 1, unitPrice: 21.99 },
  ] },
  { id: 'tpl_tuneup', name: 'Tune-Up', notes: 'Spark plugs bundled in; assumes 4-cylinder.', lines: [
    { type: 'service', refId: 's_tuneup', name: 'Tune-up', qty: 1, unitPrice: 189.99, hours: 1.5 },
    { type: 'parts', refId: 'p_sparkplugs', partId: 'p_sparkplugs', name: 'Spark Plugs (set of 4)', qty: 1, unitPrice: 44.99 },
  ] },
];

util.quoteTemplates = () => QUOTE_TEMPLATES.map((t) => ({
  ...t,
  estimatedTotal: round2(t.lines.reduce((s, l) => s + util.quoteLineTotal(l), 0)),
}));

// §6 vehicle/service-matching placeholder — simple, documented heuristics
// only (no labor-guide/VIN-decode integration yet). Suggests templates based
// on: vehicle due-for-service status, the customer's declined-service
// history, and (very roughly) keyword matches against a typed concern.
util.suggestTemplatesFor = ({ vehicleId, customerId, concern } = {}) => {
  const suggestions = [];
  const templates = util.quoteTemplates();
  const byId = (id) => templates.find((t) => t.id === id);

  if (vehicleId) {
    if (isDueForServiceLocal(vehicleId, 's_oil', 150)) suggestions.push({ template: byId('tpl_oil'), reason: 'Due for an oil change' });
    if (isDueForServiceLocal(vehicleId, 's_rotate', 180)) suggestions.push({ template: byId('tpl_align'), reason: 'Due for tire service' });
  }
  if (customerId) {
    db.jobsForCustomer(customerId).filter((j) => j.approvalStatus === 'declined').forEach((j) => {
      const match = templates.find((t) => (j.lineItems || []).some((li) => li.refId === t.lines[0]?.refId));
      if (match) suggestions.push({ template: match, reason: `Previously declined: ${j.ro}` });
    });
  }
  if (concern) {
    const c = concern.toLowerCase();
    const KEYWORDS = { brake: 'tpl_brake', battery: 'tpl_battery', tire: 'tpl_tires', align: 'tpl_align', coolant: 'tpl_coolant', wiper: 'tpl_wipers', diagnos: 'tpl_diag', 'check engine': 'tpl_diag', tune: 'tpl_tuneup', oil: 'tpl_oil' };
    Object.entries(KEYWORDS).forEach(([kw, tplId]) => {
      if (c.includes(kw)) suggestions.push({ template: byId(tplId), reason: `Matches concern: "${kw}"` });
    });
  }
  const seen = new Set();
  return suggestions.filter((s) => s.template && !seen.has(s.template.id) && seen.add(s.template.id));
};

function isDueForServiceLocal(vehicleId, serviceId, intervalDays) {
  const jobs = db.jobsForVehicle(vehicleId).filter((j) => (j.lineItems || []).some((l) => l.refId === serviceId));
  if (!jobs.length) return true;
  const last = Math.max(...jobs.map((j) => new Date(j.createdAt).getTime()));
  return (Date.now() - last) / 86400000 > intervalDays;
}

// §12 — quote metrics (real where noted; close-rate/avg-approval-time are
// the only ones flagged placeholder because they need timestamps this MVP
// doesn't reliably have for every legacy seed quote).
util.quoteMetrics = () => {
  const quotes = db.quotes();
  const byStatus = (s) => quotes.filter((q) => q.status === s);
  const decided = quotes.filter((q) => ['approved', 'partially_approved', 'declined', 'converted'].includes(q.status));
  const approvedLike = quotes.filter((q) => ['approved', 'partially_approved', 'converted'].includes(q.status));
  const declined = byStatus('declined');
  const pending = quotes.filter((q) => ['sent', 'viewed'].includes(q.status));

  const sumTotal = (arr) => round2(arr.reduce((s, q) => s + (q.total || 0), 0));
  const closeRate = decided.length ? round2((approvedLike.length / decided.length) * 100) : 0;

  const byService = {};
  const byDeclinedService = {};
  quotes.forEach((q) => (q.lineItems || []).forEach((l) => {
    if (!l.name) return;
    byService[l.name] = (byService[l.name] || 0) + 1;
    if (l.status === 'declined') byDeclinedService[l.name] = (byDeclinedService[l.name] || 0) + 1;
  }));
  const topEntries = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));

  const byAdvisor = {};
  quotes.forEach((q) => { const id = q.advisorId || 'unassigned'; byAdvisor[id] = (byAdvisor[id] || 0) + 1; });
  const bySource = {};
  quotes.forEach((q) => { bySource[q.source] = (bySource[q.source] || 0) + 1; });

  return {
    total: quotes.length,
    draft: byStatus('draft').length,
    readyToSend: byStatus('ready_to_send').length,
    waitingApproval: pending.length,
    approved: byStatus('approved').length,
    partiallyApproved: byStatus('partially_approved').length,
    declined: declined.length,
    expired: byStatus('expired').length,
    converted: byStatus('converted').length,
    totalQuotedRevenue: sumTotal(quotes),
    approvedQuotedRevenue: sumTotal(approvedLike),
    declinedQuotedRevenue: sumTotal(declined),
    pendingApprovalRevenue: sumTotal(pending),
    avgQuoteValue: quotes.length ? round2(sumTotal(quotes) / quotes.length) : 0,
    closeRate,
    mostQuotedServices: topEntries(byService, 5),
    mostDeclinedServices: topEntries(byDeclinedService, 5),
    byAdvisor: Object.entries(byAdvisor).map(([advisorId, count]) => ({ advisorId, count })),
    bySource: Object.entries(bySource).map(([source, count]) => ({ source, count })),
  };
};

// §C CRM connection — quotes waiting on a customer response, surfaced for the
// CRM Follow-Up Center. Declined quotes are real follow-up candidates too
// (separate from the lead/segment-based ones CRM already computes).
util.quotesNeedingFollowUp = () => db.quotes().filter((q) => ['sent', 'viewed', 'declined'].includes(q.status));

// ---------------------------------------------------------------------------
// Platform / Phase E — SaaS signup foundation. This is the ONLY function
// that writes Account/Shop/Subscription/User/Membership/OnboardingProgress
// together (mirrors util.confirmBooking's "one real transaction" shape).
// It does NOT touch the operational `settings`/`customers`/`jobs`/... data —
// there is no real multi-tenant scoping in this MVP, so the new shop is a
// real platform-layer record but does not get its own isolated workspace.
// ---------------------------------------------------------------------------
util.featureFlagsForPlan = (planId) => db.planById(planId)?.features || {};

util.createSignupAccount = ({ owner, shop, planId, billingCycle, setup }) => {
  const plan = db.planById(planId);
  if (!plan) throw new Error(`Unknown plan ${planId}`);
  const now = new Date().toISOString();

  const account = { id: db.nextId('acct'), ownerName: owner.name, ownerEmail: owner.email, ownerPhone: owner.phone, createdAt: now };
  const accounts = db.accounts();
  accounts.push(account);
  db.saveAccounts(accounts);

  const user = { id: db.nextId('user'), accountId: account.id, name: owner.name, email: owner.email, phone: owner.phone, passwordPlaceholder: true, createdAt: now };
  const users = db.users();
  users.push(user);
  db.saveUsers(users);

  const shopRecord = {
    id: db.nextId('shop'), accountId: account.id, name: shop.name, address: shop.address, city: shop.city, state: shop.state, zip: shop.zip,
    phone: shop.phone, website: shop.website || '', timezone: shop.timezone || 'America/Chicago', bays: shop.bays || 1, techCount: shop.techCount || 1, createdAt: now,
  };
  const shops = db.shops();
  shops.push(shopRecord);
  db.saveShops(shops);

  const membership = { id: db.nextId('mem'), userId: user.id, shopId: shopRecord.id, role: 'owner', createdAt: now };
  const memberships = db.memberships();
  memberships.push(membership);
  db.saveMemberships(memberships);

  const trialDays = 14;
  const subscription = {
    id: db.nextId('sub'), accountId: account.id, shopId: shopRecord.id, planId: plan.id, status: 'trialing', billingCycle: billingCycle || 'monthly',
    trialEndsAt: new Date(Date.now() + trialDays * 86400000).toISOString(), currentPeriodStart: now.slice(0, 10), currentPeriodEnd: new Date(Date.now() + trialDays * 86400000).toISOString().slice(0, 10),
    seatsIncluded: plan.seatsIncluded, locationsIncluded: plan.locationsIncluded, stripeCustomerId: null, stripeSubscriptionId: null, createdAt: now,
  };
  const subscriptions = db.subscriptions();
  subscriptions.push(subscription);
  db.saveSubscriptions(subscriptions);

  const onboarding = {
    id: db.nextId('onb'), accountId: account.id, shopId: shopRecord.id, step: 'done',
    servicesOffered: setup?.servicesOffered || [], businessHours: setup?.businessHours || {}, bookingPreferences: setup?.bookingPreferences || {},
    taxRatePlaceholder: setup?.taxRate || 0, logoUploadPlaceholder: null, completedAt: now,
  };
  const progress = db.onboardingProgress();
  progress.push(onboarding);
  db.saveOnboardingProgress(progress);

  return { account, user, shop: shopRecord, membership, subscription, onboarding };
};

// §6 — platform/admin placeholder metrics (real, computed from the platform
// collections above — only billing/Stripe fields anywhere in this module are
// placeholders).
util.platformMetrics = () => {
  const shops = db.shops();
  const subscriptions = db.subscriptions();
  const planMix = {};
  subscriptions.forEach((s) => { planMix[s.planId] = (planMix[s.planId] || 0) + 1; });
  const recentSignups = shops.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  return {
    totalShops: shops.length,
    activeSubscriptions: subscriptions.filter((s) => s.status === 'active').length,
    trialingShops: subscriptions.filter((s) => s.status === 'trialing').length,
    pastDue: subscriptions.filter((s) => s.status === 'past_due').length,
    canceled: subscriptions.filter((s) => s.status === 'canceled').length,
    planMix: Object.entries(planMix).map(([planId, count]) => ({ plan: db.planById(planId), count })),
    recentSignups,
  };
};

// ---------------------------------------------------------------------------
// §9.1 — POS transactions. A "ticket" is an in-memory draft (not persisted)
// until completeSale() turns it into a real Sale. A register must be open
// for any of these except openRegister itself.
// ---------------------------------------------------------------------------
util.openRegister = (employeeId, openingFloat) => {
  if (db.openRegister()) throw new Error('A register is already open.');
  const registers = db.registers();
  const reg = {
    id: db.nextId('reg'),
    openedBy: employeeId,
    openedAt: new Date().toISOString(),
    openingFloat,
    closedBy: null,
    closedAt: null,
    status: 'open',
    expectedCash: null,
    countedCash: null,
    overShort: null,
    saleIds: [],
  };
  registers.push(reg);
  db.saveRegisters(registers);
  return reg;
};

util.newTicket = (opts = {}) => {
  if (opts.invoiceId) {
    const invoice = db.invoiceById(opts.invoiceId);
    if (!invoice) throw new Error(`Invoice ${opts.invoiceId} not found`);
    return {
      type: 'ro_payment',
      invoiceId: invoice.id,
      roId: invoice.roId,
      lineItems: [{ id: 'li_balance', type: 'service', name: `Invoice ${invoice.number} balance`, qty: 1, unitPrice: invoice.balance, total: invoice.balance }],
      discount: 0,
      subtotal: invoice.balance,
      tax: 0,
      total: invoice.balance,
      tenders: [],
      amountTendered: 0,
      changeDue: 0,
      balance: invoice.balance,
    };
  }
  return {
    type: 'counter_sale',
    invoiceId: null,
    roId: null,
    lineItems: [],
    discount: 0,
    subtotal: 0,
    tax: 0,
    total: 0,
    tenders: [],
    amountTendered: 0,
    changeDue: 0,
    balance: 0,
  };
};

function recalcTicket(ticket) {
  const taxRate = db.settings().taxRate || 0;
  ticket.subtotal = round2(ticket.lineItems.reduce((s, l) => s + l.total, 0));
  const taxable = Math.max(ticket.subtotal - (ticket.discount || 0), 0);
  // Invoice-balance tickets are already taxed inside the invoice total — don't double-tax.
  ticket.tax = ticket.type === 'ro_payment' ? 0 : round2(taxable * taxRate);
  ticket.total = round2(taxable + ticket.tax);
  ticket.amountTendered = round2((ticket.tenders || []).reduce((s, t) => s + t.amount, 0));
  ticket.balance = round2(Math.max(0, ticket.total - ticket.amountTendered));
  ticket.changeDue = ticket.amountTendered > ticket.total ? round2(ticket.amountTendered - ticket.total) : 0;
  return ticket;
}

util.addTicketLine = (ticket, line) => {
  ticket.lineItems.push({ id: db.nextId('li'), total: (line.qty || 1) * (line.unitPrice || 0), ...line });
  return recalcTicket(ticket);
};
util.removeTicketLine = (ticket, lineId) => {
  ticket.lineItems = ticket.lineItems.filter((l) => l.id !== lineId);
  return recalcTicket(ticket);
};
util.applyTicketDiscount = (ticket, discount) => {
  ticket.discount = discount;
  return recalcTicket(ticket);
};
util.addTender = (ticket, { method, amount }) => {
  ticket.tenders.push({ method, amount });
  return recalcTicket(ticket);
};

util.completeSale = (ticket) => {
  if (!ticket.lineItems.length) throw new Error('Add at least one line before completing the sale.');
  if (ticket.balance > 0.001) throw new Error('Balance must be paid in full before completing the sale.');
  const register = db.openRegister();
  if (!register) throw new Error('No open register — open a drawer first.');

  ticket.lineItems
    .filter((l) => (l.type === 'part' || l.type === 'retail') && l.refId)
    .forEach((l) => db.adjustPartQty(l.refId, -(l.qty || 1)));

  const sale = {
    id: db.nextId('sale'),
    number: db.nextSaleNumber(),
    type: ticket.type,
    invoiceId: ticket.invoiceId,
    roId: ticket.roId,
    cashierId: ticket.cashierId,
    registerSessionId: register.id,
    lineItems: ticket.lineItems,
    discount: ticket.discount,
    subtotal: ticket.subtotal,
    tax: ticket.tax,
    total: ticket.total,
    tenders: ticket.tenders,
    amountTendered: ticket.amountTendered,
    changeDue: ticket.changeDue,
    balance: 0,
    status: 'completed',
    receiptEmail: ticket.receiptEmail || '',
    createdAt: new Date().toISOString(),
    refundOfSaleId: null,
  };
  const sales = db.sales();
  sales.push(sale);
  db.saveSales(sales);

  const registers = db.registers();
  const reg = registers.find((r) => r.id === register.id);
  reg.saleIds.push(sale.id);
  db.saveRegisters(registers);

  if (ticket.invoiceId) util.recordPayment(ticket.invoiceId, ticket.total, ticket.tenders[0]?.method || 'card');

  return sale;
};

util.refundSale = (saleId, lines) => {
  const sale = db.saleById(saleId);
  if (!sale) throw new Error(`Sale ${saleId} not found`);
  const refundLines = (lines || sale.lineItems).map((l) => ({ ...l, total: -Math.abs(l.total) }));
  refundLines.filter((l) => (l.type === 'part' || l.type === 'retail') && l.refId).forEach((l) => db.adjustPartQty(l.refId, Math.abs(l.qty || 1)));

  const refundTotal = -round2(refundLines.reduce((s, l) => s + Math.abs(l.total), 0));
  const refund = {
    id: db.nextId('sale'),
    number: db.nextSaleNumber(),
    type: 'refund',
    invoiceId: sale.invoiceId,
    roId: sale.roId,
    cashierId: sale.cashierId,
    registerSessionId: sale.registerSessionId,
    lineItems: refundLines,
    discount: 0,
    subtotal: refundTotal,
    tax: 0,
    total: refundTotal,
    tenders: [{ method: sale.tenders[0]?.method || 'cash', amount: refundTotal }],
    amountTendered: refundTotal,
    changeDue: 0,
    balance: 0,
    status: 'completed',
    receiptEmail: '',
    createdAt: new Date().toISOString(),
    refundOfSaleId: sale.id,
  };
  const sales = db.sales();
  sales.push(refund);
  db.saveSales(sales);

  if (sale.invoiceId) {
    const invoices = db.invoices();
    const inv = invoices.find((i) => i.id === sale.invoiceId);
    if (inv) {
      inv.amountPaid = round2(inv.amountPaid + refundTotal);
      inv.balance = round2(inv.total - inv.amountPaid);
      inv.status = inv.balance <= 0 ? 'paid' : inv.amountPaid > 0 ? 'partial' : 'sent';
      db.saveInvoices(invoices);
    }
  }
  return refund;
};

util.voidSale = (saleId) => {
  const sales = db.sales();
  const sale = sales.find((s) => s.id === saleId);
  if (!sale) throw new Error(`Sale ${saleId} not found`);
  if (sale.status === 'voided') throw new Error('Sale is already voided.');
  sale.lineItems.filter((l) => (l.type === 'part' || l.type === 'retail') && l.refId).forEach((l) => db.adjustPartQty(l.refId, l.qty || 1));
  sale.status = 'voided';
  db.saveSales(sales);

  // Voiding a sale that paid an invoice must reverse that payment too —
  // otherwise the invoice (and its RO) stay marked paid/closed for a sale
  // that no longer exists.
  if (sale.invoiceId) {
    const invoices = db.invoices();
    const inv = invoices.find((i) => i.id === sale.invoiceId);
    if (inv) {
      inv.amountPaid = round2(Math.max(0, inv.amountPaid - sale.total));
      inv.balance = round2(inv.total - inv.amountPaid);
      inv.status = inv.balance <= 0 ? 'paid' : inv.amountPaid > 0 ? 'partial' : 'sent';
      db.saveInvoices(invoices);
      if (inv.status !== 'paid' && inv.roId) {
        const ro = db.jobById(inv.roId);
        if (ro && ro.status === 'closed') {
          ro.status = 'invoiced';
          saveJob(ro);
        }
      }
    }
  }
  return sale;
};

util.closeRegister = (sessionId, countedCash) => {
  const registers = db.registers();
  const reg = registers.find((r) => r.id === sessionId);
  if (!reg) throw new Error(`Register session ${sessionId} not found`);
  const sales = db.salesForRegister(sessionId);
  const cashIn = sales
    .filter((s) => s.status === 'completed' && s.type !== 'refund')
    .reduce((sum, s) => sum + (s.tenders || []).filter((t) => t.method === 'cash').reduce((a, t) => a + t.amount, 0) - (s.changeDue || 0), 0);
  const cashRefunds = sales
    .filter((s) => s.type === 'refund')
    .reduce((sum, s) => sum + (s.tenders || []).filter((t) => t.method === 'cash').reduce((a, t) => a + Math.abs(t.amount), 0), 0);
  const expectedCash = round2(reg.openingFloat + cashIn - cashRefunds);
  reg.expectedCash = expectedCash;
  reg.countedCash = countedCash;
  reg.overShort = round2(countedCash - expectedCash);
  reg.status = 'closed';
  reg.closedAt = new Date().toISOString();
  db.saveRegisters(registers);

  const byTender = {};
  sales.filter((s) => s.status === 'completed').forEach((s) => {
    (s.tenders || []).forEach((t) => {
      byTender[t.method] = round2((byTender[t.method] || 0) + t.amount);
    });
  });
  return {
    register: reg,
    salesCount: sales.filter((s) => s.type !== 'refund').length,
    totalsByTender: byTender,
    expectedCash,
    countedCash,
    overShort: reg.overShort,
  };
};

// ---------------------------------------------------------------------------
// §D — Marketing (Phase 1): merge-field templates, audience preview, and
// sending a campaign (which logs a Communication per recipient, visible on
// each customer's CRM timeline). Reuses the CRM's segment/customer data —
// marketing is a layer on the CRM, not a separate store.
// ---------------------------------------------------------------------------
function mergeVarsFor(customer) {
  const vehicle = db.vehiclesForCustomer(customer.id)[0];
  return {
    firstName: customer.firstName || '',
    lastName: customer.lastName || '',
    vehicleMake: vehicle?.make || 'vehicle',
    vehicleModel: vehicle?.model || '',
  };
}

// A merge tool must never leak raw {{tags}} to the recipient — unknown/empty
// vars resolve to '' (blank), not the literal placeholder text.
util.renderTemplate = (text, vars) => text.replace(/\{\{(\w+)\}\}/g, (m, key) => (vars[key] != null ? vars[key] : ''));

util.previewAudience = (segmentId) => db.segmentMembers(segmentId);

util.sendCampaign = (campaignId) => {
  const campaigns = db.campaigns();
  const campaign = campaigns.find((c) => c.id === campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (campaign.status === 'sent') throw new Error('Campaign was already sent.');

  // A campaign can carry its own subject/body directly (the richer builder
  // added for the named campaign types), or reference a shared Template
  // (the original Phase-1 flow) — support both rather than breaking either.
  const template = campaign.templateId ? db.templateById(campaign.templateId) : null;
  const subjectSrc = campaign.subject || template?.subject;
  const bodySrc = campaign.body || template?.body;
  if (!subjectSrc || !bodySrc) throw new Error('Campaign has no message content — add a subject/body or pick a template.');

  const recipients = db.segmentMembers(campaign.segmentId);

  const communications = db.communications();
  recipients.forEach((customer) => {
    const vars = { ...mergeVarsFor(customer), couponCode: campaign.offer || campaign.couponCode || '' };
    communications.push({
      id: db.nextId('comm'),
      customerId: customer.id,
      channel: campaign.type === 'sms' ? 'sms' : 'email',
      direction: 'out',
      subject: util.renderTemplate(subjectSrc, vars),
      body: util.renderTemplate(bodySrc, vars),
      campaignId: campaign.id,
      at: new Date().toISOString(),
    });
  });
  db.saveCommunications(communications);

  campaign.status = 'sent';
  campaign.sentAt = new Date().toISOString();
  // Real: recipient count. opened/clicked/booked/revenue are NOT computed —
  // there is no email/SMS integration, so they stay whatever was already on
  // the campaign (0 for anything created through the builder) rather than
  // being fabricated here.
  campaign.metrics = { opened: 0, clicked: 0, booked: 0, revenue: 0, ...(campaign.metrics || {}), sent: recipients.length };
  db.saveCampaigns(campaigns);

  return { recipientCount: recipients.length };
};

// §D dashboard helpers ------------------------------------------------------
const CANONICAL_CAMPAIGN_SUGGESTIONS = [
  { name: 'Oil Change Reminder', type: 'reminder', segmentId: 'seg_due_oil' },
  { name: 'Tire Rotation Reminder', type: 'reminder', segmentId: 'seg_due_tire' },
  { name: 'Winter Service Special', type: 'promotion', segmentId: 'seg_all' },
  { name: 'Brake Inspection Special', type: 'promotion', segmentId: 'seg_declined' },
  { name: 'We Miss You', type: 'email', segmentId: 'seg_inactive' },
  { name: 'Post-Service Review Request', type: 'review_request', segmentId: 'seg_returning' },
  { name: 'First-Time Customer Welcome', type: 'email', segmentId: 'seg_new' },
  { name: 'Declined-Service Follow-up', type: 'reminder', segmentId: 'seg_declined' },
  { name: 'Inspection Reminder', type: 'reminder', segmentId: 'seg_all' },
  { name: 'Fleet Service Reminder', type: 'reminder', segmentId: 'seg_fleet' },
];

// Suggests canonical campaign types the shop hasn't created yet, with the
// live (real) audience size for each — not a static list.
util.suggestedCampaigns = (limit = 3) => {
  const existingNames = new Set(db.campaigns().map((c) => c.name));
  return CANONICAL_CAMPAIGN_SUGGESTIONS
    .filter((s) => !existingNames.has(s.name))
    .map((s) => ({ ...s, audienceSize: db.segmentMembers(s.segmentId).length }))
    .slice(0, limit);
};

// Top segments by real, live member count (not seeded counts).
util.topSegments = (limit = 3) => {
  return db.segments()
    .map((s) => ({ segment: s, count: db.segmentMembers(s.id).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};
