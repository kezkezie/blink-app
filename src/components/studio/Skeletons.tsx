/**
 * Shimmer placeholders shaped like the page that's coming (Kezie, 2026-10-16: "when I tap on tabs,
 * a quick response or a shimmer effect until the right data comes"). Used by the studio's
 * loading.tsx files (shown the instant a tab is tapped) and while a page fetches its data.
 */
const Bar = ({ w, h = 12, className = "" }: { w: number | string; h?: number; className?: string }) => (
  <div className={`s-skel ${className}`} style={{ width: w, height: h, borderRadius: 6 }} />
);

function Head({ actions = 2 }: { actions?: number }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="grid gap-2"><Bar w={180} h={18} /><Bar w={260} h={11} /></div>
      <div className="flex-1" />
      {Array.from({ length: actions }).map((_, i) => <Bar key={i} w={96} h={32} />)}
    </div>
  );
}

/** A page is loading: a header and a few blocks. */
export function PageSkeleton() {
  return (
    <div className="p-4 md:p-6 mx-auto w-full max-w-[1180px]" aria-busy="true" aria-label="Loading">
      <Head />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="s-skel" style={{ height: 320 }} />
        <div className="grid gap-3 content-start"><div className="s-skel" style={{ height: 96 }} /><div className="s-skel" style={{ height: 96 }} /><div className="s-skel" style={{ height: 96 }} /></div>
      </div>
    </div>
  );
}

/** The Library: a grid of tiles. */
export function GridSkeleton({ tiles = 12 }: { tiles?: number }) {
  return (
    <div className="p-4 md:p-6 mx-auto w-full max-w-[1320px]" aria-busy="true" aria-label="Loading">
      <Head actions={3} />
      <div className="flex gap-2 mb-4">{Array.from({ length: 5 }).map((_, i) => <Bar key={i} w={72} h={28} />)}</div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
        {Array.from({ length: tiles }).map((_, i) => <div key={i} className="s-skel" style={{ aspectRatio: "4 / 5" }} />)}
      </div>
    </div>
  );
}

/** The calendar: a week grid. */
export function CalendarSkeleton() {
  return (
    <div className="p-4 md:p-6 mx-auto w-full max-w-[1320px]" aria-busy="true" aria-label="Loading">
      <Head actions={3} />
      <div className="grid grid-cols-7 gap-2 mb-2">{Array.from({ length: 7 }).map((_, i) => <Bar key={i} w="60%" h={11} />)}</div>
      <div className="grid grid-cols-7 gap-2">{Array.from({ length: 35 }).map((_, i) => <div key={i} className="s-skel" style={{ height: 96 }} />)}</div>
    </div>
  );
}

/** Settings-like pages (Brand, Settings, Billing): sections of labelled fields. */
export function FormSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div className="p-4 md:p-6 mx-auto w-full max-w-[980px]" aria-busy="true" aria-label="Loading">
      <Head actions={1} />
      <div className="grid gap-4">
        {Array.from({ length: sections }).map((_, s) => (
          <div key={s} className="s-card p-5 grid gap-4">
            <Bar w={140} h={14} />
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="grid gap-2"><Bar w={90} h={10} /><div className="s-skel" style={{ height: 38 }} /></div>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A post or an editor: the picture on the left, a panel on the right. */
export function DetailSkeleton() {
  return (
    <div className="p-4 md:p-6 mx-auto w-full max-w-[1320px]" aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-3 mb-5"><Bar w={120} h={28} /><div className="flex-1" /><Bar w={110} h={30} /><Bar w={110} h={30} /><Bar w={110} h={30} /></div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,1fr)] items-start">
        <div className="s-skel" style={{ aspectRatio: "4 / 5", maxHeight: "72dvh" }} />
        <div className="s-card p-4 grid gap-3">
          <Bar w={160} h={16} /><Bar w="90%" h={11} /><Bar w="70%" h={11} />
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="s-skel" style={{ height: 44 }} />)}
        </div>
      </div>
    </div>
  );
}

/** A list of rows (approvals, skills). */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="p-4 md:p-6 mx-auto w-full max-w-[980px]" aria-busy="true" aria-label="Loading">
      <Head actions={1} />
      <div className="grid gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="s-card p-3 flex items-center gap-3">
            <div className="s-skel shrink-0" style={{ width: 56, height: 56 }} />
            <div className="grid gap-2 flex-1"><Bar w="45%" h={13} /><Bar w="70%" h={10} /></div>
            <Bar w={84} h={30} />
          </div>
        ))}
      </div>
    </div>
  );
}
