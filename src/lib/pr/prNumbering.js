function normalizeYear(year) {
  const numericYear = Number(year)
  if (Number.isInteger(numericYear) && numericYear > 0) {
    return numericYear
  }

  return new Date().getFullYear()
}

function normalizeSequence(sequence) {
  const numericSequence = Number(sequence)
  if (Number.isInteger(numericSequence) && numericSequence > 0) {
    return numericSequence
  }

  return 1
}

export function formatPrNumber({ year, sequence }) {
  const safeYear = normalizeYear(year)
  const safeSequence = normalizeSequence(sequence)

  return `PR-${safeYear}-${String(safeSequence).padStart(4, '0')}`
}

export function createPrNumberPreview({
  year = new Date().getFullYear(),
  sequence = 1,
} = {}) {
  return formatPrNumber({ year, sequence })
}
