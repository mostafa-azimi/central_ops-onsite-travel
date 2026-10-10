import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const source = await fs.readFile(new URL("../app/icon.svg", import.meta.url));
const output = new URL("../public/pwa/", import.meta.url);
await fs.mkdir(output, { recursive: true });

async function standard(size, name) {
  const mark = await sharp(source)
    .resize(Math.round(size * .82), Math.round(size * .82), { fit: "inside" })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#f0f6fe" } })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toFile(fileURLToPath(new URL(name, output)));
}

await standard(192, "icon-192.png");
await standard(512, "icon-512.png");
await standard(180, "apple-touch-icon.png");

const mark = await sharp(source).resize(280, 310, { fit: "inside" }).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#f0f6fe" } })
  .composite([{ input: mark, gravity: "center" }])
  .png()
  .toFile(fileURLToPath(new URL("maskable-512.png", output)));
