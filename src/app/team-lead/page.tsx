import Link from 'next/link'
import { requireTeamLead } from '@/lib/permissions'
import { maybeRunScheduler } from '@/lib/scheduler'
import { prisma } from '@/lib/prisma'
import { Shell } from '@/components/layout/shell'
import { KpiCard } from '@/components/kpi-card'
import { PriorityBadge } from '@/components/badges/priority-badge'
import { StatusBadge } from '@/components/badges/status-badge'
import { EscalationBadge } from '@/components/badges/escalation-badge'
import { formatDateTime, formatHours } from '@/lib/utils'
import { AlertTriangle, Clock, RefreshCw, Users } from 'lucide-react'

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

  const portco = await prisma.portco.findUnique({ where: { id: user.portcoId } })
  const allCases = await prisma.case.findMany({
    where: { portcoId: user.portcoId },
    orderBy: { openedAt: 'desc' },
  })

  const openCases = allCases.filter((c) => c.status !== 'RESOLVED')
  const criticalOpen = openCases.filter((c) => c.priority === 'CRITICAL')
  const overdueCases = openCases.filter((c) => c.isOverdue)
  const noRecentUpdate = openCases.filter((c) => {
    if (!c.lastInternalUpdateAt) return true
    const hoursAgo = (Date.now() - c.lastInternalUpdateAt.getTime()) / 3_600_000
    return hoursAgo > 24
  })
  const repeatFollowUps = openCases.filter((c) => c.repeatFollowUpCount > 0)
  const needsAction = openCases.filter(
    (c) =>
      c.escalationLevel >= 1 ||
      c.status === 'AWAITING_FIRST_RESPONSE' ||
      !c.firstResponseAt
  )

  // Group by internal owner
  const ownerMap = new Map<
    string,
    { cases: typeof openCases; critical: number; overdue: number; redFlags: number }
  >()
  for (const c of openCases) {
    const owner = c.assignedInternalOwnerName ?? '(Unassigned)'
    if (!ownerMap.has(owner)) {
      ownerMap.set(owner, { cases: [], critical: 0, overdue: 0, redFlags: 0 })
    }
    const entry = ownerMap.get(owner)!
    entry.cases.push(c)
    if (c.priority === 'CRITICAL') entry.critical++
    if (c.isOverdue) entry.overdue++
    if (c.escalationLevel >= 3) entry.redFlags++
  }
  const ownerRows = Array.from(ownerMap.entries()).sort(
    (a, b) => b[1].redFlags - a[1].redFlags || b[1].overdue - a[1].overdue
  )

  return (
    <Shell user={user} activePath="/team-lead">
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-900">{portco?.name}</h1>
          <p className="text-sm text-slate-500 mt-1">Team Lead Dashboard</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <KpiCard
            label="Open Critical"
            value={criticalOpen.length}
            variant={criticalOpen.length > 0 ? 'danger' : 'default'}
          />
          <KpiCard
            label="Overdue"
            value={overdueCases.length}
            variant={overdueCases.length > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            label="No Recent Update (24h)"
            value={noRecentUpdate.length}
            variant={noRecentUpdate.length > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            label="Repeat Follow-ups"
            value={repeatFollowUps.length}
            variant={repeatFollowUps.length > 2 ? 'danger' : repeatFollowUps.length > 0 ? 'warning' : 'default'}
          />
        </div>

        {/* Needs Action Today */}
        {needsAction.length > 0 && (
          <CaseSection
            title="Needs Action Today"
            icon={AlertTriangle}
            iconClass="text-red-500"
            cases={needsAction}
            showOwner
            emptyLabel=""
          />
        )}

        {/* Overdue */}
        {overdueCases.length > 0 && (
          <CaseSection
            title="Overdue (SLA Breached)"
            icon={Clock}
            iconClass="text-amber-500"
            cases={overdueCases}
            showOwner
            emptyLabel=""
          />
        )}

        {/* Repeat follow-ups */}
        {repeatFollowUps.length > 0 && (
          <CaseSection
            title="Repeated Customer Follow-ups"
            icon={RefreshCw}
            iconClass="text-orange-500"
            cases={repeatFollowUps}
            showOwner
            emptyLabel=""
          />
        )}

        {/* Internal owner breakdown */}
        <div className="mt-6 bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">By Internal Owner</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Owner</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Open Cases</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Critical</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Overdue</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Red Flags</th>
              </tr>
            </thead>
            <tbody>
              {ownerRows.map(([owner, data]) => (
                <tr key={owner} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-slate-800">{owner}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{data.cases.length}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={data.critical > 0 ? 'font-semibold text-red-600' : 'text-slate-500'}>{data.critical}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={data.overdue > 0 ? 'font-semibold text-amber-600' : 'text-slate-500'}>{data.overdue}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={data.redFlags > 0 ? 'font-semibold text-red-600' : 'text-slate-500'}>{data.redFlags}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  )
}

function CaseSection({
  title,
  icon: Icon,
  iconClass,
  cases,
  showOwner,
  emptyLabel,
}: {
  title: string
  icon: React.ElementType
  iconClass: string
  cases: Awaited<ReturnType<typeof prisma.case.findMany>>
  showOwner: boolean
  emptyLabel: string
}) {
  if (cases.length === 0 && emptyLabel) {
    return null
  }

  return (
    <div className="mb-6 bg-white rounded-lg border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <Icon className={`w-4 h-4 ${iconClass}`} />
        <h2 className="text-sm font-semibold text-slate-900">
          {title}{' '}
          <span className="text-slate-400 font-normal">({cases.length})</span>
        </h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Case</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Subject</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Priority</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
            {showOwner && (
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Owner</th>
            )}
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Escalation</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Customer Msg</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.id} className="border-b border-gray-50 last:border-0 table-row-hover">
              <td className="px-6 py-3">
                <Link
                  href={`/cases/${c.id}`}
                  className="font-mono text-xs font-semibold text-slate-700 hover:text-blue-600 transition-colors"
                >
                  {c.caseNumber}
                </Link>
              </td>
              <td className="px-4 py-3 text-xs text-slate-700">{c.customerName}</td>
              <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">{c.subject}</td>
              <td className="px-4 py-3">
                <PriorityBadge priority={c.priority} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={c.status} />
              </td>
              {showOwner && (
                <td className="px-4 py-3 text-xs text-slate-600">
                  {c.assignedInternalOwnerName ?? '—'}
                </td>
              )}
              <td className="px-4 py-3">
                <EscalationBadge level={c.escalationLevel} />
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {formatDateTime(c.lastCustomerMessageAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
