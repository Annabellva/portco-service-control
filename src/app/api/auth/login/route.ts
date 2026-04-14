import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { userId } = body

  if (!userId || typeof userId !== 'number') {
    return NextResponse.json({ error: 'Invalid userId' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const sessionValue = createSession(user.id, user.role)
  const redirect = user.role === 'HQ' ? '/hq' : '/team-lead'

  const response = NextResponse.json({ redirect })
  response.cookies.set('session', sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })

  return response
}
