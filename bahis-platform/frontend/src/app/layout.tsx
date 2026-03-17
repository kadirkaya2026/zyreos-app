import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BahisPro',
  description: 'Spor Bahisleri',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="bg-bg-primary text-text-primary min-h-screen">{children}</body>
    </html>
  )
}
