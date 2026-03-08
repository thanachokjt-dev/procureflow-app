import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatDate } from '../lib/formatters'
import { fetchPoDraftHeadersBySourcePrIds } from '../lib/po/poService'
import { fetchProcurementQueue } from '../lib/pr/prService'
import { ROLES } from '../lib/roles'
import { PR_STATUSES } from '../lib/workflow/constants'
import { getPrStatusLabel, normalizePrStatus } from '../lib/workflow/statusHelpers'

const PROCUREMENT_QUEUE_STATUSES = [
  PR_STATUSES.APPROVED,
]

const baseStatusOptions = [
  { value: 'all', label: 'All Statuses' },
  { value: PR_STATUSES.APPROVED, label: getPrStatusLabel(PR_STATUSES.APPROVED) },
]

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

function getPoDraftActionLabel({ status, hasExistingPoDraft = false }) {
  if (hasExistingPoDraft) {
    return 'Continue PO Draft'
  }

  const normalizedStatus = normalizePrStatus(status)
  if (normalizedStatus === PR_STATUSES.CLOSED) {
    return 'View'
  }

  return 'Start PO Draft'
}

function canStartOrContinuePoDraft({ status, hasExistingPoDraft = false }) {
  if (hasExistingPoDraft) {
    return true
  }

  const normalizedStatus = normalizePrStatus(status)

  return normalizedStatus === PR_STATUSES.APPROVED
}

function ProcurementQueuePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { role } = useAuth()
  const [queueRows, setQueueRows] = useState([])
  const [poDraftByPrId, setPoDraftByPrId] = useState({})
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState(PR_STATUSES.APPROVED)
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const flashMessage = String(location.state?.flashMessage || '')
  const isAdmin = role === ROLES.ADMIN

  const loadQueueData = useCallback(async () => {
    const { data, error } = await fetchProcurementQueue({
      statuses: isAdmin ? null : PROCUREMENT_QUEUE_STATUSES,
      limit: 500,
      order: 'asc',
    })

    if (error) {
      return { data: null, poDraftMap: {}, error }
    }

    const queueData = data || []
    const prIds = queueData.map((record) => record.id).filter(Boolean)
    const { data: poHeaders, error: poHeaderError } = await fetchPoDraftHeadersBySourcePrIds(prIds)

    if (poHeaderError) {
      return { data: null, poDraftMap: {}, error: poHeaderError }
    }

    const poDraftMap = (poHeaders || []).reduce((accumulator, record) => {
      if (record.source_pr_id) {
        accumulator[record.source_pr_id] = record
      }
      return accumulator
    }, {})

    return { data: queueData, poDraftMap, error: null }
  }, [isAdmin])

  const loadQueue = async () => {
    setLoading(true)
    setErrorMessage('')

    const { data, poDraftMap, error } = await loadQueueData()

    if (error) {
      setErrorMessage(error.message || 'Failed to load procurement queue.')
      setQueueRows([])
      setPoDraftByPrId({})
      setLoading(false)
      return
    }

    setQueueRows(data || [])
    setPoDraftByPrId(poDraftMap || {})
    setLoading(false)
  }

  useEffect(() => {
    let isMounted = true

    const loadInEffect = async () => {
      const { data, poDraftMap, error } = await loadQueueData()

      if (!isMounted) {
        return
      }

      if (error) {
        setErrorMessage(error.message || 'Failed to load procurement queue.')
        setQueueRows([])
        setPoDraftByPrId({})
        setLoading(false)
        return
      }

      setQueueRows(data || [])
      setPoDraftByPrId(poDraftMap || {})
      setLoading(false)
    }

    loadInEffect()

    return () => {
      isMounted = false
    }
  }, [loadQueueData])

  const queueSummary = useMemo(() => {
    const approved = queueRows.filter((item) => item.status === PR_STATUSES.APPROVED).length
    const pendingVariance = queueRows.filter(
      (item) => normalizePrStatus(item.status) === 'pending_variance_confirmation',
    ).length
    const converted = queueRows.filter((item) => item.status === PR_STATUSES.CONVERTED_TO_PO).length
    const closed = queueRows.filter((item) => item.status === PR_STATUSES.CLOSED).length

    return {
      total: queueRows.length,
      approved,
      pendingVariance,
      converted,
      closed,
    }
  }, [queueRows])

  const departmentOptions = useMemo(() => {
    const departments = queueRows
      .map((item) => String(item.department || '').trim())
      .filter(Boolean)

    return Array.from(new Set(departments)).sort((left, right) => left.localeCompare(right))
  }, [queueRows])

  const statusOptions = useMemo(() => {
    const optionMap = new Map(baseStatusOptions.map((option) => [option.value, option]))
    const dynamicStatuses = Array.from(
      new Set(
        queueRows
          .map((item) =>
            String(item.status || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    )

    dynamicStatuses.forEach((status) => {
      if (!optionMap.has(status)) {
        optionMap.set(status, { value: status, label: getPrStatusLabel(status) })
      }
    })

    return Array.from(optionMap.values())
  }, [queueRows])

  const filteredQueueRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return queueRows.filter((item) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        String(item.pr_number || '')
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(item.requester_name || '')
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(item.department || '')
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(item.purpose || '')
          .toLowerCase()
          .includes(normalizedSearch)

      const matchesStatus = statusFilter === 'all' || normalizePrStatus(item.status) === statusFilter
      const matchesDepartment =
        departmentFilter === 'all' || String(item.department || '') === departmentFilter

      return matchesSearch && matchesStatus && matchesDepartment
    })
  }, [queueRows, searchTerm, statusFilter, departmentFilter])

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter(PR_STATUSES.APPROVED)
    setDepartmentFilter('all')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Procurement Queue"
        subtitle="Review approved PRs and start PO sourcing work."
      />

      {flashMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {flashMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Queue Total</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{queueSummary.total}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Approved</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{queueSummary.approved}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pending Variance</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{queueSummary.pendingVariance}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Converted To PO</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{queueSummary.converted}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Closed</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{queueSummary.closed}</p>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search PR number, requester, department, purpose..."
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-2"
        />

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
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
            Showing {filteredQueueRows.length} of {queueRows.length} PR records
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Clear Filters
            </button>
            <button
              type="button"
              onClick={loadQueue}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="px-3 py-2.5 font-medium">PR Number</th>
              <th className="px-3 py-2.5 font-medium">Created Date</th>
              <th className="px-3 py-2.5 font-medium">Requester</th>
              <th className="px-3 py-2.5 font-medium">Department</th>
              <th className="px-3 py-2.5 font-medium">Purpose / Title</th>
              <th className="px-3 py-2.5 font-medium">Needed By</th>
              <th className="px-3 py-2.5 font-medium">Line Count</th>
              <th className="px-3 py-2.5 font-medium">Estimated Total</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {loading ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={10}>
                  Loading procurement queue...
                </td>
              </tr>
            ) : null}

            {!loading && filteredQueueRows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={10}>
                  No approved PRs are ready for procurement yet.
                </td>
              </tr>
            ) : null}

            {!loading
              ? filteredQueueRows.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-700">{item.pr_number || '-'}</td>
                    <td className="px-3 py-3 text-slate-600">{formatDate(item.created_at)}</td>
                    <td className="px-3 py-3 text-slate-600">{item.requester_name || '-'}</td>
                    <td className="px-3 py-3 text-slate-600">{item.department || '-'}</td>
                    <td className="px-3 py-3 text-slate-700">{item.purpose || '-'}</td>
                    <td className="px-3 py-3 text-slate-600">{item.needed_by_date || '-'}</td>
                    <td className="px-3 py-3 text-slate-700">{(item.pr_lines || []).length}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {formatCurrency(getPrEstimatedTotal(item))}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={item.status} text={getPrStatusLabel(item.status)} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {poDraftByPrId[item.id] ? (
                          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700">
                            Draft Ready
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => navigate(`/create-pr/${item.id}`)}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          View
                        </button>
                        {canStartOrContinuePoDraft({
                          status: item.status,
                          hasExistingPoDraft: poDraftByPrId[item.id],
                        }) ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/po-draft/${item.id}`)}
                            className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800"
                          >
                            {getPoDraftActionLabel({
                              status: item.status,
                              hasExistingPoDraft: poDraftByPrId[item.id],
                            })}
                          </button>
                        ) : null}
                      </div>
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

export default ProcurementQueuePage
