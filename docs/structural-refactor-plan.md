# Structural Refactor Plan

> **Status:** Planning document only — no app code has been changed.  
> Based on: `docs/app-connection-map.md`, full read of `lib/util.js` (3,433 lines), `lib/data.js`, and all module files.  
> Date: 2026-06-29

---

## 1. The Core Problem

The app works. Every feature is wired up and functional. But two files carry almost all the weight:

| File | Lines | What it does |
|---|---|---|
| `lib/util.js` | 3,433 | 190 exported functions across 14+ unrelated domains |
| `lib/data.js` | ~1,800 | 213 db methods, full seed, migration helpers |

Everything imports `util.js`. Nothing is namespaced. A bug fix in scheduling requires reading past invoice logic to find the right function. A new developer has no way to know whether a function they need exists without grepping the entire file.

The refactor goal is **namespace without breakage** — split `util.js` into domain service files, keep the existing `util.*` API working during the transition, and delete the compatibility shims only after every callsite is updated.

---

## 2. Duplicated and Confusing Files

### 2a. Confirmed duplicates

| Situation | Files | Decision |
|---|---|---|
| Two appointments modules | `modules/appointments.js` (645 lines, calendar-only) and `modules/appointments-v2.js` (854 lines, calendar + workflow board) | **`appointments-v2.js` is canonical.** It explicitly notes it was built beside v1 without touching v1. v1 is dead code. |
| `modules/team/roles.js` | Not imported anywhere since Session 5 moved Roles & Permissions to `modules/settings.js` | **Dead code — safe to delete after confirming no HTML entry point loads it.** |

### 2b. Appears duplicate but is NOT

| File | Looks like | Actually is |
|---|---|---|
| `modules/invoices/inv-estimates.js` | A second quotes/estimates module | A **read-only finance-side summary view** that calls `db.quotes()` and links to `quotes.html` for editing. It is intentionally separate. Do not merge. |

### 2c. Confusing seeding split

Two separate seeding systems exist and run independently:
- `lib/data.js` → `seed()` — core shop data (customers, vehicles, ROs, invoices, etc.)
- `lib/workflow.js` → `ensureSeeded()` + `seedCrmDemoData()` + `seedDemoLinks()` — CRM-specific data

These don't conflict (they use different keys) but the split is confusing. Long-term they should merge. Short-term: leave them alone; they work.

---

## 3. Source-of-Truth Decisions

For each feature area, one module is canonical. All others defer to it.

### Appointments
- **Canonical:** `modules/appointments-v2.js`
- **Delete:** `modules/appointments.js` (after confirming no HTML page loads it directly)
- **`dashboard.html` today-board** reads RO data directly — this is correct and should stay separate

### Quotes / Estimates
- **Canonical:** `modules/quotes.js` + `quotes.html`
- **`modules/invoices/inv-estimates.js`** stays as a read-only finance-side view — it is not a source of truth, it reads quotes

### Customers / CRM
- **Canonical:** `modules/crm/customers.js` for the customer record  
- `modules/crm/crm-app.js` is the shell/router — it is canonical for CRM navigation
- `lib/workflow.js` owns CRM activity events and follow-up tasks — this is intentional

### Repair Orders
- **Canonical:** `modules/repair-orders.js`
- RO lifecycle logic currently lives in `lib/util.js` (checkIn, startJob, moveToBay, etc.) — these should move to `lib/services/ro.js` (see Section 4)

### Invoices / Payments
- **Canonical:** `modules/invoices/invoices-app.js` (shell) + sub-modules
- Invoice creation logic currently lives in `lib/util.js` (`createInvoiceFromRO`, `recordPayment`, etc.) — move to `lib/services/invoice.js`

### Employees / Roles
- **Canonical:** `modules/team/team-app.js` (shell) + `modules/team/employees.js`
- Roles & Permissions UI: `modules/settings.js` (moved in Session 5 — correct)
- `modules/team/roles.js` is dead — delete it

### Marketing / CRM Outreach
- **Canonical:** `modules/crm/marketing.js`
- No duplication here

### Signup / Platform / Subscriptions
- **Canonical:** `modules/platform/` (platform admin SaaS layer)
- **Completely disconnected** from `ab_*` shop data — uses `pf_*` keys only
- This is intentional for the demo. Do not connect them until multi-tenant auth is real.

---

## 4. Wrapper Service Files to Create

Split `lib/util.js` into focused service files. Keep `util.js` as a re-export barrel during transition.

### Proposed service files

| New file | Functions to move | Line range in util.js |
|---|---|---|
| `lib/services/format.js` | `formatMoney`, `formatDate`, `formatTime`, `formatPhone`, `formatDuration`, date predicates (`isToday`, `isFuture`, etc.) | ~11–228 |
| `lib/services/labels.js` | `statusLabel`, `statusColor`, `statusBadge`, `appointmentStatusLabel`, all status maps | ~229–580 |
| `lib/services/customer.js` | `customerName`, `customerShort`, `vehicleLabel`, `customerFinanceSummary` | ~581–1012 + ~1195–1272 |
| `lib/services/ro.js` | `lineTotals`, `recalcRO`, `validateCoupon`, `generateTimeWindows`, `checkIn`, `startJob`, `moveToBay`, `returnToWaiting`, `holdJob`, `resumeJob`, `markReady`, `cancelRO`, `updateRO` | ~1013–1100 + ~1273–1877 |
| `lib/services/invoice.js` | `createInvoiceFromRO`, `recordPayment`, `receivablesAging`, `invoiceSalesSummary`, `dailyCloseout`, credit notes, expenses, invoice items, quote operations | ~1101–1272 + ~1874–1954 |
| `lib/services/schedule.js` | `addShift`, `updateShift`, `removeShift`, shift trades, shift templates, PTO, time-off | ~1955–2407 |
| `lib/services/team.js` | User account placeholders, team messaging placeholder, time clock placeholders | ~2227–2733 |
| `lib/services/kpi.js` | KPI aggregation, utilization, tomorrow preview, period stats, flags | ~2408–2531 + ~2534–2632 |
| `lib/services/inventory.js` | PO operations, transfers, returns, cycle counts, reorder planning, channel demand, InventoryOps dashboard | ~2734–3433 |
| `lib/services/booking.js` | `submitBooking`, `confirmBooking`, `declineBooking` | scattered in ~1273–1873 |

### Transition pattern (safe)

After extracting each service file, add re-exports to `lib/util.js` so nothing breaks:

```js
// lib/util.js (during transition)
export { formatMoney, formatDate } from './services/format.js';
export { statusLabel, statusColor } from './services/labels.js';
// ... etc
```

Callsites keep importing from `util.js`. Update them incrementally. Remove the re-exports only after all callsites are migrated.

---

## 5. UI / Service / Data Layer Separation

Current state: everything talks to everything.

```
HTML page
  └── shell module  (imports util.js + db directly)
        └── sub-modules  (import util.js + db directly)
```

Target state:

```
HTML page
  └── shell module  (imports service files only)
        └── sub-modules  (import service files only)
              └── service files  (import db)
                    └── lib/data.js  (owns all localStorage access)
```

Rules:
- **UI modules** (`modules/**/*.js`) never call `db.*` directly — they call service functions
- **Service files** (`lib/services/*.js`) own domain logic and call `db.*`
- **`lib/data.js`** owns all localStorage reads/writes — no module bypasses it
- **`lib/util.js`** becomes a re-export barrel only, then deleted once migration is complete

This is aspirational for now. Apply it incrementally, file by file.

---

## 6. Work Order (Safe Incremental Sequence)

Each step is independent. Do not skip steps. Verify after each.

### Phase A — Dead code removal (lowest risk, immediate wins)

| Step | Action | Risk |
|---|---|---|
| A1 | Confirm `modules/team/roles.js` has no HTML entry point; delete it | Low — already confirmed not imported |
| A2 | Confirm `modules/appointments.js` (v1) has no HTML entry point; delete it | Low — v2 is the active module |
| A3 | Add a comment to `modules/invoices/inv-estimates.js` noting it is intentionally read-only | Zero risk |

### Phase B — appointments-v2 cleanup

| Step | Action | Risk |
|---|---|---|
| B1 | Rename `appointments-v2.js` → `appointments.js` after A2 is complete | Medium — update any HTML entry points that load it |
| B2 | Remove the "built side-by-side with v1" comment since v1 is gone | Cosmetic |

### Phase C — util.js extraction (highest value, medium risk)

Extract one service file at a time. Start with leaf dependencies (no other service files depend on them).

Recommended order:
1. `lib/services/format.js` — pure functions, no db calls, no circular deps
2. `lib/services/labels.js` — reads `KEYS` constants only
3. `lib/services/customer.js` — uses format helpers
4. `lib/services/booking.js` — small, isolated
5. `lib/services/schedule.js` — no invoice deps
6. `lib/services/ro.js` — depends on customer, format
7. `lib/services/invoice.js` — depends on ro, customer, format
8. `lib/services/kpi.js` — depends on ro, invoice
9. `lib/services/inventory.js` — mostly standalone
10. `lib/services/team.js` — placeholder-heavy, low priority

After all 10 are extracted: `lib/util.js` becomes a re-export barrel → update callsites → delete `lib/util.js`.

### Phase D — callsite updates

For each extracted service file, update the callsites that can be moved (change `import { x } from '../../lib/util.js'` to `import { x } from '../../lib/services/format.js'`). Do this module by module.

### Phase E — data layer encapsulation

Audit all UI modules for direct `db.*` calls. Move those calls into the appropriate service file. This is the lowest-urgency phase — the app works correctly with direct db calls; this is purely an architecture hygiene improvement.

---

## 7. What Could Break

### High risk

| Scenario | Why | Guard against |
|---|---|---|
| Re-export barrel misses a function | A callsite uses a function that wasn't included in the re-export list | After each extraction, `grep -r "from.*util.js"` across all modules and confirm every referenced function is still exported |
| Circular import during extraction | A service file imports another service file that hasn't been created yet | Extract in the order in Section 6; earlier files don't depend on later ones |
| Rename of `appointments-v2.js` breaks HTML entry point | If any HTML file loads `appointments-v2.js` by name | Check every `.html` file for the string `appointments-v2` before renaming |

### Medium risk

| Scenario | Why | Guard against |
|---|---|---|
| Phase B rename breaks the dynamic import path | Shell modules use dynamic `import('./modules/appointments-v2.js')` | Search all JS files for the string `appointments-v2` before renaming |
| `lib/data.js` seed order dependency | Some service files call db methods that require data to exist | Don't change `lib/data.js` during Phase C; only extract logic |

### Low risk

| Scenario | Why | Guard against |
|---|---|---|
| Deleting `roles.js` breaks something unfound | A dynamic import not caught by static grep | Browser console check after deletion |
| `inv-estimates.js` gets merged by mistake | Easy to confuse with a duplicate | The comment added in A3 prevents this |

---

## 8. Verification Checklist Per Step

After every Phase A/B step:
- [ ] Open the affected HTML page in browser — no console errors
- [ ] Check the specific feature (appointment list loads, roles tab loads, etc.)

After every Phase C extraction:
- [ ] `grep -r "from.*util.js" modules/` — every result must still be satisfied by the re-export barrel
- [ ] Open dashboard, appointments, invoices, CRM, inventory in browser — no console errors
- [ ] Check the feature area whose functions were just extracted (e.g., after extracting `format.js`, check that money and date formatting still works everywhere)

After Phase C complete (util.js is a pure re-export barrel):
- [ ] Full smoke test: open every `.html` page, click through each tab
- [ ] Check browser console on each page — zero errors

After Phase D (callsite updates):
- [ ] Same smoke test
- [ ] `grep -r "from.*util.js"` should return zero results — `util.js` can be deleted

---

## 9. What to Leave Alone

These are working and the complexity is acceptable for now:

- **`lib/workflow.js`** — CRM seeding + activity events are self-contained; leave the seeding split
- **`lib/data.js`** internal structure — do not reorganize its 213 methods; just keep it as the single db access layer
- **Platform (`pf_*`) / shop (`ab_*`) data isolation** — the disconnect is intentional for the single-tenant demo
- **The role/permission system** — UI-layer only, works fine, no changes needed
- **CRM hub-and-spoke with `crm-drawers.js`** — dynamic imports already break the circular dep; don't touch it

---

## Summary

| Priority | Work | Effort | Risk |
|---|---|---|---|
| 1 | Delete dead code (`roles.js`, `appointments.js` v1) | 30 min | Low |
| 2 | Rename `appointments-v2.js` → `appointments.js` | 30 min | Low |
| 3 | Extract `lib/services/format.js` from `util.js` | 2–3 hours | Medium |
| 4 | Extract remaining service files (order per Section 6) | 2–3 days | Medium |
| 5 | Update callsites to import from service files | 1–2 days | Medium |
| 6 | Delete `lib/util.js` | 1 hour | Low (after step 5) |
| 7 | Move direct `db.*` calls out of UI modules | Ongoing | Low |

The app is production-ready as-is. This plan improves maintainability incrementally without removing any features or breaking any existing behavior.
