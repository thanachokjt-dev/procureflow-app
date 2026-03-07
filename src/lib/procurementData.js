import { supabase } from './supabaseClient'

export const REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

export async function fetchVisiblePurchaseRequests() {
  return supabase
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
}

export async function fetchMyPurchaseRequests(requesterId) {
  return supabase
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
}

export async function fetchPendingPurchaseRequests() {
  return supabase
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
}

export async function createPurchaseRequest({ request, items }) {
  if (!items || items.length === 0) {
    return { data: null, error: new Error('At least one item is required.') }
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
    department: request.department,
    supplier_name: request.supplier_name || null,
    title: request.title,
    justification: request.justification,
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
    item_name: item.item_name,
    qty: item.qty,
    unit: item.unit,
    unit_price: item.unit_price,
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
  if (![REQUEST_STATUS.APPROVED, REQUEST_STATUS.REJECTED].includes(status)) {
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
      status,
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
