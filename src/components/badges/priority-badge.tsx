import { cn } from '@/lib/utils'

const CONFIG: Record<string, { label: string; className: string }> = {
  CRITICAL: {
    label: 'KRITISCH',
    className: 'bg-red-100 text-red-800 border border-red-200',
  },
  HIGH: {
    label: 'HOCH',
    className: 'bg-orange-100 text-orange-800 border border-orange-200',
  },
  NORMAL: {
    label: 'NORMAL',
    className: 'bg-blue-100 text-blue-700 border border-blue-200',
  },
  LOW: {
    label: 'NIEDRIG',
    className: 'bg-gray-100 text-gray-600 border border-gray-200',
  },
}

export function PriorityBadge({ priority }: { priority: string }) {
  const config = CONFIG[priority] ?? CONFIG['NORMAL']
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tracking-wide',
        config.className
      )}
    >
      {config.label}
    </span>
  )
}
