import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { hasRoleAccess, ROLE_LABELS, ROLES } from '../lib/roles'

const navItems = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    roles: [ROLES.STAFF, ROLES.MANAGER, ROLES.ADMIN],
  },
  {
    to: '/new-request',
    label: 'New Request',
    roles: [ROLES.STAFF, ROLES.ADMIN],
  },
  {
    to: '/requests',
    label: 'Requests',
    roles: [ROLES.STAFF, ROLES.MANAGER, ROLES.ADMIN],
  },
  {
    to: '/manager-approval',
    label: 'Manager Approval',
    roles: [ROLES.MANAGER, ROLES.ADMIN],
  },
]

function AppLayout() {
  const { user, profile, role, signOut } = useAuth()
  const navigate = useNavigate()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  const visibleNavItems = navItems.filter((item) => hasRoleAccess(role, item.roles))

  const handleSignOut = async () => {
    setSignOutError('')
    setIsSigningOut(true)

    const { error } = await signOut()

    if (error) {
      setSignOutError(error.message)
      setIsSigningOut(false)
      return
    }

    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto grid min-h-screen max-w-7xl md:grid-cols-[240px_1fr]">
        <aside className="border-r border-slate-200 bg-slate-900 px-4 py-6 text-slate-100">
          <div className="mb-8 px-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Internal Tool
            </p>
            <h1 className="mt-2 text-xl font-semibold">ProcureFlow</h1>
          </div>

          <nav className="space-y-1">
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2.5 text-sm ${
                    isActive
                      ? 'bg-slate-100 font-medium text-slate-900'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-8 rounded-lg border border-slate-700 bg-slate-800 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Logged in as
            </p>
            <p className="mt-1 text-sm font-medium">{profile?.full_name || user?.email}</p>
            <p className="text-xs text-slate-300">{ROLE_LABELS[role] || 'Unknown Role'}</p>
            <p className="text-xs text-slate-400">{profile?.department || 'Procurement'}</p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="mt-4 block w-full rounded-md border border-slate-700 px-3 py-2 text-center text-sm text-slate-300 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSigningOut ? 'Signing Out...' : 'Log Out'}
          </button>

          {signOutError ? (
            <p className="mt-2 text-xs text-rose-300">{signOutError}</p>
          ) : null}
        </aside>

        <div className="flex flex-col">
          <header className="border-b border-slate-200 bg-white px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Company Procurement
                </p>
                <p className="text-sm text-slate-600">
                  Source, request, and approve purchases in one place
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                FY26 Budget Tracking Enabled
              </span>
            </div>
          </header>

          <main className="p-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

export default AppLayout
