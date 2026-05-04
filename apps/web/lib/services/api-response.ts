import { NextResponse } from 'next/server'
import { toServiceError } from '@/lib/services/errors'

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init)
}

export function jsonError(error: unknown) {
  const serviceError = toServiceError(error)
  const headers = new Headers()
  if (serviceError.retryAfterSeconds) {
    headers.set('Retry-After', String(serviceError.retryAfterSeconds))
  }

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: serviceError.code,
        message: serviceError.message,
        retryAfterSeconds: serviceError.retryAfterSeconds,
      },
    },
    { status: serviceError.status, headers },
  )
}
