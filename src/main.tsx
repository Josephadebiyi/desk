import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './theme.tsx'
import { I18nProvider } from './i18n'
import { ForgotPassword, Login, Register, ResetPassword } from './pages/Auth.tsx'
import { SessionProvider } from './lib/session.tsx'
import EmailPreview from './pages/EmailPreview.tsx'
import Legal from './pages/Legal.tsx'
import DashboardLayout from './dashboard/DashboardLayout.tsx'
import Overview from './dashboard/Overview.tsx'
import Members from './dashboard/Members.tsx'
import Placeholder from './dashboard/Placeholder.tsx'
import Giving from './dashboard/Giving.tsx'
import Messaging from './dashboard/Messaging.tsx'
import Events from './dashboard/Events.tsx'
import DesignStudio from './dashboard/DesignStudio.tsx'
import ChurchAI from './dashboard/ChurchAI.tsx'
import Reports from './dashboard/Reports.tsx'
import Settings from './dashboard/Settings.tsx'
import Help from './dashboard/Help.tsx'
import Links from './dashboard/Links.tsx'
import { GivePage, JoinPage } from './pages/Public.tsx'
import { isAdminHost } from './lib/site'
import { captureSignupCode } from './lib/signupCode'

captureSignupCode()

// Staff console: separate chunk, only downloaded by staff.
const Admin = lazy(() => import('./admin/Admin.tsx'))

/**
 * Staff console on its own domain (e.g. admin.ziondesk.com → same Render service).
 * Any host starting with "admin.", VITE_ADMIN_HOST, or an admin-only build (npm run build:admin)
 * only serves /admin, /login and password reset.
 */
const ADMIN_HOST = isAdminHost()
if (ADMIN_HOST) {
  document.title = 'ZionDesk Admin'
  const meta = document.createElement('meta')
  meta.name = 'robots'
  meta.content = 'noindex, nofollow'
  document.head.appendChild(meta)
}
const adminRoute = (
  <Route
    path="/admin/*"
    element={
      <Suspense fallback={null}>
        <Admin />
      </Suspense>
    }
  />
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
    <SessionProvider>
    <ThemeProvider>
    <BrowserRouter>
      {ADMIN_HOST ? (
        <Routes>
          {adminRoute}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      ) : (
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/email-preview" element={<EmailPreview />} />
        <Route path="/legal" element={<Legal page="hub" />} />
        <Route path="/privacy" element={<Legal page="privacy" />} />
        <Route path="/terms" element={<Legal page="terms" />} />
        <Route path="/cookies" element={<Legal page="cookies" />} />
        <Route path="/dpa" element={<Legal page="dpa" />} />
        <Route path="/subprocessors" element={<Legal page="subprocessors" />} />
        <Route path="/refunds" element={<Legal page="refunds" />} />
        <Route path="/acceptable-use" element={<Legal page="aup" />} />
        <Route path="/join/:slug" element={<JoinPage />} />
        <Route path="/give/:slug" element={<GivePage />} />
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={null}>
              <Admin />
            </Suspense>
          }
        />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Overview />} />
          <Route path="members" element={<Members />} />
          <Route path="giving" element={<Giving />} />
          <Route path="messaging" element={<Messaging />} />
          <Route path="events" element={<Events />} />
          <Route path="design" element={<DesignStudio />} />
          <Route path="ai" element={<ChurchAI />} />
          <Route path="assistant" element={<Navigate to="/dashboard/ai" replace />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="help" element={<Help />} />
          <Route path="links" element={<Links />} />
          <Route path="*" element={<Placeholder />} />
        </Route>
        <Route path="*" element={<App />} />
      </Routes>
      )}
    </BrowserRouter>
    </ThemeProvider>
    </SessionProvider>
    </I18nProvider>
  </StrictMode>,
)
