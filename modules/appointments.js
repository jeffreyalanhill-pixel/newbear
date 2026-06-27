// AutoBook — modules/appointments.js (§11.5)
// Confirmation queue (Booking -> RepairOrder via util.confirmBooking) + a
// day schedule of scheduled/active jobs. Status changes only via util.*.

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import { renderNav, toast, confirmDialog } from '../lib/nav.js';

let selectedDate = new Date().toISOString().slice(0, 10);

export function renderAppointments() {
  renderNav('#icon-rail', 'appointments.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();

  document.getElementById('cal-date').value = selectedDate;
  document.getElementById('cal-date').addEventListener('change', (e) => {
    selectedDate = e.target.value;
    renderSchedule();
  });

  renderPending();
  renderSchedule();
}

// ---------------------------------------------------------------------------
// Pending requests
// ---------------------------------------------------------------------------
function renderPending() {
  const pending = db.pendingBookings().slice().sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  document.getElementById('pending-count').textContent = pending.length;

  document.getElementById('pending-body').innerHTML = pending.length
    ? pending.map((b) => {
        const services = b.serviceIds.map((id) => db.serviceById(id)?.name).filter(Boolean).join(', ');
        return `
        <div class="booking-card" data-booking-id="${b.id}">
          <div class="bc-head">
            <div>
              <div class="bc-name">${b.customer.name}</div>
              <div class="bc-sub">${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}</div>
            </div>
            <span class="badge badge-amber">Pending</span>
          </div>
          <div class="bc-sub">${services || 'No services listed'}</div>
          <div class="bc-meta">
            <span class="badge badge-gray">${util.fmtDate(b.preferredDate)} · ${/^\d{2}:\d{2}$/.test(b.preferredSlot) ? util.fmtTime(b.preferredSlot) : b.preferredSlot}</span>
            <span class="badge badge-gray">${util.visitTypeLabel(b.vehicle.visitType)}</span>
            ${b.couponCode ? `<span class="badge badge-purple">${b.couponCode}</span>` : ''}
          </div>
          <div class="bc-actions">
            <button class="btn btn-primary btn-sm" data-confirm="${b.id}">Confirm</button>
            <button class="btn btn-secondary btn-sm" data-decline="${b.id}">Decline</button>
          </div>
        </div>`;
      }).join('')
    : `<div class="empty"><div class="empty-title">No pending requests</div><div class="empty-sub">New booking requests will appear here.</div></div>`;

  document.querySelectorAll('[data-confirm]').forEach((btn) => {
    btn.addEventListener('click', () => openConfirmModal(btn.dataset.confirm));
  });
  document.querySelectorAll('[data-decline]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Decline this booking request? The customer will need to rebook.', { confirmLabel: 'Decline' });
      if (!confirmed) return;
      util.declineBooking(btn.dataset.decline);
      toast('Booking declined.');
      renderPending();
    });
  });
}

function openConfirmModal(bookingId) {
  const booking = db.bookingById(bookingId);
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-head">
        <div class="modal-title">Confirm appointment</div>
        <button class="icon-btn" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="modal-body">
        <div class="muted" style="font-size:var(--t-13)">${booking.customer.name} · ${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}</div>
        <div class="field">
          <label class="label">Assign technician (optional)</label>
          <select class="select" id="confirm-tech">
            <option value="">Unassigned</option>
            ${db.techs().map((t) => `<option value="${t.id}">${t.firstName} ${t.lastName}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="label">Assign bay (optional)</label>
          <select class="select" id="confirm-bay">
            <option value="">Unassigned</option>
            ${db.bays().map((b) => `<option value="${b.id}">${b.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" data-close>Cancel</button>
        <button class="btn btn-primary" id="confirm-go-btn">Confirm Appointment</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('#confirm-go-btn').addEventListener('click', () => {
    const techId = overlay.querySelector('#confirm-tech').value || null;
    const bayId = overlay.querySelector('#confirm-bay').value || null;
    try {
      const ro = util.confirmBooking(bookingId, { techId, bayId });
      toast(`${ro.ro} scheduled for ${util.fmtDate(ro.scheduledDate)}.`, 'success');
      close();
      renderPending();
      renderSchedule();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// Schedule (day view)
// ---------------------------------------------------------------------------
function renderSchedule() {
  const jobs = db.jobs()
    .filter((j) => j.scheduledDate === selectedDate && !['cancelled', 'closed'].includes(j.status))
    .slice()
    .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));

  document.getElementById('cal-body').innerHTML = jobs.length
    ? jobs.map((j) => {
        const c = db.customerById(j.customerId);
        const v = db.vehicleById(j.vehicleId);
        const meta = util.statusMeta(j.status);
        return `
        <div class="sched-row" data-job-id="${j.id}">
          <div class="sched-time">${j.scheduledTime ? util.fmtTime(j.scheduledTime) : '—'}</div>
          <div class="sched-body">
            <div class="sched-name">${j.ro} · ${util.customerName(c)}</div>
            <div class="sched-sub">${util.vehicleLabel(v)}</div>
          </div>
          <span class="badge ${meta.badgeClass}">${meta.label}</span>
        </div>`;
      }).join('')
    : `<div class="empty"><div class="empty-title">Nothing scheduled</div><div class="empty-sub">No jobs scheduled for this date.</div></div>`;

  document.querySelectorAll('[data-job-id]').forEach((row) => {
    row.addEventListener('click', () => openRescheduleModal(row.dataset.jobId));
  });
}

function openRescheduleModal(jobId) {
  const job = db.jobById(jobId);
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-head">
        <div class="modal-title">${job.ro}</div>
        <button class="icon-btn" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="modal-body">
        <div class="field"><label class="label">Date</label><input type="date" class="input" id="resched-date" value="${job.scheduledDate || ''}"></div>
        <div class="field"><label class="label">Time</label><input type="time" class="input" id="resched-time" value="${job.scheduledTime || ''}"></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" data-close>Cancel</button>
        <button class="btn btn-primary" id="resched-save-btn">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('#resched-save-btn').addEventListener('click', () => {
    const newDate = overlay.querySelector('#resched-date').value;
    const newTime = overlay.querySelector('#resched-time').value;
    const jobs = db.jobs();
    const j = jobs.find((x) => x.id === jobId);
    j.scheduledDate = newDate;
    j.scheduledTime = newTime;
    db.saveJobs(jobs);
    toast(`${job.ro} rescheduled to ${util.fmtDate(newDate)} ${util.fmtTime(newTime)}.`, 'success');
    close();
    renderSchedule();
  });
}
