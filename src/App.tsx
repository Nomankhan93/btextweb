import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SettingsPage } from './pages/SettingsPage'
import { DevicesPage } from './pages/DevicesPage'
import { PhoneNumbersPage } from './pages/PhoneNumbersPage'
import { ImportsPage } from './pages/ImportsPage'
import { RecipientValidationPage } from './pages/RecipientValidationPage'
import { ConsentSuppressionPage } from './pages/ConsentSuppressionPage'
import { RecipientEligibilityPage } from './pages/RecipientEligibilityPage'
import { MessageComposerPage } from './pages/MessageComposerPage'
import { LoginPage } from './auth/LoginPage'
import { SignupPage } from './auth/SignupPage'
import { ForgotPasswordPage } from './auth/ForgotPasswordPage'
import { ResetPasswordPage } from './auth/ResetPasswordPage'
import { VerifyEmailPage } from './auth/VerifyEmailPage'
import { AuthCallbackPage } from './auth/AuthCallbackPage'
import { RequireAuth } from './auth/RequireAuth'
import { RequireWorkspace } from './workspace/RequireWorkspace'

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
        <Route element={<RequireWorkspace />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/campaigns" element={<PlaceholderPage title="Campaigns" description="Campaign confirmation becomes available after SMS usage estimation. Use Composer for your editable message workflow." />} />
            <Route path="/composer" element={<MessageComposerPage />} />
            <Route path="/contacts" element={<PhoneNumbersPage />} />
            <Route path="/imports" element={<ImportsPage />} />
            <Route path="/imports/:importId/validate" element={<RecipientValidationPage />} />
            <Route path="/recipient-previews/:previewId/eligibility" element={<RecipientEligibilityPage />} />
            <Route path="/consent-suppression" element={<ConsentSuppressionPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/templates" element={<PlaceholderPage title="Templates" description="Reusable templates are planned after the core send workflow is complete." />} />
            <Route path="/reports" element={<PlaceholderPage title="Reports" description="Recipient-level reports follow cloud-to-phone execution and status synchronization." />} />
            <Route path="/subscription" element={<PlaceholderPage title="Subscription" description="BulkText subscriptions will manage access to the platform while SMS charges remain with your mobile operator." />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
