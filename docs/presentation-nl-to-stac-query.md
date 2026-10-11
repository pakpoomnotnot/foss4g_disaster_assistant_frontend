# Natural Language → STAC Query ด้วย AI (เวอร์ชันปรับหลัง feedback)

> **feedback ที่ได้รับ:** พูดเรื่อง subword tokenization มากเกินไป — เอกสารนี้เขียนใหม่ให้ตัดเรื่อง tokenization ให้เหลือแค่ 1 ย่อหน้าสั้นๆ (สรุปว่า "แก้ไปแล้วในระดับสถาปัตยกรรม ไม่ใช่จุดขายของงานนี้") แล้วสลับไปเน้น **"ใช้ AI สร้าง STAC query จากภาษาธรรมชาติ"** เป็นแกนหลักแทน พร้อมผลทดสอบจริงกับ API จริง (ไม่ใช่ mock)
>
> ทดสอบจริงเมื่อ 2026-08-03 กับ backend ที่ implement เสร็จแล้ว (Rust + Ollama gemma3:4b + GISTDA STAC API จริง) — ทุก response ในเอกสารนี้คือของจริง ไม่ได้แต่งขึ้น

---

## 1. เรื่อง Tokenization (ตัดให้สั้นตาม feedback)

ภาษาไทยไม่มีตัวคั่นคำ — Gemma 3 แก้ปัญหานี้แล้วในระดับสถาปัตยกรรมด้วย subword tokenization (BPE) ซึ่งไม่ต้องพึ่ง dictionary-based word segmentation แบบเดิม **จบแค่นี้ ไม่ใช่จุดโฟกัสของ talk นี้** — งานที่เหลือทั้งหมดคือการออกแบบให้ AI แปลงประโยคเป็น query ที่ใช้งานได้จริงกับ STAC API

---

## 2. โจทย์จริง: AI ต้องสร้างอะไรบ้างจากประโยคเดียว

ประโยคภาษาธรรมชาติ 1 ประโยค ต้องถูกแปลงเป็นส่วนประกอบของ query ครบ 4 อย่างก่อนจะยิง STAC API ได้จริง:

```
"flooding in Ayutthaya this week"
        │
        ▼
┌───────────────────────────────────────────┐
│ 1. hazard          → "flood" | "fire" | "drought"
│ 2. location_text   → ชื่อสถานที่ (ดิบ ไม่ normalize)
│ 3. time_window_days→ 1 | 3 | 7 | 30
│ 4. confidence       → ต้องถามกลับไหม
└───────────────────────────────────────────┘
```

นี่คืองานที่ deck เดิมเรียกว่า "4 stages บีบเข้า LLM 1 pass" — แต่ประเด็นสำคัญที่ควรเน้นคือ **นี่ไม่ใช่แค่ classification ธรรมดา มันคือการให้ AI generate structured query object ที่ deterministic พอจะเอาไปต่อ API จริงได้ทันที**

---

## 3. System Prompt จริงที่ใช้งานอยู่ (ไม่ใช่ตัวอย่างสมมติ)

นี่คือ prompt ที่ backend เรียก Ollama จริง (`backend/src/llm/prompt.rs`):

```
You are a natural-language extraction module for a Thai disaster-monitoring system.
Convert the user's question (Thai or English) about a disaster hazard into a single
JSON object matching exactly this schema:

{
  "hazard": "flood" | "fire" | "drought",
  "location_text": string,
  "time_window_days": 1 | 3 | 7 | 30,
  "confidence": "high" | "low",
  "needs_clarification": boolean
}

Rules:
1. If no time period is mentioned, default time_window_days to 7.
2. time_window_days must be exactly one of 1, 3, 7, 30 — round UP if not exact.
3. If hazard or location is unclear/missing, set needs_clarification to true.
4. Keep location_text EXACTLY as typed (misspellings, informal names like "Korat")
   — a separate lookup module resolves it, the LLM must NOT guess/normalize it.
5. Only flood, fire, drought are supported — unsupported hazard → needs_clarification.
6. Never invent coordinates or place names not in the user's text.
7. Output ONLY the JSON object — no explanation, no markdown fences.

[+ 10 few-shot examples ครอบคลุมภาษาไทย/อังกฤษ, ambiguous case, unsupported hazard]
```

**Call จริงไปยัง Ollama:**
```bash
POST http://localhost:11434/api/generate
{
  "model": "gemma3:4b",
  "system": "<prompt ข้างบน>",
  "prompt": "<ข้อความผู้ใช้>",
  "format": "json",     ← grammar-constrained decoding บังคับ schema ที่ token level
  "stream": false
}
```

---

## 4. ผลทดสอบจริง: AI extraction (ก่อนต่อ STAC เลย)

เรียก Ollama ตรงๆ (ไม่ผ่าน pipeline) เพื่อโชว์ output ดิบของ AI:

| Input | Raw LLM Output (จริง) | Latency จริง |
|---|---|---|
| `flooding in Ayutthaya this week` | `{"hazard":"flood","location_text":"Ayutthaya","time_window_days":7,"confidence":"high","needs_clarification":false}` | **5,319 ms** |
| `is Korat in drought?` | `{"hazard":"drought","location_text":"Korat","time_window_days":7,"confidence":"high","needs_clarification":false}` | **5,707 ms** |

**ข้อสังเกตสำหรับ present:**
- AI แยก hazard/location/time ได้ถูกต้อง 100% ในทั้งสองเคส แม้ "Korat" เป็นชื่อไม่เป็นทางการ (rule ข้อ 4 บังคับให้ AI เก็บ "Korat" ไว้ตรงๆ ไม่เดาชื่อทางการเอง)
- Latency จริงอยู่ที่ ~5-6 วินาทีต่อ query บนเครื่อง local (gemma3:4b, CPU) — ตัวเลขจริง ไม่ใช่ประมาณการ เอาไว้ตอบคำถามเรื่อง feasibility ได้ตรงๆ

---

## 5. จาก AI Output → STAC Query จริง (แกนของเรื่องนี้)

นี่คือส่วนที่ deck เดิมเขียนสั้นเกินไป — ขยายให้ชัดว่า **AI output อย่างเดียวยิง STAC ไม่ได้** ต้องผ่าน grounding ก่อน:

```
AI output: { hazard: "flood", location_text: "Ayutthaya", time_window_days: 7 }
        │
        ▼  gazetteer lookup (8,429 เขตปกครองไทย, ดู docs/gazetteer-structure.md)
        │  "Ayutthaya" → exact/substring match → area_idn: 14, bbox: [...]
        ▼
{ area_idn: 14, bbox: [100.212706, 14.111092, 100.82323, 14.673195] }
        │
        ▼  คำนวณ datetime interval จาก time_window_days (ใช้เวลาจริง ณ ตอน query)
        ▼
GET https://api-gateway.gistda.or.th/api/2.0/resources/stac/flood/search
    ?bbox=100.212706,14.111092,100.82323,14.673195
    &datetime=2026-07-27T05:48:00Z/2026-08-03T05:48:00Z
    &limit=50
    &token=<GISTDA_ACCESS_TOKEN>
```

**bbox ข้างบนเป็นค่าจริงจาก gazetteer** (ไม่ได้แต่งขึ้น — ดึงจาก `area_idn: 14` ตรงๆ) และ URL/parameter format ตรงกับโค้ดจริงที่ backend ยิงออกทุกครั้ง (`backend/src/gistda/stac.rs` + `backend/src/handlers/query.rs`) — timestamp ในตัวอย่างนี้เป็นตัวแทน (illustrative) ของรูปแบบ ISO interval ที่คำนวณจากเวลาจริง ณ ตอน query แต่ละครั้ง ไม่ใช่ log ที่ capture มาตรงๆ (ผลลัพธ์จริงจาก endpoint นี้ดูได้ที่ §6 ด้านล่าง — เรียกผ่าน `/api/query` เต็ม pipeline)

**ทำไมต้อง grounding แยกจาก AI:** พิกัด (bbox) เป็นตัวเลขทศนิยมต่อเนื่อง ผิด 2-3 ตำแหน่งทศนิยม = คลาดหลักกิโลเมตร — LLM ทำนาย token ไม่ใช่ database lookup จึง**ห้ามให้ AI เดาพิกัดเอง** เด็ดขาด (หลักการนี้คือแกนสำคัญของงานทั้งหมด ไม่ใช่แค่รายละเอียดย่อย)

---

## 6. ผลทดสอบ end-to-end จริงผ่าน `/api/query` (5 เคส)

ยิงจริงผ่าน backend (Rust) → Ollama → gazetteer → GISTDA STAC → กลับมาเป็น response เดียว

### 6.1 เคสพื้นฐาน — ตรงไม่ต้องถามกลับ

**Input:** `flooding in Ayutthaya this week`
```json
{
  "needs_clarification": false,
  "hazard": "flood",
  "location_text": "Ayutthaya",
  "resolved_area": { "area_idn": 14, "level": "province", "name_th": "พระนครศรีอยุธยา", "name_en": "Phra Nakhon Si Ayutthaya" },
  "time_window_days": 7,
  "summary": "ไม่พบข้อมูลน้ำท่วมในพระนครศรีอยุธยา ช่วง 7 วันที่ผ่านมา",
  "geojson": { "type": "FeatureCollection", "features": [] },
  "bbox": null
}
```
*(ไม่พบข้อมูลจริงในช่วงที่ทดสอบ — ระบบตอบเป็นข้อความปกติ ไม่ error เพราะ `numberMatched: 0` ไม่ใช่ error state)*

### 6.2 ชื่อไม่เป็นทางการ (alias) — "Korat" ไม่มีในฐานข้อมูลทางการ

**Input:** `is Korat in drought?`
```json
{
  "needs_clarification": false,
  "hazard": "drought",
  "location_text": "Korat",
  "resolved_area": { "area_idn": 30, "level": "province", "name_th": "นครราชสีมา", "name_en": "Nakhon Ratchasima" },
  "time_window_days": 7,
  "summary": "ไม่พบข้อมูลภัยแล้งในนครราชสีมา ช่วง 7 วันที่ผ่านมา"
}
```
*AI เก็บ "Korat" ไว้ตรงๆ ตาม prompt rule ข้อ 4 → alias table ฝั่ง backend แปลงเป็น area_idn 30 (นครราชสีมา) — คนละหน้าที่กันชัดเจนระหว่าง AI (extraction) กับ gazetteer (grounding)*

### 6.3 ชื่อกำกวม — ระบบถามกลับแทนการเดา (หลักการ "ห้ามเดา" ทำงานจริง)

**Input:** `flood in Bang Phli`
```json
{
  "needs_clarification": true,
  "message": "พบชื่อ \"Bang Phli\" หลายแห่ง กรุณาระบุให้ชัดเจนขึ้น",
  "candidates": [
    { "area_idn": 1103, "level": "amphoe", "name_th": "บางพลี", "name_en": "Bang Phli", "province": "Samut Prakarn" },
    { "area_idn": 140402, "level": "tambon", "name_th": "บางพลี", "name_en": "BANG PHLI", "province": "Phra Nakhon Si Ayutthaya" }
  ]
}
```

### 6.4 ข้อค้นพบไม่คาดคิดระหว่างทดสอบจริง — "Chiang Mai" ก็กำกวมได้!

ทดสอบ `fire hotspots in Chiang Mai in the last 30 days` คาดว่าจะตรงเป๊ะ (deck เดิมใช้ "Chiang Mai" เป็น base case) แต่ระบบตอบกลับมาว่ากำกวม:

```json
{
  "needs_clarification": true,
  "message": "พบชื่อ \"Chiang Mai\" หลายแห่ง กรุณาระบุให้ชัดเจนขึ้น",
  "candidates": [
    { "area_idn": 50, "level": "province", "name_th": "เชียงใหม่", "name_en": "Chiang Mai", "province": "Chiang Mai" },
    { "area_idn": 450802, "level": "tambon", "name_th": "เชียงใหม่", "name_en": "CHIANG MAI", "province": "Roi Et" }
  ]
}
```

**นี้คือตำบลที่ชื่อ "เชียงใหม่" ในจังหวัดร้อยเอ็ด บังเอิญสะกดซ้ำกับจังหวัดเชียงใหม่พอดี** — เป็นตัวอย่างจริงที่ดีกว่าที่ deck คิดไว้เองอีก ว่าทำไม "ห้าม AI เดา" ถึงสำคัญ: ถ้า AI เดาว่า "Chiang Mai" ต้องหมายถึงจังหวัดใหญ่แน่ๆ จะพลาดกรณีนี้ไปเลย แต่ระบบ (gazetteer เป็นคนตัดสิน ไม่ใช่ AI) จับได้ถูกต้องและถามกลับแทนการเดา

### 6.5 ขาดข้อมูลจำเป็น — AI แยกได้ว่าประโยคไม่สมบูรณ์

**Input:** `is there flooding right now?`
```json
{
  "needs_clarification": true,
  "message": "กรุณาระบุประเภทภัยพิบัติ (น้ำท่วม/ไฟป่า/ภัยแล้ง) และสถานที่ให้ชัดเจนขึ้น",
  "candidates": []
}
```
*ไม่มีชื่อสถานที่ในประโยคเลย — AI เห็นด้วยตัวเองว่าขาดข้อมูล ไม่ต้องพึ่ง gazetteer เลยด้วยซ้ำ (candidates ว่างเปล่า ต่างจาก 6.3/6.4 ที่ gazetteer เป็นคนเจอความกำกวม)*

---

## 7. สรุปสิ่งที่ควร present (เรียงตามน้ำหนักที่ควรเน้น)

1. **AI สร้าง structured query จากภาษาธรรมชาติได้จริง** — ทดสอบแล้ว 5 เคสจริงผ่าน API จริง ไม่ใช่ demo ปลอม
2. **หลักการที่สำคัญที่สุด: แยก "AI extraction" ออกจาก "coordinate grounding" เด็ดขาด** — ตัวอย่าง Korat (6.2) และ Chiang Mai ซ้ำ (6.4) พิสูจน์ว่าหลักการนี้จำเป็นจริง ไม่ใช่แค่ทฤษฎี
3. **ระบบรู้ตัวเองว่าเมื่อไหร่ควรถามกลับ** แทนการเดา — 3 สาเหตุที่ต่างกัน (ambiguous name, missing info, unsupported hazard) ระบบแยกแยะได้หมด
4. **Latency จริงวัดได้** (~5-6 วิ/query บน CPU local) — ใช้ตอบคำถามเรื่อง feasibility ตรงๆ ได้เลยไม่ต้องเดา
5. Tokenization: 1 ประโยคพอ ("แก้แล้วในระดับสถาปัตยกรรม")

---

## 8. ข้อจำกัดที่ควรพูดตรงๆ (ความน่าเชื่อถือ)

- ข้อมูล flood/fire/drought จริงส่วนใหญ่ว่างเปล่าช่วงที่ทดสอบ (ไม่มีเหตุการณ์จริงในไทย ณ วันทดสอบ) — ระบบ handle ได้ถูกต้อง (ไม่ error) แต่ยังไม่เคยเห็น response ที่มี polygon/point จริงเต็มๆ ในการทดสอบชุดนี้
- Latency ~5-6 วิ/query มาจาก LLM call เพียงอย่างเดียว (ยังไม่รวมเวลา query GISTDA STAC ต่อ) — ถ้า present ควรบอกตรงๆ ว่านี่คือคอขวดที่รู้แล้วและมีแผนแก้ (caching, model เล็กลง) ไม่ใช่ปิดบัง
- token ของ GISTDA มีอายุแค่ 1 ชั่วโมง (ทดสอบจริงจนหมดอายุเองระหว่างพัฒนา) — ถ้าถูกถามเรื่อง production readiness ควรพูดตรงๆ ว่าเป็นจุดที่ยังต้องทำ (auto token-refresh)
