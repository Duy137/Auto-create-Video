import { useCallback, useEffect, useRef, useState } from 'react'
import { api, getBgmLibrary, type BgmTrack, updateProject } from '@/api/client'
import { toast } from "sonner"
import {
  Zap, Clapperboard, Play, Volume2, Music, Type,
  Palette, Settings2, Upload, X
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { showErrorToast } from '@/components/SystemErrorReport'

const DEFAULT_SETTINGS = {
  aspect_ratio: '9:16',
  tts_engine: 'openai',
  voice: 'nova',
  speech_rate: 1.0,
  speech_volume: 1.0,
  transition_mode: 'crossfade',
  bgm_mode: 'none',
  bgm_library_id: null,
  bgm_url: null,
  bgm_volume: 0.2,
  subtitle_enabled: true,
  subtitle_font: 'NotoSansVN-Bold',
  subtitle_font_size: 48,
  subtitle_font_color: '#FFFFFF',
  subtitle_stroke_color: '#000000',
  subtitle_stroke_width: 2.0,
  subtitle_position: 'bottom',
  subtitle_highlight_color: '#FF6B35',
  subtitle_preset: 'default',
  elevenlabs_model: 'eleven_v3',
  elevenlabs_custom_voice: '',
  gemini_model: 'gemini-3.1-flash-tts-preview',
}
const DEFAULT_SETTINGS_SERIALIZED = JSON.stringify(DEFAULT_SETTINGS)

const VOICE_OPTIONS: Record<string, {id: string, label: string}[]> = {
  openai: [
    {id: 'alloy', label: 'Alloy'}, {id: 'ash', label: 'Ash'},
    {id: 'cedar', label: 'Cedar'}, {id: 'coral', label: 'Coral'},
    {id: 'echo', label: 'Echo'}, {id: 'fable', label: 'Fable'},
    {id: 'nova', label: 'Nova'}, {id: 'onyx', label: 'Onyx'},
    {id: 'sage', label: 'Sage'}, {id: 'shimmer', label: 'Shimmer'},
  ],
  'edge-tts': [
    {id: 'vi-VN-HoaiMyNeural', label: 'HoaiMy (Nữ)'},
    {id: 'vi-VN-NamMinhNeural', label: 'NamMinh (Nam)'},
    {id: 'en-US-JennyNeural', label: 'Jenny (EN)'},
  ],
  elevenlabs: [
    // Nam (5)
    {id: '6adFm46eyy74snVn6YrT', label: '🎙️ Nhật (Nam - Narrative)'},
    {id: 'aN7cv9yXNrfIR87bDmyD', label: '🎙️ Ninh Đôn (Nam)'},
    {id: 'JxmKvRaNYFidf0N27Vng', label: '🎙️ Sơn Trần (Nam)'},
    {id: 'u8EWWYyBDfXFxHak7WM3', label: '🎙️ Nathan (Nam)'},
    {id: 'ywBZEqUhld86Jeajq94o', label: '🎙️ Anh (Nam)'},
    // Nữ (5)
    {id: 'a3AkyqGG4v8Pg7SWQ0Y3', label: '🎤 Ngan (Nữ)'},
    {id: '0ggMuQ1r9f9jqBu50nJn', label: '🎤 Thắm (Nữ)'},
    {id: 'A5w1fw5x0uXded1LDvZp', label: '🎤 Nhu (Nữ)'},
    {id: 'd5HVupAWCwe4e6GvMCAL', label: '🎤 Mai (Nữ)'},
    {id: 'q6uIUrmSRksEvUMlwYPR', label: '🎤 Hương (Nữ)'},
  ],
  gemini: [
    // Nam — Recommended for news/tech content
    {id: 'Charon', label: '🎙️ Charon (Nam - Chuyên nghiệp)'},
    {id: 'Orus', label: '🎙️ Orus (Nam - Trầm, vững)'},
    {id: 'Puck', label: '🎙️ Puck (Nam - Năng động)'},
    {id: 'Fenrir', label: '🎙️ Fenrir (Nam)'},
    {id: 'Enceladus', label: '🎙️ Enceladus (Nam)'},
    {id: 'Achird', label: '🎙️ Achird (Nam)'},
    {id: 'Algenib', label: '🎙️ Algenib (Nam)'},
    {id: 'Alnilam', label: '🎙️ Alnilam (Nam)'},
    {id: 'Umbriel', label: '🎙️ Umbriel (Nam)'},
    // Nữ
    {id: 'Kore', label: '🎤 Kore (Nữ)'},
    {id: 'Aoede', label: '🎤 Aoede (Nữ)'},
    {id: 'Zephyr', label: '🎤 Zephyr (Nữ)'},
    {id: 'Gacrux', label: '🎤 Gacrux (Nữ)'},
    {id: 'Achernar', label: '🎤 Achernar (Nữ)'},
    {id: 'Leda', label: '🎤 Leda (Nữ)'},
    {id: 'Vindemiatrix', label: '🎤 Vindemiatrix (Nữ)'},
  ],
  vbee: [
    {id: 'n_hanoi_male_nhabaohoangnam_news_vc', label: '🎙️ Phóng viên Nam (Tin tức)'},
    {id: 'n_hanoi_male_tuananhnews_news_vc', label: '🎙️ Tuấn Anh News (Tin tức)'},
    {id: 'n_hanoi_male_baotrungmc_news_vc', label: '🎙️ Bảo Trung MC'},
    {id: 'n_hanoi_male_sizonguyen_education_vc', label: '🎙️ MR CU (Giáo dục)'},
  ],
}

interface SetupViewProps {
  onJobCreated: (id: string, settings: any) => void
  initialSettings?: any
  onOpenScriptAgent?: () => void
  projectId?: string | null
}

export default function SetupView({
  onJobCreated,
  initialSettings,
  onOpenScriptAgent,
  projectId,
}: SetupViewProps) {
  const [text, setText] = useState(() => {
    if (initialSettings?.prefilled_script) return initialSettings.prefilled_script
    try {
      const saved = sessionStorage.getItem('create_setup_draft')
      if (saved) return JSON.parse(saved).text ?? ''
    } catch {}
    return ''
  })
  const [settings, setSettings] = useState(() => {
    const { prefilled_script, ...rest } = initialSettings || {}
    if (Object.keys(rest).length > 0) return { ...DEFAULT_SETTINGS, ...rest }
    try {
      const saved = sessionStorage.getItem('create_setup_draft')
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved).settings }
    } catch {}
    return DEFAULT_SETTINGS
  })
  const [submitting, setSubmitting] = useState(false)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [bgmUploading, setBgmUploading] = useState(false)
  const [bgmTracks, setBgmTracks] = useState<BgmTrack[]>([])
  const [bgmTracksLoading, setBgmTracksLoading] = useState(false)
  const [bgmPreviewTrack, setBgmPreviewTrack] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null)
  const draftPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persistDraftToProject = useCallback(async () => {
    if (!projectId) return

    const draftText = text.trim()
    const settingsSerialized = JSON.stringify(settings)
    const isPristine = draftText.length === 0 && settingsSerialized === DEFAULT_SETTINGS_SERIALIZED
    if (isPristine) return

    try {
      await updateProject(projectId, {
        stage: 'config',
        title: draftText ? draftText.slice(0, 200) : null,
        config_draft: {
          text,
          settings,
        },
      })
    } catch {
      // Keep local sessionStorage fallback; project sync will retry on next edit.
    }
  }, [projectId, settings, text])

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length
  const canSubmit = wordCount >= 30 && wordCount <= 500 && !submitting

  const updateSetting = (key: string, value: any) => {
    setSettings((prev: any) => ({ ...prev, [key]: value }))
  }

  const stopBgmPreview = () => {
    if (bgmAudioRef.current) {
      bgmAudioRef.current.pause()
      bgmAudioRef.current.currentTime = 0
      bgmAudioRef.current = null
    }
    setBgmPreviewTrack(null)
  }

  const handlePreviewLibraryTrack = async (track: BgmTrack) => {

    if (bgmPreviewTrack === track.id) {
      stopBgmPreview()
      return
    }

    stopBgmPreview()
    const audio = new Audio(`${track.preview_url}`)
    audio.volume = 0.65
    audio.onended = () => setBgmPreviewTrack(null)

    try {
      await audio.play()
      bgmAudioRef.current = audio
      setBgmPreviewTrack(track.id)
    } catch (err: any) {
      showErrorToast(err, {
        source: 'setup_bgm_preview',
        fallback: 'Không thể phát bản nghe thử',
        prefix: 'Không thể phát bản nghe thử',
      })
      setBgmPreviewTrack(null)
    }
  }

  useEffect(() => {
    try {
      sessionStorage.setItem('create_setup_draft', JSON.stringify({ text, settings }))
    } catch {}

    if (draftPersistTimerRef.current) {
      clearTimeout(draftPersistTimerRef.current)
    }
    draftPersistTimerRef.current = setTimeout(() => {
      void persistDraftToProject()
    }, 650)

    return () => {
      if (draftPersistTimerRef.current) {
        clearTimeout(draftPersistTimerRef.current)
      }
    }
  }, [text, settings, persistDraftToProject])

  useEffect(() => {
    return () => {
      // Flush the latest setup draft when leaving create flow.
      void persistDraftToProject()
    }
  }, [persistDraftToProject])

  useEffect(() => {
    if (settings.bgm_mode !== 'library' || bgmTracks.length > 0) return

    setBgmTracksLoading(true)
    getBgmLibrary()
      .then((data) => setBgmTracks(data.tracks || []))
      .catch((err) => showErrorToast(err, {
        source: 'setup_bgm_library',
        fallback: 'Không thể tải thư viện nhạc nền',
        prefix: 'Không thể tải thư viện nhạc nền',
      }))
      .finally(() => setBgmTracksLoading(false))
  }, [settings.bgm_mode, bgmTracks.length])

  useEffect(() => {
    if (settings.bgm_mode !== 'library') {
      stopBgmPreview()
    }
  }, [settings.bgm_mode])

  useEffect(() => {
    return () => {
      stopBgmPreview()
    }
  }, [])

  const handlePreviewVoice = async () => {
    if (!text.trim()) {
      toast.error('Vui lòng nhập văn bản trước')
      return
    }
    setPreviewPlaying(true)
    try {
      const res = await fetch('/api/tts/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          text: text.slice(0, 200),
          engine: settings.tts_engine,
          voice: effectiveVoice,
          rate: settings.speech_rate,
        }),
      })
      if (!res.ok) throw new Error('Nghe thử thất bại')
      const blob = await res.blob()
      const audio = new Audio(URL.createObjectURL(blob))
      audio.onended = () => setPreviewPlaying(false)
      audio.play()
    } catch (err: any) {
      showErrorToast(err, {
        source: 'setup_voice_preview',
        fallback: 'Lỗi khi nghe thử',
        prefix: 'Lỗi khi nghe thử',
      })
      setPreviewPlaying(false)
    }
  }

  const handleSubmit = async (skipReview = false) => {
    if (!canSubmit) return
    if (!projectId) {
      toast.error('Dự án chưa sẵn sàng. Vui lòng tạo dự án mới trước khi tiếp tục.')
      return
    }
    setSubmitting(true)
    try {
      const { template_slug, ...settingsPayload } = settings as any
      const normalizedBgmSettings = { ...settingsPayload }
      if (normalizedBgmSettings.bgm_mode === 'none') {
        normalizedBgmSettings.bgm_url = null
        normalizedBgmSettings.bgm_library_id = null
      } else if (normalizedBgmSettings.bgm_mode === 'custom') {
        normalizedBgmSettings.bgm_library_id = null
      } else if (normalizedBgmSettings.bgm_mode === 'library') {
        normalizedBgmSettings.bgm_url = null
      }
      const resolvedSettings = {
        ...normalizedBgmSettings,
        skip_review: skipReview,
        // Override voice with effective voice (custom ElevenLabs ID if set)
        voice: effectiveVoice,
      }
      const data = await api.post('/jobs', {
        input_text: text,
        project_id: projectId,
        template_slug: template_slug || undefined,
        settings: resolvedSettings,
      })
      void updateProject(projectId, {
        stage: 'processing',
        active_job_id: data.id,
        chosen_script: text,
        config_draft: {
          text,
          settings: resolvedSettings,
        },
      })
      sessionStorage.removeItem('create_setup_draft')
      toast.success('Đã tạo tiến trình! Đang bắt đầu xử lý...')
      onJobCreated(data.id, { ...resolvedSettings, prefilled_script: text })
    } catch (err: any) {
      showErrorToast(err, {
        source: 'setup_create_job',
        fallback: 'Không thể tạo tiến trình',
        prefix: 'Không thể tạo tiến trình',
      })
      setSubmitting(false)
    }
  }

  const voices = VOICE_OPTIONS[settings.tts_engine] || VOICE_OPTIONS.openai
  // Resolve effective voice: custom ID overrides dropdown for ElevenLabs
  const effectiveVoice = (settings.tts_engine === 'elevenlabs' && settings.elevenlabs_custom_voice?.trim())
    ? settings.elevenlabs_custom_voice.trim()
    : settings.voice

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 relative">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[30rem] -translate-x-1/2 rounded-full blur-3xl opacity-40" style={{ background: 'var(--gradient-glow)' }} />
      {/* ── Text Input ── */}
      <Card className="surface-card border-0 bg-[color:var(--surface-0)]/90 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            <Type className="w-5 h-5" style={{ color: 'var(--brand-600)' }} /> Kịch bản Video
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {onOpenScriptAgent && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 border-dashed border-primary/40 text-primary hover:bg-primary/5"
              onClick={onOpenScriptAgent}
              type="button"
            >
              <Zap className="w-3.5 h-3.5" />
              Chưa có script? AI viết kịch bản từ chủ đề
            </Button>
          )}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Dán kịch bản của bạn vào đây... Tối thiểu 30 từ. AI sẽ tự động chia cảnh và tạo video."
            className="min-h-[200px] text-base resize-none focus-visible:ring-primary/20"
          />
          <div className="flex justify-between items-center text-sm">
            <span className={wordCount >= 30 ? "text-muted-foreground" : "text-destructive font-medium"}>
              Số từ: {wordCount}/500 {wordCount < 30 && "(Cần tối thiểu 30 từ)"}
            </span>
            {wordCount > 500 && <span className="text-destructive font-medium">Vượt quá giới hạn</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── Main Settings ── */}
      <Card className="surface-card border-0 bg-[color:var(--surface-0)]/90 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            <Settings2 className="w-5 h-5" style={{ color: 'var(--brand-600)' }} /> Cấu hình Video
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Aspect Ratio */}
            <div className="space-y-2">
              <Label>📐 Tỷ lệ khung hình</Label>
              <Select
                value={settings.aspect_ratio}
                onValueChange={(val) => updateSetting('aspect_ratio', val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn tỷ lệ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="9:16">Dọc (9:16) - Shorts/TikTok</SelectItem>
                  <SelectItem value="16:9">Ngang (16:9) - YouTube</SelectItem>
                  <SelectItem value="1:1">Vuông (1:1) - Bảng tin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Voice Selection */}
            <div className="space-y-2">
              <Label>🗣️ Giọng đọc</Label>
              <Select
                value={settings.voice}
                onValueChange={(val) => updateSetting('voice', val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn giọng đọc" />
                </SelectTrigger>
                <SelectContent>
                  {voices.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePreviewVoice}
              disabled={previewPlaying || !text.trim()}
              className="gap-2 border"
              style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
            >
              <Play className={cn("w-4 h-4", previewPlaying && "animate-pulse")} />
              {previewPlaying ? 'Đang đọc thử...' : 'Nghe thử giọng'}
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Speech Rate */}
            <div className="space-y-4">
              <div className="flex justify-between">
                <Label>⏩ Tốc độ đọc</Label>
                <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{settings.speech_rate.toFixed(1)}x</span>
              </div>
              <Slider
                min={0.8} max={2.0} step={0.1}
                value={[settings.speech_rate]}
                onValueChange={([val]) => updateSetting('speech_rate', val)}
              />
            </div>

            {/* Speech Volume */}
            <div className="space-y-4">
              <div className="flex justify-between">
                <Label><Volume2 className="w-4 h-4 inline mr-1" /> Âm lượng giọng</Label>
                <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{settings.speech_volume.toFixed(1)}</span>
              </div>
              <Slider
                min={0.6} max={3.0} step={0.1}
                value={[settings.speech_volume]}
                onValueChange={([val]) => updateSetting('speech_volume', val)}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-2">
              <Label><Music className="w-4 h-4 inline mr-1" /> Nhạc nền</Label>
              <Select
                value={settings.bgm_mode}
                onValueChange={(val) => {
                  updateSetting('bgm_mode', val)
                  if (val !== 'custom') {
                    updateSetting('bgm_url', null)
                    updateSetting('bgm_preview_url', null)
                  }
                  if (val !== 'library') updateSetting('bgm_library_id', null)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhạc nền" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Không có</SelectItem>
                  <SelectItem value="library">Thư viện có sẵn</SelectItem>
                  <SelectItem value="custom">Tải lên file riêng</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* BGM Custom Upload */}
            {settings.bgm_mode === 'custom' && (
              <div className="col-span-full space-y-4 p-4 rounded-xl border animate-in fade-in duration-200" style={{ background: 'var(--surface-2)', borderColor: 'var(--border-subtle)' }}>
                {!settings.bgm_url ? (
                  <div className="space-y-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".mp3,.wav,.m4a"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setBgmUploading(true)
                        try {
                          const formData = new FormData()
                          formData.append('file', file)
                          const res = await fetch('/api/bgm/upload', {
                            method: 'POST',
                            credentials: 'include',
                            body: formData,
                          })
                          if (!res.ok) throw new Error('Upload failed')
                          const result = await res.json()
                          updateSetting('bgm_library_id', null)
                          updateSetting('bgm_url', result.rel_path || result.url)
                          updateSetting('bgm_preview_url', result.url)
                          toast.success(`Đã tải lên: ${result.filename}`)
                        } catch (err: any) {
                          showErrorToast(err, {
                            source: 'setup_bgm_upload',
                            fallback: 'Tải lên thất bại',
                            prefix: 'Tải lên thất bại',
                          })
                        } finally {
                          setBgmUploading(false)
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-dashed border-primary/30 hover:bg-primary/5"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={bgmUploading}
                    >
                      <Upload className="w-4 h-4" />
                      {bgmUploading ? 'Đang tải lên...' : 'Chọn file nhạc (.mp3, .wav, .m4a)'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 p-3 rounded-lg border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center gap-3">
                      <Music className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-sm truncate flex-1 text-foreground/80">
                        {settings.bgm_url.split('/').pop()}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          updateSetting('bgm_url', null)
                          updateSetting('bgm_library_id', null)
                          updateSetting('bgm_preview_url', null)
                        }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <audio
                      controls
                      src={settings.bgm_preview_url || settings.bgm_url}
                      className="w-full h-8 opacity-80"
                      style={{ filter: 'invert(0.85) hue-rotate(180deg)' }}
                    />
                  </div>
                )}
              </div>
            )}

            {settings.bgm_mode === 'library' && (
              <div className="col-span-full space-y-4 p-4 rounded-xl border animate-in fade-in duration-200" style={{ background: 'var(--surface-2)', borderColor: 'var(--border-subtle)' }}>
                {bgmTracksLoading ? (
                  <p className="text-sm text-muted-foreground">Đang tải thư viện nhạc nền...</p>
                ) : bgmTracks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Không tìm thấy bản nhạc nào trong thư viện.</p>
                ) : (
                  <div className="space-y-3">
                    {bgmTracks.map((track) => {
                      const isSelected = settings.bgm_library_id === track.id
                      const isPlaying = bgmPreviewTrack === track.id
                      return (
                        <div
                          key={track.id}
                          className={`rounded-lg border p-3 transition-colors ${
                            isSelected
                              ? 'border-primary/50 bg-primary/5'
                              : 'border-white/10 bg-muted/20'
                          }`}
                        >
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{track.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Tông: {track.mood} | {track.bpm} BPM | {track.duration_sec}s
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handlePreviewLibraryTrack(track)}
                              >
                                <Play className="w-3.5 h-3.5 mr-1" />
                                {isPlaying ? 'Dừng nghe thử' : 'Nghe thử'}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={isSelected ? 'secondary' : 'default'}
                                onClick={() => {
                                  updateSetting('bgm_library_id', track.id)
                                  updateSetting('bgm_url', null)
                                }}
                              >
                                {isSelected ? 'Đã chọn' : 'Chọn'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {settings.bgm_mode !== 'none' && (
              <div className="col-span-full space-y-3 p-4 rounded-xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border-subtle)' }}>
                <div className="flex justify-between">
                  <Label className="text-xs">🔊 Âm lượng nhạc nền</Label>
                  <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{settings.bgm_volume.toFixed(2)}</span>
                </div>
                <Slider
                  min={0} max={1.0} step={0.05}
                  value={[settings.bgm_volume]}
                  onValueChange={([val]) => updateSetting('bgm_volume', val)}
                />
              </div>
            )}

            <div className="flex items-center space-x-2 h-full pt-6">
              <Switch
                id="subtitle-toggle"
                checked={settings.subtitle_enabled}
                onCheckedChange={(val) => updateSetting('subtitle_enabled', val)}
              />
              <Label htmlFor="subtitle-toggle" className="cursor-pointer">Hiển thị phụ đề</Label>
            </div>
          </div>

          {/* ── Advanced Settings ── */}
          <Accordion className="w-full">
            <AccordionItem value="advanced" className="border-none">
              <AccordionTrigger className="hover:no-underline py-2 text-sm text-muted-foreground">
                Thiết lập nâng cao
              </AccordionTrigger>
              <AccordionContent className="pt-4 space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>🎤 Công cụ TTS</Label>
                    <Select
                      value={settings.tts_engine}
                      onValueChange={(val) => {
                        updateSetting('tts_engine', val)
                        const newVoices = VOICE_OPTIONS[val] || []
                        if (newVoices.length && !newVoices.some(v => v.id === settings.voice)) {
                          updateSetting('voice', newVoices[0].id)
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI (Chất lượng cao)</SelectItem>
                        <SelectItem value="gemini">Gemini Flash TTS</SelectItem>
                        <SelectItem value="elevenlabs">ElevenLabs (Cao cấp)</SelectItem>
                        <SelectItem value="edge-tts">Edge-TTS (Miễn phí)</SelectItem>
                        <SelectItem value="vbee">Vbee AIVoice (Giọng Việt tốt nhất)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* ElevenLabs-specific settings */}
                  {settings.tts_engine === 'elevenlabs' && (
                    <div className="space-y-2">
                      <Label>🧠 Model ElevenLabs</Label>
                      <Select
                        value={settings.elevenlabs_model || 'eleven_v3'}
                        onValueChange={(val) => updateSetting('elevenlabs_model', val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="eleven_v3">Eleven v3 (Chất lượng cao)</SelectItem>
                          <SelectItem value="eleven_flash_v2_5">Flash v2.5 (Nhanh)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Gemini-specific settings */}
                  {settings.tts_engine === 'gemini' && (
                    <div className="space-y-2">
                      <Label>🧠 Model Gemini TTS</Label>
                      <Select
                        value={settings.gemini_model || 'gemini-3.1-flash-tts-preview'}
                        onValueChange={(val) => updateSetting('gemini_model', val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gemini-3.1-flash-tts-preview">Gemini 3.1 Flash TTS ⭐</SelectItem>
                          <SelectItem value="gemini-2.5-flash-preview-tts">Gemini 2.5 Flash</SelectItem>
                          <SelectItem value="gemini-2.5-pro-preview-tts">Gemini 2.5 Pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Custom Voice ID for ElevenLabs */}
                  {settings.tts_engine === 'elevenlabs' && (
                    <div className="md:col-span-2 space-y-2">
                      <Label>🔗 Voice ID tùy chỉnh <span className="text-muted-foreground font-normal">(tùy chọn)</span></Label>
                      <Input
                        placeholder="Dán Voice ID từ ElevenLabs..."
                        value={settings.elevenlabs_custom_voice || ''}
                        onChange={(e) => updateSetting('elevenlabs_custom_voice', e.target.value)}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Nhập Voice ID để dùng giọng bất kỳ. Nếu điền, sẽ ghi đè lựa chọn giọng đọc ở trên.
                      </p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <Label>🔤 Kích cỡ chữ</Label>
                      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{settings.subtitle_font_size}px</span>
                    </div>
                    <Slider
                      min={30} max={80} step={1}
                      value={[settings.subtitle_font_size]}
                      onValueChange={([val]) => updateSetting('subtitle_font_size', val)}
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>📍 Vị trí phụ đề</Label>
                    <Select
                      value={settings.subtitle_position}
                      onValueChange={(val) => updateSetting('subtitle_position', val)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="top">Trên cùng</SelectItem>
                        <SelectItem value="center">Giữa</SelectItem>
                        <SelectItem value="bottom">Dưới cùng</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>🎨 Kiểu phụ đề</Label>
                    <Select
                      value={settings.subtitle_preset ?? 'default'}
                      onValueChange={(val) => updateSetting('subtitle_preset', val)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Mặc định</SelectItem>
                        <SelectItem value="bold_pop">Nổi bật (Bold Pop)</SelectItem>
                        <SelectItem value="karaoke">Karaoke</SelectItem>
                        <SelectItem value="minimal">Tối giản</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <Label>🖊️ Độ dày viền chữ</Label>
                      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{settings.subtitle_stroke_width.toFixed(1)}</span>
                    </div>
                    <Slider
                      min={0} max={10} step={0.5}
                      value={[settings.subtitle_stroke_width]}
                      onValueChange={([val]) => updateSetting('subtitle_stroke_width', val)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><Palette className="w-3 h-3" /> Màu chữ</Label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="color" 
                        value={settings.subtitle_font_color}
                        onChange={(e) => updateSetting('subtitle_font_color', e.target.value)} 
                        className="w-full h-10 rounded cursor-pointer border-none bg-transparent"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Màu viền</Label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="color" 
                        value={settings.subtitle_stroke_color}
                        onChange={(e) => updateSetting('subtitle_stroke_color', e.target.value)} 
                        className="w-full h-10 rounded cursor-pointer border-none bg-transparent"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Màu nhấn</Label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="color" 
                        value={settings.subtitle_highlight_color}
                        onChange={(e) => updateSetting('subtitle_highlight_color', e.target.value)} 
                        className="w-full h-10 rounded cursor-pointer border-none bg-transparent"
                      />
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* ── Action Buttons ── */}
      <div className="flex flex-col md:flex-row gap-4 justify-center items-center pt-4">
        <Button
          variant="outline"
          size="lg"
          disabled={!canSubmit}
          onClick={() => handleSubmit(true)}
          className="w-full md:w-auto min-w-[200px] h-14 text-base gap-2 hover:bg-primary/5 border-primary/20"
        >
          <Zap className="w-5 h-5 text-yellow-500" /> Tạo nhanh (Bỏ qua Review)
        </Button>

        <Button
          variant="default"
          size="lg"
          disabled={!canSubmit}
          onClick={() => handleSubmit(false)}
          className="w-full md:w-auto min-w-[240px] h-14 text-base gap-2 shadow-lg"
          style={{ background: 'var(--gradient-brand)', color: '#fff' }}
        >
          <Clapperboard className="w-5 h-5" /> Bắt đầu tạo & Kiểm tra cảnh
        </Button>
      </div>

      {!canSubmit && wordCount > 0 && wordCount < 30 && (
        <p className="text-center text-sm text-destructive font-medium animate-pulse">
           Cần thêm ít nhất {30 - wordCount} từ nữa để bắt đầu
        </p>
      )}
    </div>
  )
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ')
}
