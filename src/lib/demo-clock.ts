import { prisma } from './prisma'

/** Returns the demo-adjusted "now". ClockOffset (hours) is added to real time. */
export async function getEffectiveNow(): Promise<Date> {
  const settings = await prisma.demoSettings.findFirst()
  const offsetHours = settings?.clockOffset ?? 0
  return new Date(Date.now() + offsetHours * 3_600_000)
}

export async function advanceClock(hours: number): Promise<void> {
  await prisma.demoSettings.upsert({
    where: { id: 1 },
    update: { clockOffset: { increment: hours } },
    create: { id: 1, clockOffset: hours },
  })
}

export async function getDemoSettings() {
  return prisma.demoSettings.findFirst()
}
