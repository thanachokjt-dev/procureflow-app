const statusClasses = {
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  high: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  medium: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  low: 'bg-slate-100 text-slate-700 ring-slate-500/20',
}

function StatusBadge({ text }) {
  const normalizedText = String(text || '').toLowerCase()

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        statusClasses[normalizedText] ||
        'bg-slate-100 text-slate-700 ring-slate-500/20'
      }`}
    >
      {text}
    </span>
  )
}

export default StatusBadge
