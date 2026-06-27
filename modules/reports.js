// AutoBook — modules/reports.js (§11.12)
// All vanilla SVG charts, all from db aggregates — no new storage, no
// hardcoded numbers. Data is honest about being sparse in a fresh demo
// (most history is "today"/"yesterday") rather than fabricated.

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import { renderNav } from '../lib/nav.js';

let rangeDays = 14;

export function renderReports() {
  renderNav('#icon-rail', 'reports.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();

  document.getElementById('range-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-range]');
    if (!btn) return;
    document.querySelectorAll('#range-toggle button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    rangeDays = Number(btn.dataset.range);
    renderAll();
  });

  renderAll();
}

function renderAll() {
  renderRevenueChart();
  renderAroChart();
  renderTechChart();
  renderServiceMix();
  renderCapacityChart();
}

function lastNDays(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    d.setHours(0, 0, 0, 0);
    return d;
  });
}

function lineChartSvg(values, { width = 480, height = 140, color = 'var(--accent)', fill = true } = {}) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = width / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => [i * stepX, height - ((v - min) / range) * (height - 10) - 5]);
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  return `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:${height}px">
      ${fill ? `<path d="${areaPath}" fill="${color}" opacity="0.08"/>` : ''}
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function renderRevenueChart() {
  const days = lastNDays(rangeDays);
  const invoices = db.invoices();
  const values = days.map((d) => {
    const dayStr = d.toDateString();
    return invoices.reduce((sum, inv) => sum + (inv.payments || []).filter((p) => new Date(p.date).toDateString() === dayStr).reduce((s, p) => s + p.amount, 0), 0);
  });
  const total = values.reduce((s, v) => s + v, 0);
  document.getElementById('revenue-chart').innerHTML = `
    <div class="stat-value tnum" style="margin-bottom:var(--s2)">${util.fmtMoney0(total)}</div>
    ${lineChartSvg(values, { color: 'var(--green)' })}
    <div class="muted" style="font-size:var(--t-13);margin-top:var(--s2)">Collected over the last ${rangeDays} days</div>
  `;
}

function renderAroChart() {
  const days = lastNDays(rangeDays);
  const invoices = db.invoices();
  const target = db.settings().aroTarget || 0;
  const values = days.map((d) => {
    const dayStr = d.toDateString();
    const dayInvoices = invoices.filter((inv) => new Date(inv.issuedAt).toDateString() === dayStr);
    return dayInvoices.length ? dayInvoices.reduce((s, i) => s + i.total, 0) / dayInvoices.length : 0;
  });
  const overallAro = (() => {
    const withInv = invoices.filter((i) => i.total > 0);
    return withInv.length ? withInv.reduce((s, i) => s + i.total, 0) / withInv.length : 0;
  })();
  document.getElementById('aro-chart').innerHTML = `
    <div class="stat-value tnum" style="margin-bottom:var(--s2)">${util.fmtMoney0(overallAro)}</div>
    ${lineChartSvg(values, { color: 'var(--purple)' })}
    <div class="chart-legend">
      <span class="legend-item"><span class="legend-dot" style="background:var(--purple)"></span>Daily ARO</span>
      <span class="legend-item"><span class="legend-dot" style="background:var(--ink-4)"></span>Target ${util.fmtMoney0(target)}</span>
    </div>
  `;
}

function renderTechChart() {
  const techs = db.techs();
  const stats = techs.map((t) => ({ tech: t, ...util.techStats(t.id) }));
  const maxHours = Math.max(...stats.map((s) => s.billedHoursToday), 1);
  document.getElementById('tech-chart').innerHTML = stats.length
    ? stats.map((s) => `
      <div class="mix-row">
        <span style="width:90px">${s.tech.firstName}</span>
        <div class="mix-bar-track"><div class="mix-bar-fill" style="width:${Math.min(100, (s.billedHoursToday / maxHours) * 100)}%"></div></div>
        <span class="tnum" style="width:90px;text-align:right">${s.billedHoursToday.toFixed(1)}h · ${s.activeJobs} active</span>
      </div>`).join('')
    : '<div class="empty-sub">No technicians yet.</div>';
}

function renderServiceMix() {
  const revenueByService = {};
  db.jobs().forEach((j) => {
    (j.lineItems || []).filter((l) => l.type === 'service').forEach((l) => {
      revenueByService[l.name] = (revenueByService[l.name] || 0) + l.total;
    });
  });
  const sorted = Object.entries(revenueByService).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = sorted.length ? sorted[0][1] : 1;
  document.getElementById('service-mix').innerHTML = sorted.length
    ? sorted.map(([name, total]) => `
      <div class="mix-row">
        <span style="width:140px">${name}</span>
        <div class="mix-bar-track"><div class="mix-bar-fill" style="width:${(total / max) * 100}%"></div></div>
        <span class="tnum" style="width:70px;text-align:right">${util.fmtMoney0(total)}</span>
      </div>`).join('')
    : '<div class="empty-sub">No service revenue recorded yet.</div>';
}

function renderCapacityChart() {
  const days = lastNDays(7);
  const capacity = db.settings().capacityHours || 1;
  const jobs = db.jobs();
  const values = days.map((d) => {
    const dayStr = d.toDateString();
    return jobs.filter((j) => new Date(j.createdAt).toDateString() === dayStr).reduce((s, j) => s + (j.billedHours || 0), 0);
  });
  const max = Math.max(capacity, ...values);
  document.getElementById('capacity-chart').innerHTML = `
    <div class="row" style="gap:var(--s4);align-items:flex-end;height:140px">
      ${days.map((d, i) => {
        const pct = (values[i] / max) * 100;
        const overCap = values[i] > capacity;
        return `
        <div class="row" style="flex-direction:column;align-items:center;flex:1;height:100%;justify-content:flex-end">
          <div style="width:100%;max-width:32px;border-radius:4px 4px 0 0;background:${overCap ? 'var(--red)' : 'var(--accent)'};height:${Math.max(pct, 2)}%"></div>
          <div class="muted" style="font-size:var(--t-xs);margin-top:4px">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="muted" style="font-size:var(--t-13);margin-top:var(--s2)">Capacity: ${capacity} hrs/day · red = over capacity</div>
  `;
}
