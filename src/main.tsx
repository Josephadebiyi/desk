import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { ThemeProvider } from './theme.tsx'
import { I18nProvider } from './i18n'
import { SessionProvider } from './lib/session.tsx'
import { isAdminHost } from './lib/site'
import { captureSignupCode } from './lib/signupCode'

captureSignupCode()

// Every page is its own download: the website, the church dashboard and the staff console only load what they show.
const App = lazy(() => import('./App.tsx'))
const Admin = lazy(() => import('./admin/Admin.tsx'))
const Login = lazy(() => import('./pages/Auth.tsx').then((m) => ({ default: m.Login })))
const Register = lazy(() => import('./pages/Auth.tsx').then((m) => ({ default: m.Register })))
const ForgotPassword = lazy(() => import('./pages/Auth.tsx').then((m) => ({ default: m.ForgotPassword })))
const ResetPassword = lazy(() => import('./pages/Auth.tsx').then((m) => ({ default: m.ResetPassword })))
const EmailPreview = lazy(() => import('./pages/EmailPreview.tsx'))
const Legal = lazy(() => import('./pages/Legal.tsx'))
const JoinPage = lazy(() => import('./pages/Public.tsx').then((m) => ({ default: m.JoinPage })))
const GivePage = lazy(() => import('./pages/Public.tsx').then((m) => ({ default: m.GivePage })))
const CheckinPage = lazy(() => import('./pages/Public.tsx').then((m) => ({ default: m.CheckinPage })))
const DashboardLayout = lazy(() => import('./dashboard/DashboardLayout.tsx'))
const Overview = lazy(() => import('./dashboard/Overview.tsx'))
const Members = lazy(() => import('./dashboard/Members.tsx'))
const Placeholder = lazy(() => import('./dashboard/Placeholder.tsx'))
const Giving = lazy(() => import('./dashboard/Giving.tsx'))
const Messaging = lazy(() => import('./dashboard/Messaging.tsx'))
const Events = lazy(() => import('./dashboard/Events.tsx'))
const DesignStudio = lazy(() => import('./dashboard/DesignStudio.tsx'))
const ChurchAI = lazy(() => import('./dashboard/ChurchAI.tsx'))
const Reports = lazy(() => import('./dashboard/Reports.tsx'))
const Settings = lazy(() => import('./dashboard/Settings.tsx'))
const Help = lazy(() => import('./dashboard/Help.tsx'))
const Links = lazy(() => import('./dashboard/Links.tsx'))
const Attendance = lazy(() => import('./dashboard/Attendance.tsx'))
const Branches = lazy(() => import('./dashboard/Branches.tsx'))

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
const adminRoute = <Route path="/admin/*" element={<Admin />} />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
    <SessionProvider>
    <ThemeProvider>
    <BrowserRouter>
      <Suspense fallback={<div className="page-loading" aria-busy="true" />}>
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
        <Route path="/checkin/:slug" element={<CheckinPage />} />
        {adminRoute}
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
          <Route path="attendance" element={<Attendance />} />
          <Route path="branches" element={<Branches />} />
          <Route path="*" element={<Placeholder />} />
        </Route>
        <Route path="*" element={<App />} />
      </Routes>
      )}
      </Suspense>
    </BrowserRouter>
    </ThemeProvider>
    </SessionProvider>
    </I18nProvider>
  </StrictMode>,
)
