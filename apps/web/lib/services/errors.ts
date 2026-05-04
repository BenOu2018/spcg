export type ServiceErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'db_unconfigured'
  | 'rate_limited'
  | 'internal_error'

export class ServiceError extends Error {
  readonly code: ServiceErrorCode
  readonly status: number
  readonly retryAfterSeconds?: number

  constructor(code: ServiceErrorCode, message: string, status: number, retryAfterSeconds?: number) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function toServiceError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error
  return new ServiceError('internal_error', error instanceof Error ? error.message : 'Internal server error', 500)
}
