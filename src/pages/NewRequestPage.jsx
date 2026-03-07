import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import { createPurchaseRequest } from '../lib/procurementData'

const initialForm = {
  title: '',
  department: '',
  supplierName: '',
  itemName: '',
  qty: 1,
  unit: 'pcs',
  unitPrice: '',
  justification: '',
}

function NewRequestPage() {
  const [formValues, setFormValues] = useState(initialForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const handleChange = (fieldName) => (event) => {
    setFormValues((previous) => ({
      ...previous,
      [fieldName]: event.target.value,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    setIsSubmitting(true)

    const { data, error } = await createPurchaseRequest({
      request: {
        department: formValues.department,
        supplier_name: formValues.supplierName,
        title: formValues.title,
        justification: formValues.justification,
      },
      items: [
        {
          item_name: formValues.itemName || formValues.title,
          qty: Number(formValues.qty),
          unit: formValues.unit,
          unit_price: Number(formValues.unitPrice),
        },
      ],
    })

    if (error) {
      setErrorMessage(error.message)
      setIsSubmitting(false)
      return
    }

    setSuccessMessage(`Request submitted successfully: ${data.id}`)
    setFormValues(initialForm)
    setIsSubmitting(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Request"
        subtitle="Create a purchase request. Staff and admin only."
      />

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

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Item Name
            </label>
            <input
              type="text"
              value={formValues.itemName}
              onChange={handleChange('itemName')}
              placeholder="24-inch Monitor"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Unit
            </label>
            <select
              value={formValues.unit}
              onChange={handleChange('unit')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            >
              <option value="pcs">pcs</option>
              <option value="box">box</option>
              <option value="set">set</option>
              <option value="month">month</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Quantity
            </label>
            <input
              type="number"
              min="1"
              value={formValues.qty}
              onChange={handleChange('qty')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Unit Price (USD)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formValues.unitPrice}
              onChange={handleChange('unitPrice')}
              placeholder="0.00"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              required
            />
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
              onClick={() => setFormValues(initialForm)}
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
              <li>4. Admin can manage all records</li>
            </ol>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Guidance
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Use clear titles and item details to speed up manager review.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default NewRequestPage
