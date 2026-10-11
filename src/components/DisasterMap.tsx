"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  type FilterSpecification,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { AdminLevel, Hazard, ResolvedArea } from "@/lib/api";
import { featurePopupHtml } from "@/lib/featurePopup";
import {
  DROUGHT_PAINT,
  DROUGHT_PRODUCT_LABEL,
  FIRE_CLASSIFICATION_LABEL,
  FIRE_PAINT,
  FLOOD_COLOR,
  legendsFor,
  productOf,
  productsIn,
  type DroughtProduct,
  type FireClassification,
  type LegendSpec,
} from "@/lib/mapStyles";

// Pinned to maplibre-gl v5 on purpose — do NOT bump to v6 without re-testing
// the map end to end. On 6.1.0 here, raster tiles still drew but nothing
// worker-tiled did: the vector basemap rendered as a blank background colour
// and every GeoJSON layer (ours and a hard-coded test point alike) drew
// nothing, with no console error to show for it. v5.24.0 renders both.

const THAILAND_BOUNDS: [[number, number], [number, number]] = [
  [96.203156, 1.96548],
  [108.551788, 21.278498],
];

// Two sources rather than one, because clustering is fixed at source-creation
// time and a clustered source silently discards everything that is not a Point
// — flood and drought polygons would simply vanish. So: shapes (and small point
// sets) go to the plain source, large point sets to the clustered one.
const PLAIN_SOURCE = "query-result";
const CLUSTER_SOURCE = "query-result-clustered";

const FILL_LAYER_ID = "query-result-fill";
const LINE_LAYER_ID = "query-result-line";
const CIRCLE_LAYER_ID = "query-result-circle";
const CLUSTER_LAYER_ID = "query-result-clusters";
const CLUSTER_COUNT_LAYER_ID = "query-result-cluster-count";
const UNCLUSTERED_LAYER_ID = "query-result-unclustered";

// Administrative boundaries (province + amphoe) served as vector tiles. The
// source layer is named after the tileset id, which is how Vallaris publishes
// it — see the `vector_layers[].id` in the TileJSON at BOUNDARY_TILEJSON.
const BOUNDARY_TILEJSON = `https://beta.vallarismaps.com/core/api/tiles/1.0-beta/tiles/6a7182eaa0e0de86337975e3?api_key=${process.env.NEXT_PUBLIC_VALLARIS_KEY}`;
const BOUNDARY_SOURCE = "admin-boundaries";
const BOUNDARY_SOURCE_LAYER = "6a7182eaa0e0de86337975e3";
const BOUNDARY_AMPHOE_LAYER_ID = "admin-amphoe-line";
const BOUNDARY_PROVINCE_LAYER_ID = "admin-province-line";
const BOUNDARY_ACTIVE_FILL_ID = "admin-active-fill";
const BOUNDARY_ACTIVE_LINE_ID = "admin-active-line";

/// `admin_type` is the digit count of that level's `area_idn`, the same
/// convention the gazetteer uses (province 40, amphoe 4011, tambon 401101).
/// So 2 = province, 4 = amphoe; this tileset carries no tambon (6).
///
/// Confirmed by decoding a live z8 tile rather than assumed — the guess of
/// 1/2 was wrong, and with it every boundary filter matched nothing:
///   admin_type=2 → pv_tn='ปทุมธานี', ap_tn=null
///   admin_type=4 → pv_tn='กาญจนบุรี', ap_tn='ท่ามะกา'
const ADMIN_TYPE_PROVINCE = 2;
const ADMIN_TYPE_AMPHOE = 4;

/// Amphoe lines only below this zoom would be visual noise across a whole
/// province, so they fade in once the view is tight enough to read them.
const AMPHOE_MIN_ZOOM = 7;

/// A filter that never matches, used when there is nothing to highlight.
const MATCH_NOTHING: FilterSpecification = ["==", ["literal", 1], 2];

/// Below this many points, individual dots are more informative than bubbles —
/// a province with 30 hotspots should show 30 hotspots. A year of data runs to
/// the low thousands, which is where clustering starts earning its keep.
const CLUSTER_THRESHOLD = 200;

/// Single colour per hazard, used where a classification cannot apply: cluster
/// bubbles (which stand for many features of mixed classes) and the flood layer.
const HAZARD_COLOR: Record<Hazard, string> = {
  flood: FLOOD_COLOR,
  fire: "#f97316",
  drought: "#b45309",
};

/// Plain point styling for hazards with no per-feature classification.
const DEFAULT_CIRCLE_PAINT = {
  "circle-radius": 5,
  "circle-stroke-color": "#7c2d12",
  "circle-stroke-width": 1,
  "circle-stroke-opacity": 1,
};

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

type BaseLayer = "street" | "satellite";

const STYLE_URL: Record<BaseLayer, string> = {
  street: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
  satellite: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
};

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

interface Props {
  geojson: GeoJSON.FeatureCollection | null;
  bbox: [number, number, number, number] | null;
  hazard: Hazard | null;
  /// The admin area the question resolved to, used to outline it on the map.
  area: ResolvedArea | null;
}

export default function DisasterMap({ geojson, bbox, hazard, area }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const latestDataRef = useRef({ geojson, bbox, hazard, area });
  const popupRef = useRef<Popup | null>(null);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>("street");
  const [clustered, setClustered] = useState(false);
  const [fireClassification, setFireClassification] =
    useState<FireClassification>("responsibility");
  const classificationRef = useRef(fireClassification);
  // null = show every product. Only ever set for drought results that actually
  // mix products.
  const [product, setProduct] = useState<DroughtProduct | null>(null);

  // These refs exist only so the `style.load` handler — which outlives any one
  // render — can read the newest props. Written in an effect rather than during
  // render, which React forbids.
  useEffect(() => {
    latestDataRef.current = { geojson, bbox, hazard, area };
    classificationRef.current = fireClassification;
  });

  const features = geojson?.features ?? [];
  const availableProducts = hazard === "drought" ? productsIn(features) : [];
  // Derived rather than reset in an effect: a result may not contain the
  // product picked for the previous one, and ignoring the stale choice during
  // render avoids a setState cascade while still remembering the preference if
  // that product comes back.
  const activeProduct =
    product && availableProducts.includes(product) ? product : null;
  const shown = features.filter(
    (f) => !activeProduct || productOf(f) === activeProduct,
  );
  const legends: LegendSpec[] = legendsFor(hazard, shown, fireClassification);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL.street,
      bounds: THAILAND_BOUNDS,
    });
    map.addControl(new NavigationControl(), "top-right");

    // Fires after the initial style AND after every setStyle() call (base
    // layer switch) — sources/layers are wiped on setStyle, so re-add them
    // here every time rather than only in a one-off "load" handler.
    map.on("style.load", () => {
      addSourcesAndLayers(map);
      loadedRef.current = true;
      const { geojson, bbox, hazard, area } = latestDataRef.current;
      applyBoundaries(map, area);
      setClustered(
        applyData(map, geojson, bbox, hazard, classificationRef.current, {
          skipFitBounds: true,
        }),
      );
    });

    // Zoom into a cluster on click — without this a cluster is a dead end, and
    // the numbers on screen cannot be broken down into the points behind them.
    map.on("click", CLUSTER_LAYER_ID, (e: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(e.point, {
        layers: [CLUSTER_LAYER_ID],
      })[0];
      const clusterId = feature?.properties?.cluster_id;
      if (clusterId == null) return;
      const source = map.getSource(CLUSTER_SOURCE) as GeoJSONSource | undefined;
      const geometry = feature.geometry;
      if (!source || geometry.type !== "Point") return;
      const center = geometry.coordinates as [number, number];
      source
        .getClusterExpansionZoom(clusterId)
        .then((zoom) => map.easeTo({ center, zoom, duration: 500 }))
        // A failed expansion lookup should still get the user closer in.
        .catch(() => map.easeTo({ center, zoom: map.getZoom() + 2 }));
    });

    // Click any actual feature (not a cluster, which zooms instead) to inspect
    // its attributes. One popup instance is reused so a second click moves the
    // existing card rather than stacking cards on the map.
    const popup = new Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: "20rem",
      offset: 12,
    });
    popupRef.current = popup;

    for (const layer of [
      CIRCLE_LAYER_ID,
      UNCLUSTERED_LAYER_ID,
      FILL_LAYER_ID,
    ]) {
      map.on("click", layer, (e: MapMouseEvent) => {
        const feature = map.queryRenderedFeatures(e.point, {
          layers: [layer],
        })[0];
        if (!feature) return;
        popup
          .setLngLat(e.lngLat)
          .setHTML(featurePopupHtml(feature, latestDataRef.current.hazard))
          .addTo(map);
      });
    }

    for (const layer of [
      CLUSTER_LAYER_ID,
      UNCLUSTERED_LAYER_ID,
      CIRCLE_LAYER_ID,
      FILL_LAYER_ID,
    ]) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    mapRef.current = map;

    return () => {
      popup.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    // A popup pinned to a feature from the previous answer would otherwise
    // hang over the new result describing something no longer on the map.
    popupRef.current?.remove();
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: shown,
    };
    setClustered(applyData(map, fc, bbox, hazard, fireClassification));
    // Only a new result should move the camera. fireClassification and product
    // are handled by the effects below, which recolour and re-push without
    // touching fitBounds — otherwise every chip click would yank the view back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson, bbox, hazard]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applyClassification(map, hazard, fireClassification);
  }, [hazard, fireClassification]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applyBoundaries(map, area);
  }, [area]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    setClustered(pushData(map, shown));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProduct]);

  function switchBaseLayer(layer: BaseLayer) {
    if (layer === baseLayer) return;
    setBaseLayer(layer);
    mapRef.current?.setStyle(STYLE_URL[layer]);
  }

  return (
    <>
      <div ref={containerRef} className="flex-1" />
      <div className="glass-chip absolute left-3 top-3 z-10 flex overflow-hidden rounded-full p-0.5 text-xs">
        <button
          type="button"
          onClick={() => switchBaseLayer("street")}
          className={
            "rounded-full px-3 py-1 transition-colors " +
            (baseLayer === "street"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-foreground/70 hover:bg-foreground/10")
          }
        >
          ถนน
        </button>
        <button
          type="button"
          onClick={() => switchBaseLayer("satellite")}
          className={
            "rounded-full px-3 py-1 transition-colors " +
            (baseLayer === "satellite"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-foreground/70 hover:bg-foreground/10")
          }
        >
          ดาวเทียม
        </button>
      </div>
      {/* Left column, under the basemap pill. These chips used to sit at
          right-3 top-16, directly on top of MapLibre's zoom control, which
          occupies y 11-100 in the same corner. */}
      {hazard === "fire" && legends.length > 0 && (
        <div className="glass-chip absolute left-3 top-14 z-10 flex overflow-hidden rounded-full p-0.5 text-[11px]">
          {(
            Object.keys(FIRE_CLASSIFICATION_LABEL) as FireClassification[]
          ).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFireClassification(mode)}
              className={
                "rounded-full px-2.5 py-1 transition-colors " +
                (fireClassification === mode
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-foreground/70 hover:bg-foreground/10")
              }
            >
              {FIRE_CLASSIFICATION_LABEL[mode]}
            </button>
          ))}
        </div>
      )}

      {availableProducts.length > 1 && (
        <div className="absolute left-3 top-14 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setProduct(null)}
            className={
              "rounded-full px-2.5 py-1 text-[11px] transition-colors " +
              (activeProduct === null
                ? "bg-blue-600 text-white shadow-sm"
                : "glass-chip text-foreground/75 hover:text-foreground")
            }
          >
            ทั้งหมด
          </button>
          {availableProducts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProduct(p)}
              className={
                "rounded-full px-2.5 py-1 text-[11px] transition-colors " +
                (activeProduct === p
                  ? "bg-blue-600 text-white shadow-sm"
                  : "glass-chip text-foreground/75 hover:text-foreground")
              }
            >
              {DROUGHT_PRODUCT_LABEL[p]}
            </button>
          ))}
        </div>
      )}

      {/* Bottom-anchored and scrollable. The 8rem cap = 6rem of control row at
          the top plus the 2rem `bottom-8` offset, since the height is measured
          from that offset, not from the pane's bottom edge. A percentage cap
          was wrong at every pane height — at 60% the legend grew up into the
          classification chips. */}
      <div className="pointer-events-none absolute bottom-8 left-3 right-3 z-10 flex max-h-[calc(100%-8rem)] flex-col items-start gap-2 overflow-y-auto">
        {legends.map((legend) => (
          <Legend key={legend.title} spec={legend} />
        ))}
        {clustered && (
          <div className="glass-chip rounded-full px-3 py-1.5 text-[11px] text-foreground/75">
            จุดถูกรวมเป็นกลุ่ม — คลิกเพื่อขยาย
          </div>
        )}
      </div>
    </>
  );
}

function Legend({ spec }: { spec: LegendSpec }) {
  return (
    <div
      className={
        "glass rounded-2xl px-3 py-2.5 text-[11px] " +
        (spec.ramp ? "w-full max-w-sm" : "")
      }
    >
      <div className="mb-2 font-medium text-foreground">
        {spec.title}
      </div>
      {spec.ramp ? (
        // A continuous scale reads as one bar with the breaks labelled under
        // it, matching how the source viewer presents DRI+. Cells flex instead
        // of taking a fixed width so a five-class ramp still fits a narrow map
        // pane — at a fixed 62px the last class fell off the edge.
        <div className="flex w-full">
          {spec.entries.map((e) => (
            <div
              key={e.label}
              className="flex min-w-0 flex-1 flex-col items-center"
            >
              <div
                className="h-4 w-full border-y border-l border-foreground/25 last:border-r"
                style={{ backgroundColor: e.color }}
              />
              <span className="mt-1 break-words px-0.5 text-center text-[9px] leading-tight text-foreground/80">
                {e.label}
              </span>
              {e.sub && (
                <span className="break-words px-0.5 text-center text-[9px] leading-tight text-foreground/55">
                  {e.sub}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {spec.entries.map((e) => (
            <li key={e.label} className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-foreground/25 shadow-sm"
                style={{ backgroundColor: e.color }}
              />
              <span className="text-foreground/85">{e.label}</span>
            </li>
          ))}
        </ul>
      )}
      {spec.note && (
        <p className="mt-1.5 text-[10px] text-foreground/55">
          {spec.note}
        </p>
      )}
    </div>
  );
}

/// Which boundary feature is "the area the user asked about". The tileset holds
/// provinces and amphoes only, so a tambon result outlines its parent amphoe —
/// still far more useful than outlining nothing.
function activeBoundaryFilter(area: ResolvedArea | null): FilterSpecification {
  if (!area) return MATCH_NOTHING;
  const byProvince = (id: number): FilterSpecification => [
    "all",
    ["==", ["get", "admin_type"], ADMIN_TYPE_PROVINCE],
    ["==", ["get", "pv_idn"], id],
  ];
  const byAmphoe = (id: number): FilterSpecification => [
    "all",
    ["==", ["get", "admin_type"], ADMIN_TYPE_AMPHOE],
    ["==", ["get", "ap_idn"], id],
  ];

  const level: AdminLevel = area.level;
  if (level === "province") return byProvince(area.area_idn);
  if (level === "amphoe") return byAmphoe(area.area_idn);
  return area.parent_area_idn != null
    ? byAmphoe(area.parent_area_idn)
    : MATCH_NOTHING;
}

function addSourcesAndLayers(map: MapLibreMap) {
  // Boundaries go in first so every data layer added below draws on top of
  // them — an outline over the hotspots would obscure the answer.
  if (!map.getSource(BOUNDARY_SOURCE)) {
    map.addSource(BOUNDARY_SOURCE, { type: "vector", url: BOUNDARY_TILEJSON });
  }
  if (!map.getLayer(BOUNDARY_ACTIVE_FILL_ID)) {
    map.addLayer({
      id: BOUNDARY_ACTIVE_FILL_ID,
      type: "fill",
      source: BOUNDARY_SOURCE,
      "source-layer": BOUNDARY_SOURCE_LAYER,
      filter: MATCH_NOTHING,
      // Barely-there wash: it has to read as "this is the area you asked
      // about" without competing with the hazard colours drawn over it.
      paint: { "fill-color": "#3b82f6", "fill-opacity": 0.07 },
    });
  }
  if (!map.getLayer(BOUNDARY_AMPHOE_LAYER_ID)) {
    map.addLayer({
      id: BOUNDARY_AMPHOE_LAYER_ID,
      type: "line",
      source: BOUNDARY_SOURCE,
      "source-layer": BOUNDARY_SOURCE_LAYER,
      filter: ["==", ["get", "admin_type"], ADMIN_TYPE_AMPHOE],
      minzoom: AMPHOE_MIN_ZOOM,
      paint: {
        "line-color": "#64748b",
        "line-width": 0.6,
        "line-dasharray": [3, 2],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 9, 0.55],
      },
    });
  }
  if (!map.getLayer(BOUNDARY_PROVINCE_LAYER_ID)) {
    map.addLayer({
      id: BOUNDARY_PROVINCE_LAYER_ID,
      type: "line",
      source: BOUNDARY_SOURCE,
      "source-layer": BOUNDARY_SOURCE_LAYER,
      filter: ["==", ["get", "admin_type"], ADMIN_TYPE_PROVINCE],
      paint: {
        "line-color": "#475569",
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 10, 1.4],
        "line-opacity": 0.6,
      },
    });
  }
  if (!map.getLayer(BOUNDARY_ACTIVE_LINE_ID)) {
    map.addLayer({
      id: BOUNDARY_ACTIVE_LINE_ID,
      type: "line",
      source: BOUNDARY_SOURCE,
      "source-layer": BOUNDARY_SOURCE_LAYER,
      filter: MATCH_NOTHING,
      paint: {
        "line-color": "#2563eb",
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.5, 10, 3],
        "line-opacity": 0.9,
      },
    });
  }

  if (!map.getSource(PLAIN_SOURCE)) {
    map.addSource(PLAIN_SOURCE, { type: "geojson", data: EMPTY_FC });
  }
  if (!map.getSource(CLUSTER_SOURCE)) {
    map.addSource(CLUSTER_SOURCE, {
      type: "geojson",
      data: EMPTY_FC,
      cluster: true,
      // Stop clustering once zoomed in far enough that individual hotspots are
      // meaningfully apart, and keep the radius tight so neighbouring
      // provinces do not merge into one bubble.
      clusterMaxZoom: 13,
      clusterRadius: 45,
    });
  }

  if (!map.getLayer(FILL_LAYER_ID)) {
    map.addLayer({
      id: FILL_LAYER_ID,
      type: "fill",
      source: PLAIN_SOURCE,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": HAZARD_COLOR.flood, "fill-opacity": 0.45 },
    });
  }
  if (!map.getLayer(LINE_LAYER_ID)) {
    map.addLayer({
      id: LINE_LAYER_ID,
      type: "line",
      source: PLAIN_SOURCE,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "line-color": HAZARD_COLOR.flood, "line-width": 1.5 },
    });
  }
  if (!map.getLayer(CIRCLE_LAYER_ID)) {
    map.addLayer({
      id: CIRCLE_LAYER_ID,
      type: "circle",
      source: PLAIN_SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": HAZARD_COLOR.fire,
        "circle-radius": 5,
        "circle-stroke-color": "#7c2d12",
        "circle-stroke-width": 1,
      },
    });
  }

  if (!map.getLayer(CLUSTER_LAYER_ID)) {
    map.addLayer({
      id: CLUSTER_LAYER_ID,
      type: "circle",
      source: CLUSTER_SOURCE,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": HAZARD_COLOR.fire,
        // Area grows with the count so a 500-point bubble reads as bigger than
        // a 20-point one without dwarfing the map.
        "circle-radius": [
          "step",
          ["get", "point_count"],
          14,
          20,
          18,
          100,
          24,
          500,
          32,
        ],
        "circle-opacity": 0.85,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  }
  if (!map.getLayer(CLUSTER_COUNT_LAYER_ID)) {
    map.addLayer({
      id: CLUSTER_COUNT_LAYER_ID,
      type: "symbol",
      source: CLUSTER_SOURCE,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        // Must be a font the MapTiler style actually ships, or the labels
        // silently fail to render.
        "text-font": ["Noto Sans Bold"],
        "text-size": 12,
        "text-allow-overlap": true,
      },
      paint: { "text-color": "#ffffff" },
    });
  }
  if (!map.getLayer(UNCLUSTERED_LAYER_ID)) {
    map.addLayer({
      id: UNCLUSTERED_LAYER_ID,
      type: "circle",
      source: CLUSTER_SOURCE,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": HAZARD_COLOR.fire,
        "circle-radius": 5,
        "circle-stroke-color": "#7c2d12",
        "circle-stroke-width": 1,
      },
    });
  }
}

/// Pushes a whole paint object onto a layer. MapLibre only exposes one property
/// at a time, and every property in a set has to be re-applied on each hazard
/// change — a leftover `circle-radius` expression from the fire ramp would
/// otherwise still be sizing flood points.
function setPaint(
  map: MapLibreMap,
  layerId: string,
  paint: Record<string, unknown> | undefined,
) {
  // MapLibre types every layer's `paint` as optional, so a spec object can be
  // undefined as far as the compiler is concerned — bail rather than let
  // Object.entries throw and abort the rest of the styling.
  if (!paint || !map.getLayer(layerId)) return;
  for (const [name, value] of Object.entries(paint)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.setPaintProperty(layerId, name, value as any);
  }
}

/// Boundaries are tied to having an answer on screen: with no resolved area the
/// map is showing all of Thailand and a full admin mesh would be pure clutter.
function applyBoundaries(map: MapLibreMap, area: ResolvedArea | null) {
  const visibility = area ? "visible" : "none";
  for (const id of [
    BOUNDARY_ACTIVE_FILL_ID,
    BOUNDARY_AMPHOE_LAYER_ID,
    BOUNDARY_PROVINCE_LAYER_ID,
    BOUNDARY_ACTIVE_LINE_ID,
  ]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
  }

  const filter = activeBoundaryFilter(area);
  for (const id of [BOUNDARY_ACTIVE_FILL_ID, BOUNDARY_ACTIVE_LINE_ID]) {
    if (map.getLayer(id)) map.setFilter(id, filter);
  }
}

function applyClassification(
  map: MapLibreMap,
  hazard: Hazard | null,
  fireClassification: FireClassification,
) {
  const color = hazard ? HAZARD_COLOR[hazard] : HAZARD_COLOR.flood;

  // Clusters stand for many features at once, so no single class colour is
  // honest for them — they stay the flat hazard colour and the classification
  // becomes visible as soon as the user zooms in and they break apart.
  setPaint(map, CLUSTER_LAYER_ID, { "circle-color": color });

  const pointPaint =
    hazard === "fire"
      ? (FIRE_PAINT[fireClassification] as Record<string, unknown>)
      : { ...DEFAULT_CIRCLE_PAINT, "circle-color": color };
  setPaint(map, CIRCLE_LAYER_ID, pointPaint);
  setPaint(map, UNCLUSTERED_LAYER_ID, pointPaint);

  // Drought is an H3 grid: thousands of hexagons tiling the whole area, where
  // the cell boundaries carry no meaning at all — only the colours do. Their
  // outlines have to be removed from BOTH places that draw them, or the mesh
  // survives:
  //   1. the line layer below, and
  //   2. `fill-antialias`, which defaults to true and strokes a 1px edge around
  //      every polygon. With adjacent hexagons that alone redraws the grid.
  const isGrid = hazard === "drought";
  const fillPaint = isGrid
    ? { ...(DROUGHT_PAINT as Record<string, unknown>), "fill-antialias": false }
    : { "fill-color": color, "fill-opacity": 0.45, "fill-antialias": true };
  setPaint(map, FILL_LAYER_ID, fillPaint);

  // Flood extents are a handful of real shapes whose outline is informative, so
  // they keep theirs.
  if (map.getLayer(LINE_LAYER_ID)) {
    map.setLayoutProperty(
      LINE_LAYER_ID,
      "visibility",
      isGrid ? "none" : "visible",
    );
  }
  // Every property in the set is re-applied, not just the changed one: paint
  // persists across queries, so a value left over from a previous hazard would
  // otherwise still be in effect (the old faint 0.25 opacity would have stuck
  // to the next flood result).
  setPaint(map, LINE_LAYER_ID, {
    "line-color": color,
    "line-width": 1.5,
    "line-opacity": 1,
  });
}

/// Routes the result into the two sources and returns whether clustering ended
/// up active, so the UI can say so.
function applyData(
  map: MapLibreMap,
  geojson: GeoJSON.FeatureCollection | null,
  bbox: [number, number, number, number] | null,
  hazard: Hazard | null,
  fireClassification: FireClassification,
  opts?: { skipFitBounds?: boolean },
): boolean {
  const useCluster = pushData(map, geojson?.features ?? []);
  applyClassification(map, hazard, fireClassification);

  if (bbox && !opts?.skipFitBounds) {
    map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      {
        padding: 60,
        duration: 800,
        maxZoom: 14,
        // `linear: true` is the whole point of this options object. MapLibre's
        // fitBounds defaults to `linear: false`, and internally that means
        // `i.linear ? this.easeTo(i) : this.flyTo(i)` — so calling fitBounds
        // was still producing a flyTo, the parabolic swoop that zooms way out
        // and dives back in. This keeps the bounds fit but travels straight.
        linear: true,
      },
    );
  }

  return useCluster;
}

/// Splits features between the plain and clustered sources and returns whether
/// clustering is active. Separate from `applyData` so switching drought product
/// can re-push features without re-running `fitBounds` and yanking the camera.
function pushData(map: MapLibreMap, features: GeoJSON.Feature[]): boolean {
  const plain = map.getSource(PLAIN_SOURCE) as GeoJSONSource | undefined;
  const clusterSource = map.getSource(CLUSTER_SOURCE) as
    | GeoJSONSource
    | undefined;
  if (!plain || !clusterSource) return false;

  const points = features.filter((f) => f.geometry?.type === "Point");
  const shapes = features.filter((f) => f.geometry?.type !== "Point");
  const useCluster = points.length >= CLUSTER_THRESHOLD;

  plain.setData({
    type: "FeatureCollection",
    features: useCluster ? shapes : features,
  });
  clusterSource.setData({
    type: "FeatureCollection",
    features: useCluster ? points : [],
  });

  return useCluster;
}
