// Generate app icon without external dependencies
// Produces BMP-based ICO (compatible with NSIS/makensis)
const { writeFileSync, mkdirSync, existsSync } = require('fs')
const { join } = require('path')
const zlib = require('zlib')

// ── CRC32 for PNG chunks ──
const crcTable = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
  crcTable[n] = c
}
function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}
function pngChunk(type, data) {
  const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const crcB = Buffer.alloc(4); crcB.writeUInt32BE(crc32(typeData), 0)
  return Buffer.concat([len, typeData, crcB])
}

function makePng(width, height, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4
      const dst = y * (1 + width * 4) + 1 + x * 4
      raw[dst] = pixels[src]; raw[dst+1] = pixels[src+1]; raw[dst+2] = pixels[src+2]; raw[dst+3] = pixels[src+3]
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))])
}

// BMP DIB for ICO (32-bit BGRA, bottom-up)
function makeBmpDib(size, pixels) {
  // BITMAPINFOHEADER + pixel data
  // For ICO, height is doubled (XOR mask + AND mask)
  const headerSize = 40
  const rowSize = size * 4 // 32bpp
  const xorSize = rowSize * size
  const andRowSize = Math.ceil(size / 8)
  // AND mask row padded to 4-byte boundary
  const andPaddedRow = Math.ceil(andRowSize / 4) * 4
  const andSize = andPaddedRow * size
  const totalSize = headerSize + xorSize + andSize

  const buf = Buffer.alloc(totalSize)

  // BITMAPINFOHEADER
  buf.writeUInt32LE(40, 0)  // biSize
  buf.writeInt32LE(size, 4)  // biWidth
  buf.writeInt32LE(size * 2, 8) // biHeight (XOR + AND)
  buf.writeUInt16LE(1, 12) // biPlanes
  buf.writeUInt16LE(32, 14) // biBitCount
  buf.writeUInt32LE(0, 16) // biCompression (BI_RGB)
  buf.writeUInt32LE(xorSize + andSize, 20) // biSizeImage
  buf.writeInt32LE(0, 24) // biXPelsPerMeter
  buf.writeInt32LE(0, 28) // biYPelsPerMeter
  buf.writeUInt32LE(0, 32) // biClrUsed
  buf.writeUInt32LE(0, 36) // biClrImportant

  // XOR mask: 32-bit BGRA, bottom-up
  for (let y = 0; y < size; y++) {
    const srcY = size - 1 - y // flip vertically (BMP is bottom-up)
    for (let x = 0; x < size; x++) {
      const src = (srcY * size + x) * 4
      const dst = headerSize + y * rowSize + x * 4
      buf[dst] = pixels[src + 2]     // B
      buf[dst + 1] = pixels[src + 1] // G
      buf[dst + 2] = pixels[src]     // R
      buf[dst + 3] = pixels[src + 3] // A
    }
  }

  // AND mask: 1-bit, 0 = opaque, 1 = transparent (all zeros = fully opaque)
  // Already zero-filled by Buffer.alloc

  return buf
}

// ── Draw icon ──
function drawPixels(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const cx = size / 2, cy = size / 2
  const outerR = size * 0.46

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const rx = Math.max(Math.abs(x - cx) - (size / 2 - outerR), 0)
      const ry = Math.max(Math.abs(y - cy) - (size / 2 - outerR), 0)
      const inRect = (rx * rx + ry * ry) < (outerR * outerR)
      if (inRect) {
        pixels[i] = 0x1a; pixels[i+1] = 0x1a; pixels[i+2] = 0x2e; pixels[i+3] = 0xff
      }
    }
  }

  // Inner purple circle
  const innerR = size * 0.30
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy
      if (dx * dx + dy * dy < innerR * innerR) {
        const i = (y * size + x) * 4
        pixels[i] = 0x6c; pixels[i+1] = 0x5c; pixels[i+2] = 0xe7; pixels[i+3] = 0xff
      }
    }
  }

  // White ">" chevron
  const aw = size * 0.12, lw = Math.max(size * 0.07, 2), h = aw * 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d1 = distToSeg(x, y, cx - aw * 0.6, cy - h * 0.5, cx + aw * 0.6, cy)
      const d2 = distToSeg(x, y, cx + aw * 0.6, cy, cx - aw * 0.6, cy + h * 0.5)
      if (d1 < lw || d2 < lw) {
        const i = (y * size + x) * 4
        pixels[i] = 0xff; pixels[i+1] = 0xff; pixels[i+2] = 0xff; pixels[i+3] = 0xff
      }
    }
  }
  return pixels
}

function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, len2 = dx*dx + dy*dy
  if (len2 === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px-x1)*dx + (py-y1)*dy) / len2))
  return Math.hypot(px - (x1 + t*dx), py - (y1 + t*dy))
}

// ── Main ──
const buildDir = join(__dirname, '..', 'build')
if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true })

// Generate 256x256 PNG
const png256 = makePng(256, 256, drawPixels(256))
writeFileSync(join(buildDir, 'icon.png'), png256)
console.log('Created build/icon.png')

// Generate BMP-based ICO (NSIS compatible)
const SIZES = [256, 128, 64, 48, 32, 16]
const images = SIZES.map(s => ({ size: s, data: makeBmpDib(s, drawPixels(s)) }))

const icoHeader = Buffer.alloc(6)
icoHeader.writeUInt16LE(0, 0)
icoHeader.writeUInt16LE(1, 2)
icoHeader.writeUInt16LE(images.length, 4)

let offset = 6 + images.length * 16
const parts = [icoHeader]

for (const img of images) {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(img.size >= 256 ? 0 : img.size, 0)
  entry.writeUInt8(img.size >= 256 ? 0 : img.size, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(img.data.length, 8)
  entry.writeUInt32LE(offset, 12)
  parts.push(entry)
  parts.push(img.data)
  offset += img.data.length
}

writeFileSync(join(buildDir, 'icon.ico'), Buffer.concat(parts))
console.log('Created build/icon.ico')
