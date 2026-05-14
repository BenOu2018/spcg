import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { Jimp, JimpMime } from 'jimp'

const MAX_COMPRESSED_AVATAR_BYTES = 10 * 1024

const allowedAvatarTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const avatarSizes = [96, 80, 72, 64, 56, 48]
const webpQualities = [72, 64, 56, 48, 40, 32, 24, 16]
const execFileAsync = promisify(execFile)

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
    const fileName = `${safeUserId}-${Date.now()}-${randomUUID()}.webp`
    const filePath = path.join(uploadDir, fileName)
    const inputBytes = Buffer.from(await input.file.arrayBuffer())
    const bytes = await compressAvatarToWebp({ inputBytes, mimeType: input.file.type })
    if (!bytes) return { ok: false, code: 'avatar-compress-failed' }

    await writeFile(filePath, bytes)

    return { ok: true, avatarUrl: `/uploads/avatars/${fileName}` }
  } catch {
    return { ok: false, code: 'avatar-save-failed' }
  }
}

async function compressAvatarToWebp(input: { inputBytes: Buffer; mimeType: string }): Promise<Buffer | null> {
  let tempDir: string | null = null

  try {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'spcg-avatar-'))
    const source = await readAvatarSource(input, tempDir)

    for (const size of avatarSizes) {
      const avatar = source.clone().cover({ w: size, h: size })
      const background = new Jimp({ width: size, height: size, color: 0xffffffff })
      background.composite(avatar, 0, 0)

      const pngPath = path.join(tempDir, `${size}.png`)
      await writeFile(pngPath, await background.getBuffer(JimpMime.png))

      for (const quality of webpQualities) {
        const outputPath = path.join(tempDir, `${size}-${quality}.webp`)
        const output = await encodeWebp({ inputPath: pngPath, outputPath, quality })
        if (output.byteLength <= MAX_COMPRESSED_AVATAR_BYTES) {
          return output
        }
      }
    }

    return null
  } catch {
    return null
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true })
  }
}

async function readAvatarSource(input: { inputBytes: Buffer; mimeType: string }, tempDir: string) {
  if (input.mimeType !== 'image/webp') return Jimp.read(input.inputBytes)

  const webpPath = path.join(tempDir, 'source.webp')
  const pngPath = path.join(tempDir, 'source.png')
  await writeFile(webpPath, input.inputBytes)
  await execFileAsync(getDwebpPath(), ['-quiet', webpPath, '-o', pngPath])
  return Jimp.read(await readFile(pngPath))
}

async function encodeWebp(input: { inputPath: string; outputPath: string; quality: number }): Promise<Buffer> {
  await execFileAsync(getCwebpPath(), [
    '-quiet',
    '-metadata',
    'none',
    '-m',
    '6',
    '-q',
    String(input.quality),
    input.inputPath,
    '-o',
    input.outputPath,
  ])
  return readFile(input.outputPath)
}

export function isAvatarUploadFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== 'undefined' && value instanceof File && value.size > 0
}

export function getAvatarUploadDir(): string {
  const cwd = process.cwd()
  const publicDir = cwd.endsWith(path.join('apps', 'web')) ? path.join(cwd, 'public') : path.join(cwd, 'apps', 'web', 'public')
  return path.join(publicDir, 'uploads', 'avatars')
}

function getCwebpPath(): string {
  return process.env.CWEBP_BIN_PATH ?? resolveNodeModuleBinaryPath('cwebp-bin', process.platform === 'win32' ? 'cwebp.exe' : 'cwebp')
}

function getDwebpPath(): string {
  return process.env.DWEBP_BIN_PATH ?? resolveNodeModuleBinaryPath('dwebp-bin', process.platform === 'win32' ? 'dwebp.exe' : 'dwebp')
}

function resolveNodeModuleBinaryPath(packageName: string, binaryName: string): string {
  return path.join(process.cwd(), 'node_modules', packageName, 'vendor', binaryName)
}
