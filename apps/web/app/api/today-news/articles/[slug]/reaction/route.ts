import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { ServiceError } from '@/lib/services/errors'
import { setTodayNewsArticleReaction } from '@/lib/services/today-news-service'

type RouteContext = {
  params: Promise<{ slug: string }>
}

type ReactionBody = {
  liked?: unknown
  bookmarked?: unknown
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const [{ slug }, session, body] = await Promise.all([
      context.params,
      auth(),
      request.json().catch(() => ({} as ReactionBody)),
    ])

    if (typeof body.liked !== 'boolean' || typeof body.bookmarked !== 'boolean') {
      throw new ServiceError('bad_request', 'Invalid reaction payload.', 400)
    }

    const reaction = await setTodayNewsArticleReaction({
      slug,
      userId: session?.user?.id,
      liked: body.liked,
      bookmarked: body.bookmarked,
    })

    return jsonOk({ reaction })
  } catch (error) {
    return jsonError(error)
  }
}
