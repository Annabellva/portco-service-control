import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/auth'
import { findCredential } from '@/lib/credentials'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { email, password } = body

  if (!email || !password) {
    return NextResponse.json(
      { error: 'E-Mail und Passwort erforderlich' },
      { status: 400 }
    )
  }

  const cred = findCredential(email, password)
  if (!cred) {
    return NextResponse.json(
      { error: 'Ungültige Anmeldedaten' },
      { status: 401 }
    )
  }

  const user = await prisma.user.findUnique({ where: { id: cred.userId } })
  if (!user) {
    return NextResponse.json({ error: 'Benutzer nicht gefunden' }, { status: 404 })
  }

  const sessionValue = createSession(user.id, user.role)
  const redirect = user.role === 'HQ' ? '/hq' : '/team-lead'

  const response = NextResponse.json({ redirect })
  response.cookies.set('session', sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  return response
}
