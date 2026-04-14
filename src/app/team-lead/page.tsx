import Link from 'next/link'
import { requireTeamLead } from '@/lib/permissions'
import { maybeRunScheduler } from '@/lib/scheduler'
import { prisma } from '@/lib/prisma'
import { Shell } from '@/components/layout/shell'
import { KpiCard } from '@/components/kpi-card'
import { PriorityBadge } from '@/components/badges/priority-badge'
import { StatusBadge } from '@/components/badges/status-badge'
import { formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  Clock,
  RefreshCw,
  Users,
  CheckSquare,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function waitingLabel(ms: number): string {
  const h = ms / 3_600_000
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 24) return `${Math.round(h)}h`
  const d = Math.floor(h / 24)
  const rem = Math.round(h % 24)
  return rem > 0 ? `${d}d ${rem}h` : `${d}d`
}

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

  const allCases = await prisma.case.findMany({
    where: { portcoId: user.portcoId },
    orderBy: [{ openedAt: 'desc' }],
    take: 100,
  })

  // ── Overdue: No reply sent yet, past first-response SLA ──────────────────
  // This is the most critical queue: customer is waiting, no one has replied.
  const noReplySent = openCases.filter((c) => !c.firstResponseAt)
  const noReplyOverdue = noReplySent.filter((c) => {
    const waitingHours =
      (now.getTime() - c.lastCustomerMessageAt.getTime()) / 3_600_000
    return waitingHours > c.slaFirstResponseHours
  })
  // Not yet overdue but clock is running
  const noReplyPending = noReplySent.filter(
    (c) => !noReplyOverdue.includes(c)
  )

  // ── Overdue: Problem unresolved past resolution deadline ─────────────────
  // A reply was sent, but the issue hasn't been fixed within the SLA window.
  const resolutionOverdue = openCases.filter((c) => {
    if (!c.firstResponseAt) return false // Covered above
    const hoursOpen = (now.getTime() - c.openedAt.getTime()) / 3_600_000
    return hoursOpen > c.slaResolutionHours
  })

  // ── Worth watching ───────────────────────────────────────────────────────
  // Customer has followed up 2+ times without a final resolution
  const repeatFollowUps = openCases.filter(
    (c) => c.repeatFollowUpCount >= 2
  )
  // No internal update in 48h (team has gone quiet on an active case)
  const teamQuiet = openCases.filter((c) => {
    if (!c.firstResponseAt) return false // Already in no-reply queue
    const lastTouch = c.lastInternalUpdateAt ?? c.openedAt
    return (
      (now.getTime() - lastTouch.getTime()) / 3_600_000 > 48
    )
  })

  // ── Internal owner breakdown ─────────────────────────────────────────────
  const ownerMap = new Map<
    string,
    { total: number; noReply: number; quiet: number; overdue: number }
  >()
  for (const c of openCases) {
    const key = c.assignedInternalOwnerName ?? '(Unassigned)'
    if (!ownerMap.has(key)) {
      ownerMap.set(key, { total: 0, noReply: 0, quiet: 0, overdue: 0 })
    }
    const e = ownerMap.get(key)!
    e.total++
    if (!c.firstResponseAt) e.noReply++
    const lastTouch = c.lastInternalUpdateAt ?? c.openedAt
    if ((now.getTime() - lastTouch.getTime()) / 3_600_000 > 48) e.quiet++
    if (c.isOverdue) e.overdue++
  }
  const ownerRows = Array.from(ownerMap.entries()).sort(
    (a, b) => b[1].noReply - a[1].noReply || b[1].quiet - a[1].quiet
  )

  const totalOverdue = noReplyOverdue.length + resolutionOverdue.length

  return (
    <Shell user={user} activePath="/team-lead">
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-900">{portco?.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Service queue — {openCases.length} open case
            {openCases.length !== 1 ? 's' : ''}
            {totalOverdue > 0 && (
              <span className="ml-2 text-red-600 font-semibold">
                · {totalOverdue} overdue
              </span>
            )}
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <KpiCard
            label="No Reply Sent"
            value={noReplySent.length}
            sub={
              noReplyOverdue.length > 0
                ? `${noReplyOverdue.length} past deadline`
                : 'within SLA'
            }
            variant={
              noReplyOverdue.length > 0
                ? 'danger'
                : noReplySent.length > 0
                ? 'warning'
                : 'default'
            }
          />
          <KpiCard
            label="Unresolved Past Deadline"
            value={resolutionOverdue.length}
            sub="reply sent but issue still open"
            variant={resolutionOverdue.length > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            label="Customer Followed Up ×2+"
            value={repeatFollowUps.length}
            sub="chasing without resolution"
            variant={repeatFollowUps.length > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            label="Total Open"
            value={openCases.length}
            sub={`${allCases.filter((c) => c.status === 'RESOLVED').length} closed overall`}
            variant="default"
          />
        </div>

        {/* ──────────────────────────────────────────────────────────────────
            SECTION 1: Overdue — needs action now
        ────────────────────────────────────────────────────────────────── */}
        {(noReplyOverdue.length > 0 || resolutionOverdue.length > 0) && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <h2 className="text-sm font-bold text-red-700 uppercase tracking-wide">
                Overdue — Action Required
              </h2>
            </div>

            {/* No reply sent past SLA */}
            {noReplyOverdue.length > 0 && (
              <div className="mb-4 rounded-lg border-2 border-red-200 overflow-hidden">
                <div className="px-5 py-3 bg-red-50 border-b border-red-100">
                  <p className="text-sm font-semibold text-red-800">
                    No reply sent — first response deadline passed
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">
                    These customers have received no response from your team.
                    The longer you wait, the worse the relationship damage.
                    Reply today.
                  </p>
                </div>
                <CaseTable
                  cases={noReplyOverdue}
                  now={now}
                  columns={['case', 'customer', 'subject', 'priority', 'waiting', 'owner']}
                  waitingFrom="lastCustomerMessage"
                  highlightWaiting
                />
              </div>
            )}

            {/* Resolution overdue */}
            {resolutionOverdue.length > 0 && (
              <div className="rounded-lg border-2 border-orange-200 overflow-hidden">
                <div className="px-5 py-3 bg-orange-50 border-b border-orange-100">
                  <p className="text-sm font-semibold text-orange-800">
                    Unresolved past deadline — resolution SLA exceeded
                  </p>
                  <p className="text-xs text-orange-700 mt-0.5">
                    A reply was sent, but these cases are still open past their
                    resolution deadline. The customer is still waiting for the
                    problem to be fixed.
                  </p>
                </div>
                <CaseTable
                  cases={resolutionOverdue}
                  now={now}
                  columns={['case', 'customer', 'subject', 'priority', 'openSince', 'owner']}
                />
              </div>
            )}
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────────────
            SECTION 2: Awaiting first reply (within SLA — clock running)
        ────────────────────────────────────────────────────────────────── */}
        {noReplyPending.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold text-amber-700 uppercase tracking-wide">
                Awaiting First Reply — SLA Clock Running
              </h2>
            </div>
            <div className="rounded-lg border border-amber-200 overflow-hidden">
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
                <p className="text-xs text-amber-700">
                  No reply sent yet, still within SLA. Reply before the deadline
                  below.
                </p>
              </div>
              <CaseTable
                cases={noReplyPending}
                now={now}
                columns={['case', 'customer', 'subject', 'priority', 'slaDeadline', 'owner']}
              />
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────────────
            SECTION 3: Worth watching
        ────────────────────────────────────────────────────────────────── */}
        {(repeatFollowUps.length > 0 || teamQuiet.length > 0) && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wide">
                Worth Watching
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {repeatFollowUps.length > 0 && (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                    <p className="text-sm font-semibold text-slate-700">
                      Customer chased ×2 or more
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Customer sent multiple follow-ups without a final
                      resolution.
                    </p>
                  </div>
                  <CaseTable
                    cases={repeatFollowUps}
                    now={now}
                    columns={['case', 'customer', 'priority', 'followUps', 'owner']}
                    compact
                  />
                </div>
              )}
              {teamQuiet.length > 0 && (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                    <p className="text-sm font-semibold text-slate-700">
                      No internal update in 48+ hours
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Your team replied but hasn't touched these since.
                    </p>
                  </div>
                  <CaseTable
                    cases={teamQuiet}
                    now={now}
                    columns={['case', 'customer', 'priority', 'lastUpdate', 'owner']}
                    compact
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────────────
            SECTION 4: All open cases
        ────────────────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
              All Open Cases
            </h2>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {openCases.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-slate-400">
                No open cases. All clear.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Case</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Subject</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Priority</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Opened</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Customer Message</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {openCases.map((c) => {
                    const isNoReply = !c.firstResponseAt
                    const isOverdue = c.isOverdue
                    return (
                      <tr
                        key={c.id}
                        className={cn(
                          'border-b border-gray-50 last:border-0 hover:bg-gray-50',
                          isNoReply && isOverdue
                            ? 'bg-red-50/20'
                            : isOverdue
                            ? 'bg-amber-50/20'
                            : ''
                        )}
                      >
                        <td className="px-5 py-3">
                          <Link
                            href={`/cases/${c.id}`}
                            className="font-mono text-xs font-semibold text-slate-700 hover:text-blue-600"
                          >
                            {c.caseNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">{c.customerName}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 max-w-[180px] truncate">{c.subject}</td>
                        <td className="px-4 py-3"><PriorityBadge priority={c.priority} /></td>
                        <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(c.openedAt)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(c.lastCustomerMessageAt)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{c.assignedInternalOwnerName ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────────
            SECTION 5: By team member
        ────────────────────────────────────────────────────────────────── */}
        {ownerRows.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                By Team Member
              </h2>
            </div>
            <div className="bg-white rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Team Member</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Open</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">No Reply Sent</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Quiet {'>'}48h</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {ownerRows.map(([name, data]) => (
                    <tr key={name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-slate-800">{name}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{data.total}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={data.noReply > 0 ? 'font-bold text-red-600' : 'text-slate-400'}>{data.noReply}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={data.quiet > 0 ? 'font-semibold text-amber-600' : 'text-slate-400'}>{data.quiet}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={data.overdue > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}>{data.overdue}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}

// ── Reusable case table ────────────────────────────────────────────────────

type Column =
  | 'case'
  | 'customer'
  | 'subject'
  | 'priority'
  | 'waiting'
  | 'openSince'
  | 'slaDeadline'
  | 'followUps'
  | 'lastUpdate'
  | 'owner'
  | 'status'

function CaseTable({
  cases,
  now,
  columns,
  waitingFrom,
  highlightWaiting,
  compact,
}: {
  cases: Awaited<ReturnType<typeof prisma.case.findMany>>
  now: Date
  columns: Column[]
  waitingFrom?: 'lastCustomerMessage' | 'openedAt'
  highlightWaiting?: boolean
  compact?: boolean
}) {
  const cellPad = compact ? 'px-4 py-2' : 'px-4 py-3'

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50/30">
          {columns.includes('case') && (
            <th className={`${cellPad} text-left text-xs font-semibold text-gray-400 uppercase tracking-wider`}>Case</th>
          )}
          {columns.includes('customer') && (
            <th className={`${cellPad} text-left text-xs font-semibold text-gray-400 uppercase tracking-wider`}>Customer</th>
          )}
          {columns.includes('subject') && (
            <th className={`${cellPad} text-left text-xs font-semibold text-gray-400 uppercase tracking-wider`}>Subject</th>
          )}
          {columns.includes('priority') && (
            <th className={`${cellPad} text-left text-xs font-semibold text-gray-400 uppercase tracking-wider`}>Priority</th>
          )}
          {columns.includes('waiting') && (
            <th className={`${cellPad} text-left text-xs font-semibold text-gray-400 uppercase tracking-wider`}>Waiting</th>
          )}
          {columns.includes('openSince') && (
            <th className={`${cellPad} text-left text-xs font-semibold text-gray-400 uppercase tracking-wider`}>Open for</th>
          )}
          {columns.includes('slaDeadline') && (
            <th className={`${cellPad} text-left text-xs font-semibold text-gray-400 uppercase tracking-wider`}>SLA Deadline</th>
          )}
          {columns.includes('followUps') && (
            <th className={`${cellPad} text-right text-xs font-semibold text-gray-400 uppercase tracking-wider`}>Follow-ups</th>
          )}
          {columns.includes('lastUpdate') && (
            <th className={`${cellPad} text-left text-xs font-semibold text-gray-400 uppercase tracking-wider`}>Last Update</th>
          )}
          {columns.includes('status') && (
            <th className={`${cellPad} text-left text-xs font-semibold text-gray-400 uppercase tracking-wider`}>Status</th>
          )}
          {columns.includes('owner') && (
            <th className={`${cellPad} text-left text-xs font-semibold text-gray-400 uppercase tracking-wider`}>Owner</th>
          )}
        </tr>
      </thead>
      <tbody>
        {cases.map((c) => {
          const waitingMs =
            waitingFrom === 'openedAt'
              ? now.getTime() - c.openedAt.getTime()
              : now.getTime() - c.lastCustomerMessageAt.getTime()
          const openMs = now.getTime() - c.openedAt.getTime()
          const slaRemainMs =
            c.slaFirstResponseHours * 3_600_000 -
            (now.getTime() - c.openedAt.getTime())
          const overdueSla = slaRemainMs < 0

          return (
            <tr
              key={c.id}
              className="border-b border-gray-50 last:border-0 hover:bg-gray-50"
            >
              {columns.includes('case') && (
                <td className={cellPad}>
                  <Link
                    href={`/cases/${c.id}`}
                    className="font-mono text-xs font-semibold text-slate-700 hover:text-blue-600"
                  >
                    {c.caseNumber}
                  </Link>
                </td>
              )}
              {columns.includes('customer') && (
                <td className={`${cellPad} text-xs text-slate-700`}>{c.customerName}</td>
              )}
              {columns.includes('subject') && (
                <td className={`${cellPad} text-xs text-slate-600 max-w-[160px] truncate`}>{c.subject}</td>
              )}
              {columns.includes('priority') && (
                <td className={cellPad}><PriorityBadge priority={c.priority} /></td>
              )}
              {columns.includes('waiting') && (
                <td className={cellPad}>
                  <span
                    className={cn(
                      'text-xs font-bold',
                      highlightWaiting ? 'text-red-700' : 'text-amber-700'
                    )}
                  >
                    {waitingLabel(waitingMs)}
                  </span>
                </td>
              )}
              {columns.includes('openSince') && (
                <td className={cellPad}>
                  <span className="text-xs font-semibold text-orange-700">
                    {waitingLabel(openMs)}
                  </span>
                </td>
              )}
              {columns.includes('slaDeadline') && (
                <td className={cellPad}>
                  <span
                    className={cn(
                      'text-xs font-semibold',
                      overdueSla ? 'text-red-600' : 'text-green-700'
                    )}
                  >
                    {overdueSla
                      ? `Overdue by ${waitingLabel(Math.abs(slaRemainMs))}`
                      : `${waitingLabel(slaRemainMs)} left`}
                  </span>
                </td>
              )}
              {columns.includes('followUps') && (
                <td className={`${cellPad} text-right`}>
                  <span className="text-xs font-bold text-orange-700">
                    ×{c.repeatFollowUpCount}
                  </span>
                </td>
              )}
              {columns.includes('lastUpdate') && (
                <td className={cellPad}>
                  <span className="text-xs text-amber-700 font-medium">
                    {c.lastInternalUpdateAt
                      ? waitingLabel(now.getTime() - c.lastInternalUpdateAt.getTime()) + ' ago'
                      : waitingLabel(now.getTime() - c.openedAt.getTime()) + ' ago (opened)'}
                  </span>
                </td>
              )}
              {columns.includes('status') && (
                <td className={cellPad}><StatusBadge status={c.status} /></td>
              )}
              {columns.includes('owner') && (
                <td className={`${cellPad} text-xs text-slate-500`}>
                  {c.assignedInternalOwnerName ?? '—'}
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
