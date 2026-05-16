export default function TeacherStudentDetailLoading() {
  return (
    <section className="teacher-page" aria-busy="true">
      <section className="teacher-student-hero teacher-student-hero-loading">
        <div className="teacher-skeleton teacher-skeleton-avatar" />
        <div className="teacher-skeleton-stack">
          <div className="teacher-skeleton teacher-skeleton-line wide" />
          <div className="teacher-skeleton teacher-skeleton-line" />
        </div>
        <div className="teacher-skeleton teacher-skeleton-pill" />
      </section>

      <section className="teacher-stat-grid compact">
        {Array.from({ length: 8 }, (_, index) => (
          <article className="teacher-stat-card teacher-stat-card-loading" key={index}>
            <div className="teacher-skeleton teacher-skeleton-line" />
            <div className="teacher-skeleton teacher-skeleton-line wide" />
          </article>
        ))}
      </section>

      <nav className="teacher-tabs teacher-tabs-loading" aria-label="Teacher section tabs loading">
        {Array.from({ length: 6 }, (_, index) => (
          <span className="teacher-skeleton teacher-skeleton-tab" key={index} />
        ))}
      </nav>

      <section className="teacher-dashboard-grid">
        <div className="teacher-panel teacher-panel-loading">
          <div className="teacher-skeleton teacher-skeleton-line wide" />
          <div className="teacher-skeleton teacher-skeleton-block" />
        </div>
        <div className="teacher-panel teacher-panel-loading">
          <div className="teacher-skeleton teacher-skeleton-line wide" />
          <div className="teacher-skeleton teacher-skeleton-block" />
        </div>
      </section>
    </section>
  )
}
