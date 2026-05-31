// Generates PWA PNG icons from an inline SVG soccer-ball mark.
// Run: node scripts/gen-icons.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// Regular pentagon (point up) + radial seams => recognizable soccer ball.
const C = 256, rP = 56, rBall = 150, rSeam = 150;
const ang = (k) => (-90 + k * 72) * (Math.PI / 180);
const pts = Array.from({ length: 5 }, (_, k) => [
  C + rP * Math.cos(ang(k)),
  C + rP * Math.sin(ang(k)),
]);
const seamOuter = Array.from({ length: 5 }, (_, k) => [
  C + rSeam * Math.cos(ang(k)),
  C + rSeam * Math.sin(ang(k)),
]);
const f = (n) => n.toFixed(1);
const pentagon = pts.map((p) => `${f(p[0])},${f(p[1])}`).join(" ");
const seams = pts
  .map((p, k) => `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(seamOuter[k][0])}" y2="${f(seamOuter[k][1])}" />`)
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#059669"/>
      <stop offset="1" stop-color="#312e81"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <circle cx="${C}" cy="${C}" r="${rBall}" fill="#ffffff"/>
  <g stroke="#0f172a" stroke-width="11" stroke-linecap="round" fill="none">${seams}</g>
  <polygon points="${pentagon}" fill="#0f172a"/>
</svg>`;

const svgBuf = Buffer.from(svg);
const targets = [
  ["icon-192x192.png", 192],
  ["icon-512x512.png", 512],
  ["apple-icon.png", 180],
];

for (const [name, size] of targets) {
  await sharp(svgBuf).resize(size, size).png().toFile(join(publicDir, name));
  console.log("wrote", name, size);
}
