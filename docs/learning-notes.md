# Learning Notes: Natural Language Querying of STAC Catalogs

> สรุปจาก slide deck "Natural Language Querying of STAC Catalogs — Thai word segmentation to LLM-powered semantic parsing for satellite data" (FOSS4G 2026, Hiroshima) โดย Pakpoom Najanthom
> Stack: Gemma 3 (Ollama) · Subword Tokenization · STAC API · MapLibre GL JS
> Source: `foss4g-nlp-stac-deck-pakpoom.pdf`

## 0. แนวคิดหลักของ Project

เป้าหมาย: แปลงคำถามภาษาธรรมชาติ (ไทย/อังกฤษ) เช่น "น้ำท่วมที่อยุธยาสัปดาห์นี้" → STAC API query → แสดงผลบนแผนที่ (MapLibre)

**Pipeline โดยรวม:**
```
Sentence (Thai/EN)
  → Gemma 3 extraction (JSON: hazard, location_text, time_window_days, confidence)
  → Thai Gazetteer lookup (location_text → bbox)   ← แยกจาก LLM โดยเด็ดขาด
  → STAC API query (hazard+days → collection, bbox → items)
  → GeoJSON response → MapLibre map render
```

หลักการสำคัญที่ยึดตลอดทั้ง deck: **"Extraction ≠ Grounding"** — ให้ LLM ทำหน้าที่แค่ดึงข้อมูล (extraction) เป็น structured JSON เท่านั้น ห้ามให้ LLM เดาพิกัด/ตัวเลขที่ต้องแม่นยำ (grounding) เอง

---

## 1. ปัญหาที่แท้จริงไม่ใช่ Word Segmentation แต่คือ Semantic Parsing (หน้า 3-4)

- ภาษาไทยไม่มีตัวคั่นคำ (no delimiters) → NLP แบบดั้งเดิมแก้ด้วย **Word Segmentation (WS)** เช่น LexTo (NECTEC): Dictionary + Trie + Longest Matching
- แต่ปัญหาจริงมี 4 stage ที่ถูกบีบอัดมาทำในการเรียก LLM ครั้งเดียว (1 pass): **Lexical → Syntactic → Semantic → Output**
- เทียบ LexTo vs TLS-ART (dictionary ที่เล็กกว่า 86%: 42,222 → 5,881 คำ) แต่ accuracy/F-measure ใกล้เคียงกัน (~0.93-0.97) → ขนาด dictionary ไม่ใช่ตัวชี้วัดคุณภาพเดียว

## 2. Gemma 3 ทำ Subword Tokenization ไม่ใช่ Word Segmentation (หน้า 5)

- Gemma 3 ไม่มี fixed dictionary — ใช้ **BPE (Byte Pair Encoding) merge operations** สร้าง subword vocabulary แบบไดนามิก
- ข้อดี: ไม่มี "unknown word" เพราะ fallback ไปถึง byte level ได้เสมอ
- เปรียบเทียบ tokenize คำว่า "flooding in Ayutthaya":
  - Dictionary-based: `["flood", "Ayutthaya"]` แต่ล้มเหลวถ้าเจอคำที่ไม่เคยเห็น (unseen) → `["flood", "Ayu", "thaya"]`
  - Subword (SentencePiece): `["_flood", "ing", "Ayu", "tthaya"]` — ทำงานได้เสมอ (robust)
- **ข้อคิด:** subword tokenization แก้ปัญหา "ไม่มีตัวคั่นคำ" ได้แล้วในระดับสถาปัตยกรรม โดยไม่ต้องพึ่ง dictionary-based word segmentation แบบเดิม

## 3. Reframing: จากประโยคสู่ Machine-Readable Query (หน้า 6-7)

- โจทย์ไม่ใช่แค่ "แปลงเป็น SQL" แต่ output ต้อง match กับ **STAC API schema**
- Pipeline: `Sentence → Validate → Schema → Query`
- **Target Schema (JSON):**
  ```json
  {
    "hazard": "flood" | "fire" | "drought",
    "location_text": "string",
    "time_window_days": 1 | 3 | 7 | 30,
    "confidence": "high" | "low",
    "needs_clarification": true | false
  }
  ```

## 4. Prompt Engineering: Constrained Generation ด้วย JSON Schema + Few-shot (หน้า 8)

**System prompt หลักการ (ย่อ):**
- แปลงคำถามภัยพิบัติ (ไทย/อังกฤษ) เป็น JSON เท่านั้น
- กฎ:
  1. ไม่ระบุช่วงเวลา → default 7 วัน
  2. ถ้าไม่ตรง 1/3/7/30 → ปัดขึ้น (round up)
  3. hazard/location ไม่ชัดเจน → ตั้ง `needs_clarification: true`
  4. เก็บ `location_text` ตามที่พิมพ์จริง ห้ามแก้/normalize เอง

**3 หลักการสำคัญ:**
1. **Few-shot > Zero-shot** — ตัวอย่างสอน pattern ที่ prompt อธิบายอย่างเดียวสอนไม่ได้ เช่น "Korat" (ชื่อไม่เป็นทางการ), "2 days → ปัดเป็น 3"
2. **Grammar-constrained decoding** — ใช้ Ollama `format: "json"` บังคับ schema ที่ระดับ token เลย ไม่ใช่แค่ prompt บอกเฉยๆ
3. **Extraction ≠ Normalization** — `location_text` ต้องไม่ถูกแปลง/เดาเป็นชื่ออื่นโดย LLM เอง เพื่อป้องกัน hallucinated names

## 5. Grounding: Correct Pipeline (หน้า 9-10)

**Pipeline การ ground ตำแหน่งจริง:**
```
1. User text: "is Korat in drought?"
2. Gemma 3 extraction → location_text: "Korat"
3. Thai gazetteer (lookup table / geocoding API)
4. Actual bbox: [102.05, 14.75, 102.15, 14.85]
5. STAC API query (bbox → items endpoint)
```

**หลักการสำคัญ: Entity Extraction ≠ Geocoding — ต้องแยกกันเสมอ**
- **LLM ห้ามเดาพิกัดเอง** — พิกัดเป็นตัวเลขต่อเนื่อง (continuous) ผิดแค่ 2-3 ตำแหน่งทศนิยม = คลาดเคลื่อนหลักกิโลเมตร เพราะ LLM ทำนาย token ไม่ใช่ database lookup
- **ชื่อสถานที่ไทยกำกวมสูง (ambiguous):** "บางพลี" มีหลายจังหวัด, "โคราช" = นครราชสีมา, "หาดใหญ่" อยู่สงขลา
- **ข้อเสนอ:** สร้าง internal gazetteer เอง (77 จังหวัด + อำเภอ + ชื่อไม่เป็นทางการ → bbox) ควบคุมได้มากกว่าพึ่ง geocoding API ภายนอกอย่างเดียว

## 6. Evaluation Design (หน้า 11-14)

**Test Case ครอบคลุม 8 หมวด (mirror ของ TLS-ART methodology: 120 files, 6 categories — เน้น cover ความยาก ไม่ใช่แค่ happy path):**

| # | ประโยคทดสอบ | ทดสอบอะไร | ผลที่คาดหวัง |
|---|---|---|---|
| 1 | "flooding in Ayutthaya this week" | Base case | flood / Ayutthaya / 7d |
| 2 | "is there flooding right now?" | Missing location | needs_clarification |
| 3 | "Ayutthya" (สะกดผิด) | Misspelling | ยัง extract ถูกต้อง |
| 4 | "is Korat in drought?" | ชื่อไม่เป็นทางการ | location = Korat |
| 5 | "check flood in Chiang Mai" | Code-switching | flood / Chiang Mai |
| 6 | "hotspots in the North, 3 days" | Hazard แบบ implied | fire / 3 days |
| 7 | "nationwide drought this month" | Location กว้างมาก | ต้องตัดสินใจเชิง design |
| 8 | "is it raining in Bangkok?" | Hazard ที่ไม่รองรับ | hazard = unknown |

**Test Harness (Python + Ollama):**
```python
def extract_query(text: str) -> dict:
    r = requests.post(OLLAMA_URL, json={
        "model": "gemma3",
        "system": SYSTEM_PROMPT,
        "prompt": text,
        "format": "json",     # grammar-constrained
        "stream": False,
    })
    return json.loads(r.json()['response'])

def run_suite(cases: list[dict]) -> dict:
    passed = 0
    for case in cases:              # 48 cases, 8 categories
        got = extract_query(case["input"])
        if got == case["expected"]:
            passed += 1
        else:
            log_failure(case, got)
    return {'passed': passed, 'total': len(cases)}
```
- 48 test cases ครอบคลุม 8 หมวด, ให้คะแนนด้วย **field-level diff กับ expected JSON** (ไม่ใช่ string match ตรงๆ)

**ตัวอย่างผลลัพธ์:**
- Test #1 (base case): exact match ทั้ง 3 field ✓
- Test #2 (missing location): ระบบ flag `needs_clarification: true` ถูกต้อง (ถามกลับแทนที่จะเดา) ✓

**Metrics (ตัวอย่างผล):**
| Field | Accuracy |
|---|---|
| hazard classification | 97.5% |
| location_text extraction | 91.8% |
| time_window_days mapping | 95.8% |
| Exact Match (ทั้ง 3 field) | 87.5% |
| Clarification detection (F1) | 0.84 |

## 7. ข้อจำกัดที่ยังไม่แก้ (Known Limitations) — หน้า 15

| ข้อจำกัด | รายละเอียด |
|---|---|
| **Latency** | LLM call ช้ากว่า regex มาก — ควรพิจารณา caching หรือใช้ model เล็กลง |
| **Consistency** | ไม่ deterministic 100% แม้ตั้ง temperature=0 (ต่างจาก dictionary-based methods) |
| **Location coverage** | lookup table (gazetteer) ต้องดูแล/อัปเดตต่อเนื่องเพื่อครอบคลุมชื่อไม่เป็นทางการ |
| **Multi-hazard queries** | ถามหลาย hazard พร้อมกัน (2+) ยังไม่รองรับใน schema ปัจจุบัน |

## 8. จาก JSON สู่ STAC Query จริง (หน้า 16-17)

**ขั้นตอนแปลง:**
1. Hazard → Catalog: `flood → catalog flood_r2`
2. Days → Collection ID: `7 → flood7days_r2`
3. bbox + collection → items: `GET /collections/{id}/items`
4. Response: `geo+json FeatureCollection`

**ตัวอย่าง Request จริง:**
```
GET /api/2.0/resources/stac/flood/collections/flood7days_r2/items
  ?bbox=100.50,14.30,100.65,14.45
  &token=<access_token>
```

**Engineering points ที่ควรระวัง:**
- `flood7days_r2` เป็น collection ที่ **roll ตามวันปัจจุบัน** → ห้าม over-cache
- พื้นที่กว้าง (wide bbox) → ต้อง **paginate ก่อน render** ไม่ดึงทีเดียวทั้งหมด

## 9. Visualization: GeoJSON → Interactive Map (หน้า 18)

**Response Contract (backend → frontend):**
```json
{
  "summary": "3 flooded areas...",
  "geojson": { "type": "FeatureCollection" },
  "bbox": [100.50, 14.30, 100.65, 14.45]
}
```

**MapLibre GL JS Layer:**
```js
map.addSource('flood-items', {
  type: 'geojson', data: geojsonResponse
});
map.addLayer({
  id: 'flood-fill', type: 'fill',
  paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.5 }
});
map.fitBounds(bbox, { padding: 40 });
```

- Gemma 3 auto-generate map style (fill-color ตาม severity/type) และใช้ `fitBounds()` จาก geometry จริงของ item
- **Accuracy compounds:** ถ้า extraction (ข้อ 4) หรือ grounding (ข้อ 5) ผิด → แผนที่ zoom ผิดจุดทันที → evaluation ต้อง cover ทั้งระบบ ไม่ใช่แค่ NLP ส่วนเดียว

## 10. สรุปข้อคิดหลัก (Conclusion — หน้า 19)

1. **แก้ปัญหาระดับสถาปัตยกรรมแล้ว** — Subword tokenization แก้ "ไม่มีตัวคั่นคำ" ไปแล้วโดยพื้นฐาน ไม่ต้องพึ่ง word segmentation แบบเดิม
2. **งานเปลี่ยนโฟกัส** — จากการ tune tokenizer ไปเป็นการออกแบบ prompt + schema + grounding pipeline
3. **หลักการสำคัญที่สุด:** แยก **extraction** (LLM หน้าที่) กับ **coordinate grounding** (lookup table/geocoding หน้าที่) ออกจากกันเด็ดขาด — LLM ห้ามเดาพิกัด
4. **ต้อง evaluate อย่างเป็นระบบ** เหมือนงานวิจัย NLP จริง (test suite ครอบคลุมหลาย edge case) ไม่ใช่แค่ demo ที่ทำงานได้บางกรณี

---

## สิ่งที่ต้องเตรียม/ทำเมื่อเริ่ม implement บน `askme-disaster`

- [ ] ตั้ง Ollama + model `gemma3` ให้รันได้ในเครื่อง (หรือ service)
- [ ] เขียน system prompt ตาม §4 พร้อม few-shot examples (Korat, "2 days → 3")
- [ ] ใช้ `format: "json"` ของ Ollama เพื่อ grammar-constrained decoding
- [x] internal gazetteer ไทย (77 จังหวัด + 928 อำเภอ + 7,424 ตำบล → bbox) **มีอยู่แล้ว** ที่ `gistda-disaster-frontend/src/lib/bbox_pat.json` — ยังขาดชื่อไม่เป็นทางการ (เช่น "Korat") ต้องทำ alias table เพิ่ม ดู [gazetteer-structure.md](gazetteer-structure.md)
- [ ] ออกแบบ mapping: hazard + time_window_days → STAC collection ID (เช่น `flood7days_r2`)
- [ ] เขียน STAC API client เรียก `/collections/{id}/items?bbox=...`
- [ ] Frontend: MapLibre GL JS, addSource/addLayer + fitBounds จาก bbox จริง
- [ ] เขียน test harness (Python) พร้อม test cases อย่างน้อย 8 หมวดตาม §6 (field-level diff, ไม่ใช่ string match)
- [ ] ระวัง caching ของ collection ที่ roll ตามวัน (`flood7days_r2`) และ pagination สำหรับพื้นที่กว้าง
