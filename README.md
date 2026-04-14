# Portco Service Control

A lightweight service control layer for a property management roll-up. Tracks inbound and outbound emails as cases, enforces SLA accountability, escalates automatically, and gives HQ an aggregated view of which portfolio companies are underperforming.

## Quick Start

```bash
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo Login Credentials

No passwords — just click a user on the login screen.

| User | Role | Access |
|------|------|--------|
| **Sarah Klein** | HQ | All portcos, HQ dashboard, admin/demo controls |
| **Lars Müller** | Team Lead | Hamburg Immobilien GmbH (healthy portco) |
| **Anna Schmidt** | Team Lead | Berlin Residenz KG (medium performance) |

Munich (failing portco) has no team lead — visible only to HQ as a red flag.

---

## What the Product Does

Portco Service Control is not a helpdesk. It's an operations layer that sits between email and accountability:

1. **Email → Case**: Every inbound customer email creates or updates a case. Outbound replies are tracked. No manual data entry.
2. **Auto-classification**: Keywords in subject and body determine category (Maintenance, Billing, Complaint, Heating…) and priority (CRITICAL to LOW), which sets the SLA clock.
3. **SLA tracking**: Every case has a first-response SLA and a resolution SLA. Breaches are computed continuously.
4. **Escalation engine**: Cases escalate (level 1→3) based on response delays, repeat follow-ups, and lack of internal updates. Level 3 triggers HQ attention.
5. **Portco health scores**: Each portfolio company gets a rolling health score (0–100) based on overdue rate, red flag rate, repeat follow-up rate, and average response speed.
6. **Role separation**: Team leads see their portco's details including internal owner breakdowns. HQ sees aggregated performance without internal owner attribution.

---

## How Autonomous Tracking Works

### Inbound Email Processing (`POST /api/inbound-email`)

When an email arrives:
1. Resolve portco from the `to` address (e.g. `cases@berlin-residenz.de`).
2. Try to match an existing open case using `externalThreadKey` (email thread ID).
3. Fallback: match by normalized subject + customer email + portco within 30 days.
4. **Match found**: add message, increment `repeatFollowUpCount`, update `lastCustomerMessageAt`.
5. **No match**: create new case. Classify subject+body with deterministic keyword rules. Set priority, SLA hours, and a heuristic summary.

### Outbound Email Processing (`POST /api/outbound-email`)

When an internal reply is sent (BCC'd to the API):
1. Match to existing case by thread key or normalized subject.
2. Add outbound message.
3. If `firstResponseAt` is null → set it now.
4. Update `lastInternalUpdateAt`. Set status to `WAITING_ON_CUSTOMER`.

### Scheduler (automatic on dashboard load, or manual)

Runs automatically if more than 5 minutes have passed since last run. For each open case:

- If no first response and SLA elapsed → escalation level ≥ 1
- If `repeatFollowUpCount ≥ 2` → escalation level ≥ 2
- If no internal update for > 48h → escalation level ≥ 2
- If CRITICAL and no internal update for > 24h → escalation level 3
- `isOverdue = hoursOpen > slaResolutionHours`
- `needsHQAttention = escalationLevel ≥ 3`

After updating cases, it recalculates portco health scores and saves a `PortcoMetricSnapshot`.

### Health Score Formula

```
start at 100
− overdueRate × 30
− redFlagRate × 30
− repeatFollowUpRate × 20
− slowFirstResponsePenalty × 20   (normalized against 8h target)
clamped 0–100
```

---

## Going Live: What You'd Change

The app is fully functional in demo mode. To connect to real email:

### 1. Forward Inbound Emails

Configure your email provider (Postmark, Mailgun, SendGrid, etc.) to forward inbound emails as a webhook:

```
POST https://your-domain.com/api/inbound-email
Content-Type: application/json

{
  "from": "tenant@example.com",
  "to": "cases@berlin-residenz.de",
  "subject": "Heizung defekt",
  "bodyText": "...",
  "sentAt": "2024-01-15T09:30:00Z",
  "externalThreadKey": "email-thread-id-from-provider",
  "externalMessageId": "msg-id"
}
```

Each portco alias (`cases@hamburg-immo.de`, etc.) maps to a portco in the database.

### 2. BCC All Outbound Replies

When team members reply to customers, BCC a dedicated address (e.g. `outbound@portco-control.internal`) that forwards to:

```
POST https://your-domain.com/api/outbound-email
Content-Type: application/json

{
  "from": "cases@berlin-residenz.de",
  "to": "tenant@example.com",
  "subject": "Re: Heizung defekt",
  "bodyText": "...",
  "sentAt": "2024-01-15T10:15:00Z",
  "externalThreadKey": "same-thread-id"
}
```

### 3. Production Hardening

- Replace `SESSION_SECRET` in `.env.local` with a secure random string
- Switch SQLite to PostgreSQL (change `DATABASE_URL` and Prisma provider)
- Add API key authentication to the email webhook endpoints
- Set up a real cron job to call `POST /api/scheduler` every 5–15 minutes
- Move `prisma/dev.db` to a persistent volume

---

## Architecture

```
src/
  app/
    login/          - Demo role login
    hq/             - HQ aggregated dashboard
    team-lead/      - Team lead portco dashboard
    cases/          - Master case list (HQ) + case detail
    admin/demo/     - Demo controls (clock, email injection, scheduler)
    api/
      auth/         - Login/logout (HMAC-signed cookie)
      inbound-email/  - Email intake
      outbound-email/ - Reply tracking
      scheduler/    - Manual scheduler trigger
      demo/         - Demo action endpoints
  lib/
    auth.ts         - HMAC session
    classification.ts - Keyword-based email classification
    sla.ts          - SLA hours by priority
    escalation.ts   - Escalation level calculation
    metrics.ts      - Portco health score
    scheduler.ts    - Auto-run orchestration
    case-matching.ts - Thread/subject matching
    demo-clock.ts   - Virtual clock offset
  components/
    layout/         - Shell, sidebar, logout
    badges/         - Priority, status, escalation badges
    kpi-card.tsx    - Metric display cards
    health-score.tsx - Score with color indicator
prisma/
  schema.prisma
  seed.ts          - 3 portcos, 3 users, 23 cases, ~60 messages
```

## Seeded Demo Data

| Portco | Health Score | Cases | Notes |
|--------|-------------|-------|-------|
| Hamburg Immobilien GmbH | ~85 | 6 | Mostly resolved, fast responses, no escalations |
| Berlin Residenz KG | ~50 | 9 | Mix: some overdue, 1 red flag, repeat follow-ups |
| München Grundbesitz GmbH | ~15 | 8 | Critical failures: 4 HQ-level escalations, all overdue |
