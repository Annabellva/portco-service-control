import { prisma } from './prisma'
import { getEffectiveNow } from './demo-clock'
import { calculateEscalation } from './escalation'
import { calculatePortcoMetrics } from './metrics'

/** Run full escalation + metrics recalculation */
export async function runScheduler(): Promise<void> {
  const now = await getEffectiveNow()

  // 1. Fetch all open cases
  const openCases = await prisma.case.findMany({
    where: { status: { not: 'RESOLVED' } },
  })

  // 2. Update each case with fresh escalation data
  for (const c of openCases) {
    const { escalationLevel, isOverdue, needsHQAttention } =
      calculateEscalation(c, now)

    await prisma.case.update({
      where: { id: c.id },
      data: { escalationLevel, isOverdue, needsHQAttention },
    })
  }

  // 3. For each portco compute fresh metrics and save snapshot
  const portcos = await prisma.portco.findMany()

  for (const portco of portcos) {
    const allCases = await prisma.case.findMany({
      where: { portcoId: portco.id },
    })

    const metrics = calculatePortcoMetrics(allCases)

    await prisma.portcoMetricSnapshot.create({
      data: {
        portcoId: portco.id,
        capturedAt: now,
        ...metrics,
      },
    })
  }

  // 4. Update lastSchedulerRun
  await prisma.demoSettings.upsert({
    where: { id: 1 },
    update: { lastSchedulerRun: now },
    create: { id: 1, clockOffset: 0, lastSchedulerRun: now },
  })
}

/** Runs scheduler only if last run was > 5 minutes ago */
export async function maybeRunScheduler(): Promise<void> {
  const settings = await prisma.demoSettings.findFirst()
  const lastRun = settings?.lastSchedulerRun
  const now = new Date()

  if (!lastRun || now.getTime() - lastRun.getTime() > 5 * 60_000) {
    await runScheduler()
  }
}
