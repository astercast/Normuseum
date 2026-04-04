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
const ROOM_W = 18, ROOM_H = 8.5;
const SLOT_SPACING = 4.2;

/* ── Multi-room layout ────────────────────────────────────────────────────── */
const NORMIES_PER_ROOM = 20;
const SHIFT_X          = ROOM_W + 8;
const CORR_Z           = 8;
const CORR_W           = 5.0;
const ROOM_PAD         = 6;

/* ── Room lifecycle (lazy loading) ────────────────────────────────────────── */
const ROOM_BUILD_RANGE  = 2;
const ROOM_ART_RANGE    = 1;
const ROOM_UNLOAD_RANGE = 3;

/* ── Frame toggle ─────────────────────────────────────────────────────────── */
let framesVisible = false;
let podiumBtnMesh = null;
let buttonHovered = false;
let btnAnimating = false;

/* ── Secret explode button ────────────────────────────────────────────────── */
var secretBtnMesh = null;
var secretBtnHovered = false;
var explodeActive = false;
var explodeParticles = [];  /* { mesh, vel, life } */
var explodeResetTimer = 0;

/* ── Hint auto-dismiss ────────────────────────────────────────────────────── */
var hintDismissTimer = 0;
var HINT_PERSIST = 4.0;  /* seconds before hint fades if still showing */

/* ── Jump physics ─────────────────────────────────────────────────────────── */
var jumpVelocity = 0;
var isJumping = false;
var GRAVITY = -12;
var JUMP_FORCE = 5.2;
var GROUND_Y = 1.7;

/* ── Bench sitting ────────────────────────────────────────────────────────── */
var isSitting = false;
var benchPositions = [];
var benchHovered = false;
var nearBenchIdx = -1;

/* ── Surface collision (stand on benches/podiums) ─────────────────────────── */
var surfaceBoxes = [];  /* { minX, maxX, minZ, maxZ, topY } */

/* ── Volume controls ──────────────────────────────────────────────────────── */
var musicVolume = 0.25;
var sfxVolume = 0.5;

/* ── Slurp sound ──────────────────────────────────────────────────────────── */
var slurpAudio = null;
var slurpCooldown = 0;
var SLURP_DISTANCE = 1.6;
var SLURP_COOLDOWN = 4;

/* ── Caches ────────────────────────────────────────────────────────────────── */
var imageCache    = new Map();  // tokenId → Uint8ClampedArray
var metaCache     = new Map();  // tokenId → JSON
var imageInFlight = new Map();  // tokenId → Promise — prevents concurrent duplicate fetches
var metaInFlight  = new Map();  // tokenId → Promise
var historyCache  = new Map();  // tokenId → { edits: [...] }

/* ── History animation state ──────────────────────────────────────────────── */
const NORMIES_ARCHIVE = "https://normiesarchive.xyz";
var historyAnims = [];   // active history animations: { tokenId, group, frames[], frameIdx, elapsed, interval }

/* ── Dragged normie physics ───────────────────────────────────────────────── */
var draggedArt = null;       /* the Three.js group being dragged */
var dragOffset = new THREE.Vector3(); /* offset from camera ray to art pivot */
var isDragging = false;
var dragVelocity = new THREE.Vector3();
var droppedArts = [];        /* { group, velocity, onGround } */

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

/* ── Selection overlay refs ───────────────────────────────────────────────── */
const selectionOverlay  = $("selection-overlay");
const selectionGrid     = $("selectionGrid");
const selectionCountEl  = $("selectionCount");
const selectionLoadBtn2 = $("selectionLoadBtn");
const selectionCancelBtn= $("selectionCancelBtn");

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
renderer.toneMappingExposure     = 0.78;
renderer.shadowMap.enabled       = true;
renderer.shadowMap.type          = THREE.PCFSoftShadowMap;

/* ── Scene ────────────────────────────────────────────────────────────────── */
const scene = new THREE.Scene();
scene.background = new THREE.Color("#ddd5c8");
scene.fog = new THREE.FogExp2("#ddd5c8", 0.012);

/* ── Environment map (warm studio for PBR reflections) ────────────────────── */
(function generateEnvironment() {
  var pmrem = new THREE.PMREMGenerator(renderer);
  var envScene = new THREE.Scene();
  envScene.background = new THREE.Color("#e8dfd2");
  var topLight = new THREE.DirectionalLight(0xfff8f0, 1.4);
  topLight.position.set(0, 10, 0);
  envScene.add(topLight);
  var sideLight = new THREE.DirectionalLight(0xffeedd, 0.65);
  sideLight.position.set(5, 3, 5);
  envScene.add(sideLight);
  envScene.add(new THREE.AmbientLight(0xffe8d0, 0.4));
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: "#ddd6cb" })
  );
  ground.rotation.x = -Math.PI / 2;
  envScene.add(ground);
  var envRT = pmrem.fromScene(envScene, 0, 0.1, 100);
  scene.environment = envRT.texture;
  pmrem.dispose();
})();

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
scene.add(new THREE.AmbientLight(0xfff2e8, 0.26));
const sun = new THREE.DirectionalLight(0xfff0dd, 0.28);
sun.position.set(5, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.001;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffe8d0, 0xb0a090, 0.18));

/* ── Shared materials (upgraded PBR) ──────────────────────────────────────── */
/* Palette: pale limestone walls, warm sand floor, dark slate accent, brushed brass trim */
const floorMat = new THREE.MeshPhysicalMaterial({
  color: "#c8bca4", roughness: 0.04, metalness: 0.06,
  clearcoat: 0.8, clearcoatRoughness: 0.06, reflectivity: 0.78,
});
const wallMat      = new THREE.MeshStandardMaterial({ color: "#ede8df", roughness: 0.92 });
const accentWallMat= new THREE.MeshStandardMaterial({ color: "#2a2824", roughness: 0.85 }); /* dark feature wall */
const panelMat     = new THREE.MeshStandardMaterial({ color: "#d6cdb8", roughness: 0.82 });
const ceilMat      = new THREE.MeshStandardMaterial({ color: "#f0ece4", roughness: 0.96 });
const mouldMat     = new THREE.MeshStandardMaterial({ color: "#b8b0a0", roughness: 0.35, metalness: 0.18 });
const baseMat      = new THREE.MeshStandardMaterial({ color: "#b0a890", roughness: 0.5,  metalness: 0.08 });
const frameMat     = new THREE.MeshStandardMaterial({ color: "#6a5c40", roughness: 0.22, metalness: 0.45 });
const backMat      = new THREE.MeshStandardMaterial({ color: "#f2ede4", roughness: 0.95 });
const placeMat     = new THREE.MeshStandardMaterial({ color: "#d8d0c4", roughness: 0.95 });
const benchMat     = new THREE.MeshStandardMaterial({ color: "#1c1814", roughness: 0.45, metalness: 0.24 });
const benchSeatMat = new THREE.MeshStandardMaterial({ color: "#f0ebe0", roughness: 0.55, metalness: 0.02 }); /* pale stone seat */
const corrFloorMat = new THREE.MeshPhysicalMaterial({
  color: "#b4a888", roughness: 0.04, metalness: 0.1,
  clearcoat: 0.7, clearcoatRoughness: 0.06, reflectivity: 0.78,
});
const archMat  = new THREE.MeshStandardMaterial({ color: "#c4bca8", roughness: 0.42, metalness: 0.14 });
const inlayMat = new THREE.MeshStandardMaterial({ color: "#8c7c5c", roughness: 0.08, metalness: 0.48 }); /* brass inlay */
const beamMat  = new THREE.MeshStandardMaterial({ color: "#e8e2d8", roughness: 0.78, metalness: 0.02 });
const trimMat  = new THREE.MeshStandardMaterial({ color: "#a09080", roughness: 0.28, metalness: 0.38 }); /* brushed brass */
const trackMat = new THREE.MeshStandardMaterial({ color: "#222018", roughness: 0.32, metalness: 0.72 }); /* matte black track */
const pedestalMat = new THREE.MeshPhysicalMaterial({ color: "#d8d0c4", roughness: 0.18, metalness: 0.04,
  clearcoat: 0.6, clearcoatRoughness: 0.12 }); /* pale marble pedestal */

/* ── Shared geometries (reduces GC churn) ─────────────────────────────────── */
const sharedVoxelGeo = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
const sharedPlaceholderGeo = new THREE.BoxGeometry(2.32, 2.32, 0.04);

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
    /* 4-wall layout:
       - long walls (left + right) share most slots: slotsPerSide each
       - end walls (front + back) cap at 2 each
       Solve: 2*slotsPerSide + 2*slotsPerEnd = count
       Use: slotsPerEnd = min(2, floor(count/8)), slotsPerSide = ceil((count - 2*slotsPerEnd)/2) */
    var slotsPerEnd  = Math.min(2, Math.floor(count / 8));
    var slotsPerSide = Math.ceil((count - slotsPerEnd * 2) / 2);
    /* roomLen driven by the long-wall slots */
    var roomLen = Math.max(slotsPerSide * SLOT_SPACING + ROOM_PAD * 2,
                           slotsPerEnd  * SLOT_SPACING + ROOM_PAD * 2 + 4);
    var cx = (ri % 2 === 0) ? 0 : SHIFT_X;
    var zStart = zCursor;
    var zEnd = zCursor - roomLen;

    rooms.push({
      cx: cx, zStart: zStart, zEnd: zEnd, roomLen: roomLen,
      slotsPerSide: slotsPerSide, slotsPerEnd: slotsPerEnd,
      slotOffset: slotsUsed, slotCount: count,
      built: false, loaded: false, loading: false, prefetching: false, _loadToken: null,
      group: null, corridorGroup: null, artSlots: [],
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

      walkZones.push({ minX: cx - CORR_W / 2, maxX: cx + CORR_W / 2, minZ: corrZMid - 1, maxZ: zEnd + 1 });
      var segMinX = Math.min(cx, nextCx) - CORR_W / 2;
      var segMaxX = Math.max(cx, nextCx) + CORR_W / 2;
      walkZones.push({ minX: segMinX, maxX: segMaxX, minZ: corrZMid - CORR_W / 2, maxZ: corrZMid + CORR_W / 2 });
      walkZones.push({ minX: nextCx - CORR_W / 2, maxX: nextCx + CORR_W / 2, minZ: nextZStart - 1, maxZ: corrZMid + 1 });

      zCursor = nextZStart;
    }
  }
}

/* ── Shared sky texture ───────────────────────────────────────────────────── */
var skyTexture = null;
function getSkyTexture() {
  if (skyTexture) return skyTexture;
  var W = 1024, H = 512;
  var c = document.createElement("canvas");
  c.width = W; c.height = H;
  var ctx = c.getContext("2d");

  /* Deep atmospheric sky gradient — deep cobalt → cerulean → warm champagne at horizon */
  var grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, "#1a5f9e");  /* deep cobalt zenith */
  grad.addColorStop(0.30, "#3485c8");  /* cerulean */
  grad.addColorStop(0.65, "#72b8e0");  /* sky blue mid */
  grad.addColorStop(0.88, "#b0d8f0");  /* pale atmospheric */
  grad.addColorStop(1.00, "#e8d8b8");  /* warm champagne horizon */
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

  /* Sun glow near horizon */
  var sunGrad = ctx.createRadialGradient(W * 0.72, H * 0.92, 0, W * 0.72, H * 0.92, H * 0.4);
  sunGrad.addColorStop(0.0, "rgba(255,235,180,0.55)");
  sunGrad.addColorStop(0.5, "rgba(255,220,140,0.18)");
  sunGrad.addColorStop(1.0, "rgba(255,200,100,0.00)");
  ctx.fillStyle = sunGrad; ctx.fillRect(0, 0, W, H);

  /* Realistic cumulus clouds — layered, soft */
  function cloud(x, y, scale, alpha) {
    ctx.save();
    var cg = ctx.createRadialGradient(x, y, 0, x, y, 90 * scale);
    cg.addColorStop(0.0, "rgba(255,253,248," + alpha + ")");
    cg.addColorStop(0.6, "rgba(240,245,250," + (alpha * 0.7) + ")");
    cg.addColorStop(1.0, "rgba(220,235,248,0)");
    ctx.fillStyle = cg;
    [
      [x,      y,      90*scale, 55*scale],
      [x-70*scale, y+12*scale, 70*scale, 48*scale],
      [x+65*scale, y+8*scale,  60*scale, 44*scale],
      [x-30*scale, y-20*scale, 60*scale, 40*scale],
      [x+30*scale, y-15*scale, 55*scale, 38*scale],
      [x-110*scale,y+20*scale, 50*scale, 36*scale],
      [x+110*scale,y+18*scale, 48*scale, 34*scale],
    ].forEach(function(e) {
      ctx.beginPath(); ctx.ellipse(e[0], e[1], e[2], e[3], 0, 0, Math.PI*2); ctx.fill();
    });
    /* Shadow belly */
    var sg = ctx.createLinearGradient(x, y - 40*scale, x, y + 60*scale);
    sg.addColorStop(0, "rgba(0,0,0,0)");
    sg.addColorStop(1, "rgba(140,155,175," + (alpha * 0.3) + ")");
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(x, y + 20*scale, 80*scale, 40*scale, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
  cloud(160,  95,  1.0, 0.92);
  cloud(580, 105,  0.9, 0.88);
  cloud(860,  80,  0.7, 0.84);
  cloud(380,  68,  0.6, 0.80);
  cloud(750, 150,  0.5, 0.76);
  cloud(100, 170,  0.4, 0.70);
  cloud(960, 185,  0.45,0.68);

  /* High cirrus wisps */
  ctx.globalAlpha = 0.32;
  ctx.strokeStyle = "rgba(240,248,255,0.7)";
  ctx.lineWidth = 3;
  [[50,40,260,55],[300,28,180,42],[520,18,240,36],[720,32,160,28],[880,22,200,40]].forEach(function(l) {
    ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.quadraticCurveTo(l[0]+l[2]*0.5, l[1]-8, l[0]+l[2], l[3]);
    ctx.stroke();
  });
  ctx.globalAlpha = 1.0;

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

  /* ── Floor (polished limestone) ── */
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, room.roomLen), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, zMid); floor.receiveShadow = true;
  g.add(floor);

  /* Brass border inlay — perimeter rectangle */
  var borderInset = 0.55;
  [
    [cx, room.zStart - borderInset, ROOM_W - borderInset * 2, 0.035],  /* top edge */
    [cx, room.zEnd   + borderInset, ROOM_W - borderInset * 2, 0.035],  /* bottom edge */
  ].forEach(function(p) {
    var s = new THREE.Mesh(new THREE.PlaneGeometry(p[2], p[3]), inlayMat);
    s.rotation.x = -Math.PI / 2; s.position.set(p[0], 0.004, p[1]); g.add(s);
  });
  [
    [cx - WALL_X + borderInset, zMid, 0.035, room.roomLen - borderInset * 2], /* left edge */
    [cx + WALL_X - borderInset, zMid, 0.035, room.roomLen - borderInset * 2], /* right edge */
  ].forEach(function(p) {
    var s = new THREE.Mesh(new THREE.PlaneGeometry(p[2], p[3]), inlayMat);
    s.rotation.x = -Math.PI / 2; s.position.set(p[0], 0.004, p[1]); g.add(s);
  });
  /* Centre diamond cross */
  var cLine1 = new THREE.Mesh(new THREE.PlaneGeometry(0.025, room.roomLen - borderInset * 2 - 0.1), inlayMat);
  cLine1.rotation.x = -Math.PI / 2; cLine1.position.set(cx, 0.004, zMid); g.add(cLine1);
  var cLine2 = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W - borderInset * 2 - 0.1, 0.025), inlayMat);
  cLine2.rotation.x = -Math.PI / 2; cLine2.position.set(cx, 0.004, zMid); g.add(cLine2);

  /* ── Ceiling ── */
  var ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, room.roomLen), ceilMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, ROOM_H, zMid); g.add(ceil);

  /* ── Side walls — clean white gallery walls ── */
  var wallGeo = new THREE.PlaneGeometry(room.roomLen, ROOM_H);
  var lw = new THREE.Mesh(wallGeo, wallMat);
  lw.rotation.y = Math.PI / 2; lw.position.set(cx - WALL_X, ROOM_H / 2, zMid); lw.receiveShadow = true; g.add(lw);
  var rw = new THREE.Mesh(wallGeo, wallMat);
  rw.rotation.y = -Math.PI / 2; rw.position.set(cx + WALL_X, ROOM_H / 2, zMid); rw.receiveShadow = true; g.add(rw);

  /* ── End walls ── */
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

  /* ── Thin baseboard — subtle, doesn't interfere with art ── */
  [-WALL_X + 0.025, WALL_X - 0.025].forEach(function(x) {
    var sk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, room.roomLen + 0.1), baseMat);
    sk.position.set(cx + x, 0.075, zMid); g.add(sk);
  });

  /* ── Museum ceiling wash lighting — even diffused downlights ── */
  var washCount = Math.max(2, Math.floor(room.roomLen / 5));
  for (var wi = 0; wi < washCount; wi++) {
    var wz = room.zStart - 2 - wi * ((room.roomLen - 4) / Math.max(1, washCount - 1));
    /* Recessed downlight housing */
    var housing = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.06, 16), trackMat);
    housing.position.set(cx - WALL_X + 2.0, ROOM_H - 0.03, wz); g.add(housing);
    var housing2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.06, 16), trackMat);
    housing2.position.set(cx + WALL_X - 2.0, ROOM_H - 0.03, wz); g.add(housing2);
    /* Warm wash spots aimed at the walls — wider, softer angle */
    var leftWallX  = cx - WALL_X + 0.12;
    var rightWallX = cx + WALL_X - 0.12;
    var spotL = new THREE.SpotLight(0xfff4e8, 3.2, 12, Math.PI / 5.5, 0.55, 1.2);
    spotL.position.set(cx - WALL_X + 2.0, ROOM_H - 0.1, wz);
    spotL.target.position.set(leftWallX, 3.2, wz);
    g.add(spotL); g.add(spotL.target);
    var spotR = new THREE.SpotLight(0xfff4e8, 3.2, 12, Math.PI / 5.5, 0.55, 1.2);
    spotR.position.set(cx + WALL_X - 2.0, ROOM_H - 0.1, wz);
    spotR.target.position.set(rightWallX, 3.2, wz);
    g.add(spotR); g.add(spotR.target);
  }

  /* ── Ceiling ambient — soft even fill from above ── */
  var ambCount = Math.max(1, Math.floor(room.roomLen / 10));
  for (var ami = 0; ami < ambCount; ami++) {
    var az = room.zStart - ROOM_PAD - (ami + 0.5) * ((room.roomLen - ROOM_PAD * 2) / ambCount);
    var ambLight = new THREE.PointLight(0xfff8f0, 0.45, 22);
    ambLight.position.set(cx, ROOM_H - 0.15, az); g.add(ambLight);
  }

  /* ── Bench — ebonised steel + stone seat ── */
  if (room.slotsPerSide >= 3) {
    var bench = buildBench(); bench.position.set(cx, 0, zMid); g.add(bench);
    /* Bench surface collision box (seat top at y ≈ 0.52) */
    surfaceBoxes.push({ minX: cx - 1.01, maxX: cx + 1.01, minZ: zMid - 0.27, maxZ: zMid + 0.27, topY: 0.52 + 1.7 });
    /* Second bench further back for large rooms */
    if (room.roomLen > 22) {
      var bench2 = buildBench(); var bz2 = zMid - room.roomLen * 0.22;
      bench2.position.set(cx, 0, bz2); g.add(bench2);
      surfaceBoxes.push({ minX: cx - 1.01, maxX: cx + 1.01, minZ: bz2 - 0.27, maxZ: bz2 + 0.27, topY: 0.52 + 1.7 });
    }
  }

  /* ── Room number plaque — mounted near entrance top-right ── */
  var roomCanvas = document.createElement("canvas");
  roomCanvas.width = 256; roomCanvas.height = 80;
  var rctx = roomCanvas.getContext("2d");
  rctx.clearRect(0, 0, 256, 80);
  /* Pale stone background */
  rctx.fillStyle = "#e8e0d2"; rctx.fillRect(0, 0, 256, 80);
  /* Top brass rule */
  rctx.fillStyle = "#9e8c5c"; rctx.fillRect(10, 10, 236, 3);
  /* Bottom brass rule */
  rctx.fillStyle = "#9e8c5c"; rctx.fillRect(10, 67, 236, 3);
  rctx.fillStyle = "#3a3830";
  rctx.font = '600 24px "IBM Plex Mono", monospace';
  rctx.textAlign = "center";
  rctx.fillText("GALLERY " + (ri + 1), 128, 48);
  var roomTex = new THREE.CanvasTexture(roomCanvas);
  roomTex.colorSpace = THREE.SRGBColorSpace;
  var plaqueBacking = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.5, 0.025),
    new THREE.MeshStandardMaterial({ color: "#d8cfc0", roughness: 0.35, metalness: 0.12 })
  );
  plaqueBacking.position.set(cx + WALL_X - 1.8, 5.2, room.zStart - 0.04);
  plaqueBacking.rotation.y = Math.PI; g.add(plaqueBacking);
  var roomSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.44, 0.44),
    new THREE.MeshBasicMaterial({ map: roomTex, transparent: false })
  );
  roomSign.position.set(cx + WALL_X - 1.8, 5.2, room.zStart - 0.028);
  roomSign.rotation.y = Math.PI; g.add(roomSign);

  /* ── Art slot positions — all 4 walls ── */
  room.artSlots = [];
  var WO = ROOM_W / 2;
  var slotZStart = room.zStart - ROOM_PAD;
  /* Left wall (x = cx - WO + 0.05) and Right wall (x = cx + WO - 0.05) */
  for (var i = 0; i < room.slotsPerSide; i++) {
    var z = slotZStart - i * SLOT_SPACING;
    room.artSlots.push({ pos: new THREE.Vector3(cx - WO + 0.05, 3.2, z), ry: Math.PI / 2 });
    room.artSlots.push({ pos: new THREE.Vector3(cx + WO - 0.05, 3.2, z), ry: -Math.PI / 2 });
  }
  /* End walls — only use solid walls (no doorway).
     Front wall (zStart) is solid only for room 0.
     Back wall (zEnd) is solid only for the last room. */
  if (room.slotsPerEnd > 0) {
    var endSlotSpacing = SLOT_SPACING;
    var endTotalW = (room.slotsPerEnd - 1) * endSlotSpacing;
    for (var ei = 0; ei < room.slotsPerEnd; ei++) {
      var ex = cx - endTotalW / 2 + ei * endSlotSpacing;
      if (ri === 0) {
        /* Solid front wall — face into the room */
        room.artSlots.push({ pos: new THREE.Vector3(ex, 3.2, room.zStart - 0.05), ry: Math.PI });
      }
      if (ri === rooms.length - 1) {
        /* Solid back wall — face into the room */
        room.artSlots.push({ pos: new THREE.Vector3(ex, 3.2, room.zEnd + 0.05), ry: 0 });
      }
      /* For middle rooms, place on a side-panel next to the doorway lintel where there's solid wall */
      if (ri > 0 && ri < rooms.length - 1) {
        var doorW = CORR_W + 0.2;
        var panelX = cx - (doorW / 2 + ART_W / 2 + 0.3);
        if (ei === 0) room.artSlots.push({ pos: new THREE.Vector3(panelX, 3.2, room.zStart - 0.05), ry: Math.PI });
        else room.artSlots.push({ pos: new THREE.Vector3(cx + (doorW / 2 + ART_W / 2 + 0.3), 3.2, room.zStart - 0.05), ry: Math.PI });
      }
    }
  }

  /* ── Podium with red button in EVERY room ── */
  var podium = buildPodium(ri);
  var podX = cx + WALL_X * 0.35, podZ = room.zStart - 2.8;
  podium.position.set(podX, 0, podZ);
  g.add(podium);
  /* Register the button mesh for this room's podium */
  if (ri === 0) podiumBtnMesh = podium.userData.btnMesh;
  /* Podium surface collision box (top at y ≈ 1.08) */
  surfaceBoxes.push({ minX: podX - 0.36, maxX: podX + 0.36, minZ: podZ - 0.36, maxZ: podZ + 0.36, topY: 1.08 + 1.7 });

  /* ── Decorative fruit pedestals — apple and/or orange ── */
  var fruitPedestals = buildFruitPedestals(ri, cx, room.zStart, room.zEnd, WALL_X);
  fruitPedestals.forEach(function(fp) {
    g.add(fp.group);
    surfaceBoxes.push({ minX: fp.x - 0.36, maxX: fp.x + 0.36, minZ: fp.z - 0.36, maxZ: fp.z + 0.36, topY: 1.08 + 1.7 });
  });

  /* ── Secret explode button — room 0 only, in a corner ── */
  if (ri === 0) {
    var sBtn = buildSecretButton();
    /* Place in back-left corner, protruding slightly from wall */
    var sbx = cx - WALL_X + 0.018, sbz = room.zStart - 1.2;
    sBtn.position.set(sbx, 1.4, sbz);
    sBtn.rotation.y = -Math.PI / 2;  /* faces into room */
    g.add(sBtn);
    secretBtnMesh = sBtn.userData.btnMesh;
  }

  galleryGroup.add(g);

  /* Build corridor leading INTO this room */
  if (ri > 0 && !room.corridorGroup) {
    buildCorridor(ri - 1);
  }
}

/* ── Unload room geometry + art ───────────────────────────────────────────── */
function unloadRoom(ri) {
  var room = rooms[ri];
  if (!room.built) return;

  if (room.group) {
    galleryGroup.remove(room.group);
    room.group.traverse(function(ch) {
      if (ch.isMesh || ch.isInstancedMesh) {
        if (ch.geometry !== sharedVoxelGeo && ch.geometry !== sharedPlaceholderGeo) {
          ch.geometry?.dispose();
        }
        [].concat(ch.material).forEach(function(m) {
          if (m && !isSharedMaterial(m)) m.dispose();
        });
      }
      if (ch.isLight && ch.dispose) ch.dispose();
    });
    room.group = null;
  }

  if (room.corridorGroup) {
    galleryGroup.remove(room.corridorGroup);
    room.corridorGroup.traverse(function(ch) {
      if (ch.isMesh) {
        if (ch.geometry !== sharedVoxelGeo && ch.geometry !== sharedPlaceholderGeo) {
          ch.geometry?.dispose();
        }
        [].concat(ch.material).forEach(function(m) {
          if (m && !isSharedMaterial(m)) m.dispose();
        });
      }
      if (ch.isLight && ch.dispose) ch.dispose();
    });
    room.corridorGroup = null;
  }

  unloadRoomArt(ri);

  /* Clear podiumBtnMesh if it belonged to this room */
  if (podiumBtnMesh && podiumBtnMesh.userData && podiumBtnMesh.userData.roomIdx === ri) {
    podiumBtnMesh = null;
  }
  /* Clear secretBtnMesh if room 0 was unloaded */
  if (ri === 0) secretBtnMesh = null;

  room.built = false;
  room.artSlots = [];
  room.prefetching = false; /* allow prefetch again if room is rebuilt */
}

var sharedMats = [floorMat, wallMat, accentWallMat, panelMat, ceilMat, mouldMat, baseMat,
  frameMat, backMat, placeMat, benchMat, benchSeatMat, corrFloorMat,
  archMat, inlayMat, beamMat, trimMat, trackMat, pedestalMat];
function isSharedMaterial(m) {
  return sharedMats.indexOf(m) >= 0;
}

function unloadRoomArt(ri) {
  var room = rooms[ri];
  if (!room.loaded && !room.loading) return;
  room.loading = false;
  room._loadToken = null;  /* invalidate any running loadRoomArt coroutine for this room */

  var toRemove = [];
  for (var i = 0; i < artGroup.children.length; i++) {
    var c = artGroup.children[i];
    if (c.userData && c.userData.roomIdx === ri) toRemove.push(c);
  }
  for (var j = 0; j < toRemove.length; j++) {
    artGroup.remove(toRemove[j]); dispose(toRemove[j]);
  }
  room.loaded = false;
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

  /* Archway trim */
  [-doorW / 2, doorW / 2].forEach(function(dx) {
    var post = new THREE.Mesh(new THREE.BoxGeometry(0.14, doorH, 0.14), archMat);
    post.position.set(cx + dx, doorH / 2, z); parent.add(post);
  });
  var lintTrim = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.28, 0.16, 0.14), archMat);
  lintTrim.position.set(cx, doorH, z); parent.add(lintTrim);
  var keystone = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.16), archMat);
  keystone.position.set(cx, doorH + 0.08, z); parent.add(keystone);
}

/* ── Build corridor ───────────────────────────────────────────────────────── */
function buildCorridor(ri) {
  var room = rooms[ri], next = rooms[ri + 1];
  if (!next) return;
  if (next.corridorGroup) return;
  var g = new THREE.Group();
  next.corridorGroup = g;
  var z1 = room.zEnd, z2 = next.zStart;
  var cx1 = room.cx, cx2 = next.cx;
  var zMid = (z1 + z2) / 2;

  addCorridorSegment(g, cx1, (z1 + zMid) / 2, CORR_W, Math.abs(z1 - zMid) + 1);
  if (Math.abs(cx2 - cx1) > 0.1) {
    addCorridorCross(g, (cx1 + cx2) / 2, zMid, Math.abs(cx2 - cx1) + CORR_W, CORR_W);
  }
  addCorridorSegment(g, cx2, (zMid + z2) / 2, CORR_W, Math.abs(zMid - z2) + 1);

  /* Single corridor light */
  var corrLight = new THREE.PointLight(0xffe8c8, 0.22, 14);
  corrLight.position.set((cx1 + cx2) / 2, ROOM_H - 0.2, zMid);
  g.add(corrLight);

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
}

function addCorridorCross(parent, cx, zMid, w, h) {
  var f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), corrFloorMat);
  f.rotation.x = -Math.PI / 2; f.position.set(cx, 0.001, zMid); f.receiveShadow = true; parent.add(f);
  var c = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ceilMat);
  c.rotation.x = Math.PI / 2; c.position.set(cx, ROOM_H, zMid); parent.add(c);
  var wallGeo = new THREE.PlaneGeometry(w, ROOM_H);
  var fw = new THREE.Mesh(wallGeo, wallMat); fw.position.set(cx, ROOM_H / 2, zMid - h / 2); parent.add(fw);
  var bw = new THREE.Mesh(wallGeo, wallMat); bw.rotation.y = Math.PI; bw.position.set(cx, ROOM_H / 2, zMid + h / 2); parent.add(bw);
}

/* ── Bench — ebonised steel frame, pale stone upholstered seat ──────────── */
function buildBench() {
  var g = new THREE.Group();
  /* Seat cushion */
  var seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.07, 0.52), benchSeatMat);
  seat.position.y = 0.48; seat.castShadow = true; seat.receiveShadow = true; g.add(seat);
  /* Seat chamfer edge (thin dark strip) */
  var edge = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.04, 0.54), benchMat);
  edge.position.y = 0.445; g.add(edge);
  /* Four legs — square tube profile */
  [[-0.9, -0.2], [-0.9, 0.2], [0.9, -0.2], [0.9, 0.2]].forEach(function(p) {
    var leg = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.42, 0.055), benchMat);
    leg.position.set(p[0], 0.21, p[1]); leg.castShadow = true; g.add(leg);
  });
  /* Low H-frame stretcher */
  var stretcherH = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.04, 0.04), benchMat);
  stretcherH.position.set(0, 0.13, 0); g.add(stretcherH);
  var stretcherL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.36), benchMat);
  stretcherL.position.set(-0.86, 0.13, 0); g.add(stretcherL);
  var stretcherR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.36), benchMat);
  stretcherR.position.set(0.86, 0.13, 0); g.add(stretcherR);
  return g;
}

/* ── Pedestal — pale travertine column ───────────────────────────────────── */
function buildPedestal() {
  var g = new THREE.Group();
  /* Cap */
  var cap = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.04, 0.58), pedestalMat);
  cap.position.y = 1.12; g.add(cap);
  /* Shaft with slight taper */
  var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 1.08, 32), pedestalMat);
  shaft.position.y = 0.56; g.add(shaft);
  /* Base plinth */
  var base = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 0.56), pedestalMat);
  base.position.y = 0.03; g.add(base);
  return g;
}

/* ── Build museum (lazy — only plans layout + builds starting rooms) ──────── */
function buildMuseum(totalCount) {
  while (galleryGroup.children.length) {
    var c = galleryGroup.children[0]; galleryGroup.remove(c);
    c.traverse(function(ch) {
      if (ch.isMesh || ch.isInstancedMesh) {
        if (ch.geometry !== sharedVoxelGeo && ch.geometry !== sharedPlaceholderGeo) {
          ch.geometry?.dispose();
        }
      }
      if (ch.isLight && ch.dispose) ch.dispose();
    });
  }
  clearArt();
  benchPositions = [];
  surfaceBoxes = [];
  droppedArts = [];
  podiumBtnMesh = null;
  secretBtnMesh = null;
  explodeActive = false; explodeResetTimer = 0;
  explodeParticles.forEach(function(p) { scene.remove(p.mesh); dispose(p.mesh); });
  explodeParticles = [];
  planLayout(totalCount);

  /* Only build rooms 0 and 1 upfront — the rest are built lazily */
  buildRoom(0);
  if (rooms.length > 1) buildRoom(1);

  if (rooms.length) camera.position.set(rooms[0].cx, 1.7, rooms[0].zStart - 2);
}

/* ── Label texture ────────────────────────────────────────────────────────── */
function makeLabelTex(tokenId, type, ap) {
  /* Museum card — wider, elegant, with brass rule accent */
  var c = document.createElement("canvas");
  c.width = 640; c.height = 96;
  var ctx = c.getContext("2d");
  /* Warm linen background */
  ctx.fillStyle = "#f0ebe0"; ctx.fillRect(0, 0, 640, 96);
  /* Left brass rule accent */
  ctx.fillStyle = "#9e8c5c"; ctx.fillRect(0, 0, 4, 96);
  /* Light top rule */
  ctx.fillStyle = "rgba(158,140,92,0.4)"; ctx.fillRect(18, 12, 604, 1);
  /* Bottom rule */
  ctx.fillStyle = "rgba(158,140,92,0.4)"; ctx.fillRect(18, 82, 604, 1);
  /* Title — normie ID */
  ctx.fillStyle = "#2a2820";
  ctx.font = '600 28px "IBM Plex Mono", monospace';
  ctx.fillText("normie #" + tokenId, 20, 44);
  /* Sub-line — type · ap */
  ctx.fillStyle = "#8a826e";
  ctx.font = '400 20px "IBM Plex Mono", monospace';
  ctx.fillText([type, ap ? ap + " ap" : null].filter(Boolean).join(" \u00b7 "), 20, 74);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ── Build voxel artwork (no per-art light) ───────────────────────────────── */
function buildVoxelArtwork(tokenId, rgbaData, meta, roomIdx) {
  var group = new THREE.Group();
  group.userData.roomIdx = roomIdx;

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
    var mat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.06, vertexColors: true });
    var inst = new THREE.InstancedMesh(sharedVoxelGeo, mat, voxels.length);
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

  /* Flat painting for framed mode */
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

  /* History button for customized (edited) normies */
  if (meta.customized) {
    var hBtn = buildHistoryBtn(tokenId);
    hBtn.position.set(0, -(ART_H / 2 + 0.62), 0.01);
    hBtn.userData.isHistoryBtn = true;
    hBtn.userData.historyTokenId = tokenId;
    group.add(hBtn);
    group.userData.hasHistory = true;
    group.userData.tokenId = tokenId;
  }

  group.userData.revealT = 0;
  group.userData.revealing = true;
  group.scale.set(0.001, 0.001, 0.001);
  return group;
}

/* ── Placeholder / dispose ────────────────────────────────────────────────── */
function buildPlaceholder(roomIdx) {
  var g = new THREE.Group();
  g.userData.roomIdx = roomIdx;
  g.add(new THREE.Mesh(sharedPlaceholderGeo, placeMat));
  return g;
}

function dispose(obj) {
  if (!obj) return;
  obj.traverse(function(c) {
    if (c.isMesh || c.isInstancedMesh) {
      if (c.geometry !== sharedVoxelGeo && c.geometry !== sharedPlaceholderGeo) {
        c.geometry?.dispose();
      }
      [].concat(c.material).forEach(function(m) {
        if (m && !isSharedMaterial(m)) {
          /* Three.js material.dispose() does NOT auto-dispose texture maps — do it manually */
          if (m.map) m.map.dispose();
          if (m.emissiveMap) m.emissiveMap.dispose();
          if (m.alphaMap) m.alphaMap.dispose();
          m.dispose();
        }
      });
    }
  });
}
function clearArt() {
  /* Stop all running history animations first */
  while (historyAnims.length) stopHistoryAnim(0);
  while (artGroup.children.length) {
    var c = artGroup.children[artGroup.children.length - 1]; artGroup.remove(c); dispose(c);
  }
  rooms.forEach(function(r) { r.loaded = false; r.loading = false; });
}

/* ── Frame yield helper ────────────────────────────────────────────────────── */
function yieldToFrame() {
  return new Promise(function(resolve) { requestAnimationFrame(resolve); });
}

/* ── History: fetch all version frame images as RGBA arrays ───────────────── */
async function fetchHistoryFrames(tokenId) {
  try {
    var r = await fetch(NORMIES_ARCHIVE + "/api/normie/" + tokenId + "/frames");
    if (!r.ok) return null;
    var data = await r.json();
    if (!data || !data.frames || data.frames.length < 2) return null;
    /* Each frame: { version, pixels } where pixels is base64-encoded 40×40 RGBA (6400 bytes) */
    var frames = [];
    for (var fi = 0; fi < data.frames.length; fi++) {
      try {
        var b64 = data.frames[fi].pixels;
        var bin = atob(b64);
        var arr = new Uint8ClampedArray(bin.length);
        for (var bi = 0; bi < bin.length; bi++) arr[bi] = bin.charCodeAt(bi);
        frames.push(arr);
      } catch (e) { /* skip bad frame */ }
    }
    return frames.length > 1 ? frames : null;
  } catch (e) { return null; }
}

/* ── History: build a small "play history" button mesh ────────────────────── */
function buildHistoryBtn(tokenId) {
  var group = new THREE.Group();
  group.userData.isHistoryBtn = true;
  group.userData.historyTokenId = tokenId;

  /* Pill-shaped backdrop */
  var bg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 0.18),
    new THREE.MeshStandardMaterial({ color: "#2a2820", roughness: 0.45, metalness: 0.1 })
  );
  group.add(bg);

  /* Play triangle icon */
  var triShape = new THREE.Shape();
  triShape.moveTo(-0.028, -0.035);
  triShape.lineTo(-0.028, 0.035);
  triShape.lineTo(0.032, 0);
  triShape.closePath();
  var triGeo = new THREE.ShapeGeometry(triShape);
  var tri = new THREE.Mesh(triGeo, new THREE.MeshBasicMaterial({ color: "#f0ebe0" }));
  tri.position.set(-0.14, 0, 0.001);
  group.add(tri);

  /* "history" text label */
  var labelCanvas = document.createElement("canvas");
  labelCanvas.width = 128; labelCanvas.height = 32;
  var lctx = labelCanvas.getContext("2d");
  lctx.clearRect(0, 0, 128, 32);
  lctx.fillStyle = "#e8e0d2";
  lctx.font = '500 18px "IBM Plex Mono", monospace';
  lctx.textAlign = "left";
  lctx.textBaseline = "middle";
  lctx.fillText("history", 4, 16);
  var labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  var labelMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.08),
    new THREE.MeshBasicMaterial({ map: labelTex, transparent: true })
  );
  labelMesh.position.set(0.06, 0, 0.001);
  group.add(labelMesh);

  return group;
}

/* ── History: create voxel mesh from RGBA data (same logic as main artwork) ── */
function buildVoxelFrame(rgbaData) {
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
  if (!voxels.length) return null;
  var mat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.06, vertexColors: true });
  var inst = new THREE.InstancedMesh(sharedVoxelGeo, mat, voxels.length);
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
  return inst;
}

/* ── History: build a flat plane from RGBA data ───────────────────────────── */
function buildFlatFrame(rgbaData) {
  var c = document.createElement("canvas");
  c.width = GRID; c.height = GRID;
  var ctx = c.getContext("2d");
  var imgData = ctx.createImageData(GRID, GRID);
  imgData.data.set(rgbaData);
  ctx.putImageData(imgData, 0, 0);
  var tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  var plane = new THREE.Mesh(
    new THREE.PlaneGeometry(ART_W, ART_H),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.05 })
  );
  plane.userData.isFlat = true;
  return plane;
}

/* ── History: start/stop playing animation on an art group ────────────────── */
async function toggleHistoryAnim(artGroup3d, tokenId) {
  /* If already playing on this group, stop it */
  var existing = historyAnims.findIndex(function(a) { return a.tokenId === tokenId; });
  if (existing >= 0) {
    stopHistoryAnim(existing);
    return;
  }

  /* Fetch frames */
  var frames = await fetchHistoryFrames(tokenId);
  if (!frames || frames.length < 2) return;

  /* Pre-build all voxel + flat meshes for each frame */
  var voxelMeshes = [], flatMeshes = [];
  for (var fi = 0; fi < frames.length; fi++) {
    voxelMeshes.push(buildVoxelFrame(frames[fi]));
    flatMeshes.push(buildFlatFrame(frames[fi]));
  }

  /* Hide the original art children (voxel, flat, frame, backing) */
  artGroup3d.traverse(function(child) {
    if (child.userData && (child.userData.isVoxel || child.userData.isFlat || child.userData.isFrame)) {
      child.visible = false;
    }
  });

  /* Show first frame */
  var showVoxel = !framesVisible;
  var currentMesh = showVoxel ? voxelMeshes[0] : flatMeshes[0];
  if (currentMesh) {
    currentMesh.userData._historyAnim = true;
    artGroup3d.add(currentMesh);
  }

  historyAnims.push({
    tokenId: tokenId,
    group: artGroup3d,
    voxelMeshes: voxelMeshes,
    flatMeshes: flatMeshes,
    frameIdx: 0,
    elapsed: 0,
    interval: 0.8,  /* seconds per frame */
  });
}

function stopHistoryAnim(animIdx) {
  var anim = historyAnims[animIdx];
  if (!anim) return;

  /* Remove current animation mesh from group */
  var toRemove = [];
  anim.group.traverse(function(c) {
    if (c.userData && c.userData._historyAnim) toRemove.push(c);
  });
  toRemove.forEach(function(c) { anim.group.remove(c); dispose(c); });

  /* Dispose all pre-built meshes */
  anim.voxelMeshes.forEach(function(m) { if (m) dispose(m); });
  anim.flatMeshes.forEach(function(m) { if (m) dispose(m); });

  /* Restore original art children visibility */
  anim.group.traverse(function(child) {
    if (!child.userData) return;
    if (child.userData.isFrame || child.userData.isFlat) child.visible = framesVisible;
    if (child.userData.isVoxel) child.visible = !framesVisible;
  });

  historyAnims.splice(animIdx, 1);
}

function tickHistoryAnims(dt) {
  for (var ai = historyAnims.length - 1; ai >= 0; ai--) {
    var anim = historyAnims[ai];
    anim.elapsed += dt;
    if (anim.elapsed < anim.interval) continue;
    anim.elapsed -= anim.interval;

    /* Remove old frame mesh */
    var old = [];
    anim.group.traverse(function(c) {
      if (c.userData && c.userData._historyAnim) old.push(c);
    });
    old.forEach(function(c) { anim.group.remove(c); });
    /* Don't dispose old meshes — they're reused from the array */

    /* Advance frame (loop) */
    anim.frameIdx = (anim.frameIdx + 1) % anim.voxelMeshes.length;
    var showVoxel = !framesVisible;
    var mesh = showVoxel ? anim.voxelMeshes[anim.frameIdx] : anim.flatMeshes[anim.frameIdx];
    if (mesh) {
      mesh.userData._historyAnim = true;
      anim.group.add(mesh);
    }
  }
}

/* ── Prefetch (network only, no voxel building) ───────────────────────────── */
function prefetchRoomImages(ri) {
  var room = rooms[ri];
  /* prefetching flag ensures we only fire one batch per room, not every 0.25s */
  if (!room || room.loaded || room.loading || room.prefetching) return;
  room.prefetching = true;
  var tokens = allTokenIds.slice(room.slotOffset, room.slotOffset + room.slotCount);
  for (var i = 0; i < tokens.length; i++) {
    /* fetchImageRGBA/fetchTokenMeta deduplicate in-flight calls automatically */
    fetchImageRGBA(tokens[i]).catch(function() {});
    fetchTokenMeta(tokens[i]).catch(function() {});
  }
}

/* ── Lazy load art for a room (staggered, 1 piece per frame yield) ────────── */
async function loadRoomArt(ri) {
  var room = rooms[ri];
  if (room.loaded || room.loading || !room.built) return;
  room.loading = true;
  /* Cancellation token: if unloadRoomArt runs while we're suspended, it sets
     room._loadToken = null, so our stale myToken reference will no longer match
     and every cancellation check below will exit the coroutine safely. */
  var myToken = {};
  room._loadToken = myToken;
  function cancelled() { return room._loadToken !== myToken; }

  var tokens = allTokenIds.slice(room.slotOffset, room.slotOffset + room.slotCount);

  /* Show placeholders immediately */
  var phs = tokens.map(function(_, j) {
    var slot = room.artSlots[j];
    if (!slot) return null;
    var ph = buildPlaceholder(ri); ph.position.copy(slot.pos); ph.rotation.y = slot.ry;
    artGroup.add(ph); return ph;
  });

  /* Fetch all images + meta in parallel (network-bound, no jank) */
  var NET_BATCH = 6;
  var fetched = new Array(tokens.length);
  for (var nb = 0; nb < tokens.length; nb += NET_BATCH) {
    if (cancelled()) return;
    var slice = tokens.slice(nb, nb + NET_BATCH);
    var results = await Promise.allSettled(slice.map(function(tid) {
      return Promise.all([fetchImageRGBA(tid), fetchTokenMeta(tid)]);
    }));
    for (var ri2 = 0; ri2 < results.length; ri2++) {
      fetched[nb + ri2] = results[ri2].status === "fulfilled" ? results[ri2].value : null;
    }
  }

  /* Build voxel meshes one-at-a-time, yielding to the renderer between each */
  for (var idx = 0; idx < tokens.length; idx++) {
    if (cancelled()) return;
    var data = fetched[idx];
    if (!data) continue;
    var slot = room.artSlots[idx];
    if (!slot) continue;

    var art = buildVoxelArtwork(tokens[idx], data[0], {
      type: data[1]?.type || "human", ap: data[1]?.actionPoints || null,
      customized: !!data[1]?.customized,
    }, ri);
    art.position.copy(slot.pos); art.rotation.y = slot.ry;
    if (phs[idx]) { artGroup.remove(phs[idx]); dispose(phs[idx]); }
    artGroup.add(art);

    /* Show progress */
    setProgress(idx + 1, tokens.length, "loading room " + (ri + 1) + " art");

    /* Yield every piece so the renderer gets a frame */
    await yieldToFrame();
  }

  setProgress(1, 1, "");
  if (!cancelled()) {
    room.loaded = true;
    room.loading = false;
  }
}

/* ── Room lifecycle management ────────────────────────────────────────────── */
function checkRoomLoading() {
  var px = camera.position.x, pz = camera.position.z;
  var newRoom = -1;

  /* Find which room the player is in */
  for (var ri = 0; ri < rooms.length; ri++) {
    var r = rooms[ri], WX = ROOM_W / 2;
    if (px >= r.cx - WX - 1 && px <= r.cx + WX + 1 && pz >= r.zEnd - 1 && pz <= r.zStart + 1) {
      newRoom = ri; break;
    }
  }

  /* Fallback: check corridors */
  if (newRoom < 0) {
    var bestDist = Infinity;
    for (var ri2 = 0; ri2 < rooms.length; ri2++) {
      var rm = rooms[ri2];
      var rmMid = (rm.zStart + rm.zEnd) / 2;
      var d = Math.abs(pz - rmMid);
      if (d < bestDist) { bestDist = d; newRoom = ri2; }
    }
  }

  if (newRoom < 0) return;
  currentRoomIdx = newRoom;

  /* Build rooms within build range */
  for (var i = 0; i < rooms.length; i++) {
    var dist = Math.abs(i - newRoom);
    if (dist <= ROOM_BUILD_RANGE && !rooms[i].built) {
      buildRoom(i);
    }
  }

  /* Load art within art range */
  for (var i = 0; i < rooms.length; i++) {
    var dist = Math.abs(i - newRoom);
    if (dist <= ROOM_ART_RANGE) {
      loadRoomArt(i);
    }
  }

  /* Prefetch images for rooms just beyond art range (network-only, no voxel build) */
  for (var i = 0; i < rooms.length; i++) {
    var dist = Math.abs(i - newRoom);
    if (dist === ROOM_ART_RANGE + 1) {
      prefetchRoomImages(i);
    }
  }

  /* Unload rooms beyond unload range */
  for (var i = 0; i < rooms.length; i++) {
    var dist = Math.abs(i - newRoom);
    if (dist > ROOM_UNLOAD_RANGE && rooms[i].built) {
      unloadRoom(i);
    }
    /* Unload art beyond art range (keep geometry) */
    if (dist > ROOM_ART_RANGE && (rooms[i].loaded || rooms[i].loading)) {
      unloadRoomArt(i);
    }
  }

  /* Rebuild bench positions from currently built rooms */
  benchPositions = [];
  for (var i = 0; i < rooms.length; i++) {
    if (rooms[i].built && rooms[i].slotsPerSide >= 3) {
      benchPositions.push({ x: rooms[i].cx, z: (rooms[i].zStart + rooms[i].zEnd) / 2 });
    }
  }
}

/* ── Podium ───────────────────────────────────────────────────────────────── */
function makePodiumLabel() {
  /* Large, readable museum-style instruction card - 4× bigger canvas */
  var c = document.createElement("canvas"); c.width = 512; c.height = 256;
  var ctx = c.getContext("2d");
  /* Off-white linen background */
  ctx.fillStyle = "#f0ebe0"; ctx.fillRect(0, 0, 512, 256);
  /* Brass border rules */
  ctx.strokeStyle = "#9e8c5c"; ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 492, 236);
  ctx.strokeRect(16, 16, 480, 224);
  /* Headline */
  ctx.fillStyle = "#2a2820";
  ctx.font = 'bold 44px "IBM Plex Mono", monospace';
  ctx.textAlign = "center";
  ctx.fillText("TOGGLE FRAMES", 256, 95);
  /* Dividing rule */
  ctx.fillStyle = "#9e8c5c"; ctx.fillRect(80, 112, 352, 2);
  /* Sub-text */
  ctx.fillStyle = "#7a7260";
  ctx.font = '500 32px "IBM Plex Mono", monospace';
  ctx.fillText("press  [E]  or  click", 256, 168);
  /* Small italic note */
  ctx.fillStyle = "#a09880";
  ctx.font = 'italic 22px "IBM Plex Mono", monospace';
  ctx.fillText("toggle voxel / flat view", 256, 218);
  var tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

function buildPodium(ri) {
  var group = new THREE.Group();
  /* Stepped stone base — two tiers */
  var baseLow = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.72),
    new THREE.MeshPhysicalMaterial({ color: "#d4cfc4", roughness: 0.22, metalness: 0.06,
      clearcoat: 0.5, clearcoatRoughness: 0.1 }));
  baseLow.position.y = 0.05; baseLow.receiveShadow = true; group.add(baseLow);
  var baseHigh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6),
    new THREE.MeshPhysicalMaterial({ color: "#cac4b8", roughness: 0.2, metalness: 0.08,
      clearcoat: 0.55, clearcoatRoughness: 0.08 }));
  baseHigh.position.y = 0.15; baseHigh.receiveShadow = true; group.add(baseHigh);
  /* Column shaft — faceted hexagonal */
  var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.82, 6),
    new THREE.MeshPhysicalMaterial({ color: "#e0dbd0", roughness: 0.18, metalness: 0.05,
      clearcoat: 0.65, clearcoatRoughness: 0.08 }));
  shaft.position.y = 0.61; shaft.castShadow = true; group.add(shaft);
  /* Capital — flared disc */
  var capital = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.06, 32),
    new THREE.MeshPhysicalMaterial({ color: "#d8d2c6", roughness: 0.15, metalness: 0.1,
      clearcoat: 0.7, clearcoatRoughness: 0.06 }));
  capital.position.y = 1.05; capital.castShadow = true; group.add(capital);
  /* Button plate */
  var plate = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 32),
    new THREE.MeshStandardMaterial({ color: "#c8c2b4", roughness: 0.28, metalness: 0.14 }));
  plate.position.y = 1.1; group.add(plate);
  /* Button housing */
  var housing = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 24),
    new THREE.MeshStandardMaterial({ color: "#3a3830", roughness: 0.18, metalness: 0.78 }));
  housing.position.y = 1.13; group.add(housing);
  /* The button itself */
  var btn = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.045, 24),
    new THREE.MeshStandardMaterial({ color: "#cc1a1a", roughness: 0.28, metalness: 0.08,
      emissive: new THREE.Color("#3a0404"), emissiveIntensity: 0.5 }));
  btn.position.y = 1.165; btn.userData.isButton = true; btn.castShadow = true;
  btn.userData.roomIdx = ri;
  group.add(btn);
  group.userData.btnMesh = btn;
  /* Red glow under button */
  var podLight = new THREE.PointLight(0xff2200, 0.55, 2.4);
  podLight.position.y = 1.28; group.add(podLight);
  return group;
}

/* ── Secret explode button — protruding white button that blends with wall ── */
function buildSecretButton() {
  var group = new THREE.Group();
  /* Subtle wall plate almost same color as wall — barely visible */
  var plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.012),
    new THREE.MeshStandardMaterial({ color: "#eee8de", roughness: 0.88, metalness: 0.0 })
  );
  plate.position.z = 0.006; group.add(plate);
  /* The button — protrudes slightly, slightly off-white */
  var btn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.028, 0.018, 20),
    new THREE.MeshStandardMaterial({ color: "#f2ede4", roughness: 0.6, metalness: 0.02 })
  );
  btn.rotation.x = Math.PI / 2;  /* cylinder axis pointing out from wall */
  btn.position.z = 0.018;
  btn.userData.isSecretBtn = true;
  group.add(btn);
  group.userData.btnMesh = btn;
  return group;
}

/* ── Fruit pedestals — apple and/or orange on top of decorative columns ──── */
function buildFruitPedestals(ri, cx, zStart, zEnd, wallHalf) {
  var results = [];
  /* Always place minimum 2 for room 0 (apple + orange).
     For additional rooms alternate. */
  var fruitTypes = [];
  if (ri === 0) {
    fruitTypes = ["apple", "orange"];  /* guaranteed apple + orange */
  } else {
    fruitTypes = (ri % 2 === 0) ? ["apple"] : ["orange"];
  }
  fruitTypes.forEach(function(ft, fi) {
    /* Alternate sides / positions */
    var side = (fi % 2 === 0) ? -1 : 1;
    var offsetZ = (ri === 0 && fi === 1) ? zStart - 5.5 : zStart - 4.0;
    var px = cx + side * wallHalf * 0.55;
    var pz = offsetZ;
    /* Clamp inside room */
    pz = Math.max(zEnd + 1.5, Math.min(zStart - 1.5, pz));
    var grp = new THREE.Group();
    /* Pedestal base */
    var ped = buildPedestal();
    grp.add(ped);
    /* Fruit on top */
    var fruit = (ft === "apple") ? buildApple() : buildOrange();
    fruit.position.y = 1.16;  /* just above capital */
    grp.add(fruit);
    grp.position.set(px, 0, pz);
    results.push({ group: grp, x: px, z: pz });
  });
  return results;
}

/* ── Apple mesh (green apple) ─────────────────────────────────────────────── */
function buildApple() {
  var g = new THREE.Group();
  var body = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 16, 14),
    new THREE.MeshPhysicalMaterial({ color: "#4a8c2a", roughness: 0.35, metalness: 0.04,
      clearcoat: 0.6, clearcoatRoughness: 0.1 })
  );
  body.scale.set(1, 1.08, 1);
  body.position.y = 0.11; g.add(body);
  /* Stem */
  var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.06, 6),
    new THREE.MeshStandardMaterial({ color: "#3a2010", roughness: 0.7 }));
  stem.position.y = 0.225; g.add(stem);
  /* Small leaf */
  var leafShape = new THREE.Shape();
  leafShape.ellipse(0, 0, 0.025, 0.012, 0, Math.PI * 2);
  var leafGeo = new THREE.ShapeGeometry(leafShape);
  var leaf = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({ color: "#2e7020", roughness: 0.6, side: THREE.DoubleSide }));
  leaf.position.set(0.022, 0.24, 0); leaf.rotation.z = 0.4; g.add(leaf);
  return g;
}

/* ── Orange mesh ──────────────────────────────────────────────────────────── */
function buildOrange() {
  var g = new THREE.Group();
  var body = new THREE.Mesh(
    new THREE.SphereGeometry(0.115, 18, 14),
    new THREE.MeshPhysicalMaterial({ color: "#e07020", roughness: 0.55, metalness: 0.0,
      clearcoat: 0.2, clearcoatRoughness: 0.35 })
  );
  body.scale.set(1, 0.94, 1);
  body.position.y = 0.115; g.add(body);
  /* Navel dimple hint */
  var navel = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6),
    new THREE.MeshStandardMaterial({ color: "#b85010", roughness: 0.8 }));
  navel.position.y = 0.003; g.add(navel);
  /* Stem */
  var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.005, 0.04, 6),
    new THREE.MeshStandardMaterial({ color: "#3a2c10", roughness: 0.7 }));
  stem.position.y = 0.235; g.add(stem);
  return g;
}

/* ── Raycaster + interaction ──────────────────────────────────────────────── */
var raycaster = new THREE.Raycaster(); raycaster.far = 3.5;
var screenCenter = new THREE.Vector2(0, 0);
var historyBtnHovered = false;
var hoveredHistoryGroup = null;  /* the art group whose history btn is being aimed at */

function getActivePodiumBtn() {
  if (currentRoomIdx < 0) return podiumBtnMesh;
  /* Search the current room and immediate neighbours for a podium button */
  for (var ri = 0; ri < rooms.length; ri++) {
    if (!rooms[ri].built || !rooms[ri].group) continue;
    if (Math.abs(ri - currentRoomIdx) > 1) continue;
    var found = null;
    rooms[ri].group.traverse(function(c) {
      if (!found && c.userData && c.userData.isButton) found = c;
    });
    if (found) return found;
  }
  return null;
}

function checkButtonInteraction() {
  var activeBtn = getActivePodiumBtn();
  if (!inMuseum || !activeBtn) {
    if (buttonHovered) { buttonHovered = false; updateInteractionHint(false); } return;
  }
  raycaster.setFromCamera(screenCenter, camera);
  var intersects = raycaster.intersectObject(activeBtn);
  var hit = intersects.length > 0 && intersects[0].distance < 3.5;
  if (hit !== buttonHovered) { buttonHovered = hit; updateInteractionHint(hit); }
}

/* ── Check if aiming at the secret explode button ─────────────────────────── */
function checkSecretButtonInteraction() {
  if (!inMuseum || !secretBtnMesh || explodeActive) {
    if (secretBtnHovered) { secretBtnHovered = false; }
    return;
  }
  raycaster.setFromCamera(screenCenter, camera);
  var hits = raycaster.intersectObject(secretBtnMesh, true);
  var hit = hits.length > 0 && hits[0].distance < 2.5;
  secretBtnHovered = hit;
  /* No visible hint — intentionally secret */
}

/* ── Check if aiming at a history button ──────────────────────────────────── */
function checkHistoryInteraction() {
  if (!inMuseum) {
    if (historyBtnHovered) { historyBtnHovered = false; hoveredHistoryGroup = null; }
    return;
  }
  raycaster.setFromCamera(screenCenter, camera);
  var allMeshes = [];
  artGroup.traverse(function(c) {
    if (c.isMesh && c.parent && c.parent.userData && c.parent.userData.isHistoryBtn) {
      allMeshes.push(c);
    }
  });
  if (!allMeshes.length) {
    if (historyBtnHovered) { historyBtnHovered = false; hoveredHistoryGroup = null; }
    return;
  }
  var hits = raycaster.intersectObjects(allMeshes, false);
  if (hits.length && hits[0].distance < 3.5) {
    /* Walk up to find the art group (has userData.hasHistory) */
    var p = hits[0].object;
    while (p && !(p.userData && p.userData.hasHistory)) p = p.parent;
    if (p) {
      hoveredHistoryGroup = p;
      if (!historyBtnHovered) {
        historyBtnHovered = true;
        updateInteractionHint(true, "history");
      }
      return;
    }
  }
  historyBtnHovered = false;
  hoveredHistoryGroup = null;
  if (!buttonHovered && !benchHovered) updateInteractionHint(false);
}

function updateInteractionHint(show, mode) {
  var el = document.getElementById("interaction-hint");
  if (!el) return;
  if (mode === "sit-up") {
    el.querySelector(".hint-desktop").textContent = "[E] stand up";
    el.querySelector(".hint-touch").textContent = "tap to stand up";
  } else if (mode === "sit-down") {
    el.querySelector(".hint-desktop").textContent = "[E] sit down";
    el.querySelector(".hint-touch").textContent = "tap to sit";
  } else if (mode === "history") {
    el.querySelector(".hint-desktop").textContent = "[E] play history";
    el.querySelector(".hint-touch").textContent = "tap to play history";
  } else {
    el.querySelector(".hint-desktop").textContent = "[E] toggle frames";
    el.querySelector(".hint-touch").textContent = "tap to toggle frames";
  }
  if (show) {
    el.classList.add("visible");
    hintDismissTimer = HINT_PERSIST;
  } else {
    el.classList.remove("visible");
    hintDismissTimer = 0;
  }
}

/* ── Tick hint auto-dismiss ───────────────────────────────────────────────── */
function tickHintDismiss(dt) {
  if (hintDismissTimer <= 0) return;
  /* Don't dismiss while actively hovering an interactive object */
  if (buttonHovered || benchHovered || historyBtnHovered || isSitting) { hintDismissTimer = HINT_PERSIST; return; }
  hintDismissTimer -= dt;
  if (hintDismissTimer <= 0) {
    hintDismissTimer = 0;
    var el = document.getElementById("interaction-hint");
    if (el) el.classList.remove("visible");
  }
}

function pressButton() {
  var activeBtn = getActivePodiumBtn();
  if (!activeBtn || btnAnimating) return;
  framesVisible = !framesVisible;
  for (var ai = 0; ai < artGroup.children.length; ai++) {
    artGroup.children[ai].traverse(function(child) {
      if (!child.userData) return;
      if (child.userData.isFrame || child.userData.isFlat) child.visible = framesVisible;
      if (child.userData.isVoxel) child.visible = !framesVisible;
    });
  }
  btnAnimating = true;
  var origY = activeBtn.position.y;
  activeBtn.position.y = origY - 0.022;
  playButtonClick();
  setTimeout(function() { activeBtn.position.y = origY; btnAnimating = false; }, 150);
}

function pressSecretButton() {
  if (explodeActive || !secretBtnMesh) return;
  explodeActive = true;
  explodeResetTimer = 10.0;
  /* Depress the button */
  secretBtnMesh.position.z -= 0.01;
  playExplodeSound();
  /* Shatter every art group into voxels */
  var toExplode = [];
  artGroup.traverse(function(c) {
    if (c === artGroup) return;
    if (!c.parent || c.parent !== artGroup) return;
    toExplode.push(c);
  });
  toExplode.forEach(function(artG) {
    var worldPos = new THREE.Vector3();
    artG.getWorldPosition(worldPos);
    /* Collect voxel colors/positions from the instanced mesh children */
    var instMesh = null;
    artG.traverse(function(ch) { if (ch.isInstancedMesh) instMesh = ch; });
    var numVoxels = instMesh ? Math.min(instMesh.count, 120) : 20;
    var dummy = new THREE.Matrix4(), col = new THREE.Color();
    for (var vi = 0; vi < numVoxels; vi++) {
      var voxMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.04 });
      if (instMesh) {
        instMesh.getMatrixAt(vi, dummy);
        if (instMesh.instanceColor) { instMesh.getColorAt(vi, col); voxMat.color.copy(col); }
        else voxMat.color.set("#c0b090");
      } else {
        voxMat.color.set("#c0b090");
      }
      var vox = new THREE.Mesh(new THREE.BoxGeometry(VOXEL_SIZE * 1.5, VOXEL_SIZE * 1.5, VOXEL_SIZE * 1.5), voxMat);
      /* Random scatter from art's world position */
      vox.position.copy(worldPos);
      vox.position.x += (Math.random() - 0.5) * 2.2;
      vox.position.y += (Math.random() - 0.5) * 2.0 + 1.5;
      vox.position.z += (Math.random() - 0.5) * 2.2;
      scene.add(vox);
      explodeParticles.push({
        mesh: vox,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          Math.random() * 7 + 2,
          (Math.random() - 0.5) * 8
        ),
        rot: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3),
        life: 10.0
      });
    }
    /* Hide original art */
    artG.visible = false;
  });
}

function tickExplode(dt) {
  if (!explodeActive) return;
  /* Tick particles */
  for (var pi = 0; pi < explodeParticles.length; pi++) {
    var p = explodeParticles[pi];
    p.vel.y += GRAVITY * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += p.rot.x * dt;
    p.mesh.rotation.y += p.rot.y * dt;
    p.mesh.rotation.z += p.rot.z * dt;
    /* Bounce/settle on floor */
    if (p.mesh.position.y < 0.04) {
      p.mesh.position.y = 0.04;
      p.vel.y = Math.abs(p.vel.y) * 0.22;
      p.vel.x *= 0.7; p.vel.z *= 0.7;
    }
    p.life -= dt;
  }
  /* Reset timer */
  explodeResetTimer -= dt;
  if (explodeResetTimer <= 0) {
    /* Remove particles */
    explodeParticles.forEach(function(p) { scene.remove(p.mesh); dispose(p.mesh); });
    explodeParticles = [];
    /* Restore art visibility */
    artGroup.traverse(function(c) {
      if (c !== artGroup && c.parent === artGroup) c.visible = true;
    });
    /* Restore button */
    if (secretBtnMesh) secretBtnMesh.position.z += 0.01;
    explodeActive = false;
  }
}

function playExplodeSound() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  var now = audioCtx.currentTime;
  /* Low rumble + high crack */
  [80, 140, 220, 380, 700].forEach(function(freq, i) {
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = i < 3 ? "sawtooth" : "square";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.3, now + 0.6);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + i * 0.05);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now + i * 0.01); osc.stop(now + 0.8);
  });
}

function tryInteract() {
  if (isSitting) { standUp(); return; }
  if (secretBtnHovered) { pressSecretButton(); return; }
  if (historyBtnHovered && hoveredHistoryGroup) {
    var tid = hoveredHistoryGroup.userData.tokenId;
    toggleHistoryAnim(hoveredHistoryGroup, tid);
    return;
  }
  if (buttonHovered) { pressButton(); return; }
  if (benchHovered && nearBenchIdx >= 0) { sitDown(nearBenchIdx); return; }
}

function sitDown(bi) {
  var b = benchPositions[bi];
  if (!b) return;
  isSitting = true;
  camera.position.set(b.x, 0.9, b.z);
  GROUND_Y = 0.9;
  updateInteractionHint(true, "sit-up");
}

function standUp() {
  isSitting = false;
  GROUND_Y = 1.7;
  camera.position.y = 1.7;
  updateInteractionHint(false);
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
      updateInteractionHint(true, "sit-down");
    } else if (!buttonHovered) {
      updateInteractionHint(false);
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
  if (metaCache.has(tokenId)) return metaCache.get(tokenId);
  if (metaInFlight.has(tokenId)) return metaInFlight.get(tokenId);
  var p = (async function() {
    try {
      var r = await fetch(NORMIES_API + "/normie/" + tokenId + "/canvas/info", { cache: "no-store" });
      var data = r.ok ? await r.json() : {};
      metaCache.set(tokenId, data);
      return data;
    } catch (e) { return {}; }
    finally { metaInFlight.delete(tokenId); }
  })();
  metaInFlight.set(tokenId, p);
  return p;
}

async function fetchImageRGBA(tokenId) {
  if (imageCache.has(tokenId)) return imageCache.get(tokenId);
  if (imageInFlight.has(tokenId)) return imageInFlight.get(tokenId);
  /* Each call gets its own OffscreenCanvas — the old shared reusableOC caused a data-race
     when NET_BATCH > 1: concurrent fetches would overwrite each other's pixel buffer,
     permanently storing corrupted data in imageCache. */
  var p = (async function() {
    try {
      var res = await fetch(NORMIES_API + "/normie/" + tokenId + "/image.png", { cache: "no-store" });
      if (!res.ok) throw new Error("image " + res.status);
      var bmp = await createImageBitmap(await res.blob());
      var oc = new OffscreenCanvas(GRID, GRID);
      var ctx = oc.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bmp, 0, 0, GRID, GRID);
      bmp.close();
      var data = new Uint8ClampedArray(ctx.getImageData(0, 0, GRID, GRID).data);
      imageCache.set(tokenId, data);
      return data;
    } finally {
      imageInFlight.delete(tokenId);
    }
  })();
  imageInFlight.set(tokenId, p);
  return p;
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
  /* Reset drag state */
  if (draggedArt) { scene.remove(draggedArt); dispose(draggedArt); draggedArt = null; }
  isDragging = false; dragVelocity.set(0, 0, 0);
  droppedArts.forEach(function(da) { scene.remove(da.group); dispose(da.group); });
  droppedArts = [];
  /* Reset explode state */
  explodeParticles.forEach(function(p) { scene.remove(p.mesh); dispose(p.mesh); });
  explodeParticles = []; explodeActive = false; explodeResetTimer = 0;
  secretBtnMesh = null; secretBtnHovered = false;
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
    /* Sequential scans avoid flooding RPCs with 50 concurrent eth_call requests */
    var per = [];
    for (var wi = 0; wi < addresses.length; wi++) {
      per.push(await fetchOwnedTokenIds(addresses[wi]));
    }
    allTokenIds = [...new Set(per.flat())];
  } catch (e) { setStatus("wallet lookup failed: " + e.message, true); setBusy(false); return; }

  if (!allTokenIds.length) {
    setStatus("no normies found in " + (addresses.length > 1 ? "these wallets" : "this wallet") + ".");
    setBusy(false); return;
  }

  /* Let user pick which normies to display (max 10) */
  setBusy(false);
  showSelectionGrid(allTokenIds, addresses);
}

/* ── Normie selection grid ────────────────────────────────────────────────── */
var _selAddresses = [];  /* saved for HUD label after entering */

function showSelectionGrid(tokenIds, addresses) {
  _selAddresses = addresses || [];
  var MAX_SELECT = 40;
  var selected = new Set();

  selectionGrid.innerHTML = "";
  selectionCountEl.textContent = "0 / " + MAX_SELECT + " selected";
  selectionLoadBtn2.disabled = true;
  selectionOverlay.classList.remove("selection-hidden");

  /* Status line on the landing page */
  setStatus(tokenIds.length + " normies found \u2014 pick up to " + MAX_SELECT + (tokenIds.length > 40 ? " (40 max)" : ""));

  /* Build all cards */
  tokenIds.forEach(function(tokenId) {
    var card = document.createElement("div");
    card.className = "normie-card";
    card.dataset.id = tokenId;

    /* Image — direct URL avoids canvas download overhead for thumbnails */
    var img = document.createElement("img");
    img.className = "normie-img";
    img.src = NORMIES_API + "/normie/" + tokenId + "/image.png";
    img.alt = "#" + tokenId;
    img.loading = "lazy";
    img.width = 120; img.height = 120;
    card.appendChild(img);

    var label = document.createElement("div");
    label.className = "normie-card-label";
    label.textContent = "#" + tokenId;
    card.appendChild(label);

    card.addEventListener("click", function() {
      if (selected.has(tokenId)) {
        selected.delete(tokenId);
        card.classList.remove("selected");
      } else {
        if (selected.size >= MAX_SELECT) return;
        selected.add(tokenId);
        card.classList.add("selected");
      }
      /* Disable un-selected cards when limit reached */
      var full = selected.size >= MAX_SELECT;
      selectionGrid.querySelectorAll(".normie-card").forEach(function(c) {
        if (!c.classList.contains("selected")) {
          c.classList.toggle("disabled", full);
        }
      });
      selectionCountEl.textContent = selected.size + " / " + MAX_SELECT + " selected";
      selectionLoadBtn2.disabled = selected.size === 0;
    });

    selectionGrid.appendChild(card);
  });

  selectionLoadBtn2.onclick = function() {
    if (selected.size === 0) return;
    selectionOverlay.classList.add("selection-hidden");
    enterWithSelection([...selected]);
  };

  selectionCancelBtn.onclick = function() {
    selectionOverlay.classList.add("selection-hidden");
    setStatus(tokenIds.length + " normies found.");
  };
}

function enterWithSelection(selectedIds) {
  allTokenIds = selectedIds;
  buildMuseum(selectedIds.length);
  enterMuseum();
  if (!isTouch && controls) controls.lock();

  var walletStr = _selAddresses.length === 1
    ? _selAddresses[0].slice(0, 8) + "\u2026" + _selAddresses[0].slice(-5)
    : _selAddresses.length + " wallets";
  setStatus(selectedIds.length + " normies in gallery");
  hudMetaEl.textContent = walletStr + " \u00b7 " + selectedIds.length + " normies";

  currentRoomIdx = 0;
  checkRoomLoading();
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
document.getElementById("interaction-hint").addEventListener("click", function(e) { e.stopPropagation(); tryInteract(); });

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

  /* Right mouse button — grab / drop dragged normie */
  renderer.domElement.addEventListener("mousedown", function(e) {
    if (!inMuseum || !controls.isLocked || e.button !== 2) return;
    e.preventDefault();
    if (isDragging) { dropDraggedArt(); return; }
    /* Raycast against art group for a voxel/flat mesh */
    var artRay = new THREE.Raycaster(); artRay.far = 4.0;
    artRay.setFromCamera(screenCenter, camera);
    var candidates = [];
    artGroup.traverse(function(c) { if (c.isMesh && c !== artGroup) candidates.push(c); });
    var hits = artRay.intersectObjects(candidates, false);
    if (!hits.length) return;
    /* Find the top-level art group */
    var p = hits[0].object;
    while (p && p.parent !== artGroup) p = p.parent;
    if (!p) return;
    /* Detach from wall, put in world space */
    var worldPos = new THREE.Vector3(); p.getWorldPosition(worldPos);
    var worldQuat = new THREE.Quaternion(); p.getWorldQuaternion(worldQuat);
    artGroup.remove(p);
    scene.add(p);
    p.position.copy(worldPos);
    p.quaternion.copy(worldQuat);
    draggedArt = p;
    isDragging = true;
    dragVelocity.set(0, 0, 0);
  });

  renderer.domElement.addEventListener("mouseup", function(e) {
    if (!inMuseum || !controls.isLocked || e.button !== 2) return;
    e.preventDefault();
    if (isDragging) dropDraggedArt();
  });

  /* Prevent default context menu when pointer is locked */
  renderer.domElement.addEventListener("contextmenu", function(e) { e.preventDefault(); });
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

  /* Jump physics — with surface collision */
  if (isJumping) {
    jumpVelocity += GRAVITY * dt;
    camera.position.y += jumpVelocity * dt;
    /* Check if landing on a surface */
    var landY = 1.7;  /* default ground */
    var px = camera.position.x, pz = camera.position.z;
    for (var si = 0; si < surfaceBoxes.length; si++) {
      var sb = surfaceBoxes[si];
      if (px >= sb.minX && px <= sb.maxX && pz >= sb.minZ && pz <= sb.maxZ) {
        if (camera.position.y <= sb.topY && camera.position.y > sb.topY - 1.0) {
          landY = Math.max(landY, sb.topY);
        }
      }
    }
    if (camera.position.y <= landY) {
      camera.position.y = landY;
      GROUND_Y = landY;
      isJumping = false;
      jumpVelocity = 0;
    }
  } else {
    /* Check if we've walked off a surface */
    var floorY = 1.7;
    var px2 = camera.position.x, pz2 = camera.position.z;
    for (var si2 = 0; si2 < surfaceBoxes.length; si2++) {
      var sb2 = surfaceBoxes[si2];
      if (px2 >= sb2.minX && px2 <= sb2.maxX && pz2 >= sb2.minZ && pz2 <= sb2.maxZ) {
        if (GROUND_Y >= sb2.topY - 0.1) {
          floorY = Math.max(floorY, sb2.topY);
        }
      }
    }
    if (floorY < GROUND_Y - 0.1) {
      /* Walked off the edge — start falling */
      isJumping = true;
      jumpVelocity = 0;
    } else {
      GROUND_Y = floorY;
      camera.position.y = GROUND_Y;
    }
  }

  if (isMoving) {
    stepCooldown -= dt;
    if (stepCooldown <= 0) { playFootstep(); stepCooldown = isSprinting ? STEP_INTERVAL_SPRINT : STEP_INTERVAL; }
  } else { stepCooldown = 0; }
}

/* ── Drag helper functions ────────────────────────────────────────────────── */
var _prevDragPos = new THREE.Vector3();

function dropDraggedArt() {
  if (!draggedArt) return;
  var art = draggedArt;
  draggedArt = null; isDragging = false;
  /* Apply a gentle toss velocity from drag movement */
  var vel = dragVelocity.clone().multiplyScalar(2.8);
  vel.y = Math.max(vel.y, 0);
  droppedArts.push({ group: art, velocity: vel, onGround: false });
  dragVelocity.set(0, 0, 0);
}

function tickDraggedArt(dt) {
  if (!isDragging || !draggedArt) return;
  /* Move art to a point 2m in front of the camera */
  var target = new THREE.Vector3();
  camera.getWorldDirection(target);
  target.multiplyScalar(2.0).add(camera.position);
  /* Smooth follow */
  var prev = draggedArt.position.clone();
  draggedArt.position.lerp(target, Math.min(1, dt * 12));
  /* Estimate velocity for toss on release */
  dragVelocity.subVectors(draggedArt.position, prev).divideScalar(dt);
  /* Rotate slowly */
  draggedArt.rotation.y += dt * 0.6;
}

function tickDroppedArts(dt) {
  for (var di = droppedArts.length - 1; di >= 0; di--) {
    var da = droppedArts[di];
    if (da.onGround) continue;
    da.velocity.y += GRAVITY * dt;
    da.group.position.addScaledVector(da.velocity, dt);
    /* Floor collision */
    var floorLimit = ART_H / 2 + 0.01;
    if (da.group.position.y < floorLimit) {
      da.group.position.y = floorLimit;
      da.velocity.y = -da.velocity.y * 0.35;
      da.velocity.x *= 0.75; da.velocity.z *= 0.75;
      if (Math.abs(da.velocity.y) < 0.3) { da.velocity.set(0, 0, 0); da.onGround = true; }
    }
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
var roomCheckTimer = 0;
function animate() {
  requestAnimationFrame(animate);
  clock.update();
  var dt = Math.min(clock.getDelta(), 0.05);
  var shouldMove = isTouch ? inMuseum : (controls && controls.isLocked);
  if (shouldMove) move(dt);
  tickReveal(dt);
  checkButtonInteraction();
  checkSecretButtonInteraction();
  checkHistoryInteraction();
  checkBenchProximity();
  tickHistoryAnims(dt);
  tickDraggedArt(dt);
  tickDroppedArts(dt);
  tickExplode(dt);
  tickHintDismiss(dt);
  if (inMuseum) {
    roomCheckTimer += dt;
    if (roomCheckTimer > 0.25) { roomCheckTimer = 0; checkRoomLoading(); }
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
