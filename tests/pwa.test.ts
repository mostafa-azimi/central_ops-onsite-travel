import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import manifest from "@/app/manifest";

function pngDimensions(path: string) {
  const file = fs.readFileSync(path);
  assert.equal(file.subarray(1, 4).toString(), "PNG");
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
}

test("PWA manifest provides standalone installation metadata and required icons", () => {
  const value = manifest();
  assert.equal(value.name, "ShipHero Central Ops Travel");
  assert.equal(value.start_url, "/");
  assert.equal(value.scope, "/");
  assert.equal(value.display, "standalone");
  assert.ok(value.icons?.some((icon) => icon.sizes === "192x192"));
  assert.ok(value.icons?.some((icon) => icon.sizes === "512x512" && icon.purpose === "any"));
  assert.ok(value.icons?.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
});

test("PWA icons have the declared dimensions", () => {
  assert.deepEqual(pngDimensions("public/pwa/icon-192.png"), { width: 192, height: 192 });
  assert.deepEqual(pngDimensions("public/pwa/icon-512.png"), { width: 512, height: 512 });
  assert.deepEqual(pngDimensions("public/pwa/maskable-512.png"), { width: 512, height: 512 });
  assert.deepEqual(pngDimensions("public/pwa/apple-touch-icon.png"), { width: 180, height: 180 });
});

test("service worker keeps pages and authenticated APIs network-only", () => {
  const worker = fs.readFileSync("public/sw.js", "utf8");
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /fetch\(request\)\.catch\(\(\) => caches\.match\(OFFLINE_URL\)\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(worker, /PRECACHE[^;]*\/admin/s);
  assert.doesNotMatch(worker, /PRECACHE[^;]*\/api/s);
});
