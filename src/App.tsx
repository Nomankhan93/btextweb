import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { TeamPage } from './pages/TeamPage'
import { SettingsPage } from './pages/SettingsPage'
import { DevicesPage } from './pages/DevicesPage'
import { PhoneNumbersPage } from './pages/PhoneNumbersPage'
import { ImportsPage } from './pages/ImportsPage'
import { RecipientValidationPage } from './pages/RecipientValidationPage'
import { LoginPage } from './auth/LoginPage'
import { SignupPage } from './auth/SignupPage'
import { ForgotPasswordPage } from './auth/ForgotPasswordPage'
import { ResetPasswordPage } from './auth/ResetPasswordPage'
import { VerifyEmailPage } from './auth/VerifyEmailPage'
import { AuthCallbackPage } from './auth/AuthCallbackPage'
import { RequireAuth } from './auth/RequireAuth'
import { OnboardingPage } from './organizations/OnboardingPage'
import { InviteAcceptancePage } from './organizations/InviteAcceptancePage'
import { RequireOrganization } from './organizations/RequireOrganization'

export default function App() {
  return (
    <Routes>
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/auth/signup" element={<SignupPage />} />
      <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/verify" element={<VerifyEmailPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/invite/:token" element={<InviteAcceptancePage />} />
        <Route element={<RequireOrganization />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/campaigns" element={<PlaceholderPage title="Campaigns" description="Campaign execution remains intentionally unavailable until the device/cloud queue phases." />} />
            <Route path="/contacts" element={<PhoneNumbersPage />} />
            <Route path="/imports" element={<ImportsPage />} />
            <Route path="/imports/:importId/validate" element={<RecipientValidationPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/templates" element={<PlaceholderPage title="Templates" description="Reusable templates arrive later in the customer MVP phase." />} />
            <Route path="/reports" element={<PlaceholderPage title="Reports" description="Recipient-level reports follow cloud-to-device execution and status sync." />} />
            <Route path="/subscription" element={<PlaceholderPage title="Subscription" description="Platform subscriptions are introduced after the controlled real-device pilot." />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
