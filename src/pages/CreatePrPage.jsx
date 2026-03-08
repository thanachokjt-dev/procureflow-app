import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import WorkflowTimeline from '../components/WorkflowTimeline'
import { PrLinesCardEditor, PrLinesTableEditor } from '../components/pr/PrLinesEditors'
import { useAuth } from '../context/AuthContext'
import { formatCurrency } from '../lib/formatters'
import { fetchActiveItems } from '../lib/masterData'
import { hasAnyRole, ROLES } from '../lib/roles'
import { APPROVAL_ACTIONS, DOCUMENT_TYPES, PR_STATUSES, WORKFLOW_ACTIONS } from '../lib/workflow/constants'
import { fetchWorkflowHistoryEntries } from '../lib/workflow/historyService'
import { getPrStatusLabel, normalizePrStatus } from '../lib/workflow/statusHelpers'
import {
  appendPrWorkflowHistory,
  createPrDraft,
  setPrDecision,
  fetchPrDetailWithLines,
  deletePrLine,
  savePrLines,
  updatePrDraftHeader,
} from '../lib/pr/prService'

const createLineDraft = () => ({
  local_id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  db_id: null,
  item_id: '',
  itemSearch: '',
  sku: '',
  item_name: '',
  description: '',
  unit: '',
  requested_qty: '1',
  estimated_unit_price: '',
  remarks: '',
})

function getLocalDatePlusDaysIso(daysToAdd = 0) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + Number(daysToAdd || 0))

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toNumber(value, fallback = 0) {
  const numericValue = Number(value)
  if (Number.isNaN(numericValue)) {
    return fallback
  }

  return numericValue
}

function getLineEstimatedTotal(line) {
  const qty = toNumber(line.requested_qty, 0)
  const unitPrice = toNumber(line.estimated_unit_price, 0)
  return qty * unitPrice
}

function mapSavedLineToFormLine(line) {
  return {
    local_id: `line-${line.id || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    db_id: line.id || null,
    item_id: line.item_id || '',
    itemSearch: '',
    sku: line.sku || '',
    item_name: line.item_name || '',
    description: line.description || '',
    unit: line.unit || '',
    requested_qty: String(line.requested_qty || ''),
    estimated_unit_price: String(line.estimated_unit_price ?? ''),
    remarks: line.remarks || '',
  }
}

function CreatePrPage() {
  const { profile, user, role } = useAuth()
  const navigate = useNavigate()
  const { prId } = useParams()

  const [formValues, setFormValues] = useState({
    department: profile?.department || '',
    purpose: '',
    needed_by_date: '',
    notes: '',
  })
  const [lineItems, setLineItems] = useState([createLineDraft()])
  const [catalogItems, setCatalogItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [itemsError, setItemsError] = useState('')
  const [validationErrors, setValidationErrors] = useState([])
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmittingPr, setIsSubmittingPr] = useState(false)
  const [lastSavedDraft, setLastSavedDraft] = useState(null)
  const [activeDraftId, setActiveDraftId] = useState('')
  const [activeDraftNumber, setActiveDraftNumber] = useState('')
  const [activeDraftStatus, setActiveDraftStatus] = useState(PR_STATUSES.DRAFT)
  const [activeRequesterName, setActiveRequesterName] = useState('')
  const [activeRequesterUserId, setActiveRequesterUserId] = useState('')
  const [pendingDeleteLineIds, setPendingDeleteLineIds] = useState([])
  const minNeededByDate = useMemo(() => getLocalDatePlusDaysIso(7), [])
  const [isLoadingDraft, setIsLoadingDraft] = useState(false)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewActionLoading, setReviewActionLoading] = useState(false)
  const [reviewActionError, setReviewActionError] = useState('')
  const [reviewActionSuccess, setReviewActionSuccess] = useState('')
  const [workflowHistoryEntries, setWorkflowHistoryEntries] = useState([])
  const [workflowHistoryLoading, setWorkflowHistoryLoading] = useState(false)
  const [workflowHistoryError, setWorkflowHistoryError] = useState('')

  useEffect(() => {
    const loadItems = async () => {
      setItemsLoading(true)
      setItemsError('')

      const { data, error } = await fetchActiveItems()

      if (error) {
        setItemsError(error.message || 'Failed to load Item Master data.')
        setCatalogItems([])
        setItemsLoading(false)
        return
      }

      setCatalogItems(data || [])
      setItemsLoading(false)
    }

    loadItems()
  }, [])

  const documentEstimatedTotal = useMemo(() => {
    return lineItems.reduce((total, line) => total + getLineEstimatedTotal(line), 0)
  }, [lineItems])
  const normalizedActiveStatus = normalizePrStatus(activeDraftStatus)
  const isManagerReviewer = hasAnyRole(role, [ROLES.MANAGER, ROLES.ADMIN])
  const canEditDraft =
    !prId ||
    (normalizedActiveStatus === PR_STATUSES.DRAFT &&
      (activeRequesterUserId === user?.id || role === ROLES.ADMIN))
  const isReadOnlyMode = Boolean(prId) && !canEditDraft
  const canReviewPr = Boolean(prId) && isManagerReviewer && normalizedActiveStatus === PR_STATUSES.SUBMITTED
  const pageTitle = prId
    ? canReviewPr
      ? 'PR Review'
      : isReadOnlyMode
        ? 'PR Details'
        : 'Edit PR Draft'
    : 'Create PR'
  const pageSubtitle = prId
    ? canReviewPr
      ? 'Review submitted PR details and take approval action with a required comment.'
      : 'Open an existing PR record. Owner drafts are editable and reviewed PRs are read-only.'
    : 'Create a purchase request draft, then submit it for manager approval.'

  const handleHeaderChange = (fieldName) => (event) => {
    const value = event.target.value
    setFormValues((previous) => ({ ...previous, [fieldName]: value }))
  }

  const handleLineFieldChange = (lineId, fieldName, value) => {
    setLineItems((previous) =>
      previous.map((line) =>
        line.local_id === lineId ? { ...line, [fieldName]: value } : line,
      ),
    )
  }

  const getFilteredItemsForLine = (line) => {
    const keyword = String(line.itemSearch || '')
      .trim()
      .toLowerCase()

    if (!keyword) {
      return catalogItems
    }

    return catalogItems.filter((item) => {
      const haystack = [item.sku, item.item_name, item.brand, item.model, item.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(keyword)
    })
  }

  const handleSelectCatalogItem = (lineId, selectedItemId) => {
    const selectedItem = catalogItems.find((item) => item.id === selectedItemId)

    setLineItems((previous) =>
      previous.map((line) => {
        if (line.local_id !== lineId) {
          return line
        }

        if (!selectedItem) {
          return { ...line, item_id: '' }
        }

        return {
          ...line,
          item_id: selectedItem.id,
          sku: selectedItem.sku || line.sku,
          item_name: selectedItem.item_name || line.item_name,
          description: selectedItem.description || selectedItem.spec_text || line.description,
          unit: selectedItem.unit || line.unit,
        }
      }),
    )
  }

  const handleAddLine = () => {
    setLineItems((previous) => [...previous, createLineDraft()])
  }

  const handleRemoveLine = (lineId) => {
    setLineItems((previous) => {
      if (previous.length === 1) {
        return previous
      }

      const lineToRemove = previous.find((line) => line.local_id === lineId)

      if (lineToRemove?.db_id) {
        setPendingDeleteLineIds((current) =>
          current.includes(lineToRemove.db_id) ? current : [...current, lineToRemove.db_id],
        )
      }

      return previous.filter((line) => line.local_id !== lineId)
    })
  }

  const resetForm = () => {
    if (prId) {
      setSaveError('')
      setSaveSuccess('')
      setValidationErrors([])
      return
    }

    setFormValues({
      department: profile?.department || '',
      purpose: '',
      needed_by_date: '',
      notes: '',
    })
    setLineItems([createLineDraft()])
    setValidationErrors([])
    setSaveError('')
    setSaveSuccess('')
    setLastSavedDraft(null)
    setActiveDraftId('')
    setActiveDraftNumber('')
    setActiveDraftStatus(PR_STATUSES.DRAFT)
    setActiveRequesterName('')
    setActiveRequesterUserId('')
    setPendingDeleteLineIds([])
    setWorkflowHistoryEntries([])
    setWorkflowHistoryError('')
    setWorkflowHistoryLoading(false)
  }

  const validateForm = () => {
    const errors = []

    if (!String(formValues.department || '').trim()) {
      errors.push('Department is required.')
    }

    if (!String(formValues.purpose || '').trim()) {
      errors.push('Purpose is required.')
    }

    if (String(formValues.needed_by_date || '').trim()) {
      if (formValues.needed_by_date < minNeededByDate) {
        errors.push(`Needed by date must be ${minNeededByDate} or later (today + 7 days).`)
      }
    }

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      errors.push('At least one PR line is required.')
      return errors
    }

    lineItems.forEach((line, index) => {
      const lineNumber = index + 1
      const qty = toNumber(line.requested_qty, NaN)
      const estimatedUnitPrice =
        String(line.estimated_unit_price || '').trim() === ''
          ? 0
          : toNumber(line.estimated_unit_price, NaN)

      if (!String(line.item_name || '').trim()) {
        errors.push(`Line ${lineNumber}: Item name is required.`)
      }

      if (!String(line.unit || '').trim()) {
        errors.push(`Line ${lineNumber}: Unit is required.`)
      }

      if (Number.isNaN(qty) || qty <= 0) {
        errors.push(`Line ${lineNumber}: Requested quantity must be greater than 0.`)
      }

      if (Number.isNaN(estimatedUnitPrice) || estimatedUnitPrice < 0) {
        errors.push(`Line ${lineNumber}: Estimated unit price must be 0 or greater.`)
      }
    })

    return errors
  }

  const loadWorkflowHistory = async (targetPrId) => {
    if (!targetPrId) {
      setWorkflowHistoryEntries([])
      setWorkflowHistoryError('')
      setWorkflowHistoryLoading(false)
      return
    }

    setWorkflowHistoryLoading(true)
    setWorkflowHistoryError('')

    const { data, error } = await fetchWorkflowHistoryEntries({
      documentType: DOCUMENT_TYPES.PR,
      documentId: targetPrId,
      order: 'desc',
    })

    if (error) {
      setWorkflowHistoryEntries([])
      setWorkflowHistoryError(error.message || 'Failed to load workflow history.')
      setWorkflowHistoryLoading(false)
      return
    }

    setWorkflowHistoryEntries(data || [])
    setWorkflowHistoryLoading(false)
  }

  const applyLoadedPrData = (data) => {
    const normalizedStatus = normalizePrStatus(data.status || PR_STATUSES.DRAFT)
    const loadedLines =
      Array.isArray(data.pr_lines) && data.pr_lines.length > 0
        ? data.pr_lines.map(mapSavedLineToFormLine)
        : [createLineDraft()]

    setFormValues({
      department: data.department || '',
      purpose: data.purpose || '',
      needed_by_date: data.needed_by_date || '',
      notes: data.notes || '',
    })
    setLineItems(loadedLines)
    setActiveDraftId(data.id)
    setActiveDraftNumber(data.pr_number || '')
    setActiveDraftStatus(normalizedStatus)
    setActiveRequesterName(data.requester_name || '')
    setActiveRequesterUserId(data.requester_user_id || '')
    setPendingDeleteLineIds([])
  }

  const handleSaveDraft = async (event) => {
    event.preventDefault()
    await persistPr({ submitAfterSave: false })
  }

  useEffect(() => {
    if (!prId) {
      return
    }

    const loadDraftForEdit = async () => {
      setIsLoadingDraft(true)
      setSaveError('')
      setSaveSuccess('')
      setValidationErrors([])
      setReviewComment('')
      setReviewActionError('')
      setReviewActionSuccess('')

      const { data, error } = await fetchPrDetailWithLines(prId)

      if (error || !data?.id) {
        setSaveError(error?.message || 'Unable to load PR for editing.')
        setIsLoadingDraft(false)
        return
      }

      applyLoadedPrData(data)
      await loadWorkflowHistory(data.id)
      setIsLoadingDraft(false)
    }

    loadDraftForEdit()
  }, [prId])

  const persistPr = async ({ submitAfterSave = false }) => {
    setSaveError('')
    setSaveSuccess('')
    setLastSavedDraft(null)

    if (isReadOnlyMode) {
      setSaveError('This PR is not editable for your account in its current status.')
      return
    }

    const errors = validateForm()
    setValidationErrors(errors)

    if (errors.length > 0) {
      return
    }

    if (submitAfterSave) {
      setIsSubmittingPr(true)
    } else {
      setIsSaving(true)
    }

    let draftHeader = null

    if (activeDraftId) {
      const { data: updatedHeader, error: updateError } = await updatePrDraftHeader(activeDraftId, {
        department: formValues.department,
        purpose: formValues.purpose,
        neededByDate: formValues.needed_by_date || null,
        notes: formValues.notes,
        status: PR_STATUSES.DRAFT,
      })

      if (updateError || !updatedHeader?.id) {
        setSaveError(updateError?.message || 'Failed to update PR draft header.')
        setIsSaving(false)
        setIsSubmittingPr(false)
        return
      }

      draftHeader = updatedHeader
    } else {
      const { data: createdHeader, error: createError } = await createPrDraft({
        department: formValues.department,
        purpose: formValues.purpose,
        neededByDate: formValues.needed_by_date || null,
        notes: formValues.notes,
        requesterName: profile?.full_name || user?.email || '',
      })

      if (createError || !createdHeader?.id) {
        setSaveError(createError?.message || 'Failed to create PR draft.')
        setIsSaving(false)
        setIsSubmittingPr(false)
        return
      }

      draftHeader = createdHeader
    }

    if (pendingDeleteLineIds.length > 0) {
      for (const lineId of pendingDeleteLineIds) {
        const { error: deleteError } = await deletePrLine(lineId)

        if (deleteError) {
          setSaveError(`Draft header saved, but failed to remove line: ${deleteError.message}`)
          setIsSaving(false)
          setIsSubmittingPr(false)
          return
        }
      }
    }

    const linePayload = lineItems.map((line) => ({
      id: line.db_id || null,
      item_id: line.item_id || null,
      sku: String(line.sku || '').trim() || null,
      item_name: String(line.item_name || '').trim(),
      description: String(line.description || '').trim() || null,
      unit: String(line.unit || '').trim(),
      requested_qty: Number(line.requested_qty),
      estimated_unit_price:
        String(line.estimated_unit_price || '').trim() === ''
          ? 0
          : Number(line.estimated_unit_price),
      remarks: String(line.remarks || '').trim() || null,
    }))

    const { data: savedLines, error: lineError } = await savePrLines(draftHeader.id, linePayload)

    if (lineError) {
      setSaveError(`Draft header saved (${draftHeader.pr_number}) but lines failed: ${lineError.message}`)
      setIsSaving(false)
      setIsSubmittingPr(false)
      return
    }

    if (submitAfterSave) {
      const { data: submittedHeader, error: submitError } = await updatePrDraftHeader(draftHeader.id, {
        status: PR_STATUSES.SUBMITTED,
      })

      if (submitError || !submittedHeader?.id) {
        setSaveError(
          submitError?.message ||
            'Draft saved, but failed to submit PR. Ensure submit policy SQL is applied.',
        )
        setIsSaving(false)
        setIsSubmittingPr(false)
        return
      }

      const { error: historyError } = await appendPrWorkflowHistory({
        prId: submittedHeader.id,
        action: WORKFLOW_ACTIONS.SUBMIT_PR,
        actorUserId: user?.id,
        actorRole: role,
        comment: 'PR submitted by owner',
        metadata: { source: 'new_request_page', status: PR_STATUSES.SUBMITTED },
      })

      if (historyError) {
        setSaveError(
          `PR submitted (${submittedHeader.pr_number}), but workflow history failed: ${historyError.message}`,
        )
      } else {
        setSaveSuccess(`PR submitted successfully: ${submittedHeader.pr_number}`)
      }

      setLastSavedDraft({
        ...submittedHeader,
        lines: savedLines || [],
      })
      setValidationErrors([])
      setLineItems([createLineDraft()])
      setFormValues({
        department: profile?.department || '',
        purpose: '',
        needed_by_date: '',
        notes: '',
      })
      setPendingDeleteLineIds([])
      setActiveDraftId('')
      setActiveDraftNumber('')
      setActiveDraftStatus(PR_STATUSES.DRAFT)
      setActiveRequesterName('')
      setActiveRequesterUserId('')
      setIsSaving(false)
      setIsSubmittingPr(false)

      navigate('/requests', {
        state: {
          flashMessage: historyError
            ? `PR submitted (${submittedHeader.pr_number}), but history log failed.`
            : `PR submitted: ${submittedHeader.pr_number}`,
        },
        replace: false,
      })
      return
    }

    setSaveSuccess(`Draft saved successfully: ${draftHeader.pr_number}`)
    setLastSavedDraft({
      ...draftHeader,
      lines: savedLines || [],
    })
    setActiveDraftId(draftHeader.id)
    setActiveDraftNumber(draftHeader.pr_number || '')
    setActiveDraftStatus(PR_STATUSES.DRAFT)
    setActiveRequesterName(draftHeader.requester_name || activeRequesterName || profile?.full_name || '')
    setActiveRequesterUserId(draftHeader.requester_user_id || user?.id || '')
    setLineItems((savedLines || []).map(mapSavedLineToFormLine))
    setPendingDeleteLineIds([])
    setValidationErrors([])
    setIsSaving(false)
    setIsSubmittingPr(false)

    navigate('/requests', {
      state: {
        flashMessage: `Draft saved: ${draftHeader.pr_number}`,
      },
      replace: false,
    })
  }

  const handleSubmitPr = async (event) => {
    event.preventDefault()

    if (!user?.id) {
      setSaveError('You must be signed in to submit a PR.')
      return
    }

    await persistPr({ submitAfterSave: true })
  }

  const handleManagerReviewAction = async (actionName) => {
    if (!prId) {
      return
    }

    const comment = String(reviewComment || '').trim()
    if (!comment) {
      setReviewActionError('Manager comment is required before taking review action.')
      setReviewActionSuccess('')
      return
    }

    let targetStatus = PR_STATUSES.APPROVED
    let successMessage = 'PR approved successfully.'

    if (actionName === 'reject') {
      targetStatus = PR_STATUSES.REJECTED
      successMessage = 'PR rejected successfully.'
    } else if (actionName === 'send_back') {
      targetStatus = PR_STATUSES.DRAFT
      successMessage = 'PR sent back to draft successfully.'
    }

    setReviewActionLoading(true)
    setReviewActionError('')
    setReviewActionSuccess('')

    const { error: actionError } = await setPrDecision({
      prId,
      status: targetStatus,
      managerComment: comment,
      actorUserId: user?.id,
      actorRole: role,
    })

    if (actionError) {
      setReviewActionError(actionError.message || 'Failed to update PR review action.')
      setReviewActionLoading(false)
      return
    }

    if (targetStatus === PR_STATUSES.DRAFT && role === ROLES.MANAGER) {
      setReviewActionLoading(false)
      navigate('/manager-approval', {
        state: { flashMessage: 'PR sent back to draft for requester revision.' },
      })
      return
    }

    const { data: refreshedPr, error: refreshError } = await fetchPrDetailWithLines(prId)
    if (refreshError || !refreshedPr?.id) {
      setReviewActionError(
        refreshError?.message || 'Action saved, but failed to refresh PR details.',
      )
      setReviewActionLoading(false)
      return
    }

    applyLoadedPrData(refreshedPr)
    await loadWorkflowHistory(refreshedPr.id)
    setReviewComment('')
    setReviewActionSuccess(successMessage)
    setReviewActionLoading(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={pageTitle}
        subtitle={pageSubtitle}
      />

      {isLoadingDraft ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Loading PR draft...
        </div>
      ) : null}

      {Boolean(prId) && normalizedActiveStatus === PR_STATUSES.APPROVED ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          This PR is approved and read-only. Use workflow history for the approval comment.
        </div>
      ) : null}

      {Boolean(prId) && normalizedActiveStatus === PR_STATUSES.REJECTED ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          This PR is rejected. Open workflow history below to review manager comments.
        </div>
      ) : null}

      {isReadOnlyMode && normalizedActiveStatus === PR_STATUSES.DRAFT ? (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700">
          This PR is draft, but only the owner can edit it.
        </div>
      ) : null}

      {isReadOnlyMode &&
      normalizedActiveStatus !== PR_STATUSES.DRAFT &&
      normalizedActiveStatus !== PR_STATUSES.APPROVED &&
      normalizedActiveStatus !== PR_STATUSES.REJECTED ? (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700">
          This PR is shown in read-only mode.
        </div>
      ) : null}

      {itemsError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {itemsError}
        </div>
      ) : null}

      {validationErrors.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Please fix the following:</p>
          <ul className="mt-2 list-disc pl-5">
            {validationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {saveError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {saveError}
        </div>
      ) : null}

      {saveSuccess ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {saveSuccess}
        </div>
      ) : null}

      {reviewActionError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {reviewActionError}
        </div>
      ) : null}

      {reviewActionSuccess ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {reviewActionSuccess}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <form
          onSubmit={handleSaveDraft}
          className="min-w-0 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:p-5"
        >
          {activeDraftNumber ? (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">
              Editing Draft: <span className="font-semibold">{activeDraftNumber}</span>
            </div>
          ) : null}

          {prId ? (
            <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700 md:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">PR Number</p>
                <p className="mt-1 font-medium text-slate-900">{activeDraftNumber || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Requester</p>
                <p className="mt-1 font-medium text-slate-900">{activeRequesterName || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
                <p className="mt-1 font-medium text-slate-900">
                  {normalizedActiveStatus ? getPrStatusLabel(normalizedActiveStatus) : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Needed By</p>
                <p className="mt-1 font-medium text-slate-900">{formValues.needed_by_date || '-'}</p>
              </div>
            </div>
          ) : null}

          {isManagerReviewer && prId ? (
            <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  Manager Review
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Add a comment, then approve, reject, or send this PR back to draft.
                </p>
              </div>

              <textarea
                rows={3}
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                placeholder="Enter manager review comment..."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                disabled={!canReviewPr || reviewActionLoading || isLoadingDraft}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleManagerReviewAction('approve')}
                  disabled={!canReviewPr || reviewActionLoading}
                  className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleManagerReviewAction('reject')}
                  disabled={!canReviewPr || reviewActionLoading}
                  className="rounded-md bg-rose-700 px-3 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => handleManagerReviewAction('send_back')}
                  disabled={!canReviewPr || reviewActionLoading}
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Send Back
                </button>
              </div>

              {!canReviewPr && prId ? (
                <p className="text-xs text-slate-500">
                  Review actions are available only for submitted PRs.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Department</label>
              <input
                type="text"
                value={formValues.department}
                onChange={handleHeaderChange('department')}
                placeholder="Operations"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                disabled={isReadOnlyMode || isLoadingDraft}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Needed By Date</label>
              <input
                type="date"
                value={formValues.needed_by_date}
                onChange={handleHeaderChange('needed_by_date')}
                min={minNeededByDate}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                disabled={isReadOnlyMode || isLoadingDraft}
              />
              <p className="mt-1 text-xs text-slate-500">
                Earliest allowed date: {minNeededByDate} (today + 7 days)
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Purpose / Request Title
              </label>
              <textarea
                rows={3}
                value={formValues.purpose}
                onChange={handleHeaderChange('purpose')}
                placeholder="Describe why this purchase request is needed."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                disabled={isReadOnlyMode || isLoadingDraft}
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Notes / Business Justification
              </label>
              <textarea
                rows={2}
                value={formValues.notes}
                onChange={handleHeaderChange('notes')}
                placeholder="Optional internal notes."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                disabled={isReadOnlyMode || isLoadingDraft}
              />
            </div>
          </div>

          <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">PR Lines</h3>
              <button
                type="button"
                onClick={handleAddLine}
                disabled={isReadOnlyMode || isLoadingDraft}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                + Add Line
              </button>
            </div>

            <PrLinesTableEditor
              lineItems={lineItems}
              itemsLoading={itemsLoading}
              catalogItems={catalogItems}
              getFilteredItemsForLine={getFilteredItemsForLine}
              onFieldChange={handleLineFieldChange}
              onSelectCatalogItem={handleSelectCatalogItem}
              onRemoveLine={handleRemoveLine}
              getLineEstimatedTotal={getLineEstimatedTotal}
              readOnly={isReadOnlyMode || isLoadingDraft}
            />

            <PrLinesCardEditor
              lineItems={lineItems}
              itemsLoading={itemsLoading}
              catalogItems={catalogItems}
              getFilteredItemsForLine={getFilteredItemsForLine}
              onFieldChange={handleLineFieldChange}
              onSelectCatalogItem={handleSelectCatalogItem}
              onRemoveLine={handleRemoveLine}
              getLineEstimatedTotal={getLineEstimatedTotal}
              readOnly={isReadOnlyMode || isLoadingDraft}
            />
          </div>

          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            Document Estimated Total:{' '}
            <span className="font-semibold">{formatCurrency(documentEstimatedTotal)}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {canEditDraft ? (
              <>
                <button
                  type="submit"
                  disabled={isSaving || isSubmittingPr || isLoadingDraft}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? 'Saving Draft...' : 'Save Draft'}
                </button>
                <button
                  type="button"
                  onClick={handleSubmitPr}
                  disabled={isSaving || isSubmittingPr || isLoadingDraft}
                  className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmittingPr ? 'Submitting PR...' : 'Submit PR'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Reset
                </button>
              </>
            ) : null}

            {isReadOnlyMode ? (
              <button
                type="button"
                onClick={() => navigate('/requests')}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back to Requests
              </button>
            ) : null}
          </div>
        </form>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Draft Guidance
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>1. Fill department and purpose first.</li>
              <li>2. Use Item Master search to auto-fill line details quickly.</li>
              <li>3. Free-text items are supported when no catalog item exists.</li>
              <li>4. Save Draft keeps status as draft, Submit PR sends it to manager.</li>
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Item Master Status
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {itemsLoading
                ? 'Loading active item catalog...'
                : `${catalogItems.length} active item(s) available for selection.`}
            </p>
          </div>

          {lastSavedDraft ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
                Last Saved Draft
              </h3>
              <p className="mt-2 text-sm text-emerald-700">
                <span className="font-medium">PR Number:</span> {lastSavedDraft.pr_number}
              </p>
              <p className="text-sm text-emerald-700">
                <span className="font-medium">Lines:</span> {lastSavedDraft.lines.length}
              </p>
            </div>
          ) : null}
        </aside>
      </div>

      {prId ? (
        <WorkflowTimeline
          entries={workflowHistoryEntries}
          loading={workflowHistoryLoading}
          errorMessage={workflowHistoryError}
          emptyMessage="No workflow history recorded for this PR yet."
          showMetadata
        />
      ) : null}
    </div>
  )
}

export default CreatePrPage
