export default function MapLoading() {
  return (
    <main className="village-scene route-loading-scene">
      <header className="route-loading-map-hud">
        <span className="route-loading-logo" />
        <span className="route-loading-pill wide" />
        <span className="route-loading-pill" />
      </header>
      <section className="route-loading-map" aria-label="地图加载中">
        <div className="route-loading-map-node node-one" />
        <div className="route-loading-map-node node-two" />
        <div className="route-loading-map-node node-three" />
        <div className="route-loading-map-path" />
      </section>
    </main>
  )
}
