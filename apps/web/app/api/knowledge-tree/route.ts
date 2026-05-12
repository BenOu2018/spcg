import { auth } from '@/auth'
import { jsonError, jsonOk } from '@/lib/services/api-response'
import { getKnowledgeTree } from '@/lib/services/knowledge-tree-service'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const classification = url.searchParams.get('classification') === '数学' ? '数学' : '编程算法'
    const session = await auth()
    const tree = await getKnowledgeTree({
      classification,
      currentUserId: session?.user?.id,
    })

    return jsonOk({ tree })
  } catch (error) {
    return jsonError(error)
  }
}
