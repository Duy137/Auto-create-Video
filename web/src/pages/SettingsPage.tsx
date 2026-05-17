import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import { showErrorToast } from "@/components/SystemErrorReport"
import { BadgeCheck, Palette, Shield, User } from "lucide-react"

/* ============================================================
   Settings — 3 tab thực sự hoạt động
   ============================================================ */

const TABS = [
  { id: "profile",    label: "Hồ sơ",      icon: User },
  { id: "plan",       label: "Gói",         icon: BadgeCheck },
  { id: "appearance", label: "Giao diện",   icon: Palette },
] as const

type TabId = typeof TABS[number]["id"]

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("profile")
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          Cài đặt
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Quản lý tài khoản, gói dịch vụ và tuỳ chọn của bạn.
        </p>
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-6">
        {/* Tab nav */}
        <nav className="surface-card p-2 self-start sticky top-20">
          {TABS.map(t => {
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm font-medium transition"
                style={{
                  background: active ? "var(--brand-50)" : "transparent",
                  color:      active ? "var(--brand-700)" : "var(--text-secondary)",
                }}>
                <t.icon size={16} />
                {t.label}
              </button>
            )
          })}
        </nav>

        {/* Panel */}
        <div className="space-y-5">
          {tab === "profile"    && <ProfileTab />}
          {tab === "plan"       && <PlanTab />}
          {tab === "appearance" && <AppearanceTab />}
        </div>
      </div>
    </div>
  )
}

/* ---------------- Card primitive ---------------- */
function Card({ title, desc, children, action }: { title: string; desc?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="surface-card p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {desc && <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{desc}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider mb-1.5 block"
        style={{ color: "var(--text-tertiary)" }}>{label}</span>
      {children}
    </label>
  )
}

/* ---------------- Profile ---------------- */
function ProfileTab() {
  const { user, updateMe, changePassword } = useAuth()
  const [displayName, setDisplayName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [changingPw, setChangingPw] = useState(false)

  useEffect(() => {
    setDisplayName(user?.display_name || user?.username || "")
    setAvatarUrl(user?.avatar_url || "")
  }, [user?.display_name, user?.username, user?.avatar_url])

  const initial = (displayName || user?.username || user?.email || "U")[0].toUpperCase()
  const roleLabel = user?.role === "admin"
    ? "Quản trị viên"
    : user?.role === "user"
      ? "Người dùng"
      : user?.role || "Người dùng"

  const handleSave = async () => {
    setSubmitting(true)
    try {
      await updateMe({ display_name: displayName, avatar_url: avatarUrl })
      toast.success("Đã lưu thông tin hồ sơ")
    } catch (e: any) {
      showErrorToast(e, {
        source: "settings_profile",
        fallback: "Không thể lưu thông tin hồ sơ",
        prefix: "Không thể lưu thông tin hồ sơ",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) {
      toast.error("Mật khẩu xác nhận không khớp")
      return
    }
    if (newPw.length < 8) {
      toast.error("Mật khẩu mới phải ít nhất 8 ký tự")
      return
    }
    setChangingPw(true)
    try {
      await changePassword(currentPw, newPw)
      toast.success("Đã đổi mật khẩu thành công")
      setCurrentPw("")
      setNewPw("")
      setConfirmPw("")
    } catch (e: any) {
      showErrorToast(e, {
        source: "settings_password",
        fallback: "Không thể đổi mật khẩu",
        prefix: "Không thể đổi mật khẩu",
      })
    } finally {
      setChangingPw(false)
    }
  }

  return (
    <>
      <Card title="Thông tin tài khoản" desc="Hồ sơ công khai và thông tin đăng nhập">
        <div className="mb-5">
          <div className="h-16 w-16 rounded-full overflow-hidden grid place-items-center text-white text-xl font-bold"
            style={{ background: "var(--gradient-brand)" }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <span>{initial}</span>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Tên hiển thị">
            <input className="field" value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </Field>
          <Field label="Tên người dùng">
            <input className="field" value={user?.username || ""} readOnly disabled />
          </Field>
          <Field label="Email">
            <input className="field" value={user?.email || ""} readOnly disabled />
          </Field>
          <Field label="Vai trò">
            <div className="field flex items-center gap-2">
              <Shield size={16} style={{ color: user?.role === "admin" ? "var(--brand-600)" : "var(--text-tertiary)" }} />
              <span>{roleLabel}</span>
            </div>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Avatar URL">
              <input
                className="field"
                placeholder="https://example.com/avatar.jpg"
                value={avatarUrl}
                onChange={e => setAvatarUrl(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <button className="btn-brand" onClick={handleSave} disabled={submitting}>
            {submitting ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
        </div>
      </Card>

      <Card title="Đổi mật khẩu">
        <div className="grid gap-4">
          <Field label="Mật khẩu hiện tại">
            <input
              type="password"
              className="field"
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Field label="Mật khẩu mới">
            <input
              type="password"
              className="field"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Xác nhận mật khẩu mới">
            <input
              type="password"
              className="field"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
        </div>
        <div className="flex justify-end mt-5">
          <button
            className="btn-brand"
            onClick={handleChangePassword}
            disabled={changingPw || !currentPw || !newPw || !confirmPw}
          >
            {changingPw ? "Đang đổi..." : "Đổi mật khẩu"}
          </button>
        </div>
      </Card>
    </>
  )
}

/* ---------------- Plan ---------------- */
function PlanTab() {
  const { user } = useAuth()
  const tierName = user?.tier === "studio" ? "Studio" : user?.tier === "pro" ? "Pro" : "Starter"
  const quotaUsed = user?.quota_used_month ?? 0
  const quotaLimit = user?.quota_limit ?? 3
  const hasUnlimitedQuota = quotaLimit >= 999999
  const quotaLimitLabel = hasUnlimitedQuota ? "∞" : quotaLimit.toLocaleString("vi-VN")
  const percentage = hasUnlimitedQuota ? 100 : Math.min(100, (quotaUsed / Math.max(1, quotaLimit)) * 100)

  return (
    <div className="rounded-[var(--radius-lg)] p-6 text-white"
      style={{ background: "var(--gradient-aurora)" }}>
      <span className="pill" style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}>Gói hiện tại</span>
      <h2 className="text-2xl font-bold mt-2" style={{ fontFamily: "var(--font-display)" }}>Gói {tierName}</h2>
      <p className="text-sm opacity-90 mt-1">
        {quotaUsed.toLocaleString("vi-VN")}/{quotaLimitLabel} video tháng này
      </p>
      <div className="mt-4 h-2 rounded-full bg-white/20 overflow-hidden">
        <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}

/* ---------------- Appearance ---------------- */
function AppearanceTab() {
  const { theme, setTheme } = useTheme()
  const themes = [
    { id: "light",  name: "Sáng",         preview: "#fafafb" },
    { id: "dark",   name: "Tối",           preview: "#0b0b14" },
    { id: "system", name: "Theo hệ thống", preview: "linear-gradient(90deg,#fafafb 50%,#0b0b14 50%)" },
  ]
  return (
    <Card title="Giao diện">
      <div className="grid sm:grid-cols-3 gap-3">
        {themes.map((t) => {
          const selected = theme === t.id
          return (
            <button key={t.id}
              className="rounded-[var(--radius-md)] p-3 border text-left transition"
              onClick={() => setTheme(t.id)}
              style={{ borderColor: selected ? "var(--brand-500)" : "var(--border-default)", boxShadow: selected ? "var(--shadow-glow)" : undefined }}>
              <div className="aspect-[16/10] rounded-[var(--radius-sm)] mb-2 border" style={{ background: t.preview, borderColor: "var(--border-subtle)" }} />
              <div className="text-sm font-medium">{t.name}</div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
