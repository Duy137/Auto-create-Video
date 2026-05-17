import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom"
import {
  Sparkles, LayoutDashboard, Plus, Film, Settings,
  Menu, Bell, Search, ChevronDown, ChevronLeft, ChevronRight, Sun, Moon,
  LogOut, Shield, Users, BarChart3, AlertTriangle, Trash2, X,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useAuth } from "@/context/AuthContext"
import {
  deleteAllNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationData,
} from "@/api/client"

/* ---------------- Sidebar nav config ---------------- */
const NAV = [
  { to: "/create",    label: "Tạo video mới",   icon: Plus, accent: true },
  { to: "/dashboard", label: "Bảng điều khiển", icon: LayoutDashboard },
  { to: "/library",   label: "Thư viện",        icon: Film },
]

/* ---------------- Sidebar ---------------- */
function Sidebar({
  open,
  isCollapsed,
  onClose,
  onToggleCollapsed,
}: {
  open: boolean
  isCollapsed: boolean
  onClose: () => void
  onToggleCollapsed: () => void
}) {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const isAdmin = user?.role === "admin" || user?.permissions?.includes("*")
  const tierName = user?.tier === "studio" ? "Studio" : user?.tier === "pro" ? "Pro" : "Starter"
  const quotaUsed = user?.quota_used_month ?? 0
  const quotaLimit = user?.quota_limit ?? 3
  const hasUnlimitedQuota = quotaLimit >= 999999
  const quotaLimitLabel = hasUnlimitedQuota ? "∞" : quotaLimit.toLocaleString("vi-VN")
  const usagePercent = hasUnlimitedQuota ? 100 : Math.min(100, (quotaUsed / Math.max(1, quotaLimit)) * 100)

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`
          fixed lg:sticky top-0 left-0 z-40 h-screen w-[260px] ${isCollapsed ? "lg:w-[84px]" : "lg:w-[260px]"} shrink-0
          flex flex-col gap-1 px-3 py-4
          border-r transition-[width,transform]
          ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
        `}
        style={{
          background: "var(--surface-0)",
          borderColor: "var(--border-subtle)",
        }}
      >
        {/* Logo */}
        <div className={`flex gap-2 py-2 mb-2 ${isCollapsed ? "flex-col items-center px-0" : "items-center justify-between px-1"}`}>
          <Link
            to="/"
            className={`flex min-w-0 items-center gap-2 ${isCollapsed ? "h-11 w-11 justify-center rounded-[var(--radius-lg)]" : "px-2"}`}
          >
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
              style={{ background: "var(--gradient-brand)" }}
            >
              <Sparkles size={18} strokeWidth={2.5} />
            </div>
            {!isCollapsed && (
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="text-base font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  AutoClip
                </span>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  text → video AI
                </span>
              </div>
            )}
          </Link>
          <button
            type="button"
            className="hidden h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-pill)] border transition hover:bg-[var(--surface-2)] lg:grid"
            onClick={onToggleCollapsed}
            aria-label={isCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
            title={isCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
            style={{
              borderColor: isCollapsed ? "var(--brand-200)" : "transparent",
              boxShadow: isCollapsed ? "var(--shadow-sm)" : undefined,
              color: "var(--text-tertiary)",
            }}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 mt-1">
          {NAV.map(({ to, label, icon: Icon, accent }) => {
            const active = pathname === to || (to !== "/dashboard" && pathname.startsWith(to))
            return (
              <Link
                key={to}
                to={to}
                onClick={onClose}
                title={isCollapsed ? label : undefined}
                className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] font-medium transition ${isCollapsed ? "h-12 justify-center" : ""}`}
                style={{
                  background: active ? "var(--brand-50)" : "transparent",
                  color: active ? "var(--brand-700)" : "var(--text-secondary)",
                  padding: isCollapsed ? "0" : "0.625rem 0.75rem",
                  fontSize: "0.875rem",
                }}
              >
                <span
                  className="grid shrink-0 place-items-center"
                  style={{
                    width: accent ? "2rem" : isCollapsed ? "2.25rem" : "1.125rem",
                    height: accent ? "2rem" : isCollapsed ? "2.25rem" : "1.125rem",
                    borderRadius: accent ? "var(--radius-pill)" : "0",
                    background: accent ? "var(--gradient-brand)" : "transparent",
                    color: accent ? "var(--text-on-brand)" : "inherit",
                    boxShadow: accent ? "var(--shadow-md)" : undefined,
                  }}
                >
                  <Icon size={accent ? 20 : 18} />
                </span>
                {!isCollapsed && label}
              </Link>
            )
          })}
        </nav>

        {/* Local tool version: Usage card / Admin nav removed */}

      </aside>
    </>
  )
}

/* ---------------- User dropdown menu ---------------- */
function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // close khi click ngoài hoặc bấm Esc
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const handleLogout = () => {
    setOpen(false)
    logout()
    navigate("/login", { replace: true })
  }

  const initial = (user?.username || user?.email || "U")[0].toUpperCase()
  const isAdmin = user?.role === "admin"

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-[var(--radius-pill)] hover:bg-[var(--surface-2)] transition"
        aria-label="Tài khoản"
        aria-expanded={open}
      >
        <div
          className="h-8 w-8 rounded-full grid place-items-center text-white text-sm font-semibold"
          style={{ background: "var(--gradient-brand)" }}
        >
          {initial}
        </div>
        <ChevronDown size={14} style={{ color: "var(--text-tertiary)" }} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-64 rounded-[var(--radius-lg)] overflow-hidden z-50"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {/* User header */}
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-full grid place-items-center text-white font-semibold"
                style={{ background: "var(--gradient-brand)" }}
              >
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">
                  {user?.username || "Khách"}
                </div>
                <div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
                  {user?.email || ""}
                </div>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <MenuItem icon={Settings} label="Hồ sơ & cài đặt" onClick={() => { setOpen(false); navigate("/settings") }} />
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick, danger }:
  { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition hover:bg-[var(--surface-2)]"
      style={{ color: danger ? "var(--status-danger)" : "var(--text-primary)" }}
    >
      <Icon size={16} />
      {label}
    </button>
  )
}

function formatNotificationTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  })
}

/* ---------------- Topbar ---------------- */
function Topbar({ onMenu }: { onMenu: () => void }) {
  const { theme, setTheme } = useTheme()
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const locationRef = useRef(location)
  const searchDebounceRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const notificationRef = useRef<HTMLDivElement>(null)
  const [librarySearchDraft, setLibrarySearchDraft] = useState("")
  const [isSearchComposing, setIsSearchComposing] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationData[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const isLibrary = location.pathname === "/library"
  const librarySearch = isLibrary ? new URLSearchParams(location.search).get("q") || "" : ""

  useEffect(() => {
    locationRef.current = location
  }, [location])

  useEffect(() => {
    if (!isSearchComposing) {
      setLibrarySearchDraft(librarySearch)
    }
  }, [isSearchComposing, librarySearch])

  useEffect(() => {
    if (!isLibrary && searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = null
    }
  }, [isLibrary])

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getNotifications()
      .then((data) => {
        if (cancelled) return
        setNotifications(data.notifications || [])
        setUnreadCount(Number(data.unread_count || 0))
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof window.setTimeout> | null = null
    let alive = true

    const connect = () => {
      if (!alive) return
      es = new EventSource("/api/jobs/stream", { withCredentials: true })

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.event !== "notification" || typeof data.id !== "number") return

          const nextNotification: NotificationData = {
            id: data.id,
            title: String(data.title || "Thông báo"),
            message: typeof data.message === "string" ? data.message : null,
            type: String(data.type || "info"),
            is_read: false,
            action_url: typeof data.action_url === "string" ? data.action_url : null,
            created_at: typeof data.created_at === "string" ? data.created_at : new Date().toISOString(),
          }

          setNotifications((prev) => [
            nextNotification,
            ...prev.filter((item) => item.id !== nextNotification.id),
          ])
          setUnreadCount((count) => count + 1)
        } catch {}
      }

      es.onerror = () => {
        es?.close()
        es = null
        if (alive) {
          reconnectTimer = window.setTimeout(connect, 5000)
        }
      }
    }

    connect()

    return () => {
      alive = false
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      es?.close()
    }
  }, [user?.id])

  useEffect(() => {
    if (!notificationOpen) return
    const onClick = (event: MouseEvent) => {
      if (!notificationRef.current?.contains(event.target as Node)) {
        setNotificationOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [notificationOpen])

  const handleReadAllNotifications = async () => {
    if (notifications.length === 0) return
    setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })))
    setUnreadCount(0)
    try {
      await markAllNotificationsRead()
    } catch {
      void getNotifications()
        .then((data) => {
          setNotifications(data.notifications || [])
          setUnreadCount(Number(data.unread_count || 0))
        })
        .catch(() => {})
    }
  }

  const handleDeleteAllNotifications = async () => {
    if (notifications.length === 0) return
    const confirmed = window.confirm("Xóa tất cả thông báo?")
    if (!confirmed) return

    const previousNotifications = notifications
    const previousUnreadCount = unreadCount
    setNotifications([])
    setUnreadCount(0)
    try {
      await deleteAllNotifications()
    } catch {
      setNotifications(previousNotifications)
      setUnreadCount(previousUnreadCount)
    }
  }

  const handleNotificationClick = async (notification: NotificationData) => {
    setNotificationOpen(false)
    if (!notification.is_read) {
      setNotifications((prev) => prev.map((item) => (
        item.id === notification.id ? { ...item, is_read: true } : item
      )))
      setUnreadCount((count) => Math.max(0, count - 1))
      try {
        await markNotificationRead(notification.id)
      } catch {}
    }
    if (notification.action_url) {
      navigate(notification.action_url)
    }
  }

  const handleLibrarySearch = (value: string) => {
    const currentLocation = locationRef.current
    if (currentLocation.pathname !== "/library") return

    const params = new URLSearchParams(currentLocation.search)
    const nextValue = value.trim()

    if (nextValue) {
      params.set("q", nextValue)
    } else {
      params.delete("q")
    }

    const nextSearch = params.toString()
    navigate(`${currentLocation.pathname}${nextSearch ? `?${nextSearch}` : ""}`, { replace: true })
  }

  const scheduleLibrarySearch = (value: string) => {
    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current)
    }

    searchDebounceRef.current = window.setTimeout(() => {
      searchDebounceRef.current = null
      handleLibrarySearch(value)
    }, 250)
  }

  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-3 px-4 lg:px-6 h-12 border-b backdrop-blur-md"
      style={{
        background: "color-mix(in srgb, var(--surface-1) 80%, transparent)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <button
        onClick={onMenu}
        className="lg:hidden p-2 rounded-md hover:bg-[var(--surface-2)]"
        aria-label="Mở menu"
      >
        <Menu size={20} />
      </button>

      {isLibrary ? (
        <div className="flex-1 max-w-md relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-tertiary)" }}
          />
          <input
            value={librarySearchDraft}
            onChange={(event) => {
              const nextValue = event.target.value
              setLibrarySearchDraft(nextValue)
              if (event.nativeEvent.isComposing || isSearchComposing) return
              scheduleLibrarySearch(nextValue)
            }}
            onCompositionStart={() => {
              setIsSearchComposing(true)
              if (searchDebounceRef.current) {
                window.clearTimeout(searchDebounceRef.current)
                searchDebounceRef.current = null
              }
            }}
            onCompositionEnd={(event) => {
              const nextValue = event.currentTarget.value
              setIsSearchComposing(false)
              setLibrarySearchDraft(nextValue)
              handleLibrarySearch(nextValue)
            }}
            onBlur={() => handleLibrarySearch(librarySearchDraft)}
            placeholder="Tìm video theo tên..."
            className="field h-8 text-sm pl-8"
            style={{ paddingLeft: "2rem" }}
          />
        </div>
      ) : null}

      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--surface-2)]"
          aria-label="Chuyển dark/light"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div ref={notificationRef} className="relative">
          <button
            className="relative p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--surface-2)]"
            aria-label="Thông báo"
            aria-expanded={notificationOpen}
            onClick={() => setNotificationOpen((open) => !open)}
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[var(--status-danger)] text-white text-[10px] leading-4 text-center font-semibold">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {notificationOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-[22rem] max-w-[calc(100vw-1rem)] rounded-[var(--radius-lg)] overflow-hidden z-50"
              style={{
                background: "var(--notification-bg)",
                border: "1px solid var(--border-subtle)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div className="flex items-start justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
                <div>
                  <div className="text-sm font-semibold">Thông báo</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {notifications.length} thông báo
                    {unreadCount > 0 ? ` • ${unreadCount} chưa đọc` : " • Đã đọc hết"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className="text-xs font-medium hover:underline"
                      style={{ color: "var(--brand-600)" }}
                      onClick={handleReadAllNotifications}
                    >
                      Đã đọc
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                      style={{ color: "var(--status-danger)" }}
                      onClick={handleDeleteAllNotifications}
                    >
                      <Trash2 size={13} />
                      Xóa tất cả
                    </button>
                  )}
                  <button
                    type="button"
                    className="sm:hidden p-1 rounded hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--text-tertiary)" }}
                    onClick={() => setNotificationOpen(false)}
                    aria-label="Đóng"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              <div
                className="notification-scroll max-h-[min(22rem,55vh)] overflow-y-scroll overscroll-contain"
                style={{ scrollbarGutter: "stable" }}
              >
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
                    Chưa có thông báo
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => void handleNotificationClick(notification)}
                      className="w-full px-4 py-3 text-left border-b transition hover:bg-[var(--notification-hover-bg)]"
                      style={{
                        borderColor: "var(--border-subtle)",
                        background: notification.is_read ? "transparent" : "var(--notification-unread-bg)",
                      }}
                    >
                      <div className="flex items-start gap-2">
                        {!notification.is_read && (
                          <span className="mt-1.5 h-2 w-2 rounded-full bg-[var(--brand-500)] shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div
                              className="text-sm font-semibold truncate"
                              style={{ color: notification.type === "error" ? "var(--status-danger)" : "var(--text-primary)" }}
                            >
                              {notification.title}
                            </div>
                            <span className="text-[10px] shrink-0" style={{ color: "var(--text-tertiary)" }}>
                              {formatNotificationTime(notification.created_at)}
                            </span>
                          </div>
                          {notification.message && (
                            <div className="mt-1 text-xs leading-relaxed line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                              {notification.message}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <UserMenu />
      </div>
    </header>
  )
}

/* ---------------- Layout shell ---------------- */
export default function AuthenticatedLayout({ children }: { children?: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    window.localStorage.getItem("autoclip_sidebar_collapsed") === "1"
  ))

  useEffect(() => {
    window.localStorage.setItem("autoclip_sidebar_collapsed", sidebarCollapsed ? "1" : "0")
  }, [sidebarCollapsed])

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--surface-1)", color: "var(--text-primary)" }}>
      <Sidebar
        open={navOpen}
        isCollapsed={sidebarCollapsed}
        onClose={() => setNavOpen(false)}
        onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenu={() => setNavOpen(true)} />
        <main className="flex-1 flex flex-col min-h-0 overflow-y-auto px-4 lg:px-6 py-2 lg:py-3 relative">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  )
}
