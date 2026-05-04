import { isDbConfigured } from '@/lib/db'

export function isDatabaseConfigured(): boolean {
  return isDbConfigured()
}
