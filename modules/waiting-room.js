// AutoBook — modules/waiting-room.js (§11.7)
// Customer-facing lobby TV: Now Serving (rotates through in_progress jobs)
// + Queue (everything else active, ready-for-pickup floats to top, green).
// Privacy: masked names (util.customerShort) and ticket IDs (util.ticketId)
// instead of real RO numbers — never prices, full names, or addresses.

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';

const ROWS_PER_PAGE = 5;
const PAGINATION_SPEED_MS = 15000;
const ROTATION_SPEED_MS = 8000;

let nowServingIndex = 0;
let queuePage = 0;

export function renderWaitingRoom() {
  document.getElementById('shop-name').textContent = db.settings().name || 'AutoBook';
  startClock();
  render();
  setInterval(render, 20000); // §11.7: 20s localStorage-poll fallback for live data
  setInterval(rotateNowServing, ROTATION_SPEED_MS);
  setInterval(paginateQueue, PAGINATION_SPEED_MS);
}

function startClock() {
  const tick = () => {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  };
  tick();
  setInterval(tick, 1000);
}

function activeData() {
  const active = db.activeJobs().filter((j) => !['cancelled', 'closed'].includes(j.status));
  const ready = db.jobs().filter((j) => j.status === 'ready');
  return { active, ready };
}

function render() {
  document.getElementById('last-updated').textContent = `Last updated ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  renderNowServing();
  renderQueue();
}

function nowServingJobs() {
  return db.activeJobs().filter((j) => j.status === 'in_progress');
}

function renderNowServing() {
  const jobs = nowServingJobs();
  const el = document.getElementById('now-serving');
  if (!jobs.length) {
    el.innerHTML = `<div class="ns-name">No vehicles currently in service.</div>`;
    return;
  }
  if (nowServingIndex >= jobs.length) nowServingIndex = 0;
  const job = jobs[nowServingIndex];
  const v = db.vehicleById(job.vehicleId);
  const c = db.customerById(job.customerId);
  const mk = util.makeBadge(v?.make);
  const status = util.customerStatus(job);
  const statusColor = { green: '#5CD98A', amber: 'var(--amber)', blue: '#7AA2FF', gray: 'var(--panel-txt)' }[status.color] || '#fff';

  el.innerHTML = `
    <div class="ns-ticket">${util.ticketId(job.id)}</div>
    <div class="ns-make" style="background:${mk.bg};color:${mk.txt}">${mk.letter}</div>
    <div class="ns-vehicle">${util.vehicleLabel(v)}</div>
    <div class="ns-name">${util.customerShort(c)}</div>
    <div class="ns-status" style="background:rgba(255,255,255,.08);color:${statusColor}">${status.text}</div>
  `;
}

function rotateNowServing() {
  const jobs = nowServingJobs();
  if (jobs.length > 1) {
    nowServingIndex = (nowServingIndex + 1) % jobs.length;
    renderNowServing();
  }
}

function queueJobs() {
  // everything active that isn't currently "now serving", plus ready jobs;
  // ready-for-pickup floats to the top and renders green.
  const { active, ready } = activeData();
  const waitingOrHold = active.filter((j) => j.status !== 'in_progress');
  const combined = [...ready, ...waitingOrHold, ...active.filter((j) => j.status === 'in_progress')];
  // de-dupe (a job could theoretically appear once) and sort ready-first
  const seen = new Set();
  const unique = combined.filter((j) => (seen.has(j.id) ? false : (seen.add(j.id), true)));
  return unique.sort((a, b) => (a.status === 'ready') - (b.status === 'ready')).reverse();
}

function renderQueue() {
  const jobs = queueJobs();
  const totalPages = Math.max(1, Math.ceil(jobs.length / ROWS_PER_PAGE));
  if (queuePage >= totalPages) queuePage = 0;
  const pageJobs = jobs.slice(queuePage * ROWS_PER_PAGE, queuePage * ROWS_PER_PAGE + ROWS_PER_PAGE);

  document.getElementById('queue-body').innerHTML = pageJobs.length
    ? pageJobs.map((j) => {
        const v = db.vehicleById(j.vehicleId);
        const c = db.customerById(j.customerId);
        const status = util.customerStatus(j);
        const isReady = j.status === 'ready';
        return `
        <div class="queue-row${isReady ? ' ready' : ''}">
          <span class="queue-ticket">${util.ticketId(j.id)}</span>
          <span class="queue-name">${util.customerShort(c)}</span>
          <span class="queue-vehicle">${util.vehicleLabel(v)}</span>
          <span class="queue-next">${status.text}${isReady ? ' ✓' : ''}</span>
        </div>`;
      }).join('')
    : `<div class="queue-row"><span class="queue-name" style="grid-column:1/-1;text-align:center">The lobby queue is empty.</span></div>`;
}

function paginateQueue() {
  queuePage += 1;
  renderQueue();
}
