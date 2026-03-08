import { DOCUMENT_TYPES } from '../lib/workflow/constants'
import { getStatusBadgeClass, getStatusLabel } from '../lib/workflow/statusHelpers'

const priorityClasses = {
  high: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  medium: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  low: 'bg-slate-100 text-slate-700 ring-slate-500/20',
}

function StatusBadge({ text, status, documentType = DOCUMENT_TYPES.PR }) {
  const rawValue = String(status || text || '')
  const normalizedText = rawValue.toLowerCase()
  const displayText = text || getStatusLabel(rawValue, documentType)
  const statusClass = getStatusBadgeClass(rawValue, documentType)
  const className = priorityClasses[normalizedText] || statusClass

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        className
      }`}
    >
      {displayText}
    </span>
  )
}

export default StatusBadge
