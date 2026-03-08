import { supabase } from './supabaseClient'

function applySearch(query, fields, searchTerm) {
  const normalized = String(searchTerm || '').trim()

  if (!normalized) {
    return query
  }

  const filterExpression = fields
    .map((field) => `${field}.ilike.%${normalized}%`)
    .join(',')

  return query.or(filterExpression)
}

export async function fetchSuppliers({ searchTerm = '', activeFilter = 'all' } = {}) {
  let query = supabase
    .from('suppliers')
    .select(
      'id, supplier_code, supplier_name, contact_name, email, phone, address, tax_id, payment_terms, lead_time_days, currency, notes, active, created_at, updated_at',
    )
    .order('supplier_name', { ascending: true })

  query = applySearch(query, ['supplier_name', 'supplier_code'], searchTerm)

  if (activeFilter === 'active') {
    query = query.eq('active', true)
  }

  if (activeFilter === 'inactive') {
    query = query.eq('active', false)
  }

  return query
}

export async function fetchActiveSuppliers() {
  return supabase
    .from('suppliers')
    .select(
      'id, supplier_code, supplier_name, contact_name, email, phone, address, tax_id, payment_terms, lead_time_days, currency, active',
    )
    .eq('active', true)
    .order('supplier_name', { ascending: true })
}

export async function fetchSupplierById(supplierId) {
  const normalizedSupplierId = String(supplierId || '').trim()

  if (!normalizedSupplierId) {
    return { data: null, error: null }
  }

  return supabase
    .from('suppliers')
    .select(
      'id, supplier_code, supplier_name, contact_name, email, phone, address, tax_id, payment_terms, lead_time_days, currency, notes, active, created_at, updated_at',
    )
    .eq('id', normalizedSupplierId)
    .maybeSingle()
}

export async function createSupplier(payload) {
  return supabase.from('suppliers').insert(payload).select().single()
}

export async function upsertSuppliers(rows = []) {
  if (!rows.length) {
    return { data: [], error: null }
  }

  const batchSize = 200
  const allData = []

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize)
    const { data, error } = await supabase
      .from('suppliers')
      .upsert(batch, { onConflict: 'supplier_code' })
      .select('id')

    if (error) {
      return { data: null, error }
    }

    allData.push(...(data || []))
  }

  return { data: allData, error: null }
}

export async function fetchExistingSupplierCodes(codes = []) {
  const normalizedCodes = Array.from(
    new Set(codes.map((code) => String(code || '').trim()).filter(Boolean)),
  )

  if (!normalizedCodes.length) {
    return { data: [], error: null }
  }

  const batchSize = 500
  const existingCodes = []

  for (let index = 0; index < normalizedCodes.length; index += batchSize) {
    const batch = normalizedCodes.slice(index, index + batchSize)
    const { data, error } = await supabase
      .from('suppliers')
      .select('supplier_code')
      .in('supplier_code', batch)

    if (error) {
      return { data: null, error }
    }

    existingCodes.push(
      ...(data || []).map((row) => String(row.supplier_code || '').trim()),
    )
  }

  return { data: Array.from(new Set(existingCodes)), error: null }
}

export async function updateSupplier(supplierId, payload) {
  return supabase.from('suppliers').update(payload).eq('id', supplierId).select().single()
}

export async function updateSupplierByCode(supplierCode, payload) {
  return supabase
    .from('suppliers')
    .update(payload)
    .eq('supplier_code', supplierCode)
    .select('id, supplier_code')
    .maybeSingle()
}

export async function deleteSupplier(supplierId) {
  return supabase.from('suppliers').delete().eq('id', supplierId)
}

export async function supplierCodeExists(supplierCode, excludeSupplierId = null) {
  const normalizedCode = String(supplierCode || '').trim()

  if (!normalizedCode) {
    return { exists: false, error: null }
  }

  let query = supabase
    .from('suppliers')
    .select('id')
    .eq('supplier_code', normalizedCode)

  if (excludeSupplierId) {
    query = query.neq('id', excludeSupplierId)
  }

  const { data, error } = await query.limit(1)

  if (error) {
    return { exists: false, error }
  }

  return { exists: Boolean(data && data.length > 0), error: null }
}

export async function fetchItems({
  searchTerm = '',
  categoryFilter = 'all',
  activeFilter = 'all',
} = {}) {
  let query = supabase
    .from('items')
    .select(
      'id, sku, item_name, category, brand, model, color, size, unit, description, spec_text, image_url, active, created_at, updated_at',
    )
    .order('item_name', { ascending: true })

  query = applySearch(query, ['sku', 'item_name', 'brand', 'model'], searchTerm)

  if (categoryFilter !== 'all') {
    query = query.eq('category', categoryFilter)
  }

  if (activeFilter === 'active') {
    query = query.eq('active', true)
  }

  if (activeFilter === 'inactive') {
    query = query.eq('active', false)
  }

  return query
}

export async function fetchActiveItems() {
  return supabase
    .from('items')
    .select(
      'id, sku, item_name, category, brand, model, color, size, unit, description, spec_text, image_url, active',
    )
    .eq('active', true)
    .order('item_name', { ascending: true })
}

export async function createItem(payload) {
  return supabase.from('items').insert(payload).select().single()
}

export async function fetchExistingItemSkus(skus = []) {
  const normalizedSkus = Array.from(
    new Set(skus.map((sku) => String(sku || '').trim()).filter(Boolean)),
  )

  if (!normalizedSkus.length) {
    return { data: [], error: null }
  }

  const batchSize = 500
  const existingSkus = []

  for (let index = 0; index < normalizedSkus.length; index += batchSize) {
    const batch = normalizedSkus.slice(index, index + batchSize)
    const { data, error } = await supabase.from('items').select('sku').in('sku', batch)

    if (error) {
      return { data: null, error }
    }

    existingSkus.push(...(data || []).map((row) => String(row.sku || '').trim()))
  }

  return { data: Array.from(new Set(existingSkus)), error: null }
}

export async function upsertItems(rows = []) {
  if (!rows.length) {
    return { data: [], error: null }
  }

  const batchSize = 200
  const allData = []

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize)
    const { data, error } = await supabase
      .from('items')
      .upsert(batch, { onConflict: 'sku' })
      .select('id')

    if (error) {
      return { data: null, error }
    }

    allData.push(...(data || []))
  }

  return { data: allData, error: null }
}

export async function updateItem(itemId, payload) {
  return supabase.from('items').update(payload).eq('id', itemId).select().single()
}

export async function updateItemBySku(sku, payload) {
  return supabase
    .from('items')
    .update(payload)
    .eq('sku', sku)
    .select('id, sku')
    .maybeSingle()
}

export async function deleteItem(itemId) {
  return supabase.from('items').delete().eq('id', itemId)
}

export async function skuExists(sku, excludeItemId = null) {
  const normalizedSku = String(sku || '').trim()

  if (!normalizedSku) {
    return { exists: false, error: null }
  }

  let query = supabase.from('items').select('id').eq('sku', normalizedSku)

  if (excludeItemId) {
    query = query.neq('id', excludeItemId)
  }

  const { data, error } = await query.limit(1)

  if (error) {
    return { exists: false, error }
  }

  return { exists: Boolean(data && data.length > 0), error: null }
}

export async function fetchItemSupplierMappings(itemId) {
  return supabase
    .from('item_supplier_map')
    .select(
      'id, item_id, supplier_id, supplier_sku, supplier_item_name, unit_price, currency, moq, lead_time_days, is_preferred, last_price_date, remarks, active, created_at, updated_at, suppliers(id, supplier_code, supplier_name, active)',
    )
    .eq('item_id', itemId)
    .order('is_preferred', { ascending: false })
    .order('created_at', { ascending: false })
}

export async function clearPreferredSupplierForItem(itemId, excludeMappingId = null) {
  let query = supabase
    .from('item_supplier_map')
    .update({ is_preferred: false })
    .eq('item_id', itemId)
    .eq('is_preferred', true)

  if (excludeMappingId) {
    query = query.neq('id', excludeMappingId)
  }

  return query
}

export async function createItemSupplierMapping(payload) {
  return supabase.from('item_supplier_map').insert(payload).select().single()
}

export async function updateItemSupplierMapping(mappingId, payload) {
  return supabase
    .from('item_supplier_map')
    .update(payload)
    .eq('id', mappingId)
    .select()
    .single()
}

export async function deleteItemSupplierMapping(mappingId) {
  return supabase.from('item_supplier_map').delete().eq('id', mappingId)
}

export async function fetchPreferredSupplierSnapshots(itemIds = []) {
  const normalizedItemIds = Array.from(
    new Set(itemIds.map((itemId) => String(itemId || '').trim()).filter(Boolean)),
  )

  if (!normalizedItemIds.length) {
    return { data: [], error: null }
  }

  const batchSize = 500
  const allRows = []

  for (let index = 0; index < normalizedItemIds.length; index += batchSize) {
    const batch = normalizedItemIds.slice(index, index + batchSize)
    const { data, error } = await supabase
      .from('item_supplier_map')
      .select(
        'item_id, unit_price, currency, last_price_date, suppliers(id, supplier_code, supplier_name)',
      )
      .in('item_id', batch)
      .eq('is_preferred', true)
      .eq('active', true)

    if (error) {
      return { data: null, error }
    }

    allRows.push(...(data || []))
  }

  return { data: allRows, error: null }
}

export async function fetchPreferredSupplierMappings(itemIds = []) {
  const normalizedItemIds = Array.from(
    new Set(itemIds.map((itemId) => String(itemId || '').trim()).filter(Boolean)),
  )

  if (!normalizedItemIds.length) {
    return { data: [], error: null }
  }

  const batchSize = 500
  const allRows = []

  for (let index = 0; index < normalizedItemIds.length; index += batchSize) {
    const batch = normalizedItemIds.slice(index, index + batchSize)
    const { data, error } = await supabase
      .from('item_supplier_map')
      .select(
        'id, item_id, supplier_id, supplier_sku, unit_price, currency, lead_time_days, last_price_date, suppliers(id, supplier_code, supplier_name)',
      )
      .in('item_id', batch)
      .eq('is_preferred', true)
      .eq('active', true)

    if (error) {
      return { data: null, error }
    }

    allRows.push(...(data || []))
  }

  return { data: allRows, error: null }
}
