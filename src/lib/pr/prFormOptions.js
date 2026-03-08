export const PR_DEPARTMENT_OPTIONS = [
  'Human Resources',
  'Warehouse',
  'Retail',
  'Housekeeping',
  'Engineering',
  'Kru Muay',
  'Front Office',
  'Reservations',
  'Marketing',
  'Other',
]

export const PR_UNIT_BASE_OPTIONS = ['pcs', 'box', 'pack']
export const PR_UNIT_CUSTOM_OPTION = 'custom'
export const PR_UNIT_CUSTOM_LABEL = 'etc (please specify)'

function normalizeText(value) {
  return String(value || '').trim()
}

export function findMatchingDepartment(value) {
  const normalizedValue = normalizeText(value).toLowerCase()
  if (!normalizedValue) {
    return ''
  }

  const exactMatch = PR_DEPARTMENT_OPTIONS.find(
    (department) => department.toLowerCase() === normalizedValue,
  )

  return exactMatch || ''
}

export function normalizeDepartmentForPr(value) {
  return findMatchingDepartment(value)
}

export function mapUnitValueToFormState(unitValue) {
  const normalizedUnit = normalizeText(unitValue)
  const normalizedUnitLower = normalizedUnit.toLowerCase()

  if (PR_UNIT_BASE_OPTIONS.includes(normalizedUnitLower)) {
    return {
      unit_option: normalizedUnitLower,
      custom_unit: '',
      unit: normalizedUnitLower,
    }
  }

  if (normalizedUnit) {
    return {
      unit_option: PR_UNIT_CUSTOM_OPTION,
      custom_unit: normalizedUnit,
      unit: normalizedUnit,
    }
  }

  return {
    unit_option: '',
    custom_unit: '',
    unit: '',
  }
}

export function getEffectiveUnitValue(line = {}) {
  const unitOption = normalizeText(line.unit_option)
  const customUnit = normalizeText(line.custom_unit)
  const unit = normalizeText(line.unit)

  if (unitOption === PR_UNIT_CUSTOM_OPTION) {
    return customUnit
  }

  if (PR_UNIT_BASE_OPTIONS.includes(unitOption)) {
    return unitOption
  }

  return unit
}
