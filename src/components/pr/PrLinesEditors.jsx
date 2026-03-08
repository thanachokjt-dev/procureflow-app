import { formatCurrency } from '../../lib/formatters'

function InputField({ className = '', ...props }) {
  return (
    <input
      className={`w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-slate-500 ${className}`}
      {...props}
    />
  )
}

function TextareaField({ className = '', ...props }) {
  return (
    <textarea
      className={`w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-slate-500 ${className}`}
      {...props}
    />
  )
}

function SelectField({ className = '', children, ...props }) {
  return (
    <select
      className={`w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-slate-500 ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

export function PrLinesTableEditor({
  lineItems,
  itemsLoading,
  catalogItems,
  getFilteredItemsForLine,
  onFieldChange,
  onSelectCatalogItem,
  onRemoveLine,
  getLineEstimatedTotal,
}) {
  return (
    <div className="hidden lg:block">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-[1560px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium">
                Search
              </th>
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium">
                Item Master
              </th>
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium">
                SKU
              </th>
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium">
                Item Name
              </th>
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium">
                Description
              </th>
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium">
                Unit
              </th>
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium">
                Qty
              </th>
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium">
                Est. Unit Price
              </th>
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium">
                Line Total
              </th>
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium">
                Remarks
              </th>
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2.5 font-medium">
                Remove
              </th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {lineItems.map((line, index) => {
              const filteredItems = getFilteredItemsForLine(line)

              return (
                <tr key={line.local_id} className="border-b border-slate-100 align-top last:border-b-0">
                  <td className="px-2 py-2">
                    <InputField
                      value={line.itemSearch}
                      onChange={(event) =>
                        onFieldChange(line.local_id, 'itemSearch', event.target.value)
                      }
                      placeholder="SKU / name / brand"
                      disabled={itemsLoading || catalogItems.length === 0}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <SelectField
                      value={line.item_id}
                      onChange={(event) => onSelectCatalogItem(line.local_id, event.target.value)}
                      disabled={itemsLoading || catalogItems.length === 0}
                    >
                      {itemsLoading ? <option value="">Loading items...</option> : null}
                      {!itemsLoading && catalogItems.length === 0 ? (
                        <option value="">No active items found</option>
                      ) : null}
                      {!itemsLoading && catalogItems.length > 0 ? (
                        <option value="">Optional selection</option>
                      ) : null}
                      {filteredItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.sku} - {item.item_name}
                        </option>
                      ))}
                    </SelectField>
                  </td>
                  <td className="px-2 py-2">
                    <InputField
                      value={line.sku}
                      onChange={(event) => onFieldChange(line.local_id, 'sku', event.target.value)}
                      placeholder="SKU"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <InputField
                      value={line.item_name}
                      onChange={(event) =>
                        onFieldChange(line.local_id, 'item_name', event.target.value)
                      }
                      placeholder="Item name"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <TextareaField
                      rows={2}
                      value={line.description}
                      onChange={(event) =>
                        onFieldChange(line.local_id, 'description', event.target.value)
                      }
                      placeholder="Description"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <InputField
                      value={line.unit}
                      onChange={(event) => onFieldChange(line.local_id, 'unit', event.target.value)}
                      placeholder="pcs"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <InputField
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={line.requested_qty}
                      onChange={(event) =>
                        onFieldChange(line.local_id, 'requested_qty', event.target.value)
                      }
                      placeholder="0"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <InputField
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.estimated_unit_price}
                      onChange={(event) =>
                        onFieldChange(line.local_id, 'estimated_unit_price', event.target.value)
                      }
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <div className="whitespace-nowrap rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
                      {formatCurrency(getLineEstimatedTotal(line))}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <TextareaField
                      rows={2}
                      value={line.remarks}
                      onChange={(event) =>
                        onFieldChange(line.local_id, 'remarks', event.target.value)
                      }
                      placeholder="Optional note"
                    />
                  </td>
                  <td className="px-2 py-2">
                    {lineItems.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => onRemoveLine(line.local_id)}
                        className="rounded-md border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100"
                        aria-label={`Remove line ${index + 1}`}
                      >
                        Remove
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function PrLinesCardEditor({
  lineItems,
  itemsLoading,
  catalogItems,
  getFilteredItemsForLine,
  onFieldChange,
  onSelectCatalogItem,
  onRemoveLine,
  getLineEstimatedTotal,
}) {
  return (
    <div className="space-y-3 lg:hidden">
      {lineItems.map((line, index) => {
        const filteredItems = getFilteredItemsForLine(line)

        return (
          <div key={line.local_id} className="rounded-md border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Line {index + 1}
              </p>
              {lineItems.length > 1 ? (
                <button
                  type="button"
                  onClick={() => onRemoveLine(line.local_id)}
                  className="text-xs font-medium text-rose-600 hover:text-rose-700"
                >
                  Remove
                </button>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <InputField
                value={line.itemSearch}
                onChange={(event) => onFieldChange(line.local_id, 'itemSearch', event.target.value)}
                placeholder="Search item (SKU/name/brand/model)"
                disabled={itemsLoading || catalogItems.length === 0}
              />

              <SelectField
                value={line.item_id}
                onChange={(event) => onSelectCatalogItem(line.local_id, event.target.value)}
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
              </SelectField>

              <InputField
                value={line.sku}
                onChange={(event) => onFieldChange(line.local_id, 'sku', event.target.value)}
                placeholder="SKU"
              />

              <InputField
                value={line.item_name}
                onChange={(event) => onFieldChange(line.local_id, 'item_name', event.target.value)}
                placeholder="Item name"
              />

              <TextareaField
                rows={2}
                value={line.description}
                onChange={(event) => onFieldChange(line.local_id, 'description', event.target.value)}
                placeholder="Description"
                className="md:col-span-2"
              />

              <InputField
                value={line.unit}
                onChange={(event) => onFieldChange(line.local_id, 'unit', event.target.value)}
                placeholder="Unit"
              />

              <InputField
                type="number"
                min="0.01"
                step="0.01"
                value={line.requested_qty}
                onChange={(event) => onFieldChange(line.local_id, 'requested_qty', event.target.value)}
                placeholder="Requested qty"
              />

              <InputField
                type="number"
                min="0"
                step="0.01"
                value={line.estimated_unit_price}
                onChange={(event) =>
                  onFieldChange(line.local_id, 'estimated_unit_price', event.target.value)
                }
                placeholder="Estimated unit price (optional)"
              />

              <div className="flex items-center rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
                Line Total: {formatCurrency(getLineEstimatedTotal(line))}
              </div>

              <TextareaField
                rows={2}
                value={line.remarks}
                onChange={(event) => onFieldChange(line.local_id, 'remarks', event.target.value)}
                placeholder="Remarks (optional)"
                className="md:col-span-2"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
