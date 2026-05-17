import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Clapperboard, CircleAlert, LoaderCircle, Download } from 'lucide-react'

import { getPublicShare, SYSTEM_ERROR_MESSAGE, toUserErrorMessage, type PublicShareData } from '@/api/client'
import { SystemErrorPanel } from '@/components/SystemErrorReport'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function SharePage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<PublicShareData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<unknown>(null)

  useEffect(() => {
    if (!token) {
      setError('Mã chia sẻ không hợp lệ')
      setLoading(false)
      return
    }

    setLoading(true)
    getPublicShare(token)
      .then((payload) => {
        setData(payload)
        setError(null)
        setErrorDetail(null)
      })
      .catch((err: any) => {
        setError(toUserErrorMessage(err?.message || 'Không thể tải video chia sẻ', err?.status))
        setErrorDetail(err)
      })
      .finally(() => setLoading(false))
  }, [token])

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center rounded-full border border-primary/30 p-3">
            <Clapperboard className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Video được chia sẻ từ AutoClip</h1>
          <p className="text-sm text-muted-foreground">Xem video được chia sẻ công khai</p>
        </div>

        <Card className="border-primary/10 bg-card/70 backdrop-blur-sm">
          {loading ? (
            <CardContent className="py-20 flex items-center justify-center gap-3 text-muted-foreground">
              <LoaderCircle className="h-5 w-5 animate-spin" /> Đang tải video...
            </CardContent>
          ) : error ? (
            <CardContent className="py-20 text-center space-y-3">
              {error === SYSTEM_ERROR_MESSAGE ? (
                <div className="max-w-sm mx-auto text-left">
                  <SystemErrorPanel source="share" detail={errorDetail} />
                </div>
              ) : (
                <>
                  <CircleAlert className="h-8 w-8 mx-auto text-destructive" />
                  <p className="text-sm text-muted-foreground">{error}</p>
                </>
              )}
            </CardContent>
          ) : data ? (
            <>
              <CardHeader>
                <CardTitle className="text-xl">{data.title}</CardTitle>
                <CardDescription>
                  Lượt xem: {data.share_views} | Tạo lúc: {new Date(data.created_at).toLocaleString('vi-VN')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg overflow-hidden border bg-black">
                  <video
                    src={data.video_url}
                    poster={data.thumbnail_url || undefined}
                    controls
                    className="w-full h-auto max-h-[75vh] object-contain"
                    playsInline
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    render={<a href={data.video_url} target="_blank" rel="noreferrer" />}
                  >
                    <Download className="h-4 w-4 mr-2" /> Tải video
                  </Button>
                  <Button variant="ghost" render={<Link to="/login" />}>
                    Mở AutoClip
                  </Button>
                </div>
              </CardContent>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
