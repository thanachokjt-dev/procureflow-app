import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { formatCurrency } from '../lib/formatters'
import { fetchFinalApprovalQueue } from '../lib/po/poService'
import { fetchVisiblePrRecords } from '../lib/pr/prService'
import { ROLE_LABELS, ROLES } from '../lib/roles'
import { PO_STATUSES, PR_STATUSES } from '../lib/workflow/constants'
import { getPrStatusLabel, normalizePrStatus } from '../lib/workflow/statusHelpers'

function getPrEstimatedTotal(prRecord) {
  const lines = prRecord?.pr_lines || []

  return lines.reduce((sum, line) => {
    const estimatedTotal = Number(line.estimated_total)
    if (!Number.isNaN(estimatedTotal)) {
      return sum + estimatedTotal
    }

    return sum + Number(line.requested_qty || 0) * Number(line.estimated_unit_price || 0)
  }, 0)
}

function DashboardPage() {
  const { profile, role } = useAuth()
  const [prRecords, setPrRecords] = useState([])
  const [pendingFinalApprovalRecords, setPendingFinalApprovalRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadDashboard = async () => {
      setLoading(true)
      setErrorMessage('')
      const shouldLoadFinalApprovalRecords =
        role === ROLES.MD_ASSISTANT || role === ROLES.ADMIN
      const [prResult, finalApprovalResult] = await Promise.all([
        fetchVisiblePrRecords({ limit: 300, order: 'desc' }),
        shouldLoadFinalApprovalRecords
          ? fetchFinalApprovalQueue({
              status: PO_STATUSES.PENDING_FINAL_APPROVAL,
              limit: 300,
              order: 'desc',
            })
          : Promise.resolve({ data: [], error: null }),
      ])

      if (!isMounted) {
        return
      }

      if (prResult.error) {
        setErrorMessage(prResult.error.message)
        setPrRecords([])
        setPendingFinalApprovalRecords([])
        setLoading(false)
        return
      }

      if (finalApprovalResult.error) {
        setErrorMessage(
          finalApprovalResult.error.message ||
            'Dashboard loaded with partial data. Final approval summary is unavailable.',
        )
      }

      setPrRecords(prResult.data || [])
      setPendingFinalApprovalRecords(finalApprovalResult.data || [])
      setLoading(false)
    }

    loadDashboard()

    return () => {
      isMounted = false
    }
  }, [role])

  const summary = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    const submittedCount = prRecords.filter(
      (item) => normalizePrStatus(item.status) === PR_STATUSES.SUBMITTED,
    ).length
    const approvedCount = prRecords.filter(
      (item) => normalizePrStatus(item.status) === PR_STATUSES.APPROVED,
    ).length
    const approvedThisMonth = prRecords.filter((item) => {
      if (normalizePrStatus(item.status) !== PR_STATUSES.APPROVED) {
        return false
      }

      const createdDate = new Date(item.created_at)
      return createdDate.getMonth() === currentMonth && createdDate.getFullYear() === currentYear
    })

    const monthlySpend = approvedThisMonth.reduce((sum, item) => sum + getPrEstimatedTotal(item), 0)

    const summaryCards = [
      { label: 'Visible Requests', value: prRecords.length, hint: 'Based on your role' },
      {
        label: role === ROLES.MD_ASSISTANT || role === ROLES.ADMIN
          ? 'Pending Final Approval POs'
          : role === ROLES.PROCUREMENT || role === ROLES.ADMIN
            ? 'Ready For Procurement'
            : 'Submitted PRs',
        value: role === ROLES.MD_ASSISTANT || role === ROLES.ADMIN
          ? pendingFinalApprovalRecords.length
          : role === ROLES.PROCUREMENT || role === ROLES.ADMIN
            ? approvedCount
            : submittedCount,
        hint: role === ROLES.MD_ASSISTANT || role === ROLES.ADMIN
          ? 'Matches Final Approval Queue scope'
          : role === ROLES.PROCUREMENT || role === ROLES.ADMIN
            ? 'Matches Procurement Queue scope'
            : 'Waiting for decision',
      },
      { label: 'Monthly Spend', value: formatCurrency(monthlySpend), hint: 'Approved PRs this month' },
      { label: 'Approved This Month', value: approvedThisMonth.length, hint: 'Current calendar month' },
    ]

    return summaryCards
  }, [pendingFinalApprovalRecords.length, prRecords, role])

  const spendByDepartment = useMemo(() => {
    const departmentMap = new Map()

    const approvedPrRecords = prRecords.filter(
      (item) => normalizePrStatus(item.status) === PR_STATUSES.APPROVED,
    )

    approvedPrRecords.forEach((item) => {
      const key = item.department || 'Other'
      const total = getPrEstimatedTotal(item)
      departmentMap.set(key, (departmentMap.get(key) || 0) + total)
    })

    return Array.from(departmentMap.entries())
      .map(([department, amount]) => ({
        department,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [prRecords])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back, ${profile?.full_name || 'User'} (${ROLE_LABELS[role]}).`}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
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
          <h3 className="text-lg font-semibold text-slate-900">Recent PRs</h3>
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-3 py-2.5 font-medium">PR Number</th>
                  <th className="px-3 py-2.5 font-medium">Purpose</th>
                  <th className="px-3 py-2.5 font-medium">Department</th>
                  <th className="px-3 py-2.5 font-medium">Estimated Total</th>
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

                {!loading && prRecords.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={5}>
                      No PR records found.
                    </td>
                  </tr>
                ) : null}

                {!loading
                  ? prRecords.slice(0, 5).map((item) => (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-3 font-medium text-slate-700">{item.pr_number || '-'}</td>
                        <td className="px-3 py-3 text-slate-700">{item.purpose || '-'}</td>
                        <td className="px-3 py-3 text-slate-600">{item.department || '-'}</td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatCurrency(getPrEstimatedTotal(item))}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge text={getPrStatusLabel(item.status)} status={item.status} />
                        </td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-slate-900">Approved Spend By Department</h3>
          <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-4">
            {spendByDepartment.length === 0 ? (
              <p className="text-sm text-slate-500">No approved PR spend data yet.</p>
            ) : (
              spendByDepartment.map((item) => (
                <div
                  key={item.department}
                  className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2"
                >
                  <p className="text-sm text-slate-600">{item.department}</p>
                  <p className="text-sm font-semibold text-slate-900">{formatCurrency(item.amount)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export default DashboardPage
