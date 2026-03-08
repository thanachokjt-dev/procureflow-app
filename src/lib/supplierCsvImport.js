import {
  downloadCsvRows,
  getMissingRequiredColumns,
  parseCsvBoolean,
  parseCsvFile,
} from './csvImport'
import {
  createSupplier,
  fetchExistingSupplierCodes,
  updateSupplierByCode,
} from './masterData'

export const SUPPLIER_IMPORT_REQUIRED_COLUMNS = ['supplier_code', 'supplier_name']

export const SUPPLIER_IMPORT_OPTIONAL_COLUMNS = [
  'contact_name',
  'email',
  'phone',
  'address',
  'tax_id',
  'payment_terms',
  'lead_time_days',
  'currency',
  'active',
]

export const SUPPLIER_IMPORT_TEMPLATE_COLUMNS = [
  ...SUPPLIER_IMPORT_REQUIRED_COLUMNS,
  ...SUPPLIER_IMPORT_OPTIONAL_COLUMNS,
]

export const SUPPLIER_IMPORT_MODES = {
  CREATE_ONLY: 'create_only',
  UPDATE_ONLY: 'update_only',
  UPSERT: 'upsert',
}

function mapRowValues(values = {}) {
  return {
    supplier_code: String(values.supplier_code || '').trim(),
    supplier_name: String(values.supplier_name || '').trim(),
    contact_name: String(values.contact_name || '').trim(),
    email: String(values.email || '').trim(),
    phone: String(values.phone || '').trim(),
    address: String(values.address || '').trim(),
    tax_id: String(values.tax_id || '').trim(),
    payment_terms: String(values.payment_terms || '').trim(),
    lead_time_days: String(values.lead_time_days || '').trim(),
    currency: String(values.currency || '').trim(),
    active: String(values.active || '').trim(),
  }
}

function buildSupplierPayload(rowValues) {
  const errors = []

  if (!rowValues.supplier_code) {
    errors.push('supplier_code must not be empty.')
  }

  if (!rowValues.supplier_name) {
    errors.push('supplier_name must not be empty.')
  }

  if (rowValues.email && !rowValues.email.includes('@')) {
    errors.push('email format is invalid.')
  }

  let leadTimeDays = null
  if (rowValues.lead_time_days) {
    const parsedLeadTime = Number(rowValues.lead_time_days)
    if (Number.isNaN(parsedLeadTime) || parsedLeadTime < 0) {
      errors.push('lead_time_days must be zero or greater.')
    } else {
      leadTimeDays = Math.floor(parsedLeadTime)
    }
  }

  const activeResult = parseCsvBoolean(rowValues.active, true)
  if (activeResult.error) {
    errors.push(activeResult.error)
  }

  return {
    errors,
    payload: {
      supplier_code: rowValues.supplier_code,
      supplier_name: rowValues.supplier_name,
      contact_name: rowValues.contact_name || null,
      email: rowValues.email || null,
      phone: rowValues.phone || null,
      address: rowValues.address || null,
      tax_id: rowValues.tax_id || null,
      payment_terms: rowValues.payment_terms || null,
      lead_time_days: leadTimeDays,
      currency: (rowValues.currency || 'USD').toUpperCase(),
      active: activeResult.value,
    },
  }
}

export async function createSupplierImportPreview(file) {
  const { normalizedHeaders, records, parseError } = await parseCsvFile(file)

  if (parseError) {
    return { preview: null, error: parseError }
  }

  const missingColumns = getMissingRequiredColumns(
    normalizedHeaders,
    SUPPLIER_IMPORT_REQUIRED_COLUMNS,
  )
  if (missingColumns.length > 0) {
    return {
      preview: null,
      error: `Missing required columns: ${missingColumns.join(', ')}`,
    }
  }

  if (!records.length) {
    return { preview: null, error: 'CSV file has no data rows.' }
  }

  const codeCountMap = new Map()
  records.forEach((record) => {
    const normalizedCode = String(record.values.supplier_code || '')
      .trim()
      .toLowerCase()

    if (!normalizedCode) {
      return
    }

    codeCountMap.set(normalizedCode, (codeCountMap.get(normalizedCode) || 0) + 1)
  })

  const validRows = []
  const invalidRows = []

  records.forEach((record) => {
    const rowValues = mapRowValues(record.values)
    const { errors, payload } = buildSupplierPayload(rowValues)
    const normalizedCode = rowValues.supplier_code.toLowerCase()

    if (normalizedCode && codeCountMap.get(normalizedCode) > 1) {
      errors.push('Duplicate supplier_code found in CSV file.')
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
    supplier_code: rowResult.rowValues.supplier_code,
    supplier_name: rowResult.rowValues.supplier_name,
    contact_name: rowResult.rowValues.contact_name,
    email: rowResult.rowValues.email,
    phone: rowResult.rowValues.phone,
    address: rowResult.rowValues.address,
    tax_id: rowResult.rowValues.tax_id,
    payment_terms: rowResult.rowValues.payment_terms,
    lead_time_days: rowResult.rowValues.lead_time_days,
    currency: rowResult.rowValues.currency,
    active: rowResult.rowValues.active,
    error: rowResult.errors?.join(' | ') || defaultMessage,
  }
}

export function downloadSupplierImportErrorsCsv(fileName, failedRows = []) {
  if (!failedRows.length) {
    return
  }

  const headers = [
    'row_number',
    'supplier_code',
    'supplier_name',
    'contact_name',
    'email',
    'phone',
    'address',
    'tax_id',
    'payment_terms',
    'lead_time_days',
    'currency',
    'active',
    'error',
  ]

  const rows = failedRows.map((row) => toErrorRow(row))
  downloadCsvRows(fileName, headers, rows)
}

export async function runSupplierImport({ preview, mode }) {
  if (!preview) {
    return { summary: null, error: 'No preview data found. Upload a CSV first.' }
  }

  const validRows = preview.validRows || []
  const invalidRows = preview.invalidRows || []

  if (!validRows.length && !invalidRows.length) {
    return { summary: null, error: 'No rows found to import.' }
  }

  const { data: existingCodes, error: existingCodeError } = await fetchExistingSupplierCodes(
    validRows.map((row) => row.payload.supplier_code),
  )

  if (existingCodeError) {
    return { summary: null, error: existingCodeError.message }
  }

  const existingCodeSet = new Set(
    (existingCodes || []).map((code) => String(code || '').trim().toLowerCase()),
  )

  let created = 0
  let updated = 0
  let skipped = 0
  let failed = invalidRows.length
  const failedRows = [...invalidRows]

  for (const row of validRows) {
    const codeKey = String(row.payload.supplier_code || '').toLowerCase()
    const exists = existingCodeSet.has(codeKey)

    if (mode === SUPPLIER_IMPORT_MODES.CREATE_ONLY && exists) {
      skipped += 1
      continue
    }

    if (mode === SUPPLIER_IMPORT_MODES.UPDATE_ONLY && !exists) {
      skipped += 1
      continue
    }

    if (
      mode === SUPPLIER_IMPORT_MODES.CREATE_ONLY ||
      (!exists && mode === SUPPLIER_IMPORT_MODES.UPSERT)
    ) {
      const { error } = await createSupplier(row.payload)

      if (error) {
        failed += 1
        failedRows.push({
          ...row,
          errors: [`Create failed: ${error.message}`],
        })
        continue
      }

      created += 1
      existingCodeSet.add(codeKey)
      continue
    }

    const { data, error } = await updateSupplierByCode(row.payload.supplier_code, row.payload)

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
