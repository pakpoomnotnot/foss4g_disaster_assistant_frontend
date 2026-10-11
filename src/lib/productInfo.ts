// What each drought product actually measures.
//
// The three share one API endpoint and one Thai word ("ภัยแล้ง"), but they are
// different measurements on incompatible scales, and a reader who does not know
// that will compare an NDWI of 0.3 against a DRI of 60 as if they meant
// something together.
//
// Scope note: the scales and class break points below are read off the source
// viewer's legends and confirmed against live features. What each index is
// derived from is described only where that is genuinely known — DRI+ is
// GISTDA's own composite and its inputs are not published in the API, so it is
// described by what it reports rather than by a formula invented here.

import type { DroughtProduct } from "@/lib/mapStyles";
import type { Lang } from "@/lib/api";

export interface ProductInfo {
  /// Short name as shown in headings.
  name: string;
  /// What the abbreviation stands for, or null when it is not an acronym.
  expansion: string | null;
  /// One or two sentences: what it measures and how to read it.
  body: string;
  /// The value range and which end is dry.
  scale: string;
}

const INFO: Record<Lang, Record<DroughtProduct, ProductInfo>> = {
  th: {
    dri_plus: {
      name: "DRI+",
      expansion: "ดัชนีความเสี่ยงภัยแล้ง (Drought Risk Index Plus) ของ GISTDA",
      body: "เป็นดัชนีรวมที่ GISTDA คำนวณขึ้นเพื่อบอกระดับความเสี่ยงภัยแล้งของพื้นที่ ไม่ได้วัดปริมาณน้ำโดยตรงเหมือนอีกสองตัว แต่เป็นการประเมินความเสี่ยงออกมาเป็นคะแนน",
      scale: "คะแนน 0–100 ยิ่งสูงยิ่งเสี่ยง พื้นที่ที่ถือว่าเสี่ยงเริ่มที่ 50 ขึ้นไป (50–59 ต่ำ, 60–69 ปานกลาง, 70–79 สูง, ตั้งแต่ 80 สูงมาก)",
    },
    smap: {
      name: "SMAP",
      expansion: "Soil Moisture Active Passive — ภารกิจดาวเทียมของ NASA",
      body: "วัดความชื้นในดินชั้นบนจากอวกาศ บอกว่าดินในพื้นที่นั้นมีน้ำอยู่มากน้อยแค่ไหน เป็นการวัดสภาพดินโดยตรง ไม่ใช่การประเมินความเสี่ยง",
      scale: "แสดงเป็นเปอร์เซ็นต์ 0–100% ยิ่งต่ำยิ่งแห้ง (0–8 ชื้นน้อยที่สุด ถึง 52–100 ชื้นมากที่สุด)",
    },
    ndwi: {
      name: "NDWI",
      expansion: "Normalized Difference Water Index",
      body: "ดัชนีที่คำนวณจากแสงที่พืชสะท้อนกลับมายังดาวเทียม ใช้ประเมินปริมาณน้ำในเนื้อพืช จึงสะท้อนผลกระทบต่อพืชผลโดยตรงมากกว่าความชื้นในดิน",
      scale: "ค่าอยู่ระหว่าง −1 ถึง 1 ยิ่งต่ำแปลว่าพืชยิ่งขาดน้ำ (ต่ำกว่า −0.14 กระทบพืชมาก, ตั้งแต่ 0.03 ขึ้นไปถือว่าชื้น)",
    },
  },
  en: {
    dri_plus: {
      name: "DRI+",
      expansion: "Drought Risk Index Plus, published by GISTDA",
      body: "A composite index GISTDA computes to rate how much drought risk an area carries. Unlike the other two it does not measure water directly — it reports an assessed risk score.",
      scale: "Scored 0–100, higher is riskier. At-risk classes start at 50 (50–59 low, 60–69 moderate, 70–79 high, 80 and above very high).",
    },
    smap: {
      name: "SMAP",
      expansion: "Soil Moisture Active Passive — a NASA satellite mission",
      body: "Measures how much water the top layer of soil holds, observed from orbit. It is a direct measurement of ground conditions rather than a risk assessment.",
      scale: "Reported as 0–100%; lower is drier (0–8 driest through 52–100 wettest).",
    },
    ndwi: {
      name: "NDWI",
      expansion: "Normalized Difference Water Index",
      body: "Derived from the light vegetation reflects back to the satellite, used to estimate the water content of the plants themselves. It therefore tracks stress on crops more directly than soil moisture does.",
      scale: "Ranges from −1 to 1; lower means more water-stressed vegetation (below −0.14 is a high impact on crops, 0.03 and above counts as moist).",
    },
  },
};

export function productInfo(
  product: DroughtProduct,
  lang: Lang,
): ProductInfo {
  return INFO[lang][product];
}

export const ABOUT_HEADING: Record<Lang, string> = {
  th: "ข้อมูลชุดนี้คืออะไร",
  en: "About this dataset",
};

export const SCALE_HEADING: Record<Lang, string> = {
  th: "การอ่านค่า",
  en: "Reading the scale",
};
