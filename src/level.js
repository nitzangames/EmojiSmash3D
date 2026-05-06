// Browser-only helper: load a Twemoji PNG and produce 64 CanvasTextures.
// Pure helper sliceMuralBuffer is also exported and used by node tests.

const TILE = 8;

// Pure: 72×72 RGBA buffer → tiles[row][col] of 8×8 RGBA buffers.
// Steps: NearestFilter downsample 72→64, transparent→white, slice into 64 tiles.
export function sliceMuralBuffer(srcBuf, srcW, srcH) {
  // 1. Downsample to 64×64 with nearest-neighbor.
  const dst = new Uint8ClampedArray(64 * 64 * 4);
  for (let y = 0; y < 64; y++) {
    const sy = Math.floor(y * srcH / 64);
    for (let x = 0; x < 64; x++) {
      const sx = Math.floor(x * srcW / 64);
      const si = (sy * srcW + sx) * 4;
      const di = (y * 64 + x) * 4;
      const a = srcBuf[si + 3];
      if (a < 128) {
        dst[di] = 255; dst[di+1] = 255; dst[di+2] = 255; dst[di+3] = 255;
      } else {
        dst[di] = srcBuf[si]; dst[di+1] = srcBuf[si+1]; dst[di+2] = srcBuf[si+2]; dst[di+3] = 255;
      }
    }
  }
  // 2. Slice into 8×8 tiles, tiles[row][col] from top-left.
  const tiles = [];
  for (let row = 0; row < 8; row++) {
    const r = [];
    for (let col = 0; col < 8; col++) {
      const tile = new Uint8ClampedArray(TILE * TILE * 4);
      for (let ty = 0; ty < TILE; ty++) {
        for (let tx = 0; tx < TILE; tx++) {
          const si = ((row * TILE + ty) * 64 + (col * TILE + tx)) * 4;
          const di = (ty * TILE + tx) * 4;
          tile[di]   = dst[si];
          tile[di+1] = dst[si+1];
          tile[di+2] = dst[si+2];
          tile[di+3] = dst[si+3];
        }
      }
      r.push(tile);
    }
    tiles.push(r);
  }
  return tiles;
}

// Browser-only: turn an 8×8 tile buffer into a NearestFilter CanvasTexture.
// Imported lazily so the pure module can be node-tested.
export async function tileToTexture(tileBuf) {
  const THREE = await import('three');
  const c = document.createElement('canvas');
  c.width = TILE; c.height = TILE;
  const ctx = c.getContext('2d');
  const img = new ImageData(tileBuf, TILE, TILE);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

// Browser-only: load an emoji PNG by URL → tiles[row][col] of CanvasTextures.
export async function loadLevelTextures(emojiUrl) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = emojiUrl;
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const tileBufs = sliceMuralBuffer(data.data, c.width, c.height);
  const textures = [];
  for (const row of tileBufs) {
    const r = [];
    for (const tb of row) r.push(await tileToTexture(tb));
    textures.push(r);
  }
  return textures;
}
