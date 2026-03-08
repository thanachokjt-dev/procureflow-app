import { supabase } from './supabaseClient'
import { PR_STATUSES } from './workflow/constants'
import { normalizePrStatus } from './workflow/statusHelpers'

export const REQUEST_STATUS = {
  DRAFT: PR_STATUSES.DRAFT,
  SUBMITTED: PR_STATUSES.SUBMITTED,
  APPROVED: PR_STATUSES.APPROVED,
  REJECTED: PR_STATUSES.REJECTED,
  CONVERTED_TO_PO: PR_STATUSES.CONVERTED_TO_PO,
  CLOSED: PR_STATUSES.CLOSED,
  // Current database value before workflow enum migration
  PENDING: 'pending',
}

export async function fetchVisiblePurchaseRequests() {
  const { data, error } = await supabase
    .from('purchase_requests')
    .select(
      `
      id,
      requester_id,
      requester_email,
      department,
      supplier_name,
      title,
      justification,
      status,
      manager_comment,
      created_at,
      updated_at,
      purchase_request_items (
        id,
        request_id,
        item_name,
        qty,
        unit,
        unit_price,
        line_total
      )
    `,
    )
    .order('created_at', { ascending: false })

  if (error) {
    return { data: null, error }
  }

  return {
    data: (data || []).map((request) => ({
      ...request,
      status: normalizePrStatus(request.status),
    })),
    error: null,
  }
}

export async function fetchMyPurchaseRequests(requesterId) {
  const { data, error } = await supabase
    .from('purchase_requests')
    .select(
      `
      id,
      requester_id,
      requester_email,
      department,
      supplier_name,
      title,
      justification,
      status,
      manager_comment,
      created_at,
      updated_at,
      purchase_request_items (
        id,
        request_id,
        item_name,
        qty,
        unit,
        unit_price,
        line_total
      )
    `,
    )
    .eq('requester_id', requesterId)
    .order('created_at', { ascending: false })

  if (error) {
    return { data: null, error }
  }

  return {
    data: (data || []).map((request) => ({
      ...request,
      status: normalizePrStatus(request.status),
    })),
    error: null,
  }
}

export async function fetchPendingPurchaseRequests() {
  const { data, error } = await supabase
    .from('purchase_requests')
    .select(
      `
      id,
      requester_id,
      requester_email,
      department,
      supplier_name,
      title,
      justification,
      status,
      manager_comment,
      created_at,
      updated_at,
      purchase_request_items (
        id,
        request_id,
        item_name,
        qty,
        unit,
        unit_price,
        line_total
      )
    `,
    )
    .eq('status', REQUEST_STATUS.PENDING)
    .order('created_at', { ascending: true })

  if (error) {
    return { data: null, error }
  }

  return {
    data: (data || []).map((request) => ({
      ...request,
      status: normalizePrStatus(request.status),
    })),
    error: null,
  }
}

export async function createPurchaseRequest({ request, items }) {
  const requestTitle = String(request?.title || '').trim()
  const requestDepartment = String(request?.department || '').trim()
  const requestJustification = String(request?.justification || '').trim()
  const supplierName = String(request?.supplier_name || '').trim()

  if (!requestTitle || !requestDepartment || !requestJustification) {
    return {
      data: null,
      error: new Error('Title, department, and justification are required.'),
    }
  }

  if (!items || items.length === 0) {
    return { data: null, error: new Error('At least one item is required.') }
  }

  const invalidItem = items.find((item) => {
    const itemName = String(item?.item_name || '').trim()
    const qty = Number(item?.qty)
    const unit = String(item?.unit || '').trim()
    const unitPrice = Number(item?.unit_price)

    return !itemName || !unit || Number.isNaN(qty) || qty <= 0 || Number.isNaN(unitPrice) || unitPrice < 0
  })

  if (invalidItem) {
    return {
      data: null,
      error: new Error('Each line item needs item name, qty > 0, unit, and unit price >= 0.'),
    }
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { data: null, error: userError || new Error('User not found.') }
  }

  const requestPayload = {
    requester_id: user.id,
    requester_email: user.email || request.requester_email,
    department: requestDepartment,
    supplier_name: supplierName || null,
    title: requestTitle,
    justification: requestJustification,
    status: REQUEST_STATUS.PENDING,
    manager_comment: null,
  }

  const { data: insertedRequest, error: requestError } = await supabase
    .from('purchase_requests')
    .insert(requestPayload)
    .select()
    .single()

  if (requestError) {
    return { data: null, error: requestError }
  }

  const itemsPayload = items.map((item) => ({
    request_id: insertedRequest.id,
    item_name: String(item.item_name).trim(),
    qty: Number(item.qty),
    unit: String(item.unit).trim(),
    unit_price: Number(item.unit_price),
  }))

  const { data: insertedItems, error: itemError } = await supabase
    .from('purchase_request_items')
    .insert(itemsPayload)
    .select()

  if (itemError) {
    // Best-effort cleanup to avoid leaving a request with no items.
    await supabase.from('purchase_requests').delete().eq('id', insertedRequest.id)
    return { data: null, error: itemError }
  }

  return {
    data: {
      ...insertedRequest,
      purchase_request_items: insertedItems || [],
    },
    error: null,
  }
}

export async function setRequestDecision({
  requestId,
  status,
  managerComment = null,
}) {
  const normalizedStatus = normalizePrStatus(status)

  if (![REQUEST_STATUS.APPROVED, REQUEST_STATUS.REJECTED].includes(normalizedStatus)) {
    return { data: null, error: new Error('Status must be approved or rejected.') }
  }

  if (!managerComment || String(managerComment).trim() === '') {
    return {
      data: null,
      error: new Error('Manager comment is required when approving or rejecting.'),
    }
  }

  return supabase
    .from('purchase_requests')
    .update({
      status: normalizedStatus,
      manager_comment: managerComment.trim(),
    })
    .eq('id', requestId)
    .select()
    .single()
}

export function getRequestTotal(request) {
  if (!request?.purchase_request_items || request.purchase_request_items.length === 0) {
    return 0
  }

  return request.purchase_request_items.reduce(
    (total, item) => total + Number(item.line_total || 0),
    0,
  )
}
