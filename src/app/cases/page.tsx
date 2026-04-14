import Link from 'next/link'
import { requireAuth } from '@/lib/permissions'
import { maybeRunScheduler } from '@/lib/scheduler'
import { prisma } from '@/lib/prisma'
import { Shell } from '@/components/layout/shell'
import { PriorityBadge } from '@/components/badges/priority-badge'
import { StatusBadge } from '@/components/badges/status-badge'
import { formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function CasesPage({
  searchParams,
}: {
  searchParams: { portcoId?: string; status?: string; priority?: string }
}) {
  const user = await requireAuth()
  await maybeRunScheduler()

  const isHQ = user.role === 'HQ'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {}

  if (!isHQ && user.portcoId) where.portcoId = user.portcoId
  if (searchParams.portcoId && isHQ) where.portcoId = parseInt(searchParams.portcoId)
  if (searchParams.status)   where.status = searchParams.status
  if (searchParams.priority) where.priority = searchParams.priority

  const anfragen = await prisma.case.findMany({
    where,
    include: { portco: true },
    orderBy: [{ isOverdue: 'desc' }, { priority: 'asc' }, { openedAt: 'asc' }],
  })

  const portcos = isHQ
    ? await prisma.portco.findMany({ orderBy: { name: 'asc' } })
    : []

  const aktivesPortco = searchParams.portcoId
    ? portcos.find((p) => p.id === parseInt(searchParams.portcoId!))
    : null

  return (
    <Shell user={user} activePath="/cases">
      <div className="p-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {aktivesPortco ? `${aktivesPortco.name} — Anfragen` : 'Alle Anfragen'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {anfragen.length} Anfrage{anfragen.length !== 1 ? 'n' : ''}
              {aktivesPortco ? ` für ${aktivesPortco.name}` : ''}
            </p>
          </div>
          {aktivesPortco && (
            <Link
              href="/hq"
              className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              ← Zurück zur HQ-Übersicht
            </Link>
          )}
        </div>

        {/* Portco-Filter (nur HQ) */}
        {isHQ && portcos.length > 0 && !aktivesPortco && (
          <div className="mb-6 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 font-medium">Portco filtern:</span>
            {portcos.map((p) => (
              <Link
                key={p.id}
                href={`/cases?portcoId=${p.id}`}
                className="px-3 py-1 rounded text-xs font-medium bg-white border border-gray-200 text-slate-600 hover:border-slate-400 hover:text-slate-900 transition-colors"
              >
                {p.name}
              </Link>
            ))}
          </div>
        )}

        {/* Anfragentabelle */}
        <div className="bg-white rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nr.</th>
                {isHQ && !aktivesPortco && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Portco</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Kunde</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Betreff</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Kategorie</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Priorität</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Eröffnet</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Letzte Kunden-Msg</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Letztes Update</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">ÜF</th>
              </tr>
            </thead>
            <tbody>
              {anfragen.map((c) => (
                <tr
                  key={c.id}
                  className={cn(
                    'border-b border-gray-50 last:border-0 table-row-hover',
                    c.isOverdue && 'bg-amber-50/20'
                  )}
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/cases/${c.id}`}
                      className="font-mono text-xs font-semibold text-slate-700 hover:text-blue-600 transition-colors"
                    >
                      {c.caseNumber}
                    </Link>
                  </td>
                  {isHQ && !aktivesPortco && (
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {c.portco.name.split(' ')[0]}
                    </td>
                  )}
                  <td className="px-4 py-3 text-xs text-slate-700">{c.customerName}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate">{c.subject}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{c.category}</td>
                  <td className="px-4 py-3"><PriorityBadge priority={c.priority} /></td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(c.openedAt)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(c.lastCustomerMessageAt)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {c.lastInternalUpdateAt
                      ? formatDateTime(c.lastInternalUpdateAt)
                      : <span className="text-red-400">Kein Update</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.isOverdue ? (
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 mx-auto" />
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {anfragen.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-6 py-10 text-center text-sm text-slate-400">
                    Keine Anfragen gefunden.
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
