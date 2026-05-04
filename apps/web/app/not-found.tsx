import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="page-shell empty-state">
      <h1>没有找到这道题</h1>
      <Link className="button primary" href="/map">
        回到地图
      </Link>
    </main>
  )
}

