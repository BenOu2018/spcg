'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { TodayNewsArticleStatus } from '@spcg/shared/types'
import { requireAdmin } from '@/lib/admin-auth'
import {
  setAdminTodayNewsArticlePublication,
  updateAdminTodayNewsArticle,
} from '@/lib/services/today-news-service'

const validStatuses = new Set<TodayNewsArticleStatus>(['draft', 'published', 'archived'])

export async function updateTodayNewsArticleAction(formData: FormData) {
  const articleId = readRequiredString(formData, 'articleId')
  const status = readStatus(formData)
  const showInTodayNews = readBoolean(formData, 'showInTodayNews')
  const authorKey = readRequiredString(formData, 'authorKey')

  const context = await requireAdmin('editor')
  if (context.preview) {
    revalidateTodayNewsPaths()
    redirect('/admin/today-news')
  }

  await updateAdminTodayNewsArticle({
    id: articleId,
    status,
    topicZh: readRequiredString(formData, 'topicZh'),
    topicEn: readRequiredString(formData, 'topicEn'),
    bodyZh: readRequiredString(formData, 'bodyZh'),
    bodyEn: readRequiredString(formData, 'bodyEn'),
    imageUrl: readRequiredString(formData, 'imageUrl'),
    imageAltZh: readRequiredString(formData, 'imageAltZh'),
    imageAltEn: readRequiredString(formData, 'imageAltEn'),
    authorKey,
    showInTodayNews,
    displayOrder: readInteger(formData, 'displayOrder'),
    audit: {
      userId: context.userId,
      role: context.role,
    },
  })

  revalidateTodayNewsPaths()
  redirect('/admin/today-news')
}

export async function setTodayNewsArticlePublicationAction(formData: FormData) {
  const articleId = readRequiredString(formData, 'articleId')
  const mode = readRequiredString(formData, 'mode')
  const context = await requireAdmin('editor')

  const publication = readPublicationMode(mode)
  if (context.preview) {
    revalidateTodayNewsPaths()
    return
  }

  await setAdminTodayNewsArticlePublication({
    id: articleId,
    status: publication.status,
    showInTodayNews: publication.showInTodayNews,
    audit: {
      userId: context.userId,
      role: context.role,
    },
  })

  revalidateTodayNewsPaths()
}

function readPublicationMode(mode: string): { status: TodayNewsArticleStatus; showInTodayNews: boolean } {
  switch (mode) {
    case 'online':
      return { status: 'published', showInTodayNews: true }
    case 'offline':
      return { status: 'published', showInTodayNews: false }
    case 'draft':
      return { status: 'draft', showInTodayNews: false }
    case 'archive':
      return { status: 'archived', showInTodayNews: false }
    default:
      throw new Error('Invalid SPCG weekly publication mode')
  }
}

function readStatus(formData: FormData): TodayNewsArticleStatus {
  const status = readRequiredString(formData, 'status') as TodayNewsArticleStatus
  if (!validStatuses.has(status)) throw new Error('Invalid SPCG weekly status')
  return status
}

function readRequiredString(formData: FormData, key: string): string {
  const value = String(formData.get(key) ?? '').trim()
  if (!value) throw new Error(`${key} is required`)
  return value
}

function readInteger(formData: FormData, key: string): number {
  const value = Number(readRequiredString(formData, key))
  if (!Number.isInteger(value)) throw new Error(`${key} must be an integer`)
  return value
}

function readBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === 'true'
}

function revalidateTodayNewsPaths() {
  revalidatePath('/admin/today-news')
  revalidatePath('/admin/audit-logs')
  revalidatePath('/map')
}
