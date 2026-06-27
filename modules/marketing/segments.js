// AutoBook — modules/marketing/segments.js (§D, Phase 1)
// Segments + audience preview (do-not-contact always excluded — see
// db.segmentMembers). Phase 1 supports "all customers" and "vehicle make"
// criteria; a full filter builder is a later phase.

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast } from '../../lib/nav.js';

export function renderSegments(mount) {
  mount.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">New Segment</div></div>
      <div class="card-body grid-2">
        <div class="field"><label class="label">Name</label><input class="input" id="ns-name" placeholder="e.g. Toyota Owners"></div>
        <div class="field"><label class="label">Vehicle make (optional)</label><input class="input" id="ns-make" placeholder="Leave blank for all customers"></div>
        <div style="grid-column:1/-1"><button class="btn btn-primary" id="add-segment-btn">Create Segment</button></div>
      </div>
    </div>
    <div class="card"><div class="card-head"><div class="card-title">Segments</div></div><div class="card-body" id="segments-list"></div></div>
  `;
  document.getElementById('add-segment-btn').addEventListener('click', addSegment);
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
  renderList();
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
              <div class="muted" style="font-size:var(--t-13)">${s.criteria?.vehicleMake ? `Vehicle make: ${s.criteria.vehicleMake}` : 'All customers'} · ${count} contactable</div>
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
    ? audience.map((c) => `<div class="audience-row"><span>${util.customerName(c)}</span><span class="muted">${c.phone}</span></div>`).join('')
    : '<div class="empty-sub" style="padding:var(--s2) 0">No contactable customers match this segment.</div>';
  el.style.display = '';
}
