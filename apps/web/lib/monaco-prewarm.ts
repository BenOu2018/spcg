'use client'

let monacoPrewarmPromise: Promise<unknown> | null = null

export function prewarmMonacoEditor() {
  if (typeof window === 'undefined') return null
  if (monacoPrewarmPromise) return monacoPrewarmPromise

  monacoPrewarmPromise = import('@monaco-editor/react')
    .then(({ loader }) => {
      loader.config({
        paths: {
          vs: '/monaco/vs',
        },
      })
      return loader.init()
    })
    .catch((error) => {
      monacoPrewarmPromise = null
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Failed to prewarm Monaco editor: ${error instanceof Error ? error.message : String(error)}`)
      }
      return null
    })

  return monacoPrewarmPromise
}
