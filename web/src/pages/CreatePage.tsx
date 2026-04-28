import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import StepIndicator from '@/components/StepIndicator'
import SetupView from '@/sections/SetupView'
import ProcessingView from '@/sections/ProcessingView'
import ReviewView from '@/sections/ReviewView'
import ResultView from '@/sections/ResultView'

type Step = 'setup' | 'processing' | 'review' | 'result'

export default function CreatePage() {
  const [step, setStep] = useState<Step>('setup')
  const [jobId, setJobId] = useState<string | null>(null)
  const [videoProps, setVideoProps] = useState<any>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [settings, setSettings] = useState<any>(null)
  const [searchParams] = useSearchParams()

  // Resume from Dashboard — read URL params
  useEffect(() => {
    const resumeJobId = searchParams.get('job')
    const resumeMode = searchParams.get('mode')
    if (!resumeJobId || !resumeMode) return

    setJobId(resumeJobId)
    if (resumeMode === 'review') {
      api.get(`/jobs/${resumeJobId}`).then((job: any) => {
        if (job.props) {
          setVideoProps(job.props)
          setStep('review')
        }
      }).catch(() => {
        // Job not found or error — stay on setup
      })
    } else if (resumeMode === 'result') {
      setVideoUrl(`/api/jobs/${resumeJobId}/download`)
      setStep('result')
    }
  }, [searchParams])

  const handleJobCreated = useCallback((id: string, savedSettings: any) => {
    setJobId(id)
    setSettings(savedSettings)
    setStep('processing')
  }, [])

  const handleReviewReady = useCallback((props: any) => {
    setVideoProps(props)
    setStep('review')
  }, [])

  const handleRenderStart = useCallback(() => {
    setStep('processing')
  }, [])

  const handleDone = useCallback((url: string) => {
    setVideoUrl(url)
    setStep('result')
  }, [])

  const handleBackToSetup = useCallback(() => {
    setStep('setup')
  }, [])

  const handleCreateAnother = useCallback(() => {
    setStep('setup')
    setJobId(null)
    setVideoProps(null)
    setVideoUrl(null)
    setSettings(null)
  }, [])

  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0)

  return (
    <div className="flex flex-1 flex-col overflow-hidden h-full">
      <div className="shrink-0 px-6 py-4 border-b">
        <StepIndicator currentStep={step} />
      </div>

      <div className="flex-1 overflow-hidden">
        {step === 'setup' && (
          <div className="h-full overflow-y-auto p-6">
            <SetupView
              onJobCreated={handleJobCreated}
              initialSettings={settings}
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
    </div>
  )
}
