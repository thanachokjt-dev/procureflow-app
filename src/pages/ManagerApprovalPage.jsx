import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { formatCurrency, formatDate } from '../lib/formatters'
import {
  fetchPendingPurchaseRequests,
  getRequestTotal,
  REQUEST_STATUS,
  setRequestDecision,
} from '../lib/procurementData'

function ManagerApprovalPage() {
  const [pendingRequests, setPendingRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [decisionNotes, setDecisionNotes] = useState({})
  const [isSaving, setIsSaving] = useState({})

  useEffect(() => {
    const loadPendingRequests = async () => {
      setLoading(true)
      setErrorMessage('')

      const { data, error } = await fetchPendingPurchaseRequests()

      if (error) {
        setErrorMessage(error.message)
        setPendingRequests([])
        setLoading(false)
        return
      }

      setPendingRequests(data || [])
      setLoading(false)
    }

    loadPendingRequests()
  }, [])

  const refreshPendingRequests = async () => {
    const { data, error } = await fetchPendingPurchaseRequests()

    if (error) {
      setErrorMessage(error.message)
      return false
    }

    setPendingRequests(data || [])
    return true
  }

  const handleDecision = async (requestId, nextStatus) => {
    setErrorMessage('')
    const note = decisionNotes[requestId] || ''

    if (note.trim() === '') {
      setErrorMessage('Please add a manager comment before approving or rejecting.')
      return
    }

    setIsSaving((previous) => ({ ...previous, [requestId]: true }))

    const { error } = await setRequestDecision({
      requestId,
      status: nextStatus,
      managerComment: note,
    })

    if (error) {
      setErrorMessage(error.message)
      setIsSaving((previous) => ({ ...previous, [requestId]: false }))
      return
    }

    await refreshPendingRequests()
    setIsSaving((previous) => ({ ...previous, [requestId]: false }))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manager Approval"
        subtitle="Review pending requests and approve or reject them."
      />

      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Loading pending requests...</p> : null}

      {!loading && pendingRequests.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No pending requests found.
        </div>
      ) : null}

      <div className="space-y-4">
        {pendingRequests.map((item) => (
          <article
            key={item.id}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
              <StatusBadge text="Pending" />
            </div>

            <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <p>
                <span className="font-medium text-slate-700">Requester:</span>{' '}
                {item.requester_email}
              </p>
              <p>
                <span className="font-medium text-slate-700">Department:</span>{' '}
                {item.department}
              </p>
              <p>
                <span className="font-medium text-slate-700">Submitted:</span>{' '}
                {formatDate(item.created_at)}
              </p>
              <p>
                <span className="font-medium text-slate-700">Amount:</span>{' '}
                {formatCurrency(getRequestTotal(item))}
              </p>
            </div>

            <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
              <span className="font-medium text-slate-700">Justification:</span>{' '}
              {item.justification}
            </p>

            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Manager Comment (Required)
              </label>
              <textarea
                rows={2}
                value={decisionNotes[item.id] || ''}
                onChange={(event) =>
                  setDecisionNotes((previous) => ({
                    ...previous,
                    [item.id]: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                placeholder="Add reason for approval or rejection"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => handleDecision(item.id, REQUEST_STATUS.APPROVED)}
                disabled={Boolean(isSaving[item.id]) || !decisionNotes[item.id]?.trim()}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => handleDecision(item.id, REQUEST_STATUS.REJECTED)}
                disabled={Boolean(isSaving[item.id]) || !decisionNotes[item.id]?.trim()}
                className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Reject
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

export default ManagerApprovalPage
