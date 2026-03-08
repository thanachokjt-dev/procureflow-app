import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatDate, formatStatus } from '../lib/formatters'
import { fetchMyPurchaseRequests, getRequestTotal } from '../lib/procurementData'
import { supabase } from '../lib/supabaseClient'
import { PR_STATUS_LIST, PR_STATUSES } from '../lib/workflow/constants'
import { getPrStatusLabel, normalizePrStatus } from '../lib/workflow/statusHelpers'

function RequestsPage() {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')

  const handleRetry = async () => {
    if (!user?.id) {
      setRequests([])
      setLoading(false)
      return
    }

    setLoading(true)
    setErrorMessage('')

    const { data, error } = await fetchMyPurchaseRequests(user.id)

    if (error) {
      setErrorMessage(error.message)
      setRequests([])
      setLoading(false)
      return
    }

    setRequests(data || [])
    setLoading(false)
  }

  useEffect(() => {
    const loadRequestsInEffect = async () => {
      if (!user?.id) {
        setRequests([])
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')

      const { data, error } = await fetchMyPurchaseRequests(user.id)

      if (error) {
        setErrorMessage(error.message)
        setRequests([])
        setLoading(false)
        return
      }

      setRequests(data || [])
      setLoading(false)
    }

    loadRequestsInEffect()

    if (!user?.id) {
      return undefined
    }

    const requestsChannel = supabase
      .channel(`purchase-requests-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchase_requests',
          filter: `requester_id=eq.${user.id}`,
        },
        () => {
          loadRequestsInEffect()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(requestsChannel)
    }
  }, [user?.id])

  const summary = useMemo(() => {
    const submittedCount = requests.filter(
      (item) => normalizePrStatus(item.status) === PR_STATUSES.SUBMITTED,
    ).length
    const approvedCount = requests.filter(
      (item) => normalizePrStatus(item.status) === PR_STATUSES.APPROVED,
    ).length
    const rejectedCount = requests.filter(
      (item) => normalizePrStatus(item.status) === PR_STATUSES.REJECTED,
    ).length

    return {
      total: requests.length,
      submitted: submittedCount,
      approved: approvedCount,
      rejected: rejectedCount,
    }
  }, [requests])

  const departmentOptions = useMemo(() => {
    const departments = requests
      .map((item) => item.department)
      .filter((department) => Boolean(department))

    return Array.from(new Set(departments))
  }, [requests])

  const filteredRequests = useMemo(() => {
    return requests.filter((item) => {
      const normalizedSearch = searchTerm.trim().toLowerCase()

      const matchesSearch =
        normalizedSearch.length === 0 ||
        item.title.toLowerCase().includes(normalizedSearch) ||
        String(item.id).toLowerCase().includes(normalizedSearch) ||
        String(item.supplier_name || '')
          .toLowerCase()
          .includes(normalizedSearch)

      const matchesStatus =
        statusFilter === 'all' || normalizePrStatus(item.status) === statusFilter

      const matchesDepartment =
        departmentFilter === 'all' || item.department === departmentFilter

      return matchesSearch && matchesStatus && matchesDepartment
    })
  }, [requests, searchTerm, statusFilter, departmentFilter])

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setDepartmentFilter('all')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requests"
        subtitle="Track your procurement requests and approval progress."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.total}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Submitted</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.submitted}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Approved</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.approved}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Rejected</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.rejected}</p>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-2 rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search title, ID, supplier..."
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-2"
        />

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          <option value="all">All Statuses</option>
          {PR_STATUS_LIST.map((status) => (
            <option key={status} value={status}>
              {getPrStatusLabel(status)}
            </option>
          ))}
        </select>

        <select
          value={departmentFilter}
          onChange={(event) => setDepartmentFilter(event.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          <option value="all">All Departments</option>
          {departmentOptions.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>

        <div className="flex items-center justify-between md:col-span-4">
          <p className="text-xs text-slate-500">
            Showing {filteredRequests.length} of {requests.length} requests
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="px-3 py-2.5 font-medium">Request ID</th>
              <th className="px-3 py-2.5 font-medium">Title</th>
              <th className="px-3 py-2.5 font-medium">Department</th>
              <th className="px-3 py-2.5 font-medium">Supplier</th>
              <th className="px-3 py-2.5 font-medium">Created</th>
              <th className="px-3 py-2.5 font-medium">Amount</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Manager Comment</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {loading ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={8}>
                  Loading your requests...
                </td>
              </tr>
            ) : null}

            {!loading && filteredRequests.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={8}>
                  No requests match your current search and filters.
                </td>
              </tr>
            ) : null}

            {!loading
              ? filteredRequests.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-700">
                      {item.id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{item.title}</td>
                    <td className="px-3 py-3 text-slate-600">{item.department}</td>
                    <td className="px-3 py-3 text-slate-600">
                      {item.supplier_name || '-'}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatDate(item.created_at)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {formatCurrency(getRequestTotal(item))}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge text={formatStatus(item.status)} status={item.status} />
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {item.manager_comment || '-'}
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default RequestsPage
