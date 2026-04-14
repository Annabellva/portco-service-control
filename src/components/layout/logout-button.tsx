'use client'

import { useRouter } from 'next/navigation'

export function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors"
    >
      Sign out
    </button>
  )
}
