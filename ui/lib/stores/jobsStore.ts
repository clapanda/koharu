'use client'

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import type { JobSummary, JobWarningEvent, PipelineProgress } from '@/lib/api/schemas'

const MAX_RETAINED_FINISHED_JOBS = 50

/**
 * Live job registry, fed by SSE. Keyed by id. `progress` is attached when
 * the backend streams `JobProgress` for a running pipeline job. `warnings`
 * accumulates non-fatal step failures as they arrive; the pipeline keeps
 * running past them.
 */
export type JobEntry = JobSummary & {
  progress?: PipelineProgress
  warnings?: JobWarningEvent[]
}

type JobsState = {
  jobs: Record<string, JobEntry>
  setSnapshot: (jobs: JobSummary[]) => void
  started: (id: string, kind: string) => void
  progress: (p: PipelineProgress) => void
  warning: (w: JobWarningEvent) => void
  finished: (id: string, status: JobSummary['status'], error: string | null | undefined) => void
  clear: () => void
  byStatus: (status: JobSummary['status']) => JobEntry[]
}

export const useJobsStore = create<JobsState>()(
  immer((set, get) => ({
    jobs: {},
    setSnapshot: (jobs) =>
      set((s) => {
        s.jobs = {}
        for (const j of jobs) s.jobs[j.id] = j
        pruneFinishedJobs(s.jobs)
      }),
    started: (id, kind) =>
      set((s) => {
        s.jobs[id] = { id, kind, status: 'running' }
      }),
    progress: (p) =>
      set((s) => {
        const existing = s.jobs[p.jobId] ?? {
          id: p.jobId,
          kind: 'pipeline',
          status: 'running' as JobSummary['status'],
        }
        s.jobs[p.jobId] = { ...existing, progress: p }
      }),
    warning: (w) =>
      set((s) => {
        const existing = s.jobs[w.jobId] ?? {
          id: w.jobId,
          kind: 'pipeline',
          status: 'running' as JobSummary['status'],
        }
        const warnings = existing.warnings ?? []
        s.jobs[w.jobId] = { ...existing, warnings: [...warnings, w] }
      }),
    finished: (id, status, error) =>
      set((s) => {
        const existing = s.jobs[id] ?? { id, kind: 'pipeline', status }
        s.jobs[id] = {
          ...existing,
          status,
          error: error ?? null,
        }
        pruneFinishedJobs(s.jobs)
      }),
    clear: () =>
      set((s) => {
        s.jobs = {}
      }),
    byStatus: (status) => Object.values(get().jobs).filter((j) => j.status === status),
  })),
)

function pruneFinishedJobs(jobs: Record<string, JobEntry>): void {
  const finishedIds = Object.keys(jobs).filter((id) => jobs[id]?.status !== 'running')
  const excess = finishedIds.length - MAX_RETAINED_FINISHED_JOBS
  if (excess <= 0) return
  for (const id of finishedIds.slice(0, excess)) delete jobs[id]
}
