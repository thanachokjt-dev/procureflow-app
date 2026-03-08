import {
  APP_ROLES,
  DOCUMENT_TYPES,
  WORKFLOW_ACTION_LABELS,
  WORKFLOW_ACTION_LIST,
  WORKFLOW_ACTIONS,
} from './constants'
import { getRoleLabel, hasAnyRole, normalizeRole } from './roleHelpers'
import {
  PO_STATUS_TRANSITIONS,
  PR_STATUS_TRANSITIONS,
  canTransitionStatus,
  getPoStatusLabel,
  getPrStatusLabel,
  normalizePoStatus,
  normalizePrStatus,
} from './statusHelpers'

export const WORKFLOW_ACTION_ROLE_PERMISSIONS = {
  [WORKFLOW_ACTIONS.CREATE_PR]: [APP_ROLES.REQUESTER, APP_ROLES.ADMIN],
  [WORKFLOW_ACTIONS.SUBMIT_PR]: [APP_ROLES.REQUESTER, APP_ROLES.ADMIN],
  [WORKFLOW_ACTIONS.APPROVE_PR]: [APP_ROLES.MANAGER, APP_ROLES.ADMIN],
  [WORKFLOW_ACTIONS.REJECT_PR]: [APP_ROLES.MANAGER, APP_ROLES.ADMIN],
  [WORKFLOW_ACTIONS.CREATE_PO_DRAFT]: [
    APP_ROLES.PROCUREMENT,
    APP_ROLES.MD_ASSISTANT,
    APP_ROLES.ADMIN,
  ],
  [WORKFLOW_ACTIONS.CONFIRM_VARIANCE]: [APP_ROLES.PROCUREMENT, APP_ROLES.ADMIN],
  [WORKFLOW_ACTIONS.FINAL_APPROVE_PO]: [APP_ROLES.MANAGER, APP_ROLES.ADMIN],
  [WORKFLOW_ACTIONS.ACCOUNTING_REVIEW]: [APP_ROLES.ACCOUNTING, APP_ROLES.ADMIN],
  [WORKFLOW_ACTIONS.RECEIVE_GOODS]: [
    APP_ROLES.PROCUREMENT,
    APP_ROLES.MD_ASSISTANT,
    APP_ROLES.ADMIN,
  ],
  [WORKFLOW_ACTIONS.CLOSE_PO]: [APP_ROLES.PROCUREMENT, APP_ROLES.ADMIN],
}

export function getWorkflowActionLabel(action) {
  return WORKFLOW_ACTION_LABELS[action] || String(action || '')
}

export function getAllowedRolesForWorkflowAction(action) {
  return WORKFLOW_ACTION_ROLE_PERMISSIONS[action] || []
}

export function canRolePerformWorkflowAction(role, action) {
  const allowedRoles = getAllowedRolesForWorkflowAction(action)
  return hasAnyRole(role, allowedRoles)
}

export function checkWorkflowActionPermission({ role, action }) {
  const normalizedRole = normalizeRole(role)
  const normalizedAction = String(action || '')
    .trim()
    .toLowerCase()

  if (!WORKFLOW_ACTION_LIST.includes(normalizedAction)) {
    return {
      allowed: false,
      reason: `Unknown action: ${normalizedAction || '(empty)'}.`,
      code: 'unknown_action',
      role: normalizedRole,
      action: normalizedAction,
    }
  }

  const allowedRoles = getAllowedRolesForWorkflowAction(normalizedAction)
  const allowed = hasAnyRole(normalizedRole, allowedRoles)

  if (allowed) {
    return {
      allowed: true,
      reason: '',
      code: 'allowed',
      role: normalizedRole,
      action: normalizedAction,
      allowedRoles,
    }
  }

  const allowedLabels = allowedRoles.map((allowedRole) => getRoleLabel(allowedRole)).join(', ')

  return {
    allowed: false,
    reason: `${getRoleLabel(normalizedRole)} cannot ${getWorkflowActionLabel(
      normalizedAction,
    )}. Allowed roles: ${allowedLabels || 'None'}.`,
    code: 'role_not_allowed',
    role: normalizedRole,
    action: normalizedAction,
    allowedRoles,
  }
}

export function getTransitionMap(documentType = DOCUMENT_TYPES.PR) {
  return documentType === DOCUMENT_TYPES.PO ? PO_STATUS_TRANSITIONS : PR_STATUS_TRANSITIONS
}

export function checkStatusTransition({
  documentType = DOCUMENT_TYPES.PR,
  fromStatus,
  toStatus,
}) {
  const normalizedDocumentType = String(documentType || '')
    .trim()
    .toLowerCase()

  if (![DOCUMENT_TYPES.PR, DOCUMENT_TYPES.PO].includes(normalizedDocumentType)) {
    return {
      allowed: false,
      reason: `Invalid document type: ${normalizedDocumentType || '(empty)'}.`,
      code: 'invalid_document_type',
      documentType: normalizedDocumentType,
      fromStatus,
      toStatus,
    }
  }

  const normalizedFrom =
    normalizedDocumentType === DOCUMENT_TYPES.PO
      ? normalizePoStatus(fromStatus)
      : normalizePrStatus(fromStatus)
  const normalizedTo =
    normalizedDocumentType === DOCUMENT_TYPES.PO
      ? normalizePoStatus(toStatus)
      : normalizePrStatus(toStatus)

  if (!normalizedFrom || !normalizedTo) {
    return {
      allowed: false,
      reason: 'Both fromStatus and toStatus are required.',
      code: 'missing_status',
      documentType: normalizedDocumentType,
      fromStatus: normalizedFrom,
      toStatus: normalizedTo,
    }
  }

  const allowed = canTransitionStatus({
    documentType: normalizedDocumentType,
    fromStatus: normalizedFrom,
    toStatus: normalizedTo,
  })

  if (allowed) {
    return {
      allowed: true,
      reason: '',
      code: 'allowed',
      documentType: normalizedDocumentType,
      fromStatus: normalizedFrom,
      toStatus: normalizedTo,
    }
  }

  const statusLabel =
    normalizedDocumentType === DOCUMENT_TYPES.PO ? getPoStatusLabel : getPrStatusLabel

  return {
    allowed: false,
    reason: `Transition not allowed: ${statusLabel(normalizedFrom)} -> ${statusLabel(
      normalizedTo,
    )}.`,
    code: 'transition_not_allowed',
    documentType: normalizedDocumentType,
    fromStatus: normalizedFrom,
    toStatus: normalizedTo,
  }
}

export function checkWorkflowGuard({
  role,
  action,
  documentType = null,
  fromStatus = null,
  toStatus = null,
  requireTransition = false,
}) {
  const actionResult = checkWorkflowActionPermission({ role, action })

  if (!requireTransition) {
    return {
      allowed: actionResult.allowed,
      reason: actionResult.reason,
      code: actionResult.code,
      actionResult,
      transitionResult: null,
    }
  }

  const transitionResult = checkStatusTransition({
    documentType,
    fromStatus,
    toStatus,
  })

  if (!actionResult.allowed || !transitionResult.allowed) {
    return {
      allowed: false,
      reason: actionResult.allowed ? transitionResult.reason : actionResult.reason,
      code: actionResult.allowed ? transitionResult.code : actionResult.code,
      actionResult,
      transitionResult,
    }
  }

  return {
    allowed: true,
    reason: '',
    code: 'allowed',
    actionResult,
    transitionResult,
  }
}
