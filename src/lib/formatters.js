const DEFAULT_CURRENCY = 'THB'
const DEFAULT_LOCALE = 'th-TH'

export function formatCurrency(amount, currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE) {
  const normalizedCurrency = String(currency || DEFAULT_CURRENCY)
    .trim()
    .toUpperCase()

  const numericAmount = Number(amount || 0)

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: normalizedCurrency || DEFAULT_CURRENCY,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(numericAmount)
  } catch {
    return new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: 'currency',
      currency: DEFAULT_CURRENCY,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(numericAmount)
  }
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
  return getPrStatusLabel(status)
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
import { getPrStatusLabel } from './workflow/statusHelpers'
