import { supabase } from './supabaseClient'

export const DEFAULT_ITEM_IMAGE_BUCKET =
  import.meta.env.VITE_SUPABASE_ITEM_IMAGE_BUCKET || 'item-images'

export const ALLOWED_ITEM_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]

function sanitizeFileName(fileName) {
  return String(fileName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-')
}

function sanitizeSku(sku) {
  return String(sku || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
}

export function validateItemImageFile(file) {
  if (!file) {
    return { valid: false, error: 'No image file selected.' }
  }

  if (!ALLOWED_ITEM_IMAGE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Unsupported image type. Use JPG, JPEG, PNG, or WEBP.',
    }
  }

  return { valid: true, error: '' }
}

function buildStoragePath({ fileName, sku }) {
  const timestamp = Date.now()
  const cleanedFileName = sanitizeFileName(fileName || 'item-image')
  const cleanedSku = sanitizeSku(sku)

  return `${cleanedSku}/${timestamp}-${cleanedFileName}`
}

export async function uploadItemImageFile({
  file,
  sku = '',
  bucket = DEFAULT_ITEM_IMAGE_BUCKET,
}) {
  const validation = validateItemImageFile(file)

  if (!validation.valid) {
    return { publicUrl: '', path: '', error: new Error(validation.error) }
  }

  const storagePath = buildStoragePath({ fileName: file.name, sku })

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, file, { upsert: true })

  if (uploadError) {
    return { publicUrl: '', path: '', error: uploadError }
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath)

  return {
    publicUrl: data?.publicUrl || '',
    path: storagePath,
    error: null,
  }
}
