# Torklio — Supabase Migration Plan

> **Status:** Planning document only. No app code has been changed.
> Based on: `docs/app-connection-map.md`, `docs/structural-refactor-plan.md`,
> `lib/data.js` (52 localStorage keys), `lib/auth.js`, `lib/workflow.js`.
> Date: 2026-06-30

---

## 1. Current localStorage Data Model

All shop-operational keys use the `ab_` prefix. Platform/SaaS keys use `pf_`. Rewards keys use `rw_`. The full list from `lib/data.js`:

### Core Shop Config

| localStorage key | What it stores | Pages that use it | Likely Supabase table | Key fields | Relationships | Migration risk |
|---|---|---|---|---|---|---|
| `ab_settings` | Shop name, owner name, timezone, logo, services config, booking rules, hours, currentUserId (demo auth) | Every page | `shops` + `shop_settings` | `shopName`, `owner`, `timezone`, `bookingRules`, `currentUserId` | FK to `shops` | **High** — `currentUserId` is demo auth; must be replaced by real session |
| `ab_employees` | Staff records, roles, permissions, pay type, isTech flag, bay assignments | Dashboard, ROs, Appointments, Team, Settings | `shop_users` + `employees` | `id`, `firstName`, `lastName`, `role`, `isTech`, `bayId`, `payType` | FK to `shops`, FK to `roles` | Medium — role field is a string key, maps cleanly |
| `ab_roles` | Permission role definitions with per-module access levels | Settings | `roles` + `role_permissions` | `id`, `name`, `modules` (object) | FK to `shops` | Medium — `modules` is a nested object; normalize to `role_permissions` join table |
| `ab_bays` | Bay/lift definitions (name, capacity, active) | Live Monitor, Appointments, ROs | `bays` | `id`, `name`, `active` | FK to `shops` (or `shop_locations`) | Low |
| `ab_services` | Service catalog (name, duration, category, price, active) | Booking, Appointments, ROs, Quotes | `services` | `id`, `name`, `duration`, `category`, `price`, `active` | FK to `shops` | Low |

### Customers & Vehicles

| localStorage key | What it stores | Pages that use it | Likely Supabase table | Key fields | Relationships | Migration risk |
|---|---|---|---|---|---|---|
| `ab_customers` | Customer records (name, phone, email, address, notes) | CRM, ROs, Invoices, Appointments, Booking | `customers` | `id`, `firstName`, `lastName`, `phone`, `email`, `address` | FK to `shops` | Low |
| `ab_vehicles` | Vehicle records (year, make, model, mileage, VIN, customerId) | ROs, Appointments, CRM, Booking, Waiting Room | `vehicles` | `id`, `customerId`, `year`, `make`, `model`, `vin`, `mileage` | FK to `customers`, FK to `shops` | Low |

### Scheduling & Appointments

| localStorage key | What it stores | Pages that use it | Likely Supabase table | Key fields | Relationships | Migration risk |
|---|---|---|---|---|---|---|
| `ab_bookings` | Pending/confirmed online appointment requests from booking page | Dashboard, Appointments, Booking | `bookings` | `id`, `customerId`, `vehicleId`, `serviceIds[]`, `preferredDate`, `status`, `visitType` | FK to `customers`, `vehicles`, `services` | Medium — `serviceIds[]` is an array; normalize to join table |
| `ab_jobs` | Repair orders / jobs (the core operational entity — confirmed bookings become jobs) | ROs, Appointments, Dashboard, Live Monitor, Invoices, CRM | `repair_orders` | `id`, `customerId`, `vehicleId`, `techId`, `bayId`, `status`, `scheduledDate`, `visitType`, `dvi{}`, `recommended[]`, `lineItems[]`, `approvalStatus` | FK to many tables | **High** — denormalized; `lineItems[]`, `dvi{}`, `recommended[]` are embedded arrays/objects |
| `ab_shifts` | Employee weekly shift assignments | Team | `shifts` | `id`, `employeeId`, `weekStart`, `dayOfWeek`, `startTime`, `endTime`, `role` | FK to `shop_users` | Low |
| `ab_scheduleWeeks` | Weekly schedule grid state (published/draft per week) | Team | `schedule_weeks` | `id`, `weekStart`, `status` | FK to `shops` | Low |
| `ab_scheduleTemplates` | Reusable shift schedule templates | Team | `schedule_templates` | `id`, `name`, `shifts[]` | FK to `shops` | Medium — `shifts[]` is embedded |
| `ab_shiftTradeRequests` | Shift trade/swap requests between employees | Team | `shift_trade_requests` | `id`, `requesterId`, `targetId`, `shiftId`, `status` | FK to `shop_users`, `shifts` | Low |
| `ab_ptoRequests` | PTO / time-off requests | Team | `pto_requests` | `id`, `employeeId`, `startDate`, `endDate`, `type`, `status`, `notes` | FK to `shop_users` | Low |
| `ab_timeClockEntries` | Clock-in / clock-out records | Team | `time_clock_entries` | `id`, `employeeId`, `clockIn`, `clockOut`, `breakMinutes` | FK to `shop_users` | Low — but no payroll compliance logic yet |
| `ab_availability` | Employee availability preferences | Team | `employee_availability` | `id`, `employeeId`, `dayOfWeek`, `startTime`, `endTime` | FK to `shop_users` | Low |

### Quotes & Estimates

| localStorage key | What it stores | Pages that use it | Likely Supabase table | Key fields | Relationships | Migration risk |
|---|---|---|---|---|---|---|
| `ab_quotes` | Quote/estimate records (status, line items, approval state, linked RO/invoice) | Quotes, Invoices → Estimates tab, CRM | `quotes` | `id`, `customerId`, `vehicleId`, `status`, `lineItems[]`, `total`, `roId`, `invoiceId` | FK to `customers`, `vehicles`, `repair_orders`, `invoices` | **High** — `lineItems[]` is embedded; normalize to `quote_line_items` |

### Invoices & Finance

| localStorage key | What it stores | Pages that use it | Likely Supabase table | Key fields | Relationships | Migration risk |
|---|---|---|---|---|---|---|
| `ab_invoices` | Invoice records (status, line items, payments, totals) | Invoices, POS, Reports | `invoices` | `id`, `customerId`, `vehicleId`, `roId`, `status`, `lineItems[]`, `payments[]`, `total`, `tax` | FK to customers, vehicles, ROs | **High** — `lineItems[]` and `payments[]` are embedded arrays |
| `ab_invoiceItems` | Standalone invoice line items (separate from invoice-embedded items) | Invoices | `invoice_line_items` | `id`, `invoiceId`, `description`, `qty`, `unitPrice`, `type` | FK to `invoices` | Medium — overlaps with embedded `invoice.lineItems[]` |
| `ab_expenses` | Shop expense records | Invoices → Expenses tab | `expenses` | `id`, `date`, `category`, `description`, `amount`, `vendor` | FK to `shops` | Low |
| `ab_creditNotes` | Credit notes / refund records | Invoices → Credit Notes tab | `credit_notes` | `id`, `invoiceId`, `customerId`, `amount`, `reason`, `status` | FK to `invoices`, `customers` | Low |
| `ab_registers` | POS register open/close sessions and cash drawer records | POS, Invoices | `registers` | `id`, `openedBy`, `openedAt`, `closedAt`, `openingFloat`, `closingFloat` | FK to `shop_users` | Low |
| `ab_sales` | POS sale/transaction records | POS | `sales` | `id`, `registerId`, `customerId`, `lineItems[]`, `total`, `tender` | FK to `registers`, `customers`, `invoices` | Medium — `lineItems[]` embedded |

### Inventory

| localStorage key | What it stores | Pages that use it | Likely Supabase table | Key fields | Relationships | Migration risk |
|---|---|---|---|---|---|---|
| `ab_parts` | Parts catalog (name, SKU, cost, price, category, reorder point) | Inventory, ROs, POS | `parts` | `id`, `name`, `sku`, `costPrice`, `salePrice`, `category`, `reorderPoint` | FK to `shops` | Low |
| `ab_inventoryLocations` | Warehouse/bay/bin locations | Inventory | `inventory_locations` | `id`, `name`, `type`, `parentId` | FK to `shops` | Low |
| `ab_inventoryLocationStock` | Stock levels per part per location | Inventory | `inventory_stock` | `id`, `partId`, `locationId`, `qty`, `reservedQty` | FK to `parts`, `inventory_locations` | Low |
| `ab_inventoryTransactions` | Stock movement audit trail (receive, consume, adjust, transfer) | Inventory | `inventory_transactions` | `id`, `partId`, `locationId`, `type`, `qty`, `ref`, `createdBy` | FK to `parts`, `locations`, `shop_users` | Low |
| `ab_inventoryTransfers` | Transfer records between locations | Inventory | `inventory_transfers` | `id`, `fromLocationId`, `toLocationId`, `partId`, `qty`, `status` | FK to `inventory_locations`, `parts` | Low |
| `ab_purchaseOrders` | Purchase order headers | Inventory | `purchase_orders` | `id`, `supplierId`, `status`, `orderedAt`, `receivedAt`, `total` | FK to `suppliers` | Low |
| `ab_purchaseOrderItems` | PO line items | Inventory | `purchase_order_items` | `id`, `purchaseOrderId`, `partId`, `qty`, `unitCost` | FK to `purchase_orders`, `parts` | Low |
| `ab_suppliers` | Supplier records | Inventory | `suppliers` | `id`, `name`, `contact`, `email`, `phone`, `accountNumber` | FK to `shops` | Low |
| `ab_returns` | Return/RGA records | Inventory | `inventory_returns` | `id`, `partId`, `supplierId`, `qty`, `reason`, `status` | FK to `parts`, `suppliers` | Low |
| `ab_cycleCounts` | Cycle count sessions | Inventory | `cycle_counts` | `id`, `locationId`, `startedAt`, `completedAt`, `status` | FK to `inventory_locations` | Low |
| `ab_cycleCountItems` | Per-part counts within a cycle count session | Inventory | `cycle_count_items` | `id`, `cycleCountId`, `partId`, `counted`, `expected` | FK to `cycle_counts`, `parts` | Low |
| `ab_inventoryChannels` | Demand channel definitions (placeholder) | Inventory | *(future)* | — | — | Low — all placeholder |

### CRM & Marketing

| localStorage key | What it stores | Pages that use it | Likely Supabase table | Key fields | Relationships | Migration risk |
|---|---|---|---|---|---|---|
| `ab_leads` | CRM lead records (name, source, status, assignedTo) | CRM | `leads` | `id`, `name`, `email`, `phone`, `source`, `status`, `assignedTo`, `customerId` | FK to `customers`, `shop_users` | Low |
| `ab_followUpTasks` | CRM follow-up task queue (assigned to employee, linked to entity) | CRM | `follow_up_tasks` | `id`, `title`, `dueDate`, `assignedTo`, `entityType`, `entityId`, `status` | FK to `shop_users` | Low |
| `ab_activityEvents` | Cross-module activity event log (RO status changes, quote approvals, etc.) | CRM, Workflow | `activity_events` | `id`, `entityType`, `entityId`, `type`, `title`, `actorId`, `createdAt` + ~15 FK fields | FK to many | **High** — 15 optional FK fields on one table; design carefully for Supabase |
| `ab_entityLinks` | Bi-directional relationship links between records of different types | CRM, Workflow | `entity_links` | `id`, `relationshipType`, `fromType`, `fromId`, `toType`, `toId` | Polymorphic FKs | **High** — polymorphic; use a typed link table or Postgres enum |
| `ab_communications` | Communication log entries (email/SMS) | CRM, Marketing | `communications` | `id`, `customerId`, `channel`, `direction`, `subject`, `body`, `sentAt` | FK to `customers` | Low — all demo/placeholder currently |
| `ab_segments` | Marketing audience segments (filter rules) | Marketing | `segments` | `id`, `name`, `filters[]`, `estimatedSize` | FK to `shops` | Medium — `filters[]` is a nested rules array |
| `ab_templates` | Email/SMS message templates | Marketing | `message_templates` | `id`, `name`, `channel`, `subject`, `body`, `type` | FK to `shops` | Low |
| `ab_campaigns` | Marketing campaign records (status, metrics, member count) | Marketing | `campaigns` | `id`, `name`, `segmentId`, `templateId`, `status`, `scheduledAt`, `sentAt` | FK to `segments`, `message_templates` | Low |
| `ab_automations` | Marketing automation rules (trigger/action pairs) | Marketing | `automations` | `id`, `name`, `trigger`, `action`, `active` | FK to `shops` | Low — all placeholder currently |
| `ab_teamMessages` | Internal team messaging | Team | `team_messages` | `id`, `senderId`, `recipientId`, `body`, `sentAt`, `readAt` | FK to `shop_users` | Low |
| `ab_teamActivity` | Team activity log | Team | `team_activity` | `id`, `employeeId`, `type`, `description`, `createdAt` | FK to `shop_users` | Low |
| `ab_employeeDocuments` | Employee HR documents | Team | `employee_documents` | `id`, `employeeId`, `type`, `url`, `uploadedAt` | FK to `shop_users` | Low |
| `ab_auditLogs` | System-level audit log | All | `audit_logs` | `id`, `actorId`, `action`, `entityType`, `entityId`, `before`, `after`, `createdAt` | FK to `shop_users` | Low |

### Rewards & Membership

| localStorage key | What it stores | Pages that use it | Likely Supabase table | Key fields | Relationships | Migration risk |
|---|---|---|---|---|---|---|
| `rw_programs` | Rewards program definitions (name, earn/redeem rules) | POS, CRM | `rewards_programs` | `id`, `name`, `earnRate`, `redeemRate`, `active` | FK to `shops` | Low |
| `rw_plans` | Membership plan definitions (tiers, pricing, perks) | POS, CRM | `membership_plans` | `id`, `name`, `price`, `billingCycle`, `perks[]` | FK to `shops` | Low |
| `rw_customers` | Customer rewards/membership enrollment | POS, CRM | `customer_rewards` | `id`, `customerId`, `programId`, `planId`, `points`, `membershipStatus`, `joinedAt` | FK to `customers`, `rewards_programs`, `membership_plans` | Low |
| `rw_transactions` | Points earn/redeem transaction history | POS, CRM | `reward_transactions` | `id`, `customerId`, `type`, `points`, `invoiceId`, `createdAt` | FK to `customers`, `invoices` | Low |

### Platform (SaaS Admin — `pf_` prefix)

| localStorage key | What it stores | Pages that use it | Likely Supabase table | Key fields | Migration risk |
|---|---|---|---|---|---|
| `pf_accounts` | Platform user/org accounts | Platform, Signup | `platform_accounts` | `id`, `email`, `name`, `createdAt` | **High** — currently disconnected from `ab_*` shop data |
| `pf_shops` | Shop records created via signup | Platform, Signup | `shops` (same table as above) | `id`, `name`, `slug`, `plan`, `accountId` | **High** — must merge with real `shops` table |
| `pf_subscriptions` | Subscription billing records | Platform | `subscriptions` | `id`, `shopId`, `planId`, `status`, `currentPeriodEnd` | Low |
| `pf_plans` | SaaS pricing plan definitions | Platform | `plans` | `id`, `name`, `price`, `features[]` | Low |
| `pf_users` | Platform user credentials | Platform, Signup | `auth.users` (Supabase Auth) | `id`, `email`, `role` | **High** — this becomes Supabase Auth; not a custom table |
| `pf_memberships` | Shop → User membership links | Platform | `shop_users` | `id`, `shopId`, `userId`, `role` | Medium |
| `pf_onboardingProgress` | Per-shop onboarding step completion | Signup | `onboarding_steps` | `id`, `shopId`, `step`, `completedAt` | Low |

---

## 2. Multi-Tenant SaaS Model

### Hierarchy

```
Platform
  └── Account (org / business entity — may own multiple shops)
        └── Shop (one physical location or brand)
              └── ShopLocation (optional — for multi-location chains)
                    └── ShopUser (employee at this shop; linked to platform auth user)
                          └── Role (permission set for this shop)
```

Every shop-operational record gets:

| Field | Purpose |
|---|---|
| `shop_id` | Tenant isolation — every query filters on this |
| `location_id` | Optional — for multi-location shops |
| `created_at` | Audit / sort |
| `updated_at` | Cache invalidation, sync |
| `created_by` | FK to `shop_users.id` — who created the record |
| `updated_by` | FK to `shop_users.id` — who last modified it |

**Every Supabase table** at the shop-operational level must carry `shop_id` (and optionally `location_id`). This is not optional — it is the foundation of the RLS policy.

### Key design decisions

- **One `shops` table** covers both the `pf_shops` and `ab_settings` concepts. The current split (platform creates a `pf_shop`, shop app reads `ab_settings`) must converge into a single row.
- **Supabase Auth** (`auth.users`) replaces `pf_users` and `ab_settings.currentUserId`. Shop employees are linked via a `shop_users` join table: `(shop_id, auth_user_id, role_id)`.
- **`ab_jobs` becomes `repair_orders`**, which is the core entity most tables FK into.
- **`ab_bookings` is pre-RO state.** A booking → confirmed booking → repair order; these stay as separate records linked by FK, not merged.

---

## 3. Recommended Supabase Tables

### Core / Auth

```sql
-- Platform identity
accounts          (id, name, email, plan_id, created_at)

-- Shops (merges pf_shops + ab_settings)
shops             (id, account_id, name, slug, phone, address, timezone, logo_url,
                   created_at, updated_at)

-- Shop locations (multi-location, Phase 2+)
shop_locations    (id, shop_id, name, address, phone, timezone, active)

-- Auth link: Supabase auth.users ↔ shop employee
shop_users        (id, shop_id, auth_user_id, role_id, first_name, last_name,
                   job_title, is_tech, pay_type, active,
                   created_at, updated_at, created_by, updated_by)

-- Permission roles
roles             (id, shop_id, name, is_system_role, created_at)

-- Per-role, per-module access level
role_permissions  (id, role_id, module, access_level)
                  -- access_level: 'none' | 'limited' | 'full'

-- Shop config (hours, booking rules, services config, etc.)
shop_settings     (id, shop_id, key, value, updated_at)
```

### Customers & Vehicles

```sql
customers         (id, shop_id, first_name, last_name, email, phone, address,
                   notes, created_at, updated_at, created_by, updated_by)

vehicles          (id, shop_id, customer_id, year, make, model, trim, vin,
                   mileage, color, license_plate, notes,
                   created_at, updated_at, created_by, updated_by)

customer_notes    (id, shop_id, customer_id, body, created_at, created_by)

customer_activity (id, shop_id, customer_id, type, description,
                   entity_type, entity_id, created_at, created_by)
```

### Scheduling

```sql
services          (id, shop_id, name, category, duration_minutes, price, active,
                   created_at, updated_at)

bays              (id, shop_id, location_id, name, active, sort_order)

bookings          (id, shop_id, customer_id, vehicle_id, status,
                   preferred_date, preferred_time_start, preferred_time_end,
                   visit_type, notes, photo_urls[], source, confirmed_ro_id,
                   created_at, updated_at, created_by)

booking_services  (id, booking_id, service_id)  -- M2M normalize

appointments      (id, shop_id, repair_order_id, scheduled_date,
                   time_start, time_end, tech_id, bay_id, visit_type,
                   status, created_at, updated_at)

shifts            (id, shop_id, employee_id, week_start, day_of_week,
                   start_time, end_time, shift_role, published,
                   created_at, updated_at, created_by)

schedule_weeks    (id, shop_id, week_start, status, published_at, published_by)

shift_trade_requests (id, shop_id, requester_id, target_id, shift_id,
                      status, notes, created_at, updated_at)

pto_requests      (id, shop_id, employee_id, type, start_date, end_date,
                   status, notes, reviewed_by, reviewed_at, created_at)

time_clock_entries (id, shop_id, employee_id, clock_in, clock_out,
                    break_minutes, notes, created_at, created_by)

employee_availability (id, shop_id, employee_id, day_of_week,
                       start_time, end_time, effective_from)
```

### Shop Operations

```sql
repair_orders     (id, shop_id, customer_id, vehicle_id, tech_id, bay_id,
                   booking_id, ro_number, status, visit_type, scheduled_date,
                   checked_in_at, started_at, ready_at, closed_at,
                   approval_status, hold_reason, no_show,
                   mileage_in, mileage_out, customer_complaint, notes,
                   quote_id, invoice_id,
                   created_at, updated_at, created_by, updated_by)

ro_line_items     (id, shop_id, repair_order_id, type, description,
                   part_id, qty, unit_cost, unit_price, total,
                   tech_id, status, sort_order,
                   created_at, updated_at)

inspections       (id, shop_id, repair_order_id, tech_id,
                   started_at, completed_at, status, created_at)

inspection_items  (id, inspection_id, category, label, condition,
                   -- condition: 'ok' | 'watch' | 'needs_service' | 'critical'
                   note, photo_urls[], sort_order)

quotes            (id, shop_id, customer_id, vehicle_id, repair_order_id,
                   status, valid_until, subtotal, tax, total,
                   sent_at, approved_at, declined_at, expired_at,
                   created_at, updated_at, created_by, updated_by)

quote_line_items  (id, quote_id, shop_id, type, description, part_id,
                   qty, unit_cost, unit_price, total, sort_order)

quote_approval_events (id, quote_id, shop_id, type, actor_type, actor_id,
                       note, created_at)
```

### Finance

```sql
invoices          (id, shop_id, customer_id, vehicle_id, repair_order_id,
                   invoice_number, status, subtotal, tax, discount, total,
                   paid_total, balance_due, due_date,
                   sent_at, paid_at, voided_at,
                   created_at, updated_at, created_by, updated_by)

invoice_line_items (id, invoice_id, shop_id, type, description, part_id,
                    qty, unit_price, total, sort_order)

payments          (id, shop_id, invoice_id, customer_id,
                   amount, method, reference, tendered, change_given,
                   register_id, processed_at, created_by)

credit_notes      (id, shop_id, invoice_id, customer_id,
                   amount, reason, status, applied_to_invoice_id,
                   created_at, created_by)

expenses          (id, shop_id, date, category, description,
                   amount, vendor, receipt_url, created_at, created_by)

registers         (id, shop_id, location_id, opened_by, opened_at,
                   closed_by, closed_at, opening_float, closing_float,
                   status)

sales             (id, shop_id, register_id, customer_id, invoice_id,
                   total, tender_method, created_at, created_by)

closeout_batches  (id, shop_id, register_id, period_start, period_end,
                   total_sales, total_payments, cash_collected,
                   created_at, created_by)
```

### Inventory

```sql
parts             (id, shop_id, name, sku, description, category,
                   cost_price, sale_price, reorder_point, reorder_qty,
                   supplier_id, active, created_at, updated_at)

inventory_locations (id, shop_id, location_id, name, type, parent_id, active)

inventory_stock   (id, shop_id, part_id, location_id,
                   qty_on_hand, qty_reserved, qty_on_order,
                   updated_at)

inventory_transactions (id, shop_id, part_id, location_id,
                        type, qty, unit_cost, reference_type, reference_id,
                        note, created_at, created_by)
                   -- type: 'receive' | 'consume' | 'adjust' | 'transfer_in' | 'transfer_out' | 'return'

inventory_transfers (id, shop_id, from_location_id, to_location_id,
                     part_id, qty, status, notes,
                     created_at, created_by, completed_at, completed_by)

suppliers         (id, shop_id, name, contact_name, email, phone,
                   account_number, website, notes, active, created_at)

purchase_orders   (id, shop_id, supplier_id, po_number, status,
                   ordered_at, expected_at, received_at, total,
                   notes, created_at, created_by)

purchase_order_items (id, purchase_order_id, shop_id, part_id,
                      qty_ordered, qty_received, unit_cost, total)

inventory_returns (id, shop_id, part_id, supplier_id, qty, reason,
                   status, rga_number, created_at, created_by)

cycle_counts      (id, shop_id, location_id, status,
                   started_at, completed_at, created_by)

cycle_count_items (id, cycle_count_id, shop_id, part_id,
                   qty_expected, qty_counted, variance)
```

### CRM & Marketing

```sql
leads             (id, shop_id, name, email, phone, source, status,
                   assigned_to, customer_id, notes,
                   created_at, updated_at, created_by)

follow_up_tasks   (id, shop_id, title, due_date, assigned_to,
                   entity_type, entity_id, status, notes,
                   completed_at, created_at, created_by)

activity_events   (id, shop_id, entity_type, entity_id, type, title,
                   description, actor_type, actor_id,
                   -- denorm FK helpers (nullable):
                   customer_id, vehicle_id, repair_order_id, quote_id,
                   invoice_id, booking_id, lead_id, campaign_id,
                   channel, status, metadata jsonb,
                   created_at)

entity_links      (id, shop_id, relationship_type,
                   from_type, from_id, to_type, to_id, created_at)

communications    (id, shop_id, customer_id, channel, direction,
                   subject, body, status, sent_at, created_by)

segments          (id, shop_id, name, description, filters jsonb,
                   estimated_size, created_at, updated_at)

message_templates (id, shop_id, name, channel, subject, body,
                   type, active, created_at, updated_at)

campaigns         (id, shop_id, name, segment_id, template_id,
                   status, scheduled_at, sent_at, stats jsonb,
                   created_at, created_by)

automations       (id, shop_id, name, trigger jsonb, action jsonb,
                   active, created_at, updated_at)

team_messages     (id, shop_id, sender_id, recipient_id, body,
                   sent_at, read_at)

team_activity     (id, shop_id, employee_id, type, description, created_at)

employee_documents (id, shop_id, employee_id, type, file_url,
                    uploaded_at, uploaded_by)

audit_logs        (id, shop_id, actor_id, action, entity_type, entity_id,
                   before jsonb, after jsonb, created_at)
```

### Rewards & Membership

```sql
rewards_programs  (id, shop_id, name, earn_rate, redeem_rate,
                   min_redeem_points, active, created_at)

membership_plans  (id, shop_id, name, price, billing_cycle,
                   perks jsonb, active, created_at)

customer_rewards  (id, shop_id, customer_id, program_id, plan_id,
                   points, membership_status, joined_at, expires_at,
                   updated_at)

reward_transactions (id, shop_id, customer_id, type, points,
                     invoice_id, note, created_at, created_by)
                  -- type: 'earn' | 'redeem' | 'adjust' | 'expire'
```

### Platform

```sql
plans             (id, name, price_monthly, price_annual, features jsonb,
                   active, created_at)

subscriptions     (id, shop_id, plan_id, status, current_period_start,
                   current_period_end, stripe_subscription_id,
                   created_at, updated_at)

onboarding_steps  (id, shop_id, step, completed_at)
```

---

## 4. Security / RLS Plan

All row-level security is scoped to `shop_id`. Supabase RLS should be enabled on every table. Policies are described by intent here — SQL not written yet.

### Core tenant isolation

```
POLICY: tenant_isolation
  ON: all shop-operational tables
  USING: shop_id = auth.jwt() -> 'shop_id'
```

Every authenticated request must carry `shop_id` in the JWT claim (set at session creation by the server). No query ever touches another shop's rows.

### Role-based policies

| Role | What they can access |
|---|---|
| `owner` / `general_manager` | All records in their shop — full read/write |
| `service_manager` | All shop records; cannot delete financial or employee records |
| `service_advisor` | Customers, vehicles, repair_orders, quotes, appointments, bookings they're assigned to |
| `technician` | repair_orders assigned to them, ro_line_items, inspections, inspection_items |
| `parts_inventory` | parts, inventory_*, purchase_orders, suppliers only |
| `bookkeeper_finance` | invoices, payments, expenses, credit_notes, closeout_batches, registers — read all shop data for reporting |
| `marketing_crm` | customers, leads, follow_up_tasks, campaigns, segments, communications — no finance |
| `front_desk` | customers, vehicles, bookings, appointments, repair_orders (limited write) |
| `viewer` | Read-only across all non-financial tables |

### Implementation approach

1. Every table has `shop_id` (not nullable).
2. A Postgres function `auth.shop_id()` extracts `shop_id` from the JWT session.
3. Tenant isolation policy (step 1 above) is applied to every table first.
4. Role policies are additive: they restrict within the tenant isolation boundary, they do not extend it.
5. Service-to-service calls (backend functions) use a service-role key that bypasses RLS — these must be used only in trusted server contexts, never in browser code.

---

## 5. Service-Layer Plan

### Current state

All modules call `db.*` (localStorage) directly. `lib/util.js` owns all domain transitions (RO lifecycle, invoice creation, etc.) as a flat 3,433-line file.

### Target state

```
UI modules (modules/**/*.js)
  └── service files (lib/services/*.js)
        └── adapters
              ├── LocalStorageAdapter  (current demo mode)
              └── SupabaseAdapter      (real backend)
                    └── @supabase/supabase-js
```

### Adapter interface pattern

Each service exports an interface that both adapters implement:

```js
// lib/services/customers.js
export const customers = {
  list:    () => adapter.list('customers'),
  getById: (id) => adapter.getById('customers', id),
  create:  (data) => adapter.create('customers', data),
  update:  (id, data) => adapter.update('customers', id, data),
  delete:  (id) => adapter.delete('customers', id),
};
```

The active adapter is set at app boot:

```js
// lib/db-adapter.js
import { LocalStorageAdapter } from './adapters/localStorage.js';
import { SupabaseAdapter } from './adapters/supabase.js';

export const adapter = import.meta.env.VITE_USE_SUPABASE === 'true'
  ? new SupabaseAdapter()
  : new LocalStorageAdapter();
```

This lets the app run in localStorage demo mode indefinitely while the Supabase adapter is built collection by collection.

### Proposed service files

| File | Covers | Current source |
|---|---|---|
| `lib/services/customers.js` | customers, vehicles, customer_notes, customer_activity | `db.customers()`, `db.vehicles()` |
| `lib/services/appointments.js` | bookings, appointments, bays, services | `db.bookings()`, `db.jobs()` (scheduled state) |
| `lib/services/repairOrders.js` | repair_orders, ro_line_items, inspections | `db.jobs()`, `util.checkIn()`, `util.startJob()`, etc. |
| `lib/services/quotes.js` | quotes, quote_line_items, quote_approval_events | `db.quotes()`, quote builder transitions |
| `lib/services/invoices.js` | invoices, invoice_line_items, payments, credit_notes, expenses, closeout | `db.invoices()`, `util.createInvoiceFromRO()`, etc. |
| `lib/services/inventory.js` | parts, inventory_*, purchase_orders, suppliers | `db.parts()`, `db.purchaseOrders()`, etc. |
| `lib/services/crm.js` | leads, follow_up_tasks, activity_events, entity_links, communications | `db.leads()`, `workflow.js` |
| `lib/services/marketing.js` | segments, campaigns, templates, automations | `db.campaigns()`, etc. |
| `lib/services/team.js` | shop_users, shifts, pto_requests, time_clock_entries | `db.employees()`, `db.shifts()`, etc. |
| `lib/services/rewards.js` | rewards_programs, membership_plans, customer_rewards, reward_transactions | `db.rewardsPrograms()`, etc. |
| `lib/services/platform.js` | accounts, shops (SaaS admin), subscriptions, plans | `pf_*` keys |

---

## 6. Migration Strategy

### Phase 1 — Supabase project foundation (no UI changes)

- Create Supabase project; configure environment variables
- Run schema migrations for: `shops`, `shop_users`, `roles`, `role_permissions`
- Implement Supabase Auth; wire up real login/logout replacing demo switcher
- App stays in localStorage demo mode for all other data
- All existing pages continue to work unchanged

### Phase 2 — Core records

Migrate with localStorage fallback adapter active in parallel:

- `customers` → `customers`
- `vehicles` → `vehicles`
- `employees` → `shop_users` + Supabase Auth users
- `settings` → `shops` + `shop_settings`
- `services` → `services`
- `bays` → `bays`
- `roles` → `roles` + `role_permissions`

Smoke test: CRM customer list, employee list, settings all read from Supabase.

### Phase 3 — Scheduling & core workflow

- `bookings` → `bookings` + `booking_services`
- `jobs` → `repair_orders` + `ro_line_items` (denormalized line items must be split out)
- `shifts`, `ptoRequests`, `timeClockEntries` → corresponding tables
- DVI/inspection data extracted from `jobs.dvi` → `inspections` + `inspection_items`

Risk: `ab_jobs` is the most denormalized record. Budget extra time for the field-by-field extraction.

### Phase 4 — Finance & inventory

- `quotes` → `quotes` + `quote_line_items`
- `invoices` → `invoices` + `invoice_line_items` (embedded payments must be split to `payments`)
- `expenses`, `creditNotes`, `registers`, `sales` → corresponding tables
- Inventory tables: mostly 1:1 already normalized; low-risk migration

### Phase 5 — CRM, marketing, rewards

- `leads`, `followUpTasks`, `activityEvents`, `entityLinks` → corresponding tables
- `activityEvents` requires careful schema design (15 nullable FK columns → consider jsonb `metadata` for less-used fields)
- `campaigns`, `segments`, `templates`, `automations` → corresponding tables
- Rewards tables: `rw_*` keys → `rewards_*` tables

### Phase 6 — Cut over; retire demo mode

- Enable `VITE_USE_SUPABASE=true` by default
- Remove LocalStorageAdapter from production build (keep as optional dev mode)
- Remove demo reset / seed UI from `index.html`
- Connect `signup.html` → real Supabase shop creation
- Connect `platform.html` → real Supabase admin queries

---

## 7. What Not To Migrate Yet

These areas are explicitly out of scope for the migration and should be left as placeholders:

| Area | Why deferred |
|---|---|
| **Payroll compliance** | Time clock data exists; wage/hour law, overtime rules, and payroll outputs (pay stubs, direct deposit) require state-level compliance logic and likely a payroll provider API |
| **Real email/SMS sending** | Resend and Twilio need to be wired in `mkt-campaigns.js` and `mkt-automations.js`; this is a separate Phase C feature, not a migration task |
| **Payment processing** | Stripe Checkout/Elements are scaffolded but not built; this is its own integration milestone |
| **Accounting sync** | QuickBooks/accounting export is an empty tab; build the export format first, then wire the Supabase → export pipeline |
| **Multi-location rollups** | `shop_locations` table is defined here but the UI has no location-switching; build after Phase 2 is stable |
| **Labor guide / parts pricing integrations** | Requires supplier API credentials and contracts; entirely separate from the Supabase migration |
| **Real DVI photos** | `inspection_items.photo_urls[]` will use Supabase Storage, but the upload UX is not built yet |

---

## 8. Risks

| Risk | Severity | Detail |
|---|---|---|
| **`ab_jobs` denormalization** | High | `lineItems[]`, `dvi{}`, `recommended[]` are embedded arrays on the job object. Splitting these to `ro_line_items`, `inspections`, `inspection_items` is the highest-risk migration step. Need a careful field mapping before writing any migration SQL. |
| **`ab_invoices` embedded payments** | High | `invoice.payments[]` is an embedded array, not a separate table. Extracting these to a `payments` table requires ensuring totals remain consistent. |
| **`ab_quotes` embedded line items** | Medium | Same pattern as invoices — `quote.lineItems[]` must be normalized to `quote_line_items`. |
| **`ab_activityEvents` 15-FK schema** | Medium | `workflow.js` records events with ~15 optional FK fields on one record. In Postgres this is legal but expensive. Consider moving less-used FKs into a `metadata jsonb` column. |
| **`ab_entityLinks` polymorphic FKs** | Medium | Links between arbitrary entity types (`from_type`, `from_id`, `to_type`, `to_id`). Postgres doesn't enforce FK constraints on polymorphic keys. Use a Postgres `CHECK` constraint with an enum for `from_type` and `to_type` to prevent orphaned links. |
| **Weak relational constraints in demo data** | Medium | localStorage arrays have no FK enforcement. Demo data may contain orphaned IDs (e.g., a job with a `techId` that no longer exists in `ab_employees`). A data audit pass is needed before importing any demo records. |
| **Line items don't snapshot costs** | Medium | Some `lineItems` on ROs and invoices store current part price, not cost-at-time-of-sale. This makes historical margin reports inaccurate after a price change. Add `unit_cost` (snapshotted at transaction time) to all line item tables. |
| **Role permissions are currently UI-only** | High | `lib/auth.js` warns explicitly that all permission checks are frontend-only. Supabase RLS policies are required before any real data is at risk. Phase 1 auth work must include at least the tenant isolation policy before any real shop data is stored. |
| **Platform/shop data is disconnected** | High | `pf_shops` and `ab_settings` are completely separate. A shop created via `signup.html` currently does not affect the running shop app at all. This must be resolved in Phase 1 — the shop session needs to know which `shop_id` the authenticated user belongs to. |
| **No real audit log yet** | Low | `ab_auditLogs` exists but is sparsely populated. Before switching to Supabase, add Postgres triggers or application-level hooks to guarantee audit coverage for financial and permission-related events. |
| **Demo seed data → multi-tenant mapping** | Low | Seed data in `lib/data.js` was written for a single-shop demo. Importing it into a multi-tenant Supabase schema requires assigning a `shop_id` to every seed record. Straightforward but must not be skipped. |

---

## 9. Recommended First Build Task

**Option A — Supabase schema draft (recommended first step)**

Write the SQL migration files for Phase 1 tables only:
- `shops`, `shop_users`, `roles`, `role_permissions`, `shop_settings`

Then wire Supabase Auth login/logout replacing the demo switcher. This is the smallest real backend step that unlocks everything else — without real auth and a real `shop_id` in the session, no other migration can be tenant-safe.

**Option B — Service-layer adapter pattern**

Extract the adapter interface into `lib/services/customers.js` with a `LocalStorageAdapter` only. No Supabase yet. This makes the code ready to swap adapters but adds zero real backend capability.

**Recommendation: do Option A first, then Option B during Phase 2.**

Option A establishes the tenant model and real auth — the architectural foundation everything else depends on. Option B is a code-quality improvement that can be done incrementally alongside the Supabase migration, not as a prerequisite to it.

Neither should be started until the `lib/util.js` → `lib/services/*.js` extraction (Phase C/D in `structural-refactor-plan.md`) is at least partially complete, since the service files created there are the same service files that will receive the Supabase adapter.
