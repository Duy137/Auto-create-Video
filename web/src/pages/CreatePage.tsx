import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, getProject, updateProject, type ProjectData } from '@/api/client'
import type { ScriptVariant } from '@/api/sse'
import ProjectStartDialog from '@/components/ProjectStartDialog'
import StepIndicator from '@/components/StepIndicator'
import SetupView from '@/sections/SetupView'
import ProcessingView from '@/sections/ProcessingView'
import ScriptAgentView from '@/sections/ScriptAgentView'
import ReviewView from '@/sections/ReviewView'
import ResultView from '@/sections/ResultView'
import ScriptSelectionView from '@/sections/ScriptSelectionView'

type Step = 'setup' | 'script_agent' | 'processing' | 'script_selection' | 'review' | 'result'
type IndicatorStep = 'setup' | 'processing' | 'review' | 'result'
const INDICATOR_STEP_ORDER: IndicatorStep[] = ['setup', 'processing', 'review', 'result']
const INDICATOR_STEP_ORDER_SKIP: IndicatorStep[] = ['setup', 'processing', 'result']

interface HumanCheckpoint {
  type: string
  question: string
  scripts?: ScriptVariant[]
}

type ProjectStage = 'idea' | 'config' | 'processing' | 'review' | 'rendering' | 'result' | 'failed'

function mapProjectStageToStep(stage?: ProjectStage, hasScriptAgentDraft = false): Step {
  if (stage === 'review') return 'review'
  if (stage === 'result') return 'result'
  if (stage === 'processing' || stage === 'rendering') return 'processing'
  if (stage === 'idea') return hasScriptAgentDraft ? 'script_agent' : 'setup'
  return 'setup'
}

export default function CreatePage() {
  const [step, setStep] = useState<Step>('setup')
  const [jobId, setJobId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [videoProps, setVideoProps] = useState<any>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [settings, setSettings] = useState<any>(null)
  const [skipReview, setSkipReview] = useState(false)
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0)
  const [humanCheckpoint, setHumanCheckpoint] = useState<HumanCheckpoint | null>(null)
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const hasMounted = useRef(false)

  const applyJobStatus = useCallback((resumeJobId: string, job: any) => {
    setSkipReview(Boolean(job.settings?.skip_review))
    const jobStatus: string = job.status

    if (jobStatus === 'done') {
      if (job.props) setVideoProps(job.props)
      setVideoUrl(`/api/jobs/${resumeJobId}/download`)
      setStep('result')
      return
    }

    if (jobStatus === 'review') {
      if (job.props) setVideoProps(job.props)
      setStep('review')
      return
    }

    if (jobStatus === 'needs_human') {
      try {
        const saved = sessionStorage.getItem('create_checkpoint')
        if (saved) {
          setHumanCheckpoint(JSON.parse(saved))
          setStep('script_selection')
        } else {
          setStep('processing')
        }
      } catch {
        setStep('processing')
      }
      return
    }

    if (jobStatus === 'failed') {
      sessionStorage.removeItem('create_resume_state')
      setJobId(null)
      setStep('setup')
      return
    }

    // pending | processing | rendering → ProcessingView + SSE will drive next transition
    setStep('processing')
  }, [])

  const hydrateFromProject = useCallback(async (projectIdToLoad: string) => {
    const project = await getProject(projectIdToLoad)

    setProjectId(project.id)

    const draft = (project.config_draft || {}) as Record<string, any>
    const draftText = typeof draft.text === 'string' ? draft.text : ''
    const draftSettings = draft.settings && typeof draft.settings === 'object'
      ? draft.settings
      : null
    const chosenScript = typeof project.chosen_script === 'string' ? project.chosen_script : ''
    if (draftSettings || draftText || chosenScript) {
      setSettings({
        ...(draftSettings || {}),
        ...(chosenScript || draftText
          ? { prefilled_script: chosenScript || draftText }
          : {}),
      })
    } else {
      setSettings(null)
    }

    const hasScriptAgentDraft = Boolean(
      project.script_agent_draft ||
      project.script_agent_task_id ||
      (Array.isArray(project.script_variants) && project.script_variants.length > 0),
    )
    const mappedStep = mapProjectStageToStep(
      (project.stage as ProjectStage) || 'idea',
      hasScriptAgentDraft,
    )
    const nextMode =
      mappedStep === 'script_agent'
        ? 'script_agent'
        : mappedStep === 'review'
          ? 'review'
          : mappedStep === 'result'
            ? 'result'
            : mappedStep === 'processing'
              ? 'processing'
              : null

    if (project.last_known_props) {
      setVideoProps(project.last_known_props)
    } else {
      setVideoProps(null)
    }

    return {
      project,
      resumeJobId: project.active_job_id || null,
      resumeMode: nextMode,
    }
  }, [videoProps])

  const loadProjectIntoFlow = useCallback(async (
    projectIdToLoad: string,
    options?: {
      resumeJobId?: string | null
      resumeMode?: string | null
    },
  ) => {
    let resumeJobId = options?.resumeJobId ?? null
    let resumeMode = options?.resumeMode ?? null

    setVideoUrl(null)

    const hydrated = await hydrateFromProject(projectIdToLoad)
    if (!resumeJobId) resumeJobId = hydrated.resumeJobId
    if (!resumeMode) resumeMode = hydrated.resumeMode

    if (!resumeJobId && resumeMode === 'script_agent') {
      setJobId(null)
      setStep('script_agent')
      return
    }

    if (!resumeJobId) {
      setJobId(null)
      setStep('setup')
      return
    }

    setJobId(resumeJobId)
    const job = await api.get(`/jobs/${resumeJobId}`)
    if (!projectId && job.project_id) setProjectId(job.project_id)
    applyJobStatus(resumeJobId, job)
  }, [applyJobStatus, hydrateFromProject, projectId])

  // Bootstrap from URL params. A bare /create starts a new video instead of resuming a draft.
  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      let resumeJobId = searchParams.get('job')
      let resumeMode = searchParams.get('mode')
      let resumeProjectId = searchParams.get('project')

      if (resumeProjectId && !resumeMode) {
        // Project is in URL but mode is absent (e.g. navigating from Dashboard).
        // Check sessionStorage for a mode hint so ScriptAgentView is restored.
        try {
          const saved = sessionStorage.getItem('create_resume_state')
          if (saved) {
            const parsed = JSON.parse(saved)
            if (parsed.projectId === resumeProjectId) {
              if (!resumeJobId && parsed.jobId) resumeJobId = parsed.jobId
              if (parsed.mode) resumeMode = parsed.mode
              if (typeof parsed.skipReview === 'boolean') setSkipReview(parsed.skipReview)
            }
          }
        } catch {
          // Ignore.
        }
      }

      if (!resumeProjectId) {
        sessionStorage.removeItem('create_resume_state')
        setProjectDialogOpen(true)
        return
      }

      try {
        await loadProjectIntoFlow(resumeProjectId, {
          resumeJobId,
          resumeMode,
        })
      } catch {
        if (cancelled) return
        sessionStorage.removeItem('create_resume_state')
        setJobId(null)
        setStep('setup')
        setProjectDialogOpen(true)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleProjectSelected = useCallback(async (project: ProjectData) => {
    setProjectDialogOpen(false)
    setShowAbandonConfirm(false)
    setHumanCheckpoint(null)
    setSelectedSceneIndex(0)
    setVideoUrl(null)
    setVideoProps(null)
    setSettings(null)
    setJobId(null)
    setStep('setup')
    setSearchParams({ project: project.id }, { replace: true })

    try {
      await loadProjectIntoFlow(project.id)
    } catch {
      sessionStorage.removeItem('create_resume_state')
      setJobId(null)
      setStep('setup')
    }
  }, [loadProjectIntoFlow, setSearchParams])

  // Sync URL with current step/jobId (skip initial mount to avoid race with resume effect)
  useEffect(() => {
    if (!hasMounted.current) { hasMounted.current = true; return }

    const nextParams = new URLSearchParams()
    if (projectId) nextParams.set('project', projectId)

    if (step === 'setup') {
      setSearchParams(nextParams, { replace: true })
    } else if (step === 'script_agent') {
      nextParams.set('mode', 'script_agent')
      setSearchParams(nextParams, { replace: true })
    } else if (jobId) {
      const modeMap: Partial<Record<Step, string>> = {
        processing: 'processing',
        review: 'review',
        result: 'result',
        script_selection: 'script_selection',
      }
      const mode = modeMap[step]
      if (mode) {
        nextParams.set('job', jobId)
        nextParams.set('mode', mode)
        setSearchParams(nextParams, { replace: true })
      }
    }
  }, [step, jobId, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist humanCheckpoint to sessionStorage for F5 restore on script_selection
  useEffect(() => {
    if (humanCheckpoint) {
      sessionStorage.setItem('create_checkpoint', JSON.stringify(humanCheckpoint))
    } else {
      sessionStorage.removeItem('create_checkpoint')
    }
  }, [humanCheckpoint])

  // Persist resume state so navigation away and back to /create restores the current step
  useEffect(() => {
    if (step === 'setup' && !jobId && !projectId) return
    const modeMap: Partial<Record<Step, string>> = {
      setup: 'setup',
      processing: 'processing',
      review: 'review',
      result: 'result',
      script_selection: 'script_selection',
      script_agent: 'script_agent',
    }
    const mode = modeMap[step]
    if (mode) {
      sessionStorage.setItem('create_resume_state', JSON.stringify({ jobId, projectId, mode, skipReview }))
    }
  }, [step, jobId, projectId, skipReview])

  const handleJobCreated = useCallback((id: string, savedSettings: any) => {
    const startedAtMs = Date.now()
    sessionStorage.setItem(`processing_started_at_${id}`, String(startedAtMs))
    sessionStorage.setItem(`processing_started_at_${id}_create_processing`, String(startedAtMs))
    setJobId(id)
    setSettings(savedSettings)
    setSkipReview(Boolean(savedSettings?.skip_review))
    setStep('processing')
    if (projectId) {
      void updateProject(projectId, {
        stage: 'processing',
        active_job_id: id,
      })
    }
  }, [projectId])

  const handleReviewReady = useCallback((props: any) => {
    setVideoProps(props)
    setStep('review')
    if (projectId) {
      void updateProject(projectId, {
        stage: 'review',
        active_job_id: jobId,
        last_known_props: props,
      })
    }
  }, [projectId, jobId])

  const handleRenderStart = useCallback(() => {
    if (jobId) {
      const startedAtMs = Date.now()
      sessionStorage.setItem(`processing_started_at_${jobId}`, String(startedAtMs))
      sessionStorage.setItem(`processing_started_at_${jobId}_render`, String(startedAtMs))
    }
    setStep('processing')
    if (projectId) {
      void updateProject(projectId, {
        stage: 'rendering',
        active_job_id: jobId,
      })
    }
  }, [projectId, jobId])

  const handleDone = useCallback((url: string) => {
    setVideoUrl(url)
    setStep('result')
    if (projectId) {
      void updateProject(projectId, {
        stage: 'result',
        active_job_id: jobId,
      })
    }
  }, [projectId, jobId])

  const handleBackToSetup = useCallback(() => {
    setStep('setup')
    if (projectId) {
      void updateProject(projectId, {
        stage: 'config',
      })
    }
  }, [projectId])

  const doResetCreate = useCallback(() => {
    if (jobId) {
      sessionStorage.removeItem(`processing_state_${jobId}`)
      sessionStorage.removeItem(`processing_started_at_${jobId}`)
      sessionStorage.removeItem(`processing_started_at_${jobId}_create_processing`)
      sessionStorage.removeItem(`processing_started_at_${jobId}_render`)
    }
    setStep('setup')
    setJobId(null)
    setProjectId(null)
    setVideoProps(null)
    setVideoUrl(null)
    setSettings(null)
    setSkipReview(false)
    setShowAbandonConfirm(false)
    sessionStorage.removeItem('create_setup_draft')
    sessionStorage.removeItem('create_checkpoint')
    sessionStorage.removeItem('create_resume_state')
  }, [jobId])

  const handleCreateAnother = useCallback(() => {
    if (jobId && (step === 'processing' || step === 'review')) {
      setShowAbandonConfirm(true)
    } else {
      setProjectDialogOpen(true)
    }
  }, [jobId, step, doResetCreate])

  const handleCancelAndReset = useCallback(async () => {
    if (jobId) {
      try { await api.delete(`/jobs/${jobId}`) } catch {}
    }
    doResetCreate()
    setProjectDialogOpen(true)
  }, [jobId, doResetCreate])

  const indicatorCurrentStep: IndicatorStep =
    step === 'script_agent' || step === 'script_selection' ? 'setup' : step

  const indicatorStepOrder = skipReview ? INDICATOR_STEP_ORDER_SKIP : INDICATOR_STEP_ORDER

  const handleScriptChosen = useCallback((scriptText: string, _title: string) => {
    // User chose a script — pass it to SetupView via initialSettings.prefilled_script
    setSettings((prev: any) => ({ ...(prev ?? {}), prefilled_script: scriptText }))
    setStep('setup')
    if (projectId) {
      void updateProject(projectId, {
        stage: 'config',
        chosen_script: scriptText,
      })
    }
  }, [projectId])

  const handleNeedsHuman = useCallback((checkpoint: HumanCheckpoint) => {
    setHumanCheckpoint(checkpoint)
    if (checkpoint.type === 'script_selection') {
      setStep('script_selection')
    }
  }, [])

  const handleHumanContinue = useCallback(async (chosenScript?: string) => {
    if (!jobId) return
    try {
      await api.post(`/jobs/${jobId}/continue`, {
        decision_type: humanCheckpoint?.type || 'general',
        chosen_script: chosenScript || null,
        approved: true,
      })
      setHumanCheckpoint(null)
      setStep('processing')
      if (projectId) {
        void updateProject(projectId, {
          stage: 'processing',
          active_job_id: jobId,
          chosen_script: chosenScript || null,
        })
      }
    } catch (e: any) {
      console.error('Continue failed:', e)
    }
  }, [jobId, humanCheckpoint, projectId])

  const handleStepIndicatorClick = useCallback((targetStep: IndicatorStep) => {
    const targetIndex = indicatorStepOrder.indexOf(targetStep)
    const currentIndex = indicatorStepOrder.indexOf(indicatorCurrentStep)
    if (targetIndex < 0 || currentIndex < 0 || targetIndex >= currentIndex) return

    if (targetStep === 'processing' && !jobId) return
    if (targetStep === 'review' && (!jobId || !videoProps)) return
    if (targetStep === 'result' && (!jobId || !videoUrl)) return

    setStep(targetStep)
  }, [indicatorCurrentStep, jobId, videoProps, videoUrl])

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden relative" style={{ background: 'var(--surface-1)' }}>
      <div className="pointer-events-none absolute -top-20 left-1/2 h-56 w-[28rem] -translate-x-1/2 rounded-full blur-3xl opacity-35" style={{ background: 'var(--gradient-glow)' }} />
      {step !== 'review' && (
        <div className="shrink-0 px-6 py-2 border-b" style={{ borderColor: 'var(--border-subtle)', background: 'color-mix(in srgb, var(--surface-0) 82%, transparent)' }}>
          <StepIndicator currentStep={indicatorCurrentStep} onStepClick={handleStepIndicatorClick} skipReview={skipReview} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">


        {step === 'setup' && (
          <div className="h-full overflow-y-auto p-6">
            <SetupView
              onJobCreated={handleJobCreated}
              initialSettings={settings}
              projectId={projectId}
              onOpenScriptAgent={() => {
                if (!projectId) {
                  setProjectDialogOpen(true)
                  return
                }
                void updateProject(projectId, { stage: 'idea' })
                setStep('script_agent')
              }}
            />
          </div>
        )}

        {step === 'script_agent' && (
          <div className="h-full overflow-y-auto p-6 max-w-2xl mx-auto">
            <ScriptAgentView
              projectId={projectId}
              onScriptChosen={handleScriptChosen}
              onCancel={() => setStep('setup')}
            />
          </div>
        )}

        {step === 'script_selection' && humanCheckpoint && (
          <div className="h-full overflow-y-auto p-6 max-w-2xl mx-auto">
            <ScriptSelectionView
              question={humanCheckpoint.question}
              scripts={humanCheckpoint.scripts || []}
              onChoose={handleHumanContinue}
              onCancel={() => setStep('setup')}
            />
          </div>
        )}

        {step === 'processing' && (
          <div className="h-full overflow-y-auto p-6">
            <ProcessingView
              jobId={jobId}
              onReviewReady={handleReviewReady}
              onDone={handleDone}
              onCancel={handleBackToSetup}
              onNeedsHuman={handleNeedsHuman}
              skipReview={skipReview}
            />
          </div>
        )}

        {step === 'review' && jobId && (
          <ReviewView
            jobId={jobId}
            videoProps={videoProps}
            selectedSceneIndex={selectedSceneIndex}
            onSelectScene={setSelectedSceneIndex}
            onRenderStart={handleRenderStart}
            onBackToSetup={handleBackToSetup}
            onPropsUpdate={setVideoProps}
          />
        )}

        {step === 'result' && jobId && (
          <div className="h-full overflow-y-auto p-6">
            <ResultView
              jobId={jobId}
              videoUrl={videoUrl || undefined}
              videoProps={videoProps}
              onCreateAnother={handleCreateAnother}
            />
          </div>
        )}
      </div>

      {showAbandonConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Job đang chạy</h3>
            <p className="text-sm text-zinc-500 mb-6">
              Video đang được xử lý. Bạn muốn làm gì với job hiện tại?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  doResetCreate()
                  setProjectDialogOpen(true)
                }}
                className="w-full px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-sm font-medium transition-colors"
              >
                Tiếp tục chạy trong nền
              </button>
              <button
                onClick={handleCancelAndReset}
                className="w-full px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
              >
                Hủy job và tạo mới
              </button>
              <button
                onClick={() => setShowAbandonConfirm(false)}
                className="w-full px-4 py-2 text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                Quay lại
              </button>
            </div>
          </div>
        </div>
      )}

      <ProjectStartDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        onProjectSelected={handleProjectSelected}
      />
    </div>
  )
}
