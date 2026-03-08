import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import {
  createSupplier,
  deleteSupplier,
  fetchSuppliers,
  supplierCodeExists,
  updateSupplier,
} from '../lib/masterData'

const initialSupplierForm = {
  supplier_code: '',
  supplier_name: '',
  contact_name: '',
  email: '',
  phone: '',
  payment_terms: '',
  lead_time_days: '',
  currency: 'USD',
  notes: '',
  active: true,
}

function SupplierMasterPage() {
  const [suppliers, setSuppliers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [formValues, setFormValues] = useState(initialSupplierForm)
  const [editingSupplierId, setEditingSupplierId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  const loadSuppliers = async () => {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await fetchSuppliers({ searchTerm, activeFilter })

    if (error) {
      setErrorMessage(error.message)
      setSuppliers([])
      setLoading(false)
      return
    }

    setSuppliers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadSuppliers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, activeFilter])

  const handleChange = (fieldName) => (event) => {
    const value = fieldName === 'active' ? event.target.checked : event.target.value

    setFormValues((previous) => ({
      ...previous,
      [fieldName]: value,
    }))
  }

  const validateSupplierForm = () => {
    if (!formValues.supplier_code.trim()) {
      return 'Supplier code is required.'
    }

    if (!formValues.supplier_name.trim()) {
      return 'Supplier name is required.'
    }

    if (formValues.email && !formValues.email.includes('@')) {
      return 'Supplier email format looks invalid.'
    }

    if (!formValues.currency.trim()) {
      return 'Currency is required.'
    }

    if (
      formValues.lead_time_days !== '' &&
      (Number(formValues.lead_time_days) < 0 || Number.isNaN(Number(formValues.lead_time_days)))
    ) {
      return 'Lead time days must be zero or greater.'
    }

    return ''
  }

  const resetForm = () => {
    setFormValues(initialSupplierForm)
    setEditingSupplierId(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    const validationError = validateSupplierForm()

    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    const payload = {
      supplier_code: formValues.supplier_code.trim(),
      supplier_name: formValues.supplier_name.trim(),
      contact_name: formValues.contact_name.trim() || null,
      email: formValues.email.trim() || null,
      phone: formValues.phone.trim() || null,
      payment_terms: formValues.payment_terms.trim() || null,
      lead_time_days:
        formValues.lead_time_days === '' ? null : Number(formValues.lead_time_days),
      currency: formValues.currency.trim().toUpperCase(),
      notes: formValues.notes.trim() || null,
      active: Boolean(formValues.active),
    }

    setIsSaving(true)

    const duplicateInList = suppliers.some((supplier) => {
      const sameCode =
        String(supplier.supplier_code || '').toLowerCase() === payload.supplier_code.toLowerCase()

      if (!sameCode) {
        return false
      }

      return editingSupplierId ? supplier.id !== editingSupplierId : true
    })

    if (duplicateInList) {
      setErrorMessage('Supplier code already exists. Please use a unique code.')
      setIsSaving(false)
      return
    }

    const { exists, error: duplicateCheckError } = await supplierCodeExists(
      payload.supplier_code,
      editingSupplierId,
    )

    if (duplicateCheckError) {
      setErrorMessage(`Could not verify supplier code uniqueness: ${duplicateCheckError.message}`)
      setIsSaving(false)
      return
    }

    if (exists) {
      setErrorMessage('Supplier code already exists. Please use a unique code.')
      setIsSaving(false)
      return
    }

    const operation = editingSupplierId
      ? updateSupplier(editingSupplierId, payload)
      : createSupplier(payload)

    const { error } = await operation

    if (error) {
      setErrorMessage(error.message)
      setIsSaving(false)
      return
    }

    setSuccessMessage(editingSupplierId ? 'Supplier updated.' : 'Supplier created.')
    setIsSaving(false)
    resetForm()
    await loadSuppliers()
  }

  const handleEdit = (supplier) => {
    setEditingSupplierId(supplier.id)
    setFormValues({
      supplier_code: supplier.supplier_code || '',
      supplier_name: supplier.supplier_name || '',
      contact_name: supplier.contact_name || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      payment_terms: supplier.payment_terms || '',
      lead_time_days:
        supplier.lead_time_days === null || supplier.lead_time_days === undefined
          ? ''
          : String(supplier.lead_time_days),
      currency: supplier.currency || 'USD',
      notes: supplier.notes || '',
      active: Boolean(supplier.active),
    })
  }

  const handleDelete = async (supplierId) => {
    const confirmed = window.confirm('Delete this supplier? This action cannot be undone.')

    if (!confirmed) {
      return
    }

    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await deleteSupplier(supplierId)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Supplier deleted.')
    await loadSuppliers()
  }

  const supplierCountText = useMemo(() => {
    return `${suppliers.length} supplier${suppliers.length === 1 ? '' : 's'}`
  }, [suppliers.length])

  const summary = useMemo(() => {
    const activeCount = suppliers.filter((supplier) => supplier.active).length

    return {
      total: suppliers.length,
      active: activeCount,
      inactive: suppliers.length - activeCount,
    }
  }, [suppliers])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier Master"
        subtitle="Manage approved suppliers for procurement requests."
      />

      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={loadSuppliers}
              className="rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <section className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total Suppliers</p>
              <p className="mt-1 text-xl font-semibold text-slate-800">{summary.total}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Active Suppliers</p>
              <p className="mt-1 text-xl font-semibold text-emerald-800">{summary.active}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Inactive Suppliers</p>
              <p className="mt-1 text-xl font-semibold text-slate-700">{summary.inactive}</p>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search supplier code or name..."
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-2"
            />

            <select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <p className="text-xs text-slate-500 md:col-span-3">Showing {supplierCountText}</p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-3 py-2.5 font-medium">Code</th>
                  <th className="px-3 py-2.5 font-medium">Supplier Name</th>
                  <th className="px-3 py-2.5 font-medium">Contact</th>
                  <th className="px-3 py-2.5 font-medium">Payment Terms</th>
                  <th className="px-3 py-2.5 font-medium">Lead Time</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {loading ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={7}>
                      Loading suppliers...
                    </td>
                  </tr>
                ) : null}

                {!loading && suppliers.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={7}>
                      No suppliers match the current filters.
                    </td>
                  </tr>
                ) : null}

                {!loading
                  ? suppliers.map((supplier) => (
                      <tr key={supplier.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-3 font-medium text-slate-700">
                          {supplier.supplier_code}
                        </td>
                        <td className="px-3 py-3 text-slate-700">{supplier.supplier_name}</td>
                        <td className="px-3 py-3 text-slate-600">{supplier.contact_name || '-'}</td>
                        <td className="px-3 py-3 text-slate-600">
                          {supplier.payment_terms || '-'}
                        </td>
                        <td className="px-3 py-3 text-slate-600">{supplier.lead_time_days ?? '-'}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                              supplier.active
                                ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                                : 'bg-slate-100 text-slate-700 ring-slate-500/20'
                            }`}
                          >
                            {supplier.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleEdit(supplier)}
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(supplier.id)}
                              className="rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <form
            onSubmit={handleSubmit}
            className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              {editingSupplierId ? 'Edit Supplier' : 'Create Supplier'}
            </h3>

            <input
              type="text"
              placeholder="Supplier Code"
              value={formValues.supplier_code}
              onChange={handleChange('supplier_code')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              required
            />

            <input
              type="text"
              placeholder="Supplier Name"
              value={formValues.supplier_name}
              onChange={handleChange('supplier_name')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              required
            />

            <input
              type="text"
              placeholder="Contact Name"
              value={formValues.contact_name}
              onChange={handleChange('contact_name')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <input
              type="email"
              placeholder="Email"
              value={formValues.email}
              onChange={handleChange('email')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <input
              type="text"
              placeholder="Phone"
              value={formValues.phone}
              onChange={handleChange('phone')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <input
              type="text"
              placeholder="Payment Terms (e.g. Net 30)"
              value={formValues.payment_terms}
              onChange={handleChange('payment_terms')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <input
              type="number"
              min="0"
              placeholder="Lead Time Days"
              value={formValues.lead_time_days}
              onChange={handleChange('lead_time_days')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <input
              type="text"
              placeholder="Currency (USD, THB, etc.)"
              value={formValues.currency}
              onChange={handleChange('currency')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm uppercase outline-none focus:border-slate-500"
              required
            />

            <textarea
              rows={3}
              placeholder="Notes"
              value={formValues.notes}
              onChange={handleChange('notes')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={formValues.active} onChange={handleChange('active')} />
              Active supplier
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving
                  ? 'Saving...'
                  : editingSupplierId
                    ? 'Update Supplier'
                    : 'Create Supplier'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Clear
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}

export default SupplierMasterPage
