// Classification + legend definitions for the result layers.
//
// The fire paint specs are taken verbatim from the existing GISTDA viewer so
// the same hotspot is the same colour in both tools. The drought and flood
// palettes are read off that viewer's legend screenshots — see DRI_COLORS.

import type {
  CircleLayerSpecification,
  FillLayerSpecification,
} from "maplibre-gl";
import type { Hazard } from "@/lib/api";

export interface LegendEntry {
  color: string;
  label: string;
  /// Optional caption under the swatch, used by the DRI+ ramp ("ต่ำ" … "สูงมาก").
  sub?: string;
  /// English name the backend sends for this class when the answer is English.
  /// Kept here so a chart row still resolves to the map's colour in either
  /// language — see `categoryColor`.
  en?: string;
}

export interface LegendSpec {
  title: string;
  entries: LegendEntry[];
  /// A continuous ramp renders as a joined bar; categories render as dots.
  ramp?: boolean;
  note?: string;
}

/* ------------------------------------------------------------------ fire */

/// Which hotspot attribute drives the colour. Both classifications ship with
/// the data, and neither is a superset of the other — a hotspot in a national
/// forest (`lu_name`) may be burning sugarcane (`lu_hp_name`).
export type FireClassification = "responsibility" | "utilization";

export const FIRE_CLASSIFICATION_LABEL: Record<FireClassification, string> = {
  responsibility: "พื้นที่รับผิดชอบ",
  utilization: "การใช้ประโยชน์",
};

const HOTSPOT_SIZING = {
  "circle-radius": [
    "interpolate",
    ["linear"],
    ["zoom"],
    0,
    1,
    5,
    2,
    8,
    4,
    11,
    5,
    22,
    16,
  ],
  "circle-stroke-color": "rgba(98,87,87,1)",
  "circle-stroke-opacity": [
    "interpolate",
    ["linear"],
    ["zoom"],
    0,
    0.32,
    13,
    0.5,
    15,
    0.8,
    22,
    1,
  ],
  "circle-stroke-width": [
    "interpolate",
    ["linear"],
    ["zoom"],
    0,
    0,
    13,
    1,
    22,
    0.5,
  ],
} satisfies CircleLayerSpecification["paint"];

/// Colour by the agency responsible for the land (`lu_name`). The trailing
/// value is the `match` fallback, which in the source viewer's legend is
/// labelled "นอกประเทศ".
export const HotSpotByRes: CircleLayerSpecification["paint"] = {
  "circle-color": [
    "match",
    ["get", "lu_name"],
    ["พื้นที่เกษตร"],
    "#EED321",
    ["เขต สปก."],
    "#F16EF7",
    ["ป่าอนุรักษ์"],
    "#6DED46",
    ["ป่าสงวนแห่งชาติ"],
    "#478F4A",
    ["พื้นที่ริมทางหลวง"],
    "#B07441",
    ["ชุมชนและอื่น ๆ"],
    "#B3B3B3",
    "#FF7C0A",
  ],
  ...HOTSPOT_SIZING,
};

/// Colour by what the land is used for (`lu_hp_name`).
export const HotSpotByUtilization: CircleLayerSpecification["paint"] = {
  "circle-color": [
    "match",
    ["get", "lu_hp_name"],
    ["พื้นที่ป่า"],
    "#00734c",
    ["เกษตรอื่น ๆ"],
    "#a87000",
    ["อ้อย"],
    "#99e600",
    ["นาข้าว"],
    "#ffff00",
    ["ข้าวโพดและไร่หมุนเวียน"],
    "#ffaa00",
    ["อื่น ๆ"],
    "#828282",
    "#FF7C0A",
  ],
  ...HOTSPOT_SIZING,
};

export const FIRE_PAINT: Record<
  FireClassification,
  CircleLayerSpecification["paint"]
> = {
  responsibility: HotSpotByRes,
  utilization: HotSpotByUtilization,
};

const FIRE_LEGEND: Record<FireClassification, LegendSpec> = {
  responsibility: {
    title: "พื้นที่รับผิดชอบ",
    entries: [
      { color: "#6DED46", label: "ป่าอนุรักษ์", en: "Conservation forest" },
      { color: "#F16EF7", label: "เขต สปก.", en: "ALRO land" },
      { color: "#478F4A", label: "ป่าสงวนแห่งชาติ", en: "National reserved forest" },
      { color: "#B07441", label: "พื้นที่ริมทางหลวง", en: "Highway margin" },
      { color: "#EED321", label: "พื้นที่เกษตร", en: "Agricultural land" },
      { color: "#B3B3B3", label: "ชุมชนและอื่น ๆ", en: "Community and other" },
      { color: "#FF7C0A", label: "นอกประเทศ", en: "Outside Thailand" },
    ],
  },
  utilization: {
    title: "การใช้ประโยชน์ที่ดิน",
    entries: [
      { color: "#00734c", label: "พื้นที่ป่า", en: "Forest" },
      { color: "#99e600", label: "อ้อย", en: "Sugarcane" },
      { color: "#ffff00", label: "นาข้าว", en: "Paddy field" },
      { color: "#ffaa00", label: "ข้าวโพดและไร่หมุนเวียน", en: "Maize and shifting cultivation" },
      { color: "#a87000", label: "เกษตรอื่น ๆ", en: "Other agriculture" },
      { color: "#828282", label: "อื่น ๆ", en: "Other" },
      { color: "#FF7C0A", label: "นอกประเทศ", en: "Outside Thailand" },
    ],
  },
};

/* --------------------------------------------------------------- drought */

/// Eyeballed from the viewer's DRI+ legend screenshot rather than copied from
/// source, so these four are the values to correct if they look off — nothing
/// else depends on them.
const DRI_COLORS = {
  low: "#F7E9A0",
  medium: "#FFD24D",
  high: "#FF8C1A",
  veryHigh: "#FF1A1A",
  /// Below 50 is not "drought risk" at all; the source legend simply omits it,
  /// but the data still contains those cells and they have to draw as
  /// something. Muted so the at-risk classes stay readable.
  none: "#D8D8D8",
};

/// Soil moisture, read off the SMAP legend screenshot. Same caveat as DRI+.
const SMAP_COLORS = {
  veryLow: "#FF0000",
  low: "#FFFF00",
  medium: "#F2F7C3",
  high: "#8CD17D",
  veryHigh: "#1A7837",
};

/// Vegetation water content, read off the NDWI legend screenshot.
const NDWI_COLORS = {
  highImpact: "#FF0000",
  mediumImpact: "#FFA100",
  lowImpact: "#C3E01D",
  high: "#00752B",
};

/// The three drought products are told apart by which mean they carry, and each
/// is coloured on its own scale.
///
/// Colour comes from `range_label`, not from the numbers, on purpose: the
/// server's own bucketing is authoritative and does not always agree with the
/// printed break points. A real NDWI cell at `ndwi_mean = 0.025` is labelled
/// `high_moisture` even though the legend starts that class at 0.03 — deriving
/// the class from the value would have drawn it in the wrong colour. The
/// numeric ranges are therefore legend text only.
export const DROUGHT_PAINT: FillLayerSpecification["paint"] = {
  "fill-color": [
    "case",
    ["has", "dri_mean"],
    [
      // DRI+ is the exception: it has no label for the at-risk classes (every
      // observed cell is `no_risk` or `low_risk`), so its four legend classes
      // have to come from the number, exactly as the legend prints them.
      "step",
      ["to-number", ["get", "dri_mean"]],
      DRI_COLORS.none,
      50,
      DRI_COLORS.low,
      60,
      DRI_COLORS.medium,
      70,
      DRI_COLORS.high,
      80,
      DRI_COLORS.veryHigh,
    ],
    ["has", "smap_mean"],
    [
      "match",
      ["get", "range_label"],
      "very_low_moisture",
      SMAP_COLORS.veryLow,
      "low_moisture",
      SMAP_COLORS.low,
      "medium_moisture",
      SMAP_COLORS.medium,
      "high_moisture",
      SMAP_COLORS.high,
      "very_high_moisture",
      SMAP_COLORS.veryHigh,
      DRI_COLORS.none,
    ],
    ["has", "ndwi_mean"],
    [
      "match",
      ["get", "range_label"],
      "low_moisture_high_impact",
      NDWI_COLORS.highImpact,
      "low_moisture_medium_impact",
      NDWI_COLORS.mediumImpact,
      "low_moisture_low_impact",
      NDWI_COLORS.lowImpact,
      "high_moisture",
      NDWI_COLORS.high,
      DRI_COLORS.none,
    ],
    DRI_COLORS.none,
  ],
  "fill-opacity": 0.65,
};

const DRI_LEGEND: LegendSpec = {
  title: "พื้นที่เสี่ยงภัยแล้ง (DRI+)",
  note: "ดัชนีความเสี่ยงภัยแล้งของ GISTDA — คะแนนความเสี่ยง ไม่ใช่ปริมาณน้ำ",
  ramp: true,
  entries: [
    { color: DRI_COLORS.low, label: "50 ถึง 59", sub: "ต่ำ" },
    { color: DRI_COLORS.medium, label: "60 ถึง 69", sub: "ปานกลาง" },
    { color: DRI_COLORS.high, label: "70 ถึง 79", sub: "สูง" },
    { color: DRI_COLORS.veryHigh, label: ">=80", sub: "สูงมาก" },
  ],
};

const SMAP_LEGEND: LegendSpec = {
  title: "ความชื้นในดิน (SMAP) (%)",
  note: "ความชื้นดินชั้นบนจากดาวเทียม SMAP ของ NASA — ยิ่งต่ำยิ่งแห้ง",
  ramp: true,
  entries: [
    { color: SMAP_COLORS.veryLow, label: "0 ถึง 8", sub: "ชื้นน้อยที่สุด" },
    { color: SMAP_COLORS.low, label: "9 ถึง 22", sub: "ชื้นน้อย" },
    { color: SMAP_COLORS.medium, label: "23 ถึง 37", sub: "ชื้นปานกลาง" },
    { color: SMAP_COLORS.high, label: "38 ถึง 51", sub: "ชื้นมาก" },
    { color: SMAP_COLORS.veryHigh, label: "52 ถึง 100", sub: "ชื้นมากที่สุด" },
  ],
};

const NDWI_LEGEND: LegendSpec = {
  title: "ความชื้นพืชพรรณ (NDWI)",
  note: "ปริมาณน้ำในเนื้อพืชจากแสงสะท้อน — สะท้อนผลต่อพืชผลโดยตรง",
  ramp: true,
  entries: [
    {
      color: NDWI_COLORS.highImpact,
      label: "-1 ถึง -0.14",
      sub: "ความชื้นต่ำ ผลต่อพืชมาก",
    },
    {
      color: NDWI_COLORS.mediumImpact,
      label: "-0.13 ถึง -0.08",
      sub: "ความชื้นต่ำ ผลต่อพืชปานกลาง",
    },
    {
      color: NDWI_COLORS.lowImpact,
      label: "-0.07 ถึง 0.02",
      sub: "ความชื้นต่ำ ผลต่อพืชน้อย",
    },
    { color: NDWI_COLORS.high, label: "0.03 ถึง 1", sub: "ชื้นมากที่สุด" },
  ],
};

/* -------------------------------------------------- drought product split */

export type DroughtProduct = "dri_plus" | "smap" | "ndwi";

export const DROUGHT_PRODUCT_LABEL: Record<DroughtProduct, string> = {
  dri_plus: "ภัยแล้ง (DRI+)",
  smap: "ความชื้นดิน",
  ndwi: "ความชื้นพืช",
};

/// Which product a cell belongs to, decided by the measurement it carries —
/// the features themselves say nothing about their source collection.
export function productOf(feature: GeoJSON.Feature): DroughtProduct | null {
  const p = feature.properties;
  if (!p) return null;
  if (p.dri_mean != null) return "dri_plus";
  if (p.smap_mean != null) return "smap";
  if (p.ndwi_mean != null) return "ndwi";
  return null;
}

export function productsIn(features: GeoJSON.Feature[]): DroughtProduct[] {
  const order: DroughtProduct[] = ["dri_plus", "smap", "ndwi"];
  const found = new Set(features.map(productOf).filter(Boolean));
  return order.filter((p) => found.has(p));
}

const DROUGHT_LEGENDS: Record<DroughtProduct, LegendSpec> = {
  dri_plus: DRI_LEGEND,
  smap: SMAP_LEGEND,
  ndwi: NDWI_LEGEND,
};

/* ----------------------------------------------------------------- flood */

export const FLOOD_COLOR = "#2E9BE6";

const FLOOD_LEGEND: LegendSpec = {
  title: "สัญลักษณ์",
  entries: [{ color: FLOOD_COLOR, label: "พื้นที่น้ำท่วม" }],
};

/* ---------------------------------------------------------------- lookup */

/// Picks the legends that match what is actually on screen. `features` is
/// inspected rather than assumed so a drought result made purely of soil
/// moisture does not display an empty DRI+ ramp.
/// Colour for a statistics row, resolved from the same legend definitions the
/// map draws with — so a bar in the summary is the colour of the dots it counts.
///
/// Important: this is a cross-reference, NOT the identity channel. The GISTDA
/// palette fails a categorical-accessibility check (brown #B07441 vs dark green
/// #478F4A separate by only ΔE 3.6 under protanopia, and five of seven swatches
/// sit under 3:1 against the surface), and it is fixed by the source system, so
/// every row that uses it must also carry its name and count as text.
export function categoryColor(title: string, name: string): string | null {
  const pools: LegendSpec[] = [
    FIRE_LEGEND.responsibility,
    FIRE_LEGEND.utilization,
    SMAP_LEGEND,
    NDWI_LEGEND,
    DRI_LEGEND,
  ];
  const preferred = pools.filter((p) => p.title === title);
  for (const spec of [...preferred, ...pools]) {
    for (const e of spec.entries) {
      if (e.label === name || e.sub === name || e.en === name) return e.color;
    }
  }
  return null;
}

export function legendsFor(
  hazard: Hazard | null,
  features: GeoJSON.Feature[],
  fireClassification: FireClassification,
): LegendSpec[] {
  if (!hazard || features.length === 0) return [];

  if (hazard === "fire") return [FIRE_LEGEND[fireClassification]];
  if (hazard === "flood") return [FLOOD_LEGEND];
  return productsIn(features).map((p) => DROUGHT_LEGENDS[p]);
}
