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
      'id, supplier_code, supplier_name, contact_name, email, phone, payment_terms, lead_time_days, currency, notes, active, created_at, updated_at',
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
      'id, supplier_code, supplier_name, contact_name, email, phone, payment_terms, lead_time_days, currency, active',
    )
    .eq('active', true)
    .order('supplier_name', { ascending: true })
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

export async function updateSupplier(supplierId, payload) {
  return supabase.from('suppliers').update(payload).eq('id', supplierId).select().single()
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
      'id, sku, item_name, category, brand, model, color, size, unit, description, spec_text, active',
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
