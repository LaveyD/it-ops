/**
 * it-ops 拓扑节点 3D 模型库（过程式 Three.js，无外部网格）。
 * 来源：img2threejs-showcase-main/src/demos/itops/（itops-parts.ts / itops-batch3.ts
 * + 3 个独立工厂），由 2D 图标（apps/web/public/topology/icons/a-ziyuan*.png）
 * 过程式重建；类型→模型映射见文件底部 TYPE_MODEL。
 */
import * as THREE from 'three'


/**
 * Shared part library for the it-ops topology icon reconstructions.
 *
 * The 37 icons in the it-ops dashboard are variations of one small parts
 * family: flat database pucks, rack server units, isometric slabs and clouds,
 * combined with vertical arrows (ingest / egress / fan-out). Every part is
 * authored once here and reassembled per icon, and the four-step blue ramp is
 * sampled from the icons' own flat fills (64px PNGs):
 *
 *   top    #e0effb  light face
 *   mid    #b8d9f6  lighter wall / cloud body
 *   wall   #99c9f2  main body
 *   symbol #5ca8ea  dark symbols (arrows, slots)
 */

/**
 * Shared part library for the it-ops topology icon reconstructions.
 *
 * The 37 icons in the it-ops dashboard are variations of one small parts
 * family: flat database pucks, rack server units, isometric slabs and clouds,
 * combined with vertical arrows (ingest / egress / fan-out). Every part is
 * authored once here and reassembled per icon, and the four-step blue ramp is
 * sampled from the icons' own flat fills (64px PNGs):
 *
 *   top    #e0effb  light face
 *   mid    #b8d9f6  lighter wall / cloud body
 *   wall   #99c9f2  main body
 *   symbol #5ca8ea  dark symbols (arrows, slots)
 */

/**
 * Shared part library for the it-ops topology icon reconstructions.
 *
 * The 37 icons in the it-ops dashboard are variations of one small parts
 * family: flat database pucks, rack server units, isometric slabs and clouds,
 * combined with vertical arrows (ingest / egress / fan-out). Every part is
 * authored once here and reassembled per icon, and the four-step blue ramp is
 * sampled from the icons' own flat fills (64px PNGs):
 *
 *   top    #e0effb  light face
 *   mid    #b8d9f6  lighter wall / cloud body
 *   wall   #99c9f2  main body
 *   symbol #5ca8ea  dark symbols (arrows, slots)
 */

export const ITOPS_COLORS = {
  top: 0xe0effb,
  mid: 0xb8d9f6,
  wall: 0x99c9f2,
  symbol: 0x5ca8ea,
} as const;

export function itopsMat(color: number, roughness = 0.5): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.0 });
}

/** Short cylinder puck: light top, mid wall, closed base, thin top rim. Sits on y=0. */
export function makePuck(radius = 1, height = 0.34): THREE.Group {
  const g = new THREE.Group();
  const wallM = itopsMat(ITOPS_COLORS.wall, 0.5);
  const topM = itopsMat(ITOPS_COLORS.top, 0.4);
  const rimM = itopsMat(ITOPS_COLORS.mid, 0.45);

  const wall = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 96, 1, true), wallM);
  wall.position.y = height / 2;
  g.add(wall);

  const bottom = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), wallM);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.001;
  g.add(bottom);

  const top = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), topM);
  top.rotation.x = -Math.PI / 2;
  top.position.y = height;
  g.add(top);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.016, 12, 96), rimM);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = height;
  g.add(rim);
  return g;
}

/**
 * Vertical square-section arrow, BASE at the origin, pointing up or down.
 * Total reach from base = shaftLen + headLen.
 */
export function makeArrow(
  dir: 'up' | 'down' = 'up',
  shaftLen = 0.45,
  headLen = 0.26,
  width = 0.22
): THREE.Group {
  const g = new THREE.Group();
  const m = itopsMat(ITOPS_COLORS.symbol, 0.45);

  const shaft = new THREE.Mesh(new THREE.BoxGeometry(width, shaftLen, width), m);
  const head = new THREE.Mesh(new THREE.ConeGeometry(width * 1.45, headLen, 4), m);
  head.rotation.y = Math.PI / 4;

  if (dir === 'up') {
    shaft.position.y = shaftLen / 2;
    head.position.y = shaftLen + headLen / 2;
  } else {
    shaft.position.y = -shaftLen / 2;
    head.rotation.x = Math.PI; // tip down
    head.position.y = -shaftLen - headLen / 2;
  }
  g.add(shaft, head);
  return g;
}

/** One rack server unit: body + light top band + status dot + front slot. Sits on y=0. */
function rackUnit(): THREE.Group {
  const g = new THREE.Group();
  const w = 1.5, h = 0.5, d = 0.55;

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), itopsMat(ITOPS_COLORS.wall, 0.5));
  g.add(body);

  const band = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d * 1.02), itopsMat(ITOPS_COLORS.top, 0.4));
  band.position.y = h / 2 + 0.03;
  g.add(band);

  const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 24), itopsMat(ITOPS_COLORS.top, 0.4));
  dot.rotation.x = Math.PI / 2;
  dot.position.set(-w / 2 + 0.28, 0, d / 2 + 0.012);
  g.add(dot);

  const slot = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 0.1, 0.03), itopsMat(ITOPS_COLORS.symbol, 0.45));
  slot.position.set(0.16, 0, d / 2 + 0.012);
  g.add(slot);
  return g;
}

/** Flat cloud: wide ellipsoid base + three bumps. Roughly 1.9 wide, sits centered at y=0. */
export function makeCloud(): THREE.Group {
  const g = new THREE.Group();
  const m = itopsMat(ITOPS_COLORS.mid, 0.5);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 48), m);
  base.scale.set(1.45, 1, 0.95);
  g.add(base);

  const bumps: Array<[number, number, number]> = [
    [-0.42, 0.28, 0.4],
    [0.08, 0.44, 0.5],
    [0.56, 0.24, 0.36],
  ];
  for (const [x, y, r] of bumps) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), m);
    s.position.set(x, y, 0);
    g.add(s);
  }
  return g;
}

/** Flat arrow lying in the XZ plane. Local frame: TAIL at origin, tip toward +X. */
export function makeFlatArrow(
  shaftLen = 0.42,
  headLen = 0.22,
  width = 0.12,
  mat?: THREE.Material
): THREE.Group {
  const m = mat ?? itopsMat(ITOPS_COLORS.symbol, 0.45);
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(shaftLen, 0.04, width), m);
  shaft.position.x = shaftLen / 2;
  g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(width * 1.5, headLen, 4), m);
  head.rotation.z = -Math.PI / 2; // tip toward +X
  head.scale.set(1, 0.3, 1);
  head.position.x = shaftLen + headLen / 2;
  g.add(head);
  return g;
}

/**
 * Tail-anchored flat arrow placed on a horizontal plane: tail at polar
 * `angle`/radius `r`, tip pointing `inward ? toward center : away from it`.
 * Rotates around the Y axis.
 */
export function placeFlatArrow(
  angle: number,
  r: number,
  y: number,
  inward: boolean,
  mat?: THREE.Material
): THREE.Group {
  const holder = new THREE.Group();
  holder.add(makeFlatArrow(0.42, 0.22, 0.12, mat));
  // local +X → world (cosθ, 0, -sinθ) requires rotY(θ) = -angle
  holder.rotation.y = inward ? -angle + Math.PI : -angle;
  holder.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
  return holder;
}

/**
 * Isometric cube with the icon's 3-face shading: top = light, +Z face = wall,
 * +X face = mid, remaining faces slightly darker so they only show when orbited
 * past the icon's silhouette. Sits on y=0, centered on XZ origin.
 */
export function makeIsoCube(size = 1, height = 1, opts?: { yOffset?: number }): THREE.Group {
  const g = new THREE.Group();
  const mTop = itopsMat(ITOPS_COLORS.top, 0.4);
  const mWall = itopsMat(ITOPS_COLORS.wall, 0.5);
  const mMid = itopsMat(ITOPS_COLORS.mid, 0.5);
  const mDark = itopsMat(0x7db9ee, 0.55);
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(size, height, size),
    [mMid, mMid, mTop, mDark, mWall, mDark]
  );
  box.position.y = height / 2 + (opts?.yOffset ?? 0);
  g.add(box);
  return g;
}

/**
 * Motion/echo trail: `count` translucent copies of `shape` receding along
 * world `-X` (the icon's trail direction), each lower and fainter. The main
 * shape is expected to be added separately.
 */
export function makeEchoTrail(
  shape: () => THREE.Group,
  count = 3,
  stepX = 0.55,
  stepY = -0.12,
  opacityStep = 0.14
): THREE.Group {
  const g = new THREE.Group();
  for (let i = 1; i <= count; i++) {
    const clone = shape();
    clone.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const apply = (src: THREE.Material) => {
          const m = src.clone() as THREE.MeshStandardMaterial;
          m.transparent = true;
          m.opacity = Math.max(0.08, 0.3 - i * opacityStep);
          o.material = m as THREE.Material;
        };
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(apply);
      }
    });
    clone.position.x = -i * stepX;
    clone.position.y = i * stepY * -1; // trail rises slightly as it recedes (icon style)
    g.add(clone);
  }
  return g;
}

/**
 * Orients + places a symbol group against one side face of a cube.
 * The caller builds the symbol in a LOCAL frame where the wall plane is XY
 * (x across in [-half, half], y up in [0, height], +Z outward from the wall).
 * `face` is '+x' or '+z'; the group is rotated so local +Z points along that
 * face's outward normal and offset just off the surface.
 */
export function onWall(
  symbol: THREE.Group,
  face: '+x' | '+z',
  size: number,
  eps = 0.02
): THREE.Group {
  const holder = new THREE.Group();
  if (face === '+x') {
    // local +Z -> world +X, local +X -> world -Z
    symbol.rotation.y = -Math.PI / 2;
    holder.position.set(size / 2 + eps, 0, 0);
  } else {
    symbol.rotation.y = 0;
    holder.position.set(0, 0, size / 2 + eps);
  }
  holder.add(symbol);
  return holder;
}

/* ---------------------------------------------------------------- *
 * Icon factories — one per it-ops topology icon
 * ---------------------------------------------------------------- */

/** a-ziyuan53 — two stacked pucks, one big arrow diving into the stack (data ingest). */
export function createItopsDbImportModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-db-import';

  g.add(makePuck(1, 0.34));
  const upper = makePuck(1, 0.34);
  upper.position.y = 0.44;
  g.add(upper);

  const arrow = makeArrow('down', 0.42, 0.26, 0.24);
  arrow.position.set(0, 1.14, 0); // tip lands in the gap between the two pucks
  g.add(arrow);
  return g;
}

/** a-ziyuan54 — two stacked pucks feeding three rising upward arrows (fan-out). */
export function createItopsDbFanoutModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-db-fanout';

  const lower = makePuck(0.85, 0.3);
  lower.position.x = -0.85;
  const upper = makePuck(0.85, 0.3);
  upper.position.set(-0.85, 0.4, 0);
  g.add(lower, upper);

  const lanes: Array<[number, number]> = [
    [0.2, 0.25],
    [0.7, 0.45],
    [1.2, 0.65],
  ];
  for (const [x, lift] of lanes) {
    const a = makeArrow('up', 0.44, 0.26, 0.2);
    a.position.set(x, lift, 0);
    g.add(a);
  }
  return g;
}

/** a-ziyuan55 — single puck with one upward arrow on its right (data out). */
export function createItopsDbExportModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-db-export';

  const puck = makePuck(0.95, 0.32);
  puck.position.x = -0.55;
  g.add(puck);

  const a = makeArrow('up', 0.52, 0.3, 0.24);
  a.position.set(0.85, 0.05, 0);
  g.add(a);
  return g;
}

/** a-ziyuan58 — three-tier puck stack (tiered storage). */
export function createItopsDbStack3Model(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-db-stack3';
  for (let i = 0; i < 3; i++) {
    const p = makePuck(1, 0.32);
    p.position.y = i * 0.42;
    g.add(p);
  }
  return g;
}

/** a-ziyuan59 — two-tier puck stack. */
export function createItopsDbStack2Model(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-db-stack2';
  g.add(makePuck(1, 0.34));
  const upper = makePuck(1, 0.34);
  upper.position.y = 0.44;
  g.add(upper);
  return g;
}

/** a-ziyuan60 — two stacked rack server units. */
export function createItopsRackServerModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-rack-server';
  const u0 = rackUnit();
  const u1 = rackUnit();
  u1.position.y = 0.6;
  g.add(u0, u1);
  return g;
}

/** a-ziyuan61 — rack unit under a cloud (cloud backup / DR). */
export function createItopsCloudBackupModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-cloud-backup';

  const rack = rackUnit();
  rack.position.set(-0.9, 0, 0);
  g.add(rack);

  const cloud = makeCloud();
  cloud.position.set(0.55, 1.25, 0);
  g.add(cloud);
  return g;
}

/** a-ziyuan62 — cloud with one upward arrow (upload / push to cloud). */
export function createItopsCloudUploadModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-cloud-upload';

  const cloud = makeCloud();
  cloud.position.set(-0.35, 0.55, 0);
  g.add(cloud);

  const a = makeArrow('up', 0.55, 0.3, 0.24);
  a.position.set(1.0, 0.1, 0);
  g.add(a);
  return g;
}

/* ---------------------------------------------------------------- *
 * Batch 2 — isometric cube family (a-ziyuan 63-71)
 * ---------------------------------------------------------------- */

/** X of four flat arrows on a horizontal top face, tips toward the center. */
function topFaceXArrows(topY: number, radius: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    g.add(placeFlatArrow(angle, radius, topY, true));
  }
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.03, 24),
    itopsMat(ITOPS_COLORS.symbol, 0.45)
  );
  hub.position.y = topY;
  g.add(hub);
  return g;
}

/** a-ziyuan63 — cube with top X arrows (tips inward) + a vertical slot on the left face. */
export function createItopsCubeXModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-cube-x';
  const SIZE = 1.1;
  g.add(makeIsoCube(SIZE, 1.0));
  g.add(topFaceXArrows(1.02, SIZE * 0.36));

  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.55, 0.18),
    itopsMat(ITOPS_COLORS.symbol, 0.45)
  );
  slot.position.set(SIZE / 2 + 0.03, 0.55, 0);
  g.add(slot);
  return g;
}

/** a-ziyuan64 — cube with top X arrows (tips outward) + two slots on the right face. */
export function createItopsCubeDotModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-cube-dot';
  const SIZE = 1.1;
  g.add(makeIsoCube(SIZE, 1.0));

  const out = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    out.add(placeFlatArrow(angle, SIZE * 0.3, 1.02, false));
  }
  g.add(out);

  for (const y of [0.35, 0.72]) {
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.05, 0.4),
      itopsMat(ITOPS_COLORS.symbol, 0.45)
    );
    slot.position.set(SIZE / 2 + 0.02, y, 0);
    g.add(slot);
  }
  return g;
}

/** One echo cube: the main cube shape reused for trails. */
function echoCubeShape(): THREE.Group {
  const S = 1.1;
  const g = makeIsoCube(S, 1.0);
  g.add(topFaceXArrows(1.02, S * 0.36));
  return g;
}

/** a-ziyuan66 — cube with a three-step receding echo trail (motion / replication). */
export function createItopsCubeEchoModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-cube-echo';
  g.add(echoCubeShape());
  const trail = makeEchoTrail(echoCubeShape, 3, 0.72, 0.1, 0.11);
  trail.position.set(0.5, 0, 0);
  g.add(trail);
  g.position.x = 0.6;
  return g;
}

/** a-ziyuan67 — cube with a bold front diamond plate + two-step echo trail. */
export function createItopsCubeEcho2Model(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-cube-echo2';
  const S = 1.1;
  g.add(makeIsoCube(S, 1.0));
  g.add(topFaceXArrows(1.02, S * 0.36));

  // Bold diamond (rotated square) plate on the front face.
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.55, 0.06),
    itopsMat(ITOPS_COLORS.symbol, 0.45)
  );
  plate.rotation.z = Math.PI / 4;
  plate.position.set(0, 0.55, S / 2 + 0.04);
  g.add(plate);

  const trail = makeEchoTrail(
    () => {
      const t = makeIsoCube(S, 1.0);
      t.add(topFaceXArrows(1.02, S * 0.36));
      return t;
    },
    2,
    0.7,
    0.1,
    0.12
  );
  trail.position.set(0.4, 0, 0);
  g.add(trail);
  g.position.x = 0.5;
  return g;
}

/**
 * Wide low slab base shared by the 68-71 glyphs: a flat box reading as the
 * icon's broad diamond top + two visible sides.
 */
function wideSlab(): { g: THREE.Group; w: number; h: number } {
  const g = new THREE.Group();
  const w = 2.4, h = 0.3, d = 1.5;
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    [
      itopsMat(ITOPS_COLORS.mid, 0.5),
      itopsMat(ITOPS_COLORS.mid, 0.5),
      itopsMat(ITOPS_COLORS.top, 0.4),
      itopsMat(0x7db9ee, 0.55),
      itopsMat(ITOPS_COLORS.wall, 0.5),
      itopsMat(0x7db9ee, 0.55),
    ]
  );
  box.position.y = h / 2;
  g.add(box);
  return { g, w, h };
}

/** One diagonal arrow painted on a vertical wall face (local +Z outward). */
function wallDiagonalArrow(x: number, y: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.6, 0.05), mat);
  shaft.rotation.z = -Math.PI / 4;
  g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 4), mat);
  head.rotation.z = -Math.PI / 4; // tip along the shaft's upper direction
  head.position.set(0.21, 0.21, 0);
  head.scale.set(1, 1, 0.5);
  g.add(head);
  g.position.set(x, y, 0);
  return g;
}

/** a-ziyuan68 — wide slab, stepped glyph column on the left face, arrow on the front face. */
export function createItopsArrowsFanModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-arrows-fan';
  const { g: slab, w } = wideSlab();
  g.add(slab);

  const sym = itopsMat(ITOPS_COLORS.symbol, 0.45);
  // Stepped column on the left wall (+X end): 4 rising bars.
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14 + i * 0.09, 0.24), sym);
    bar.position.set(w / 2 + 0.02, 0.12 + i * 0.16, -0.35 + i * 0.23);
    g.add(bar);
  }
  // Big diagonal arrow on the front face.
  const arrow = wallDiagonalArrow(-0.3, 0.3, sym);
  arrow.scale.set(1.4, 1.4, 1);
  arrow.position.z = 0.76;
  g.add(arrow);
  return g;
}

/** a-ziyuan69 — wide slab with one bold diagonal arrow on the front face. */
export function createItopsArrowsRingModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-arrows-ring';
  const { g: slab } = wideSlab();
  g.add(slab);

  const arrow = wallDiagonalArrow(0.2, 0.32, itopsMat(ITOPS_COLORS.symbol, 0.45));
  arrow.scale.set(1.5, 1.5, 1);
  arrow.position.z = 0.76; // just off the front face
  g.add(arrow);
  return g;
}

/** a-ziyuan70 — wide slab with a diagonal stripe texture on the top face + front arrow. */
export function createItopsArrowsUpModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-arrows-up';
  const { g: slab } = wideSlab();
  g.add(slab);
  const H = 0.3;

  const sym = itopsMat(ITOPS_COLORS.symbol, 0.45);
  // Diagonal stripes across the top face.
  for (let i = 0; i < 5; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 1.55), sym);
    stripe.rotation.y = Math.PI / 4;
    stripe.position.set(-0.8 + i * 0.34, H + 0.02, 0);
    g.add(stripe);
  }
  const arrow = wallDiagonalArrow(-0.2, 0.2, sym);
  arrow.scale.set(1.3, 1.3, 1);
  arrow.position.z = 0.76;
  g.add(arrow);
  return g;
}

/** a-ziyuan71 — wide slab with two parallel diagonal arrow bands on top + front arrow. */
export function createItopsCubeArrowsModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-cube-arrows';
  const { g: slab } = wideSlab();
  g.add(slab);
  const H = 0.3;

  const sym = itopsMat(ITOPS_COLORS.symbol, 0.45);
  for (const off of [-0.35, 0.25]) {
    const band = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.09), sym);
    band.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), sym);
    head.rotation.z = -Math.PI / 2;
    head.rotation.y = Math.PI / 4;
    head.scale.set(1, 0.3, 1);
    head.position.x = 0.75;
    band.add(head);
    band.rotation.y = Math.PI / 4;
    band.position.set(off, H + 0.02, 0);
    g.add(band);
  }
  const arrow = wallDiagonalArrow(0.15, 0.3, sym);
  arrow.scale.set(1.4, 1.4, 1);
  arrow.position.z = 0.76;
  g.add(arrow);
  return g;
}


/**
 * Batch 3 — the it-ops topology icons a-ziyuan 76-96.
 *
 * These lean on a right-triangle wedge (the icon's recurring 2.5D prism)
 * combined with the puck / iso-cube / cloud parts from itops/itops-parts.ts, plus a
 * thin leaning wall board that reads as the icon's projected 2.5D side.
 */

/* ---------------------------------------------------------------- *
 * New parts for batch 3
 * ---------------------------------------------------------------- */

/**
 * Right-triangle wedge (triangular prism). Right angle at lower-left,
 * hypotenuse running upper-left to lower-right, extruded along +Z so the
 * triangle reads as the icon's front face. Sits on y=0, centered on XZ.
 */
export function makeWedge(w = 1.4, h = 1.0, depth = 0.9, yOffset = 0): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(w, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  const mFace = itopsMat(ITOPS_COLORS.mid, 0.5);
  const mSide = itopsMat(ITOPS_COLORS.wall, 0.5);
  const mesh = new THREE.Mesh(geo, [mFace, mSide]);
  mesh.position.set(-w / 2, yOffset, -depth / 2);
  g.add(mesh);
  return g;
}

/** A flat quarter disk (90° cylinder sector), front facing +Z, sitting on y=0. */
export function makeQuarterDisk(radius = 1.0, height = 0.5): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(radius, radius, height, 48, 1, false, 0, Math.PI / 2);
  const mArc = itopsMat(ITOPS_COLORS.mid, 0.5);
  const mTop = itopsMat(ITOPS_COLORS.top, 0.4);
  const mWall = itopsMat(ITOPS_COLORS.wall, 0.5);
  const mesh = new THREE.Mesh(geo, [mArc, mTop, mWall]);
  mesh.position.y = height / 2;
  // orient the open corner toward the front-right so the arc sweeps up-left
  mesh.rotation.y = -Math.PI / 4;
  g.add(mesh);
  return g;
}

/** A flat quarter arc band (90° torus arc), lying on y=0. Reads as a ring/arc glyph. */
export function makeQuarterRing(radius = 0.75, tube = 0.3): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.TorusGeometry(radius, tube, 18, 48, Math.PI / 2);
  const m = itopsMat(ITOPS_COLORS.mid, 0.5);
  const mesh = new THREE.Mesh(geo, m);
  mesh.rotation.x = Math.PI / 2; // lay flat
  g.add(mesh);
  return g;
}

/** Diagonal ribbon: a thin long bar rotated 45° with dark stripe ticks along it. */
export function makeDiagRibbon(len = 1.8, thick = 0.3, stripes = 6, y = 0.3): THREE.Group {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, thick), itopsMat(ITOPS_COLORS.mid, 0.5));
  g.add(bar);
  const sym = itopsMat(ITOPS_COLORS.symbol, 0.45);
  for (let i = 0; i < stripes; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.075, thick * 1.04), sym);
    s.position.x = -len / 2 + (i + 0.5) * (len / stripes);
    g.add(s);
  }
  g.rotation.z = Math.PI / 4;
  g.position.y = y;
  return g;
}

/**
 * Thin leaning wall board — approximates the icon's projected 2.5D side
 * (the large parallelogram in the lower-right of the flat glyph).
 */
function wallBoard(w = 1.3, h = 1.0, x = 0.7, y = 0.5, z = -0.35, rotY = -0.5): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.16), itopsMat(ITOPS_COLORS.wall, 0.5));
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  return m;
}

/** A cross-hatch lattice of thin bars (for the textured glyphs 91-96). */
function lattice(size = 1.1, bars = 5, y = 0.4, z = 0.02): THREE.Group {
  const g = new THREE.Group();
  const sym = itopsMat(ITOPS_COLORS.symbol, 0.45);
  for (let i = 0; i < bars; i++) {
    const off = -size / 2 + (i + 0.5) * (size / bars);
    const a = new THREE.Mesh(new THREE.BoxGeometry(size, 0.04, 0.04), sym);
    a.rotation.z = Math.PI / 4;
    a.position.set(0, y, z);
    a.translateX(off * 0.7);
    a.translateY(off * 0.7);
    g.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(size, 0.04, 0.04), sym);
    b.rotation.z = -Math.PI / 4;
    b.position.set(0, y, z);
    b.translateX(-off * 0.7);
    b.translateY(off * 0.7);
    g.add(b);
  }
  return g;
}

/* ---------------------------------------------------------------- *
 * Factories
 * ---------------------------------------------------------------- */

/** a-ziyuan76 — iso cube on the left, a wedge prism extending to its right. */
export function createItopsCubeWedgeModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-cube-wedge';
  const cube = makeIsoCube(0.9, 0.85);
  cube.position.set(-0.6, 0, 0);
  g.add(cube);
  const wedge = makeWedge(1.2, 0.95, 0.8);
  wedge.position.set(0.75, 0, 0);
  g.add(wedge);
  return g;
}

/** a-ziyuan77 — same silhouette as 76 with a denser top-face glyph. */
export function createItopsCubeWedge2Model(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-cube-wedge2';
  const cube = makeIsoCube(0.9, 0.85);
  cube.position.set(-0.6, 0, 0);
  g.add(cube);
  // denser top glyph: two crossed bars on the cube top
  const sym = itopsMat(ITOPS_COLORS.symbol, 0.45);
  for (const rot of [Math.PI / 4, -Math.PI / 4]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.08), sym);
    bar.rotation.z = rot;
    bar.rotation.x = Math.PI / 2;
    bar.position.set(-0.6, 0.88, 0);
    g.add(bar);
  }
  const wedge = makeWedge(1.2, 0.95, 0.8);
  wedge.position.set(0.75, 0, 0);
  g.add(wedge);
  return g;
}

/** a-ziyuan80 — puck + a small column of cubes feeding a wedge. */
export function createItopsDbWedgeModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-db-wedge';
  const puck = makePuck(0.62, 0.26);
  puck.position.set(-1.0, 0, 0);
  g.add(puck);
  // three small cubes stepping up toward the wedge
  for (let i = 0; i < 3; i++) {
    const c = makeIsoCube(0.34, 0.34);
    c.position.set(-0.25 + i * 0.42, i * 0.34, 0);
    g.add(c);
  }
  const wedge = makeWedge(1.1, 1.0, 0.8);
  wedge.position.set(0.9, 0, 0);
  g.add(wedge);
  return g;
}

/** a-ziyuan81 — a single bold wedge prism (the icon is essentially the prism itself). */
export function createItopsWedgeModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-wedge';
  const wedge = makeWedge(1.9, 1.5, 1.1);
  wedge.position.set(0.15, 0, 0);
  g.add(wedge);
  return g;
}

/** a-ziyuan82 — wedge with a dark slot glyph on its left face. */
export function createItopsWedgeSlotModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-wedge-slot';
  const wedge = makeWedge(1.8, 1.4, 1.0);
  wedge.position.set(0.1, 0, 0);
  g.add(wedge);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.06), itopsMat(ITOPS_COLORS.symbol, 0.45));
  slot.position.set(-0.55, 0.72, 0.53);
  g.add(slot);
  return g;
}

/** a-ziyuan83 — wedge with a small base foot at the lower-left. */
export function createItopsWedgeBaseModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-wedge-base';
  const wedge = makeWedge(1.8, 1.4, 1.0);
  wedge.position.set(0.1, 0, 0);
  g.add(wedge);
  const foot = makeWedge(0.5, 0.34, 0.7);
  foot.position.set(-1.0, 0, 0.2);
  g.add(foot);
  return g;
}

/** a-ziyuan84 — wedge with a small dot accent near the base. */
export function createItopsWedgeDotModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-wedge-dot';
  const wedge = makeWedge(1.8, 1.4, 1.0);
  wedge.position.set(0.1, 0, 0);
  g.add(wedge);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 16), itopsMat(ITOPS_COLORS.symbol, 0.45));
  dot.position.set(-1.0, 0.18, 0.55);
  g.add(dot);
  return g;
}

/** a-ziyuan85 — iso cube on the left with a larger wedge prism on the right. */
export function createItopsCubeWedgeBigModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-cube-wedge-big';
  const cube = makeIsoCube(0.95, 0.9);
  cube.position.set(-0.75, 0, 0);
  g.add(cube);
  const wedge = makeWedge(1.6, 1.25, 1.0);
  wedge.position.set(0.85, 0, 0);
  g.add(wedge);
  return g;
}

/** a-ziyuan86 — dome (hemisphere) over a base disk with a diagonal mast. */
export function createItopsDomeModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-dome';
  const disk = makePuck(1.0, 0.24);
  g.add(disk);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.92, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    itopsMat(ITOPS_COLORS.mid, 0.5)
  );
  dome.position.y = 0.24;
  g.add(dome);
  // diagonal mast rising off the dome
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 16), itopsMat(ITOPS_COLORS.symbol, 0.45));
  mast.position.set(0.28, 0.72, 0.1);
  mast.rotation.z = -0.5;
  g.add(mast);
  return g;
}

/** a-ziyuan87 — three vertical bars (rack columns) with a leaning wall. */
export function createItopsBarsModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-bars';
  const sym = itopsMat(ITOPS_COLORS.symbol, 0.45);
  const mid = itopsMat(ITOPS_COLORS.mid, 0.5);
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.16), mid);
    bar.position.set(-0.75 + i * 0.42, 0.75, 0.15);
    g.add(bar);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.2), sym);
    cap.position.set(-0.75 + i * 0.42, 1.5, 0.15);
    g.add(cap);
  }
  g.add(wallBoard(1.4, 1.2, 0.9, 0.6, -0.35, -0.5));
  return g;
}

/** a-ziyuan88 — a quarter disk (fan) with a leaning wall. */
export function createItopsFanModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-fan';
  const fan = makeQuarterDisk(1.15, 0.5);
  fan.position.set(-0.3, 0, 0.1);
  g.add(fan);
  g.add(wallBoard(1.3, 1.1, 0.85, 0.55, -0.3, -0.5));
  return g;
}

/** a-ziyuan89 — scattered particle cloud above a base disk. */
export function createItopsCloudDiskModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-cloud-disk';
  const disk = makePuck(1.05, 0.3);
  g.add(disk);
  const sym = itopsMat(ITOPS_COLORS.symbol, 0.45);
  const spots: Array<[number, number, number, number]> = [
    [-0.5, 1.15, 0.2, 0.13],
    [-0.15, 1.45, -0.1, 0.11],
    [0.25, 1.2, 0.15, 0.12],
    [0.05, 1.0, 0.35, 0.1],
    [-0.35, 1.3, -0.3, 0.09],
    [0.45, 1.4, -0.15, 0.1],
    [0.0, 1.62, 0.0, 0.08],
  ];
  for (const [x, y, z, s] of spots) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), sym);
    c.position.set(x, y, z);
    c.rotation.y = 0.6;
    g.add(c);
  }
  return g;
}

/** a-ziyuan91 — puck feeding a wedge, with a diagonal lattice on the wedge face. */
export function createItopsDbWedgeArrowModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-db-wedge-arrow';
  const puck = makePuck(0.7, 0.3);
  puck.position.set(-1.1, 0, 0.2);
  g.add(puck);
  const wedge = makeWedge(1.7, 1.35, 0.9);
  wedge.position.set(0.7, 0, 0);
  g.add(wedge);
  g.add(lattice(0.9, 4, 0.7, 0.58));
  return g;
}

/** a-ziyuan92 — puck + wedge with a bolder cross-hatch lattice. */
export function createItopsDbWedgeLatticeModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-db-wedge-lattice';
  const puck = makePuck(0.7, 0.3);
  puck.position.set(-1.1, 0, 0.2);
  g.add(puck);
  const wedge = makeWedge(1.7, 1.35, 0.9);
  wedge.position.set(0.7, 0, 0);
  g.add(wedge);
  g.add(lattice(1.1, 6, 0.75, 0.58));
  return g;
}

/** a-ziyuan93 — a diagonal striped ribbon with a leaning wall. */
export function createItopsRibbonModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-ribbon';
  g.add(makeDiagRibbon(1.9, 0.32, 6, 0.45));
  g.add(wallBoard(1.2, 1.1, 0.85, 0.55, -0.3, -0.5));
  return g;
}

/** a-ziyuan94 — a diagonal ribbon with denser stripes and a wall. */
export function createItopsRibbon2Model(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-ribbon2';
  g.add(makeDiagRibbon(2.0, 0.34, 9, 0.45));
  g.add(wallBoard(1.2, 1.1, 0.85, 0.55, -0.3, -0.5));
  return g;
}

/** a-ziyuan95 — a flat quarter arc band (ring segment) with a wall. */
export function createItopsArcModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-arc';
  const arc = makeQuarterRing(0.8, 0.32);
  arc.position.set(-0.25, 0.3, 0.1);
  g.add(arc);
  g.add(wallBoard(1.2, 1.0, 0.85, 0.5, -0.3, -0.5));
  return g;
}

/** a-ziyuan96 — a solid quarter disk (fan) with a wall. */
export function createItopsArcDiskModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'itops-arc-disk';
  const fan = makeQuarterDisk(1.25, 0.55);
  fan.position.set(-0.3, 0, 0.1);
  g.add(fan);
  g.add(wallBoard(1.2, 1.1, 0.9, 0.55, -0.3, -0.5));
  return g;
}


/**
 * it-ops topology icon "a-ziyuan52" — a low database-style puck disc with four
 * deep-blue arrows on its top face pointing inward toward the center
 * (compress / converge semantics).
 *
 * Procedural reconstruction of the 2.5D flat icon: a short cylinder reads the
 * "top face + side wall" two-tone shading of the reference, and the four X-
 * arranged inward arrows are built from box shafts + cone heads so they read as
 * raised geometry rather than decals when orbited.
 */

// Colours lifted from the icon's own flat fills (light top / mid wall / dark
// arrows) — the three-step blue ramp the reference uses.
const COLOURS = {
  top: 0xddeefb,
  wall: 0x9cc9ee,
  rim: 0x86bce8,
  arrow: 0x5b9bd5,
} as const;

function makeMaterial(color: number, roughness = 0.55): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.0 });
}

const SHAFT_LEN = 0.4;
const HEAD_LEN = 0.2;
const TAIL_RADIUS = 0.74;

/**
 * One flat inward arrow. Local frame: the TAIL sits at the origin and the
 * arrow extends along -X (tip at x = -(SHAFT_LEN + HEAD_LEN)). The caller
 * places/rotates it.
 */
function buildArrowShape(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();

  const shaft = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_LEN, 0.04, 0.11), mat);
  shaft.position.x = -SHAFT_LEN / 2; // spans 0 → -SHAFT_LEN
  g.add(shaft);

  // 4-segment cone = pyramid; rotated so its tip points -X, squashed flat.
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.13, HEAD_LEN, 4), mat);
  head.rotation.z = Math.PI / 2; // tip from +Y to -X
  head.rotation.y = Math.PI / 4; // orient the square pyramid as an arrowhead
  head.scale.set(1, 0.3, 1);
  head.position.x = -(SHAFT_LEN + HEAD_LEN / 2);
  g.add(head);

  return g;
}

/**
 * Place a tail-anchored arrow so its tail sits at polar angle `angle`, radius
 * `r`, and its tip points radially inward toward the puck center.
 */
function placeArrow(shape: THREE.Group, angle: number, r: number, y: number): THREE.Group {
  const holder = new THREE.Group();
  holder.add(shape);
  // rotY(θ) maps local -X to (-cosθ, 0, sinθ); we need (-cos a, 0, -sin a) → θ = -a.
  holder.rotation.y = -angle;
  holder.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
  return holder;
}

export function createItopsDbPuckModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'itops-db-puck';

  const R = 1.0; // puck radius
  const H = 0.34; // puck height — the icon reads ~3:1 width-to-height

  // Side wall — the mid-blue "wall" of the 2.5D icon.
  const wallMat = makeMaterial(COLOURS.wall, 0.5);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 96, 1, true), wallMat);
  wall.position.y = H / 2;
  group.add(wall);

  // Closed bottom (same wall tone so the base is not see-through).
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(R, 96), wallMat);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.001;
  group.add(bottom);

  // Light top disc — the face that carries the arrows.
  const top = new THREE.Mesh(new THREE.CircleGeometry(R, 96), makeMaterial(COLOURS.top, 0.4));
  top.rotation.x = -Math.PI / 2;
  top.position.y = H;
  group.add(top);

  // Thin rim ring at the top edge — the reference's top/wall boundary.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.016, 12, 96), makeMaterial(COLOURS.rim, 0.45));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = H;
  group.add(rim);

  // Four inward arrows on the diagonals (X layout), raised slightly off the face.
  const arrowMat = makeMaterial(COLOURS.arrow, 0.5);
  const arrowY = H + 0.03;
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    group.add(placeArrow(buildArrowShape(arrowMat), angle, TAIL_RADIUS, arrowY));
  }

  // Small center pivot dot under where the four tips converge.
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 32), arrowMat);
  hub.position.y = H + 0.02;
  group.add(hub);

  return group;
}


/**
 * it-ops topology icon "a-ziyuan57" — an isometric slab/tile with a center
 * circle and four diagonal arrows pointing OUTWARD (the "move" cursor).
 *
 * The 2.5D reference fakes depth with three flat fills: a light diamond top,
 * two mid-tone side parallelograms, and a deep-blue symbol. Here the slab is a
 * real box with per-face materials, so orbiting reveals a third side that the
 * flat icon can only imply; the symbol is raised geometry on the top face.
 */

// Sampled straight from the icon's flat fills (64x50 PNG, dominant colours).
const C_TOP = 0xe0effb;
const C_SIDE = 0x99c9f2;
const C_SIDE2 = 0xb8d9f6; // the far side, one ramp step lighter
const C_SYMBOL = 0x5ca8ea;

const SLAB = { w: 2.0, d: 2.0, h: 0.42 } as const; // square footprint, ~2.4:1 iso ratio

function mat(color: number, roughness = 0.5): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.0 });
}

/** Flat symbol piece: shaft along -X (tail at origin), like the puck arrows. */
function outwardArrow(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.035, 0.11), mat);
  shaft.position.x = 0.2; // tail at origin, extends +X outward
  g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.18, 4), mat);
  head.rotation.z = -Math.PI / 2; // tip toward +X
  head.rotation.y = Math.PI / 4;
  head.scale.set(1, 0.3, 1);
  head.position.x = 0.4 + 0.09;
  g.add(head);
  return g;
}

export function createItopsMoveSlabModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'itops-move-slab';

  // Real box with per-face materials: top light, front(+Z) mid, right(+X) mid,
  // the two hidden faces one step lighter, bottom mid.
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(SLAB.w, SLAB.h, SLAB.d),
    [mat(C_SIDE2), mat(C_SIDE2), mat(C_TOP), mat(C_SIDE), mat(C_SIDE), mat(C_SIDE2)]
  );
  slab.position.y = SLAB.h / 2;
  group.add(slab);

  // Top-face symbol, raised slightly: center ring + four outward diagonal arrows.
  const symMat = mat(C_SYMBOL, 0.45);
  const y = SLAB.h + 0.025;

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.028, 12, 40), symMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = y;
  group.add(ring);

  const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 24), symMat);
  dot.position.y = y;
  group.add(dot);

  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2; // diagonal corners
    const a = outwardArrow(symMat);
    a.rotation.y = -angle; // local +X → radial-out at `angle`
    a.position.set(Math.cos(angle) * 0.2, y, Math.sin(angle) * 0.2);
    group.add(a);
  }

  return group;
}


/**
 * it-ops topology icon "a-ziyuan90" — a cellular base station tower.
 *
 * The reference is a single-colour line-style icon: a tapering lattice mast of
 * X cross-bracing on splayed legs, an antenna head with a broadcast dot and two
 * signal arcs on top, and a ring of small hexagons (cell coverage) at the base.
 *
 * Reconstruction strategy: the lattice is built from thin box members (4 legs,
 * 3 brace bays of X-crossing struts, 2 ring chords per bay) so it reads as a
 * real truss from every angle; the broadcast arcs are half-torus segments; the
 * base hexagons are short 6-sided cylinders at the icon's own ramp shades.
 */

// Sampled from the icon: it is a one-ramp blue family.
const C_MAIN = 0x99c9f2;
const C_DARK = 0x7db9ee; // legs/antenna slightly deeper
const C_HEX1 = 0xb8d9f6;
const C_HEX2 = 0xe0effb;

function matBs(color: number, roughness = 0.55): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.0 });
}

const TOWER = {
  baseHalf: 0.62, // half footprint at ground
  topHalf: 0.16, // half footprint at mast top (taper)
  height: 2.2, // mast height (leg top)
  bays: 3, // X-brace bays
} as const;

/** Interpolated half-width at height t (0..1) along the mast. */
function halfAt(t: number): number {
  return TOWER.baseHalf + (TOWER.topHalf - TOWER.baseHalf) * t;
}

function member(from: THREE.Vector3, to: THREE.Vector3, size: number, m: THREE.Material): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, len, size), m);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

/** Corner leg positions (4 corners) at two heights, as corner index → point. */
function corners(t: number): THREE.Vector3[] {
  const h = halfAt(t);
  const y = t * TOWER.height;
  return [
    new THREE.Vector3(-h, y, -h),
    new THREE.Vector3(h, y, -h),
    new THREE.Vector3(h, y, h),
    new THREE.Vector3(-h, y, h),
  ];
}

export function createItopsBaseStationModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'itops-base-station';

  const g = matBs(C_MAIN, 0.55);
  const legM = matBs(C_DARK, 0.5);
  const legSize = 0.055;
  const braceSize = 0.035;

  // --- Legs: 4 tapering corner members, splayed at the bottom ---
  for (let i = 0; i < 4; i++) {
    const a = corners(0)[i];
    const b = corners(1)[i];
    group.add(member(a, b, legSize, legM));
  }

  // --- Lattice bays: ring chords + X cross braces on each of the 4 faces ---
  for (let bay = 0; bay < TOWER.bays; bay++) {
    const t0 = bay / TOWER.bays;
    const t1 = (bay + 1) / TOWER.bays;
    const c0 = corners(t0);
    const c1 = corners(t1);
    for (let face = 0; face < 4; face++) {
      const a = c0[face];
      const b = c0[(face + 1) % 4];
      const c = c1[(face + 1) % 4];
      const d = c1[face];
      // ring chords (bottom and top of the bay)
      group.add(member(a, b, braceSize, g));
      group.add(member(d, c, braceSize, g));
      // X braces
      group.add(member(a, c, braceSize * 0.8, g));
      group.add(member(b, d, braceSize * 0.8, g));
    }
  }

  // --- Antenna head: mast stub + horizontal boom + broadcast dot ---
  const top = new THREE.Vector3(0, TOWER.height, 0);
  const stub = new THREE.Vector3(0, TOWER.height + 0.34, 0);
  group.add(member(top, stub, 0.05, legM));
  const boomL = new THREE.Vector3(-0.22, TOWER.height + 0.26, 0);
  const boomR = new THREE.Vector3(0.22, TOWER.height + 0.26, 0);
  group.add(member(boomL, boomR, 0.04, g));

  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 16), matBs(0x5ca8ea, 0.4));
  dot.position.set(0, TOWER.height + 0.34, 0);
  group.add(dot);

  // --- Signal arcs: two half-torus ripples left + right of the dot ---
  const arcMat = matBs(C_MAIN, 0.5);
  const arcY = TOWER.height + 0.34;
  for (const side of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const r = 0.14 + k * 0.11;
      const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 8, 24, Math.PI), arcMat);
      arc.position.set(side * 0.1, arcY, 0);
      arc.rotation.y = Math.PI / 2; // arc plane vertical, opening toward the dot
      if (side === -1) arc.rotation.z = Math.PI; // face the right way
      group.add(arc);
    }
  }

  // --- Base hexagons (cell coverage), scattered around the feet ---
  const hexSpots: Array<[number, number, number, number, number]> = [
    // x, z, radius, height, colour
    [-1.05, -0.55, 0.16, 0.1, C_HEX1],
    [1.0, -0.7, 0.13, 0.08, C_HEX2],
    [-0.95, 0.85, 0.14, 0.09, C_HEX2],
    [0.95, 0.75, 0.17, 0.11, C_HEX1],
    [0.05, 1.15, 0.12, 0.08, C_HEX1],
    [0.1, -1.05, 0.12, 0.08, C_HEX2],
    [-0.35, 1.0, 0.09, 0.06, C_HEX1],
  ];
  for (const [x, z, r, h, c] of hexSpots) {
    const hex = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 6), matBs(c, 0.55));
    hex.position.set(x, h / 2, z);
    group.add(hex);
  }

  return group;
}


// ===== it-ops 拓扑类型 → 模型工厂映射 =====
// 桥接依据：apps/web DEVICES 表每个类型的 icon 字段（a-ziyuanXX.png）
// 与 MAPPING.md 的「源图标 → 工厂函数」对照（见 docs/img2threejs MAPPING）。
const TYPE_MODEL: Record<string, string> = {
  router: "itops-db-puck",            // a-ziyuan52
  core: "itops-db-import",            // a-ziyuan53
  atm: "itops-db-fanout",             // a-ziyuan54
  switch: "itops-db-export",          // a-ziyuan55
  aggr: "itops-move-slab",            // a-ziyuan57
  db: "itops-db-stack3",              // a-ziyuan58
  pool: "itops-db-stack2",            // a-ziyuan59
  server: "itops-rack-server",        // a-ziyuan60
  mgmt: "itops-cloud-backup",         // a-ziyuan61
  gateway: "itops-cube-x",            // a-ziyuan63
  idc: "itops-cube-dot",              // a-ziyuan64
  room: "itops-cube-echo",            // a-ziyuan66
  firewall: "itops-cube-echo2",       // a-ziyuan67
  collect: "itops-arrows-fan",        // a-ziyuan68
  biz: "itops-arrows-ring",           // a-ziyuan69
  optic: "itops-arrows-up",           // a-ziyuan70
  "1u": "itops-cube-wedge",           // a-ziyuan76
  "2u": "itops-cube-wedge2",          // a-ziyuan77
  app: "itops-wedge-dot",             // a-ziyuan84
  plat: "itops-cube-wedge-big",       // a-ziyuan85
  cloud: "itops-arc",                 // a-ziyuan95
  sec: "itops-arc-disk",              // a-ziyuan96
  home: "itops-db-wedge-arrow",       // a-ziyuan91
  corp: "itops-db-wedge-lattice",     // a-ziyuan92
  factory: "itops-ribbon",            // a-ziyuan93
  apt: "itops-ribbon2",               // a-ziyuan94
  // 2D 无 DEVICES 条目的类型按 2D glyph 回退
  loadbalancer: "itops-db-export",    // 2D glyph = switch
  storage: "itops-db-stack3",         // 2D glyph = db
}

const MODEL_BUILDERS: Record<string, () => THREE.Group> = {
  "itops-db-puck": createItopsDbPuckModel,
  "itops-db-import": createItopsDbImportModel,
  "itops-db-fanout": createItopsDbFanoutModel,
  "itops-db-export": createItopsDbExportModel,
  "itops-move-slab": createItopsMoveSlabModel,
  "itops-db-stack3": createItopsDbStack3Model,
  "itops-db-stack2": createItopsDbStack2Model,
  "itops-rack-server": createItopsRackServerModel,
  "itops-cloud-backup": createItopsCloudBackupModel,
  "itops-cloud-upload": createItopsCloudUploadModel,
  "itops-cube-x": createItopsCubeXModel,
  "itops-cube-dot": createItopsCubeDotModel,
  "itops-cube-echo": createItopsCubeEchoModel,
  "itops-cube-echo2": createItopsCubeEcho2Model,
  "itops-arrows-fan": createItopsArrowsFanModel,
  "itops-arrows-ring": createItopsArrowsRingModel,
  "itops-arrows-up": createItopsArrowsUpModel,
  "itops-cube-arrows": createItopsCubeArrowsModel,
  "itops-cube-wedge": createItopsCubeWedgeModel,
  "itops-cube-wedge2": createItopsCubeWedge2Model,
  "itops-db-wedge": createItopsDbWedgeModel,
  "itops-wedge": createItopsWedgeModel,
  "itops-wedge-slot": createItopsWedgeSlotModel,
  "itops-wedge-base": createItopsWedgeBaseModel,
  "itops-wedge-dot": createItopsWedgeDotModel,
  "itops-cube-wedge-big": createItopsCubeWedgeBigModel,
  "itops-dome": createItopsDomeModel,
  "itops-bars": createItopsBarsModel,
  "itops-fan": createItopsFanModel,
  "itops-cloud-disk": createItopsCloudDiskModel,
  "itops-base-station": createItopsBaseStationModel,
  "itops-db-wedge-arrow": createItopsDbWedgeArrowModel,
  "itops-db-wedge-lattice": createItopsDbWedgeLatticeModel,
  "itops-ribbon": createItopsRibbonModel,
  "itops-ribbon2": createItopsRibbon2Model,
  "itops-arc": createItopsArcModel,
  "itops-arc-disk": createItopsArcDiskModel,
}

/** 按拓扑节点 type 构建 3D 模型；未知类型返回 null（调用方回退圆盘）。 */
export function buildItopsModel(type: string): THREE.Group | null {
  const key = TYPE_MODEL[type || ""] || TYPE_MODEL[TYPE_FALLBACK[type] || ""]
  if (!key) return null
  const builder = MODEL_BUILDERS[key]
  if (!builder) return null
  return builder()
}

// 类型别名兜底（2D 端 GLYPH_MAP 的同类回退）
const TYPE_FALLBACK: Record<string, string> = {}

/**
 * 把模型的固有四段蓝阶重染为节点类型色：
 * 按每个材质亮度的相对比例缩放，保持 top/mid/wall/symbol 的层次，
 * 只换色相 —— 这样大屏仍能靠颜色区分设备类型。
 */
export function tintItopsModel(g: THREE.Group, colorHex: number): void {
  const symLum = luminance(ITOPS_COLORS.symbol)
  const t = new THREE.Color(colorHex)
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    if (!m) return
    for (const mat of Array.isArray(m) ? m : [m]) {
      const std = mat as THREE.MeshStandardMaterial
      if (!std.color) continue
      const f = Math.min(1.9, Math.max(0.45, luminance(std.color.getHex()) / symLum))
      std.color.setRGB(
        Math.min(1, t.r * f), Math.min(1, t.g * f), Math.min(1, t.b * f),
      )
    }
  })
}

function luminance(hex: number): number {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255
  return (r + g + b) / 3 / 255
}
