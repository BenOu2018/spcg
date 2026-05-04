import {
  DEFAULT_CPP_LANGUAGE,
  getCompilerOptions,
  getCppStandard as getStandard,
  getJudge0LanguageId,
  getLocalCppCompilerArgs as getCompilerArgs,
  type ResolvedLanguage,
} from './language-config.js'

export function getCppLanguageId(): number {
  return getJudge0LanguageId(DEFAULT_CPP_LANGUAGE)
}

export function getCppStandard(language: ResolvedLanguage = DEFAULT_CPP_LANGUAGE): string {
  return getStandard(language)
}

export function getCppCompilerOptions(language: ResolvedLanguage = DEFAULT_CPP_LANGUAGE): string {
  return getCompilerOptions(language) ?? ''
}

export function getLocalCppCompilerArgs(language: ResolvedLanguage = DEFAULT_CPP_LANGUAGE): string[] {
  return getCompilerArgs(language)
}
