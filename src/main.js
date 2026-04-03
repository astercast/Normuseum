import "./style.css";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { RectAreaLightHelper } from "three/examples/jsm/helpers/RectAreaLightHelper.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

RectAreaLightUniformsLib.init();

const NORMIES_CONTRACT = "0x9Eb6E2025B64f340691e424b7fe7022fFDE12438";
const NORMIES_API      = "https://api.normies.art";
const MAX_ARTWORKS     = 48;

// Gallery dimensions
const ROOM_W  = 14;   // full width
const ROOM_H  = 4.6;  // ceiling height
const ROOM_LEN= 52;   // length (Z)
const WALL_X  = ROOM_W / 2;  // 7
const SLOT_SPACING = 2.9;    // spacing between artworks along Z

// ─── DOM refs ──────────────────────────────────────────────────────────────
const canvasEl      = document.getElementById("scene");
const overlayEl     = document.getElementById("overlay");
const hudEl         = document.getElementById("hud");
const hudMetaEl     = document.getElementById("hud-meta");
const walletInput   = document.getElementById("walletInput");
const loadBtn       = document.getElementById("loadBtn");
const exitBtn       = document.getElementById("exitBtn");
const statusEl      = document.getElementById("status");
const progressWrap  = document.getElementById("progress-wrap");
const progressBar   = document.getElementById("progress-bar");
const progressLabel = document.getElementById("progress-label");

// ─── Renderer ──────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping      = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

// ─── Scene ─────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color("#e3e5e4");
scene.fog        = new THREE.FogExp2("#e8eae9", 0.028);

// ─── Camera ────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 120);
camera.position.set(0, 1.7, ROOM_LEN / 2 - 2);

// ─── Controls ──────────────────────────────────────────────────────────────
const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

// ─── Lights ────────────────────────────────────────────────────────────────
// Soft ambient fill
const amb = new THREE.AmbientLight(0xfaf9f7, 0.55);
scene.add(amb);

// Warm directional key
const sun = new THREE.DirectionalLight(0xfff5e8, 0.4);
sun.position.set(3, 12, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far  = 80;
scene.add(sun);

// Gallery track lighting — RectAreaLights recessed in ceiling rows
const trackLightColor = 0xfff8f0;
const trackIntensity  = 6;
const trackZStart = -(ROOM_LEN / 2 - 4);
const trackCount  = 10;
const trackStep   = (ROOM_LEN - 8) / (trackCount - 1);
for (let i = 0; i < trackCount; i++) {
  const z = trackZStart + i * trackStep;
  // Left wall wash
  const l = new THREE.RectAreaLight(trackLightColor, trackIntensity, 1.4, 0.6);
  l.position.set(-WALL_X + 1.8, ROOM_H - 0.35, z);
  l.lookAt(-WALL_X + 0.1, 1.9, z);
  scene.add(l);
  // Right wall wash
  const r = new THREE.RectAreaLight(trackLightColor, trackIntensity, 1.4, 0.6);
  r.position.set(WALL_X - 1.8, ROOM_H - 0.35, z);
  r.lookAt(WALL_X - 0.1, 1.9, z);
  scene.add(r);
}

// ─── Gallery Room Geometry ─────────────────────────────────────────────────
function buildRoom() {
  const room = new THREE.Group();

  // Materials
  const floorMat = new THREE.MeshStandardMaterial({
    color: "#d0d2d1", roughness: 0.88, metalness: 0.0
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: "#f8f8f6", roughness: 0.92, metalness: 0.0
  });
  const ceilMat = new THREE.MeshStandardMaterial({
    color: "#fafafa", roughness: 0.96
  });
  const moulding = new THREE.MeshStandardMaterial({
    color: "#f0f0ee", roughness: 0.82
  });
  const baseboard = new THREE.MeshStandardMaterial({
    color: "#e8e9e8", roughness: 0.85
  });

  // Floor
  const floorGeo = new THREE.PlaneGeometry(ROOM_W, ROOM_LEN, 1, 1);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  room.add(floor);

  // Subtle reflection plane (semi-transparent plane just above floor)
  const reflGeo  = new THREE.PlaneGeometry(ROOM_W, ROOM_LEN);
  const reflMat  = new THREE.MeshStandardMaterial({
    color: "#d4d6d5", roughness: 0.1, metalness: 0.35,
    transparent: true, opacity: 0.18
  });
  const refl = new THREE.Mesh(reflGeo, reflMat);
  refl.rotation.x = -Math.PI / 2;
  refl.position.y = 0.002;
  room.add(refl);

  // Ceiling
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_LEN), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM_H;
  room.add(ceiling);

  // Left and right walls
  const wallGeo = new THREE.PlaneGeometry(ROOM_LEN, ROOM_H);
  const leftWall = new THREE.Mesh(wallGeo, wallMat);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-WALL_X, ROOM_H / 2, 0);
  leftWall.receiveShadow = true;
  room.add(leftWall);

  const rightWall = new THREE.Mesh(wallGeo, wallMat);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(WALL_X, ROOM_H / 2, 0);
  rightWall.receiveShadow = true;
  room.add(rightWall);

  // Back + front walls (end caps)
  const capGeo = new THREE.PlaneGeometry(ROOM_W, ROOM_H);
  const backWall = new THREE.Mesh(capGeo, wallMat);
  backWall.position.set(0, ROOM_H / 2, -ROOM_LEN / 2);
  room.add(backWall);

  const frontWall = new THREE.Mesh(capGeo, wallMat);
  frontWall.rotation.y = Math.PI;
  frontWall.position.set(0, ROOM_H / 2, ROOM_LEN / 2);
  room.add(frontWall);

  // Crown moulding (top rail on left/right walls)
  const mouldGeo = new THREE.BoxGeometry(ROOM_LEN, 0.065, 0.12);
  [-WALL_X, WALL_X].forEach((x, idx) => {
    const m = new THREE.Mesh(mouldGeo, moulding);
    m.rotation.y = idx === 0 ? Math.PI / 2 : -Math.PI / 2;
    // BoxGeometry along Z — built along X so rotate
    const mRow = new THREE.Mesh(new THREE.BoxGeometry(ROOM_LEN + 0.3, 0.065, 0.1), moulding);
    mRow.position.set(0, ROOM_H - 0.032, x === -WALL_X ? -WALL_X + 0.05 : WALL_X - 0.05);
    room.add(mRow);
  });

  // Picture rail (thin horizontal band where artworks sit)
  const railY = 2.9;
  const railGeo = new THREE.BoxGeometry(ROOM_LEN + 0.1, 0.04, 0.06);
  [-WALL_X + 0.03, WALL_X - 0.03].forEach((x) => {
    const rail = new THREE.Mesh(railGeo, moulding);
    rail.position.set(0, railY, x);
    room.add(rail);
  });

  // Skirting baseboard
  const skirtGeo = new THREE.BoxGeometry(ROOM_LEN + 0.1, 0.18, 0.05);
  [-WALL_X + 0.025, WALL_X - 0.025].forEach((x) => {
    const s = new THREE.Mesh(skirtGeo, baseboard);
    s.position.set(0, 0.09, x);
    room.add(s);
  });

  // Ceiling coffers — thin recessed lines
  const cofferMat = new THREE.MeshStandardMaterial({ color: "#f2f2f0", roughness: 0.95 });
  for (let zc = -ROOM_LEN / 2 + 4; zc < ROOM_LEN / 2; zc += 5.2) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W - 0.4, 0.025, 0.07), cofferMat);
    bar.position.set(0, ROOM_H - 0.012, zc);
    room.add(bar);
  }

  return room;
}

scene.add(buildRoom());

// ─── Wall Slots ────────────────────────────────────────────────────────────
// Place 24 slots per wall, spanning almost the full gallery length
const wallSlots = [];
const slotCount  = MAX_ARTWORKS / 2;  // 24 per side
const slotZStart = -(ROOM_LEN / 2 - 3.2);
for (let i = 0; i < slotCount; i++) {
  const z = slotZStart + i * SLOT_SPACING;
  const artY = 2.14;  // centre height of artwork
  wallSlots.push({ pos: new THREE.Vector3(-WALL_X + 0.05, artY, z), ry: Math.PI / 2 });
  wallSlots.push({ pos: new THREE.Vector3(WALL_X - 0.05, artY, z), ry: -Math.PI / 2 });
}

// ─── Artwork Group ─────────────────────────────────────────────────────────
const artGroup = new THREE.Group();
scene.add(artGroup);

// ─── Shared geometry / material pools (reused across all artworks) ─────────
const VOXEL_SIZE  = 0.048;       // each voxel cube side length
const GRID        = 40;          // 40×40 pixel normie grid
const CELL        = 1.98 / GRID; // artwork canvas size / grid
const sharedVoxGeom = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);

// Frame and backing shared
const frameMat  = new THREE.MeshStandardMaterial({ color: "#f0f0ee", roughness: 0.7,  metalness: 0.06 });
const backMat   = new THREE.MeshStandardMaterial({ color: "#fafaf8", roughness: 0.97 });
const placeholderMat = new THREE.MeshStandardMaterial({ color: "#e6e8e7", roughness: 0.97 });

// ─── Label texture helper ──────────────────────────────────────────────────
function makeLabelTex(tokenId, type, ap) {
  const lc = document.createElement("canvas");
  lc.width = 512; lc.height = 72;
  const ctx = lc.getContext("2d");

  ctx.fillStyle = "rgba(240,240,238,0.92)";
  ctx.fillRect(0, 0, 512, 72);

  // Left accent bar
  ctx.fillStyle = "rgba(72,73,75,0.45)";
  ctx.fillRect(0, 0, 3, 72);

  ctx.fillStyle = "#48494b";
  ctx.font = '500 22px "IBM Plex Mono", monospace';
  ctx.fillText(`normie #${tokenId}`, 14, 32);

  ctx.fillStyle = "#82848a";
  ctx.font = '400 16px "IBM Plex Mono", monospace';
  const sub = [type, ap ? `${ap} ap` : null].filter(Boolean).join(" · ");
  ctx.fillText(sub, 14, 56);

  const tex = new THREE.CanvasTexture(lc);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ─── Build voxel artwork ───────────────────────────────────────────────────
function buildVoxelArtwork(tokenId, rgbaData, meta = {}) {
  const group = new THREE.Group();

  const ART_W = 2.12;
  const ART_H = 2.12;

  // Outer frame (moulding)
  const frameOuter = new THREE.Mesh(
    new THREE.BoxGeometry(ART_W + 0.2, ART_H + 0.2, 0.06),
    frameMat
  );
  frameOuter.position.z = -0.06;
  group.add(frameOuter);

  // Inner backing panel
  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(ART_W, ART_H, 0.03),
    backMat
  );
  backing.position.z = -0.03;
  group.add(backing);

  // Build InstancedMesh from pixel data
  // Separate dark (foreground) and light pixels for two-pass rendering
  const darkCoords  = [], darkColors  = [];
  const lightCoords = [], lightColors = [];

  for (let py = 0; py < GRID; py++) {
    for (let px = 0; px < GRID; px++) {
      const idx = (py * GRID + px) * 4;
      const r = rgbaData[idx];
      const g = rgbaData[idx + 1];
      const b = rgbaData[idx + 2];
      const a = rgbaData[idx + 3];
      if (a < 10) continue;

      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const isDark = luminance < 45;

      const wx = (px - GRID / 2 + 0.5) * CELL;
      const wy = (GRID / 2 - py - 0.5) * CELL;

      if (isDark) {
        darkCoords.push([wx, wy]);
        darkColors.push([r / 255, g / 255, b / 255]);
      } else {
        lightCoords.push([wx, wy]);
        lightColors.push([r / 255, g / 255, b / 255]);
      }
    }
  }

  // Light pixels — slightly raised flat layer
  if (lightCoords.length) {
    const lightGeom = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE * 1.3);
    const lightMat  = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.0, vertexColors: true });
    const inst       = new THREE.InstancedMesh(lightGeom, lightMat, lightCoords.length);
    const mtx = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < lightCoords.length; i++) {
      const [x, y] = lightCoords[i];
      mtx.setPosition(x, y, VOXEL_SIZE * 0.65);
      inst.setMatrixAt(i, mtx);
      col.setRGB(...lightColors[i]);
      inst.setColorAt(i, col);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.receiveShadow = true;
    inst.castShadow    = true;
    group.add(inst);
  }

  // Dark / off-black pixels — deeper extrusion, high-quality shadow
  if (darkCoords.length) {
    const darkGeom = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE * 4.5);
    const darkMat  = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.08, vertexColors: true });
    const inst      = new THREE.InstancedMesh(darkGeom, darkMat, darkCoords.length);
    const mtx = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < darkCoords.length; i++) {
      const [x, y] = darkCoords[i];
      mtx.setPosition(x, y, VOXEL_SIZE * 2.25);
      inst.setMatrixAt(i, mtx);
      col.setRGB(...darkColors[i]);
      inst.setColorAt(i, col);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.receiveShadow = true;
    inst.castShadow    = true;
    group.add(inst);
  }

  // Nameplate (label)
  const labelTex = makeLabelTex(tokenId, meta.type ?? "human", meta.ap ?? null);
  const labelH   = 0.28;
  const label    = new THREE.Mesh(
    new THREE.PlaneGeometry(ART_W + 0.2, labelH),
    new THREE.MeshBasicMaterial({ map: labelTex, transparent: true })
  );
  label.position.set(0, -(ART_H / 2 + 0.2 + labelH / 2 + 0.04), 0.01);
  group.add(label);

  // Subtle point light in front of artwork (spotlight effect)
  const spot = new THREE.PointLight(0xfff5e0, 0.9, 2.6, 2.2);
  spot.position.set(0, 0.4, 0.75);
  group.add(spot);

  // Reveal animation state
  group.userData.revealT = 0;
  group.userData.revealing = true;
  group.scale.set(0.001, 0.001, 0.001);

  return group;
}

// ─── Placeholder frame (shown while loading) ────────────────────────────────
function buildPlaceholder() {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(2.32, 2.32, 0.04),
    placeholderMat
  );
  g.add(frame);
  return g;
}

// ─── Dispose helpers ────────────────────────────────────────────────────────
function disposeMesh(obj) {
  if (!obj) return;
  obj.traverse(child => {
    if (child.isMesh || child.isInstancedMesh) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material?.dispose();
    }
    if (child.isSprite) child.material?.map?.dispose();
  });
}

function clearArtwork() {
  while (artGroup.children.length) {
    const c = artGroup.children[artGroup.children.length - 1];
    artGroup.remove(c);
    disposeMesh(c);
  }
}

// ─── API calls ──────────────────────────────────────────────────────────────
async function fetchOwnedTokenIds(address) {
  const ids = [];
  let continuation = null;
  do {
    const base = `https://api.reservoir.tools/users/${address}/tokens/v7?collection=${NORMIES_CONTRACT}&limit=200&sortBy=acquiredAt&sortDirection=desc`;
    const url  = continuation ? `${base}&continuation=${encodeURIComponent(continuation)}` : base;
    const res  = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error(`reservoir ${res.status}`);
    const data = await res.json();
    for (const e of data.tokens ?? []) {
      const id = Number.parseInt(e?.token?.tokenId ?? "", 10);
      if (!Number.isNaN(id) && id >= 0 && id <= 9999) ids.push(id);
    }
    continuation = data.continuation ?? null;
  } while (continuation);
  return [...new Set(ids)];
}

async function fetchTokenMeta(tokenId) {
  try {
    const res = await fetch(`${NORMIES_API}/normie/${tokenId}/canvas/info`, { cache: "no-store" });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

async function fetchImageRGBA(tokenId) {
  const res = await fetch(`${NORMIES_API}/normie/${tokenId}/image.png`, { cache: "no-store" });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const blob   = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const offscreen = new OffscreenCanvas(GRID, GRID);
  const ctx = offscreen.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0, GRID, GRID);
  return ctx.getImageData(0, 0, GRID, GRID).data;
}

// ─── Progress helpers ───────────────────────────────────────────────────────
function setProgress(done, total, label) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  progressBar.style.setProperty("--pct", `${pct}%`);
  progressLabel.textContent = label;
  progressWrap.classList.toggle("visible", done < total);
}

// ─── Resolve a single address or ENS name → 0x ────────────────────────────────────
async function resolveAddress(raw) {
  const v = raw.trim();
  if (!v) throw new Error("empty entry");
  if (/^0x[a-fA-F0-9]{40}$/i.test(v)) return v.toLowerCase();
  // ENS or other name — public resolver, no API key required
  const res = await fetch(`https://api.ensideas.com/ens/resolve/${encodeURIComponent(v)}`);
  if (!res.ok) throw new Error(`could not resolve “${v}”`);
  const data = await res.json();
  if (!data?.address || !/^0x[a-fA-F0-9]{40}$/i.test(data.address)) {
    throw new Error(`no address found for “${v}”`);
  }
  return data.address.toLowerCase();
}

// ─── Enter / exit museum ────────────────────────────────────────────────────
let inMuseum = false;

function enterMuseum() {
  inMuseum = true;
  overlayEl.classList.add("hidden");
  hudEl.classList.remove("hud-hidden");
}

function exitMuseum() {
  controls.unlock();
  inMuseum = false;
  overlayEl.classList.remove("hidden");
  hudEl.classList.add("hud-hidden");
  clearArtwork();
  setStatus("");
  camera.position.set(0, 1.7, ROOM_LEN / 2 - 2);
  camera.rotation.set(0, 0, 0);
}

exitBtn.addEventListener("click", exitMuseum);

// ─── Main load flow ─────────────────────────────────────────────────────────
async function loadMuseumForAddress(rawAddress) {
  let address;
  try {
    address = resolveAddress(rawAddress);
  } catch (err) {
    setStatus(err.message, true);
    return;
  }

  setBusy(true);
  setStatus("scanning wallet\u2026");

  let tokenIds;
  try {
    tokenIds = await fetchOwnedTokenIds(address);
  } catch (err) {
    setStatus(`wallet lookup failed: ${err.message}`, true);
    setBusy(false);
    return;
  }

  if (!tokenIds.length) {
    setStatus("no normies found in this wallet.");
    setBusy(false);
    return;
  }

  const shown = tokenIds.slice(0, MAX_ARTWORKS);
  setStatus(`loading ${shown.length} normies\u2026`);

  // Enter museum before data loads so user sees the gallery
  clearArtwork();
  enterMuseum();
  controls.lock();
  setBusy(false);

  hudMetaEl.textContent = `${address.slice(0, 8)}\u2026${address.slice(-5)} \u00b7 ${tokenIds.length} normies`;
  setProgress(0, shown.length, `loading 0 / ${shown.length}`);

  // Place placeholder frames immediately
  const placeholders = shown.map((_, i) => {
    const slot = wallSlots[i];
    const ph   = buildPlaceholder();
    ph.position.copy(slot.pos);
    ph.rotation.y = slot.ry;
    artGroup.add(ph);
    return ph;
  });

  // Load artworks progressively
  let done = 0;
  await Promise.allSettled(shown.map(async (tokenId, i) => {
    try {
      const [rgba, meta] = await Promise.all([
        fetchImageRGBA(tokenId),
        fetchTokenMeta(tokenId)
      ]);

      const slot    = wallSlots[i];
      const artwork = buildVoxelArtwork(tokenId, rgba, {
        type: meta?.type ?? "human",
        ap:   meta?.actionPoints ?? null
      });
      artwork.position.copy(slot.pos);
      artwork.rotation.y = slot.ry;

      // Remove placeholder; add real artwork
      artGroup.remove(placeholders[i]);
      disposeMesh(placeholders[i]);
      artGroup.add(artwork);
    } catch {/* individual piece failure is silent */}

    done++;
    setProgress(done, shown.length, `loading ${done} / ${shown.length}`);
  }));

  setProgress(shown.length, shown.length, "");
}

// ─── UI helpers ──────────────────────────────────────────────────────────────
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

function setBusy(busy) {
  loadBtn.disabled     = busy;
  walletInput.disabled = busy;
}

// ─── About modal ─────────────────────────────────────────────────────────────
const aboutModal    = document.getElementById("about-modal");
const aboutBtn      = document.getElementById("aboutBtn");
const aboutCloseBtn = document.getElementById("aboutCloseBtn");

aboutBtn.addEventListener("click", () => aboutModal.classList.remove("modal-hidden"));
aboutCloseBtn.addEventListener("click", () => aboutModal.classList.add("modal-hidden"));
aboutModal.addEventListener("click", e => { if (e.target === aboutModal) aboutModal.classList.add("modal-hidden"); });

loadBtn.addEventListener("click", () => loadMuseumForWallets(walletInput.value));
walletInput.addEventListener("keydown", e => { if (e.key === "Enter") loadMuseumForWallets(walletInput.value); });

// ─── Pointer lock ────────────────────────────────────────────────────────────
renderer.domElement.addEventListener("click", () => { if (inMuseum) controls.lock(); });
controls.addEventListener("lock",   () => document.body.classList.add("locked"));
controls.addEventListener("unlock", () => document.body.classList.remove("locked"));

// ─── Keyboard movement ───────────────────────────────────────────────────────
const keys = { w: false, s: false, a: false, d: false, shift: false };
window.addEventListener("keydown", e => {
  if (e.code === "KeyW")    keys.w = true;
  if (e.code === "KeyS")    keys.s = true;
  if (e.code === "KeyA")    keys.a = true;
  if (e.code === "KeyD")    keys.d = true;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = true;
});
window.addEventListener("keyup", e => {
  if (e.code === "KeyW")    keys.w = false;
  if (e.code === "KeyS")    keys.s = false;
  if (e.code === "KeyA")    keys.a = false;
  if (e.code === "KeyD")    keys.d = false;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = false;
});

const vel  = new THREE.Vector3();
const dir  = new THREE.Vector3();
const clock = new THREE.Clock();

function move(delta) {
  const speed = keys.shift ? 6.5 : 3.2;
  vel.set(0, 0, 0);
  dir.z = Number(keys.w) - Number(keys.s);
  dir.x = Number(keys.d) - Number(keys.a);
  dir.normalize();
  if (keys.w || keys.s) vel.z = dir.z * speed * delta;
  if (keys.a || keys.d) vel.x = dir.x * speed * delta;
  controls.moveRight(vel.x);
  controls.moveForward(vel.z);

  // Constrain inside gallery
  const p = controls.getObject().position;
  p.y = 1.7;
  p.x = THREE.MathUtils.clamp(p.x, -(WALL_X - 0.6), WALL_X - 0.6);
  p.z = THREE.MathUtils.clamp(p.z, -(ROOM_LEN / 2 - 0.6), ROOM_LEN / 2 - 0.6);
}

// ─── Reveal animation ────────────────────────────────────────────────────────
const REVEAL_SPEED = 4.2;
function tickReveal(delta) {
  for (const child of artGroup.children) {
    if (!child.userData.revealing) continue;
    child.userData.revealT = Math.min(1, child.userData.revealT + delta * REVEAL_SPEED);
    const t  = easeOutBack(child.userData.revealT);
    child.scale.setScalar(t);
    if (child.userData.revealT >= 1) {
      child.userData.revealing = false;
      child.scale.setScalar(1);
    }
  }
}
function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ─── Render loop ─────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  if (controls.isLocked) move(delta);
  tickReveal(delta);
  renderer.render(scene, camera);
}
animate();

// ─── Resize ──────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
