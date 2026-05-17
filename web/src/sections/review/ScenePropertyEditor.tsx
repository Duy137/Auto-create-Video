import {
  Image as ImageIcon, Settings2, Palette, Upload
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from 'sonner'
import { api } from '@/api/client'
import { showErrorToast } from '@/components/SystemErrorReport'
import type { Scene, VideoProps } from './types'
import { NEEDS_MEDIA, SCENE_TYPE_LABELS, TRANSITION_OPTIONS, TRANSITION_LABELS, getPreviewUrl } from './constants'
import { SceneMediaSearch } from './SceneMediaSearch'

interface ScenePropertyEditorProps {
  selectedScene: Scene
  selectedSceneIndex: number
  videoProps: VideoProps
  palette: Record<string, string>
  jobId: string
  onPropsUpdate: (props: VideoProps) => void
}

export function ScenePropertyEditor({
  selectedScene,
  selectedSceneIndex,
  videoProps,
  palette,
  jobId,
  onPropsUpdate,
}: ScenePropertyEditorProps) {
  return (
    <div className="border-l flex flex-col bg-card/10 backdrop-blur-sm h-full overflow-hidden">
      <div className="p-4 border-b flex items-center gap-2 font-semibold bg-muted/10 shrink-0">
        <Settings2 className="w-4 h-4 text-primary" />
        <span className="text-sm">Thuộc tính Cảnh {selectedSceneIndex + 1}</span>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 space-y-8">
          {/* Narration */}
          <div className="space-y-3">
            <Label htmlFor="narration" className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Lời thoại (Narration)</Label>
            <Textarea 
              id="narration"
              value={selectedScene?.narration || ''}
              onChange={(e) => {
                const newProps = { ...videoProps }
                const scenes = [...newProps.scenes]
                scenes[selectedSceneIndex] = { ...selectedScene, narration: e.target.value }
                onPropsUpdate({ ...newProps, scenes })
              }}
              className="min-h-[140px] resize-none leading-relaxed text-sm bg-muted/20 border-white/5 focus-visible:ring-primary/20"
              placeholder="Nhập lời thoại..."
            />
          </div>

          <Separator className="bg-white/5" />

          {/* Scene Type Selector */}
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
              Loại cảnh (Scene Type)
            </Label>
            <Select
              value={selectedScene?.scene_type || 'stock_background'}
              onValueChange={(val) => {
                if (!val) return
                const newProps = { ...videoProps }
                const scenes = [...newProps.scenes]
                const oldType = selectedScene?.scene_type || ''
                const newNeedsMedia = NEEDS_MEDIA.has(val)
                const oldNeedsMedia = NEEDS_MEDIA.has(oldType)
                
                let newScene: any = { 
                  ...selectedScene, 
                  scene_type: val,
                  media_layout: val === 'media_showcase' ? (selectedScene as any)?.media_layout || 'cinema' : undefined,
                  ...(!newNeedsMedia && oldNeedsMedia ? { media_url: null, media_type: null } : {}),
                }
                
                // Set correct default layout for the new scene type
                if (val === 'stock_background') {
                  newScene.layout = 'media_overlay'
                } else if (val === 'title_card') {
                  newScene.layout = 'standard' // Set to standard by default when switching
                } else {
                  newScene.layout = null
                }
                
                // Apply pre-computed alt_data for instant type-switching (if available)
                const altEntry = (newScene as any)?._alt_data?.[val];
                if (altEntry && typeof altEntry === 'object' && Object.keys(altEntry).length > 0) {
                  Object.assign(newScene, altEntry);
                  toast.success('Đã áp dụng nội dung cho loại cảnh mới!');
                } else {
                  // Fallback: Pre-fill missing data structures so UI components don't crash or render blank
                  if (val === 'comparison' && (!newScene.comparison_sides || newScene.comparison_sides.length === 0)) {
                    newScene.comparison_sides = [
                      { label: 'Trước đây', points: ['Điểm 1', 'Điểm 2'] },
                      { label: 'Bây giờ', points: ['Điểm 1', 'Điểm 2'] }
                    ];
                  }
                  if (val === 'timeline' && (!newScene.timeline_events || newScene.timeline_events.length === 0)) {
                    newScene.timeline_events = [
                      { label: 'Bước 1', title: 'Bắt đầu', description: '' },
                      { label: 'Bước 2', title: 'Tiếp tục', description: '' }
                    ];
                  }
                  if ((val === 'emoji_grid' || val === 'info_card') && (!newScene.card_items || newScene.card_items.length === 0)) {
                    newScene.card_items = [
                      { icon: '💡', title: 'Ý tưởng 1', subtitle: 'Mô tả ngắn' },
                      { icon: '🚀', title: 'Ý tưởng 2', subtitle: 'Mô tả ngắn' }
                    ];
                  }
                  if (val === 'stats_highlight' && (!newScene.stats || newScene.stats.length === 0)) {
                    newScene.stats = [
                      { value: '100%', label: 'Hoàn thành', color: '#6366f1' }
                    ];
                  }
                }

                scenes[selectedSceneIndex] = newScene
                onPropsUpdate({ ...newProps, scenes })
                
                // Auto-search when switching to stock type without media
                if (newNeedsMedia && !selectedScene?.media_url) {
                  const searchQuery = selectedScene?.image_query || selectedScene?.video_query || (selectedScene as any)?.semantic_image_query || ''
                  if (searchQuery) {
                    toast.info('Đang tìm media phù hợp...')
                    api.post(`/jobs/${jobId}/scenes/${selectedSceneIndex}/re-search`, {
                      image_query: searchQuery,
                      video_query: searchQuery,
                    }).then(result => {
                      const updatedProps = { ...newProps }
                      const updatedScenes = [...updatedProps.scenes]
                      updatedScenes[selectedSceneIndex] = {
                        ...updatedScenes[selectedSceneIndex],
                        scene_type: val,
                        media_url: result.media_url,
                        media_type: result.media_type,
                      }
                      onPropsUpdate({ ...updatedProps, scenes: updatedScenes })
                      toast.success('Đã tìm thấy media!')
                    }).catch(() => {
                      toast.error('Không tìm được media. Hãy thử đổi từ khóa hoặc upload file.')
                    })
                  } else {
                    toast.info('Cảnh này cần media. Hãy nhập từ khóa hoặc tải lên từ máy.')
                  }
                }
              }}
            >
              <SelectTrigger className="bg-muted/20 border-white/5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SCENE_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator className="bg-white/5" />

          {/* Media Search — for scenes that need stock media */}
          {(NEEDS_MEDIA.has(selectedScene?.scene_type || '') && !(selectedScene?.scene_type === 'title_card' && ((selectedScene as any)?.layout || 'standard') === 'standard')) ? (
          <>
          <div className="space-y-4">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Từ khóa tìm kiếm (Media)</Label>
            <SceneMediaSearch 
              key={selectedSceneIndex}
              scene={selectedScene} 
              index={selectedSceneIndex} 
              jobId={jobId} 
              videoProps={videoProps} 
              onPropsUpdate={onPropsUpdate} 
            />
          </div>
          
          {/* Warning when media needed but missing */}
          {!getPreviewUrl(selectedScene) && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg animate-in fade-in duration-200">
              <p className="text-xs text-amber-400 flex items-center gap-2 mb-2">
                <ImageIcon className="w-3.5 h-3.5" />
                Cảnh này cần media nhưng chưa có
              </p>
              <p className="text-[10px] text-muted-foreground">
                Bấm vào "Từ khóa hiện tại" để tìm trên Pexels, hoặc kéo thả file vào đây.
              </p>
            </div>
          )}
          </>
          ) : (
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Media</Label>
            <div className="p-4 bg-muted/30 rounded-xl border border-white/5 flex items-center gap-3">
              <Palette className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Cảnh <span className="font-semibold capitalize">{SCENE_TYPE_LABELS[selectedScene?.scene_type || ''] || selectedScene?.scene_type}</span> dùng nền gradient tự động.</p>
            </div>
          </div>
          )}

          <Separator className="bg-white/5" />

          {/* Comparison editor */}
          {selectedScene?.scene_type === 'comparison' && selectedScene?.comparison_sides && (
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Nội dung so sánh</Label>
              <div className="grid grid-cols-2 gap-2">
                {selectedScene.comparison_sides.map((side, i) => (
                  <div key={i} className="p-3 bg-muted/30 rounded-xl border border-white/5 space-y-2">
                    <Input
                      value={side.label}
                      onChange={(e) => {
                        const newProps = { ...videoProps }
                        const scenes = [...newProps.scenes]
                        const sides = [...(selectedScene.comparison_sides || [])]
                        sides[i] = { ...sides[i], label: e.target.value }
                        scenes[selectedSceneIndex] = { ...selectedScene, comparison_sides: sides }
                        onPropsUpdate({ ...newProps, scenes })
                      }}
                      className="h-7 text-xs font-bold bg-muted/20 border-white/5"
                      placeholder="Nhãn..."
                    />
                    <div className="space-y-1">
                      {side.points.map((p, j) => (
                        <div key={j} className="flex items-center gap-1">
                          <Input
                            value={p}
                            maxLength={30}
                            onChange={(e) => {
                              const newProps = { ...videoProps }
                              const scenes = [...newProps.scenes]
                              const sides = [...(selectedScene.comparison_sides || [])]
                              const points = [...sides[i].points]
                              points[j] = e.target.value
                              sides[i] = { ...sides[i], points }
                              scenes[selectedSceneIndex] = { ...selectedScene, comparison_sides: sides }
                              onPropsUpdate({ ...newProps, scenes })
                            }}
                            className="h-6 text-[11px] bg-muted/20 border-white/5 flex-1"
                          />
                          {side.points.length > 1 && (
                            <button
                              className="text-destructive/60 hover:text-destructive text-xs px-1"
                              onClick={() => {
                                const newProps = { ...videoProps }
                                const scenes = [...newProps.scenes]
                                const sides = [...(selectedScene.comparison_sides || [])]
                                const points = sides[i].points.filter((_, k) => k !== j)
                                sides[i] = { ...sides[i], points }
                                scenes[selectedSceneIndex] = { ...selectedScene, comparison_sides: sides }
                                onPropsUpdate({ ...newProps, scenes })
                              }}
                            >✕</button>
                          )}
                        </div>
                      ))}
                      {side.points.length < 5 && (
                        <button
                          className="text-[10px] text-primary/60 hover:text-primary"
                          onClick={() => {
                            const newProps = { ...videoProps }
                            const scenes = [...newProps.scenes]
                            const sides = [...(selectedScene.comparison_sides || [])]
                            const points = [...sides[i].points, '']
                            sides[i] = { ...sides[i], points }
                            scenes[selectedSceneIndex] = { ...selectedScene, comparison_sides: sides }
                            onPropsUpdate({ ...newProps, scenes })
                          }}
                        >+ Thêm điểm</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline editor */}
          {selectedScene?.scene_type === 'timeline' && selectedScene?.timeline_events && (
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-widest text-[var(--text-primary)] font-bold">Dòng thời gian</Label>
              <div className="space-y-1.5">
                {selectedScene.timeline_events.map((ev, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-white/5">
                    <Input
                      value={ev.label}
                      maxLength={10}
                      onChange={(e) => {
                        const newProps = { ...videoProps }
                        const scenes = [...newProps.scenes]
                        const events = [...(selectedScene.timeline_events || [])]
                        events[i] = { ...events[i], label: e.target.value }
                        scenes[selectedSceneIndex] = { ...selectedScene, timeline_events: events }
                        onPropsUpdate({ ...newProps, scenes })
                      }}
                      className="h-6 w-16 text-[9px] font-mono bg-muted/20 border-white/5 shrink-0"
                    />
                    <Input
                      value={ev.title}
                      maxLength={20}
                      onChange={(e) => {
                        const newProps = { ...videoProps }
                        const scenes = [...newProps.scenes]
                        const events = [...(selectedScene.timeline_events || [])]
                        events[i] = { ...events[i], title: e.target.value }
                        scenes[selectedSceneIndex] = { ...selectedScene, timeline_events: events }
                        onPropsUpdate({ ...newProps, scenes })
                      }}
                      className="h-6 text-xs bg-muted/20 border-white/5 flex-1"
                    />
                    {selectedScene.timeline_events!.length > 3 && (
                      <button
                        className="text-destructive/60 hover:text-destructive text-xs px-1 shrink-0"
                        onClick={() => {
                          const newProps = { ...videoProps }
                          const scenes = [...newProps.scenes]
                          const events = (selectedScene.timeline_events || []).filter((_, k) => k !== i)
                          scenes[selectedSceneIndex] = { ...selectedScene, timeline_events: events }
                          onPropsUpdate({ ...newProps, scenes })
                        }}
                      >✕</button>
                    )}
                  </div>
                ))}
                {(selectedScene.timeline_events?.length ?? 0) < 5 && (
                  <button
                    className="text-[10px] text-primary/60 hover:text-primary w-full text-center py-1"
                    onClick={() => {
                      const newProps = { ...videoProps }
                      const scenes = [...newProps.scenes]
                      const events = [...(selectedScene.timeline_events || []), { label: '', title: '', description: '' }]
                      scenes[selectedSceneIndex] = { ...selectedScene, timeline_events: events }
                      onPropsUpdate({ ...newProps, scenes })
                    }}
                  >+ Thêm sự kiện</button>
                )}
              </div>
            </div>
          )}

          {/* EmojiGrid / InfoCard editor */}
          {(selectedScene?.scene_type === 'emoji_grid' || selectedScene?.scene_type === 'info_card') && selectedScene?.card_items && (
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                {selectedScene.scene_type === 'emoji_grid' ? 'Lưới biểu tượng' : 'Thẻ thông tin'}
              </Label>
              <div className="space-y-2">
                {selectedScene.card_items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-white/5">
                    <Input
                      value={item.icon}
                      onChange={(e) => {
                        const newProps = { ...videoProps }
                        const scenes = [...newProps.scenes]
                        const items = [...(selectedScene.card_items || [])]
                        items[i] = { ...items[i], icon: e.target.value }
                        scenes[selectedSceneIndex] = { ...selectedScene, card_items: items }
                        onPropsUpdate({ ...newProps, scenes })
                      }}
                      className="h-7 w-10 text-center text-lg bg-muted/20 border-white/5 shrink-0"
                      placeholder="🔥"
                    />
                    <div className="flex-1 space-y-1">
                      <Input
                        value={item.title}
                        onChange={(e) => {
                          const newProps = { ...videoProps }
                          const scenes = [...newProps.scenes]
                          const items = [...(selectedScene.card_items || [])]
                          items[i] = { ...items[i], title: e.target.value }
                          scenes[selectedSceneIndex] = { ...selectedScene, card_items: items }
                          onPropsUpdate({ ...newProps, scenes })
                        }}
                        className="h-6 text-xs bg-muted/20 border-white/5"
                        placeholder="Tiêu đề"
                      />
                      <Input
                        value={item.subtitle}
                        onChange={(e) => {
                          const newProps = { ...videoProps }
                          const scenes = [...newProps.scenes]
                          const items = [...(selectedScene.card_items || [])]
                          items[i] = { ...items[i], subtitle: e.target.value }
                          scenes[selectedSceneIndex] = { ...selectedScene, card_items: items }
                          onPropsUpdate({ ...newProps, scenes })
                        }}
                        className="h-6 text-[11px] bg-muted/20 border-white/5"
                        placeholder="Phụ đề"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* StatsHighlight editor */}
          {selectedScene?.scene_type === 'stats_highlight' && selectedScene?.stats && (
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Số liệu nổi bật</Label>
              <div className="space-y-2">
                {selectedScene.stats.map((stat, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-white/5">
                    <input
                      type="color"
                      value={stat.color || '#6366f1'}
                      onChange={(e) => {
                        const newProps = { ...videoProps }
                        const scenes = [...newProps.scenes]
                        const stats = [...(selectedScene.stats || [])]
                        stats[i] = { ...stats[i], color: e.target.value }
                        scenes[selectedSceneIndex] = { ...selectedScene, stats }
                        onPropsUpdate({ ...newProps, scenes })
                      }}
                      className="w-7 h-7 rounded cursor-pointer shrink-0 border-0"
                    />
                    <Input
                      value={stat.value}
                      onChange={(e) => {
                        const newProps = { ...videoProps }
                        const scenes = [...newProps.scenes]
                        const stats = [...(selectedScene.stats || [])]
                        stats[i] = { ...stats[i], value: e.target.value }
                        scenes[selectedSceneIndex] = { ...selectedScene, stats }
                        onPropsUpdate({ ...newProps, scenes })
                      }}
                      className="h-7 w-20 text-sm font-bold bg-muted/20 border-white/5 shrink-0"
                      placeholder="85%"
                    />
                    <Input
                      value={stat.label}
                      onChange={(e) => {
                        const newProps = { ...videoProps }
                        const scenes = [...newProps.scenes]
                        const stats = [...(selectedScene.stats || [])]
                        stats[i] = { ...stats[i], label: e.target.value }
                        scenes[selectedSceneIndex] = { ...selectedScene, stats }
                        onPropsUpdate({ ...newProps, scenes })
                      }}
                      className="h-7 text-xs bg-muted/20 border-white/5 flex-1"
                      placeholder="Nhãn"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator className="bg-white/5" />

          {/* ── Unified Layout Mode Selector ── */}
          {(() => {
            const LAYOUT_OPTIONS: Record<string, { value: string; emoji: string; label: string; desc: string }[]> = {
              timeline: [
                { value: "left_aligned", emoji: "📋", label: "Steps", desc: "Numbered steps, line bên trái" },
                { value: "center_focus", emoji: "⏳", label: "Classic", desc: "Line giữa, events 2 bên" },
              ],
              comparison: [
                { value: "split_screen", emoji: "⚔️", label: "Split", desc: "Chia đôi trái/phải" },
                { value: "stacked", emoji: "📊", label: "Stacked", desc: "Xếp dọc trên/dưới" },
              ],
              info_card: [
                { value: "vertical_stack", emoji: "📝", label: "Stack", desc: "Cards xếp dọc" },
                { value: "grid_2x2", emoji: "🔲", label: "Grid", desc: "Lưới 2×2 (4 items)" },
                { value: "full_width_cards", emoji: "📰", label: "Full-width", desc: "Cards ngang, icon + text" },
              ],
              emoji_grid: [
                { value: "vertical_stack", emoji: "📝", label: "Stack", desc: "Cards xếp dọc" },
                { value: "grid_2x2", emoji: "🔲", label: "Grid", desc: "Lưới 2×2 (4 items)" },
                { value: "full_width_cards", emoji: "📰", label: "Full-width", desc: "Cards ngang, icon + text" },
              ],
              stats_highlight: [
                { value: "vertical_stack", emoji: "📊", label: "Cards", desc: "Stat cards xếp dọc" },
                { value: "hero_number", emoji: "🔢", label: "Hero", desc: "1 số lớn nổi bật" },
              ],
              media_showcase: [
                { value: "fit", emoji: "🖼️", label: "Vừa chiều rộng (Fit)", desc: "Giữ nguyên tỷ lệ, không cắt" },
                { value: "cinema", emoji: "🎬", label: "Cinema (ngang 16:9)", desc: "Video nằm giữa, có title phía trên" },
                { value: "fullscreen", emoji: "📱", label: "Toàn màn hình (dọc)", desc: "Video phủ kín, phù hợp video dọc" },
              ],
              title_card: [
                { value: "standard", emoji: "✨", label: "Tiêu chuẩn", desc: "Cơ bản" },
                { value: "news_intro", emoji: "📰", label: "News Intro", desc: "Bản tin chuyên nghiệp" },
                { value: "educational", emoji: "🎓", label: "Educational", desc: "Kiến thức, sự thật" },
                { value: "tutorial", emoji: "🛠️", label: "Tutorial", desc: "Hướng dẫn, liệt kê" },
                { value: "commercial", emoji: "🛍️", label: "Commercial", desc: "Bán hàng, sản phẩm" },
              ],
            }
            const sceneType = selectedScene?.scene_type || ''
            const options = LAYOUT_OPTIONS[sceneType]
            if (!options || options.length < 2) return null

            // Resolve current layout and ensure it's valid for this scene type
            const validLayouts = options.map(o => o.value)
            let currentLayout = options[0].value
            
            if (sceneType === 'media_showcase' && (selectedScene as any)?.media_layout) {
              currentLayout = (selectedScene as any).media_layout
            } else if ((selectedScene as any)?.layout && validLayouts.includes((selectedScene as any).layout)) {
              currentLayout = (selectedScene as any).layout
            }

            return (
              <div className="space-y-2">
                <Label htmlFor="layout-mode" className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                  Chế độ hiển thị (Layout Mode)
                </Label>
                <Select
                  value={currentLayout}
                  onValueChange={(val) => {
                    const newProps = { ...videoProps }
                    const scenes = [...newProps.scenes]
                    const oldLayout = currentLayout
                    const isMediaTitleCardNow = sceneType === 'title_card' && val !== 'standard'
                    const wasMediaTitleCard = sceneType === 'title_card' && oldLayout !== 'standard'

                    scenes[selectedSceneIndex] = {
                      ...selectedScene,
                      layout: val,
                      // Backward compat: also write media_layout for media_showcase
                      ...(sceneType === 'media_showcase' ? { media_layout: val as any } : {}),
                      // Clear media if switching to standard title card
                      ...(!isMediaTitleCardNow && wasMediaTitleCard ? { media_url: null, media_type: null } : {})
                    }
                    onPropsUpdate({ ...newProps, scenes })

                    // Auto-search media if layout now needs it
                    if (isMediaTitleCardNow && !selectedScene?.media_url) {
                      const searchQuery = selectedScene?.image_query || selectedScene?.video_query || (selectedScene as any)?.semantic_image_query || ''
                      if (searchQuery) {
                        toast.info('Đang tìm media phù hợp...')
                        api.post(`/jobs/${jobId}/scenes/${selectedSceneIndex}/re-search`, {
                          image_query: searchQuery,
                          video_query: searchQuery,
                        }).then(result => {
                          const updatedProps = { ...newProps }
                          const updatedScenes = [...updatedProps.scenes]
                          updatedScenes[selectedSceneIndex] = {
                            ...updatedScenes[selectedSceneIndex],
                            layout: val,
                            media_url: result.media_url,
                            media_type: result.media_type,
                          }
                          onPropsUpdate({ ...updatedProps, scenes: updatedScenes })
                          toast.success('Đã tìm thấy media!')
                        }).catch(() => {
                          toast.error('Không tìm được media. Hãy thử đổi từ khóa hoặc upload file.')
                        })
                      } else {
                        toast.info('Cảnh này cần media. Hãy nhập từ khóa hoặc tải lên từ máy.')
                      }
                    }
                  }}
                >
                  <SelectTrigger id="layout-mode" className="bg-muted/20 border-white/5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <span className="text-base">{opt.emoji}</span>
                          <div>
                            <div className="font-medium">{opt.label}</div>
                            <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          })()}

          {/* Transition */}
          <div className="space-y-4">
            <Label htmlFor="transition" className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Hiệu ứng chuyển cảnh</Label>
            <Select
              value={selectedScene?.transition || 'fade'}
              onValueChange={(val) => {
                const newProps = { ...videoProps }
                const scenes = [...newProps.scenes]
                scenes[selectedSceneIndex] = { ...selectedScene, transition: val }
                onPropsUpdate({ ...newProps, scenes })
              }}
            >
              <SelectTrigger id="transition" className="bg-muted/20 border-white/5">
                <SelectValue placeholder="Chọn hiệu ứng..." />
              </SelectTrigger>
              <SelectContent>
                {TRANSITION_OPTIONS.map(opt => (
                  <SelectItem key={opt} value={opt} className="capitalize">{TRANSITION_LABELS[opt] || opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Emoji pop-up editor */}
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
              Emoji Pop-up
            </Label>
            
            {(selectedScene as any)?.emoji && (
              <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg border border-primary/20">
                <span className="text-2xl">{(selectedScene as any).emoji}</span>
                <span className="text-xs text-muted-foreground flex-1">Đang chọn</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] text-destructive hover:text-destructive"
                  onClick={() => {
                    const newProps = { ...videoProps }
                    const scenes = [...newProps.scenes]
                    scenes[selectedSceneIndex] = { ...selectedScene, emoji: null } as any
                    onPropsUpdate({ ...newProps, scenes })
                  }}
                >
                  Xóa
                </Button>
              </div>
            )}
            
            <div className="grid grid-cols-8 gap-1">
              {['🚀','💡','🔥','⚡','💰','📈','🎯','✨',
                '🤖','🧠','💻','📊','🏆','⭐','🎉','💎',
                '⚠️','🔒','❤️','🌍','📚','🎬','💬','👑'].map(em => (
                <button
                  key={em}
                  className={`text-xl p-1.5 rounded-lg hover:bg-muted/40 transition-colors ${
                    (selectedScene as any)?.emoji === em ? 'bg-primary/20 ring-1 ring-primary' : ''
                  }`}
                  onClick={() => {
                    const newProps = { ...videoProps }
                    const scenes = [...newProps.scenes]
                    scenes[selectedSceneIndex] = { ...selectedScene, emoji: em } as any
                    onPropsUpdate({ ...newProps, scenes })
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
            
            <Input
              placeholder="Hoặc gõ emoji tùy chọn..."
              value={(selectedScene as any)?.emoji || ''}
              onChange={(e) => {
                const newProps = { ...videoProps }
                const scenes = [...newProps.scenes]
                scenes[selectedSceneIndex] = { ...selectedScene, emoji: e.target.value || null } as any
                onPropsUpdate({ ...newProps, scenes })
              }}
              className="h-8 text-sm bg-muted/20 border-white/5"
            />
            
            <p className="text-[10px] text-muted-foreground">
              Emoji sẽ xuất hiện pop-up trong video. AI tự chọn khi tạo, bạn có thể thay đổi.
            </p>
          </div>

          {/* Color Palette */}
          {palette && (
            <div className="space-y-4">
               <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Bảng màu hệ thống</Label>
               <p className="text-[10px] text-muted-foreground">Click vào ô màu để thay đổi</p>
               <div className="grid grid-cols-4 gap-2">
                 {Object.entries(palette).map(([key, color]) => (
                    <div key={key} className="relative group">
                      <label 
                        className="block w-full h-10 rounded-lg border border-white/10 shadow-sm cursor-pointer hover:scale-105 hover:border-white/30 transition-all"
                        style={{ backgroundColor: color }}
                        title={`${key}: ${color} — click để đổi`}
                      >
                        <input 
                          type="color"
                          value={color}
                          className="sr-only"
                          onChange={(e) => {
                            const newPalette = { ...palette, [key]: e.target.value }
                            onPropsUpdate({ ...videoProps, color_palette: newPalette } as any)
                          }}
                        />
                      </label>
                      <span className="block text-[9px] text-center text-muted-foreground mt-1 capitalize">{key}</span>
                    </div>
                 ))}
               </div>
            </div>
          )}

          <Separator className="bg-white/5" />

          {/* Advanced Settings (Video-level) */}
          <div className="space-y-6">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-2">
              <Settings2 className="w-3.5 h-3.5" />
              Cài đặt nâng cao
            </Label>

            {/* Watermark */}
            <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-white/5">
              <span className="text-xs font-semibold">Watermark</span>
              
              <Select
                value={(videoProps as any).settings?.watermark_mode || 'text'}
                onValueChange={(val) => {
                  const settings = { ...((videoProps as any).settings || {}) }
                  settings.watermark_mode = val
                  onPropsUpdate({ ...videoProps, settings } as any)
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-muted/20 border-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Chỉ chữ</SelectItem>
                  <SelectItem value="logo">Chỉ logo</SelectItem>
                  <SelectItem value="both">Logo + Chữ</SelectItem>
                </SelectContent>
              </Select>

              {['text', 'both'].includes((videoProps as any).settings?.watermark_mode || 'text') && (
                <Input
                  placeholder="Text watermark (vd: @autoclip)"
                  value={(videoProps as any).settings?.watermark_text || ''}
                  onChange={(e) => {
                    const settings = { ...((videoProps as any).settings || {}) }
                    settings.watermark_text = e.target.value || null
                    onPropsUpdate({ ...videoProps, settings } as any)
                  }}
                  className="h-8 text-xs bg-muted/20 border-white/5"
                />
              )}

              {['logo', 'both'].includes((videoProps as any).settings?.watermark_mode || 'text') && (
                <div className="space-y-2">
                  {(videoProps as any).settings?.watermark_logo_url ? (
                    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                      <img
                        src={((videoProps as any).settings.watermark_logo_url || '').startsWith('/api/')
                          ? (videoProps as any).settings.watermark_logo_url
                          : `/api/demo/${(videoProps as any).settings.watermark_logo_url}`}
                        alt="Logo"
                        className="w-8 h-8 object-contain"
                      />
                      <span className="text-[10px] text-muted-foreground flex-1 truncate">
                        {(videoProps as any).settings.watermark_logo_url.split('/').pop()}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 text-[10px] text-destructive"
                        onClick={() => {
                          const settings = { ...((videoProps as any).settings || {}) }
                          settings.watermark_logo_url = null
                          onPropsUpdate({ ...videoProps, settings } as any)
                        }}
                      >
                        Xóa
                      </Button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        id="logo-upload"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const form = new FormData()
                          form.append('file', file)
                          try {
                            toast.info('Đang tải logo...')
                            const result = await api.post(`/jobs/${jobId}/logo/upload`, form)
                            const settings = { ...((videoProps as any).settings || {}) }
                            settings.watermark_logo_url = result.logo_url
                            onPropsUpdate({ ...videoProps, settings } as any)
                            toast.success('Đã upload logo!')
                          } catch (err: any) {
                            showErrorToast(err, {
                              source: 'review_logo_upload',
                              jobId,
                              fallback: 'Upload thất bại',
                              prefix: 'Upload thất bại',
                            })
                          }
                        }}
                      />
                      <label
                        htmlFor="logo-upload"
                        className="flex items-center justify-center gap-2 p-3 border border-dashed border-white/10 rounded-lg cursor-pointer hover:border-primary/30 transition-colors"
                      >
                        <Upload className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Upload logo (PNG, JPG, WebP)</span>
                      </label>
                    </>
                  )}
                </div>
              )}

              {/* Position + Opacity */}
              <div className="flex gap-2">
                <Select
                  value={(videoProps as any).settings?.watermark_position || 'top-right'}
                  onValueChange={(val) => {
                    const settings = { ...((videoProps as any).settings || {}) }
                    settings.watermark_position = val
                    onPropsUpdate({ ...videoProps, settings } as any)
                  }}
                >
                  <SelectTrigger className="h-8 text-xs bg-muted/20 border-white/5 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top-left">Trên trái</SelectItem>
                    <SelectItem value="top-right">Trên phải</SelectItem>
                    <SelectItem value="bottom-left">Dưới trái</SelectItem>
                    <SelectItem value="bottom-right">Dưới phải</SelectItem>
                    <SelectItem value="center">Chính giữa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground shrink-0">Opacity</span>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={Math.round(((videoProps as any).settings?.watermark_opacity ?? 0.5) * 100)}
                  onChange={(e) => {
                    const settings = { ...((videoProps as any).settings || {}) }
                    settings.watermark_opacity = parseInt(e.target.value) / 100
                    onPropsUpdate({ ...videoProps, settings } as any)
                  }}
                  className="flex-1 h-1.5 accent-primary"
                />
                <span className="text-[10px] text-muted-foreground w-8 text-right">
                  {Math.round(((videoProps as any).settings?.watermark_opacity ?? 0.5) * 100)}%
                </span>
              </div>
            </div>

            {/* SFX */}
            <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-white/5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Hiệu ứng âm thanh (SFX)</span>
                <Button
                  size="sm"
                  variant={(videoProps as any).settings?.sfx?.enabled !== false ? "default" : "outline"}
                  className="h-6 text-[10px] px-2"
                  onClick={() => {
                    const settings = { ...((videoProps as any).settings || {}) }
                    const sfx = { ...(settings.sfx || { enabled: true, volume: 0.25 }) }
                    sfx.enabled = !sfx.enabled
                    settings.sfx = sfx
                    onPropsUpdate({ ...videoProps, settings } as any)
                  }}
                >
                  {(videoProps as any).settings?.sfx?.enabled !== false ? 'BẬT' : 'TẮT'}
                </Button>
              </div>
              {(videoProps as any).settings?.sfx?.enabled !== false && (
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground shrink-0">Âm lượng</span>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={Math.round(((videoProps as any).settings?.sfx?.volume ?? 0.25) * 100)}
                    onChange={(e) => {
                      const settings = { ...((videoProps as any).settings || {}) }
                      const sfx = { ...(settings.sfx || { enabled: true, volume: 0.25 }) }
                      sfx.volume = parseInt(e.target.value) / 100
                      settings.sfx = sfx
                      onPropsUpdate({ ...videoProps, settings } as any)
                    }}
                    className="flex-1 h-1.5 accent-primary"
                  />
                  <span className="text-[10px] text-muted-foreground w-8 text-right">
                    {Math.round(((videoProps as any).settings?.sfx?.volume ?? 0.25) * 100)}%
                  </span>
                </div>
              )}
            </div>

            {/* Subtitle Preset */}
            <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-white/5">
              <span className="text-xs font-semibold">Kiểu phụ đề</span>
              <Select
                value={(videoProps as any).settings?.subtitle?.preset || 'default'}
                onValueChange={(val) => {
                  const settings = { ...((videoProps as any).settings || {}) }
                  const subtitle = { ...(settings.subtitle || {}) }
                  subtitle.preset = val
                  settings.subtitle = subtitle
                  onPropsUpdate({ ...videoProps, settings } as any)
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-muted/20 border-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Mặc định</SelectItem>
                  <SelectItem value="bold_pop">Bold Pop (nổi bật)</SelectItem>
                  <SelectItem value="karaoke">Karaoke (mờ → sáng)</SelectItem>
                  <SelectItem value="minimal">Minimal (nhỏ gọn)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Background */}
            <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-white/5">
              <span className="text-xs font-semibold">🎨 Hình nền tùy chỉnh</span>
              <p className="text-[10px] text-muted-foreground">
                Upload ảnh/video thay thế gradient nền. Bỏ trống để dùng preset mặc định.
              </p>

              {(videoProps as any).settings?.custom_background_url ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                    <span className="text-lg">
                      {(videoProps as any).settings?.custom_background_type === 'video' ? '🎬' : '🖼️'}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex-1 truncate">
                      {((videoProps as any).settings.custom_background_url || '').split('/').pop()}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 text-[10px] text-destructive"
                      onClick={() => {
                        const settings = { ...((videoProps as any).settings || {}) }
                        settings.custom_background_url = null
                        settings.custom_background_type = 'image'
                        onPropsUpdate({ ...videoProps, settings } as any)
                      }}
                    >
                      Xóa
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                    className="hidden"
                    id="bg-upload"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const form = new FormData()
                      form.append('file', file)
                      try {
                        toast.info('Đang tải hình nền...')
                        const result = await api.post(`/jobs/${jobId}/background/upload`, form)
                        const settings = { ...((videoProps as any).settings || {}) }
                        settings.custom_background_url = result.bg_url
                        settings.custom_background_type = result.bg_type
                        onPropsUpdate({ ...videoProps, settings } as any)
                        toast.success('Đã upload hình nền!')
                      } catch (err: any) {
                        showErrorToast(err, {
                          source: 'review_background_upload',
                          jobId,
                          fallback: 'Upload thất bại',
                          prefix: 'Upload thất bại',
                        })
                      }
                    }}
                  />
                  <label
                    htmlFor="bg-upload"
                    className="flex items-center justify-center gap-2 p-3 border border-dashed border-white/10 rounded-lg cursor-pointer hover:border-primary/30 transition-colors"
                  >
                    <Upload className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Upload ảnh hoặc video nền</span>
                  </label>
                </>
              )}
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  )
}
