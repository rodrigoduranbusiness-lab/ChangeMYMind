import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'

import { useAuth } from './auth/context'
import ColorBlobs from './components/ColorBlobs'
import PageAtmosphere from './components/PageAtmosphere'
import Seo from './components/Seo'
import SettingsMenu from './components/SettingsMenu'
import Debate from './pages/Debate'
import Diagnostic from './pages/Diagnostic'
import Mode from './pages/Mode'
import Privacy from './pages/Privacy'
import Results from './pages/Results'
import Stance from './pages/Stance'
import TextDebate from './pages/TextDebate'
import Today from './pages/Today'
import {
  EducationHome,
  StudentAssignment,
  StudentHome,
  StudentJoin,
  TeacherClassAssignments,
  TeacherClassLayout,
  TeacherClassRoster,
  TeacherClassStudentDetail,
  TeacherClassSubmission,
  TeacherDashboard,
} from './education/EducationRoutes'
import Education from './pages/Education'
import SignIn from './pages/SignIn'
import Terms from './pages/Terms'
import * as s from './theme'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ ...s.page, background: s.color.bg }}>
        <Seo />
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: `2px solid ${s.color.border}`,
            borderTopColor: s.color.accent,
            animation: 'cg-spin 700ms linear infinite',
          }}
        />
      </div>
    )
  }

  return (
    <>
      <Seo />
      <PageAtmosphere />
      {user ? <ColorBlobs /> : null}
      {user ? <SettingsMenu /> : null}
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh' }}>
      <Routes>
        <Route
          path="/"
          element={!user ? <SignIn /> : <Navigate to="/today" replace />}
        />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/education" element={<Education />}>
          <Route index element={<EducationHome />} />
          <Route path="teacher" element={<TeacherDashboard />} />
          <Route path="teacher/class/:classId" element={<TeacherClassLayout />}>
            <Route index element={<TeacherClassAssignments />} />
            <Route path="students" element={<TeacherClassRoster />} />
            <Route path="students/:studentId" element={<TeacherClassStudentDetail />} />
            <Route
              path="assignments/:assignmentId/students/:studentId"
              element={<TeacherClassSubmission />}
            />
          </Route>
          <Route path="student" element={<StudentJoin />} />
          <Route path="student/home" element={<StudentHome />} />
          <Route path="student/assignment/:assignmentId" element={<StudentAssignment />} />
        </Route>
        <Route path="/today" element={<RequireAuth>{<Today />}</RequireAuth>} />
        <Route path="/stance" element={<RequireAuth>{<Stance />}</RequireAuth>} />
        <Route path="/mode" element={<RequireAuth>{<Mode />}</RequireAuth>} />
        <Route path="/text" element={<RequireAuth>{<TextDebate />}</RequireAuth>} />
        <Route path="/diagnostic" element={<RequireAuth>{<Diagnostic />}</RequireAuth>} />
        {/* Briefing/rules carousel retired for MVP — daily path goes Today → Stance → Mode → Debate. */}
        <Route path="/briefing" element={<Navigate to="/today" replace />} />
        <Route path="/debate" element={<RequireAuth>{<Debate />}</RequireAuth>} />
        <Route path="/results/:sessionId" element={<RequireAuth>{<Results />}</RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </div>
    </>
  )
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/" replace />
}
