import { APP_ROLE_LIST, APP_ROLES, ROLE_LABELS } from './workflow/constants'
import {
  ACTION_ROLE_ACCESS,
  PAGE_KEYS,
  PAGE_ROLE_ACCESS,
  canAccessPage,
  canPerformAction,
  getRoleLabel,
  hasAnyRole,
  hasRole,
  hasRoleAccess,
  normalizeRole,
} from './workflow/roleHelpers'

export const ROLES = {
  REQUESTER: APP_ROLES.REQUESTER,
  MANAGER: APP_ROLES.MANAGER,
  PROCUREMENT: APP_ROLES.PROCUREMENT,
  MD_ASSISTANT: APP_ROLES.MD_ASSISTANT,
  ACCOUNTING: APP_ROLES.ACCOUNTING,
  ADMIN: APP_ROLES.ADMIN,
  // Backward-compatible alias for existing DB values/routes
  STAFF: 'staff',
}

export const ALL_ROLES = [...APP_ROLE_LIST, ROLES.STAFF]

export {
  ACTION_ROLE_ACCESS,
  PAGE_KEYS,
  PAGE_ROLE_ACCESS,
  ROLE_LABELS,
  canAccessPage,
  canPerformAction,
  getRoleLabel,
  hasAnyRole,
  hasRole,
  hasRoleAccess,
  normalizeRole,
}
