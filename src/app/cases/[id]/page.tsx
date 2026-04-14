import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAuth } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { Shell } from '@/components/layout/shell'
import { PriorityBadge } from '@/components/badges/priority-badge'
import { StatusBadge } from '@/components/badges/status-badge'
import { formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ArrowLeft, Mail, MailOpen, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

function hoursLabel(ms: number): string {
  const h = ms / 3_600_000
  if (h < 1) return `${Math.round(h * 60)} minutes`
  if (h < 24) return `${h.toFixed(1)} hours`
  return `${(h / 24).toFixed(1)} days`
}

export default async function CaseDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const user = await requireAuth()
  const caseId = parseInt(params.id)
  if (isNaN(caseId)) notFound()

  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      portco: true,
      messages: { orderBy: { sentAt: 'asc' } },
    },
  })
  if (!c) notFound()

  if (user.role === 'TEAM_LEAD' && c.portcoId !== user.portcoId) {
    redirect('/team-lead')
  }

  const isHQ = user.role === 'HQ'
  const backHref = isHQ ? '/cases' : '/team-lead'

  const now = new Date()
  const hoursOpen = (now.getTime() - c.openedAt.getTime()) / 3_600_000
  const isOpenCase = c.status !== 'RESOLVED'

  // First response status
  const hasFirstResponse = !!c.firstResponseAt
  const firstResponseHours = c.firstResponseAt
    ? (c.firstResponseAt.getTime() - c.openedAt.getTime()) / 3_600_000
    : null
  const firstResponseOverdue =
    !hasFirstResponse &&
    (now.getTime() - c.lastCustomerMessageAt.getTime()) / 3_600_000 >
      c.slaFirstResponseHours

  // Resolution status
  const resolutionOverdue = isOpenCase && hoursOpen > c.slaResolutionHours
  const resolutionOverdueBy = resolutionOverdue
    ? hoursOpen - c.slaResolutionHours
    : null

  // Overdue banner logic
  const showOverdueBanner =
    isOpenCase && (firstResponseOverdue || resolutionOverdue)

  return (
    <Shell user={user} activePath="/cases">
      <div className="p-8 max-w-5xl">
        {/* Back */}
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Link>

        {/* Overdue banner — appears above everything else when case is overdue */}
        {showOverdueBanner && (
          <div className="mb-6 bg-red-50 border border-red-300 rounded-lg px-5 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-800 mb-1">
                  This case is overdue
                </p>
                <div className="space-y-1">
                  {firstResponseOverdue && (
                    <p className="text-sm text-red-700">
                      No reply has been sent yet. Customer has been waiting for{' '}
                      <strong>
                        {hoursLabel(
                          now.getTime() - c.lastCustomerMessageAt.getTime()
                        )}
                      </strong>
                      . First response SLA was {c.slaFirstResponseHours}h.
                    </p>
                  )}
                  {resolutionOverdue && hasFirstResponse && (
                    <p className="text-sm text-red-700">
                      Case has been open for{' '}
                      <strong>{hoursLabel(hoursOpen)}</strong> — overdue by{' '}
                      <strong>{hoursLabel(resolutionOverdueBy! * 3_600_000)}</strong>.
                      Resolution SLA was {c.slaResolutionHours}h.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Case header */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-mono text-sm font-bold text-slate-400">
                  {c.caseNumber}
                </span>
                <PriorityBadge priority={c.priority} />
                <StatusBadge status={c.status} />
                {c.isOverdue && isOpenCase && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                    Overdue
                  </span>
                )}
                {c.repeatFollowUpCount >= 2 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
                    Followed up ×{c.repeatFollowUpCount}
                  </span>
                )}
              </div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                {c.subject}
              </h1>
              <p className="text-sm text-slate-500 mt-1">{c.portco.name}</p>
            </div>
          </div>
        </div>

        {/* Summary */}
        {c.aiSummary && (
          <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Summary
            </p>
            <p className="text-sm text-slate-700">{c.aiSummary}</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Case details */}
          <div className="col-span-2 bg-white rounded-lg border border-gray-200 px-5 py-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Case Details
            </h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <MetaRow label="Customer" value={c.customerName} />
              <MetaRow label="Email" value={c.customerEmail} />
              <MetaRow label="Category" value={c.category} />
              <MetaRow label="Opened" value={formatDateTime(c.openedAt)} />
              <MetaRow
                label="First Reply Sent"
                value={
                  c.firstResponseAt ? (
                    <span className="text-emerald-700 font-medium">
                      {hoursLabel(
                        c.firstResponseAt.getTime() - c.openedAt.getTime()
                      )}{' '}
                      after opening
                    </span>
                  ) : (
                    <span className="text-red-600 font-semibold">
                      Not yet — customer waiting{' '}
                      {hoursLabel(
                        now.getTime() - c.openedAt.getTime()
                      )}
                    </span>
                  )
                }
              />
              <MetaRow
                label="Last Customer Message"
                value={formatDateTime(c.lastCustomerMessageAt)}
              />
              <MetaRow
                label="Last Internal Update"
                value={
                  c.lastInternalUpdateAt ? (
                    formatDateTime(c.lastInternalUpdateAt)
                  ) : (
                    <span className="text-red-400">None yet</span>
                  )
                }
              />
              {c.repeatFollowUpCount > 0 && (
                <MetaRow
                  label="Customer Follow-ups"
                  value={
                    <span
                      className={cn(
                        'font-semibold',
                        c.repeatFollowUpCount >= 3
                          ? 'text-red-600'
                          : 'text-orange-600'
                      )}
                    >
                      {c.repeatFollowUpCount}× — customer has chased this
                      request multiple times
                    </span>
                  }
                />
              )}
              {/* Internal owner — shown to team leads only */}
              {!isHQ && (
                <MetaRow
                  label="Assigned To"
                  value={c.assignedInternalOwnerName ?? 'Unassigned'}
                />
              )}
              {c.resolvedAt && (
                <MetaRow
                  label="Closed"
                  value={formatDateTime(c.resolvedAt)}
                />
              )}
            </div>
          </div>

          {/* Response & resolution status */}
          <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Response Status
            </h2>
            <div className="space-y-4">
              {/* First response */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-medium text-slate-600">
                    First reply
                  </span>
                  <span
                    className={cn(
                      'text-xs font-semibold',
                      hasFirstResponse
                        ? 'text-emerald-600'
                        : firstResponseOverdue
                        ? 'text-red-600'
                        : 'text-amber-600'
                    )}
                  >
                    {hasFirstResponse
                      ? `✓ Sent (${hoursLabel(firstResponseHours! * 3_600_000)})`
                      : firstResponseOverdue
                      ? 'Overdue'
                      : 'Pending'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mb-1.5">
                  SLA: {c.slaFirstResponseHours}h
                </div>
                <SlaBar
                  pct={
                    hasFirstResponse
                      ? 100
                      : Math.min(
                          100,
                          ((now.getTime() - c.openedAt.getTime()) /
                            3_600_000 /
                            c.slaFirstResponseHours) *
                            100
                        )
                  }
                  done={hasFirstResponse}
                  overdue={firstResponseOverdue}
                />
              </div>

              {/* Resolution */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-medium text-slate-600">
                    Resolution
                  </span>
                  <span
                    className={cn(
                      'text-xs font-semibold',
                      !isOpenCase
                        ? 'text-emerald-600'
                        : resolutionOverdue
                        ? 'text-red-600'
                        : 'text-slate-500'
                    )}
                  >
                    {!isOpenCase
                      ? '✓ Closed'
                      : resolutionOverdue
                      ? `Overdue by ${hoursLabel(resolutionOverdueBy! * 3_600_000)}`
                      : `${hoursLabel(
                          (c.slaResolutionHours * 3_600_000) -
                            (now.getTime() - c.openedAt.getTime())
                        )} left`}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mb-1.5">
                  SLA: {c.slaResolutionHours}h ·{' '}
                  {(c.slaResolutionHours / 24).toFixed(0)} days
                </div>
                <SlaBar
                  pct={Math.min(
                    100,
                    (hoursOpen / c.slaResolutionHours) * 100
                  )}
                  done={!isOpenCase}
                  overdue={resolutionOverdue}
                />
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 space-y-1 text-xs text-slate-500">
              <p>
                Priority:{' '}
                <span className="font-medium text-slate-700">{c.priority}</span>
              </p>
              <p>
                Open for:{' '}
                <span
                  className={cn(
                    'font-medium',
                    resolutionOverdue ? 'text-red-600' : 'text-slate-700'
                  )}
                >
                  {hoursLabel(hoursOpen)}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Message timeline */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Conversation ({c.messages.length} messages)
            </h2>
            {!hasFirstResponse && isOpenCase && (
              <span className="text-xs text-red-600 font-medium">
                ← No outbound message sent yet
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {c.messages.map((msg, idx) => {
              const isInbound = msg.direction === 'INBOUND'
              const isFirstOutbound =
                !isInbound &&
                c.messages.slice(0, idx).every((m) => m.direction === 'INBOUND')
              return (
                <div
                  key={msg.id}
                  className={cn(
                    'px-6 py-4',
                    isInbound ? 'bg-white' : 'bg-blue-50/30'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {isInbound ? (
                        <MailOpen className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <Mail className="w-3.5 h-3.5 text-blue-500" />
                      )}
                      <span
                        className={cn(
                          'text-xs font-semibold uppercase tracking-wide',
                          isInbound ? 'text-slate-500' : 'text-blue-600'
                        )}
                      >
                        {isInbound ? 'From Customer' : 'From Team'}
                      </span>
                      {isFirstOutbound && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
                          First reply
                        </span>
                      )}
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-500">
                        {msg.from}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-300" />
                      <span className="text-xs text-slate-400">
                        {formatDateTime(msg.sentAt)}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs font-medium text-slate-700 mb-1">
                    {msg.subject}
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {msg.bodyText}
                  </p>
                </div>
              )
            })}
            {c.messages.length === 0 && (
              <div className="px-6 py-8 text-center text-sm text-slate-400">
                No messages yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  )
}

function MetaRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <div className="text-sm text-slate-800">{value}</div>
    </div>
  )
}

function SlaBar({
  pct,
  done,
  overdue,
}: {
  pct: number
  done: boolean
  overdue: boolean
}) {
  const color = done
    ? 'bg-emerald-400'
    : overdue
    ? 'bg-red-500'
    : pct >= 80
    ? 'bg-orange-400'
    : 'bg-blue-400'

  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full', color)}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  )
}
