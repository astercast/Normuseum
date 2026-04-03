import "./style.css";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

RectAreaLightUniformsLib.init();

/* ── Constants ────────────────────────────────────────────────────────────── */
const NORMIES_CONTRACT = "0x9Eb6E2025B64f340691e424b7fe7022fFDE12438";
const NORMIES_API      = "https://api.normies.art";
const VOXEL_SIZE       = 0.055;
const GRID             = 40;
const CELL             = 2.2 / GRID;
const ART_W = 2.4, ART_H = 2.4;
const ROOM_W = 16, ROOM_H = 5.2;
const SLOT_SPACING = 3.6;

/* ── Frame toggle state ───────────────────────────────────────────────────── */
let framesVisible = false;
let podiumBtnMesh = null;
let buttonHovered = false;
let btnAnimating = false;

/* ── DOM refs ─────────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const canvasEl      = $("scene");
const overlayEl     = $("overlay");
const hudEl         = $("hud");
const hudMetaEl     = $("hud-meta");
const walletInput   = $("walletInput");
const loadBtn       = $("loadBtn");
const exitBtn       = $("exitBtn");
const statusEl      = $("status");
const progressWrap  = $("progress-wrap");
const progressBar   = $("progress-bar");
const progressLabel = $("progress-label");
const aboutModal    = $("about-modal");
const aboutBtn      = $("aboutBtn");
const aboutCloseBtn = $("aboutCloseBtn");
const themeToggle   = $("themeToggle");
const fullscreenBtn = $("fullscreenBtn");

/* ── Platform ─────────────────────────────────────────────────────────────── */
const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
if (isTouch) document.body.classList.add("touch-device");

/* ── Renderer ─────────────────────────────────────────────────────────────── */
const renderer = new THREE.WebGLRenderer({
  canvas: canvasEl,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace        = THREE.SRGBColorSpace;
renderer.toneMapping             = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure     = 1.15;
renderer.shadowMap.enabled       = true;
renderer.shadowMap.type          = THREE.PCFShadowMap;

/* ── Scene ──────────────────────────────────────────────────────────────── */
const scene = new THREE.Scene();
scene.background = new THREE.Color("#f0ede8");
scene.fog = new THREE.FogExp2("#f0ede8", 0.012);

/* ── Camera ───────────────────────────────────────────────────────────────── */
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 150);
camera.position.set(0, 1.7, 2);

/* ── Controls ─────────────────────────────────────────────────────────────── */
let controls = null;
if (!isTouch) {
  controls = new PointerLockControls(camera, renderer.domElement);
  scene.add(camera);
} else {
  scene.add(camera);
  camera.rotation.order = "YXZ";
}

/* ── Lights ───────────────────────────────────────────────────────────────── */
scene.add(new THREE.AmbientLight(0xfff8f0, 0.7));
const sun = new THREE.DirectionalLight(0xfff0dd, 0.5);
sun.position.set(5, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.far = 80;
scene.add(sun);
// Warm fill from below for ambient bounce
const fill = new THREE.HemisphereLight(0xfff8f0, 0xd4c4a8, 0.35);
scene.add(fill);

/* ── Shared materials ─────────────────────────────────────────────────────── */
// Polished marble floor
const floorMat = new THREE.MeshStandardMaterial({ color: "#e8e0d4", roughness: 0.18, metalness: 0.08 });
// Warm white walls
const wallMat  = new THREE.MeshStandardMaterial({ color: "#f5f2ed", roughness: 0.85 });
// Wainscoting / lower wall panels
const panelMat = new THREE.MeshStandardMaterial({ color: "#ede8e0", roughness: 0.7, metalness: 0.02 });
const ceilMat  = new THREE.MeshStandardMaterial({ color: "#faf8f4", roughness: 0.92 });
const mouldMat = new THREE.MeshStandardMaterial({ color: "#e8e2d8", roughness: 0.55, metalness: 0.08 });
const baseMat  = new THREE.MeshStandardMaterial({ color: "#ddd6ca", roughness: 0.6, metalness: 0.05 });
const frameMat = new THREE.MeshStandardMaterial({ color: "#d4cdc0", roughness: 0.5, metalness: 0.12 });
const backMat  = new THREE.MeshStandardMaterial({ color: "#faf8f5", roughness: 0.95 });
const placeMat = new THREE.MeshStandardMaterial({ color: "#eae6df", roughness: 0.95 });
const benchMat = new THREE.MeshStandardMaterial({ color: "#3a3530", roughness: 0.55, metalness: 0.1 });
const benchSeatMat = new THREE.MeshStandardMaterial({ color: "#5c5448", roughness: 0.7 });

/* ── Gallery + art groups ─────────────────────────────────────────────────── */
const galleryGroup = new THREE.Group();
scene.add(galleryGroup);
const artGroup = new THREE.Group();
scene.add(artGroup);

let currentRoomLen = 52;
let wallSlots = [];
const WALL_X = ROOM_W / 2;

/* ── Build gallery for N artworks ─────────────────────────────────────────── */
function buildGallery(count) {
  while (galleryGroup.children.length) {
    const c = galleryGroup.children[0];
    galleryGroup.remove(c);
    c.traverse((ch) => { if (ch.isMesh) ch.geometry?.dispose(); });
  }

  const slotsPerSide = Math.ceil(count / 2);
  currentRoomLen = Math.max(30, slotsPerSide * SLOT_SPACING + 14);
  const HL = currentRoomLen / 2;

  wallSlots = [];
  const slotZStart = -(HL - 7);
  for (let i = 0; i < slotsPerSide; i++) {
    const z = slotZStart + i * SLOT_SPACING;
    wallSlots.push({ pos: new THREE.Vector3(-WALL_X + 0.05, 2.1, z), ry: Math.PI / 2 });
    wallSlots.push({ pos: new THREE.Vector3( WALL_X - 0.05, 2.1, z), ry: -Math.PI / 2 });
  }

  // ── Polished marble floor ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, currentRoomLen), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  galleryGroup.add(floor);

  // Floor border inlay (darker marble strip along edges)
  const inlayMat = new THREE.MeshStandardMaterial({ color: "#c4b8a4", roughness: 0.22, metalness: 0.1 });
  [[-WALL_X + 0.8, 0], [WALL_X - 0.8, 0]].forEach(function(p) {
    var strip = new THREE.Mesh(new THREE.PlaneGeometry(0.08, currentRoomLen - 2), inlayMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(p[0], 0.003, p[1]);
    galleryGroup.add(strip);
  });

  // Center runner line
  var runner = new THREE.Mesh(new THREE.PlaneGeometry(0.04, currentRoomLen - 6), inlayMat);
  runner.rotation.x = -Math.PI / 2;
  runner.position.set(0, 0.003, 0);
  galleryGroup.add(runner);

  // Floor reflection
  const reflMat = new THREE.MeshStandardMaterial({
    color: "#e0d8cc", roughness: 0.05, metalness: 0.4,
    transparent: true, opacity: 0.12,
  });
  const refl = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, currentRoomLen), reflMat);
  refl.rotation.x = -Math.PI / 2;
  refl.position.y = 0.002;
  galleryGroup.add(refl);

  // ── Ceiling ──
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, currentRoomLen), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM_H;
  galleryGroup.add(ceil);

  // ── Walls ──
  const wallGeo = new THREE.PlaneGeometry(currentRoomLen, ROOM_H);
  const lw = new THREE.Mesh(wallGeo, wallMat);
  lw.rotation.y = Math.PI / 2;
  lw.position.set(-WALL_X, ROOM_H / 2, 0);
  lw.receiveShadow = true;
  galleryGroup.add(lw);
  const rw = new THREE.Mesh(wallGeo, wallMat);
  rw.rotation.y = -Math.PI / 2;
  rw.position.set(WALL_X, ROOM_H / 2, 0);
  rw.receiveShadow = true;
  galleryGroup.add(rw);

  // End caps
  const capGeo = new THREE.PlaneGeometry(ROOM_W, ROOM_H);
  const back = new THREE.Mesh(capGeo, wallMat);
  back.position.set(0, ROOM_H / 2, -HL);
  galleryGroup.add(back);
  const front = new THREE.Mesh(capGeo, wallMat);
  front.rotation.y = Math.PI;
  front.position.set(0, ROOM_H / 2, HL);
  galleryGroup.add(front);

  // ── Wainscoting (lower wall panels) ──
  var wainH = 1.1;
  var wainGeo = new THREE.PlaneGeometry(currentRoomLen, wainH);
  [-WALL_X, WALL_X].forEach(function(x, idx) {
    var w = new THREE.Mesh(wainGeo, panelMat);
    w.rotation.y = idx === 0 ? Math.PI / 2 : -Math.PI / 2;
    w.position.set(x + (idx === 0 ? 0.01 : -0.01), wainH / 2, 0);
    galleryGroup.add(w);
  });

  // Wainscoting cap rail (chair rail)
  var railGeo2 = new THREE.BoxGeometry(0.06, 0.05, currentRoomLen + 0.2);
  [-WALL_X + 0.03, WALL_X - 0.03].forEach(function(x) {
    var r = new THREE.Mesh(railGeo2, mouldMat);
    r.position.set(x, wainH, 0);
    galleryGroup.add(r);
  });

  // ── Crown moulding (ornate) ──
  var crownProf = new THREE.BoxGeometry(0.14, 0.12, currentRoomLen + 0.4);
  [-WALL_X + 0.07, WALL_X - 0.07].forEach(function(x) {
    var m = new THREE.Mesh(crownProf, mouldMat);
    m.position.set(x, ROOM_H - 0.06, 0);
    galleryGroup.add(m);
  });
  // Secondary crown step
  var crownStep = new THREE.BoxGeometry(0.08, 0.06, currentRoomLen + 0.3);
  [-WALL_X + 0.04, WALL_X - 0.04].forEach(function(x) {
    var m = new THREE.Mesh(crownStep, mouldMat);
    m.position.set(x, ROOM_H - 0.15, 0);
    galleryGroup.add(m);
  });

  // ── Picture rail ──
  var picRailGeo = new THREE.BoxGeometry(0.05, 0.035, currentRoomLen + 0.1);
  [-WALL_X + 0.025, WALL_X - 0.025].forEach(function(x) {
    var r = new THREE.Mesh(picRailGeo, mouldMat);
    r.position.set(x, 3.1, 0);
    galleryGroup.add(r);
  });

  // ── Baseboard ──
  var skirtGeo = new THREE.BoxGeometry(0.06, 0.22, currentRoomLen + 0.1);
  [-WALL_X + 0.03, WALL_X - 0.03].forEach(function(x) {
    var s = new THREE.Mesh(skirtGeo, baseMat);
    s.position.set(x, 0.11, 0);
    galleryGroup.add(s);
  });

  // ── Subtle ceiling edge trim ──
  var ceilTrimMat = new THREE.MeshStandardMaterial({ color: "#ece8e0", roughness: 0.9 });
  var ceilTrimGeo = new THREE.BoxGeometry(0.06, 0.04, currentRoomLen + 0.2);
  [-WALL_X + 0.03, WALL_X - 0.03].forEach(function(x) {
    var t = new THREE.Mesh(ceilTrimGeo, ceilTrimMat);
    t.position.set(x, ROOM_H - 0.02, 0);
    galleryGroup.add(t);
  });

  // ── Skylights — glass panels in ceiling showing blue sky with clouds ──
  var skyCanvas = document.createElement("canvas");
  skyCanvas.width = 512; skyCanvas.height = 256;
  var skyCtx = skyCanvas.getContext("2d");
  // Gradient sky
  var grad = skyCtx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#5da0d4");
  grad.addColorStop(0.55, "#87c4eb");
  grad.addColorStop(1, "#bde0f5");
  skyCtx.fillStyle = grad;
  skyCtx.fillRect(0, 0, 512, 256);
  // Fluffy clouds
  skyCtx.fillStyle = "rgba(255,255,255,0.85)";
  [[80,120,90,40],[200,90,120,50],[350,130,80,35],[420,70,100,45],[150,160,70,30],[300,50,60,28],[60,60,50,22],[450,150,75,32]].forEach(function(c) {
    skyCtx.beginPath();
    skyCtx.ellipse(c[0], c[1], c[2], c[3], 0, 0, Math.PI * 2);
    skyCtx.fill();
  });
  skyCtx.fillStyle = "rgba(255,255,255,0.6)";
  [[130,100,60,25],[260,110,50,22],[380,80,70,30],[100,150,45,18]].forEach(function(c) {
    skyCtx.beginPath();
    skyCtx.ellipse(c[0], c[1], c[2], c[3], 0, 0, Math.PI * 2);
    skyCtx.fill();
  });
  var skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  var skyMat = new THREE.MeshBasicMaterial({ map: skyTex });
  var frameTrimMat = new THREE.MeshStandardMaterial({ color: "#d4cec2", roughness: 0.6, metalness: 0.15 });
  var skylightSpacing = 9;
  var skylightCount = Math.max(1, Math.floor((currentRoomLen - 10) / skylightSpacing));
  for (var ski = 0; ski < skylightCount; ski++) {
    var sz = -HL + 8 + ski * skylightSpacing;
    // Glass pane (sky texture)
    var pane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), skyMat);
    pane.rotation.x = Math.PI / 2;
    pane.position.set(0, ROOM_H - 0.01, sz);
    galleryGroup.add(pane);
    // Trim frame around skylight
    var trimW = 0.1;
    [[0, -0.95, 3.4, trimW], [0, 0.95, 3.4, trimW], [-1.65, 0, trimW, 2.0], [1.65, 0, trimW, 2.0]].forEach(function(t) {
      var trim = new THREE.Mesh(new THREE.BoxGeometry(t[2], 0.06, t[3]), frameTrimMat);
      trim.position.set(t[0], ROOM_H - 0.02, sz + t[1]);
      galleryGroup.add(trim);
    });
    // Skylight glow light (cool daylight from above)
    var skyLight = new THREE.PointLight(0xc4dff0, 0.5, 8);
    skyLight.position.set(0, ROOM_H - 0.1, sz);
    galleryGroup.add(skyLight);
  }

  // ── Artwork spotlights (RectAreaLight per side, warm museum lighting) ──
  var trackColor = 0xfff0dd;
  var trackI = 8;
  var spotStep = SLOT_SPACING;
  for (var si = 0; si < slotsPerSide; si++) {
    var z = slotZStart + si * spotStep;
    // Left wall spot
    var sl = new THREE.RectAreaLight(trackColor, trackI, 1.6, 0.5);
    sl.position.set(-WALL_X + 2.0, ROOM_H - 0.3, z);
    sl.lookAt(-WALL_X + 0.1, 1.8, z);
    galleryGroup.add(sl);
    // Right wall spot
    var sr = new THREE.RectAreaLight(trackColor, trackI, 1.6, 0.5);
    sr.position.set(WALL_X - 2.0, ROOM_H - 0.3, z);
    sr.lookAt(WALL_X - 0.1, 1.8, z);
    galleryGroup.add(sr);
  }

  // ── Ambient ceiling wash lights ──
  var washCount = Math.max(2, Math.ceil(currentRoomLen / 12));
  for (var wi = 0; wi < washCount; wi++) {
    var wz = -HL + 6 + wi * (currentRoomLen - 12) / Math.max(1, washCount - 1);
    var wash = new THREE.PointLight(0xfff4e8, 0.6, 16);
    wash.position.set(0, ROOM_H - 0.1, wz);
    galleryGroup.add(wash);
  }

  // ── Gallery benches (every ~6 artworks, centered) ──
  for (var bi = 3; bi < slotsPerSide; bi += 6) {
    var bz = slotZStart + bi * SLOT_SPACING + SLOT_SPACING / 2;
    var bench = buildBench();
    bench.position.set(0, 0, bz);
    galleryGroup.add(bench);
  }

  // ── Podium with red button near entrance ──
  var podium = buildPodium();
  podium.position.set(0, 0, HL - 6);
  galleryGroup.add(podium);

  camera.position.set(0, 1.7, HL - 2);
}

function buildBench() {
  var g = new THREE.Group();
  // Seat (dark wood)
  var seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.5), benchSeatMat);
  seat.position.y = 0.46;
  seat.castShadow = true;
  seat.receiveShadow = true;
  g.add(seat);
  // Legs (4 legs)
  var legGeo = new THREE.BoxGeometry(0.06, 0.43, 0.06);
  [[-0.82, -0.18], [-0.82, 0.18], [0.82, -0.18], [0.82, 0.18]].forEach(function(p) {
    var leg = new THREE.Mesh(legGeo, benchMat);
    leg.position.set(p[0], 0.215, p[1]);
    leg.castShadow = true;
    g.add(leg);
  });
  // Cross stretcher
  var stretch = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.04, 0.04), benchMat);
  stretch.position.set(0, 0.14, 0);
  g.add(stretch);
  return g;
}

buildGallery(48);

/* ── Label texture ────────────────────────────────────────────────────────── */
function makeLabelTex(tokenId, type, ap) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 72;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(240,240,238,0.92)";
  ctx.fillRect(0, 0, 512, 72);
  ctx.fillStyle = "rgba(72,73,75,0.45)";
  ctx.fillRect(0, 0, 3, 72);
  ctx.fillStyle = "#48494b";
  ctx.font = '500 22px "IBM Plex Mono", monospace';
  ctx.fillText("normie #" + tokenId, 14, 32);
  ctx.fillStyle = "#82848a";
  ctx.font = '400 16px "IBM Plex Mono", monospace';
  const sub = [type, ap ? ap + " ap" : null].filter(Boolean).join(" \u00b7 ");
  ctx.fillText(sub, 14, 56);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ── Build voxel artwork ──────────────────────────────────────────────────── */
function buildVoxelArtwork(tokenId, rgbaData, meta) {
  const group = new THREE.Group();

  // Frame
  const frameOuter = new THREE.Mesh(
    new THREE.BoxGeometry(ART_W + 0.2, ART_H + 0.2, 0.06), frameMat
  );
  frameOuter.position.z = -0.06;
  frameOuter.userData.isFrame = true;
  frameOuter.visible = framesVisible;
  group.add(frameOuter);

  // Backing
  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(ART_W, ART_H, 0.03), backMat
  );
  backing.position.z = -0.03;
  backing.userData.isFrame = true;
  backing.visible = framesVisible;
  group.add(backing);

  // Parse pixels — skip background, only render character pixels
  // Normies are ~2 color: light bg (#e3e5e4, lum~227) + dark character (#48494b, lum~73)
  // Some customized normies may have more colors
  const BG_LUM = 180; // anything brighter than this is background → skip
  const voxels = [];
  for (let py = 0; py < GRID; py++) {
    for (let px = 0; px < GRID; px++) {
      const i = (py * GRID + px) * 4;
      const rv = rgbaData[i], gv = rgbaData[i + 1], bv = rgbaData[i + 2], av = rgbaData[i + 3];
      if (av < 10) continue;
      const lum = 0.299 * rv + 0.587 * gv + 0.114 * bv;
      if (lum > BG_LUM) continue; // background pixel — the wall IS the background
      const wx = (px - GRID / 2 + 0.5) * CELL;
      const wy = (GRID / 2 - py - 0.5) * CELL;
      // Darker pixels protrude more: map lum 0→180 to depth 6→1.5
      const depthMul = 1.5 + (1 - lum / BG_LUM) * 4.5;
      voxels.push({ x: wx, y: wy, r: rv / 255, g: gv / 255, b: bv / 255, depth: depthMul });
    }
  }

  // Render all character voxels as a single InstancedMesh
  if (voxels.length) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05, vertexColors: true });
    const geo = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
    const inst = new THREE.InstancedMesh(geo, mat, voxels.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    const scaleV = new THREE.Vector3();
    const posV = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    for (let i = 0; i < voxels.length; i++) {
      const v = voxels[i];
      const depth = v.depth;
      posV.set(v.x, v.y, VOXEL_SIZE * depth / 2);
      scaleV.set(1, 1, depth);
      m4.compose(posV, quat, scaleV);
      inst.setMatrixAt(i, m4);
      col.setRGB(v.r, v.g, v.b);
      inst.setColorAt(i, col);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.castShadow = inst.receiveShadow = true;
    inst.userData.isVoxel = true;
    group.add(inst);
  }

  // Flat 2D painting for framed mode — draw the normie pixels onto a canvas texture
  var flatCanvas = document.createElement("canvas");
  flatCanvas.width = GRID; flatCanvas.height = GRID;
  var flatCtx = flatCanvas.getContext("2d");
  var imgData = flatCtx.createImageData(GRID, GRID);
  imgData.data.set(rgbaData);
  flatCtx.putImageData(imgData, 0, 0);
  var flatTex = new THREE.CanvasTexture(flatCanvas);
  flatTex.magFilter = THREE.NearestFilter;
  flatTex.minFilter = THREE.NearestFilter;
  flatTex.colorSpace = THREE.SRGBColorSpace;
  var flatPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(ART_W, ART_H),
    new THREE.MeshStandardMaterial({ map: flatTex, roughness: 0.6, metalness: 0.05 })
  );
  flatPlane.position.z = 0.005;
  flatPlane.userData.isFlat = true;
  flatPlane.visible = framesVisible;
  group.add(flatPlane);

  // Nameplate
  const labelTex = makeLabelTex(tokenId, meta.type || "human", meta.ap);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(ART_W + 0.2, 0.28),
    new THREE.MeshBasicMaterial({ map: labelTex, transparent: true })
  );
  label.position.set(0, -(ART_H / 2 + 0.36), 0.01);
  group.add(label);

  // Per-artwork warm spotlight
  const spot = new THREE.PointLight(0xfff0dd, 1.2, 3.2, 2.0);
  spot.position.set(0, 0.5, 0.9);
  group.add(spot);

  // Reveal state
  group.userData.revealT = 0;
  group.userData.revealing = true;
  group.scale.set(0.001, 0.001, 0.001);

  return group;
}

/* ── Placeholder frame ────────────────────────────────────────────────────── */
function buildPlaceholder() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(2.32, 2.32, 0.04), placeMat));
  return g;
}

/* ── Dispose helpers ──────────────────────────────────────────────────────── */
function dispose(obj) {
  if (!obj) return;
  obj.traverse((c) => {
    if (c.isMesh || c.isInstancedMesh) {
      c.geometry?.dispose();
      [].concat(c.material).forEach((m) => m?.dispose());
    }
  });
}
function clearArt() {
  while (artGroup.children.length) {
    const c = artGroup.children[artGroup.children.length - 1];
    artGroup.remove(c);
    dispose(c);
  }
}

/* ── Podium with red button ───────────────────────────────────────────────── */
function makePodiumLabel() {
  var c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(240,240,238,0.92)";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#666666";
  ctx.font = 'bold 13px "IBM Plex Mono", monospace';
  ctx.textAlign = "center";
  ctx.fillText("TOGGLE FRAMES", 128, 26);
  ctx.fillStyle = "#999999";
  ctx.font = '11px "IBM Plex Mono", monospace';
  ctx.fillText("[E] or click", 128, 48);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildPodium() {
  var group = new THREE.Group();

  // Pedestal column
  var base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.3, 0.92, 32),
    new THREE.MeshStandardMaterial({ color: "#eaeae8", roughness: 0.25, metalness: 0.05 })
  );
  base.position.y = 0.46;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Top plate
  var plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.035, 32),
    new THREE.MeshStandardMaterial({ color: "#d8d8d6", roughness: 0.3, metalness: 0.12 })
  );
  plate.position.y = 0.94;
  plate.castShadow = true;
  group.add(plate);

  // Button housing ring
  var housing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.03, 24),
    new THREE.MeshStandardMaterial({ color: "#555555", roughness: 0.2, metalness: 0.7 })
  );
  housing.position.y = 0.965;
  group.add(housing);

  // Red button
  var btnMat = new THREE.MeshStandardMaterial({
    color: "#cc2020", roughness: 0.35, metalness: 0.1,
    emissive: new THREE.Color("#330808"), emissiveIntensity: 0.4
  });
  var btn = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 24), btnMat);
  btn.position.y = 0.99;
  btn.userData.isButton = true;
  btn.castShadow = true;
  podiumBtnMesh = btn;
  group.add(btn);

  // Red glow
  var glow = new THREE.PointLight(0xff3333, 0.4, 1.8);
  glow.position.y = 1.15;
  group.add(glow);

  // Signs on all four sides
  var labelTex = makePodiumLabel();
  var signMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true });
  var positions = [
    { p: [0, 0.5, 0.31], ry: 0 },
    { p: [0, 0.5, -0.31], ry: Math.PI },
    { p: [-0.31, 0.5, 0], ry: Math.PI / 2 },
    { p: [0.31, 0.5, 0], ry: -Math.PI / 2 },
  ];
  for (var si = 0; si < positions.length; si++) {
    var s = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.1), signMat);
    s.position.set(positions[si].p[0], positions[si].p[1], positions[si].p[2]);
    s.rotation.y = positions[si].ry;
    group.add(s);
  }

  return group;
}

/* ── Raycaster + interaction ──────────────────────────────────────────────── */
var raycaster = new THREE.Raycaster();
raycaster.far = 3.5;
var screenCenter = new THREE.Vector2(0, 0);

function checkButtonInteraction() {
  if (!inMuseum || !podiumBtnMesh) {
    if (buttonHovered) { buttonHovered = false; updateInteractionHint(false); }
    return;
  }
  raycaster.setFromCamera(screenCenter, camera);
  var intersects = raycaster.intersectObject(podiumBtnMesh);
  var hit = intersects.length > 0 && intersects[0].distance < 3.5;
  if (hit !== buttonHovered) {
    buttonHovered = hit;
    updateInteractionHint(hit);
  }
}

function updateInteractionHint(show) {
  var el = document.getElementById("interaction-hint");
  if (el) el.classList.toggle("visible", show);
}

function pressButton() {
  if (!podiumBtnMesh || btnAnimating) return;
  framesVisible = !framesVisible;
  // Toggle between voxel mode (frameless) and framed flat-art mode
  for (var ai = 0; ai < artGroup.children.length; ai++) {
    artGroup.children[ai].traverse(function(child) {
      if (!child.userData) return;
      if (child.userData.isFrame || child.userData.isFlat) child.visible = framesVisible;
      if (child.userData.isVoxel) child.visible = !framesVisible;
    });
  }
  btnAnimating = true;
  var origY = podiumBtnMesh.position.y;
  podiumBtnMesh.position.y = origY - 0.02;
  playButtonClick();
  setTimeout(function() { podiumBtnMesh.position.y = origY; btnAnimating = false; }, 150);
}

function tryInteract() { if (buttonHovered) pressButton(); }

function playButtonClick() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  var now = audioCtx.currentTime;
  var osc = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(150, now + 0.04);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.06);
}

/* ── API calls ────────────────────────────────────────────────────────────── */
const RPC_URLS = [
  "https://eth.llamarpc.com",
  "https://ethereum.publicnode.com",
  "https://1rpc.io/eth",
  "https://eth.meowrpc.com",
];
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

async function rpcCall(method, params) {
  for (var i = 0; i < RPC_URLS.length; i++) {
    try {
      var res = await fetch(RPC_URLS[i], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }),
      });
      var json = await res.json();
      if (json.result !== undefined) return json.result;
    } catch (e) { /* try next */ }
  }
  throw new Error("all RPCs failed");
}

function encodeOwnerOf(tokenId) {
  return "0x6352211e" + tokenId.toString(16).padStart(64, "0");
}

function encodeTryAggregate(calls) {
  // tryAggregate(bool requireSuccess, (address,bytes)[] calls)
  // selector: 0xbce38bd7
  var hex = "0xbce38bd7";
  hex += "0".repeat(64); // requireSuccess = false
  hex += (64).toString(16).padStart(64, "0"); // offset to array
  hex += calls.length.toString(16).padStart(64, "0"); // array length
  var tupleHeadSize = calls.length * 32;
  var tupleBodies = "";
  var offsets = "";
  for (var i = 0; i < calls.length; i++) {
    offsets += (tupleHeadSize + tupleBodies.length / 2).toString(16).padStart(64, "0");
    var body = calls[i].target.slice(2).padStart(64, "0");
    body += (64).toString(16).padStart(64, "0"); // offset to bytes
    var cd = calls[i].data.slice(2);
    body += (cd.length / 2).toString(16).padStart(64, "0"); // bytes length
    body += cd + "0".repeat((64 - (cd.length % 64)) % 64); // padded data
    tupleBodies += body;
  }
  hex += offsets + tupleBodies;
  return hex;
}

function decodeTryAggregateResult(hex) {
  var d = hex.slice(2);
  var arrOff = parseInt(d.slice(0, 64), 16) * 2;
  var count = parseInt(d.slice(arrOff, arrOff + 64), 16);
  var results = [];
  for (var i = 0; i < count; i++) {
    var elemOff = parseInt(d.slice(arrOff + 64 + i * 64, arrOff + 64 + i * 64 + 64), 16) * 2;
    var abs = arrOff + 64 + elemOff;
    var success = parseInt(d.slice(abs, abs + 64), 16) === 1;
    var dataOff = parseInt(d.slice(abs + 64, abs + 128), 16) * 2;
    var owner = success ? "0x" + d.slice(abs + dataOff + 64 + 24, abs + dataOff + 64 + 64).toLowerCase() : "";
    results.push({ success: success, owner: owner });
  }
  return results;
}

async function fetchOwnedTokenIds(address) {
  var owned = [];
  var addrLower = address.toLowerCase();
  var BATCH = 1000;
  for (var start = 0; start < 10000; start += BATCH) {
    var calls = [];
    for (var t = start; t < start + BATCH && t < 10000; t++) {
      calls.push({ target: NORMIES_CONTRACT, data: encodeOwnerOf(t) });
    }
    var encoded = encodeTryAggregate(calls);
    var result = await rpcCall("eth_call", [{ to: MULTICALL3, data: encoded }, "latest"]);
    var decoded = decodeTryAggregateResult(result);
    for (var j = 0; j < decoded.length; j++) {
      if (decoded[j].success && decoded[j].owner === addrLower) owned.push(start + j);
    }
    setStatus("scanning wallet\u2026 " + Math.min(start + BATCH, 10000) + " / 10000");
  }
  return owned;
}

async function fetchTokenMeta(tokenId) {
  try {
    const r = await fetch(NORMIES_API + "/normie/" + tokenId + "/canvas/info", { cache: "no-store" });
    return r.ok ? await r.json() : {};
  } catch { return {}; }
}

async function fetchImageRGBA(tokenId) {
  const res = await fetch(NORMIES_API + "/normie/" + tokenId + "/image.png", { cache: "no-store" });
  if (!res.ok) throw new Error("image " + res.status);
  const bmp = await createImageBitmap(await res.blob());
  const oc = new OffscreenCanvas(GRID, GRID);
  const ctx = oc.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bmp, 0, 0, GRID, GRID);
  return ctx.getImageData(0, 0, GRID, GRID).data;
}

/* ── ENS resolver ─────────────────────────────────────────────────────────── */
async function resolveAddress(raw) {
  const v = raw.trim();
  if (!v) throw new Error("empty entry");
  if (/^0x[a-fA-F0-9]{40}$/i.test(v)) return v.toLowerCase();
  const res = await fetch("https://api.ensideas.com/ens/resolve/" + encodeURIComponent(v));
  if (!res.ok) throw new Error('could not resolve "' + v + '"');
  const data = await res.json();
  if (!data?.address || !/^0x[a-fA-F0-9]{40}$/i.test(data.address))
    throw new Error('no address found for "' + v + '"');
  return data.address.toLowerCase();
}

/* ── UI helpers ───────────────────────────────────────────────────────────── */
function setProgress(done, total, label) {
  progressBar.style.setProperty("--pct", (total > 0 ? Math.round(done / total * 100) : 0) + "%");
  progressLabel.textContent = label;
  progressWrap.classList.toggle("visible", done < total);
}
function setStatus(msg, err) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", !!err);
}
function setBusy(b) {
  loadBtn.disabled = b;
  walletInput.disabled = b;
}

/* ── Museum state ─────────────────────────────────────────────────────────── */
let inMuseum = false;
let mobileYaw = 0, mobilePitch = 0;

function enterMuseum() {
  inMuseum = true;
  overlayEl.classList.add("hidden");
  hudEl.classList.remove("hud-hidden");
}

function exitMuseum() {
  if (controls) controls.unlock();
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
  inMuseum = false;
  overlayEl.classList.remove("hidden");
  hudEl.classList.add("hud-hidden");
  clearArt();
  setStatus("");
  camera.position.set(0, 1.7, currentRoomLen / 2 - 2);
  camera.rotation.set(0, 0, 0);
  mobileYaw = 0;
  mobilePitch = 0;
}

/* ── Main load flow ───────────────────────────────────────────────────────── */
async function loadMuseumForWallets(rawInput) {
  var entries = rawInput.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
  if (!entries.length) { setStatus("paste a wallet address or ENS name.", true); return; }

  setBusy(true);
  setStatus("resolving " + (entries.length > 1 ? entries.length + " entries" : "address") + "\u2026");

  var addresses;
  try { addresses = await Promise.all(entries.map(resolveAddress)); }
  catch (e) { setStatus(e.message, true); setBusy(false); return; }

  setStatus("scanning wallet" + (addresses.length > 1 ? "s" : "") + "\u2026");

  var allIds;
  try {
    var per = await Promise.all(addresses.map(fetchOwnedTokenIds));
    allIds = [...new Set(per.flat())];
  } catch (e) { setStatus("wallet lookup failed: " + e.message, true); setBusy(false); return; }

  if (!allIds.length) {
    setStatus("no normies found in " + (addresses.length > 1 ? "these wallets" : "this wallet") + ".");
    setBusy(false);
    return;
  }

  var shown = allIds;

  buildGallery(shown.length);
  clearArt();
  enterMuseum();
  if (!isTouch && controls) controls.lock();
  setBusy(false);

  setStatus("loading " + shown.length + " normies\u2026");
  hudMetaEl.textContent = addresses.length === 1
    ? addresses[0].slice(0, 8) + "\u2026" + addresses[0].slice(-5) + " \u00b7 " + allIds.length + " normies"
    : addresses.length + " wallets \u00b7 " + allIds.length + " normies";
  setProgress(0, shown.length, "loading 0 / " + shown.length);

  var phs = shown.map(function(_, i) {
    var slot = wallSlots[i];
    if (!slot) return null;
    var ph = buildPlaceholder();
    ph.position.copy(slot.pos);
    ph.rotation.y = slot.ry;
    artGroup.add(ph);
    return ph;
  });

  var done = 0;
  var BATCH = 8;
  for (var bi = 0; bi < shown.length; bi += BATCH) {
    var batch = shown.slice(bi, bi + BATCH);
    var batchIdxStart = bi;
    await Promise.allSettled(batch.map(async function(tokenId, j) {
      var i = batchIdxStart + j;
      try {
        var results = await Promise.all([fetchImageRGBA(tokenId), fetchTokenMeta(tokenId)]);
        var rgba = results[0], meta = results[1];
        var slot = wallSlots[i];
        if (!slot) return;
        var art = buildVoxelArtwork(tokenId, rgba, {
          type: meta?.type || "human",
          ap: meta?.actionPoints || null,
        });
        art.position.copy(slot.pos);
        art.rotation.y = slot.ry;
        if (phs[i]) { artGroup.remove(phs[i]); dispose(phs[i]); }
        artGroup.add(art);
      } catch (ignored) {}
      done++;
      setProgress(done, shown.length, "loading " + done + " / " + shown.length);
    }));
  }

  setProgress(shown.length, shown.length, "");
}

/* ── Event listeners ──────────────────────────────────────────────────────── */
aboutBtn.addEventListener("click", function() { aboutModal.classList.remove("modal-hidden"); });
aboutCloseBtn.addEventListener("click", function() { aboutModal.classList.add("modal-hidden"); });
aboutModal.addEventListener("click", function(e) { if (e.target === aboutModal) aboutModal.classList.add("modal-hidden"); });
exitBtn.addEventListener("click", exitMuseum);
loadBtn.addEventListener("click", function() { loadMuseumForWallets(walletInput.value); });
walletInput.addEventListener("keydown", function(e) { if (e.key === "Enter") loadMuseumForWallets(walletInput.value); });
document.getElementById("interaction-hint").addEventListener("click", function(e) { e.stopPropagation(); pressButton(); });

/* ── Theme toggle ─────────────────────────────────────────────────────────── */
(function initTheme() {
  var saved = localStorage.getItem("normuseum-theme");
  if (saved === "dark" || (!saved && matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
themeToggle.addEventListener("click", function() {
  var isDark = document.documentElement.getAttribute("data-theme") === "dark";
  var next = isDark ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("normuseum-theme", next);
});

/* ── Fullscreen toggle ────────────────────────────────────────────────────── */
function toggleFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    var el = document.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
}
fullscreenBtn.addEventListener("click", toggleFullscreen);

/* ── Footstep audio (generated via AudioContext) ──────────────────────────── */
var audioCtx = null;
var stepCooldown = 0;
var STEP_INTERVAL = 0.38;
var STEP_INTERVAL_SPRINT = 0.26;

function playFootstep() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();

  var now = audioCtx.currentTime;
  var osc = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  var filter = audioCtx.createBiquadFilter();

  // Soft thud — low-passed noise-like tone
  osc.type = "triangle";
  osc.frequency.setValueAtTime(60 + Math.random() * 30, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + 0.08);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(200, now);
  filter.Q.setValueAtTime(0.7, now);

  gain.gain.setValueAtTime(0.018, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}

/* ── Background music ─────────────────────────────────────────────────────── */
var bgMusic = null;
var musicPlaying = false;
var musicBtn = $("musicBtn");

function initMusic() {
  if (bgMusic) return;
  bgMusic = new Audio("./bgmusic.mp3");
  bgMusic.loop = true;
  bgMusic.volume = 0.25;
}

function toggleMusic() {
  initMusic();
  if (musicPlaying) {
    bgMusic.pause();
    musicPlaying = false;
  } else {
    bgMusic.play().catch(function() {});
    musicPlaying = true;
  }
  if (musicBtn) musicBtn.classList.toggle("music-active", musicPlaying);
}

if (musicBtn) musicBtn.addEventListener("click", toggleMusic);

/* ── Pointer lock (desktop) ───────────────────────────────────────────────── */
if (!isTouch && controls) {
  renderer.domElement.addEventListener("click", function() {
    if (!inMuseum) return;
    if (controls.isLocked) tryInteract();
    else controls.lock();
  });
  controls.addEventListener("lock", function()   { document.body.classList.add("locked"); });
  controls.addEventListener("unlock", function() { document.body.classList.remove("locked"); });
}

/* ── Keyboard (desktop) ───────────────────────────────────────────────────── */
var keys = { w: false, s: false, a: false, d: false, shift: false };
if (!isTouch) {
  window.addEventListener("keydown", function(e) {
    if (e.code === "KeyW") keys.w = true;
    if (e.code === "KeyS") keys.s = true;
    if (e.code === "KeyA") keys.a = true;
    if (e.code === "KeyD") keys.d = true;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = true;
    if (e.code === "KeyF" && inMuseum) toggleFullscreen();
    if (e.code === "KeyE" && inMuseum) tryInteract();
    if (e.code === "KeyM" && inMuseum) toggleMusic();
  });
  window.addEventListener("keyup", function(e) {
    if (e.code === "KeyW") keys.w = false;
    if (e.code === "KeyS") keys.s = false;
    if (e.code === "KeyA") keys.a = false;
    if (e.code === "KeyD") keys.d = false;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = false;
  });
}

/* ── Touch controls ───────────────────────────────────────────────────────── */
var JOY_R = 52, LOOK_SENS = 0.0038;
var joy  = { on: false, id: -1, sx: 0, sy: 0, dx: 0, dy: 0 };
var look = { on: false, id: -1, lx: 0, ly: 0 };

function joyUI(nx, ny) {
  var k = $("joystick-knob");
  if (k) k.style.transform = "translate(" + (nx * JOY_R) + "px, " + (ny * JOY_R) + "px)";
}

if (isTouch) {
  var cnv = renderer.domElement;

  cnv.addEventListener("touchstart", function(e) {
    if (!inMuseum) return;
    e.preventDefault();
    for (var ti = 0; ti < e.changedTouches.length; ti++) {
      var t = e.changedTouches[ti];
      if (t.clientX < innerWidth * 0.45 && !joy.on) {
        joy.on = true; joy.id = t.identifier; joy.sx = t.clientX; joy.sy = t.clientY; joy.dx = 0; joy.dy = 0;
        $("joystick-base").style.opacity = "1";
        joyUI(0, 0);
      } else if (t.clientX >= innerWidth * 0.45 && !look.on) {
        look.on = true; look.id = t.identifier; look.lx = t.clientX; look.ly = t.clientY;
      }
    }
  }, { passive: false });

  cnv.addEventListener("touchmove", function(e) {
    if (!inMuseum) return;
    e.preventDefault();
    for (var ti = 0; ti < e.changedTouches.length; ti++) {
      var t = e.changedTouches[ti];
      if (t.identifier === joy.id) {
        joy.dx = t.clientX - joy.sx;
        joy.dy = t.clientY - joy.sy;
        var r = Math.min(Math.hypot(joy.dx, joy.dy), JOY_R);
        var a = Math.atan2(joy.dy, joy.dx);
        joyUI(Math.cos(a) * r / JOY_R, Math.sin(a) * r / JOY_R);
      } else if (t.identifier === look.id) {
        mobileYaw -= (t.clientX - look.lx) * LOOK_SENS;
        mobilePitch = THREE.MathUtils.clamp(
          mobilePitch - (t.clientY - look.ly) * LOOK_SENS,
          -Math.PI / 2.8, Math.PI / 2.8
        );
        look.lx = t.clientX; look.ly = t.clientY;
      }
    }
  }, { passive: false });

  cnv.addEventListener("touchend", function(e) {
    for (var ti = 0; ti < e.changedTouches.length; ti++) {
      var t = e.changedTouches[ti];
      if (t.identifier === joy.id) {
        joy.on = false; joy.id = -1; joy.dx = 0; joy.dy = 0;
        $("joystick-base").style.opacity = "0.5";
        joyUI(0, 0);
      } else if (t.identifier === look.id) {
        look.on = false; look.id = -1;
      }
    }
  }, { passive: false });
}

/* ── Movement ─────────────────────────────────────────────────────────────── */
var vel = new THREE.Vector3();
var dir = new THREE.Vector3();

function move(dt) {
  var isMoving = false;
  var isSprinting = false;

  if (isTouch) {
    camera.rotation.y = mobileYaw;
    camera.rotation.x = mobilePitch;
    if (joy.on) {
      var nx = THREE.MathUtils.clamp(joy.dx / JOY_R, -1, 1);
      var ny = THREE.MathUtils.clamp(joy.dy / JOY_R, -1, 1);
      var spd = 3.5;
      var fwd = -ny * spd * dt, right = nx * spd * dt;
      camera.position.x += Math.sin(mobileYaw) * fwd + Math.cos(mobileYaw) * right;
      camera.position.z += Math.cos(mobileYaw) * fwd - Math.sin(mobileYaw) * right;
      isMoving = Math.abs(nx) > 0.15 || Math.abs(ny) > 0.15;
    }
    camera.position.y = 1.7;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -(WALL_X - 0.6), WALL_X - 0.6);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -(currentRoomLen / 2 - 0.6), currentRoomLen / 2 - 0.6);
  } else {
    isSprinting = keys.shift;
    var spd2 = isSprinting ? 6.5 : 3.2;
    vel.set(0, 0, 0);
    dir.z = Number(keys.w) - Number(keys.s);
    dir.x = Number(keys.d) - Number(keys.a);
    dir.normalize();
    if (keys.w || keys.s) vel.z = dir.z * spd2 * dt;
    if (keys.a || keys.d) vel.x = dir.x * spd2 * dt;
    isMoving = keys.w || keys.s || keys.a || keys.d;
    controls.moveRight(vel.x);
    controls.moveForward(vel.z);
    var p = camera.position;
    p.y = 1.7;
    p.x = THREE.MathUtils.clamp(p.x, -(WALL_X - 0.6), WALL_X - 0.6);
    p.z = THREE.MathUtils.clamp(p.z, -(currentRoomLen / 2 - 0.6), currentRoomLen / 2 - 0.6);
  }

  // Footstep sounds
  if (isMoving) {
    stepCooldown -= dt;
    if (stepCooldown <= 0) {
      playFootstep();
      stepCooldown = isSprinting ? STEP_INTERVAL_SPRINT : STEP_INTERVAL;
    }
  } else {
    stepCooldown = 0;
  }
}

/* ── Reveal animation ─────────────────────────────────────────────────────── */
function tickReveal(dt) {
  for (var i = 0; i < artGroup.children.length; i++) {
    var c = artGroup.children[i];
    if (!c.userData.revealing) continue;
    c.userData.revealT = Math.min(1, c.userData.revealT + dt * 4.2);
    var t = easeOutBack(c.userData.revealT);
    c.scale.setScalar(t);
    if (c.userData.revealT >= 1) { c.userData.revealing = false; c.scale.setScalar(1); }
  }
}
function easeOutBack(t) {
  var c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/* ── Render loop ──────────────────────────────────────────────────────────── */
var clock = new THREE.Timer();
function animate() {
  requestAnimationFrame(animate);
  clock.update();
  var dt = Math.min(clock.getDelta(), 0.05);
  var shouldMove = isTouch ? inMuseum : (controls && controls.isLocked);
  if (shouldMove) move(dt);
  tickReveal(dt);
  checkButtonInteraction();
  renderer.render(scene, camera);
}
animate();

/* ── Resize ───────────────────────────────────────────────────────────────── */
window.addEventListener("resize", function() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
