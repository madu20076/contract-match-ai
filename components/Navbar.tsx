'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { signOutUser } from '@/lib/auth'

type AuthState = 'loading' | 'unauthenticated' | 'authenticated'

export default function Navbar() {
  const pathname  = usePathname()
  const router    = useRouter()
  const [auth, setAuth] = useState<AuthState>('loading')

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      Promise.resolve().then(() => setAuth('unauthenticated'))
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setAuth(data.session ? 'authenticated' : 'unauthenticated')
    }).catch(() => setAuth('unauthenticated'))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setAuth(session ? 'authenticated' : 'unauthenticated')
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await signOutUser()
    router.push('/')
  }

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">CM</span>
            </div>
            <span className="font-semibold text-slate-900 text-lg">Contract Match AI</span>
          </Link>

          <div className="flex items-center gap-4">
            {auth === 'authenticated' ? (
              <>
                <Link
                  href="/dashboard"
                  className={`text-sm font-medium transition-colors ${
                    pathname === '/dashboard'
                      ? 'text-indigo-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </>
            ) : auth === 'unauthenticated' ? (
              <>
                <Link
                  href="/dashboard"
                  className={`text-sm font-medium transition-colors ${
                    pathname === '/dashboard'
                      ? 'text-indigo-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Demo
                </Link>
                <Link
                  href="/login"
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-full transition-colors"
                >
                  Sign up free
                </Link>
              </>
            ) : (
              // loading — show skeleton
              <div className="flex items-center gap-4">
                <div className="w-20 h-4 bg-slate-100 rounded animate-pulse" />
                <div className="w-24 h-8 bg-slate-100 rounded-full animate-pulse" />
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
