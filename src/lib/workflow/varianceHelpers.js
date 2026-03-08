import {
  VARIANCE_REASON_LIST,
  VARIANCE_REASONS,
  createVarianceConfig,
} from './varianceConstants'

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function readNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function buildSpecSignature(line = {}) {
  return [
    line.spec_text,
    line.description,
    line.brand,
    line.model,
    line.color,
    line.size,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join('|')
}

function normalizeLine(line = {}, index = 0) {
  const lineKey =
    String(
      line.id ||
        line.line_id ||
        line.pr_line_id ||
        line.po_line_id ||
        line.request_item_id ||
        '',
    ).trim() || `line_${index + 1}`

  const sourcePrLineId = String(line.source_pr_line_id || line.pr_line_id || '').trim()
  const itemId = String(line.item_id || line.itemId || '').trim()
  const itemName = String(line.item_name || line.itemName || '').trim()
  const supplierId = String(line.supplier_id || line.supplierId || '').trim()
  const supplierName = String(line.supplier_name || line.supplierName || '').trim()

  return {
    raw: line,
    lineKey,
    sourcePrLineId,
    itemId,
    itemName,
    itemNameNormalized: normalizeText(itemName),
    supplierId,
    supplierName,
    supplierNameNormalized: normalizeText(supplierName),
    quantity: readNumber(line.qty ?? line.quantity),
    unitPrice: readNumber(line.unit_price ?? line.unitPrice),
    leadTimeDays: readNumber(line.lead_time_days ?? line.leadTimeDays),
    specSignature: buildSpecSignature(line),
  }
}

function findBestMatchingPoLine(prLine, poLines, usedPoLineKeys) {
  const directMatch = poLines.find((poLine) => {
    if (usedPoLineKeys.has(poLine.lineKey)) {
      return false
    }

    if (!poLine.sourcePrLineId) {
      return false
    }

    return poLine.sourcePrLineId === prLine.lineKey
  })

  if (directMatch) {
    return directMatch
  }

  const sameItemId = poLines.find((poLine) => {
    if (usedPoLineKeys.has(poLine.lineKey)) {
      return false
    }

    return Boolean(prLine.itemId && poLine.itemId && poLine.itemId === prLine.itemId)
  })

  if (sameItemId) {
    return sameItemId
  }

  const sameItemName = poLines.find((poLine) => {
    if (usedPoLineKeys.has(poLine.lineKey)) {
      return false
    }

    return Boolean(
      prLine.itemNameNormalized &&
        poLine.itemNameNormalized &&
        poLine.itemNameNormalized === prLine.itemNameNormalized,
    )
  })

  return sameItemName || null
}

function pushReason(reasons, reason) {
  if (!VARIANCE_REASON_LIST.includes(reason)) {
    return
  }

  if (!reasons.includes(reason)) {
    reasons.push(reason)
  }
}

export function comparePrAndPoLines({
  prLines = [],
  poDraftLines = [],
  config = {},
} = {}) {
  const varianceConfig = createVarianceConfig(config)
  const normalizedPrLines = prLines.map((line, index) => normalizeLine(line, index))
  const normalizedPoLines = poDraftLines.map((line, index) => normalizeLine(line, index))
  const usedPoLineKeys = new Set()
  const lineResults = []
  const reasonsSet = new Set()

  const summary = {
    totalPrLines: normalizedPrLines.length,
    totalPoLines: normalizedPoLines.length,
    matchedLines: 0,
    removedLines: 0,
    changedQuantityCount: 0,
    changedItemCount: 0,
    changedSpecCount: 0,
    changedSupplierCount: 0,
    leadTimeExceededCount: 0,
    unitPriceExceededCount: 0,
    varianceLineCount: 0,
  }

  normalizedPrLines.forEach((prLine) => {
    const poLine = findBestMatchingPoLine(prLine, normalizedPoLines, usedPoLineKeys)
    const lineReasons = []

    if (!poLine) {
      pushReason(lineReasons, VARIANCE_REASONS.LINE_REMOVED)
      summary.removedLines += 1
    } else {
      usedPoLineKeys.add(poLine.lineKey)
      summary.matchedLines += 1

      if (
        prLine.quantity !== null &&
        poLine.quantity !== null &&
        poLine.quantity !== prLine.quantity
      ) {
        pushReason(lineReasons, VARIANCE_REASONS.QUANTITY_CHANGED)
        summary.changedQuantityCount += 1
      }

      const itemChangedById =
        prLine.itemId && poLine.itemId && prLine.itemId !== poLine.itemId
      const itemChangedByName =
        !itemChangedById &&
        prLine.itemNameNormalized &&
        poLine.itemNameNormalized &&
        prLine.itemNameNormalized !== poLine.itemNameNormalized

      if (itemChangedById || itemChangedByName) {
        pushReason(lineReasons, VARIANCE_REASONS.ITEM_CHANGED)
        summary.changedItemCount += 1
      }

      if (
        prLine.specSignature &&
        poLine.specSignature &&
        prLine.specSignature !== poLine.specSignature
      ) {
        pushReason(lineReasons, VARIANCE_REASONS.SPEC_CHANGED)
        summary.changedSpecCount += 1
      }

      const supplierChangedById =
        prLine.supplierId && poLine.supplierId && prLine.supplierId !== poLine.supplierId
      const supplierChangedByName =
        !supplierChangedById &&
        prLine.supplierNameNormalized &&
        poLine.supplierNameNormalized &&
        prLine.supplierNameNormalized !== poLine.supplierNameNormalized

      if (supplierChangedById || supplierChangedByName) {
        pushReason(lineReasons, VARIANCE_REASONS.SUPPLIER_CHANGED)
        summary.changedSupplierCount += 1
      }

      if (
        prLine.leadTimeDays !== null &&
        poLine.leadTimeDays !== null &&
        poLine.leadTimeDays > prLine.leadTimeDays + Number(varianceConfig.leadTimeThresholdDays)
      ) {
        pushReason(lineReasons, VARIANCE_REASONS.LEAD_TIME_EXCEEDED)
        summary.leadTimeExceededCount += 1
      }

      if (
        prLine.unitPrice !== null &&
        poLine.unitPrice !== null &&
        prLine.unitPrice > 0
      ) {
        const increasePercent = ((poLine.unitPrice - prLine.unitPrice) / prLine.unitPrice) * 100
        if (increasePercent > Number(varianceConfig.priceIncreaseThresholdPercent)) {
          pushReason(lineReasons, VARIANCE_REASONS.UNIT_PRICE_EXCEEDED)
          summary.unitPriceExceededCount += 1
        }
      }
    }

    lineReasons.forEach((reason) => reasonsSet.add(reason))

    if (lineReasons.length > 0) {
      summary.varianceLineCount += 1
    }

    lineResults.push({
      prLineKey: prLine.lineKey,
      poLineKey: poLine?.lineKey || null,
      reasons: lineReasons,
      hasVariance: lineReasons.length > 0,
      isRemoved: !poLine,
      prLine: prLine.raw,
      poLine: poLine?.raw || null,
    })
  })

  normalizedPoLines
    .filter((poLine) => !usedPoLineKeys.has(poLine.lineKey))
    .forEach((poLine) => {
      lineResults.push({
        prLineKey: null,
        poLineKey: poLine.lineKey,
        reasons: [],
        hasVariance: false,
        isRemoved: false,
        isAdditionalPoLine: true,
        prLine: null,
        poLine: poLine.raw,
      })
    })

  const reasons = VARIANCE_REASON_LIST.filter((reason) => reasonsSet.has(reason))

  return {
    hasVariance: reasons.length > 0,
    reasons,
    lineResults,
    summary,
    config: varianceConfig,
  }
}
