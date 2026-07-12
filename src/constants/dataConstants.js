export const DEFAULT_BUILDING_LEVELS = 3;
export const OVERPASS_TIMEOUT = 1200;
export const ELEVATION_BATCH_SIZE = 1000;
export const MAX_RETRIES = 3;
export const BASE_RETRY_DELAY = 2000;
export const RETRY_DELAY_504 = 3000;
// Cap the number of buildings rendered so a large city relation can't lock the
// main thread while extruding/merging geometry.
export const MAX_BUILDINGS = 20000;

// --- Map ground (stitched OSM raster under the buildings) ---
export const TILE_SIZE = 256;
export const MIN_TILE_ZOOM = 3;
export const MAX_TILE_ZOOM = 17;
// Tile budget: 64 tiles = at most an 8x8 grid = a 2048px texture (~16MB GPU
// RGBA + mipmaps). Large areas get a lower zoom instead of a bigger texture.
export const MAX_TILES = 64;
export const TILE_CONCURRENCY = 4;
export const TILE_TIMEOUT = 15000;
export const OSM_TILE_ATTRIBUTION = 'Map tiles & data © OpenStreetMap contributors';
