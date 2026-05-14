export type SettingsTabValue = 'profile' | 'language' | 'phone' | 'parentBinding' | 'security'

export type SettingsStatusParamKey = 'profile' | 'password' | 'phone' | 'phoneNumber' | 'devCode' | 'language'

export type SettingsActionResult = {
  tab: SettingsTabValue
  statusKey?: SettingsStatusParamKey
  statusCode?: string
  extraParams?: Partial<Record<SettingsStatusParamKey, string | null | undefined>>
  clientState?: Record<string, string | null | undefined>
}

const SETTINGS_STATUS_PARAM_KEYS: SettingsStatusParamKey[] = [
  'profile',
  'password',
  'phone',
  'phoneNumber',
  'devCode',
  'language',
]

type SearchParamsInput = string | { toString(): string }

export function buildSettingsTabHref(searchParams: SearchParamsInput, tab: string): string {
  const params = createSearchParams(searchParams)
  params.set('tab', tab)
  clearSettingsStatusParams(params)
  return buildSettingsHref(params)
}

export function buildSettingsActionHref(searchParams: SearchParamsInput, result: SettingsActionResult): string {
  const params = createSearchParams(searchParams)
  params.set('tab', result.tab)
  clearSettingsStatusParams(params)

  if (result.statusKey && result.statusCode) {
    params.set(result.statusKey, result.statusCode)
  }

  for (const [key, value] of Object.entries(result.extraParams ?? {})) {
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
  }

  return buildSettingsHref(params)
}

function createSearchParams(searchParams: SearchParamsInput): URLSearchParams {
  const value = typeof searchParams === 'string' ? searchParams.replace(/^\?/, '') : searchParams.toString()
  return new URLSearchParams(value)
}

function clearSettingsStatusParams(params: URLSearchParams): void {
  SETTINGS_STATUS_PARAM_KEYS.forEach((key) => params.delete(key))
}

function buildSettingsHref(params: URLSearchParams): string {
  const query = params.toString()
  return query ? `/settings?${query}` : '/settings'
}
