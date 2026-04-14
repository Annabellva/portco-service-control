'use client'

import { useState, useCallback } from 'react'
import { Shell } from '@/components/layout/shell'
import {
  Mail,
  Reply,
  RotateCcw,
  Clock,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'

interface ActionLog {
  id: number
  action: string
  result: string
  ok: boolean
  ts: string
}

interface DemoShellProps {
  children: React.ReactNode
}

// Client-side shell wrapper since this page is a client component
function DemoShell({ children }: DemoShellProps) {
  // We pass a static user object to Shell since this is a client component
  // The shell itself doesn't need the user to be dynamic for layout purposes
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className="w-56 flex-shrink-0 bg-slate-900 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-800">
          <span className="text-sm font-semibold text-white">
            Portco Service
            <br />
            <span className="text-slate-400 font-normal">Control</span>
          </span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          <a href="/hq" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60">
            HQ Dashboard
          </a>
          <a href="/cases" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60">
            All Cases
          </a>
          <a href="/admin/demo" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium bg-slate-800 text-white">
            Demo Controls
          </a>
        </nav>
        <div className="px-3 py-4 border-t border-slate-800">
          <p className="text-xs text-slate-400 px-3 mb-2">Sarah Klein · HQ</p>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' })
              window.location.href = '/login'
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}

export default function AdminDemoPage() {
  const [logs, setLogs] = useState<ActionLog[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [clockInfo, setClockInfo] = useState<{ offset: number; effectiveNow: string } | null>(null)
  const [logIdCounter, setLogIdCounter] = useState(0)

  const callAction = useCallback(
    async (action: string, label: string) => {
      setLoading(action)
      try {
        const res = await fetch('/api/demo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        const data = await res.json()
        const ok = res.ok

        setLogIdCounter((c) => {
          const newId = c + 1
          const entry: ActionLog = {
            id: newId,
            action: label,
            result: ok
              ? data.message ?? data.caseNumber ?? data.caseId ?? 'OK'
              : data.error ?? 'Error',
            ok,
            ts: new Date().toLocaleTimeString('de-DE'),
          }
          setLogs((prev) => [entry, ...prev].slice(0, 10))
          return newId
        })

        if (data.effectiveNow) {
          setClockInfo({
            offset: data.clockOffset ?? 0,
            effectiveNow: new Date(data.effectiveNow).toLocaleString('de-DE'),
          })
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(null)
      }
    },
    []
  )

  const fetchStatus = useCallback(async () => {
    const res = await fetch('/api/demo')
    const data = await res.json()
    setClockInfo({
      offset: data.clockOffset,
      effectiveNow: new Date(data.effectiveNow).toLocaleString('de-DE'),
    })
  }, [])

  const isLoading = (key: string) => loading === key

  return (
    <DemoShell>
      <div className="p-8 max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-900">Demo Controls</h1>
          <p className="text-sm text-slate-500 mt-1">
            Inject emails, advance the virtual clock, and trigger the scheduler manually.
          </p>
        </div>

        {/* Clock status */}
        <div className="mb-6 bg-slate-900 rounded-lg px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">
              Virtual Clock
            </p>
            {clockInfo ? (
              <>
                <p className="text-sm font-semibold text-white">{clockInfo.effectiveNow}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Offset: {clockInfo.offset >= 0 ? '+' : ''}{clockInfo.offset}h from real time
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-500">Click &quot;Refresh Status&quot; to show current time</p>
            )}
          </div>
          <button
            onClick={fetchStatus}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs font-medium hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh Status
          </button>
        </div>

        {/* Action groups */}
        <div className="space-y-5">

          {/* Email injection */}
          <ActionGroup title="Email Injection" subtitle="Simulate inbound and outbound emails hitting the Hamburg portco">
            <DemoButton
              icon={Mail}
              label="New Inbound Email (Hamburg)"
              description="Creates a new case: Heizung ausgefallen, CRITICAL priority"
              onClick={() => callAction('add_inbound_new', 'New inbound email → Hamburg')}
              loading={isLoading('add_inbound_new')}
              color="default"
            />
            <DemoButton
              icon={Mail}
              label="Inbound Follow-up (Hamburg)"
              description="Same customer, similar subject → matches existing case, increments follow-up count"
              onClick={() => callAction('add_inbound_followup', 'Follow-up email → Hamburg')}
              loading={isLoading('add_inbound_followup')}
              color="default"
            />
            <DemoButton
              icon={Reply}
              label="Outbound Reply (Hamburg)"
              description="Sets firstResponseAt on matched case, status → WAITING_ON_CUSTOMER"
              onClick={() => callAction('add_outbound_reply', 'Outbound reply → Hamburg')}
              loading={isLoading('add_outbound_reply')}
              color="blue"
            />
          </ActionGroup>

          {/* Clock */}
          <ActionGroup title="Virtual Clock" subtitle="Advance the virtual 'now' to trigger SLA breaches and escalations">
            <DemoButton
              icon={Clock}
              label="Advance Clock +6 Hours"
              description="Moves virtual time forward 6h. Runs scheduler automatically."
              onClick={() => callAction('advance_6h', 'Clock +6h')}
              loading={isLoading('advance_6h')}
              color="amber"
            />
            <DemoButton
              icon={Clock}
              label="Advance Clock +24 Hours"
              description="Moves virtual time forward 24h. Watch CRITICAL cases escalate to level 3."
              onClick={() => callAction('advance_24h', 'Clock +24h')}
              loading={isLoading('advance_24h')}
              color="amber"
            />
            <DemoButton
              icon={RotateCcw}
              label="Reset Clock to Real Time"
              description="Resets virtual clock offset to 0."
              onClick={() => callAction('reset_clock', 'Clock reset')}
              loading={isLoading('reset_clock')}
              color="default"
            />
          </ActionGroup>

          {/* Scheduler */}
          <ActionGroup title="Scheduler" subtitle="Recalculate all escalation levels and portco health scores">
            <DemoButton
              icon={Play}
              label="Run Scheduler Now"
              description="Recalculates escalation, SLA breaches, and portco health scores for all open cases."
              onClick={() => callAction('run_scheduler', 'Scheduler run')}
              loading={isLoading('run_scheduler')}
              color="green"
            />
          </ActionGroup>
        </div>

        {/* Action log */}
        {logs.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Action Log
            </h2>
            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-50">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                  {log.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-700">{log.action}</span>
                    <span className="text-xs text-slate-400 ml-2">{log.result}</span>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">{log.ts}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="mt-8 bg-slate-50 rounded-lg border border-slate-200 px-5 py-4">
          <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">
            How Autonomous Tracking Works
          </h2>
          <div className="space-y-2 text-xs text-slate-600">
            <p>
              <strong>Email → Case:</strong> Inbound emails are matched to existing open cases by thread key or (normalized subject + customer email + portco + 30-day window). No match = new case.
            </p>
            <p>
              <strong>Auto-classification:</strong> Keywords in subject/body determine category and priority. CRITICAL cases get a 2h first-response SLA; NORMAL cases get 24h.
            </p>
            <p>
              <strong>Escalation:</strong> Scheduler runs automatically on dashboard load (if &gt;5 min since last run). It checks SLA breaches, repeat follow-up counts, and internal update gaps to assign escalation levels 1–3.
            </p>
            <p>
              <strong>Going live:</strong> Forward inbound emails to <code className="bg-slate-200 px-1 rounded">POST /api/inbound-email</code>. BCC all outbound replies through <code className="bg-slate-200 px-1 rounded">POST /api/outbound-email</code>. No other changes needed.
            </p>
          </div>
        </div>
      </div>
    </DemoShell>
  )
}

function ActionGroup({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="p-4 space-y-2">{children}</div>
    </div>
  )
}

const BUTTON_COLORS: Record<string, string> = {
  default: 'bg-white border-gray-200 hover:border-gray-400 text-slate-700 hover:bg-gray-50',
  blue: 'bg-blue-50 border-blue-200 hover:border-blue-400 text-blue-800',
  amber: 'bg-amber-50 border-amber-200 hover:border-amber-400 text-amber-800',
  green: 'bg-emerald-50 border-emerald-200 hover:border-emerald-400 text-emerald-800',
}

function DemoButton({
  icon: Icon,
  label,
  description,
  onClick,
  loading,
  color,
}: {
  icon: React.ElementType
  label: string
  description: string
  onClick: () => void
  loading: boolean
  color: keyof typeof BUTTON_COLORS
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-lg border transition-all duration-150 disabled:opacity-60 ${BUTTON_COLORS[color]}`}
    >
      <div className="mt-0.5 flex-shrink-0">
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Icon className="w-4 h-4" />
        )}
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs mt-0.5 opacity-70">{description}</p>
      </div>
    </button>
  )
}
