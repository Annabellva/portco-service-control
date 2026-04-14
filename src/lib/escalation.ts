interface CaseForEscalation {
  priority: string
  status: string
  firstResponseAt: Date | null
  lastCustomerMessageAt: Date
  lastInternalUpdateAt: Date | null
  openedAt: Date
  repeatFollowUpCount: number
  slaFirstResponseHours: number
  slaResolutionHours: number
}

export interface EscalationResult {
  escalationLevel: number
  isOverdue: boolean
  needsHQAttention: boolean
}

export function calculateEscalation(
  c: CaseForEscalation,
  now: Date
): EscalationResult {
  // Resolved cases do not escalate
  if (c.status === 'RESOLVED') {
    return { escalationLevel: 0, isOverdue: false, needsHQAttention: false }
  }

  let level = 0

  const hoursOpen = (now.getTime() - c.openedAt.getTime()) / 3_600_000

  // Rule 1: no first response and past first-response SLA
  if (!c.firstResponseAt) {
    const hoursSince =
      (now.getTime() - c.lastCustomerMessageAt.getTime()) / 3_600_000
    if (hoursSince > c.slaFirstResponseHours) {
      level = Math.max(level, 1)
    }
  }

  // Rule 2: repeat follow-ups ≥ 2
  if (c.repeatFollowUpCount >= 2) {
    level = Math.max(level, 2)
  }

  // Rule 3: no internal update for > 48h
  const lastUpdate = c.lastInternalUpdateAt ?? c.openedAt
  const hoursSinceUpdate =
    (now.getTime() - lastUpdate.getTime()) / 3_600_000
  if (hoursSinceUpdate > 48) {
    level = Math.max(level, 2)
  }

  // Rule 4: CRITICAL and no internal update for > 24h → escalation 3
  if (c.priority === 'CRITICAL') {
    if (hoursSinceUpdate > 24) {
      level = Math.max(level, 3)
    }
  }

  const isOverdue = hoursOpen > c.slaResolutionHours
  const needsHQAttention = level >= 3

  return { escalationLevel: level, isOverdue, needsHQAttention }
}
