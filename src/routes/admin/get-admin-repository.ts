import type { Request } from 'express'

import { ApiAdminRepository } from '@/services/admin.service'

const repositoryByRequest = new WeakMap<Request, ApiAdminRepository>()

function getBearerToken(request: Request) {
  const authorizationHeader = request.headers.authorization

  if (typeof authorizationHeader !== 'string') {
    return undefined
  }

  return authorizationHeader.replace(/^Bearer\s+/i, '')
}

export function getAdminRepository(request: Request) {
  const existingRepository = repositoryByRequest.get(request)
  if (existingRepository) {
    return existingRepository
  }

  const repository = new ApiAdminRepository(request.user?.id ?? null, getBearerToken(request))
  repositoryByRequest.set(request, repository)

  return repository
}
