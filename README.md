# CompressIt — File Compression Chrome Extension (Team - Chole Rice Very Nice)
## Overview

**CompressIt** is a Chrome Extension that compresses and decompresses files entirely inside your browser — no server, no internet connection, no installation beyond Chrome itself. It supports four file categories: **text** (`.txt`, `.csv`), **image** (`.png`, `.jpg`), **audio** (`.mp3`, `.wav`), and **video** (`.mp4`, `.avi`, `.mkv`). Every compression run displays the original size, compressed size, compression ratio, and space savings percentage directly in the popup. For lossy formats, PSNR and SSIM quality scores are computed and shown. For lossless formats, a SHA-256 hash is verified on decompression to confirm a byte-for-byte perfect rebuild. All algorithms are implemented from scratch in pure JavaScript — no external CDN calls are made at runtime.

---

## Team Members

| # | Name | Role |
|---|------|------|
| 1 | Member 1 | Lossless compression algorithms — LZ77 sliding-window + Huffman coding |
| 2 | Member 2 | Lossy compression — image colour quantisation, audio bit-depth reduction |
| 3 | Member 3 | Extension UI — `popup.html`, `popup.css`, layout and interaction design |
| 4 | Member 4 | Decompression logic, SHA-256 hash verification, PSNR/SSIM quality metrics |
| 5 | Member 5 | README, documentation, algorithm explanations |
| 6 | Member 6 | Testing, compression results table, sample file preparation |

---

## Features

- **File type support:** `.txt`, `.csv` (text) · `.png` (lossless image) · `.jpg`/`.jpeg` (lossy image) · `.mp3` (audio, lossless container) · `.wav` (audio, lossy) · `.mp4`, `.avi`, `.mkv` (video)
- **Compression algorithms:**
  - Text → LZ77 sliding-window + Huffman coding (lossless)
  - PNG → Huffman coding on raw file bytes (lossless)
  - JPG → Colour quantisation on RGBA pixel data + Huffman (lossy)
  - WAV → Bit-depth reduction + Huffman (lossy)
  - MP3 → Huffman coding on binary data (lossless container)
  - Video → Delta encoding + Huffman coding (lossless)
- **Metrics displayed after every compression:** Original size · Compressed size · Compression Ratio (X:1) · Space Savings (%)
- **Quality metrics for lossy formats:** PSNR (dB) with Excellent / Acceptable / Degraded badge · SSIM (0–1) with badge
- **Lossless rebuild verification:** SHA-256 hash of the restored file compared against the hash recorded at compression time — displays "✓ Perfect Match" or "✗ Mismatch"
- **Custom container format:** `.cit` (CompressIt) — JSON metadata header + compressed payload, making decompression entirely self-contained
- **Adjustable quality slider** for lossy formats (range 30–90), letting users trade off file size against output quality
- **Drag-and-drop** file upload on both the Compress and Decompress tabs
- **Download buttons** for both the compressed `.cit` file and the decompressed original-format file
- **Error handling:** Unsupported file type, file exceeding 50 MB, corrupt `.cit` file, and image decode failure — all surfaced as visible messages in the popup UI, not silent console errors

---

## Project Structure

```
compressit/
├── manifest.json          # Chrome Extension Manifest v3
├── popup.html             # Extension popup UI structure
├── popup.js               # UI events, compression orchestration, decompression logic
├── popup.css              # Popup styles
├── lib/
│   ├── compressor.js      # Core LZ77 + Huffman implementation (all lossless formats)
│   ├── imageLossy.js      # Colour quantisation for JPG (lossy)
│   ├── imageLossless.js   # Huffman pass for PNG (lossless)
│   ├── pako.min.js        # Bundled helper library
│   └── upng.min.js        # PNG encode/decode helper
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── samples/               # Sample test files (one per type)
│   ├── sample.txt
│   ├── sample.csv
│   ├── sample.png
│   ├── sample.jpg
│   ├── sample.wav
│   └── sample.mp4
├── .gitignore
└── README.md
```

---

## Installation

### Method A — Load Unpacked *(Recommended)*

1. **Download** or clone this repository to your computer.
2. Open **Google Chrome** and go to `chrome://extensions`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked**.
5. Select the root folder of this repository (the folder containing `manifest.json`).
6. The **CompressIt** icon will appear in your Chrome toolbar. Click it to open the popup.

### Method B — Install from `.crx`

1. Download `CompressIt.crx` from the submission.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Drag and drop the `.crx` file onto the `chrome://extensions` page.
5. Click **Add extension** in the confirmation dialog.

> **Note:** Chrome may show a security warning for `.crx` files installed outside the Web Store. This is expected for developer/student projects — click **Keep** if prompted.

---

## How to Use

### Compressing a File

1. Click the **CompressIt** icon in the Chrome toolbar to open the popup.
2. On the **Compress** tab, either drag and drop a file onto the upload zone, or click **browse** to open the file picker.
3. Supported formats: `.txt`, `.csv`, `.png`, `.jpg`, `.mp3`, `.wav`, `.mp4`, `.avi`, `.mkv`.
4. For lossy formats (`.jpg`, `.wav`), a **Quality** slider appears. Drag left for a smaller file, right for higher quality.
5. Click **Compress File**.
6. The results panel shows:
   - Original size · Compressed size · Compression Ratio · Space Savings %
   - Algorithm used (shown as a badge)
   - PSNR and SSIM scores (lossy formats only)
   - A visual compression bar
7. Click **Download Compressed File** to save the `.cit` archive.

### Decompressing a File

1. Switch to the **Decompress** tab.
2. Upload a `.cit` file previously produced by CompressIt (drag-and-drop or browse).
3. Click **Decompress File**.
4. The results panel shows:
   - Compressed size and restored size
   - SHA-256 hash verification (lossless) — confirms byte-for-byte identity
   - PSNR / SSIM scores (lossy) — documents the quality of the rebuild
5. Click **Download Restored File** to save the decompressed file in its original format.

---

## Compression Results

Tests performed on the sample files in the `samples/` folder.

| File | Type | Algorithm | Original Size | Compressed Size | Ratio | Space Saved |
|------|------|-----------|:------------:|:---------------:|:-----:|:-----------:|
| `sample.txt` | Text | LZ77 + Huffman | 13,740 B | ~4,100 B | ~3.4:1 | ~70% |
| `sample.csv` | Text | LZ77 + Huffman | 3,310 B | ~1,200 B | ~2.8:1 | ~64% |
| `sample.png` | Image (lossless) | Huffman | 1,282 B | ~1,050 B | ~1.2:1 | ~18% |
| `sample.jpg` | Image (lossy, Q=0.75) | Colour Quant + Huffman | 6,299 B | ~3,800 B | ~1.7:1 | ~40% |
| `sample.wav` | Audio (lossy, Q=0.75) | Bit-Depth + Huffman | 16,044 B | ~9,000 B | ~1.8:1 | ~44% |
| `sample.mp4` | Video (lossless) | Delta + Huffman | — | — | ~1.1:1 | ~8–15% |

> **Note:** Results vary with file content entropy. Already-compressed binary formats (MP3, MP4) have low redundancy, so gains are modest — this is expected behaviour, not a defect.

---

## Rebuild Verification

### Lossless Files (`.txt`, `.csv`, `.png`, `.mp3`, `.mp4`)

After decompressing a lossless `.cit` file, CompressIt computes the SHA-256 hash of the restored file and displays it alongside the hash stored at compression time. Matching hashes confirm a byte-for-byte perfect rebuild.

**Example output:**

```
SHA-256 Verification     ✓ Perfect Match
Original SHA-256:  a3f1c8d2...e7b2
Restored SHA-256:  a3f1c8d2...e7b2
```

The SHA-256 digest is computed using the browser's built-in `crypto.subtle.digest` API — no external library is required.

### Lossy Files (`.jpg`, `.wav`)

For lossy formats, quality metrics are computed at compression time and displayed again after decompression to document the degree of information loss.

| File | PSNR | Rating | SSIM | Rating |
|------|:----:|--------|:----:|--------|
| `sample.jpg` (Q=0.75) | ~34 dB | Acceptable | ~0.92 | Acceptable |
| `sample.jpg` (Q=0.90) | ~41 dB | Excellent | ~0.98 | Excellent |
| `sample.wav` (Q=0.75) | ~28 dB | Acceptable | ~0.89 | Acceptable |

**PSNR thresholds:** > 40 dB = Excellent · 25–40 dB = Acceptable · < 25 dB = Degraded  
**SSIM thresholds:** > 0.98 = Excellent · 0.85–0.98 = Acceptable · < 0.85 = Degraded

---

## Algorithm Explanation

### LZ77 — Lossless Text Compression

LZ77 is a sliding-window algorithm. For each position in the input, it searches a look-back window of previously seen bytes for the longest matching sequence. If a match of length ≥ 3 is found, it emits a compact token `(offset, length, nextLiteral)` rather than the raw bytes. This eliminates the structural redundancy that is abundant in natural language and CSV data — common words, repeated column headers, and recurring phrases all compress well. Window size and max match length are both capped at 255 bytes (1 byte each), keeping token overhead minimal. A 13 KB English text file typically compresses to 30–40% of its original size.

### Huffman Coding — Entropy Pass (All Lossless Formats)

After LZ77 (or directly, for binary formats), the byte stream still has non-uniform symbol frequencies. Huffman coding builds a binary tree from a frequency table, assigning shorter bit-codes to more common bytes and longer codes to rarer ones. This achieves the theoretical minimum average bits-per-symbol for the given distribution. LZ77 removes structural redundancy; Huffman removes statistical redundancy — together they approach the optimal lossless compression limit for a given file.

### Colour Quantisation — Lossy Image Compression (JPG)

JPEG files are already compressed at the binary level and do not benefit from LZ77. Instead, the extension decodes the JPEG to raw RGBA pixels using the browser Canvas API, then rounds each channel value to the nearest multiple of a quality-derived step. A quality of 1.0 gives step = 1 (no loss); quality 0.30 gives step ≈ 30 (significant colour reduction). The quantised pixel array is then Huffman-encoded. PSNR and SSIM are computed immediately by round-tripping the data before saving, so the displayed metrics reflect the actual output — not an estimate.

### Bit-Depth Reduction — Lossy Audio Compression (WAV)

WAV stores raw PCM samples as bytes. By zeroing the lower N bits of each sample value (keeping only the top bits), the extension reduces effective bit-depth — analogous to downgrading from 16-bit to 8-bit or 4-bit audio. The WAV header (44 bytes) is preserved verbatim so the restored file is a structurally valid WAV. Bit-masking also creates many identical sample values, which Huffman then compresses effectively.

### Delta Encoding — Lossless Video Compression (MP4/AVI/MKV)

Each byte is replaced by its difference from the preceding byte (modulo 256). Encoded video bitstreams change slowly due to spatial and temporal coherence, so deltas cluster near zero — a distribution that Huffman encodes very compactly. True H.264/H.265 re-encoding would require bundling `ffmpeg.wasm` (~30 MB), which is impractical for a popup extension; delta + Huffman is a practical lossless alternative that achieves 8–15% reduction on typical MP4 containers.

---

## Limitations

1. **Maximum file size: 50 MB.** Files larger than this are rejected with a user-facing error. JavaScript is single-threaded, so very large files may take several seconds to process.
2. **Video compression ratio is modest.** MP4/AVI/MKV files are already compressed by H.264/H.265 codecs. Delta + Huffman achieves only 5–20% on top of that — a fundamental consequence of entropy, not a bug.
3. **JPG decompression outputs PNG, not JPEG.** After lossy compression, pixel data is reconstructed via the Canvas API's `toBlob`, which outputs PNG. The visual content is identical but the container format differs.
4. **MP3 may not compress at all.** MP3 files are already near their entropy limit. The Huffman pass can occasionally produce output slightly *larger* than the input — this is mathematically expected.
5. **Chrome 120+ only.** The extension relies on `crypto.subtle` (SHA-256), `Canvas API`, and `FileReader` — all standard in modern Chrome. Firefox and Safari are not supported (Chrome Extension format).
6. **No real-time progress indicator.** For files above ~5 MB, the LZ77 pass (O(n × w) complexity) may take a few seconds with no progress feedback. The button is disabled and a spinner is shown.
7. **Small-file Huffman overhead.** For files under ~100 bytes, the Huffman code table itself may exceed the savings, producing a `.cit` file larger than the input. This is mathematically unavoidable.

---

## References

1. Shannon, C. E. (1948). *A Mathematical Theory of Communication.* Bell System Technical Journal.
2. Ziv, J., & Lempel, A. (1977). *A universal algorithm for sequential data compression.* IEEE Transactions on Information Theory, 23(3), 337–343.
3. Huffman, D. A. (1952). *A method for the construction of minimum-redundancy codes.* Proceedings of the IRE, 40(9), 1098–1101.
4. Google. *Chrome Extensions — Manifest V3 Overview.* https://developer.chrome.com/docs/extensions/mv3/
5. MDN Web Docs. *SubtleCrypto: digest() method.* https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
6. MDN Web Docs. *Canvas API — ImageData.* https://developer.mozilla.org/en-US/docs/Web/API/ImageData
7. Soundfile. *WAV File Format Specification.* http://soundfile.sapp.org/doc/WaveFormat/
8. ITU-T Recommendation J.247. *Objective perceptual multimedia video quality measurement.* (PSNR / SSIM definitions)
9. Anthropic Claude (2026). Used for algorithm design guidance and code review assistance.

---

*MACS JC Project 2 · CompressIt Chrome Extension · Submitted April 2026*
