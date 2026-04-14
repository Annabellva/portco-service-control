import Link from 'next/link'
import { requireHQ } from '@/lib/permissions'
import { maybeRunScheduler } from '@/lib/scheduler'
import { prisma } from '@/lib/prisma'
import { Shell } from '@/components/layout/shell'
import { KpiCard } from '@/components/kpi-card'
import { HealthScore } from '@/components/health-score'
import { EscalationBadge } from '@/components/badges/escalation-badge'
import { formatHours } from '@/lib/utils'
import { AlertTriangle, TrendingDown, ChevronRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function HQPage() {
  const user = await requireHQ()
  await maybeRunScheduler()

  // Latest metric snapshot per portco
  const portcos = await prisma.portco.findMany({
    orderBy: { id: 'asc' },
  })

  const snapshots = await Promise.all(
    portcos.map((p) =>
      prisma.portcoMetricSnapshot.findFirst({
        where: { portcoId: p.id },
        orderBy: { capturedAt: 'desc' },
      })
    )
  )

  const portcoData = portcos
    .map((p, i) => ({ portco: p, snapshot: snapshots[i] }))
    .sort((a, b) => {
      const aScore = a.snapshot?.healthScore ?? 100
      const bScore = b.snapshot?.healthScore ?? 100
      return aScore - bScore // worst first
    })

  // Aggregate KPIs
  const totalOpen = portcoData.reduce(
    (sum, { snapshot }) => sum + (snapshot?.openCaseCount ?? 0),
    0
  )
  const totalOverdue = portcoData.reduce(
    (sum, { snapshot }) => sum + (snapshot?.overdueCount ?? 0),
    0
  )
  const totalRedFlags = portcoData.reduce(
    (sum, { snapshot }) => sum + (snapshot?.redFlagCount ?? 0),
    0
  )

  // Avg first response across portcos (weighted)
  const responseSamples = portcoData
    .map(({ snapshot }) => snapshot?.avgFirstResponseHours)
    .filter((v): v is number => v != null)
  const avgFirstResponse =
    responseSamples.length > 0
      ? responseSamples.reduce((a, b) => a + b, 0) / responseSamples.length
      : null

  return (
    <Shell user={user} activePath="/hq">
      <div className="p-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-900">HQ Overview</h1>
          <p className="text-sm text-slate-500 mt-1">
            Aggregated service performance across all portfolio companies
          </p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <KpiCard label="Open Cases" value={totalOpen} />
          <KpiCard
            label="Overdue Cases"
            value={totalOverdue}
            variant={totalOverdue > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            label="Red Flags (Esc. 3)"
            value={totalRedFlags}
            variant={totalRedFlags > 0 ? 'danger' : 'default'}
          />
          <KpiCard
            label="Avg First Response"
            value={avgFirstResponse != null ? formatHours(avgFirstResponse) : '—'}
            variant={
              avgFirstResponse == null
                ? 'default'
                : avgFirstResponse > 24
                ? 'danger'
                : avgFirstResponse > 8
                ? 'warning'
                : 'good'
            }
          />
        </div>

        {/* Red flag alert bar */}
        {totalRedFlags > 0 && (
          <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700 font-medium">
              {totalRedFlags} case{totalRedFlags !== 1 ? 's' : ''} require HQ
              attention — escalation level 3 reached.
            </p>
          </div>
        )}

        {/* Portco table */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Portfolio Companies
            </h2>
            <span className="text-xs text-slate-400">Sorted by health score — worst first</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Company
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Health
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Open
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Overdue
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Red Flags
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Repeat Follow-ups
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Avg Response
                </th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {portcoData.map(({ portco, snapshot }) => {
                const score = snapshot?.healthScore ?? 100
                const open = snapshot?.openCaseCount ?? 0
                const overdue = snapshot?.overdueCount ?? 0
                const redFlags = snapshot?.redFlagCount ?? 0
                const repeatRate = snapshot?.repeatFollowUpRate ?? 0
                const avgResp = snapshot?.avgFirstResponseHours ?? null
                const isUnhealthy = score < 50

                return (
                  <tr
                    key={portco.id}
                    className="border-b border-gray-50 last:border-0 table-row-hover"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {isUnhealthy && (
                          <TrendingDown className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        )}
                        <div>
                          <p className="font-medium text-slate-900">
                            {portco.name}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {portco.inboundAlias}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <HealthScore score={score} showBar />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="font-medium text-slate-700">{open}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span
                        className={
                          overdue > 0
                            ? 'font-semibold text-amber-700'
                            : 'text-slate-500'
                        }
                      >
                        {overdue}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span
                        className={
                          redFlags > 0
                            ? 'font-semibold text-red-600'
                            : 'text-slate-500'
                        }
                      >
                        {redFlags}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span
                        className={
                          repeatRate > 0.3
                            ? 'text-orange-600 font-medium'
                            : 'text-slate-600'
                        }
                      >
                        {(repeatRate * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right text-slate-600">
                      {formatHours(avgResp)}
                    </td>
                    <td className="px-3 py-4 text-right">
                      <Link
                        href={`/cases?portcoId=${portco.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
                      >
                        Cases <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* HQ-visible red flag cases */}
        {totalRedFlags > 0 && (
          <RedFlagCases />
        )}
      </div>
    </Shell>
  )
}

async function RedFlagCases() {
  const redFlagCases = await prisma.case.findMany({
    where: { escalationLevel: { gte: 3 }, status: { not: 'RESOLVED' } },
    include: { portco: true },
    orderBy: { openedAt: 'asc' },
  })

  return (
    <div className="mt-6 bg-white rounded-lg border border-red-200">
      <div className="px-6 py-4 border-b border-red-100 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-600" />
        <h2 className="text-sm font-semibold text-red-700">
          Cases Requiring HQ Attention ({redFlagCases.length})
        </h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-red-50 bg-red-50/30">
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Case</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Portco</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Subject</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Escalation</th>
          </tr>
        </thead>
        <tbody>
          {redFlagCases.map((c) => (
            <tr key={c.id} className="border-b border-red-50 last:border-0 hover:bg-red-50/20">
              <td className="px-6 py-3">
                <Link href={`/cases/${c.id}`} className="font-mono text-xs font-medium text-slate-700 hover:text-slate-900">
                  {c.caseNumber}
                </Link>
              </td>
              <td className="px-4 py-3 text-xs text-slate-600">{c.portco.name}</td>
              <td className="px-4 py-3 text-xs text-slate-700">{c.customerName}</td>
              <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">{c.subject}</td>
              <td className="px-4 py-3">
                <EscalationBadge level={c.escalationLevel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
