import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import WorkflowTimeline from '../components/WorkflowTimeline'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatDate } from '../lib/formatters'
import {
  applyPoVarianceDecision,
  fetchPoVarianceReviewDetail,
  fetchVarianceConfirmationQueue,
} from '../lib/po/poService'
import { ROLES, hasAnyRole } from '../lib/roles'
import { fetchWorkflowHistoryEntries } from '../lib/workflow/historyService'
import { PO_STATUSES } from '../lib/workflow/constants'
import { getPoStatusLabel, getPrStatusLabel } from '../lib/workflow/statusHelpers'
import { getVarianceReasonLabel } from '../lib/workflow/varianceConstants'
import { comparePrAndPoLines } from '../lib/workflow/varianceHelpers'

const STATUS_OPTIONS = [
  { value: PO_STATUSES.PENDING_VARIANCE_CONFIRMATION, label: 'Pending Variance Confirmation' },
  { value: PO_STATUSES.PENDING_FINAL_APPROVAL, label: 'Pending Final Approval' },
  { value: PO_STATUSES.DRAFT, label: 'Draft' },
  { value: PO_STATUSES.CANCELLED, label: 'Cancelled' },
  { value: 'all', label: 'All Statuses' },
]

function getPoEstimatedTotal(poRecord) {
  const lines = poRecord?.po_lines || []

  return lines.reduce((sum, line) => {
    const lineTotal = Number(line.line_total)
    if (!Number.isNaN(lineTotal)) {
      return sum + lineTotal
    }

    return sum + Number(line.ordered_qty || 0) * Number(line.unit_price || 0)
  }, 0)
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function VarianceConfirmationPage() {
  const { role, user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [queueRows, setQueueRows] = useState([])
  const [selectedPoId, setSelectedPoId] = useState('')
  const [reviewContext, setReviewContext] = useState(null)
  const [timelineEntries, setTimelineEntries] = useState([])
  const [loadingQueue, setLoadingQueue] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [acting, setActing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState(PO_STATUSES.PENDING_VARIANCE_CONFIRMATION)
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [reviewComment, setReviewComment] = useState('')

  const canConfirmVariance = hasAnyRole(role, [ROLES.MANAGER, ROLES.ADMIN])

  const selectedPoDraft = reviewContext?.poDraft || null
  const selectedSourcePr = reviewContext?.sourcePr || null

  const departmentOptions = useMemo(() => {
    const departments = queueRows
      .map((row) => String(row.department || '').trim())
      .filter(Boolean)

    return Array.from(new Set(departments)).sort((left, right) => left.localeCompare(right))
  }, [queueRows])

  const filteredQueueRows = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm)

    return queueRows.filter((row) => {
      const matchesSearch =
        !normalizedSearch ||
        normalizeText(row.po_number).includes(normalizedSearch) ||
        normalizeText(row.requester_name).includes(normalizedSearch) ||
        normalizeText(row.department).includes(normalizedSearch) ||
        normalizeText(row.purpose).includes(normalizedSearch) ||
        normalizeText(row.source_pr?.pr_number).includes(normalizedSearch)

      const matchesDepartment =
        departmentFilter === 'all' || String(row.department || '') === departmentFilter

      return matchesSearch && matchesDepartment
    })
  }, [queueRows, searchTerm, departmentFilter])

  const selectedVarianceReasons = selectedPoDraft?.variance_reasons || []
  const selectedVarianceSummary = selectedPoDraft?.variance_summary || {}
  const liveComparisonResult = useMemo(() => {
    if (!selectedSourcePr?.pr_lines || !selectedPoDraft?.po_lines) {
      return null
    }

    return comparePrAndPoLines({
      prLines: selectedSourcePr.pr_lines,
      poDraftLines: selectedPoDraft.po_lines,
      config: selectedVarianceSummary?.config || {},
    })
  }, [selectedPoDraft?.po_lines, selectedSourcePr?.pr_lines, selectedVarianceSummary?.config])

  const varianceLineResults = liveComparisonResult?.lineResults?.filter((line) => line.hasVariance) || []

  const loadQueue = async ({ preferredPoId = '' } = {}) => {
    setLoadingQueue(true)
    setErrorMessage('')

    const { data, error } = await fetchVarianceConfirmationQueue({
      status: statusFilter,
      department: departmentFilter,
      searchTerm,
      order: 'asc',
      limit: 500,
    })

    if (error) {
      setQueueRows([])
      setErrorMessage(error.message || 'Failed to load variance confirmation queue.')
      setLoadingQueue(false)
      return
    }

    const nextRows = data || []
    setQueueRows(nextRows)

    const queryPoId = preferredPoId || searchParams.get('poId') || ''
    if (queryPoId && nextRows.some((row) => row.id === queryPoId)) {
      setSelectedPoId(queryPoId)
    } else if (nextRows.length > 0) {
      setSelectedPoId((previousPoId) => {
        const stillExists = nextRows.some((row) => row.id === previousPoId)
        return stillExists ? previousPoId : nextRows[0].id
      })
    } else {
      setSelectedPoId('')
      setReviewContext(null)
      setTimelineEntries([])
    }

    setLoadingQueue(false)
  }

  const loadReviewDetail = async (poId) => {
    const normalizedPoId = String(poId || '').trim()
    if (!normalizedPoId) {
      setReviewContext(null)
      setTimelineEntries([])
      return
    }

    setLoadingDetail(true)
    setErrorMessage('')

    const [reviewResult, historyResult] = await Promise.all([
      fetchPoVarianceReviewDetail(normalizedPoId),
      fetchWorkflowHistoryEntries({
        documentType: 'po',
        documentId: normalizedPoId,
        order: 'desc',
      }),
    ])

    if (reviewResult.error) {
      setReviewContext(null)
      setErrorMessage(reviewResult.error.message || 'Failed to load PO variance review.')
      setLoadingDetail(false)
      return
    }

    if (historyResult.error) {
      setErrorMessage(
        historyResult.error.message || 'PO review loaded, but workflow history failed to load.',
      )
    }

    setReviewContext(reviewResult.data || null)
    setTimelineEntries(historyResult.data || [])
    setLoadingDetail(false)
  }

  useEffect(() => {
    loadQueue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  useEffect(() => {
    if (!selectedPoId) {
      return
    }

    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('poId', selectedPoId)
      return next
    })

    loadReviewDetail(selectedPoId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPoId])

  const handleRefresh = async () => {
    await loadQueue({ preferredPoId: selectedPoId })
    if (selectedPoId) {
      await loadReviewDetail(selectedPoId)
    }
  }

  const handleVarianceDecision = async (decision) => {
    if (!canConfirmVariance || !selectedPoDraft?.id || !user?.id) {
      return
    }

    if (selectedPoDraft.status !== PO_STATUSES.PENDING_VARIANCE_CONFIRMATION) {
      setErrorMessage('This PO is no longer pending variance confirmation.')
      return
    }

    const trimmedComment = String(reviewComment || '').trim()
    if (!trimmedComment) {
      setErrorMessage('Comment is required before submitting variance decision.')
      return
    }

    setActing(true)
    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await applyPoVarianceDecision({
      poId: selectedPoDraft.id,
      decision,
      comment: trimmedComment,
      actorUserId: user.id,
      actorRole: role,
    })

    if (error) {
      setErrorMessage(error.message || 'Failed to apply variance decision.')
      setActing(false)
      return
    }

    setSuccessMessage('Variance review action saved successfully.')
    setReviewComment('')
    await loadQueue({ preferredPoId: selectedPoDraft.id })
    await loadReviewDetail(selectedPoDraft.id)
    setActing(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Variance Confirmation"
        subtitle="Review materially changed PO drafts and route them before final approval."
      />

      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search PO number, PR number, requester, department..."
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-2"
        />

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          {STATUS_OPTIONS.map((option) => (
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
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Refresh
          </button>
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="px-3 py-2.5 font-medium">PO Number</th>
              <th className="px-3 py-2.5 font-medium">Source PR</th>
              <th className="px-3 py-2.5 font-medium">Requester</th>
              <th className="px-3 py-2.5 font-medium">Department</th>
              <th className="px-3 py-2.5 font-medium">Purpose / Title</th>
              <th className="px-3 py-2.5 font-medium">Estimated Total</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {loadingQueue ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={8}>
                  Loading variance queue...
                </td>
              </tr>
            ) : null}

            {!loadingQueue && filteredQueueRows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={8}>
                  No PO records found for current filters.
                </td>
              </tr>
            ) : null}

            {!loadingQueue
              ? filteredQueueRows.map((row) => {
                  const isSelected = row.id === selectedPoId

                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-100 last:border-0 ${
                        isSelected ? 'bg-sky-50/40' : ''
                      }`}
                    >
                      <td className="px-3 py-3 font-medium text-slate-700">{row.po_number || '-'}</td>
                      <td className="px-3 py-3 text-slate-600">{row.source_pr?.pr_number || '-'}</td>
                      <td className="px-3 py-3 text-slate-600">{row.requester_name || '-'}</td>
                      <td className="px-3 py-3 text-slate-600">{row.department || '-'}</td>
                      <td className="px-3 py-3 text-slate-700">{row.purpose || '-'}</td>
                      <td className="px-3 py-3 text-slate-700">{formatCurrency(getPoEstimatedTotal(row))}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={row.status} text={getPoStatusLabel(row.status)} />
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedPoId(row.id)}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  )
                })
              : null}
          </tbody>
        </table>
      </section>

      {!selectedPoDraft ? (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Select a PO record to review variance details.
        </section>
      ) : null}

      {selectedPoDraft ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Source PR Summary
              </h3>
              <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <p>
                  <span className="text-slate-500">PR Number:</span>{' '}
                  <span className="font-medium">{selectedSourcePr?.pr_number || '-'}</span>
                </p>
                <p>
                  <span className="text-slate-500">Status:</span>{' '}
                  <span className="font-medium">{getPrStatusLabel(selectedSourcePr?.status)}</span>
                </p>
                <p>
                  <span className="text-slate-500">Requester:</span>{' '}
                  <span className="font-medium">{selectedSourcePr?.requester_name || '-'}</span>
                </p>
                <p>
                  <span className="text-slate-500">Department:</span>{' '}
                  <span className="font-medium">{selectedSourcePr?.department || '-'}</span>
                </p>
                <p className="sm:col-span-2">
                  <span className="text-slate-500">Purpose:</span>{' '}
                  <span className="font-medium">{selectedSourcePr?.purpose || '-'}</span>
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                PO Draft Summary
              </h3>
              <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <p>
                  <span className="text-slate-500">PO Number:</span>{' '}
                  <span className="font-medium">{selectedPoDraft.po_number || '-'}</span>
                </p>
                <p>
                  <span className="text-slate-500">Status:</span>{' '}
                  <span className="font-medium">{getPoStatusLabel(selectedPoDraft.status)}</span>
                </p>
                <p>
                  <span className="text-slate-500">Created:</span>{' '}
                  <span className="font-medium">{formatDate(selectedPoDraft.created_at)}</span>
                </p>
                <p>
                  <span className="text-slate-500">Needed By:</span>{' '}
                  <span className="font-medium">{formatDate(selectedPoDraft.needed_by_date)}</span>
                </p>
                <p className="sm:col-span-2">
                  <span className="text-slate-500">Purpose:</span>{' '}
                  <span className="font-medium">{selectedPoDraft.purpose || '-'}</span>
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-800">
                Detected Variance Reasons
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedVarianceReasons.length === 0 ? (
                  <span className="text-sm text-amber-700">No reasons captured.</span>
                ) : (
                  selectedVarianceReasons.map((reason) => (
                    <span
                      key={reason}
                      className="inline-flex rounded-full border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-700"
                    >
                      {getVarianceReasonLabel(reason)}
                    </span>
                  ))
                )}
              </div>

              <div className="mt-3 text-xs text-amber-800">
                Variance Lines:{' '}
                <span className="font-medium">
                  {selectedVarianceSummary?.summary?.varianceLineCount || 0}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Comparison Points
              </h3>

              {loadingDetail ? (
                <p className="mt-3 text-sm text-slate-500">Loading comparison points...</p>
              ) : null}

              {!loadingDetail && varianceLineResults.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No line-level comparison details found.</p>
              ) : null}

              {!loadingDetail && varianceLineResults.length > 0 ? (
                <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
                  <table className="min-w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <th className="px-3 py-2 font-medium">PR Item</th>
                        <th className="px-3 py-2 font-medium">PO Item</th>
                        <th className="px-3 py-2 font-medium">Qty (PR to PO)</th>
                        <th className="px-3 py-2 font-medium">Price (PR to PO)</th>
                        <th className="px-3 py-2 font-medium">Reasons</th>
                      </tr>
                    </thead>
                    <tbody>
                      {varianceLineResults.map((line, index) => (
                        <tr
                          key={`${line.pr_line_id || 'pr'}-${line.po_line_id || 'po'}-${index}`}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-3 py-2 text-slate-700">
                            {line.prLine?.item_name || line.prLineKey || '-'}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {line.poLine?.item_name || line.poLineKey || '-'}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {`${line.prLine?.requested_qty ?? '-'} -> ${line.poLine?.ordered_qty ?? '-'}`}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {`${line.prLine?.estimated_unit_price ?? '-'} -> ${line.poLine?.unit_price ?? '-'}`}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {(line.reasons || [])
                              .map((reason) => getVarianceReasonLabel(reason))
                              .join(', ') || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Variance Review Action
              </h3>

              {!canConfirmVariance ? (
                <p className="mt-2 text-sm text-slate-600">
                  You can view variance details, but only Manager/Admin can confirm, reject, or
                  send back.
                </p>
              ) : null}

              {canConfirmVariance ? (
                <>
                  <textarea
                    rows={3}
                    value={reviewComment}
                    onChange={(event) => setReviewComment(event.target.value)}
                    placeholder="Add review comment (required)"
                    className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleVarianceDecision('confirm')}
                      disabled={
                        acting ||
                        selectedPoDraft.status !== PO_STATUSES.PENDING_VARIANCE_CONFIRMATION
                      }
                      className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Confirm Variance
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVarianceDecision('reject')}
                      disabled={
                        acting ||
                        selectedPoDraft.status !== PO_STATUSES.PENDING_VARIANCE_CONFIRMATION
                      }
                      className="rounded-md bg-rose-700 px-3 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reject Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVarianceDecision('send_back')}
                      disabled={
                        acting ||
                        selectedPoDraft.status !== PO_STATUSES.PENDING_VARIANCE_CONFIRMATION
                      }
                      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Send Back To Procurement
                    </button>
                  </div>
                </>
              ) : null}
            </div>

            <WorkflowTimeline
              entries={timelineEntries}
              loading={loadingDetail}
              emptyMessage="No PO workflow history yet."
              showMetadata
            />
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default VarianceConfirmationPage
