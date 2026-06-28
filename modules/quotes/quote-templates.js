// AutoBook — modules/quotes/quote-templates.js
// Auto quote suggestion templates (§5) — structured demo foundation built
// from real seeded services/parts; estimatedTotal is always computed, never
// hardcoded (see util.quoteTemplates). "Use this template" jumps to the
// Builder with the lines pre-filled.
import { util } from '../../lib/util.js';
import { toast } from '../../lib/nav.js';
import { setBuilderPrefill } from './quotes-app.js';

export function renderQuoteTemplates(mount) {
  const templates = util.quoteTemplates();
  mount.innerHTML = `
    <div class="alert alert-amber" style="margin-bottom:var(--s4)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>
      <div><b>Structured demo templates, not a real labor guide.</b><br>Lines reference the seeded services/parts catalog; totals are always computed from those lines. Phase 2 connects this to a real labor guide and distributor pricing.</div>
    </div>
    <div class="quote-queue-grid" style="grid-template-columns:repeat(3,1fr)">
      ${templates.map((t, i) => `
        <div class="tpl-card">
          <div class="strong" style="color:var(--ink)">${t.name}</div>
          <div class="muted" style="font-size:var(--t-13)">${t.notes}</div>
          <div class="muted" style="font-size:var(--t-13)">${t.lines.length} line item${t.lines.length === 1 ? '' : 's'}</div>
          <div class="tnum strong" style="color:var(--ink);font-size:var(--t-lg)">${util.fmtMoney(t.estimatedTotal)}</div>
          <button class="btn btn-primary btn-sm" data-use-template="${i}">Use This Template</button>
        </div>`).join('')}
    </div>
  `;
  document.querySelectorAll('[data-use-template]').forEach((b) => {
    b.addEventListener('click', () => {
      const t = templates[Number(b.dataset.useTemplate)];
      setBuilderPrefill({ title: t.name, lines: t.lines });
      toast(`Loaded "${t.name}" into the Builder.`);
    });
  });
}
