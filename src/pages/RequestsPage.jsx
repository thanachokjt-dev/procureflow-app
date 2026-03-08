import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatDate } from '../lib/formatters'
import { fetchPrListWithLineSummary } from '../lib/pr/prService'
import { PR_STATUS_LIST, PR_STATUSES } from '../lib/workflow/constants'
import { getPrStatusLabel, normalizePrStatus } from '../lib/workflow/statusHelpers'

function calculateEstimatedTotal(lines = []) {
  return lines.reduce((total, line) => {
    const estimatedTotal = Number(line.estimated_total)
    if (!Number.isNaN(estimatedTotal)) {
      return total + estimatedTotal
    }

    return total + Number(line.requested_qty || 0) * Number(line.estimated_unit_price || 0)
  }, 0)
}

function RequestsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const flashMessage = String(location.state?.flashMessage || '')

  const fetchPrRecords = async () => {
    const { data, error } = await fetchPrListWithLineSummary({
      order: 'desc',
      limit: 300,
    })

    if (error) {
      return { data: null, error }
    }

    const mappedRecords = (data || []).map((record) => {
      const normalizedStatus = normalizePrStatus(record.status || PR_STATUSES.DRAFT)
      const lines = record.pr_lines || []

      return {
        ...record,
        status: normalizedStatus,
        line_count: lines.length,
        estimated_total: calculateEstimatedTotal(lines),
      }
    })

    return { data: mappedRecords, error: null }
  }

  useEffect(() => {
    let isMounted = true

    const loadInEffect = async () => {
      setLoading(true)
      setErrorMessage('')

      const { data, error } = await fetchPrRecords()

      if (!isMounted) {
        return
      }

      if (error) {
        setErrorMessage(error.message || 'Failed to load PR records.')
        setRecords([])
        setLoading(false)
        return
      }

      setRecords(data || [])
      setLoading(false)
    }

    loadInEffect()

    return () => {
      isMounted = false
    }
  }, [])

  const handleRetry = async () => {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await fetchPrRecords()

    if (error) {
      setErrorMessage(error.message || 'Failed to load PR records.')
      setRecords([])
      setLoading(false)
      return
    }

    setRecords(data || [])
    setLoading(false)
  }

  const summary = useMemo(() => {
    const draftCount = records.filter((item) => item.status === PR_STATUSES.DRAFT).length
    const submittedCount = records.filter((item) => item.status === PR_STATUSES.SUBMITTED).length

    return {
      total: records.length,
      draft: draftCount,
      submitted: submittedCount,
    }
  }, [records])

  const departmentOptions = useMemo(() => {
    const departments = records
      .map((item) => item.department)
      .filter((department) => Boolean(department))

    return Array.from(new Set(departments))
  }, [records])

  const filteredRecords = useMemo(() => {
    return records.filter((item) => {
      const normalizedSearch = searchTerm.trim().toLowerCase()

      const matchesSearch =
        normalizedSearch.length === 0 ||
        String(item.pr_number || '')
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(item.purpose || '')
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(item.department || '')
          .toLowerCase()
          .includes(normalizedSearch)

      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      const matchesDepartment =
        departmentFilter === 'all' || item.department === departmentFilter

      return matchesSearch && matchesStatus && matchesDepartment
    })
  }, [records, searchTerm, statusFilter, departmentFilter])

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setDepartmentFilter('all')
  }

  const handleOpenPr = (recordId) => {
    navigate(`/create-pr/${recordId}`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requests"
        subtitle="View your PRs and role-visible workflow records. Open drafts to continue editing."
      />

      {flashMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {flashMessage}
        </div>
      ) : null}

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

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total PRs</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.total}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Draft</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.draft}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Submitted</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.submitted}</p>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search PR number, purpose, department..."
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
            Showing {filteredRecords.length} of {records.length} PR records
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
              <th className="px-3 py-2.5 font-medium">PR Number</th>
              <th className="px-3 py-2.5 font-medium">Created Date</th>
              <th className="px-3 py-2.5 font-medium">Department</th>
              <th className="px-3 py-2.5 font-medium">Purpose / Title</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Line Count</th>
              <th className="px-3 py-2.5 font-medium">Estimated Total</th>
              <th className="px-3 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {loading ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={8}>
                  Loading PR records...
                </td>
              </tr>
            ) : null}

            {!loading && filteredRecords.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={8}>
                  No PR records match your filters.
                </td>
              </tr>
            ) : null}

            {!loading
              ? filteredRecords.map((item) => {
                  const isDraft = item.status === PR_STATUSES.DRAFT
                  const isOwner = item.requester_user_id === user?.id
                  const actionLabel = isDraft && isOwner ? 'Continue Draft' : 'View'

                  return (
                    <tr key={item.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-3 font-medium text-slate-700">
                        {item.pr_number || '-'}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{formatDate(item.created_at)}</td>
                      <td className="px-3 py-3 text-slate-600">{item.department || '-'}</td>
                      <td className="px-3 py-3 text-slate-700">{item.purpose || '-'}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={item.status} text={getPrStatusLabel(item.status)} />
                      </td>
                      <td className="px-3 py-3 text-slate-700">{item.line_count}</td>
                      <td className="px-3 py-3 text-slate-700">
                        {formatCurrency(item.estimated_total)}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => handleOpenPr(item.id)}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          {actionLabel}
                        </button>
                      </td>
                    </tr>
                  )
                })
              : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default RequestsPage
