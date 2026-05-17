import { useState, useRef } from 'react'
import {
  Edit3, RefreshCw, LoaderCircle, Upload
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { showErrorToast } from '@/components/SystemErrorReport'
import type { Scene, VideoProps } from './types'
import { cn } from './constants'

interface SceneMediaSearchProps {
  scene: Scene
  index: number
  jobId: string
  videoProps: VideoProps
  onPropsUpdate: (p: VideoProps) => void
}

/**
 * Media search component for a scene.
 */
export function SceneMediaSearch({ scene, index, jobId, videoProps, onPropsUpdate }: SceneMediaSearchProps) {
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState(scene?.image_query || scene?.video_query || '')
  const [searching, setSearching] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const result = await api.post(`/jobs/${jobId}/scenes/${index}/re-search`, {
        image_query: query,
        video_query: query,
      })
      toast.success(`Đã tìm thấy media mới cho cảnh ${index + 1}`)
      
      const newProps = { ...videoProps }
      const scenes = [...newProps.scenes]
      scenes[index] = {
        ...scenes[index],
        media_url: result.media_url,
        media_type: result.media_type,
        image_query: query,
      }
      onPropsUpdate({ ...newProps, scenes })
      setEditing(false)
    } catch (err: any) {
      showErrorToast(err, {
        source: 'review_scene_media_search',
        jobId,
        fallback: 'Tìm kiếm thất bại',
        prefix: 'Tìm kiếm thất bại',
      })
    } finally {
      setSearching(false)
    }
  }

  const handleFileUpload = async (file: File) => {
    const isVideo = file.type.startsWith('video/')
    const maxSize = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error(`File quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Giới hạn: ${isVideo ? '50' : '5'}MB`)
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const result = await api.upload(
        `/jobs/${jobId}/scenes/${index}/upload-media`,
        formData
      )

      toast.success(`Đã tải lên media cho cảnh ${index + 1}`)

      const newProps = { ...videoProps }
      const scenes = [...newProps.scenes]
      scenes[index] = {
        ...scenes[index],
        media_url: result.preview_url + '?t=' + Date.now(),  // Cache buster for re-uploads
        media_type: result.media_type,
      }
      onPropsUpdate({ ...newProps, scenes })
    } catch (err: any) {
      showErrorToast(err, {
        source: 'review_scene_media_upload',
        jobId,
        fallback: 'Tải lên thất bại',
        prefix: 'Tải lên thất bại',
      })
    } finally {
      setUploading(false)
    }
  }

  // Hidden file input (shared by drag-drop zone and upload button)
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) handleFileUpload(file)
        e.target.value = '' // Reset for re-upload same file
      }}
    />
  )

  if (editing) {
    return (
      <div className="space-y-3 p-4 bg-muted/30 rounded-xl border border-primary/10 animate-in fade-in zoom-in-95 duration-200">
        <Input 
          value={query} 
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nhập từ khóa (tiếng Anh)..."
          className="text-sm bg-background border-white/5 focus-visible:ring-primary/20"
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          autoFocus
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSearch} disabled={searching} className="flex-1 font-bold">
            {searching ? <RefreshCw className="w-3 h-3 animate-spin mr-2" /> : <RefreshCw className="w-3 h-3 mr-2" />}
            Cập nhật
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="px-4">Hủy</Button>
        </div>

        {/* Drag-drop upload zone */}
        {fileInput}
        <div
          className={cn(
            "mt-3 border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer",
            dragOver
              ? "border-primary bg-primary/10 scale-[1.02]"
              : "border-white/10 hover:border-primary/30 hover:bg-muted/30"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) handleFileUpload(file)
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2 py-2">
              <LoaderCircle className="w-4 h-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Đang tải lên...</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Upload className="w-5 h-5 mx-auto text-muted-foreground/60" />
              <p className="text-xs text-muted-foreground">
                Kéo thả hoặc <span className="text-primary font-medium">chọn file</span>
              </p>
              <p className="text-[10px] text-muted-foreground/50">
                Ảnh: JPG, PNG, WebP (≤5MB) • Video: MP4, WebM (≤50MB)
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {fileInput}
      <div className="p-4 bg-muted/40 rounded-xl border border-white/5 group relative hover:bg-muted/60 transition-all cursor-pointer shadow-inner" onClick={() => setEditing(true)}>
        <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground flex items-center justify-between mb-2">
          <span>Từ khóa hiện tại</span>
          <div className="bg-primary/10 text-primary p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
            <Edit3 size={10} />
          </div>
        </div>
        <p className="text-sm font-medium truncate italic text-foreground/80">"{query || 'Chưa có query'}"</p>
      </div>
      
      {/* Upload button toggles drag-drop zone */}
      <Button 
        size="sm" 
        variant={showUpload ? "default" : "outline"}
        className="w-full gap-2 text-xs"
        onClick={(e) => { 
          e.stopPropagation()
          setShowUpload(!showUpload) 
        }}
        disabled={uploading}
      >
        <Upload className="w-3 h-3" />
        {showUpload ? 'Ẩn khu vực tải lên' : 'Tải ảnh/video lên'}
      </Button>

      {/* Drag-drop zone — shown when upload button is toggled */}
      {showUpload && (
        <div
          className={cn(
            "border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer animate-in fade-in slide-in-from-top-2 duration-200",
            dragOver
              ? "border-primary bg-primary/10 scale-[1.02]"
              : "border-white/10 hover:border-primary/30 hover:bg-muted/30"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) handleFileUpload(file)
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2 py-2">
              <LoaderCircle className="w-4 h-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Đang tải lên...</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Upload className="w-5 h-5 mx-auto text-muted-foreground/60" />
              <p className="text-xs text-muted-foreground">
                Kéo thả hoặc <span className="text-primary font-medium">chọn file</span>
              </p>
              <p className="text-[10px] text-muted-foreground/50">
                Ảnh: JPG, PNG, WebP (≤5MB) • Video: MP4, WebM (≤50MB)
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
