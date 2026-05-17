/**
 * ScriptSelectionView — shown when the agentic pipeline suspends at
 * a "script_selection" human checkpoint.
 *
 * User picks one of the generated variants and clicks Tiếp tục —
 * parent calls /jobs/{id}/continue with the chosen script.
 */

import { useState } from 'react'
import type { ScriptVariant } from '@/api/sse'
import { Clock, Hash, CheckCircle2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Props {
  question: string
  scripts: ScriptVariant[]
  onChoose: (fullScript: string) => void
  onCancel: () => void
}

export default function ScriptSelectionView({ question, scripts, onChoose, onCancel }: Props) {
  const [selected, setSelected] = useState<number>(0)
  const [expanded, setExpanded] = useState<number | null>(0)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-base">Chọn kịch bản</h3>
        <p className="text-sm text-muted-foreground mt-1">{question}</p>
      </div>

      <div className="space-y-3">
        {scripts.map((v, i) => (
          <Card
            key={i}
            onClick={() => setSelected(i)}
            className={cn(
              'cursor-pointer transition-all border-2',
              selected === i ? 'border-primary bg-primary/5' : 'border-transparent hover:border-primary/30',
            )}
          >
            <CardHeader className="py-3 px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  {selected === i
                    ? <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    : <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40 flex-shrink-0 mt-0.5" />}
                  <div>
                    <CardTitle className="text-sm">{v.title || `Phiên bản ${i + 1}`}</CardTitle>
                    <CardDescription className="text-xs mt-0.5 flex items-center gap-2">
                      <Clock className="w-3 h-3" /> ~{v.estimated_duration}s
                      {v.hashtags?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Hash className="w-3 h-3" />
                          {v.hashtags.slice(0, 2).join(' ')}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setExpanded(expanded === i ? null : i) }}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  {expanded === i ? 'Thu gọn' : 'Xem trước'}
                </button>
              </div>
            </CardHeader>

            {expanded === i && (
              <CardContent className="px-4 pb-3 pt-0 space-y-2">
                <p className="text-[10px] uppercase text-muted-foreground">Mở đầu</p>
                <p className="text-xs bg-muted/50 px-2 py-1.5 rounded italic">{v.hook}</p>
                <p className="text-xs text-muted-foreground line-clamp-3">{v.body}</p>
                <p className="text-xs bg-primary/10 px-2 py-1.5 rounded">{v.cta}</p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onCancel} className="flex-1">Hủy</Button>
        <Button
          className="flex-1 gap-2"
          onClick={() => scripts[selected] && onChoose(scripts[selected].full_script)}
        >
          Tiếp tục với bản này <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
