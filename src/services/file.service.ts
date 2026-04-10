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

type DownloadFileRow = {
  id: number
  repository_item_id: number
  storage_bucket: string
  storage_object_path: string
  original_filename: string
  mime_type: string | null
  visibility_code: string
  repository_items:
    | {
        workflow_status_code: string | null
        visibility_code: string | null
      }
    | Array<{
        workflow_status_code: string | null
        visibility_code: string | null
      }>
    | null
}

function sanitizeFilename(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9._-]+/g, '-')
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

  return downloadRepositoryFile(data as DownloadFileRow, requesterId)
}

export async function downloadPrimaryThesisFileByThesisId(
  thesisId: string,
  requesterId?: string,
): Promise<DownloadedFilePayload> {
  const supabase = getSupabaseServiceClient().schema('public')
  const numericThesisId = Number(thesisId)

  if (!Number.isFinite(numericThesisId)) {
    throw new HttpError(400, 'A valid thesis id is required.')
  }

  const { data, error } = await supabase
    .from('repository_item_files')
    .select('id,repository_item_id,storage_bucket,storage_object_path,original_filename,mime_type,visibility_code,repository_items(workflow_status_code,visibility_code)')
    .eq('repository_item_id', numericThesisId)
    .order('is_primary', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    throw new HttpError(404, 'No thesis file is available for this submission.')
  }

  return downloadRepositoryFile(data as DownloadFileRow, requesterId)
}

async function downloadRepositoryFile(file: DownloadFileRow, requesterId?: string): Promise<DownloadedFilePayload> {
  const supabase = getSupabaseServiceClient().schema('public')
  let canRead = false

  if (requesterId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role_code,user_status_code')
      .eq('id', requesterId)
      .maybeSingle()

    canRead = canAccessAdmin(profile)
  }

  const item = Array.isArray(file.repository_items) ? file.repository_items[0] : file.repository_items

  if (!canRead) {
    const isPublicItem = item?.workflow_status_code === 'published' && item?.visibility_code === 'public'
    const isPublicFile = file.visibility_code === 'public'

    if (!isPublicItem || !isPublicFile) {
      throw new HttpError(403, 'This file is not publicly accessible.')
    }
  }

  const { data: fileBlob, error: downloadError } = await getSupabaseServiceClient().storage
    .from(file.storage_bucket)
    .download(file.storage_object_path)

  if (downloadError || !fileBlob) {
    throw new HttpError(500, `Failed to download file: ${downloadError?.message ?? 'unknown error'}`)
  }

  await supabase
    .from('download_events')
    .insert({
      repository_item_id: file.repository_item_id,
      repository_item_file_id: file.id,
      actor_profile_id: requesterId ?? null,
    })

  return {
    buffer: Buffer.from(await fileBlob.arrayBuffer()),
    originalFilename: file.original_filename,
    contentType: file.mime_type || 'application/pdf',
    contentEncoding: 'gzip',
  }
}
