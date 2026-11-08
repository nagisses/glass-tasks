/** Skeleton screens shown while each view loads, shaped like the real content. */

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="sk-group glass" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="sk-row" key={i}>
          <span className="sk sk-dot" />
          <span className="sk sk-line" style={{ width: `${[78, 56, 68, 46][i % 4]}%` }} />
        </div>
      ))}
    </div>
  );
}

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <>
      <div className="sk-section-head">
        <span className="sk sk-line" style={{ width: 72 }} />
      </div>
      <SkeletonRows count={rows} />
    </>
  );
}

export function HomeSkeleton() {
  return (
    <div className="skeleton-page" data-testid="skeleton" aria-busy="true" aria-label="読み込み中">
      <div className="sk sk-carousel" />
      <div className="sk-dots">
        <span className="sk" />
        <span className="sk" />
        <span className="sk" />
      </div>
      <div className="sk-toolbar">
        <span className="sk sk-line" style={{ width: 120 }} />
        <span className="sk sk-pill" style={{ width: 92 }} />
      </div>
      <SectionSkeleton rows={3} />
      <SectionSkeleton rows={2} />
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="skeleton-page" data-testid="skeleton" aria-busy="true" aria-label="読み込み中">
      <div className="sk sk-banner" />
      <div className="sk-toolbar">
        <span className="sk sk-line" style={{ width: 90 }} />
        <span className="sk sk-pill" style={{ width: 92 }} />
      </div>
      <SectionSkeleton rows={3} />
      <SectionSkeleton rows={2} />
    </div>
  );
}

export function TaskSkeleton() {
  return (
    <div className="skeleton-page" data-testid="skeleton" aria-busy="true" aria-label="読み込み中">
      <div className="sk-card glass">
        <span className="sk sk-title" />
        <span className="sk sk-line" style={{ width: 64, marginTop: 22 }} />
        <span className="sk sk-segment" />
        <span className="sk sk-line" style={{ width: 52, marginTop: 18 }} />
        <span className="sk sk-segment" />
        <div className="sk-field">
          <span className="sk sk-line" style={{ width: 48 }} />
          <span className="sk sk-pill" style={{ width: 120 }} />
        </div>
        <div className="sk-field">
          <span className="sk sk-line" style={{ width: 48 }} />
          <span className="sk sk-pill" style={{ width: 140 }} />
        </div>
      </div>
      <SectionSkeleton rows={3} />
    </div>
  );
}

export function MenuListSkeleton() {
  return (
    <div className="sk-menu" data-testid="menu-skeleton" aria-busy="true" aria-label="読み込み中">
      {[70, 52, 60].map((w, i) => (
        <div className="sk-menu-row" key={i}>
          <span className="sk sk-thumb" />
          <span className="sk sk-line" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

export function SuggestionSkeleton() {
  return (
    <div className="sk-suggest" data-testid="ai-skeleton" aria-busy="true" aria-label="読み込み中">
      {[82, 64, 74, 56].map((w, i) => (
        <div className="sk-row" key={i}>
          <span className="sk sk-box" />
          <span className="sk sk-line" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

/** Full app shell skeleton (session check). Mirrors the static boot shell in index.html. */
export function AppSkeleton() {
  return (
    <div className="app" aria-busy="true">
      <header className="topbar glass">
        <span className="sk sk-circle" />
        <span className="sk sk-pill" style={{ width: 96 }} />
      </header>
      <main className="page">
        <HomeSkeleton />
      </main>
    </div>
  );
}
