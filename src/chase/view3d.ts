import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { edgeKey, step, type Board, type ThiefHop } from "./logic";

/** 追击夜 3D view — board-game diorama (nodes + painted paths, figurine pawns), all procedural. Pure presentation. */

export type AnimalType = "cat" | "pup" | "rabbit" | "fox" | "panda" | "chick";

export interface Actor {
  x: number; // cell-space center (col + 0.5)
  y: number; // row + 0.5
  facing: number; // radians, 2D convention: 0 = east, PI/2 = south
  moving: number; // 0..1 walk intensity
}

export interface Frame {
  time: number;
  player: Actor;
  followers: (Actor & { kind: AnimalType; gone?: boolean })[];
  cages: { cell: number; kind: AnimalType }[];
  thief: (Actor & { frozen: boolean }) | null;
  danger: number[];
  walkable: number[];
  hints: number[];
  thiefHops: ThiefHop[];
  previewHops: ThiefHop[];
  exitOpen: boolean;
  shake: number;
  bump: number;
}

const C = {
  bg: 0x8e9b9c,
  slab: 0xd8d2c3,
  skirt: 0x9d9686,
  node: 0xf4f1e8,
  path: 0xf4f1e8,
  hedge: 0x6d8a5c,
  hedgeTop: 0x84a26f,
  crate: 0xb48c5c,
  block: 0xa59e8e,
  player: 0x3f6fb5,
  thief: 0x2b2b31,
  accent: 0xc45c4a,  // locked danger #C45C4A
  goal: 0xe3b347,
  mint: 0x7ba89e,  // locked path #7BA89E
  ink: 0x24303a,
};

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, flatShading: false, ...opts });
}

function gloss(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.08 });
}

/** Round figurine base. */
function pawnBase(color: number, r = 0.3): THREE.Group {
  const g = new THREE.Group();
  const m = gloss(color);
  const a = mesh(new THREE.CylinderGeometry(r, r * 1.06, 0.07, 28), m, 0, 0.035, 0);
  const b = mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.9, 0.05, 28), m, 0, 0.095, 0);
  g.add(a, b);
  return g;
}

/** Hitman-GO style glossy figurine: base + lathe body + ball head + minimal face. */
function makePawn(color: number, face: number, extra?: (g: THREE.Group, m: THREE.Material) => void): THREE.Group {
  const g = new THREE.Group();
  const m = gloss(color);
  g.add(pawnBase(color));
  const prof = [
    [0.0, 0.12], [0.2, 0.12], [0.19, 0.16], [0.13, 0.26], [0.1, 0.42], [0.12, 0.5], [0.14, 0.55], [0.08, 0.6], [0.0, 0.6],
  ].map(([x, y]) => new THREE.Vector2(x!, y!));
  g.add(mesh(new THREE.LatheGeometry(prof, 24), m));
  g.add(blob(m, 0.13, 0.13, 0.13, 0, 0.71, 0));
  const fm = new THREE.MeshStandardMaterial({ color: face, roughness: 0.4 });
  for (const s of [-1, 1]) g.add(blob(fm, 0.018, 0.022, 0.018, 0.12, 0.73, s * 0.045));
  extra?.(g, m);
  g.userData.legs = [];
  return g;
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

const SPH = new THREE.SphereGeometry(1, 14, 10);
const BOX = new RoundedBoxGeometry(1, 1, 1, 2, 0.18);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const CONE = new THREE.ConeGeometry(1, 1, 10);

function blob(m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh {
  const o = mesh(SPH, m, x, y, z);
  o.scale.set(sx, sy, sz);
  return o;
}

function textSprite(text: string, color: string, bg: string | null, size = 128): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  if (bg) {
    g.fillStyle = bg;
    g.beginPath();
    g.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = color;
  g.font = `bold ${Math.round(size * 0.6)}px sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, size / 2, size * 0.54);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 10;
  return sp;
}

function pillSprite(text: string, color: string, bg: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 192;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(6, 10, 180, 76, 38);
  g.fill();
  g.fillStyle = color;
  g.font = "bold 54px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 96, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 11;
  return sp;
}

/** Model forward = +x (matches 2D facing). Returns group with userData.legs for the walk bob. */
export function makeAnimal(kind: AnimalType): THREE.Group {
  const g = new THREE.Group();
  const P: Record<AnimalType, { fur: number; belly: number; ear: number }> = {
    cat: { fur: 0xf0c890, belly: 0xfff4e0, ear: 0xe8a868 },
    pup: { fur: 0xd8a870, belly: 0xf7e6cc, ear: 0x8a5a36 },
    rabbit: { fur: 0xf6f2ee, belly: 0xffffff, ear: 0xf3b6c2 },
    fox: { fur: 0xe8874a, belly: 0xfff4e8, ear: 0x3a2a22 },
    panda: { fur: 0xf6f6f2, belly: 0xffffff, ear: 0x2a2a2e },
    chick: { fur: 0xf6d65a, belly: 0xfff0a0, ear: 0xf09a3a },
  };
  const p = P[kind];
  const fur = mat(p.fur);
  const belly = mat(p.belly);
  const earM = mat(p.ear);
  const dark = mat(0x2a2a2e, { roughness: 0.4 });
  const pink = mat(0xf39aa8);
  const body = kind === "chick" ? blob(fur, 0.26, 0.24, 0.24, 0, 0.26, 0) : blob(fur, 0.3, 0.2, 0.2, -0.04, 0.22, 0);
  g.add(body);
  const head = blob(fur, 0.2, 0.19, 0.2, 0.2, kind === "chick" ? 0.42 : 0.4, 0);
  g.add(head);
  if (kind !== "chick") g.add(blob(belly, 0.1, 0.08, 0.12, 0.32, 0.36, 0)); // muzzle
  // eyes + nose
  for (const s of [-1, 1]) g.add(blob(dark, 0.035, 0.04, 0.035, 0.36, 0.45, s * 0.08));
  if (kind === "chick") {
    const beak = mesh(CONE, mat(0xf09a3a), 0.42, 0.4, 0);
    beak.scale.set(0.05, 0.1, 0.05);
    beak.rotation.z = -Math.PI / 2;
    g.add(beak);
    const comb = blob(mat(0xe8574a), 0.04, 0.06, 0.03, 0.18, 0.62, 0);
    g.add(comb);
  } else g.add(blob(kind === "rabbit" ? pink : dark, 0.03, 0.025, 0.035, 0.42, 0.39, 0));
  if (kind === "panda") for (const s of [-1, 1]) g.add(blob(dark, 0.06, 0.06, 0.05, 0.33, 0.45, s * 0.085));
  // ears
  for (const s of [-1, 1]) {
    if (kind === "cat" || kind === "fox") {
      const e = mesh(CONE, earM, 0.16, 0.6, s * 0.11);
      e.scale.set(0.07, 0.16, 0.07);
      e.rotation.x = s * 0.25;
      g.add(e);
    } else if (kind === "rabbit") {
      const e = blob(fur, 0.05, 0.2, 0.06, 0.13, 0.7, s * 0.07);
      e.rotation.x = s * 0.18;
      g.add(e);
      g.add(blob(pink, 0.025, 0.15, 0.04, 0.15, 0.7, s * 0.07));
    } else if (kind === "pup") {
      const e = blob(earM, 0.06, 0.13, 0.05, 0.18, 0.4, s * 0.2);
      e.rotation.x = s * 0.5;
      g.add(e);
    } else if (kind === "panda") g.add(blob(dark, 0.06, 0.06, 0.04, 0.16, 0.56, s * 0.13));
    else g.add(blob(fur, 0.05, 0.08, 0.06, -0.02, 0.3, s * 0.22)); // chick wings
  }
  // tail
  const tail =
    kind === "fox"
      ? blob(fur, 0.18, 0.08, 0.08, -0.38, 0.28, 0)
      : kind === "rabbit"
        ? blob(belly, 0.07, 0.07, 0.07, -0.33, 0.26, 0)
        : kind === "chick"
          ? blob(fur, 0.06, 0.06, 0.06, -0.26, 0.34, 0)
          : blob(fur, 0.15, 0.04, 0.04, -0.38, 0.3, 0);
  tail.rotation.z = kind === "cat" ? 0.7 : 0.3;
  g.add(tail);
  if (kind === "fox") g.add(blob(belly, 0.06, 0.05, 0.05, -0.54, 0.3, 0));
  // legs
  const legs: THREE.Mesh[] = [];
  const pts = kind === "chick" ? [[0.02, 0.07], [0.02, -0.07]] : [[0.12, 0.1], [0.12, -0.1], [-0.18, 0.1], [-0.18, -0.1]];
  for (const [lx, lz] of pts) {
    const l = mesh(CYL, kind === "chick" ? mat(0xf09a3a) : kind === "panda" ? dark : fur, lx!, 0.07, lz!);
    l.scale.set(0.045, 0.14, 0.045);
    legs.push(l);
    g.add(l);
  }
  g.userData.legs = legs;
  return g;
}

function makePlayer(): THREE.Group {
  // volunteer: blue pawn with a little cap brim
  return makePawn(C.player, 0xffffff, (g, m) => {
    const brim = mesh(CYL, m, 0.07, 0.79, 0);
    brim.scale.set(0.1, 0.018, 0.12);
    g.add(brim);
  });
}

function makeThief(): THREE.Group {
  // 抓宠贼: dark pawn, red eye band
  const g = makePawn(C.thief, 0xff5a48, (g) => {
    const band = mesh(CYL, new THREE.MeshStandardMaterial({ color: C.accent, roughness: 0.35 }), 0, 0.73, 0);
    band.scale.set(0.134, 0.035, 0.134);
    g.add(band);
  });
  const ice = textSprite("❄", "#3d7dcc", "rgba(255,255,255,0.9)");
  ice.scale.set(0.45, 0.45, 1);
  ice.position.set(0, 1.1, 0);
  ice.visible = false;
  g.add(ice);
  g.userData.ice = ice;
  return g;
}

/** Animal as a small pawn: coloured base + the low-poly animal on top. */
function makeAnimalPawn(kind: AnimalType): THREE.Group {
  const BASE: Record<AnimalType, number> = { pup: 0xc99a62, cat: 0xe0a04c, rabbit: 0xd6cfc4, fox: 0xd9733f, panda: 0x5b5b60, chick: 0xe8c64a };
  const g = new THREE.Group();
  const b = pawnBase(BASE[kind], 0.24);
  g.add(b);
  const a = makeAnimal(kind);
  a.position.y = 0.11;
  a.scale.setScalar(0.85);
  g.add(a);
  g.userData.legs = [];
  return g;
}

function makeCage(): THREE.Group {
  const g = new THREE.Group();
  const metal = gloss(0x8f8a80);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const bar = mesh(CYL, metal, Math.cos(a) * 0.27, 0.32, Math.sin(a) * 0.27);
    bar.scale.set(0.014, 0.6, 0.014);
    bar.castShadow = false;
    g.add(bar);
  }
  const top = mesh(new THREE.TorusGeometry(0.27, 0.022, 6, 24), metal, 0, 0.62, 0);
  top.rotation.x = Math.PI / 2;
  g.add(top);
  return g;
}

function makeGate(): THREE.Group {
  // goal node: gold ring + flag
  const g = new THREE.Group();
  const ring = mesh(new THREE.TorusGeometry(0.27, 0.035, 8, 32), gloss(C.goal), 0, 0.04, 0);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const pole = mesh(CYL, gloss(0xe8e4da), 0.16, 0.42, -0.12);
  pole.scale.set(0.018, 0.84, 0.018);
  g.add(pole);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.32, -0.1);
  shape.lineTo(0, -0.2);
  shape.closePath();
  const flagM = new THREE.MeshStandardMaterial({ color: 0x9a958a, roughness: 0.5, side: THREE.DoubleSide });
  const flag = mesh(new THREE.ShapeGeometry(shape), flagM, 0.16, 0.84, -0.12);
  g.add(flag);
  const lock = textSprite("🔒", "#24303a", null);
  lock.scale.set(0.34, 0.34, 1);
  lock.position.set(0, 0.35, 0);
  g.add(lock);
  g.userData = { flag, lock, flagM };
  return g;
}

export class ChaseView3D {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  private boardGroup = new THREE.Group();
  private board: Board | null = null;
  private player = makePlayer();
  private thief = makeThief();
  private followers: THREE.Group[] = [];
  private followerKinds: AnimalType[] = [];
  private cages = new Map<number, { cage: THREE.Group; animal: THREE.Group }>();
  private gate = makeGate();
  private danger: { tile: THREE.Mesh; mark: THREE.Sprite }[] = [];
  private walkable: THREE.Mesh[] = [];
  private hints: THREE.Sprite[] = [];
  private arrows: { g: THREE.Group; m: THREE.MeshStandardMaterial; stop: THREE.Sprite[]; num: THREE.Sprite[] }[] = [];

  private makeArrow(): (typeof this.arrows)[number] {
    const m = new THREE.MeshStandardMaterial({ color: 0x5b8fa8, emissive: 0x5b8fa8, emissiveIntensity: 0.15, transparent: true, opacity: 0.92, roughness: 0.9, metalness: 0 }); // thief preview #5B8FA8
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.12), m);
    shaft.position.x = -0.12;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.28, 3), m);
    head.rotation.z = -Math.PI / 2;
    head.position.x = 0.25;
    head.scale.z = 0.35;
    g.add(shaft, head);
    // numbered stop markers: "1 停" / "2 停" = that hop is blocked, the thief stands still
    const stop = [pillSprite("1 停", "#ffffff", "#5B8FA8"), pillSprite("2 停", "#ffffff", "#5B8FA8")];
    for (const st of stop) st.scale.set(0.7, 0.35, 1);
    const n1 = textSprite("1", "#ffffff", "#5B8FA8");
    const n2 = textSprite("2", "#ffffff", "#5B8FA8");
    for (const n of [n1, n2]) n.scale.set(0.38, 0.38, 1);
    this.scene.add(g, ...stop, n1, n2);
    return { g, m, stop, num: [n1, n2] };
  }

  private drawHops(hops: ThiefHop[], base: number, alpha: number, t: number): void {
    const b = this.board!;
    const DX = [0, 1, 0, -1];
    const DZ = [-1, 0, 1, 0];
    hops.forEach((h, i) => {
      const a = this.arrows[base + i]!;
      const fx = (h.from % b.w) + 0.5;
      const fz = Math.floor(h.from / b.w) + 0.5;
      const dx = DX[h.dir]!;
      const dz = DZ[h.dir]!;
      const pulse = 0.08 * Math.sin(t * 5 + i);
      a.m.opacity = alpha;
      a.g.visible = true;
      a.g.position.set(fx + dx * (h.blocked ? 0.38 + pulse * 0.5 : 0.5 + pulse), 0.09 + i * 0.01, fz + dz * (h.blocked ? 0.38 + pulse * 0.5 : 0.5 + pulse));
      a.g.rotation.y = -Math.atan2(dz, dx);
      a.g.scale.setScalar(h.blocked ? 0.75 : 1);
      // hop 2 after a blocked hop 1 starts from the same cell; show it only if it differs
      const dup = i === 1 && hops[0]!.blocked && hops[0]!.dir === h.dir;
      if (dup) {
        a.g.visible = false;
        return;
      }
      const st = a.stop[i]!;
      st.visible = h.blocked;
      st.material.opacity = alpha;
      if (h.blocked) st.position.set(fx + dx * 0.55, 0.85 + i * 0.12, fz + dz * 0.55);
      const n = a.num[i]!;
      n.visible = !h.blocked;
      n.material.opacity = alpha;
      n.position.set(fx + dx * 0.5, 0.5, fz + dz * 0.5);
    });
  }
  private center = new THREE.Vector3();
  private camDist = 10;
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private sun: THREE.DirectionalLight;
  readonly ok: boolean;

  constructor(readonly canvas: HTMLCanvasElement) {
    let r: THREE.WebGLRenderer | null = null;
    try {
      r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
    } catch {
      r = null;
    }
    this.ok = !!r;
    this.renderer = r ?? (null as unknown as THREE.WebGLRenderer);
    this.scene.background = ChaseView3D.backdrop();
    this.scene.add(new THREE.HemisphereLight(0xf4f6f8, 0x6e7778, 1.5));
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
    fill.position.set(8, 6, 12);
    this.scene.add(fill);
    const sun = new THREE.DirectionalLight(0xfff6ea, 2.0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0008;
    sun.shadow.radius = 4;
    this.sun = sun;
    this.scene.add(sun, sun.target);
    this.player.scale.setScalar(1.05);
    this.thief.scale.setScalar(1.08);
    this.scene.add(this.boardGroup, this.player, this.thief, this.gate);
    if (r) {
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.05;
    }
  }

  /** Muted studio backdrop with a soft vignette (procedural). */
  private static backdrop(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 128;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(32, 52, 4, 32, 64, 90);
    gr.addColorStop(0, "#b4bdbb");
    gr.addColorStop(0.55, "#8e9b9c");
    gr.addColorStop(1, "#5f6a6d");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  setBoard(b: Board, cageKinds: AnimalType[]): void {
    this.board = b;
    for (const o of [...this.boardGroup.children]) this.boardGroup.remove(o);
    for (const { cage, animal } of this.cages.values()) this.scene.remove(cage, animal);
    this.cages.clear();
    const n = b.w * b.h;
    // walkable = reachable from the start (isolated pockets become scenery)
    const reach = new Array<boolean>(n).fill(false);
    const qq = [b.start];
    reach[b.start] = true;
    while (qq.length) {
      const c = qq.pop()!;
      for (const d of [0, 1, 2, 3] as const) {
        const m = step(b, c, d);
        if (m !== null && !reach[m]) {
          reach[m] = true;
          qq.push(m);
        }
      }
    }
    if (b.thief !== null) reach[b.thief] = true;
    const q = new THREE.Quaternion();
    const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const m4 = new THREE.Matrix4();
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // slab + skirt (floating diorama)
    const slabM = mat(C.slab, { roughness: 0.85 });
    const slab = mesh(new RoundedBoxGeometry(b.w + 0.5, 0.36, b.h + 0.5, 3, 0.12), slabM, b.w / 2, -0.18, b.h / 2);
    const skirt = mesh(new RoundedBoxGeometry(b.w + 0.3, 0.3, b.h + 0.3, 2, 0.1), mat(C.skirt), b.w / 2, -0.44, b.h / 2);
    slab.castShadow = false;
    this.boardGroup.add(slab, skirt);
    // shadow catcher far below → the board floats
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.22 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.set(b.w / 2, -1.6, b.h / 2);
    catcher.receiveShadow = true;
    this.boardGroup.add(catcher);
    // nodes + painted paths
    const cells = reach.filter(Boolean).length;
    const nodeGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.03, 24);
    const nodes = new THREE.InstancedMesh(nodeGeo, mat(C.node, { roughness: 0.6 }), cells);
    const links: [number, number, boolean][] = [];
    let ni = 0;
    for (let i = 0; i < n; i++) {
      if (!reach[i]) continue;
      const x = (i % b.w) + 0.5;
      const z = Math.floor(i / b.w) + 0.5;
      m4.compose(V(x, 0.015, z), q, V(1, 1, 1));
      nodes.setMatrixAt(ni++, m4);
      for (const d of [1, 2] as const) {
        const m = step(b, i, d);
        if (m !== null && reach[m]) links.push([i, m, d === 1]);
      }
    }
    const paths = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.012, 0.07), mat(C.path, { roughness: 0.6 }), Math.max(1, links.length));
    links.forEach(([a, , hz], k) => {
      const x = (a % b.w) + 0.5 + (hz ? 0.5 : 0);
      const z = Math.floor(a / b.w) + 0.5 + (hz ? 0 : 0.5);
      m4.compose(V(x, 0.006, z), hz ? q : qY, V(1, 1, 1));
      paths.setMatrixAt(k, m4);
    });
    paths.count = links.length;
    nodes.receiveShadow = paths.receiveShadow = true;
    this.boardGroup.add(nodes, paths);
    // thin walls → low hedges between two walkable nodes
    const hedges: [number, number, boolean][] = [];
    for (let i = 0; i < n; i++) {
      if (!reach[i]) continue;
      const x = i % b.w;
      const y = Math.floor(i / b.w);
      if (x + 1 < b.w && reach[i + 1] && b.edges.has(edgeKey(i, i + 1))) hedges.push([x + 1, y + 0.5, false]);
      if (y + 1 < b.h && reach[i + b.w] && b.edges.has(edgeKey(i, i + b.w))) hedges.push([x + 0.5, y + 1, true]);
    }
    const hedgeGeo = new RoundedBoxGeometry(0.16, 0.32, 0.92, 2, 0.06);
    const hedge = new THREE.InstancedMesh(hedgeGeo, mat(C.hedge, { roughness: 0.9 }), Math.max(1, hedges.length));
    hedges.forEach(([x, z, horiz], k) => {
      m4.compose(V(x, 0.16, z), horiz ? qY : q, V(1, 1, 1));
      hedge.setMatrixAt(k, m4);
    });
    hedge.count = hedges.length;
    hedge.castShadow = hedge.receiveShadow = true;
    this.boardGroup.add(hedge);
    // non-walkable cells → scenery: crates, stone blocks, shrubs
    const scen = { crate: [] as THREE.Matrix4[], block: [] as THREE.Matrix4[], shrub: [] as THREE.Matrix4[] };
    for (let i = 0; i < n; i++) {
      if (reach[i] || i === b.exit) continue;
      const x = (i % b.w) + 0.5;
      const z = Math.floor(i / b.w) + 0.5;
      const hsh = (i * 2654435761) >>> 0;
      const kind = hsh % 3;
      const rot = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), ((hsh >> 4) % 7) * 0.12 - 0.36);
      const mm = new THREE.Matrix4();
      if (kind === 0) scen.crate.push(mm.compose(V(x, 0.22, z), rot, V(0.5, 0.44, 0.5)));
      else if (kind === 1) scen.block.push(mm.compose(V(x, 0.17, z), rot, V(0.74, 0.34, 0.6)));
      else scen.shrub.push(mm.compose(V(x, 0.2, z), q, V(0.3, 0.26, 0.3)));
    }
    const addInst = (geo: THREE.BufferGeometry, m: THREE.Material, arr: THREE.Matrix4[]) => {
      if (!arr.length) return;
      const im = new THREE.InstancedMesh(geo, m, arr.length);
      arr.forEach((mm, k) => im.setMatrixAt(k, mm));
      im.castShadow = im.receiveShadow = true;
      this.boardGroup.add(im);
    };
    addInst(BOX, mat(C.crate, { roughness: 0.8 }), scen.crate);
    addInst(BOX, mat(C.block, { roughness: 0.9 }), scen.block);
    addInst(SPH, mat(C.hedgeTop, { roughness: 0.9 }), scen.shrub);
    // exit
    const ex = b.exit;
    this.gate.position.set((ex % b.w) + 0.5, 0, Math.floor(ex / b.w) + 0.5);
    // cages
    b.animals.forEach((cell, k) => {
      const cage = makeCage();
      const animal = makeAnimalPawn(cageKinds[k]!);
      const x = (cell % b.w) + 0.5;
      const z = Math.floor(cell / b.w) + 0.5;
      cage.position.set(x, 0, z);
      animal.position.set(x, 0, z);
      animal.rotation.y = -Math.PI / 2;
      this.scene.add(cage, animal);
      this.cages.set(cell, { cage, animal });
    });
    // camera framing: tilt ~55°
    this.center.set(b.w / 2, 0, b.h / 2 + 0.2);
    this.frame();
    const ext = Math.max(b.w, b.h);
    this.sun.position.set(this.center.x - ext * 0.4, ext * 1.2, this.center.z - ext * 0.5);
    this.sun.target.position.copy(this.center);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -ext;
    sc.right = sc.top = ext;
    sc.near = 0.5;
    sc.far = ext * 4;
    sc.updateProjectionMatrix();
  }

  private frame(): void {
    if (!this.board) return;
    const tilt = (56 * Math.PI) / 180;
    const aspect = this.camera.aspect || 1;
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const w = this.board.w + 0.8;
    const d = this.board.h * Math.sin(tilt) + 1.3 * Math.cos(tilt) + 0.6;
    this.camDist = Math.max(w / 2 / Math.tan(hfov / 2), d / 2 / Math.tan(vfov / 2)) * 0.98;
    this.camera.position.set(
      this.center.x,
      this.center.y + this.camDist * Math.sin(tilt),
      this.center.z + this.camDist * Math.cos(tilt),
    );
    this.camera.lookAt(this.center);
  }

  resize(w: number, h: number, dpr: number): void {
    if (!this.ok || w < 2 || h < 2) return;
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.frame();
  }

  /** Screen point → cell index (or -1). */
  pick(clientX: number, clientY: number): number {
    if (!this.board) return -1;
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, hit)) return -1;
    const x = Math.floor(hit.x);
    const y = Math.floor(hit.z);
    if (x < 0 || y < 0 || x >= this.board.w || y >= this.board.h) return -1;
    return y * this.board.w + x;
  }

  private place(o: THREE.Group, a: Actor, _t: number, hop = 0.3): void {
    // discrete hop between nodes: arc peaks mid-way between two cell centres
    const fx = Math.abs(a.x - 0.5 - Math.round(a.x - 0.5));
    const fz = Math.abs(a.y - 0.5 - Math.round(a.y - 0.5));
    const f = Math.max(fx, fz); // 0 at a node, 0.5 half-way
    o.position.set(a.x, a.moving > 0 ? hop * 4 * f * (1 - f) : 0, a.y);
    const target = -a.facing;
    let d = target - o.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    o.rotation.y += d * 0.35;
  }

  render(f: Frame): void {
    if (!this.ok || !this.board) return;
    const b = this.board;
    const t = f.time;
    this.place(this.player, f.player, t, 0.34);
    if (f.bump > 0) this.player.position.x += Math.sin(t * 60) * 0.04 * f.bump * 4;
    // thief
    this.thief.visible = !!f.thief;
    if (f.thief) {
      this.place(this.thief, f.thief, t, 0.3);
      (this.thief.userData.ice as THREE.Sprite).visible = f.thief.frozen;
    }
    // followers (pool by index, rebuild if kind changes)
    f.followers.forEach((a, k) => {
      if (this.followerKinds[k] !== a.kind) {
        if (this.followers[k]) this.scene.remove(this.followers[k]!);
        this.followers[k] = makeAnimalPawn(a.kind);
        this.followerKinds[k] = a.kind;
        this.scene.add(this.followers[k]!);
      }
      const o = this.followers[k]!;
      o.visible = !a.gone;
      this.place(o, a, t, 0.24);
    });
    for (let k = f.followers.length; k < this.followers.length; k++) this.followers[k]!.visible = false;
    // cages: hide animal & open once rescued
    const caged = new Set(f.cages.map((c) => c.cell));
    for (const [cell, { cage, animal }] of this.cages) {
      const on = caged.has(cell);
      animal.visible = on;
      cage.visible = on;
      if (on) animal.rotation.y = -Math.PI / 2 + Math.sin(t * 1.6 + cell) * 0.25;
    }
    // gate
    const gu = this.gate.userData as { flag: THREE.Mesh; lock: THREE.Sprite; flagM: THREE.MeshStandardMaterial };
    gu.lock.visible = !f.exitOpen;
    gu.flagM.color.setHex(f.exitOpen ? C.accent : 0x9a958a);
    gu.flag.scale.x = 1 + Math.sin(t * 3) * 0.08;
    // path highlight — walkable neighbours (#7BA89E); skip cells already marked danger
    const dangerSet = new Set(f.danger);
    const walk = f.walkable.filter((c) => !dangerSet.has(c));
    while (this.walkable.length < walk.length) {
      const ring = mesh(
        new THREE.TorusGeometry(0.22, 0.035, 8, 28),
        new THREE.MeshStandardMaterial({ color: 0x7ba89e, emissive: 0x7ba89e, emissiveIntensity: 0.12, transparent: true, opacity: 0.85, roughness: 0.9, metalness: 0 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.castShadow = false;
      this.scene.add(ring);
      this.walkable.push(ring);
    }
    this.walkable.forEach((ring, i) => {
      const c = walk[i];
      ring.visible = c !== undefined;
      if (c === undefined) return;
      const x = (c % b.w) + 0.5;
      const z = Math.floor(c / b.w) + 0.5;
      ring.position.set(x, 0.035, z);
      ring.scale.setScalar(1 + 0.04 * Math.sin(t * 4 + i));
    });
    // danger tiles
    while (this.danger.length < f.danger.length) {
      const tile = mesh(
        new THREE.TorusGeometry(0.25, 0.04, 8, 32),
        new THREE.MeshStandardMaterial({ color: 0xc45c4a, emissive: 0xc45c4a, emissiveIntensity: 0.15, roughness: 0.9, metalness: 0 }), // danger #C45C4A
      );
      tile.rotation.x = Math.PI / 2;
      tile.castShadow = false;
      const mark = textSprite("!", "#ffffff", "#C45C4A");
      mark.scale.set(0.3, 0.3, 1);
      this.scene.add(tile, mark);
      this.danger.push({ tile, mark });
    }
    this.danger.forEach((d, i) => {
      const c = f.danger[i];
      d.tile.visible = d.mark.visible = c !== undefined;
      if (c === undefined) return;
      const x = (c % b.w) + 0.5;
      const z = Math.floor(c / b.w) + 0.5;
      d.tile.position.set(x, 0.04, z);
      d.tile.scale.setScalar(1 + 0.06 * Math.sin(t * 6));
      d.mark.position.set(x, 0.42 + Math.sin(t * 5) * 0.04, z);
    });
    // hints
    while (this.hints.length < f.hints.length) {
      const s = textSprite(String(this.hints.length + 1), "#7a5a10", "#f4d66a");
      s.scale.set(0.42, 0.42, 1);
      this.scene.add(s);
      this.hints.push(s);
    }
    this.hints.forEach((s, i) => {
      const c = f.hints[i];
      s.visible = c !== undefined;
      if (c !== undefined) s.position.set((c % b.w) + 0.5, 0.3 + Math.sin(t * 4 + i) * 0.04, Math.floor(c / b.w) + 0.5);
    });
    // thief intent arrows (current position) + lighter preview for a hovered move
    const need = f.thiefHops.length + f.previewHops.length;
    while (this.arrows.length < Math.max(need, 4)) this.arrows.push(this.makeArrow());
    for (const a of this.arrows) {
      a.g.visible = a.stop[0]!.visible = a.stop[1]!.visible = false;
      a.num[0]!.visible = a.num[1]!.visible = false;
    }
    if (f.previewHops.length) this.drawHops(f.previewHops, 0, 0.55, t);
    else this.drawHops(f.thiefHops, 0, 0.92, t);
    // camera shake
    this.frame();
    if (f.shake > 0) this.camera.position.x += Math.sin(t * 80) * f.shake * 0.3;
    this.renderer.render(this.scene, this.camera);
  }
}
