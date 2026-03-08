import { supabase } from '../supabaseClient'
import { APPROVAL_ACTION_LIST, DOCUMENT_TYPE_LIST } from './constants'
import { normalizeRole } from './roleHelpers'

function toReadableLabel(value) {
  return String(value || '')
    .trim()
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')
}

export function getWorkflowActionLabel(action) {
  return toReadableLabel(action)
}

export function isValidDocumentType(documentType) {
  return DOCUMENT_TYPE_LIST.includes(String(documentType || '').toLowerCase())
}

export function isValidWorkflowAction(action) {
  return APPROVAL_ACTION_LIST.includes(String(action || '').toLowerCase())
}

export function sortWorkflowHistoryEntries(entries = [], order = 'desc') {
  const factor = order === 'asc' ? 1 : -1

  return [...entries].sort((left, right) => {
    const leftTime = new Date(left.created_at || 0).getTime()
    const rightTime = new Date(right.created_at || 0).getTime()
    return (leftTime - rightTime) * factor
  })
}

export async function createWorkflowHistoryEntry({
  documentType,
  documentId,
  action,
  actorUserId,
  actorRole,
  comment = '',
  metadata = null,
}) {
  const normalizedType = String(documentType || '').trim().toLowerCase()
  const normalizedAction = String(action || '').trim().toLowerCase()
  const normalizedRole = normalizeRole(actorRole)
  const normalizedDocumentId = String(documentId || '').trim()

  if (!isValidDocumentType(normalizedType)) {
    return {
      data: null,
      error: new Error(`Invalid document type. Use one of: ${DOCUMENT_TYPE_LIST.join(', ')}`),
    }
  }

  if (!normalizedDocumentId) {
    return { data: null, error: new Error('Document ID is required.') }
  }

  if (!isValidWorkflowAction(normalizedAction)) {
    return {
      data: null,
      error: new Error(`Invalid action. Use one of: ${APPROVAL_ACTION_LIST.join(', ')}`),
    }
  }

  if (!actorUserId) {
    return { data: null, error: new Error('Actor user ID is required.') }
  }

  const payload = {
    document_type: normalizedType,
    document_id: normalizedDocumentId,
    action: normalizedAction,
    actor_user_id: actorUserId,
    actor_role: normalizedRole || String(actorRole || '').trim().toLowerCase() || 'unknown',
    comment: String(comment || '').trim() || null,
    metadata: metadata && typeof metadata === 'object' ? metadata : null,
  }

  return supabase.from('workflow_history').insert(payload).select().single()
}

export async function fetchWorkflowHistoryEntries({
  documentType,
  documentId,
  order = 'desc',
  limit = 200,
}) {
  const normalizedType = String(documentType || '').trim().toLowerCase()
  const normalizedDocumentId = String(documentId || '').trim()
  const ascending = order === 'asc'

  if (!isValidDocumentType(normalizedType)) {
    return {
      data: null,
      error: new Error(`Invalid document type. Use one of: ${DOCUMENT_TYPE_LIST.join(', ')}`),
    }
  }

  if (!normalizedDocumentId) {
    return { data: null, error: new Error('Document ID is required.') }
  }

  const { data, error } = await supabase
    .from('workflow_history')
    .select('id, document_type, document_id, action, actor_user_id, actor_role, comment, metadata, created_at')
    .eq('document_type', normalizedType)
    .eq('document_id', normalizedDocumentId)
    .order('created_at', { ascending })
    .limit(limit)

  if (error) {
    return { data: null, error }
  }

  return { data: sortWorkflowHistoryEntries(data || [], order), error: null }
}
