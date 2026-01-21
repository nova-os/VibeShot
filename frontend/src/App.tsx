import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { Toaster } from '@/components/ui/sonner'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { Layout } from '@/components/layout/Layout'
import { AuthPage } from '@/pages/AuthPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { SiteDetailPage } from '@/pages/SiteDetailPage'
import { ScreenshotsPage } from '@/pages/ScreenshotsPage'
import { SettingsPage } from '@/pages/SettingsPage'

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/sites/:siteId" element={<SiteDetailPage />} />
            <Route path="/sites/:siteId/pages/:pageId" element={<ScreenshotsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="bottom-right" />
    </AuthProvider>
  )
}

export default App
