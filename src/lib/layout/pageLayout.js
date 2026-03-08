export const PAGE_LAYOUT_MODES = {
  DEFAULT: 'default',
  FORM_FOCUSED: 'form_focused',
  TABLE_FIRST: 'table_first',
  OPERATIONS_DENSE: 'operations_dense',
  CHECKLIST: 'checklist',
}

const PAGE_LAYOUT_BY_PATH = {
  '/new-request': PAGE_LAYOUT_MODES.FORM_FOCUSED,
  '/create-pr': PAGE_LAYOUT_MODES.FORM_FOCUSED,
  '/manager-approval': PAGE_LAYOUT_MODES.TABLE_FIRST,
  '/requests': PAGE_LAYOUT_MODES.TABLE_FIRST,
  '/supplier-master': PAGE_LAYOUT_MODES.OPERATIONS_DENSE,
  '/item-master': PAGE_LAYOUT_MODES.OPERATIONS_DENSE,
  '/workflow-debug': PAGE_LAYOUT_MODES.OPERATIONS_DENSE,
}

const ROLE_LAYOUT_HINTS = {
  requester: PAGE_LAYOUT_MODES.FORM_FOCUSED,
  manager: PAGE_LAYOUT_MODES.TABLE_FIRST,
  procurement: PAGE_LAYOUT_MODES.OPERATIONS_DENSE,
  md_assistant: PAGE_LAYOUT_MODES.OPERATIONS_DENSE,
  accounting: PAGE_LAYOUT_MODES.CHECKLIST,
}

const MODE_CONTAINER_CLASSES = {
  [PAGE_LAYOUT_MODES.FORM_FOCUSED]: 'rounded-xl border border-slate-200 bg-white p-4 md:p-6',
  [PAGE_LAYOUT_MODES.TABLE_FIRST]:
    'rounded-xl border border-slate-200 bg-white p-3 md:p-4 xl:p-5',
  [PAGE_LAYOUT_MODES.OPERATIONS_DENSE]:
    'rounded-xl border border-slate-200 bg-white p-3 md:p-4 xl:p-5',
  [PAGE_LAYOUT_MODES.CHECKLIST]: 'rounded-xl border border-slate-200 bg-white p-4 md:p-5',
  [PAGE_LAYOUT_MODES.DEFAULT]: 'rounded-xl border border-slate-200 bg-white p-4 md:p-5 xl:p-6',
}

const MODE_MAIN_SPACING_CLASSES = {
  [PAGE_LAYOUT_MODES.FORM_FOCUSED]: 'p-3 md:p-5 xl:p-6',
  [PAGE_LAYOUT_MODES.TABLE_FIRST]: 'p-2 md:p-4 xl:p-5',
  [PAGE_LAYOUT_MODES.OPERATIONS_DENSE]: 'p-2 md:p-4 xl:p-5',
  [PAGE_LAYOUT_MODES.CHECKLIST]: 'p-3 md:p-5 xl:p-6',
  [PAGE_LAYOUT_MODES.DEFAULT]: 'p-3 md:p-5 xl:p-6',
}

function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
}

export function getPageLayoutMode({ pathname = '/', role = '' } = {}) {
  if (PAGE_LAYOUT_BY_PATH[pathname]) {
    return PAGE_LAYOUT_BY_PATH[pathname]
  }

  const normalizedRole = normalizeRole(role)
  return ROLE_LAYOUT_HINTS[normalizedRole] || PAGE_LAYOUT_MODES.DEFAULT
}

export function getPageLayoutConfig({ pathname = '/', role = '' } = {}) {
  const mode = getPageLayoutMode({ pathname, role })

  return {
    mode,
    mainSpacingClass:
      MODE_MAIN_SPACING_CLASSES[mode] || MODE_MAIN_SPACING_CLASSES[PAGE_LAYOUT_MODES.DEFAULT],
    contentContainerClass:
      MODE_CONTAINER_CLASSES[mode] || MODE_CONTAINER_CLASSES[PAGE_LAYOUT_MODES.DEFAULT],
  }
}
