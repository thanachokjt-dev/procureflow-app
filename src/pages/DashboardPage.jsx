import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatStatus } from '../lib/formatters'
import { fetchVisiblePurchaseRequests, getRequestTotal } from '../lib/procurementData'
import { ROLE_LABELS } from '../lib/roles'
import { PR_STATUSES } from '../lib/workflow/constants'
import { normalizePrStatus } from '../lib/workflow/statusHelpers'

function DashboardPage() {
  const { profile, role } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true)
      setErrorMessage('')

      const { data, error } = await fetchVisiblePurchaseRequests()

      if (error) {
        setErrorMessage(error.message)
        setRequests([])
        setLoading(false)
        return
      }

      setRequests(data || [])
      setLoading(false)
    }

    loadDashboard()
  }, [])

  const summary = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    const submittedCount = requests.filter(
      (item) => normalizePrStatus(item.status) === PR_STATUSES.SUBMITTED,
    ).length
    const approvedThisMonth = requests.filter((item) => {
      if (normalizePrStatus(item.status) !== PR_STATUSES.APPROVED) {
        return false
      }

      const createdDate = new Date(item.created_at)
      return (
        createdDate.getMonth() === currentMonth &&
        createdDate.getFullYear() === currentYear
      )
    })

    const monthlySpend = approvedThisMonth.reduce(
      (sum, item) => sum + getRequestTotal(item),
      0,
    )

    return [
      { label: 'Visible Requests', value: requests.length, hint: 'Based on your role' },
      { label: 'Submitted PRs', value: submittedCount, hint: 'Waiting for decision' },
      { label: 'Monthly Spend', value: formatCurrency(monthlySpend), hint: 'Approved only' },
      {
        label: 'Approved This Month',
        value: approvedThisMonth.length,
        hint: 'Current calendar month',
      },
    ]
  }, [requests])

  const spendByDepartment = useMemo(() => {
    const departmentMap = new Map()

    requests.forEach((item) => {
      const key = item.department || 'Other'
      const total = getRequestTotal(item)
      departmentMap.set(key, (departmentMap.get(key) || 0) + total)
    })

    return Array.from(departmentMap.entries())
      .map(([department, amount]) => ({
        department,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [requests])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back, ${profile?.full_name || 'User'} (${ROLE_LABELS[role]}).`}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
          >
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
            <p className="mt-1 text-xs text-slate-500">{item.hint}</p>
          </div>
        ))}
      </section>

      {errorMessage ? (
        <section className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {errorMessage}
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Recent Requests</h3>
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-3 py-2.5 font-medium">Request ID</th>
                  <th className="px-3 py-2.5 font-medium">Title</th>
                  <th className="px-3 py-2.5 font-medium">Department</th>
                  <th className="px-3 py-2.5 font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {loading ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={5}>
                      Loading dashboard...
                    </td>
                  </tr>
                ) : null}

                {!loading && requests.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={5}>
                      No requests found.
                    </td>
                  </tr>
                ) : null}

                {!loading
                  ? requests.slice(0, 5).map((item) => (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-3 font-medium text-slate-700">
                          {item.id.slice(0, 8)}
                        </td>
                        <td className="px-3 py-3 text-slate-700">{item.title}</td>
                        <td className="px-3 py-3 text-slate-600">{item.department || '-'}</td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatCurrency(getRequestTotal(item))}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge text={formatStatus(item.status)} status={item.status} />
                        </td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-slate-900">Spend By Department</h3>
          <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-4">
            {spendByDepartment.length === 0 ? (
              <p className="text-sm text-slate-500">No spend data yet.</p>
            ) : (
              spendByDepartment.map((item) => (
                <div
                  key={item.department}
                  className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2"
                >
                  <p className="text-sm text-slate-600">{item.department}</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatCurrency(item.amount)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Access Rules
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Requester: own requests. Manager: pending/submitted approvals. Admin: full access.
        </p>
      </section>
    </div>
  )
}

export default DashboardPage
