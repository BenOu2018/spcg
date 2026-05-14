import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { getAvatarUploadDir } from '@/lib/avatar-upload'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const avatarFilePattern = /^[a-zA-Z0-9_-]+-\d+-[a-f0-9-]+\.(?:webp|jpg|jpeg|png|gif)$/i

type AvatarRouteContext = {
  params: Promise<{ file: string }>
}

export async function GET(_request: Request, context: AvatarRouteContext) {
  const { file } = await context.params
  if (!isSafeAvatarFile(file)) return notFound()

  const filePath = path.join(getAvatarUploadDir(), file)
  try {
    const info = await stat(filePath)
    if (!info.isFile()) return notFound()

    const bytes = await readFile(filePath)
    return new Response(bytes, {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(bytes.byteLength),
        'Content-Type': contentTypeFor(file),
      },
    })
  } catch {
    return notFound()
  }
}

function isSafeAvatarFile(file: string): boolean {
  return file === path.basename(file) && avatarFilePattern.test(file)
}

function contentTypeFor(file: string): string {
  const extension = path.extname(file).toLowerCase()
  if (extension === '.webp') return 'image/webp'
  if (extension === '.png') return 'image/png'
  if (extension === '.gif') return 'image/gif'
  return 'image/jpeg'
}

function notFound() {
  return new Response('Not found', { status: 404 })
}
