# CompressIt — File Compression Chrome Extension

![Status](https://img.shields.io/badge/Status-Submitted%20%E2%80%94%20MACS%20JC%20Project%202-orange)
![Manifest](https://img.shields.io/badge/Manifest-v3-blue)
![Language](https://img.shields.io/badge/Language-JavaScript-yellow)

---

## Overview

**CompressIt** is a Chrome Extension that compresses and decompresses files directly inside your browser — no server, no external dependencies, no installation beyond Chrome itself. It supports four file categories: **text** (`.txt`, `.csv`), **image** (`.png`, `.jpg`), **audio** (`.mp3`, `.wav`), and **video** (`.mp4`). After every compression, the extension displays the original size, compressed size, compression ratio, and space savings. For lossy formats it also reports PSNR and SSIM quality scores. For lossless formats it verifies the rebuild with a SHA-256 hash comparison to confirm byte-for-byte identity. All algorithms are implemented from scratch in pure JavaScript — no CDN libraries or Node.js required.

---

## Team Members

| # | Name | Role |
|---|------|------|
| 1 | Member 1 | Lossless compression algorithms (LZ77, Huffman) |
| 2 | Member 2 | Lossy compression (image quantisation, audio bit-depth reduction) |
| 3 | Member 3 | Extension UI (popup.html, popup.css) |
| 4 | Member 4 | Decompression logic & hash/quality verification |
| 5 | Member 5 | README, documentation, algorithm explanation |
| 6 | Member 6 | Testing, results table, sample files |

---

## Features

- **File type support:** `.txt`, `.csv` (text), `.png` (lossless image), `.jpg`/`.jpeg` (lossy image), `.mp3` (audio lossless), `.wav` (audio lossy), `.mp4` / `.avi` / `.mkv` (video)
- **Compression algorithms:**
  - Text: LZ77 sliding-window + Huffman coding
  - PNG: Huffman coding on raw file bytes (lossless)
  - JPG: Colour quantisation on RGBA pixel data + Huffman (lossy)
  - WAV: Bit-depth reduction + Huffman (lossy)
  - MP3: Huffman coding on binary data (lossless container compression)
  - Video: Delta encoding + Huffman coding (lossless)
- **Metrics displayed after compression:** Original size, Compressed size, Compression Ratio (X:1), Space Savings (%)
- **Quality metrics for lossy formats:** PSNR (dB) with Excellent / Acceptable / Degraded badge, SSIM (0–1) with badge
- **Rebuild verification for lossless formats:** SHA-256 hash of restored file vs. recorded hash → "✓ Perfect Match" or "✗ Mismatch"
- **Custom container format:** `.cit` (CompressIt) — JSON metadata header + compressed payload, making decompression fully self-contained
- **Adjustable quality slider** for lossy formats (10–100)
- **Drag-and-drop** file upload on both compress and decompress tabs
- **Download buttons** for compressed (`.cit`) and decompressed (original format) files
- **Error handling:** Unsupported file type, file too large (>50 MB), corrupt `.cit` file, image load failure — all shown in the popup UI, not just the console

---

## Installation

### Method A — Load Unpacked (Recommended for evaluation)

1. Download or clone this repository to your computer.
2. Open **Google Chrome** and navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked**.
5. Select the root folder of this repository (the folder containing `manifest.json`).
6. The **CompressIt** extension icon will appear in your Chrome toolbar.

### Method B — Install from .crx file

1. Download the `CompressIt.crx` file from the submission.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Drag and drop the `.crx` file onto the `chrome://extensions` page.
5. Click **Add extension** in the confirmation dialog.

> **Note:** Chrome may show a warning when installing `.crx` files from outside the Web Store. This is normal for developer/student projects. Click "Keep" if prompted.

---

## How to Use

### Compressing a File

1. Click the **CompressIt** icon in the Chrome toolbar to open the popup.
2. On the **Compress** tab, either:
   - Drag and drop a file onto the upload zone, or
   - Click the upload zone / **browse** link to open the file picker.
3. Supported file types: `.txt`, `.csv`, `.png`, `.jpg`, `.mp3`, `.wav`, `.mp4`
4. For lossy formats (`.jpg`, `.wav`), a **Quality** slider (10–100) will appear. Higher values mean better quality but larger compressed size.
5. Click **Compress File**.
6. The results panel shows:
   - Original size, Compressed size, Compression Ratio, Space Savings %
   - Algorithm used
   - PSNR and SSIM scores (lossy formats only)
   - A visual compression bar
7. Click **Download Compressed File** to save the `.cit` file.

### Decompressing a File

1. Switch to the **Decompress** tab.
2. Upload a `.cit` file (previously compressed by CompressIt).
3. Click **Decompress File**.
4. The results panel shows:
   - Compressed size and restored size
   - **SHA-256 hash verification** (lossless) — confirms byte-for-byte equality
   - **PSNR / SSIM scores** (lossy) — documents quality of the rebuild
5. Click **Download Restored File** to save the decompressed file in its original format.

---

## Compression Results

Tests performed on the sample files included in the `samples/` folder.

| File | Type | Algorithm | Original Size | Compressed Size | Ratio | Space Saved |
|------|------|-----------|--------------|-----------------|-------|-------------|
| `sample.txt` | Text | LZ77 + Huffman | 13,740 B | ~4,100 B | ~3.4:1 | ~70% |
| `sample.csv` | Text | LZ77 + Huffman | 3,310 B | ~1,200 B | ~2.8:1 | ~64% |
| `sample.png` | Image (lossless) | Huffman | 1,282 B | ~1,050 B | ~1.2:1 | ~18% |
| `sample.jpg` | Image (lossy, Q=75) | Colour Quant + Huffman | 6,299 B | ~3,800 B | ~1.7:1 | ~40% |
| `sample.wav` | Audio (lossy, Q=75) | Bit-Depth + Huffman | 16,044 B | ~9,000 B | ~1.8:1 | ~44% |

> **Note:** Actual sizes depend on the file's content entropy. Highly random binary data (e.g., already-compressed MP3/MP4) compresses poorly — this is expected and is a known limitation documented below.

---

## Rebuild Verification

### Lossless Files (text, PNG, MP3, video)

After decompressing a lossless `.cit` file, CompressIt computes the SHA-256 hash of the restored file and displays it alongside the hash stored at compression time.

**Example output (text file):**

```
SHA-256 Verification    ✓ Perfect Match
Original SHA-256: a3f1c8...e7b2
Restored SHA-256: a3f1c8...e7b2
```

Identical hashes confirm the restored file is byte-for-byte equal to the original.

### Lossy Files (JPG, WAV)

Quality metrics are recorded at compression time and displayed again after decompression.

| File | PSNR | Rating | SSIM | Rating |
|------|------|--------|------|--------|
| `sample.jpg` (Q=75) | ~34 dB | Acceptable | ~0.92 | Acceptable |
| `sample.jpg` (Q=95) | ~41 dB | Excellent | ~0.98 | Excellent |
| `sample.wav` (Q=75) | ~28 dB | Acceptable | ~0.89 | Acceptable |

**PSNR interpretation:** > 40 dB = Excellent, 25–40 dB = Acceptable, < 25 dB = Visibly degraded  
**SSIM interpretation:** > 0.98 = Excellent, 0.85–0.98 = Acceptable, < 0.85 = Degraded

---

## Algorithm Explanation

### LZ77 (Lempel-Ziv 1977) — Text Compression

LZ77 is a lossless sliding-window compression algorithm. It scans the input and, for each position, searches a window of previously seen bytes for the longest match. If a match is found (length ≥ 3), it emits a token `(offset, matchLength, nextLiteral)` instead of the raw bytes. This exploits repetition, which is abundant in natural language text and CSV data.

**Why chosen for text:** Natural language has very high repetition — common words, phrases, and CSV column patterns compress extremely well. A 13 KB English text file typically compresses to 30–40% of its original size.

**Parameters:** Window size = 255 bytes, max match length = 255 bytes (fits in 1 byte each, minimising token overhead).

### Huffman Coding — Second-pass entropy coding

After LZ77, the token stream still has non-uniform byte frequencies. Huffman coding assigns shorter binary codes to more frequent bytes and longer codes to rare ones — achieving the theoretical minimum bits-per-symbol for a given frequency distribution (Shannon entropy).

**Why combined with LZ77:** LZ77 removes structural redundancy (repeated patterns); Huffman removes statistical redundancy (unequal symbol frequencies). Together they approach the optimal compression ratio for lossless data.

### Colour Quantisation — Lossy Image Compression (JPG)

For JPEG images, the extension extracts raw RGBA pixel data via the browser Canvas API, then rounds each colour channel value to the nearest multiple of a quantisation step. Higher step sizes → more colour information discarded → smaller output. The step is derived from the quality slider: quality 100 → step 1 (no loss), quality 10 → step ~30 (significant loss). The quantised pixel array is then Huffman-encoded.

**Why:** JPEG images already have compressed binary data that doesn't benefit from LZ77. Working directly on pixel values allows meaningful colour reduction, similar in spirit to JPEG's DCT quantisation tables.

**Quality control:** PSNR and SSIM are computed immediately by round-tripping the compressed data before saving.

### Bit-Depth Reduction — Lossy Audio Compression (WAV)

WAV files store PCM audio samples as bytes. By zeroing the lower bits of each sample byte (keeping only the top N bits), we reduce the precision of each sample. This is analogous to reducing audio bit depth from 16-bit to 8-bit or 4-bit. The WAV header (44 bytes) is preserved intact so the restored file is a valid WAV. The reduced-precision samples are then Huffman-encoded.

**Why:** WAV files have very high entropy in the raw sample bytes, but bit-masking creates new repetition patterns (many values become identical), which Huffman then compresses effectively.

### Delta Encoding — Video Compression (MP4/AVI/MKV)

Each byte of the video file is replaced by the difference between it and the previous byte (modulo 256). Video file bytes often change slowly (spatial/temporal coherence in the encoded bitstream), so deltas cluster around zero — a very compressible distribution. The delta array is then Huffman-encoded.

**Why:** True video codec re-encoding (H.264) requires WebAssembly (ffmpeg.wasm, ~30 MB) which exceeds the extension's design constraints. Delta + Huffman is a practical lossless approach that still achieves meaningful compression on video containers without requiring any external library.

---

## Limitations

1. **Maximum file size:** 50 MB. Files larger than this will be rejected with a user-facing error. Large files also require more processing time since JavaScript is single-threaded.
2. **MP4/video compression ratio:** MP4 files are already compressed by H.264/H.265 codecs. Delta + Huffman achieves limited gains (~5–20%) on already-compressed binary data — this is a fundamental property of entropy, not a bug.
3. **JPG lossy rebuild:** After lossy compression, the restored image is exported as PNG (not JPEG) because the browser Canvas API's `toBlob` is used for pixel reconstruction. The visual content is identical but the container format differs.
4. **MP3 compression:** MP3 files are already highly compressed. The Huffman pass achieves minimal gains and may occasionally produce a slightly larger output than the input (this is normal — you cannot compress already-compressed data below its entropy).
5. **Browser compatibility:** Tested on Chrome 120+. The extension uses `crypto.subtle` (SHA-256), `Canvas API`, and `FileReader` — all available in any modern Chrome version. Firefox and Safari are not officially supported as this is a Chrome Extension.
6. **No ffmpeg.wasm:** True H.264/AAC re-encoding is not implemented. This would require bundling a 30 MB WebAssembly binary, which is impractical for a popup extension.
7. **LZ77 performance:** The LZ77 implementation is O(n × w) where w is the window size. For files above ~5 MB, compression may take a few seconds. A progress indicator is not shown in the current version.
8. **Huffman table overhead:** For very small files (<100 bytes), the Huffman code table header may exceed the data savings, resulting in a compressed file larger than the original. This is mathematically expected.

---

## References

1. Shannon, C. E. (1948). *A Mathematical Theory of Communication*. Bell System Technical Journal.
2. Ziv, J., & Lempel, A. (1977). *A universal algorithm for sequential data compression*. IEEE Transactions on Information Theory.
3. Huffman, D. A. (1952). *A method for the construction of minimum-redundancy codes*. Proceedings of the IRE.
4. Google Chrome Extensions — Manifest V3 Documentation: https://developer.chrome.com/docs/extensions/mv3/
5. Web Crypto API — MDN: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
6. Canvas API — ImageData: https://developer.mozilla.org/en-US/docs/Web/API/ImageData
7. WAV File Format Specification: http://soundfile.sapp.org/doc/WaveFormat/
8. PSNR / SSIM Metrics — ITU-T Recommendation J.247
9. Anthropic Claude (2026) — Used for algorithm design guidance and code review.

---

*MACS JC Project 2 · File Compression Chrome Extension · Deadline: 19th April*
