import {
  DOCUMENT_TYPES,
  LEGACY_PR_STATUS_ALIASES,
  PO_STATUSES,
  PR_STATUSES,
} from './constants'

function toReadableLabel(value) {
  const normalized = String(value || '').trim()

  if (!normalized) {
    return ''
  }

  return normalized
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')
}

export function normalizePrStatus(status) {
  const normalized = String(status || '')
    .trim()
    .toLowerCase()

  if (!normalized) {
    return ''
  }

  return LEGACY_PR_STATUS_ALIASES[normalized] || normalized
}

export function normalizePoStatus(status) {
  return String(status || '')
    .trim()
    .toLowerCase()
}

export const PR_STATUS_LABELS = {
  [PR_STATUSES.DRAFT]: 'Draft',
  [PR_STATUSES.SUBMITTED]: 'Submitted',
  [PR_STATUSES.APPROVED]: 'Approved',
  [PR_STATUSES.REJECTED]: 'Rejected',
  [PR_STATUSES.CONVERTED_TO_PO]: 'Converted to PO',
  [PR_STATUSES.CLOSED]: 'Closed',
}

export const PO_STATUS_LABELS = {
  [PO_STATUSES.DRAFT]: 'Draft',
  [PO_STATUSES.PENDING_VARIANCE_CONFIRMATION]: 'Pending Variance Confirmation',
  [PO_STATUSES.PENDING_FINAL_APPROVAL]: 'Pending Final Approval',
  [PO_STATUSES.APPROVED_FOR_PAYMENT]: 'Approved for Payment',
  [PO_STATUSES.PENDING_ACCOUNTING_CHECK]: 'Pending Accounting Check',
  [PO_STATUSES.ACCOUNTING_IN_REVIEW]: 'Accounting in Review',
  [PO_STATUSES.ORDERED]: 'Ordered',
  [PO_STATUSES.PARTIALLY_RECEIVED]: 'Partially Received',
  [PO_STATUSES.FULLY_RECEIVED]: 'Fully Received',
  [PO_STATUSES.CLOSED]: 'Closed',
  [PO_STATUSES.CANCELLED]: 'Cancelled',
}

export function getPrStatusLabel(status) {
  const normalized = normalizePrStatus(status)
  return PR_STATUS_LABELS[normalized] || toReadableLabel(normalized)
}

export function getPoStatusLabel(status) {
  const normalized = normalizePoStatus(status)
  return PO_STATUS_LABELS[normalized] || toReadableLabel(normalized)
}

export function getStatusLabel(status, documentType = DOCUMENT_TYPES.PR) {
  if (documentType === DOCUMENT_TYPES.PO) {
    return getPoStatusLabel(status)
  }

  return getPrStatusLabel(status)
}

const STATUS_BADGE_CLASSES = {
  [PR_STATUSES.DRAFT]: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  [PR_STATUSES.SUBMITTED]: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  [PR_STATUSES.APPROVED]: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  [PR_STATUSES.REJECTED]: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  [PR_STATUSES.CONVERTED_TO_PO]: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  [PR_STATUSES.CLOSED]: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  [PO_STATUSES.PENDING_VARIANCE_CONFIRMATION]: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  [PO_STATUSES.PENDING_FINAL_APPROVAL]: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  [PO_STATUSES.APPROVED_FOR_PAYMENT]: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  [PO_STATUSES.PENDING_ACCOUNTING_CHECK]: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  [PO_STATUSES.ACCOUNTING_IN_REVIEW]: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  [PO_STATUSES.ORDERED]: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  [PO_STATUSES.PARTIALLY_RECEIVED]: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  [PO_STATUSES.FULLY_RECEIVED]: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  [PO_STATUSES.CLOSED]: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  [PO_STATUSES.CANCELLED]: 'bg-rose-50 text-rose-700 ring-rose-600/20',
}

export function getStatusBadgeClass(status, documentType = DOCUMENT_TYPES.PR) {
  const normalized =
    documentType === DOCUMENT_TYPES.PO ? normalizePoStatus(status) : normalizePrStatus(status)

  return STATUS_BADGE_CLASSES[normalized] || 'bg-slate-100 text-slate-700 ring-slate-500/20'
}

export const PR_STATUS_TRANSITIONS = {
  [PR_STATUSES.DRAFT]: [PR_STATUSES.SUBMITTED],
  [PR_STATUSES.SUBMITTED]: [PR_STATUSES.APPROVED, PR_STATUSES.REJECTED],
  [PR_STATUSES.APPROVED]: [PR_STATUSES.CONVERTED_TO_PO],
  [PR_STATUSES.REJECTED]: [],
  [PR_STATUSES.CONVERTED_TO_PO]: [PR_STATUSES.CLOSED],
  [PR_STATUSES.CLOSED]: [],
}

export const CANCELLABLE_PO_STATUSES = [
  PO_STATUSES.DRAFT,
  PO_STATUSES.PENDING_VARIANCE_CONFIRMATION,
  PO_STATUSES.PENDING_FINAL_APPROVAL,
  PO_STATUSES.APPROVED_FOR_PAYMENT,
  PO_STATUSES.PENDING_ACCOUNTING_CHECK,
  PO_STATUSES.ACCOUNTING_IN_REVIEW,
  PO_STATUSES.ORDERED,
  PO_STATUSES.PARTIALLY_RECEIVED,
  PO_STATUSES.FULLY_RECEIVED,
]

export const PO_STATUS_TRANSITIONS = {
  [PO_STATUSES.DRAFT]: [
    PO_STATUSES.PENDING_VARIANCE_CONFIRMATION,
    PO_STATUSES.PENDING_FINAL_APPROVAL,
    PO_STATUSES.CANCELLED,
  ],
  [PO_STATUSES.PENDING_VARIANCE_CONFIRMATION]: [
    PO_STATUSES.PENDING_FINAL_APPROVAL,
    PO_STATUSES.CANCELLED,
  ],
  [PO_STATUSES.PENDING_FINAL_APPROVAL]: [
    PO_STATUSES.APPROVED_FOR_PAYMENT,
    PO_STATUSES.CANCELLED,
  ],
  [PO_STATUSES.APPROVED_FOR_PAYMENT]: [
    PO_STATUSES.PENDING_ACCOUNTING_CHECK,
    PO_STATUSES.CANCELLED,
  ],
  [PO_STATUSES.PENDING_ACCOUNTING_CHECK]: [
    PO_STATUSES.ACCOUNTING_IN_REVIEW,
    PO_STATUSES.CANCELLED,
  ],
  [PO_STATUSES.ACCOUNTING_IN_REVIEW]: [PO_STATUSES.ORDERED, PO_STATUSES.CANCELLED],
  [PO_STATUSES.ORDERED]: [
    PO_STATUSES.PARTIALLY_RECEIVED,
    PO_STATUSES.FULLY_RECEIVED,
    PO_STATUSES.CANCELLED,
  ],
  [PO_STATUSES.PARTIALLY_RECEIVED]: [PO_STATUSES.FULLY_RECEIVED, PO_STATUSES.CANCELLED],
  [PO_STATUSES.FULLY_RECEIVED]: [PO_STATUSES.CLOSED, PO_STATUSES.CANCELLED],
  [PO_STATUSES.CLOSED]: [],
  [PO_STATUSES.CANCELLED]: [],
}

export function canTransitionStatus({ documentType = DOCUMENT_TYPES.PR, fromStatus, toStatus }) {
  const normalizedFrom =
    documentType === DOCUMENT_TYPES.PO
      ? normalizePoStatus(fromStatus)
      : normalizePrStatus(fromStatus)

  const normalizedTo =
    documentType === DOCUMENT_TYPES.PO
      ? normalizePoStatus(toStatus)
      : normalizePrStatus(toStatus)

  const transitionMap =
    documentType === DOCUMENT_TYPES.PO ? PO_STATUS_TRANSITIONS : PR_STATUS_TRANSITIONS

  return Boolean(transitionMap[normalizedFrom]?.includes(normalizedTo))
}
