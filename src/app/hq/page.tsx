import Link from 'next/link'
import { requireHQ } from '@/lib/permissions'
import { maybeRunScheduler } from '@/lib/scheduler'
import { prisma } from '@/lib/prisma'
import { Shell } from '@/components/layout/shell'
import { KpiCard } from '@/components/kpi-card'
import { HealthScore } from '@/components/health-score'
import { formatHours, formatDateTime } from '@/lib/utils'
import { AlertTriangle, TrendingDown, ChevronRight, UserX } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function HQPage() {
  const user = await requireHQ()
  await maybeRunScheduler()

  const now = new Date()

  // Latest metric snapshot per portco
  const portcos = await prisma.portco.findMany({ orderBy: { id: 'asc' } })

  const snapshots = await Promise.all(
    portcos.map((p) =>
      prisma.portcoMetricSnapshot.findFirst({
        where: { portcoId: p.id },
        orderBy: { capturedAt: 'desc' },
      })
    )
  )

  // Team lead accountability: per portco, how many cases are being ignored
  const accountability = await Promise.all(
    portcos.map(async (p, i) => {
      const openCases = await prisma.case.findMany({
        where: { portcoId: p.id, status: { not: 'RESOLVED' } },
      })

      // Cases with no first response past SLA
      const noResponseOverdue = openCases.filter((c) => {
        if (c.firstResponseAt) return false
        const hours =
          (now.getTime() - c.lastCustomerMessageAt.getTime()) / 3_600_000
        return hours > c.slaFirstResponseHours
      }).length

      // Cases with no internal update for >48h (team lead silence)
      const silentCases = openCases.filter((c) => {
        const lastTouch = c.lastInternalUpdateAt ?? c.openedAt
        const hours = (now.getTime() - lastTouch.getTime()) / 3_600_000
        return hours > 48
      }).length

      // Cases where customer has followed up ≥2 times unanswered
      const repeatUnanswered = openCases.filter(
        (c) => c.repeatFollowUpCount >= 2
      ).length

      // Team lead user
      const teamLead = p.teamLeadUserId
        ? await prisma.user.findUnique({ where: { id: p.teamLeadUserId } })
        : null

      const snapshot = snapshots[i]
      const score = snapshot?.healthScore ?? 100

      // Severity: needs HQ action if silent cases or no-response overdue are high
      const needsAttention =
        noResponseOverdue >= 2 || silentCases >= 3 || score < 40

      return {
        portco: p,
        teamLead,
        openCount: openCases.length,
        noResponseOverdue,
        silentCases,
        repeatUnanswered,
        healthScore: score,
        needsAttention,
      }
    })
  )

  // Sort: most broken portcos first
  accountability.sort(
    (a, b) => a.healthScore - b.healthScore
  )

  // Aggregate KPIs — HQ level, not client level
  const totalOpen = accountability.reduce((s, a) => s + a.openCount, 0)
  const totalNoResponse = accountability.reduce(
    (s, a) => s + a.noResponseOverdue,
    0
  )
  const totalSilent = accountability.reduce((s, a) => s + a.silentCases, 0)
  const portcosNeedingAttention = accountability.filter(
    (a) => a.needsAttention
  ).length

  const avgScore =
    accountability.length > 0
      ? Math.round(
          accountability.reduce((s, a) => s + a.healthScore, 0) /
            accountability.length
        )
      : 100

  return (
    <Shell user={user} activePath="/hq">
      <div className="p-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-900">HQ Overview</h1>
          <p className="text-sm text-slate-500 mt-1">
            Team lead accountability across all portfolio companies
          </p>
        </div>

        {/* KPI cards — all about TL performance, not individual clients */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <KpiCard label="Total Open Cases" value={totalOpen} />
          <KpiCard
            label="No First Response (past SLA)"
            value={totalNoResponse}
            sub="customers waiting, TL has not responded"
            variant={totalNoResponse > 0 ? 'danger' : 'default'}
          />
          <KpiCard
            label="TL Silent >48h"
            value={totalSilent}
            sub="open cases with no internal update"
            variant={totalSilent > 3 ? 'danger' : totalSilent > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            label="Portfolio Avg Health"
            value={avgScore}
            sub={`${portcosNeedingAttention} portco${portcosNeedingAttention !== 1 ? 's' : ''} need attention`}
            variant={avgScore < 50 ? 'danger' : avgScore < 70 ? 'warning' : 'good'}
          />
        </div>

        {/* Alert bar */}
        {portcosNeedingAttention > 0 && (
          <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700 font-medium">
              {portcosNeedingAttention} portco
              {portcosNeedingAttention !== 1 ? 's require' : ' requires'} your
              intervention — team lead response gaps are too large.
            </p>
          </div>
        )}

        {/* Team lead accountability table */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Team Lead Accountability
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Sorted by health score — worst first. Click a portco to see its
                case list.
              </p>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Portco
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Team Lead
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Health
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Open
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  No Response (past SLA)
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Silent {'>'}48h
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Repeat Follow-ups
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {accountability.map((row) => (
                <tr
                  key={row.portco.id}
                  className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${
                    row.needsAttention ? 'bg-red-50/20' : ''
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {row.healthScore < 50 && (
                        <TrendingDown className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-slate-900">
                          {row.portco.name}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {row.portco.inboundAlias}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {row.teamLead ? (
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {row.teamLead.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {row.teamLead.email}
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-red-500">
                        <UserX className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">
                          No team lead assigned
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <HealthScore score={row.healthScore} showBar />
                  </td>
                  <td className="px-4 py-4 text-right font-medium text-slate-700">
                    {row.openCount}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span
                      className={
                        row.noResponseOverdue > 0
                          ? 'font-bold text-red-600'
                          : 'text-slate-400'
                      }
                    >
                      {row.noResponseOverdue}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span
                      className={
                        row.silentCases >= 3
                          ? 'font-bold text-red-600'
                          : row.silentCases > 0
                          ? 'font-semibold text-amber-600'
                          : 'text-slate-400'
                      }
                    >
                      {row.silentCases}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span
                      className={
                        row.repeatUnanswered > 1
                          ? 'font-semibold text-orange-600'
                          : 'text-slate-500'
                      }
                    >
                      {row.repeatUnanswered}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    {row.needsAttention ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                        <AlertTriangle className="w-3 h-3" /> Intervene
                      </span>
                    ) : row.healthScore < 70 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                        Monitor
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                        OK
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-4 text-right">
                    <Link
                      href={`/cases?portcoId=${row.portco.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
                    >
                      Cases <ChevronRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* What HQ should do — intervention guidance */}
        {accountability.some((a) => a.needsAttention) && (
          <div className="mt-6 bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-slate-900">
                Recommended Actions
              </h2>
            </div>
            <div className="divide-y divide-gray-50">
              {accountability
                .filter((a) => a.needsAttention)
                .map((row) => (
                  <div
                    key={row.portco.id}
                    className="px-6 py-4 flex items-start justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {row.portco.name}
                        {row.teamLead
                          ? ` — contact ${row.teamLead.name}`
                          : ' — assign a team lead immediately'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {[
                          row.noResponseOverdue > 0 &&
                            `${row.noResponseOverdue} customer${row.noResponseOverdue > 1 ? 's' : ''} waiting with no response past SLA`,
                          row.silentCases > 0 &&
                            `${row.silentCases} case${row.silentCases > 1 ? 's' : ''} with no internal activity for >48h`,
                          row.repeatUnanswered > 0 &&
                            `${row.repeatUnanswered} case${row.repeatUnanswered > 1 ? 's' : ''} with repeat customer follow-ups`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <Link
                      href={`/cases?portcoId=${row.portco.id}`}
                      className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors whitespace-nowrap ml-6"
                    >
                      View cases →
                    </Link>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
