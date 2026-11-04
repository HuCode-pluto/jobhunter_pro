import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import DashboardPage from './pages/DashboardPage'
import ConfigPage from './pages/ConfigPage'
import LibraryPage from './pages/LibraryPage'
import InterviewsPage from './pages/InterviewsPage'
import QuestionBankPage from './pages/QuestionBankPage'
import MockInterviewPage from './pages/MockInterviewPage'
import CareerPage from './pages/CareerPage'
import SkillMapPage from './pages/SkillMapPage'
import { OnboardingTour } from './components/onboarding/OnboardingTour'

function JobsPage() {
  return <DashboardPage view="jobs" />
}

function MonitorPage() {
  return <DashboardPage view="monitor" />
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <Sidebar />
        <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="min-w-0 flex-1 overflow-y-auto p-3 md:p-6">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/monitor" element={<MonitorPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/interviews" element={<InterviewsPage />} />
              <Route path="/question-bank" element={<QuestionBankPage />} />
              <Route path="/mock" element={<MockInterviewPage />} />
              <Route path="/career" element={<CareerPage />} />
              <Route path="/skillmap" element={<SkillMapPage />} />
              <Route path="/config" element={<ConfigPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
        <OnboardingTour />
      </div>
    </BrowserRouter>
  )
}
