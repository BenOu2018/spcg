import { auth } from '@/auth'
import { MapLoadingFallback } from '@/components/MapLoadingFallback'

export default async function MapLoading() {
  const session = await auth()
  return <MapLoadingFallback userId={session?.user?.id ?? null} />
}
