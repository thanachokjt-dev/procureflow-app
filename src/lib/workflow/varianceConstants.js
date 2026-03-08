export const VARIANCE_REASONS = {
  QUANTITY_CHANGED: 'quantity_changed',
  ITEM_CHANGED: 'item_changed',
  SPEC_CHANGED: 'spec_changed',
  SUPPLIER_CHANGED: 'supplier_changed',
  LEAD_TIME_EXCEEDED: 'lead_time_exceeded',
  UNIT_PRICE_EXCEEDED: 'unit_price_exceeded',
  LINE_REMOVED: 'line_removed',
}

export const VARIANCE_REASON_LIST = [
  VARIANCE_REASONS.QUANTITY_CHANGED,
  VARIANCE_REASONS.ITEM_CHANGED,
  VARIANCE_REASONS.SPEC_CHANGED,
  VARIANCE_REASONS.SUPPLIER_CHANGED,
  VARIANCE_REASONS.LEAD_TIME_EXCEEDED,
  VARIANCE_REASONS.UNIT_PRICE_EXCEEDED,
  VARIANCE_REASONS.LINE_REMOVED,
]

export const VARIANCE_REASON_LABELS = {
  [VARIANCE_REASONS.QUANTITY_CHANGED]: 'Quantity Changed',
  [VARIANCE_REASONS.ITEM_CHANGED]: 'Item Changed',
  [VARIANCE_REASONS.SPEC_CHANGED]: 'Spec Changed',
  [VARIANCE_REASONS.SUPPLIER_CHANGED]: 'Supplier Changed',
  [VARIANCE_REASONS.LEAD_TIME_EXCEEDED]: 'Lead Time Exceeded',
  [VARIANCE_REASONS.UNIT_PRICE_EXCEEDED]: 'Unit Price Exceeded',
  [VARIANCE_REASONS.LINE_REMOVED]: 'Line Removed',
}

export const DEFAULT_VARIANCE_CONFIG = {
  priceIncreaseThresholdPercent: 5,
  leadTimeThresholdDays: 2,
}

export function createVarianceConfig(overrides = {}) {
  return {
    ...DEFAULT_VARIANCE_CONFIG,
    ...(overrides || {}),
  }
}

export function getVarianceReasonLabel(reason) {
  return VARIANCE_REASON_LABELS[reason] || String(reason || '')
}
