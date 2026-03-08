import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '../lib/formatters'
import {
  clearPreferredSupplierForItem,
  createItemSupplierMapping,
  deleteItemSupplierMapping,
  fetchItemSupplierMappings,
  fetchSuppliers,
  updateItemSupplierMapping,
} from '../lib/masterData'

const initialMappingForm = {
  supplier_id: '',
  supplier_sku: '',
  supplier_item_name: '',
  unit_price: '',
  currency: 'USD',
  moq: '',
  lead_time_days: '',
  is_preferred: false,
  last_price_date: '',
  remarks: '',
  active: true,
}

function mapMappingToForm(mapping) {
  return {
    supplier_id: mapping.supplier_id || '',
    supplier_sku: mapping.supplier_sku || '',
    supplier_item_name: mapping.supplier_item_name || '',
    unit_price:
      mapping.unit_price === null || mapping.unit_price === undefined
        ? ''
        : String(mapping.unit_price),
    currency: mapping.currency || 'USD',
    moq: mapping.moq === null || mapping.moq === undefined ? '' : String(mapping.moq),
    lead_time_days:
      mapping.lead_time_days === null || mapping.lead_time_days === undefined
        ? ''
        : String(mapping.lead_time_days),
    is_preferred: Boolean(mapping.is_preferred),
    last_price_date: mapping.last_price_date || '',
    remarks: mapping.remarks || '',
    active: Boolean(mapping.active),
  }
}

function ItemSupplierMappingModal({ item, isOpen, onClose, onSaved }) {
  const [mappings, setMappings] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [editingMappingId, setEditingMappingId] = useState(null)
  const [formValues, setFormValues] = useState(initialMappingForm)

  const supplierOptions = useMemo(() => {
    return suppliers
      .filter((supplier) => supplier.active)
      .sort((a, b) =>
        String(a.supplier_name || '').localeCompare(String(b.supplier_name || '')),
      )
  }, [suppliers])

  const loadMappings = async () => {
    if (!item?.id) {
      return
    }

    setLoading(true)
    setErrorMessage('')

    const [mappingResult, supplierResult] = await Promise.all([
      fetchItemSupplierMappings(item.id),
      fetchSuppliers({ searchTerm: '', activeFilter: 'all' }),
    ])

    if (mappingResult.error || supplierResult.error) {
      setErrorMessage(
        mappingResult.error?.message ||
          supplierResult.error?.message ||
          'Failed to load supplier mappings.',
      )
      setMappings([])
      setSuppliers([])
      setLoading(false)
      return
    }

    setMappings(mappingResult.data || [])
    setSuppliers(supplierResult.data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setEditingMappingId(null)
    setFormValues(initialMappingForm)
    setErrorMessage('')
    setSuccessMessage('')
    loadMappings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, item?.id])

  const handleFormChange = (fieldName) => (event) => {
    const value =
      fieldName === 'is_preferred' || fieldName === 'active'
        ? event.target.checked
        : event.target.value

    setFormValues((previous) => ({
      ...previous,
      [fieldName]: value,
    }))
  }

  const handleSupplierChange = (event) => {
    const supplierId = event.target.value
    const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId)

    setFormValues((previous) => ({
      ...previous,
      supplier_id: supplierId,
      currency: selectedSupplier?.currency || previous.currency || 'USD',
    }))
  }

  const resetMappingForm = () => {
    setEditingMappingId(null)
    setFormValues(initialMappingForm)
  }

  const validateMappingForm = () => {
    if (!formValues.supplier_id) {
      return 'Supplier is required.'
    }

    if (
      formValues.unit_price &&
      (Number(formValues.unit_price) < 0 || Number.isNaN(Number(formValues.unit_price)))
    ) {
      return 'Unit price must be zero or greater.'
    }

    if (formValues.moq && (Number(formValues.moq) <= 0 || Number.isNaN(Number(formValues.moq)))) {
      return 'MOQ must be greater than zero.'
    }

    if (
      formValues.lead_time_days &&
      (Number(formValues.lead_time_days) < 0 || Number.isNaN(Number(formValues.lead_time_days)))
    ) {
      return 'Lead time days must be zero or greater.'
    }

    const duplicate = mappings.some((mapping) => {
      const sameSupplier = mapping.supplier_id === formValues.supplier_id
      const sameSupplierSku =
        String(mapping.supplier_sku || '').trim().toLowerCase() ===
        String(formValues.supplier_sku || '').trim().toLowerCase()

      if (!sameSupplier || !sameSupplierSku) {
        return false
      }

      return editingMappingId ? mapping.id !== editingMappingId : true
    })

    if (duplicate) {
      return 'This supplier + supplier SKU is already linked to the item.'
    }

    return ''
  }

  const buildMappingPayload = () => ({
    item_id: item.id,
    supplier_id: formValues.supplier_id,
    supplier_sku: formValues.supplier_sku.trim() || null,
    supplier_item_name: formValues.supplier_item_name.trim() || null,
    unit_price: formValues.unit_price === '' ? null : Number(formValues.unit_price),
    currency: formValues.currency.trim().toUpperCase() || 'USD',
    moq: formValues.moq === '' ? null : Number(formValues.moq),
    lead_time_days:
      formValues.lead_time_days === '' ? null : Math.floor(Number(formValues.lead_time_days)),
    is_preferred: Boolean(formValues.is_preferred),
    last_price_date: formValues.last_price_date || null,
    remarks: formValues.remarks.trim() || null,
    active: Boolean(formValues.active),
  })

  const handleMappingSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    const validationError = validateMappingForm()
    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    setSaving(true)

    const payload = buildMappingPayload()

    if (payload.is_preferred) {
      const { error: clearError } = await clearPreferredSupplierForItem(item.id, editingMappingId)

      if (clearError) {
        setErrorMessage(clearError.message)
        setSaving(false)
        return
      }
    }

    const operation = editingMappingId
      ? updateItemSupplierMapping(editingMappingId, payload)
      : createItemSupplierMapping(payload)

    const { error } = await operation

    if (error) {
      setErrorMessage(error.message)
      setSaving(false)
      return
    }

    setSuccessMessage(editingMappingId ? 'Mapping updated.' : 'Mapping created.')
    setSaving(false)
    resetMappingForm()
    await loadMappings()
    await onSaved()
  }

  const handleEditMapping = (mapping) => {
    setEditingMappingId(mapping.id)
    setFormValues(mapMappingToForm(mapping))
  }

  const handleDeleteMapping = async (mappingId) => {
    const confirmed = window.confirm('Delete this item-supplier mapping?')

    if (!confirmed) {
      return
    }

    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await deleteItemSupplierMapping(mappingId)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Mapping deleted.')
    await loadMappings()
    await onSaved()
  }

  if (!isOpen || !item) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Item Supplier Mapping</h3>
            <p className="text-sm text-slate-500">
              {item.sku} - {item.item_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="grid max-h-[calc(90vh-72px)] gap-5 overflow-auto p-5 lg:grid-cols-[1.5fr_1fr]">
          <section className="space-y-3">
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

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="px-3 py-2.5 font-medium">Supplier</th>
                    <th className="px-3 py-2.5 font-medium">Supplier SKU</th>
                    <th className="px-3 py-2.5 font-medium">Price</th>
                    <th className="px-3 py-2.5 font-medium">Lead Time</th>
                    <th className="px-3 py-2.5 font-medium">Preferred</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {loading ? (
                    <tr>
                      <td className="px-3 py-3 text-slate-500" colSpan={7}>
                        Loading item supplier mappings...
                      </td>
                    </tr>
                  ) : null}

                  {!loading && mappings.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-slate-500" colSpan={7}>
                        No suppliers linked to this item yet.
                      </td>
                    </tr>
                  ) : null}

                  {!loading
                    ? mappings.map((mapping) => (
                        <tr key={mapping.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-3 text-slate-700">
                            <p className="font-medium">{mapping.suppliers?.supplier_name || '-'}</p>
                            <p className="text-xs text-slate-500">
                              {mapping.suppliers?.supplier_code || '-'}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-slate-600">{mapping.supplier_sku || '-'}</td>
                          <td className="px-3 py-3 text-slate-600">
                            {mapping.unit_price !== null && mapping.unit_price !== undefined
                              ? formatCurrency(Number(mapping.unit_price), mapping.currency || 'USD')
                              : '-'}
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            {mapping.lead_time_days !== null && mapping.lead_time_days !== undefined
                              ? `${mapping.lead_time_days} days`
                              : '-'}
                          </td>
                          <td className="px-3 py-3">
                            {mapping.is_preferred ? (
                              <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                Preferred
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                mapping.active
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {mapping.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditMapping(mapping)}
                                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMapping(mapping.id)}
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
              onSubmit={handleMappingSubmit}
              className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                {editingMappingId ? 'Edit Mapping' : 'Add Mapping'}
              </h4>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Supplier
                </label>
                <select
                  value={formValues.supplier_id}
                  onChange={handleSupplierChange}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                  required
                >
                  <option value="">Select supplier</option>
                  {supplierOptions.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.supplier_code} - {supplier.supplier_name}
                    </option>
                  ))}
                </select>
              </div>

              <input
                type="text"
                placeholder="Supplier SKU"
                value={formValues.supplier_sku}
                onChange={handleFormChange('supplier_sku')}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              />

              <input
                type="text"
                placeholder="Supplier Item Name"
                value={formValues.supplier_item_name}
                onChange={handleFormChange('supplier_item_name')}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              />

              <div className="grid gap-2 md:grid-cols-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Unit Price"
                  value={formValues.unit_price}
                  onChange={handleFormChange('unit_price')}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
                <input
                  type="text"
                  placeholder="Currency"
                  value={formValues.currency}
                  onChange={handleFormChange('currency')}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm uppercase outline-none focus:border-slate-500"
                />
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="MOQ"
                  value={formValues.moq}
                  onChange={handleFormChange('moq')}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Lead Time Days"
                  value={formValues.lead_time_days}
                  onChange={handleFormChange('lead_time_days')}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Last Price Date
                </label>
                <input
                  type="date"
                  value={formValues.last_price_date}
                  onChange={handleFormChange('last_price_date')}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <textarea
                rows={2}
                placeholder="Remarks"
                value={formValues.remarks}
                onChange={handleFormChange('remarks')}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              />

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={formValues.is_preferred}
                  onChange={handleFormChange('is_preferred')}
                />
                Preferred supplier for this item
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={formValues.active} onChange={handleFormChange('active')} />
                Active mapping
              </label>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? 'Saving...' : editingMappingId ? 'Update Mapping' : 'Add Mapping'}
                </button>
                <button
                  type="button"
                  onClick={resetMappingForm}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Clear
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}

export default ItemSupplierMappingModal
