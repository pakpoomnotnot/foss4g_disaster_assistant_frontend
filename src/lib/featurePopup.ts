// Builds the HTML shown when a result feature is clicked on the map.
//
// The upstream features carry 50+ properties each, most of them internal ids
// and UTM bookkeeping. This picks the handful a person actually wants and
// labels them in Thai.

import type { Hazard } from "@/lib/api";
import { productOf } from "@/lib/mapStyles";

/// Values come straight from the API, so they are escaped before being put in
/// the popup's innerHTML — a place name is data, never markup.
function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Props = Record<string, unknown>;

function str(p: Props, key: string): string | null {
  const v = p[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s === "null" ? null : s;
}

function num(p: Props, key: string): number | null {
  const v = p[key];
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/// MODIS/VIIRS platform codes as they appear in the hotspot feed.
const SATELLITE: Record<string, string> = {
  T: "Terra",
  A: "Aqua",
  N: "Suomi NPP",
  NOAA20: "NOAA-20",
};

const RANGE_LABEL_TH: Record<string, string> = {
  // DRI+
  no_risk: "ไม่เสี่ยง",
  low_risk: "เสี่ยงต่ำ",
  medium_risk: "เสี่ยงปานกลาง",
  high_risk: "เสี่ยงสูง",
  very_high_risk: "เสี่ยงสูงมาก",
  // SMAP
  very_low_moisture: "ชื้นน้อยที่สุด",
  low_moisture: "ชื้นน้อย",
  medium_moisture: "ชื้นปานกลาง",
  high_moisture: "ชื้นมาก",
  very_high_moisture: "ชื้นมากที่สุด",
  // NDWI
  low_moisture_high_impact: "ความชื้นต่ำ ผลต่อพืชมาก",
  low_moisture_medium_impact: "ความชื้นต่ำ ผลต่อพืชปานกลาง",
  low_moisture_low_impact: "ความชื้นต่ำ ผลต่อพืชน้อย",
};

interface Row {
  label: string;
  value: string;
}

function push(rows: Row[], label: string, value: string | null | undefined) {
  if (value != null && value !== "") rows.push({ label, value });
}

/// Admin names arrive with level prefixes on drought cells ("จ.เชียงใหม่") and
/// without them on hotspots ("เชียงใหม่"), so they are joined as-is rather than
/// re-prefixed, which would produce "ต.ต.สะเมิงใต้".
function locationLine(p: Props): string | null {
  // A tambon often shares its amphoe's name ("บ้านแพรก · บ้านแพรก · ..."), which
  // reads like a rendering bug, so repeats are collapsed.
  const dedupe = (parts: (string | null)[]) =>
    parts.filter(Boolean).filter((v, i, a) => v !== a[i - 1]);

  const th = dedupe([str(p, "tb_tn"), str(p, "ap_tn"), str(p, "pv_tn")]);
  if (th.length > 0) return th.join(" · ");
  const en = dedupe([str(p, "tb_en"), str(p, "ap_en"), str(p, "pv_en")]);
  return en.length ? en.join(" · ") : null;
}

function fireRows(p: Props): Row[] {
  const rows: Row[] = [];
  const date = str(p, "th_date")?.slice(0, 10) ?? str(p, "acq_date")?.slice(0, 10);
  const time = str(p, "th_time") ?? str(p, "acq_time");
  // acq_time is "HHMM" with no separator.
  const clock = time && time.length === 4 ? `${time.slice(0, 2)}:${time.slice(2)}` : time;
  push(rows, "วันที่", date && clock ? `${date} ${clock} น.` : date);
  push(rows, "หมู่บ้าน", str(p, "village"));
  push(rows, "พื้นที่รับผิดชอบ", str(p, "lu_name"));
  push(rows, "การใช้ประโยชน์", str(p, "lu_hp_name"));

  const conf = num(p, "confidence");
  push(rows, "ความเชื่อมั่น", conf != null ? `${conf}%` : null);
  const bright = num(p, "brightness");
  push(rows, "ความสว่าง", bright != null ? `${bright.toFixed(1)} K` : null);
  const frp = num(p, "frp");
  push(rows, "ความแรง (FRP)", frp != null ? `${frp.toFixed(1)} MW` : null);

  const sat = str(p, "satellite");
  const instrument = str(p, "instrument");
  const satName = sat ? (SATELLITE[sat] ?? sat) : null;
  push(
    rows,
    "ดาวเทียม",
    [satName, instrument].filter(Boolean).join(" / ") || null,
  );
  return rows;
}

function droughtRows(p: Props): Row[] {
  const rows: Row[] = [];
  const product = productOf({ type: "Feature", properties: p, geometry: null! });

  if (product === "dri_plus") {
    const v = num(p, "dri_mean");
    push(rows, "ชนิดข้อมูล", "ดัชนีความเสี่ยงภัยแล้ง (DRI+)");
    push(rows, "ค่า DRI", v != null ? v.toFixed(1) : null);
  } else if (product === "smap") {
    const v = num(p, "smap_mean");
    push(rows, "ชนิดข้อมูล", "ความชื้นในดิน (SMAP)");
    // Stored 0-1, but every label and legend for this product is in percent.
    push(rows, "ความชื้น", v != null ? `${(v * 100).toFixed(1)}%` : null);
  } else if (product === "ndwi") {
    const v = num(p, "ndwi_mean");
    push(rows, "ชนิดข้อมูล", "ความชื้นพืชพรรณ (NDWI)");
    push(rows, "ค่า NDWI", v != null ? v.toFixed(3) : null);
  }

  const label = str(p, "range_label");
  push(rows, "ระดับ", label ? (RANGE_LABEL_TH[label] ?? label) : null);
  push(rows, "ภูมิภาค", str(p, "re_royin"));
  return rows;
}

function floodRows(p: Props): Row[] {
  const rows: Row[] = [];
  push(rows, "วันที่", str(p, "acq_date")?.slice(0, 10) ?? str(p, "date"));
  push(rows, "ภูมิภาค", str(p, "re_royin"));
  return rows;
}

const HAZARD_TITLE: Record<Hazard, string> = {
  flood: "พื้นที่น้ำท่วม",
  fire: "จุดความร้อน",
  drought: "พื้นที่ภัยแล้ง",
};

const HAZARD_ACCENT: Record<Hazard, string> = {
  flood: "#2E9BE6",
  fire: "#f97316",
  drought: "#b45309",
};

export function featurePopupHtml(
  feature: GeoJSON.Feature,
  hazard: Hazard | null,
): string {
  const p = (feature.properties ?? {}) as Props;
  const h = hazard ?? "fire";

  const rows =
    h === "fire" ? fireRows(p) : h === "drought" ? droughtRows(p) : floodRows(p);

  // A point has one meaningful coordinate; a polygon does not, so it is only
  // shown for points rather than printing a misleading "centre".
  if (feature.geometry?.type === "Point") {
    const [lon, lat] = feature.geometry.coordinates as [number, number];
    push(rows, "พิกัด", `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
  }

  const place = locationLine(p);
  // Plain class names styled in globals.css rather than Tailwind utilities:
  // this markup is injected into MapLibre's popup outside React, and relying on
  // the Tailwind scanner to find classes inside a template literal is a
  // needless way for the styling to silently disappear in a production build.
  const body = rows
    .map(
      (r) => `
      <div class="fp-row">
        <span class="fp-key">${esc(r.label)}</span>
        <span class="fp-val">${esc(r.value)}</span>
      </div>`,
    )
    .join("");

  return `
    <div class="fp">
      <div class="fp-head">
        <span class="fp-dot" style="background:${HAZARD_ACCENT[h]}"></span>
        <span class="fp-title">${esc(HAZARD_TITLE[h])}</span>
      </div>
      ${place ? `<div class="fp-place">${esc(place)}</div>` : ""}
      <div>${body}</div>
    </div>`;
}
