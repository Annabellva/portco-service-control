interface CaseForMetrics {
  priority: string
  status: string
  isOverdue: boolean
  escalationLevel: number
  repeatFollowUpCount: number
  firstResponseAt: Date | null
  openedAt: Date
}

export interface PortcoMetrics {
  openCaseCount: number
  criticalOpenCount: number
  overdueCount: number
  redFlagCount: number
  avgFirstResponseHours: number | null
  repeatFollowUpRate: number
  healthScore: number
}

export function calculatePortcoMetrics(cases: CaseForMetrics[]): PortcoMetrics {
  const openCases = cases.filter((c) => c.status !== 'RESOLVED')
  const openCaseCount = openCases.length

  if (openCaseCount === 0) {
    return {
      openCaseCount: 0,
      criticalOpenCount: 0,
      overdueCount: 0,
      redFlagCount: 0,
      avgFirstResponseHours: null,
      repeatFollowUpRate: 0,
      healthScore: 100,
    }
  }

  const criticalOpenCount = openCases.filter(
    (c) => c.priority === 'CRITICAL'
  ).length
  const overdueCount = openCases.filter((c) => c.isOverdue).length
  const redFlagCount = openCases.filter((c) => c.escalationLevel >= 3).length

  // Avg first response across all cases (resolved + open) that have a first response
  const responseTimes = cases
    .filter((c) => c.firstResponseAt != null)
    .map(
      (c) =>
        (c.firstResponseAt!.getTime() - c.openedAt.getTime()) / 3_600_000
    )
  const avgFirstResponseHours =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null

  const repeatFollowUpRate =
    openCases.filter((c) => c.repeatFollowUpCount > 0).length / openCaseCount

  // Health score formula
  const overdueRate = overdueCount / openCaseCount
  const redFlagRate = redFlagCount / openCaseCount

  // Slow first response penalty: normalized against 8h target
  let slowPenalty = 0
  if (avgFirstResponseHours == null) {
    slowPenalty = 1.0 // no responses = max penalty
  } else {
    // Linearly penalise: 0 penalty at ≤8h, full penalty (1.0) at ≥24h
    slowPenalty = Math.max(0, Math.min(1, (avgFirstResponseHours - 8) / 16))
  }

  let healthScore = 100
  healthScore -= overdueRate * 30
  healthScore -= redFlagRate * 30
  healthScore -= repeatFollowUpRate * 20
  healthScore -= slowPenalty * 20
  healthScore = Math.max(0, Math.min(100, Math.round(healthScore)))

  return {
    openCaseCount,
    criticalOpenCount,
    overdueCount,
    redFlagCount,
    avgFirstResponseHours,
    repeatFollowUpRate,
    healthScore,
  }
}
