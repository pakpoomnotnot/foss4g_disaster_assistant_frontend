# Internal Gazetteer: `bbox_pat.json` + `boundary.tsx`

> วิเคราะห์เมื่อ 2026-08-03 — นี่คือ**สิ่งที่ deck เสนอไว้ใน [learning-notes.md §5](learning-notes.md#5-grounding-correct-pipeline-หน้า-9-10) พอดี** ("Proposal: internal gazetteer — 77 provinces + districts + informal names → bbox") และมีอยู่แล้วจริง

**✅ อัปเดต: ผู้ใช้ copy ไฟล์ทั้งสองเข้า `askme-disaster` แล้ว** อยู่ที่ [`src/lib/bbox_pat.json`](../src/lib/bbox_pat.json) และ [`src/lib/boundary.tsx`](../src/lib/boundary.tsx) (ตรวจสอบแล้วว่า byte-identical กับต้นฉบับใน `gistda-disaster-frontend/src/lib/`) — เรื่อง "ต้อง copy เข้า repo ไหม" ที่ค้างไว้ก่อนหน้าเสร็จแล้ว

---

## ไฟล์ที่สอง: `boundary.tsx` — ให้ hierarchy (จังหวัด→อำเภอ→ตำบล) ที่ `bbox_pat.json` ไม่มี

`bbox_pat.json` มี `area_idn`+`bbox` แต่ไม่มีความสัมพันธ์ parent-child ชัดเจน (ต้องเดาจาก prefix ของรหัสเอาเอง) `boundary.tsx` เสริมจุดนี้ให้ด้วย 3 exports ที่นับแล้วตรงกับ `bbox_pat.json` ทุกจำนวน (77/928/7,424):

```ts
export const provinceList = [
  { provinceCode: "10", provinceNameTh: "กรุงเทพมหานคร", provinceNameEn: "Bangkok" },
  // ... รวม 77 รายการ
];
export const amphoeList = [
  { amphoeCode: "1001", amphoeNameTh: "พระนคร", amphoeNameEn: "Phra Nakhon", provinceCode: "10" },
  // ... รวม 928 รายการ — มี provinceCode อ้างกลับไปหาพ่อแม่
];
export const tambonList = [
  { tambonCode: "810303", tambonNameTh: "เกาะกลาง", tambonNameEn: "KO KLANG", amphoeCode: "8103" },
  // ... รวม 7,424 รายการ — มี amphoeCode อ้างกลับไปหาพ่อแม่
];
```

**วิธีใช้ร่วมกับ `bbox_pat.json`:** join ด้วยรหัส (`provinceCode`/`amphoeCode`/`tambonCode` ↔ `area_idn` — เป็น string ใน boundary.tsx แต่เป็น number ใน bbox_pat.json ต้อง parse ก่อน join) — `boundary.tsx` ให้ชื่อ + ความสัมพันธ์ลำดับชั้น, `bbox_pat.json` ให้พิกัด bbox สำหรับ query/fitBounds

---

## โครงสร้างข้อมูล

```json
{ "data": [
  { "name_t": "ท่าแร้ง", "name_e": "THA RAENG", "area_idn": 100508, "bbox": [100.618962, 13.842544, 100.685775, 13.886752] },
  ...
]}
```

| field | ความหมาย |
|---|---|
| `name_t` | ชื่อภาษาไทย |
| `name_e` | ชื่อภาษาอังกฤษ (ทางการ, ไม่ใช่ชื่อเรียกไม่เป็นทางการ) |
| `area_idn` | รหัสเขตปกครองไทยมาตรฐาน — **ความยาวเลขบ่งบอกระดับ** |
| `bbox` | `[minLon, minLat, maxLon, maxLat]` |

**`area_idn` เข้ารหัสระดับเขตปกครองด้วยจำนวนหลัก (ยืนยันจากข้อมูลจริง):**

| จำนวนหลัก | ระดับ | จำนวนที่พบ | ตัวอย่าง |
|---|---|---|---|
| 2 หลัก | จังหวัด | **77** (ครบทุกจังหวัดของไทย) | `10` = กรุงเทพมหานคร |
| 4 หลัก | อำเภอ/เขต | **928** | `1005` = บางเขน (2 หลักแรก `10` = จังหวัดแม่) |
| 6 หลัก | ตำบล/แขวง | **7,424** | `100508` = ท่าแร้ง (4 หลักแรก `1005` = อำเภอแม่) |

รวม **8,429 records** ครอบคลุมทั้งประเทศ 3 ระดับ — โครงสร้างเป็นแบบ hierarchical prefix code (จังหวัด→อำเภอ→ตำบล ต่อกันเป็น string)

---

## ⭐ ข้อค้นพบสำคัญ: `area_idn` คือรหัสเดียวกับ `pv_idn`/`ap_idn`/`tb_idn` ใน STAC Drought data

ตรวจสอบกับข้อมูล drought จริงที่ดึงมาก่อนหน้านี้ ([stac-api-structure.md §3](stac-api-structure.md)) ซึ่งมี properties:

```json
{ "pv_idn": "10", "pv_en": "Bangkok", "ap_idn": "1005", "ap_en": "BANG KHEN", "tb_idn": "100508", "tb_en": "THA RAENG" }
```

เทียบกับ gazetteer:
```python
byid[10]     == {"name_e": "Bangkok",   "area_idn": 10,     ...}   # ตรงกับ pv_idn
byid[1005]   == {"name_e": "Bang Khen", "area_idn": 1005,   ...}   # ตรงกับ ap_idn
byid[100508] == {"name_e": "Tha Raeng", "area_idn": 100508, ...}   # ตรงกับ tb_idn
```

**ตรงกันทุกตัว** — นี่ไม่ใช่แค่ gazetteer ทั่วไป แต่เป็น **รหัสมาตรฐานเดียวกับที่ GISTDA ใช้เองในข้อมูล STAC** ผลที่ตามมา:

1. **สำหรับ drought:** ไม่ต้องแปลง `location_text` เป็น bbox แล้วไป intersect ด้วย geometry — สามารถ **match `pv_idn`/`ap_idn`/`tb_idn` ตรงๆ** กับ gazetteer ได้เลย (join แบบ exact code แม่นยำกว่า bbox intersect)
2. **สำหรับ flood/fire ที่ไม่มี field รหัสเขตติดมา (fire มีแค่ `changwat`/`amphoe`/`tambol` เป็นชื่อ ไม่ใช่รหัส):** ยังต้องพึ่ง bbox จาก gazetteer นี้เพื่อ filter query (`bbox=...` ใน `/search`) ตามปกติ
3. gazetteer นี้จึงทำหน้าที่ **2 อย่างพร้อมกัน**: (a) แปลง `location_text` → bbox สำหรับ query ทุก hazard (b) เป็น lookup table รหัส↔ชื่อสำหรับ join กับ properties ที่ drought คืนมาโดยตรง

---

## ⚠️ ข้อจำกัดที่ต้องรู้ก่อนใช้จริง (ตรงกับคำเตือนใน deck §5 พอดี)

### 1. ชื่อซ้ำกันเยอะ (ambiguous names) — ตรงกับตัวอย่าง "Bang Phli" ที่ deck ยกมา

นับจริงจากข้อมูล: **875 จาก 7,424 ชื่อตำบล (~12%)** มีชื่อซ้ำกันมากกว่า 1 แห่ง เช่น:

```
BANG PHLI   → มี "Bang Phli" (อำเภอ, 1103) + "BANG PHLI" (ตำบล, 140402) + "BANG PHLI NOI" (110203) + "BANG PHLI YAI" (110301)
KHAO DIN    → ซ้ำกัน 5 แห่งคนละจังหวัด
SIN PUN     → ซ้ำกัน 2 แห่งคนละจังหวัด
```

→ **lookup ด้วยชื่ออย่างเดียวไม่พอ** ต้องมี logic แก้ความกำกวม เช่น ให้ user เลือก, ใช้ context เพิ่ม (จังหวัดที่พูดถึงก่อนหน้า), หรือ default ไปที่ผลที่ population/พื้นที่ใหญ่สุด

### 2. ชื่อในไฟล์เป็นชื่อทางการเท่านั้น — "Korat" ไม่มีในข้อมูล, "Ayutthaya" ต้อง substring match

ทดสอบตรงกับ test case ที่ deck ใช้ใน [learning-notes.md §6](learning-notes.md#6-evaluation-design-หน้า-11-14) เอง:

| location_text ที่ deck ใช้เป็น test case | มีใน gazetteer แบบ exact match ไหม | สิ่งที่พบจริง |
|---|---|---|
| `"Ayutthaya"` (test #1) | ❌ ไม่ตรงเป๊ะ | ชื่อทางการในไฟล์คือ `"Phra Nakhon Si Ayutthaya"` (จังหวัด, code `14`) — ต้อง substring/fuzzy match |
| `"Korat"` (test #4, ชื่อไม่เป็นทางการของโคราช) | ❌ ไม่มีเลย | ชื่อทางการคือ `"Nakhon Ratchasima"` (code `30`) — **"Korat" เป็น alias ที่ต้องทำ mapping table เพิ่มเอง gazetteer ไม่มีให้** |
| `"Chiang Mai"` (test #5) | ✅ ตรงเป๊ะ | ตรงกับชื่อจังหวัดทางการ `"Chiang Mai"` (code `50`) พอดี |
| `"Hat Yai"` (deck §5 ตัวอย่าง ambiguity) | ✅ ตรงเป๊ะ | `"Hat Yai"` เป็นชื่ออำเภอทางการอยู่แล้ว (code `9011`, จังหวัดสงขลา `90`) |

**สรุป:** gazetteer นี้แก้ปัญหา "grounding ตำแหน่งทางการ" ได้ดีมาก แต่**ยังไม่ครอบคลุมชื่อเรียกไม่เป็นทางการ (informal names)** ตามที่ deck เตือนไว้ตั้งแต่แรกใน §7 ("Location coverage: lookup table needs ongoing maintenance to cover informal names") — ต้องสร้าง **alias table แยกต่างหาก** (เช่น `{"Korat": 30, "โคราช": 30}`) วางไว้เป็นชั้นก่อนเข้า gazetteer หลัก

---

## ข้อเสนอ Lookup Algorithm สำหรับ Grounding (`location_text → bbox`)

```
1. Normalize input (trim, case-insensitive)
2. Exact match กับ name_e / name_t ในทุกระดับ (จังหวัด → อำเภอ → ตำบล)
   → ถ้าเจอมากกว่า 1 (ambiguous) → ต้องมี fallback (ดู 4)
3. ถ้าไม่เจอ exact match → เช็ค alias table ที่ดูแลเอง (Korat, ชื่อเรียกลำลองอื่นๆ)
4. ถ้ายังไม่เจอ → ลอง substring/fuzzy match (เช่น "Ayutthaya" ⊂ "Phra Nakhon Si Ayutthaya")
   → ระวัง false positive จากชื่อซ้อนกัน (เช่น "Bang Phli" ไปตรงกับทั้งอำเภอและตำบลชื่อเดียวกัน)
5. ยังไม่เจอ / เจอมากกว่า 1 ที่ยังกำกวม → ตั้ง needs_clarification: true (ตาม schema ใน learning-notes.md §3)
   ห้ามเดา — ตรงกับหลักการ "LLMs must never guess coordinates" ใน deck §5
```

**field ที่ผลลัพธ์ควรคืน:** `area_idn` (ไว้ join กับ drought properties โดยตรง) + `bbox` (ไว้ query `/search` ของทุก hazard) + ระดับที่ match (province/district/subdistrict) เพื่อรู้ว่าควรขยาย/ไม่ขยาย bbox ก่อนใช้

---

## Todo ต่อจากนี้

- [x] copy ไฟล์เข้า `askme-disaster` แล้ว (`src/lib/bbox_pat.json`, `src/lib/boundary.tsx`)
- [ ] สร้าง alias table สำหรับชื่อไม่เป็นทางการ (Korat, และชื่อเล่นจังหวัด/อำเภอที่คนไทยใช้บ่อยอื่นๆ)
- [ ] ทดสอบ fuzzy/substring matching algorithm กับ test case ทั้ง 8 ข้อใน [learning-notes.md §6](learning-notes.md) จริง เพื่อดูว่า exact+substring พอไหมหรือต้องใช้ edit-distance
- [ ] ยืนยันว่า fire hotspot data (`changwat`/`amphoe`/`tambol` เป็นชื่อ ไม่ใช่รหัส) match ชื่อใน gazetteer นี้ตรงกันไหม (ทดสอบก่อนหน้าเจอแต่จุดนอกไทยที่ field เป็น null)
