import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatDate } from '../lib/formatters'
import { fetchFinalApprovalQueue } from '../lib/po/poService'
import { ROLES } from '../lib/roles'
import { PO_STATUSES } from '../lib/workflow/constants'
import { getPoStatusLabel } from '../lib/workflow/statusHelpers'

const BASE_STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  {
    value: PO_STATUSES.PENDING_FINAL_APPROVAL,
    label: getPoStatusLabel(PO_STATUSES.PENDING_FINAL_APPROVAL),
  },
  {
    value: PO_STATUSES.APPROVED_FOR_PAYMENT,
    label: getPoStatusLabel(PO_STATUSES.APPROVED_FOR_PAYMENT),
  },
  {
    value: PO_STATUSES.CANCELLED,
    label: getPoStatusLabel(PO_STATUSES.CANCELLED),
  },
]

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function getPoLineTotal(line) {
  const explicitLineTotal = Number(line?.line_total)
  if (!Number.isNaN(explicitLineTotal)) {
    return explicitLineTotal
  }

  return Number(line?.ordered_qty || 0) * Number(line?.unit_price || 0)
}

function getPoEstimatedTotal(poRecord) {
  const lines = Array.isArray(poRecord?.po_lines) ? poRecord.po_lines : []
  return lines.reduce((sum, line) => sum + getPoLineTotal(line), 0)
}

function FinalApprovalQueuePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { role } = useAuth()
  const [queueRows, setQueueRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState(PO_STATUSES.PENDING_FINAL_APPROVAL)
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const flashMessage = String(location.state?.flashMessage || '')
  const isAdmin = role === ROLES.ADMIN

  const loadQueue = async () => {
    setLoading(true)
    setErrorMessage('')

    const activeStatus = isAdmin ? statusFilter : PO_STATUSES.PENDING_FINAL_APPROVAL
    const { data, error } = await fetchFinalApprovalQueue({
      status: activeStatus,
      department: departmentFilter,
      searchTerm,
      limit: 500,
      order: 'asc',
    })

    if (error) {
      setErrorMessage(error.message || 'Failed to load final approval queue.')
      setQueueRows([])
      setLoading(false)
      return
    }

    const nextRows = data || []
    setQueueRows(nextRows)
    setLoading(false)
  }

  useEffect(() => {
    let isMounted = true

    const loadInEffect = async () => {
      const activeStatus = isAdmin ? statusFilter : PO_STATUSES.PENDING_FINAL_APPROVAL
      const { data, error } = await fetchFinalApprovalQueue({
        status: activeStatus,
        department: departmentFilter,
        searchTerm,
        limit: 500,
        order: 'asc',
      })

      if (!isMounted) {
        return
      }

      if (error) {
        setErrorMessage(error.message || 'Failed to load final approval queue.')
        setQueueRows([])
        setLoading(false)
        return
      }

      const nextRows = data || []
      setQueueRows(nextRows)
      setLoading(false)
    }

    loadInEffect()

    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, departmentFilter, isAdmin])

  const queueSummary = useMemo(() => {
    const pendingFinalApproval = queueRows.filter(
      (item) => normalizeText(item.status) === PO_STATUSES.PENDING_FINAL_APPROVAL,
    ).length
    const approvedForPayment = queueRows.filter(
      (item) => normalizeText(item.status) === PO_STATUSES.APPROVED_FOR_PAYMENT,
    ).length
    const cancelled = queueRows.filter(
      (item) => normalizeText(item.status) === PO_STATUSES.CANCELLED,
    ).length

    return {
      total: queueRows.length,
      pendingFinalApproval,
      approvedForPayment,
      cancelled,
    }
  }, [queueRows])

  const departmentOptions = useMemo(() => {
    const departments = queueRows
      .map((item) => String(item.department || '').trim())
      .filter(Boolean)

    return Array.from(new Set(departments)).sort((left, right) => left.localeCompare(right))
  }, [queueRows])

  const statusOptions = useMemo(() => {
    if (!isAdmin) {
      return [
        {
          value: PO_STATUSES.PENDING_FINAL_APPROVAL,
          label: getPoStatusLabel(PO_STATUSES.PENDING_FINAL_APPROVAL),
        },
      ]
    }

    const optionMap = new Map(BASE_STATUS_OPTIONS.map((option) => [option.value, option]))
    const dynamicStatuses = Array.from(
      new Set(
        queueRows
          .map((item) => normalizeText(item.status))
          .filter(Boolean),
      ),
    )

    dynamicStatuses.forEach((status) => {
      if (!optionMap.has(status)) {
        optionMap.set(status, { value: status, label: getPoStatusLabel(status) })
      }
    })

    return Array.from(optionMap.values())
  }, [isAdmin, queueRows])

  const filteredQueueRows = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm)

    return queueRows.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        normalizeText(item.po_number).includes(normalizedSearch) ||
        normalizeText(item.source_pr?.pr_number).includes(normalizedSearch) ||
        normalizeText(item.requester_name).includes(normalizedSearch) ||
        normalizeText(item.department).includes(normalizedSearch) ||
        normalizeText(item.supplier_name_snapshot).includes(normalizedSearch) ||
        normalizeText(item.purpose).includes(normalizedSearch)

      const expectedStatus = isAdmin ? statusFilter : PO_STATUSES.PENDING_FINAL_APPROVAL
      const matchesStatus = expectedStatus === 'all' || normalizeText(item.status) === expectedStatus
      const matchesDepartment =
        departmentFilter === 'all' || String(item.department || '') === departmentFilter

      return matchesSearch && matchesStatus && matchesDepartment
    })
  }, [departmentFilter, isAdmin, queueRows, searchTerm, statusFilter])

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter(PO_STATUSES.PENDING_FINAL_APPROVAL)
    setDepartmentFilter('all')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Final Approval Queue"
        subtitle="Review PO drafts ready for final spend approval."
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

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Queue Total</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{queueSummary.total}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pending Final Approval</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {queueSummary.pendingFinalApproval}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Approved For Payment</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {queueSummary.approvedForPayment}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Cancelled</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{queueSummary.cancelled}</p>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search PO/PR, requester, supplier, department, purpose..."
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-2"
        />

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
          disabled={!isAdmin}
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
            Showing {filteredQueueRows.length} of {queueRows.length} PO records
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
              <th className="px-3 py-2.5 font-medium">PO Number</th>
              <th className="px-3 py-2.5 font-medium">Source PR Number</th>
              <th className="px-3 py-2.5 font-medium">Created Date</th>
              <th className="px-3 py-2.5 font-medium">Requester</th>
              <th className="px-3 py-2.5 font-medium">Department</th>
              <th className="px-3 py-2.5 font-medium">Supplier</th>
              <th className="px-3 py-2.5 font-medium">Purpose / Title</th>
              <th className="px-3 py-2.5 font-medium">Needed By Date</th>
              <th className="px-3 py-2.5 font-medium">Total Amount</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {loading ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={11}>
                  Loading final approval queue...
                </td>
              </tr>
            ) : null}

            {!loading && filteredQueueRows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={11}>
                  {statusFilter === PO_STATUSES.PENDING_FINAL_APPROVAL
                    ? 'No PO records are waiting for final approval.'
                    : 'No PO records match your filters.'}
                </td>
              </tr>
            ) : null}

            {!loading
              ? filteredQueueRows.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-700">{item.po_number || '-'}</td>
                    <td className="px-3 py-3 text-slate-700">{item.source_pr?.pr_number || '-'}</td>
                    <td className="px-3 py-3 text-slate-600">{formatDate(item.created_at)}</td>
                    <td className="px-3 py-3 text-slate-600">{item.requester_name || '-'}</td>
                    <td className="px-3 py-3 text-slate-600">{item.department || '-'}</td>
                    <td className="px-3 py-3 text-slate-600">{item.supplier_name_snapshot || '-'}</td>
                    <td className="px-3 py-3 text-slate-700">{item.purpose || '-'}</td>
                    <td className="px-3 py-3 text-slate-600">{formatDate(item.needed_by_date)}</td>
                    <td className="px-3 py-3 text-slate-700">{formatCurrency(getPoEstimatedTotal(item))}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={item.status} text={getPoStatusLabel(item.status)} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/final-approval-review/${item.id}`)}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          View / Review
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/final-approval-review/${item.id}`)}
                          className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800"
                        >
                          Continue Review
                        </button>
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

export default FinalApprovalQueuePage
