const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const SRC = path.resolve(__dirname, '..', 'public/assets/mascot.png');
const OUT = path.resolve(__dirname, '..', 'public/assets/mascot.icns');

// ICNS entry type -> PNG image size (px). The @2x entries carry a larger PNG
// that macOS renders at half the nominal size on retina displays.
// Mapping mirrors iconutil's iconset:
//   16x16 → icp4, 32x32 → icp5, 128x128 → ic07, 256x256 → ic08,
//   512x512 → ic09, 1024x1024 → ic10,
//   16x16@2x (32px) → ic13, 32x32@2x (64px) → ic14,
//   128x128@2x (256px) → ic15, 256x256@2x (512px) → ic16,
//   512x512@2x (1024px) → ic17.
const SIZES = [
  ['icp4', 16],
  ['icp5', 32],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic13', 32],
  ['ic14', 64],
  ['ic15', 256],
  ['ic16', 512],
  ['ic17', 1024],
];

(async () => {
  const pngs = await Promise.all(
    SIZES.map(async ([type, size]) => {
      const buf = await sharp(SRC).resize(size, size).png().toBuffer();
      return { type, buf };
    })
  );

  const header = 8; // magic(4) + total size(4)
  const entryHead = 8; // type(4) + size(4)
  let total = header;
  for (const { buf } of pngs) total += entryHead + buf.length;

  const chunks = [Buffer.alloc(header)];
  chunks[0].write('icns', 0);
  chunks[0].writeUInt32BE(total, 4);

  for (const { type, buf } of pngs) {
    const entry = Buffer.alloc(entryHead + buf.length);
    entry.write(type, 0);
    entry.writeUInt32BE(entryHead + buf.length, 4);
    buf.copy(entry, entryHead);
    chunks.push(entry);
  }

  fs.writeFileSync(OUT, Buffer.concat(chunks));
  console.log(`wrote ${OUT} (${total} bytes, ${pngs.length} entries)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
