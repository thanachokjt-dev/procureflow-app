import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatDate } from '../lib/formatters'
import { fetchActiveSuppliers } from '../lib/masterData'
import { createOrGetPoDraftFromPr, fetchPoDraftDetail, savePoDraft } from '../lib/po/poService'
import { fetchPrDetailWithLines } from '../lib/pr/prService'
import { PO_DEFAULT_CURRENCY } from '../lib/po/poConstants'
import { PO_STATUSES } from '../lib/workflow/constants'
import { getPoStatusLabel, getPrStatusLabel } from '../lib/workflow/statusHelpers'
import { getVarianceReasonLabel } from '../lib/workflow/varianceConstants'
import { comparePrAndPoLines } from '../lib/workflow/varianceHelpers'

function toNumber(value, fallback = 0) {
  const numericValue = Number(value)
  if (Number.isNaN(numericValue)) {
    return fallback
  }

  return numericValue
}

function toPositiveNumber(value, fallback) {
  const parsed = Number(value)
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback
  }

  return parsed
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    return null
  }

  return parsed
}

function mapPoLineToForm(line) {
  const sourcePrLineId = line.source_pr_line_id || line.pr_line_id || ''

  return {
    id: line.id || '',
    pr_line_id: sourcePrLineId,
    item_id: line.item_id || '',
    sku: line.sku || '',
    item_name: line.item_name || '',
    description: line.description || '',
    unit: line.unit || '',
    requested_qty: String(line.requested_qty ?? ''),
    ordered_qty: String(line.ordered_qty ?? line.requested_qty ?? ''),
    unit_price: String(line.unit_price ?? ''),
    currency: line.currency || PO_DEFAULT_CURRENCY,
    supplier_id: line.supplier_id || '',
    supplier_sku: line.supplier_sku || '',
    lead_time_days: String(line.lead_time_days ?? ''),
    remarks: line.remarks || '',
  }
}

function getLineTotal(line) {
  const qty = toNumber(line.ordered_qty, 0)
  const price = toNumber(line.unit_price, 0)
  return qty * price
}

function PoDraftPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { prId, poId } = useParams()
  const [poDraft, setPoDraft] = useState(null)
  const [sourcePrDetail, setSourcePrDetail] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [headerSupplierId, setHeaderSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [priceThresholdPercent, setPriceThresholdPercent] = useState(5)
  const [leadTimeThresholdDays, setLeadTimeThresholdDays] = useState(2)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const queueFlashMessage = String(location.state?.flashMessage || '')

  const supplierById = useMemo(() => {
    return suppliers.reduce((accumulator, supplier) => {
      accumulator[supplier.id] = supplier
      return accumulator
    }, {})
  }, [suppliers])

  const estimatedTotal = useMemo(() => {
    return lineItems.reduce((sum, line) => sum + getLineTotal(line), 0)
  }, [lineItems])

  const sourcePrSummary = useMemo(() => {
    if (!poDraft && !sourcePrDetail) {
      return null
    }

    return {
      sourcePrId: poDraft?.source_pr_id || sourcePrDetail?.id || '-',
      requesterName: sourcePrDetail?.requester_name || poDraft?.requester_name || '-',
      department: sourcePrDetail?.department || poDraft?.department || '-',
      purpose: sourcePrDetail?.purpose || poDraft?.purpose || '-',
      neededByDate: sourcePrDetail?.needed_by_date || poDraft?.needed_by_date || '-',
      prStatus: sourcePrDetail?.status || '-',
      poStatus: poDraft?.status || PO_STATUSES.DRAFT,
    }
  }, [poDraft, sourcePrDetail])

  const varianceConfig = useMemo(
    () => ({
      priceIncreaseThresholdPercent: toPositiveNumber(priceThresholdPercent, 5),
      leadTimeThresholdDays: toPositiveNumber(leadTimeThresholdDays, 2),
    }),
    [leadTimeThresholdDays, priceThresholdPercent],
  )

  const varianceResult = useMemo(() => {
    const sourcePrLines = sourcePrDetail?.pr_lines || []
    if (!sourcePrLines.length || !lineItems.length) {
      return {
        hasVariance: false,
        reasons: [],
        lineResults: [],
        summary: {
          totalPrLines: sourcePrLines.length,
          totalPoLines: lineItems.length,
          matchedLines: 0,
          removedLines: 0,
          changedQuantityCount: 0,
          changedItemCount: 0,
          changedSpecCount: 0,
          changedSupplierCount: 0,
          leadTimeExceededCount: 0,
          unitPriceExceededCount: 0,
          varianceLineCount: 0,
        },
        config: varianceConfig,
      }
    }

    const poLinesForComparison = lineItems.map((line) => ({
      id: line.id || null,
      pr_line_id: line.pr_line_id || null,
      item_id: line.item_id || null,
      item_name: line.item_name || null,
      description: line.description || null,
      supplier_id: line.supplier_id || null,
      ordered_qty: toNumber(line.ordered_qty, 0),
      requested_qty: toNumber(line.requested_qty, 0),
      unit_price: toNumber(line.unit_price, 0),
      lead_time_days: toNullableNumber(line.lead_time_days),
    }))

    return comparePrAndPoLines({
      prLines: sourcePrLines,
      poDraftLines: poLinesForComparison,
      config: varianceConfig,
    })
  }, [lineItems, sourcePrDetail, varianceConfig])

  const nextStatus = varianceResult.hasVariance
    ? PO_STATUSES.PENDING_VARIANCE_CONFIRMATION
    : PO_STATUSES.PENDING_FINAL_APPROVAL

  const handleLineFieldChange = (lineId, fieldName, value) => {
    setLineItems((previous) =>
      previous.map((line) => (line.id === lineId ? { ...line, [fieldName]: value } : line)),
    )
  }

  const loadPoDraftContext = async () => {
    const hasPrRoute = Boolean(prId)
    const hasPoRoute = Boolean(poId)

    if (!hasPrRoute && !hasPoRoute) {
      setErrorMessage('PR/PO identifier is missing.')
      setLoading(false)
      return
    }

    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    let poResult = { data: null, error: null, created: false }
    let supplierResult = { data: [], error: null }
    let sourcePrResult = { data: null, error: null }

    if (hasPoRoute) {
      const [poDetailResult, supplierFetchResult] = await Promise.all([
        fetchPoDraftDetail(poId),
        fetchActiveSuppliers(),
      ])

      poResult = {
        data: poDetailResult.data,
        error: poDetailResult.error,
        created: false,
      }
      supplierResult = supplierFetchResult

      const sourcePrId = poDetailResult.data?.source_pr_id
      if (sourcePrId) {
        sourcePrResult = await fetchPrDetailWithLines(sourcePrId)
      }
    } else {
      const [createOrGetResult, supplierFetchResult, sourcePrFetchResult] = await Promise.all([
        createOrGetPoDraftFromPr(prId),
        fetchActiveSuppliers(),
        fetchPrDetailWithLines(prId),
      ])

      poResult = createOrGetResult
      supplierResult = supplierFetchResult
      sourcePrResult = sourcePrFetchResult
    }

    if (poResult.error) {
      setErrorMessage(poResult.error.message || 'Failed to load PO draft.')
      setPoDraft(null)
      setSourcePrDetail(null)
      setLineItems([])
      setSuppliers([])
      setLoading(false)
      return
    }

    if (supplierResult.error) {
      setErrorMessage(
        supplierResult.error.message ||
          'PO draft loaded, but Supplier Master data failed to load.',
      )
    }

    if (sourcePrResult.error) {
      setErrorMessage(
        sourcePrResult.error.message || 'PO draft loaded, but source PR details failed to load.',
      )
    }

    const draft = poResult.data
    setPoDraft(draft || null)
    setSourcePrDetail(sourcePrResult.data || null)
    setSuppliers(supplierResult.data || [])
    setHeaderSupplierId(draft?.supplier_id || '')
    setNotes(draft?.notes || '')
    setLineItems((draft?.po_lines || []).map(mapPoLineToForm))
    setPriceThresholdPercent(
      draft?.variance_summary?.config?.priceIncreaseThresholdPercent ?? 5,
    )
    setLeadTimeThresholdDays(draft?.variance_summary?.config?.leadTimeThresholdDays ?? 2)
    setLoading(false)

    if (poResult.created) {
      setSuccessMessage(`PO draft created: ${draft?.po_number || '-'}`)
    } else {
      setSuccessMessage(`Continuing PO draft: ${draft?.po_number || '-'}`)
    }
  }

  useEffect(() => {
    let isMounted = true

    const loadInEffect = async () => {
      if (!isMounted) {
        return
      }

      await loadPoDraftContext()
    }

    loadInEffect()

    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId, prId])

  const handleSaveDraft = async () => {
    if (!poDraft?.id) {
      setErrorMessage('PO draft is not ready yet.')
      return
    }

    if (!sourcePrDetail?.id || !(sourcePrDetail.pr_lines || []).length) {
      setErrorMessage('Source PR lines are missing. Reload and try again.')
      return
    }

    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')

    const varianceMetadata = {
      source_pr_id: sourcePrDetail.id,
      has_variance: varianceResult.hasVariance,
      reasons: varianceResult.reasons,
      summary: varianceResult.summary,
      config: varianceResult.config,
      line_results: varianceResult.lineResults.map((result) => ({
        pr_line_id: result.prLine?.id || null,
        po_line_id: result.poLine?.id || null,
        reasons: result.reasons || [],
        has_variance: Boolean(result.hasVariance),
        is_removed: Boolean(result.isRemoved),
      })),
    }

    const headerSupplier = supplierById[headerSupplierId]
    const varianceSubmittedAt = new Date().toISOString()
    const headerPayload = {
      supplier_id: headerSupplierId || null,
      supplier_name_snapshot: headerSupplier?.supplier_name || poDraft.supplier_name_snapshot || null,
      notes,
      status: nextStatus,
      variance_reasons: varianceResult.reasons,
      variance_summary: varianceMetadata,
      variance_checked_at: varianceSubmittedAt,
      variance_checked_by: user?.id || null,
      variance_checked_notes: varianceResult.hasVariance
        ? 'Variance detected during PO draft save.'
        : 'No material variance detected during PO draft save.',
      variance_status: varianceResult.hasVariance ? 'variance_detected' : 'no_variance',
      variance_submitted_at: varianceSubmittedAt,
      variance_submitted_by: user?.id || null,
      variance_approved_at: null,
      variance_approved_by: null,
      variance_approval_notes: null,
    }

    const linePayload = lineItems.map((line) => ({
      id: line.id || null,
      pr_line_id: line.pr_line_id || null,
      item_id: line.item_id || null,
      sku: line.sku || null,
      item_name: line.item_name,
      description: line.description || null,
      unit: line.unit,
      requested_qty: toNumber(line.requested_qty, 0),
      ordered_qty: toNumber(line.ordered_qty, 0),
      unit_price: toNumber(line.unit_price, 0),
      currency: line.currency || null,
      supplier_id: line.supplier_id || null,
      supplier_sku: line.supplier_sku || null,
      lead_time_days: line.lead_time_days === '' ? null : toNumber(line.lead_time_days, 0),
      remarks: line.remarks || null,
    }))

    const { data, error } = await savePoDraft(poDraft.id, {
      headerUpdates: headerPayload,
      lines: linePayload,
    })

    if (error || !data?.id) {
      setErrorMessage(error?.message || 'Failed to save PO draft.')
      setSaving(false)
      return
    }

    setPoDraft(data)
    setLineItems((data.po_lines || []).map(mapPoLineToForm))
    setHeaderSupplierId(data.supplier_id || '')
    setNotes(data.notes || '')
    setSuccessMessage(
      varianceResult.hasVariance
        ? `PO draft saved with variance. Status moved to ${getPoStatusLabel(nextStatus)}.`
        : `PO draft saved. Status moved to ${getPoStatusLabel(nextStatus)}.`,
    )
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="PO Draft"
        subtitle="Convert approved PR lines into a working PO draft with editable sourcing details."
      />

      {queueFlashMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {queueFlashMessage}
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

      {loading ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Loading PO draft...
        </div>
      ) : null}

      {!loading && poDraft ? (
        <>
          <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">PO Number</p>
              <p className="mt-1 font-semibold text-slate-900">{poDraft.po_number || '-'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Source PR</p>
              <p className="mt-1 text-sm text-slate-700">{sourcePrSummary?.sourcePrId || '-'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Requester</p>
              <p className="mt-1 text-sm text-slate-700">{sourcePrSummary?.requesterName || '-'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Department</p>
              <p className="mt-1 text-sm text-slate-700">{sourcePrSummary?.department || '-'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Needed By Date</p>
              <p className="mt-1 text-sm text-slate-700">
                {sourcePrSummary?.neededByDate ? formatDate(sourcePrSummary.neededByDate) : '-'}
              </p>
            </div>
            <div className="md:col-span-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Purpose / Title</p>
              <p className="mt-1 text-sm text-slate-700">{sourcePrSummary?.purpose || '-'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
              <div className="mt-1">
                <StatusBadge
                  status={sourcePrSummary?.prStatus}
                  text={getPrStatusLabel(sourcePrSummary?.prStatus)}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">PO Header</h3>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Header Supplier (Optional)
                </label>
                <select
                  value={headerSupplierId}
                  onChange={(event) => setHeaderSupplierId(event.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  <option value="">Per-line supplier sourcing</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.supplier_code} - {supplier.supplier_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Current PO Status
                </label>
                <input
                  value={getPoStatusLabel(poDraft.status)}
                  readOnly
                  className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Next Status On Save
                </label>
                <input
                  value={getPoStatusLabel(nextStatus)}
                  readOnly
                  className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Price Increase Threshold (%)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={priceThresholdPercent}
                  onChange={(event) => setPriceThresholdPercent(event.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Lead Time Threshold (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={leadTimeThresholdDays}
                  onChange={(event) => setLeadTimeThresholdDays(event.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Internal procurement notes..."
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>
            </div>
          </section>

          <section
            className={`space-y-3 rounded-lg border p-4 ${
              varianceResult.hasVariance
                ? 'border-amber-200 bg-amber-50'
                : 'border-emerald-200 bg-emerald-50'
            }`}
          >
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Variance Check
            </h3>
            <p className="text-sm text-slate-700">
              {varianceResult.hasVariance
                ? 'Material variance detected. This draft will move to Pending Variance Confirmation.'
                : 'No material variance detected. This draft can move to Pending Final Approval.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {varianceResult.reasons.length === 0 ? (
                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                  No Variance Reasons
                </span>
              ) : (
                varianceResult.reasons.map((reason) => (
                  <span
                    key={reason}
                    className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700"
                  >
                    {getVarianceReasonLabel(reason)}
                  </span>
                ))
              )}
            </div>
            <p className="text-xs text-slate-600">
              Variance Lines: {varianceResult.summary.varianceLineCount} /{' '}
              {varianceResult.summary.totalPrLines}
            </p>
            {varianceResult.lineResults.filter((line) => line.hasVariance).length > 0 ? (
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="px-3 py-2 font-medium">PR Line</th>
                      <th className="px-3 py-2 font-medium">PO Line</th>
                      <th className="px-3 py-2 font-medium">Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {varianceResult.lineResults
                      .filter((line) => line.hasVariance)
                      .map((line) => (
                        <tr key={`${line.prLineKey || 'na'}-${line.poLineKey || 'na'}`} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 text-slate-700">
                            {line.prLine?.item_name || line.prLineKey || '-'}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {line.poLine?.item_name || line.poLineKey || '-'}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {line.reasons.map((reason) => getVarianceReasonLabel(reason)).join(', ')}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">PO Lines</h3>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-[1320px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="px-3 py-2.5 font-medium">Item</th>
                    <th className="px-3 py-2.5 font-medium">Unit</th>
                    <th className="px-3 py-2.5 font-medium">Requested Qty</th>
                    <th className="px-3 py-2.5 font-medium">Ordered Qty</th>
                    <th className="px-3 py-2.5 font-medium">Unit Price</th>
                    <th className="px-3 py-2.5 font-medium">Currency</th>
                    <th className="px-3 py-2.5 font-medium">Supplier</th>
                    <th className="px-3 py-2.5 font-medium">Supplier SKU</th>
                    <th className="px-3 py-2.5 font-medium">Lead Time Days</th>
                    <th className="px-3 py-2.5 font-medium">Line Total</th>
                    <th className="px-3 py-2.5 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {lineItems.map((line) => (
                    <tr key={line.id} className="border-b border-slate-100 align-top last:border-0">
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-800">{line.item_name || '-'}</p>
                        <p className="text-xs text-slate-500">{line.sku || '-'}</p>
                        {line.description ? (
                          <p className="mt-1 text-xs text-slate-500">{line.description}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{line.unit || '-'}</td>
                      <td className="px-3 py-3 text-slate-700">{line.requested_qty || '-'}</td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.ordered_qty}
                          onChange={(event) =>
                            handleLineFieldChange(line.id, 'ordered_qty', event.target.value)
                          }
                          className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_price}
                          onChange={(event) =>
                            handleLineFieldChange(line.id, 'unit_price', event.target.value)
                          }
                          className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={line.currency}
                          readOnly
                          className="w-24 rounded-md border border-slate-300 bg-slate-100 px-2 py-1.5 text-sm uppercase text-slate-600"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={line.supplier_id}
                          onChange={(event) =>
                            handleLineFieldChange(line.id, 'supplier_id', event.target.value)
                          }
                          className="w-48 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                        >
                          <option value="">No supplier selected</option>
                          {suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.supplier_code} - {supplier.supplier_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={line.supplier_sku}
                          onChange={(event) =>
                            handleLineFieldChange(line.id, 'supplier_sku', event.target.value)
                          }
                          className="w-36 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                          placeholder="Supplier SKU"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={line.lead_time_days}
                          onChange={(event) =>
                            handleLineFieldChange(line.id, 'lead_time_days', event.target.value)
                          }
                          className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                          placeholder="-"
                        />
                      </td>
                      <td className="px-3 py-3 text-slate-800">{formatCurrency(getLineTotal(line))}</td>
                      <td className="px-3 py-3">
                        <input
                          value={line.remarks}
                          onChange={(event) =>
                            handleLineFieldChange(line.id, 'remarks', event.target.value)
                          }
                          className="w-44 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500"
                          placeholder="Remarks"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-600">
              Total Estimated PO Value:{' '}
              <span className="font-semibold text-slate-900">{formatCurrency(estimatedTotal)}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/procurement-queue')}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Back to Queue
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? 'Saving & Checking Variance...' : 'Save Draft & Check Variance'}
              </button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}

export default PoDraftPage
