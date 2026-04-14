import { cn } from '@/lib/utils'

function getColor(score: number) {
  if (score >= 80) return 'text-emerald-700'
  if (score >= 60) return 'text-yellow-600'
  if (score >= 40) return 'text-orange-600'
  return 'text-red-600'
}

function getBar(score: number) {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-yellow-400'
  if (score >= 40) return 'bg-orange-400'
  return 'bg-red-500'
}

export function HealthScore({
  score,
  showBar = false,
}: {
  score: number
  showBar?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('text-sm font-bold tabular-nums', getColor(score))}>
        {Math.round(score)}
      </span>
      {showBar && (
        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', getBar(score))}
            style={{ width: `${Math.round(score)}%` }}
          />
        </div>
      )}
    </div>
  )
}
