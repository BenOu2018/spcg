import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Jimp, JimpMime } from 'jimp'

const MAX_COMPRESSED_AVATAR_BYTES = 100 * 1024

const allowedAvatarTypes = new Set(['image/png', 'image/jpeg', 'image/gif'])
const avatarSizes = [320, 256, 192, 160, 128, 96]
const jpegQualities = [82, 74, 66, 58, 50, 42, 34, 28, 20]

export type AvatarUploadResult =
  | { ok: true; avatarUrl: string }
  | { ok: false; code: 'avatar-empty' | 'avatar-type' | 'avatar-compress-failed' | 'avatar-save-failed' }

export async function saveAvatarUpload(input: { userId: string; file: File }): Promise<AvatarUploadResult> {
  if (input.file.size <= 0) return { ok: false, code: 'avatar-empty' }

  if (!allowedAvatarTypes.has(input.file.type)) return { ok: false, code: 'avatar-type' }

  try {
    const uploadDir = getAvatarUploadDir()
    await mkdir(uploadDir, { recursive: true })

    const safeUserId = input.userId.replace(/[^a-zA-Z0-9_-]/g, '')
    const fileName = `${safeUserId}-${Date.now()}-${randomUUID()}.jpg`
    const filePath = path.join(uploadDir, fileName)
    const inputBytes = Buffer.from(await input.file.arrayBuffer())
    const bytes = await compressAvatarToJpeg(inputBytes)
    if (!bytes) return { ok: false, code: 'avatar-compress-failed' }

    await writeFile(filePath, bytes)

    return { ok: true, avatarUrl: `/uploads/avatars/${fileName}` }
  } catch {
    return { ok: false, code: 'avatar-save-failed' }
  }
}

async function compressAvatarToJpeg(inputBytes: Buffer): Promise<Buffer | null> {
  let source: Awaited<ReturnType<typeof Jimp.read>>
  try {
    source = await Jimp.read(inputBytes)
  } catch {
    return null
  }

  for (const size of avatarSizes) {
    for (const quality of jpegQualities) {
      const avatar = source.clone().cover({ w: size, h: size })
      const background = new Jimp({ width: size, height: size, color: 0xffffffff })
      background.composite(avatar, 0, 0)

      const output = await background.getBuffer(JimpMime.jpeg, { quality })
      if (output.byteLength <= MAX_COMPRESSED_AVATAR_BYTES) {
        return output
      }
    }
  }

  return null
}

export function isAvatarUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== 'undefined' && value instanceof File && value.size > 0
}

function getAvatarUploadDir(): string {
  const cwd = process.cwd()
  const publicDir = cwd.endsWith(path.join('apps', 'web')) ? path.join(cwd, 'public') : path.join(cwd, 'apps', 'web', 'public')
  return path.join(publicDir, 'uploads', 'avatars')
}
