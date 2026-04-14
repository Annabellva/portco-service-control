import Link from 'next/link'
import { LogoutButton } from './logout-button'
import {
  LayoutDashboard,
  List,
  Settings,
  Building2,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ShellProps {
  children: React.ReactNode
  user: {
    name: string
    role: string
    portco?: { name: string } | null
  }
  activePath: string
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string
  icon: React.ElementType
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
        active
          ? 'bg-slate-800 text-white'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {label}
    </Link>
  )
}

export function Shell({ children, user, activePath }: ShellProps) {
  const isHQ = user.role === 'HQ'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-slate-900 flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-slate-400" />
            <span className="text-sm font-semibold text-white leading-tight">
              Portco Service
              <br />
              <span className="text-slate-400 font-normal">Control</span>
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {isHQ ? (
            <>
              <NavLink
                href="/hq"
                icon={LayoutDashboard}
                label="HQ Dashboard"
                active={activePath === '/hq'}
              />
              <NavLink
                href="/cases"
                icon={List}
                label="All Cases"
                active={activePath === '/cases'}
              />
              <NavLink
                href="/admin/demo"
                icon={Settings}
                label="Demo Controls"
                active={activePath === '/admin/demo'}
              />
            </>
          ) : (
            <>
              <NavLink
                href="/team-lead"
                icon={LayoutDashboard}
                label="My Dashboard"
                active={activePath === '/team-lead'}
              />
              <NavLink
                href="/cases"
                icon={List}
                label="Cases"
                active={activePath === '/cases'}
              />
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="px-3 py-4 border-t border-slate-800">
          <div className="mb-2 px-1">
            <p className="text-xs font-semibold text-white truncate">{user.name}</p>
            <p className="text-xs text-slate-400 truncate">
              {isHQ ? 'HQ — All portcos' : user.portco?.name ?? 'Team Lead'}
            </p>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
