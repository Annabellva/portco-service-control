export interface SlaHours {
  slaFirstResponseHours: number
  slaResolutionHours: number
}

const SLA_MAP: Record<string, SlaHours> = {
  CRITICAL: { slaFirstResponseHours: 2, slaResolutionHours: 24 },
  HIGH: { slaFirstResponseHours: 8, slaResolutionHours: 72 },
  NORMAL: { slaFirstResponseHours: 24, slaResolutionHours: 120 },
  LOW: { slaFirstResponseHours: 48, slaResolutionHours: 168 },
}

export function getSlaHours(priority: string): SlaHours {
  return SLA_MAP[priority] ?? SLA_MAP['NORMAL']
}
