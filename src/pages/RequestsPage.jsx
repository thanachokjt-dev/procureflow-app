import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatDate, formatStatus } from '../lib/formatters'
import { fetchMyPurchaseRequests, getRequestTotal } from '../lib/procurementData'
import { supabase } from '../lib/supabaseClient'

function RequestsPage() {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const loadRequests = async () => {
      if (!user?.id) {
        setRequests([])
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')

      const { data, error } = await fetchMyPurchaseRequests(user.id)

      if (error) {
        setErrorMessage(error.message)
        setRequests([])
        setLoading(false)
        return
      }

      setRequests(data || [])
      setLoading(false)
    }

    loadRequests()

    if (!user?.id) {
      return undefined
    }

    const requestsChannel = supabase
      .channel(`purchase-requests-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchase_requests',
          filter: `requester_id=eq.${user.id}`,
        },
        () => {
          loadRequests()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(requestsChannel)
    }
  }, [user?.id])

  const summary = useMemo(() => {
    const pendingCount = requests.filter((item) => item.status === 'pending').length
    const approvedCount = requests.filter((item) => item.status === 'approved').length
    const rejectedCount = requests.filter((item) => item.status === 'rejected').length

    return {
      total: requests.length,
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
    }
  }, [requests])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requests"
        subtitle="Track your procurement requests and approval progress."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.total}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pending</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.pending}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Approved</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.approved}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Rejected</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.rejected}</p>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="px-3 py-2.5 font-medium">Request ID</th>
              <th className="px-3 py-2.5 font-medium">Title</th>
              <th className="px-3 py-2.5 font-medium">Department</th>
              <th className="px-3 py-2.5 font-medium">Supplier</th>
              <th className="px-3 py-2.5 font-medium">Created</th>
              <th className="px-3 py-2.5 font-medium">Amount</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Manager Comment</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {loading ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={8}>
                  Loading your requests...
                </td>
              </tr>
            ) : null}

            {!loading && requests.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={8}>
                  You have no requests yet.
                </td>
              </tr>
            ) : null}

            {!loading
              ? requests.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-700">
                      {item.id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{item.title}</td>
                    <td className="px-3 py-3 text-slate-600">{item.department}</td>
                    <td className="px-3 py-3 text-slate-600">
                      {item.supplier_name || '-'}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatDate(item.created_at)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {formatCurrency(getRequestTotal(item))}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge text={formatStatus(item.status)} />
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {item.manager_comment || '-'}
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

export default RequestsPage
