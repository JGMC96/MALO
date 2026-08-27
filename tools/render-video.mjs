/**
 * Renderiza un ciclo completo de la animación a vídeo MP4.
 *
 *   npm i -D playwright ffmpeg-static   (una vez; playwright descarga Chromium)
 *   node tools/render-video.mjs         (desde la raíz del repo)
 *
 * Salida: media/dibujar-la-obra.mp4 — 40 s, 1920x1080, 30 fps, un bucle
 * exacto: el último fotograma empalma con el primero.
 */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const FPS = 30, SECONDS = 40, W = 1920, H = 1080;
const N = FPS * SECONDS;
const root = process.cwd();
const framesDir = path.join(root, "tools", ".frames");
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });

const page_html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0}#fondo{width:${W}px;height:${H}px}</style></head>
<body><div id="fondo"></div>
<script src="/dist/architectural-site.js"></scr` + `ipt>
<script>
  window.anim = ArchitecturalSite.mount(document.getElementById("fondo"));
  window.anim.pause();
  window.ready = true;
</scr` + `ipt></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end(page_html); return; }
  const file = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(8741, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("page error:", String(e)));
await page.goto("http://localhost:8741/");
await page.waitForFunction("window.ready === true");

const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const data = await page.evaluate(([t]) => {
    window.anim.seek(t);
    return document.querySelector("#fondo canvas").toDataURL("image/png").slice(22);
  }, [i / N]);
  fs.writeFileSync(path.join(framesDir, `f${String(i).padStart(4, "0")}.png`), Buffer.from(data, "base64"));
  if (i % 300 === 0) console.log(`fotograma ${i}/${N}`);
}
console.log(`${N} fotogramas en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await browser.close();
server.close();

const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static");
const out = path.join(root, "media", "dibujar-la-obra.mp4");
fs.mkdirSync(path.dirname(out), { recursive: true });
const r = spawnSync(ffmpeg, [
  "-y", "-framerate", String(FPS), "-i", path.join(framesDir, "f%04d.png"),
  "-c:v", "libx264", "-preset", "slow", "-crf", "19",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
], { stdio: ["ignore", "ignore", "inherit"] });
if (r.status !== 0) process.exit(1);
fs.rmSync(framesDir, { recursive: true, force: true });
console.log("vídeo:", out);
