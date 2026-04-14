import { prisma } from './prisma'
import { normalizeSubject } from './subject-normalization'

/**
 * Tries to find an existing open case for an inbound email.
 * Strategy:
 * 1. Match by externalThreadKey (if present)
 * 2. Match by normalizedSubject + customerEmail + portcoId within 30 days
 */
export async function findMatchingCase(params: {
  portcoId: number
  customerEmail: string
  subject: string
  sentAt: Date
  externalThreadKey?: string | null
}) {
  const { portcoId, customerEmail, subject, sentAt, externalThreadKey } = params

  // Strategy 1: thread key match
  if (externalThreadKey) {
    const byThread = await prisma.case.findFirst({
      where: {
        portcoId,
        status: { not: 'RESOLVED' },
        messages: { some: { externalThreadKey } },
      },
    })
    if (byThread) return byThread
  }

  // Strategy 2: normalized subject + email + portco + within 30 days
  const normalizedSubj = normalizeSubject(subject)
  const thirtyDaysAgo = new Date(sentAt.getTime() - 30 * 24 * 3_600_000)

  return prisma.case.findFirst({
    where: {
      portcoId,
      customerEmail,
      normalizedSubject: normalizedSubj,
      status: { not: 'RESOLVED' },
      openedAt: { gte: thirtyDaysAgo },
    },
    orderBy: { openedAt: 'desc' },
  })
}

/** Extracts a display name from an email address or "Name <email>" format */
export function extractName(from: string): string {
  const match = from.match(/^(.+?)\s*</)
  if (match) return match[1].trim()
  const local = from.split('@')[0]
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Generates the next case number for a portco */
export async function generateCaseNumber(
  portcoId: number,
  casePrefix: string
): Promise<string> {
  const count = await prisma.case.count({ where: { portcoId } })
  return `${casePrefix}-${String(count + 1).padStart(4, '0')}`
}
