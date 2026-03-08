import { PO_STATUSES } from '../workflow/constants'

export const PO_TABLES = {
  HEADERS: 'po_headers',
  LINES: 'po_lines',
}

export const PO_DEFAULT_STATUS = PO_STATUSES.DRAFT
export const PO_DEFAULT_CURRENCY = 'THB'

const PO_HEADER_BASE_FIELDS = [
  'id',
  'po_number',
  'source_pr_id',
  'supplier_id',
  'supplier_name_snapshot',
  'department',
  'requester_name',
  'purpose',
  'needed_by_date',
  'status',
  'notes',
  'created_by_user_id',
  'created_at',
  'updated_at',
]

const PO_HEADER_VARIANCE_FIELDS = [
  'variance_reasons',
  'variance_summary',
  'variance_status',
  'variance_submitted_at',
  'variance_submitted_by',
  'variance_checked_at',
]

export const PO_HEADER_SELECT = [...PO_HEADER_BASE_FIELDS, ...PO_HEADER_VARIANCE_FIELDS].join(
  ',\n  ',
)
export const PO_HEADER_SELECT_LEGACY = PO_HEADER_BASE_FIELDS.join(',\n  ')

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

export const PO_DETAIL_SELECT_NO_VARIANCE = `
  ${PO_HEADER_SELECT_LEGACY},
  po_lines (
    ${PO_LINE_SELECT}
  )
`

export const PO_DETAIL_SELECT_NO_VARIANCE_LEGACY = `
  ${PO_HEADER_SELECT_LEGACY},
  po_lines (
    ${PO_LINE_SELECT_LEGACY}
  )
`
