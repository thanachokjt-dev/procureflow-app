function normalizeCsvHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseCsvRows(csvText) {
  const rows = []
  let currentRow = []
  let currentValue = ''
  let inQuotes = false

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index]

    if (inQuotes) {
      if (character === '"') {
        const nextCharacter = csvText[index + 1]

        if (nextCharacter === '"') {
          currentValue += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        currentValue += character
      }

      continue
    }

    if (character === '"') {
      inQuotes = true
      continue
    }

    if (character === ',') {
      currentRow.push(currentValue)
      currentValue = ''
      continue
    }

    if (character === '\n') {
      currentRow.push(currentValue)
      rows.push(currentRow)
      currentRow = []
      currentValue = ''
      continue
    }

    if (character === '\r') {
      continue
    }

    currentValue += character
  }

  currentRow.push(currentValue)

  const hasNonEmptyValue = currentRow.some((value) => String(value || '').trim() !== '')
  if (currentRow.length > 1 || hasNonEmptyValue) {
    rows.push(currentRow)
  }

  return rows
}

export function parseCsvText(csvText) {
  const cleanedText = String(csvText || '').replace(/^\uFEFF/, '')
  const parsedRows = parseCsvRows(cleanedText)

  if (!parsedRows.length) {
    return {
      headers: [],
      normalizedHeaders: [],
      records: [],
      parseError: 'CSV file is empty.',
    }
  }

  const headers = parsedRows[0].map((header) => String(header || '').trim())
  const normalizedHeaders = headers.map(normalizeCsvHeader)

  if (normalizedHeaders.some((header) => !header)) {
    return {
      headers,
      normalizedHeaders,
      records: [],
      parseError: 'CSV header row has empty column names.',
    }
  }

  const records = parsedRows
    .slice(1)
    .map((row, rowIndex) => {
      const values = {}

      normalizedHeaders.forEach((header, headerIndex) => {
        values[header] = String(row[headerIndex] || '').trim()
      })

      return {
        rowNumber: rowIndex + 2,
        values,
      }
    })
    .filter((record) => Object.values(record.values).some((value) => String(value).trim() !== ''))

  return {
    headers,
    normalizedHeaders,
    records,
    parseError: '',
  }
}

export async function parseCsvFile(file) {
  const text = await file.text()
  return parseCsvText(text)
}

export function getMissingRequiredColumns(headers = [], requiredColumns = []) {
  const currentHeaders = new Set(headers.map(normalizeCsvHeader))
  return requiredColumns.filter((column) => !currentHeaders.has(normalizeCsvHeader(column)))
}

function escapeCsvValue(value) {
  const stringValue = String(value ?? '')

  if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

export function downloadCsvTemplate(fileName, headers = [], sampleRows = []) {
  const headerLine = headers.map(escapeCsvValue).join(',')
  const rowLines = sampleRows.map((row) =>
    headers.map((header) => escapeCsvValue(row[header])).join(','),
  )

  const csvContent = [headerLine, ...rowLines].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.setAttribute('download', fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function parseCsvBoolean(rawValue, defaultValue = true) {
  const normalized = String(rawValue || '').trim().toLowerCase()

  if (!normalized) {
    return { value: defaultValue, error: '' }
  }

  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return { value: true, error: '' }
  }

  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return { value: false, error: '' }
  }

  return {
    value: defaultValue,
    error: 'Expected active to be true/false, yes/no, or 1/0.',
  }
}

export { normalizeCsvHeader }
