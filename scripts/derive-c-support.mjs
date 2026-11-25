/**
 * Split each approved C plate into a latched support leg and two root layers.
 * The approved PNG is only read. Colors of the visible leg come from that PNG.
 * A seam under the cloak is filled so the leg can slide out without a hole.
 * At a zero shift the seam stays covered and the picture matches the source.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const W = 512;
const H = 640;
const PRESERVE_Y = 436;
const EMPTY_ALPHA = 8;
const UPPER_ALPHA = 16;
const SHAFT_ALPHA = 200;
const SHAFT_DISTANCE = 12;
const SEAM_RADIUS = 14;
const SEAM_FRINGE = 2;

export const SPECS = [
  { id: "E0-C1", foot: 1, role: "outgoing", sole: { x: 205.5, y: 570 } },
  { id: "E0-C2", foot: 1, role: "outgoing", sole: { x: 205.5, y: 570 } },
  { id: "E0-C3", foot: 1, role: "outgoing", sole: { x: 205.5, y: 570 } },
  { id: "E1-C1", foot: 0, role: "outgoing", sole: { x: 204.5, y: 570 } },
  { id: "E1-C2", foot: 0, role: "outgoing", sole: { x: 204.5, y: 570 } },
  { id: "E1-C3", foot: 0, role: "outgoing", sole: { x: 204.5, y: 570 } },
];

export function readPng(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error(`not a png ${file}`);
  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) throw new Error(`unsupported png ${file}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const src = Buffer.alloc(height * stride);
  let i = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[i++];
    const row = src.subarray(y * stride, (y + 1) * stride);
    const prev = y === 0 ? Buffer.alloc(stride) : src.subarray((y - 1) * stride, y * stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? row[x - 4] : 0;
      const up = prev[x];
      const ul = x >= 4 ? prev[x - 4] : 0;
      const v = raw[i++];
      if (filter === 0) row[x] = v;
      else if (filter === 1) row[x] = (v + left) & 255;
      else if (filter === 2) row[x] = (v + up) & 255;
      else if (filter === 3) row[x] = (v + ((left + up) >> 1)) & 255;
      else if (filter === 4) {
        const p = left + up - ul;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - ul);
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
        row[x] = (v + pr) & 255;
      } else throw new Error(`filter ${filter}`);
    }
  }
  return { width, height, data: src };
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function pngBytes(img) {
  const { width, height, data } = img;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    for (let x = 0; x < width * 4; x++) raw[row + 1 + x] = data[y * width * 4 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function sha(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function shaftLike(full, shaft, o) {
  if (shaft[o + 3] <= SHAFT_ALPHA) return false;
  let d = 0;
  for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(full[o + k] - shaft[o + k]));
  return d < SHAFT_DISTANCE;
}

function supportMask(full, upper, shaft, sole) {
  const allow = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    const y = (i / W) | 0;
    if (full[o + 3] < EMPTY_ALPHA || y < PRESERVE_Y || upper[o + 3] > UPPER_ALPHA) continue;
    if (shaftLike(full, shaft, o)) continue;
    allow[i] = 1;
  }
  let sx = Math.round(sole.x);
  let sy = Math.round(sole.y);
  let start = -1;
  for (let dy = 0; dy <= 20 && start < 0; dy++) {
    for (const dx of [0, -1, 1, -2, 2]) {
      const x = sx + dx;
      const y = sy - dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (allow[y * W + x]) {
        start = y * W + x;
        sx = x;
        sy = y;
        break;
      }
    }
  }
  if (start < 0) throw new Error(`no support seed near ${sole.x},${sole.y}`);
  const seen = new Uint8Array(W * H);
  const stack = [start];
  seen[start] = 1;
  let minX = sx;
  let maxX = sx;
  let minY = sy;
  let maxY = sy;
  let count = 0;
  while (stack.length) {
    const i = stack.pop();
    count++;
    const x = i % W;
    const y = (i / W) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (seen[j] || !allow[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return { seen, seed: { x: sx, y: sy }, bbox: [minX, minY, maxX, maxY], count };
}

export function derivePlate(full, upper, shaft, spec) {
  const mask = supportMask(full, upper, shaft, spec.sole);
  const back = Buffer.alloc(W * H * 4);
  const support = Buffer.alloc(W * H * 4);
  const front = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    if (full[o + 3] < 1) continue;
    const dest = mask.seen[i] ? support : shaftLike(full, shaft, o) ? back : front;
    dest[o] = full[o];
    dest[o + 1] = full[o + 1];
    dest[o + 2] = full[o + 2];
    dest[o + 3] = full[o + 3];
  }
  const seamAt = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask.seen[y * W + x]) continue;
      for (let dy = -SEAM_RADIUS; dy <= SEAM_FRINGE; dy++) {
        for (let dx = -SEAM_RADIUS; dx <= SEAM_FRINGE; dx++) {
          if (dx * dx + dy * dy > SEAM_RADIUS * SEAM_RADIUS) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (mask.seen[j] || full[j * 4 + 3] !== 255) continue;
          seamAt[j] = 1;
        }
      }
    }
  }
  let seam = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!seamAt[y * W + x]) continue;
      let best = 1e9;
      let bx = x;
      let by = y;
      for (let sy = -SEAM_RADIUS; sy <= SEAM_RADIUS; sy++) {
        for (let sx = -SEAM_RADIUS; sx <= SEAM_RADIUS; sx++) {
          const qx = x + sx;
          const qy = y + sy;
          if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
          if (!mask.seen[qy * W + qx]) continue;
          const dd = sx * sx + sy * sy;
          if (dd < best) {
            best = dd;
            bx = qx;
            by = qy;
          }
        }
      }
      const s = (by * W + bx) * 4;
      const d = (y * W + x) * 4;
      support[d] = support[s];
      support[d + 1] = support[s + 1];
      support[d + 2] = support[s + 2];
      support[d + 3] = 255;
      seam++;
    }
  }
  return { back, support, front, mask, seam };
}

export function recombine(parts, shiftX = 0, shiftY = 0) {
  const out = Buffer.alloc(W * H * 4);
  const blit = (src, ox, oy) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const sx = x - ox;
        const sy = y - oy;
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
        const so = (sy * W + sx) * 4;
        const a = src[so + 3] / 255;
        if (a <= 0) continue;
        const d = (y * W + x) * 4;
        const da = out[d + 3] / 255;
        const outA = a + da * (1 - a);
        for (let k = 0; k < 3; k++) {
          out[d + k] = Math.round((src[so + k] * a + out[d + k] * da * (1 - a)) / outA);
        }
        out[d + 3] = Math.round(outA * 255);
      }
    }
  };
  blit(parts.back, 0, 0);
  blit(parts.support, shiftX, shiftY);
  blit(parts.front, 0, 0);
  return out;
}

function repoRoot() {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}

export function deriveAll(root = repoRoot()) {
  const upper = readPng(path.join(root, "public/art/eastline/shared-fixed-upper.png")).data;
  const shaft = readPng(path.join(root, "public/art/eastline/shared-rear-shaft.png")).data;
  return SPECS.map((spec) => {
    const sourceName = `${spec.id}-refined-static-transition.png`;
    const sourcePath = path.join(root, "public/art/eastline/c-refined-20261116", sourceName);
    const sourceBytes = fs.readFileSync(sourcePath);
    const full = readPng(sourcePath).data;
    const derived = derivePlate(full, upper, shaft, spec);
    const flat = recombine(derived, 0, 0);
    let mismatch = 0;
    for (let i = 0; i < full.length; i++) if (full[i] !== flat[i]) mismatch++;
    if (mismatch !== 0) throw new Error(`${spec.id} zero-shift mismatch ${mismatch}`);
    return { spec, sourceName, sourceSha: sha(sourceBytes), derived, full };
  });
}

function writeAll() {
  const root = repoRoot();
  const outDir = path.join(root, "public/art/eastline/c-refined-20261116-derived");
  fs.mkdirSync(outDir, { recursive: true });
  const plates = deriveAll(root);
  const manifest = {
    method:
      "Flood the planted leg on the approved plate below y=436, outside the shared upper and the rear shaft. Copy those pixels into the support layer. Copy shaft-like pixels to root-back and the rest to root-front. Extend the support 14px up-left under fully opaque front pixels so the cloak tuck survives the latch shift. The extension stays hidden when the shift is zero.",
    thresholds: {
      preserveY: PRESERVE_Y,
      emptyAlpha: EMPTY_ALPHA,
      upperAlpha: UPPER_ALPHA,
      shaftAlpha: SHAFT_ALPHA,
      shaftDistance: SHAFT_DISTANCE,
      seamRadius: SEAM_RADIUS,
      seamFringe: SEAM_FRINGE,
    },
    plates: [],
  };
  for (const plate of plates) {
    const files = {
      support: `${plate.spec.id}-support.png`,
      back: `${plate.spec.id}-root-back.png`,
      front: `${plate.spec.id}-root-front.png`,
    };
    const buffers = {
      support: pngBytes({ width: W, height: H, data: plate.derived.support }),
      back: pngBytes({ width: W, height: H, data: plate.derived.back }),
      front: pngBytes({ width: W, height: H, data: plate.derived.front }),
    };
    for (const key of ["support", "back", "front"]) fs.writeFileSync(path.join(outDir, files[key]), buffers[key]);
    manifest.plates.push({
      id: plate.spec.id,
      source: `c-refined-20261116/${plate.sourceName}`,
      sourceSha256: plate.sourceSha,
      foot: plate.spec.foot,
      role: plate.spec.role,
      sole: plate.spec.sole,
      seed: plate.derived.mask.seed,
      bbox: plate.derived.mask.bbox,
      supportPixels: plate.derived.mask.count,
      seamPixels: plate.derived.seam,
      outputs: {
        support: { file: files.support, sha256: sha(buffers.support) },
        rootBack: { file: files.back, sha256: sha(buffers.back) },
        rootFront: { file: files.front, sha256: sha(buffers.front) },
      },
    });
  }
  fs.writeFileSync(path.join(outDir, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function checkAll() {
  const root = repoRoot();
  const outDir = path.join(root, "public/art/eastline/c-refined-20261116-derived");
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "MANIFEST.json"), "utf8"));
  const plates = deriveAll(root);
  if (plates.length !== manifest.plates.length) throw new Error("manifest count");
  for (let i = 0; i < plates.length; i++) {
    const plate = plates[i];
    const row = manifest.plates[i];
    const buffers = {
      support: pngBytes({ width: W, height: H, data: plate.derived.support }),
      back: pngBytes({ width: W, height: H, data: plate.derived.back }),
      front: pngBytes({ width: W, height: H, data: plate.derived.front }),
    };
    for (const [key, fileKey] of [
      ["support", "support"],
      ["back", "rootBack"],
      ["front", "rootFront"],
    ]) {
      const name = row.outputs[fileKey].file;
      const disk = fs.readFileSync(path.join(outDir, name));
      if (sha(disk) !== sha(buffers[key])) throw new Error(`${name} does not match the script`);
      if (row.outputs[fileKey].sha256 !== sha(disk)) throw new Error(`${name} manifest hash`);
    }
    if (row.sourceSha256 !== plate.sourceSha) throw new Error(`${plate.spec.id} source hash`);
  }
  console.log(`checked ${plates.length} derived plates`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const cmd = process.argv[2];
  if (cmd === "--check") checkAll();
  else if (cmd === "--write" || cmd === undefined) {
    const manifest = writeAll();
    console.log(JSON.stringify(manifest.plates.map((p) => ({ id: p.id, seam: p.seamPixels, support: p.supportPixels })), null, 2));
  }
}
