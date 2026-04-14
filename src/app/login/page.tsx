'use client'

import { useRouter } from 'next/navigation'
import { Building2, Shield, UserCheck } from 'lucide-react'

const DEMO_USERS = [
  {
    id: 1,
    name: 'Sarah Klein',
    role: 'HQ',
    roleLabel: 'HQ — All Portcos',
    description: 'Full access to all portcos, aggregated view, admin controls.',
    icon: Shield,
    color: 'border-slate-300 hover:border-slate-900 hover:bg-slate-50',
    badge: 'bg-slate-100 text-slate-700',
  },
  {
    id: 2,
    name: 'Lars Müller',
    role: 'TEAM_LEAD',
    roleLabel: 'Team Lead — Hamburg',
    description: 'Hamburg Immobilien GmbH. Healthy portco with resolved cases.',
    icon: UserCheck,
    color: 'border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50/50',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 3,
    name: 'Anna Schmidt',
    role: 'TEAM_LEAD',
    roleLabel: 'Team Lead — Berlin',
    description: 'Berlin Residenz KG. Medium portco with unresolved escalations.',
    icon: UserCheck,
    color: 'border-amber-200 hover:border-amber-500 hover:bg-amber-50/50',
    badge: 'bg-amber-100 text-amber-700',
  },
]

export default function LoginPage() {
  const router = useRouter()

  async function login(userId: number) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const data = await res.json()
    if (data.redirect) {
      router.push(data.redirect)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Building2 className="w-7 h-7 text-slate-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Portco Service Control
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Property management service operations platform
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-900/40 border border-amber-700/40 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs text-amber-300 font-medium">Demo mode — select a login below</span>
          </div>
        </div>

        {/* User cards */}
        <div className="space-y-3">
          {DEMO_USERS.map((u) => {
            const Icon = u.icon
            return (
              <button
                key={u.id}
                onClick={() => login(u.id)}
                className={`w-full text-left bg-white rounded-xl border-2 px-5 py-4 transition-all duration-150 cursor-pointer group ${u.color}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{u.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{u.roleLabel}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${u.badge}`}>
                    {u.role}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-3 pl-12">{u.description}</p>
              </button>
            )
          })}
        </div>

        <p className="text-center text-xs text-slate-600 mt-8">
          Demo environment — no real credentials required
        </p>
      </div>
    </div>
  )
}
