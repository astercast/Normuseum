import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 1200, H = 630;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

// ── Background ────────────────────────────────────────────────────────────────
// Warm off-white gallery wall, matching the museum interior
ctx.fillStyle = "#e8e3db";
ctx.fillRect(0, 0, W, H);

// Subtle dark top bar
ctx.fillStyle = "#1a1a18";
ctx.fillRect(0, 0, W, 6);

// Subtle dark bottom bar
ctx.fillRect(0, H - 6, W, 6);

// Faint vertical rule dividing text from image
ctx.strokeStyle = "#c5bfb5";
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(W * 0.52, 48);
ctx.lineTo(W * 0.52, H - 48);
ctx.stroke();

// ── Load + draw normie ────────────────────────────────────────────────────────
const normieUrl = "https://api.normies.art/normie/6793/image.png";
console.log("Fetching normie #6793…");
const normieImg = await loadImage(normieUrl);

// Draw pixel-art normie on the right side, scaled up with crisp rendering
const imgSize = 420;
const imgX = Math.round(W * 0.52 + (W * 0.48 - imgSize) / 2);
const imgY = Math.round((H - imgSize) / 2);

// Slight shadow / pedestal feel behind the normie
ctx.fillStyle = "rgba(0,0,0,0.06)";
ctx.beginPath();
ctx.ellipse(imgX + imgSize / 2, imgY + imgSize + 12, imgSize * 0.38, 18, 0, 0, Math.PI * 2);
ctx.fill();

// Crisp pixel art scale
ctx.imageSmoothingEnabled = false;
ctx.drawImage(normieImg, imgX, imgY, imgSize, imgSize);

// ── Text (left side) ─────────────────────────────────────────────────────────
const textCX = W * 0.52 / 2;  // centre of left column

// eyebrow
ctx.fillStyle = "#7a7060";
ctx.font = "500 18px 'IBM Plex Mono', monospace";
ctx.textAlign = "center";
ctx.fillText("3D VOXEL GALLERY · ETHEREUM", textCX, 170);

// Title
ctx.fillStyle = "#1a1a18";
ctx.font = "600 88px 'IBM Plex Mono', monospace";
ctx.fillText("normuseum", textCX, 278);

// Rule under title
ctx.strokeStyle = "#1a1a18";
ctx.lineWidth = 2;
const ruleW = 280;
ctx.beginPath();
ctx.moveTo(textCX - ruleW / 2, 300);
ctx.lineTo(textCX + ruleW / 2, 300);
ctx.stroke();

// Sub text
ctx.fillStyle = "#4a453c";
ctx.font = "400 22px 'IBM Plex Sans', sans-serif";
ctx.fillText("walk through your normies", textCX, 350);
ctx.fillText("collection in first-person 3D", textCX, 382);

// URL
ctx.fillStyle = "#7a7060";
ctx.font = "500 17px 'IBM Plex Mono', monospace";
ctx.fillText("normuseum.xyz", textCX, 450);

// normie label bottom right
ctx.fillStyle = "#9e9588";
ctx.font = "400 14px 'IBM Plex Mono', monospace";
ctx.textAlign = "right";
ctx.fillText("#6793", W - 32, H - 24);

// ── Save ──────────────────────────────────────────────────────────────────────
const outPath = join(__dirname, "../public/thumbnail.png");
const buf = canvas.toBuffer("image/png");
writeFileSync(outPath, buf);
console.log("✓ Saved to public/thumbnail.png");
