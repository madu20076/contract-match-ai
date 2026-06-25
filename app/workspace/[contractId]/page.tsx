'use client'

import { useEffect, useState, useCallback, Suspense, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, BookOpen, CheckCircle2, Circle, Clock, Copy, FileText, MessageSquare,
  RefreshCw, Upload, Trash2, Sparkles, ChevronDown, ChevronUp,
  Target, TrendingUp, AlertCircle, Plus, Save, Building2,
  CheckSquare, LayoutDashboard, FolderOpen,
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import type {
  ProposalWorkspace, ProposalTask, ProposalDocument, ProposalNote,
  ProposalSection, SectionType, Contract,
} from '@/types'

// Evaluated once at module load — avoids calling Date.now() during render
const WORKSPACE_LOAD_TIME = Date.now()

// ── Types ─────────────────────────────────────────────────────

type Tab = 'overview' | 'tasks' | 'documents' | 'notes' | 'sections'

interface WorkspaceData {
  workspace:  ProposalWorkspace
  tasks:      ProposalTask[]
  documents:  ProposalDocument[]
  note:       ProposalNote | null
  contract?:  Contract | null
}

// ── Helpers ───────────────────────────────────────────────────

function daysLeft(due: string): number {
  return Math.ceil((new Date(due).getTime() - WORKSPACE_LOAD_TIME) / 86_400_000)
}

function fmtBytes(n?: number): string {
  if (!n) return ''
  if (n < 1024)        return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── ProgressTracker ───────────────────────────────────────────

function ProgressTracker({ tasks }: { tasks: ProposalTask[] }) {
  const total       = tasks.length
  const done        = tasks.filter(t => t.status === 'done').length
  const inProgress  = tasks.filter(t => t.status === 'in_progress').length
  const pct         = total > 0 ? Math.round((done / total) * 100) : 0

  const sections = Array.from(new Set(tasks.map(t => t.section))).map(sec => ({
    name:  sec,
    total: tasks.filter(t => t.section === sec).length,
    done:  tasks.filter(t => t.section === sec && t.status === 'done').length,
  }))

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-5 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-indigo-500" /> Progress Overview
      </h3>

      {/* Ring + stats */}
      <div className="flex items-center gap-6 mb-6">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" stroke="#e2e8f0" strokeWidth="8" />
            <circle
              cx="40" cy="40" r="32" fill="none"
              stroke={pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#6366f1'}
              strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 32}`}
              strokeDashoffset={`${2 * Math.PI * 32 * (1 - pct / 100)}`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-black text-slate-900">{pct}%</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-600">{done} completed</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="text-slate-600">{inProgress} in progress</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
            <span className="text-slate-600">{total - done - inProgress} remaining</span>
          </div>
        </div>
      </div>

      {/* Section breakdown */}
      <div className="space-y-2.5">
        {sections.map(({ name, total: st, done: sd }) => (
          <div key={name}>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>{name}</span>
              <span className="font-medium">{sd}/{st}</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${st > 0 ? (sd / st) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── ChecklistPanel ────────────────────────────────────────────

function ChecklistPanel({
  tasks, onUpdate,
}: {
  tasks:    ProposalTask[]
  onUpdate: (id: string, status: ProposalTask['status']) => void
}) {
  const high = tasks
    .filter(t => t.priority === 'high' && t.status !== 'done')
    .slice(0, 8)

  if (high.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-emerald-500" /> Priority Checklist
        </h3>
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="w-4 h-4" />
          All high-priority tasks are complete!
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
        <CheckSquare className="w-4 h-4 text-red-500" /> Priority Checklist
        <span className="ml-auto text-xs font-normal text-slate-400">{high.length} high-priority remaining</span>
      </h3>
      <ul className="space-y-2.5">
        {high.map(task => (
          <li key={task.id} className="flex items-start gap-3">
            <button
              onClick={() => onUpdate(task.id, task.status === 'todo' ? 'in_progress' : 'done')}
              className="shrink-0 mt-0.5 text-slate-300 hover:text-indigo-500 transition-colors"
              title="Mark next status"
            >
              <Circle className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-700 leading-snug">{task.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-bold text-red-600 uppercase">HIGH</span>
                {task.section && <span className="text-[10px] text-slate-400">{task.section}</span>}
                {task.due_date && (
                  <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" /> {fmtDate(task.due_date)}
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── AI Chat placeholder ───────────────────────────────────────

function AIChatPlaceholder() {
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-slate-50 border border-indigo-200 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-indigo-500" />
        <h3 className="text-sm font-bold text-indigo-900">AI Proposal Assistant</h3>
        <span className="text-xs bg-indigo-100 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full">Coming soon</span>
      </div>
      <div className="space-y-3 mb-4">
        <div className="flex gap-3">
          <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-700 border border-slate-200 shadow-sm">
            Hello! I can help you draft your technical approach, review compliance requirements, suggest pricing strategies, or answer questions about this solicitation. What would you like to work on?
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <div className="bg-indigo-100 rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-indigo-800 opacity-50">
            How should I structure the technical volume?
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Ask about this proposal..."
          disabled
          className="flex-1 text-sm border border-slate-200 rounded-xl px-4 py-2.5 bg-white text-slate-400 cursor-not-allowed"
        />
        <button
          disabled
          className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl opacity-50 cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ── Single task row ───────────────────────────────────────────

const STATUS_STYLE = {
  todo:        { ring: 'text-slate-300 hover:text-slate-500', bg: 'bg-slate-50 text-slate-600 border-slate-200', icon: Circle },
  in_progress: { ring: 'text-amber-400 hover:text-amber-600', bg: 'bg-amber-50 text-amber-700 border-amber-200', icon: RefreshCw },
  done:        { ring: 'text-emerald-500 hover:text-emerald-700', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
} as const

const PRIORITY_STYLE = {
  high:   'text-red-600 bg-red-50 border-red-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  low:    'text-slate-500 bg-slate-50 border-slate-200',
} as const

const NEXT_STATUS: Record<ProposalTask['status'], ProposalTask['status']> = {
  todo:        'in_progress',
  in_progress: 'done',
  done:        'todo',
}

function TaskRow({
  task, onUpdate,
}: {
  task:     ProposalTask
  onUpdate: (id: string, status: ProposalTask['status']) => void
}) {
  const cfg      = STATUS_STYLE[task.status]
  const StatusIcon = cfg.icon

  return (
    <div className={`flex items-start gap-3 py-3 px-4 rounded-xl transition-colors ${task.status === 'done' ? 'opacity-60' : 'hover:bg-slate-50'}`}>
      <button
        onClick={() => onUpdate(task.id, NEXT_STATUS[task.status])}
        className={`shrink-0 mt-0.5 transition-colors ${cfg.ring}`}
        title="Cycle status"
      >
        <StatusIcon className={`w-4.5 h-4.5 ${task.status === 'in_progress' ? 'animate-spin-slow' : ''}`} style={{ width: 18, height: 18 }} />
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${task.status === 'done' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{task.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${PRIORITY_STYLE[task.priority]}`}>
            {task.priority}
          </span>
          {task.due_date && (
            <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />{fmtDate(task.due_date)}
            </span>
          )}
        </div>
      </div>
      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg.bg}`}>
        {task.status.replace('_', ' ')}
      </span>
    </div>
  )
}

// ── TaskSection ───────────────────────────────────────────────

function TaskSection({
  title, tasks, onUpdate, defaultOpen,
}: {
  title:       string
  tasks:       ProposalTask[]
  onUpdate:    (id: string, status: ProposalTask['status']) => void
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const done  = tasks.filter(t => t.status === 'done').length
  const total = tasks.length

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-900">{title}</span>
          <span className="text-xs text-slate-400 font-normal">{done}/{total} done</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all"
              style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
            />
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-50">
          {tasks.map(task => (
            <TaskRow key={task.id} task={task} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── TaskBoard ─────────────────────────────────────────────────

function TaskBoard({
  tasks, onUpdate,
}: {
  tasks:    ProposalTask[]
  onUpdate: (id: string, status: ProposalTask['status']) => void
}) {
  const sections = Array.from(new Set(tasks.map(t => t.section)))

  if (tasks.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
        No tasks yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {sections.map((sec, i) => (
        <TaskSection
          key={sec}
          title={sec}
          tasks={tasks.filter(t => t.section === sec)}
          onUpdate={onUpdate}
          defaultOpen={i < 2}
        />
      ))}
    </div>
  )
}

// ── DocumentVault ─────────────────────────────────────────────

function DocumentVault({
  documents, workspaceId, onUploaded, onDeleted,
}: {
  documents:  ProposalDocument[]
  workspaceId: string
  onUploaded: (doc: ProposalDocument) => void
  onDeleted:  (docId: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [deleting,  setDeleting]  = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadErr(null)

    const form = new FormData()
    form.append('file', file)

    fetch(`/api/workspace/${workspaceId}/documents`, { method: 'POST', body: form })
      .then(r => r.json())
      .then((data: { document?: ProposalDocument; error?: string }) => {
        if (data.error) { setUploadErr(data.error); return }
        if (data.document) onUploaded(data.document)
        setUploading(false)
      })
      .catch((err: unknown) => {
        setUploadErr(err instanceof Error ? err.message : 'Upload failed')
        setUploading(false)
      })

    if (inputRef.current) inputRef.current.value = ''
  }

  function handleDelete(docId: string) {
    setDeleting(docId)
    fetch(`/api/workspace/${workspaceId}/documents`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ document_id: docId }),
    })
      .then(r => r.json())
      .then(() => {
        onDeleted(docId)
        setDeleting(null)
      })
      .catch(() => setDeleting(null))
  }

  return (
    <div className="space-y-4">
      {/* Upload button */}
      <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
        />
        <Upload className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-600 mb-1">Upload Proposal Document</p>
        <p className="text-xs text-slate-400 mb-4">PDF, Word, Excel, PowerPoint, TXT — up to 50 MB</p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
        >
          {uploading ? (
            <><RefreshCw className="w-4 h-4 animate-spin" /> Uploading…</>
          ) : (
            <><Plus className="w-4 h-4" /> Choose File</>
          )}
        </button>
        {uploadErr && (
          <p className="text-xs text-red-500 mt-2">{uploadErr}</p>
        )}
      </div>

      {/* Document list */}
      {documents.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center gap-4 px-5 py-3.5">
              <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{doc.name}</p>
                <p className="text-xs text-slate-400">
                  {fmtBytes(doc.file_size)}{doc.mime_type ? ` · ${doc.mime_type.split('/').pop()}` : ''} · {fmtDate(doc.created_at)}
                </p>
              </div>
              <button
                onClick={() => handleDelete(doc.id)}
                disabled={deleting === doc.id}
                className="shrink-0 text-slate-300 hover:text-red-400 transition-colors disabled:opacity-40"
                title="Delete document"
              >
                {deleting === doc.id
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />
                }
              </button>
            </div>
          ))}
        </div>
      )}

      {documents.length === 0 && !uploading && (
        <p className="text-center text-sm text-slate-400">No documents yet. Upload your first file above.</p>
      )}
    </div>
  )
}

// ── NotesPanel ────────────────────────────────────────────────
// key prop in parent re-mounts this when the workspace changes, initializing from the prop

function NotesPanel({
  note, workspaceId, onSaved,
}: {
  note:        ProposalNote | null
  workspaceId: string
  onSaved:     (note: ProposalNote) => void
}) {
  const [content, setContent] = useState(note?.content ?? '')
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  function handleSave() {
    setSaving(true)
    setSaved(false)

    fetch(`/api/workspace/${workspaceId}/notes`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ content }),
    })
      .then(r => r.json())
      .then((data: { note?: ProposalNote }) => {
        if (data.note) { onSaved(data.note); setSaved(true) }
        setSaving(false)
      })
      .catch(() => setSaving(false))
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-500" /> Proposal Notes
          </h3>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Write your proposal notes here — strategy decisions, open questions, reviewer feedback, key contacts..."
          className="w-full min-h-80 p-5 text-sm text-slate-700 leading-relaxed placeholder:text-slate-300 border-none outline-none resize-none"
        />
      </div>
      <p className="text-xs text-slate-400 text-center">
        Notes are saved per workspace and private to your profile.
      </p>
    </div>
  )
}

// ── Proposal Sections ─────────────────────────────────────────

const SECTION_TYPES: ReadonlyArray<{ type: SectionType; label: string; description: string }> = [
  { type: 'executive_summary',  label: 'Executive Summary',  description: 'Company overview, value proposition, and proposal summary' },
  { type: 'technical_approach', label: 'Technical Approach', description: 'Methodology, phases, tools, and technical solution details' },
  { type: 'management_plan',    label: 'Management Plan',    description: 'Organizational structure and project management approach' },
  { type: 'staffing_plan',      label: 'Staffing Plan',      description: 'Key personnel, roles, qualifications, and org chart' },
  { type: 'quality_control',    label: 'Quality Control',    description: 'QA/QC processes, performance standards, and metrics' },
  { type: 'past_performance',   label: 'Past Performance',   description: 'Three relevant contract references with quantified outcomes' },
  { type: 'pricing_narrative',  label: 'Pricing Narrative',  description: 'Cost basis, labor rates, and value-for-money explanation' },
  { type: 'cover_letter',       label: 'Cover Letter',       description: 'Formal transmittal letter to the contracting officer' },
  { type: 'compliance_matrix',  label: 'Compliance Matrix',  description: 'Section-by-section RFP requirement compliance checklist' },
]

function SectionTypeButton({
  label, description, isSelected, hasContent, onClick,
}: {
  sectionType:  SectionType
  label:        string
  description:  string
  isSelected:   boolean
  hasContent:   boolean
  onClick:      () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all ${
        isSelected
          ? 'border-indigo-400 bg-indigo-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          hasContent
            ? 'border-emerald-500 bg-emerald-500'
            : isSelected
              ? 'border-indigo-400 bg-indigo-100'
              : 'border-slate-300 bg-white'
        }`}>
          {hasContent && (
            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
              <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-tight ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
            {label}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 leading-snug">{description}</p>
        </div>
      </div>
    </button>
  )
}

function SectionEditor({
  section, workspaceId, onSaved, onRegenerate, regenerating, regenError,
}: {
  section:      ProposalSection
  workspaceId:  string
  onSaved:      (s: ProposalSection) => void
  onRegenerate: () => void
  regenerating: boolean
  regenError:   string | null
}) {
  const [content, setContent] = useState(section.content)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [copied,  setCopied]  = useState(false)

  function handleSave() {
    setSaving(true)
    setSaved(false)
    fetch(`/api/workspace/${workspaceId}/sections`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ section_id: section.id, content }),
    })
      .then(r => r.json())
      .then((data: { section?: ProposalSection; error?: string }) => {
        if (data.section) { onSaved(data.section); setSaved(true) }
        setSaving(false)
      })
      .catch(() => setSaving(false))
  }

  function handleCopy() {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => undefined)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
            section.generated_by === 'template'
              ? 'bg-slate-100 text-slate-500 border-slate-200'
              : 'bg-indigo-50 text-indigo-600 border-indigo-200'
          }`}>
            {section.generated_by === 'template' ? 'Template' : 'AI Generated'}
          </span>
          <span className="text-xs text-slate-400">
            {section.status === 'draft' ? 'Draft' : section.status === 'review' ? 'In Review' : 'Final'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 transition-colors"
          >
            {regenerating
              ? <RefreshCw className="w-3 h-3 animate-spin" />
              : <Sparkles className="w-3 h-3" />
            }
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-colors"
          >
            <Copy className="w-3 h-3" />
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium transition-colors"
          >
            {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
      {regenError && (
        <div className="px-5 py-2.5 bg-red-50 border-b border-red-100">
          <p className="text-xs text-red-600">{regenError}</p>
        </div>
      )}
      {/* Editable content */}
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        className="w-full min-h-[560px] p-5 text-sm text-slate-700 leading-relaxed font-mono resize-none border-none outline-none"
        placeholder="Section content will appear here after generation…"
      />
    </div>
  )
}

function SectionsPanel({
  sections, workspaceId, onGenerated, onSaved,
}: {
  sections:    ProposalSection[]
  workspaceId: string
  onGenerated: (s: ProposalSection) => void
  onSaved:     (s: ProposalSection) => void
}) {
  const [selectedType, setSelectedType] = useState<SectionType | null>(null)
  const [generating,   setGenerating]   = useState(false)
  const [genError,     setGenError]     = useState<string | null>(null)

  const selectedSection = selectedType
    ? sections.find(s => s.section_type === selectedType)
    : undefined

  function handleGenerate(stype: SectionType, refresh: boolean) {
    setGenerating(true)
    setGenError(null)
    fetch(`/api/workspace/${workspaceId}/sections`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ section_type: stype, refresh }),
    })
      .then(r => r.json())
      .then((data: { section?: ProposalSection; error?: string }) => {
        if (data.error) { setGenError(data.error); setGenerating(false); return }
        if (data.section) { onGenerated(data.section) }
        setGenerating(false)
      })
      .catch((err: unknown) => {
        setGenError(err instanceof Error ? err.message : 'Generation failed')
        setGenerating(false)
      })
  }

  const doneSections = sections.length
  const totalTypes   = SECTION_TYPES.length

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-6 items-start">
      {/* Left column — section type buttons */}
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sections</p>
          <span className="text-xs text-slate-400">{doneSections}/{totalTypes} generated</span>
        </div>
        {SECTION_TYPES.map(({ type, label, description }) => (
          <SectionTypeButton
            key={type}
            sectionType={type}
            label={label}
            description={description}
            isSelected={selectedType === type}
            hasContent={sections.some(s => s.section_type === type)}
            onClick={() => { setSelectedType(type); setGenError(null) }}
          />
        ))}
      </div>

      {/* Right column — editor or prompt */}
      <div>
        {!selectedType && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
            <BookOpen className="w-12 h-12 text-indigo-200 mx-auto mb-4" />
            <h3 className="text-base font-bold text-slate-700 mb-2">Select a section to get started</h3>
            <p className="text-sm text-slate-400 max-w-sm mx-auto">
              Click any section on the left to generate AI-written content. Each section can be edited, saved, and regenerated.
            </p>
          </div>
        )}

        {selectedType && !selectedSection && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
            <BookOpen className="w-10 h-10 text-indigo-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800 mb-1">
              {SECTION_TYPES.find(s => s.type === selectedType)?.label}
            </h3>
            <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
              {SECTION_TYPES.find(s => s.type === selectedType)?.description}
            </p>
            {genError && (
              <p className="text-xs text-red-500 mb-4">{genError}</p>
            )}
            <button
              onClick={() => handleGenerate(selectedType, false)}
              disabled={generating}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors"
            >
              {generating
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</>
                : <><Sparkles className="w-4 h-4" /> Generate Section</>
              }
            </button>
            <p className="text-xs text-slate-400 mt-3">
              {process.env.NEXT_PUBLIC_ANTHROPIC_ENABLED === 'true'
                ? 'Powered by Claude AI'
                : 'Using professional template (add Anthropic API key for AI generation)'}
            </p>
          </div>
        )}

        {selectedType && selectedSection && (
          <SectionEditor
            key={`${selectedSection.id}-${selectedSection.updated_at}`}
            section={selectedSection}
            workspaceId={workspaceId}
            onSaved={onSaved}
            onRegenerate={() => handleGenerate(selectedType, true)}
            regenerating={generating}
            regenError={genError}
          />
        )}
      </div>
    </div>
  )
}

// ── WorkspaceHeader ───────────────────────────────────────────

function WorkspaceHeader({
  workspace, contractTitle, contractAgency, dueDate,
  progress, tab, onTabChange,
}: {
  workspace:      ProposalWorkspace
  contractTitle:  string
  contractAgency: string
  dueDate:        string
  progress:       number
  tab:            Tab
  onTabChange:    (t: Tab) => void
}) {
  const days   = daysLeft(dueDate)
  const urgent = days <= 14

  const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'overview',   label: 'Overview',   icon: LayoutDashboard },
    { key: 'tasks',      label: 'Tasks',      icon: CheckSquare     },
    { key: 'documents',  label: 'Documents',  icon: FolderOpen      },
    { key: 'notes',      label: 'Notes',      icon: MessageSquare   },
    { key: 'sections',   label: 'Sections',   icon: BookOpen        },
  ]

  const progressColor =
    progress >= 70 ? '#10b981' : progress >= 40 ? '#f59e0b' : '#6366f1'

  return (
    <div className="bg-white border-b border-slate-200 sticky top-16 z-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Title row */}
        <div className="flex items-start justify-between gap-4 pt-5 pb-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1 flex items-center gap-1.5">
              <Building2 className="w-3 h-3" /> {contractAgency}
            </p>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug line-clamp-2">
              {contractTitle}
            </h1>
          </div>
          <div className="shrink-0 text-right">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${urgent ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
              {days <= 0 ? 'Deadline passed' : `${days}d left`}
            </span>
            <p className="text-[10px] text-slate-400 mt-1">Due {fmtDate(dueDate)}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3 pb-3">
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: progressColor }}
            />
          </div>
          <span className="text-xs font-bold text-slate-600 shrink-0">{progress}%</span>
          <span className="text-[10px] text-slate-400 shrink-0">
            {workspace.status === 'active' ? 'Active' : 'Archived'}
          </span>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Creating state ────────────────────────────────────────────

function CreatingWorkspace() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4 text-slate-500">
      <div className="relative">
        <RefreshCw className="w-10 h-10 animate-spin text-indigo-500" />
        <Sparkles className="w-5 h-5 text-indigo-300 absolute -top-1 -right-1" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-slate-700">Creating your workspace…</p>
        <p className="text-sm mt-1">AI is generating your proposal checklist and timeline.</p>
      </div>
    </div>
  )
}

// ── Main workspace content ────────────────────────────────────

function WorkspaceContent() {
  const { contractId } = useParams<{ contractId: string }>()
  const searchParams   = useSearchParams()

  const profileId =
    searchParams.get('profile') ??
    (typeof window !== 'undefined' ? localStorage.getItem('cmai_profile_id') : null) ??
    'demo'

  const [data,          setData]          = useState<WorkspaceData | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)
  const [tab,           setTab]           = useState<Tab>('overview')
  const [tick,          setTick]          = useState(0)
  const [sections,      setSections]      = useState<ProposalSection[]>([])
  const [sectionsLoaded, setSectionsLoaded] = useState(false)

  // Auto-create or load workspace on mount
  useEffect(() => {
    let cancelled = false

    if (!contractId || profileId === 'demo') {
      Promise.resolve().then(() => { if (!cancelled) setLoading(false) })
      return () => { cancelled = true }
    }

    fetch('/api/workspace', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        contract_id:         contractId,
        business_profile_id: profileId,
      }),
    })
      .then(r => r.json())
      .then((res: {
        workspace?: ProposalWorkspace
        tasks?:     ProposalTask[]
        documents?: ProposalDocument[]
        note?:      ProposalNote | null
        error?:     string
      }) => {
        if (cancelled) return
        if (res.error || !res.workspace) {
          setError(res.error ?? 'Failed to load workspace')
          setLoading(false)
          return
        }
        setData({
          workspace:  res.workspace,
          tasks:      res.tasks      ?? [],
          documents:  res.documents  ?? [],
          note:       res.note       ?? null,
        })
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Network error')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [contractId, profileId, tick])

  // Lazy-load sections when the Sections tab is first opened
  useEffect(() => {
    let cancelled = false
    if (tab !== 'sections' || sectionsLoaded || !data) {
      return () => { cancelled = true }
    }
    fetch(`/api/workspace/${data.workspace.id}/sections`)
      .then(r => r.json())
      .then((res: { sections?: ProposalSection[] }) => {
        if (cancelled) return
        setSections(res.sections ?? [])
        setSectionsLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setSectionsLoaded(true)
      })
    return () => { cancelled = true }
  }, [tab, sectionsLoaded, data])

  const handleSectionGenerated = useCallback((section: ProposalSection) => {
    setSections(prev => {
      const exists = prev.find(s => s.section_type === section.section_type)
      if (exists) return prev.map(s => s.section_type === section.section_type ? section : s)
      return [...prev, section]
    })
  }, [])

  const handleSectionSaved = useCallback((section: ProposalSection) => {
    setSections(prev => prev.map(s => s.id === section.id ? section : s))
  }, [])

  const updateTask = useCallback((taskId: string, status: ProposalTask['status']) => {
    if (!data) return

    fetch(`/api/workspace/${data.workspace.id}/tasks`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ task_id: taskId, status }),
    })
      .then(r => r.json())
      .then((res: { task?: ProposalTask }) => {
        if (res.task) {
          setData(prev => prev
            ? { ...prev, tasks: prev.tasks.map(t => t.id === taskId ? res.task! : t) }
            : prev
          )
        }
      })
      .catch(console.error)
  }, [data])

  const handleUploaded = useCallback((doc: ProposalDocument) => {
    setData(prev => prev ? { ...prev, documents: [doc, ...prev.documents] } : prev)
  }, [])

  const handleDeleted = useCallback((docId: string) => {
    setData(prev => prev ? { ...prev, documents: prev.documents.filter(d => d.id !== docId) } : prev)
  }, [])

  const handleNoteSaved = useCallback((note: ProposalNote) => {
    setData(prev => prev ? { ...prev, note } : prev)
  }, [])

  // ── No profile ───────────────────────────────────────────────

  if (!loading && profileId === 'demo') {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-24 text-center">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-700 mb-2">Profile required</h2>
          <p className="text-slate-500 mb-6 text-sm">
            A business profile is required to create a proposal workspace.
          </p>
          <Link href="/onboarding"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white font-medium px-5 py-2.5 rounded-full text-sm hover:bg-indigo-700 transition-colors">
            Complete Onboarding →
          </Link>
        </div>
      </div>
    )
  }

  // ── Loading ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <CreatingWorkspace />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-24 text-center">
          <AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-700 mb-2">Workspace error</h2>
          <p className="text-slate-500 mb-6 text-sm">{error ?? 'Could not load workspace.'}</p>
          <button
            onClick={() => setTick(t => t + 1)}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white font-medium px-5 py-2.5 rounded-full text-sm hover:bg-indigo-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    )
  }

  const { workspace, tasks, documents, note } = data

  const done     = tasks.filter(t => t.status === 'done').length
  const total    = tasks.length
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  const dueDate       = workspace.contract?.due_date        ?? new Date().toISOString().split('T')[0]
  const contractTitle = workspace.contract?.title            ?? 'Proposal Workspace'
  const agency        = workspace.contract?.agency           ?? ''

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <WorkspaceHeader
        workspace={workspace}
        contractTitle={contractTitle}
        contractAgency={agency}
        dueDate={dueDate}
        progress={progress}
        tab={tab}
        onTabChange={setTab}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Back link */}
        <Link
          href={`/contracts/${contractId}?profile=${profileId}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Contract
        </Link>

        {/* ── Overview tab ── */}
        {tab === 'overview' && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <ProgressTracker tasks={tasks} />
              <ChecklistPanel tasks={tasks} onUpdate={updateTask} />
            </div>
            <div className="space-y-6">
              <AIChatPlaceholder />
              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Tasks', value: total,       icon: Target,     color: 'text-indigo-600' },
                  { label: 'Done',  value: done,        icon: CheckCircle2, color: 'text-emerald-600' },
                  { label: 'Docs',  value: documents.length, icon: FileText, color: 'text-amber-600' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
                    <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
                    <p className="text-xl font-black text-slate-900">{value}</p>
                    <p className="text-xs text-slate-400">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Tasks tab ── */}
        {tab === 'tasks' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900">
                Proposal Checklist
                <span className="ml-2 text-sm font-normal text-slate-400">{done}/{total} complete</span>
              </h2>
              <button
                onClick={() => { setLoading(true); setTick(t => t + 1) }}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
            <TaskBoard tasks={tasks} onUpdate={updateTask} />
          </div>
        )}

        {/* ── Documents tab ── */}
        {tab === 'documents' && (
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-amber-500" />
              Document Vault
              {documents.length > 0 && (
                <span className="text-sm font-normal text-slate-400">{documents.length} file{documents.length !== 1 ? 's' : ''}</span>
              )}
            </h2>
            <DocumentVault
              documents={documents}
              workspaceId={workspace.id}
              onUploaded={handleUploaded}
              onDeleted={handleDeleted}
            />
          </div>
        )}

        {/* ── Notes tab ── */}
        {tab === 'notes' && (
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-6">Notes</h2>
            <NotesPanel
              key={workspace.id}
              note={note}
              workspaceId={workspace.id}
              onSaved={handleNoteSaved}
            />
          </div>
        )}

        {/* ── Sections tab ── */}
        {tab === 'sections' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-500" />
                Proposal Sections
                {sections.length > 0 && (
                  <span className="text-sm font-normal text-slate-400">
                    {sections.length} of {SECTION_TYPES.length} generated
                  </span>
                )}
              </h2>
            </div>
            {!sectionsLoaded ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
              </div>
            ) : (
              <SectionsPanel
                sections={sections}
                workspaceId={workspace.id}
                onGenerated={handleSectionGenerated}
                onSaved={handleSectionSaved}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page export ───────────────────────────────────────────────

export default function WorkspacePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <WorkspaceContent />
    </Suspense>
  )
}
