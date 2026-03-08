import { fetchPreferredSupplierMappings } from '../masterData'
import { fetchPrDetailWithLines } from '../pr/prService'
import { supabase } from '../supabaseClient'
import {
  APPROVAL_ACTIONS,
  DOCUMENT_TYPES,
  PO_STATUSES,
  PR_STATUSES,
  WORKFLOW_ACTIONS,
} from '../workflow/constants'
import { createWorkflowHistoryEntry } from '../workflow/historyService'
import { normalizePrStatus } from '../workflow/statusHelpers'
import {
  PO_DEFAULT_STATUS,
  PO_DEFAULT_CURRENCY,
  PO_DETAIL_SELECT,
  PO_DETAIL_SELECT_LEGACY,
  PO_DETAIL_SELECT_NO_VARIANCE,
  PO_DETAIL_SELECT_NO_VARIANCE_LEGACY,
  PO_HEADER_SELECT,
  PO_HEADER_SELECT_LEGACY,
  PO_TABLES,
} from './poConstants'

const PO_VARIANCE_OPTIONAL_FIELDS = [
  'variance_reasons',
  'variance_summary',
  'variance_status',
  'variance_submitted_at',
  'variance_submitted_by',
  'variance_checked_at',
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizeNullableNumeric(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numericValue = Number(value)
  if (Number.isNaN(numericValue)) {
    return null
  }

  return numericValue
}

function normalizeCurrency(value, fallback = PO_DEFAULT_CURRENCY) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()

  return normalized || fallback
}

function hasMissingColumnError(error, { tableName, columnName }) {
  const message = String(error?.message || '').toLowerCase()

  return (
    message.includes(`${tableName}.${columnName}`) ||
    message.includes(`${tableName}_1.${columnName}`) ||
    message.includes(`${tableName}_2.${columnName}`) ||
    message.includes(`column "${columnName}" does not exist`) ||
    message.includes(`column ${columnName} does not exist`)
  )
}

function hasMissingCurrencyColumnError(error) {
  return hasMissingColumnError(error, {
    tableName: PO_TABLES.LINES,
    columnName: 'currency',
  })
}

function hasMissingPoHeaderVarianceColumnsError(error) {
  return PO_VARIANCE_OPTIONAL_FIELDS.some((columnName) =>
    hasMissingColumnError(error, { tableName: PO_TABLES.HEADERS, columnName }),
  )
}

function isPoSchemaMismatchError(error) {
  return hasMissingCurrencyColumnError(error) || hasMissingPoHeaderVarianceColumnsError(error)
}

function hasVarianceTypeMismatchError(error) {
  const message = String(error?.message || '').toLowerCase()

  const mentionsVarianceField =
    message.includes('variance_reasons') || message.includes('variance_summary')

  return (
    mentionsVarianceField &&
    (message.includes('is of type text') ||
      message.includes('malformed array literal') ||
      message.includes('invalid input syntax'))
  )
}

function stripCurrencyFieldFromLines(lines = []) {
  return lines.map((line) => {
    const nextLine = { ...line }
    delete nextLine.currency
    return nextLine
  })
}

function tryParseJson(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  try {
    return JSON.parse(normalized)
  } catch {
    return null
  }
}

function tryParseJsonObject(value) {
  const parsed = tryParseJson(value)

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

  return parsed
}

function withPoLineCurrencyFallback(poDraft) {
  if (!poDraft) {
    return poDraft
  }

  const nextLines = Array.isArray(poDraft.po_lines)
    ? poDraft.po_lines.map((line) => ({
        ...line,
        currency: normalizeCurrency(line?.currency),
      }))
    : []

  return {
    ...poDraft,
    po_lines: nextLines,
  }
}

function normalizeVarianceReasons(reasons) {
  if (Array.isArray(reasons)) {
    return Array.from(
      new Set(
        reasons
          .map((entry) =>
            String(entry || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    )
  }

  if (typeof reasons !== 'string') {
    return []
  }

  const parsedJson = tryParseJson(reasons)
  if (Array.isArray(parsedJson)) {
    return normalizeVarianceReasons(parsedJson)
  }

  return Array.from(
    new Set(
      reasons
        .split(',')
        .map((entry) =>
          String(entry || '')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  )
}

function normalizeJsonObject(value) {
  if (typeof value === 'string') {
    return tryParseJsonObject(value)
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value
}

function withPoHeaderVarianceFallback(poDraft) {
  if (!poDraft) {
    return poDraft
  }

  return {
    ...poDraft,
    variance_reasons: normalizeVarianceReasons(poDraft.variance_reasons),
    variance_summary: normalizeJsonObject(poDraft.variance_summary) || {},
    variance_status: normalizeNullableText(poDraft.variance_status),
    variance_submitted_at: normalizeNullableText(poDraft.variance_submitted_at),
    variance_submitted_by: normalizeNullableText(poDraft.variance_submitted_by),
    variance_checked_at: normalizeNullableText(poDraft.variance_checked_at),
  }
}

function withPoDraftCompatibility(poDraft) {
  return withPoLineCurrencyFallback(withPoHeaderVarianceFallback(poDraft))
}

function stripVarianceFieldsFromHeaderPayload(payload = {}) {
  const nextPayload = { ...payload }
  PO_VARIANCE_OPTIONAL_FIELDS.forEach((columnName) => {
    delete nextPayload[columnName]
  })
  return nextPayload
}

function toJsonString(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function coerceVarianceFieldsToText(payload = {}) {
  const nextPayload = { ...payload }
  let changed = false

  if ('variance_reasons' in nextPayload && Array.isArray(nextPayload.variance_reasons)) {
    nextPayload.variance_reasons = nextPayload.variance_reasons.join(', ')
    changed = true
  }

  if ('variance_summary' in nextPayload && normalizeJsonObject(nextPayload.variance_summary)) {
    nextPayload.variance_summary = toJsonString(nextPayload.variance_summary)
    changed = true
  }

  return { payload: nextPayload, changed }
}

async function runPoDraftDetailQuery(selectFn) {
  const selectAttempts = [
    PO_DETAIL_SELECT,
    PO_DETAIL_SELECT_LEGACY,
    PO_DETAIL_SELECT_NO_VARIANCE,
    PO_DETAIL_SELECT_NO_VARIANCE_LEGACY,
  ]

  let latestError = null

  for (const selectClause of selectAttempts) {
    const result = await selectFn(selectClause)

    if (!result.error) {
      return { data: withPoDraftCompatibility(result.data), error: null }
    }

    latestError = result.error
    if (!isPoSchemaMismatchError(result.error)) {
      return { data: null, error: result.error }
    }
  }

  return { data: null, error: latestError }
}

async function updatePoHeaderWithFallback(poId, headerUpdates = {}) {
  if (!Object.keys(headerUpdates).length) {
    return { error: null }
  }

  let payload = { ...headerUpdates }
  let attemptedTypeCoercion = false

  while (true) {
    const { error } = await supabase.from(PO_TABLES.HEADERS).update(payload).eq('id', poId)

    if (!error) {
      return { error: null }
    }

    if (hasMissingPoHeaderVarianceColumnsError(error)) {
      const reducedPayload = stripVarianceFieldsFromHeaderPayload(payload)

      if (Object.keys(reducedPayload).length === Object.keys(payload).length) {
        return { error }
      }

      if (!Object.keys(reducedPayload).length) {
        return { error: null }
      }

      payload = reducedPayload
      continue
    }

    if (!attemptedTypeCoercion && hasVarianceTypeMismatchError(error)) {
      const { payload: coercedPayload, changed } = coerceVarianceFieldsToText(payload)

      if (!changed) {
        return { error }
      }

      payload = coercedPayload
      attemptedTypeCoercion = true
      continue
    }

    return { error }
  }
}

function normalizePositiveInteger(value, fallback = 300) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function normalizeSortOrder(value, fallback = 'asc') {
  return value === 'desc' ? 'desc' : fallback
}

function normalizeVarianceDecision(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function mapVarianceDecisionToTransition(decision) {
  if (decision === 'confirm') {
    return {
      action: WORKFLOW_ACTIONS.CONFIRM_VARIANCE,
      toStatus: PO_STATUSES.PENDING_FINAL_APPROVAL,
      varianceStatus: 'confirmed',
    }
  }

  if (decision === 'reject') {
    return {
      action: APPROVAL_ACTIONS.REJECT,
      toStatus: PO_STATUSES.CANCELLED,
      varianceStatus: 'rejected',
    }
  }

  if (decision === 'send_back') {
    return {
      action: APPROVAL_ACTIONS.SEND_BACK,
      toStatus: PO_STATUSES.DRAFT,
      varianceStatus: 'sent_back',
    }
  }

  return null
}

async function fetchCurrentUserIdentity() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { data: null, error: error || new Error('User not found.') }
  }

  return { data: user, error: null }
}

function buildPreferredSupplierMap(preferredRows = []) {
  const preferredMap = new Map()

  preferredRows.forEach((row) => {
    const itemId = normalizeText(row?.item_id)
    if (!itemId || preferredMap.has(itemId)) {
      return
    }

    preferredMap.set(itemId, row)
  })

  return preferredMap
}

function canCreatePoFromPrStatus(status) {
  const normalizedStatus = normalizePrStatus(status)

  return [
    PR_STATUSES.APPROVED,
    PR_STATUSES.CONVERTED_TO_PO,
    'pending_variance_confirmation',
  ].includes(normalizedStatus)
}

function deriveHeaderSupplierSnapshot(linePayload = []) {
  const supplierRows = linePayload.filter((line) => normalizeText(line.supplier_id))
  if (supplierRows.length === 0) {
    return { supplierId: null, supplierNameSnapshot: null }
  }

  const firstSupplierId = supplierRows[0].supplier_id
  const allSameSupplier = supplierRows.every((line) => line.supplier_id === firstSupplierId)

  if (!allSameSupplier) {
    return { supplierId: null, supplierNameSnapshot: null }
  }

  const firstLine = supplierRows[0]
  return {
    supplierId: firstSupplierId,
    supplierNameSnapshot: normalizeNullableText(firstLine.supplier_name_snapshot),
  }
}

function buildPoLinePayloadFromPrLines({ poId, prLines = [], preferredMap = new Map() }) {
  return prLines.map((prLine) => {
    const preferred = preferredMap.get(normalizeText(prLine.item_id))
    const preferredSupplier = preferred?.suppliers || {}
    const requestedQty = Number(prLine.requested_qty || 0)
    const estimatedUnitPrice = Number(prLine.estimated_unit_price || 0)
    const preferredUnitPrice = Number(preferred?.unit_price)

    const unitPrice =
      !Number.isNaN(preferredUnitPrice) && preferred?.unit_price !== null
        ? preferredUnitPrice
        : !Number.isNaN(estimatedUnitPrice)
          ? estimatedUnitPrice
          : 0

    return {
      po_id: poId,
      pr_line_id: prLine.id || null,
      item_id: prLine.item_id || null,
      sku: normalizeNullableText(prLine.sku),
      item_name: normalizeText(prLine.item_name),
      description: normalizeNullableText(prLine.description),
      unit: normalizeText(prLine.unit),
      requested_qty: requestedQty > 0 ? requestedQty : 1,
      ordered_qty: requestedQty > 0 ? requestedQty : 1,
      unit_price: unitPrice >= 0 ? unitPrice : 0,
      currency: normalizeCurrency(preferred?.currency),
      supplier_id: normalizeNullableText(preferred?.supplier_id),
      supplier_sku: normalizeNullableText(preferred?.supplier_sku),
      lead_time_days: normalizeNullableNumeric(preferred?.lead_time_days),
      remarks: normalizeNullableText(prLine.remarks),
      supplier_name_snapshot: normalizeNullableText(preferredSupplier?.supplier_name),
    }
  })
}

function stripTransientPoLineFields(lines = []) {
  return lines.map((line) => {
    const payload = { ...line }
    delete payload.supplier_name_snapshot
    return payload
  })
}

export async function fetchPoDraftBySourcePrId(sourcePrId) {
  const normalizedSourcePrId = normalizeText(sourcePrId)

  if (!normalizedSourcePrId) {
    return { data: null, error: new Error('Source PR ID is required.') }
  }

  return runPoDraftDetailQuery((selectClause) =>
    supabase
      .from(PO_TABLES.HEADERS)
      .select(selectClause)
      .eq('source_pr_id', normalizedSourcePrId)
      .maybeSingle(),
  )
}

export async function fetchPoDraftDetail(poId) {
  const normalizedPoId = normalizeText(poId)

  if (!normalizedPoId) {
    return { data: null, error: new Error('PO ID is required.') }
  }

  return runPoDraftDetailQuery((selectClause) =>
    supabase.from(PO_TABLES.HEADERS).select(selectClause).eq('id', normalizedPoId).single(),
  )
}

export async function fetchPoDraftHeadersBySourcePrIds(sourcePrIds = []) {
  const normalizedPrIds = Array.from(
    new Set(sourcePrIds.map((id) => normalizeText(id)).filter(Boolean)),
  )

  if (!normalizedPrIds.length) {
    return { data: [], error: null }
  }

  const { data, error } = await supabase
    .from(PO_TABLES.HEADERS)
    .select('id, po_number, source_pr_id, status, created_at, updated_at')
    .in('source_pr_id', normalizedPrIds)

  return { data: data || [], error }
}

export async function fetchVarianceConfirmationQueue({
  status = PO_STATUSES.PENDING_VARIANCE_CONFIRMATION,
  department = '',
  searchTerm = '',
  limit = 500,
  order = 'asc',
} = {}) {
  const normalizedStatus = normalizeText(status)
  const normalizedDepartment = normalizeText(department)
  const normalizedSearch = normalizeText(searchTerm)
  const normalizedLimit = normalizePositiveInteger(limit, 500)
  const ascending = normalizeSortOrder(order, 'asc') === 'asc'

  const runQuery = async (headerSelectClause) => {
    let query = supabase
      .from(PO_TABLES.HEADERS)
      .select(
        `
        ${headerSelectClause},
        po_lines (
          id,
          line_total
        ),
        source_pr:source_pr_id (
          id,
          pr_number,
          status
        )
        `,
      )
      .order('created_at', { ascending })
      .limit(normalizedLimit)

    if (normalizedStatus && normalizedStatus !== 'all') {
      query = query.eq('status', normalizedStatus)
    }

    if (normalizedDepartment && normalizedDepartment !== 'all') {
      query = query.eq('department', normalizedDepartment)
    }

    if (normalizedSearch) {
      query = query.or(
        [
          `po_number.ilike.%${normalizedSearch}%`,
          `department.ilike.%${normalizedSearch}%`,
          `requester_name.ilike.%${normalizedSearch}%`,
          `purpose.ilike.%${normalizedSearch}%`,
          `supplier_name_snapshot.ilike.%${normalizedSearch}%`,
        ].join(','),
      )
    }

    return query
  }

  let { data, error } = await runQuery(PO_HEADER_SELECT)

  if (error && hasMissingPoHeaderVarianceColumnsError(error)) {
    const fallbackResult = await runQuery(PO_HEADER_SELECT_LEGACY)
    data = fallbackResult.data
    error = fallbackResult.error
  }

  if (error) {
    return { data: [], error }
  }

  return {
    data: (data || []).map((row) => withPoDraftCompatibility(row)),
    error: null,
  }
}

export async function fetchPoVarianceReviewDetail(poId) {
  const { data: poDraft, error: poError } = await fetchPoDraftDetail(poId)

  if (poError || !poDraft?.id) {
    return { data: null, error: poError || new Error('PO draft not found.') }
  }

  let sourcePr = null
  if (poDraft.source_pr_id) {
    const { data: sourcePrData, error: sourcePrError } = await fetchPrDetailWithLines(
      poDraft.source_pr_id,
    )
    if (sourcePrError) {
      return { data: null, error: sourcePrError }
    }

    sourcePr = sourcePrData || null
  }

  return {
    data: {
      poDraft,
      sourcePr,
    },
    error: null,
  }
}

export async function createOrGetPoDraftFromPr(sourcePrId) {
  const normalizedSourcePrId = normalizeText(sourcePrId)

  if (!normalizedSourcePrId) {
    return { data: null, created: false, error: new Error('Source PR ID is required.') }
  }

  const { data: existingPo, error: existingError } = await fetchPoDraftBySourcePrId(normalizedSourcePrId)
  if (existingError) {
    return { data: null, created: false, error: existingError }
  }

  if (existingPo?.id) {
    return { data: existingPo, created: false, error: null }
  }

  const { data: user, error: userError } = await fetchCurrentUserIdentity()
  if (userError) {
    return { data: null, created: false, error: userError }
  }

  const { data: prRecord, error: prError } = await fetchPrDetailWithLines(normalizedSourcePrId)
  if (prError || !prRecord?.id) {
    return {
      data: null,
      created: false,
      error: prError || new Error('PR not found.'),
    }
  }

  if (!canCreatePoFromPrStatus(prRecord.status)) {
    return {
      data: null,
      created: false,
      error: new Error('PO draft can only be started from approved PR records.'),
    }
  }

  const prLines = Array.isArray(prRecord.pr_lines) ? prRecord.pr_lines : []
  if (prLines.length === 0) {
    return {
      data: null,
      created: false,
      error: new Error('Cannot create PO draft because PR has no lines.'),
    }
  }

  const itemIds = prLines.map((line) => line.item_id).filter(Boolean)
  const { data: preferredRows, error: preferredError } = await fetchPreferredSupplierMappings(itemIds)
  if (preferredError) {
    return { data: null, created: false, error: preferredError }
  }

  const preferredMap = buildPreferredSupplierMap(preferredRows || [])
  const linePayloadWithSnapshot = buildPoLinePayloadFromPrLines({
    poId: '',
    prLines,
    preferredMap,
  })
  const { supplierId, supplierNameSnapshot } = deriveHeaderSupplierSnapshot(linePayloadWithSnapshot)

  const headerPayload = {
    source_pr_id: prRecord.id,
    supplier_id: supplierId,
    supplier_name_snapshot: supplierNameSnapshot,
    department: normalizeNullableText(prRecord.department),
    requester_name: normalizeText(prRecord.requester_name) || 'Requester',
    purpose: normalizeNullableText(prRecord.purpose),
    needed_by_date: normalizeNullableText(prRecord.needed_by_date),
    status: PO_DEFAULT_STATUS,
    notes: normalizeNullableText(prRecord.notes),
    created_by_user_id: user.id,
  }

  const { data: createdHeader, error: headerError } = await supabase
    .from(PO_TABLES.HEADERS)
    .insert(headerPayload)
    .select(PO_HEADER_SELECT_LEGACY)
    .single()

  if (headerError || !createdHeader?.id) {
    return {
      data: null,
      created: false,
      error: headerError || new Error('Failed to create PO header.'),
    }
  }

  const linePayload = stripTransientPoLineFields(
    linePayloadWithSnapshot.map((line) => ({
      ...line,
      po_id: createdHeader.id,
    })),
  )

  let { error: lineInsertError } = await supabase.from(PO_TABLES.LINES).insert(linePayload)

  if (lineInsertError && hasMissingCurrencyColumnError(lineInsertError)) {
    const legacyLinePayload = stripCurrencyFieldFromLines(linePayload)
    const legacyInsertResult = await supabase.from(PO_TABLES.LINES).insert(legacyLinePayload)
    lineInsertError = legacyInsertResult.error
  }

  if (lineInsertError) {
    await supabase.from(PO_TABLES.HEADERS).delete().eq('id', createdHeader.id)
    return {
      data: null,
      created: false,
      error: lineInsertError,
    }
  }

  const { data: createdDraft, error: draftError } = await fetchPoDraftDetail(createdHeader.id)
  return {
    data: createdDraft,
    created: true,
    error: draftError,
  }
}

export async function savePoDraft(poId, { headerUpdates = {}, lines = [] } = {}) {
  const normalizedPoId = normalizeText(poId)
  if (!normalizedPoId) {
    return { data: null, error: new Error('PO ID is required.') }
  }

  const normalizedHeaderUpdates = {}

  if ('supplier_id' in headerUpdates) {
    normalizedHeaderUpdates.supplier_id = normalizeNullableText(headerUpdates.supplier_id)
  }

  if ('supplier_name_snapshot' in headerUpdates) {
    normalizedHeaderUpdates.supplier_name_snapshot = normalizeNullableText(
      headerUpdates.supplier_name_snapshot,
    )
  }

  if ('notes' in headerUpdates) {
    normalizedHeaderUpdates.notes = normalizeNullableText(headerUpdates.notes)
  }

  if ('status' in headerUpdates) {
    normalizedHeaderUpdates.status = normalizeText(headerUpdates.status) || PO_STATUSES.DRAFT
  }

  if ('variance_reasons' in headerUpdates) {
    normalizedHeaderUpdates.variance_reasons = normalizeVarianceReasons(headerUpdates.variance_reasons)
  }

  if ('variance_summary' in headerUpdates) {
    normalizedHeaderUpdates.variance_summary = normalizeJsonObject(headerUpdates.variance_summary)
  }

  if ('variance_checked_at' in headerUpdates) {
    normalizedHeaderUpdates.variance_checked_at = normalizeNullableText(headerUpdates.variance_checked_at)
  }

  if ('variance_status' in headerUpdates) {
    normalizedHeaderUpdates.variance_status = normalizeNullableText(headerUpdates.variance_status)
  }

  if ('variance_submitted_at' in headerUpdates) {
    normalizedHeaderUpdates.variance_submitted_at = normalizeNullableText(
      headerUpdates.variance_submitted_at,
    )
  }

  if ('variance_submitted_by' in headerUpdates) {
    normalizedHeaderUpdates.variance_submitted_by = normalizeNullableText(
      headerUpdates.variance_submitted_by,
    )
  }

  if (Object.keys(normalizedHeaderUpdates).length > 0) {
    const { error: headerError } = await updatePoHeaderWithFallback(
      normalizedPoId,
      normalizedHeaderUpdates,
    )

    if (headerError) {
      return { data: null, error: headerError }
    }
  }

  if (Array.isArray(lines) && lines.length > 0) {
    const linePayload = lines.map((line) => {
      const orderedQty = normalizeNullableNumeric(line.ordered_qty)
      const unitPrice = normalizeNullableNumeric(line.unit_price)

      return {
        id: normalizeNullableText(line.id),
        po_id: normalizedPoId,
        pr_line_id: normalizeNullableText(line.pr_line_id),
        item_id: normalizeNullableText(line.item_id),
        sku: normalizeNullableText(line.sku),
        item_name: normalizeText(line.item_name),
        description: normalizeNullableText(line.description),
        unit: normalizeText(line.unit),
        requested_qty: normalizeNullableNumeric(line.requested_qty) || 0,
        ordered_qty: orderedQty === null || orderedQty <= 0 ? 1 : orderedQty,
        unit_price: unitPrice === null || unitPrice < 0 ? 0 : unitPrice,
        currency: normalizeCurrency(line.currency),
        supplier_id: normalizeNullableText(line.supplier_id),
        supplier_sku: normalizeNullableText(line.supplier_sku),
        lead_time_days: normalizeNullableNumeric(line.lead_time_days),
        remarks: normalizeNullableText(line.remarks),
      }
    })

    let { error: linesError } = await supabase
      .from(PO_TABLES.LINES)
      .upsert(linePayload, { onConflict: 'id' })

    if (linesError && hasMissingCurrencyColumnError(linesError)) {
      const legacyLinePayload = stripCurrencyFieldFromLines(linePayload)
      const legacyUpsertResult = await supabase
        .from(PO_TABLES.LINES)
        .upsert(legacyLinePayload, { onConflict: 'id' })
      linesError = legacyUpsertResult.error
    }

    if (linesError) {
      return { data: null, error: linesError }
    }
  }

  return fetchPoDraftDetail(normalizedPoId)
}

export async function applyPoVarianceDecision({
  poId,
  decision,
  comment,
  actorUserId,
  actorRole,
}) {
  const normalizedPoId = normalizeText(poId)
  const normalizedComment = normalizeText(comment)
  const normalizedDecision = normalizeVarianceDecision(decision)

  if (!normalizedPoId) {
    return { data: null, error: new Error('PO ID is required.') }
  }

  if (!normalizedComment) {
    return { data: null, error: new Error('Comment is required for variance decision.') }
  }

  const transition = mapVarianceDecisionToTransition(normalizedDecision)
  if (!transition) {
    return {
      data: null,
      error: new Error('Decision must be one of: confirm, reject, send_back.'),
    }
  }

  const { data: currentPo, error: currentPoError } = await fetchPoDraftDetail(normalizedPoId)

  if (currentPoError || !currentPo?.id) {
    return { data: null, error: currentPoError || new Error('PO draft not found.') }
  }

  if (currentPo.status !== PO_STATUSES.PENDING_VARIANCE_CONFIRMATION) {
    return {
      data: null,
      error: new Error(
        `Variance decision is only allowed when PO status is ${PO_STATUSES.PENDING_VARIANCE_CONFIRMATION}.`,
      ),
    }
  }

  const currentVarianceSummary = normalizeJsonObject(currentPo.variance_summary) || {}
  const reviewedAt = new Date().toISOString()
  const nextVarianceSummary = {
    ...currentVarianceSummary,
    review: {
      decision: normalizedDecision,
      from_status: currentPo.status,
      to_status: transition.toStatus,
      reviewer_user_id: actorUserId || null,
      reviewer_role: normalizeText(actorRole) || null,
      comment: normalizedComment,
      reviewed_at: reviewedAt,
    },
  }

  const { data: updatedPo, error: updateError } = await savePoDraft(normalizedPoId, {
    headerUpdates: {
      status: transition.toStatus,
      variance_summary: nextVarianceSummary,
      variance_checked_at: reviewedAt,
      variance_status: transition.varianceStatus,
    },
  })

  if (updateError || !updatedPo?.id) {
    return { data: null, error: updateError || new Error('Failed to update PO status.') }
  }

  if (actorUserId) {
    await createWorkflowHistoryEntry({
      documentType: DOCUMENT_TYPES.PO,
      documentId: updatedPo.id,
      action: transition.action,
      actorUserId,
      actorRole,
      comment: normalizedComment,
      metadata: {
        decision: normalizedDecision,
        from_status: currentPo.status,
        to_status: transition.toStatus,
        variance_reasons: currentPo.variance_reasons || [],
      },
    })
  }

  return { data: updatedPo, error: null }
}
