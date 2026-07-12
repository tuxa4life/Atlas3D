# Chunk Streaming — Implementation Plan

Status: design agreed, not yet implemented. Branch: `chunk-loading-prep`.

## Decisions locked in
- **Backend/cache:** Node + Redis proxy. Redis caches normalized building geometry per chunk; ground raster stays a direct browser→OSM-tile fetch.
- **Roaming scope:** single fixed region (~city). One scene origin for the session; no floating origin (deferred).
- **Chunk size:** ~neighborhood = one web-mercator tile at **zoom 15** (~1.2 km), configurable.
- **Chunk contents:** buildings + per-chunk OSM raster ground. Elevation deferred (flat, `y = 0`).
- **Repo shape:** standalone `server/` folder (duplicates a couple of small utils rather than a monorepo/shared package).

## 1. Goal
Replace one-shot city loading with continuous streaming: as the camera flies, load map chunks around it and evict distant ones. A Node service fronts Overpass and caches normalized building geometry in Redis so repeat visits and multiple users are fast and Overpass isn't hammered.

## 2. Architecture at a glance
```
Browser (React/Three)
  ├─ ChunkManager: camera pos → desired chunk set → load/evict queue
  ├─ Chunk renderer: one merged building mesh + one ground plane PER chunk
  ├─ Ground tiles: fetched client-side straight from OSM raster (CDN-cached)
  └─ fetch(/chunk/15/x/y) ─────────┐
                                    ▼
Node chunk service (server/)      Redis
  ├─ GET /chunk/:z/:x/:y   ──►  cache hit → return JSON
  ├─ on miss: build Overpass bbox query for the tile
  ├─ processBuildings() (util duplicated in server/) → normalized geometry
  ├─ in-flight coalescing (one Overpass hit per chunk)
  └─ store chunk:15:x:y (TTL) ─►  Redis
```
Key split of responsibility: **Redis caches building geometry only.** Ground raster stays a direct browser→OSM-tile fetch (already CDN/browser-cached), so we don't proxy image bytes.

## 3. Coordinate model (the crucial part)
Today `createTransform` derives both **origin** and **scale** from a selection's span. For a fixed roaming origin we must **decouple scale from any single chunk**:

- **One shared transform per session**, created when the user first drops in (geolocation, search, or map click). It fixes:
  - `centerWx/centerWy` = the start location in web-mercator world space (scene origin).
  - `scale` = a **constant** chosen from chunk size, e.g. "1 z15 tile = 1200 scene units" → `scale = 1200 / tileWorldSpan(z15)`. No longer span-derived.
- Add `createFixedTransform({ centerLonLat, sceneUnitsPerTile, chunkZoom })` alongside the existing `createTransform` (keep the old one for any non-streaming path). `worldToScene`/`projectBuildings` are already pure and need **no change** — every chunk projects through this one transform, exactly as the code comments anticipate.
- **Inverse mapping** (new, tiny): `sceneToWorld(x, z, transform)` = `[x/scale + centerWx, z/scale + centerWy]`, used to turn the camera's position into a chunk coordinate.
- Elevation deferred → `minElevation = Infinity` → all `y = 0` (flat), no elevation API calls.

## 4. Chunk model
- A chunk = a **web-mercator tile at zoom 15** (`chunkZoom`, configurable). Key = `"15/x/y"`.
- Chunk world bounds via existing `tileToWorld(x,y,z)` / `tileToWorld(x+1,y+1,z)`; convert corners to lon/lat with `worldToLonLat` for the Overpass bbox (`south,west,north,east`, matching the existing bbox branch in `returnQuery`).
- **Border dedup:** an Overpass bbox returns every building *intersecting* the box, so buildings on edges appear in neighbors too. Rule: a chunk **owns** a building only if the building's **centroid tile == this chunk**. `buildingFromGeometry` already computes `center`, so this is a cheap filter. Prevents double-drawing/z-fighting.

## 5. Backend — standalone `server/` (Node + Redis)
New standalone service in `server/` (Fastify or Express). It duplicates a few small utils (`processBuildings`, `buildingSelectors`, mercator helpers) rather than sharing a package — keep the duplicated copies tiny and note the source in a comment.

Endpoints:
- `GET /chunk/:z/:x/:y` → `{ version, buildings: ProcessedBuilding[] }`.
  1. `GET chunk:z:x:y` from Redis → hit returns immediately.
  2. Miss → **coalesce** on an in-flight map so concurrent requests for the same chunk trigger **one** Overpass call.
  3. Build the tile bbox Overpass query → fetch with backoff/retry etiquette (mirror the logic in `apiService`/`fetchWithRetryService`).
  4. `processBuildings()` + centroid-ownership filter → normalized geometry (small payload: node arrays + levels only).
  5. `SET chunk:z:x:y` with TTL; return.
- Cache policy: buildings change slowly → **TTL of days–weeks** (e.g. 7d), plus a `version` field for manual purges. Store gzipped JSON to keep Redis small.
- Optional later: a **warm-up job** that pre-seeds a city's chunk grid into Redis so first-visit latency disappears.

## 6. Frontend — ChunkManager
A module driven by the render loop (throttled to ~4 Hz, not every frame):
- Compute camera chunk = `sceneToWorld(camera.x, camera.z)` → `worldToTile` → floor.
- **Desired set** = tiles within a load radius (e.g. a 7×7 ring ≈ 3 chunks out). **Keep set** slightly larger (hysteresis) so edge chunks don't thrash.
- Diff vs. loaded set:
  - Missing → enqueue **nearest-first**.
  - Beyond keep radius → evict (remove meshes + dispose geometry/material/texture).
- **Load queue:** concurrency cap (3–4 in flight); each load tagged with a request token so a chunk that leaves the keep set before it resolves is dropped (AbortController on the fetch).
- On chunk data arrival: build a **per-chunk merged building mesh** (factor today's `createCity` body into `buildChunkMesh(buildings, transform)`), plus a **per-chunk ground plane** (reuse `fetchGroundTextureService` scoped to the chunk's bounds — one seamless texture per chunk, no cross-chunk seams). Store both in `chunks.get(key)`.
- Replace `cityMeshRef` (single mesh) and the single ground effect with a `chunksRef = Map<key, {buildingMesh, groundMesh}>`.

## 7. Rendering & scene changes
- Camera `far` (15000) + a distance **fog** at the keep-radius boundary so newly-arriving chunks fade in instead of popping. Keeps the far plane sane despite roaming.
- Drop the full-screen blocking loader for streaming; use a subtle "loading N chunks" indicator. Keep the blocking loader for the very first chunk only.
- The `MAX_BUILDINGS` global cap is replaced by the bounded keep-radius (only a fixed ring is ever resident).

## 8. Edge cases to handle
- **Cold chunk latency** (miss → Overpass round-trip): show per-chunk placeholder (flat ground) until buildings land; pre-seeding solves it fully.
- **Fast flight** outrunning loads: nearest-first + cancellation + concurrency cap keep it stable; optionally pause building loads above a speed threshold and just show ground.
- **Empty chunks** (water/rural): cache the empty result too, so we don't re-query them.
- **Overpass politeness / bans:** all Overpass traffic funnels through the server, coalesced and backed off; clients never hit Overpass directly (except the Phase 1/2 dev proof).
- **Redis down:** server falls back to direct Overpass (degraded but functional).
- **Precision:** fixed origin keeps scene coords within a city's range → float32 fine. Roaming far enough to notice jitter is the boundary where you'd later add the global/floating-origin option.

## 9. Phased roadmap
1. **Coordinate groundwork (frontend-only, no backend):** add `createFixedTransform` + `sceneToWorld`; factor `buildChunkMesh`; prove that N chunks fetched *directly* from Overpass and projected through one shared transform line up seamlessly. Validates the math before infra.
2. **ChunkManager + streaming render:** camera-driven load/evict, per-chunk meshes + ground, fog, queue/cancellation. Still direct-to-Overpass (rate-limited, dev only).
3. **Standalone `server/` (Node + Redis):** `/chunk` endpoint, cache, coalescing, duplicated utils. Point the frontend at it via an env-configured base URL. This is where it becomes production-viable.
4. **Polish:** pre-seed/warm-up job, empty-chunk caching, loading UX, tuning radii/concurrency.
5. **(Deferred/optional)** elevation via terrain tiles; global floating origin.

## 10. Defaults — override any of these
| Knob | Default | Alternatives |
|---|---|---|
| Chunk zoom | z15 (~1.2 km) | z14 / z16 |
| Load radius / keep radius | 3 / 4 chunk rings | tighter=less memory, wider=fewer pop-ins |
| Load concurrency | 3–4 | higher risks Overpass backpressure |
| Redis TTL | 7 days + version | permanent w/ manual purge |
| Ground detail per chunk | sub-tiles at ~z18 stitched | z17 (lighter) / z19 (heavier) |
| Server framework | Fastify | Express |
| Fog fade | on, at keep boundary | off (hard pop-in) |

## 11. Effort estimate (rough)
Phase 1–2 (frontend chunking, direct Overpass): ~2–3 days. Phase 3 (standalone server + Redis + wiring): ~2–3 days. Phase 4 polish: ~1–2 days. Total ballpark **1–1.5 weeks** for a solid first version.

## 12. Existing code this touches
- `src/utils/dataFunctions.js` — add `createFixedTransform`, `sceneToWorld`; reuse `projectBuildings`, `worldToScene`, `processBuildings`, `buildingSelectors`, `getGeoBounds` unchanged.
- `src/utils/mercator.js` — reuse `lonLatToWorld`, `worldToLonLat`, `worldToTile`, `tileToWorld` unchanged.
- `src/services/mapTileService.js` — reuse `fetchGroundTextureService` per-chunk (scoped to a chunk's bounds).
- `src/Compontents/ThreeScene.jsx` — factor `createCity` → `buildChunkMesh`; replace `cityMeshRef` + single ground effect with a `chunksRef` map; add the ChunkManager tick to the render loop; add fog.
- `src/Context/DataContext.jsx` — hold the session-fixed transform + chunk base URL; expose streaming state instead of a single `buildings` array.
- `server/` (new) — Fastify + Redis, `/chunk/:z/:x/:y`, duplicated `processBuildings`/mercator/Overpass-query utils.
