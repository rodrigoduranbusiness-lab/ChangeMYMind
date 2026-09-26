import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'

import { useAuth } from './auth/context'
import SettingsMenu from './components/SettingsMenu'
import Debate from './pages/Debate'
import Briefing from './pages/Briefing'
import Diagnostic from './pages/Diagnostic'
import Privacy from './pages/Privacy'
import Results from './pages/Results'
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
  const { user, diagnostic, loading } = useAuth()

  if (loading) {
    return (
      <div style={s.page}>
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
      {user ? <SettingsMenu /> : null}
      <Routes>
        <Route
          path="/"
          element={
            !user ? (
              <SignIn />
            ) : (
              <Navigate to={diagnostic ? '/briefing' : '/diagnostic'} replace />
            )
          }
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
        <Route path="/diagnostic" element={<RequireAuth>{<Diagnostic />}</RequireAuth>} />
        <Route path="/briefing" element={<RequireAuth>{<Briefing />}</RequireAuth>} />
        <Route path="/debate" element={<RequireAuth>{<Debate />}</RequireAuth>} />
        <Route path="/results/:sessionId" element={<RequireAuth>{<Results />}</RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/" replace />
}
