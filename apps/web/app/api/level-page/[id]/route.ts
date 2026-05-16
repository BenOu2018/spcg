import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getLevelPagePayloadForSession } from '@/lib/services/level-page-payload-service'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { ServiceError } from '@/lib/services/errors'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const [{ id }, session] = await Promise.all([context.params, auth()])
    if (!session?.user?.id) throw new ServiceError('unauthorized', '当前未登录。', 401)

    const result = await getLevelPagePayloadForSession({
      explicitStageSelection: false,
      levelId: id,
      session,
    })

    if (result.status === 'not-found') throw new ServiceError('not_found', '关卡不存在。', 404)
    if (result.status === 'upgrade-required') {
      return NextResponse.json(
        {
          ok: false,
          redirectTo: `/level/${encodeURIComponent(id)}`,
          error: { code: 'upgrade_required', message: result.reason },
        },
        { status: 403 },
      )
    }
    if (result.status === 'redirect') {
      return NextResponse.json(
        {
          ok: false,
          redirectTo: result.href,
          error: { code: 'redirect', message: '需要跳转到当前可进入关卡。' },
        },
        { status: 409 },
      )
    }

    return jsonOk({ payload: result.cachePayload })
  } catch (error) {
    return jsonError(error)
  }
}
