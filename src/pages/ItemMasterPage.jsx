import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { downloadCsvTemplate } from '../lib/csvImport'
import {
  createItem,
  deleteItem,
  fetchItems,
  skuExists,
  updateItem,
} from '../lib/masterData'
import {
  createItemImportPreview,
  downloadItemImportErrorsCsv,
  ITEM_IMPORT_MODES,
  ITEM_IMPORT_OPTIONAL_COLUMNS,
  ITEM_IMPORT_REQUIRED_COLUMNS,
  ITEM_IMPORT_TEMPLATE_COLUMNS,
  runItemImport,
} from '../lib/itemCsvImport'
import { hasRoleAccess, ROLES } from '../lib/roles'

const initialItemForm = {
  sku: '',
  item_name: '',
  category: '',
  brand: '',
  model: '',
  color: '',
  size: '',
  unit: 'pcs',
  description: '',
  spec_text: '',
  image_url: '',
  active: true,
}

const importModeOptions = [
  {
    value: ITEM_IMPORT_MODES.CREATE_ONLY,
    label: 'Create only',
    description: 'Skip rows where SKU already exists.',
  },
  {
    value: ITEM_IMPORT_MODES.UPDATE_ONLY,
    label: 'Update only',
    description: 'Update rows only when SKU already exists.',
  },
  {
    value: ITEM_IMPORT_MODES.UPSERT,
    label: 'Upsert',
    description: 'Create new SKUs and update existing SKUs.',
  },
]

function ItemMasterPage() {
  const { role } = useAuth()
  const canImport = hasRoleAccess(role, [ROLES.MANAGER, ROLES.ADMIN])

  const [items, setItems] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [activeFilter, setActiveFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [formValues, setFormValues] = useState(initialItemForm)
  const [editingItemId, setEditingItemId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [importMode, setImportMode] = useState(ITEM_IMPORT_MODES.UPSERT)
  const [importPreview, setImportPreview] = useState(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importSummary, setImportSummary] = useState(null)

  const loadItems = async () => {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await fetchItems({ searchTerm, categoryFilter, activeFilter })

    if (error) {
      setErrorMessage(error.message)
      setItems([])
      setLoading(false)
      return
    }

    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, categoryFilter, activeFilter])

  const categoryOptions = useMemo(() => {
    const categories = items.map((item) => item.category).filter((category) => Boolean(category))
    return Array.from(new Set(categories))
  }, [items])

  const summary = useMemo(() => {
    const activeCount = items.filter((item) => item.active).length

    return {
      total: items.length,
      active: activeCount,
      inactive: items.length - activeCount,
      categories: categoryOptions.length,
    }
  }, [items, categoryOptions.length])

  const handleChange = (fieldName) => (event) => {
    const value = fieldName === 'active' ? event.target.checked : event.target.value

    setFormValues((previous) => ({
      ...previous,
      [fieldName]: value,
    }))
  }

  const validateItemForm = () => {
    if (!formValues.sku.trim()) {
      return 'SKU is required.'
    }

    if (!formValues.item_name.trim()) {
      return 'Item name is required.'
    }

    if (!formValues.unit.trim()) {
      return 'Unit is required.'
    }

    return ''
  }

  const resetForm = () => {
    setFormValues(initialItemForm)
    setEditingItemId(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    const validationError = validateItemForm()

    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    const payload = {
      sku: formValues.sku.trim(),
      item_name: formValues.item_name.trim(),
      category: formValues.category.trim() || null,
      brand: formValues.brand.trim() || null,
      model: formValues.model.trim() || null,
      color: formValues.color.trim() || null,
      size: formValues.size.trim() || null,
      unit: formValues.unit.trim(),
      description: formValues.description.trim() || null,
      spec_text: formValues.spec_text.trim() || null,
      image_url: formValues.image_url.trim() || null,
      active: Boolean(formValues.active),
    }

    setIsSaving(true)

    const duplicateInList = items.some((item) => {
      const sameSku = String(item.sku || '').toLowerCase() === payload.sku.toLowerCase()

      if (!sameSku) {
        return false
      }

      return editingItemId ? item.id !== editingItemId : true
    })

    if (duplicateInList) {
      setErrorMessage('SKU already exists. Please use a unique SKU.')
      setIsSaving(false)
      return
    }

    const { exists, error: duplicateCheckError } = await skuExists(payload.sku, editingItemId)

    if (duplicateCheckError) {
      setErrorMessage(`Could not verify SKU uniqueness: ${duplicateCheckError.message}`)
      setIsSaving(false)
      return
    }

    if (exists) {
      setErrorMessage('SKU already exists. Please use a unique SKU.')
      setIsSaving(false)
      return
    }

    const operation = editingItemId ? updateItem(editingItemId, payload) : createItem(payload)

    const { error } = await operation

    if (error) {
      setErrorMessage(error.message)
      setIsSaving(false)
      return
    }

    setSuccessMessage(editingItemId ? 'Item updated.' : 'Item created.')
    setIsSaving(false)
    resetForm()
    await loadItems()
  }

  const handleCsvTemplateDownload = () => {
    downloadCsvTemplate('item_import_template.csv', ITEM_IMPORT_TEMPLATE_COLUMNS, [
      {
        sku: 'ITM-001',
        item_name: '24-inch Monitor',
        category: 'Electronics',
        brand: 'Dell',
        model: 'P2422H',
        color: 'Black',
        size: '24 inch',
        unit: 'pcs',
        description: 'Office monitor',
        spec_text: 'IPS, 1080p, HDMI',
        image_url: 'https://example.com/monitor.jpg',
        active: 'true',
      },
    ])
  }

  const handleCsvFileChange = async (event) => {
    const selectedFile = event.target.files?.[0]
    event.target.value = ''

    if (!selectedFile) {
      return
    }

    setErrorMessage('')
    setSuccessMessage('')
    setImportSummary(null)

    const { preview, error } = await createItemImportPreview(selectedFile)

    if (error) {
      setImportPreview(null)
      setErrorMessage(error)
      return
    }

    setImportPreview(preview)
  }

  const handleImportItems = async () => {
    if (!importPreview) {
      setErrorMessage('Upload and preview a CSV file first.')
      return
    }

    setIsImporting(true)
    setErrorMessage('')
    setSuccessMessage('')

    const { summary: resultSummary, error } = await runItemImport({
      preview: importPreview,
      mode: importMode,
    })

    if (error) {
      setErrorMessage(`Item import failed: ${error}`)
      setIsImporting(false)
      return
    }

    setImportSummary(resultSummary)
    setSuccessMessage('Item import finished. Review the summary below.')
    setIsImporting(false)
    await loadItems()
  }

  const handleDownloadFailedRowsCsv = () => {
    if (!importSummary?.failedRows?.length) {
      return
    }

    downloadItemImportErrorsCsv('item_import_failed_rows.csv', importSummary.failedRows)
  }

  const handleEdit = (item) => {
    setEditingItemId(item.id)
    setFormValues({
      sku: item.sku || '',
      item_name: item.item_name || '',
      category: item.category || '',
      brand: item.brand || '',
      model: item.model || '',
      color: item.color || '',
      size: item.size || '',
      unit: item.unit || 'pcs',
      description: item.description || '',
      spec_text: item.spec_text || '',
      image_url: item.image_url || '',
      active: Boolean(item.active),
    })
  }

  const handleDelete = async (itemId) => {
    const confirmed = window.confirm('Delete this item? This action cannot be undone.')

    if (!confirmed) {
      return
    }

    setErrorMessage('')
    setSuccessMessage('')

    const { error } = await deleteItem(itemId)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Item deleted.')
    await loadItems()
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Item Master" subtitle="Manage approved catalog items." />

      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={loadItems}
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
          {canImport ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                    CSV Import
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Required: {ITEM_IMPORT_REQUIRED_COLUMNS.join(', ')}
                  </p>
                  <p className="text-xs text-slate-500">
                    Optional: {ITEM_IMPORT_OPTIONAL_COLUMNS.join(', ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCsvTemplateDownload}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Download Template
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Import Mode
                  </label>
                  <select
                    value={importMode}
                    onChange={(event) => setImportMode(event.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                  >
                    {importModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    {importModeOptions.find((option) => option.value === importMode)?.description}
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Upload CSV
                  </label>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleCsvFileChange}
                    className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-100"
                  />
                </div>
              </div>

              {importPreview ? (
                <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-600">
                      <span className="font-medium">File:</span> {importPreview.fileName}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setImportPreview(null)
                        setImportSummary(null)
                      }}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-3">
                    <p>Total rows detected: {importPreview.totalRows}</p>
                    <p className="text-emerald-700">Valid rows: {importPreview.validRows.length}</p>
                    <p className="text-rose-700">Invalid rows: {importPreview.invalidRows.length}</p>
                  </div>

                  <button
                    type="button"
                    onClick={handleImportItems}
                    disabled={isImporting || importPreview.validRows.length === 0}
                    className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isImporting
                      ? 'Importing...'
                      : `Run Import (${importModeOptions.find((option) => option.value === importMode)?.label})`}
                  </button>

                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="min-w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="px-2 py-2 font-medium">Row</th>
                          <th className="px-2 py-2 font-medium">SKU</th>
                          <th className="px-2 py-2 font-medium">Item Name</th>
                          <th className="px-2 py-2 font-medium">Unit</th>
                          <th className="px-2 py-2 font-medium">Status</th>
                          <th className="px-2 py-2 font-medium">Errors</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.rows.slice(0, 20).map((row) => {
                          const isValid = row.errors.length === 0

                          return (
                            <tr key={`preview-row-${row.rowNumber}`} className="border-b border-slate-100 last:border-0">
                              <td className="px-2 py-2">{row.rowNumber}</td>
                              <td className="px-2 py-2">{row.rowValues.sku || '-'}</td>
                              <td className="px-2 py-2">{row.rowValues.item_name || '-'}</td>
                              <td className="px-2 py-2">{row.rowValues.unit || '-'}</td>
                              <td className="px-2 py-2">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    isValid
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-rose-50 text-rose-700'
                                  }`}
                                >
                                  {isValid ? 'Valid' : 'Invalid'}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-rose-700">
                                {isValid ? '-' : row.errors.join(' ')}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {importPreview.rows.length > 20 ? (
                    <p className="text-xs text-slate-500">Showing first 20 rows in preview.</p>
                  ) : null}
                </div>
              ) : null}

              {importSummary ? (
                <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Import Result Summary
                  </h4>
                  <div className="grid gap-2 text-xs text-slate-700 md:grid-cols-5">
                    <p>Total: {importSummary.totalRows}</p>
                    <p className="text-emerald-700">Created: {importSummary.created}</p>
                    <p className="text-sky-700">Updated: {importSummary.updated}</p>
                    <p className="text-amber-700">Skipped: {importSummary.skipped}</p>
                    <p className="text-rose-700">Failed: {importSummary.failed}</p>
                  </div>

                  {importSummary.failed > 0 ? (
                    <button
                      type="button"
                      onClick={handleDownloadFailedRowsCsv}
                      className="rounded-md border border-rose-300 bg-white px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50"
                    >
                      Download Failed Rows CSV
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total Items</p>
              <p className="mt-1 text-xl font-semibold text-slate-800">{summary.total}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Active Items</p>
              <p className="mt-1 text-xl font-semibold text-emerald-800">{summary.active}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Inactive Items</p>
              <p className="mt-1 text-xl font-semibold text-slate-700">{summary.inactive}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Categories</p>
              <p className="mt-1 text-xl font-semibold text-slate-700">{summary.categories}</p>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search SKU, item, brand, model..."
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-2"
            />

            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            >
              <option value="all">All Categories</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-3 py-2.5 font-medium">Image</th>
                  <th className="px-3 py-2.5 font-medium">SKU</th>
                  <th className="px-3 py-2.5 font-medium">Item Name</th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 font-medium">Brand / Model</th>
                  <th className="px-3 py-2.5 font-medium">Unit</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {loading ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={8}>
                      Loading items...
                    </td>
                  </tr>
                ) : null}

                {!loading && items.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={8}>
                      No items match the current filters.
                    </td>
                  </tr>
                ) : null}

                {!loading
                  ? items.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-3">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.item_name || item.sku}
                              className="h-10 w-10 rounded-md border border-slate-200 object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-700">{item.sku}</td>
                        <td className="px-3 py-3 text-slate-700">{item.item_name}</td>
                        <td className="px-3 py-3 text-slate-600">{item.category || '-'}</td>
                        <td className="px-3 py-3 text-slate-600">
                          {[item.brand, item.model].filter(Boolean).join(' / ') || '-'}
                        </td>
                        <td className="px-3 py-3 text-slate-600">{item.unit || '-'}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                              item.active
                                ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                                : 'bg-slate-100 text-slate-700 ring-slate-500/20'
                            }`}
                          >
                            {item.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleEdit(item)}
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
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
              {editingItemId ? 'Edit Item' : 'Create Item'}
            </h3>

            <input
              type="text"
              placeholder="SKU"
              value={formValues.sku}
              onChange={handleChange('sku')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              required
            />

            <input
              type="text"
              placeholder="Item Name"
              value={formValues.item_name}
              onChange={handleChange('item_name')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              required
            />

            <input
              type="text"
              placeholder="Category"
              value={formValues.category}
              onChange={handleChange('category')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <input
              type="text"
              placeholder="Brand"
              value={formValues.brand}
              onChange={handleChange('brand')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <input
              type="text"
              placeholder="Model"
              value={formValues.model}
              onChange={handleChange('model')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <div className="grid gap-2 md:grid-cols-2">
              <input
                type="text"
                placeholder="Color"
                value={formValues.color}
                onChange={handleChange('color')}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
              <input
                type="text"
                placeholder="Size"
                value={formValues.size}
                onChange={handleChange('size')}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <input
              type="text"
              placeholder="Unit (pcs, box, set...)"
              value={formValues.unit}
              onChange={handleChange('unit')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              required
            />

            <textarea
              rows={2}
              placeholder="Description"
              value={formValues.description}
              onChange={handleChange('description')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <textarea
              rows={2}
              placeholder="Spec Text"
              value={formValues.spec_text}
              onChange={handleChange('spec_text')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <input
              type="url"
              placeholder="Image URL"
              value={formValues.image_url}
              onChange={handleChange('image_url')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={formValues.active} onChange={handleChange('active')} />
              Active item
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? 'Saving...' : editingItemId ? 'Update Item' : 'Create Item'}
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

export default ItemMasterPage
