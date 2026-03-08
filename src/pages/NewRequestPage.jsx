import { useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { formatCurrency } from '../lib/formatters'
import { createPurchaseRequest } from '../lib/procurementData'

const initialForm = {
  title: '',
  department: '',
  supplierName: '',
  justification: '',
}

const initialLineItem = {
  itemName: '',
  qty: 1,
  unit: 'pcs',
  unitPrice: '',
}

function NewRequestPage() {
  const [formValues, setFormValues] = useState(initialForm)
  const [lineItems, setLineItems] = useState([initialLineItem])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [validationErrors, setValidationErrors] = useState([])

  const estimatedTotal = useMemo(() => {
    return lineItems.reduce(
      (sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0),
      0,
    )
  }, [lineItems])

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

  const addLineItem = () => {
    setLineItems((previous) => [...previous, initialLineItem])
  }

  const removeLineItem = (indexToRemove) => {
    setLineItems((previous) => previous.filter((_, index) => index !== indexToRemove))
  }

  const validateForm = () => {
    const errors = []

    if (formValues.title.trim().length < 5) {
      errors.push('Request title must be at least 5 characters.')
    }

    if (formValues.department.trim().length < 2) {
      errors.push('Department is required.')
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

      if (Number(item.qty) <= 0) {
        errors.push(`Line item ${index + 1}: Quantity must be greater than 0.`)
      }

      if (!item.unit.trim()) {
        errors.push(`Line item ${index + 1}: Unit is required.`)
      }

      if (Number(item.unitPrice) < 0) {
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
        supplier_name: formValues.supplierName,
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
    setLineItems([initialLineItem])
    setValidationErrors([])
    setIsSubmitting(false)
  }

  const handleReset = () => {
    setFormValues(initialForm)
    setLineItems([initialLineItem])
    setValidationErrors([])
    setErrorMessage('')
    setSuccessMessage('')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Request"
        subtitle="Create a purchase request with one or more line items."
      />

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

      <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
        <form
          onSubmit={handleSubmit}
          className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Request Title
            </label>
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
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Department
            </label>
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
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Supplier Name
            </label>
            <input
              type="text"
              value={formValues.supplierName}
              onChange={handleChange('supplierName')}
              placeholder="Supplier Co., Ltd."
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
          </div>

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
              {lineItems.map((item, index) => (
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
                    <select
                      value={item.unit}
                      onChange={handleLineItemChange(index, 'unit')}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                    >
                      <option value="pcs">pcs</option>
                      <option value="box">box</option>
                      <option value="set">set</option>
                      <option value="month">month</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={handleLineItemChange(index, 'unitPrice')}
                      placeholder="Unit price"
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-2"
                      required
                    />
                    <div className="flex items-center rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 md:col-span-2">
                      Line Total: {formatCurrency(Number(item.qty || 0) * Number(item.unitPrice || 0))}
                    </div>
                  </div>
                </div>
              ))}
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
              disabled={isSubmitting}
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
              Approval Flow
            </h3>
            <ol className="mt-3 space-y-2 text-sm text-slate-600">
              <li>1. Staff/Admin submits request</li>
              <li>2. Manager reviews pending request</li>
              <li>3. Manager approves or rejects</li>
              <li>4. Status syncs back to requester</li>
            </ol>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Validation Tips
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Include clear justification and complete item details to speed up approvals.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default NewRequestPage
