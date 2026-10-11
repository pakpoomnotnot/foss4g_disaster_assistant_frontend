// Client for the Rust backend — contract documented in backend/API.md

import type { DroughtProduct } from "@/lib/mapStyles";

export type Hazard = "flood" | "fire" | "drought";
/// Language of the answer, decided by the backend from the user's own words.
export type Lang = "th" | "en";
export type AdminLevel = "province" | "amphoe" | "tambon";

export interface ResolvedArea {
  area_idn: number;
  level: AdminLevel;
  name_th: string;
  name_en: string;
  /// Present on query results; the boundary tileset stops at amphoe, so a
  /// tambon outlines its parent instead.
  parent_area_idn?: number | null;
}

export interface Candidate extends ResolvedArea {
  province: string | null;
}

export interface ClarificationResponse {
  needs_clarification: true;
  message: string;
  candidates: Candidate[];
  /// Which part of the question was missing. "location" means everything else
  /// was understood, so the next thing the user types can be treated as the
  /// place and folded into the original question.
  missing: "location" | "hazard" | null;
}

export interface TimeRange {
  from: string;
  to: string;
  /// Thai label for the period actually searched — may differ from what was
  /// asked when implausible dates fell back to a relative window.
  label: string;
}

export interface QueryResultResponse {
  needs_clarification: false;
  hazard: Hazard;
  location_text: string;
  resolved_area: ResolvedArea;
  /// Any 1-365 now, not the old fixed set — an absolute range is reported via
  /// `time_range` instead.
  time_window_days: number;
  time_range: TimeRange;
  summary: string;
  geojson: GeoJSON.FeatureCollection;
  bbox: [number, number, number, number] | null;
  /// Features dropped because they fell outside the named area or date range.
  filtered_out: number;
  /// True when some upstream data could not be retrieved, so the result is
  /// known to be incomplete.
  truncated: boolean;
  /// Which drought product was searched. Non-null for every drought query now
  /// that a bare "ภัยแล้ง" means DRI+; null for flood and fire.
  dataset: DroughtProduct | null;
  stats: Stats;
  /// AI-written briefing over `stats`. Null when the model was unreachable —
  /// the numbers stand on their own, so this never blocks a result.
  analysis: string | null;
  /// Every string the backend wrote is in this language; the UI's own labels
  /// must follow it so a single answer never mixes the two.
  lang: Lang;
}

export interface Bucket {
  name: string;
  count: number;
  /// Percent of the total, one decimal.
  share: number;
  /// The folded remainder row, not a real place — excluded from bar scaling.
  other: boolean;
}

export interface StatCategory {
  title: string;
  buckets: Bucket[];
}

export interface Metric {
  label: string;
  value: string;
}

export interface Stats {
  total: number;
  /// One level below the queried area, or null when a tambon was queried.
  sub_level: AdminLevel | null;
  sub_level_label: string | null;
  breakdown: Bucket[];
  sub_areas_affected: number;
  categories: StatCategory[];
  /// Chronological, only for hazards whose features carry an event date.
  timeline: Bucket[];
  metrics: Metric[];
}

export type QueryResponse = ClarificationResponse | QueryResultResponse;

export interface ApiErrorBody {
  error: string;
}

export class DisasterApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "DisasterApiError";
  }
}

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080";

/// `areaIdn` is sent when the user picked a disambiguation chip; the server
/// then uses that area directly instead of resolving the name again.
export async function queryDisaster(
  text: string,
  areaIdn?: number,
): Promise<QueryResponse> {
  const res = await fetch(`${BACKEND_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, area_idn: areaIdn ?? null }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new DisasterApiError(
      res.status,
      body?.error ?? `request failed with status ${res.status}`,
    );
  }

  return (await res.json()) as QueryResponse;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  gazetteer_loaded: boolean;
  gazetteer_entries: number;
  gistda_token_valid: boolean;
  gistda_auth: "api_key" | "token";
  llm_reachable: boolean;
  llm_model: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BACKEND_URL}/api/health`);
  return (await res.json()) as HealthResponse;
}
