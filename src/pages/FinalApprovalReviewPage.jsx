import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import WorkflowTimeline from '../components/WorkflowTimeline'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatDate } from '../lib/formatters'
import { fetchSupplierById } from '../lib/masterData'
import {
  applyPoFinalApprovalDecision,
  fetchPoFinalApprovalReviewDetail,
} from '../lib/po/poService'
import { ROLES, hasAnyRole } from '../lib/roles'
import { fetchWorkflowHistoryEntries } from '../lib/workflow/historyService'
import { PO_STATUSES } from '../lib/workflow/constants'
import { getPoStatusLabel, getPrStatusLabel } from '../lib/workflow/statusHelpers'
import { getVarianceReasonLabel } from '../lib/workflow/varianceConstants'

function getPoLineTotal(line) {
  const explicitLineTotal = Number(line?.line_total)
  if (!Number.isNaN(explicitLineTotal)) {
    return explicitLineTotal
  }

  return Number(line?.ordered_qty || 0) * Number(line?.unit_price || 0)
}

function getPoTotal(poDraft) {
  const lines = Array.isArray(poDraft?.po_lines) ? poDraft.po_lines : []
  return lines.reduce((sum, line) => sum + getPoLineTotal(line), 0)
}

function getDecisionSuccessMessage(decision, toStatus) {
  if (decision === 'approve') {
    return `Final approval completed. PO moved to ${getPoStatusLabel(toStatus)}.`
  }

  if (decision === 'reject') {
    return `Final review rejected. PO moved to ${getPoStatusLabel(toStatus)}.`
  }

  return `PO sent back to procurement. Status is now ${getPoStatusLabel(toStatus)}.`
}

function FinalApprovalReviewPage() {
  const { poId } = useParams()
  const navigate = useNavigate()
  const { role, user } = useAuth()
  const [reviewContext, setReviewContext] = useState(null)
  const [supplierDetail, setSupplierDetail] = useState(null)
  const [timelineEntries, setTimelineEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [acting, setActing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [historyErrorMessage, setHistoryErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [reviewComment, setReviewComment] = useState('')

  const canTakeFinalDecision = hasAnyRole(role, [ROLES.MD_ASSISTANT, ROLES.ADMIN])
  const poDraft = reviewContext?.poDraft || null
  const sourcePr = reviewContext?.sourcePr || null
  const poTotal = useMemo(() => getPoTotal(poDraft), [poDraft])
  const varianceReasons = Array.isArray(poDraft?.variance_reasons) ? poDraft.variance_reasons : []
  const varianceSummary = poDraft?.variance_summary || {}
  const isActionable = poDraft?.status === PO_STATUSES.PENDING_FINAL_APPROVAL

  const loadReviewDetail = async () => {
    if (!poId) {
      setErrorMessage('PO identifier is missing.')
      setLoading(false)
      return
    }

    setLoading(true)
    setErrorMessage('')
    setHistoryErrorMessage('')

    const [reviewResult, historyResult] = await Promise.all([
      fetchPoFinalApprovalReviewDetail(poId),
      fetchWorkflowHistoryEntries({
        documentType: 'po',
        documentId: poId,
        order: 'desc',
      }),
    ])

    if (reviewResult.error || !reviewResult.data?.poDraft?.id) {
      setReviewContext(null)
      setTimelineEntries([])
      setErrorMessage(reviewResult.error?.message || 'Failed to load final approval review.')
      setLoading(false)
      return
    }

    if (historyResult.error) {
      setHistoryErrorMessage(historyResult.error.message || 'Failed to load workflow history.')
    }

    setReviewContext(reviewResult.data)
    setTimelineEntries(historyResult.data || [])

    const supplierId = reviewResult.data?.poDraft?.supplier_id
    if (supplierId) {
      const { data, error } = await fetchSupplierById(supplierId)
      if (!error) {
        setSupplierDetail(data || null)
      } else {
        setSupplierDetail(null)
      }
    } else {
      setSupplierDetail(null)
    }

    setLoading(false)
  }

  const refreshHistoryOnly = async () => {
    if (!poId) {
      return
    }

    setLoadingHistory(true)
    setHistoryErrorMessage('')
    const { data, error } = await fetchWorkflowHistoryEntries({
      documentType: 'po',
      documentId: poId,
      order: 'desc',
    })

    if (error) {
      setHistoryErrorMessage(error.message || 'Failed to refresh workflow history.')
      setLoadingHistory(false)
      return
    }

    setTimelineEntries(data || [])
    setLoadingHistory(false)
  }

  useEffect(() => {
    let isMounted = true

    const loadInEffect = async () => {
      if (!isMounted) {
        return
      }

      await loadReviewDetail()
    }

    loadInEffect()

    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId])

  const handleFinalDecision = async (decision) => {
    if (!canTakeFinalDecision || !poDraft?.id || !user?.id) {
      return
    }

    if (!isActionable) {
      setErrorMessage('This PO is no longer pending final approval.')
      return
    }

    const trimmedComment = String(reviewComment || '').trim()
    if (!trimmedComment) {
      setErrorMessage('Comment is required before submitting final approval action.')
      return
    }

    setActing(true)
    setErrorMessage('')
    setSuccessMessage('')

    const { data, error } = await applyPoFinalApprovalDecision({
      poId: poDraft.id,
      decision,
      comment: trimmedComment,
      actorUserId: user.id,
      actorRole: role,
    })

    if (error) {
      setErrorMessage(error.message || 'Failed to apply final approval action.')
      setActing(false)
      return
    }

    setSuccessMessage(getDecisionSuccessMessage(decision, data?.status || PO_STATUSES.DRAFT))
    setReviewComment('')
    await loadReviewDetail()
    await refreshHistoryOnly()
    setActing(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeader
          title="Final Approval Review"
          subtitle="Review PO details and decide final spend approval before accounting review."
        />
        <button
          type="button"
          onClick={() => navigate('/final-approval-queue')}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Back to Queue
        </button>
      </div>

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

      {loading ? (
        <section className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Loading final approval review...
        </section>
      ) : null}

      {!loading && !poDraft ? (
        <section className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          PO record not found.
        </section>
      ) : null}

      {!loading && poDraft ? (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">PO Number</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{poDraft.po_number || '-'}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Current Status</p>
              <div className="mt-2">
                <StatusBadge status={poDraft.status} text={getPoStatusLabel(poDraft.status)} />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total Amount</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(poTotal)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Needed By</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {formatDate(poDraft.needed_by_date)}
              </p>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  PO Header Summary
                </h3>
                <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <p>
                    <span className="text-slate-500">PO Number:</span>{' '}
                    <span className="font-medium">{poDraft.po_number || '-'}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Created:</span>{' '}
                    <span className="font-medium">{formatDate(poDraft.created_at)}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Department:</span>{' '}
                    <span className="font-medium">{poDraft.department || '-'}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Requester:</span>{' '}
                    <span className="font-medium">{poDraft.requester_name || '-'}</span>
                  </p>
                  <p className="sm:col-span-2">
                    <span className="text-slate-500">Purpose / Title:</span>{' '}
                    <span className="font-medium">{poDraft.purpose || '-'}</span>
                  </p>
                  <p className="sm:col-span-2">
                    <span className="text-slate-500">Notes:</span>{' '}
                    <span className="font-medium">{poDraft.notes || '-'}</span>
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Source PR Summary
                </h3>
                <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <p>
                    <span className="text-slate-500">PR Number:</span>{' '}
                    <span className="font-medium">{sourcePr?.pr_number || '-'}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">PR Status:</span>{' '}
                    <span className="font-medium">{getPrStatusLabel(sourcePr?.status)}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Requester:</span>{' '}
                    <span className="font-medium">{sourcePr?.requester_name || '-'}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Department:</span>{' '}
                    <span className="font-medium">{sourcePr?.department || '-'}</span>
                  </p>
                  <p className="sm:col-span-2">
                    <span className="text-slate-500">Purpose / Title:</span>{' '}
                    <span className="font-medium">{sourcePr?.purpose || '-'}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Supplier Details
                </h3>
                <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <p>
                    <span className="text-slate-500">Supplier:</span>{' '}
                    <span className="font-medium">
                      {supplierDetail?.supplier_name || poDraft.supplier_name_snapshot || '-'}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500">Code:</span>{' '}
                    <span className="font-medium">{supplierDetail?.supplier_code || '-'}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Contact:</span>{' '}
                    <span className="font-medium">{supplierDetail?.contact_name || '-'}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Phone:</span>{' '}
                    <span className="font-medium">{supplierDetail?.phone || '-'}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Email:</span>{' '}
                    <span className="font-medium">{supplierDetail?.email || '-'}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Payment Terms:</span>{' '}
                    <span className="font-medium">{supplierDetail?.payment_terms || '-'}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Lead Time:</span>{' '}
                    <span className="font-medium">
                      {supplierDetail?.lead_time_days
                        ? `${supplierDetail.lead_time_days} day(s)`
                        : '-'}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500">Currency:</span>{' '}
                    <span className="font-medium">{supplierDetail?.currency || 'THB'}</span>
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-800">
                  Variance Summary
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {varianceReasons.length === 0 ? (
                    <span className="text-sm text-amber-700">No variance reasons recorded.</span>
                  ) : (
                    varianceReasons.map((reason) => (
                      <span
                        key={reason}
                        className="inline-flex rounded-full border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-700"
                      >
                        {getVarianceReasonLabel(reason)}
                      </span>
                    ))
                  )}
                </div>
                <p className="mt-3 text-xs text-amber-800">
                  Variance Lines:{' '}
                  <span className="font-medium">
                    {varianceSummary?.summary?.varianceLineCount || 0}
                  </span>
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              PO Lines
            </h3>
            <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="px-3 py-2.5 font-medium">Item</th>
                    <th className="px-3 py-2.5 font-medium">Description</th>
                    <th className="px-3 py-2.5 font-medium">Unit</th>
                    <th className="px-3 py-2.5 font-medium">Qty</th>
                    <th className="px-3 py-2.5 font-medium">Unit Price</th>
                    <th className="px-3 py-2.5 font-medium">Line Total</th>
                    <th className="px-3 py-2.5 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {(poDraft.po_lines || []).length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-slate-500" colSpan={7}>
                        No PO lines found.
                      </td>
                    </tr>
                  ) : (
                    (poDraft.po_lines || []).map((line) => (
                      <tr key={line.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-3 text-slate-700">
                          <p className="font-medium">{line.item_name || '-'}</p>
                          <p className="text-xs text-slate-500">{line.sku || '-'}</p>
                        </td>
                        <td className="px-3 py-3 text-slate-600">{line.description || '-'}</td>
                        <td className="px-3 py-3 text-slate-600">{line.unit || '-'}</td>
                        <td className="px-3 py-3 text-slate-700">{line.ordered_qty || '-'}</td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatCurrency(line.unit_price || 0)}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatCurrency(getPoLineTotal(line))}
                        </td>
                        <td className="px-3 py-3 text-slate-600">{line.remarks || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end">
              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
                Total Amount: {formatCurrency(poTotal)}
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Final Approval Actions
            </h3>

            {!canTakeFinalDecision ? (
              <p className="mt-2 text-sm text-slate-600">
                You can view this PO, but only MD Assistant/Admin can take final approval actions.
              </p>
            ) : null}

            {canTakeFinalDecision ? (
              <>
                <textarea
                  rows={3}
                  value={reviewComment}
                  onChange={(event) => setReviewComment(event.target.value)}
                  placeholder="Add final approval comment (required)"
                  className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleFinalDecision('approve')}
                    disabled={acting || !isActionable}
                    className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Approve Final
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFinalDecision('reject')}
                    disabled={acting || !isActionable}
                    className="rounded-md bg-rose-700 px-3 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Reject Final
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFinalDecision('send_back')}
                    disabled={acting || !isActionable}
                    className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Send Back to Procurement
                  </button>
                </div>
              </>
            ) : null}
          </section>

          <WorkflowTimeline
            entries={timelineEntries}
            loading={loadingHistory}
            errorMessage={historyErrorMessage}
            emptyMessage="No PO workflow history yet."
            showMetadata
          />
        </>
      ) : null}
    </div>
  )
}

export default FinalApprovalReviewPage
