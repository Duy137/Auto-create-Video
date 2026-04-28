import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import { LogIn, UserPlus, Eye, EyeOff } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { login, register } = useAuth()
  const navigate = useNavigate()

  const validate = () => {
    const errs: Record<string, string> = {}
    if (username.length < 3) errs.username = 'Tối thiểu 3 ký tự'
    if (password.length < 8) errs.password = 'Tối thiểu 8 ký tự'
    if (mode === 'register' && (!email.includes('@') || !email.includes('.'))) {
      errs.email = 'Vui lòng nhập email hợp lệ'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(username, password)
        toast.success('Chào mừng quay trở lại!')
      } else {
        await register(username, email, password)
        toast.success('Tạo tài khoản thành công!')
      }
      navigate('/')
    } catch (err: any) {
      toast.error(err.message || 'Có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <span className="text-2xl">🔶</span>
          </div>
          <CardTitle className="text-2xl">AutoClip AI</CardTitle>
          <CardDescription>
            Tạo video từ văn bản, được trang bị AI
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="mb-6 flex rounded-lg bg-muted p-1">
            <button
              type="button"
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
                mode === 'login' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => { setMode('login'); setErrors({}) }}
            >
              <span className="flex items-center justify-center gap-2">
                <LogIn className="h-4 w-4" />
                Đăng nhập
              </span>
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
                mode === 'register' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => { setMode('register'); setErrors({}) }}
            >
              <span className="flex items-center justify-center gap-2">
                <UserPlus className="h-4 w-4" />
                Đăng ký
              </span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Tên người dùng</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ví dụ: auto_clip_ai"
                autoComplete="username"
                autoFocus
                className={errors.username ? 'border-destructive' : ''}
              />
              {errors.username && <p className="text-sm text-destructive">{errors.username}</p>}
            </div>

            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                  className={errors.email ? 'border-destructive' : ''}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className={`pr-10 ${errors.password ? 'border-destructive' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>

            <Button type="submit" className="w-full mt-6" disabled={submitting}>
              {submitting ? '...' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản mới'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
