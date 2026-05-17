import { Check } from 'lucide-react'
import { cn } from "@/lib/utils"

const STEPS = [
  { key: 'setup', label: 'Cài đặt', number: '1' },
  { key: 'processing', label: 'Xử lý', number: '2' },
  { key: 'review', label: 'Kiểm tra', number: '3' },
  { key: 'result', label: 'Hoàn tất', number: '4' },
] as const

const STEPS_SKIP_REVIEW = [
  { key: 'setup', label: 'Cài đặt', number: '1' },
  { key: 'processing', label: 'Xử lý', number: '2' },
  { key: 'result', label: 'Hoàn tất', number: '3' },
] as const

type StepKey = (typeof STEPS)[number]['key']

interface StepIndicatorProps {
  currentStep: StepKey
  onStepClick?: (step: StepKey) => void
  skipReview?: boolean
}

/**
 * Horizontal step indicator for the Create page state machine.
 */
export default function StepIndicator({ currentStep, onStepClick, skipReview }: StepIndicatorProps) {
  const activeSteps = skipReview ? STEPS_SKIP_REVIEW : STEPS
  const currentIndex = activeSteps.findIndex(s => s.key === currentStep)

  return (
    <div className="w-full max-w-4xl mx-auto px-1">
      <div
        className="rounded-[var(--radius-lg)] px-3 py-3"
        style={{
          background: 'color-mix(in srgb, var(--surface-0) 85%, transparent)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div className="flex items-center justify-between gap-1 sm:gap-2">
      {activeSteps.map((step, i) => {
        const isCompleted = i < currentIndex
        const isActive = i === currentIndex
        const isClickable = isCompleted && !!onStepClick

        return (
          <div key={step.key} className="flex-1 flex items-center last:flex-none min-w-0">
            {isClickable ? (
              <button
                type="button"
                onClick={() => onStepClick(step.key)}
                aria-label={`Quay lại bước ${step.number}: ${step.label}`}
                className="flex flex-col items-center relative group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <div
                  className={cn(
                    "w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 flex items-center justify-center transition-all duration-300",
                    isCompleted
                      ? "text-primary-foreground"
                      : isActive
                        ? "text-primary ring-4 ring-primary/10"
                        : "border-muted text-muted-foreground"
                  )}
                  style={isCompleted ? { background: 'var(--gradient-brand)', borderColor: 'transparent' } : undefined}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : <span className="text-sm font-semibold">{step.number}</span>}
                </div>
                <span
                  className={cn(
                    "absolute -bottom-6 hidden sm:block text-xs font-medium whitespace-nowrap transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </button>
            ) : (
              <div className="flex flex-col items-center relative group" aria-current={isActive ? 'step' : undefined}>
                <div
                  className={cn(
                    "w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 flex items-center justify-center transition-all duration-300",
                    isCompleted
                      ? "text-primary-foreground"
                      : isActive
                        ? "text-primary ring-4 ring-primary/10"
                        : "border-muted text-muted-foreground"
                  )}
                  style={isCompleted ? { background: 'var(--gradient-brand)', borderColor: 'transparent' } : undefined}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : <span className="text-sm font-semibold">{step.number}</span>}
                </div>
                <span
                  className={cn(
                    "absolute -bottom-6 hidden sm:block text-xs font-medium whitespace-nowrap transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
            )}
            
            {i < activeSteps.length - 1 && (
              <div className="flex-1 px-1 sm:px-2 mb-0">
                <div 
                  className={cn(
                    "h-[2px] w-full transition-colors duration-500",
                    i < currentIndex ? "bg-primary" : "bg-muted"
                  )} 
                  style={i < currentIndex ? { background: 'var(--gradient-brand)' } : undefined}
                />
              </div>
            )}
          </div>
        )
      })}
        </div>

        <div className="mt-3 sm:hidden text-center text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Bước {currentIndex + 1}/{activeSteps.length}: {activeSteps[currentIndex]?.label}
        </div>
      </div>
    </div>
  )
}
