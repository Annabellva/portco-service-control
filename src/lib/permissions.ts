import { redirect } from 'next/navigation'
import { getCurrentUser } from './auth'

/** Require any authenticated user; redirect to /login otherwise */
export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

/** Require HQ role; redirect to /team-lead otherwise */
export async function requireHQ() {
  const user = await requireAuth()
  if (user.role !== 'HQ') redirect('/team-lead')
  return user
}

/** Require TEAM_LEAD role; redirect to /hq otherwise */
export async function requireTeamLead() {
  const user = await requireAuth()
  if (user.role !== 'TEAM_LEAD') redirect('/hq')
  return user
}
