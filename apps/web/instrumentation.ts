import { logSystemError } from '@/lib/services/system-error-log-service'

type RequestLike = {
  path?: string
  url?: string
  method?: string
}

type InstrumentationContext = {
  routerKind?: string
  routePath?: string
  routeType?: string
  renderSource?: string
  revalidateReason?: string
}

export async function register() {
  // Reserved for future runtime-specific instrumentation.
}

export async function onRequestError(error: unknown, request: RequestLike, context: InstrumentationContext) {
  await logSystemError({
    source: 'next.request',
    error,
    path: readRequestPath(request),
    method: request?.method ?? null,
    metadata: {
      routerKind: context?.routerKind,
      routePath: context?.routePath,
      routeType: context?.routeType,
      renderSource: context?.renderSource,
      revalidateReason: context?.revalidateReason,
    },
  })
}

function readRequestPath(request: RequestLike): string | null {
  if (typeof request?.path === 'string' && request.path) return request.path
  if (typeof request?.url !== 'string' || !request.url) return null

  try {
    return new URL(request.url).pathname
  } catch {
    return request.url
  }
}
