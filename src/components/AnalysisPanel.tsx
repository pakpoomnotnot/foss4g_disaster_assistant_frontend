"use client";

import type { Bucket, Lang, ResolvedArea, Stats } from "@/lib/api";
import { categoryColor, type DroughtProduct } from "@/lib/mapStyles";
import {
  ABOUT_HEADING,
  SCALE_HEADING,
  productInfo,
} from "@/lib/productInfo";

// Single-series magnitude charts, so one sequential hue rather than a
// categorical palette — the bars are the same measure, not different things.
// Light/dark steps are chosen per surface, not flipped automatically.
const SERIES = "var(--viz-series)";

/// The panel's own chrome. Everything else on screen is written by the backend
/// in the answer's language, so these have to follow it or a single reply ends
/// up half Thai and half English.
const UI = {
  th: {
    title: "สรุปข้อมูล",
    close: "ปิดสรุปข้อมูล",
    aiNote: "คำอธิบายสร้างโดย AI จากตัวเลขด้านล่าง",
    empty: "ไม่พบข้อมูลในพื้นที่และช่วงเวลาที่ระบุ",
    total: "รายการทั้งหมด",
    affected: (level: string) => `${level}ที่พบข้อมูล`,
    metrics: "ตัวชี้วัด",
    breakdown: (level: string) => `แยกตาม${level}`,
    perDay: "จำนวนต่อวัน",
    peak: (n: string) => `สูงสุด ${n}`,
    fallbackLevel: "พื้นที่",
    locale: "th-TH",
  },
  en: {
    title: "Summary",
    close: "Close summary",
    aiNote: "Written by AI from the figures below",
    empty: "No data found for this area and period",
    total: "Total records",
    affected: (level: string) => `${level}s with data`,
    metrics: "Metrics",
    breakdown: (level: string) => `By ${level}`,
    perDay: "Per day",
    peak: (n: string) => `peak ${n}`,
    fallbackLevel: "area",
    locale: "en-GB",
  },
} as const;

interface Props {
  stats: Stats | null;
  analysis: string | null;
  area: ResolvedArea | null;
  lang: Lang;
  /// Which drought index is on screen, so the panel can explain it.
  dataset: DroughtProduct | null;
  open: boolean;
  onClose: () => void;
}

export default function AnalysisPanel({
  stats,
  analysis,
  area,
  lang,
  dataset,
  open,
  onClose,
}: Props) {
  if (!open || !stats) return null;

  const t = UI[lang];
  const hasData = stats.total > 0;
  const level = stats.sub_level_label ?? t.fallbackLevel;
  const num = (n: number) => n.toLocaleString(t.locale);

  return (
    <div className="glass-strong viz absolute right-3 top-3 bottom-3 z-20 flex w-[min(22rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-3xl">
      <header className="flex items-center justify-between gap-2 border-b border-foreground/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{t.title}</h2>
          {area && (
            <p className="truncate text-[11px] text-foreground/60">
              {lang === "th" ? area.name_th : area.name_en}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="shrink-0 rounded-full px-2 py-1 text-sm text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {analysis && (
          <section>
            <p className="text-[12.5px] leading-relaxed text-foreground/90">
              {analysis}
            </p>
            <p className="mt-1.5 text-[10px] text-foreground/45">{t.aiNote}</p>
          </section>
        )}

        {!hasData ? (
          <p className="text-[12.5px] text-foreground/70">{t.empty}</p>
        ) : (
          <>
            <KpiRow stats={stats} t={t} level={level} num={num} />
            {stats.metrics.length > 0 && <Metrics stats={stats} title={t.metrics} />}
            {stats.breakdown.length > 0 && (
              <BarBlock
                title={t.breakdown(level)}
                buckets={stats.breakdown}
                colorFor={() => SERIES}
                num={num}
              />
            )}
            {stats.categories.map((c) => (
              <BarBlock
                key={c.title}
                title={c.title}
                buckets={c.buckets}
                colorFor={(name) => categoryColor(c.title, name) ?? SERIES}
                num={num}
              />
            ))}
            {stats.timeline.length > 1 && (
              <Timeline buckets={stats.timeline} t={t} num={num} />
            )}
          </>
        )}

        {/* Shown even on an empty result: "no DRI+ data" is only meaningful if
            you know what DRI+ measures. */}
        {dataset && <AboutDataset product={dataset} lang={lang} />}
      </div>
    </div>
  );
}

/// Explains the index behind the numbers. The three drought products share one
/// Thai word and one endpoint but are measured on incompatible scales, so the
/// panel says which one is on screen and how to read it.
function AboutDataset({
  product,
  lang,
}: {
  product: DroughtProduct;
  lang: Lang;
}) {
  const info = productInfo(product, lang);
  return (
    <section className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2.5">
      <h3 className="text-[11px] font-medium text-foreground/70">
        {ABOUT_HEADING[lang]}
      </h3>
      <p className="mt-1.5 text-[12px] font-semibold">{info.name}</p>
      {info.expansion && (
        <p className="text-[10.5px] text-foreground/55">{info.expansion}</p>
      )}
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-foreground/85">
        {info.body}
      </p>
      <p className="mt-2 text-[10px] font-medium text-foreground/60">
        {SCALE_HEADING[lang]}
      </p>
      <p className="text-[11.5px] leading-relaxed text-foreground/85">
        {info.scale}
      </p>
    </section>
  );
}

type Copy = (typeof UI)[Lang];

function KpiRow({
  stats,
  t,
  level,
  num,
}: {
  stats: Stats;
  t: Copy;
  level: string;
  num: (n: number) => string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Tile value={num(stats.total)} label={t.total} />
      <Tile value={num(stats.sub_areas_affected)} label={t.affected(level)} />
    </div>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="glass-chip rounded-2xl px-3 py-2.5">
      <div className="text-xl font-semibold leading-tight">{value}</div>
      <div className="mt-0.5 text-[10.5px] text-foreground/60">{label}</div>
    </div>
  );
}

function Metrics({ stats, title }: { stats: Stats; title: string }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-medium text-foreground/70">{title}</h3>
      <dl className="overflow-hidden rounded-2xl border border-foreground/10">
        {stats.metrics.map((m, i) => (
          <div
            key={m.label}
            className={
              "flex items-baseline justify-between gap-3 px-3 py-1.5 " +
              (i % 2 ? "bg-foreground/[0.03]" : "")
            }
          >
            <dt className="text-[11px] text-foreground/60">{m.label}</dt>
            <dd className="text-[12px] font-medium tabular-nums">{m.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/// Horizontal bars: the categories are long Thai place names, which a column
/// chart would have to rotate or truncate. Every row is name + bar + count, so
/// the value is readable without the bar and identity never rests on colour.
function BarBlock({
  title,
  buckets,
  colorFor,
  num,
}: {
  title: string;
  buckets: Bucket[];
  colorFor: (name: string) => string;
  num: (n: number) => string;
}) {
  // Scaled to the largest REAL bar, not to the total and not to the folded
  // remainder: "อื่นๆ (18 พื้นที่)" routinely out-counts the biggest single
  // area, and letting it set the scale made the residual look like the top
  // district while squashing everything else.
  const max = Math.max(...buckets.filter((b) => !b.other).map((b) => b.count), 1);

  return (
    <section>
      <h3 className="mb-2 text-[11px] font-medium text-foreground/70">
        {title}
      </h3>
      <ul className="space-y-1.5">
        {buckets.map((b) => (
          <li key={b.name} title={`${b.name} — ${b.count} (${b.share}%)`}>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span
                className={
                  "min-w-0 truncate " +
                  (b.other ? "italic text-foreground/55" : "text-foreground/85")
                }
              >
                {b.name}
              </span>
              <span className="shrink-0 tabular-nums text-foreground/60">
                {num(b.count)}
                <span className="ml-1 text-foreground/40">{b.share}%</span>
              </span>
            </div>
            <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-foreground/10">
              <div
                className={"h-full rounded-full " + (b.other ? "opacity-40" : "")}
                style={{
                  width: `${Math.min(Math.max((b.count / max) * 100, 2), 100)}%`,
                  backgroundColor: b.other
                    ? "var(--viz-muted)"
                    : colorFor(b.name),
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/// Counts per day. A column chart because time reads left-to-right; labels are
/// selective (first and last only) since one label per day would be unreadable.
function Timeline({
  buckets,
  t,
  num,
}: {
  buckets: Bucket[];
  t: Copy;
  num: (n: number) => string;
}) {
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const first = buckets[0]?.name.slice(5);
  const last = buckets[buckets.length - 1]?.name.slice(5);

  return (
    <section>
      <h3 className="mb-2 text-[11px] font-medium text-foreground/70">
        {t.perDay}
      </h3>
      <div className="flex h-20 items-end gap-px">
        {buckets.map((b) => (
          <div
            key={b.name}
            title={`${b.name} — ${b.count}`}
            className="min-w-0 flex-1 rounded-t-[3px]"
            style={{
              height: `${Math.max((b.count / max) * 100, 3)}%`,
              backgroundColor: SERIES,
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-foreground/50">
        <span>{first}</span>
        <span>{t.peak(num(max))}</span>
        <span>{last}</span>
      </div>
    </section>
  );
}
