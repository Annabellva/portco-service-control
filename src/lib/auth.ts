import { createHmac } from 'crypto'
import { cookies } from 'next/headers'
import { prisma } from './prisma'

const SECRET =
  process.env.SESSION_SECRET || 'portco-service-control-secret-key-2024'

function signValue(value: string): string {
  const sig = createHmac('sha256', SECRET).update(value).digest('base64url')
  return `${value}.${sig}`
}

function verifyValue(signed: string): string | null {
  const dotIndex = signed.lastIndexOf('.')
  if (dotIndex === -1) return null
  const value = signed.substring(0, dotIndex)
  const sig = signed.substring(dotIndex + 1)
  const expected = createHmac('sha256', SECRET).update(value).digest('base64url')
  if (sig !== expected) return null
  return value
}

/** Creates a signed session string encoding userId and role */
export function createSession(userId: number, role: string): string {
  return signValue(`${userId}:${role}`)
}

/** Verifies session cookie value; returns "userId:role" or null */
export function verifySession(signed: string): string | null {
  return verifyValue(signed)
}

/** Use in server components / route handlers */
export async function getCurrentUser() {
  const cookieStore = cookies()
  const sessionCookie = cookieStore.get('session')
  if (!sessionCookie) return null

  const raw = verifyValue(sessionCookie.value)
  if (!raw) return null

  const [userIdStr] = raw.split(':')
  const userId = parseInt(userIdStr)
  if (isNaN(userId)) return null

  return prisma.user.findUnique({
    where: { id: userId },
    include: { portco: true },
  })
}
