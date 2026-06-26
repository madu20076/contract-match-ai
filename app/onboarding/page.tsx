'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, ChevronLeft, CheckCircle2, Loader2, ArrowRight } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { BusinessProfile } from '@/types'

const INDUSTRIES = [
  'Information Technology',
  'Cybersecurity',
  'Construction & Engineering',
  'Healthcare & Medical',
  'Professional Services',
  'Environmental Services',
  'Logistics & Transportation',
  'Staffing & Workforce',
  'Training & Education',
  'Facilities Management',
  'Security Services',
  'Financial Services',
  'Other',
]

// Short codes stored in the DB — match what generate_matches_for_profile expects
const CERTIFICATIONS: { value: string; label: string }[] = [
  { value: '8(a)',   label: '8(a) Business Development' },
  { value: 'HUBZone', label: 'HUBZone' },
  { value: 'WOSB',   label: 'Women-Owned Small Business (WOSB)' },
  { value: 'SDVOSB', label: 'Service-Disabled Veteran-Owned (SDVOSB)' },
  { value: 'VOSB',   label: 'Veteran-Owned Small Business (VOSB)' },
  { value: 'MBE',    label: 'Minority Business Enterprise (MBE)' },
  { value: 'DBE',    label: 'Disadvantaged Business Enterprise (DBE)' },
  { value: 'SDB',    label: 'Small Disadvantaged Business (SDB)' },
]

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
]

const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',DC:'Washington DC',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',
  KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',
  MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',
  NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',
  NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
}

type Step = 1 | 2 | 3

const initialForm: Omit<BusinessProfile, 'id' | 'created_at'> = {
  business_name: '',
  industry: '',
  naics_codes: [],
  fsc_codes: [],
  nsn_interest: [],
  keywords: [],
  city: '',
  state: '',
  service_radius: 50,
  certifications: [],
  years_in_business: 0,
  past_government_experience: false,
  email: '',
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [form, setForm] = useState(initialForm)
  const [naicsInput, setNaicsInput] = useState('')
  const [fscInput, setFscInput] = useState('')
  const [nsnInput, setNsnInput] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [redirectTarget, setRedirectTarget] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(!isSupabaseConfigured)

  // Require auth — redirect to login if not logged in
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    supabase.auth.getSession()
      .then(({ data }) => {
        const user = data.session?.user ?? null
        if (!user) {
          router.push('/login?next=/onboarding')
          return
        }
        setUserId(user.id)
        setAuthChecked(true)
      })
      .catch(() => setAuthChecked(true))
  }, [router])

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => { const e = { ...prev }; delete e[key]; return e })
  }

  function addNaics() {
    const code = naicsInput.trim().replace(/\D/g, '')
    if (code.length >= 4 && code.length <= 6 && !form.naics_codes.includes(code)) {
      set('naics_codes', [...form.naics_codes, code])
    }
    setNaicsInput('')
  }

  function removeNaics(code: string) {
    set('naics_codes', form.naics_codes.filter((c) => c !== code))
  }

  function addFsc() {
    const code = fscInput.trim().replace(/\D/g, '').slice(0, 4)
    if (code.length === 4 && !form.fsc_codes.includes(code)) {
      set('fsc_codes', [...form.fsc_codes, code])
    }
    setFscInput('')
  }

  function removeFsc(code: string) {
    set('fsc_codes', form.fsc_codes.filter((c) => c !== code))
  }

  function addNsn() {
    const raw = nsnInput.trim()
    if (raw && !form.nsn_interest.includes(raw)) {
      set('nsn_interest', [...form.nsn_interest, raw])
    }
    setNsnInput('')
  }

  function removeNsn(nsn: string) {
    set('nsn_interest', form.nsn_interest.filter((n) => n !== nsn))
  }

  function addKeyword() {
    const kw = keywordInput.trim().toLowerCase()
    if (kw && !form.keywords.includes(kw)) {
      set('keywords', [...form.keywords, kw])
    }
    setKeywordInput('')
  }

  function removeKeyword(kw: string) {
    set('keywords', form.keywords.filter((k) => k !== kw))
  }

  function toggleCert(value: string) {
    if (form.certifications.includes(value)) {
      set('certifications', form.certifications.filter((c) => c !== value))
    } else {
      set('certifications', [...form.certifications, value])
    }
  }

  function validateStep(s: Step): boolean {
    const e: Record<string, string> = {}
    if (s === 1) {
      if (!form.business_name.trim()) e.business_name = 'Required'
      if (!form.industry) e.industry = 'Required'
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
        e.email = 'Valid email required'
    }
    if (s === 2) {
      if (!form.city.trim()) e.city = 'Required'
      if (!form.state) e.state = 'Required'
    }
    if (s === 3) {
      if (form.years_in_business < 0 || isNaN(form.years_in_business))
        e.years_in_business = 'Must be 0 or greater'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (!validateStep(step)) return
    if (step === 1) setStep(2)
    else if (step === 2) setStep(3)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Guard: only the final step may submit — pressing Enter on earlier steps must not submit
    if (step !== 3) return
    if (!validateStep(3)) return
    setSubmitting(true)
    setSubmitError('')

    let profileId = `mock-${Date.now()}`

    if (isSupabaseConfigured && supabase) {
      const payload: Record<string, unknown> = {
        business_name:              form.business_name,
        industry:                   form.industry,
        naics_codes:                form.naics_codes,
        fsc_codes:                  form.fsc_codes,
        nsn_interest:               form.nsn_interest,
        keywords:                   form.keywords,
        city:                       form.city,
        state:                      form.state,
        service_radius:             form.service_radius,
        certifications:             form.certifications,
        years_in_business:          form.years_in_business,
        past_government_experience: form.past_government_experience,
        email:                      form.email,
      }
      if (userId) payload.user_id = userId

      const { data, error } = await supabase
        .from('business_profiles')
        .insert(payload)
        .select('id')
        .single()

      if (error || !data) {
        console.error('[onboarding] Supabase insert error:', error)
        const detail = error?.message ?? 'No data returned'
        setSubmitError(
          process.env.NODE_ENV === 'development'
            ? `Supabase error: ${detail}`
            : 'Failed to save your profile. Please try again.'
        )
        setSubmitting(false)
        return
      }

      profileId = data.id

      // Generate AI matches — best-effort, don't block on failure
      const { error: rpcError } = await supabase.rpc('generate_matches_for_profile', {
        profile_id: profileId,
      })
      if (rpcError) {
        console.error('[onboarding] generate_matches_for_profile RPC error:', rpcError)
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('cmai_profile_id', profileId)
      localStorage.setItem('cmai_profile_data', JSON.stringify(form))
    }

    setRedirectTarget(`/dashboard?profile=${profileId}`)
    setSubmitting(false)
    setSubmitted(true)
  }

  useEffect(() => {
    if (!submitted || !redirectTarget) return
    const timer = setTimeout(() => router.push(redirectTarget), 3000)
    return () => clearTimeout(timer)
  }, [submitted, redirectTarget, router])

  const stepLabels = ['Business Info', 'Location & Certs', 'Experience & Review']

  // ── Auth loading ─────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Success screen ───────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Profile saved!</h2>
          <p className="text-slate-500 text-sm mb-1">
            <span className="font-medium text-slate-700">{form.business_name}</span> has been
            {isSupabaseConfigured ? ' saved to Supabase' : ' saved locally'}.
          </p>
          <p className="text-slate-400 text-xs mb-8">
            Redirecting to your matches in a moment…
          </p>
          <Link
            href={redirectTarget}
            className="inline-flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            View My Matches
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-xs text-slate-400 mt-4">Auto-redirecting in 3 seconds</p>
        </div>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">CM</span>
            </div>
            <span className="font-semibold text-slate-900">Contract Match AI</span>
          </Link>
          <span className="text-sm text-slate-400">Step {step} of 3</span>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-10">
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8">
          {stepLabels.map((label, i) => {
            const n = i + 1
            const done = n < step
            const active = n === step
            return (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div className="flex items-center gap-2 shrink-0">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      done || active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'
                    }`}
                  >
                    {done ? <CheckCircle2 className="w-4 h-4" /> : n}
                  </div>
                  <span
                    className={`text-xs font-medium hidden sm:block ${
                      active ? 'text-indigo-600' : done ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {i < stepLabels.length - 1 && (
                  <div className={`flex-1 h-0.5 rounded-full ${done ? 'bg-indigo-600' : 'bg-slate-200'}`} />
                )}
              </div>
            )
          })}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">

            {/* ── Step 1: Business Info ── */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Tell us about your business</h2>
                  <p className="text-sm text-slate-500 mt-1">This helps us find contracts that match your capabilities.</p>
                </div>

                <Field label="Business Name" error={errors.business_name} required>
                  <input
                    type="text"
                    placeholder="Acme Corp LLC"
                    value={form.business_name}
                    onChange={(e) => set('business_name', e.target.value)}
                    className={inputCls(errors.business_name)}
                  />
                </Field>

                <Field label="Industry" error={errors.industry} required>
                  <select
                    value={form.industry}
                    onChange={(e) => set('industry', e.target.value)}
                    className={inputCls(errors.industry)}
                  >
                    <option value="">Select industry…</option>
                    {INDUSTRIES.map((ind) => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                </Field>

                <Field label="NAICS Codes" hint="Enter 4–6 digit codes one at a time, press Enter or Add">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. 541512"
                      value={naicsInput}
                      onChange={(e) => setNaicsInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNaics() } }}
                      className={inputCls()}
                      maxLength={6}
                    />
                    <button
                      type="button"
                      onClick={addNaics}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors shrink-0"
                    >
                      Add
                    </button>
                  </div>
                  {form.naics_codes.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {form.naics_codes.map((code) => (
                        <span
                          key={code}
                          className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium px-2.5 py-1 rounded-full"
                        >
                          {code}
                          <button
                            type="button"
                            onClick={() => removeNaics(code)}
                            className="hover:text-indigo-900 leading-none"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </Field>

                <Field label="FSC Codes" hint="4-digit Federal Supply Classification codes (DIBBS / DLA contracts)">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. 1615"
                      value={fscInput}
                      onChange={(e) => setFscInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFsc() } }}
                      className={inputCls()}
                      maxLength={4}
                    />
                    <button
                      type="button"
                      onClick={addFsc}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors shrink-0"
                    >
                      Add
                    </button>
                  </div>
                  {form.fsc_codes.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {form.fsc_codes.map((code) => (
                        <span key={code} className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-medium px-2.5 py-1 rounded-full">
                          FSC {code}
                          <button type="button" onClick={() => removeFsc(code)} className="hover:text-amber-900 leading-none">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </Field>

                <Field label="NSN Interest" hint="National Stock Numbers you supply (format: XXXX-XX-XXX-XXXX)">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. 1615-01-430-1290"
                      value={nsnInput}
                      onChange={(e) => setNsnInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNsn() } }}
                      className={inputCls()}
                    />
                    <button
                      type="button"
                      onClick={addNsn}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors shrink-0"
                    >
                      Add
                    </button>
                  </div>
                  {form.nsn_interest.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {form.nsn_interest.map((nsn) => (
                        <span key={nsn} className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-medium px-2.5 py-1 rounded-full">
                          {nsn}
                          <button type="button" onClick={() => removeNsn(nsn)} className="hover:text-amber-900 leading-none">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </Field>

                <Field label="Keywords" hint="Terms that describe your services — used to find matching contracts">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. cybersecurity, rotor, landscaping"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword() } }}
                      className={inputCls()}
                    />
                    <button
                      type="button"
                      onClick={addKeyword}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors shrink-0"
                    >
                      Add
                    </button>
                  </div>
                  {form.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {form.keywords.map((kw) => (
                        <span key={kw} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium px-2.5 py-1 rounded-full">
                          {kw}
                          <button type="button" onClick={() => removeKeyword(kw)} className="hover:text-indigo-900 leading-none">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </Field>

                <Field label="Email Address" error={errors.email} required>
                  <input
                    type="email"
                    placeholder="you@company.com"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    className={inputCls(errors.email)}
                  />
                </Field>
              </div>
            )}

            {/* ── Step 2: Location & Certifications ── */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Location &amp; certifications</h2>
                  <p className="text-sm text-slate-500 mt-1">We use location to match contracts within your reach and certifications to find set-asides.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="City" error={errors.city} required>
                    <input
                      type="text"
                      placeholder="Atlanta"
                      value={form.city}
                      onChange={(e) => set('city', e.target.value)}
                      className={inputCls(errors.city)}
                    />
                  </Field>
                  <Field label="State" error={errors.state} required>
                    <select
                      value={form.state}
                      onChange={(e) => set('state', e.target.value)}
                      className={inputCls(errors.state)}
                    >
                      <option value="">Select…</option>
                      {US_STATES.map((s) => (
                        <option key={s} value={s}>{STATE_NAMES[s]}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field
                  label={`Service Radius — ${form.service_radius} miles`}
                  hint="How far will you travel or deliver for a contract?"
                >
                  <input
                    type="range"
                    min={10}
                    max={500}
                    step={10}
                    value={form.service_radius}
                    onChange={(e) => set('service_radius', Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>10 mi</span>
                    <span>500 mi (Nationwide)</span>
                  </div>
                </Field>

                <Field label="Certifications" hint="Select all that apply">
                  <div className="grid grid-cols-1 gap-2 mt-1">
                    {CERTIFICATIONS.map(({ value, label }) => (
                      <label key={value} className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={form.certifications.includes(value)}
                          onChange={() => toggleCert(value)}
                          className="w-4 h-4 accent-indigo-600 rounded"
                        />
                        <span className="text-sm text-slate-700 group-hover:text-slate-900">
                          <span className="font-medium">{value}</span>
                          {label !== value && (
                            <span className="text-slate-400"> — {label.replace(`${value} — `, '').replace(`(${value})`, '').trim()}</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </Field>
              </div>
            )}

            {/* ── Step 3: Experience & Review ── */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Experience &amp; review</h2>
                  <p className="text-sm text-slate-500 mt-1">Experience factors improve your match scores. Review everything before submitting.</p>
                </div>

                {/* Years in business — number input */}
                <Field label="Years in Business" error={errors.years_in_business} required>
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 5"
                    value={form.years_in_business === 0 && !errors.years_in_business ? '' : form.years_in_business}
                    onChange={(e) => {
                      const v = e.target.value === '' ? 0 : parseInt(e.target.value, 10)
                      set('years_in_business', isNaN(v) ? 0 : v)
                    }}
                    className={inputCls(errors.years_in_business)}
                  />
                </Field>

                {/* Government experience — radio buttons */}
                <Field label="Past Government Contract Experience" error={errors.past_government_experience} required>
                  <div className="flex gap-4 mt-1">
                    {([true, false] as const).map((val) => (
                      <label key={String(val)} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="past_government_experience"
                          value={String(val)}
                          checked={form.past_government_experience === val}
                          onChange={() => set('past_government_experience', val)}
                          className="w-4 h-4 accent-indigo-600"
                        />
                        <span className="text-sm text-slate-700 font-medium">{val ? 'Yes' : 'No'}</span>
                      </label>
                    ))}
                  </div>
                </Field>

                {/* Full review summary */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Profile Review</p>
                  <ReviewRow label="Business Name"   value={form.business_name || '—'} />
                  <ReviewRow label="Industry"         value={form.industry || '—'} />
                  <ReviewRow label="Email"            value={form.email || '—'} />
                  <ReviewRow label="NAICS Codes"      value={form.naics_codes.length ? form.naics_codes.join(', ') : '—'} />
                  <ReviewRow label="FSC Codes"        value={form.fsc_codes.length ? form.fsc_codes.join(', ') : '—'} />
                  <ReviewRow label="NSN Interest"     value={form.nsn_interest.length ? form.nsn_interest.join(', ') : '—'} />
                  <ReviewRow label="Keywords"         value={form.keywords.length ? form.keywords.join(', ') : '—'} />
                  <ReviewRow label="City"             value={form.city || '—'} />
                  <ReviewRow label="State"            value={form.state ? STATE_NAMES[form.state] ?? form.state : '—'} />
                  <ReviewRow label="Service Radius"   value={`${form.service_radius} miles`} />
                  <ReviewRow
                    label="Certifications"
                    value={form.certifications.length ? form.certifications.join(', ') : 'None selected'}
                  />
                  <ReviewRow label="Years in Business" value={form.years_in_business >= 0 ? String(form.years_in_business) : '—'} />
                  <ReviewRow
                    label="Gov. Experience"
                    value={form.past_government_experience ? 'Yes' : 'No'}
                    last
                  />
                </div>

                {submitError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {submitError}
                  </p>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s - 1) as Step)}
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              ) : (
                <div />
              )}

              {step < 3 ? (
                <button
                  type="button"
                  onClick={next}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-2.5 rounded-full text-sm transition-colors"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-full text-sm transition-colors"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Saving profile…' : 'Get My Matches'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────

function inputCls(error?: string) {
  return `w-full px-4 py-2.5 rounded-lg border text-sm transition-colors outline-none focus:ring-2 focus:ring-indigo-500 ${
    error ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white focus:border-indigo-400'
  }`
}

function Field({
  label,
  children,
  error,
  hint,
  required,
}: {
  label: string
  children: React.ReactNode
  error?: string
  hint?: string
  required?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}

function ReviewRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex gap-3 py-2.5 ${last ? '' : 'border-b border-slate-100'}`}>
      <span className="text-slate-400 text-sm w-36 shrink-0">{label}</span>
      <span className="text-slate-800 text-sm font-medium">{value}</span>
    </div>
  )
}
