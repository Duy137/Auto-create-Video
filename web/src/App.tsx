import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Toaster } from "@/components/ui/sonner"

// Layouts
import AuthenticatedLayout from '@/layouts/authenticated-layout'
import UnauthenticatedLayout from '@/layouts/unauthenticated-layout'

// Temporary placeholders for pages until Phase 4
// Using dynamic imports or just importing existing ones
// NOTE: We need to rename existing pages to .tsx or create wrapper components
import CreatePage from './pages/CreatePage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'

/**
 * Protected route wrapper — redirects to /login if not authenticated.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default function App() {
  const { isAuthenticated, loading } = useAuth()

  return (
    <>
      <Routes>
        {/* Public Routes */}
        <Route element={<UnauthenticatedLayout />}>
          <Route path="/login" element={
            loading ? null :
            isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
          } />
        </Route>

        {/* Private Routes */}
        <Route element={
          <ProtectedRoute>
            <AuthenticatedLayout />
          </ProtectedRoute>
        }>
          <Route path="/" element={<CreatePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<div className="p-4">Cài đặt (Coming soon)</div>} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}
