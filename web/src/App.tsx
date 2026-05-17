import { Suspense, lazy, type ReactNode } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Toaster } from "@/components/ui/sonner"
import { RequireRole } from '@/components/RequireRole'
import { SystemErrorBoundary } from '@/components/SystemErrorBoundary'

// Layouts
const AuthenticatedLayout = lazy(() => import('@/layouts/authenticated-layout'))
const UnauthenticatedLayout = lazy(() => import('@/layouts/unauthenticated-layout'))

// Pages
const CreatePage = lazy(() => import('./pages/CreatePage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const SharePage = lazy(() => import('./pages/SharePage'))

const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const ReviewPage = lazy(() => import('./pages/ReviewPage'))
const ResultPage = lazy(() => import('./pages/ResultPage'))
const LibraryPage = lazy(() => import('./pages/LibraryPage'))

function RouteFallback() {
  return (
    <div className="flex flex-1 items-center justify-center min-h-[60vh]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

export default function App() {
  const location = useLocation()

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <SystemErrorBoundary resetKey={location.key || location.pathname}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/share/:token" element={<SharePage />} />

            <Route element={<AuthenticatedLayout />}>
              <Route path="/create" element={<CreatePage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/review/:jobId" element={<ReviewPage />} />
              <Route path="/result/:jobId" element={<ResultPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/profile" element={<Navigate to="/settings" replace />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SystemErrorBoundary>
      </Suspense>
      <Toaster />
    </>
  )
}
