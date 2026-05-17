import { useEffect, useMemo, useState } from 'react'
import { WandSparkles, LayoutTemplate, ArrowRight, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { getTemplates, type TemplateData } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface TemplatePickerProps {
  onSelect: (template: TemplateData) => void
  onSkip: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  general: 'Chung',
  news: 'Tin tức',
  marketing: 'Tiếp thị',
  education: 'Giáo dục',
  storytelling: 'Kể chuyện',
  review: 'Đánh giá',
  tutorial: 'Hướng dẫn',
  business: 'Kinh doanh',
  entertainment: 'Giải trí',
}

function translateCategory(key: string): string {
  return CATEGORY_LABELS[key] || key
}

export default function TemplatePicker({ onSelect, onSkip }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<TemplateData[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const data = await getTemplates()
      setTemplates(data.templates || [])
    } catch {
      toast.error('Không thể tải danh sách mẫu')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, TemplateData[]>()
    for (const item of templates) {
      const key = item.category || 'general'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return Array.from(map.entries())
  }, [templates])

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <Card className="border-primary/15 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-primary" /> Chọn mẫu
          </CardTitle>
          <CardDescription>
            Chọn một preset để nạp sẵn cấu hình render, phụ đề và tốc độ giọng đọc.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={fetchTemplates} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
          </Button>
          <Button variant="secondary" onClick={onSkip}>
            Bỏ qua, tự cấu hình thủ công <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Card key={idx}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-9 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground space-y-2">
            <WandSparkles className="mx-auto h-8 w-8" />
            <p>Chưa có mẫu nào trong hệ thống.</p>
            <Button variant="outline" onClick={onSkip}>Tiếp tục với cấu hình thủ công</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, items]) => (
            <section key={category} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="uppercase tracking-wide">{translateCategory(category)}</Badge>
                <span className="text-sm text-muted-foreground">{items.length} mẫu</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((template) => (
                  <Card key={template.id} className="border-primary/10 bg-card/60">
                    <CardHeader className="space-y-2 pb-2">
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <CardDescription className="line-clamp-3 min-h-[60px]">
                        {template.description || 'Bộ cấu hình giúp khởi tạo nhanh.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-xs text-muted-foreground">
                        Tỉ lệ: <strong>{template.settings?.aspect_ratio || '9:16'}</strong>
                      </div>
                      <Button className="w-full" onClick={() => onSelect(template)}>
                        Dùng mẫu
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
