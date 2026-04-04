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

/* ── Secret door button + hidden room ────────────────────────────────────── */
var doorBtnMesh = null;
var doorBtnHovered = false;
var doorPanel = null;        /* the sliding wall panel mesh */
var doorPanelOrigY = null;   /* original Y of the door panel */
var doorOpen = false;
var doorAnimating = false;
var doorAnim = 0;            /* 0 = closed, 1 = open */
var hiddenRoomGroup = null;
var hiddenRoomWalkZone = null;  /* { minX, maxX, minZ, maxZ } — added when door opens */

/* ── Links button + panels ────────────────────────────────────────────────── */
var linksBtnMesh = null;
var linksBtnHovered = false;
var linkPanelMeshes = [];   /* [{mesh, url}] */
var linkPanelHovered = null;
var linkPanelsVisible = false;
var linkPanelGroup = null;

var LINKS_DATA = [
  { url: "https://www.normies.art/tools",                  label: "normie tools",    desc: "official normies tools" },
  { url: "https://legacy.normies.art/normiecam",          label: "normie cam",      desc: "live webcam viewer" },
  { url: "https://editnormies.com",                       label: "make gifs",       desc: "create & edit normie gifs" },
  { url: "https://normiegallery.netlify.app/",            label: "normie gallery",  desc: "trait-based gallery" },
  { url: "https://normie-map-production.up.railway.app/", label: "normie map",      desc: "holder world map" },
  { url: "https://normiesarchive.xyz/",                   label: "archive",         desc: "normies history archive" },
  { url: "https://normski-generator.vercel.app/",         label: "normsky",         desc: "normies + banksy mashup" },
  { url: "https://normiesburntracker.lovable.app/",       label: "burn tracker",    desc: "track the burns" },
  { url: "https://normies-remixer.vercel.app/",           label: "remixer",         desc: "remix your normie" },
  { url: "https://normie-3d.vercel.app/",                 label: "3d & graveyard",  desc: "normies 3d + graveyard" },
];

/* ── Hint auto-dismiss ────────────────────────────────────────────────────── */
var hintDismissTimer = 0;
var HINT_PERSIST = 4.0;  /* seconds before hint fades if still showing */

/* ── Jump physics ─────────────────────────────────────────────────────────── */
var jumpVelocity = 0;
var isJumping = false;
var GRAVITY = -12;
var JUMP_FORCE = 5.2;
var GROUND_Y = 2.2;

var benchPositions = [];

/* ── Surface collision (stand on benches/podiums) ─────────────────────────── */
var surfaceBoxes = [];  /* { minX, maxX, minZ, maxZ, topY } */

/* ── Volume controls ──────────────────────────────────────────────────────── */
var musicVolume = 0.25;
var sfxVolume = 0.5;

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

/* ── Time scale + arms ────────────────────────────────────────────────────── */
var timeScale = 1.0;
var showArms = false;
var showCrosshair = true;
var walkSwing = 0;
var idleSwing = 0;
var grabAnim = 0;
var pushAnim = 0;  /* 0→1 spike on button press, decays → drives right-arm forward jab */
var armsGroup = new THREE.Group();
var armRGroup = new THREE.Group();
var armLGroup = new THREE.Group();
var armRElbow = new THREE.Group();
var armLElbow = new THREE.Group();

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
  logarithmicDepthBuffer: true,
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
scene.background = new THREE.Color("#d4c9b8");
scene.fog = new THREE.FogExp2("#d4c9b8", 0.011);

/* ── Environment map (warm studio for PBR reflections) ────────────────────── */
(function generateEnvironment() {
  var pmrem = new THREE.PMREMGenerator(renderer);
  var envScene = new THREE.Scene();
  envScene.background = new THREE.Color("#e2d5c0");
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
camera.position.set(0, 2.2, 2);

/* ── Controls ─────────────────────────────────────────────────────────────── */
let controls = null;
if (!isTouch) {
  controls = new PointerLockControls(camera, renderer.domElement);
  scene.add(camera);
} else {
  scene.add(camera);
  camera.rotation.order = "YXZ";
}

/* ── Build voxel arms attached to camera ─────────────────────────────────── */
(function buildArms() {
  var armMat = new THREE.MeshStandardMaterial({ color: "#1a1818", roughness: 0.85 });
  function makeArm(shoulder, elbow) {
    var upper = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.065, 0.13), armMat);
    upper.position.set(0, 0, -0.065); shoulder.add(upper);
    elbow.position.set(0, 0, -0.13);
    var fore = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.058, 0.11), armMat);
    fore.position.set(0, -0.018, -0.055); elbow.add(fore);
    shoulder.add(elbow);
  }
  makeArm(armRGroup, armRElbow);
  makeArm(armLGroup, armLElbow);
  armRGroup.position.set( 0.21, -0.34, -0.30);
  armLGroup.position.set(-0.21, -0.34, -0.30);
  armsGroup.add(armRGroup); armsGroup.add(armLGroup);
  armsGroup.visible = showArms;
  camera.add(armsGroup);
})();

/* ── Lights ───────────────────────────────────────────────────────────────── */
scene.add(new THREE.AmbientLight(0xffeedd, 0.32));
const sun = new THREE.DirectionalLight(0xffe5c0, 0.36);
sun.position.set(5, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.001;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffeedd, 0xb8a888, 0.24));

/* ── Shared materials (upgraded PBR) ──────────────────────────────────────── */
/* Palette: pale limestone walls, warm sand floor, dark slate accent, brushed brass trim */
const floorMat = new THREE.MeshPhysicalMaterial({
  color: "#beb09a", roughness: 0.05, metalness: 0.06,
  clearcoat: 0.85, clearcoatRoughness: 0.06, reflectivity: 0.80,
});
const wallMat      = new THREE.MeshStandardMaterial({ color: "#ebe3d2", roughness: 0.92 });
const accentWallMat= new THREE.MeshStandardMaterial({ color: "#2a2824", roughness: 0.85 }); /* dark feature wall */
const panelMat     = new THREE.MeshStandardMaterial({ color: "#d4c9ae", roughness: 0.82 });
const ceilMat      = new THREE.MeshStandardMaterial({ color: "#ede6d5", roughness: 0.96 });
const mouldMat     = new THREE.MeshStandardMaterial({ color: "#b8ae98", roughness: 0.35, metalness: 0.20 });
const baseMat      = new THREE.MeshStandardMaterial({ color: "#aea484", roughness: 0.5,  metalness: 0.10 });
const frameMat     = new THREE.MeshStandardMaterial({ color: "#6a5c40", roughness: 0.22, metalness: 0.45 });
const backMat      = new THREE.MeshStandardMaterial({ color: "#f2ede4", roughness: 0.95 });
const placeMat     = new THREE.MeshStandardMaterial({ color: "#d8d0c4", roughness: 0.95 });
const benchMat     = new THREE.MeshStandardMaterial({ color: "#1c1814", roughness: 0.45, metalness: 0.24 });
const benchSeatMat = new THREE.MeshStandardMaterial({ color: "#f0ebe0", roughness: 0.55, metalness: 0.02 }); /* pale stone seat */
const corrFloorMat = new THREE.MeshPhysicalMaterial({
  color: "#afa07c", roughness: 0.04, metalness: 0.1,
  clearcoat: 0.75, clearcoatRoughness: 0.06, reflectivity: 0.80,
});
const archMat  = new THREE.MeshStandardMaterial({ color: "#bdb59c", roughness: 0.42, metalness: 0.14 });
const inlayMat = new THREE.MeshStandardMaterial({ color: "#8c7c5c", roughness: 0.08, metalness: 0.48 }); /* brass inlay */
const beamMat  = new THREE.MeshStandardMaterial({ color: "#e2d9c8", roughness: 0.78, metalness: 0.02 });
const trimMat  = new THREE.MeshStandardMaterial({ color: "#a09080", roughness: 0.28, metalness: 0.38 }); /* brushed brass */
const trackMat = new THREE.MeshStandardMaterial({ color: "#222018", roughness: 0.32, metalness: 0.72 }); /* matte black track */
const pedestalMat = new THREE.MeshPhysicalMaterial({ color: "#d8d0c4", roughness: 0.18, metalness: 0.04,
  clearcoat: 0.6, clearcoatRoughness: 0.12 }); /* pale marble pedestal */

/* ── Shared geometries (reduces GC churn) ─────────────────────────────────── */
const sharedVoxelGeo = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
const sharedPlaceholderGeo = new THREE.BoxGeometry(2.32, 2.32, 0.04);

/* ── Shared voxel material (compiled once — all art uses the same program) ── */
const sharedVoxelMat = new THREE.MeshPhysicalMaterial({
  color: "#060606", roughness: 0.04, metalness: 0.08,
  clearcoat: 1.0, clearcoatRoughness: 0.03,
});
/* White voxel material — used exclusively for the hidden-room #9098 display */
const hiddenVoxelMat = new THREE.MeshPhysicalMaterial({
  color: "#b0aca6", roughness: 0.18, metalness: 0.04,
  clearcoat: 0.4, clearcoatRoughness: 0.10,
});
/* Separate instances for explosion fade (need transparent flag + mutable opacity) */
const sharedExplodeVoxMat = new THREE.MeshPhysicalMaterial({
  color: "#060606", roughness: 0.04, metalness: 0.08,
  clearcoat: 1.0, clearcoatRoughness: 0.03, transparent: true, opacity: 1.0,
});
const sharedExplodeDebrisMat = new THREE.MeshPhysicalMaterial({
  color: "#0a0a0a", roughness: 0.06, metalness: 0.08,
  clearcoat: 0.9, clearcoatRoughness: 0.05, transparent: true, opacity: 1.0,
});

/* ── Gallery + art groups ─────────────────────────────────────────────────── */
const galleryGroup = new THREE.Group();
scene.add(galleryGroup);
const artGroup = new THREE.Group();
scene.add(artGroup);

/* ── Shader pre-warm dummies (scale 0 — never visible, force GPU compile at startup) ── */
/* Without these, Three.js compiles shaders lazily on first visible frame → stutter.   */
(function preWarmShaders() {
  /* hiddenVoxelMat variant — used by #9098 hidden room InstancedMesh */
  var d1 = new THREE.Mesh(sharedVoxelGeo, hiddenVoxelMat);
  d1.scale.setScalar(0); scene.add(d1);
  /* Flat-frame MeshStandardMaterial+map variant — used by all framed art pieces */
  var dummyCanvas = document.createElement("canvas"); dummyCanvas.width = 1; dummyCanvas.height = 1;
  var dummyTex = new THREE.CanvasTexture(dummyCanvas);
  var d2 = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ map: dummyTex, roughness: 0.6, metalness: 0.05 })
  );
  d2.scale.setScalar(0); scene.add(d2);
})();

/* ── Multi-room state ─────────────────────────────────────────────────────── */
var rooms = [];
var walkZones = [];
var allTokenIds = [];
var currentRoomIdx = -1;

/* ── Plan the multi-room layout ───────────────────────────────────────────── */
function planLayout(totalCount) {
  rooms = [];
  walkZones = [];
  var numRooms = 1;  /* always a single room — it just grows longer */
  var slotsUsed = 0;
  var zCursor = 0;

  for (var ri = 0; ri < numRooms; ri++) {
    var count = totalCount;
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
  /* Right wall — room 0 has a gap for the secret sliding door */
  if (ri === 0) {
    var _doorZ = room.zStart - 6.0;
    var _gapN = _doorZ + ALCOVE_L / 2;
    var _gapS = _doorZ - ALCOVE_L / 2;
    var _seg1Len = room.zStart - _gapN;
    if (_seg1Len > 0.1) {
      var rwSeg1 = new THREE.Mesh(new THREE.PlaneGeometry(_seg1Len, ROOM_H), wallMat);
      rwSeg1.rotation.y = -Math.PI / 2;
      rwSeg1.position.set(cx + WALL_X, ROOM_H / 2, (room.zStart + _gapN) / 2);
      rwSeg1.receiveShadow = true; g.add(rwSeg1);
    }
    var _seg2Len = _gapS - room.zEnd;
    if (_seg2Len > 0.1) {
      var rwSeg2 = new THREE.Mesh(new THREE.PlaneGeometry(_seg2Len, ROOM_H), wallMat);
      rwSeg2.rotation.y = -Math.PI / 2;
      rwSeg2.position.set(cx + WALL_X, ROOM_H / 2, (_gapS + room.zEnd) / 2);
      rwSeg2.receiveShadow = true; g.add(rwSeg2);
    }
  } else {
    var rw = new THREE.Mesh(wallGeo, wallMat);
    rw.rotation.y = -Math.PI / 2; rw.position.set(cx + WALL_X, ROOM_H / 2, zMid); rw.receiveShadow = true; g.add(rw);
  }

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
  [-WALL_X + 0.04, WALL_X - 0.04].forEach(function(x) {
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
  /* Right-wall door exclusion zone for room 0 (door panel lives here) */
  var doorExclMinZ = room.zStart - 8.5, doorExclMaxZ = room.zStart - 3.5;
  /* Left wall (x = cx - WO + 0.05) and Right wall (x = cx + WO - 0.05) */
  for (var i = 0; i < room.slotsPerSide; i++) {
    var z = slotZStart - i * SLOT_SPACING;
    room.artSlots.push({ pos: new THREE.Vector3(cx - WO + 0.05, 2.6, z), ry: Math.PI / 2 });
    /* Skip right-wall slots that overlap the hidden door panel */
    if (ri === 0 && z >= doorExclMinZ && z <= doorExclMaxZ) continue;
    room.artSlots.push({ pos: new THREE.Vector3(cx + WO - 0.05, 2.6, z), ry: -Math.PI / 2 });
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
        /* Front wall is behind spawn — skip art slots here */
      }
      if (ri === rooms.length - 1) {
        /* Solid back wall — face into the room */
        room.artSlots.push({ pos: new THREE.Vector3(ex, 2.6, room.zEnd + 0.05), ry: 0 });
      }
      /* For middle rooms, place on a side-panel next to the doorway lintel where there's solid wall */
      if (ri > 0 && ri < rooms.length - 1) {
        var doorW = CORR_W + 0.2;
        var panelX = cx - (doorW / 2 + ART_W / 2 + 0.3);
        if (ei === 0) room.artSlots.push({ pos: new THREE.Vector3(panelX, 2.6, room.zStart - 0.05), ry: Math.PI });
        else room.artSlots.push({ pos: new THREE.Vector3(cx + (doorW / 2 + ART_W / 2 + 0.3), 2.6, room.zStart - 0.05), ry: Math.PI });
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

  /* ── Secret explode button — on the apple pedestal ── */
  if (ri === 0) {
    var applePed = fruitPedestals.find(function(fp) { return fp.isApple; });
    if (applePed) {
      var sBtn = buildSecretButton();
      /* Front face of pedestal — faces toward the entrance (+Z) so player
         looks inward at the art while triggering the explosion */
      sBtn.position.set(0, 0.62, 0.26);
      sBtn.rotation.y = 0;
      applePed.group.add(sBtn);
      secretBtnMesh = sBtn.userData.btnMesh;
    }

    /* ── Secret door button + hidden room ── */
    var dbz = room.zStart - 6.0;
    var dBtn = buildDoorButton();
    var dbx = cx + WALL_X - 0.018;
    dBtn.position.set(dbx, 2.0, room.zStart - 3.2);
    dBtn.rotation.y = Math.PI / 2;
    g.add(dBtn);
    doorBtnMesh = dBtn.userData.btnMesh;

    buildHiddenRoom(g, cx + WALL_X, dbz, ROOM_H);

    /* ── Entrance title sign + links system ── */
    buildRoomTitleSign(g, cx, room.zEnd);
    buildLinksSystem(g, cx, zMid);
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
  /* Clear secretBtnMesh + door refs if room 0 was unloaded */
  if (ri === 0) {
    secretBtnMesh = null;
    doorBtnMesh = null; doorPanel = null; doorPanelOrigY = null;
    doorOpen = false; doorAnimating = false; doorAnim = 0;
    hiddenRoomGroup = null;
  }

  room.built = false;
  room.artSlots = [];
  room.prefetching = false; /* allow prefetch again if room is rebuilt */
}

var sharedMats = [floorMat, wallMat, accentWallMat, panelMat, ceilMat, mouldMat, baseMat,
  frameMat, backMat, placeMat, benchMat, benchSeatMat, corrFloorMat,
  archMat, inlayMat, beamMat, trimMat, trackMat, pedestalMat,
  sharedVoxelMat, sharedExplodeVoxMat, sharedExplodeDebrisMat];
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
  doorBtnMesh = null; doorPanel = null; doorPanelOrigY = null;
  doorOpen = false; doorAnimating = false; doorAnim = 0;
  hiddenRoomGroup = null; hiddenRoomWalkZone = null;
  linksBtnMesh = null; linkPanelMeshes = []; linkPanelHovered = null;
  linkPanelsVisible = false; linkPanelGroup = null;
  planLayout(totalCount);

  /* Only build rooms 0 and 1 upfront — the rest are built lazily */
  buildRoom(0);
  if (rooms.length > 1) buildRoom(1);

  if (rooms.length) camera.position.set(rooms[0].cx, 2.2, rooms[0].zStart - 2);
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
    var inst = new THREE.InstancedMesh(sharedVoxelGeo, sharedVoxelMat, voxels.length);
    var m4 = new THREE.Matrix4();
    var scaleV = new THREE.Vector3(), posV = new THREE.Vector3(), quat = new THREE.Quaternion();
    for (var vi = 0; vi < voxels.length; vi++) {
      var v = voxels[vi];
      posV.set(v.x, v.y, VOXEL_SIZE * v.depth / 2);
      scaleV.set(1, 1, v.depth);
      m4.compose(posV, quat, scaleV);
      inst.setMatrixAt(vi, m4);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = false; inst.receiveShadow = false;
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
  renderer.initTexture(flatTex);  /* pre-upload to GPU immediately — avoids stutter on first toggle */
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
  var inst = new THREE.InstancedMesh(sharedVoxelGeo, sharedVoxelMat, voxels.length);
  var m4 = new THREE.Matrix4();
  var scaleV = new THREE.Vector3(), posV = new THREE.Vector3(), quat = new THREE.Quaternion();
  for (var vi = 0; vi < voxels.length; vi++) {
    var v = voxels[vi];
    posV.set(v.x, v.y, VOXEL_SIZE * v.depth / 2);
    scaleV.set(1, 1, v.depth);
    m4.compose(posV, quat, scaleV);
    inst.setMatrixAt(vi, m4);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = false; inst.receiveShadow = false;
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

  /* Pre-build all voxel + flat meshes for each frame, yielding between builds */
  var voxelMeshes = [], flatMeshes = [];
  for (var fi = 0; fi < frames.length; fi++) {
    voxelMeshes.push(buildVoxelFrame(frames[fi]));
    flatMeshes.push(buildFlatFrame(frames[fi]));
    await yieldToFrame();
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
    interval: 0.18,  /* seconds per frame */
  });
}

function stopHistoryAnim(animIdx) {
  var anim = historyAnims[animIdx];
  if (!anim) return;

  /* Remove current animation mesh from group (don't dispose here — arrays own the meshes) */
  var toRemove = [];
  anim.group.traverse(function(c) {
    if (c.userData && c.userData._historyAnim) toRemove.push(c);
  });
  toRemove.forEach(function(c) { anim.group.remove(c); });

  /* Dispose all pre-built meshes (single pass — no double-free) */
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

    /* Advance frame index */
    var nextIdx = (anim.frameIdx + 1) % anim.voxelMeshes.length;
    var showVoxel = !framesVisible;
    var nextMesh = showVoxel ? anim.voxelMeshes[nextIdx] : anim.flatMeshes[nextIdx];

    /* Add NEW mesh first (no blank-frame gap), then remove old */
    if (nextMesh) {
      nextMesh.userData._historyAnim = true;
      anim.group.add(nextMesh);
    }
    var old = [];
    anim.group.traverse(function(c) {
      if (c.userData && c.userData._historyAnim && c !== nextMesh) old.push(c);
    });
    old.forEach(function(c) { anim.group.remove(c); });
    anim.frameIdx = nextIdx;
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
    art.userData.wallSlot = { pos: slot.pos.clone(), ry: slot.ry };
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

/* ── Secret explode button — slightly warm-gray so it's subtly findable ──── */
function buildSecretButton() {
  var group = new THREE.Group();
  /* Plate — warm gray, just noticeable against wall */
  var plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.09, 0.014),
    new THREE.MeshStandardMaterial({ color: "#c8c0b4", roughness: 0.75, metalness: 0.04 })
  );
  plate.position.z = 0.007; group.add(plate);
  /* Button — protrudes, slightly lighter than plate */
  var btn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.030, 0.020, 20),
    new THREE.MeshStandardMaterial({ color: "#d8d0c6", roughness: 0.55, metalness: 0.05 })
  );
  btn.rotation.x = Math.PI / 2;
  btn.position.z = 0.021;
  btn.userData.isSecretBtn = true;
  group.add(btn);
  group.userData.btnMesh = btn;
  return group;
}

/* ── Secret door button — subtle but protruding, close to wall colour ───── */
function buildDoorButton() {
  var group = new THREE.Group();
  /* Backing plate — close to wall colour, slightly warmer */
  var plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, 0.022),
    new THREE.MeshStandardMaterial({ color: "#d8cfc0", roughness: 0.80, metalness: 0.06 })
  );
  plate.position.z = 0.011; group.add(plate);
  /* Round button — protrudes noticeably, slightly different sheen than wall */
  var btn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.040, 0.035, 24),
    new THREE.MeshStandardMaterial({ color: "#ccc4b4", roughness: 0.50, metalness: 0.12 })
  );
  btn.rotation.x = Math.PI / 2;
  btn.position.z = 0.040;
  btn.userData.isDoorBtn = true;
  group.add(btn);
  group.userData.btnMesh = btn;
  return group;
}

/* ── Hidden alcove room — built once, always exists, door slides to reveal ─ */
var ALCOVE_W = 6.0;   /* extends rightward from main room wall */
var ALCOVE_L = 5.0;   /* along Z */
var ALCOVE_H = ROOM_H;

function buildHiddenRoom(parentGroup, wallX, doorZ, roomH) {
  /* The alcove opens to the RIGHT of the main room (positive X direction).
     wallX is the X of the right wall. Alcove extends from wallX outward. */
  var aox = wallX + ALCOVE_W / 2;   /* alcove center X */
  var aoz = doorZ;                    /* alcove center Z aligned with door */

  var hg = new THREE.Group();
  hiddenRoomGroup = hg;

  /* Floor */
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(ALCOVE_W, ALCOVE_L), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(aox, 0.001, aoz); hg.add(floor);

  /* Ceiling */
  var ceil = new THREE.Mesh(new THREE.PlaneGeometry(ALCOVE_W, ALCOVE_L), ceilMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(aox, ALCOVE_H, aoz); hg.add(ceil);

  /* Back wall (far right) — dark feature wall for dramatic contrast */
  var backWall = new THREE.Mesh(new THREE.PlaneGeometry(ALCOVE_L, ALCOVE_H),
    new THREE.MeshStandardMaterial({ color: "#1a1814", roughness: 0.92 }));
  backWall.rotation.y = -Math.PI / 2;
  backWall.position.set(wallX + ALCOVE_W, ALCOVE_H / 2, aoz); hg.add(backWall);

  /* North side wall */
  var northWall = new THREE.Mesh(new THREE.PlaneGeometry(ALCOVE_W, ALCOVE_H), wallMat);
  northWall.position.set(aox, ALCOVE_H / 2, aoz - ALCOVE_L / 2); hg.add(northWall);

  /* South side wall */
  var southWall = new THREE.Mesh(new THREE.PlaneGeometry(ALCOVE_W, ALCOVE_H), wallMat);
  southWall.rotation.y = Math.PI;
  southWall.position.set(aox, ALCOVE_H / 2, aoz + ALCOVE_L / 2); hg.add(southWall);

  /* Door-frame pillars at the opening edges — offset 0.01 clear of wall plane to prevent Z-fighting */
  var pillarGeo = new THREE.BoxGeometry(0.18, ALCOVE_H, 0.18);
  [[aoz - ALCOVE_L / 2], [aoz + ALCOVE_L / 2]].forEach(function(pz) {
    var p = new THREE.Mesh(pillarGeo, archMat); p.position.set(wallX + 0.10, ALCOVE_H / 2, pz[0]); hg.add(p);
  });

  /* Warm spot light inside alcove */
  var alcoveLight = new THREE.SpotLight(0xfff0e0, 4.5, 9, Math.PI / 5, 0.5, 1.2);
  alcoveLight.position.set(wallX + ALCOVE_W * 0.8, ALCOVE_H - 0.2, aoz);
  alcoveLight.target.position.set(wallX + ALCOVE_W * 0.85, 3.0, aoz);
  hg.add(alcoveLight); hg.add(alcoveLight.target);

  /* ── Normie #9098 — large voxel art on the dark back wall ── */
  buildHiddenArt(hg, 9098, wallX + ALCOVE_W - 0.08, aoz, ALCOVE_H);

  /* ── Quote text plaque below the art ── */
  buildQuotePlaque(hg, wallX + ALCOVE_W - 0.08, aoz, ALCOVE_H);

  /* Door panel — thin wall section, perfectly flush, slides UP to open */
  var panelGeo = new THREE.BoxGeometry(0.04, ALCOVE_H, ALCOVE_L);
  var panel = new THREE.Mesh(panelGeo, wallMat);
  doorPanelOrigY = ALCOVE_H / 2;
  panel.position.set(wallX, doorPanelOrigY, aoz);
  doorPanel = panel;
  parentGroup.add(panel);  /* panel is always visible as part of the wall */

  /* Alcove geometry starts hidden — revealed when door opens */
  hg.visible = false;
  parentGroup.add(hg);

  /* Walk zone for the alcove — activated when door opens */
  hiddenRoomWalkZone = {
    minX: wallX, maxX: wallX + ALCOVE_W - 0.3,
    minZ: aoz - ALCOVE_L / 2 + 0.3, maxZ: aoz + ALCOVE_L / 2 - 0.3
  };
}

async function buildHiddenArt(parentGroup, tokenId, wallX, centerZ, roomH) {
  /* Show a large placeholder first */
  var ART_SCALE = 1.6;
  var artW = ART_W * ART_SCALE, artH = ART_H * ART_SCALE;

  /* Try to load normie #9098 from the API */
  var rgbaData = null;
  try { rgbaData = await fetchImageRGBA(tokenId); } catch (e) {}
  if (!rgbaData) {
    /* Fallback: dark placeholder */
    var ph = new THREE.Mesh(new THREE.PlaneGeometry(artW, artH),
      new THREE.MeshStandardMaterial({ color: "#2a2820", roughness: 0.9 }));
    ph.rotation.y = -Math.PI / 2;
    ph.position.set(wallX - 0.04, roomH * 0.42, centerZ);
    parentGroup.add(ph); return;
  }

  /* Build large voxel mesh */
  var BG_LUM = 180, voxels = [];
  for (var py = 0; py < GRID; py++) {
    for (var px2 = 0; px2 < GRID; px2++) {
      var idx = (py * GRID + px2) * 4;
      var rv = rgbaData[idx], gv = rgbaData[idx+1], bv = rgbaData[idx+2], av = rgbaData[idx+3];
      if (av < 10) continue;
      var lum = 0.299*rv + 0.587*gv + 0.114*bv;
      if (lum > BG_LUM) continue;
      voxels.push({ x:(px2-GRID/2+0.5)*CELL*ART_SCALE, y:(GRID/2-py-0.5)*CELL*ART_SCALE,
        r:rv/255, g:gv/255, b:bv/255, depth:1.5+(1-lum/BG_LUM)*4.5 });
    }
  }
  if (voxels.length) {
    var inst = new THREE.InstancedMesh(sharedVoxelGeo, hiddenVoxelMat, voxels.length);
    var m4 = new THREE.Matrix4();
    var scaleV = new THREE.Vector3(), posV = new THREE.Vector3(), quat = new THREE.Quaternion();
    for (var vi = 0; vi < voxels.length; vi++) {
      var v = voxels[vi];
      posV.set(v.x, v.y, VOXEL_SIZE * v.depth / 2);
      scaleV.set(ART_SCALE, ART_SCALE, v.depth);
      m4.compose(posV, quat, scaleV);
      inst.setMatrixAt(vi, m4);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = false;
    /* Orient facing left (into the alcove, away from the back wall) */
    var artGroup2 = new THREE.Group();
    artGroup2.add(inst);
    artGroup2.rotation.y = -Math.PI / 2;
    artGroup2.position.set(wallX - 0.06, roomH * 0.42, centerZ);
    parentGroup.add(artGroup2);
  }
}

/* ── "What is Art?" title sign for main room back wall ──────────────── */
function buildRoomTitleSign(parentGroup, cx, zEnd) {
  /* Text painted directly on wall — no backing, transparent canvas */
  var c = document.createElement("canvas"); c.width = 900; c.height = 180;
  var ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 900, 180);
  ctx.fillStyle = "rgba(42,36,32,0.72)";
  ctx.font = 'italic 400 58px Georgia, serif';
  ctx.textAlign = "center";
  ctx.fillText("What is Art?  What is Agent?", 450, 80);
  var tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  var plane = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.72),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.01 }));
  plane.position.set(cx, 4.6, zEnd + 0.012);
  plane.rotation.y = 0;
  parentGroup.add(plane);
}

/* ── Single link panel button ─────────────────────────────────────────────── */
function buildLinkPanel(label, desc) {
  var c = document.createElement("canvas"); c.width = 560; c.height = 200;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "#16120e"; ctx.fillRect(0, 0, 560, 200);
  ctx.fillStyle = "#6a5c30"; ctx.fillRect(24, 16, 512, 2);
  ctx.fillStyle = "#6a5c30"; ctx.fillRect(24, 182, 512, 2);
  ctx.fillStyle = "#d8cdb0";
  ctx.font = '600 52px "IBM Plex Mono", monospace';
  ctx.textAlign = "center";
  ctx.fillText(label, 280, 90);
  ctx.fillStyle = "#8a7e60";
  ctx.font = '400 28px "IBM Plex Mono", monospace';
  ctx.fillText(desc, 280, 148);
  var tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  var group = new THREE.Group();
  var backing = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.54, 0.06),
    new THREE.MeshStandardMaterial({ color: "#0e0c0a", roughness: 0.45, metalness: 0.10 }));
  group.add(backing);
  var face = new THREE.Mesh(new THREE.PlaneGeometry(1.46, 0.50),
    new THREE.MeshBasicMaterial({ map: tex }));
  face.position.z = 0.032;
  face.userData.isLinkPanel = true;
  group.add(face);
  group.userData.btnMesh = face;
  return group;
}

/* ── Links floor button + the whole panel cluster ─────────────────────────── */
function buildLinksSystem(parentGroup, cx, zMid) {
  /* Podium placed to the right of the centre bench */
  var podX = cx + 1.62;
  var podZ = zMid;

  /* ─ Stepped stone base */
  var baseLow = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.10, 0.60),
    new THREE.MeshPhysicalMaterial({ color: "#d4cfc4", roughness: 0.22, metalness: 0.06,
      clearcoat: 0.5, clearcoatRoughness: 0.10 }));
  baseLow.position.set(podX, 0.05, podZ); parentGroup.add(baseLow);

  var baseHigh = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.10, 0.48),
    new THREE.MeshPhysicalMaterial({ color: "#cac4b8", roughness: 0.20, metalness: 0.08,
      clearcoat: 0.55, clearcoatRoughness: 0.08 }));
  baseHigh.position.set(podX, 0.15, podZ); parentGroup.add(baseHigh);

  /* ─ Hexagonal shaft */
  var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 0.72, 6),
    new THREE.MeshPhysicalMaterial({ color: "#e0dbd0", roughness: 0.18, metalness: 0.05,
      clearcoat: 0.65, clearcoatRoughness: 0.08 }));
  shaft.position.set(podX, 0.56, podZ); parentGroup.add(shaft);

  /* ─ Capital disc */
  var capital = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.16, 0.05, 32),
    new THREE.MeshPhysicalMaterial({ color: "#d8d2c6", roughness: 0.15, metalness: 0.10,
      clearcoat: 0.70, clearcoatRoughness: 0.06 }));
  capital.position.set(podX, 0.945, podZ); parentGroup.add(capital);

  /* ─ Top plate */
  var plate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 32),
    new THREE.MeshStandardMaterial({ color: "#c8c2b4", roughness: 0.28, metalness: 0.14 }));
  plate.position.set(podX, 0.985, podZ); parentGroup.add(plate);

  /* ─ Button housing */
  var housing = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.04, 24),
    new THREE.MeshStandardMaterial({ color: "#3a3830", roughness: 0.18, metalness: 0.78 }));
  housing.position.set(podX, 1.015, podZ); parentGroup.add(housing);

  /* ─ The button itself */
  var btn = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.038, 24),
    new THREE.MeshStandardMaterial({ color: "#8c7c5c", roughness: 0.30, metalness: 0.55 }));
  btn.position.set(podX, 1.054, podZ);
  btn.userData.isLinksBtn = true;
  linksBtnMesh = btn;
  parentGroup.add(btn);

  /* ─ "links" label floating above the podium, facing the entrance (+z) */
  var lc = document.createElement("canvas"); lc.width = 320; lc.height = 72;
  var lctx = lc.getContext("2d");
  lctx.clearRect(0, 0, 320, 72);
  lctx.fillStyle = "rgba(42,36,32,0.72)";
  lctx.font = '500 44px "IBM Plex Mono", monospace';
  lctx.textAlign = "center";
  lctx.fillText("links", 160, 54);
  var ltex = new THREE.CanvasTexture(lc); ltex.colorSpace = THREE.SRGBColorSpace;
  var lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.145),
    new THREE.MeshBasicMaterial({ map: ltex, transparent: true, alphaTest: 0.01 }));
  lbl.position.set(podX, 1.32, podZ);
  /* PlaneGeometry default faces +z (toward entrance) — no rotation needed */
  parentGroup.add(lbl);

  /* ─ 3×3 curved arc — fans outward from podium toward the entrance */
  var pg = new THREE.Group();
  linkPanelMeshes = [];
  var COLS = 3, ROWS = 3;
  var arcRadius  = 4.0;
  var arcSpread  = 0.48;  /* half-angle (~27° each side) */
  var rowSpacing = 0.82;
  var gridY      = 2.55;
  for (var li = 0; li < LINKS_DATA.length; li++) {
    var col = li % COLS;
    var row = Math.floor(li / COLS);
    /* Angle sweeps left–right, arc fans away from entrance (into the room) */
    var angle = -arcSpread + col * arcSpread;
    var px = podX + Math.sin(angle) * arcRadius;
    var pz = podZ - Math.cos(angle) * arcRadius;
    var py = gridY + (1 - row) * rowSpacing;
    var panel = buildLinkPanel(LINKS_DATA[li].label, LINKS_DATA[li].desc);
    panel.position.set(px, py, pz);
    /* Face each panel back toward the podium (toward entrance side) */
    panel.rotation.y = -angle;
    pg.add(panel);
    linkPanelMeshes.push({ mesh: panel.userData.btnMesh, url: LINKS_DATA[li].url });
  }
  pg.visible = false;
  linkPanelGroup = pg;
  parentGroup.add(pg);
}

function buildQuotePlaque(parentGroup, wallX, centerZ, roomH) {
  var c = document.createElement("canvas"); c.width = 1400; c.height = 280;
  var ctx = c.getContext("2d");
  /* Dark background */
  ctx.fillStyle = "#141210"; ctx.fillRect(0, 0, 1400, 280);
  /* Subtle gold rules */
  ctx.fillStyle = "#6a5c30"; ctx.fillRect(36, 24, 1328, 2);
  ctx.fillStyle = "#6a5c30"; ctx.fillRect(36, 264, 1328, 2);
  /* Quote text */
  ctx.fillStyle = "#d8cdb0";
  ctx.font = 'italic 400 54px Georgia, serif';
  ctx.textAlign = "center";
  ctx.fillText("“Artists always tell you where the world is going,", 700, 102);
  ctx.fillText("you just have to pay attention.”", 700, 172);
  /* Normie ID below */
  ctx.fillStyle = "#7a6e56";
  ctx.font = '500 30px "IBM Plex Mono", monospace';
  ctx.fillText("normie #9098", 700, 232);
  var tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;

  var plaqueGroup = new THREE.Group();
  /* Backing */
  var backing = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.82, 2.9),
    new THREE.MeshStandardMaterial({ color: "#0e0c0a", roughness: 0.5 }));
  plaqueGroup.add(backing);
  /* Text plane */
  var plane = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.78),
    new THREE.MeshBasicMaterial({ map: tex }));
  plane.rotation.y = -Math.PI / 2;
  plane.position.x = -0.012;
  plaqueGroup.add(plane);
  plaqueGroup.position.set(wallX - 0.02, roomH * 0.18, centerZ);
  parentGroup.add(plaqueGroup);
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
    results.push({ group: grp, x: px, z: pz, isApple: ft === "apple", side: side });
  });
  return results;
}

/* ── Apple (green, leaf to the side like emoji) ───────────────────────────── */
function buildApple() {
  var g = new THREE.Group();
  var body = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 16, 14),
    new THREE.MeshPhysicalMaterial({ color: "#4a8c2a", roughness: 0.35, metalness: 0.04,
      clearcoat: 0.6, clearcoatRoughness: 0.1 })
  );
  body.scale.set(1, 1.08, 1);
  body.position.y = 0.11; g.add(body);
  /* Stem — slightly angled */
  var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.06, 6),
    new THREE.MeshStandardMaterial({ color: "#3a2010", roughness: 0.7 }));
  stem.position.set(0.01, 0.227, 0);
  stem.rotation.z = -0.18;
  g.add(stem);
  /* Leaf — angled out to the right like emoji */
  var leafShape = new THREE.Shape();
  leafShape.ellipse(0, 0, 0.038, 0.018, 0, Math.PI * 2);
  var leafGeo = new THREE.ShapeGeometry(leafShape);
  var leaf = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({ color: "#2e7020", roughness: 0.6, side: THREE.DoubleSide }));
  leaf.position.set(0.038, 0.248, 0);
  leaf.rotation.z = -0.55;
  g.add(leaf);
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
  /* Navel dimple */
  var navel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.006, 8),
    new THREE.MeshStandardMaterial({ color: "#7a4010", roughness: 0.9 }));
  navel.position.y = 0.222; g.add(navel);
  /* Stem */
  var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.005, 0.04, 6),
    new THREE.MeshStandardMaterial({ color: "#3a2c10", roughness: 0.7 }));
  stem.position.y = 0.235; g.add(stem);
  return g;
}

/* ── Raycaster + interaction ──────────────────────────────────────────────── */
var raycaster = new THREE.Raycaster(); raycaster.far = 3.5;
var screenCenter = new THREE.Vector2(0, 0);

/* ── Links floor button check ─────────────────────────────────────────────── */
function checkLinksBtnInteraction() {
  if (!inMuseum || !linksBtnMesh) { linksBtnHovered = false; return; }
  var wp = new THREE.Vector3();
  linksBtnMesh.getWorldPosition(wp);
  var prev = linksBtnHovered;
  linksBtnHovered = camera.position.distanceTo(wp) < 2.5;
  if (linksBtnHovered && !prev) updateInteractionHint(true, "links");
  if (!linksBtnHovered && prev && !buttonHovered && !historyBtnHovered) updateInteractionHint(false);
}

/* ── Link panel hover check ───────────────────────────────────────────────── */
function checkLinkPanelInteraction() {
  if (!inMuseum || !linkPanelsVisible || !linkPanelMeshes.length) {
    if (linkPanelHovered) { linkPanelHovered = null; updateInteractionHint(false); }
    return;
  }
  var prev = linkPanelHovered;
  if (isTouch) {
    var best = null, bestD = 3.0;
    linkPanelMeshes.forEach(function(lp) {
      var wp = new THREE.Vector3(); lp.mesh.getWorldPosition(wp);
      var d = camera.position.distanceTo(wp);
      if (d < bestD) { bestD = d; best = lp; }
    });
    linkPanelHovered = best;
  } else {
    raycaster.setFromCamera(screenCenter, camera);
    var meshes = linkPanelMeshes.map(function(lp) { return lp.mesh; });
    var hits = raycaster.intersectObjects(meshes, false);
    if (hits.length && hits[0].distance < 3.5) {
      var hitMesh = hits[0].object;
      linkPanelHovered = linkPanelMeshes.find(function(lp) { return lp.mesh === hitMesh; }) || null;
    } else {
      linkPanelHovered = null;
    }
  }
  if (linkPanelHovered && !prev) updateInteractionHint(true, "link");
  if (!linkPanelHovered && prev && !buttonHovered && !historyBtnHovered) updateInteractionHint(false);
}

function triggerHandPush() { pushAnim = 1.0; }

function pressLinksBtn() {
  if (!linkPanelGroup) return;
  triggerHandPush();
  linkPanelsVisible = !linkPanelsVisible;
  linkPanelGroup.visible = linkPanelsVisible;
  playButtonClick();
}

function pressLinkPanel(url) {
  window.open(url, "_blank", "noopener,noreferrer");
  playButtonClick();
}
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
  var hit = false;
  if (isTouch) {
    /* On touch: show hint only when very close; E works from full range (3.5) */
    var wp = new THREE.Vector3();
    activeBtn.getWorldPosition(wp);
    hit = camera.position.distanceTo(wp) < 2.0;
  } else {
    raycaster.setFromCamera(screenCenter, camera);
    var intersects = raycaster.intersectObject(activeBtn);
    hit = intersects.length > 0 && intersects[0].distance < 3.5;
  }
  if (hit !== buttonHovered) { buttonHovered = hit; updateInteractionHint(hit); }
}

/* ── Check if aiming at the secret explode button ─────────────────────────── */
function checkSecretButtonInteraction() {
  if (!inMuseum || !secretBtnMesh || explodeActive) {
    if (secretBtnHovered) { secretBtnHovered = false; }
    return;
  }
  if (isTouch) {
    var wp7 = new THREE.Vector3();
    secretBtnMesh.getWorldPosition(wp7);
    secretBtnHovered = camera.position.distanceTo(wp7) < 4.0;
  } else {
    raycaster.setFromCamera(screenCenter, camera);
    var hits = raycaster.intersectObject(secretBtnMesh, true);
    secretBtnHovered = hits.length > 0 && hits[0].distance < 4.0;
  }
  /* No visible hint — intentionally secret */
}

/* ── Check if aiming at the secret door button ────────────────────────────── */
function checkDoorButtonInteraction() {
  if (!inMuseum || !doorBtnMesh) {
    if (doorBtnHovered) { doorBtnHovered = false; }
    return;
  }
  var hit = false;
  if (isTouch) {
    var wp2 = new THREE.Vector3();
    doorBtnMesh.getWorldPosition(wp2);
    hit = camera.position.distanceTo(wp2) < 2.0;
  } else {
    raycaster.setFromCamera(screenCenter, camera);
    var hits = raycaster.intersectObject(doorBtnMesh, true);
    hit = hits.length > 0 && hits[0].distance < 2.5;
  }
  doorBtnHovered = hit;
}

/* ── Door open/close toggle ───────────────────────────────────────────────── */
function pressDoorButton() {
  if (doorAnimating || !doorPanel) return;
  triggerHandPush();
  doorOpen = !doorOpen;
  doorAnimating = true;
  /* Depress button briefly */
  if (doorBtnMesh) doorBtnMesh.position.z -= 0.012;
  setTimeout(function() { if (doorBtnMesh) doorBtnMesh.position.z += 0.012; }, 140);
  playDoorSound(doorOpen);
  /* Show hidden room geometry while animating open */
  if (doorOpen && hiddenRoomGroup) hiddenRoomGroup.visible = true;
  /* Add/remove walk zone when toggled open/closed */
  if (doorOpen && hiddenRoomWalkZone) {
    walkZones.push(hiddenRoomWalkZone);
  }
}

function smoothstep(t) { return t * t * (3 - 2 * t); }

function tickDoorAnim(dt) {
  if (!doorAnimating || !doorPanel) return;
  var speed = 0.9;  /* slower for smoother feel */
  if (doorOpen) {
    doorAnim = Math.min(1, doorAnim + dt * speed);
  } else {
    doorAnim = Math.max(0, doorAnim - dt * speed);
  }
  /* Smooth eased slide UP */
  var eased = smoothstep(doorAnim);
  var slideY = doorPanelOrigY + eased * (ALCOVE_H + 0.2);
  doorPanel.position.y = slideY;
  if (doorAnim >= 1 || doorAnim <= 0) {
    doorAnimating = false;
    if (!doorOpen && hiddenRoomGroup) {
      hiddenRoomGroup.visible = false;
      var idx = walkZones.indexOf(hiddenRoomWalkZone);
      if (idx >= 0) walkZones.splice(idx, 1);
    }
  }
}

function playDoorSound(opening) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  var now = audioCtx.currentTime;
  /* Low mechanical rumble */
  var osc = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(opening ? 55 : 80, now);
  osc.frequency.linearRampToValueAtTime(opening ? 80 : 40, now + 0.5);
  gain.gain.setValueAtTime(sfxVolume * 0.07, now);
  gain.gain.linearRampToValueAtTime(0, now + 0.55);
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(now); osc.stop(now + 0.6);
  /* Higher click */
  var osc2 = audioCtx.createOscillator();
  var gain2 = audioCtx.createGain();
  osc2.type = "square";
  osc2.frequency.setValueAtTime(320, now);
  gain2.gain.setValueAtTime(sfxVolume * 0.04, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc2.connect(gain2); gain2.connect(audioCtx.destination);
  osc2.start(now); osc2.stop(now + 0.1);
}

/* ── Check if aiming at a history button ──────────────────────────────────── */
function checkHistoryInteraction() {
  if (!inMuseum) {
    if (historyBtnHovered) { historyBtnHovered = false; hoveredHistoryGroup = null; }
    return;
  }

  if (isTouch) {
    /* On touch: find nearest art group with history within range */
    var bestDist3 = 2.0, bestGroup = null;  /* hint range: close only */
    artGroup.traverse(function(c) {
      if (c.userData && c.userData.hasHistory) {
        var d = camera.position.distanceTo(c.position);
        if (d < bestDist3) { bestDist3 = d; bestGroup = c; }
      }
    });
    if (bestGroup) {
      hoveredHistoryGroup = bestGroup;
      if (!historyBtnHovered) { historyBtnHovered = true; updateInteractionHint(true, "history"); }
      return;
    }
    historyBtnHovered = false; hoveredHistoryGroup = null;
    if (!buttonHovered) updateInteractionHint(false);
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
  if (!buttonHovered) updateInteractionHint(false);
}

function updateInteractionHint(show, mode) {
  var el = document.getElementById("interaction-hint");
  if (!el) return;
  if (mode === "history") {
    el.querySelector(".hint-desktop").textContent = "[E] play history";
    el.querySelector(".hint-touch").textContent = "tap to play history";
  } else if (mode === "links") {
    el.querySelector(".hint-desktop").textContent = "[E] links";
    el.querySelector(".hint-touch").textContent = "tap for links";
  } else if (mode === "link") {
    el.querySelector(".hint-desktop").textContent = "[E] open link";
    el.querySelector(".hint-touch").textContent = "tap to open";
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
  if (buttonHovered || historyBtnHovered || linksBtnHovered || linkPanelHovered) { hintDismissTimer = HINT_PERSIST; return; }
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
  triggerHandPush();
  framesVisible = !framesVisible;

  /* Collect tokenIds that currently have a history animation playing */
  var animatingTokens = {};
  for (var hi = 0; hi < historyAnims.length; hi++) {
    animatingTokens[historyAnims[hi].tokenId] = true;
  }

  for (var ai = 0; ai < artGroup.children.length; ai++) {
    var artGrp = artGroup.children[ai];
    /* If this art group has an active history animation, swap its displayed frame */
    if (artGrp.userData && artGrp.userData.tokenId && animatingTokens[artGrp.userData.tokenId]) {
      var anim = historyAnims.find(function(a) { return a.tokenId === artGrp.userData.tokenId; });
      if (anim) {
        /* Add new mesh first, then remove old (prevents blank-frame flash) */
        var showVoxel = !framesVisible;
        var newMesh = showVoxel ? anim.voxelMeshes[anim.frameIdx] : anim.flatMeshes[anim.frameIdx];
        if (newMesh) { newMesh.userData._historyAnim = true; artGrp.add(newMesh); }
        var oldH = [];
        artGrp.traverse(function(c) { if (c.userData && c.userData._historyAnim && c !== newMesh) oldH.push(c); });
        oldH.forEach(function(c) { artGrp.remove(c); });
      }
      /* Keep original children hidden — history owns the display */
      continue;
    }
    /* Normal art group — toggle visibility */
    artGrp.traverse(function(child) {
      if (!child.userData) return;
      if (child.userData._historyAnim) return;  /* skip stale history meshes */
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
  /* Reset shared explosion material opacity (in case of re-trigger after fade) */
  sharedExplodeVoxMat.opacity = 1.0;
  sharedExplodeDebrisMat.opacity = 1.0;
  /* Depress the button */
  secretBtnMesh.position.z -= 0.01;
  playExplodeSound();

  /* Collect ALL art groups: on-wall + dropped */
  var toExplode = [];
  artGroup.traverse(function(c) {
    if (c !== artGroup && c.parent === artGroup) toExplode.push(c);
  });
  droppedArts.forEach(function(da) { toExplode.push(da.group); });

  toExplode.forEach(function(artG) {
    var worldPos = new THREE.Vector3();
    artG.getWorldPosition(worldPos);
    /* Collect voxel colors from instanced mesh */
    var instMesh = null;
    artG.traverse(function(ch) { if (ch.isInstancedMesh) instMesh = ch; });
    var numVoxels = instMesh ? Math.min(instMesh.count, 200) : 40;
    var dummy = new THREE.Matrix4(), col = new THREE.Color();
    for (var vi = 0; vi < numVoxels; vi++) {
      if (instMesh) { instMesh.getMatrixAt(vi, dummy); }
      var sz = VOXEL_SIZE * (1.4 + Math.random() * 1.2);
      var vox = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), sharedExplodeVoxMat);
      vox.position.copy(worldPos);
      vox.position.x += (Math.random() - 0.5) * ART_W;
      vox.position.y += (Math.random() - 0.5) * ART_H + ART_H * 0.5;
      vox.position.z += (Math.random() - 0.5) * ART_W * 0.6;
      scene.add(vox);
      /* Radial + upward velocity burst */
      var angle = Math.random() * Math.PI * 2;
      var spd   = 4 + Math.random() * 10;
      explodeParticles.push({
        mesh: vox,
        vel: new THREE.Vector3(
          Math.cos(angle) * spd,
          Math.random() * 9 + 3,
          Math.sin(angle) * spd * 0.7
        ),
        rot: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4),
        life: 10.0
      });
    }
    /* Extra tiny debris for visual richness */
    for (var di2 = 0; di2 < 30; di2++) {
      var ds = VOXEL_SIZE * (0.5 + Math.random() * 0.8);
      var dv = new THREE.Mesh(new THREE.BoxGeometry(ds, ds, ds), sharedExplodeDebrisMat);
      dv.position.copy(worldPos);
      dv.position.x += (Math.random() - 0.5) * ART_W * 1.4;
      dv.position.y += Math.random() * ART_H;
      dv.position.z += (Math.random() - 0.5) * ART_W * 1.4;
      scene.add(dv);
      var angle2 = Math.random() * Math.PI * 2;
      var spd2   = 6 + Math.random() * 12;
      explodeParticles.push({
        mesh: dv,
        vel: new THREE.Vector3(Math.cos(angle2) * spd2, Math.random() * 12 + 4, Math.sin(angle2) * spd2),
        rot: new THREE.Vector3(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6),
        life: 10.0
      });
    }
    /* Hide original art */
    artG.visible = false;
  });
}

function tickExplode(dt) {
  if (!explodeActive) return;
  var FADE_START = 2.5;  /* seconds before reset when fade begins */
  /* Apply fade to shared materials once per tick (all particles share them) */
  if (explodeResetTimer < FADE_START) {
    var fadeT = Math.max(0, explodeResetTimer / FADE_START);
    sharedExplodeVoxMat.opacity = fadeT;
    sharedExplodeDebrisMat.opacity = fadeT;
  }
  /* Tick particles */
  for (var pi = 0; pi < explodeParticles.length; pi++) {
    var p = explodeParticles[pi];
    p.vel.y += GRAVITY * dt;
    /* Wall bounce for particles too */
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += p.rot.x * dt;
    p.mesh.rotation.y += p.rot.y * dt;
    p.mesh.rotation.z += p.rot.z * dt;
    /* Bounce/settle on floor */
    if (p.mesh.position.y < 0.04) {
      p.mesh.position.y = 0.04;
      p.vel.y = Math.abs(p.vel.y) * 0.25;
      p.vel.x *= 0.65; p.vel.z *= 0.65;
    }
    p.life -= dt;
  }
  /* Reset timer */
  explodeResetTimer -= dt;
  if (explodeResetTimer <= 0) {
    /* Remove particles */
    explodeParticles.forEach(function(p) { scene.remove(p.mesh); dispose(p.mesh); });
    explodeParticles = [];
    /* Snap all dropped arts back to wall slots */
    for (var ri3 = droppedArts.length - 1; ri3 >= 0; ri3--) {
      var da3 = droppedArts[ri3];
      var ag3 = da3.group;
      scene.remove(ag3);
      if (ag3.userData.wallSlot) {
        ag3.position.copy(ag3.userData.wallSlot.pos);
        ag3.rotation.set(0, ag3.userData.wallSlot.ry, 0);
        ag3.scale.setScalar(1);
        artGroup.add(ag3);
      } else { dispose(ag3); }
    }
    droppedArts = [];
    /* Cancel any active drag */
    if (isDragging && draggedArt) {
      var dart2 = draggedArt; draggedArt = null; isDragging = false;
      scene.remove(dart2);
      if (dart2.userData.wallSlot) {
        dart2.position.copy(dart2.userData.wallSlot.pos);
        dart2.rotation.set(0, dart2.userData.wallSlot.ry, 0);
        dart2.scale.setScalar(1);
        artGroup.add(dart2);
      } else { dispose(dart2); }
    }
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
    gain.gain.setValueAtTime(sfxVolume * 0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + i * 0.05);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now + i * 0.01); osc.stop(now + 0.8);
  });
}

function tryInteract() {
  if (linkPanelHovered) { pressLinkPanel(linkPanelHovered.url); return; }
  if (linksBtnHovered) { pressLinksBtn(); return; }
  if (secretBtnHovered) { pressSecretButton(); return; }
  if (doorBtnHovered) { pressDoorButton(); return; }
  if (historyBtnHovered && hoveredHistoryGroup) {
    var tid = hoveredHistoryGroup.userData.tokenId;
    toggleHistoryAnim(hoveredHistoryGroup, tid);
    return;
  }
  if (buttonHovered) { pressButton(); return; }

  /* Touch fallback: wider range (3.5u) for E/interact button even if hint isn't showing */
  if (isTouch) {
    /* Podium button */
    var activeBtn2 = getActivePodiumBtn();
    if (activeBtn2) {
      var wp3 = new THREE.Vector3();
      activeBtn2.getWorldPosition(wp3);
      if (camera.position.distanceTo(wp3) < 3.5) { pressButton(); return; }
    }
    /* Door button */
    if (doorBtnMesh) {
      var wp4 = new THREE.Vector3();
      doorBtnMesh.getWorldPosition(wp4);
      if (camera.position.distanceTo(wp4) < 3.5) { pressDoorButton(); return; }
    }
    /* History art */
    var bestD = 3.5, bestG = null;
    artGroup.traverse(function(c) {
      if (c.userData && c.userData.hasHistory) {
        var d = camera.position.distanceTo(c.position);
        if (d < bestD) { bestD = d; bestG = c; }
      }
    });
    if (bestG) { toggleHistoryAnim(bestG, bestG.userData.tokenId); return; }
    /* Links floor button / link panels (touch fallback) */
    if (linksBtnMesh && !linksBtnHovered) {
      var wpl = new THREE.Vector3(); linksBtnMesh.getWorldPosition(wpl);
      if (camera.position.distanceTo(wpl) < 3.5) { pressLinksBtn(); return; }
    }
    if (linkPanelsVisible && linkPanelMeshes.length && !linkPanelHovered) {
      var bestLinkD = 3.5, bestLink = null;
      linkPanelMeshes.forEach(function(lp) {
        var wplp = new THREE.Vector3(); lp.mesh.getWorldPosition(wplp);
        var d = camera.position.distanceTo(wplp);
        if (d < bestLinkD) { bestLinkD = d; bestLink = lp; }
      });
      if (bestLink) { pressLinkPanel(bestLink.url); return; }
    }
    /* Secret explode button */
    if (secretBtnMesh && !explodeActive) {
      var wp5 = new THREE.Vector3();
      secretBtnMesh.getWorldPosition(wp5);
      if (camera.position.distanceTo(wp5) < 4.0) { pressSecretButton(); return; }
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
  gain.gain.setValueAtTime(sfxVolume * 0.08, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.06);
}

function playJumpSound() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  var now = audioCtx.currentTime;
  var osc = audioCtx.createOscillator(); var gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(440, now + 0.09);
  gain.gain.setValueAtTime(sfxVolume * 0.13, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
  osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.17);
}

function playGrabSound() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  var now = audioCtx.currentTime;
  var osc = audioCtx.createOscillator(); var gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(110, now + 0.06);
  gain.gain.setValueAtTime(sfxVolume * 0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.08);
}

function playDropFloorSound() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  var now = audioCtx.currentTime;
  var osc = audioCtx.createOscillator(); var gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(130, now); osc.frequency.exponentialRampToValueAtTime(48, now + 0.13);
  gain.gain.setValueAtTime(sfxVolume * 0.18, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.15);
}

function playWallSnapSound() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  var now = audioCtx.currentTime;
  var osc = audioCtx.createOscillator(); var gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(820, now); osc.frequency.exponentialRampToValueAtTime(380, now + 0.06);
  gain.gain.setValueAtTime(sfxVolume * 0.11, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.08);
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
  isJumping = false; jumpVelocity = 0; GROUND_Y = 2.2;
  /* Reset drag state */
  if (draggedArt) { scene.remove(draggedArt); dispose(draggedArt); draggedArt = null; }
  isDragging = false; dragVelocity.set(0, 0, 0);
  droppedArts.forEach(function(da) { scene.remove(da.group); dispose(da.group); });
  droppedArts = [];
  /* Reset explode state */
  explodeParticles.forEach(function(p) { scene.remove(p.mesh); dispose(p.mesh); });
  explodeParticles = []; explodeActive = false; explodeResetTimer = 0;
  secretBtnMesh = null; secretBtnHovered = false;
  /* Reset door state */
  doorBtnMesh = null; doorPanel = null; doorPanelOrigY = null;
  doorOpen = false; doorAnimating = false; doorAnim = 0;
  hiddenRoomGroup = null; hiddenRoomWalkZone = null;
  overlayEl.classList.remove("hidden");
  hudEl.classList.add("hud-hidden");
  clearArt(); setStatus("");
  camera.position.set(0, 2.2, 2);
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

  /* Let user pick which normies to display */
  /* Fetch all metas in parallel to get AP, then sort highest AP first */
  setStatus("sorting by level\u2026");
  try {
    await Promise.all(allTokenIds.map(function(tid) { return fetchTokenMeta(tid).catch(function() {}); }));
  } catch (e) {}
  allTokenIds.sort(function(a, b) {
    var apA = (metaCache.get(a) || {}).ap || 0;
    var apB = (metaCache.get(b) || {}).ap || 0;
    return apB - apA;
  });

  setBusy(false);
  /* Push wallet to URL hash so it can be shared / linked */
  try { window.history.replaceState(null, "", "#w=" + encodeURIComponent(rawInput.trim())); } catch (e) {}
  showSelectionGrid(allTokenIds, addresses);
}

/* ── Normie selection grid ────────────────────────────────────────────────── */
var _selAddresses = [];  /* saved for HUD label after entering */
var _selTokenIds = [];
var _selSelected = new Set();
var _selPage = 0;
var MAX_GALLERY_SELECT = 40;
var SEL_PAGE_SIZE = 50;

function showSelectionGrid(tokenIds, addresses) {
  _selAddresses = addresses || [];
  _selTokenIds = tokenIds;
  _selSelected = new Set();
  _selPage = 0;

  selectionCountEl.textContent = "0 / " + MAX_GALLERY_SELECT + " selected";
  selectionLoadBtn2.disabled = true;
  selectionOverlay.classList.remove("selection-hidden");
  setStatus(tokenIds.length + " normies found \u2014 pick up to " + MAX_GALLERY_SELECT + (tokenIds.length > 40 ? " (40 max)" : ""));

  renderSelPage();

  selectionLoadBtn2.onclick = function() {
    if (_selSelected.size === 0) return;
    selectionOverlay.classList.add("selection-hidden");
    enterWithSelection([..._selSelected]);
  };
  selectionCancelBtn.onclick = function() {
    selectionOverlay.classList.add("selection-hidden");
    setStatus(_selTokenIds.length + " normies found.");
  };
  var prevBtn = $("selPrevBtn"), nextBtn = $("selNextBtn");
  if (prevBtn) prevBtn.onclick = function() {
    if (_selPage > 0) { _selPage--; renderSelPage(); }
  };
  if (nextBtn) nextBtn.onclick = function() {
    var totalPages = Math.ceil(_selTokenIds.length / SEL_PAGE_SIZE);
    if (_selPage < totalPages - 1) { _selPage++; renderSelPage(); }
  };
}

function renderSelPage() {
  var totalPages = Math.max(1, Math.ceil(_selTokenIds.length / SEL_PAGE_SIZE));
  var start = _selPage * SEL_PAGE_SIZE;
  var end = Math.min(start + SEL_PAGE_SIZE, _selTokenIds.length);
  var pageTokens = _selTokenIds.slice(start, end);
  var full = _selSelected.size >= MAX_GALLERY_SELECT;

  selectionGrid.innerHTML = "";
  pageTokens.forEach(function(tokenId) {
    var card = document.createElement("div");
    card.className = "normie-card";
    if (_selSelected.has(tokenId)) card.classList.add("selected");
    else if (full) card.classList.add("disabled");
    card.dataset.id = tokenId;

    var img = document.createElement("img");
    img.className = "normie-img";
    img.src = NORMIES_API + "/normie/" + tokenId + "/image.png";
    img.alt = "#" + tokenId;
    img.loading = "lazy";
    img.width = 120; img.height = 120;
    card.appendChild(img);

    var label = document.createElement("div");
    label.className = "normie-card-label";
    var ap = (metaCache.get(tokenId) || {}).ap;
    label.textContent = "#" + tokenId + (ap ? " \u00b7 " + ap + "ap" : "");
    card.appendChild(label);

    card.addEventListener("click", function() {
      if (_selSelected.has(tokenId)) {
        _selSelected.delete(tokenId); card.classList.remove("selected");
      } else {
        if (_selSelected.size >= MAX_GALLERY_SELECT) return;
        _selSelected.add(tokenId); card.classList.add("selected");
      }
      var nowFull = _selSelected.size >= MAX_GALLERY_SELECT;
      selectionGrid.querySelectorAll(".normie-card").forEach(function(c) {
        if (!c.classList.contains("selected")) c.classList.toggle("disabled", nowFull);
      });
      selectionCountEl.textContent = _selSelected.size + " / " + MAX_GALLERY_SELECT + " selected";
      selectionLoadBtn2.disabled = _selSelected.size === 0;
    });

    selectionGrid.appendChild(card);
  });

  /* Pagination controls */
  var pag = $("selectionPagination");
  if (pag) {
    pag.style.display = totalPages > 1 ? "flex" : "none";
    var pi = $("selPageInfo");
    if (pi) pi.textContent = (_selPage + 1) + " / " + totalPages;
    var pb = $("selPrevBtn"), nb = $("selNextBtn");
    if (pb) pb.disabled = _selPage === 0;
    if (nb) nb.disabled = _selPage >= totalPages - 1;
  }
  selectionGrid.scrollTop = 0;
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

/* Mobile duplicate nav buttons */
(function() {
  var ham    = $("navHamburger");
  var drop   = $("navDropdown");
  var themM  = $("themeToggleMobile");
  var aboutM = $("aboutBtnMobile");
  var homeM  = $("homeBtnMobile");
  if (ham && drop) {
    ham.addEventListener("click", function() {
      var open = drop.classList.toggle("open");
      ham.setAttribute("aria-expanded", open ? "true" : "false");
      drop.setAttribute("aria-hidden", open ? "false" : "true");
    });
    document.addEventListener("click", function(e) {
      if (!drop.classList.contains("open")) return;
      if (!drop.contains(e.target) && e.target !== ham && !ham.contains(e.target)) {
        drop.classList.remove("open");
        ham.setAttribute("aria-expanded", "false");
        drop.setAttribute("aria-hidden", "true");
      }
    });
  }
  if (themM) {
    themM.addEventListener("click", function() {
      var isDark = document.documentElement.getAttribute("data-theme") === "dark";
      var next = isDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("normuseum-theme", next);
    });
  }
  if (aboutM) aboutM.addEventListener("click", function(e) {
    e.preventDefault();
    if (drop) { drop.classList.remove("open"); ham && ham.setAttribute("aria-expanded", "false"); }
    showAboutPage();
  });
  if (homeM) homeM.addEventListener("click", function(e) {
    e.preventDefault();
    if (drop) { drop.classList.remove("open"); ham && ham.setAttribute("aria-expanded", "false"); }
    showLandingPage();
  });
})();
exitBtn.addEventListener("click", exitMuseum);
loadBtn.addEventListener("click", function() { loadMuseumForWallets(walletInput.value); });
walletInput.addEventListener("keydown", function(e) { if (e.key === "Enter") loadMuseumForWallets(walletInput.value); });
document.getElementById("interaction-hint").addEventListener("click", function(e) { e.stopPropagation(); tryInteract(); });

/* Auto-load from URL hash — e.g. normuseum.app/#w=0xabc… */
(function checkHashAutoLoad() {
  var m = window.location.hash.match(/^#w=(.+)$/);
  if (!m) return;
  var decoded = "";
  try { decoded = decodeURIComponent(m[1]); } catch (e) { return; }
  if (!decoded) return;
  walletInput.value = decoded;
  loadMuseumForWallets(decoded);
})();

/* ── Help tooltip ─────────────────────────────────────────────────────────── */
var helpBtn = $("helpBtn");
var helpPanel = $("helpPanel");
if (helpBtn && helpPanel) {
  helpBtn.addEventListener("click", function() { helpPanel.classList.toggle("visible"); });
}
var helpPanelClose = $("helpPanelClose");
if (helpPanelClose && helpPanel) {
  helpPanelClose.addEventListener("click", function() { helpPanel.classList.remove("visible"); });
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

/* Touch action buttons — jump / interact / grab */
(function() {
  var jumpBtn     = $("touchJumpBtn");
  var interactBtn = $("touchInteractBtn");
  var grabBtn     = $("touchGrabBtn");
  if (jumpBtn) {
    jumpBtn.addEventListener("touchstart", function(e) {
      e.preventDefault(); e.stopPropagation();
      if (!isJumping) { isJumping = true; jumpVelocity = JUMP_FORCE; }
    }, { passive: false });
  }
  if (interactBtn) {
    interactBtn.addEventListener("touchstart", function(e) {
      e.preventDefault(); e.stopPropagation();
      tryInteract();
    }, { passive: false });
  }
  if (grabBtn) {
    grabBtn.addEventListener("touchstart", function(e) {
      e.preventDefault(); e.stopPropagation();
      if (isDragging) {
        /* drop / throw */
        isDragging = false;
        if (draggedArt) {
          draggedArt.userData.dragging = false;
          droppedArts.push({ group: draggedArt, velocity: dragVelocity.clone().multiplyScalar(8), onGround: false });
          draggedArt = null;
        }
      } else {
        /* try to grab nearest art */
        var bestDist = 3.5, bestArt = null;
        for (var _i = 0; _i < artGroup.children.length; _i++) {
          var _ag = artGroup.children[_i];
          var _d = camera.position.distanceTo(_ag.position);
          if (_d < bestDist) { bestDist = _d; bestArt = _ag; }
        }
        for (var _j = 0; _j < droppedArts.length; _j++) {
          var _dg = droppedArts[_j].group;
          var _dd = camera.position.distanceTo(_dg.position);
          if (_dd < bestDist) { bestDist = _dd; bestArt = _dg; }
        }
        if (bestArt) {
          draggedArt = bestArt;
          draggedArt.userData.dragging = true;
          isDragging = true;
          dragOffset.subVectors(draggedArt.position, camera.position);
          /* remove from droppedArts if present */
          droppedArts = droppedArts.filter(function(da) { return da.group !== draggedArt; });
        }
      }
    }, { passive: false });
  }
})();

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
  });
}
document.addEventListener("click", function(e) {
  if (audioPanelEl && audioPanelEl.classList.contains("visible")) {
    if (!audioPanelEl.contains(e.target) && e.target !== musicBtn) audioPanelEl.classList.remove("visible");
  }
  var settingsPanelEl = $("settingsPanel");
  if (settingsPanelEl && settingsPanelEl.classList.contains("visible")) {
    var settBtn = $("settingsBtn");
    if (!settingsPanelEl.contains(e.target) && e.target !== settBtn) settingsPanelEl.classList.remove("visible");
  }
});

/* ── Settings panel wiring ────────────────────────────────────────────────── */
(function wireSettings() {
  var settBtn = $("settingsBtn");
  var settPanel = $("settingsPanel");
  if (settBtn && settPanel) {
    settBtn.addEventListener("click", function(e) {
      settPanel.classList.toggle("visible"); e.stopPropagation();
    });
  }
  var resetBtn = $("resetGalleryBtn");
  if (resetBtn) resetBtn.addEventListener("click", function() {
    resetGallery();
    if (settPanel) settPanel.classList.remove("visible");
  });
  var tss = $("timeSpeedSlider");
  if (tss) tss.addEventListener("input", function() { timeScale = parseFloat(this.value); });
  var armsEl = $("armsToggle");
  if (armsEl) {
    armsEl.checked = showArms;
    armsEl.addEventListener("change", function() {
      showArms = this.checked; armsGroup.visible = showArms;
    });
  }
  var xhEl = $("crosshairToggle");
  if (xhEl) {
    xhEl.checked = showCrosshair;
    xhEl.addEventListener("change", function() {
      showCrosshair = this.checked;
      document.body.classList.toggle("no-crosshair", !showCrosshair);
    });
  }
})();

/* ── Pointer lock (desktop) ───────────────────────────────────────────────── */
if (!isTouch && controls) {
  renderer.domElement.addEventListener("click", function() {
    if (!inMuseum) return;
    if (controls.isLocked) tryInteract(); else controls.lock();
  });
  controls.addEventListener("lock", function()   { document.body.classList.add("locked"); });
  controls.addEventListener("unlock", function() { document.body.classList.remove("locked"); });

  /* Right mouse button — toggle grab/drop with single mousedown; also picks up from floor */
  renderer.domElement.addEventListener("mousedown", function(e) {
    if (!inMuseum || !controls.isLocked || e.button !== 2) return;
    e.preventDefault();
    if (isDragging) { dropDraggedArt(); return; }

    var artRay = new THREE.Raycaster(); artRay.far = 4.5;
    artRay.setFromCamera(screenCenter, camera);

    /* Build candidate list from artGroup children AND droppedArts in scene */
    var candidates = [];
    var candidateRoots = new Map();
    artGroup.traverse(function(c) {
      if (c.isMesh && c !== artGroup) {
        candidates.push(c);
        var root = c;
        while (root.parent && root.parent !== artGroup) root = root.parent;
        candidateRoots.set(c, root);
      }
    });
    for (var dri = 0; dri < droppedArts.length; dri++) {
      (function(da) {
        da.group.traverse(function(c) {
          if (c.isMesh) { candidates.push(c); candidateRoots.set(c, da.group); }
        });
      })(droppedArts[dri]);
    }

    var hits = artRay.intersectObjects(candidates, false);
    if (!hits.length) return;
    var root = candidateRoots.get(hits[0].object);
    if (!root) return;

    /* Detach to world space */
    var worldPos = new THREE.Vector3(); root.getWorldPosition(worldPos);
    var worldQuat = new THREE.Quaternion(); root.getWorldQuaternion(worldQuat);
    if (root.parent) root.parent.remove(root);

    /* Remove from droppedArts if it was there */
    for (var dii = droppedArts.length - 1; dii >= 0; dii--) {
      if (droppedArts[dii].group === root) { droppedArts.splice(dii, 1); break; }
    }

    scene.add(root);
    root.position.copy(worldPos);
    root.quaternion.copy(worldQuat);
    draggedArt = root;
    isDragging = true;
    dragVelocity.set(0, 0, 0);
    playGrabSound();
  });

  /* Prevent context menu while pointer is locked */
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
    if (e.code === "Space" && inMuseum && !isJumping) {
      e.preventDefault(); isJumping = true; jumpVelocity = JUMP_FORCE;
      playJumpSound();
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
var JOY_R = 36, LOOK_SENS = 0.0038;
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
    var landY = 2.2;  /* default ground */
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
    var floorY = 2.2;
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

  /* Check if close enough to snap back to original wall slot */
  var slot = art.userData.wallSlot;
  if (slot) {
    var dx = art.position.x - slot.pos.x;
    var dy = art.position.y - slot.pos.y;
    var dz = art.position.z - slot.pos.z;
    if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 2.2) {
      scene.remove(art);
      art.position.copy(slot.pos);
      art.rotation.set(0, slot.ry, 0);
      art.scale.setScalar(1);
      artGroup.add(art);
      playWallSnapSound();
      return;
    }
  }

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
  var PUSH_RADIUS = 0.88;
  var ART_HALF    = 1.1;   /* approx. half-width used for wall/normie collision */
  var CEIL_Y      = ROOM_H - ART_HALF;
  var camX = camera.position.x, camZ = camera.position.z;

  for (var di = droppedArts.length - 1; di >= 0; di--) {
    var da = droppedArts[di];

    /* Player push physics */
    var pdx = da.group.position.x - camX, pdz = da.group.position.z - camZ;
    var pd = Math.sqrt(pdx * pdx + pdz * pdz);
    if (pd < PUSH_RADIUS && pd > 0.01) {
      var pf = (PUSH_RADIUS - pd) / PUSH_RADIUS * 6.5;
      da.velocity.x += (pdx / pd) * pf;
      da.velocity.z += (pdz / pd) * pf;
      if (da.onGround) { da.velocity.y += 1.2; da.onGround = false; }
    }

    if (da.onGround) continue;
    da.velocity.y += GRAVITY * dt;
    da.group.position.addScaledVector(da.velocity, dt);
    /* Lower cap to prevent tunnelling through walls */
    var maxLat = 12;
    if (Math.abs(da.velocity.x) > maxLat) da.velocity.x = Math.sign(da.velocity.x) * maxLat;
    if (Math.abs(da.velocity.z) > maxLat) da.velocity.z = Math.sign(da.velocity.z) * maxLat;
    /* Gentle spin while flying */
    var spinRate = (Math.abs(da.velocity.x) + Math.abs(da.velocity.z)) * 0.4;
    da.group.rotation.y += spinRate * dt;

    /* ── Find enclosing room for wall bounds ── */
    var px = da.group.position.x, py = da.group.position.y, pz = da.group.position.z;
    var roomMinX = -ROOM_W / 2 + ART_HALF, roomMaxX = ROOM_W / 2 - ART_HALF;
    var roomMinZ = pz - 100, roomMaxZ = pz + 100;  /* fallback: no Z clamp */
    for (var ri2 = 0; ri2 < rooms.length; ri2++) {
      var rm = rooms[ri2];
      if (pz >= rm.zEnd - 1.0 && pz <= rm.zStart + 1.0) {
        roomMinX = rm.cx - ROOM_W / 2 + ART_HALF;
        roomMaxX = rm.cx + ROOM_W / 2 - ART_HALF;
        roomMinZ = rm.zEnd   + ART_HALF;
        roomMaxZ = rm.zStart - ART_HALF;
        break;
      }
    }

    /* ── Wall bounce X ── */
    if (px < roomMinX) {
      da.group.position.x = roomMinX;
      if (da.velocity.x < 0) { da.velocity.x = -da.velocity.x * 0.45; da.velocity.z *= 0.82; }
    } else if (px > roomMaxX) {
      da.group.position.x = roomMaxX;
      if (da.velocity.x > 0) { da.velocity.x = -da.velocity.x * 0.45; da.velocity.z *= 0.82; }
    }

    /* ── Wall bounce Z ── */
    if (pz < roomMinZ) {
      da.group.position.z = roomMinZ;
      if (da.velocity.z < 0) { da.velocity.z = -da.velocity.z * 0.45; da.velocity.x *= 0.82; }
    } else if (pz > roomMaxZ) {
      da.group.position.z = roomMaxZ;
      if (da.velocity.z > 0) { da.velocity.z = -da.velocity.z * 0.45; da.velocity.x *= 0.82; }
    }

    /* ── Ceiling bounce ── */
    if (py > CEIL_Y) {
      da.group.position.y = CEIL_Y;
      if (da.velocity.y > 0) da.velocity.y = -da.velocity.y * 0.30;
    }

    /* ── Floor collision ── */
    var floorLimit = ART_H / 2 + 0.01;
    if (da.group.position.y < floorLimit) {
      da.group.position.y = floorLimit;
      var bounceSpeed = Math.abs(da.velocity.y);
      da.velocity.y = -da.velocity.y * 0.35;
      da.velocity.x *= 0.75; da.velocity.z *= 0.75;
      if (bounceSpeed > 0.9) playDropFloorSound();
      if (Math.abs(da.velocity.y) < 0.3) { da.velocity.set(0, 0, 0); da.onGround = true; }
    }
  }

  /* ── Normie-normie collision (XZ plane) ── */
  var MIN_DIST = ART_W * 0.88;  /* ~2.1 units — just under art width */
  for (var ai = 0; ai < droppedArts.length; ai++) {
    for (var bi = ai + 1; bi < droppedArts.length; bi++) {
      var a = droppedArts[ai], b = droppedArts[bi];
      var cnx = b.group.position.x - a.group.position.x;
      var cnz = b.group.position.z - a.group.position.z;
      var cnd = Math.sqrt(cnx * cnx + cnz * cnz);
      if (cnd < MIN_DIST && cnd > 0.001) {
        var overlap = (MIN_DIST - cnd) * 0.5;
        var ux = cnx / cnd, uz = cnz / cnd;
        /* Push apart symmetrically */
        a.group.position.x -= ux * overlap; a.group.position.z -= uz * overlap;
        b.group.position.x += ux * overlap; b.group.position.z += uz * overlap;
        /* Elastic-impulse along collision normal */
        var relVx = b.velocity.x - a.velocity.x;
        var relVz = b.velocity.z - a.velocity.z;
        var relN  = relVx * ux + relVz * uz;
        if (relN < 0) {  /* only resolve if approaching */
          var imp = relN * 0.65;
          a.velocity.x += imp * ux; a.velocity.z += imp * uz;
          b.velocity.x -= imp * ux; b.velocity.z -= imp * uz;
          /* Nudge off ground if bumped hard */
          if (a.onGround && Math.abs(imp) > 0.6) { a.onGround = false; a.velocity.y += 0.5; }
          if (b.onGround && Math.abs(imp) > 0.6) { b.onGround = false; b.velocity.y += 0.5; }
        }
      }
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

/* ── Arms tick ────────────────────────────────────────────────────────────── */
function tickArms(dt) {
  var visible = showArms;
  armsGroup.visible = visible;
  if (!visible) return;

  var moving    = keys.w || keys.s || keys.a || keys.d;
  var sprinting = moving && keys.shift;

  if (moving) walkSwing += dt * (sprinting ? 10.5 : 7.8);
  idleSwing += dt * 0.95;

  var targetGrab = isDragging ? 1.0 : 0.0;
  grabAnim += (targetGrab - grabAnim) * Math.min(1, dt * 9);
  pushAnim = Math.max(0, pushAnim - dt * 6.0);  /* decay ~0.17s */

  var walkAmp = moving ? (sprinting ? 0.26 : 0.16) : 0;
  var idleAmp = moving ? 0 : 0.038;

  var swingR = Math.sin(walkSwing)           * walkAmp + Math.sin(idleSwing)       * idleAmp;
  var swingL = Math.sin(walkSwing + Math.PI) * walkAmp + Math.sin(idleSwing + 0.7) * idleAmp;

  var yBob = moving ? Math.sin(walkSwing * 2) * 0.009 : 0;

  var zSplayR = -0.05 + Math.sin(walkSwing)           * walkAmp * 0.18;
  var zSplayL =  0.05 - Math.sin(walkSwing + Math.PI) * walkAmp * 0.18;

  armRGroup.position.set( 0.21, -0.34 + yBob, -0.30);
  armLGroup.position.set(-0.21, -0.34 + yBob, -0.30);

  armRGroup.rotation.x = swingR + grabAnim * (-0.32) + pushAnim * (-0.55);
  armLGroup.rotation.x = swingL;
  armRGroup.rotation.z = zSplayR;
  armLGroup.rotation.z = zSplayL;

  var elbowBend = 0.40 + grabAnim * 0.20;
  armRElbow.rotation.x = elbowBend;
  armLElbow.rotation.x = elbowBend;
}

/* ── Reset gallery ────────────────────────────────────────────────────────── */
function resetGallery() {
  /* Snap dropped arts back to their wall slots */
  for (var ri2 = droppedArts.length - 1; ri2 >= 0; ri2--) {
    var da2 = droppedArts[ri2];
    var art2 = da2.group;
    scene.remove(art2);
    if (art2.userData.wallSlot) {
      art2.position.copy(art2.userData.wallSlot.pos);
      art2.rotation.set(0, art2.userData.wallSlot.ry, 0);
      art2.scale.setScalar(1);
      artGroup.add(art2);
    } else {
      dispose(art2);
    }
  }
  droppedArts = [];
  /* Cancel any active drag */
  if (isDragging && draggedArt) {
    var dart = draggedArt;
    draggedArt = null; isDragging = false;
    scene.remove(dart);
    if (dart.userData.wallSlot) {
      dart.position.copy(dart.userData.wallSlot.pos);
      dart.rotation.set(0, dart.userData.wallSlot.ry, 0);
      dart.scale.setScalar(1);
      artGroup.add(dart);
    } else {
      dispose(dart);
    }
  }
  playWallSnapSound();
  /* Stop all history animations */
  while (historyAnims.length) stopHistoryAnim(0);
  /* Close hidden door immediately */
  if (doorPanel && doorPanelOrigY !== null) {
    doorPanel.position.y = doorPanelOrigY;
  }
  doorOpen = false; doorAnimating = false; doorAnim = 0;
  /* Clear explode particles */
  explodeParticles.forEach(function(p) { scene.remove(p.mesh); dispose(p.mesh); });
  explodeParticles = [];
  explodeActive = false; explodeResetTimer = 0;
  /* Reset time scale */
  timeScale = 1.0;
  var tss = $("timeSpeedSlider");
  if (tss) tss.value = 1;
}

/* ── Render loop ──────────────────────────────────────────────────────────── */
var clock = new THREE.Timer();
var roomCheckTimer = 0;
function animate() {
  requestAnimationFrame(animate);
  clock.update();
  var dt = Math.min(clock.getDelta(), 0.05) * timeScale;
  var shouldMove = isTouch ? inMuseum : (controls && controls.isLocked);
  if (shouldMove) move(dt);
  tickReveal(dt);
  checkButtonInteraction();
  checkSecretButtonInteraction();
  checkDoorButtonInteraction();
  checkHistoryInteraction();
  checkLinksBtnInteraction();
  checkLinkPanelInteraction();

  tickHistoryAnims(dt);
  tickDraggedArt(dt);
  tickDroppedArts(dt);
  tickExplode(dt);
  tickDoorAnim(dt);
  tickHintDismiss(dt);
  tickArms(dt);
  if (inMuseum) {
    roomCheckTimer += dt;
    if (roomCheckTimer > 0.25) { roomCheckTimer = 0; checkRoomLoading(); }
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
