import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatDate } from '../lib/formatters'
import { fetchPendingPrApprovals, setPrDecision } from '../lib/pr/prService'
import { PR_STATUSES } from '../lib/workflow/constants'
import { getPrStatusLabel } from '../lib/workflow/statusHelpers'

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

function ManagerApprovalPage() {
  const { user, role } = useAuth()
  const [pendingPrs, setPendingPrs] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [decisionNotes, setDecisionNotes] = useState({})
  const [isSaving, setIsSaving] = useState({})

  useEffect(() => {
    let isMounted = true

    const loadPendingPrs = async () => {
      setLoading(true)
      setErrorMessage('')

      const { data, error } = await fetchPendingPrApprovals()

      if (!isMounted) {
        return
      }

      if (error) {
        setErrorMessage(error.message)
        setPendingPrs([])
        setLoading(false)
        return
      }

      setPendingPrs(data || [])
      setLoading(false)
    }

    loadPendingPrs()

    return () => {
      isMounted = false
    }
  }, [])

  const refreshPendingPrs = async () => {
    const { data, error } = await fetchPendingPrApprovals()

    if (error) {
      setErrorMessage(error.message)
      return false
    }

    setPendingPrs(data || [])
    return true
  }

  const handleDecision = async (prId, nextStatus) => {
    setErrorMessage('')
    const note = decisionNotes[prId] || ''

    if (note.trim() === '') {
      setErrorMessage('Please add a manager comment before approving or rejecting.')
      return
    }

    setIsSaving((previous) => ({ ...previous, [prId]: true }))

    const { error } = await setPrDecision({
      prId,
      status: nextStatus,
      managerComment: note,
      actorUserId: user?.id,
      actorRole: role,
    })

    if (error) {
      setErrorMessage(error.message)
      setIsSaving((previous) => ({ ...previous, [prId]: false }))
      return
    }

    await refreshPendingPrs()
    setIsSaving((previous) => ({ ...previous, [prId]: false }))
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Manager Approval" subtitle="Review submitted PRs and approve or reject." />

      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Loading submitted PRs...</p> : null}

      {!loading && pendingPrs.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No submitted PRs found.
        </div>
      ) : null}

      <div className="space-y-4">
        {pendingPrs.map((item) => (
          <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">{item.purpose || 'Untitled PR'}</h3>
              <StatusBadge
                status={item.status || PR_STATUSES.SUBMITTED}
                text={getPrStatusLabel(item.status || PR_STATUSES.SUBMITTED)}
              />
            </div>

            <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <p>
                <span className="font-medium text-slate-700">PR Number:</span> {item.pr_number || '-'}
              </p>
              <p>
                <span className="font-medium text-slate-700">Requester:</span>{' '}
                {item.requester_name || 'Unknown Requester'}
              </p>
              <p>
                <span className="font-medium text-slate-700">Department:</span> {item.department || '-'}
              </p>
              <p>
                <span className="font-medium text-slate-700">Submitted:</span> {formatDate(item.created_at)}
              </p>
              <p>
                <span className="font-medium text-slate-700">Line Count:</span>{' '}
                {(item.pr_lines || []).length}
              </p>
              <p>
                <span className="font-medium text-slate-700">Estimated Total:</span>{' '}
                {formatCurrency(getPrEstimatedTotal(item))}
              </p>
            </div>

            <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
              <span className="font-medium text-slate-700">Notes:</span> {item.notes || '-'}
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
                onClick={() => handleDecision(item.id, PR_STATUSES.APPROVED)}
                disabled={Boolean(isSaving[item.id]) || !decisionNotes[item.id]?.trim()}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => handleDecision(item.id, PR_STATUSES.REJECTED)}
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
