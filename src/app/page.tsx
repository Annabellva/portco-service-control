import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role === 'HQ') redirect('/hq')
  redirect('/team-lead')
}
