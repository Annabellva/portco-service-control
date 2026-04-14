import { cn } from '@/lib/utils'

const CONFIG: Record<
  number,
  { label: string; className: string; dot: string } | null
> = {
  0: null,
  1: {
    label: 'Lvl 1',
    className: 'bg-yellow-50 text-yellow-700 border border-yellow-300',
    dot: 'bg-yellow-400',
  },
  2: {
    label: 'Lvl 2',
    className: 'bg-orange-50 text-orange-700 border border-orange-300',
    dot: 'bg-orange-500',
  },
  3: {
    label: 'HQ Attention',
    className: 'bg-red-50 text-red-700 border border-red-300',
    dot: 'bg-red-600',
  },
}

export function EscalationBadge({ level }: { level: number }) {
  const config = CONFIG[Math.min(level, 3) as 0 | 1 | 2 | 3]
  if (!config) return null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold',
        config.className
      )}
    >
      <span
        className={cn('inline-block w-1.5 h-1.5 rounded-full', config.dot)}
      />
      {config.label}
    </span>
  )
}
