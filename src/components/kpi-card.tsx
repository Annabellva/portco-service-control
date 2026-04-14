import { cn } from '@/lib/utils'

interface KpiCardProps {
  label: string
  value: string | number
  sub?: string
  variant?: 'default' | 'warning' | 'danger' | 'good'
}

const VARIANT_STYLES: Record<string, string> = {
  default: 'text-slate-900',
  warning: 'text-amber-700',
  danger: 'text-red-600',
  good: 'text-emerald-700',
}

export function KpiCard({
  label,
  value,
  sub,
  variant = 'default',
}: KpiCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={cn('text-2xl font-bold', VARIANT_STYLES[variant])}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}
