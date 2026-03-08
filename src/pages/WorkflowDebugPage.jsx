import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import WorkflowTimeline from '../components/WorkflowTimeline'
import { useAuth } from '../context/AuthContext'
import {
  APPROVAL_ACTIONS,
  APPROVAL_ACTION_LIST,
  APP_ROLE_LIST,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LIST,
  PO_STATUS_LIST,
  PR_STATUSES,
  PR_STATUS_LIST,
  WORKFLOW_ACTIONS,
  WORKFLOW_ACTION_LIST,
} from '../lib/workflow/constants'
import { getRoleLabel } from '../lib/roles'
import {
  createWorkflowHistoryEntry,
  fetchWorkflowHistoryEntries,
} from '../lib/workflow/historyService'
import {
  PO_STATUS_TRANSITIONS,
  PR_STATUS_TRANSITIONS,
  getPoStatusLabel,
  getPrStatusLabel,
} from '../lib/workflow/statusHelpers'
import {
  DEFAULT_VARIANCE_CONFIG,
  VARIANCE_REASON_LIST,
  getVarianceReasonLabel,
} from '../lib/workflow/varianceConstants'
import { comparePrAndPoLines } from '../lib/workflow/varianceHelpers'
import {
  WORKFLOW_ACTION_ROLE_PERMISSIONS,
  checkStatusTransition,
  checkWorkflowActionPermission,
  checkWorkflowGuard,
} from '../lib/workflow/guardHelpers'

const samplePrLines = [
  {
    id: 'pr-line-1',
    item_id: 'item-001',
    item_name: '24-inch Monitor',
    supplier_id: 'sup-001',
    supplier_name: 'Acme Supplies Co.',
    qty: 5,
    unit_price: 120,
    lead_time_days: 7,
    spec_text: 'IPS panel, 1080p',
  },
  {
    id: 'pr-line-2',
    item_id: 'item-002',
    item_name: 'Wireless Mouse',
    supplier_id: 'sup-002',
    supplier_name: 'Blue Electronics',
    qty: 10,
    unit_price: 15,
    lead_time_days: 3,
    spec_text: '2.4GHz',
  },
]

const samplePoDraftLines = [
  {
    id: 'po-line-a',
    source_pr_line_id: 'pr-line-1',
    item_id: 'item-001',
    item_name: '24-inch Monitor',
    supplier_id: 'sup-001',
    supplier_name: 'Acme Supplies Co.',
    qty: 6,
    unit_price: 130,
    lead_time_days: 10,
    spec_text: 'IPS panel, 1080p',
  },
]

function TransitionList({ title, transitionMap, getLabel }) {
  const entries = Object.entries(transitionMap)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
      <div className="mt-3 space-y-2 text-sm text-slate-700">
        {entries.map(([fromStatus, toStatuses]) => (
          <div key={fromStatus} className="rounded-md bg-slate-50 px-3 py-2">
            <p className="font-medium text-slate-800">{getLabel(fromStatus)}</p>
            <p className="text-xs text-slate-500">
              {toStatuses.length > 0
                ? toStatuses.map((status) => getLabel(status)).join(', ')
                : 'No next status'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function WorkflowDebugPage() {
  const { user, role } = useAuth()
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES.PR)
  const [documentId, setDocumentId] = useState('')
  const [historyOrder, setHistoryOrder] = useState('desc')
  const [historyAction, setHistoryAction] = useState(APPROVAL_ACTIONS.SUBMIT)
  const [historyComment, setHistoryComment] = useState('')
  const [metadataText, setMetadataText] = useState('{\n  "source": "workflow_debug_page"\n}')
  const [historyEntries, setHistoryEntries] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historySuccess, setHistorySuccess] = useState('')
  const [prLinesText, setPrLinesText] = useState(JSON.stringify(samplePrLines, null, 2))
  const [poDraftLinesText, setPoDraftLinesText] = useState(
    JSON.stringify(samplePoDraftLines, null, 2),
  )
  const [priceThresholdPercent, setPriceThresholdPercent] = useState(
    String(DEFAULT_VARIANCE_CONFIG.priceIncreaseThresholdPercent),
  )
  const [leadTimeThresholdDays, setLeadTimeThresholdDays] = useState(
    String(DEFAULT_VARIANCE_CONFIG.leadTimeThresholdDays),
  )
  const [varianceError, setVarianceError] = useState('')
  const [varianceResult, setVarianceResult] = useState(null)
  const [guardRole, setGuardRole] = useState(APP_ROLE_LIST[0])
  const [guardAction, setGuardAction] = useState(WORKFLOW_ACTION_LIST[0])
  const [guardDocumentType, setGuardDocumentType] = useState(DOCUMENT_TYPES.PR)
  const [guardFromStatus, setGuardFromStatus] = useState(PR_STATUSES.DRAFT)
  const [guardToStatus, setGuardToStatus] = useState(PR_STATUSES.SUBMITTED)
  const [guardResult, setGuardResult] = useState(null)

  const handleFetchHistory = async () => {
    setHistoryError('')
    setHistorySuccess('')

    if (!documentId.trim()) {
      setHistoryError('Document ID is required to fetch workflow history.')
      return
    }

    setHistoryLoading(true)
    const { data, error } = await fetchWorkflowHistoryEntries({
      documentType,
      documentId,
      order: historyOrder,
    })

    if (error) {
      setHistoryError(error.message)
      setHistoryEntries([])
      setHistoryLoading(false)
      return
    }

    setHistoryEntries(data || [])
    setHistoryLoading(false)
  }

  const handleCreateHistory = async () => {
    setHistoryError('')
    setHistorySuccess('')

    if (!documentId.trim()) {
      setHistoryError('Document ID is required before creating history.')
      return
    }

    if (!user?.id) {
      setHistoryError('You must be signed in to create workflow history.')
      return
    }

    let metadata = null
    const metadataCandidate = metadataText.trim()

    if (metadataCandidate) {
      try {
        metadata = JSON.parse(metadataCandidate)
      } catch {
        setHistoryError('Metadata must be valid JSON.')
        return
      }
    }

    setHistoryLoading(true)

    const { error } = await createWorkflowHistoryEntry({
      documentType,
      documentId,
      action: historyAction,
      actorUserId: user.id,
      actorRole: role,
      comment: historyComment,
      metadata,
    })

    if (error) {
      setHistoryError(error.message)
      setHistoryLoading(false)
      return
    }

    setHistorySuccess('Workflow history entry created.')
    setHistoryLoading(false)
    await handleFetchHistory()
  }

  const handleRunVarianceComparison = () => {
    setVarianceError('')

    let parsedPrLines = []
    let parsedPoLines = []

    try {
      parsedPrLines = JSON.parse(prLinesText)
    } catch {
      setVarianceError('PR Lines JSON is invalid.')
      setVarianceResult(null)
      return
    }

    try {
      parsedPoLines = JSON.parse(poDraftLinesText)
    } catch {
      setVarianceError('PO Draft Lines JSON is invalid.')
      setVarianceResult(null)
      return
    }

    if (!Array.isArray(parsedPrLines) || !Array.isArray(parsedPoLines)) {
      setVarianceError('PR and PO inputs must both be JSON arrays.')
      setVarianceResult(null)
      return
    }

    const result = comparePrAndPoLines({
      prLines: parsedPrLines,
      poDraftLines: parsedPoLines,
      config: {
        priceIncreaseThresholdPercent: Number(priceThresholdPercent || 0),
        leadTimeThresholdDays: Number(leadTimeThresholdDays || 0),
      },
    })

    setVarianceResult(result)
  }

  const currentStatusOptions =
    guardDocumentType === DOCUMENT_TYPES.PO ? PO_STATUS_LIST : PR_STATUS_LIST

  const handleGuardDocumentTypeChange = (nextDocumentType) => {
    setGuardDocumentType(nextDocumentType)

    if (nextDocumentType === DOCUMENT_TYPES.PO) {
      setGuardFromStatus(PO_STATUS_LIST[0])
      setGuardToStatus(PO_STATUS_LIST[1] || PO_STATUS_LIST[0])
      return
    }

    setGuardFromStatus(PR_STATUS_LIST[0])
    setGuardToStatus(PR_STATUS_LIST[1] || PR_STATUS_LIST[0])
  }

  const handleRunGuardCheck = () => {
    const result = checkWorkflowGuard({
      role: guardRole,
      action: guardAction,
      documentType: guardDocumentType,
      fromStatus: guardFromStatus,
      toStatus: guardToStatus,
      requireTransition: true,
    })

    setGuardResult(result)
  }

  const sampleGuardChecks = [
    {
      label: 'Requester trying to approve PR',
      result: checkWorkflowActionPermission({
        role: APP_ROLE_LIST[0],
        action: WORKFLOW_ACTIONS.APPROVE_PR,
      }),
    },
    {
      label: 'Manager approving PR',
      result: checkWorkflowActionPermission({
        role: 'manager',
        action: WORKFLOW_ACTIONS.APPROVE_PR,
      }),
    },
    {
      label: 'PR draft -> approved transition',
      result: checkStatusTransition({
        documentType: DOCUMENT_TYPES.PR,
        fromStatus: PR_STATUSES.DRAFT,
        toStatus: PR_STATUSES.APPROVED,
      }),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflow Debug"
        subtitle="Internal constants and transition model reference."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Roles</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {APP_ROLE_LIST.map((role) => (
              <li key={role}>{role}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            PR Statuses
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {PR_STATUS_LIST.map((status) => (
              <li key={status}>
                {status} ({getPrStatusLabel(status)})
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            PO Statuses
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {PO_STATUS_LIST.map((status) => (
              <li key={status}>
                {status} ({getPoStatusLabel(status)})
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Approval Actions
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {APPROVAL_ACTION_LIST.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Document Types
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {DOCUMENT_TYPE_LIST.map((docType) => (
              <li key={docType}>{docType}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TransitionList
          title="PR Status Transitions"
          transitionMap={PR_STATUS_TRANSITIONS}
          getLabel={getPrStatusLabel}
        />
        <TransitionList
          title="PO Status Transitions"
          transitionMap={PO_STATUS_TRANSITIONS}
          getLabel={getPoStatusLabel}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Role / Action Permissions
          </h3>

          <div className="space-y-2">
            {WORKFLOW_ACTION_LIST.map((action) => (
              <div key={action} className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-sm font-medium text-slate-800">{action}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {(
                    WORKFLOW_ACTION_ROLE_PERMISSIONS[action] || []
                  ).map((allowedRole) => getRoleLabel(allowedRole)).join(', ') || 'No roles'}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Guard Check
          </h3>

          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Role
              </label>
              <select
                value={guardRole}
                onChange={(event) => setGuardRole(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                {APP_ROLE_LIST.map((roleOption) => (
                  <option key={roleOption} value={roleOption}>
                    {roleOption}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Action
              </label>
              <select
                value={guardAction}
                onChange={(event) => setGuardAction(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                {WORKFLOW_ACTION_LIST.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Document Type
              </label>
              <select
                value={guardDocumentType}
                onChange={(event) => handleGuardDocumentTypeChange(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                {DOCUMENT_TYPE_LIST.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                From Status
              </label>
              <select
                value={guardFromStatus}
                onChange={(event) => setGuardFromStatus(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                {currentStatusOptions.map((statusOption) => (
                  <option key={`from-${statusOption}`} value={statusOption}>
                    {statusOption}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              To Status
            </label>
            <select
              value={guardToStatus}
              onChange={(event) => setGuardToStatus(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            >
              {currentStatusOptions.map((statusOption) => (
                <option key={`to-${statusOption}`} value={statusOption}>
                  {statusOption}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleRunGuardCheck}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Run Guard Check
          </button>

          {guardResult ? (
            <div
              className={`rounded-md border p-3 text-sm ${
                guardResult.allowed
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              <p className="font-medium">{guardResult.allowed ? 'Allowed' : 'Denied'}</p>
              <p>{guardResult.reason || 'No issues found.'}</p>
            </div>
          ) : null}

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Sample Checks
            </p>
            <div className="mt-2 space-y-2 text-sm">
              {sampleGuardChecks.map((sample) => (
                <div key={sample.label} className="rounded-md bg-white px-3 py-2">
                  <p className="font-medium text-slate-800">{sample.label}</p>
                  <p className={sample.result.allowed ? 'text-emerald-700' : 'text-rose-700'}>
                    {sample.result.allowed ? 'Allowed' : 'Denied'}
                    {!sample.result.allowed ? `: ${sample.result.reason}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Workflow History Test
          </h3>

          {historyError ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {historyError}
            </div>
          ) : null}

          {historySuccess ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {historySuccess}
            </div>
          ) : null}

          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-1">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Document Type
              </label>
              <select
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                {DOCUMENT_TYPE_LIST.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Document ID
              </label>
              <input
                type="text"
                value={documentId}
                onChange={(event) => setDocumentId(event.target.value)}
                placeholder="Paste PR/PO UUID"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Action
              </label>
              <select
                value={historyAction}
                onChange={(event) => setHistoryAction(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                {APPROVAL_ACTION_LIST.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Timeline Order
              </label>
              <select
                value={historyOrder}
                onChange={(event) => setHistoryOrder(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Comment
            </label>
            <textarea
              rows={2}
              value={historyComment}
              onChange={(event) => setHistoryComment(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              placeholder="Optional workflow note"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Metadata JSON
            </label>
            <textarea
              rows={5}
              value={metadataText}
              onChange={(event) => setMetadataText(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-slate-500"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCreateHistory}
              disabled={historyLoading}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Add Test Entry
            </button>
            <button
              type="button"
              onClick={handleFetchHistory}
              disabled={historyLoading}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Fetch History
            </button>
          </div>
        </div>

        <WorkflowTimeline
          entries={historyEntries}
          loading={historyLoading}
          errorMessage={historyError}
          emptyMessage="No entries for this document yet."
          showMetadata
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Variance Comparison Test
          </h3>

          {varianceError ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {varianceError}
            </div>
          ) : null}

          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Price Threshold %
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={priceThresholdPercent}
                onChange={(event) => setPriceThresholdPercent(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Lead Time Threshold Days
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={leadTimeThresholdDays}
                onChange={(event) => setLeadTimeThresholdDays(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              PR Lines JSON
            </label>
            <textarea
              rows={9}
              value={prLinesText}
              onChange={(event) => setPrLinesText(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-slate-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              PO Draft Lines JSON
            </label>
            <textarea
              rows={9}
              value={poDraftLinesText}
              onChange={(event) => setPoDraftLinesText(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-slate-500"
            />
          </div>

          <button
            type="button"
            onClick={handleRunVarianceComparison}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Run Variance Comparison
          </button>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Variance Result
          </h3>

          {!varianceResult ? (
            <p className="text-sm text-slate-500">
              Run the comparison to inspect reason flags and line-level results.
            </p>
          ) : null}

          {varianceResult ? (
            <div className="space-y-3">
              <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                <p>
                  <span className="font-medium">Has Variance:</span>{' '}
                  {varianceResult.hasVariance ? 'Yes' : 'No'}
                </p>
                <p>
                  <span className="font-medium">Variance Lines:</span>{' '}
                  {varianceResult.summary.varianceLineCount}
                </p>
                <p>
                  <span className="font-medium">PR Lines:</span> {varianceResult.summary.totalPrLines}
                </p>
                <p>
                  <span className="font-medium">PO Lines:</span> {varianceResult.summary.totalPoLines}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Triggered Reasons
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {varianceResult.reasons.length > 0 ? (
                    varianceResult.reasons.map((reason) => (
                      <span
                        key={reason}
                        className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                      >
                        {getVarianceReasonLabel(reason)}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">No reasons triggered.</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Reason Catalog
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {VARIANCE_REASON_LIST.map((reason) => getVarianceReasonLabel(reason)).join(', ')}
                </p>
              </div>

              <details>
                <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate-500">
                  Line-Level Result JSON
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                  {JSON.stringify(varianceResult, null, 2)}
                </pre>
              </details>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default WorkflowDebugPage
