import { MePageCacheBridge } from '@/components/MePageCacheBridge'
import { MePageExperience } from '@/components/MePageExperience'
import { requireUser } from '@/lib/auth-guard'
import { getMePagePayloadForSession } from '@/lib/services/me-page-payload-service'

export default async function MePage() {
  const session = await requireUser('/me')
  const { cachePayload, viewPayload } = await getMePagePayloadForSession(session)

  return (
    <>
      <MePageExperience payload={viewPayload} />
      <MePageCacheBridge payload={cachePayload} />
    </>
  )
}
