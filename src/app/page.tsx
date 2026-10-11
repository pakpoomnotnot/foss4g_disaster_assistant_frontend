"use client";

import { useState } from "react";
import DisasterChat from "@/components/DisasterChat";
import DisasterMap from "@/components/DisasterMap";
import AnalysisPanel from "@/components/AnalysisPanel";
import type {
  Hazard,
  Lang,
  QueryResultResponse,
  ResolvedArea,
  Stats,
} from "@/lib/api";
import type { DroughtProduct } from "@/lib/mapStyles";

export default function Home() {
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(
    null,
  );
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(
    null,
  );
  const [hazard, setHazard] = useState<Hazard | null>(null);
  const [area, setArea] = useState<ResolvedArea | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("th");
  const [dataset, setDataset] = useState<DroughtProduct | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  function handleResult(result: QueryResultResponse) {
    setGeojson(result.geojson);
    setBbox(result.bbox);
    setHazard(result.hazard);
    setArea(result.resolved_area);
    setStats(result.stats);
    setAnalysis(result.analysis);
    setLang(result.lang);
    setDataset(result.dataset);
    // Opens itself when there is something to say — the summary is the point of
    // asking, not a secondary view to go hunting for. An empty result leaves it
    // shut rather than presenting a panel of zeroes.
    setPanelOpen(result.stats.total > 0);
  }

  return (
    <div className="flex flex-1 flex-col gap-3 p-3 sm:flex-row">
      {/* h-[45vh] with min-h-0 keeps the chat's input row inside the panel; see
          the note in DisasterChat about what happens without it. */}
      <aside className="glass flex h-[45vh] min-h-0 w-full flex-col overflow-hidden rounded-3xl sm:h-auto sm:w-[380px]">
        <DisasterChat onResult={handleResult} />
      </aside>
      <main className="glass relative flex flex-1 overflow-hidden rounded-3xl">
        <DisasterMap geojson={geojson} bbox={bbox} hazard={hazard} area={area} />
        {stats && stats.total > 0 && !panelOpen && (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            /* Right side, clear of MapLibre's zoom control above it (which
               ends 100px down) and of the legend stack at bottom-left. */
            className="glass-chip absolute right-3 top-28 z-20 rounded-full px-3 py-1.5 text-[11px] text-foreground/80 transition-colors hover:text-foreground"
          >
            {lang === "th" ? "สรุปข้อมูล" : "Summary"}
          </button>
        )}
        <AnalysisPanel
          stats={stats}
          analysis={analysis}
          area={area}
          lang={lang}
          dataset={dataset}
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
        />
      </main>
    </div>
  );
}
