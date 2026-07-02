// Torklio — modules/customer-care/customer-care-app.js
// Customer Care: post-service follow-up, review requests, declined work,
// coupons/winback, customer issues, and retention.
// Demo only — no real SMS or email is sent.

import { db } from '../../lib/data.js';
import { renderNav, toast } from '../../lib/nav.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const TASK_TYPES = {
  thank_you:        { label: 'Thank You',         color: '#16A34A', icon: '💚' },
  satisfaction_check:{ label: 'Satisfaction Check', color: '#2563EB', icon: '😊' },
  review_request:   { label: 'Review Request',    color: '#7C3AED', icon: '⭐' },
  declined_work:    { label: 'Declined Work',     color: '#D97706', icon: '🔧' },
  service_reminder: { label: 'Service Reminder',  color: '#0EA5E9', icon: '🔔' },
  coupon_winback:   { label: 'Coupon / Winback',  color: '#F97316', icon: '🎁' },
  customer_issue:   { label: 'Customer Issue',    color: '#EF4444', icon: '⚠️' },
  rewards_followup: { label: 'Rewards Follow-Up', color: '#D97706', icon: '👑' },
  referral_request: { label: 'Referral Request',  color: '#10B981', icon: '🤝' },
  manager_call:     { label: 'Manager Call',      color: '#DC2626', icon: '📞' },
};

const MOOD_META = {
  happy:        { label: 'Happy',         color: '#16A34A' },
  neutral:      { label: 'Neutral',       color: '#6B7280' },
  concerned:    { label: 'Concerned',     color: '#D97706' },
  upset:        { label: 'Upset',         color: '#EF4444' },
  needs_manager:{ label: 'Needs Manager', color: '#DC2626' },
  unknown:      { label: 'Unknown',       color: '#9CA3AF' },
};

const STATUS_META = {
  due:          { label: 'Due',          cls: 'badge-amber' },
  scheduled:    { label: 'Scheduled',    cls: '' },
  needs_review: { label: 'Needs Review', cls: 'badge-red' },
  sent:         { label: 'Sent',         cls: '' },
  completed:    { label: 'Completed',    cls: 'badge-green' },
  snoozed:      { label: 'Snoozed',      cls: '' },
  canceled:     { label: 'Canceled',     cls: '' },
};

const CHANNEL_META = {
  sms:       { label: 'SMS',       icon: '💬' },
  email:     { label: 'Email',     icon: '📧' },
  call:      { label: 'Call',      icon: '📞' },
  in_person: { label: 'In Person', icon: '🏪' },
};

// ── State ─────────────────────────────────────────────────────────────────────

let activeTab = 'today';

// ── DB helpers ────────────────────────────────────────────────────────────────

const getTasks      = () => db.customerCareTasks();
const getTemplates  = () => db.customerCareTemplates();
const settings      = () => db.settings();

function updateTask(id, patch) {
  const tasks = getTasks().map(t => t.id === id ? { ...t, ...patch } : t);
  db.saveCustomerCareTasks(tasks);
}

// ── Demo seed (lazy — runs only when cc_tasks is empty) ───────────────────────

function maybeSeedCareData() {
  if (getTasks().length > 0) return;

  const customers  = db.customers();
  const jobs       = db.jobs();
  const invoices   = db.invoices();
  const quotes     = db.quotes();
  const employees  = db.employees();

  const isoAdd = (days, h = 9) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, 0, 0, 0);
    return d.toISOString();
  };
  const isoAgo  = (days, h = 9) => isoAdd(-days, h);
  const isoToday = (h = 9)      => isoAdd(0, h);

  // Fallback shapes in case localStorage is empty
  const fallbackCust = [
    { id: 'cc_fc1', name: 'Maria Johnson',  firstName: 'Maria',  phone: '555-200-1001', email: 'maria.j@email.com' },
    { id: 'cc_fc2', name: 'Tom Patel',      firstName: 'Tom',    phone: '555-200-1002', email: '' },
    { id: 'cc_fc3', name: 'Linda Chen',     firstName: 'Linda',  phone: '',             email: 'linda.c@email.com' },
    { id: 'cc_fc4', name: 'Robert Kim',     firstName: 'Robert', phone: '555-200-1004', email: 'rkim@email.com' },
    { id: 'cc_fc5', name: 'Sarah Williams', firstName: 'Sarah',  phone: '555-200-1005', email: 'sarah.w@email.com' },
    { id: 'cc_fc6', name: 'James Garcia',   firstName: 'James',  phone: '',             email: '' },
    { id: 'cc_fc7', name: 'Amy Nguyen',     firstName: 'Amy',    phone: '555-200-1007', email: 'amy.n@email.com' },
    { id: 'cc_fc8', name: 'Carlos Rivera',  firstName: 'Carlos', phone: '555-200-1008', email: 'carlos.r@email.com' },
  ];

  const custShape = (c) => ({
    id: c.id,
    name: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Customer',
    firstName: c.firstName || (c.name || '').split(' ')[0] || 'Customer',
    phone: c.phone || '',
    email: c.email || '',
  });

  const fc = (i) => {
    if (customers.length > 0) return custShape(customers[i % customers.length]);
    return fallbackCust[i % fallbackCust.length];
  };

  const fj  = (i) => jobs[i % Math.max(1, jobs.length)] || null;
  const fi  = (i) => invoices[i % Math.max(1, invoices.length)] || null;
  const fq  = (i) => quotes[i % Math.max(1, quotes.length)] || null;

  const advisor = employees.find(e => e.role === 'advisor')
    || employees.find(e => !e.isTech)
    || { id: 'e_sara', firstName: 'Sara', lastName: 'Diaz' };
  const advisorName = `${advisor.firstName || ''} ${advisor.lastName || ''}`.trim();

  const veh = [
    '2020 Honda Civic', '2018 Toyota Camry', '2021 Ford F-150',
    '2019 Chevy Silverado', '2017 BMW 3 Series', '2022 Hyundai Elantra',
    '2016 Subaru Outback', '2020 Kia Sorento',
  ];

  const mk = (id, i, overrides) => {
    const c  = fc(i);
    const j  = fj(i);
    const iv = fi(i);
    return {
      id,
      customerId: c.id,
      customerName: c.name,
      customerFirstName: c.firstName,
      customerPhone: c.phone,
      customerEmail: c.email,
      vehicleLabel: veh[i % veh.length],
      jobId: j?.id || null,
      invoiceId: iv?.id || null,
      quoteId: null,
      roNumber: j?.roNumber || null,
      status: 'due',
      priority: 'normal',
      channel: 'sms',
      createdAt: isoAgo(1, 8),
      completedAt: null,
      assignedTo: advisor.id,
      assignedName: advisorName,
      customerMood: 'happy',
      lastContactedAt: null,
      result: null,
      ...overrides,
    };
  };

  const tasks = [
    mk('care_001', 0, {
      type: 'review_request', priority: 'high', channel: 'sms',
      templateId: 'tmpl_review_001', dueAt: isoToday(9),
      title: 'Ask for Google review',
      summary: 'Customer picked up vehicle and invoice was paid in full.',
    }),
    mk('care_002', 1, {
      type: 'thank_you', channel: 'sms',
      templateId: 'tmpl_thankyou_001', dueAt: isoToday(10),
      title: 'Thank-you follow-up after oil change',
      summary: 'Oil change + tire rotation completed this morning.',
    }),
    mk('care_003', 2, {
      type: 'declined_work', priority: 'high', channel: 'sms',
      quoteId: fq(0)?.id || null,
      templateId: 'tmpl_declined_001', dueAt: isoToday(14),
      title: 'Follow up on declined brake job',
      summary: 'Customer declined $620 brake pad + rotor replacement. Safety-critical.',
      customerMood: 'neutral',
    }),
    mk('care_004', 3, {
      type: 'customer_issue', priority: 'urgent', channel: 'call',
      status: 'needs_review',
      templateId: 'tmpl_issue_001', dueAt: isoToday(11),
      title: 'Customer reports noise after tire rotation',
      summary: 'Customer called — says vehicle making grinding noise since rotation 2 days ago.',
      customerMood: 'upset',
    }),
    mk('care_005', 4, {
      type: 'coupon_winback', channel: 'email', invoiceId: null, jobId: null,
      templateId: 'tmpl_winback_001', dueAt: isoToday(15),
      title: 'Win-back: 9 months since last visit',
      summary: 'No visit in 9 months. Offer $20 off next oil change.',
      customerMood: 'unknown', createdAt: isoAgo(1, 12),
    }),
    mk('care_006', 5, {
      type: 'rewards_followup', channel: 'sms', invoiceId: null, jobId: null,
      templateId: 'tmpl_rewards_001', dueAt: isoToday(13),
      title: 'Rewards member — points milestone reached',
      summary: 'Customer reached 500 points. Send redemption reminder.',
    }),
    mk('care_007', 6, {
      type: 'review_request', channel: 'sms', status: 'due',
      templateId: 'tmpl_review_001', dueAt: isoAdd(1, 9),
      title: 'Google review request — transmission service',
      summary: 'Transmission service completed yesterday. Customer seemed satisfied.',
      createdAt: isoAgo(0, 16),
    }),
    mk('care_008', 7, {
      type: 'service_reminder', channel: 'sms', status: 'scheduled',
      invoiceId: null, jobId: null,
      templateId: 'tmpl_reminder_001', dueAt: isoAdd(3, 10),
      title: 'Oil change due reminder',
      summary: 'Last oil change was ~4,800 miles ago.',
      customerMood: 'neutral', createdAt: isoAgo(1, 14),
    }),
    mk('care_009', 0, {
      type: 'declined_work', channel: 'email', status: 'scheduled',
      quoteId: fq(1)?.id || null,
      templateId: 'tmpl_declined_001', dueAt: isoAdd(7, 10),
      title: 'Follow up on declined AC recharge',
      summary: "Customer said 'let me think about it.' 7-day follow-up scheduled.",
      customerMood: 'neutral', createdAt: isoAgo(0, 11),
    }),
    mk('care_010', 1, {
      type: 'review_request', status: 'completed', channel: 'sms',
      templateId: 'tmpl_review_001', dueAt: isoAgo(2, 10),
      title: 'Google review request',
      summary: 'Customer left 5-star review.',
      completedAt: isoAgo(2, 11),
      lastContactedAt: isoAgo(2, 11),
      result: 'Customer left 5-star Google review. ⭐⭐⭐⭐⭐',
      createdAt: isoAgo(3, 8),
    }),
    mk('care_011', 2, {
      type: 'thank_you', status: 'completed', channel: 'sms',
      templateId: 'tmpl_thankyou_001', dueAt: isoAgo(4, 9),
      title: 'Thank-you message sent',
      summary: "Customer replied 'Thanks, you guys are great!'",
      completedAt: isoAgo(4, 9),
      lastContactedAt: isoAgo(4, 9),
      result: 'Message sent. Customer replied positively.',
      createdAt: isoAgo(5, 8),
    }),
    mk('care_012', 3, {
      type: 'satisfaction_check', status: 'completed', channel: 'sms',
      templateId: 'tmpl_satisfaction_001', dueAt: isoAgo(1, 10),
      title: 'Satisfaction check after suspension work',
      summary: 'Customer confirmed satisfied with repair.',
      completedAt: isoAgo(1, 10),
      lastContactedAt: isoAgo(1, 10),
      result: 'Customer confirmed vehicle feels great.',
      createdAt: isoAgo(2, 8),
    }),
  ];

  db.saveCustomerCareTasks(tasks);

  const shopName = settings().name || 'Our Shop';
  const shopPhone = settings().phone || '(555) 000-0000';

  const templates = [
    {
      id: 'tmpl_thankyou_001', type: 'thank_you', channel: 'sms',
      name: 'Thank You — Post Service',
      body: `Hi {{customerFirstName}}, thank you for choosing {{shopName}} for your {{vehicleLabel}}! We appreciate your trust. Don't hesitate to reach out if you have any questions. 🙏`,
    },
    {
      id: 'tmpl_satisfaction_001', type: 'satisfaction_check', channel: 'sms',
      name: 'Satisfaction Check',
      body: `Hi {{customerFirstName}}, how's everything going with your {{vehicleLabel}} after your recent visit? We want to make sure everything was taken care of properly. Reply anytime!`,
    },
    {
      id: 'tmpl_review_001', type: 'review_request', channel: 'sms',
      name: 'Google Review Request — SMS',
      body: `Hi {{customerFirstName}}, thanks again for trusting us with your {{vehicleLabel}}! If everything went well, we'd really appreciate a quick Google review — it means the world to a small shop. 🙏`,
    },
    {
      id: 'tmpl_review_email_001', type: 'review_request', channel: 'email',
      name: 'Google Review Request — Email',
      body: `Hi {{customerFirstName}},\n\nThank you for your recent visit to {{shopName}}! We hope your {{vehicleLabel}} is running great.\n\nIf you have a moment, we'd love for you to leave us a quick Google review — it really helps other customers find a trustworthy shop near them.\n\nThank you so much for your support!\n\n— The team at {{shopName}}\n{{shopPhone}}`,
    },
    {
      id: 'tmpl_declined_001', type: 'declined_work', channel: 'sms',
      name: 'Declined Work Follow-Up',
      body: `Hi {{customerFirstName}}, we wanted to check in about the service we recommended for your {{vehicleLabel}} at your last visit. We're happy to answer any questions or schedule a time that works for you!`,
    },
    {
      id: 'tmpl_reminder_001', type: 'service_reminder', channel: 'sms',
      name: 'Oil Change Reminder',
      body: `Hi {{customerFirstName}}, your {{vehicleLabel}} is coming up on its next oil change. Give us a call or book online anytime — we'll get you in and out fast! 🔧`,
    },
    {
      id: 'tmpl_winback_001', type: 'coupon_winback', channel: 'email',
      name: 'Win-Back Offer — $20 Off',
      body: `Hi {{customerFirstName}},\n\nWe miss seeing you at {{shopName}}! It's been a while since your last visit, and we wanted to offer you $20 off your next service.\n\nUse code: COMEBACK20 when you book.\n\nWe'd love to have you back!\n\n— {{shopName}}\n{{shopPhone}}`,
    },
    {
      id: 'tmpl_rewards_001', type: 'rewards_followup', channel: 'sms',
      name: 'Rewards Points Milestone',
      body: `Hi {{customerFirstName}}, great news — you've hit a milestone in our rewards program! 🏆 Stop by or call us to redeem your points on your next service. Thanks for being a loyal customer!`,
    },
    {
      id: 'tmpl_issue_001', type: 'customer_issue', channel: 'call',
      name: 'Customer Issue — Personal Follow-Up',
      body: `Hi {{customerFirstName}}, this is {{assignedName}} from {{shopName}}. I wanted to reach out personally about your recent experience. We take your feedback very seriously and I'd love to make this right. Please call us at {{shopPhone}} at your convenience.`,
    },
    {
      id: 'tmpl_referral_001', type: 'referral_request', channel: 'sms',
      name: 'Referral Request',
      body: `Hi {{customerFirstName}}, we're so glad you've been happy with our work! If you know anyone who needs a reliable mechanic, send them our way. We offer a $25 credit for every referral who gets service done. Thank you! 🙌`,
    },
  ];

  db.saveCustomerCareTemplates(templates);
}

// ── Merge-field engine ────────────────────────────────────────────────────────

function fillMergeFields(body, task) {
  const shop = settings();
  const fields = {
    customerFirstName: task.customerFirstName || task.customerName?.split(' ')[0] || 'there',
    customerName:      task.customerName || 'Customer',
    vehicleLabel:      task.vehicleLabel || 'your vehicle',
    shopName:          shop.name || 'Our Shop',
    shopPhone:         shop.phone || '',
    assignedName:      task.assignedName || 'our team',
    roNumber:          task.roNumber || '',
  };
  return Object.entries(fields).reduce(
    (s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)),
    String(body || ''),
  );
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return '—'; }
}

function isToday(iso) {
  if (!iso) return false;
  try {
    const d = new Date(iso);
    const t = new Date();
    return d.getFullYear() === t.getFullYear()
      && d.getMonth() === t.getMonth()
      && d.getDate() === t.getDate();
  } catch { return false; }
}

function isPastDue(iso) {
  if (!iso) return false;
  try { return new Date(iso) < new Date(); } catch { return false; }
}

// ── Tab filter logic ──────────────────────────────────────────────────────────

const INTAKE_TYPES    = new Set(['thank_you', 'satisfaction_check', 'service_reminder']);
const REVIEW_TYPES    = new Set(['review_request', 'satisfaction_check']);
const DECLINED_TYPES  = new Set(['declined_work']);
const ISSUE_MOODS     = new Set(['concerned', 'upset', 'needs_manager']);
const WINBACK_TYPES   = new Set(['coupon_winback', 'winback']);
const REWARDS_TYPES   = new Set(['rewards_followup']);
const DONE_STATUSES   = new Set(['completed', 'canceled']);
const ACTIVE_STATUSES = new Set(['due', 'scheduled', 'needs_review', 'snoozed', 'sent']);

function filterForTab(tasks, tab) {
  switch (tab) {
    case 'today':
      return tasks.filter(t =>
        ACTIVE_STATUSES.has(t.status) &&
        (isToday(t.dueAt) || (isPastDue(t.dueAt) && !DONE_STATUSES.has(t.status)))
      );
    case 'reviews':
      return tasks.filter(t => REVIEW_TYPES.has(t.type) && !DONE_STATUSES.has(t.status));
    case 'followups':
      return tasks.filter(t => INTAKE_TYPES.has(t.type) && !DONE_STATUSES.has(t.status));
    case 'declined':
      return tasks.filter(t => DECLINED_TYPES.has(t.type) && !DONE_STATUSES.has(t.status));
    case 'issues':
      return tasks.filter(t => ISSUE_MOODS.has(t.customerMood) && !DONE_STATUSES.has(t.status));
    case 'winback':
      return tasks.filter(t => WINBACK_TYPES.has(t.type) && !DONE_STATUSES.has(t.status));
    case 'rewards':
      return tasks.filter(t => REWARDS_TYPES.has(t.type) && !DONE_STATUSES.has(t.status));
    case 'completed':
      return tasks.filter(t => DONE_STATUSES.has(t.status));
    default:
      return tasks;
  }
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function renderSummary() {
  const tasks = getTasks();
  const todayDue    = tasks.filter(t => ACTIVE_STATUSES.has(t.status) && (isToday(t.dueAt) || isPastDue(t.dueAt))).length;
  const reviews     = tasks.filter(t => REVIEW_TYPES.has(t.type) && !DONE_STATUSES.has(t.status)).length;
  const declined    = tasks.filter(t => DECLINED_TYPES.has(t.type) && !DONE_STATUSES.has(t.status)).length;
  const issues      = tasks.filter(t => ISSUE_MOODS.has(t.customerMood) && !DONE_STATUSES.has(t.status)).length;
  const winback     = tasks.filter(t => WINBACK_TYPES.has(t.type) && !DONE_STATUSES.has(t.status)).length;
  const thisWeek = (() => {
    const wkAgo = new Date(); wkAgo.setDate(wkAgo.getDate() - 7);
    return tasks.filter(t => t.status === 'completed' && t.completedAt && new Date(t.completedAt) >= wkAgo).length;
  })();

  const card = (num, label, cls = '') =>
    `<div class="cc-sum-card">
      <div class="cc-sum-card-num${cls ? ' ' + cls : ''}">${num}</div>
      <div class="cc-sum-card-label">${label}</div>
    </div>`;

  document.getElementById('cc-summary-strip').innerHTML =
    `<div class="cc-summary-strip">
      ${card(todayDue,  'Follow-ups due today',        todayDue  > 0 ? 'is-amber' : '')}
      ${card(reviews,   'Review requests ready',       reviews   > 0 ? '' : '')}
      ${card(declined,  'Declined work opportunities', declined  > 0 ? 'is-amber' : '')}
      ${card(issues,    'Customer issues open',        issues    > 0 ? 'is-red' : '')}
      ${card(winback,   'Coupons / winbacks queued',   '')}
      ${card(thisWeek,  'Completed this week',         thisWeek  > 0 ? 'is-green' : '')}
    </div>`;
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function renderTabs() {
  const tasks  = getTasks();
  const counts = {
    today:     filterForTab(tasks, 'today').length,
    reviews:   filterForTab(tasks, 'reviews').length,
    followups: filterForTab(tasks, 'followups').length,
    declined:  filterForTab(tasks, 'declined').length,
    issues:    filterForTab(tasks, 'issues').length,
    winback:   filterForTab(tasks, 'winback').length,
    rewards:   filterForTab(tasks, 'rewards').length,
    completed: filterForTab(tasks, 'completed').length,
  };

  document.querySelectorAll('#cc-tabs button[data-tab]').forEach(btn => {
    const tab   = btn.dataset.tab;
    const n     = counts[tab];
    const active = tab === activeTab;
    btn.className = active ? 'active' : '';
    btn.innerHTML = `${btn.textContent.split(/\s+\d/)[0].trim()}${n !== undefined && n > 0 ? ` <span style="opacity:.7;font-size:.85em">${n}</span>` : ''}`;
  });
}

// ── Task card HTML ────────────────────────────────────────────────────────────

function taskCardHtml(task) {
  const typeMeta  = TASK_TYPES[task.type]  || { label: task.type || '—', color: '#9CA3AF', icon: '📋' };
  const moodMeta  = MOOD_META[task.customerMood] || { label: '—', color: '#9CA3AF' };
  const statusM   = STATUS_META[task.status] || { label: task.status || '—', cls: '' };
  const chanMeta  = CHANNEL_META[task.channel] || { label: task.channel || '—', icon: '📤' };

  const priorityCls = task.priority === 'urgent' ? 'is-urgent'
    : task.priority === 'high' ? 'is-high' : '';

  const overdue = isPastDue(task.dueAt) && !DONE_STATUSES.has(task.status);
  const dueLbl  = task.status === 'completed'
    ? `Completed ${fmtDateTime(task.completedAt)}`
    : (overdue ? `⚠ Overdue — was due ${fmtDateTime(task.dueAt)}` : `Due ${fmtDateTime(task.dueAt)}`);

  const custLink = task.customerId
    ? `<a href="crm.html?customerId=${encodeURIComponent(task.customerId)}" class="btn btn-sm btn-secondary" style="font-size:10px;padding:2px 8px" title="Open in CRM">Open Customer</a>`
    : '';
  const jobLink = task.jobId
    ? `<a href="repair-orders.html?jobId=${encodeURIComponent(task.jobId)}" class="btn btn-sm btn-secondary" style="font-size:10px;padding:2px 8px" title="Open RO">Open RO</a>`
    : '';
  const quoteLink = task.quoteId
    ? `<a href="quotes.html?quoteId=${encodeURIComponent(task.quoteId)}" class="btn btn-sm btn-secondary" style="font-size:10px;padding:2px 8px" title="Open Quote">Open Quote</a>`
    : '';

  const isDone = DONE_STATUSES.has(task.status);

  const actionBtns = isDone ? `
    <div class="cc-task-actions">
      ${custLink}${jobLink}${quoteLink}
    </div>` : `
    <div class="cc-task-actions">
      ${task.channel !== 'call' && task.channel !== 'in_person'
        ? `<button class="btn btn-primary btn-sm" data-preview="${task.id}" style="font-size:11px;padding:3px 10px">Preview Message</button>` : ''}
      <button class="btn btn-sm btn-secondary" data-mark-sent="${task.id}" style="font-size:11px;padding:3px 10px">Mark Sent</button>
      <button class="btn btn-sm btn-secondary" data-complete="${task.id}" style="font-size:11px;padding:3px 10px">Complete ✓</button>
      <button class="btn btn-sm btn-secondary" data-snooze="${task.id}" style="font-size:11px;padding:3px 10px">Snooze</button>
      ${custLink}${jobLink}${quoteLink}
    </div>`;

  return `
    <div class="cc-task-card${priorityCls ? ' ' + priorityCls : ''}" id="task-${task.id}">
      <div class="cc-task-head">
        <div class="cc-task-icon">${typeMeta.icon}</div>
        <div class="cc-task-meta">
          <div class="cc-task-title">${task.title || typeMeta.label}</div>
          <div class="cc-task-sub">
            <strong>${task.customerName || '—'}</strong>
            ${task.vehicleLabel ? ` · ${task.vehicleLabel}` : ''}
            ${task.roNumber ? ` · ${task.roNumber}` : ''}
          </div>
        </div>
      </div>
      <div class="cc-task-badges">
        <span class="badge ${statusM.cls || ''}" style="font-size:9px">${statusM.label}</span>
        <span class="badge" style="font-size:9px;background:rgba(0,0,0,.06);color:var(--ink-2)">${typeMeta.label}</span>
        <span class="badge" style="font-size:9px;background:rgba(0,0,0,.06);color:var(--ink-2)">${chanMeta.icon} ${chanMeta.label}</span>
        ${task.priority === 'urgent' ? '<span class="badge badge-red" style="font-size:9px">Urgent</span>' : task.priority === 'high' ? '<span class="badge badge-amber" style="font-size:9px">High</span>' : ''}
        <span class="badge" style="font-size:9px;background:rgba(0,0,0,.06);color:var(--ink-2)">
          <span class="mood-dot" style="background:${moodMeta.color}"></span>&nbsp;${moodMeta.label}
        </span>
      </div>
      <div class="cc-task-body">${task.summary || ''}</div>
      <div class="cc-task-details">
        <div class="cc-task-detail"><strong>Due:</strong> <span style="color:${overdue && !isDone ? 'var(--red)' : 'inherit'}">${dueLbl}</span></div>
        <div class="cc-task-detail"><strong>Assigned:</strong> ${task.assignedName || '—'}</div>
        ${task.lastContactedAt ? `<div class="cc-task-detail"><strong>Last contact:</strong> ${fmtDateTime(task.lastContactedAt)}</div>` : ''}
        ${task.customerPhone ? `<div class="cc-task-detail"><strong>Phone:</strong> ${task.customerPhone}</div>` : ''}
        ${task.customerEmail ? `<div class="cc-task-detail"><strong>Email:</strong> ${task.customerEmail}</div>` : ''}
      </div>
      ${task.result ? `<div class="cc-result">✓ ${task.result}</div>` : ''}
      ${actionBtns}
    </div>`;
}

// ── Empty state ───────────────────────────────────────────────────────────────

function emptyHtml(msg = 'No tasks in this category.') {
  return `<div class="cc-empty">
    <div class="cc-empty-icon">✅</div>
    <div class="cc-empty-title">All clear</div>
    <div>${msg}</div>
  </div>`;
}

// ── Tab body renderer ─────────────────────────────────────────────────────────

function renderBody() {
  const body = document.getElementById('cc-body');
  const tasks = getTasks();

  if (activeTab === 'templates') { renderTemplates(body); return; }
  if (activeTab === 'automation') { renderAutomation(body); return; }

  const filtered = filterForTab(tasks, activeTab);
  const sorted   = [...filtered].sort((a, b) => {
    if (DONE_STATUSES.has(a.status) && !DONE_STATUSES.has(b.status)) return 1;
    if (!DONE_STATUSES.has(a.status) && DONE_STATUSES.has(b.status)) return -1;
    const pa = a.priority === 'urgent' ? 0 : a.priority === 'high' ? 1 : 2;
    const pb = b.priority === 'urgent' ? 0 : b.priority === 'high' ? 1 : 2;
    if (pa !== pb) return pa - pb;
    return new Date(a.dueAt || 0) - new Date(b.dueAt || 0);
  });

  if (!sorted.length) {
    body.innerHTML = emptyHtml(
      activeTab === 'today'     ? 'No tasks due today. Great work!' :
      activeTab === 'issues'    ? 'No open customer issues.' :
      activeTab === 'completed' ? 'No completed tasks yet.' :
      'No tasks in this category.',
    );
    return;
  }

  body.innerHTML = `
    <div class="cc-privacy-note" style="font-size:11px;color:var(--ink-3);margin-bottom:var(--s4);display:flex;align-items:center;gap:5px">
      🔒 Do not contact customers without consent. Respect opt-outs. <strong>Demo mode — no messages are sent.</strong>
    </div>
    ${sorted.map(taskCardHtml).join('')}`;

  wireTaskActions(body);
}

// ── Templates tab ─────────────────────────────────────────────────────────────

function renderTemplates(body) {
  const templates = getTemplates();
  const grouped   = Object.keys(TASK_TYPES).map(type => ({
    type,
    meta: TASK_TYPES[type],
    items: templates.filter(t => t.type === type),
  })).filter(g => g.items.length > 0);

  body.innerHTML = `
    <div style="margin-bottom:var(--s4)">
      <div style="font-size:var(--t-lg);font-weight:700;color:var(--ink);margin-bottom:var(--s1)">Message Templates</div>
      <div style="font-size:var(--t-13);color:var(--ink-3)">
        Preview and edit templates used for customer outreach. Merge fields like <code>{{customerFirstName}}</code> are filled in automatically.
      </div>
    </div>
    ${grouped.map(g => `
      <div style="margin-bottom:var(--s5)">
        <div style="font-size:var(--t-13);font-weight:700;color:var(--ink-2);margin-bottom:var(--s2)">
          ${g.meta.icon} ${g.meta.label}
        </div>
        ${g.items.map(t => `
          <div class="cc-tpl-card">
            <div class="cc-tpl-head">
              <div>
                <div class="cc-tpl-name">${t.name || '—'}</div>
                <div style="font-size:var(--t-xs);color:var(--ink-3);margin-top:2px">
                  ${CHANNEL_META[t.channel]?.icon || '📤'} ${CHANNEL_META[t.channel]?.label || t.channel} · ID: ${t.id}
                </div>
              </div>
            </div>
            <div class="cc-tpl-body">${String(t.body || '').replace(/</g, '&lt;')}</div>
          </div>`).join('')}
      </div>`).join('')}
    <div class="cc-int-note">
      <h4>Future: Template Management</h4>
      <ul>
        <li>Edit and save template body text</li>
        <li>Create custom templates per shop</li>
        <li>Preview with a real customer's data</li>
        <li>Assign default templates per task type</li>
        <li>Attach to Supabase <code>message_templates</code> table</li>
      </ul>
    </div>`;
}

// ── Automation Rules tab ──────────────────────────────────────────────────────

function renderAutomation(body) {
  const rules = [
    { icon: '✅', trigger: 'Job picked up / invoice paid', delay: 'Same day', task: 'Thank-you follow-up', channel: 'SMS' },
    { icon: '⭐', trigger: 'Invoice paid',                 delay: '1 day',    task: 'Google review request', channel: 'SMS' },
    { icon: '🔧', trigger: 'Declined quote or estimate',   delay: '7 days',   task: 'Declined work follow-up', channel: 'SMS or Email' },
    { icon: '👋', trigger: 'First-time customer',          delay: 'Same day', task: 'Welcome thank-you',    channel: 'SMS' },
    { icon: '👑', trigger: 'Rewards milestone reached',    delay: 'Same day', task: 'Rewards update',       channel: 'SMS' },
    { icon: '😠', trigger: 'Customer mood = Upset or Needs Manager', delay: 'Immediately', task: 'Manager call task created', channel: 'Internal alert' },
    { icon: '📅', trigger: 'No visit in 6 months',        delay: 'Monthly',  task: 'Win-back coupon offer', channel: 'Email' },
    { icon: '🔔', trigger: 'Oil change due (mileage estimate)', delay: 'When due', task: 'Service reminder', channel: 'SMS' },
    { icon: '🤝', trigger: 'Customer left 5-star review',  delay: '3 days',   task: 'Referral request',     channel: 'SMS' },
    { icon: '😊', trigger: 'Satisfaction check sent — positive reply', delay: '1 day', task: 'Review request follow-up', channel: 'SMS' },
  ];

  body.innerHTML = `
    <div style="margin-bottom:var(--s4)">
      <div style="font-size:var(--t-lg);font-weight:700;color:var(--ink);margin-bottom:var(--s1)">Automation Rules</div>
      <div style="font-size:var(--t-13);color:var(--ink-3);margin-bottom:var(--s2)">
        Planned automations that will create Customer Care tasks automatically based on shop events.
      </div>
      <span class="badge" style="background:#FEF3C7;color:#92400E;font-size:10px">Demo planned — not yet active</span>
    </div>
    ${rules.map(r => `
      <div class="cc-rule-card">
        <div class="cc-rule-icon">${r.icon}</div>
        <div class="cc-rule-body">
          <div class="cc-rule-title">${r.task}</div>
          <div class="cc-rule-detail">
            <strong>Trigger:</strong> ${r.trigger}<br>
            <strong>Delay:</strong> ${r.delay} &nbsp;·&nbsp;
            <strong>Channel:</strong> ${r.channel}
          </div>
        </div>
        <span class="badge" style="font-size:9px;background:var(--canvas);color:var(--ink-3);flex-shrink:0;align-self:flex-start;margin-top:2px">Planned</span>
      </div>`).join('')}
    <div class="cc-int-note">
      <h4>Future: Real Automation</h4>
      <ul>
        <li>Trigger on Supabase table events (job status changes, invoice paid, etc.)</li>
        <li>Queue tasks in <code>customer_care_tasks</code></li>
        <li>Connect to SMS provider (Twilio) and email (Resend)</li>
        <li>Log delivery in <code>customer_followup_history</code></li>
        <li>Respect opt-out from <code>customer_contact_preferences</code></li>
        <li>Zapier webhook support for custom integrations</li>
      </ul>
    </div>`;
}

// ── Preview message modal ─────────────────────────────────────────────────────

function openPreviewModal(taskId) {
  const task     = getTasks().find(t => t.id === taskId);
  if (!task) { toast('Task not found.', 'error'); return; }

  const templates = getTemplates();
  const tmpl      = templates.find(t => t.id === task.templateId)
    || templates.find(t => t.type === task.type && t.channel === task.channel)
    || templates.find(t => t.type === task.type)
    || null;

  const chanMeta = CHANNEL_META[task.channel] || { label: task.channel || '—', icon: '📤' };

  const missingPhone = task.channel === 'sms'   && !task.customerPhone;
  const missingEmail = task.channel === 'email' && !task.customerEmail;
  const missing      = missingPhone || missingEmail;

  const previewBody = tmpl ? fillMergeFields(tmpl.body, task) : '(No template found for this task type/channel combination.)';

  const previewHtml = task.channel === 'sms'
    ? `<div class="cc-preview-phone">
         <div style="font-size:10px;color:var(--ink-4);text-align:center;margin-bottom:var(--s2)">To: ${task.customerPhone || '—'}</div>
         <div class="cc-preview-phone-bubble">${previewBody.replace(/\n/g, '<br>')}</div>
       </div>`
    : task.channel === 'email'
    ? `<div class="cc-preview-email-box">${previewBody.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>`
    : `<div class="cc-preview-email-box">${previewBody.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>`;

  const overlay = document.createElement('div');
  overlay.className = 'cc-modal-overlay';
  overlay.innerHTML = `
    <div class="cc-modal" role="dialog" aria-modal="true">
      <div class="cc-modal-head">
        <div>
          <div class="cc-modal-title">${chanMeta.icon} Preview Message</div>
          <div class="cc-modal-sub">
            ${task.customerName || '—'} · ${task.vehicleLabel || ''} · ${chanMeta.label}
            ${tmpl ? ` · ${tmpl.name}` : ''}
          </div>
        </div>
        <button class="icon-btn" id="cc-modal-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="cc-modal-body">
        <div class="cc-demo-warn">
          ⚠ Demo preview only — no message will be sent.
        </div>
        ${missing ? `<div class="cc-missing-warn">
          ⚠ Missing ${missingPhone ? 'phone number' : 'email address'} for this customer. Cannot send via ${chanMeta.label}.
        </div>` : ''}
        ${previewHtml}
        ${!tmpl ? '<div style="font-size:var(--t-xs);color:var(--ink-4);margin-top:var(--s2)">No template assigned to this task. Assign a template to see a preview.</div>' : ''}
      </div>
      <div class="cc-modal-foot">
        ${!missing && tmpl ? `<button class="btn btn-primary" id="cc-modal-copy">Copy Message</button>` : ''}
        <button class="btn btn-secondary" id="cc-modal-sent">Mark Sent</button>
        <button class="btn btn-secondary" id="cc-modal-close2">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  overlay.getElementById = (id) => overlay.querySelector('#' + id);
  overlay.querySelector('#cc-modal-close')?.addEventListener('click', close);
  overlay.querySelector('#cc-modal-close2')?.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#cc-modal-copy')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(previewBody).then(() => {
      toast('Message copied to clipboard.', 'success');
    }).catch(() => toast('Copy failed — please select and copy manually.', 'error'));
  });

  overlay.querySelector('#cc-modal-sent')?.addEventListener('click', () => {
    updateTask(taskId, { status: 'sent', lastContactedAt: new Date().toISOString() });
    toast(`Marked as sent for ${task.customerName || 'customer'}.`, 'success');
    close();
    render();
  });
}

// ── Snooze inline UI ──────────────────────────────────────────────────────────

function openSnooze(taskId) {
  const card = document.getElementById(`task-${taskId}`);
  if (!card) return;
  if (card.querySelector('.cc-snooze-row')) return; // already open

  const row = document.createElement('div');
  row.className = 'cc-snooze-row';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().slice(0, 10);

  row.innerHTML = `
    <span style="font-size:var(--t-xs);color:var(--ink-3)">Snooze until:</span>
    <input type="date" id="snooze-date-${taskId}" value="${tomorrowISO}" min="${tomorrowISO}">
    <button class="btn btn-sm btn-primary" id="snooze-confirm-${taskId}" style="font-size:11px;padding:3px 10px">Snooze</button>
    <button class="btn btn-sm btn-secondary" id="snooze-cancel-${taskId}" style="font-size:11px;padding:3px 10px">Cancel</button>`;

  card.querySelector('.cc-task-actions')?.after(row);

  row.querySelector(`#snooze-confirm-${taskId}`)?.addEventListener('click', () => {
    const val = row.querySelector(`#snooze-date-${taskId}`)?.value;
    if (!val) { toast('Please pick a date.', 'error'); return; }
    const newDue = new Date(val + 'T09:00:00').toISOString();
    updateTask(taskId, { status: 'snoozed', dueAt: newDue });
    toast('Task snoozed.', 'success');
    render();
  });

  row.querySelector(`#snooze-cancel-${taskId}`)?.addEventListener('click', () => row.remove());
}

// ── Wire task action buttons ──────────────────────────────────────────────────

function wireTaskActions(root) {
  root.querySelectorAll('[data-preview]').forEach(btn => {
    btn.addEventListener('click', () => openPreviewModal(btn.dataset.preview));
  });
  root.querySelectorAll('[data-mark-sent]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id   = btn.dataset.markSent;
      const task = getTasks().find(t => t.id === id);
      updateTask(id, { status: 'sent', lastContactedAt: new Date().toISOString() });
      toast(`Marked as sent for ${task?.customerName || 'customer'}.`, 'success');
      render();
    });
  });
  root.querySelectorAll('[data-complete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id   = btn.dataset.complete;
      const task = getTasks().find(t => t.id === id);
      updateTask(id, { status: 'completed', completedAt: new Date().toISOString(), lastContactedAt: new Date().toISOString() });
      toast(`Task completed for ${task?.customerName || 'customer'}.`, 'success');
      render();
    });
  });
  root.querySelectorAll('[data-snooze]').forEach(btn => {
    btn.addEventListener('click', () => openSnooze(btn.dataset.snooze));
  });
}

// ── Full render ───────────────────────────────────────────────────────────────

function render() {
  renderSummary();
  renderTabs();
  renderBody();
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderCustomerCare() {
  renderNav('#icon-rail');

  const avatar = document.getElementById('avatar');
  if (avatar) {
    const emp = db.employeeById(db.settings().currentUserId);
    if (emp) avatar.textContent = emp.avatar || (emp.firstName?.[0] || 'J');
  }

  maybySeedCareData();

  // Wire tabs
  document.querySelectorAll('#cc-tabs button[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      render();
    });
  });

  render();
}

// Alias to fix the typo in one call-site below (defensive)
function maybySeedCareData() { maybeSeedCareData(); }
