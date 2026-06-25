import type { FetchOptions } from './connector'

export interface ScheduledRun {
  slug:        string
  scheduledAt: Date
  options?:    FetchOptions
}

export class ConnectorScheduler {
  private queue: ScheduledRun[] = []

  schedule(slug: string, at: Date, options?: FetchOptions): void {
    this.queue.push({ slug, scheduledAt: at, options })
  }

  scheduleAll(slugs: string[], intervalMs: number, options?: FetchOptions): void {
    const now = Date.now()
    slugs.forEach((slug, i) => {
      this.schedule(slug, new Date(now + i * intervalMs), options)
    })
  }

  getNext(): ScheduledRun | undefined {
    const now = new Date()
    const due = this.queue
      .filter((r) => r.scheduledAt <= now)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
    const next = due[0]
    if (next) this.queue = this.queue.filter((r) => r !== next)
    return next
  }

  getPending(): ScheduledRun[] {
    return [...this.queue].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  }

  clear(): void {
    this.queue = []
  }
}

export const scheduler = new ConnectorScheduler()
