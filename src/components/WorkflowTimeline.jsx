import { formatDate } from '../lib/formatters'
import { getRoleLabel } from '../lib/roles'
import { getWorkflowActionLabel } from '../lib/workflow/historyService'

function formatTimestamp(value) {
  if (!value) {
    return '-'
  }

  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function WorkflowTimeline({
  entries = [],
  loading = false,
  errorMessage = '',
  emptyMessage = 'No workflow history yet.',
  showMetadata = true,
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
        Workflow Timeline
      </h3>

      {loading ? <p className="mt-3 text-sm text-slate-500">Loading history...</p> : null}

      {!loading && errorMessage ? (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {!loading && !errorMessage && entries.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{emptyMessage}</p>
      ) : null}

      {!loading && !errorMessage && entries.length > 0 ? (
        <ol className="mt-4 space-y-3">
          {entries.map((entry) => {
            const metadataKeys =
              entry.metadata && typeof entry.metadata === 'object'
                ? Object.keys(entry.metadata)
                : []

            return (
              <li
                key={entry.id}
                className="rounded-md border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {getWorkflowActionLabel(entry.action)}
                  </p>
                  <p className="text-xs text-slate-500">{formatTimestamp(entry.created_at)}</p>
                </div>

                <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-600">
                  <span>Role: {getRoleLabel(entry.actor_role)}</span>
                  <span>User: {entry.actor_user_id?.slice(0, 8) || '-'}</span>
                  <span>Date: {formatDate(entry.created_at)}</span>
                </div>

                {entry.comment ? (
                  <p className="mt-2 text-sm text-slate-700">{entry.comment}</p>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No comment.</p>
                )}

                {showMetadata && metadataKeys.length > 0 ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-slate-600">
                      Metadata ({metadataKeys.length} key{metadataKeys.length > 1 ? 's' : ''})
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                      {JSON.stringify(entry.metadata, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : null}
    </div>
  )
}

export default WorkflowTimeline
