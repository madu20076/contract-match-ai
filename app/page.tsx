'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle2, Search, Zap, Shield, Loader2, LogOut } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { signOutUser } from '@/lib/auth'

const CURRENT_YEAR = new Date().getFullYear()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const features = [
  {
    icon: Search,
    title: 'Smart Contract Discovery',
    desc: 'We scan thousands of federal and state contracts daily and surface only the ones relevant to your business.',
  },
  {
    icon: Zap,
    title: 'AI-Powered Matching',
    desc: 'Our matching engine weighs your NAICS codes, certifications, location, and past performance to score each opportunity.',
  },
  {
    icon: Shield,
    title: 'Built for Small Business',
    desc: 'Set-asides, HUBZone, 8(a), SDVOSB — we understand the certifications that open doors for you.',
  },
]

const steps = [
  { num: '01', title: 'Build your profile', desc: 'Tell us about your business: industry, certifications, location, and experience.' },
  { num: '02', title: 'Get matched instantly', desc: 'Our AI scores every open contract against your profile and ranks the best fits.' },
  { num: '03', title: 'Win more contracts', desc: 'Follow our guided next steps to prepare a winning proposal.' },
]

const stats = [
  { value: '40K+', label: 'Active opportunities' },
  { value: '94%', label: 'Match accuracy' },
  { value: '3 min', label: 'To your first match' },
  { value: '$0', label: 'Free to start' },
]

type CtaState = 'loading' | 'unauthenticated' | 'no_profile' | 'has_profile'

export default function HomePage() {
  const router = useRouter()
  const [ctaState, setCtaState] = useState<CtaState>('loading')
  const [profileId, setProfileId] = useState<string | null>(null)
  const [ctaLoading, setCtaLoading] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      Promise.resolve().then(() => setCtaState('unauthenticated'))
      return
    }

    supabase.auth.getSession()
      .then(({ data }) => {
        const user = data.session?.user
        if (!user) {
          setCtaState('unauthenticated')
          return
        }
        return supabase!
          .from('business_profiles')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()
          .then(({ data: p }) => {
            const pid = (p as { id: string } | null)?.id ?? null
            if (pid && UUID_RE.test(pid)) {
              setProfileId(pid)
              setCtaState('has_profile')
            } else {
              setCtaState('no_profile')
            }
          })
      })
      .catch(() => setCtaState('unauthenticated'))
  }, [])

  async function handleCtaClick() {
    if (ctaState === 'loading') return
    if (ctaState === 'unauthenticated') { router.push('/signup'); return }
    if (ctaState === 'no_profile') { router.push('/onboarding'); return }

    // has_profile: regenerate matches then go to dashboard
    setCtaLoading(true)
    try {
      await fetch('/api/matches/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ profile_id: profileId }),
      })
    } finally {
      setCtaLoading(false)
      router.push('/dashboard')
    }
  }

  async function handleLogout() {
    await signOutUser()
    setCtaState('unauthenticated')
    setProfileId(null)
  }

  const ctaLabel =
    ctaState === 'loading'      ? 'Loading…'
    : ctaState === 'has_profile' ? 'View My Matches'
    : ctaState === 'no_profile'  ? 'Complete Your Profile'
    : 'Start Free'

  const ctaDisabled = ctaState === 'loading' || ctaLoading

  return (
    <div className="flex flex-col min-h-screen">
      {/* Navbar */}
      <nav className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">CM</span>
            </div>
            <span className="font-semibold text-white text-lg">Contract Match AI</span>
          </div>
          <div className="flex items-center gap-4">
            {ctaState === 'has_profile' || ctaState === 'no_profile' ? (
              <>
                <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white transition-colors">
                  Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </>
            ) : ctaState === 'unauthenticated' ? (
              <>
                <Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors">
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="text-sm font-medium bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-2 rounded-full transition-colors"
                >
                  Sign up free
                </Link>
              </>
            ) : (
              <div className="w-24 h-8 bg-slate-700 rounded-full animate-pulse" />
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-500/30 rounded-full px-4 py-1.5 text-sm text-indigo-300 mb-8">
            <Zap className="w-3.5 h-3.5" />
            AI-powered government contract matching
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
            Find contracts your business
            <span className="text-indigo-400"> can actually win</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
            Stop sifting through thousands of irrelevant bids. Contract Match AI analyzes your capabilities
            and surfaces only the government contracts you&apos;re best positioned to win.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={handleCtaClick}
              disabled={ctaDisabled}
              className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white font-semibold px-8 py-4 rounded-full text-base transition-colors shadow-lg shadow-indigo-500/30"
            >
              {ctaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {ctaLabel}
            </button>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white font-medium px-8 py-4 rounded-full text-base transition-colors"
            >
              View Demo Dashboard
            </Link>
          </div>

          {/* Trust line */}
          <div className="flex flex-wrap items-center justify-center gap-6 mt-12 text-sm text-slate-400">
            {['No credit card required', 'Free to get started', 'Cancel anytime'].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white border-y border-slate-200 py-12 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8">
          {stats.map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-3xl font-bold text-indigo-600">{value}</p>
              <p className="text-sm text-slate-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">Everything you need to compete</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Built specifically for small businesses navigating the complexity of government procurement.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="font-semibold text-slate-900 text-base mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">How it works</h2>
            <p className="text-slate-500 text-lg">Three steps from profile to winning bid.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-10">
            {steps.map(({ num, title, desc }) => (
              <div key={num} className="flex flex-col items-center text-center sm:items-start sm:text-left">
                <span className="text-4xl font-black text-indigo-100 mb-3 leading-none">{num}</span>
                <h3 className="font-semibold text-slate-900 text-base mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="bg-indigo-600 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to find contracts you can win?
          </h2>
          <p className="text-indigo-200 text-lg mb-8">
            Create your free business profile in under 3 minutes and get matched with live opportunities today.
          </p>
          <button
            onClick={handleCtaClick}
            disabled={ctaDisabled}
            className="inline-flex items-center gap-2 bg-white text-indigo-600 hover:bg-indigo-50 disabled:opacity-60 font-semibold px-8 py-4 rounded-full text-base transition-colors shadow-lg"
          >
            {ctaLoading ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <ArrowRight className="w-4 h-4" />}
            {ctaState === 'has_profile' ? 'View My Matches' : 'Start Free — No Credit Card Needed'}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 py-10 px-4 text-center">
        <p className="text-slate-500 text-sm">
          &copy; {CURRENT_YEAR} Contract Match AI. Built for small businesses competing in government procurement.
        </p>
      </footer>
    </div>
  )
}
