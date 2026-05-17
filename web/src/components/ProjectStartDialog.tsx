import { useEffect, useState } from 'react'
import { FolderPlus } from 'lucide-react'

import { createProject, type ProjectData } from '@/api/client'
import { showErrorToast } from '@/components/SystemErrorReport'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ProjectStartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onProjectSelected: (project: ProjectData) => void
}

export default function ProjectStartDialog({
  open,
  onOpenChange,
  onProjectSelected,
}: ProjectStartDialogProps) {
  const [title, setTitle] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (!open) {
      setTitle('')
    }
  }, [open])

  const handleConfirmCreate = async () => {
    if (isCreating) return
    setIsCreating(true)
    try {
      const created = await createProject({
        title: title.trim() || null,
        stage: 'config',
      })
      onProjectSelected(created)
      onOpenChange(false)
      setTitle('')
    } catch (err: any) {
      showErrorToast(err, {
        source: 'project_create',
        fallback: 'Không thể tạo dự án mới',
        prefix: 'Không thể tạo dự án mới',
      })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md surface-card border-0 bg-[color:var(--surface-0)]/95 p-0 backdrop-blur-md shadow-[var(--shadow-xl)]">
        <div className="p-6 sm:p-7 space-y-6">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="flex items-center gap-2.5 text-[1.125rem] tracking-[0.01em]">
              <FolderPlus className="w-4.5 h-4.5 text-[color:var(--brand-600)]" />
              Tạo video mới
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Đặt tên để bạn dễ tìm lại video sau này.
            </DialogDescription>
          </DialogHeader>

          <section
            className="space-y-3 rounded-[var(--radius-md)] border p-4 sm:p-5"
            style={{
              borderColor: 'var(--border-subtle)',
              background: 'color-mix(in srgb, var(--surface-0) 88%, var(--surface-1))',
            }}
          >
            <div className="space-y-1.5">
              <label className="text-sm font-semibold tracking-[0.01em]">Tên video</label>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Bạn có thể để trống và đặt tên sau.
              </p>
            </div>

            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Video về AI cho người mới"
              className="h-11"
              autoFocus
            />
          </section>

          <DialogFooter
            className="pt-4 border-t"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
              style={{ color: 'var(--text-secondary)' }}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleConfirmCreate}
              disabled={isCreating}
              className="btn-brand"
            >
              {isCreating ? 'Đang tạo...' : 'Xác nhận'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
