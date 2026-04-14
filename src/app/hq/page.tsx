import Link from 'next/link'
import { requireHQ } from '@/lib/permissions'
import { maybeRunScheduler } from '@/lib/scheduler'
import { prisma } from '@/lib/prisma'
import { Shell } from '@/components/layout/shell'
import { KpiCard } from '@/components/kpi-card'
import { HealthScore } from '@/components/health-score'
import { formatHours } from '@/lib/utils'
import { AlertTriangle, TrendingDown, ChevronRight, UserX } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function HQPage() {
  const user = await requireHQ()
  await maybeRunScheduler()

  const now = new Date()

  const portcos = await prisma.portco.findMany({ orderBy: { id: 'asc' } })

  const snapshots = await Promise.all(
    portcos.map((p) =>
      prisma.portcoMetricSnapshot.findFirst({
        where: { portcoId: p.id },
        orderBy: { capturedAt: 'desc' },
      })
    )
  )

  // Teamleiter-Accountability: pro Portco berechnen
  const accountability = await Promise.all(
    portcos.map(async (p, i) => {
      const openCases = await prisma.case.findMany({
        where: { portcoId: p.id, status: { not: 'RESOLVED' } },
      })

      // Anfragen ohne Erstantwort, SLA abgelaufen
      const noResponseOverdue = openCases.filter((c) => {
        if (c.firstResponseAt) return false
        const hours =
          (now.getTime() - c.lastCustomerMessageAt.getTime()) / 3_600_000
        return hours > c.slaFirstResponseHours
      }).length

      // Anfragen mit Erstantwort aber >48h kein internes Update
      const silentCases = openCases.filter((c) => {
        if (!c.firstResponseAt) return false
        const lastTouch = c.lastInternalUpdateAt ?? c.openedAt
        const hours = (now.getTime() - lastTouch.getTime()) / 3_600_000
        return hours > 48
      }).length

      // Kunden mit ≥2 Nachfragen ohne Lösung
      const repeatUnanswered = openCases.filter(
        (c) => c.repeatFollowUpCount >= 2
      ).length

      const teamLead = p.teamLeadUserId
        ? await prisma.user.findUnique({ where: { id: p.teamLeadUserId } })
        : null

      const snapshot = snapshots[i]
      const score = snapshot?.healthScore ?? 100

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

  accountability.sort((a, b) => a.healthScore - b.healthScore)

  // Gesamt-KPIs
  const totalOpen = accountability.reduce((s, a) => s + a.openCount, 0)
  const totalNoResponse = accountability.reduce((s, a) => s + a.noResponseOverdue, 0)
  const totalSilent = accountability.reduce((s, a) => s + a.silentCases, 0)
  const portcosNeedingAttention = accountability.filter((a) => a.needsAttention).length
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
        {/* Seitenheader */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-900">HQ-Übersicht</h1>
          <p className="text-sm text-slate-500 mt-1">
            Teamleiter-Performance über alle Portfoliounternehmen
          </p>
        </div>

        {/* KPI-Kacheln */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <KpiCard label="Offene Anfragen" value={totalOpen} />
          <KpiCard
            label="Keine Erstantwort (SLA abgelaufen)"
            value={totalNoResponse}
            sub="Kunden warten, TL hat nicht reagiert"
            variant={totalNoResponse > 0 ? 'danger' : 'default'}
          />
          <KpiCard
            label="TL stumm >48h"
            value={totalSilent}
            sub="Offene Anfragen ohne internes Update"
            variant={totalSilent > 3 ? 'danger' : totalSilent > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            label="Portfolio Ø Gesundheit"
            value={avgScore}
            sub={`${portcosNeedingAttention} Portco${portcosNeedingAttention !== 1 ? 's' : ''} benötigt Eingriff`}
            variant={avgScore < 50 ? 'danger' : avgScore < 70 ? 'warning' : 'good'}
          />
        </div>

        {/* Warnhinweis */}
        {portcosNeedingAttention > 0 && (
          <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700 font-medium">
              {portcosNeedingAttention} Portco
              {portcosNeedingAttention !== 1 ? 's benötigen' : ' benötigt'} Ihren
              Eingriff — Antwortlücken beim Teamleiter sind zu groß.
            </p>
          </div>
        )}

        {/* Teamleiter-Performance-Tabelle */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Teamleiter-Performance
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Sortiert nach Gesundheitsscore — Schlechteste zuerst.
                Klick auf Portco öffnet die Anfragenliste.
              </p>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Unternehmen</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Teamleiter</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Gesundheit</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Offen</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Keine Antwort (SLA abgelaufen)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Stumm {'>'}48h</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Wdh. Nachfragen</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
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
                        <p className="font-medium text-slate-900">{row.portco.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{row.portco.inboundAlias}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {row.teamLead ? (
                      <div>
                        <p className="text-sm font-medium text-slate-800">{row.teamLead.name}</p>
                        <p className="text-xs text-slate-400">{row.teamLead.email}</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-red-500">
                        <UserX className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">Kein Teamleiter zugewiesen</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <HealthScore score={row.healthScore} showBar />
                  </td>
                  <td className="px-4 py-4 text-right font-medium text-slate-700">{row.openCount}</td>
                  <td className="px-4 py-4 text-right">
                    <span className={row.noResponseOverdue > 0 ? 'font-bold text-red-600' : 'text-slate-400'}>
                      {row.noResponseOverdue}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className={
                      row.silentCases >= 3 ? 'font-bold text-red-600' :
                      row.silentCases > 0  ? 'font-semibold text-amber-600' : 'text-slate-400'
                    }>
                      {row.silentCases}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className={row.repeatUnanswered > 1 ? 'font-semibold text-orange-600' : 'text-slate-500'}>
                      {row.repeatUnanswered}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    {row.needsAttention ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                        <AlertTriangle className="w-3 h-3" /> Eingreifen
                      </span>
                    ) : row.healthScore < 70 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                        Beobachten
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
                      Anfragen <ChevronRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Handlungsempfehlungen */}
        {accountability.some((a) => a.needsAttention) && (
          <div className="mt-6 bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-slate-900">Handlungsempfehlungen</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {accountability.filter((a) => a.needsAttention).map((row) => (
                <div key={row.portco.id} className="px-6 py-4 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {row.portco.name}
                      {row.teamLead
                        ? ` — Kontakt aufnehmen mit ${row.teamLead.name}`
                        : ' — sofort Teamleiter zuweisen'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {[
                        row.noResponseOverdue > 0 &&
                          `${row.noResponseOverdue} Kunde${row.noResponseOverdue > 1 ? 'n warten' : ' wartet'} ohne Antwort (SLA abgelaufen)`,
                        row.silentCases > 0 &&
                          `${row.silentCases} Anfrage${row.silentCases > 1 ? 'n' : ''} seit >48h ohne internes Update`,
                        row.repeatUnanswered > 0 &&
                          `${row.repeatUnanswered} Anfrage${row.repeatUnanswered > 1 ? 'n' : ''} mit mehrfachen Kunden-Nachfragen`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <Link
                    href={`/cases?portcoId=${row.portco.id}`}
                    className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors whitespace-nowrap ml-6"
                  >
                    Anfragen anzeigen →
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
