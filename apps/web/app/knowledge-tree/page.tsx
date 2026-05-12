import type { Metadata } from 'next'
import { auth } from '@/auth'
import { getKnowledgeTree } from '@/lib/services/knowledge-tree-service'
import { KnowledgeTreeClient } from './KnowledgeTreeClient'

export const metadata: Metadata = {
  title: 'SPCG 编程算法知识树',
  description: '数据驱动的 SPCG 编程算法知识树。',
}

export const dynamic = 'force-dynamic'

export default async function KnowledgeTreePage() {
  const session = await auth()
  const tree = await getKnowledgeTree({
    classification: '编程算法',
    currentUserId: session?.user?.id,
  })

  return <KnowledgeTreeClient tree={tree} />
}
