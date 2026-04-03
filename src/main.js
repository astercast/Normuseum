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
const ROOM_W = 14, ROOM_H = 5.2;
const SLOT_SPACING = 3.6;

/* ── Multi-room layout constants ──────────────────────────────────────────── */
const NORMIES_PER_ROOM = 20;
const SHIFT_X          = ROOM_W + 8;
const CORR_Z           = 8;
const CORR_W           = 4.5;
const ROOM_PAD         = 5;

/* ── Frame toggle state ───────────────────────────────────────────────────── */
let framesVisible = false;
let podiumBtnMesh = null;
let buttonHovered = false;
let btnAnimating = false;

/* ── Jump physics ─────────────────────────────────────────────────────────── */
var jumpVelocity = 0;
var isJumping = false;
var GRAVITY = -12;
var JUMP_FORCE = 5.2;
var GROUND_Y = 1.7;

/* ── Bench sitting ────────────────────────────────────────────────────────── */
var isSitting = false;
var benchPositions = [];   // {x, z} of each bench centre
var benchHovered = false;
var nearBenchIdx = -1;

/* ── Volume controls ──────────────────────────────────────────────────────── */
var musicVolume = 0.25;
var sfxVolume = 0.5;

/* ── Slurp sound ──────────────────────────────────────────────────────────── */
var slurpAudio = null;
var slurpCooldown = 0;
var SLURP_DISTANCE = 1.6;
var SLURP_COOLDOWN = 4;

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
const aboutModal    = $("about-page");
const aboutBtn      = $("aboutBtn");
const homeBtn       = $("homeBtn");
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
scene.fog = new THREE.FogExp2("#f0ede8", 0.018);

/* ── Camera ───────────────────────────────────────────────────────────────── */
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
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
scene.add(new THREE.AmbientLight(0xfff8f0, 0.65));
const sun = new THREE.DirectionalLight(0xfff0dd, 0.45);
sun.position.set(5, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.far = 80;
scene.add(sun);
const fill = new THREE.HemisphereLight(0xfff8f0, 0xd4c4a8, 0.3);
scene.add(fill);

/* ── Shared materials ─────────────────────────────────────────────────────── */
const floorMat = new THREE.MeshStandardMaterial({ color: "#d8cfc0", roughness: 0.15, metalness: 0.1 });
const wallMat  = new THREE.MeshStandardMaterial({ color: "#f5f2ed", roughness: 0.85 });
const panelMat = new THREE.MeshStandardMaterial({ color: "#ede8e0", roughness: 0.7, metalness: 0.02 });
const ceilMat  = new THREE.MeshStandardMaterial({ color: "#faf8f4", roughness: 0.92 });
const mouldMat = new THREE.MeshStandardMaterial({ color: "#e8e2d8", roughness: 0.55, metalness: 0.08 });
const baseMat  = new THREE.MeshStandardMaterial({ color: "#ddd6ca", roughness: 0.6, metalness: 0.05 });
const frameMat = new THREE.MeshStandardMaterial({ color: "#b8a88c", roughness: 0.4, metalness: 0.15 });
const backMat  = new THREE.MeshStandardMaterial({ color: "#faf8f5", roughness: 0.95 });
const placeMat = new THREE.MeshStandardMaterial({ color: "#eae6df", roughness: 0.95 });
const benchMat = new THREE.MeshStandardMaterial({ color: "#3a3530", roughness: 0.55, metalness: 0.1 });
const benchSeatMat = new THREE.MeshStandardMaterial({ color: "#5c5448", roughness: 0.7 });
const corrFloorMat = new THREE.MeshStandardMaterial({ color: "#c4b8a4", roughness: 0.2, metalness: 0.12 });
const archMat = new THREE.MeshStandardMaterial({ color: "#d4cec2", roughness: 0.5, metalness: 0.1 });

/* ── Gallery + art groups ─────────────────────────────────────────────────── */
const galleryGroup = new THREE.Group();
scene.add(galleryGroup);
const artGroup = new THREE.Group();
scene.add(artGroup);

/* ── Multi-room state ─────────────────────────────────────────────────────── */
var rooms = [];
var walkZones = [];
var allTokenIds = [];
var currentRoomIdx = -1;

/* ── Plan the multi-room layout ───────────────────────────────────────────── */
function planLayout(totalCount) {
  rooms = [];
  walkZones = [];
  var numRooms = Math.max(1, Math.ceil(totalCount / NORMIES_PER_ROOM));
  var slotsUsed = 0;
  var zCursor = 0;

  for (var ri = 0; ri < numRooms; ri++) {
    var count = Math.min(NORMIES_PER_ROOM, totalCount - slotsUsed);
    var slotsPerSide = Math.ceil(count / 2);
    var roomLen = slotsPerSide * SLOT_SPACING + ROOM_PAD * 2;
    var cx = (ri % 2 === 0) ? 0 : SHIFT_X;
    var zStart = zCursor;
    var zEnd = zCursor - roomLen;

    rooms.push({
      cx: cx, zStart: zStart, zEnd: zEnd, roomLen: roomLen,
      slotsPerSide: slotsPerSide, slotOffset: slotsUsed, slotCount: count,
      built: false, loaded: false, loading: false,
      group: null, artSlots: [],
    });

    walkZones.push({
      minX: cx - ROOM_W / 2 + 0.5, maxX: cx + ROOM_W / 2 - 0.5,
      minZ: zEnd + 0.5, maxZ: zStart - 0.5,
    });

    slotsUsed += count;

    if (ri < numRooms - 1) {
      var nextCx = ((ri + 1) % 2 === 0) ? 0 : SHIFT_X;
      var corrZMid = zEnd - CORR_Z / 2;
      var nextZStart = zEnd - CORR_Z;

      // Corridor segment 1: straight from room exit
      walkZones.push({ minX: cx - CORR_W / 2, maxX: cx + CORR_W / 2, minZ: corrZMid - 1, maxZ: zEnd + 1 });
      // Corridor segment 2: sideways
      var segMinX = Math.min(cx, nextCx) - CORR_W / 2;
      var segMaxX = Math.max(cx, nextCx) + CORR_W / 2;
      walkZones.push({ minX: segMinX, maxX: segMaxX, minZ: corrZMid - CORR_W / 2, maxZ: corrZMid + CORR_W / 2 });
      // Corridor segment 3: straight into next room
      walkZones.push({ minX: nextCx - CORR_W / 2, maxX: nextCx + CORR_W / 2, minZ: nextZStart - 1, maxZ: corrZMid + 1 });

      zCursor = nextZStart;
    }
  }
}

/* ── Shared sky texture ───────────────────────────────────────────────────── */
var skyTexture = null;
function getSkyTexture() {
  if (skyTexture) return skyTexture;
  var c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  var ctx = c.getContext("2d");
  var grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#5da0d4"); grad.addColorStop(0.55, "#87c4eb"); grad.addColorStop(1, "#bde0f5");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  [[80,120,90,40],[200,90,120,50],[350,130,80,35],[420,70,100,45],[150,160,70,30],[300,50,60,28]].forEach(function(p) {
    ctx.beginPath(); ctx.ellipse(p[0], p[1], p[2], p[3], 0, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  [[130,100,60,25],[260,110,50,22],[380,80,70,30]].forEach(function(p) {
    ctx.beginPath(); ctx.ellipse(p[0], p[1], p[2], p[3], 0, 0, Math.PI * 2); ctx.fill();
  });
  skyTexture = new THREE.CanvasTexture(c);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  return skyTexture;
}

/* ── Build a single room ──────────────────────────────────────────────────── */
function buildRoom(ri) {
  var room = rooms[ri];
  if (room.built) return;
  room.built = true;

  var g = new THREE.Group();
  room.group = g;
  var cx = room.cx;
  var zMid = (room.zStart + room.zEnd) / 2;
  var WALL_X = ROOM_W / 2;

  // Floor
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, room.roomLen), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, zMid); floor.receiveShadow = true;
  g.add(floor);

  // Floor inlay
  var inlayMat = new THREE.MeshStandardMaterial({ color: "#b0a590", roughness: 0.2, metalness: 0.15 });
  [-WALL_X + 0.9, WALL_X - 0.9].forEach(function(lx) {
    var strip = new THREE.Mesh(new THREE.PlaneGeometry(0.06, room.roomLen - 1.5), inlayMat);
    strip.rotation.x = -Math.PI / 2; strip.position.set(cx + lx, 0.003, zMid); g.add(strip);
  });

  // Floor reflection
  var reflMat = new THREE.MeshStandardMaterial({ color: "#e0d8cc", roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.1 });
  var refl = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, room.roomLen), reflMat);
  refl.rotation.x = -Math.PI / 2; refl.position.set(cx, 0.002, zMid); g.add(refl);

  // Ceiling
  var ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, room.roomLen), ceilMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, ROOM_H, zMid); g.add(ceil);

  // Side walls
  var wallGeo = new THREE.PlaneGeometry(room.roomLen, ROOM_H);
  var lw = new THREE.Mesh(wallGeo, wallMat);
  lw.rotation.y = Math.PI / 2; lw.position.set(cx - WALL_X, ROOM_H / 2, zMid); lw.receiveShadow = true; g.add(lw);
  var rw = new THREE.Mesh(wallGeo, wallMat);
  rw.rotation.y = -Math.PI / 2; rw.position.set(cx + WALL_X, ROOM_H / 2, zMid); rw.receiveShadow = true; g.add(rw);

  // End walls with doorways
  if (ri === 0) {
    var ew = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_H), wallMat);
    ew.rotation.y = Math.PI; ew.position.set(cx, ROOM_H / 2, room.zStart); g.add(ew);
  } else {
    buildDoorwayWall(g, cx, room.zStart, Math.PI, ROOM_W, ROOM_H);
  }
  if (ri === rooms.length - 1) {
    var fw = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_H), wallMat);
    fw.position.set(cx, ROOM_H / 2, room.zEnd); g.add(fw);
  } else {
    buildDoorwayWall(g, cx, room.zEnd, 0, ROOM_W, ROOM_H);
  }

  // Wainscoting
  var wainH = 1.1;
  var wainGeo = new THREE.PlaneGeometry(room.roomLen, wainH);
  [-WALL_X, WALL_X].forEach(function(x, idx) {
    var w = new THREE.Mesh(wainGeo, panelMat);
    w.rotation.y = idx === 0 ? Math.PI / 2 : -Math.PI / 2;
    w.position.set(cx + x + (idx === 0 ? 0.01 : -0.01), wainH / 2, zMid); g.add(w);
  });

  // Chair rail
  var railGeo = new THREE.BoxGeometry(0.06, 0.05, room.roomLen + 0.2);
  [-WALL_X + 0.03, WALL_X - 0.03].forEach(function(x) {
    var rail = new THREE.Mesh(railGeo, mouldMat); rail.position.set(cx + x, wainH, zMid); g.add(rail);
  });

  // Crown moulding
  var crownGeo = new THREE.BoxGeometry(0.14, 0.1, room.roomLen + 0.4);
  [-WALL_X + 0.07, WALL_X - 0.07].forEach(function(x) {
    var crown = new THREE.Mesh(crownGeo, mouldMat); crown.position.set(cx + x, ROOM_H - 0.05, zMid); g.add(crown);
  });

  // Baseboard
  var skirtGeo = new THREE.BoxGeometry(0.06, 0.18, room.roomLen + 0.1);
  [-WALL_X + 0.03, WALL_X - 0.03].forEach(function(x) {
    var skirt = new THREE.Mesh(skirtGeo, baseMat); skirt.position.set(cx + x, 0.09, zMid); g.add(skirt);
  });

  // Skylights
  var skyMat = new THREE.MeshBasicMaterial({ map: getSkyTexture() });
  var trimMat = new THREE.MeshStandardMaterial({ color: "#d4cec2", roughness: 0.6, metalness: 0.15 });
  var skylightCount = Math.max(1, Math.floor(room.roomLen / 10));
  for (var ski = 0; ski < skylightCount; ski++) {
    var sz = room.zStart - ROOM_PAD - (ski + 0.5) * ((room.roomLen - ROOM_PAD * 2) / skylightCount);
    var pane = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.6), skyMat);
    pane.rotation.x = Math.PI / 2; pane.position.set(cx, ROOM_H - 0.01, sz); g.add(pane);
    [[0, -0.85, 3.2, 0.08], [0, 0.85, 3.2, 0.08], [-1.55, 0, 0.08, 1.8], [1.55, 0, 0.08, 1.8]].forEach(function(t) {
      var tr = new THREE.Mesh(new THREE.BoxGeometry(t[2], 0.05, t[3]), trimMat);
      tr.position.set(cx + t[0], ROOM_H - 0.02, sz + t[1]); g.add(tr);
    });
    var skyLight = new THREE.PointLight(0xc4dff0, 0.4, 7); skyLight.position.set(cx, ROOM_H - 0.1, sz); g.add(skyLight);
  }

  // Per-artwork spotlights
  var slotZStart = room.zStart - ROOM_PAD;
  for (var si = 0; si < room.slotsPerSide; si++) {
    var z = slotZStart - si * SLOT_SPACING;
    var sl = new THREE.RectAreaLight(0xfff0dd, 6, 1.4, 0.4);
    sl.position.set(cx - WALL_X + 1.8, ROOM_H - 0.3, z); sl.lookAt(cx - WALL_X + 0.1, 1.8, z); g.add(sl);
    var sr = new THREE.RectAreaLight(0xfff0dd, 6, 1.4, 0.4);
    sr.position.set(cx + WALL_X - 1.8, ROOM_H - 0.3, z); sr.lookAt(cx + WALL_X - 0.1, 1.8, z); g.add(sr);
  }

  // Wash lights
  var washCount = Math.max(1, Math.ceil(room.roomLen / 14));
  for (var wi = 0; wi < washCount; wi++) {
    var wz = room.zStart - ROOM_PAD - (wi + 0.5) * ((room.roomLen - ROOM_PAD) / washCount);
    var washLight = new THREE.PointLight(0xfff4e8, 0.4, 12); washLight.position.set(cx, ROOM_H - 0.1, wz); g.add(washLight);
  }

  // Bench
  if (room.slotsPerSide >= 3) {
    var bench = buildBench(); bench.position.set(cx, 0, zMid); g.add(bench);
    benchPositions.push({ x: cx, z: zMid });
  }

  // Room sign
  var roomCanvas = document.createElement("canvas");
  roomCanvas.width = 256; roomCanvas.height = 64;
  var rctx = roomCanvas.getContext("2d");
  rctx.clearRect(0, 0, 256, 64);
  rctx.fillStyle = "#82848a";
  rctx.font = '500 20px "IBM Plex Mono", monospace';
  rctx.textAlign = "center";
  rctx.fillText("room " + (ri + 1), 128, 38);
  var roomTex = new THREE.CanvasTexture(roomCanvas);
  roomTex.colorSpace = THREE.SRGBColorSpace;
  var roomSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.3),
    new THREE.MeshBasicMaterial({ map: roomTex, transparent: true })
  );
  roomSign.position.set(cx, ROOM_H - 0.4, room.zStart - 0.02); g.add(roomSign);

  // Art slots
  room.artSlots = [];
  var WO = ROOM_W / 2;
  for (var i = 0; i < room.slotsPerSide; i++) {
    var z = slotZStart - i * SLOT_SPACING;
    room.artSlots.push({ pos: new THREE.Vector3(cx - WO + 0.05, 2.1, z), ry: Math.PI / 2 });
    room.artSlots.push({ pos: new THREE.Vector3(cx + WO - 0.05, 2.1, z), ry: -Math.PI / 2 });
  }

  // Podium in first room
  if (ri === 0) {
    var podium = buildPodium(); podium.position.set(cx, 0, room.zStart - 3); g.add(podium);
  }

  galleryGroup.add(g);
}

/* ── Doorway wall ─────────────────────────────────────────────────────────── */
function buildDoorwayWall(parent, cx, z, ry, wallW, wallH) {
  var doorW = CORR_W + 0.2;
  var doorH = 3.6;
  var sideW = (wallW - doorW) / 2;

  var lp = new THREE.Mesh(new THREE.PlaneGeometry(sideW, wallH), wallMat);
  lp.rotation.y = ry; lp.position.set(cx - doorW / 2 - sideW / 2, wallH / 2, z); parent.add(lp);
  var rp = new THREE.Mesh(new THREE.PlaneGeometry(sideW, wallH), wallMat);
  rp.rotation.y = ry; rp.position.set(cx + doorW / 2 + sideW / 2, wallH / 2, z); parent.add(rp);
  var lintelH = wallH - doorH;
  var lt = new THREE.Mesh(new THREE.PlaneGeometry(doorW, lintelH), wallMat);
  lt.rotation.y = ry; lt.position.set(cx, doorH + lintelH / 2, z); parent.add(lt);

  // Archway trim
  [-doorW / 2, doorW / 2].forEach(function(dx) {
    var post = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorH, 0.12), archMat);
    post.position.set(cx + dx, doorH / 2, z); parent.add(post);
  });
  var lintTrim = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.24, 0.14, 0.12), archMat);
  lintTrim.position.set(cx, doorH, z); parent.add(lintTrim);
  var keystone = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.14), archMat);
  keystone.position.set(cx, doorH + 0.08, z); parent.add(keystone);
}

/* ── Build corridor ───────────────────────────────────────────────────────── */
function buildCorridor(ri) {
  var room = rooms[ri], next = rooms[ri + 1];
  if (!next) return;
  var g = new THREE.Group();
  var z1 = room.zEnd, z2 = next.zStart;
  var cx1 = room.cx, cx2 = next.cx;
  var zMid = (z1 + z2) / 2;

  addCorridorSegment(g, cx1, (z1 + zMid) / 2, CORR_W, Math.abs(z1 - zMid) + 1);
  if (Math.abs(cx2 - cx1) > 0.1) {
    addCorridorCross(g, (cx1 + cx2) / 2, zMid, Math.abs(cx2 - cx1) + CORR_W, CORR_W);
  }
  addCorridorSegment(g, cx2, (zMid + z2) / 2, CORR_W, Math.abs(zMid - z2) + 1);

  galleryGroup.add(g);
}

function addCorridorSegment(parent, cx, zMid, w, len) {
  var f = new THREE.Mesh(new THREE.PlaneGeometry(w, len), corrFloorMat);
  f.rotation.x = -Math.PI / 2; f.position.set(cx, 0.001, zMid); f.receiveShadow = true; parent.add(f);
  var c = new THREE.Mesh(new THREE.PlaneGeometry(w, len), ceilMat);
  c.rotation.x = Math.PI / 2; c.position.set(cx, ROOM_H, zMid); parent.add(c);
  var wallGeo = new THREE.PlaneGeometry(len, ROOM_H);
  var lw = new THREE.Mesh(wallGeo, wallMat); lw.rotation.y = Math.PI / 2; lw.position.set(cx - w / 2, ROOM_H / 2, zMid); parent.add(lw);
  var rw = new THREE.Mesh(wallGeo, wallMat); rw.rotation.y = -Math.PI / 2; rw.position.set(cx + w / 2, ROOM_H / 2, zMid); parent.add(rw);
  var corrLight = new THREE.PointLight(0xfff4e8, 0.3, 8); corrLight.position.set(cx, ROOM_H - 0.2, zMid); parent.add(corrLight);
}

function addCorridorCross(parent, cx, zMid, w, h) {
  var f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), corrFloorMat);
  f.rotation.x = -Math.PI / 2; f.position.set(cx, 0.001, zMid); f.receiveShadow = true; parent.add(f);
  var c = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ceilMat);
  c.rotation.x = Math.PI / 2; c.position.set(cx, ROOM_H, zMid); parent.add(c);
  var wallGeo = new THREE.PlaneGeometry(w, ROOM_H);
  var fw = new THREE.Mesh(wallGeo, wallMat); fw.position.set(cx, ROOM_H / 2, zMid - h / 2); parent.add(fw);
  var bw = new THREE.Mesh(wallGeo, wallMat); bw.rotation.y = Math.PI; bw.position.set(cx, ROOM_H / 2, zMid + h / 2); parent.add(bw);
  var crossLight = new THREE.PointLight(0xfff4e8, 0.3, 8); crossLight.position.set(cx, ROOM_H - 0.2, zMid); parent.add(crossLight);
}

/* ── Bench ────────────────────────────────────────────────────────────────── */
function buildBench() {
  var g = new THREE.Group();
  var seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.5), benchSeatMat);
  seat.position.y = 0.46; seat.castShadow = true; seat.receiveShadow = true; g.add(seat);
  [[-0.82, -0.18], [-0.82, 0.18], [0.82, -0.18], [0.82, 0.18]].forEach(function(p) {
    var leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.43, 0.06), benchMat);
    leg.position.set(p[0], 0.215, p[1]); leg.castShadow = true; g.add(leg);
  });
  var stretcher = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.04, 0.04), benchMat); stretcher.position.set(0, 0.14, 0); g.add(stretcher);
  return g;
}

/* ── Build full museum ────────────────────────────────────────────────────── */
function buildMuseum(totalCount) {
  while (galleryGroup.children.length) {
    var c = galleryGroup.children[0]; galleryGroup.remove(c);
    c.traverse(function(ch) { if (ch.isMesh) ch.geometry?.dispose(); });
  }
  clearArt();
  benchPositions = [];
  planLayout(totalCount);
  for (var ri = 0; ri < rooms.length; ri++) {
    buildRoom(ri);
    if (ri < rooms.length - 1) buildCorridor(ri);
  }
  if (rooms.length) camera.position.set(rooms[0].cx, 1.7, rooms[0].zStart - 2);
}

/* ── Label texture ────────────────────────────────────────────────────────── */
function makeLabelTex(tokenId, type, ap) {
  var c = document.createElement("canvas");
  c.width = 512; c.height = 72;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(240,240,238,0.92)"; ctx.fillRect(0, 0, 512, 72);
  ctx.fillStyle = "rgba(72,73,75,0.45)"; ctx.fillRect(0, 0, 3, 72);
  ctx.fillStyle = "#48494b";
  ctx.font = '500 22px "IBM Plex Mono", monospace';
  ctx.fillText("normie #" + tokenId, 14, 32);
  ctx.fillStyle = "#82848a";
  ctx.font = '400 16px "IBM Plex Mono", monospace';
  ctx.fillText([type, ap ? ap + " ap" : null].filter(Boolean).join(" \u00b7 "), 14, 56);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ── Build voxel artwork ──────────────────────────────────────────────────── */
function buildVoxelArtwork(tokenId, rgbaData, meta) {
  var group = new THREE.Group();

  var frameOuter = new THREE.Mesh(new THREE.BoxGeometry(ART_W + 0.2, ART_H + 0.2, 0.06), frameMat);
  frameOuter.position.z = -0.06; frameOuter.userData.isFrame = true; frameOuter.visible = framesVisible;
  group.add(frameOuter);

  var backing = new THREE.Mesh(new THREE.BoxGeometry(ART_W, ART_H, 0.03), backMat);
  backing.position.z = -0.03; backing.userData.isFrame = true; backing.visible = framesVisible;
  group.add(backing);

  var BG_LUM = 180, voxels = [];
  for (var py = 0; py < GRID; py++) {
    for (var px = 0; px < GRID; px++) {
      var i = (py * GRID + px) * 4;
      var rv = rgbaData[i], gv = rgbaData[i + 1], bv = rgbaData[i + 2], av = rgbaData[i + 3];
      if (av < 10) continue;
      var lum = 0.299 * rv + 0.587 * gv + 0.114 * bv;
      if (lum > BG_LUM) continue;
      voxels.push({
        x: (px - GRID / 2 + 0.5) * CELL, y: (GRID / 2 - py - 0.5) * CELL,
        r: rv / 255, g: gv / 255, b: bv / 255,
        depth: 1.5 + (1 - lum / BG_LUM) * 4.5,
      });
    }
  }

  if (voxels.length) {
    var mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05, vertexColors: true });
    var geo = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
    var inst = new THREE.InstancedMesh(geo, mat, voxels.length);
    var m4 = new THREE.Matrix4(), col = new THREE.Color();
    var scaleV = new THREE.Vector3(), posV = new THREE.Vector3(), quat = new THREE.Quaternion();
    for (var vi = 0; vi < voxels.length; vi++) {
      var v = voxels[vi];
      posV.set(v.x, v.y, VOXEL_SIZE * v.depth / 2);
      scaleV.set(1, 1, v.depth);
      m4.compose(posV, quat, scaleV);
      inst.setMatrixAt(vi, m4);
      col.setRGB(v.r, v.g, v.b);
      inst.setColorAt(vi, col);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.castShadow = inst.receiveShadow = true;
    inst.userData.isVoxel = true;
    group.add(inst);
  }

  // Flat painting for framed mode
  var flatCanvas = document.createElement("canvas");
  flatCanvas.width = GRID; flatCanvas.height = GRID;
  var flatCtx = flatCanvas.getContext("2d");
  var imgData = flatCtx.createImageData(GRID, GRID);
  imgData.data.set(rgbaData);
  flatCtx.putImageData(imgData, 0, 0);
  var flatTex = new THREE.CanvasTexture(flatCanvas);
  flatTex.magFilter = THREE.NearestFilter; flatTex.minFilter = THREE.NearestFilter;
  flatTex.colorSpace = THREE.SRGBColorSpace;
  var flatPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(ART_W, ART_H),
    new THREE.MeshStandardMaterial({ map: flatTex, roughness: 0.6, metalness: 0.05 })
  );
  flatPlane.position.z = 0.005; flatPlane.userData.isFlat = true; flatPlane.visible = framesVisible;
  group.add(flatPlane);

  var labelTex = makeLabelTex(tokenId, meta.type || "human", meta.ap);
  var label = new THREE.Mesh(
    new THREE.PlaneGeometry(ART_W + 0.2, 0.28),
    new THREE.MeshBasicMaterial({ map: labelTex, transparent: true })
  );
  label.position.set(0, -(ART_H / 2 + 0.36), 0.01); group.add(label);

  var artLight = new THREE.PointLight(0xfff0dd, 1.0, 3.0, 2.0); artLight.position.set(0, 0.5, 0.9); group.add(artLight);

  group.userData.revealT = 0;
  group.userData.revealing = true;
  group.scale.set(0.001, 0.001, 0.001);
  return group;
}

/* ── Placeholder / dispose ────────────────────────────────────────────────── */
function buildPlaceholder() {
  var g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(2.32, 2.32, 0.04), placeMat));
  return g;
}

function dispose(obj) {
  if (!obj) return;
  obj.traverse(function(c) {
    if (c.isMesh || c.isInstancedMesh) {
      c.geometry?.dispose();
      [].concat(c.material).forEach(function(m) { m?.dispose(); });
    }
  });
}
function clearArt() {
  while (artGroup.children.length) {
    var c = artGroup.children[artGroup.children.length - 1]; artGroup.remove(c); dispose(c);
  }
  rooms.forEach(function(r) { r.loaded = false; r.loading = false; });
}

/* ── Lazy load art for a room ─────────────────────────────────────────────── */
async function loadRoomArt(ri) {
  var room = rooms[ri];
  if (room.loaded || room.loading || !room.built) return;
  room.loading = true;
  var tokens = allTokenIds.slice(room.slotOffset, room.slotOffset + room.slotCount);

  var phs = tokens.map(function(_, j) {
    var slot = room.artSlots[j];
    if (!slot) return null;
    var ph = buildPlaceholder(); ph.position.copy(slot.pos); ph.rotation.y = slot.ry;
    artGroup.add(ph); return ph;
  });

  var BATCH = 4;
  for (var bi = 0; bi < tokens.length; bi += BATCH) {
    var batch = tokens.slice(bi, bi + BATCH);
    var batchStart = bi;
    await Promise.allSettled(batch.map(async function(tokenId, j) {
      var idx = batchStart + j;
      try {
        var results = await Promise.all([fetchImageRGBA(tokenId), fetchTokenMeta(tokenId)]);
        var slot = room.artSlots[idx];
        if (!slot) return;
        var art = buildVoxelArtwork(tokenId, results[0], {
          type: results[1]?.type || "human", ap: results[1]?.actionPoints || null,
        });
        art.position.copy(slot.pos); art.rotation.y = slot.ry;
        if (phs[idx]) { artGroup.remove(phs[idx]); dispose(phs[idx]); }
        artGroup.add(art);
      } catch (e) {}
    }));
  }
  room.loaded = true;
  room.loading = false;
}

/* ── Room loading check ───────────────────────────────────────────────────── */
function checkRoomLoading() {
  var px = camera.position.x, pz = camera.position.z;
  var newRoom = -1;
  for (var ri = 0; ri < rooms.length; ri++) {
    var r = rooms[ri], WX = ROOM_W / 2;
    if (px >= r.cx - WX - 1 && px <= r.cx + WX + 1 && pz >= r.zEnd - 1 && pz <= r.zStart + 1) {
      newRoom = ri; break;
    }
  }
  if (newRoom >= 0 && newRoom !== currentRoomIdx) {
    currentRoomIdx = newRoom;
    loadRoomArt(newRoom);
    if (newRoom > 0) loadRoomArt(newRoom - 1);
    if (newRoom < rooms.length - 1) loadRoomArt(newRoom + 1);
  }
}

/* ── Podium ───────────────────────────────────────────────────────────────── */
function makePodiumLabel() {
  var c = document.createElement("canvas"); c.width = 256; c.height = 64;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(240,240,238,0.92)"; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#666666"; ctx.font = 'bold 13px "IBM Plex Mono", monospace'; ctx.textAlign = "center";
  ctx.fillText("TOGGLE FRAMES", 128, 26);
  ctx.fillStyle = "#999999"; ctx.font = '11px "IBM Plex Mono", monospace';
  ctx.fillText("[E] or click", 128, 48);
  var tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

function buildPodium() {
  var group = new THREE.Group();
  var base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.92, 32),
    new THREE.MeshStandardMaterial({ color: "#eaeae8", roughness: 0.25, metalness: 0.05 }));
  base.position.y = 0.46; base.castShadow = true; base.receiveShadow = true; group.add(base);
  var plate = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.035, 32),
    new THREE.MeshStandardMaterial({ color: "#d8d8d6", roughness: 0.3, metalness: 0.12 }));
  plate.position.y = 0.94; plate.castShadow = true; group.add(plate);
  var housing = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 24),
    new THREE.MeshStandardMaterial({ color: "#555555", roughness: 0.2, metalness: 0.7 }));
  housing.position.y = 0.965; group.add(housing);
  var btn = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 24),
    new THREE.MeshStandardMaterial({ color: "#cc2020", roughness: 0.35, metalness: 0.1,
      emissive: new THREE.Color("#330808"), emissiveIntensity: 0.4 }));
  btn.position.y = 0.99; btn.userData.isButton = true; btn.castShadow = true;
  podiumBtnMesh = btn; group.add(btn);
  var podLight = new THREE.PointLight(0xff3333, 0.4, 1.8); podLight.position.y = 1.15; group.add(podLight);
  var signMat = new THREE.MeshBasicMaterial({ map: makePodiumLabel(), transparent: true });
  [{ p: [0, 0.5, 0.31], ry: 0 }, { p: [0, 0.5, -0.31], ry: Math.PI },
   { p: [-0.31, 0.5, 0], ry: Math.PI / 2 }, { p: [0.31, 0.5, 0], ry: -Math.PI / 2 }]
  .forEach(function(s) {
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.1), signMat);
    sign.position.set(s.p[0], s.p[1], s.p[2]); sign.rotation.y = s.ry; group.add(sign);
  });
  return group;
}

/* ── Raycaster + interaction ──────────────────────────────────────────────── */
var raycaster = new THREE.Raycaster(); raycaster.far = 3.5;
var screenCenter = new THREE.Vector2(0, 0);

function checkButtonInteraction() {
  if (!inMuseum || !podiumBtnMesh) {
    if (buttonHovered) { buttonHovered = false; updateInteractionHint(false); } return;
  }
  raycaster.setFromCamera(screenCenter, camera);
  var intersects = raycaster.intersectObject(podiumBtnMesh);
  var hit = intersects.length > 0 && intersects[0].distance < 3.5;
  if (hit !== buttonHovered) { buttonHovered = hit; updateInteractionHint(hit); }
}

function updateInteractionHint(show) {
  var el = document.getElementById("interaction-hint");
  if (el) el.classList.toggle("visible", show);
}

function pressButton() {
  if (!podiumBtnMesh || btnAnimating) return;
  framesVisible = !framesVisible;
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

function tryInteract() {
  if (isSitting) { standUp(); return; }
  if (buttonHovered) { pressButton(); return; }
  if (benchHovered && nearBenchIdx >= 0) { sitDown(nearBenchIdx); return; }
}

function sitDown(bi) {
  var b = benchPositions[bi];
  if (!b) return;
  isSitting = true;
  camera.position.set(b.x, 0.9, b.z);
  GROUND_Y = 0.9;
  updateInteractionHint(false);
  var sitHint = document.getElementById("interaction-hint");
  if (sitHint) {
    sitHint.querySelector(".hint-desktop").textContent = "[E] stand up";
    sitHint.querySelector(".hint-touch").textContent = "tap to stand up";
    sitHint.classList.add("visible");
  }
}

function standUp() {
  isSitting = false;
  GROUND_Y = 1.7;
  camera.position.y = 1.7;
  var sitHint = document.getElementById("interaction-hint");
  if (sitHint) {
    sitHint.querySelector(".hint-desktop").textContent = "[E] toggle frames";
    sitHint.querySelector(".hint-touch").textContent = "tap to toggle frames";
    sitHint.classList.remove("visible");
  }
}

function checkBenchProximity() {
  if (isSitting) return;
  var px = camera.position.x, pz = camera.position.z;
  var closest = -1, closestDist = 2.5;
  for (var i = 0; i < benchPositions.length; i++) {
    var b = benchPositions[i];
    var d = Math.sqrt((px - b.x) * (px - b.x) + (pz - b.z) * (pz - b.z));
    if (d < closestDist) { closestDist = d; closest = i; }
  }
  nearBenchIdx = closest;
  var newHover = closest >= 0 && !buttonHovered;
  if (newHover !== benchHovered) {
    benchHovered = newHover;
    if (benchHovered) {
      var el = document.getElementById("interaction-hint");
      if (el) {
        el.querySelector(".hint-desktop").textContent = "[E] sit down";
        el.querySelector(".hint-touch").textContent = "tap to sit";
        el.classList.add("visible");
      }
    } else if (!buttonHovered) {
      var el2 = document.getElementById("interaction-hint");
      if (el2) {
        el2.querySelector(".hint-desktop").textContent = "[E] toggle frames";
        el2.querySelector(".hint-touch").textContent = "tap to toggle frames";
        el2.classList.remove("visible");
      }
    }
  }
}

function playButtonClick() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  var now = audioCtx.currentTime;
  var osc = audioCtx.createOscillator(); var gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(150, now + 0.04);
  gain.gain.setValueAtTime(0.08, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.06);
}

/* ── API calls ────────────────────────────────────────────────────────────── */
const RPC_URLS = [
  "https://eth.llamarpc.com", "https://ethereum.publicnode.com",
  "https://1rpc.io/eth", "https://eth.meowrpc.com",
];
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

async function rpcCall(method, params) {
  for (var i = 0; i < RPC_URLS.length; i++) {
    try {
      var res = await fetch(RPC_URLS[i], {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }),
      });
      var json = await res.json();
      if (json.result !== undefined) return json.result;
    } catch (e) {}
  }
  throw new Error("all RPCs failed");
}

function encodeOwnerOf(tokenId) {
  return "0x6352211e" + tokenId.toString(16).padStart(64, "0");
}

function encodeTryAggregate(calls) {
  var hex = "0xbce38bd7";
  hex += "0".repeat(64);
  hex += (64).toString(16).padStart(64, "0");
  hex += calls.length.toString(16).padStart(64, "0");
  var tupleHeadSize = calls.length * 32;
  var tupleBodies = "", offsets = "";
  for (var i = 0; i < calls.length; i++) {
    offsets += (tupleHeadSize + tupleBodies.length / 2).toString(16).padStart(64, "0");
    var body = calls[i].target.slice(2).padStart(64, "0");
    body += (64).toString(16).padStart(64, "0");
    var cd = calls[i].data.slice(2);
    body += (cd.length / 2).toString(16).padStart(64, "0");
    body += cd + "0".repeat((64 - (cd.length % 64)) % 64);
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
  var owned = [], addrLower = address.toLowerCase(), BATCH = 1000;
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
  try { var r = await fetch(NORMIES_API + "/normie/" + tokenId + "/canvas/info", { cache: "no-store" }); return r.ok ? await r.json() : {}; }
  catch (e) { return {}; }
}

async function fetchImageRGBA(tokenId) {
  var res = await fetch(NORMIES_API + "/normie/" + tokenId + "/image.png", { cache: "no-store" });
  if (!res.ok) throw new Error("image " + res.status);
  var bmp = await createImageBitmap(await res.blob());
  var oc = new OffscreenCanvas(GRID, GRID);
  var ctx = oc.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bmp, 0, 0, GRID, GRID);
  return ctx.getImageData(0, 0, GRID, GRID).data;
}

/* ── ENS resolver ─────────────────────────────────────────────────────────── */
async function resolveAddress(raw) {
  var v = raw.trim();
  if (!v) throw new Error("empty entry");
  if (/^0x[a-fA-F0-9]{40}$/i.test(v)) return v.toLowerCase();
  var res = await fetch("https://api.ensideas.com/ens/resolve/" + encodeURIComponent(v));
  if (!res.ok) throw new Error('could not resolve "' + v + '"');
  var data = await res.json();
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
function setStatus(msg, err) { statusEl.textContent = msg; statusEl.classList.toggle("error", !!err); }
function setBusy(b) { loadBtn.disabled = b; walletInput.disabled = b; }

/* ── Museum state ─────────────────────────────────────────────────────────── */
let inMuseum = false;
let mobileYaw = 0, mobilePitch = 0;

function enterMuseum() {
  inMuseum = true;
  overlayEl.classList.add("hidden");
  hudEl.classList.remove("hud-hidden");
  /* auto-start music */
  initMusic();
  if (!musicPlaying) {
    bgMusic.play().catch(function() {});
    musicPlaying = true;
    if (musicBtn) musicBtn.classList.add("music-active");
    var stateEl = $("musicState");
    if (stateEl) stateEl.textContent = "on";
  }
}

function exitMuseum() {
  if (controls) controls.unlock();
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
  /* stop music */
  if (bgMusic) { bgMusic.pause(); bgMusic.currentTime = 0; }
  musicPlaying = false;
  if (musicBtn) musicBtn.classList.remove("music-active");
  var stateEl = $("musicState");
  if (stateEl) stateEl.textContent = "off";

  inMuseum = false; currentRoomIdx = -1;
  isSitting = false; isJumping = false; jumpVelocity = 0; GROUND_Y = 1.7;
  overlayEl.classList.remove("hidden");
  hudEl.classList.add("hud-hidden");
  clearArt(); setStatus("");
  camera.position.set(0, 1.7, 2);
  camera.rotation.set(0, 0, 0);
  mobileYaw = 0; mobilePitch = 0;
  showLandingPage();
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

  try {
    var per = await Promise.all(addresses.map(fetchOwnedTokenIds));
    allTokenIds = [...new Set(per.flat())];
  } catch (e) { setStatus("wallet lookup failed: " + e.message, true); setBusy(false); return; }

  if (!allTokenIds.length) {
    setStatus("no normies found in " + (addresses.length > 1 ? "these wallets" : "this wallet") + ".");
    setBusy(false); return;
  }

  buildMuseum(allTokenIds.length);
  enterMuseum();
  if (!isTouch && controls) controls.lock();
  setBusy(false);

  var rc = rooms.length;
  setStatus(allTokenIds.length + " normies across " + rc + " room" + (rc > 1 ? "s" : ""));
  hudMetaEl.textContent = addresses.length === 1
    ? addresses[0].slice(0, 8) + "\u2026" + addresses[0].slice(-5) + " \u00b7 " + allTokenIds.length + " normies"
    : addresses.length + " wallets \u00b7 " + allTokenIds.length + " normies";

  currentRoomIdx = 0;
  loadRoomArt(0);
  if (rooms.length > 1) loadRoomArt(1);
}

/* ── Event listeners ──────────────────────────────────────────────────────── */
var landingEl = $("landing");
var footerEl  = $("landing-footer");
function showAboutPage() {
  landingEl.style.display = "none";
  footerEl.style.display = "none";
  aboutModal.classList.remove("about-hidden");
}
function showLandingPage() {
  aboutModal.classList.add("about-hidden");
  landingEl.style.display = "";
  footerEl.style.display = "";
}
aboutBtn.addEventListener("click", function(e) { e.preventDefault(); showAboutPage(); });
homeBtn.addEventListener("click", function(e) { e.preventDefault(); showLandingPage(); });
exitBtn.addEventListener("click", exitMuseum);
loadBtn.addEventListener("click", function() { loadMuseumForWallets(walletInput.value); });
walletInput.addEventListener("keydown", function(e) { if (e.key === "Enter") loadMuseumForWallets(walletInput.value); });
document.getElementById("interaction-hint").addEventListener("click", function(e) { e.stopPropagation(); pressButton(); });

/* ── Help tooltip ─────────────────────────────────────────────────────────── */
var helpBtn = $("helpBtn");
var helpPanel = $("helpPanel");
if (helpBtn && helpPanel) {
  helpBtn.addEventListener("click", function() { helpPanel.classList.toggle("visible"); });
}

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

/* ── Fullscreen ───────────────────────────────────────────────────────────── */
function toggleFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    var el = document.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
}
fullscreenBtn.addEventListener("click", toggleFullscreen);

/* ── Footstep audio ───────────────────────────────────────────────────────── */
var audioCtx = null;
var stepCooldown = 0;
var STEP_INTERVAL = 0.38, STEP_INTERVAL_SPRINT = 0.26;

function playFootstep() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  var now = audioCtx.currentTime;
  var osc = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  var filter = audioCtx.createBiquadFilter();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(60 + Math.random() * 30, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + 0.08);
  filter.type = "lowpass"; filter.frequency.setValueAtTime(200, now); filter.Q.setValueAtTime(0.7, now);
  gain.gain.setValueAtTime(0.06 * sfxVolume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
  osc.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
  osc.start(now); osc.stop(now + 0.12);
}

/* ── Background music ─────────────────────────────────────────────────────── */
var bgMusic = null, musicPlaying = false;
var musicBtn = $("musicBtn");
function initMusic() { if (bgMusic) return; bgMusic = new Audio("./bgmusic.mp3"); bgMusic.loop = true; bgMusic.volume = musicVolume; }
function toggleMusic() {
  initMusic();
  if (musicPlaying) { bgMusic.pause(); musicPlaying = false; }
  else { bgMusic.play().catch(function() {}); musicPlaying = true; }
  if (musicBtn) musicBtn.classList.toggle("music-active", musicPlaying);
  var stateEl = $("musicState");
  if (stateEl) stateEl.textContent = musicPlaying ? "on" : "off";
}
if (musicBtn) musicBtn.addEventListener("click", function(e) {
  var panel = $("audioPanel");
  if (panel) { panel.classList.toggle("visible"); e.stopPropagation(); }
});

/* ── Audio panel wiring ───────────────────────────────────────────────────── */
var audioPanelEl = $("audioPanel");
var musicToggleEl = $("musicToggleBtn");
var musicSlider = $("musicVolumeSlider");
var sfxSlider = $("sfxVolumeSlider");
if (musicToggleEl) musicToggleEl.addEventListener("click", toggleMusic);
if (musicSlider) {
  musicSlider.value = musicVolume * 100;
  musicSlider.addEventListener("input", function() {
    musicVolume = this.value / 100;
    if (bgMusic) bgMusic.volume = musicVolume;
  });
}
if (sfxSlider) {
  sfxSlider.value = sfxVolume * 100;
  sfxSlider.addEventListener("input", function() {
    sfxVolume = this.value / 100;
    if (slurpAudio) slurpAudio.volume = sfxVolume * 0.25;
  });
}
document.addEventListener("click", function(e) {
  if (audioPanelEl && audioPanelEl.classList.contains("visible")) {
    if (!audioPanelEl.contains(e.target) && e.target !== musicBtn) audioPanelEl.classList.remove("visible");
  }
});

/* ── Slurp sound near art ─────────────────────────────────────────────────── */
function initSlurp() { if (slurpAudio) return; slurpAudio = new Audio("./slurp.mp3"); slurpAudio.volume = sfxVolume * 0.25; }
function checkSlurpProximity(dt) {
  if (slurpCooldown > 0) { slurpCooldown -= dt; return; }
  var px = camera.position.x, pz = camera.position.z;
  for (var i = 0; i < artGroup.children.length; i++) {
    var a = artGroup.children[i];
    if (!a.userData || a.userData.revealT === undefined) continue;
    if (a.userData.revealing) continue;
    var dx = px - a.position.x, dz = pz - a.position.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d < SLURP_DISTANCE) {
      initSlurp();
      slurpAudio.currentTime = 0;
      slurpAudio.play().catch(function() {});
      slurpCooldown = SLURP_COOLDOWN;
      return;
    }
  }
}

/* ── Pointer lock (desktop) ───────────────────────────────────────────────── */
if (!isTouch && controls) {
  renderer.domElement.addEventListener("click", function() {
    if (!inMuseum) return;
    if (controls.isLocked) tryInteract(); else controls.lock();
  });
  controls.addEventListener("lock", function()   { document.body.classList.add("locked"); });
  controls.addEventListener("unlock", function() { document.body.classList.remove("locked"); });
}

/* ── Keyboard ─────────────────────────────────────────────────────────────── */
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
    if (e.code === "Space" && inMuseum && !isJumping && !isSitting) {
      e.preventDefault(); isJumping = true; jumpVelocity = JUMP_FORCE;
    }
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
    if (!inMuseum) return; e.preventDefault();
    for (var ti = 0; ti < e.changedTouches.length; ti++) {
      var t = e.changedTouches[ti];
      if (t.clientX < innerWidth * 0.45 && !joy.on) {
        joy.on = true; joy.id = t.identifier; joy.sx = t.clientX; joy.sy = t.clientY; joy.dx = 0; joy.dy = 0;
        $("joystick-base").style.opacity = "1"; joyUI(0, 0);
      } else if (t.clientX >= innerWidth * 0.45 && !look.on) {
        look.on = true; look.id = t.identifier; look.lx = t.clientX; look.ly = t.clientY;
      }
    }
  }, { passive: false });

  cnv.addEventListener("touchmove", function(e) {
    if (!inMuseum) return; e.preventDefault();
    for (var ti = 0; ti < e.changedTouches.length; ti++) {
      var t = e.changedTouches[ti];
      if (t.identifier === joy.id) {
        joy.dx = t.clientX - joy.sx; joy.dy = t.clientY - joy.sy;
        var r = Math.min(Math.hypot(joy.dx, joy.dy), JOY_R);
        var a = Math.atan2(joy.dy, joy.dx);
        joyUI(Math.cos(a) * r / JOY_R, Math.sin(a) * r / JOY_R);
      } else if (t.identifier === look.id) {
        mobileYaw -= (t.clientX - look.lx) * LOOK_SENS;
        mobilePitch = THREE.MathUtils.clamp(mobilePitch - (t.clientY - look.ly) * LOOK_SENS, -Math.PI / 2.8, Math.PI / 2.8);
        look.lx = t.clientX; look.ly = t.clientY;
      }
    }
  }, { passive: false });

  cnv.addEventListener("touchend", function(e) {
    for (var ti = 0; ti < e.changedTouches.length; ti++) {
      var t = e.changedTouches[ti];
      if (t.identifier === joy.id) {
        joy.on = false; joy.id = -1; joy.dx = 0; joy.dy = 0;
        $("joystick-base").style.opacity = "0.5"; joyUI(0, 0);
      } else if (t.identifier === look.id) { look.on = false; look.id = -1; }
    }
  }, { passive: false });
}

/* ── AABB collision ───────────────────────────────────────────────────────── */
function clampToWalkZones(px, pz) {
  for (var i = 0; i < walkZones.length; i++) {
    var z = walkZones[i];
    if (px >= z.minX && px <= z.maxX && pz >= z.minZ && pz <= z.maxZ) return { x: px, z: pz };
  }
  var bestDist = Infinity, bestX = px, bestZ = pz;
  for (var i = 0; i < walkZones.length; i++) {
    var z = walkZones[i];
    var cx = Math.max(z.minX, Math.min(z.maxX, px));
    var cz = Math.max(z.minZ, Math.min(z.maxZ, pz));
    var d = (cx - px) * (cx - px) + (cz - pz) * (cz - pz);
    if (d < bestDist) { bestDist = d; bestX = cx; bestZ = cz; }
  }
  return { x: bestX, z: bestZ };
}

/* ── Movement ─────────────────────────────────────────────────────────────── */
var vel = new THREE.Vector3(), dir = new THREE.Vector3();

function move(dt) {
  if (isSitting) return;
  var isMoving = false, isSprinting = false;

  if (isTouch) {
    camera.rotation.y = mobileYaw;
    camera.rotation.x = mobilePitch;
    if (joy.on) {
      var nx = THREE.MathUtils.clamp(joy.dx / JOY_R, -1, 1);
      var ny = THREE.MathUtils.clamp(joy.dy / JOY_R, -1, 1);
      var spd = 3.5;
      // ny negative = joystick up = forward (into -Z when yaw=0)
      var fwd = ny * spd * dt, right = nx * spd * dt;
      camera.position.x += Math.sin(mobileYaw) * fwd + Math.cos(mobileYaw) * right;
      camera.position.z += Math.cos(mobileYaw) * fwd - Math.sin(mobileYaw) * right;
      isMoving = Math.abs(nx) > 0.15 || Math.abs(ny) > 0.15;
    }
    var cl = clampToWalkZones(camera.position.x, camera.position.z);
    camera.position.x = cl.x; camera.position.z = cl.z;
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
    var cl2 = clampToWalkZones(p.x, p.z);
    p.x = cl2.x; p.z = cl2.z;
  }

  // Jump physics
  if (isJumping) {
    jumpVelocity += GRAVITY * dt;
    camera.position.y += jumpVelocity * dt;
    if (camera.position.y <= GROUND_Y) {
      camera.position.y = GROUND_Y;
      isJumping = false;
      jumpVelocity = 0;
    }
  } else {
    camera.position.y = GROUND_Y;
  }

  if (isMoving) {
    stepCooldown -= dt;
    if (stepCooldown <= 0) { playFootstep(); stepCooldown = isSprinting ? STEP_INTERVAL_SPRINT : STEP_INTERVAL; }
  } else { stepCooldown = 0; }
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
var roomCheckTimer = 0;
function animate() {
  requestAnimationFrame(animate);
  clock.update();
  var dt = Math.min(clock.getDelta(), 0.05);
  var shouldMove = isTouch ? inMuseum : (controls && controls.isLocked);
  if (shouldMove) move(dt);
  tickReveal(dt);
  checkButtonInteraction();
  checkBenchProximity();
  if (inMuseum) {
    roomCheckTimer += dt;
    if (roomCheckTimer > 0.5) { roomCheckTimer = 0; checkRoomLoading(); }
    checkSlurpProximity(dt);
  }
  renderer.render(scene, camera);
}
animate();

/* ── Resize ───────────────────────────────────────────────────────────────── */
window.addEventListener("resize", function() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
