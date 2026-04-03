import "./style.css";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

const NORMIES_CONTRACT = "0x9Eb6E2025B64f340691e424b7fe7022fFDE12438";
const NORMIES_API = "https://api.normies.art";
const MAX_ARTWORKS = 48;

const canvas = document.getElementById("scene");
const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");
const connectBtn = document.getElementById("connectBtn");
const walletInput = document.getElementById("walletInput");
const loadBtn = document.getElementById("loadBtn");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#f0efea");
scene.fog = new THREE.Fog("#f0efea", 14, 40);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 1.65, 11.5);

const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

const hemiLight = new THREE.HemisphereLight(0xffffff, 0xc9c7c2, 1.2);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 10, 4);
scene.add(dirLight);

const artGroup = new THREE.Group();
scene.add(artGroup);

function makeRoom() {
  const room = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 36),
    new THREE.MeshStandardMaterial({ color: "#f9f9f7", roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  room.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 36),
    new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 })
  );
  ceiling.position.y = 4.1;
  ceiling.rotation.x = Math.PI / 2;
  room.add(ceiling);

  const wallMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.94 });

  const walls = [
    { size: [18, 4.2, 0.25], pos: [0, 2.1, -18] },
    { size: [18, 4.2, 0.25], pos: [0, 2.1, 18] },
    { size: [0.25, 4.2, 36], pos: [-9, 2.1, 0] },
    { size: [0.25, 4.2, 36], pos: [9, 2.1, 0] }
  ];

  walls.forEach((w) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...w.size), wallMat);
    mesh.position.set(...w.pos);
    room.add(mesh);
  });

  const middleSeparators = [-9, -2, 5, 12].map((z) => {
    const separator = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 4.2, 1.1),
      new THREE.MeshStandardMaterial({ color: "#fdfdfd", roughness: 0.95 })
    );
    separator.position.set(0, 2.1, z);
    return separator;
  });

  middleSeparators.forEach((s) => room.add(s));

  for (let i = -7; i <= 7; i += 2) {
    const light = new THREE.Mesh(
      new THREE.CircleGeometry(0.26, 18),
      new THREE.MeshBasicMaterial({ color: "#ecebe7", transparent: true, opacity: 0.8 })
    );
    light.position.set(i, 4.05, 0);
    light.rotation.x = Math.PI / 2;
    room.add(light);
  }

  return room;
}

scene.add(makeRoom());

const wallSlots = [];
for (let i = 0; i < 24; i++) {
  const z = 15 - i * 1.3;
  wallSlots.push({ position: new THREE.Vector3(-8.72, 1.9, z), rotationY: Math.PI / 2 });
  wallSlots.push({ position: new THREE.Vector3(8.72, 1.9, z), rotationY: -Math.PI / 2 });
}

function makeLabelTexture(text) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 480;
  labelCanvas.height = 64;
  const ctx = labelCanvas.getContext("2d");
  ctx.fillStyle = "rgba(245, 245, 240, 0.9)";
  ctx.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.32)";
  ctx.strokeRect(1, 1, labelCanvas.width - 2, labelCanvas.height - 2);
  ctx.fillStyle = "#111";
  ctx.font = '700 24px "IBM Plex Mono"';
  ctx.fillText(text, 16, 41);

  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

async function fetchImageData(tokenId) {
  const res = await fetch(`${NORMIES_API}/normie/${tokenId}/image.png`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`image ${res.status}`);
  }

  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);

  const work = document.createElement("canvas");
  work.width = 40;
  work.height = 40;
  const ctx = work.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0, 40, 40);

  return ctx.getImageData(0, 0, 40, 40).data;
}

function buildVoxelArtwork(tokenId, rgbaData) {
  const group = new THREE.Group();

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(2.55, 2.55, 0.14),
    new THREE.MeshStandardMaterial({ color: "#fefefe", roughness: 0.82, metalness: 0.02 })
  );
  frame.position.z = 0;
  group.add(frame);

  const backing = new THREE.Mesh(
    new THREE.PlaneGeometry(2.38, 2.38),
    new THREE.MeshStandardMaterial({ color: "#fcfcfc", roughness: 0.98 })
  );
  backing.position.z = 0.071;
  group.add(backing);

  const coords = [];
  const colors = [];
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      const i = (y * 40 + x) * 4;
      const r = rgbaData[i];
      const g = rgbaData[i + 1];
      const b = rgbaData[i + 2];
      const a = rgbaData[i + 3];

      if (a < 12) continue;

      const darkPixel = r < 38 && g < 38 && b < 38;
      const lift = darkPixel ? 0.12 : 0.08;
      const px = (x - 19.5) * 0.055;
      const py = (19.5 - y) * 0.055;
      const pz = 0.08 + lift * 0.5;

      coords.push([px, py, pz, darkPixel ? 0.14 : 0.09]);
      colors.push([r / 255, g / 255, b / 255]);
    }
  }

  const geom = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.44, metalness: 0.02, vertexColors: true });
  const instanced = new THREE.InstancedMesh(geom, mat, coords.length);

  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const scale = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  for (let i = 0; i < coords.length; i++) {
    const [x, y, z, depth] = coords[i];
    scale.set(1, 1, depth / 0.05);
    matrix.compose(new THREE.Vector3(x, y, z), quat, scale);
    instanced.setMatrixAt(i, matrix);

    const [r, g, b] = colors[i];
    color.setRGB(r, g, b);
    instanced.setColorAt(i, color);
  }

  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  group.add(instanced);

  const labelTexture = makeLabelTexture(`normie #${tokenId}`);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true }));
  label.position.set(0, -1.56, 0.12);
  label.scale.set(1.8, 0.24, 1);
  group.add(label);

  return group;
}

function clearArtwork() {
  while (artGroup.children.length) {
    const child = artGroup.children.pop();
    child.traverse((obj) => {
      if (obj.isMesh) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      }
      if (obj.isSprite && obj.material?.map) obj.material.map.dispose();
    });
  }
}

async function fetchOwnedTokenIds(address) {
  const ids = [];
  let continuation = null;

  do {
    const base = `https://api.reservoir.tools/users/${address}/tokens/v7?collection=${NORMIES_CONTRACT}&limit=200&sortBy=acquiredAt&sortDirection=desc`;
    const url = continuation ? `${base}&continuation=${encodeURIComponent(continuation)}` : base;

    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error(`reservoir ${res.status}`);
    }

    const data = await res.json();
    for (const entry of data.tokens ?? []) {
      const tokenId = Number.parseInt(entry?.token?.tokenId ?? "", 10);
      if (!Number.isNaN(tokenId) && tokenId >= 0 && tokenId <= 9999) {
        ids.push(tokenId);
      }
    }

    continuation = data.continuation ?? null;
  } while (continuation);

  return [...new Set(ids)];
}

async function resolveAddress(entry) {
  const value = entry.trim();
  if (!value) throw new Error("Wallet input is empty");

  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error("Invalid 0x wallet address");
  }

  return value;
}

async function loadMuseumForAddress(rawAddress) {
  setBusy(true);
  clearArtwork();
  try {
    const address = await resolveAddress(rawAddress);
    walletInput.value = address;
    statusEl.textContent = "Scanning wallet...";
    metaEl.textContent = "";

    const tokenIds = await fetchOwnedTokenIds(address);
    if (!tokenIds.length) {
      statusEl.textContent = "No Normies found in this wallet.";
      metaEl.textContent = address;
      return;
    }

    const shown = tokenIds.slice(0, MAX_ARTWORKS);
    statusEl.textContent = `Rendering ${shown.length} voxel works...`;
    metaEl.textContent = `${address} | owns ${tokenIds.length} normies`;

    const results = await Promise.allSettled(
      shown.map(async (tokenId) => {
        const rgba = await fetchImageData(tokenId);
        return { tokenId, rgba };
      })
    );

    let mounted = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== "fulfilled") continue;
      const slot = wallSlots[mounted];
      if (!slot) break;

      const artwork = buildVoxelArtwork(result.value.tokenId, result.value.rgba);
      artwork.position.copy(slot.position);
      artwork.rotation.y = slot.rotationY;
      artGroup.add(artwork);
      mounted += 1;
    }

    statusEl.textContent = mounted
      ? `Museum ready. Showing ${mounted} voxel works.`
      : "Unable to render wallet artworks.";
  } catch (err) {
    statusEl.textContent = `Load failed: ${err.message}`;
    metaEl.textContent = "";
  } finally {
    setBusy(false);
  }
}

function setBusy(busy) {
  connectBtn.disabled = busy;
  loadBtn.disabled = busy;
  walletInput.disabled = busy;
}

async function connectWallet() {
  if (!window.ethereum) {
    statusEl.textContent = "No injected wallet found. Paste an address instead.";
    return;
  }

  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts?.length) throw new Error("Wallet returned no accounts");
    await loadMuseumForAddress(accounts[0]);
  } catch (err) {
    statusEl.textContent = `Wallet connection failed: ${err.message}`;
  }
}

connectBtn.addEventListener("click", connectWallet);
loadBtn.addEventListener("click", () => loadMuseumForAddress(walletInput.value));
walletInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    loadMuseumForAddress(walletInput.value);
  }
});

renderer.domElement.addEventListener("click", () => controls.lock());
controls.addEventListener("lock", () => document.body.classList.add("locked"));
controls.addEventListener("unlock", () => document.body.classList.remove("locked"));

const moveState = {
  forward: false,
  back: false,
  left: false,
  right: false,
  sprint: false
};

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyW") moveState.forward = true;
  if (event.code === "KeyS") moveState.back = true;
  if (event.code === "KeyA") moveState.left = true;
  if (event.code === "KeyD") moveState.right = true;
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") moveState.sprint = true;
});

window.addEventListener("keyup", (event) => {
  if (event.code === "KeyW") moveState.forward = false;
  if (event.code === "KeyS") moveState.back = false;
  if (event.code === "KeyA") moveState.left = false;
  if (event.code === "KeyD") moveState.right = false;
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") moveState.sprint = false;
});

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const clock = new THREE.Clock();

function updateMovement(delta) {
  const speed = moveState.sprint ? 5.8 : 3.4;
  velocity.x = 0;
  velocity.z = 0;

  direction.z = Number(moveState.forward) - Number(moveState.back);
  direction.x = Number(moveState.right) - Number(moveState.left);
  direction.normalize();

  if (moveState.forward || moveState.back) velocity.z = direction.z * speed * delta;
  if (moveState.left || moveState.right) velocity.x = direction.x * speed * delta;

  controls.moveRight(velocity.x);
  controls.moveForward(velocity.z);

  const p = controls.getObject().position;
  p.y = 1.65;
  p.x = THREE.MathUtils.clamp(p.x, -6.9, 6.9);
  p.z = THREE.MathUtils.clamp(p.z, -16.8, 16.8);

  const inSeparatorBand = Math.abs(p.x) < 0.62;
  const separatorZones = [-9, -2, 5, 12];
  for (const z of separatorZones) {
    if (inSeparatorBand && Math.abs(p.z - z) < 1.2) {
      p.x = p.x >= 0 ? 0.62 : -0.62;
    }
  }
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  if (controls.isLocked) {
    updateMovement(delta);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

statusEl.textContent = "Connect wallet or paste address, then click load museum.";
metaEl.textContent = "Supports 0x wallet addresses.";
