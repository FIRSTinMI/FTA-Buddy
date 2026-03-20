/**
 * styles.ts — CSS that exactly replicates FTA Buddy's Monitor.svelte styling.
 * Colors and grid definitions are copied directly from app/src/app.css.
 */

export const CSS = `
/* ── Reset / root ───────────────────────────────────────────── */
#fta-buddy-root {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
  background: #424242;   /* neutral-800 */
  color: #fff;
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-size: 14px;
  box-sizing: border-box;
}
#fta-buddy-root *, #fta-buddy-root *::before, #fta-buddy-root *::after {
  box-sizing: border-box;
}
#fta-buddy-root p { margin: 0; }
#fta-buddy-root button {
  background: none;
  border: none;
  color: inherit;
  cursor: default;
  padding: 0;
}

/* ── Scroll container ────────────────────────────────────────── */
#fb-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── Main grid (grid-cols-fieldmonitor) ──────────────────────── */
.fb-grid {
  display: grid;
  gap: 0.125rem;   /* gap-0.5 */
  margin: 0 auto;
  justify-content: center;
}

/* Mobile < 768px */
@media screen and (max-width: 767px) {
  .fb-grid {
    grid-template-columns: auto 1fr 1fr 1fr auto auto;
    padding: 0 0.25rem;
  }
  .fm-sq-h {
    height: calc((100dvh - 220px) / 6);
  }
}

/* Tablet 768–1023px */
@media screen and (min-width: 768px) and (max-width: 1023px) {
  .fb-grid {
    grid-template-columns: minmax(auto, 1fr) 1fr 1fr 1fr auto minmax(auto, 1fr);
    width: fit-content;
  }
  .fm-sq-h {
    height: calc((100dvh - 240px) / 6);
  }
}

/* Desktop ≥ 1024px */
@media screen and (min-width: 1024px) {
  .fb-grid {
    grid-template-columns: minmax(auto, 1fr) auto auto auto auto auto minmax(auto, 1fr) minmax(auto, 1fr) auto;
    width: fit-content;
    gap: 0.25rem;   /* md:gap-1 */
  }
  .fm-sq-h {
    height: calc((100dvh - 235px) / 6);
  }
}

/* Short desktop (≤ 780px tall) */
@media screen and (min-width: 1024px) and (max-height: 780px) {
  .fm-sq-h {
    height: calc((100dvh - 160px) / 6);
  }
}

/* Very tall screens */
@media screen and (min-height: 1200px) {
  .fm-sq-h {
    height: calc((1200px - 235px) / 6);
  }
}

/* ── Header / footer span rows ───────────────────────────────── */
.fb-span-row {
  grid-column: 1 / -1;
  display: flex;
  font-size: 1.5rem;
  font-weight: 600;
}
@media screen and (min-width: 768px) {
  .fb-span-row { font-size: 2rem; }
}
@media screen and (min-width: 1024px) {
  .fb-span-row { font-size: 3rem; }   /* matches lg:text-5xl fullscreen */
}
.fb-span-row .fb-left  { padding: 0 0.5rem; }
.fb-span-row .fb-mid   { flex: 1; padding: 0 0.5rem; text-align: center; }
.fb-span-row .fb-right { padding: 0 0.5rem; display: flex; align-items: center; gap: 0.25rem; }
.fb-span-row .fb-grow  { flex: 1; }
#fb-fullscreen-btn {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 0.1rem;
  opacity: 0.8;
}
#fb-fullscreen-btn:hover { opacity: 1; }
#fb-fullscreen-btn svg { width: 1.5rem; height: 1.5rem; }
@media screen and (min-width: 768px) { #fb-fullscreen-btn svg { width: 2rem; height: 2rem; } }
@media screen and (min-width: 1024px) { #fb-fullscreen-btn svg { width: 2.5rem; height: 2.5rem; } }

/* ── Column header p tags ────────────────────────────────────── */
.fb-grid > p {
  font-size: 0.875rem;
  color: #bdbdbd;
  padding: 0 2px;
}

/* ── Team cell ───────────────────────────────────────────────── */
/* NOTE: rules that set background/color on buttons must be scoped
   under #fta-buddy-root to beat the button reset (1,0,1 specificity). */
#fta-buddy-root .fb-team {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 0.25rem;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 1rem;
}
@media screen and (min-width: 640px)  { #fta-buddy-root .fb-team { font-size: 1.25rem; } }
@media screen and (min-width: 1024px) { #fta-buddy-root .fb-team { font-size: 1.5rem; } }
@media screen and (min-width: 1280px) { #fta-buddy-root .fb-team { font-size: 1.875rem; } }
#fta-buddy-root .fb-team.blue { background: #2563eb; }  /* bg-blue-600 */
#fta-buddy-root .fb-team.red  { background: #dc2626; }  /* bg-red-600  */
.fb-team-num  { line-height: 1.2; }
.fb-team-warn { font-size: 0.875rem; display: flex; }
@media screen and (min-width: 1024px) { .fb-team-warn { font-size: 0.875rem; } }
@media screen and (min-width: 1280px) { .fb-team-warn { font-size: 1.25rem; } }

/* ── DS / Radio / RIO squares ────────────────────────────────── */
#fta-buddy-root .fb-sq {
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 2.25rem;
  color: #000;
  aspect-ratio: 1;
}
@media screen and (min-width: 1024px) { #fta-buddy-root .fb-sq { font-size: 3rem; } }
@media screen and (min-width: 1280px) { #fta-buddy-root .fb-sq { font-size: 3.75rem; } }
@media screen and (min-width: 1536px) { #fta-buddy-root .fb-sq { font-size: 6rem; } }
/* DS state colors */
#fta-buddy-root .fb-sq.ds-0 { background: #dc2626; }   /* RED */
#fta-buddy-root .fb-sq.ds-1 { background: #22c55e; border-radius: 9999px; }   /* GREEN */
#fta-buddy-root .fb-sq.ds-2 { background: #22c55e; border-radius: 9999px; }   /* GREEN_X */
#fta-buddy-root .fb-sq.ds-3 { background: #facc15; }   /* MOVE_STATION */
#fta-buddy-root .fb-sq.ds-4 { background: #facc15; }   /* WAITING */
#fta-buddy-root .fb-sq.ds-5 { background: #991b1b; }   /* BYPASS */
#fta-buddy-root .fb-sq.ds-6 { background: #991b1b; }   /* ESTOP */
#fta-buddy-root .fb-sq.ds-7 { background: #16a34a; }   /* ASTOP */
/* Status (radio/rio) */
#fta-buddy-root .fb-sq.st-0 { background: #dc2626; }   /* disconnected */
#fta-buddy-root .fb-sq.st-1 { background: #22c55e; border-radius: 9999px; }   /* connected */

/* ── Battery / Ping metric cells ─────────────────────────────── */
.fb-metric {
  padding: 0;
  position: relative;
  overflow: hidden;
  aspect-ratio: 1;
}
.fb-metric-graph {
  height: 100%;
  text-align: center;
  top: 0;
  padding: 0 0.125rem;
  aspect-ratio: 1;
}
.fb-metric-graph svg {
  width: 100%;
  height: 100%;
}
.fb-metric-graph svg path {
  stroke: gray;
  stroke-width: 2;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.fb-metric-val {
  position: absolute;
  width: 100%;
  bottom: 0.25rem;
  left: 0;
  padding: 0 0.25rem;
  font-variant-numeric: tabular-nums;
  font-size: 0.875rem;
  line-height: 1;
}
@media screen and (min-width: 640px)  { .fb-metric-val { font-size: 1rem; } }
@media screen and (min-width: 1024px) { .fb-metric-val { font-size: 1.125rem; } }
@media screen and (min-width: 1280px) {
  .fb-metric-val { font-size: 1.25rem; bottom: 0.5rem; }
}
@media screen and (min-width: 1536px) { .fb-metric-val { font-size: 1.875rem; } }
.fb-metric-sub {
  position: absolute;
  bottom: 0;
  left: 0;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  color: #9e9e9e;   /* text-gray-500 */
}
@media screen and (min-width: 1280px) { .fb-metric-sub { font-size: 0.875rem; } }

/* Ping cell only shown on desktop */
.fb-ping { display: none; }
@media screen and (min-width: 1024px) { .fb-ping { display: flex; } }

/* ── BWU cell ────────────────────────────────────────────────── */
.fb-bwu {
  display: none;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 0.25rem;
  font-variant-numeric: tabular-nums;
  font-size: 0.875rem;
}
@media screen and (min-width: 640px)  { .fb-bwu { font-size: 1rem; } }
@media screen and (min-width: 1024px) { .fb-bwu { display: flex; font-size: 1.125rem; } }
@media screen and (min-width: 1280px) { .fb-bwu { font-size: 1.25rem; padding-bottom: 0.5rem; } }
@media screen and (min-width: 1536px) { .fb-bwu { font-size: 1.875rem; } }

/* ── Signal cell ─────────────────────────────────────────────── */
.fb-signal {
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  overflow: hidden;
  aspect-ratio: 1;
}
@media screen and (min-width: 1024px) { .fb-signal { display: flex; } }
.fb-signal span {
  font-size: 0.75rem;
}
@media screen and (min-width: 1280px) { .fb-signal span { font-size: 0.875rem; } }
@media screen and (min-width: 1536px) { .fb-signal span { font-size: 1rem; } }
.fb-signal svg {
  width: 2.5rem;
  height: 2.5rem;
}
@media screen and (min-width: 1024px) { .fb-signal svg { width: 3rem; height: 3rem; } }
@media screen and (min-width: 1280px) { .fb-signal svg { width: 3.5rem; height: 3.5rem; } }
@media screen and (min-width: 1536px) { .fb-signal svg { width: 5rem; height: 5rem; } }

/* ── Last change cell ────────────────────────────────────────── */
.fb-lastchange {
  display: none;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 0.25rem;
  font-variant-numeric: tabular-nums;
  font-size: 0.875rem;
}
@media screen and (min-width: 640px)  { .fb-lastchange { font-size: 1rem; } }
@media screen and (min-width: 1024px) { .fb-lastchange { display: flex; font-size: 1.125rem; } }
@media screen and (min-width: 1280px) { .fb-lastchange { font-size: 1.25rem; padding-bottom: 0.5rem; } }
@media screen and (min-width: 1536px) { .fb-lastchange { font-size: 1.875rem; } }

/* ── Net cell (mobile only, shows ping+bwu+signal combined) ──── */
.fb-net {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  font-variant-numeric: tabular-nums;
  font-size: 0.875rem;
}
@media screen and (min-width: 1024px) { .fb-net { display: none; } }

/* ── Column header visibility helpers ───────────────────────── */
/* .fb-col-dt — desktop-only column header (Ping/BWU/Signal/LastChange) */
.fb-col-dt { display: none; }
@media screen and (min-width: 1024px) { .fb-col-dt { display: block; } }
/* .fb-col-mb — mobile-only column header (Net) */
.fb-col-mb { display: block; }
@media screen and (min-width: 1024px) { .fb-col-mb { display: none; } }

/* ── Bottom nav ──────────────────────────────────────────────── */
#fb-bottomnav {
  flex-shrink: 0;
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  background: #212121;   /* neutral-900 */
  color: #fff;
}
#fb-bottomnav button {
  padding: 0.5rem;
}
#fb-bottomnav svg {
  width: 2rem;
  height: 2rem;
}
`;
