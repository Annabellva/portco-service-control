import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Portco Service Control',
  description: 'Service control layer for property management roll-up',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
