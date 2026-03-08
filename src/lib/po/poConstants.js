import { PO_STATUSES } from '../workflow/constants'

export const PO_TABLES = {
  HEADERS: 'po_headers',
  LINES: 'po_lines',
}

export const PO_DEFAULT_STATUS = PO_STATUSES.DRAFT
export const PO_DEFAULT_CURRENCY = 'THB'

export const PO_HEADER_SELECT = `
  id,
  po_number,
  source_pr_id,
  supplier_id,
  supplier_name_snapshot,
  department,
  requester_name,
  purpose,
  needed_by_date,
  status,
  notes,
  variance_reasons,
  variance_summary,
  variance_checked_at,
  created_by_user_id,
  created_at,
  updated_at
`

export const PO_LINE_SELECT = `
  id,
  po_id,
  pr_line_id,
  item_id,
  sku,
  item_name,
  description,
  unit,
  requested_qty,
  ordered_qty,
  unit_price,
  currency,
  line_total,
  supplier_id,
  supplier_sku,
  lead_time_days,
  remarks,
  created_at
`

export const PO_LINE_SELECT_LEGACY = `
  id,
  po_id,
  pr_line_id,
  item_id,
  sku,
  item_name,
  description,
  unit,
  requested_qty,
  ordered_qty,
  unit_price,
  line_total,
  supplier_id,
  supplier_sku,
  lead_time_days,
  remarks,
  created_at
`

export const PO_DETAIL_SELECT = `
  ${PO_HEADER_SELECT},
  po_lines (
    ${PO_LINE_SELECT}
  )
`

export const PO_DETAIL_SELECT_LEGACY = `
  ${PO_HEADER_SELECT},
  po_lines (
    ${PO_LINE_SELECT_LEGACY}
  )
`
