export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0))
}

export function formatDate(dateValue) {
  if (!dateValue) {
    return '-'
  }

  return new Date(dateValue).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatStatus(status) {
  if (!status) {
    return ''
  }

  const normalized = String(status).toLowerCase()

  if (normalized === 'pending') return 'Pending'
  if (normalized === 'approved') return 'Approved'
  if (normalized === 'rejected') return 'Rejected'

  return status
}

export function formatPriority(priority) {
  if (!priority) {
    return ''
  }

  const normalized = String(priority).toLowerCase()

  if (normalized === 'high') return 'High'
  if (normalized === 'medium') return 'Medium'
  if (normalized === 'low') return 'Low'

  return priority
}
