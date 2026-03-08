import { PR_STATUSES } from '../workflow/constants'

export const PR_TABLES = {
  HEADERS: 'pr_headers',
  LINES: 'pr_lines',
}

export const PR_DEFAULT_STATUS = PR_STATUSES.DRAFT

export const PR_HEADER_SELECT = `
  id,
  pr_number,
  requester_user_id,
  requester_name,
  department,
  purpose,
  needed_by_date,
  status,
  notes,
  created_at,
  updated_at
`

export const PR_LINE_SELECT = `
  id,
  pr_id,
  item_id,
  sku,
  item_name,
  description,
  unit,
  requested_qty,
  estimated_unit_price,
  estimated_total,
  preferred_supplier_id,
  remarks,
  created_at
`

export const PR_DETAIL_SELECT = `
  ${PR_HEADER_SELECT},
  pr_lines (
    ${PR_LINE_SELECT}
  )
`
