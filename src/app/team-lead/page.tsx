import Link from 'next/link'
import { requireTeamLead } from '@/lib/permissions'
import { maybeRunScheduler } from '@/lib/scheduler'
import { prisma } from '@/lib/prisma'
import { Shell } from '@/components/layout/shell'
import { KpiCard } from '@/components/kpi-card'
import { PriorityBadge } from '@/components/badges/priority-badge'
import { StatusBadge } from '@/components/badges/status-badge'
import { formatDateTime } from '@/lib/utils'
import { AlertTriangle, Clock, RefreshCw, Users, MessageSquareOff, Timer } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function TeamLeadPage() {
  const user = await requireTeamLead()
  await maybeRunScheduler()

  if (!user.portcoId) {
    return (
      <Shell user={user} activePath="/team-lead">
        <div className="p-8">
          <p className="text-slate-500">No portco assigned to your account.</p>
        </div>
      </Shell>
    )
  }

  const now = new Date()
  const portco = await prisma.portco.findUnique({ where: { id: user.portcoId } })
  const openCases = await prisma.case.findMany({
    where: { portcoId: user.portcoId, status: { not: 'RESOLVED' } },
    orderBy: [{ priority: 'asc' }, { openedAt: 'asc' }],
  })

  // ── Key queues the team lead is responsible for ──────────────────────────

  // 1. Awaiting first response — customer is waiting, no one has replied yet
  const awaitingFirstResponse = openCases.filter(
    (c) => !c.firstResponseAt
  )

  // 2. SLA breach on first response — past deadline, still no reply
  const firstResponseBreached = awaitingFirstResponse.filter((c) => {
    const hoursWaiting =
      (now.getTime() - c.lastCustomerMessageAt.getTime()) / 3_600_000
    return hoursWaiting > c.slaFirstResponseHours
  })

  // 3. No internal update for >48h (team went silent on an open case)
  const teamSilent = openCases.filter((c) => {
    const lastTouch = c.lastInternalUpdateAt ?? c.openedAt
    const hours = (now.getTime() - lastTouch.getTime()) / 3_600_000
    return hours > 48
  })

  // 4. Customer has followed up multiple times without resolution
  const repeatFollowUps = openCases.filter(
    (c) => c.repeatFollowUpCount >= 2
  )

  // 5. Overdue (past resolution SLA)
  const overdueCases = openCases.filter((c) => c.isOverdue)

  // ── Internal owner breakdown ─────────────────────────────────────────────
  const ownerMap = new Map<
    string,
    {
      cases: typeof openCases
      noResponse: number
      silent: number
      overdue: number
    }
  >()
  for (const c of openCases) {
    const owner = c.assignedInternalOwnerName ?? '(Unassigned)'
    if (!ownerMap.has(owner)) {
      ownerMap.set(owner, { cases: [], noResponse: 0, silent: 0, overdue: 0 })
    }
    const entry = ownerMap.get(owner)!
    entry.cases.push(c)
    if (!c.firstResponseAt) entry.noResponse++
    const lastTouch = c.lastInternalUpdateAt ?? c.openedAt
    const silentHours = (now.getTime() - lastTouch.getTime()) / 3_600_000
    if (silentHours > 48) entry.silent++
    if (c.isOverdue) entry.overdue++
  }
  const ownerRows = Array.from(ownerMap.entries()).sort(
    (a, b) =>
      b[1].noResponse - a[1].noResponse ||
      b[1].silent - a[1].silent
  )

  return (
    <Shell user={user} activePath="/team-lead">
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-900">{portco?.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Your queue — {openCases.length} open case
            {openCases.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* KPI cards — all focused on TL responsibility */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <KpiCard
            label="Awaiting First Response"
            value={awaitingFirstResponse.length}
            sub="customers waiting for any reply"
            variant={
              firstResponseBreached.length > 0
                ? 'danger'
                : awaitingFirstResponse.length > 0
                ? 'warning'
                : 'default'
            }
          />
          <KpiCard
            label="First Response SLA Breached"
            value={firstResponseBreached.length}
            sub="past deadline, still no reply sent"
            variant={firstResponseBreached.length > 0 ? 'danger' : 'default'}
          />
          <KpiCard
            label="Team Silent >48h"
            value={teamSilent.length}
            sub="open cases with no internal update"
            variant={teamSilent.length > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            label="Repeat Follow-ups"
            value={repeatFollowUps.length}
            sub="customers chasing ≥2 times"
            variant={repeatFollowUps.length > 0 ? 'warning' : 'default'}
          />
        </div>

        {/* Section 1: First response breaches — most urgent */}
        {firstResponseBreached.length > 0 && (
          <CaseSection
            title="No Reply Sent — SLA Breached"
            subtitle="These customers have been waiting past the first-response deadline. Reply immediately."
            icon={MessageSquareOff}
            iconClass="text-red-600"
            borderClass="border-red-200"
            headerClass="bg-red-50/50"
            cases={firstResponseBreached}
            now={now}
            showWaitTime
          />
        )}

        {/* Section 2: Awaiting first response (within SLA) */}
        {awaitingFirstResponse.filter(c => !firstResponseBreached.includes(c)).length > 0 && (
          <CaseSection
            title="Awaiting First Response"
            subtitle="No reply sent yet. SLA clock is running."
            icon={Timer}
            iconClass="text-amber-600"
            borderClass="border-amber-200"
            headerClass="bg-amber-50/30"
            cases={awaitingFirstResponse.filter(c => !firstResponseBreached.includes(c))}
            now={now}
            showWaitTime
          />
        )}

        {/* Section 3: Team has gone silent */}
        {teamSilent.filter(c => c.firstResponseAt).length > 0 && (
          <CaseSection
            title="No Internal Update >48 Hours"
            subtitle="A reply was sent, but no one has touched these cases since. Check status and update."
            icon={Clock}
            iconClass="text-orange-600"
            borderClass="border-orange-200"
            headerClass=""
            cases={teamSilent.filter(c => c.firstResponseAt)}
            now={now}
            showLastUpdate
          />
        )}

        {/* Section 4: Repeat follow-ups */}
        {repeatFollowUps.length > 0 && (
          <CaseSection
            title="Repeated Customer Follow-ups"
            subtitle="Customer has sent multiple messages without getting a resolution."
            icon={RefreshCw}
            iconClass="text-orange-500"
            borderClass="border-gray-200"
            headerClass=""
            cases={repeatFollowUps}
            now={now}
            showFollowUpCount
          />
        )}

        {/* Section 5: Internal owner breakdown */}
        <div className="mt-6 bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                By Internal Owner
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Who has the most unanswered cases right now
              </p>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Owner
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Open Cases
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  No Reply Sent
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Silent {'>'}48h
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Overdue
                </th>
              </tr>
            </thead>
            <tbody>
              {ownerRows.map(([owner, data]) => (
                <tr
                  key={owner}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-6 py-3 font-medium text-slate-800">
                    {owner}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {data.cases.length}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={
                        data.noResponse > 0
                          ? 'font-bold text-red-600'
                          : 'text-slate-400'
                      }
                    >
                      {data.noResponse}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={
                        data.silent > 0
                          ? 'font-semibold text-amber-600'
                          : 'text-slate-400'
                      }
                    >
                      {data.silent}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={
                        data.overdue > 0
                          ? 'font-semibold text-red-600'
                          : 'text-slate-400'
                      }
                    >
                      {data.overdue}
                    </span>
                  </td>
                </tr>
              ))}
              {ownerRows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-sm text-slate-400"
                  >
                    No open cases.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  )
}

// ── Case table component ────────────────────────────────────────────────────

function hoursAgoLabel(date: Date | null | undefined, now: Date): string {
  if (!date) return '—'
  const h = (now.getTime() - date.getTime()) / 3_600_000
  if (h < 1) return `${Math.round(h * 60)}m ago`
  if (h < 24) return `${h.toFixed(1)}h ago`
  return `${(h / 24).toFixed(1)}d ago`
}

function CaseSection({
  title,
  subtitle,
  icon: Icon,
  iconClass,
  borderClass,
  headerClass,
  cases,
  now,
  showWaitTime,
  showLastUpdate,
  showFollowUpCount,
}: {
  title: string
  subtitle: string
  icon: React.ElementType
  iconClass: string
  borderClass: string
  headerClass: string
  cases: Awaited<ReturnType<typeof prisma.case.findMany>>
  now: Date
  showWaitTime?: boolean
  showLastUpdate?: boolean
  showFollowUpCount?: boolean
}) {
  if (cases.length === 0) return null

  return (
    <div className={`mb-6 bg-white rounded-lg border ${borderClass}`}>
      <div
        className={`px-6 py-4 border-b ${borderClass} flex items-start gap-2 ${headerClass}`}
      >
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconClass}`} />
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {title}{' '}
            <span className="text-slate-400 font-normal">({cases.length})</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Case
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Customer
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Subject
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Priority
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Owner
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {showWaitTime
                ? 'Waiting Since'
                : showLastUpdate
                ? 'Last Update'
                : 'Last Customer Msg'}
            </th>
            {showFollowUpCount && (
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Follow-ups
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => {
            const waitingHours =
              (now.getTime() - c.lastCustomerMessageAt.getTime()) / 3_600_000
            const isUrgent = waitingHours > c.slaFirstResponseHours

            return (
              <tr
                key={c.id}
                className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 ${
                  isUrgent && showWaitTime ? 'bg-red-50/10' : ''
                }`}
              >
                <td className="px-6 py-3">
                  <Link
                    href={`/cases/${c.id}`}
                    className="font-mono text-xs font-semibold text-slate-700 hover:text-blue-600 transition-colors"
                  >
                    {c.caseNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-slate-700">
                  {c.customerName}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">
                  {c.subject}
                </td>
                <td className="px-4 py-3">
                  <PriorityBadge priority={c.priority} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {c.assignedInternalOwnerName ?? '—'}
                </td>
                <td className="px-4 py-3">
                  {showWaitTime && (
                    <span
                      className={`text-xs font-medium ${
                        isUrgent ? 'text-red-600' : 'text-amber-600'
                      }`}
                    >
                      {hoursAgoLabel(c.lastCustomerMessageAt, now)}
                    </span>
                  )}
                  {showLastUpdate && (
                    <span className="text-xs text-orange-600 font-medium">
                      {hoursAgoLabel(c.lastInternalUpdateAt ?? c.openedAt, now)}
                    </span>
                  )}
                  {!showWaitTime && !showLastUpdate && (
                    <span className="text-xs text-slate-500">
                      {hoursAgoLabel(c.lastCustomerMessageAt, now)}
                    </span>
                  )}
                </td>
                {showFollowUpCount && (
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-bold text-orange-600">
                      ×{c.repeatFollowUpCount}
                    </span>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
