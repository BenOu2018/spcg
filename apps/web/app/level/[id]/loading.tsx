import type { CSSProperties } from 'react'

const PROGRAMMING_SCENE_BACKGROUND_STYLE = {
  background:
    'linear-gradient(rgba(7, 11, 10, 0.22), rgba(7, 11, 10, 0.22)), url("/assets/art/backgrounds/ch1-mist-town/programming-bg-clean-v1.webp?v=20260512") center / cover no-repeat',
} satisfies CSSProperties

export default function LevelLoading() {
  return (
    <main className="programming-scene route-loading-scene" style={PROGRAMMING_SCENE_BACKGROUND_STYLE}>
      <header className="route-loading-level-topbar">
        <span className="route-loading-logo" />
        <span className="route-loading-pill wide" />
        <span className="route-loading-pill" />
      </header>
      <section className="route-loading-level" aria-label="关卡加载中">
        <div className="route-loading-panel statement" />
        <div className="route-loading-panel editor" />
      </section>
    </main>
  )
}
