# โครงสร้าง STAC API ของ GISTDA (Flood + Fire + Drought)

> ตรวจสอบจริงเมื่อ 2026-08-03 โดยเรียก API จริงด้วย token ที่ผู้ใช้ให้มา (token หมดอายุ 2026-08-05 — `exp: 1785729348`)
> ตัวอย่าง JSON ฉบับเต็ม (redact token/api_key แล้ว) อยู่ที่ [docs/samples/](samples/)

**Base URL:** `https://api-gateway.gistda.or.th/api/2.0/resources/stac/{hazard}` — ทดสอบครบทั้ง 3 hazard ที่ deck พูดถึงแล้ว: `flood`, `fire`, `drought` (โครงสร้างต่างกันทั้ง 3 แบบ — ดูรายละเอียดด้านล่าง)

> ⚠️ **Token/API key ห้าม commit ลง git.** ทุกไฟล์ตัวอย่างใน `docs/samples/` ถูก redact ค่า `token=` และ `api_key=` เป็น `<TOKEN>` / `<API_KEY>` แล้ว เวลา implement จริงให้เก็บ token ไว้ใน env var (`.env`, ไม่ commit) และ `.gitignore` ต้องครอบคลุม

---

## ⭐ ข้อค้นพบสำคัญที่สุด: endpoint `/search` มีอยู่จริง และใช้ได้กับทั้ง 3 hazard

STAC root ของทั้ง 3 hazard (`GET /flood`, `GET /fire`, `GET /drought` — ไม่ใช่ `/catalogs/...`) มี `links[]` ที่เป็น endpoint มาตรฐานของ [STAC API / OGC API - Features](https://github.com/radiantearth/stac-api-spec) ครบ ซึ่ง**ไม่ได้ถูกพูดถึงใน slide deck เลย**:

| `rel` | href | หมายเหตุ |
|---|---|---|
| `conformance` | `/{hazard}/conformance` | OGC conformance classes |
| `service-desc` | `/{hazard}/api` | API definition |
| `queryables` | `/{hazard}/queryables` | ทดสอบแล้ว **404** ทั้ง 3 hazard — ยังไม่ implement |
| `data` | `/{hazard}/collections` | list collection ทั้งหมด (paginated, มี `context.matched`) |
| **`search`** | `/{hazard}/search` | **item search แบบ cross-collection — ใช้ `bbox` + `datetime` filter ได้จริง ยืนยันแล้วทั้ง fire และ drought** |
| `children` | `/{hazard}/children` | list child catalog |

**ทดสอบแล้วว่า `bbox` + `datetime` filter ทำงานจริง ทั้ง positive และ negative case** (ไม่ใช่แค่สมมติฐานจาก deck):

```bash
GET /fire/search?limit=5&bbox=98,5,102,20&datetime=2025-02-01T00:00:00Z/2025-02-02T00:00:00Z&token=...
# → context.matched: 3 (แคบลงจริงจากการกรอง bbox+datetime)

GET /flood/search?limit=5&collections=flood7days_r2&token=...
# → context.matched: 1, filter ด้วย ?collections= ใช้ได้จริง

GET /drought/search?limit=5&bbox=0,-80,10,-70&token=...   # bbox แถบแอนตาร์กติกา (นอกไทยแน่นอน)
# → context.matched: 0   ← ยืนยันว่า bbox filter เป็นของจริง ไม่ใช่แค่ ignore param

GET /drought/search?limit=5&datetime=2024-01-01T00:00:00Z/2024-01-31T23:59:59Z&token=...
# → context.matched: 13 (จาก 479 ทั้งหมด) — และข้ามได้ทั้ง dri_plus + lst ใน response เดียว
```

**นี่คือวิธีที่ดีกว่าที่ deck แนะนำใน §8** (`hazard+days → เดา collection id ตายตัว เช่น flood7days_r2`) เพราะ:
- ใช้ endpoint เดียว (`/search`) กับทุก hazard ไม่ต้องรู้ naming convention ของแต่ละ hazard (ซึ่งต่างกันมาก — ดูข้อ 1-3 ด้านล่าง)
- กรองด้วย `bbox`/`datetime` จริงที่ database ไม่ต้องดึงมาแล้วกรองเอง (สำคัญมากสำหรับ fire ที่มี **3,190 collections** และ drought ที่มี **479 collections**)
- รองรับ `datetime` เป็น ISO interval (`start/end`) แทนการต้องคำนวณว่า "7 วัน = collection ไหน"
- query ข้าม sub-catalog ในตัวเดียวกันได้ (fire: ข้าม fire_/modis/viirs, drought: ข้าม dri_plus/lst/ndwi/smap)

→ ไฟล์เต็ม: [samples/flood_root.json](samples/flood_root.json), [samples/fire_root.json](samples/fire_root.json), [samples/drought_root.json](samples/drought_root.json), [samples/flood_search.json](samples/flood_search.json), [samples/fire_search_filtered.json](samples/fire_search_filtered.json), [samples/drought_search.json](samples/drought_search.json), [samples/drought_search_datetime.json](samples/drought_search_datetime.json)

---

## 1. Flood: โครงสร้างข้อมูล

```
/flood                                    ← STAC root (มี /search แล้ว!)
  ├── /catalogs/flood_forecast             (ยังไม่ได้สำรวจ)
  ├── /catalogs/flood_monthly              (ยังไม่ได้สำรวจ)
  ├── /catalogs/flood_r1                   (ยังไม่ได้สำรวจ — เวอร์ชันเก่ากว่า r2?)
  ├── /catalogs/flood_r2                   ← สำรวจแล้ว
  │     ├── /catalogs/flood_r2_2022..2025   (catalog แยกตามปี)
  │     └── /collections/
  │           ├── flood1day_r2    "Process Data 1 Day"
  │           ├── flood3days_r2   "Process Data 3 Days"
  │           ├── flood7days_r2   "Process Data 7 Days"   ← สำรวจแล้ว
  │           └── flood30days_r2  "Process Data 30 Days"
  │                 /items  →  1 item ต่อ collection (rolling window)
  │                     assets.data.href → Vallaris Dragonfly Features API (ชั้นที่ 2)
  └── /catalogs/flood_yearly               (ยังไม่ได้สำรวจ)
```

**สรุปพฤติกรรมที่ทดสอบแล้วสำหรับ `flood_r2/collections/flood7days_r2`:**

- `extent.spatial.bbox` เป็น **โลกทั้งใบ** (`[-180,-90,180,90]`) เสมอที่ระดับ Collection — placeholder ไม่ใช่ bbox จริง
- `extent.temporal.interval` **roll ตามวันปัจจุบันจริง** — query วันที่ 2026-08-03 ได้ช่วง `2026-07-28 → 2026-08-03` (7 วันย้อนหลังพอดี) → ยืนยันว่า **ห้าม cache แบบตายตัว** ตามที่ deck เตือน (§8)
- `/collections/{id}/items` คืน **1 item ต่อ collection เท่านั้น** (ไม่ใช่ 1 item ต่อพื้นที่น้ำท่วม) — เป็น "container" ที่ต้องดึง asset `data` ต่ออีกชั้น
- **item.geometry / item.bbox เป็น placeholder ครอบโลกทั้งใบเหมือนกันหมด — ห้ามใช้ทำ `fitBounds()` เด็ดขาด**
- `assets.data.href` ชี้ไปยัง resource อีกชั้นบน gateway เดียวกัน ซึ่งข้างในมี `links.self` ชี้ไปที่ **Vallaris Dragonfly Features API** (`vallaris.dragonfly.gistda.or.th`, ใช้ `api_key` คนละตัวกับ STAC token — ฝังมาให้ใน href แล้ว)
- ตอนทดสอบ (2026-08-03) พื้นที่น้ำท่วมจริง `numberMatched: 0` — ไม่มีเหตุการณ์ในช่วง 7 วันล่าสุด → **ต้อง handle empty state ใน UI** ไม่ใช่ error

→ ไฟล์เต็ม: [samples/flood_catalog.json](samples/flood_catalog.json), [samples/flood7days_collection.json](samples/flood7days_collection.json), [samples/flood7days_items.json](samples/flood7days_items.json), [samples/flood_data_asset.json](samples/flood_data_asset.json)

---

## 2. Fire: โครงสร้างข้อมูล (ต่างจาก Flood มาก)

```
/fire                                      ← STAC root (มี /search)
  ├── /catalogs/fire_                      "Catalog fire Category By weekly process"
  │     └── /catalogs/fire__2025 → ... → /collections/fire__YYYYMMDD  (1 collection ต่อ 1 วัน)
  ├── /catalogs/modis                      "Catalog for MODIS Hotspots"
  │     ├── /catalogs/modis_2022..2026      (catalog แยกตามปี)
  │     └── /catalogs/modis_processing
  └── /catalogs/viirs                      "Catalog for VIIRS Hotspots"
        ├── /catalogs/viirs_2022..2026      (catalog แยกตามปี)
        ├── /catalogs/viirs_processing
        └── /collections/viirs_realtime     ← มี realtime ด้วย
```

**ความต่างจาก flood ที่สำคัญ:**

| | Flood | Fire |
|---|---|---|
| หน่วยข้อมูล | polygon (พื้นที่น้ำท่วม) | point (hotspot จากดาวเทียม) |
| Collection scheme | rolling window (1/3/7/30 วัน) — 4 collection คงที่ | **1 collection ต่อ 1 วัน** (`fire__20250201` ฯลฯ) — `GET /fire/collections` รายงาน **matched: 3190** collections |
| แหล่งข้อมูล | ระบบเดียว (Flood_R2) | 3 แหล่งคู่ขนาน: `fire_` (weekly-process), `modis`, `viirs` (+ viirs_realtime) |
| bbox ของ item | placeholder โลกทั้งใบ | bbox จริงของ**พื้นที่ที่ประมวลผล** (เช่น ครอบภูมิภาคเอเชียตะวันออกเฉียงใต้ `[92.77,-2.93,121.37,30.10]`) — ยังไม่ใช่ bbox ของจุด hotspot แต่ละจุด |

**เพราะ collection เป็นแบบ "1 ต่อวัน" (3,190 อัน) การไล่ enumerate collection ทีละอันเพื่อหาว่าวันไหนมี fire ไม่สมเหตุสมผล — ต้องใช้ `/fire/search?bbox=...&datetime=...` เพื่อกรองข้าม collection ทีเดียว (ทดสอบแล้วใช้งานได้จริง ดูหัวข้อด้านบน)**

### โครงสร้าง item จาก `/fire/search` (ตัวอย่างจริง วันที่ 2025-02-01)

```json
{
  "id": "viirs_20250201",
  "collection": "viirs_20250201",
  "bbox": [91.92449, -8.53947, 140.4438, 30.92082],
  "properties": { "datetime": "2025-02-01T00:10:00Z" },
  "assets": {
    "data": { "type": "application/geo+json", "roles": ["Features"] },
    "tile": { "type": "application/json", "roles": ["Vector Tiles"] }
  }
}
```

### Asset `data` ของ fire → Vallaris Dragonfly (จุด hotspot จริง)

ต่างจาก flood ตรงที่**มีข้อมูลจริงให้ทดสอบ** (13,442 hotspot ที่ matched ในตัวอย่างเดียว, paginate ด้วย `offset`):

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [122.7704, -8.5391] },
  "properties": {
    "acq_date": "2025-01-31", "acq_time": "1734",
    "instrument": "VIIRS", "satellite": "N",
    "confidence": "nominal", "frp": 2.95,
    "bright_ti4": 335.34, "bright_ti5": 287.5,
    "changwat": null, "amphoe": null, "tambol": null,
    "ct_en": "Indonesia", "ct_tn": "อินโดนีเซีย"
  }
}
```

**ข้อสังเกตสำคัญที่มีผลต่อการ grounding (§5 ของ [learning-notes.md](learning-notes.md)):**
- แต่ละ hotspot มี field เขตปกครองไทยติดมาให้แล้ว (`changwat`=จังหวัด, `amphoe`=อำเภอ, `tambol`=ตำบล) เวลาอยู่ในไทย — เป็น**ข้อมูลย้อนกลับ (reverse geocode)** ที่ provider ทำให้แล้ว ต่างจาก flood ที่ต้อง grounding เอง อาจใช้ field พวกนี้ filter ตามจังหวัดได้โดยตรงถ้า schema เอื้อ (ต้องทดสอบเพิ่มกับจุดที่อยู่ในไทยจริง เพราะตัวอย่างที่ได้อยู่อินโดนีเซีย เลย field เป็น null หมด)
- มี `confidence` (nominal/low/high) และ `frp` (Fire Radiative Power) — มีประโยชน์สำหรับ severity/filter คุณภาพสัญญาณ
- data volume ใหญ่มาก (หมื่น+ ต่อวันต่อ instrument) → ต้องกรองด้วย bbox/datetime ที่ query เสมอ ห้ามดึงทั้งหมดมากรองฝั่ง client

→ ไฟล์เต็ม: [samples/fire_root.json](samples/fire_root.json), [samples/fire_collections.json](samples/fire_collections.json), [samples/fire_weekly_catalog.json](samples/fire_weekly_catalog.json), [samples/fire_modis.json](samples/fire_modis.json), [samples/fire_viirs.json](samples/fire_viirs.json), [samples/fire_search_filtered.json](samples/fire_search_filtered.json), [samples/fire_viirs_data_asset.json](samples/fire_viirs_data_asset.json)

---

## 3. Drought: โครงสร้างข้อมูล (แบบที่สาม — ต่างจากทั้ง flood และ fire)

```
/drought                                   ← STAC root (มี /search)
  ├── /catalogs/dri_plus                   "Catalog dri_plus Category By weekly process"
  │     └── /catalogs/dri_plus_2024..2026   (catalog แยกตามปี) → collections/dri_plus_YYYYMMDD (รายสัปดาห์)
  ├── /catalogs/lst                        "Catalog lst Category By weekly process"   (Land Surface Temperature)
  ├── /catalogs/ndwi                       "Catalog ndwi Category By weekly process"  (Normalized Difference Water Index)
  └── /catalogs/smap                       "Catalog smap Category By weekly process"  (Soil Moisture Active Passive)
```

`GET /drought/collections` → `context.matched: 479` collections รวม 4 ดัชนี, ตั้งชื่อแบบ `{index}_YYYYMMDD` และห่างกันครั้งละ ~7 วัน (เช่น `dri_plus_20240105`, `..._20240112`, `..._20240119` ...) — เป็น **"1 collection ต่อสัปดาห์ต่อดัชนี"** ไม่ใช่ rolling window แบบ flood และไม่ใช่รายวันแบบ fire

**ความต่างที่สำคัญที่สุด: item.bbox/geometry ของ drought เป็นค่าจริง (ไม่ใช่ placeholder โลกทั้งใบเหมือน flood)** — เป็น bounding box ประเทศไทยทั้งประเทศ (`[97.34, 5.62, 105.64, 20.47]`) คงที่ทุก item เพราะแต่ละ collection ประมวลผลครอบคลุมทั้งประเทศ

### Asset `data` ของ drought → polygon ระดับตำบล พร้อมชื่อเขตปกครองในตัว

ต่างจาก flood/fire ตรงที่ **grounding มาให้พร้อมในข้อมูลเลย** ไม่ต้องพึ่ง gazetteer แยก:

```json
{
  "type": "Feature",
  "geometry": { "type": "MultiPolygon", "coordinates": [ /* ขอบเขตตำบลจริง */ ] },
  "properties": {
    "pv_en": "Bangkok", "pv_tn": "กรุงเทพมหานคร", "pv_idn": "10",
    "ap_en": "BANG KHEN", "ap_tn": "บางเขน", "ap_idn": "1005",
    "tb_en": "THA RAENG", "tb_tn": "ท่าแร้ง", "tb_idn": "100508",
    "re_royin": "Central",
    "h3_address": "8764a48ebffffff",
    "dri_mean": null
  }
}
```

**ข้อสังเกตสำคัญ:**
- ทุก polygon มี `pv_en`/`pv_tn` (จังหวัด), `ap_en`/`ap_tn` (อำเภอ), `tb_en`/`tb_tn` (ตำบล) ครบ — ระดับตำบลทั่วประเทศ → **สามารถ query/join ด้วยชื่อจังหวัด/อำเภอตรงๆ ได้โดยไม่ต้องแปลงเป็น bbox ก่อน** ถ้า API filter รองรับ (ยังไม่ได้ทดสอบ query param แบบชื่อ แค่เห็นว่า field มีอยู่จริง)
- มี `h3_address` — [H3 geospatial index](https://h3geo.org/) ของ Uber ติดมาด้วย เผื่อใช้ spatial indexing/aggregation
- `dri_mean` (ค่าดัชนี drought risk เฉลี่ยของโซนนั้น) เป็น `null` ในตัวอย่างที่ดึงมา — ต้องดูตัวอย่างที่มีค่าจริงเพิ่มเพื่อเข้าใจ scale/threshold ของค่า
- **ปริมาณข้อมูลใหญ่มาก:** collection เดียว (`dri_plus_20240105`) มี **85,528 features** (polygon ระดับตำบลทั่วประเทศ) → ห้ามดึงทั้งหมดมาแสดงบนแผนที่โดยไม่กรอง ต้องกรองด้วย bbox/province เสมอ

→ ไฟล์เต็ม: [samples/drought_root.json](samples/drought_root.json), [samples/drought_collections.json](samples/drought_collections.json), [samples/drought_dri_plus_catalog.json](samples/drought_dri_plus_catalog.json), [samples/drought_search.json](samples/drought_search.json), [samples/drought_data_asset.json](samples/drought_data_asset.json)

---

## เทียบโครงสร้างทั้ง 3 hazard

| | Flood | Fire | Drought |
|---|---|---|---|
| หน่วยข้อมูล | polygon (พื้นที่น้ำท่วม) | point (hotspot ดาวเทียม) | polygon (โซนระดับตำบล) |
| Collection scheme | rolling window (1/3/7/30 วัน) — 4 collection คงที่ | 1 collection/วัน (3,190 อัน) | 1 collection/สัปดาห์/ดัชนี (479 อัน, 4 ดัชนี) |
| แหล่งข้อมูลย่อย | ระบบเดียว (Flood_R2, + r1/forecast/monthly/yearly ที่ยังไม่สำรวจ) | 3 แหล่งคู่ขนาน: fire_/modis/viirs | 4 ดัชนีคู่ขนาน: dri_plus/lst/ndwi/smap |
| item.bbox/geometry | placeholder โลกทั้งใบ (**ห้ามใช้ทำแผนที่**) | bbox จริงของพื้นที่ประมวลผล (ระดับภูมิภาค) | bbox จริง (ครอบทั้งประเทศไทย ระดับ collection) |
| Grounding ในตัว | ไม่มี — ต้องพึ่ง gazetteer แยก | มี field `changwat`/`amphoe`/`tambol` แต่ยังไม่ยืนยันกับจุดในไทยจริง | **มีครบ** `pv_en`/`ap_en`/`tb_en` ระดับตำบล ในทุก polygon |
| Volume ต่อ query | น้อย (0-1 event/collection ตอนทดสอบ) | มาก (หมื่น+ ต่อวันต่อ instrument) | มาก (85,528 polygon/collection) |
| ต้องดึง asset `data` อีกชั้นไหม | ต้อง (Vallaris Dragonfly) | ต้อง (Vallaris Dragonfly) | ต้อง (Vallaris Dragonfly) |

**ข้อสรุปสำหรับ implement:** ทั้ง 3 hazard ใช้ pattern เดียวกันในระดับ STAC (root → search/collections → item → asset.data → Vallaris) แต่ **ต่างกันโดยสิ้นเชิงในเรื่อง grounding และ volume** — โค้ดที่ query ควรเป็น generic ผ่าน `/search`, แต่โค้ดที่ประมวลผล/แสดงผล (grounding, filter, styling บนแผนที่) ควรแยก logic ตาม hazard เพราะ shape ของข้อมูลต่างกันจริง (point vs 2 แบบของ polygon ที่มี/ไม่มี grounding ในตัว)

---

## Pipeline ที่แนะนำ (ปรับจากที่ deck สรุปแบบง่ายใน §8)

deck บอกว่า `hazard + days → เดา collection id ตายตัว → GET /collections/{id}/items?bbox=...` — **จากการทดสอบจริง แนะนำให้ใช้ `/search` แทน** เพราะทำงานได้ทั้ง 3 hazard (ยืนยัน bbox+datetime บน fire และ drought แล้ว) โดยไม่ต้องรู้ naming convention ที่ต่างกันของแต่ละ hazard:

```
1. Gemma 3 extraction → { hazard, location_text, time_window_days }
2. Gazetteer: location_text → bbox จริง (ไม่ใช่หน้าที่ LLM)
   - ยกเว้น drought: ถ้า location_text ตรงกับชื่อจังหวัด/อำเภอ อาจ match ตรงกับ pv_en/ap_en ในข้อมูลได้เลย
     (ยังไม่ยืนยันว่า filter แบบชื่อใช้ได้ผ่าน query param จริง — อาจต้องกรองฝั่ง client จาก field เหล่านี้แทน)
3. คำนวณ datetime interval จาก time_window_days (เช่น 7 วันล่าสุด → "2026-07-28/2026-08-03")
4. GET /{hazard}/search?bbox=...&datetime=...&token=...
   - flood: อาจเพิ่ม ?collections=flood{N}days_r2 เพื่อจำกัดช่วงเวลาแบบ pre-aggregated ของเขา
   - fire/drought: ไม่ต้องรู้ collection id เลย เพราะมีเป็นร้อย/พันๆ (รายวัน/รายสัปดาห์)
5. สำหรับแต่ละ item ที่ได้ → อ่าน item.assets.data.href แล้วดึงต่ออีกชั้น (Vallaris Dragonfly)
   - นี่คือ geometry จริง (flood: polygon, fire: point, drought: polygon ระดับตำบล) — item ระดับ STAC เองใช้ทำแผนที่ไม่ได้ตรงๆ เสมอไป (ยกเว้น drought ที่ item.bbox เป็นค่าจริงระดับประเทศแล้ว)
6. drought มี volume สูงมาก (85k+ polygon/collection) → ต้อง paginate/limit เสมอ ห้ามดึงทั้งหมด
7. ถ้า numberMatched/numberReturned == 0 ทุกชั้น → แสดง "ไม่พบข้อมูลในเงื่อนไขนี้" ไม่ใช่ error
```

**ยังไม่ยืนยัน / ต้องทดสอบเพิ่มเมื่อมี quota token ใหม่:**
- [ ] `/flood/search` รองรับ `bbox`/`datetime` filter จริงหรือไม่ (ทดสอบแค่ `?collections=` — ได้ผล แต่ยังไม่ได้ลอง bbox/datetime กับ flood โดยตรง แม้ fire และ drought ยืนยันแล้วว่า pattern เดียวกันใช้ได้)
- [ ] `changwat`/`amphoe`/`tambol` ของ fire hotspot ใช้ query/filter ได้โดยตรงไหม (ตัวอย่างที่ได้เป็น null เพราะจุดอยู่นอกไทย)
- [ ] `pv_en`/`ap_en`/`tb_en` ของ drought filter ผ่าน query param ได้ไหม หรือต้องดึง bbox มาแล้วกรองฝั่ง client เอง — **อัปเดต:** พบว่า `pv_idn`/`ap_idn`/`tb_idn` (รหัส ไม่ใช่ชื่อ) ตรงกับ `area_idn` ของ internal gazetteer เป๊ะ (ดู [gazetteer-structure.md](gazetteer-structure.md)) ดังนั้นต่อให้ query param ไม่รองรับ filter ด้วยชื่อ ก็ join ด้วยรหัสฝั่ง client ได้แม่นยำอยู่แล้ว
- [ ] `dri_mean` และค่า index อื่น (lst/ndwi/smap) มี scale/threshold อย่างไร (ตัวอย่างที่ได้เป็น `null`)
- [ ] `flood_r1`, `flood_forecast`, `flood_monthly`, `flood_yearly` (เห็นใน `/flood` root แต่ยังไม่ได้ไล่ดูข้างใน)
- [ ] `modis`/`viirs` แต่ละอันน่าจะมี schema properties เหมือนกัน (ทดสอบแค่ viirs) — MODIS อาจมี field เพิ่ม/ต่างเรื่อง resolution
- [ ] `viirs_realtime` collection (เห็นใน fire root แต่ยังไม่ได้สำรวจ) — น่าจะสำคัญสำหรับ query "ตอนนี้"

## Endpoint สรุปสำหรับ implement

| Endpoint | Method | Hazard | หมายเหตุ |
|---|---|---|---|
| `/{hazard}` | GET | ทั้ง 3 | root — ดู `links` เพื่อหา `search`, `collections`, `conformance` |
| `/{hazard}/search` | GET | ทั้ง 3 | **แนะนำใช้จุดนี้เป็นหลัก** รองรับ `bbox`, `datetime`, `collections`, `limit` |
| `/{hazard}/collections` | GET | ทั้ง 3 | list ทั้งหมด, paginated — fire 3,190 / drought 479 รายการ ห้าม enumerate ทั้งหมด |
| `/flood/collections/{flood1day\|3days\|7days\|30days}_r2` | GET | flood | metadata ของแต่ละช่วงเวลา |
| `/fire/collections/fire__YYYYMMDD` | GET | fire | metadata รายวัน (ปกติไม่ต้องเรียกตรง ใช้ search แทน) |
| `/drought/collections/{dri_plus\|lst\|ndwi\|smap}_YYYYMMDD` | GET | drought | metadata รายสัปดาห์ต่อดัชนี (ปกติไม่ต้องเรียกตรง ใช้ search แทน) |
| `{item.assets.data.href}` | GET | ทั้ง 3 | เรียกต่อเพื่อได้ geometry จริง (Vallaris Dragonfly API, ใช้ api_key ที่ฝังมาให้แล้วใน href) |
