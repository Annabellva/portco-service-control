import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { advanceClock, getEffectiveNow } from '@/lib/demo-clock'
import { runScheduler } from '@/lib/scheduler'

// Sample demo payloads
const SAMPLE_INBOUND_NEW = {
  from: 'hans.zimmermann@kunde.de',
  to: 'cases@hamburg-immo.de',
  subject: 'Heizung ausgefallen – dringende Bitte um Hilfe',
  bodyText:
    'Sehr geehrte Damen und Herren,\n\nseit heute Morgen funktioniert die Heizung in meiner Wohnung (Erdgeschoss, Wohnung 2) nicht mehr. Es ist sehr kalt und ich habe zwei kleine Kinder. Bitte schicken Sie so schnell wie möglich jemanden.\n\nMit freundlichen Grüßen,\nHans Zimmermann',
}

const SAMPLE_FOLLOWUP = {
  from: 'hans.zimmermann@kunde.de',
  to: 'cases@hamburg-immo.de',
  subject: 'Re: Heizung ausgefallen – dringende Bitte um Hilfe',
  bodyText:
    'Es ist jetzt 24 Stunden vergangen und niemand hat sich gemeldet. Meine Kinder frieren. Bitte sofort handeln!\n\nH. Zimmermann',
}

const SAMPLE_OUTBOUND = {
  from: 'cases@hamburg-immo.de',
  to: 'hans.zimmermann@kunde.de',
  subject: 'Re: Heizung ausgefallen – wir kümmern uns',
  bodyText:
    'Sehr geehrter Herr Zimmermann,\n\nwir haben Ihre Anfrage erhalten und ein Techniker wird sich heute noch bei Ihnen melden. Wir entschuldigen uns für die Unannehmlichkeiten.\n\nMit freundlichen Grüßen,\nMax Braun\nHamburg Immobilien GmbH',
}

export async function POST(request: NextRequest) {
  const { action } = await request.json()

  switch (action) {
    case 'add_inbound_new': {
      // Create a brand new inbound email — will create a new case
      const resp = await fetch(
        new URL('/api/inbound-email', request.url).toString(),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...SAMPLE_INBOUND_NEW, sentAt: new Date().toISOString() }),
        }
      )
      const result = await resp.json()
      return NextResponse.json({ ok: true, ...result })
    }

    case 'add_inbound_followup': {
      // Follow-up on the demo case (same email + similar subject → will match)
      const resp = await fetch(
        new URL('/api/inbound-email', request.url).toString(),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...SAMPLE_FOLLOWUP, sentAt: new Date().toISOString() }),
        }
      )
      const result = await resp.json()
      return NextResponse.json({ ok: true, ...result })
    }

    case 'add_outbound_reply': {
      // Send an outbound reply — will set firstResponseAt and update status
      const resp = await fetch(
        new URL('/api/outbound-email', request.url).toString(),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...SAMPLE_OUTBOUND, sentAt: new Date().toISOString() }),
        }
      )
      const result = await resp.json()
      return NextResponse.json({ ok: true, ...result })
    }

    case 'advance_6h': {
      await advanceClock(6)
      await runScheduler()
      const now = await getEffectiveNow()
      return NextResponse.json({ ok: true, message: '+6h', effectiveNow: now })
    }

    case 'advance_24h': {
      await advanceClock(24)
      await runScheduler()
      const now = await getEffectiveNow()
      return NextResponse.json({ ok: true, message: '+24h', effectiveNow: now })
    }

    case 'run_scheduler': {
      await runScheduler()
      const now = await getEffectiveNow()
      return NextResponse.json({ ok: true, message: 'Scheduler run complete', effectiveNow: now })
    }

    case 'reset_clock': {
      await prisma.demoSettings.upsert({
        where: { id: 1 },
        update: { clockOffset: 0 },
        create: { id: 1, clockOffset: 0 },
      })
      await runScheduler()
      return NextResponse.json({ ok: true, message: 'Clock reset to real time' })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}

export async function GET() {
  const settings = await prisma.demoSettings.findFirst()
  const effectiveNow = await getEffectiveNow()
  const caseCount = await prisma.case.count()
  const messageCount = await prisma.message.count()
  return NextResponse.json({
    clockOffset: settings?.clockOffset ?? 0,
    effectiveNow,
    lastSchedulerRun: settings?.lastSchedulerRun,
    caseCount,
    messageCount,
  })
}
