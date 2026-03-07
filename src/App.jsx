import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'
import { useAuth } from './context/AuthContext'
import { ROLES } from './lib/roles'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import ManagerApprovalPage from './pages/ManagerApprovalPage'
import NewRequestPage from './pages/NewRequestPage'
import RequestsPage from './pages/RequestsPage'

function FallbackRedirect() {
  const { isAuthenticated } = useAuth()
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />
}

function App() {
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route
            path="/new-request"
            element={
              <ProtectedRoute allowedRoles={[ROLES.STAFF, ROLES.ADMIN]}>
                <NewRequestPage />
              </ProtectedRoute>
            }
          />
          <Route path="/requests" element={<RequestsPage />} />
          <Route
            path="/manager-approval"
            element={
              <ProtectedRoute allowedRoles={[ROLES.MANAGER, ROLES.ADMIN]}>
                <ManagerApprovalPage />
              </ProtectedRoute>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<FallbackRedirect />} />
    </Routes>
  )
}

export default App
