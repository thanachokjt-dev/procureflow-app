import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { formatCurrency } from '../lib/formatters'
import { fetchActiveItems, fetchActiveSuppliers } from '../lib/masterData'
import { createPurchaseRequest } from '../lib/procurementData'

const initialForm = {
  title: '',
  department: '',
  supplierId: '',
  justification: '',
}

const createInitialLineItem = () => ({
  itemId: '',
  itemName: '',
  qty: 1,
  unit: 'pcs',
  unitPrice: '',
  brand: '',
  model: '',
  color: '',
  specText: '',
})

function NewRequestPage() {
  const [formValues, setFormValues] = useState(initialForm)
  const [lineItems, setLineItems] = useState([createInitialLineItem()])
  const [suppliers, setSuppliers] = useState([])
  const [items, setItems] = useState([])
  const [supplierSearchTerm, setSupplierSearchTerm] = useState('')
  const [lineItemSearchTerms, setLineItemSearchTerms] = useState({})
  const [supplierLoading, setSupplierLoading] = useState(true)
  const [itemLoading, setItemLoading] = useState(true)
  const [masterDataError, setMasterDataError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [validationErrors, setValidationErrors] = useState([])

  const loadMasterData = async () => {
    setMasterDataError('')
    setSupplierLoading(true)
    setItemLoading(true)

    const [supplierResult, itemResult] = await Promise.all([
      fetchActiveSuppliers(),
      fetchActiveItems(),
    ])

    if (supplierResult.error || itemResult.error) {
      const supplierError = supplierResult.error?.message || ''
      const itemError = itemResult.error?.message || ''
      setMasterDataError(
        [supplierError, itemError].filter(Boolean).join(' | ') ||
          'Failed to load supplier/item master data.',
      )
    }

    setSuppliers(supplierResult.data || [])
    setItems(itemResult.data || [])
    setSupplierLoading(false)
    setItemLoading(false)
  }

  useEffect(() => {
    const loadMasterDataInEffect = async () => {
      setMasterDataError('')
      setSupplierLoading(true)
      setItemLoading(true)

      const [supplierResult, itemResult] = await Promise.all([
        fetchActiveSuppliers(),
        fetchActiveItems(),
      ])

      if (supplierResult.error || itemResult.error) {
        const supplierError = supplierResult.error?.message || ''
        const itemError = itemResult.error?.message || ''
        setMasterDataError(
          [supplierError, itemError].filter(Boolean).join(' | ') ||
            'Failed to load supplier/item master data.',
        )
      }

      setSuppliers(supplierResult.data || [])
      setItems(itemResult.data || [])
      setSupplierLoading(false)
      setItemLoading(false)
    }

    loadMasterDataInEffect()
  }, [])

  const filteredSuppliers = useMemo(() => {
    const keyword = supplierSearchTerm.trim().toLowerCase()

    if (!keyword) {
      return suppliers
    }

    return suppliers.filter((supplier) => {
      const haystack = [supplier.supplier_code, supplier.supplier_name, supplier.contact_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(keyword)
    })
  }, [supplierSearchTerm, suppliers])

  const selectedSupplier = useMemo(() => {
    return suppliers.find((supplier) => supplier.id === formValues.supplierId) || null
  }, [formValues.supplierId, suppliers])

  const estimatedTotal = useMemo(() => {
    return lineItems.reduce(
      (sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0),
      0,
    )
  }, [lineItems])

  const getFilteredItemsForLine = (index) => {
    const keyword = String(lineItemSearchTerms[index] || '')
      .trim()
      .toLowerCase()

    if (!keyword) {
      return items
    }

    return items.filter((catalogItem) => {
      const haystack = [catalogItem.sku, catalogItem.item_name, catalogItem.brand, catalogItem.model]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(keyword)
    })
  }

  const handleChange = (fieldName) => (event) => {
    setFormValues((previous) => ({
      ...previous,
      [fieldName]: event.target.value,
    }))
  }

  const handleLineItemChange = (index, fieldName) => (event) => {
    const value = event.target.value

    setLineItems((previous) =>
      previous.map((item, currentIndex) => {
        if (currentIndex !== index) {
          return item
        }

        return {
          ...item,
          [fieldName]: value,
        }
      }),
    )
  }

  const handleLineItemSearchChange = (index) => (event) => {
    const value = event.target.value

    setLineItemSearchTerms((previous) => ({
      ...previous,
      [index]: value,
    }))
  }

  const handleLineItemSelection = (index) => (event) => {
    const selectedItemId = event.target.value
    const selectedItem = items.find((item) => item.id === selectedItemId)

    setLineItems((previous) =>
      previous.map((lineItem, currentIndex) => {
        if (currentIndex !== index) {
          return lineItem
        }

        if (!selectedItem) {
          return {
            ...lineItem,
            itemId: '',
          }
        }

        return {
          ...lineItem,
          itemId: selectedItem.id,
          itemName: selectedItem.item_name || lineItem.itemName,
          unit: selectedItem.unit || lineItem.unit,
          brand: selectedItem.brand || '',
          model: selectedItem.model || '',
          color: selectedItem.color || '',
          specText: selectedItem.spec_text || selectedItem.description || '',
        }
      }),
    )
  }

  const addLineItem = () => {
    setLineItems((previous) => [...previous, createInitialLineItem()])
  }

  const removeLineItem = (indexToRemove) => {
    setLineItems((previous) => previous.filter((_, index) => index !== indexToRemove))

    setLineItemSearchTerms((previous) => {
      const next = {}

      Object.entries(previous).forEach(([key, value]) => {
        const index = Number(key)

        if (index < indexToRemove) {
          next[index] = value
        }

        if (index > indexToRemove) {
          next[index - 1] = value
        }
      })

      return next
    })
  }

  const validateForm = () => {
    const errors = []

    if (formValues.title.trim().length < 5) {
      errors.push('Request title must be at least 5 characters.')
    }

    if (formValues.department.trim().length < 2) {
      errors.push('Department is required.')
    }

    if (!formValues.supplierId) {
      errors.push('Please select a supplier from Supplier Master.')
    }

    if (formValues.justification.trim().length < 10) {
      errors.push('Justification must be at least 10 characters.')
    }

    if (lineItems.length === 0) {
      errors.push('Add at least one line item.')
    }

    lineItems.forEach((item, index) => {
      if (!item.itemName.trim()) {
        errors.push(`Line item ${index + 1}: Item name is required.`)
      }

      if (Number(item.qty) <= 0 || Number.isNaN(Number(item.qty))) {
        errors.push(`Line item ${index + 1}: Quantity must be greater than 0.`)
      }

      if (!item.unit.trim()) {
        errors.push(`Line item ${index + 1}: Unit is required.`)
      }

      if (Number(item.unitPrice) < 0 || Number.isNaN(Number(item.unitPrice))) {
        errors.push(`Line item ${index + 1}: Unit price cannot be negative.`)
      }
    })

    if (estimatedTotal <= 0) {
      errors.push('Estimated total must be greater than 0.')
    }

    return errors
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    const errors = validateForm()
    setValidationErrors(errors)

    if (errors.length > 0) {
      return
    }

    setIsSubmitting(true)

    const { data, error } = await createPurchaseRequest({
      request: {
        department: formValues.department,
        supplier_name: selectedSupplier?.supplier_name || null,
        title: formValues.title,
        justification: formValues.justification,
      },
      items: lineItems.map((item) => ({
        item_name: item.itemName,
        qty: Number(item.qty),
        unit: item.unit,
        unit_price: Number(item.unitPrice),
      })),
    })

    if (error) {
      setErrorMessage(error.message)
      setIsSubmitting(false)
      return
    }

    setSuccessMessage(
      `Request submitted successfully: ${data.id} (Estimated total: ${formatCurrency(
        estimatedTotal,
      )})`,
    )
    setFormValues(initialForm)
    setLineItems([createInitialLineItem()])
    setLineItemSearchTerms({})
    setSupplierSearchTerm('')
    setValidationErrors([])
    setIsSubmitting(false)
  }

  const handleReset = () => {
    setFormValues(initialForm)
    setLineItems([createInitialLineItem()])
    setLineItemSearchTerms({})
    setSupplierSearchTerm('')
    setValidationErrors([])
    setErrorMessage('')
    setSuccessMessage('')
  }

  const noSupplierData = !supplierLoading && suppliers.length === 0
  const noItemData = !itemLoading && items.length === 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Request"
        subtitle="Create a purchase request with one or more line items."
      />

      {masterDataError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{masterDataError}</span>
            <button
              type="button"
              onClick={loadMasterData}
              className="rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
            >
              Retry
            </button>
          </div>
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

      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      {noSupplierData ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No active suppliers found. Ask a manager/admin to add suppliers in Supplier Master.
        </div>
      ) : null}

      {noItemData ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          No active items found. You can still enter line items manually.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
        <form
          onSubmit={handleSubmit}
          className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Request Title</label>
            <input
              type="text"
              value={formValues.title}
              onChange={handleChange('title')}
              placeholder="Example: New Monitors for Design Team"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Department</label>
            <input
              type="text"
              value={formValues.department}
              onChange={handleChange('department')}
              placeholder="Operations"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Supplier Search</label>
            <input
              type="text"
              value={supplierSearchTerm}
              onChange={(event) => setSupplierSearchTerm(event.target.value)}
              placeholder="Search code or supplier name..."
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              disabled={supplierLoading || suppliers.length === 0}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Supplier</label>
            <select
              value={formValues.supplierId}
              onChange={handleChange('supplierId')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              required
              disabled={supplierLoading || suppliers.length === 0}
            >
              {supplierLoading ? <option value="">Loading suppliers...</option> : null}

              {!supplierLoading && suppliers.length === 0 ? (
                <option value="">No active suppliers available</option>
              ) : null}

              {!supplierLoading && suppliers.length > 0 ? (
                <option value="">Select supplier</option>
              ) : null}

              {!supplierLoading && suppliers.length > 0 && filteredSuppliers.length === 0 ? (
                <option value="">No suppliers match search</option>
              ) : null}

              {filteredSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.supplier_code} - {supplier.supplier_name}
                </option>
              ))}
            </select>
            {!supplierLoading && suppliers.length > 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                {filteredSuppliers.length} of {suppliers.length} supplier(s)
              </p>
            ) : null}
          </div>

          {selectedSupplier ? (
            <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600 md:col-span-2">
              <p>
                <span className="font-medium">Contact:</span> {selectedSupplier.contact_name || '-'}
              </p>
              <p>
                <span className="font-medium">Email:</span> {selectedSupplier.email || '-'}
              </p>
              <p>
                <span className="font-medium">Payment Terms:</span>{' '}
                {selectedSupplier.payment_terms || '-'}
              </p>
            </div>
          ) : null}

          <div className="md:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700">Line Items</label>
              <button
                type="button"
                onClick={addLineItem}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                + Add Item
              </button>
            </div>

            <div className="space-y-3">
              {lineItems.map((item, index) => {
                const filteredCatalogItems = getFilteredItemsForLine(index)

                return (
                  <div key={`line-item-${index}`} className="rounded-md border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Item {index + 1}
                      </p>
                      {lineItems.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          className="text-xs font-medium text-rose-600 hover:text-rose-700"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <input
                        type="text"
                        value={lineItemSearchTerms[index] || ''}
                        onChange={handleLineItemSearchChange(index)}
                        placeholder="Search SKU, item, brand, model..."
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-2"
                        disabled={itemLoading || items.length === 0}
                      />

                      <select
                        value={item.itemId}
                        onChange={handleLineItemSelection(index)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-2"
                        disabled={itemLoading || items.length === 0}
                      >
                        {itemLoading ? <option value="">Loading items...</option> : null}

                        {!itemLoading && items.length === 0 ? (
                          <option value="">No active items available</option>
                        ) : null}

                        {!itemLoading && items.length > 0 ? (
                          <option value="">Select catalog item (optional)</option>
                        ) : null}

                        {!itemLoading && items.length > 0 && filteredCatalogItems.length === 0 ? (
                          <option value="">No items match search</option>
                        ) : null}

                        {filteredCatalogItems.map((catalogItem) => (
                          <option key={catalogItem.id} value={catalogItem.id}>
                            {catalogItem.sku} - {catalogItem.item_name}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        value={item.itemName}
                        onChange={handleLineItemChange(index, 'itemName')}
                        placeholder="Item name"
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-2"
                        required
                      />

                      <input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={handleLineItemChange(index, 'qty')}
                        placeholder="Qty"
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                        required
                      />

                      <input
                        type="text"
                        value={item.unit}
                        onChange={handleLineItemChange(index, 'unit')}
                        placeholder="Unit"
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                        required
                      />

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={handleLineItemChange(index, 'unitPrice')}
                        placeholder="Unit price"
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                        required
                      />

                      <div className="flex items-center rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
                        Line Total: {formatCurrency(Number(item.qty || 0) * Number(item.unitPrice || 0))}
                      </div>
                    </div>

                    {!itemLoading && items.length > 0 ? (
                      <p className="mt-2 text-xs text-slate-500">
                        {filteredCatalogItems.length} of {items.length} catalog item(s)
                      </p>
                    ) : null}

                    {item.brand || item.model || item.color || item.specText ? (
                      <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <p>
                          <span className="font-medium">Auto-fill:</span>{' '}
                          {[item.brand, item.model, item.color].filter(Boolean).join(' / ') || '-'}
                        </p>
                        <p>
                          <span className="font-medium">Spec:</span> {item.specText || '-'}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Business Justification
            </label>
            <textarea
              rows="4"
              value={formValues.justification}
              onChange={handleChange('justification')}
              placeholder="Explain why this request is needed."
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              required
            />
          </div>

          <div className="md:col-span-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            Estimated Total: <span className="font-semibold">{formatCurrency(estimatedTotal)}</span>
          </div>

          <div className="flex gap-2 md:col-span-2">
            <button
              type="submit"
              disabled={isSubmitting || supplierLoading || itemLoading}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Master Data
            </h3>
            <ol className="mt-3 space-y-2 text-sm text-slate-600">
              <li>1. Supplier must be selected from Supplier Master</li>
              <li>2. Items can be selected from Item Master</li>
              <li>3. Selected item details auto-fill and stay editable</li>
              <li>4. Manager reviews and approves/rejects</li>
            </ol>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Validation Tips
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Ensure supplier is selected and each line item has name, qty, unit, and price.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default NewRequestPage
