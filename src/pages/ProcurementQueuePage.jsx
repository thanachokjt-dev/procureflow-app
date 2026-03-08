import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatDate } from '../lib/formatters'
import { fetchActiveSuppliers, fetchPreferredSupplierMappings } from '../lib/masterData'
import { fetchPoDraftHeadersBySourcePrIds, generatePoDraftsBySupplier } from '../lib/po/poService'
import { fetchPrDetailWithLines, fetchProcurementQueue } from '../lib/pr/prService'
import { ROLES } from '../lib/roles'
import { PR_STATUSES } from '../lib/workflow/constants'
import { getPrStatusLabel, normalizePrStatus } from '../lib/workflow/statusHelpers'

const PROCUREMENT_QUEUE_STATUSES = [
  PR_STATUSES.APPROVED,
  PR_STATUSES.PARTIALLY_CONVERTED_TO_PO,
  PR_STATUSES.CONVERTED_TO_PO,
]

const BASE_STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: PR_STATUSES.APPROVED, label: getPrStatusLabel(PR_STATUSES.APPROVED) },
  {
    value: PR_STATUSES.PARTIALLY_CONVERTED_TO_PO,
    label: getPrStatusLabel(PR_STATUSES.PARTIALLY_CONVERTED_TO_PO),
  },
  { value: PR_STATUSES.CONVERTED_TO_PO, label: getPrStatusLabel(PR_STATUSES.CONVERTED_TO_PO) },
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

function canGeneratePosBySupplier(status) {
  const normalizedStatus = normalizePrStatus(status)

  return [PR_STATUSES.APPROVED, PR_STATUSES.PARTIALLY_CONVERTED_TO_PO].includes(normalizedStatus)
}

function getPreferredPoDraft(poDrafts = []) {
  if (!poDrafts.length) {
    return null
  }

  const draftRecord = poDrafts.find(
    (entry) => String(entry.status || '').trim().toLowerCase() === 'draft',
  )
  if (draftRecord) {
    return draftRecord
  }

  return poDrafts[poDrafts.length - 1]
}

function toPositiveNumber(value, fallback = 0) {
  const numericValue = Number(value)
  if (Number.isNaN(numericValue) || numericValue < 0) {
    return fallback
  }

  return numericValue
}

function ProcurementQueuePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { role } = useAuth()
  const [queueRows, setQueueRows] = useState([])
  const [poDraftsByPrId, setPoDraftsByPrId] = useState({})
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState(PR_STATUSES.APPROVED)
  const [departmentFilter, setDepartmentFilter] = useState('all')

  const [generateTargetPr, setGenerateTargetPr] = useState(null)
  const [generateLineSelections, setGenerateLineSelections] = useState([])
  const [generateSuppliers, setGenerateSuppliers] = useState([])
  const [generateLoading, setGenerateLoading] = useState(false)
  const [generateSubmitting, setGenerateSubmitting] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [actionSuccessMessage, setActionSuccessMessage] = useState('')

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
      const sourcePrId = String(record.source_pr_id || '').trim()
      if (!sourcePrId) {
        return accumulator
      }

      if (!accumulator[sourcePrId]) {
        accumulator[sourcePrId] = []
      }

      accumulator[sourcePrId].push(record)
      return accumulator
    }, {})

    Object.keys(poDraftMap).forEach((sourcePrId) => {
      poDraftMap[sourcePrId].sort((left, right) =>
        String(left.created_at || '').localeCompare(String(right.created_at || '')),
      )
    })

    return { data: queueData, poDraftMap, error: null }
  }, [isAdmin])

  const loadQueue = async () => {
    setLoading(true)
    setErrorMessage('')

    const { data, poDraftMap, error } = await loadQueueData()

    if (error) {
      setErrorMessage(error.message || 'Failed to load procurement queue.')
      setQueueRows([])
      setPoDraftsByPrId({})
      setLoading(false)
      return
    }

    setQueueRows(data || [])
    setPoDraftsByPrId(poDraftMap || {})
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
        setPoDraftsByPrId({})
        setLoading(false)
        return
      }

      setQueueRows(data || [])
      setPoDraftsByPrId(poDraftMap || {})
      setLoading(false)
    }

    loadInEffect()

    return () => {
      isMounted = false
    }
  }, [loadQueueData])

  const queueSummary = useMemo(() => {
    const approved = queueRows.filter((item) => normalizePrStatus(item.status) === PR_STATUSES.APPROVED).length
    const partial = queueRows.filter(
      (item) => normalizePrStatus(item.status) === PR_STATUSES.PARTIALLY_CONVERTED_TO_PO,
    ).length
    const converted = queueRows.filter(
      (item) => normalizePrStatus(item.status) === PR_STATUSES.CONVERTED_TO_PO,
    ).length
    const closed = queueRows.filter((item) => normalizePrStatus(item.status) === PR_STATUSES.CLOSED).length

    return {
      total: queueRows.length,
      approved,
      partial,
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
    const optionMap = new Map(BASE_STATUS_OPTIONS.map((option) => [option.value, option]))
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

  const closeGenerateDialog = () => {
    setGenerateTargetPr(null)
    setGenerateLineSelections([])
    setGenerateSuppliers([])
    setGenerateLoading(false)
    setGenerateSubmitting(false)
    setGenerateError('')
  }

  const handleOpenGenerateDialog = async (prRecord) => {
    setGenerateTargetPr(prRecord)
    setGenerateLineSelections([])
    setGenerateSuppliers([])
    setGenerateLoading(true)
    setGenerateSubmitting(false)
    setGenerateError('')

    const [prDetailResult, suppliersResult] = await Promise.all([
      fetchPrDetailWithLines(prRecord.id),
      fetchActiveSuppliers(),
    ])

    if (prDetailResult.error || !prDetailResult.data?.id) {
      setGenerateError(prDetailResult.error?.message || 'Failed to load PR line details.')
      setGenerateLoading(false)
      return
    }

    if (suppliersResult.error) {
      setGenerateError(suppliersResult.error.message || 'Failed to load supplier list.')
      setGenerateLoading(false)
      return
    }

    const detailLines = prDetailResult.data.pr_lines || []
    const itemIds = detailLines.map((line) => line.item_id).filter(Boolean)
    const { data: preferredRows, error: preferredError } = await fetchPreferredSupplierMappings(itemIds)

    if (preferredError) {
      setGenerateError(preferredError.message || 'Failed to load preferred supplier mappings.')
      setGenerateLoading(false)
      return
    }

    const preferredSupplierByItemId = (preferredRows || []).reduce((accumulator, row) => {
      const itemId = String(row.item_id || '').trim()
      if (!itemId || accumulator[itemId]) {
        return accumulator
      }

      accumulator[itemId] = row
      return accumulator
    }, {})

    const nextSelections = detailLines.map((line) => ({
      pr_line_id: line.id,
      item_name: line.item_name || '-',
      sku: line.sku || '',
      unit: line.unit || '',
      requested_qty: toPositiveNumber(line.requested_qty, 0),
      estimated_unit_price: toPositiveNumber(line.estimated_unit_price, 0),
      include: true,
      supplier_id:
        String(line.preferred_supplier_id || '').trim() ||
        String(preferredSupplierByItemId[String(line.item_id || '').trim()]?.supplier_id || '').trim() ||
        '',
    }))

    setGenerateSuppliers(suppliersResult.data || [])
    setGenerateLineSelections(nextSelections)
    setGenerateLoading(false)
  }

  const handleLineSelectionChange = (prLineId, fieldName, value) => {
    setGenerateLineSelections((previous) =>
      previous.map((line) =>
        line.pr_line_id === prLineId
          ? {
              ...line,
              [fieldName]: value,
            }
          : line,
      ),
    )
  }

  const handleGeneratePos = async () => {
    if (!generateTargetPr?.id) {
      return
    }

    const selectedLines = generateLineSelections.filter((line) => line.include)
    if (selectedLines.length === 0) {
      setGenerateError('Select at least one PR line for PO generation.')
      return
    }

    const missingSupplierLine = selectedLines.find((line) => !String(line.supplier_id || '').trim())
    if (missingSupplierLine) {
      setGenerateError(`Supplier is required for line: ${missingSupplierLine.item_name}`)
      return
    }

    setGenerateSubmitting(true)
    setGenerateError('')

    const { data, error } = await generatePoDraftsBySupplier({
      sourcePrId: generateTargetPr.id,
      lineSelections: selectedLines.map((line) => ({
        pr_line_id: line.pr_line_id,
        supplier_id: line.supplier_id,
      })),
      actorRole: role,
    })

    if (error) {
      setGenerateError(error.message || 'Failed to generate POs by supplier.')
      setGenerateSubmitting(false)
      return
    }

    const poHeaders = data?.po_headers || []
    const generatedCount = Number(data?.generated_count || 0)
    const convertedLineCount = Number(data?.converted_line_count || 0)
    const totalLineCount = Number(data?.total_line_count || 0)
    const prStatusLabel = getPrStatusLabel(data?.pr_status || PR_STATUSES.APPROVED)
    const poNumbers = poHeaders.map((header) => header.po_number).filter(Boolean).join(', ')

    setActionSuccessMessage(
      `Generated ${generatedCount} PO draft(s). Converted ${convertedLineCount}/${totalLineCount} lines. PR status: ${prStatusLabel}.${poNumbers ? ` POs: ${poNumbers}` : ''}`,
    )
    setGenerateSubmitting(false)
    closeGenerateDialog()
    await loadQueue()
  }

  const includedLineCount = useMemo(
    () => generateLineSelections.filter((line) => line.include).length,
    [generateLineSelections],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Procurement Queue"
        subtitle="Review approved PRs, assign supplier per line, and generate one PO draft per supplier."
      />

      {flashMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {flashMessage}
        </div>
      ) : null}

      {actionSuccessMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {actionSuccessMessage}
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
          <p className="text-xs uppercase tracking-wide text-slate-500">Partially Converted</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{queueSummary.partial}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Fully Converted</p>
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
                  No PRs are ready for procurement actions.
                </td>
              </tr>
            ) : null}

            {!loading
              ? filteredQueueRows.map((item) => {
                  const poDrafts = poDraftsByPrId[item.id] || []
                  const preferredPoDraft = getPreferredPoDraft(poDrafts)

                  return (
                    <tr key={item.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-3 font-medium text-slate-700">{item.pr_number || '-'}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDate(item.created_at)}</td>
                      <td className="px-3 py-3 text-slate-600">{item.requester_name || '-'}</td>
                      <td className="px-3 py-3 text-slate-600">{item.department || '-'}</td>
                      <td className="px-3 py-3 text-slate-700">{item.purpose || '-'}</td>
                      <td className="px-3 py-3 text-slate-600">{item.needed_by_date || '-'}</td>
                      <td className="px-3 py-3 text-slate-700">{(item.pr_lines || []).length}</td>
                      <td className="px-3 py-3 text-slate-700">{formatCurrency(getPrEstimatedTotal(item))}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={item.status} text={getPrStatusLabel(item.status)} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          {poDrafts.length > 0 ? (
                            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700">
                              {poDrafts.length} PO Draft(s)
                            </span>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => navigate(`/create-pr/${item.id}`)}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            View PR
                          </button>

                          {canGeneratePosBySupplier(item.status) ? (
                            <button
                              type="button"
                              onClick={() => handleOpenGenerateDialog(item)}
                              className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800"
                            >
                              Generate POs by Supplier
                            </button>
                          ) : null}

                          {preferredPoDraft?.id ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/po-draft/by-id/${preferredPoDraft.id}`)}
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Continue PO Draft
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })
              : null}
          </tbody>
        </table>
      </div>

      {generateTargetPr ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-6xl rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                  Generate POs by Supplier
                </h3>
                <p className="text-sm text-slate-600">
                  PR {generateTargetPr.pr_number || '-'}: assign supplier per line, then generate one PO per supplier.
                </p>
              </div>
              <button
                type="button"
                onClick={closeGenerateDialog}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 px-4 py-3">
              {generateError ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {generateError}
                </div>
              ) : null}

              {generateLoading ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  Loading PR line details...
                </div>
              ) : null}

              {!generateLoading && generateLineSelections.length === 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  No PR lines found for this record.
                </div>
              ) : null}

              {!generateLoading && generateLineSelections.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-[1080px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <th className="px-3 py-2.5 font-medium">Include</th>
                        <th className="px-3 py-2.5 font-medium">Item</th>
                        <th className="px-3 py-2.5 font-medium">SKU</th>
                        <th className="px-3 py-2.5 font-medium">Unit</th>
                        <th className="px-3 py-2.5 font-medium">Qty</th>
                        <th className="px-3 py-2.5 font-medium">Est. Unit Price</th>
                        <th className="px-3 py-2.5 font-medium">Supplier</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {generateLineSelections.map((line) => (
                        <tr key={line.pr_line_id} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={line.include}
                              onChange={(event) =>
                                handleLineSelectionChange(line.pr_line_id, 'include', event.target.checked)
                              }
                              className="h-4 w-4 rounded border-slate-300 text-slate-900"
                            />
                          </td>
                          <td className="px-3 py-3 text-slate-700">{line.item_name}</td>
                          <td className="px-3 py-3 text-slate-600">{line.sku || '-'}</td>
                          <td className="px-3 py-3 text-slate-600">{line.unit || '-'}</td>
                          <td className="px-3 py-3 text-slate-700">{line.requested_qty}</td>
                          <td className="px-3 py-3 text-slate-700">
                            {formatCurrency(line.estimated_unit_price)}
                          </td>
                          <td className="px-3 py-3">
                            <select
                              value={line.supplier_id}
                              onChange={(event) =>
                                handleLineSelectionChange(line.pr_line_id, 'supplier_id', event.target.value)
                              }
                              className="w-64 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                            >
                              <option value="">Select supplier</option>
                              {generateSuppliers.map((supplier) => (
                                <option key={supplier.id} value={supplier.id}>
                                  {supplier.supplier_code} - {supplier.supplier_name}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-600">
                Included lines: <span className="font-medium text-slate-900">{includedLineCount}</span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeGenerateDialog}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGeneratePos}
                  disabled={generateSubmitting || generateLoading}
                  className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {generateSubmitting ? 'Generating...' : 'Generate POs by Supplier'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default ProcurementQueuePage
