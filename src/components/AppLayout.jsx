import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getPageLayoutConfig } from '../lib/layout/pageLayout'
import { PAGE_KEYS, ROLE_LABELS, canSeeSidebarItem } from '../lib/roles'

const navItems = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    pageKey: PAGE_KEYS.DASHBOARD,
  },
  {
    to: '/new-request',
    label: 'Create PR',
    pageKey: PAGE_KEYS.NEW_REQUEST,
  },
  {
    to: '/requests',
    label: 'Requests',
    pageKey: PAGE_KEYS.REQUESTS,
  },
  {
    to: '/manager-approval',
    label: 'Manager Approval',
    pageKey: PAGE_KEYS.MANAGER_APPROVAL,
  },
  {
    to: '/variance-confirmation',
    label: 'Variance Confirmation',
    pageKey: PAGE_KEYS.VARIANCE_CONFIRMATION,
  },
  {
    to: '/procurement-queue',
    label: 'Procurement Queue',
    pageKey: PAGE_KEYS.PROCUREMENT_QUEUE,
  },
  {
    to: '/supplier-master',
    label: 'Supplier Master',
    pageKey: PAGE_KEYS.SUPPLIER_MASTER,
  },
  {
    to: '/item-master',
    label: 'Item Master',
    pageKey: PAGE_KEYS.ITEM_MASTER,
  },
  {
    to: '/workflow-debug',
    label: 'Workflow Debug',
    pageKey: PAGE_KEYS.WORKFLOW_DEBUG,
  },
]

function AppLayout() {
  const { user, profile, role, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  const visibleNavItems = navItems.filter((item) =>
    canSeeSidebarItem(role, item.pageKey, user?.email),
  )
  const { mode, mainSpacingClass, contentContainerClass } = getPageLayoutConfig({
    pathname: location.pathname,
    role,
  })

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
      <div className="grid min-h-screen w-full md:grid-cols-[248px_minmax(0,1fr)]">
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

        <div className="flex min-w-0 flex-col">
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

          <main className={`min-w-0 ${mainSpacingClass}`}>
            <div
              data-layout-mode={mode}
              className={`min-w-0 shadow-sm ${contentContainerClass}`}
            >
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

export default AppLayout
