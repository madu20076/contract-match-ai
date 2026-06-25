import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

export const metadata: Metadata = {
  title: 'Contract Match AI — Find Government Contracts You Can Win',
  description:
    'AI-powered matching that connects small businesses with government and public contracts tailored to their capabilities.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased font-sans">
        {children}
      </body>
    </html>
  )
}
