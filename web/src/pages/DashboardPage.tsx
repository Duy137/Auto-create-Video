import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, deleteProject, listProjects, type ProjectData, type ProjectStage } from '@/api/client'
import { toast } from 'sonner'
import { useJobNotifications } from '@/hooks/useJobNotifications'
import ProjectStartDialog from '@/components/ProjectStartDialog'
import {
  Plus, Clock, Film, CheckCircle2,
  AlertCircle, Loader2, Trash2,
} from 'lucide-react'

/* ============================================================
   DashboardPage - design moi (vibrant) + giu logic API that
   ============================================================ */

const STATUS_MAP: Record<string, { label: string; pill: string; icon: any; spin?: boolean }> = {
  done: { label: 'Hoàn thành', pill: 'pill-success', icon: CheckCircle2 },
  processing: { label: 'Đang xử lý', pill: 'pill-processing', icon: Loader2, spin: true },
  rendering: { label: 'Đang render', pill: 'pill-warning', icon: Loader2, spin: true },
  review: { label: 'Chờ duyệt', pill: 'pill-brand', icon: Clock },
  pending: { label: 'Đang chờ', pill: '', icon: Clock },
  failed: { label: 'Lỗi', pill: 'pill-danger', icon: AlertCircle },
}

const PROJECT_STAGE_MAP: Record<ProjectStage, { label: string; pill: string; helper: string }> = {
  idea: {
    label: 'Lên ý tưởng',
    pill: 'pill-idea',
    helper: 'Bạn có thể tiếp tục tạo kịch bản từ chủ đề.',
  },
  config: {
    label: 'Cấu hình',
    pill: 'pill-warning',
    helper: 'Dự án đang chờ hoàn thiện nội dung và thiết lập.',
  },
  processing: {
    label: 'Đang xử lý',
    pill: 'pill-processing',
    helper: 'Pipeline đang tạo nội dung cho dự án này.',
  },
  review: {
    label: 'Chờ duyệt',
    pill: 'pill-brand',
    helper: 'Dự án đã sẵn sàng để bạn rà soát scene.',
  },
  rendering: {
    label: 'Đang xử lý',
    pill: 'pill-processing',
    helper: 'Video đang được kết xuất.',
  },
  result: {
    label: 'Hoàn tất',
    pill: 'pill-success',
    helper: 'Dự án đã có kết quả cuối cùng.',
  },
  failed: {
    label: 'Lỗi',
    pill: 'pill-danger',
    helper: 'Dự án gặp lỗi. Bạn có thể mở lại để chỉnh sửa.',
  },
}

const PROJECT_FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'idea', label: 'Lên ý tưởng' },
  { key: 'config', label: 'Cấu hình' },
  { key: 'result', label: 'Hoàn thành' },
  { key: 'active', label: 'Đang xử lý' },
  { key: 'review', label: 'Chờ duyệt' },
  { key: 'failed', label: 'Lỗi' },
] as const

type ProjectFilterKey = typeof PROJECT_FILTERS[number]['key']

const PROJECT_FILTER_STAGE_MAP: Record<ProjectFilterKey, ProjectStage[]> = {
  all: [],
  idea: ['idea'],
  config: ['config'],
  result: ['result'],
  active: ['processing', 'rendering'],
  review: ['review'],
  failed: ['failed'],
}

type DashboardJobStatus = 'done' | 'processing' | 'rendering' | 'review' | 'failed'

type DashboardJob = {
  id: string
  status: string
  project_id?: string | null
  input_text?: string | null
  props?: { title?: string } | null
  created_at: string
  completed_at?: string | null
}

type ProjectListItem =
  | {
      kind: 'project'
      key: string
      sortAt: string
      stage: ProjectStage
      project: ProjectData
    }
  | {
      kind: 'legacy-job'
      key: string
      sortAt: string
      stage: ProjectStage
      job: DashboardJob
    }

const FILTER_JOB_STATUS_MAP: Partial<Record<ProjectFilterKey, DashboardJobStatus[]>> = {
  all: ['done', 'processing', 'rendering', 'review', 'failed'],
  result: ['done'],
  active: ['processing', 'rendering'],
  review: ['review'],
  failed: ['failed'],
}

const JOB_STATUS_TO_PROJECT_STAGE: Record<DashboardJobStatus, ProjectStage> = {
  done: 'result',
  processing: 'processing',
  rendering: 'rendering',
  review: 'review',
  failed: 'failed',
}

const PROJECTS_PER_PAGE = 12

function getProjectTitle(project: ProjectData): string {
  const aiTitle = (project.script_variants as Array<{ title?: string }> | null | undefined)?.[0]?.title
  const propsTitle = (project.last_known_props as any)?.title as string | undefined
  return (
    propsTitle ||
    project.title ||
    aiTitle ||
    project.config_draft?.text?.slice(0, 80) ||
    '(Chưa đặt tên)'
  )
}

function getLegacyJobTitle(job: DashboardJob): string {
  return job.props?.title || job.input_text?.slice(0, 80) || '(Video cũ chưa gắn dự án)'
}

/* ============================================================ */
export default function DashboardPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [projectItems, setProjectItems] = useState<ProjectListItem[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectTotal, setProjectTotal] = useState(0)
  const [projectFilter, setProjectFilter] = useState<ProjectFilterKey>('all')
  const [projectPage, setProjectPage] = useState(1)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [deletingItemKey, setDeletingItemKey] = useState<string | null>(null)
  const navigate = useNavigate()

  const openProjectDialog = () => {
    setProjectDialogOpen(true)
  }

  const handleProjectSelected = (project: { id: string }) => {
    navigate(`/create?project=${encodeURIComponent(project.id)}`)
  }

  const openProject = (project: ProjectData) => {
    navigate(`/create?project=${encodeURIComponent(project.id)}`)
  }

  const fetchAllProjectsByStages = useCallback(async (stages: ProjectStage[]) => {
    const perPage = 100
    let page = 1
    let totalCount = 0
    const allProjects: ProjectData[] = []

    while (true) {
      const data = await listProjects(page, perPage, {
        stages: stages.length > 0 ? stages : undefined,
      })
      if (page === 1) {
        totalCount = data.total || 0
      }
      const chunk = data.projects || []
      allProjects.push(...chunk)

      if (allProjects.length >= totalCount || chunk.length === 0) {
        break
      }
      page += 1
    }

    return allProjects
  }, [])

  const fetchAllOrphanJobsByStatuses = useCallback(async (statuses: DashboardJobStatus[]) => {
    const perPage = 100
    const allJobs: DashboardJob[] = []

    for (const status of statuses) {
      let page = 1

      while (true) {
        const data = await api.get<{
          jobs: DashboardJob[]
          total: number
          page: number
          per_page: number
        }>(`/jobs?page=${page}&per_page=${perPage}&status=${encodeURIComponent(status)}`)

        const chunk = data.jobs || []
        allJobs.push(...chunk.filter((job) => !job.project_id))

        if (page * perPage >= (data.total || 0) || chunk.length === 0) {
          break
        }
        page += 1
      }
    }

    return allJobs
  }, [])

  const fetchProjects = useCallback(async () => {
    setProjectsLoading(true)
    try {
      const stages = PROJECT_FILTER_STAGE_MAP[projectFilter]
      const legacyStatuses = FILTER_JOB_STATUS_MAP[projectFilter] || []

      if (legacyStatuses.length > 0) {
        const [allProjects, orphanJobs] = await Promise.all([
          fetchAllProjectsByStages(stages),
          fetchAllOrphanJobsByStatuses(legacyStatuses),
        ])

        const projectEntries: ProjectListItem[] = allProjects.map((project) => ({
          kind: 'project',
          key: `project:${project.id}`,
          sortAt: project.updated_at,
          stage: project.stage,
          project,
        }))

        const legacyEntries: ProjectListItem[] = orphanJobs
          .map((job) => {
            const mappedStage = JOB_STATUS_TO_PROJECT_STAGE[job.status as DashboardJobStatus]
            if (!mappedStage) {
              return null
            }

            return {
              kind: 'legacy-job' as const,
              key: `job:${job.id}`,
              sortAt: job.completed_at || job.created_at,
              stage: mappedStage,
              job,
            }
          })
          .filter((entry): entry is Extract<ProjectListItem, { kind: 'legacy-job' }> => entry !== null)

        const merged = [...projectEntries, ...legacyEntries].sort((a, b) => {
          return new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime()
        })

        const pageStart = (projectPage - 1) * PROJECTS_PER_PAGE
        const pageEnd = pageStart + PROJECTS_PER_PAGE

        setProjectItems(merged.slice(pageStart, pageEnd))
        setProjectTotal(merged.length)
      } else {
        const data = await listProjects(projectPage, PROJECTS_PER_PAGE, {
          stages: stages.length > 0 ? stages : undefined,
        })
        setProjectItems(
          (data.projects || []).map((project) => ({
            kind: 'project',
            key: `project:${project.id}`,
            sortAt: project.updated_at,
            stage: project.stage,
            project,
          })),
        )
        setProjectTotal(data.total || 0)
      }
    } catch {
      toast.error('Không thể tải danh sách dự án')
    } finally {
      setProjectsLoading(false)
    }
  }, [projectFilter, projectPage, fetchAllOrphanJobsByStatuses, fetchAllProjectsByStages])

  const fetchJobs = useCallback(async () => {
    try {
      const data = await api.get('/jobs?page=1&per_page=12')
      setJobs(data.jobs || [])
      setTotal(data.total || 0)
    } catch {
      toast.error('Không thể tải danh sách video')
    }
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useJobNotifications((event) => {
    fetchJobs()
    fetchProjects()
    if (event.event === 'job_done') {
      toast.success(`Video "${event.title || 'của bạn'}" đã hoàn thành!`)
    } else if (event.event === 'job_review_ready') {
      toast.info(`Video "${event.title || 'của bạn'}" sẵn sàng để xem xét.`)
    }
  })

  const openJob = (job: any) => {
    const params = new URLSearchParams()
    if (job.project_id) params.set('project', String(job.project_id))
    if (job.id) params.set('job', String(job.id))

    if (job.status === 'review') {
      params.set('mode', 'review')
      navigate(`/create?${params.toString()}`)
    } else if (job.status === 'done') {
      navigate(`/result/${job.id}`)
    } else {
      params.set('mode', 'processing')
      navigate(`/create?${params.toString()}`)
    }
  }

  const handleDeleteItem = useCallback(async (item: ProjectListItem) => {
    if (deletingItemKey) return

    const isProject = item.kind === 'project'
    const confirmMessage = isProject
      ? 'Bạn có chắc chắn muốn xoá dự án này? Tất cả video thuộc dự án cũng sẽ bị xoá.'
      : 'Bạn có chắc chắn muốn xoá video này?'

    if (!window.confirm(confirmMessage)) return

    setDeletingItemKey(item.key)
    try {
      if (isProject) {
        await deleteProject(item.project.id)
        toast.success('Đã xoá dự án')
      } else {
        await api.delete(`/jobs/${item.job.id}`)
        toast.success('Đã xoá video')
      }

      await Promise.all([fetchProjects(), fetchJobs()])
    } catch {
      toast.error(isProject ? 'Không thể xoá dự án' : 'Không thể xoá video')
    } finally {
      setDeletingItemKey(null)
    }
  }, [deletingItemKey, fetchJobs, fetchProjects])

  const projectTotalPages = Math.ceil(projectTotal / PROJECTS_PER_PAGE)
  const activeFilterLabel = PROJECT_FILTERS.find((f) => f.key === projectFilter)?.label || 'đã chọn'
  const doneCount = jobs.filter((j) => j.status === 'done').length
  const activeCount = jobs.filter((j) => ['processing', 'rendering'].includes(j.status)).length
  const reviewCount = jobs.filter((j) => j.status === 'review').length
  const activeJob = jobs.find((j) => ['processing', 'rendering', 'review'].includes(j.status))

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            Bảng điều khiển
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Quản lý và theo dõi tất cả video bạn đã tạo.
          </p>
        </div>
        <button onClick={openProjectDialog} className="btn-brand">
          <Plus size={16} /> Tạo video mới
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng video" value={total.toString()} icon={Film} color="var(--brand-500)" />
        <StatCard label="Hoàn thành" value={doneCount.toString()} icon={CheckCircle2} color="var(--status-success)" />
        <StatCard
          label="Đang xử lý"
          value={activeCount.toString()}
          icon={Loader2}
          color="var(--status-warning)"
          live={activeCount > 0}
        />
        <StatCard label="Chờ duyệt" value={reviewCount.toString()} icon={Clock} color="var(--brand-500)" />
      </div>

      {/* Active job banner */}
      {activeJob ? (
        <div
          className="rounded-[var(--radius-lg)] p-4 flex items-center gap-3 text-white"
          style={{ background: 'var(--gradient-aurora)' }}
        >
          <div className="grid h-10 w-10 place-items-center rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }}>
            {(() => {
              const CfgIcon = (STATUS_MAP[activeJob.status] || STATUS_MAP.pending).icon
              const spin = Boolean((STATUS_MAP[activeJob.status] || STATUS_MAP.pending).spin)
              return <CfgIcon size={18} className={spin ? 'animate-spin' : ''} />
            })()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase opacity-90 font-semibold tracking-wider">
              {(STATUS_MAP[activeJob.status] || STATUS_MAP.pending).label}
            </div>
            <div className="font-semibold truncate">
              {activeJob.props?.title || activeJob.input_text?.slice(0, 50) || 'Video đang xử lý'}
            </div>
          </div>
          <button
            onClick={() => openJob(activeJob)}
            className="px-4 py-2 rounded-[var(--radius-md)] font-semibold whitespace-nowrap"
            style={{ background: '#fff', color: 'var(--brand-700)' }}
          >
            Tiếp tục
          </button>
        </div>
      ) : null}

      {/* Projects section */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Dự án của tôi</h2>
        </div>

        <div className="flex gap-1 text-xs flex-wrap mb-4">
          {PROJECT_FILTERS.map((f) => {
            const active = projectFilter === f.key
            return (
              <button
                key={f.key}
                onClick={() => {
                  setProjectFilter(f.key)
                  setProjectPage(1)
                }}
                className="px-3 py-1.5 rounded-[var(--radius-pill)] font-medium transition"
                style={{
                  background: active ? 'var(--brand-500)' : 'var(--surface-2)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {projectsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="surface-card p-4 space-y-2">
                <div className="h-5 w-24 rounded shimmer" />
                <div className="h-4 w-4/5 rounded shimmer" />
                <div className="h-3 w-3/5 rounded shimmer" />
              </div>
            ))}
          </div>
        ) : projectItems.length === 0 ? (
          <div className="surface-card p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {projectFilter === 'all'
              ? 'Chưa có dự án nào. Hãy tạo dự án đầu tiên để bắt đầu.'
              : `Không có dự án nào ở trạng thái ${activeFilterLabel}.`}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projectItems.map((item) => {
              const stageCfg = PROJECT_STAGE_MAP[item.stage] || PROJECT_STAGE_MAP.config
              const title = item.kind === 'project' ? getProjectTitle(item.project) : getLegacyJobTitle(item.job)
              const updatedAt = new Date(item.sortAt).toLocaleString('vi-VN')
              const itemId = item.kind === 'project' ? item.project.id : item.job.id
              const openItem = () => {
                if (item.kind === 'project') {
                  openProject(item.project)
                } else {
                  openJob(item.job)
                }
              }

              return (
                <article
                  key={item.key}
                  onClick={openItem}
                  className="surface-card p-4 cursor-pointer transition hover:shadow-[var(--shadow-md)]"
                >
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <span className={`pill ${stageCfg.pill}`}>{stageCfg.label}</span>
                      <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                        {updatedAt}
                      </span>
                    </div>

                    <h3 className="mt-3 font-semibold text-sm leading-snug line-clamp-2 min-h-[2.6em]" title={title}>
                      {title}
                    </h3>

                    <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {stageCfg.helper}
                    </p>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[11px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                        #{itemId}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleDeleteItem(item)
                          }}
                          disabled={deletingItemKey === item.key}
                          className="p-1.5 rounded-[var(--radius-md)] disabled:opacity-50"
                          style={{ background: 'var(--surface-2)', color: 'var(--status-danger)' }}
                          title={item.kind === 'project' ? 'Xoá dự án' : 'Xoá video'}
                        >
                          {deletingItemKey === item.key ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openItem()
                          }}
                          disabled={deletingItemKey === item.key}
                          className="px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium disabled:opacity-50"
                          style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}
                        >
                          {item.kind === 'project' ? 'Mở dự án' : 'Mở video'}
                        </button>
                      </div>
                    </div>
                  </>
                </article>
              )
            })}
          </div>
        )}

        {projectTotalPages > 1 ? (
          <div className="flex items-center justify-center gap-4 pt-6">
            <button
              disabled={projectPage <= 1}
              onClick={() => setProjectPage((p) => p - 1)}
              className="px-4 py-2 rounded-[var(--radius-md)] border text-sm font-medium disabled:opacity-50"
              style={{ borderColor: 'var(--border-default)' }}
            >
              ← Trước
            </button>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Trang {projectPage} / {projectTotalPages}
            </span>
            <button
              disabled={projectPage >= projectTotalPages}
              onClick={() => setProjectPage((p) => p + 1)}
              className="px-4 py-2 rounded-[var(--radius-md)] border text-sm font-medium disabled:opacity-50"
              style={{ borderColor: 'var(--border-default)' }}
            >
              Sau →
            </button>
          </div>
        ) : null}
      </section>

      <ProjectStartDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        onProjectSelected={handleProjectSelected}
      />
    </div>
  )
}

/* ---------------- Stat card ---------------- */
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  live,
}: {
  label: string
  value: string
  icon: any
  color: string
  live?: boolean
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
        <Icon size={16} style={{ color }} className={live ? 'animate-spin' : ''} />
      </div>
      <div className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>{value}</div>
      {live ? (
        <div className="text-xs mt-1" style={{ color: 'var(--status-warning)' }}>
          <span className="pulse-dot mr-1.5" /> đang chạy
        </div>
      ) : null}
    </div>
  )
}

