// AutoBook — modules/live-monitor.js
// Shop floor display board — dark kanban layout (Clever Bear AutoBook design).
// Three drag paths, unchanged from v1 — each goes through a sanctioned util
// lifecycle transition: waiting → in_progress (util.startJob), bay → bay
// (util.moveToBay), bay → waiting (util.returnToWaiting). No status field is
// ever set directly.

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import { toast } from '../lib/nav.js';

export function renderLiveMonitor() {
  initShopName();
  startClock();
  renderCounts();
  renderBays();
  renderLanes();
  wireQueueDropZone();
}

function initShopName() {
  const el = document.getElementById('mon-shop-name');
  if (el) el.textContent = db.settings()?.shopName || 'Shop Monitor';
}

function startClock() {
  const tick = () => {
    const now = new Date();
    const clockEl = document.getElementById('clock');
    const dateEl  = document.getElementById('mon-date');
    if (clockEl) clockEl.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    if (dateEl)  dateEl.textContent  = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };
  tick();
  setInterval(tick, 1000);
}

function activeJobs() {
  return db.jobs().filter((j) => !['cancelled', 'closed'].includes(j.status));
}

function renderCounts() {
  const jobs = activeJobs();
  const el = document.getElementById('mon-counts');
  if (!el) return;
  const counts = [
    { label: 'Scheduled', num: jobs.filter((j) => j.status === 'scheduled').length,  cls: 'c-gray' },
    { label: 'Waiting',   num: jobs.filter((j) => j.status === 'waiting').length,    cls: 'c-amber' },
    { label: 'In Bay',    num: jobs.filter((j) => j.status === 'in_progress').length, cls: 'c-blue' },
    { label: 'On Hold',   num: jobs.filter((j) => j.status === 'on_hold').length,    cls: 'c-orange' },
    { label: 'Ready',     num: jobs.filter((j) => j.status === 'ready' || j.status === 'invoiced').length, cls: 'c-green' },
  ];
  el.innerHTML = counts.map((c) => `
    <div class="mon-count-item ${c.cls}">
      <div class="mon-count-num">${c.num}</div>
      <div class="mon-count-label">${c.label}</div>
    </div>`).join('');
}

// ── Animation class by status ────────────────────────────────────────────────
function animClass(status) {
  if (status === 'scheduled')  return 'mon-anim-float';
  if (status === 'waiting')    return 'mon-anim-shimmer';
  if (status === 'in_progress') return 'mon-anim-glow-blue';
  if (status === 'on_hold')    return 'mon-anim-glow-amber';
  if (status === 'ready' || status === 'invoiced') return 'mon-anim-glow-green';
  return '';
}

function fmtAge(ts) {
  if (!ts) return '';
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (isNaN(mins) || mins < 0) return '';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function techName(techId) {
  const t = db.techById(techId);
  return t ? `${t.firstName || ''} ${t.lastName || ''}`.trim() || 'Unassigned' : 'Unassigned';
}

function cardHtml(job, opts = {}) {
  const v  = db.vehicleById(job.vehicleId);
  const c  = db.customerById(job.customerId);
  const vehicle  = util.vehicleLabel(v)  || 'No vehicle';
  const customer = util.customerName(c)  || 'No customer';
  const service  = job.lineItems?.[0]?.name || job.lineItems?.[0]?.description || '';
  const ro = job.ro || job.roNumber || '';
  const age = fmtAge(job.updatedAt || job.scheduledDate);
  const anim = animClass(job.status);
  const fromBayAttr = opts.fromBay ? `data-from-bay="${opts.fromBay}"` : '';

  return `
    <div class="mon-card ${anim}" draggable="true" data-job-id="${job.id}" ${fromBayAttr}>
      ${ro ? `<div class="mon-card-ro">${ro}</div>` : ''}
      <div class="mon-card-vehicle">${vehicle}</div>
      <div class="mon-card-customer">${customer}</div>
      ${service ? `<div class="mon-card-service">${service}</div>` : ''}
      <div class="mon-card-footer">
        <span class="mon-card-tech">${techName(job.techId)}</span>
        ${age ? `<span class="mon-card-age">${age}</span>` : ''}
      </div>
    </div>`;
}

// ── Bay board ────────────────────────────────────────────────────────────────
function renderBays() {
  const bays = db.bays();
  const el   = document.getElementById('bay-grid');
  if (!el) return;

  el.innerHTML = bays.map((bay) => {
    const t   = db.techById(bay.techId);
    const job = db.jobs().find((j) => j.bayId === bay.id && j.status === 'in_progress');
    const tName = t ? `${t.firstName || ''} ${t.lastName || ''}`.trim() || 'Unassigned' : 'Unassigned';

    let body;
    if (job) {
      const v  = db.vehicleById(job.vehicleId);
      const c  = db.customerById(job.customerId);
      const mk = util.makeBadge(v?.make);
      const vehicle  = util.vehicleLabel(v)  || 'No vehicle';
      const customer = util.customerName(c)  || 'No customer';
      const service  = job.lineItems?.[0]?.name || job.lineItems?.[0]?.description || '';
      body = `
        <div class="mon-bay-job mon-anim-glow-blue" draggable="true" data-job-id="${job.id}" data-from-bay="${bay.id}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
            <span class="mon-bay-make" style="background:${mk.bg};color:${mk.txt}">${mk.letter}</span>
            <div>
              <div class="mon-bay-vehicle">${vehicle}</div>
              <div class="mon-bay-customer">${customer}</div>
            </div>
          </div>
          ${service ? `<div class="mon-bay-service">${service}</div>` : ''}
          <div><span class="mon-pill p-blue"><span class="mon-pill-dot" style="background:#2563EB"></span>In Progress</span></div>
        </div>`;
    } else {
      body = `<div class="mon-bay-empty"><span class="mon-avail-dot"></span>Available</div>`;
    }

    return `
      <div class="mon-bay ${job ? 'occupied' : 'available'}" data-bay-id="${bay.id}">
        <div class="mon-bay-head">
          <span class="mon-bay-name">${bay.name}</span>
          <span class="mon-bay-tech">${tName}</span>
        </div>
        ${body}
      </div>`;
  }).join('');

  // Drag events on bay job cards
  el.querySelectorAll('.mon-bay-job').forEach((card) => {
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend',   () => card.classList.remove('dragging'));
  });

  // Drop targets on bay cards
  el.querySelectorAll('.mon-bay').forEach((bayEl) => {
    bayEl.addEventListener('dragover', (e) => { e.preventDefault(); bayEl.classList.add('drag-over'); });
    bayEl.addEventListener('dragleave', () => bayEl.classList.remove('drag-over'));
    bayEl.addEventListener('drop', (e) => {
      e.preventDefault();
      bayEl.classList.remove('drag-over');
      const dragging = document.querySelector('.dragging');
      if (!dragging) return;
      const jobId    = dragging.dataset.jobId;
      const bayId    = bayEl.dataset.bayId;
      const fromBayId = dragging.dataset.fromBay || null;
      if (fromBayId === bayId) return;

      const bay      = db.bayById(bayId);
      const occupied = db.jobs().some((j) => j.bayId === bayId && j.status === 'in_progress' && j.id !== jobId);
      if (occupied) {
        toast(`${bay?.name || 'That bay'} is occupied — move that job out first.`, 'error');
        return;
      }
      try {
        if (fromBayId) {
          util.moveToBay(jobId, bayId);
          toast(`Job moved to ${bay?.name || 'the bay'}.`, 'success');
        } else {
          util.startJob(jobId, bayId, bay?.techId);
          toast(`Job started in ${bay?.name || 'the bay'}.`, 'success');
        }
        renderCounts();
        renderBays();
        renderLanes();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

// ── Status lanes ─────────────────────────────────────────────────────────────
const LANES = [
  {
    id:    'lane-scheduled',
    cls:   'l-scheduled',
    title: 'Scheduled',
    filter: (j) => j.status === 'scheduled',
  },
  {
    id:      'lane-waiting',
    cls:     'l-waiting',
    title:   'Queue / Waiting',
    isQueue: true,
    filter:  (j) => j.status === 'waiting',
  },
  {
    id:    'lane-hold',
    cls:   'l-approval',
    title: 'On Hold',
    filter: (j) => j.status === 'on_hold',
  },
  {
    id:    'lane-ready',
    cls:   'l-ready',
    title: 'Ready for Pickup',
    filter: (j) => j.status === 'ready' || j.status === 'invoiced',
  },
];

function renderLanes() {
  const el = document.getElementById('mon-lanes');
  if (!el) return;
  // Exclude in_progress (shown on bay cards) and closed/cancelled
  const jobs = activeJobs().filter((j) => j.status !== 'in_progress');

  el.innerHTML = LANES.map((lane) => {
    const laneJobs = jobs.filter(lane.filter);
    const cards    = laneJobs.map((j) => cardHtml(j)).join('');
    return `
      <div class="mon-lane ${lane.cls}" data-lane-id="${lane.id}">
        <div class="mon-lane-head">
          <span class="mon-lane-title">${lane.title}</span>
          <span class="mon-lane-count">${laneJobs.length}</span>
        </div>
        <div class="mon-lane-cards${lane.isQueue ? ' mon-queue-cards' : ''}" id="${lane.id}">
          ${cards || '<div class="mon-lane-empty">—</div>'}
        </div>
      </div>`;
  }).join('');

  // Drag events on lane cards
  el.querySelectorAll('.mon-card[draggable="true"]').forEach((card) => {
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend',   () => card.classList.remove('dragging'));
  });
}

// Waiting-queue drop zone: only accepts a bay job being returned to waiting.
// Delegated on #mon-lanes (which persists across renderLanes() re-renders)
// with closest('#lane-waiting') check so only the right column accepts drops.
function wireQueueDropZone() {
  const lanesEl = document.getElementById('mon-lanes');
  if (!lanesEl) return;

  lanesEl.addEventListener('dragover', (e) => {
    const qEl = e.target.closest('#lane-waiting');
    if (!qEl) return;
    e.preventDefault();
    qEl.classList.add('drag-over');
  });
  lanesEl.addEventListener('dragleave', (e) => {
    const qEl = e.target.closest('#lane-waiting');
    if (qEl) qEl.classList.remove('drag-over');
  });
  lanesEl.addEventListener('drop', (e) => {
    const qEl = e.target.closest('#lane-waiting');
    if (!qEl) return;
    e.preventDefault();
    qEl.classList.remove('drag-over');
    const dragging = document.querySelector('.dragging');
    if (!dragging) return;
    const fromBayId = dragging.dataset.fromBay;
    if (!fromBayId) return;  // queue → queue drag is a no-op
    const jobId = dragging.dataset.jobId;
    try {
      util.returnToWaiting(jobId);
      toast('Job returned to the waiting queue.', 'success');
      renderCounts();
      renderBays();
      renderLanes();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
