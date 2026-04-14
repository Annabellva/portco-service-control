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
import { AlertTriangle, Clock, RefreshCw, Users, CheckSquare } from 'lucide-react'

export const dynamic = 'force-dynamic'

function warteZeit(ms: number): string {
  const h = ms / 3_600_000
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 24) return `${Math.round(h)}h`
  const d = Math.floor(h / 24)
  const rem = Math.round(h % 24)
  return rem > 0 ? `${d}T ${rem}h` : `${d}T`
}

export default async function TeamLeadPage() {
  const user = await requireTeamLead()
  await maybeRunScheduler()

  if (!user.portcoId) {
    return (
      <Shell user={user} activePath="/team-lead">
        <div className="p-8">
          <p className="text-slate-500">Kein Portco zugewiesen.</p>
        </div>
      </Shell>
    )
  }

  const now = new Date()
  const portco = await prisma.portco.findUnique({ where: { id: user.portcoId } })

  const offeneAnfragen = await prisma.case.findMany({
    where: { portcoId: user.portcoId, status: { not: 'RESOLVED' } },
    orderBy: [{ priority: 'asc' }, { openedAt: 'asc' }],
  })

  const alleAnfragen = await prisma.case.findMany({
    where: { portcoId: user.portcoId },
    orderBy: [{ openedAt: 'desc' }],
    take: 100,
  })

  // ── Überfällig: Keine Antwort gesendet, SLA abgelaufen ───────────────────
  const keineAntwort = offeneAnfragen.filter((c) => !c.firstResponseAt)
  const keineAntwortUeberfaellig = keineAntwort.filter((c) => {
    const stunden = (now.getTime() - c.lastCustomerMessageAt.getTime()) / 3_600_000
    return stunden > c.slaFirstResponseHours
  })
  const keineAntwortInFrist = keineAntwort.filter(
    (c) => !keineAntwortUeberfaellig.includes(c)
  )

  // ── Überfällig: Problem nicht gelöst nach Fristablauf ────────────────────
  const loesungUeberfaellig = offeneAnfragen.filter((c) => {
    if (!c.firstResponseAt) return false
    const stundenOffen = (now.getTime() - c.openedAt.getTime()) / 3_600_000
    return stundenOffen > c.slaResolutionHours
  })

  // ── Beobachten ───────────────────────────────────────────────────────────
  const mehrfachNachgefragt = offeneAnfragen.filter((c) => c.repeatFollowUpCount >= 2)
  const teamStumm = offeneAnfragen.filter((c) => {
    if (!c.firstResponseAt) return false
    const letzterKontakt = c.lastInternalUpdateAt ?? c.openedAt
    return (now.getTime() - letzterKontakt.getTime()) / 3_600_000 > 48
  })

  // ── Zuständiger Mitarbeiter ──────────────────────────────────────────────
  const mitarbeiterMap = new Map<
    string,
    { gesamt: number; keineAntwort: number; stumm: number; ueberfaellig: number }
  >()
  for (const c of offeneAnfragen) {
    const key = c.assignedInternalOwnerName ?? '(Nicht zugewiesen)'
    if (!mitarbeiterMap.has(key)) {
      mitarbeiterMap.set(key, { gesamt: 0, keineAntwort: 0, stumm: 0, ueberfaellig: 0 })
    }
    const e = mitarbeiterMap.get(key)!
    e.gesamt++
    if (!c.firstResponseAt) e.keineAntwort++
    const letzterKontakt = c.lastInternalUpdateAt ?? c.openedAt
    if ((now.getTime() - letzterKontakt.getTime()) / 3_600_000 > 48) e.stumm++
    if (c.isOverdue) e.ueberfaellig++
  }
  const mitarbeiterZeilen = Array.from(mitarbeiterMap.entries()).sort(
    (a, b) => b[1].keineAntwort - a[1].keineAntwort || b[1].stumm - a[1].stumm
  )

  const gesamtUeberfaellig = keineAntwortUeberfaellig.length + loesungUeberfaellig.length

  return (
    <Shell user={user} activePath="/team-lead">
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-900">{portco?.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Servicewarteschlange — {offeneAnfragen.length} offene Anfrage
            {offeneAnfragen.length !== 1 ? 'n' : ''}
            {gesamtUeberfaellig > 0 && (
              <span className="ml-2 text-red-600 font-semibold">
                · {gesamtUeberfaellig} überfällig
              </span>
            )}
          </p>
        </div>

        {/* KPI-Kacheln */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <KpiCard
            label="Keine Antwort gesendet"
            value={keineAntwort.length}
            sub={
              keineAntwortUeberfaellig.length > 0
                ? `${keineAntwortUeberfaellig.length} Frist abgelaufen`
                : 'Innerhalb der Frist'
            }
            variant={
              keineAntwortUeberfaellig.length > 0
                ? 'danger'
                : keineAntwort.length > 0
                ? 'warning'
                : 'default'
            }
          />
          <KpiCard
            label="Ungelöst nach Fristablauf"
            value={loesungUeberfaellig.length}
            sub="Antwort gesendet, Problem noch offen"
            variant={loesungUeberfaellig.length > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            label="Kunde hat ×2+ nachgefragt"
            value={mehrfachNachgefragt.length}
            sub="Ohne abschließende Lösung"
            variant={mehrfachNachgefragt.length > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            label="Gesamt Offen"
            value={offeneAnfragen.length}
            sub={`${alleAnfragen.filter((c) => c.status === 'RESOLVED').length} abgeschlossen gesamt`}
            variant="default"
          />
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            SEKTION 1: Überfällig — sofortiger Handlungsbedarf
        ───────────────────────────────────────────────────────────────── */}
        {(keineAntwortUeberfaellig.length > 0 || loesungUeberfaellig.length > 0) && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <h2 className="text-sm font-bold text-red-700 uppercase tracking-wide">
                Überfällig — Sofortiger Handlungsbedarf
              </h2>
            </div>

            {keineAntwortUeberfaellig.length > 0 && (
              <div className="mb-4 rounded-lg border-2 border-red-200 overflow-hidden">
                <div className="px-5 py-3 bg-red-50 border-b border-red-100">
                  <p className="text-sm font-semibold text-red-800">
                    Keine Antwort gesendet — Erstantwortfrist abgelaufen
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Diese Kunden haben keine einzige Antwort von Ihrem Team erhalten.
                    Je länger Sie warten, desto größer der Schaden für die Kundenbeziehung.
                    Antworten Sie noch heute.
                  </p>
                </div>
                <AnfragenTabelle
                  anfragen={keineAntwortUeberfaellig}
                  now={now}
                  spalten={['nummer', 'kunde', 'betreff', 'prioritaet', 'wartet', 'zustaendig']}
                  warteVon="letzteKundenNachricht"
                  warteHervorheben
                />
              </div>
            )}

            {loesungUeberfaellig.length > 0 && (
              <div className="rounded-lg border-2 border-orange-200 overflow-hidden">
                <div className="px-5 py-3 bg-orange-50 border-b border-orange-100">
                  <p className="text-sm font-semibold text-orange-800">
                    Ungelöst nach Fristablauf — Lösungsfrist überschritten
                  </p>
                  <p className="text-xs text-orange-700 mt-0.5">
                    Eine Antwort wurde gesendet, aber diese Anfragen sind noch offen —
                    die Lösungsfrist ist bereits abgelaufen. Der Kunde wartet weiterhin
                    auf eine Problemlösung.
                  </p>
                </div>
                <AnfragenTabelle
                  anfragen={loesungUeberfaellig}
                  now={now}
                  spalten={['nummer', 'kunde', 'betreff', 'prioritaet', 'offenSeit', 'zustaendig']}
                />
              </div>
            )}
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────
            SEKTION 2: Awaiting first reply (innerhalb Frist)
        ───────────────────────────────────────────────────────────────── */}
        {keineAntwortInFrist.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold text-amber-700 uppercase tracking-wide">
                Noch keine Antwort — Frist läuft
              </h2>
            </div>
            <div className="rounded-lg border border-amber-200 overflow-hidden">
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
                <p className="text-xs text-amber-700">
                  Noch keine Antwort gesendet, aber innerhalb der SLA-Frist.
                  Antworten Sie vor Fristablauf.
                </p>
              </div>
              <AnfragenTabelle
                anfragen={keineAntwortInFrist}
                now={now}
                spalten={['nummer', 'kunde', 'betreff', 'prioritaet', 'fristEnde', 'zustaendig']}
              />
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────
            SEKTION 3: Beobachten
        ───────────────────────────────────────────────────────────────── */}
        {(mehrfachNachgefragt.length > 0 || teamStumm.length > 0) && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wide">
                Im Blick behalten
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {mehrfachNachgefragt.length > 0 && (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                    <p className="text-sm font-semibold text-slate-700">Kunde hat ×2+ nachgefragt</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Kunde hat mehrere Nachrichten ohne abschließende Lösung gesendet.
                    </p>
                  </div>
                  <AnfragenTabelle
                    anfragen={mehrfachNachgefragt}
                    now={now}
                    spalten={['nummer', 'kunde', 'prioritaet', 'nachfragen', 'zustaendig']}
                    kompakt
                  />
                </div>
              )}
              {teamStumm.length > 0 && (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                    <p className="text-sm font-semibold text-slate-700">Kein internes Update seit 48h+</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Ihr Team hat geantwortet, aber diese Anfragen seitdem nicht mehr angefasst.
                    </p>
                  </div>
                  <AnfragenTabelle
                    anfragen={teamStumm}
                    now={now}
                    spalten={['nummer', 'kunde', 'prioritaet', 'letztesUpdate', 'zustaendig']}
                    kompakt
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────
            SEKTION 4: Alle offenen Anfragen
        ───────────────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
              Alle offenen Anfragen
            </h2>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {offeneAnfragen.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-slate-400">
                Keine offenen Anfragen. Alles abgearbeitet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nr.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Kunde</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Betreff</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Priorität</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Eröffnet</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Letzte Kunden-Nachricht</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Zuständig</th>
                  </tr>
                </thead>
                <tbody>
                  {offeneAnfragen.map((c) => {
                    const isKeineAntwort = !c.firstResponseAt
                    return (
                      <tr
                        key={c.id}
                        className={cn(
                          'border-b border-gray-50 last:border-0 hover:bg-gray-50',
                          isKeineAntwort && c.isOverdue ? 'bg-red-50/20' :
                          c.isOverdue ? 'bg-amber-50/20' : ''
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

        {/* ─────────────────────────────────────────────────────────────────
            SEKTION 5: Nach Mitarbeiter
        ───────────────────────────────────────────────────────────────── */}
        {mitarbeiterZeilen.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                Nach Mitarbeiter
              </h2>
            </div>
            <div className="bg-white rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Mitarbeiter</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Offen</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Keine Antwort</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Stumm {'>'}48h</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Überfällig</th>
                  </tr>
                </thead>
                <tbody>
                  {mitarbeiterZeilen.map(([name, data]) => (
                    <tr key={name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-slate-800">{name}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{data.gesamt}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={data.keineAntwort > 0 ? 'font-bold text-red-600' : 'text-slate-400'}>{data.keineAntwort}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={data.stumm > 0 ? 'font-semibold text-amber-600' : 'text-slate-400'}>{data.stumm}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={data.ueberfaellig > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}>{data.ueberfaellig}</span>
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

// ── Wiederverwendbare Anfragentabelle ─────────────────────────────────────────

type Spalte =
  | 'nummer' | 'kunde' | 'betreff' | 'prioritaet'
  | 'wartet' | 'offenSeit' | 'fristEnde'
  | 'nachfragen' | 'letztesUpdate' | 'zustaendig' | 'status'

function AnfragenTabelle({
  anfragen,
  now,
  spalten,
  warteVon,
  warteHervorheben,
  kompakt,
}: {
  anfragen: Awaited<ReturnType<typeof prisma.case.findMany>>
  now: Date
  spalten: Spalte[]
  warteVon?: 'letzteKundenNachricht' | 'eroeffnung'
  warteHervorheben?: boolean
  kompakt?: boolean
}) {
  const pad = kompakt ? 'px-4 py-2' : 'px-4 py-3'

  const kopf: Partial<Record<Spalte, string>> = {
    nummer:      'Nr.',
    kunde:       'Kunde',
    betreff:     'Betreff',
    prioritaet:  'Priorität',
    wartet:      'Wartet seit',
    offenSeit:   'Offen seit',
    fristEnde:   'SLA-Frist',
    nachfragen:  'Nachfragen',
    letztesUpdate: 'Letztes Update',
    zustaendig:  'Zuständig',
    status:      'Status',
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50/30">
          {spalten.map((s) => (
            <th
              key={s}
              className={`${pad} text-left text-xs font-semibold text-gray-400 uppercase tracking-wider`}
            >
              {kopf[s]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {anfragen.map((c) => {
          const warteMs =
            warteVon === 'eroeffnung'
              ? now.getTime() - c.openedAt.getTime()
              : now.getTime() - c.lastCustomerMessageAt.getTime()
          const offenMs = now.getTime() - c.openedAt.getTime()
          const fristRest = c.slaFirstResponseHours * 3_600_000 - offenMs
          const fristUeberfaellig = fristRest < 0

          return (
            <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
              {spalten.includes('nummer') && (
                <td className={pad}>
                  <Link href={`/cases/${c.id}`} className="font-mono text-xs font-semibold text-slate-700 hover:text-blue-600">
                    {c.caseNumber}
                  </Link>
                </td>
              )}
              {spalten.includes('kunde') && (
                <td className={`${pad} text-xs text-slate-700`}>{c.customerName}</td>
              )}
              {spalten.includes('betreff') && (
                <td className={`${pad} text-xs text-slate-600 max-w-[160px] truncate`}>{c.subject}</td>
              )}
              {spalten.includes('prioritaet') && (
                <td className={pad}><PriorityBadge priority={c.priority} /></td>
              )}
              {spalten.includes('wartet') && (
                <td className={pad}>
                  <span className={cn('text-xs font-bold', warteHervorheben ? 'text-red-700' : 'text-amber-700')}>
                    {warteZeit(warteMs)}
                  </span>
                </td>
              )}
              {spalten.includes('offenSeit') && (
                <td className={pad}>
                  <span className="text-xs font-semibold text-orange-700">{warteZeit(offenMs)}</span>
                </td>
              )}
              {spalten.includes('fristEnde') && (
                <td className={pad}>
                  <span className={cn('text-xs font-semibold', fristUeberfaellig ? 'text-red-600' : 'text-green-700')}>
                    {fristUeberfaellig
                      ? `Überfällig seit ${warteZeit(Math.abs(fristRest))}`
                      : `Noch ${warteZeit(fristRest)}`}
                  </span>
                </td>
              )}
              {spalten.includes('nachfragen') && (
                <td className={`${pad} text-right`}>
                  <span className="text-xs font-bold text-orange-700">×{c.repeatFollowUpCount}</span>
                </td>
              )}
              {spalten.includes('letztesUpdate') && (
                <td className={pad}>
                  <span className="text-xs text-amber-700 font-medium">
                    {warteZeit(now.getTime() - (c.lastInternalUpdateAt ?? c.openedAt).getTime())} her
                  </span>
                </td>
              )}
              {spalten.includes('status') && (
                <td className={pad}><StatusBadge status={c.status} /></td>
              )}
              {spalten.includes('zustaendig') && (
                <td className={`${pad} text-xs text-slate-500`}>
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
