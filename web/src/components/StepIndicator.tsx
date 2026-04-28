import { Check } from 'lucide-react'
import { cn } from "@/lib/utils"

const STEPS = [
  { key: 'setup', label: 'Cài đặt', number: '1' },
  { key: 'processing', label: 'Xử lý', number: '2' },
  { key: 'review', label: 'Kiểm tra', number: '3' },
  { key: 'result', label: 'Hoàn tất', number: '4' },
] as const

type StepKey = (typeof STEPS)[number]['key']

interface StepIndicatorProps {
  currentStep: StepKey
}

/**
 * Horizontal step indicator for the Create page state machine.
 */
export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  const currentIndex = STEPS.findIndex(s => s.key === currentStep)

  return (
    <div className="flex items-center justify-between w-full max-w-2xl mx-auto">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIndex
        const isActive = i === currentIndex

        return (
          <div key={step.key} className="flex-1 flex items-center last:flex-none">
            <div className="flex flex-col items-center relative group">
              <div
                className={cn(
                  "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300",
                  isCompleted 
                    ? "bg-primary border-primary text-primary-foreground" 
                    : isActive 
                      ? "border-primary text-primary ring-4 ring-primary/10" 
                      : "border-muted text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : <span className="text-sm font-semibold">{step.number}</span>}
              </div>
              <span 
                className={cn(
                  "absolute -bottom-6 text-xs font-medium whitespace-nowrap transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
            
            {i < STEPS.length - 1 && (
              <div className="flex-1 px-2 mb-0">
                <div 
                  className={cn(
                    "h-[2px] w-full transition-colors duration-500",
                    i < currentIndex ? "bg-primary" : "bg-muted"
                  )} 
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
