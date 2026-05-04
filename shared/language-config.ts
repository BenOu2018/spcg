export type LanguageMode = 'auto' | 'c' | 'cpp11' | 'cpp14' | 'cpp17' | 'cpp20' | 'cpp23' | 'python3'
export type ResolvedLanguage = Exclude<LanguageMode, 'auto'>

export const LANGUAGE_MODES: LanguageMode[] = ['auto', 'c', 'cpp11', 'cpp14', 'cpp17', 'cpp20', 'cpp23', 'python3']
export const RESOLVED_LANGUAGES: ResolvedLanguage[] = ['c', 'cpp11', 'cpp14', 'cpp17', 'cpp20', 'cpp23', 'python3']

export const DEFAULT_LANGUAGE_MODE: LanguageMode = 'auto'
export const DEFAULT_CPP_LANGUAGE: ResolvedLanguage = 'cpp14'

const DEFAULT_C_LANGUAGE_ID = 50
const DEFAULT_CPP_LANGUAGE_ID = 54
const DEFAULT_PYTHON3_LANGUAGE_ID = 71

const LANGUAGE_LABELS: Record<LanguageMode, string> = {
  auto: 'Auto · C++14 first',
  c: 'C',
  cpp11: 'C++11',
  cpp14: 'C++14',
  cpp17: 'C++17',
  cpp20: 'C++20',
  cpp23: 'C++23',
  python3: 'Python3',
}

const CPP_STANDARDS: Record<Exclude<ResolvedLanguage, 'c' | 'python3'>, string> = {
  cpp11: 'c++11',
  cpp14: 'c++14',
  cpp17: 'c++17',
  cpp20: 'c++20',
  cpp23: 'c++23',
}

export function normalizeLanguageMode(value: unknown): LanguageMode {
  if (value === 'cpp') return DEFAULT_CPP_LANGUAGE
  return typeof value === 'string' && isLanguageMode(value) ? value : DEFAULT_LANGUAGE_MODE
}

export function normalizeResolvedLanguage(value: unknown): ResolvedLanguage {
  if (value === 'cpp') return DEFAULT_CPP_LANGUAGE
  return typeof value === 'string' && isResolvedLanguage(value) ? value : DEFAULT_CPP_LANGUAGE
}

export function isLanguageMode(value: string): value is LanguageMode {
  return (LANGUAGE_MODES as string[]).includes(value)
}

export function isResolvedLanguage(value: string): value is ResolvedLanguage {
  return (RESOLVED_LANGUAGES as string[]).includes(value)
}

export function isCppLanguage(language: LanguageMode | ResolvedLanguage): boolean {
  return language.startsWith('cpp')
}

export function getLanguageLabel(language: LanguageMode | ResolvedLanguage): string {
  return LANGUAGE_LABELS[normalizeLanguageMode(language)]
}

export function getMonacoLanguage(language: ResolvedLanguage): 'c' | 'cpp' | 'python' {
  if (language === 'c') return 'c'
  if (language === 'python3') return 'python'
  return 'cpp'
}

export function resolveLanguageMode(languageMode: LanguageMode, code: string): ResolvedLanguage {
  if (languageMode !== 'auto') return languageMode
  if (looksLikePython(code)) return 'python3'
  if (looksLikeC(code)) return 'c'
  return DEFAULT_CPP_LANGUAGE
}

export function getJudge0LanguageId(language: ResolvedLanguage): number {
  if (language === 'c') return readPositiveInteger(process.env.JUDGE0_C_LANGUAGE_ID, DEFAULT_C_LANGUAGE_ID)
  if (language === 'python3') return readPositiveInteger(process.env.JUDGE0_PYTHON3_LANGUAGE_ID, DEFAULT_PYTHON3_LANGUAGE_ID)
  return readPositiveInteger(process.env.JUDGE0_CPP_LANGUAGE_ID, DEFAULT_CPP_LANGUAGE_ID)
}

export function getCompilerOptions(language: ResolvedLanguage): string | undefined {
  if (!isCppLanguage(language)) return undefined
  return `-std=${getCppStandard(language)} -pedantic-errors`
}

export function getCppStandard(language: ResolvedLanguage = DEFAULT_CPP_LANGUAGE): string {
  const defaultCppLanguage = DEFAULT_CPP_LANGUAGE as keyof typeof CPP_STANDARDS
  if (!isCppLanguage(language)) return CPP_STANDARDS[defaultCppLanguage]
  const cppLanguage = language as keyof typeof CPP_STANDARDS
  return CPP_STANDARDS[cppLanguage] ?? CPP_STANDARDS[defaultCppLanguage]
}

export function getLocalCppCompilerArgs(language: ResolvedLanguage = DEFAULT_CPP_LANGUAGE): string[] {
  return [`-std=${getCppStandard(language)}`, '-pedantic-errors', '-O2']
}

function looksLikePython(code: string): boolean {
  const stripped = stripStringLiterals(code)
  return (
    /^#!.*\bpython[0-9.]*\b/m.test(stripped) ||
    /^\s*(from\s+[A-Za-z_][\w.]*\s+import|import\s+[A-Za-z_][\w.]*)/m.test(stripped) ||
    /^\s*def\s+[A-Za-z_]\w*\s*\(/m.test(stripped) ||
    /^\s*if\s+__name__\s*==\s*['"]__main__['"]\s*:/m.test(stripped) ||
    /\bprint\s*\(/.test(stripped) ||
    /\binput\s*\(/.test(stripped) ||
    /\bfor\s+\w+\s+in\s+range\s*\(/.test(stripped)
  )
}

function looksLikeC(code: string): boolean {
  const stripped = stripStringLiterals(code)
  const hasCppToken = /#include\s*<iostream>|(?:std::)?(?:cin|cout|cerr)\b|using\s+namespace\s+std\b|\btemplate\s*</.test(
    stripped,
  )
  if (hasCppToken) return false

  return (
    /#include\s*<stdio\.h>/.test(stripped) ||
    /\b(?:printf|scanf|puts|gets|fgets|fprintf|fscanf)\s*\(/.test(stripped) ||
    /\bint\s+main\s*\(\s*(?:void)?\s*\)/.test(stripped)
  )
}

function stripStringLiterals(code: string): string {
  return code
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
