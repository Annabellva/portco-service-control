import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAuth } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { Shell } from '@/components/layout/shell'
import { PriorityBadge } from '@/components/badges/priority-badge'
import { StatusBadge } from '@/components/badges/status-badge'
import { formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ArrowLeft, Mail, MailOpen, Clock, AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'

function zeitAnzeige(ms: number): string {
  const h = ms / 3_600_000
  if (h < 1) return `${Math.round(h * 60)} Minuten`
  if (h < 24) return `${h.toFixed(1)} Stunden`
  return `${(h / 24).toFixed(1)} Tage`
}

export default async function AnfrageDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const user = await requireAuth()
  const caseId = parseInt(params.id)
  if (isNaN(caseId)) notFound()

  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: { portco: true, messages: { orderBy: { sentAt: 'asc' } } },
  })
  if (!c) notFound()

  if (user.role === 'TEAM_LEAD' && c.portcoId !== user.portcoId) redirect('/team-lead')

  const isHQ = user.role === 'HQ'
  const backHref = isHQ ? '/cases' : '/team-lead'

  const now = new Date()
  const stundenOffen = (now.getTime() - c.openedAt.getTime()) / 3_600_000
  const istOffen = c.status !== 'RESOLVED'

  const hatErstantwort = !!c.firstResponseAt
  const erstantwortStunden = c.firstResponseAt
    ? (c.firstResponseAt.getTime() - c.openedAt.getTime()) / 3_600_000
    : null

  const erstantwortUeberfaellig =
    !hatErstantwort &&
    (now.getTime() - c.lastCustomerMessageAt.getTime()) / 3_600_000 > c.slaFirstResponseHours

  const loesungUeberfaellig = istOffen && stundenOffen > c.slaResolutionHours
  const loesungUeberfaelligUm = loesungUeberfaellig
    ? stundenOffen - c.slaResolutionHours
    : null

  const zeigeUeberfaelligBanner = istOffen && (erstantwortUeberfaellig || loesungUeberfaellig)

  return (
    <Shell user={user} activePath="/cases">
      <div className="p-8 max-w-5xl">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Zurück
        </Link>

        {/* Überfällig-Banner */}
        {zeigeUeberfaelligBanner && (
          <div className="mb-6 bg-red-50 border border-red-300 rounded-lg px-5 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-800 mb-1">Diese Anfrage ist überfällig</p>
                {erstantwortUeberfaellig && (
                  <p className="text-sm text-red-700">
                    Es wurde noch keine Antwort gesendet. Der Kunde wartet seit{' '}
                    <strong>
                      {zeitAnzeige(now.getTime() - c.lastCustomerMessageAt.getTime())}
                    </strong>
                    . SLA für Erstantwort: {c.slaFirstResponseHours}h.
                  </p>
                )}
                {loesungUeberfaellig && hatErstantwort && (
                  <p className="text-sm text-red-700">
                    Anfrage offen seit{' '}
                    <strong>{zeitAnzeige(stundenOffen)}</strong> — überfällig um{' '}
                    <strong>{zeitAnzeige(loesungUeberfaelligUm! * 3_600_000)}</strong>.
                    Lösungs-SLA: {c.slaResolutionHours}h.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Anfrage-Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-sm font-bold text-slate-400">{c.caseNumber}</span>
            <PriorityBadge priority={c.priority} />
            <StatusBadge status={c.status} />
            {c.isOverdue && istOffen && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                Überfällig
              </span>
            )}
            {c.repeatFollowUpCount >= 2 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
                ×{c.repeatFollowUpCount} Nachgefragt
              </span>
            )}
          </div>
          <h1 className="text-lg font-bold text-slate-900 leading-tight">{c.subject}</h1>
          <p className="text-sm text-slate-500 mt-1">{c.portco.name}</p>
        </div>

        {/* Zusammenfassung */}
        {c.aiSummary && (
          <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Zusammenfassung</p>
            <p className="text-sm text-slate-700">{c.aiSummary}</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Details */}
          <div className="col-span-2 bg-white rounded-lg border border-gray-200 px-5 py-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Anfragedetails</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <MetaZeile label="Kunde" value={c.customerName} />
              <MetaZeile label="E-Mail" value={c.customerEmail} />
              <MetaZeile label="Kategorie" value={c.category} />
              <MetaZeile label="Eröffnet" value={formatDateTime(c.openedAt)} />
              <MetaZeile
                label="Erstantwort gesendet"
                value={
                  c.firstResponseAt ? (
                    <span className="text-emerald-700 font-medium">
                      {zeitAnzeige((c.firstResponseAt.getTime() - c.openedAt.getTime()))} nach Eröffnung
                    </span>
                  ) : (
                    <span className="text-red-600 font-semibold">
                      Noch nicht — Kunde wartet {zeitAnzeige(now.getTime() - c.openedAt.getTime())}
                    </span>
                  )
                }
              />
              <MetaZeile label="Letzte Kunden-Nachricht" value={formatDateTime(c.lastCustomerMessageAt)} />
              <MetaZeile
                label="Letztes internes Update"
                value={
                  c.lastInternalUpdateAt
                    ? formatDateTime(c.lastInternalUpdateAt)
                    : <span className="text-red-400">Kein Update</span>
                }
              />
              {c.repeatFollowUpCount > 0 && (
                <MetaZeile
                  label="Kunden-Nachfragen"
                  value={
                    <span className={cn('font-semibold', c.repeatFollowUpCount >= 3 ? 'text-red-600' : 'text-orange-600')}>
                      {c.repeatFollowUpCount}× — Kunde hat mehrfach nachgefragt
                    </span>
                  }
                />
              )}
              {!isHQ && (
                <MetaZeile
                  label="Zuständig"
                  value={c.assignedInternalOwnerName ?? 'Nicht zugewiesen'}
                />
              )}
              {c.resolvedAt && (
                <MetaZeile label="Abgeschlossen" value={formatDateTime(c.resolvedAt)} />
              )}
            </div>
          </div>

          {/* Antwortstatus */}
          <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Antwortstatus</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-medium text-slate-600">Erstantwort</span>
                  <span className={cn('text-xs font-semibold',
                    hatErstantwort ? 'text-emerald-600' :
                    erstantwortUeberfaellig ? 'text-red-600' : 'text-amber-600'
                  )}>
                    {hatErstantwort
                      ? `✓ Gesendet (${zeitAnzeige(erstantwortStunden! * 3_600_000)})`
                      : erstantwortUeberfaellig ? 'Überfällig' : 'Ausstehend'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mb-1.5">SLA: {c.slaFirstResponseHours}h</div>
                <SlaBalken
                  pct={hatErstantwort ? 100 : Math.min(100,
                    (now.getTime() - c.openedAt.getTime()) / 3_600_000 / c.slaFirstResponseHours * 100
                  )}
                  fertig={hatErstantwort}
                  ueberfaellig={erstantwortUeberfaellig}
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-medium text-slate-600">Lösung</span>
                  <span className={cn('text-xs font-semibold',
                    !istOffen ? 'text-emerald-600' :
                    loesungUeberfaellig ? 'text-red-600' : 'text-slate-500'
                  )}>
                    {!istOffen
                      ? '✓ Abgeschlossen'
                      : loesungUeberfaellig
                      ? `Überfällig um ${zeitAnzeige(loesungUeberfaelligUm! * 3_600_000)}`
                      : `Noch ${zeitAnzeige(c.slaResolutionHours * 3_600_000 - (now.getTime() - c.openedAt.getTime()))}`}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mb-1.5">SLA: {c.slaResolutionHours}h ({(c.slaResolutionHours / 24).toFixed(0)} Tage)</div>
                <SlaBalken
                  pct={Math.min(100, stundenOffen / c.slaResolutionHours * 100)}
                  fertig={!istOffen}
                  ueberfaellig={loesungUeberfaellig}
                />
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-1 text-xs text-slate-500">
              <p>Priorität: <span className="font-medium text-slate-700">{c.priority}</span></p>
              <p>Offen seit:{' '}
                <span className={cn('font-medium', loesungUeberfaellig ? 'text-red-600' : 'text-slate-700')}>
                  {zeitAnzeige(stundenOffen)}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Nachrichtenverlauf */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Nachrichtenverlauf ({c.messages.length})
            </h2>
            {!hatErstantwort && istOffen && (
              <span className="text-xs text-red-600 font-medium">← Noch keine ausgehende Nachricht gesendet</span>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {c.messages.map((msg, idx) => {
              const istEingehend = msg.direction === 'INBOUND'
              const ersteAntwort = !istEingehend &&
                c.messages.slice(0, idx).every((m) => m.direction === 'INBOUND')
              return (
                <div key={msg.id} className={cn('px-6 py-4', istEingehend ? 'bg-white' : 'bg-blue-50/30')}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {istEingehend
                        ? <MailOpen className="w-3.5 h-3.5 text-slate-400" />
                        : <Mail className="w-3.5 h-3.5 text-blue-500" />}
                      <span className={cn('text-xs font-semibold uppercase tracking-wide',
                        istEingehend ? 'text-slate-500' : 'text-blue-600'
                      )}>
                        {istEingehend ? 'Vom Kunden' : 'Vom Team'}
                      </span>
                      {ersteAntwort && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
                          Erstantwort
                        </span>
                      )}
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-500">{msg.from}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-300" />
                      <span className="text-xs text-slate-400">{formatDateTime(msg.sentAt)}</span>
                    </div>
                  </div>
                  <p className="text-xs font-medium text-slate-700 mb-1">{msg.subject}</p>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{msg.bodyText}</p>
                </div>
              )
            })}
            {c.messages.length === 0 && (
              <div className="px-6 py-8 text-center text-sm text-slate-400">Keine Nachrichten.</div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  )
}

function MetaZeile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <div className="text-sm text-slate-800">{value}</div>
    </div>
  )
}

function SlaBalken({ pct, fertig, ueberfaellig }: { pct: number; fertig: boolean; ueberfaellig: boolean }) {
  const farbe = fertig ? 'bg-emerald-400' : ueberfaellig ? 'bg-red-500' : pct >= 80 ? 'bg-orange-400' : 'bg-blue-400'
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full', farbe)} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}
