import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAuth } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { Shell } from '@/components/layout/shell'
import { PriorityBadge } from '@/components/badges/priority-badge'
import { StatusBadge } from '@/components/badges/status-badge'
import { EscalationBadge } from '@/components/badges/escalation-badge'
import { formatDateTime, formatHours } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ArrowLeft, Mail, MailOpen, Clock, AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'

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

  // Permission: team leads can only view their portco's cases
  if (user.role === 'TEAM_LEAD' && c.portcoId !== user.portcoId) {
    redirect('/team-lead')
  }

  const isHQ = user.role === 'HQ'
  const backHref = isHQ ? '/cases' : '/team-lead'

  const hoursOpen = (Date.now() - c.openedAt.getTime()) / 3_600_000
  const slaResolutionPct = Math.min(
    100,
    (hoursOpen / c.slaResolutionHours) * 100
  )
  const slaFirstResponsePct = c.firstResponseAt
    ? 100
    : Math.min(
        100,
        ((Date.now() - c.lastCustomerMessageAt.getTime()) /
          3_600_000 /
          c.slaFirstResponseHours) *
          100
      )

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

        {/* Case header */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-mono text-sm font-bold text-slate-500">
                  {c.caseNumber}
                </span>
                <PriorityBadge priority={c.priority} />
                <StatusBadge status={c.status} />
                {c.escalationLevel > 0 && (
                  <EscalationBadge level={c.escalationLevel} />
                )}
                {c.isOverdue && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                    <AlertTriangle className="w-3 h-3" /> Overdue
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

        {/* AI Summary */}
        {c.aiSummary && (
          <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Summary
            </p>
            <p className="text-sm text-slate-700">{c.aiSummary}</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Metadata */}
          <div className="col-span-2 bg-white rounded-lg border border-gray-200 px-5 py-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Case Details
            </h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <MetaRow label="Customer" value={c.customerName} />
              <MetaRow label="Email" value={c.customerEmail} />
              <MetaRow label="Category" value={c.category} />
              <MetaRow
                label="Opened"
                value={formatDateTime(c.openedAt)}
              />
              <MetaRow
                label="First Response"
                value={
                  c.firstResponseAt
                    ? formatDateTime(c.firstResponseAt)
                    : <span className="text-red-500 font-medium">None yet</span>
                }
              />
              <MetaRow
                label="Last Customer Message"
                value={formatDateTime(c.lastCustomerMessageAt)}
              />
              <MetaRow
                label="Last Internal Update"
                value={
                  c.lastInternalUpdateAt
                    ? formatDateTime(c.lastInternalUpdateAt)
                    : <span className="text-red-400">None</span>
                }
              />
              <MetaRow
                label="Repeat Follow-ups"
                value={
                  <span
                    className={cn(
                      c.repeatFollowUpCount >= 2 ? 'text-orange-600 font-semibold' : ''
                    )}
                  >
                    {c.repeatFollowUpCount}
                  </span>
                }
              />
              {/* Internal owner — shown to team leads, hidden from HQ */}
              {!isHQ && (
                <MetaRow
                  label="Internal Owner"
                  value={c.assignedInternalOwnerName ?? '—'}
                />
              )}
              {c.resolvedAt && (
                <MetaRow
                  label="Resolved"
                  value={formatDateTime(c.resolvedAt)}
                />
              )}
            </div>
          </div>

          {/* SLA panel */}
          <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              SLA Status
            </h2>
            <div className="space-y-4">
              <SlaBar
                label={`First Response (${c.slaFirstResponseHours}h SLA)`}
                pct={slaFirstResponsePct}
                done={c.firstResponseAt != null}
                value={
                  c.firstResponseAt
                    ? formatHours(
                        (c.firstResponseAt.getTime() - c.openedAt.getTime()) /
                          3_600_000
                      )
                    : `${formatHours((Date.now() - c.lastCustomerMessageAt.getTime()) / 3_600_000)} elapsed`
                }
              />
              <SlaBar
                label={`Resolution (${c.slaResolutionHours}h SLA)`}
                pct={slaResolutionPct}
                done={c.status === 'RESOLVED'}
                value={formatHours(hoursOpen) + ' open'}
              />
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-slate-500">
              <p>Priority: <span className="font-medium text-slate-700">{c.priority}</span></p>
              <p className="mt-1">Escalation level: <span className={cn('font-medium', c.escalationLevel >= 3 ? 'text-red-600' : c.escalationLevel >= 2 ? 'text-orange-600' : 'text-slate-700')}>{c.escalationLevel}</span></p>
            </div>
          </div>
        </div>

        {/* Message timeline */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-slate-900">
              Message Timeline ({c.messages.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {c.messages.map((msg) => {
              const isInbound = msg.direction === 'INBOUND'
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
                        <Mail className="w-3.5 h-3.5 text-blue-400" />
                      )}
                      <span
                        className={cn(
                          'text-xs font-semibold uppercase tracking-wide',
                          isInbound ? 'text-slate-500' : 'text-blue-600'
                        )}
                      >
                        {isInbound ? 'Inbound' : 'Outbound'}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-500 font-medium">
                        {msg.from}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
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
      <p className="text-sm text-slate-800">{value}</p>
    </div>
  )
}

function SlaBar({
  label,
  pct,
  done,
  value,
}: {
  label: string
  pct: number
  done: boolean
  value: string
}) {
  const color = done
    ? 'bg-emerald-400'
    : pct >= 100
    ? 'bg-red-500'
    : pct >= 80
    ? 'bg-orange-400'
    : 'bg-blue-400'

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500 font-medium">{label}</span>
        <span
          className={cn(
            'font-medium',
            done ? 'text-emerald-600' : pct >= 100 ? 'text-red-600' : 'text-slate-600'
          )}
        >
          {done ? '✓ Done' : value}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}
