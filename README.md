# askme-disaster — Frontend

Ask about disasters in Thailand in plain Thai or English, and see the answer on a map.

Type a question such as *"น้ำท่วมอยุธยาสัปดาห์นี้"* or *"flooding in Ayutthaya this week"*. The app works out the hazard, the place and the time window, fetches the matching data from GISTDA (Thailand's space agency), draws it on the map, and writes a short summary with statistics.

This repository is the **Next.js frontend**. The Rust backend that does the language and data work lives in a sibling repository, `foss4g_disaster_assistant_backend`.

## How it works

```
User question
   │
   ▼
Frontend (this repo, Next.js + MapLibre)
   │   POST /api/query { "text": "..." }
   ▼
Backend (Rust / axum)
   1. LLM extracts { hazard, place, time window } from the text
   2. Gazetteer turns the place name into a real admin area + bbox
      (the LLM never guesses coordinates)
   3. Queries the GISTDA STAC Gateway, then the Vallaris feature API
   4. Computes statistics and asks the LLM for a short written analysis
   │
   ▼
GeoJSON + bbox + stats + analysis  →  map, legend and analysis panel
```

If the question is unclear (no hazard, an unknown place, or a place name that matches several areas), the backend asks for clarification instead of guessing, and the chat shows the candidate places to choose from.

### Supported hazards

| Hazard | Data shown |
|---|---|
| `flood` | Flooded areas |
| `fire` | VIIRS / MODIS hotspots |
| `drought` | DRI+ drought risk, SMAP soil moisture, NDWI vegetation moisture |

The three drought products share one Thai word ("ภัยแล้ง") but measure different things on different scales. `src/lib/productInfo.ts` explains each one.

## Getting started

### Prerequisites

- [Bun](https://bun.sh) (the lockfile is `bun.lock`). npm, pnpm or yarn also work.
- The backend running locally. See its README for setup. In short:

  ```bash
  cd ../foss4g_disaster_assistant_backend
  # create .env here with LLM_BASE_URL, LLM_API_KEY, LLM_MODEL and GISTDA_API_KEY
  cargo run
  ```

  It listens on `http://localhost:8080`. Check it with `curl localhost:8080/api/health`.

### Run the frontend

```bash
bun install
# create .env.local with the variables listed below
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables (`.env.local`)

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | no | Backend base URL. Defaults to `http://localhost:8080`. |
| `NEXT_PUBLIC_MAPTILER_KEY` | yes | [MapTiler](https://www.maptiler.com) key for the street and satellite basemaps. |
| `NEXT_PUBLIC_VALLARIS_KEY` | yes | Vallaris Maps key for the province and amphoe boundary vector tiles. |

`NEXT_PUBLIC_*` values are bundled into the browser JavaScript, so treat them as public. Restrict the MapTiler and Vallaris keys to your domains in their dashboards. All secret keys (LLM, GISTDA) belong only in the backend's `.env`.

### LLM choice (backend)

The backend talks to any OpenAI-compatible `/chat/completions` endpoint, configured in the backend's `.env`:

- **OpenRouter** (default): `LLM_BASE_URL=https://openrouter.ai/api/v1`, for example with `LLM_MODEL=google/gemma-4-26b-a4b-it:free`. `:free` models can be temporarily rate-limited (HTTP 429), and the backend then returns `"LLM unavailable or timed out"`.
- **Ollama** (local, no key): `LLM_BASE_URL=http://localhost:11434/v1`, for example with `LLM_MODEL=gemma3:4b`. Small models work, but their written analysis is less reliable.

## Project structure

```
src/
├── app/
│   ├── page.tsx              Page layout: chat, map and analysis panel; holds query result state
│   ├── layout.tsx            Root layout and the Kanit font
│   └── globals.css           Tailwind v4 and theme tokens
├── components/
│   ├── DisasterChat.tsx      Chat input and history, clarification prompts and candidate picking
│   ├── DisasterMap.tsx       MapLibre map: basemap toggle, admin boundaries, result layers, clustering, legend
│   └── AnalysisPanel.tsx     Stats charts, written analysis and drought product notes
└── lib/
    ├── api.ts                Typed client for the backend (/api/query, /api/health)
    ├── mapStyles.ts          Per-hazard layer styles, colour ramps and legend entries
    ├── featurePopup.ts       Feature click popups
    ├── productInfo.ts        What each drought product measures, and its scale
    ├── boundary.tsx          Province list (code, Thai and English names)
    ├── gazetteer_merged.json Thai admin gazetteer (8,429 areas). The backend also reads this file.
    └── boundary.json, bbox_pat.json   Reference data, not imported by the app code
docs/
├── stac-api-structure.md     GISTDA STAC API notes, tested against the live API
├── gazetteer-structure.md    Gazetteer format
├── learning-notes.md         Background notes
├── presentation-nl-to-stac-query.md   Walkthrough from a natural-language question to a STAC query
└── samples/                  Real API responses, kept for reference
```

> **Shared file:** the backend loads `src/lib/gazetteer_merged.json` from this repo (`GAZETTEER_PATH=../foss4g_disaster_assistant_frontend/src/lib/gazetteer_merged.json`). Keep the two repositories side by side, or point `GAZETTEER_PATH` somewhere else.

## Scripts

| Command | What it does |
|---|---|
| `bun dev` | Start the dev server on port 3000 |
| `bun run build` | Production build |
| `bun start` | Serve the production build |
| `bun run lint` | Run ESLint |

## Notes for contributors

- This project uses **Next.js 16**, which has breaking changes from earlier versions. Read the guides in `node_modules/next/dist/docs/` before changing routing, config or data fetching (see `AGENTS.md`).
- The backend API contract (every request and response field, error codes, and the GeoJSON shape for each hazard) is in the backend repo's `API.md`. Read it before changing `src/lib/api.ts`.
- UI text is mostly Thai, and responses follow the language of the question (`lang: "th" | "en"`). Code comments are in English.
- Never commit API keys. All `.env*` files are gitignored, including templates.

## Data sources

- [GISTDA](https://www.gistda.or.th) disaster data via the STAC Gateway and Vallaris
- Basemaps: [MapTiler](https://www.maptiler.com) and © OpenStreetMap contributors
- Map rendering: [MapLibre GL JS](https://maplibre.org)
