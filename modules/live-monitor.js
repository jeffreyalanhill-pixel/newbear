// AutoBook — modules/live-monitor.js (§11.6)
// Floor display + dispatch. Three drag paths, none of which ever set
// ro.status directly — each goes through a sanctioned util lifecycle
// transition: waiting/on_hold -> in_progress (util.startJob), bay -> bay
// (util.moveToBay, status untouched), bay -> waiting (util.returnToWaiting).

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import { toast } from '../lib/nav.js';

export function renderLiveMonitor() {
  startClock();
  renderQueue();
  renderBays();
  wireQueueDropZone();
}

function startClock() {
  const tick = () => {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  };
  tick();
  setInterval(tick, 1000);
}

function renderQueue() {
  const waiting = db.jobs().filter((j) => j.status === 'waiting');
  document.getElementById('queue-list').innerHTML = waiting.length
    ? waiting.map((j) => {
        const v = db.vehicleById(j.vehicleId);
        const c = db.customerById(j.customerId);
        const mk = util.makeBadge(v?.make);
        return `
        <div class="queue-card" draggable="true" data-job-id="${j.id}" style="margin-bottom:var(--s3)">
          <div class="queue-top">
            <span class="make-badge" style="background:${mk.bg};color:${mk.txt}">${mk.letter}</span>
            <span class="queue-name">${util.vehicleLabel(v)}</span>
          </div>
          <div class="queue-sub">${util.customerName(c)} · ${j.lineItems?.[0]?.name || ''}</div>
        </div>`;
      }).join('')
    : `<div class="queue-sub" style="padding:var(--s4) 0">No jobs waiting.</div>`;

  document.querySelectorAll('.queue-card').forEach((card) => {
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
}

function renderBays() {
  const bays = db.bays();
  document.getElementById('bay-grid').innerHTML = bays.map((bay) => {
    const tech = db.techById(bay.techId);
    const job = db.jobs().find((j) => j.bayId === bay.id && j.status === 'in_progress');
    let body;
    if (job) {
      const v = db.vehicleById(job.vehicleId);
      const c = db.customerById(job.customerId);
      const mk = util.makeBadge(v?.make);
      body = `
        <div class="bay-job-card" draggable="true" data-job-id="${job.id}" data-from-bay="${bay.id}">
          <span class="bay-job-make" style="background:${mk.bg};color:${mk.txt}">${mk.letter}</span>
          <div class="bay-job-vehicle">${util.vehicleLabel(v)}</div>
          <div class="bay-job-sub">${util.customerName(c)} · ${job.lineItems?.[0]?.name || ''}</div>
        </div>`;
    } else {
      body = `<div class="bay-empty">Available — drop a job here</div>`;
    }
    return `
      <div class="bay-card" data-bay-id="${bay.id}">
        <div class="bay-head">
          <span class="bay-name">${bay.name}</span>
          <span class="bay-tech">${tech ? tech.firstName + ' ' + tech.lastName : 'Unassigned'}</span>
        </div>
        ${body}
      </div>`;
  }).join('');

  document.querySelectorAll('.bay-job-card').forEach((card) => {
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  document.querySelectorAll('.bay-card').forEach((card) => {
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const dragging = document.querySelector('.dragging');
      if (!dragging) return;
      const jobId = dragging.dataset.jobId;
      const bayId = card.dataset.bayId;
      const fromBayId = dragging.dataset.fromBay || null;

      // Dropped a bay job back onto its own bay — no-op, nothing changed.
      if (fromBayId === bayId) return;

      const bay = db.bayById(bayId);
      // Occupied-bay guard covers all three drag paths (queue->bay, bay->bay,
      // and implicitly protects against a stale drop after a race): never
      // silently overwrite a job that's already in this bay.
      const occupied = db.jobs().some((j) => j.bayId === bayId && j.status === 'in_progress' && j.id !== jobId);
      if (occupied) {
        toast(`${bay.name} is occupied — move that job out first.`, 'error');
        return;
      }
      try {
        if (fromBayId) {
          util.moveToBay(jobId, bayId);
          toast(`Job moved to ${bay.name}.`, 'success');
        } else {
          util.startJob(jobId, bayId, bay.techId);
          toast(`Job started in ${bay.name}.`, 'success');
        }
        renderQueue();
        renderBays();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

// Waiting-queue drop zone: only accepts a job dragged out of a bay (queue
// cards dragged onto the queue list are a no-op — there's nowhere to move).
// Wired once in renderLiveMonitor since #queue-list itself is never replaced,
// only its innerHTML.
function wireQueueDropZone() {
  const queueList = document.getElementById('queue-list');
  queueList.addEventListener('dragover', (e) => {
    e.preventDefault();
    queueList.classList.add('drag-over');
  });
  queueList.addEventListener('dragleave', () => queueList.classList.remove('drag-over'));
  queueList.addEventListener('drop', (e) => {
    e.preventDefault();
    queueList.classList.remove('drag-over');
    const dragging = document.querySelector('.dragging');
    if (!dragging) return;
    const fromBayId = dragging.dataset.fromBay;
    if (!fromBayId) return;
    const jobId = dragging.dataset.jobId;
    try {
      util.returnToWaiting(jobId);
      toast('Job returned to the waiting queue.', 'success');
      renderQueue();
      renderBays();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
