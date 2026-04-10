import { createHash } from 'node:crypto'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'

import { getSupabaseServiceClient } from '@/lib/supabase'
import { HttpError } from '@/middleware/error-handler'
import { canAccessAdmin } from '@/services/auth.service'

const gzipAsync = promisify(gzip)
const BUCKET = 'thesis-documents'

type UploadFileInput = {
  thesisId: string
  uploadedByProfileId: string
  file: {
    buffer: Buffer
    originalname: string
    mimetype: string
    size: number
  }
}

export type UploadedFileRecord = {
  id: number
  repositoryItemId: number
  originalFilename: string
  storageObjectPath: string
  mimeType: string
}

export type DownloadedFilePayload = {
  buffer: Buffer
  originalFilename: string
  contentType: string
  contentEncoding?: string
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-')
}

export async function uploadThesisFile(input: UploadFileInput): Promise<UploadedFileRecord> {
  const supabase = getSupabaseServiceClient().schema('public')
  const repositoryItemId = Number(input.thesisId)

  if (!Number.isFinite(repositoryItemId)) {
    throw new HttpError(400, 'A valid thesis_id is required.')
  }

  const { data: item, error: itemError } = await supabase
    .from('repository_items')
    .select('id')
    .eq('id', repositoryItemId)
    .maybeSingle()

  if (itemError || !item) {
    throw new HttpError(404, 'Repository item not found.')
  }

  const compressed = await gzipAsync(input.file.buffer)
  const checksumSha256 = createHash('sha256').update(input.file.buffer).digest('hex')
  const objectPath = `${repositoryItemId}/${Date.now()}-${sanitizeFilename(input.file.originalname)}.gz`

  const { error: uploadError } = await getSupabaseServiceClient().storage
    .from(BUCKET)
    .upload(objectPath, compressed, {
      contentType: 'application/gzip',
      upsert: true,
    })

  if (uploadError) {
    throw new HttpError(500, `Failed to upload file: ${uploadError.message}`)
  }

  await supabase
    .from('repository_item_files')
    .update({ is_primary: false })
    .eq('repository_item_id', repositoryItemId)
    .eq('is_primary', true)

  const { data, error } = await supabase
    .from('repository_item_files')
    .insert({
      repository_item_id: repositoryItemId,
      purpose_code: 'primary-document',
      visibility_code: 'private',
      storage_bucket: BUCKET,
      storage_object_path: objectPath,
      original_filename: input.file.originalname,
      mime_type: input.file.mimetype || 'application/pdf',
      byte_size: input.file.size,
      checksum_sha256: checksumSha256,
      uploaded_by_profile_id: input.uploadedByProfileId,
      is_primary: true,
      sort_order: 0,
    })
    .select('id,repository_item_id,original_filename,storage_object_path,mime_type')
    .maybeSingle()

  if (error || !data) {
    throw new HttpError(500, `Failed to persist uploaded file metadata: ${error?.message ?? 'unknown error'}`)
  }

  return {
    id: Number(data.id),
    repositoryItemId: Number(data.repository_item_id),
    originalFilename: data.original_filename,
    storageObjectPath: data.storage_object_path,
    mimeType: data.mime_type,
  }
}

export async function downloadThesisFile(fileId: string, requesterId?: string): Promise<DownloadedFilePayload> {
  const supabase = getSupabaseServiceClient().schema('public')
  const numericFileId = Number(fileId)

  if (!Number.isFinite(numericFileId)) {
    throw new HttpError(400, 'A valid file id is required.')
  }

  const { data, error } = await supabase
    .from('repository_item_files')
    .select('id,repository_item_id,storage_bucket,storage_object_path,original_filename,mime_type,visibility_code,repository_items(workflow_status_code,visibility_code)')
    .eq('id', numericFileId)
    .maybeSingle()

  if (error || !data) {
    throw new HttpError(404, 'Repository file not found.')
  }

  let canRead = false

  if (requesterId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role_code,user_status_code')
      .eq('id', requesterId)
      .maybeSingle()

    canRead = canAccessAdmin(profile)
  }

  const item = Array.isArray(data.repository_items) ? data.repository_items[0] : data.repository_items

  if (!canRead) {
    const isPublicItem = item?.workflow_status_code === 'published' && item?.visibility_code === 'public'
    const isPublicFile = data.visibility_code === 'public'

    if (!isPublicItem || !isPublicFile) {
      throw new HttpError(403, 'This file is not publicly accessible.')
    }
  }

  const { data: fileBlob, error: downloadError } = await getSupabaseServiceClient().storage
    .from(data.storage_bucket)
    .download(data.storage_object_path)

  if (downloadError || !fileBlob) {
    throw new HttpError(500, `Failed to download file: ${downloadError?.message ?? 'unknown error'}`)
  }

  await supabase
    .from('download_events')
    .insert({
      repository_item_id: data.repository_item_id,
      repository_item_file_id: data.id,
      actor_profile_id: requesterId ?? null,
    })

  return {
    buffer: Buffer.from(await fileBlob.arrayBuffer()),
    originalFilename: data.original_filename,
    contentType: data.mime_type || 'application/pdf',
    contentEncoding: 'gzip',
  }
}
