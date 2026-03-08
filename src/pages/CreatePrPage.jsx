import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { formatCurrency } from '../lib/formatters'
import { fetchActiveItems } from '../lib/masterData'
import { createPrDraft, savePrLines } from '../lib/pr/prService'

const createLineDraft = () => ({
  id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  item_id: '',
  itemSearch: '',
  sku: '',
  item_name: '',
  description: '',
  unit: '',
  requested_qty: '1',
  estimated_unit_price: '',
  remarks: '',
})

function toNumber(value, fallback = 0) {
  const numericValue = Number(value)
  if (Number.isNaN(numericValue)) {
    return fallback
  }

  return numericValue
}

function getLineEstimatedTotal(line) {
  const qty = toNumber(line.requested_qty, 0)
  const unitPrice = toNumber(line.estimated_unit_price, 0)
  return qty * unitPrice
}

function CreatePrPage() {
  const { profile } = useAuth()

  const [formValues, setFormValues] = useState({
    department: profile?.department || '',
    purpose: '',
    needed_by_date: '',
    notes: '',
  })
  const [lineItems, setLineItems] = useState([createLineDraft()])
  const [catalogItems, setCatalogItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [itemsError, setItemsError] = useState('')
  const [validationErrors, setValidationErrors] = useState([])
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedDraft, setLastSavedDraft] = useState(null)

  useEffect(() => {
    const loadItems = async () => {
      setItemsLoading(true)
      setItemsError('')

      const { data, error } = await fetchActiveItems()

      if (error) {
        setItemsError(error.message || 'Failed to load Item Master data.')
        setCatalogItems([])
        setItemsLoading(false)
        return
      }

      setCatalogItems(data || [])
      setItemsLoading(false)
    }

    loadItems()
  }, [])

  const documentEstimatedTotal = useMemo(() => {
    return lineItems.reduce((total, line) => total + getLineEstimatedTotal(line), 0)
  }, [lineItems])

  const handleHeaderChange = (fieldName) => (event) => {
    const value = event.target.value
    setFormValues((previous) => ({ ...previous, [fieldName]: value }))
  }

  const handleLineFieldChange = (lineId, fieldName) => (event) => {
    const value = event.target.value

    setLineItems((previous) =>
      previous.map((line) => (line.id === lineId ? { ...line, [fieldName]: value } : line)),
    )
  }

  const getFilteredItemsForLine = (line) => {
    const keyword = String(line.itemSearch || '')
      .trim()
      .toLowerCase()

    if (!keyword) {
      return catalogItems
    }

    return catalogItems.filter((item) => {
      const haystack = [item.sku, item.item_name, item.brand, item.model, item.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(keyword)
    })
  }

  const handleSelectCatalogItem = (lineId) => (event) => {
    const selectedItemId = event.target.value
    const selectedItem = catalogItems.find((item) => item.id === selectedItemId)

    setLineItems((previous) =>
      previous.map((line) => {
        if (line.id !== lineId) {
          return line
        }

        if (!selectedItem) {
          return { ...line, item_id: '' }
        }

        return {
          ...line,
          item_id: selectedItem.id,
          sku: selectedItem.sku || line.sku,
          item_name: selectedItem.item_name || line.item_name,
          description: selectedItem.description || selectedItem.spec_text || line.description,
          unit: selectedItem.unit || line.unit,
        }
      }),
    )
  }

  const handleAddLine = () => {
    setLineItems((previous) => [...previous, createLineDraft()])
  }

  const handleRemoveLine = (lineId) => {
    setLineItems((previous) => {
      if (previous.length === 1) {
        return previous
      }

      return previous.filter((line) => line.id !== lineId)
    })
  }

  const resetForm = () => {
    setFormValues({
      department: profile?.department || '',
      purpose: '',
      needed_by_date: '',
      notes: '',
    })
    setLineItems([createLineDraft()])
    setValidationErrors([])
    setSaveError('')
    setSaveSuccess('')
    setLastSavedDraft(null)
  }

  const validateForm = () => {
    const errors = []

    if (!String(formValues.department || '').trim()) {
      errors.push('Department is required.')
    }

    if (!String(formValues.purpose || '').trim()) {
      errors.push('Purpose is required.')
    }

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      errors.push('At least one PR line is required.')
      return errors
    }

    lineItems.forEach((line, index) => {
      const lineNumber = index + 1
      const qty = toNumber(line.requested_qty, NaN)
      const estimatedUnitPrice =
        String(line.estimated_unit_price || '').trim() === ''
          ? 0
          : toNumber(line.estimated_unit_price, NaN)

      if (!String(line.item_name || '').trim()) {
        errors.push(`Line ${lineNumber}: Item name is required.`)
      }

      if (!String(line.unit || '').trim()) {
        errors.push(`Line ${lineNumber}: Unit is required.`)
      }

      if (Number.isNaN(qty) || qty <= 0) {
        errors.push(`Line ${lineNumber}: Requested quantity must be greater than 0.`)
      }

      if (Number.isNaN(estimatedUnitPrice) || estimatedUnitPrice < 0) {
        errors.push(`Line ${lineNumber}: Estimated unit price must be 0 or greater.`)
      }
    })

    return errors
  }

  const handleSaveDraft = async (event) => {
    event.preventDefault()
    setSaveError('')
    setSaveSuccess('')
    setLastSavedDraft(null)

    const errors = validateForm()
    setValidationErrors(errors)

    if (errors.length > 0) {
      return
    }

    setIsSaving(true)

    const { data: draftHeader, error: createError } = await createPrDraft({
      department: formValues.department,
      purpose: formValues.purpose,
      neededByDate: formValues.needed_by_date || null,
      notes: formValues.notes,
      requesterName: profile?.full_name || '',
    })

    if (createError || !draftHeader?.id) {
      setSaveError(createError?.message || 'Failed to create PR draft.')
      setIsSaving(false)
      return
    }

    const linePayload = lineItems.map((line) => ({
      item_id: line.item_id || null,
      sku: String(line.sku || '').trim() || null,
      item_name: String(line.item_name || '').trim(),
      description: String(line.description || '').trim() || null,
      unit: String(line.unit || '').trim(),
      requested_qty: Number(line.requested_qty),
      estimated_unit_price:
        String(line.estimated_unit_price || '').trim() === ''
          ? 0
          : Number(line.estimated_unit_price),
      remarks: String(line.remarks || '').trim() || null,
    }))

    const { data: savedLines, error: lineError } = await savePrLines(draftHeader.id, linePayload)

    if (lineError) {
      setSaveError(`Draft header created (${draftHeader.pr_number}) but lines failed: ${lineError.message}`)
      setIsSaving(false)
      return
    }

    setSaveSuccess(`Draft saved successfully: ${draftHeader.pr_number}`)
    setLastSavedDraft({
      ...draftHeader,
      lines: savedLines || [],
    })
    setValidationErrors([])
    setIsSaving(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create PR"
        subtitle="Create and save a purchase request draft with one or more line items."
      />

      {itemsError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {itemsError}
        </div>
      ) : null}

      {validationErrors.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Please fix the following:</p>
          <ul className="mt-2 list-disc pl-5">
            {validationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {saveError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {saveError}
        </div>
      ) : null}

      {saveSuccess ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {saveSuccess}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <form
          onSubmit={handleSaveDraft}
          className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Department</label>
              <input
                type="text"
                value={formValues.department}
                onChange={handleHeaderChange('department')}
                placeholder="Operations"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Needed By Date</label>
              <input
                type="date"
                value={formValues.needed_by_date}
                onChange={handleHeaderChange('needed_by_date')}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Purpose</label>
              <textarea
                rows={3}
                value={formValues.purpose}
                onChange={handleHeaderChange('purpose')}
                placeholder="Describe why this purchase request is needed."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
              <textarea
                rows={2}
                value={formValues.notes}
                onChange={handleHeaderChange('notes')}
                placeholder="Optional internal notes."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">PR Lines</h3>
              <button
                type="button"
                onClick={handleAddLine}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                + Add Line
              </button>
            </div>

            <div className="space-y-3">
              {lineItems.map((line, index) => {
                const filteredItems = getFilteredItemsForLine(line)

                return (
                  <div key={line.id} className="rounded-md border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Line {index + 1}
                      </p>
                      {lineItems.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.id)}
                          className="text-xs font-medium text-rose-600 hover:text-rose-700"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <div className="grid gap-3 md:grid-cols-6">
                      <input
                        type="text"
                        value={line.itemSearch}
                        onChange={handleLineFieldChange(line.id, 'itemSearch')}
                        placeholder="Search item (SKU/name/brand/model)"
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-3"
                        disabled={itemsLoading || catalogItems.length === 0}
                      />

                      <select
                        value={line.item_id}
                        onChange={handleSelectCatalogItem(line.id)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-3"
                        disabled={itemsLoading || catalogItems.length === 0}
                      >
                        {itemsLoading ? <option value="">Loading items...</option> : null}
                        {!itemsLoading && catalogItems.length === 0 ? (
                          <option value="">No active items found</option>
                        ) : null}
                        {!itemsLoading && catalogItems.length > 0 ? (
                          <option value="">Select item from Item Master (optional)</option>
                        ) : null}
                        {filteredItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.sku} - {item.item_name}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        value={line.sku}
                        onChange={handleLineFieldChange(line.id, 'sku')}
                        placeholder="SKU"
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-2"
                      />

                      <input
                        type="text"
                        value={line.item_name}
                        onChange={handleLineFieldChange(line.id, 'item_name')}
                        placeholder="Item name"
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-4"
                        required
                      />

                      <textarea
                        rows={2}
                        value={line.description}
                        onChange={handleLineFieldChange(line.id, 'description')}
                        placeholder="Description"
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-6"
                      />

                      <input
                        type="text"
                        value={line.unit}
                        onChange={handleLineFieldChange(line.id, 'unit')}
                        placeholder="Unit (pcs, box, set)"
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-2"
                        required
                      />

                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.requested_qty}
                        onChange={handleLineFieldChange(line.id, 'requested_qty')}
                        placeholder="Requested qty"
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-2"
                        required
                      />

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.estimated_unit_price}
                        onChange={handleLineFieldChange(line.id, 'estimated_unit_price')}
                        placeholder="Estimated unit price (optional)"
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-2"
                      />

                      <textarea
                        rows={2}
                        value={line.remarks}
                        onChange={handleLineFieldChange(line.id, 'remarks')}
                        placeholder="Remarks (optional)"
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-4"
                      />

                      <div className="flex items-center rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 md:col-span-2">
                        Line Total: {formatCurrency(getLineEstimatedTotal(line))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            Document Estimated Total:{' '}
            <span className="font-semibold">{formatCurrency(documentEstimatedTotal)}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? 'Saving Draft...' : 'Save Draft'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Draft Guidance
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>1. Fill department and purpose first.</li>
              <li>2. Use Item Master search to auto-fill line details quickly.</li>
              <li>3. Free-text items are supported when no catalog item exists.</li>
              <li>4. Save as draft now; submit will be added in next phase.</li>
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Item Master Status
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {itemsLoading
                ? 'Loading active item catalog...'
                : `${catalogItems.length} active item(s) available for selection.`}
            </p>
          </div>

          {lastSavedDraft ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
                Last Saved Draft
              </h3>
              <p className="mt-2 text-sm text-emerald-700">
                <span className="font-medium">PR Number:</span> {lastSavedDraft.pr_number}
              </p>
              <p className="text-sm text-emerald-700">
                <span className="font-medium">Lines:</span> {lastSavedDraft.lines.length}
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}

export default CreatePrPage
