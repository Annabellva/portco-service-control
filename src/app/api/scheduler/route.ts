import { NextResponse } from 'next/server'
import { runScheduler } from '@/lib/scheduler'

export async function POST() {
  await runScheduler()
  return NextResponse.json({ ok: true, message: 'Scheduler completed' })
}
