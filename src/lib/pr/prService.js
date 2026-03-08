import { supabase } from '../supabaseClient'
import { DOCUMENT_TYPES, PR_STATUS_LIST } from '../workflow/constants'
import { createWorkflowHistoryEntry } from '../workflow/historyService'
import { normalizePrStatus } from '../workflow/statusHelpers'
import {
  PR_DEFAULT_STATUS,
  PR_DETAIL_SELECT,
  PR_HEADER_SELECT,
  PR_LINE_SELECT,
  PR_TABLES,
} from './prConstants'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizeDateValue(value) {
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizeRequestedQty(value) {
  const numericValue = Number(value)
  if (Number.isNaN(numericValue) || numericValue <= 0) {
    return null
  }

  return numericValue
}

function normalizeEstimatedUnitPrice(value) {
  const numericValue = Number(value)
  if (Number.isNaN(numericValue) || numericValue < 0) {
    return null
  }

  return numericValue
}

function normalizeStatusForSave(status, fallback = PR_DEFAULT_STATUS) {
  const normalized = normalizePrStatus(status)
  if (PR_STATUS_LIST.includes(normalized)) {
    return normalized
  }

  return fallback
}

async function fetchCurrentUserIdentity() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { data: null, error: error || new Error('User not found.') }
  }

  return { data: user, error: null }
}

export async function createPrDraft({
  requesterName = '',
  department = '',
  purpose = '',
  neededByDate = null,
  notes = '',
} = {}) {
  const { data: user, error: userError } = await fetchCurrentUserIdentity()

  if (userError) {
    return { data: null, error: userError }
  }

  const payload = {
    requester_user_id: user.id,
    requester_name: normalizeText(requesterName) || user.email || 'Requester',
    department: normalizeNullableText(department),
    purpose: normalizeNullableText(purpose),
    needed_by_date: normalizeDateValue(neededByDate),
    status: PR_DEFAULT_STATUS,
    notes: normalizeNullableText(notes),
  }

  const { data, error } = await supabase
    .from(PR_TABLES.HEADERS)
    .insert(payload)
    .select(PR_HEADER_SELECT)
    .single()

  return { data, error }
}

export async function updatePrDraftHeader(prId, updates = {}) {
  const normalizedPrId = normalizeText(prId)
  if (!normalizedPrId) {
    return { data: null, error: new Error('PR ID is required.') }
  }

  const payload = {}

  if ('department' in updates) {
    payload.department = normalizeNullableText(updates.department)
  }

  if ('purpose' in updates) {
    payload.purpose = normalizeNullableText(updates.purpose)
  }

  if ('neededByDate' in updates) {
    payload.needed_by_date = normalizeDateValue(updates.neededByDate)
  }

  if ('notes' in updates) {
    payload.notes = normalizeNullableText(updates.notes)
  }

  if ('status' in updates) {
    const normalizedStatus = normalizePrStatus(updates.status)

    if (normalizedStatus && !PR_STATUS_LIST.includes(normalizedStatus)) {
      return { data: null, error: new Error(`Invalid PR status: ${updates.status}`) }
    }

    payload.status = normalizedStatus || PR_DEFAULT_STATUS
  }

  if (Object.keys(payload).length === 0) {
    return { data: null, error: new Error('At least one field must be provided for update.') }
  }

  const { data, error } = await supabase
    .from(PR_TABLES.HEADERS)
    .update(payload)
    .eq('id', normalizedPrId)
    .select(PR_HEADER_SELECT)
    .single()

  return { data, error }
}

export async function fetchPrList({
  status = '',
  searchTerm = '',
  limit = 100,
  order = 'desc',
} = {}) {
  const normalizedStatus = normalizeStatusForSave(status, '')
  const normalizedSearch = normalizeText(searchTerm)
  const normalizedLimit = Number(limit)
  const ascending = order === 'asc'

  let query = supabase
    .from(PR_TABLES.HEADERS)
    .select(PR_HEADER_SELECT)
    .order('created_at', { ascending })
    .limit(Number.isInteger(normalizedLimit) && normalizedLimit > 0 ? normalizedLimit : 100)

  if (normalizedStatus) {
    query = query.eq('status', normalizedStatus)
  }

  if (normalizedSearch) {
    query = query.or(
      [
        `pr_number.ilike.%${normalizedSearch}%`,
        `requester_name.ilike.%${normalizedSearch}%`,
        `department.ilike.%${normalizedSearch}%`,
        `purpose.ilike.%${normalizedSearch}%`,
      ].join(','),
    )
  }

  const { data, error } = await query
  return { data: data || [], error }
}

export async function fetchPrDetailWithLines(prId) {
  const normalizedPrId = normalizeText(prId)
  if (!normalizedPrId) {
    return { data: null, error: new Error('PR ID is required.') }
  }

  const { data, error } = await supabase
    .from(PR_TABLES.HEADERS)
    .select(PR_DETAIL_SELECT)
    .eq('id', normalizedPrId)
    .single()

  return { data, error }
}

export async function savePrLines(prId, lines = []) {
  const normalizedPrId = normalizeText(prId)
  if (!normalizedPrId) {
    return { data: null, error: new Error('PR ID is required.') }
  }

  if (!Array.isArray(lines)) {
    return { data: null, error: new Error('Lines must be an array.') }
  }

  if (lines.length === 0) {
    return { data: [], error: null }
  }

  const linePayload = []

  for (const line of lines) {
    const normalizedLineId = normalizeNullableText(line?.id)
    const requestedQty = normalizeRequestedQty(line?.requested_qty)
    const estimatedUnitPrice = normalizeEstimatedUnitPrice(line?.estimated_unit_price ?? 0)
    const itemName = normalizeText(line?.item_name)
    const unit = normalizeText(line?.unit)

    if (!itemName || !unit || requestedQty === null || estimatedUnitPrice === null) {
      return {
        data: null,
        error: new Error(
          'Each line needs item_name, unit, requested_qty > 0, and estimated_unit_price >= 0.',
        ),
      }
    }

    const payload = {
      pr_id: normalizedPrId,
      item_id: normalizeNullableText(line?.item_id),
      sku: normalizeNullableText(line?.sku),
      item_name: itemName,
      description: normalizeNullableText(line?.description),
      unit,
      requested_qty: requestedQty,
      estimated_unit_price: estimatedUnitPrice,
      preferred_supplier_id: normalizeNullableText(line?.preferred_supplier_id),
      remarks: normalizeNullableText(line?.remarks),
    }

    if (normalizedLineId) {
      payload.id = normalizedLineId
    }

    linePayload.push(payload)
  }

  const { data, error } = await supabase
    .from(PR_TABLES.LINES)
    .upsert(linePayload, { onConflict: 'id' })
    .select(PR_LINE_SELECT)

  return { data: data || [], error }
}

export async function deletePrLine(prLineId) {
  const normalizedLineId = normalizeText(prLineId)
  if (!normalizedLineId) {
    return { data: null, error: new Error('PR line ID is required.') }
  }

  const { data, error } = await supabase
    .from(PR_TABLES.LINES)
    .delete()
    .eq('id', normalizedLineId)
    .select(PR_LINE_SELECT)
    .maybeSingle()

  return { data, error }
}

export async function appendPrWorkflowHistory({
  prId,
  action,
  actorUserId,
  actorRole,
  comment = '',
  metadata = null,
}) {
  const normalizedPrId = normalizeText(prId)
  if (!normalizedPrId) {
    return { data: null, error: new Error('PR ID is required for workflow history.') }
  }

  return createWorkflowHistoryEntry({
    documentType: DOCUMENT_TYPES.PR,
    documentId: normalizedPrId,
    action,
    actorUserId,
    actorRole,
    comment,
    metadata,
  })
}
