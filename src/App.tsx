import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'

import { useAuth } from './auth/context'
import Debate from './pages/Debate'
import Diagnostic from './pages/Diagnostic'
import Results from './pages/Results'
import SignIn from './pages/SignIn'
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
    <Routes>
      <Route
        path="/"
        element={
          !user ? (
            <SignIn />
          ) : (
            <Navigate to={diagnostic ? '/debate' : '/diagnostic'} replace />
          )
        }
      />
      <Route path="/diagnostic" element={<RequireAuth>{<Diagnostic />}</RequireAuth>} />
      <Route path="/debate" element={<RequireAuth>{<Debate />}</RequireAuth>} />
      <Route path="/results/:sessionId" element={<RequireAuth>{<Results />}</RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/" replace />
}
