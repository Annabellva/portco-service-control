import { cn } from '@/lib/utils'

const CONFIG: Record<string, { label: string; className: string }> = {
  NEW: {
    label: 'New',
    className: 'bg-slate-100 text-slate-700 border border-slate-200',
  },
  AWAITING_FIRST_RESPONSE: {
    label: 'No Reply Sent',
    className: 'bg-red-100 text-red-800 border border-red-200',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    className: 'bg-blue-100 text-blue-800 border border-blue-200',
  },
  WAITING_ON_CUSTOMER: {
    label: 'Waiting for Customer',
    className: 'bg-purple-100 text-purple-700 border border-purple-200',
  },
  RESOLVED: {
    label: 'Closed',
    className: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  },
}

export function StatusBadge({ status }: { status: string }) {
  const config = CONFIG[status] ?? CONFIG['NEW']
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        config.className
      )}
    >
      {config.label}
    </span>
  )
}
