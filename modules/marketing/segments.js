// AutoBook — modules/marketing/segments.js (§D)
// The canonical AutoBook segment cards (computed from real customer/vehicle/
// booking/RO/invoice data — see each segment's `description` for exactly
// what's real vs. a documented assumption) + a simple custom-segment builder
// for anything not covered by the canonical list.

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast } from '../../lib/nav.js';

export function renderSegments(mount) {
  mount.innerHTML = `
    <div class="grid-3" id="segment-cards" style="margin-bottom:var(--s4)"></div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Custom Segment</div></div>
      <div class="card-body grid-2">
        <div class="field"><label class="label">Name</label><input class="input" id="ns-name" placeholder="e.g. Toyota Owners"></div>
        <div class="field"><label class="label">Vehicle make (optional)</label><input class="input" id="ns-make" placeholder="Leave blank for all customers"></div>
        <div style="grid-column:1/-1"><button class="btn btn-primary" id="add-segment-btn">Create Segment</button></div>
      </div>
    </div>
    <div class="card"><div class="card-head"><div class="card-title">All Segments</div></div><div class="card-body" id="segments-list"></div></div>
  `;
  document.getElementById('add-segment-btn').addEventListener('click', addSegment);
  renderCards();
  renderList();
}

function addSegment() {
  const name = document.getElementById('ns-name').value.trim();
  if (!name) {
    toast('Segment name is required.', 'error');
    return;
  }
  const make = document.getElementById('ns-make').value.trim();
  const segments = db.segments();
  segments.push({ id: db.nextId('seg'), name, criteria: make ? { vehicleMake: make } : {}, computed: true });
  db.saveSegments(segments);
  toast('Segment created.', 'success');
  document.getElementById('ns-name').value = '';
  document.getElementById('ns-make').value = '';
  renderCards();
  renderList();
}

// The canonical set this step asked for, in order. Cards render only for
// segments that actually exist in db.segments() — if seed data changes,
// this stays in sync rather than hardcoding counts.
const CANONICAL_IDS = ['seg_new', 'seg_returning', 'seg_inactive', 'seg_due_oil', 'seg_due_tire', 'seg_declined', 'seg_high_value', 'seg_fleet', 'seg_upcoming', 'seg_missing_contact'];

function renderCards() {
  const el = document.getElementById('segment-cards');
  if (!el) return;
  const segments = CANONICAL_IDS.map((id) => db.segmentById(id)).filter(Boolean);
  el.innerHTML = segments.map((s) => {
    const count = db.segmentMembers(s.id).length;
    const isAssumption = (s.description || '').startsWith('ASSUMPTION');
    return `
    <div class="stat-card">
      <div class="stat-head"><span class="stat-icon ${isAssumption ? 'amber' : 'blue'}">${iconUsers()}</span><span class="stat-label">${s.name}</span></div>
      <div class="stat-value">${count}</div>
      <div class="stat-sub">${s.description || ''}</div>
    </div>`;
  }).join('');
}

function renderList() {
  const segments = db.segments();
  document.getElementById('segments-list').innerHTML = segments.length
    ? segments.map((s) => {
        const count = db.segmentMembers(s.id).length;
        return `
        <div class="seg-card" data-segment-id="${s.id}">
          <div class="row between">
            <div>
              <div class="strong" style="color:var(--ink)">${s.name}</div>
              <div class="muted" style="font-size:var(--t-13)">${s.description || (s.criteria?.vehicleMake ? `Vehicle make: ${s.criteria.vehicleMake}` : 'All customers')} · ${count} contactable</div>
            </div>
            <button class="btn btn-secondary btn-sm" data-preview="${s.id}">Preview Audience</button>
          </div>
          <div class="audience-list" id="audience-${s.id}" style="display:none"></div>
        </div>`;
      }).join('')
    : '<div class="empty"><div class="empty-title">No segments yet</div><div class="empty-sub">Create one above.</div></div>';

  document.querySelectorAll('[data-preview]').forEach((btn) => {
    btn.addEventListener('click', () => togglePreview(btn.dataset.preview));
  });
}

function togglePreview(segmentId) {
  const el = document.getElementById(`audience-${segmentId}`);
  const isOpen = el.style.display !== 'none';
  if (isOpen) {
    el.style.display = 'none';
    return;
  }
  const audience = util.previewAudience(segmentId);
  el.innerHTML = audience.length
    ? audience.map((c) => `<div class="audience-row"><span>${util.customerName(c)}</span><span class="muted">${c.phone || 'No phone'}${c.email ? ' · ' + c.email : ''}</span></div>`).join('')
    : '<div class="empty-sub" style="padding:var(--s2) 0">No contactable customers match this segment.</div>';
  el.style.display = '';
}

function iconUsers() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>';
}
