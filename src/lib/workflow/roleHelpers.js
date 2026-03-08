import { APP_ROLES, APPROVAL_ACTIONS, LEGACY_ROLE_ALIASES, ROLE_LABELS } from './constants'

export const PAGE_KEYS = {
  DASHBOARD: 'dashboard',
  NEW_REQUEST: 'new_request',
  REQUESTS: 'requests',
  MANAGER_APPROVAL: 'manager_approval',
  SUPPLIER_MASTER: 'supplier_master',
  ITEM_MASTER: 'item_master',
  WORKFLOW_DEBUG: 'workflow_debug',
}

export const PAGE_ROLE_ACCESS = {
  [PAGE_KEYS.DASHBOARD]: [
    APP_ROLES.REQUESTER,
    APP_ROLES.MANAGER,
    APP_ROLES.PROCUREMENT,
    APP_ROLES.MD_ASSISTANT,
    APP_ROLES.ACCOUNTING,
    APP_ROLES.ADMIN,
  ],
  [PAGE_KEYS.NEW_REQUEST]: [APP_ROLES.REQUESTER, APP_ROLES.ADMIN],
  [PAGE_KEYS.REQUESTS]: [
    APP_ROLES.REQUESTER,
    APP_ROLES.MANAGER,
    APP_ROLES.PROCUREMENT,
    APP_ROLES.MD_ASSISTANT,
    APP_ROLES.ACCOUNTING,
    APP_ROLES.ADMIN,
  ],
  [PAGE_KEYS.MANAGER_APPROVAL]: [APP_ROLES.MANAGER, APP_ROLES.ADMIN],
  [PAGE_KEYS.SUPPLIER_MASTER]: [APP_ROLES.MANAGER, APP_ROLES.ADMIN],
  [PAGE_KEYS.ITEM_MASTER]: [APP_ROLES.MANAGER, APP_ROLES.ADMIN],
  [PAGE_KEYS.WORKFLOW_DEBUG]: [APP_ROLES.PROCUREMENT, APP_ROLES.ADMIN],
}

export const ACTION_ROLE_ACCESS = {
  [APPROVAL_ACTIONS.SUBMIT]: [APP_ROLES.REQUESTER, APP_ROLES.ADMIN],
  [APPROVAL_ACTIONS.APPROVE]: [APP_ROLES.MANAGER, APP_ROLES.ADMIN],
  [APPROVAL_ACTIONS.REJECT]: [APP_ROLES.MANAGER, APP_ROLES.ADMIN],
  [APPROVAL_ACTIONS.SEND_BACK]: [APP_ROLES.MANAGER, APP_ROLES.ADMIN],
  [APPROVAL_ACTIONS.CONVERT_TO_PO]: [APP_ROLES.PROCUREMENT, APP_ROLES.ADMIN],
  [APPROVAL_ACTIONS.ACCOUNTING_CHECK]: [APP_ROLES.ACCOUNTING, APP_ROLES.ADMIN],
  [APPROVAL_ACTIONS.RECEIVE]: [APP_ROLES.PROCUREMENT, APP_ROLES.ADMIN],
  [APPROVAL_ACTIONS.CLOSE]: [APP_ROLES.PROCUREMENT, APP_ROLES.ADMIN],
  [APPROVAL_ACTIONS.CANCEL]: [APP_ROLES.MANAGER, APP_ROLES.PROCUREMENT, APP_ROLES.ADMIN],
}

export function normalizeRole(role) {
  const normalizedRole = String(role || '')
    .trim()
    .toLowerCase()

  if (!normalizedRole) {
    return ''
  }

  return LEGACY_ROLE_ALIASES[normalizedRole] || normalizedRole
}

export function hasRole(role, expectedRole) {
  return normalizeRole(role) === normalizeRole(expectedRole)
}

export function hasAnyRole(role, allowedRoles = []) {
  if (!allowedRoles || allowedRoles.length === 0) {
    return true
  }

  const normalizedRole = normalizeRole(role)
  const allowedSet = new Set(allowedRoles.map((allowedRole) => normalizeRole(allowedRole)))
  return allowedSet.has(normalizedRole)
}

export function hasRoleAccess(role, allowedRoles = []) {
  return hasAnyRole(role, allowedRoles)
}

export function canAccessPage(role, pageKey) {
  const allowedRoles = PAGE_ROLE_ACCESS[pageKey] || []
  return hasAnyRole(role, allowedRoles)
}

export function canPerformAction(role, actionName) {
  const allowedRoles = ACTION_ROLE_ACCESS[actionName] || []
  return hasAnyRole(role, allowedRoles)
}

export function getRoleLabel(role) {
  const normalizedRole = normalizeRole(role)
  return ROLE_LABELS[normalizedRole] || ROLE_LABELS[role] || 'Unknown Role'
}
