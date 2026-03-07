import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { hasRoleAccess } from '../lib/roles'

function ProtectedRoute({ allowedRoles = [], children }) {
  const { isAuthenticated, loading, role, profileError } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-600">Checking session...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-lg rounded-lg border border-rose-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Profile Setup Required</h2>
          <p className="mt-2 text-sm text-slate-600">
            {profileError ||
              'This account does not have a profile record yet. Complete the SQL setup in README first.'}
          </p>
        </div>
      </div>
    )
  }

  if (!hasRoleAccess(role, allowedRoles)) {
    return <Navigate to="/dashboard" replace />
  }

  return children || <Outlet />
}

export default ProtectedRoute
