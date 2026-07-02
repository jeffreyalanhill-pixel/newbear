// Torklio — modules/appointments-lab.js
// SHOP COMMAND CENTER (lab concept) — a shop-operations cockpit, not a Kanban.
// Command strip · bay map · tech load rack · three-zone flow deck · attention rail.
// All state lives under ab_lab_* keys; production data is cloned, never written.

import { db } from '../lib/data.js';

// ---------------------------------------------------------------------------
// Lab storage
// ---------------------------------------------------------------------------
const LAB_KEYS = {
  jobs:     'ab_lab_jobs',
  steps:    'ab_lab_workflow_steps',
  view:     'ab_lab_view_state',
  settings: 'ab_lab_board_settings',
};
const labGet = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; } };
const labSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// ---------------------------------------------------------------------------
// Workflow model — 7 stages in 3 zones; holds are FLAGS, not columns
// ---------------------------------------------------------------------------
const LAB_STAGES = [
  { id: 'requests',    label: 'New Requests',  color: '#3E6DC4', zone: 'inbound', group: 'intake',     next: { label: 'Schedule',   to: 'scheduled' } },
  { id: 'scheduled',   label: 'Scheduled',     color: '#2C8FB8', zone: 'inbound', group: 'intake',     next: { label: 'Check In',   to: 'checked_in' } },
  { id: 'checked_in',  label: 'Checked In',    color: '#B78A2E', zone: 'inbound', group: 'intake',     next: { label: 'Start Work', to: 'in_progress' } },
  { id: 'in_progress', label: 'In Progress',   color: '#1F5EE0', zone: 'floor',   group: 'shopfloor',  requiresTech: true, requiresBay: true, next: { label: 'Mark QC', to: 'qc' } },
  { id: 'qc',          label: 'Quality Check', color: '#0E7490', zone: 'floor',   group: 'shopfloor',  requiresTech: true, next: { label: 'Mark Ready', to: 'ready' } },
  { id: 'ready',       label: 'Ready',         color: '#15803D', zone: 'out',     group: 'completion', next: { label: 'Close', to: 'closed' } },
  { id: 'closed',      label: 'Closed',        color: '#64748B', zone: 'out',     group: 'completion', collapsed: true, next: null },
];

const FLAG_META = {
  approval:         { label: 'Waiting Approval', banner: 'Paused — Waiting Approval', color: '#92400E', bg: '#FEF3C7' },
  parts:            { label: 'Waiting Parts',    banner: 'Paused — Waiting Parts',    color: '#1D4ED8', bg: '#DBEAFE' },
  customer_waiting: { label: 'Customer Waiting', banner: 'Customer Waiting in Lobby', color: '#854D0E', bg: '#FDE68A' },
  needs_manager:    { label: 'Needs Manager',    banner: 'Manager Needed',            color: '#B91C1C', bg: '#FEE2E2' },
  blocked:          { label: 'Blocked',          banner: 'Blocked',                   color: '#B91C1C', bg: '#FEE2E2' },
};

const LAB_LOCATIONS = [
  { id: 'loc_lot',      name: 'Lot / Outside' },
  { id: 'loc_roadtest', name: 'Road Test' },
  { id: 'loc_detail',   name: 'Detail' },
  { id: 'loc_waiting',  name: 'Waiting Area' },
];

const GROUP_LABELS = { intake: 'Intake', shopfloor: 'Shop Floor', hold: 'Hold', completion: 'Completion' };
const GROUP_ZONE = { intake: 'inbound', shopfloor: 'floor', hold: 'floor', completion: 'out' };
const STEP_COLORS = { blue: '#3E6DC4', teal: '#0E7490', navy: '#1E3A8A', green: '#15803D', amber: '#B78A2E', slate: '#64748B' };

const PROD_STAGE_MAP = {
  estimates_requests: { stage: 'requests' },
  walk_in:            { stage: 'checked_in' },
  scheduled:          { stage: 'scheduled' },
  dropped_off:        { stage: 'checked_in' },
  waiting_bay:        { stage: 'checked_in' },
  in_progress:        { stage: 'in_progress' },
  waiting_approval:   { stage: 'in_progress', flag: 'approval' },
  waiting_parts:      { stage: 'in_progress', flag: 'parts' },
  quality_check:      { stage: 'qc' },
  ready_for_pickup:   { stage: 'ready' },
  picked_up_closed:   { stage: 'closed' },
  cancelled:          { stage: 'closed' },
  no_show:            { stage: 'closed' },
};

// ---------------------------------------------------------------------------
// Seed — clone production jobs into lab cards (read-only clone)
// ---------------------------------------------------------------------------
function seedLab(force = false) {
  if (!force && labGet(LAB_KEYS.jobs)) return;
  const today = new Date().toISOString().slice(0, 10);
  const cards = (db.jobs() || []).map((j) => {
    const c = db.customerById(j.customerId);
    const v = db.vehicleById(j.vehicleId);
    const map = PROD_STAGE_MAP[j.workflowStatus || j.status || 'estimates_requests'] || { stage: 'requests' };
    const rw = j.customerId ? db.customerRewardByCustomerId?.(j.customerId) : null;
    return {
      id: 'lab_' + j.id,
      ro: j.ro || '',
      customer: (c ? `${c.firstName} ${c.lastName}` : j.walkInCustomerName) || 'Customer',
      vehicle: (v ? `${v.year} ${v.make} ${v.model}` : j.walkInVehicle) || '',
      services: (j.lineItems || []).filter((l) => l.type === 'service').map((l) => l.name),
      stage: map.stage,
      flags: map.flag ? [map.flag] : (j.visitType === 'wait' && map.stage !== 'closed' ? ['customer_waiting'] : []),
      techId: j.leadTechId || j.techId || null,
      bayId: j.bayId || null,
      total: j.total || 0,
      visitType: j.visitType || null,
      source: j.walkInAt ? 'walk_in' : 'online',
      notes: (j.colabNotes || []).map((n) => ({ author: n.authorName || 'Note', body: n.body || '', at: n.createdAt })),
      photos: Array.isArray(j.photos) ? j.photos.length : 0,
      rewards: rw ? (rw.tier || 'member') : null,
      date: j.scheduledDate || today,
      stageEnteredAt: new Date().toISOString(),
      stageHistory: [{ stage: map.stage, at: new Date().toISOString(), via: 'lab_seed' }],
      activity: [],
    };
  });
  labSet(LAB_KEYS.jobs, cards);
  if (force || !labGet(LAB_KEYS.steps)) labSet(LAB_KEYS.steps, []);
  if (force) { labSet(LAB_KEYS.view, {}); labSet(LAB_KEYS.settings, {}); }
}

const labJobs = () => labGet(LAB_KEYS.jobs, []);
const saveLabJobs = (a) => labSet(LAB_KEYS.jobs, a);
const labSteps = () => labGet(LAB_KEYS.steps, []);
const saveLabSteps = (a) => labSet(LAB_KEYS.steps, a);
const labView = () => labGet(LAB_KEYS.view, {});
const patchView = (p) => labSet(LAB_KEYS.view, { ...labView(), ...p });

function customStages() {
  return labSteps().filter((s) => s.hidden !== true).map((s) => ({
    id: s.id, label: s.label, color: STEP_COLORS[s.color] || '#64748B',
    zone: GROUP_ZONE[s.group] || 'floor', group: s.group || 'shopfloor', isCustom: true, next: null,
  }));
}
function allStages() {
  const custom = customStages();
  const out = [];
  LAB_STAGES.forEach((st) => {
    out.push(st);
    if (st.id === 'checked_in') out.push(...custom.filter((c) => c.zone === 'inbound'));
    if (st.id === 'qc')         out.push(...custom.filter((c) => c.zone === 'floor'));
    if (st.id === 'ready')      out.push(...custom.filter((c) => c.zone === 'out'));
  });
  return out;
}
const stageById = (id) => allStages().find((s) => s.id === id);

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
const fmtMoney = (v) => '$' + (v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
function fmtDur(mins) {
  if (mins == null) return '';
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
const stageAge = (c) => c.stageEnteredAt ? Math.max(0, (Date.now() - new Date(c.stageEnteredAt)) / 60000) : null;
const initials = (name) => { const p = (name || '').trim().split(/\s+/); return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : (p[0]?.[0] || '?').toUpperCase(); };
function techName(id) { const t = id ? db.employeeById(id) : null; return t ? `${t.firstName} ${t.lastName}` : ''; }
function bayLabel(id) {
  if (!id) return '';
  const b = db.bayById?.(id);
  if (b) return b.name;
  return LAB_LOCATIONS.find((l) => l.id === id)?.name || '';
}
function toast(msg, kind = 'info') {
  const el = document.createElement('div');
  el.className = `lab-toast${kind === 'error' ? ' err' : ''}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2400);
}
function logActivity(card, label) { card.activity = card.activity || []; card.activity.push({ label, at: new Date().toISOString() }); }
function updateCard(id, fn) {
  const jobs = labJobs();
  const idx = jobs.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  fn(jobs[idx]);
  saveLabJobs(jobs);
  return jobs[idx];
}
const activeCards = () => labJobs().filter((c) => c.stage !== 'closed');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let viewMode = labView().viewMode || 'flow';   // flow | bay | tech
let searchTerm = '';
let focusMetric = null;                         // command-strip drill-down filter
const expandedCards = new Set();

// ---------------------------------------------------------------------------
// Warnings + flags + moves
// ---------------------------------------------------------------------------
function cardWarnings(card) {
  const st = stageById(card.stage);
  const w = [];
  if (st?.requiresTech && !card.techId) w.push('No technician assigned');
  if (st?.requiresBay && !card.bayId) w.push('No bay/location assigned');
  return w;
}

function moveCard(id, stageId, via = 'drag') {
  const target = stageById(stageId);
  if (!target) return;
  const card = updateCard(id, (c) => {
    if (c.stage === stageId) return;
    const mins = stageAge(c);
    c.stageHistory = c.stageHistory || [];
    c.stageHistory.push({ stage: stageId, at: new Date().toISOString(), via, prevMinutes: mins ? Math.round(mins) : null });
    c.stage = stageId;
    c.stageEnteredAt = new Date().toISOString();
    logActivity(c, `Moved to ${target.label}`);
  });
  if (!card) return;
  renderAll();
  if (stageId === 'in_progress') {
    const needTech = !card.techId, needBay = !card.bayId;
    if (needTech || needBay) setTimeout(() => openQuickAssign(anchorFor(id), id, needTech && needBay ? 'both' : needTech ? 'tech' : 'bay', 'Assign before starting'), 60);
  } else if (stageId === 'ready' && card.bayId && !String(card.bayId).startsWith('loc_')) {
    const bn = bayLabel(card.bayId);
    setTimeout(() => {
      if (window.confirm(`Release ${bn}?`)) {
        updateCard(id, (c) => { c.bayId = null; logActivity(c, `Released ${bn}`); });
        renderAll();
      }
    }, 60);
  }
}

function toggleFlag(id, flag) {
  const card = labJobs().find((c) => c.id === id);
  const adding = card && !(card.flags || []).includes(flag);
  if (adding && flag === 'parts' && card.bayId && !String(card.bayId).startsWith('loc_')) {
    const keep = window.confirm(`${bayLabel(card.bayId)} is occupied by this job.\n\nOK = keep the bay while waiting on parts\nCancel = move the car to the Lot`);
    updateCard(id, (c) => {
      c.flags = [...(c.flags || []), flag];
      logActivity(c, `Flagged: ${FLAG_META[flag].label}`);
      if (!keep) { c.bayId = 'loc_lot'; logActivity(c, 'Moved to Lot / Outside'); }
    });
  } else {
    updateCard(id, (c) => {
      const has = (c.flags || []).includes(flag);
      c.flags = has ? c.flags.filter((f) => f !== flag) : [...(c.flags || []), flag];
      logActivity(c, `${has ? 'Cleared' : 'Flagged'}: ${FLAG_META[flag].label}`);
    });
  }
  renderAll();
  if (drawerCardId === id) openLabDrawer(id, drawerTab);
}
function resolveAllFlags(id) {
  updateCard(id, (c) => { c.flags = []; logActivity(c, 'Block resolved'); });
  renderAll();
  if (drawerCardId === id) openLabDrawer(id, drawerTab);
}

// ---------------------------------------------------------------------------
// Quick-assign popover
// ---------------------------------------------------------------------------
let qaEl = null;
function closeQA() { qaEl?.remove(); qaEl = null; }
const anchorFor = (id) => document.querySelector(`.cc-card[data-id="${id}"]`);

function assignTech(id, techId) {
  updateCard(id, (c) => { c.techId = techId || null; logActivity(c, techId ? `Tech assigned to ${techName(techId)}` : 'Tech unassigned'); });
}
function assignBay(id, bayId) {
  updateCard(id, (c) => { c.bayId = bayId || null; logActivity(c, bayId ? `Bay changed to ${bayLabel(bayId)}` : 'Bay cleared'); });
}

function openQuickAssign(anchor, cardId, kind, title) {
  closeQA();
  const card = labJobs().find((c) => c.id === cardId);
  if (!card) return;
  const techs = (db.employees() || []).filter((e) => e.isTech);
  const bays = db.bays() || [];
  const chip = (attr, val, label, active) => `<button data-${attr}="${val}" class="qa-chip${active ? ' active' : ''}">${label}</button>`;
  const techSec = `<div class="qa-label">Technician</div><div class="qa-chips">${techs.map((t) => chip('t', t.id, `${t.firstName} ${t.lastName}`, card.techId === t.id)).join('')}${chip('t', '', 'Unassigned', !card.techId)}</div>`;
  const baySec = `<div class="qa-label">Bay / Location</div><div class="qa-chips">${chip('b', '', 'No Bay', !card.bayId)}${bays.map((b) => chip('b', b.id, b.name, card.bayId === b.id)).join('')}${LAB_LOCATIONS.map((l) => chip('b', l.id, l.name, card.bayId === l.id)).join('')}</div>`;
  const el = document.createElement('div');
  el.className = 'qa-pop';
  el.innerHTML = (title ? `<div class="qa-title">${title}</div>` : '')
    + (kind !== 'bay' ? techSec : '') + (kind !== 'tech' ? baySec : '')
    + (kind === 'both' ? `<button class="qa-skip">Skip for now</button>` : '');
  document.body.appendChild(el);
  qaEl = el;
  const r = anchor?.getBoundingClientRect?.() || { left: innerWidth / 2 - 120, bottom: 160 };
  el.style.left = Math.max(8, Math.min(r.left, innerWidth - el.offsetWidth - 8)) + 'px';
  el.style.top = Math.max(8, Math.min(r.bottom + 6, innerHeight - el.offsetHeight - 8)) + 'px';

  const stillNeeds = () => {
    const c = labJobs().find((x) => x.id === cardId);
    return kind === 'both' && c && (!c.techId || !c.bayId);
  };
  const pick = (fn, val, sel, dsKey) => {
    fn(cardId, val || null);
    renderAll();
    if (drawerCardId === cardId) openLabDrawer(cardId, drawerTab);
    if (stillNeeds()) el.querySelectorAll(sel).forEach((b) => b.classList.toggle('active', b.dataset[dsKey] === (val || '')));
    else { closeQA(); toast('Assignment saved.'); }
  };
  el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); pick(assignTech, b.dataset.t, '[data-t]', 't'); }));
  el.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); pick(assignBay, b.dataset.b, '[data-b]', 'b'); }));
  el.querySelector('.qa-skip')?.addEventListener('click', closeQA);
  const esc = (e) => { if (e.key === 'Escape') { closeQA(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
  setTimeout(() => {
    const out = (e) => { if (qaEl !== el) { document.removeEventListener('mousedown', out); return; } if (!el.contains(e.target)) { closeQA(); document.removeEventListener('mousedown', out); } };
    document.addEventListener('mousedown', out);
  }, 0);
}

// ---------------------------------------------------------------------------
// COMMAND STRIP — clickable shop vitals
// ---------------------------------------------------------------------------
function renderCommandStrip() {
  const cards = labJobs();
  const act = activeCards();
  const bays = db.bays() || [];
  const occupied = new Set(act.map((c) => c.bayId).filter((b) => b && !String(b).startsWith('loc_')));
  const m = {
    today:    { label: 'Cars Today',     n: act.length,                                                        accent: '#1E3A8A' },
    checked:  { label: 'Checked In',     n: act.filter((c) => c.stage === 'checked_in').length,                accent: '#B78A2E' },
    working:  { label: 'On the Floor',   n: act.filter((c) => ['in_progress', 'qc'].includes(c.stage)).length, accent: '#1F5EE0' },
    blocked:  { label: 'Blocked',        n: act.filter((c) => (c.flags || []).some((f) => f !== 'customer_waiting')).length, accent: '#B91C1C' },
    waiting:  { label: 'Cust. Waiting',  n: act.filter((c) => (c.flags || []).includes('customer_waiting')).length, accent: '#854D0E' },
    ready:    { label: 'Ready',          n: cards.filter((c) => c.stage === 'ready').length,                   accent: '#15803D' },
    baysOpen: { label: 'Open Bays',      n: Math.max(0, bays.length - occupied.size),                          accent: '#0E7490' },
    unpaid:   { label: 'Needs Invoice',  n: cards.filter((c) => c.stage === 'ready' && c.total > 0).length, sub: fmtMoney(cards.filter((c) => c.stage === 'ready').reduce((s, c) => s + (c.total || 0), 0)), accent: '#B78A2E' },
  };
  document.getElementById('cc-strip').innerHTML = Object.entries(m).map(([k, v]) => `
    <button class="cc-metric${focusMetric === k ? ' focused' : ''}" data-metric="${k}" style="--ma:${v.accent}">
      <span class="cc-metric-n">${v.n}</span>
      <span class="cc-metric-l">${v.label}${v.sub ? ` · ${v.sub}` : ''}</span>
    </button>`).join('');
  document.querySelectorAll('[data-metric]').forEach((b) => b.addEventListener('click', () => {
    focusMetric = focusMetric === b.dataset.metric ? null : b.dataset.metric;
    renderAll();
  }));
}

function metricFilter(cards) {
  switch (focusMetric) {
    case 'checked':  return cards.filter((c) => c.stage === 'checked_in');
    case 'working':  return cards.filter((c) => ['in_progress', 'qc'].includes(c.stage));
    case 'blocked':  return cards.filter((c) => (c.flags || []).some((f) => f !== 'customer_waiting'));
    case 'waiting':  return cards.filter((c) => (c.flags || []).includes('customer_waiting'));
    case 'ready': case 'unpaid': return cards.filter((c) => c.stage === 'ready');
    default: return cards;
  }
}

// ---------------------------------------------------------------------------
// BAY MAP — physical resource tiles, drop targets
// ---------------------------------------------------------------------------
function renderBayMap() {
  const act = activeCards();
  const bays = db.bays() || [];
  const tiles = [...bays.map((b) => ({ id: b.id, name: b.name, physical: true })), ...LAB_LOCATIONS.map((l) => ({ id: l.id, name: l.name, physical: false }))];
  document.getElementById('cc-baymap').innerHTML = tiles.map((t) => {
    const occ = act.filter((c) => c.bayId === t.id);
    const conflict = t.physical && occ.length > 1;
    const car = occ[0];
    return `<div class="cc-bay${occ.length ? ' occ' : ''}${conflict ? ' conflict' : ''}${t.physical ? '' : ' loc'}" data-bay="${t.id}">
      <div class="cc-bay-name">${t.name}${conflict ? ' <span class="cc-bay-x">×' + occ.length + '</span>' : ''}</div>
      ${car ? `<div class="cc-bay-car" data-open="${car.id}"><span class="cc-bay-ro">${car.ro}</span> ${car.vehicle || car.customer}</div>` : `<div class="cc-bay-open">OPEN</div>`}
    </div>`;
  }).join('');
  // drop a card on a bay tile → assign
  document.querySelectorAll('.cc-bay').forEach((tile) => {
    tile.addEventListener('dragover', (e) => { e.preventDefault(); tile.classList.add('over'); });
    tile.addEventListener('dragleave', () => tile.classList.remove('over'));
    tile.addEventListener('drop', (e) => {
      e.preventDefault(); tile.classList.remove('over');
      const dragging = document.querySelector('.cc-card.dragging');
      if (!dragging) return;
      assignBay(dragging.dataset.id, tile.dataset.bay);
      renderAll();
      toast(`Assigned to ${bayLabel(tile.dataset.bay)}.`);
    });
    tile.querySelector('[data-open]')?.addEventListener('click', (e) => openLabDrawer(e.currentTarget.dataset.open));
  });
}

// ---------------------------------------------------------------------------
// TECH LOAD RACK
// ---------------------------------------------------------------------------
function renderTechRack() {
  const act = activeCards();
  const techs = (db.employees() || []).filter((e) => e.isTech);
  const MAXBAR = 4;
  document.getElementById('cc-techs').innerHTML = techs.map((t) => {
    const mine = act.filter((c) => c.techId === t.id && ['checked_in', 'in_progress', 'qc'].includes(c.stage));
    const current = mine.find((c) => c.stage === 'in_progress');
    const over = mine.length >= 3;
    const idle = mine.length === 0;
    return `<div class="cc-tech${over ? ' over' : ''}${idle ? ' idle' : ''}">
      <span class="cc-tech-av">${initials(`${t.firstName} ${t.lastName}`)}</span>
      <div class="cc-tech-info">
        <span class="cc-tech-name">${t.firstName} ${t.lastName[0]}.</span>
        <span class="cc-tech-cur">${current ? `${current.ro} · ${current.vehicle || current.customer}` : (idle ? 'Open' : `${mine.length} queued`)}</span>
        <span class="cc-tech-bar">${Array.from({ length: MAXBAR }, (_, i) => `<i class="${i < mine.length ? 'on' : ''}"></i>`).join('')}</span>
      </div>
      <span class="cc-tech-n">${mine.length}</span>
      ${over ? `<span class="cc-tech-warn" title="Heavy load">!</span>` : ''}
    </div>`;
  }).join('') || '<div class="cc-rail-empty">No technicians</div>';
}

// ---------------------------------------------------------------------------
// CARDS
// ---------------------------------------------------------------------------
function cardHtml(card, hero = false) {
  const st = stageById(card.stage) || LAB_STAGES[0];
  const warns = cardWarnings(card);
  const flags = (card.flags || []).filter((f) => FLAG_META[f]);
  const banner = flags.map((f) => FLAG_META[f]).find((m) => m);
  const custWaiting = flags.includes('customer_waiting');
  const otherFlags = flags.filter((f) => f !== 'customer_waiting');
  const bannerMeta = otherFlags[0] ? FLAG_META[otherFlags[0]] : null;
  const svc = card.services[0] ? card.services[0] + (card.services.length > 1 ? ` +${card.services.length - 1}` : '') : 'No service listed';
  const age = stageAge(card);
  const isExp = hero || expandedCards.has(card.id);
  const tn = techName(card.techId);
  const next = otherFlags.length ? { label: 'Resolve Block', action: 'resolve' }
    : warns.some((w) => w.includes('technician')) ? { label: 'Assign Tech', action: 'qa-tech' }
    : warns.some((w) => w.includes('bay')) ? { label: 'Assign Bay', action: 'qa-bay' }
    : st.next ? { label: st.next.label, action: 'next', to: st.next.to } : null;
  return `
  <div class="cc-card${hero ? ' hero' : ''}" draggable="true" data-id="${card.id}" style="--sc:${st.color}">
    ${bannerMeta ? `<div class="cc-banner" style="background:${bannerMeta.bg};color:${bannerMeta.color}">${bannerMeta.banner}${otherFlags.length > 1 ? ` +${otherFlags.length - 1}` : ''}</div>` : ''}
    ${custWaiting && !bannerMeta ? `<div class="cc-banner gold">Customer Waiting in Lobby</div>` : ''}
    <div class="cc-card-top">
      <span class="cc-ro">${card.ro || 'RO–'}</span>
      <span class="cc-cust">${card.customer}</span>
      ${card.rewards ? `<span class="cc-crown" title="Rewards ${card.rewards}">★</span>` : ''}
      ${custWaiting && bannerMeta ? `<span class="cc-wait-dot" title="Customer waiting in lobby"></span>` : ''}
    </div>
    <div class="cc-veh">${card.vehicle || 'Vehicle not assigned'}</div>
    <div class="cc-svc-row">
      <span class="cc-svc">${svc}</span>
      ${age !== null ? `<span class="cc-age">${fmtDur(age)}</span>` : ''}
    </div>
    ${isExp ? `
    <div class="cc-card-exp">
      <div class="cc-exp-row">
        <span>${fmtMoney(card.total)}</span>
        <span class="cc-counts">${card.notes?.length ? `${card.notes.length} notes` : ''}${card.photos ? ` · ${card.photos} photos` : ''}</span>
      </div>
      ${next ? `<button class="cc-next" data-card-act="${next.action}" data-to="${next.to || ''}" data-cid="${card.id}">${next.label} →</button>` : ''}
    </div>` : ''}
    <div class="cc-card-foot">
      <span class="cc-av${card.techId ? '' : ' un'}" data-qa="tech" title="${tn || 'Assign technician'}">${card.techId ? initials(tn) : '+'}</span>
      <span class="cc-bay-pill${card.bayId ? '' : ' un'}" data-qa="bay">${bayLabel(card.bayId) || 'No bay'}</span>
      ${warns.length ? `<span class="cc-warn" title="${warns.join(' · ')}">!</span>` : ''}
      ${!hero ? `<button class="cc-exp-btn" data-exp="${card.id}">${isExp ? '–' : '+'}</button>` : ''}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// FLOW DECK — three unequal zones (Inbound / On the Floor / Out the Door)
// ---------------------------------------------------------------------------
function visibleCards() {
  let cards = labJobs();
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    cards = cards.filter((c) => (c.ro || '').toLowerCase().includes(q) || c.customer.toLowerCase().includes(q) || (c.vehicle || '').toLowerCase().includes(q));
  }
  return metricFilter(cards);
}

function laneHtml(stage, items, hero = false) {
  return `<div class="cc-lane${hero ? ' hero' : ''}" data-col="${stage.id}" style="--sc:${stage.color}">
    <div class="cc-lane-head">
      <span class="cc-lane-title">${stage.label}</span>
      <span class="cc-lane-n">${items.length}</span>
      ${stage.isCustom ? `<button class="cc-lane-gear" data-gear="${stage.id}" title="Step settings">⚙</button>` : ''}
    </div>
    <div class="cc-lane-body">${items.map((c) => cardHtml(c, hero)).join('') || '<div class="cc-lane-empty">— drop here —</div>'}</div>
  </div>`;
}

function renderFlow() {
  const cards = visibleCards();
  const stages = allStages();
  const by = (id) => cards.filter((c) => c.stage === id);
  const zone = (z) => stages.filter((s) => s.zone === z && s.id !== 'closed');
  const closedCount = cards.filter((c) => c.stage === 'closed').length;
  document.getElementById('cc-flow').innerHTML = `
    <div class="cc-zone inbound">
      <div class="cc-zone-head"><span class="cc-zone-title">Inbound</span><span class="cc-zone-sub">requests · scheduled · arrivals</span></div>
      <div class="cc-zone-lanes">${zone('inbound').map((s) => laneHtml(s, by(s.id))).join('')}</div>
    </div>
    <div class="cc-zone floor">
      <div class="cc-zone-head"><span class="cc-zone-title">On the Floor</span><span class="cc-zone-sub">active work — where the money is made</span></div>
      <div class="cc-zone-lanes">${zone('floor').map((s) => laneHtml(s, by(s.id), true)).join('')}</div>
    </div>
    <div class="cc-zone out">
      <div class="cc-zone-head"><span class="cc-zone-title">Out the Door</span><span class="cc-zone-sub">pickup &amp; close</span></div>
      <div class="cc-zone-lanes">
        ${zone('out').map((s) => laneHtml(s, by(s.id))).join('')}
        <div class="cc-lane closedchip" data-col="closed">
          <div class="cc-lane-head"><span class="cc-lane-title">Closed</span><span class="cc-lane-n">${closedCount}</span></div>
          <div class="cc-lane-body" style="min-height:38px"><div class="cc-lane-empty">drop to close</div></div>
        </div>
      </div>
    </div>`;
}

function renderResourceView(kind) {
  const cards = visibleCards().filter((c) => c.stage !== 'closed');
  let cols;
  if (kind === 'bay') {
    const bays = db.bays() || [];
    cols = [{ id: '', label: 'No Bay', color: '#64748B' },
      ...bays.map((b) => ({ id: b.id, label: b.name, color: '#1F5EE0' })),
      ...LAB_LOCATIONS.map((l) => ({ id: l.id, label: l.name, color: '#0E7490' }))];
  } else {
    const techs = (db.employees() || []).filter((e) => e.isTech);
    cols = [{ id: '', label: 'Unassigned', color: '#64748B' },
      ...techs.map((t) => ({ id: t.id, label: `${t.firstName} ${t.lastName}`, color: '#1F5EE0' }))];
  }
  const key = (c) => kind === 'bay' ? (c.bayId || '') : (c.techId || '');
  document.getElementById('cc-flow').innerHTML = `<div class="cc-zone floor" style="flex:1">
    <div class="cc-zone-head"><span class="cc-zone-title">${kind === 'bay' ? 'By Bay / Location' : 'By Technician'}</span><span class="cc-zone-sub">drop a card to reassign</span></div>
    <div class="cc-zone-lanes">${cols.map((col) => laneHtml({ ...col, isCustom: false }, cards.filter((c) => key(c) === col.id))).join('')}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// ATTENTION RAIL — the manager's queue
// ---------------------------------------------------------------------------
function renderRail() {
  const cards = labJobs();
  const act = activeCards();
  const bays = db.bays() || [];
  const requests = act.filter((c) => c.stage === 'requests');
  const blocked = act.filter((c) => (c.flags || []).some((f) => f !== 'customer_waiting'));
  const waiting = act.filter((c) => (c.flags || []).includes('customer_waiting'));
  const ready = cards.filter((c) => c.stage === 'ready');
  const conflicts = bays.map((b) => ({ bay: b, cars: act.filter((c) => c.bayId === b.id) })).filter((x) => x.cars.length > 1);
  const item = (c, note, tone) => `<div class="cc-rail-item${tone ? ` ${tone}` : ''}" data-open="${c.id}">
    <span class="cc-rail-ro">${c.ro}</span>
    <span class="cc-rail-txt">${c.customer}${note ? ` — ${note}` : ''}</span>
    <span class="cc-rail-age">${fmtDur(stageAge(c))}</span>
  </div>`;
  const sec = (title, n, html, tone) => `<div class="cc-rail-sec">
    <div class="cc-rail-head${tone ? ` ${tone}` : ''}">${title}<span class="cc-rail-count">${n}</span></div>
    ${html || '<div class="cc-rail-empty">Clear</div>'}
  </div>`;
  document.getElementById('cc-rail').innerHTML =
    sec('Needs Reply', requests.length, requests.map((c) => item(c, c.services[0], '')).join(''), '')
    + sec('Blocked', blocked.length, blocked.map((c) => item(c, FLAG_META[(c.flags || []).find((f) => f !== 'customer_waiting')]?.label, 'warn')).join(''), blocked.length ? 'warn' : '')
    + sec('Customer Waiting', waiting.length, waiting.map((c) => item(c, null, 'gold')).join(''), waiting.length ? 'gold' : '')
    + sec('Ready for Pickup', ready.length, ready.map((c) => item(c, fmtMoney(c.total), 'good')).join(''), '')
    + sec('Bay Conflicts', conflicts.length, conflicts.map((x) => `<div class="cc-rail-item warn"><span class="cc-rail-ro">${x.bay.name}</span><span class="cc-rail-txt">${x.cars.length} cars assigned</span></div>`).join(''), conflicts.length ? 'warn' : '');
  document.querySelectorAll('#cc-rail [data-open]').forEach((el) => el.addEventListener('click', () => openLabDrawer(el.dataset.open)));
}

// ---------------------------------------------------------------------------
// Bindings + render root
// ---------------------------------------------------------------------------
function bindFlow() {
  const root = document.getElementById('cc-flow');
  root.querySelectorAll('[data-gear]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openStepSettings(b.dataset.gear); }));
  root.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = b.dataset.exp;
    expandedCards.has(id) ? expandedCards.delete(id) : expandedCards.add(id);
    renderAll();
  }));
  root.querySelectorAll('[data-qa]').forEach((el) => el.addEventListener('click', (e) => {
    e.stopPropagation();
    openQuickAssign(el, el.closest('.cc-card').dataset.id, el.dataset.qa);
  }));
  root.querySelectorAll('[data-card-act]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = b.dataset.cid;
    const act = b.dataset.cardAct;
    if (act === 'resolve') resolveAllFlags(id);
    else if (act === 'qa-tech') openQuickAssign(b, id, 'tech');
    else if (act === 'qa-bay') openQuickAssign(b, id, 'bay');
    else if (b.dataset.to) moveCard(id, b.dataset.to, 'next_action');
  }));
  root.querySelectorAll('.cc-card').forEach((card) => {
    card.addEventListener('click', () => openLabDrawer(card.dataset.id));
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
  root.querySelectorAll('.cc-lane').forEach((lane) => {
    lane.addEventListener('dragover', (e) => { e.preventDefault(); lane.classList.add('over'); });
    lane.addEventListener('dragleave', () => lane.classList.remove('over'));
    lane.addEventListener('drop', (e) => {
      e.preventDefault(); lane.classList.remove('over');
      const dragging = document.querySelector('.cc-card.dragging');
      if (!dragging) return;
      const id = dragging.dataset.id;
      const key = lane.dataset.col;
      if (viewMode === 'bay') { assignBay(id, key || null); renderAll(); }
      else if (viewMode === 'tech') { assignTech(id, key || null); renderAll(); }
      else moveCard(id, key, 'drag');
    });
  });
}

function renderAll() {
  renderCommandStrip();
  renderBayMap();
  renderTechRack();
  if (viewMode === 'flow') renderFlow();
  else renderResourceView(viewMode);
  bindFlow();
  renderRail();
}

// ---------------------------------------------------------------------------
// Drawer — Overview / Activity / Details (same concept, command-center skin)
// ---------------------------------------------------------------------------
let drawerCardId = null;
let drawerTab = 'overview';
function closeLabDrawer() { drawerCardId = null; document.getElementById('lab-overlay').classList.remove('open'); }

function openLabDrawer(cardId, tab = 'overview') {
  const card = labJobs().find((c) => c.id === cardId);
  if (!card) return;
  drawerCardId = cardId; drawerTab = tab;
  const st = stageById(card.stage) || LAB_STAGES[0];
  const flags = (card.flags || []);
  document.getElementById('lab-drawer-title').textContent = `${card.ro || 'RO–'} — ${card.customer}`;
  document.getElementById('lab-drawer-sub').textContent = card.vehicle;
  const tabBtn = (id, label) => `<button class="lab-dtab${drawerTab === id ? ' active' : ''}" data-dtab="${id}">${label}</button>`;
  let body = `<div class="lab-dtabs">${tabBtn('overview', 'Overview')}${tabBtn('activity', 'Activity')}${tabBtn('details', 'Details')}</div>`;

  if (drawerTab === 'overview') {
    const next = st.next;
    body += `
      <div class="lab-dsec">
        <div class="lab-dlabel">Current stage</div>
        <span class="lab-stage-chip" style="background:${st.color}14;color:${st.color}">${st.label}</span>
        ${flags.map((f) => FLAG_META[f] ? `<span class="lab-stage-chip" style="background:${FLAG_META[f].bg};color:${FLAG_META[f].color}">${FLAG_META[f].label}</span>` : '').join('')}
      </div>
      <div class="lab-dsec lab-dactions">
        ${flags.filter((f) => f !== 'customer_waiting').length ? `<button class="lab-btn primary" data-act="resolve">Resolve Block</button>` : ''}
        ${next ? `<button class="lab-btn primary" data-act="move" data-to="${next.to}">${next.label} →</button>` : ''}
        <button class="lab-btn" data-act="qa-tech">Assign tech</button>
        <button class="lab-btn" data-act="qa-bay">Assign bay</button>
      </div>
      <div class="lab-dsec">
        <div class="lab-dlabel">Pause / flag</div>
        <div class="lab-dactions">
          ${['approval', 'parts', 'customer_waiting', 'needs_manager'].map((f) =>
            `<button class="lab-btn sm${flags.includes(f) ? ' on' : ''}" data-flag="${f}">${FLAG_META[f].label}</button>`).join('')}
        </div>
      </div>
      <div class="lab-dsec">
        <div class="lab-dlabel">Services</div>
        ${card.services.length ? card.services.map((s) => `<div class="lab-drow">${s}</div>`).join('') : '<div class="lab-drow muted">None listed</div>'}
      </div>
      <div class="lab-dsec"><div class="lab-dlabel">Money</div><div class="lab-drow"><b>${fmtMoney(card.total)}</b> estimated total</div></div>
      <div class="lab-dsec"><div class="lab-dlabel">Assignment</div>
        <div class="lab-drow">Tech: ${techName(card.techId) || '—'}</div>
        <div class="lab-drow">Bay: ${bayLabel(card.bayId) || '—'}</div>
      </div>`;
  } else if (drawerTab === 'activity') {
    const notes = (card.notes || []).map((n) => ({ at: n.at, label: `Note — ${n.author}: ${n.body}` }));
    const hist = (card.stageHistory || []).map((h) => ({ at: h.at, label: `Entered ${stageById(h.stage)?.label || h.stage}${h.prevMinutes ? ` (prev stage ${fmtDur(h.prevMinutes)})` : ''}` }));
    const acts = (card.activity || []).map((a) => ({ at: a.at, label: a.label }));
    const timeline = [...notes, ...hist, ...acts].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    body += `
      <div class="lab-dsec">
        <div class="lab-dlabel">Add note</div>
        <div style="display:flex;gap:6px"><input id="lab-note-input" class="lab-input" placeholder="Internal note…" style="flex:1"><button class="lab-btn primary" data-act="add-note">Add</button></div>
      </div>
      <div class="lab-dsec"><div class="lab-dlabel">Photos</div><div class="lab-drow">${card.photos ? `${card.photos} photo${card.photos !== 1 ? 's' : ''} attached (view in main scheduler)` : 'No photos'}</div></div>
      <div class="lab-dsec"><div class="lab-dlabel">Timeline</div>
        ${timeline.length ? timeline.map((t) => `<div class="lab-drow"><span class="muted" style="font-size:10px">${t.at ? new Date(t.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span><br>${t.label}</div>`).join('') : '<div class="lab-drow muted">No activity yet</div>'}
      </div>`;
  } else {
    const age = stageAge(card);
    body += `
      <div class="lab-dsec"><div class="lab-dlabel">Timing</div>
        <div class="lab-drow">In current stage: ${age !== null ? fmtDur(age) : '—'}</div>
        <div class="lab-drow">Scheduled date: ${card.date || '—'}</div>
      </div>
      <div class="lab-dsec"><div class="lab-dlabel">Source</div><div class="lab-drow">${card.source === 'walk_in' ? 'Walk-in' : 'Online booking'}</div></div>
      <div class="lab-dsec"><div class="lab-dlabel">Visit type</div><div class="lab-drow">${card.visitType === 'wait' ? 'Customer waits at shop' : card.visitType === 'drop_off' ? 'Drop-off' : '—'}</div></div>
      <div class="lab-dsec"><div class="lab-dlabel">Rewards</div><div class="lab-drow">${card.rewards ? `${card.rewards.charAt(0).toUpperCase() + card.rewards.slice(1)} member` : 'Not enrolled'}</div></div>
      <div class="lab-dsec"><div class="lab-dlabel">Internal flags</div><div class="lab-drow">${flags.length ? flags.map((f) => FLAG_META[f]?.label || f).join(', ') : 'None'}</div></div>`;
  }

  const bodyEl = document.getElementById('lab-drawer-body');
  bodyEl.innerHTML = body;
  bodyEl.querySelectorAll('[data-dtab]').forEach((b) => b.addEventListener('click', () => openLabDrawer(cardId, b.dataset.dtab)));
  bodyEl.querySelector('[data-act="resolve"]')?.addEventListener('click', () => resolveAllFlags(cardId));
  bodyEl.querySelector('[data-act="move"]')?.addEventListener('click', (e) => { moveCard(cardId, e.target.dataset.to, 'drawer'); openLabDrawer(cardId, 'overview'); });
  bodyEl.querySelector('[data-act="qa-tech"]')?.addEventListener('click', (e) => openQuickAssign(e.target, cardId, 'tech'));
  bodyEl.querySelector('[data-act="qa-bay"]')?.addEventListener('click', (e) => openQuickAssign(e.target, cardId, 'bay'));
  bodyEl.querySelectorAll('[data-flag]').forEach((b) => b.addEventListener('click', () => toggleFlag(cardId, b.dataset.flag)));
  bodyEl.querySelector('[data-act="add-note"]')?.addEventListener('click', () => {
    const inp = document.getElementById('lab-note-input');
    const v = (inp?.value || '').trim();
    if (!v) return;
    updateCard(cardId, (c) => { c.notes = c.notes || []; c.notes.push({ author: 'You', body: v, at: new Date().toISOString() }); logActivity(c, 'Note added'); });
    openLabDrawer(cardId, 'activity');
    renderAll();
  });
  document.getElementById('lab-overlay').classList.add('open');
}

// ---------------------------------------------------------------------------
// Custom steps / walk-in / settings (sheet modals)
// ---------------------------------------------------------------------------
function openSheet(title, html) {
  drawerCardId = null;
  document.getElementById('lab-drawer-title').textContent = title;
  document.getElementById('lab-drawer-sub').textContent = '';
  document.getElementById('lab-drawer-body').innerHTML = html;
  document.getElementById('lab-overlay').classList.add('open');
}
const closeSheet = closeLabDrawer;

function openCustomStepModal() {
  openSheet('New Custom Step', `
    <div class="lab-dsec"><div class="lab-dlabel">Name</div><input id="cs-name" class="lab-input" placeholder="e.g. Alignment Rack"></div>
    <div class="lab-dsec"><div class="lab-dlabel">Group</div>
      <select id="cs-group" class="lab-input">${Object.entries(GROUP_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
    <div class="lab-dsec"><div class="lab-dlabel">Color</div>
      <select id="cs-color" class="lab-input">${Object.keys(STEP_COLORS).map((c) => `<option value="${c}">${c}</option>`).join('')}</select></div>
    <button class="lab-btn primary" id="cs-save">Create step</button>`);
  document.getElementById('cs-save').addEventListener('click', () => {
    const name = (document.getElementById('cs-name').value || '').trim();
    if (!name) { toast('Name required.', 'error'); return; }
    const steps = labSteps();
    steps.push({ id: 'lstep_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30), label: name, group: document.getElementById('cs-group').value, color: document.getElementById('cs-color').value });
    saveLabSteps(steps);
    closeSheet(); renderAll(); toast('Custom step added.');
  });
}

function openStepSettings(stepId) {
  const step = labSteps().find((s) => s.id === stepId);
  if (!step) return;
  const inStep = labJobs().filter((c) => c.stage === stepId).length;
  openSheet(`Step Settings — ${step.label}`, `
    <div class="lab-dsec"><div class="lab-dlabel">Label</div><input id="ss-label" class="lab-input" value="${step.label}"></div>
    <div class="lab-dsec"><div class="lab-dlabel">Group</div>
      <select id="ss-group" class="lab-input">${Object.entries(GROUP_LABELS).map(([v, l]) => `<option value="${v}"${step.group === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    <div style="display:flex;gap:6px;margin-top:8px">
      <button class="lab-btn primary" id="ss-save">Save</button>
      <button class="lab-btn" id="ss-hide">${step.hidden ? 'Show' : 'Hide'}</button>
      <button class="lab-btn danger" id="ss-del" ${inStep ? 'disabled title="Move cards out first"' : ''}>Delete</button>
    </div>
    ${inStep ? `<div class="lab-drow" style="color:#B91C1C;margin-top:6px">${inStep} card${inStep !== 1 ? 's' : ''} in this step — move them before deleting.</div>` : ''}`);
  document.getElementById('ss-save').addEventListener('click', () => {
    const steps = labSteps();
    const s = steps.find((x) => x.id === stepId);
    s.label = document.getElementById('ss-label').value.trim() || s.label;
    s.group = document.getElementById('ss-group').value;
    saveLabSteps(steps);
    closeSheet(); renderAll(); toast('Saved.');
  });
  document.getElementById('ss-hide').addEventListener('click', () => {
    const steps = labSteps();
    const s = steps.find((x) => x.id === stepId);
    s.hidden = !s.hidden;
    saveLabSteps(steps);
    closeSheet(); renderAll();
  });
  document.getElementById('ss-del').addEventListener('click', () => {
    if (labJobs().some((c) => c.stage === stepId)) { toast('Move cards out first.', 'error'); return; }
    if (!window.confirm('Delete this custom step? This cannot be undone.')) return;
    saveLabSteps(labSteps().filter((s) => s.id !== stepId));
    closeSheet(); renderAll(); toast('Step deleted.');
  });
}

function openBoardSettings() {
  const steps = labSteps();
  openSheet('Board Settings', `
    <div class="lab-dsec"><div class="lab-dlabel">Custom steps</div>
      ${steps.length ? steps.map((s) => `<div class="lab-drow" style="display:flex;justify-content:space-between;align-items:center">
        <span>${s.label} <span class="muted">(${GROUP_LABELS[s.group] || s.group}${s.hidden ? ' · hidden' : ''})</span></span>
        <button class="lab-btn sm" data-edit-step="${s.id}">Edit</button></div>`).join('') : '<div class="lab-drow muted">None yet</div>'}
      <button class="lab-btn" id="bs-add-step" style="margin-top:6px">+ Custom Step</button>
    </div>
    <div class="lab-dsec"><div class="lab-dlabel">Lab workspace</div>
      <button class="lab-btn danger" id="bs-reset">Reset Lab Workspace</button>
      <div class="lab-drow muted" style="margin-top:4px">Wipes lab cards/steps and re-clones from the main scheduler. Production data is never touched.</div>
    </div>`);
  document.getElementById('bs-add-step').addEventListener('click', () => { closeSheet(); openCustomStepModal(); });
  document.querySelectorAll('[data-edit-step]').forEach((b) => b.addEventListener('click', () => { closeSheet(); openStepSettings(b.dataset.editStep); }));
  document.getElementById('bs-reset').addEventListener('click', () => {
    if (!window.confirm('Reset the lab workspace? All lab changes are lost and data is re-cloned from the main scheduler.')) return;
    Object.values(LAB_KEYS).forEach((k) => localStorage.removeItem(k));
    seedLab(true);
    focusMetric = null; viewMode = 'flow';
    closeSheet(); renderAll(); toast('Lab workspace reset.');
  });
}

function openWalkInModal() {
  openSheet('New Walk-In', `
    <div class="lab-dsec"><div class="lab-dlabel">Customer</div><input id="wi-cust" class="lab-input" placeholder="Name"></div>
    <div class="lab-dsec"><div class="lab-dlabel">Vehicle</div><input id="wi-veh" class="lab-input" placeholder="e.g. 2019 Silverado 1500"></div>
    <div class="lab-dsec"><div class="lab-dlabel">Service</div><input id="wi-svc" class="lab-input" placeholder="e.g. Brake inspection"></div>
    <div class="lab-dsec"><label style="font-size:12px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="wi-wait"> Customer waits at shop</label></div>
    <button class="lab-btn primary" id="wi-save">Create — goes to Checked In</button>`);
  document.getElementById('wi-save').addEventListener('click', () => {
    const cust = (document.getElementById('wi-cust').value || '').trim();
    if (!cust) { toast('Customer name required.', 'error'); return; }
    const waits = document.getElementById('wi-wait').checked;
    const jobs = labJobs();
    jobs.push({
      id: 'lab_wi_' + Date.now().toString(36),
      ro: 'LAB-' + String(jobs.length + 1).padStart(3, '0'),
      customer: cust,
      vehicle: (document.getElementById('wi-veh').value || '').trim(),
      services: [(document.getElementById('wi-svc').value || '').trim()].filter(Boolean),
      stage: 'checked_in', flags: waits ? ['customer_waiting'] : [],
      techId: null, bayId: null, total: 0, visitType: waits ? 'wait' : 'drop_off', source: 'walk_in',
      notes: [], photos: 0, rewards: null, date: new Date().toISOString().slice(0, 10),
      stageEnteredAt: new Date().toISOString(),
      stageHistory: [{ stage: 'checked_in', at: new Date().toISOString(), via: 'walk_in' }],
      activity: [{ label: 'Walk-in created', at: new Date().toISOString() }],
    });
    saveLabJobs(jobs);
    closeSheet(); renderAll(); toast('Walk-in checked in.');
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export function renderLab() {
  db.init?.();
  seedLab();

  ['flow', 'bay', 'tech'].forEach((v) => document.getElementById(`cc-view-${v}`).addEventListener('click', () => {
    viewMode = v; patchView({ viewMode });
    document.querySelectorAll('.cc-viewbtn').forEach((b) => b.classList.remove('active'));
    document.getElementById(`cc-view-${v}`).classList.add('active');
    renderAll();
  }));
  document.getElementById(`cc-view-${viewMode}`)?.classList.add('active');

  document.getElementById('cc-search').addEventListener('input', (e) => { searchTerm = e.target.value; renderAll(); });
  document.getElementById('cc-walkin').addEventListener('click', openWalkInModal);
  document.getElementById('cc-addstep').addEventListener('click', openCustomStepModal);
  document.getElementById('cc-settings').addEventListener('click', openBoardSettings);

  document.getElementById('lab-overlay').addEventListener('click', (e) => { if (e.target.id === 'lab-overlay') closeLabDrawer(); });
  document.getElementById('lab-drawer-close').addEventListener('click', closeLabDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeQA(); closeLabDrawer(); } });

  // Live clock in the header
  const clock = () => { const el = document.getElementById('cc-clock'); if (el) el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  clock(); setInterval(clock, 30000);

  renderAll();
  setInterval(renderAll, 60000); // live stage timers
}
