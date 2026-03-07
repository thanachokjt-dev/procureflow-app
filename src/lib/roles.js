export const ROLES = {
  STAFF: 'staff',
  MANAGER: 'manager',
  ADMIN: 'admin',
}

export const ALL_ROLES = [ROLES.STAFF, ROLES.MANAGER, ROLES.ADMIN]

export const ROLE_LABELS = {
  [ROLES.STAFF]: 'Staff',
  [ROLES.MANAGER]: 'Manager',
  [ROLES.ADMIN]: 'Admin',
}

export function hasRoleAccess(role, allowedRoles = []) {
  if (!allowedRoles || allowedRoles.length === 0) {
    return true
  }

  return allowedRoles.includes(role)
}
