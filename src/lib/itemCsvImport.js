import {
  downloadCsvRows,
  getMissingRequiredColumns,
  parseCsvBoolean,
  parseCsvFile,
} from './csvImport'
import {
  createItem,
  fetchExistingItemSkus,
  updateItemBySku,
} from './masterData'

export const ITEM_IMPORT_REQUIRED_COLUMNS = ['sku', 'item_name', 'unit']

export const ITEM_IMPORT_OPTIONAL_COLUMNS = [
  'category',
  'brand',
  'model',
  'color',
  'size',
  'description',
  'spec_text',
  'image_url',
  'active',
]

export const ITEM_IMPORT_TEMPLATE_COLUMNS = [
  ...ITEM_IMPORT_REQUIRED_COLUMNS,
  ...ITEM_IMPORT_OPTIONAL_COLUMNS,
]

export const ITEM_IMPORT_MODES = {
  CREATE_ONLY: 'create_only',
  UPDATE_ONLY: 'update_only',
  UPSERT: 'upsert',
}

function mapRowValues(values = {}) {
  return {
    sku: String(values.sku || '').trim(),
    item_name: String(values.item_name || '').trim(),
    unit: String(values.unit || '').trim(),
    category: String(values.category || '').trim(),
    brand: String(values.brand || '').trim(),
    model: String(values.model || '').trim(),
    color: String(values.color || '').trim(),
    size: String(values.size || '').trim(),
    description: String(values.description || '').trim(),
    spec_text: String(values.spec_text || '').trim(),
    image_url: String(values.image_url || '').trim(),
    active: String(values.active || '').trim(),
  }
}

function buildItemPayload(rowValues) {
  const errors = []

  if (!rowValues.sku) {
    errors.push('sku must not be empty.')
  }

  if (!rowValues.item_name) {
    errors.push('item_name must not be empty.')
  }

  if (!rowValues.unit) {
    errors.push('unit must not be empty.')
  }

  const activeResult = parseCsvBoolean(rowValues.active, true)
  if (activeResult.error) {
    errors.push(activeResult.error)
  }

  return {
    errors,
    payload: {
      sku: rowValues.sku,
      item_name: rowValues.item_name,
      unit: rowValues.unit,
      category: rowValues.category || null,
      brand: rowValues.brand || null,
      model: rowValues.model || null,
      color: rowValues.color || null,
      size: rowValues.size || null,
      description: rowValues.description || null,
      spec_text: rowValues.spec_text || null,
      image_url: rowValues.image_url || null,
      active: activeResult.value,
    },
  }
}

export async function createItemImportPreview(file) {
  const { normalizedHeaders, records, parseError } = await parseCsvFile(file)

  if (parseError) {
    return { preview: null, error: parseError }
  }

  const missingColumns = getMissingRequiredColumns(normalizedHeaders, ITEM_IMPORT_REQUIRED_COLUMNS)
  if (missingColumns.length > 0) {
    return {
      preview: null,
      error: `Missing required columns: ${missingColumns.join(', ')}`,
    }
  }

  if (!records.length) {
    return { preview: null, error: 'CSV file has no data rows.' }
  }

  const skuCountMap = new Map()
  records.forEach((record) => {
    const normalizedSku = String(record.values.sku || '')
      .trim()
      .toLowerCase()

    if (!normalizedSku) {
      return
    }

    skuCountMap.set(normalizedSku, (skuCountMap.get(normalizedSku) || 0) + 1)
  })

  const validRows = []
  const invalidRows = []

  records.forEach((record) => {
    const rowValues = mapRowValues(record.values)
    const { errors, payload } = buildItemPayload(rowValues)
    const normalizedSku = rowValues.sku.toLowerCase()

    if (normalizedSku && skuCountMap.get(normalizedSku) > 1) {
      errors.push('Duplicate SKU found in CSV file.')
    }

    const rowResult = {
      rowNumber: record.rowNumber,
      rowValues,
      payload,
      errors,
    }

    if (errors.length > 0) {
      invalidRows.push(rowResult)
      return
    }

    validRows.push(rowResult)
  })

  return {
    preview: {
      fileName: file.name,
      totalRows: records.length,
      rows: [...validRows, ...invalidRows].sort((a, b) => a.rowNumber - b.rowNumber),
      validRows,
      invalidRows,
    },
    error: '',
  }
}

function toErrorRow(rowResult, defaultMessage = '') {
  return {
    row_number: rowResult.rowNumber,
    sku: rowResult.rowValues.sku,
    item_name: rowResult.rowValues.item_name,
    unit: rowResult.rowValues.unit,
    category: rowResult.rowValues.category,
    brand: rowResult.rowValues.brand,
    model: rowResult.rowValues.model,
    color: rowResult.rowValues.color,
    size: rowResult.rowValues.size,
    description: rowResult.rowValues.description,
    spec_text: rowResult.rowValues.spec_text,
    image_url: rowResult.rowValues.image_url,
    active: rowResult.rowValues.active,
    error: rowResult.errors?.join(' | ') || defaultMessage,
  }
}

export function downloadItemImportErrorsCsv(fileName, failedRows = []) {
  if (!failedRows.length) {
    return
  }

  const headers = [
    'row_number',
    'sku',
    'item_name',
    'unit',
    'category',
    'brand',
    'model',
    'color',
    'size',
    'description',
    'spec_text',
    'image_url',
    'active',
    'error',
  ]

  const rows = failedRows.map((row) => toErrorRow(row))
  downloadCsvRows(fileName, headers, rows)
}

export async function runItemImport({ preview, mode }) {
  if (!preview) {
    return { summary: null, error: 'No preview data found. Upload a CSV first.' }
  }

  const validRows = preview.validRows || []
  const invalidRows = preview.invalidRows || []

  if (!validRows.length && !invalidRows.length) {
    return { summary: null, error: 'No rows found to import.' }
  }

  const { data: existingSkus, error: existingSkuError } = await fetchExistingItemSkus(
    validRows.map((row) => row.payload.sku),
  )

  if (existingSkuError) {
    return { summary: null, error: existingSkuError.message }
  }

  const existingSkuSet = new Set(
    (existingSkus || []).map((sku) => String(sku || '').trim().toLowerCase()),
  )

  let created = 0
  let updated = 0
  let skipped = 0
  let failed = invalidRows.length
  const failedRows = [...invalidRows]

  for (const row of validRows) {
    const skuKey = String(row.payload.sku || '').toLowerCase()
    const exists = existingSkuSet.has(skuKey)

    if (mode === ITEM_IMPORT_MODES.CREATE_ONLY && exists) {
      skipped += 1
      continue
    }

    if (mode === ITEM_IMPORT_MODES.UPDATE_ONLY && !exists) {
      skipped += 1
      continue
    }

    if (mode === ITEM_IMPORT_MODES.CREATE_ONLY || (!exists && mode === ITEM_IMPORT_MODES.UPSERT)) {
      const { error } = await createItem(row.payload)

      if (error) {
        failed += 1
        failedRows.push({
          ...row,
          errors: [`Create failed: ${error.message}`],
        })
        continue
      }

      created += 1
      existingSkuSet.add(skuKey)
      continue
    }

    const { data, error } = await updateItemBySku(row.payload.sku, row.payload)

    if (error) {
      failed += 1
      failedRows.push({
        ...row,
        errors: [`Update failed: ${error.message}`],
      })
      continue
    }

    if (!data) {
      skipped += 1
      continue
    }

    updated += 1
  }

  return {
    summary: {
      totalRows: preview.totalRows,
      created,
      updated,
      skipped,
      failed,
      failedRows,
    },
    error: '',
  }
}
