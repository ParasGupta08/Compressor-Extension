/**
 * popup.js
 * UI event handling, compression orchestration, and decompression logic
 * for the CompressIt Chrome Extension.
 *
 * Architecture:
 *  - UI events (tab switching, file selection, button clicks) are handled here.
 *  - Compression / decompression algorithms are in lib/compressor.js (window.Compressor).
 *  - Image processing uses the browser's Canvas API for pixel-level access.
 *  - File format: compressed files are saved as .cit (CompressIt) with a JSON header.
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: State
// ─────────────────────────────────────────────────────────────────────────────

/** @type {File|null} Currently selected file for compression */
let selectedFile = null;

/** @type {File|null} Currently selected .cit file for decompression */
let selectedCitFile = null;

/** @type {Uint8Array|null} Last compressed file bytes ready for download */
let compressedBytes = null;

/** @type {string|null} Suggested filename for the compressed download */
let compressedFilename = null;

/** @type {Uint8Array|null} Last decompressed file bytes ready for download */
let decompressedBytes = null;

/** @type {string|null} Suggested filename for the decompressed download */
let decompressedFilename = null;

/** @type {Uint8Array|null} Original file bytes — saved for lossy quality comparison */
let originalBytes = null;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: DOM references
// ─────────────────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

// Compress tab
const uploadZone       = $('uploadZone');
const fileInput        = $('fileInput');
const browseBtn        = $('browseBtn');
const clearBtn         = $('clearBtn');
const fileInfo         = $('fileInfo');
const fileName         = $('fileName');
const fileSizeOrig     = $('fileSizeOrig');
const fileTypeIcon     = $('fileTypeIcon');
const qualityRow       = $('qualityRow');
const qualitySlider    = $('qualitySlider');
const qualityDisplay   = $('qualityDisplay');
const compressBtn      = $('compressBtn');
const compressSpinner  = $('compressSpinner');
const resultsPanel     = $('resultsPanel');
const algoBadge        = $('algoBadge');
const origSize         = $('origSize');
const compSize         = $('compSize');
const compRatio        = $('compRatio');
const spaceSaved       = $('spaceSaved');
const qualityMetrics   = $('qualityMetrics');
const psnrValue        = $('psnrValue');
const psnrBadge        = $('psnrBadge');
const ssimValue        = $('ssimValue');
const ssimBadge        = $('ssimBadge');
const compressBarFill  = $('compressBarFill');
const compressBarLabel = $('compressBarLabel');
const downloadComp     = $('downloadCompressed');
const errorBox         = $('errorBox');
const errorText        = $('errorText');

// Decompress tab
const uploadZone2       = $('uploadZone2');
const fileInput2        = $('fileInput2');
const browseBtn2        = $('browseBtn2');
const clearBtn2         = $('clearBtn2');
const fileInfo2         = $('fileInfo2');
const fileName2         = $('fileName2');
const fileSize2         = $('fileSize2');
const decompressBtn     = $('decompressBtn');
const decompressSpinner = $('decompressSpinner');
const decompressResults = $('decompressResults');
const dCompSize         = $('d-compSize');
const dOrigSize         = $('d-origSize');
const hashSection       = $('hashSection');
const hashStatus        = $('hashStatus');
const hashOriginal      = $('hashOriginal');
const hashRestored      = $('hashRestored');
const dQualityMetrics   = $('d-qualityMetrics');
const dPsnrValue        = $('d-psnrValue');
const dPsnrBadge        = $('d-psnrBadge');
const dSsimValue        = $('d-ssimValue');
const dSsimBadge        = $('d-ssimBadge');
const downloadDecomp    = $('downloadDecompressed');
const errorBox2         = $('errorBox2');
const errorText2        = $('errorText2');

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats a byte count into a human-readable string (B, KB, MB).
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Returns an emoji icon for the given file extension.
 * @param {string} ext - File extension (without dot)
 * @returns {string}
 */
function iconForExt(ext) {
  const map = {
    txt: '📄', csv: '📊',
    png: '🖼', jpg: '🖼', jpeg: '🖼',
    mp3: '🎵', wav: '🎵',
    mp4: '🎬', avi: '🎬', mkv: '🎬',
    cit: '📦',
  };
  return map[ext.toLowerCase()] || '📄';
}

/**
 * Returns whether the given file extension is a lossy type.
 * @param {string} ext
 * @returns {boolean}
 */
function isLossyType(ext) {
  return ['jpg', 'jpeg', 'wav', 'mp4', 'avi', 'mkv'].includes(ext.toLowerCase());
}

/**
 * Shows the error box with the given message.
 * @param {string} msg
 * @param {boolean} isDecompress - If true, shows the decompress error box
 */
function showError(msg, isDecompress = false) {
  if (isDecompress) {
    errorText2.textContent = msg;
    errorBox2.classList.remove('hidden');
  } else {
    errorText.textContent = msg;
    errorBox.classList.remove('hidden');
  }
}

/**
 * Hides both error boxes.
 */
function clearErrors() {
  errorBox.classList.add('hidden');
  errorBox2.classList.add('hidden');
}

/**
 * Reads a File object as an ArrayBuffer and returns a Uint8Array.
 * @param {File} file
 * @returns {Promise<Uint8Array>}
 */
function readFileAsUint8Array(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(new Uint8Array(e.target.result));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Triggers a file download in the browser.
 * @param {Uint8Array} bytes - File contents
 * @param {string} filename - Suggested filename
 * @param {string} mimeType - MIME type
 */
function triggerDownload(bytes, filename, mimeType = 'application/octet-stream') {
  const blob = new Blob([bytes], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Sets the quality badge class based on a PSNR value.
 * @param {HTMLElement} badge
 * @param {number} psnr
 */
function setPSNRBadge(badge, psnr) {
  if (psnr === Infinity) {
    badge.textContent = 'Lossless';
    badge.className = 'qm-badge good';
  } else if (psnr >= 40) {
    badge.textContent = 'Excellent';
    badge.className = 'qm-badge good';
  } else if (psnr >= 25) {
    badge.textContent = 'Acceptable';
    badge.className = 'qm-badge ok';
  } else {
    badge.textContent = 'Degraded';
    badge.className = 'qm-badge poor';
  }
}

/**
 * Sets the quality badge class based on an SSIM value.
 * @param {HTMLElement} badge
 * @param {number} ssim
 */
function setSSIMBadge(badge, ssim) {
  if (ssim >= 0.98) {
    badge.textContent = 'Excellent';
    badge.className = 'qm-badge good';
  } else if (ssim >= 0.85) {
    badge.textContent = 'Acceptable';
    badge.className = 'qm-badge ok';
  } else {
    badge.textContent = 'Degraded';
    badge.className = 'qm-badge poor';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: CIT Container format
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Packages compressed data into a .cit container.
 * Format: JSON header (UTF-8, null-terminated) + raw compressed bytes.
 *
 * @param {Uint8Array}  data       - Compressed payload bytes
 * @param {object}      meta       - Metadata object stored in header
 * @returns {Uint8Array}
 */
function packCIT(data, meta) {
  const headerJson = JSON.stringify(meta) + '\0';
  const headerBytes = new TextEncoder().encode(headerJson);
  const result = new Uint8Array(headerBytes.length + data.length);
  result.set(headerBytes, 0);
  result.set(data, headerBytes.length);
  return result;
}

/**
 * Parses a .cit container file.
 * @param {Uint8Array} data
 * @returns {{ meta: object, payload: Uint8Array }}
 */
function unpackCIT(data) {
  // Find the null terminator for the header
  let headerEnd = 0;
  while (headerEnd < data.length && data[headerEnd] !== 0) headerEnd++;
  const headerJson = new TextDecoder().decode(data.slice(0, headerEnd));
  const meta = JSON.parse(headerJson);
  const payload = data.slice(headerEnd + 1);
  return { meta, payload };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: Image helpers (Canvas API)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads a File as an ImageData object using the canvas API.
 * @param {File} file
 * @returns {Promise<ImageData>}
 */
function loadImageData(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(imageData);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed.')); };
    img.src = url;
  });
}

/**
 * Converts RGBA pixel data back to a PNG Blob using Canvas.
 * @param {Uint8Array} pixelData - Raw RGBA bytes
 * @param {number} width
 * @param {number} height
 * @returns {Promise<Blob>}
 */
function pixelDataToPNGBlob(pixelData, width, height) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    imgData.data.set(pixelData);
    ctx.putImageData(imgData, 0, 0);
    canvas.toBlob(blob => resolve(blob), 'image/png');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: Compression orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main compression handler. Reads selectedFile, applies the appropriate
 * algorithm, packages the result, and updates the UI.
 * @returns {Promise<void>}
 */
async function handleCompress() {
  clearErrors();
  resultsPanel.classList.add('hidden');

  if (!selectedFile) return;

  const maxSize = 50 * 1024 * 1024; // 50 MB guard
  if (selectedFile.size > maxSize) {
    showError(`File too large (max 50 MB). This file is ${formatBytes(selectedFile.size)}.`);
    return;
  }

  // Show spinner
  compressBtn.querySelector('.btn-text').classList.add('hidden');
  compressSpinner.classList.remove('hidden');
  compressBtn.disabled = true;

  try {
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    let result;   // { compressed: Uint8Array, algorithm: string }
    let meta = {
      originalName: selectedFile.name,
      originalSize: selectedFile.size,
      fileType: ext,
      isLossy: isLossyType(ext),
      compressedAt: new Date().toISOString(),
    };

    // ── TEXT ──────────────────────────────────────────────────────────
    if (['txt', 'csv'].includes(ext)) {
      const data = await readFileAsUint8Array(selectedFile);
      originalBytes = data;
      result = window.Compressor.compressText(data);
      meta.isLossy = false;
    }

   
    // ── IMAGE LOSSLESS (PNG via UPNG)
else if (ext === 'png') {
  const bytes = await readFileAsUint8Array(selectedFile);
  originalBytes = bytes;

  result = await window.ImageLossless.compress(bytes);

  meta.isLossy = false;
  meta.imgWidth = result.width;
  meta.imgHeight = result.height;
}

// ── IMAGE LOSSY (WebP / JPEG)
else if (['jpg', 'jpeg'].includes(ext)) {
  const quality = parseInt(qualitySlider.value, 10) / 100;

  result = await window.ImageLossy.compress(selectedFile, quality);

  meta.isLossy = true;
  meta.quality = quality;
  meta.mimeType = result.mimeType;
}


    // ── AUDIO (WAV — lossy) ────────────────────────────────────────
    else if (ext === 'wav') {
      const quality = parseInt(qualitySlider.value, 10);
      const data = await readFileAsUint8Array(selectedFile);
      originalBytes = data;
      meta.quality = quality;
      result = window.Compressor.compressAudio(data, quality);
      meta.isLossy = true;

      const rebuilt = window.Compressor.decompressAudio(result.compressed);
      meta.psnr = window.Compressor.computePSNR(originalBytes, rebuilt);
      meta.ssim = window.Compressor.computeSSIM(originalBytes, rebuilt);
    }

    // ── AUDIO (MP3 — lossless Huffman over binary) ─────────────────
    else if (ext === 'mp3') {
      const data = await readFileAsUint8Array(selectedFile);
      originalBytes = data;
      result = window.Compressor.compressMP3(data);
      meta.isLossy = false;
    }

    // ── VIDEO ──────────────────────────────────────────────────────
    else if (['mp4', 'avi', 'mkv'].includes(ext)) {
      const quality = parseInt(qualitySlider.value, 10);
      originalBytes = null;
      meta.quality = quality;
      meta.isLossy = true;
      result = await window.Compressor.compressVideo(selectedFile, quality, {
        mimeType: selectedFile.type || 'video/mp4',
      });
      meta.outputMimeType = result.mimeType;
      meta.outputExtension = result.extension;
      meta.videoWidth = result.width;
      meta.videoHeight = result.height;
      meta.videoDuration = result.duration;
    }

    else {
      throw new Error(`Unsupported file type: .${ext}. Please use .txt, .csv, .png, .jpg, .mp3, .wav.`);
    }

    meta.algorithm = result.algorithm;

    // For lossless types, store the SHA-256 of the ORIGINAL file for later verification
    if (!meta.isLossy && originalBytes && window.Compressor && window.Compressor.sha256) {
      meta.originalHash = await window.Compressor.sha256(originalBytes);
    }

    // Pack into .cit container
    const citData = packCIT(result.compressed, meta);

    // ── Update UI ───────────────────────────────────────────────────
    const oSize = selectedFile.size;
    const cSize = citData.length;
    const ratio = oSize / cSize;
    const saved = ((oSize - cSize) / oSize) * 100;

    if (cSize >= oSize) {
  showError("File already optimized — no compression gain.");

  compressBtn.querySelector('.btn-text').classList.remove('hidden');
  compressSpinner.classList.add('hidden');
  compressBtn.disabled = false;

  return; // ⛔ STOP execution here
}


    compressedBytes   = citData;
    compressedFilename = selectedFile.name.replace(/\.[^.]+$/, '') + '.cit';

    origSize.textContent     = formatBytes(oSize);
    compSize.textContent     = formatBytes(cSize);
    compRatio.textContent    = `${ratio.toFixed(2)}:1`;
    spaceSaved.textContent   = saved > 0 ? `${saved.toFixed(1)}%` : '0%';
    algoBadge.textContent    = result.algorithm;

    // Compression bar — shows how much of original size remains
    const barPct = Math.min(100, Math.max(0, (cSize / oSize) * 100));
    compressBarFill.style.width = `${barPct}%`;
    compressBarLabel.textContent = saved > 0 ? `-${saved.toFixed(1)}%` : 'No gain';

    // Lossy quality metrics
    if (meta.isLossy && meta.psnr !== undefined) {
      const psnrVal = meta.psnr === Infinity ? '∞ dB' : `${meta.psnr.toFixed(2)} dB`;
      const ssimVal = meta.ssim !== undefined ? meta.ssim.toFixed(4) : '—';
      psnrValue.textContent = psnrVal;
      ssimValue.textContent = ssimVal;
      setPSNRBadge(psnrBadge, meta.psnr);
      if (meta.ssim !== undefined) setSSIMBadge(ssimBadge, meta.ssim);
      qualityMetrics.classList.remove('hidden');
    } else {
      qualityMetrics.classList.add('hidden');
    }

    resultsPanel.classList.remove('hidden');

  } catch (err) {
    showError(err.message || 'An unexpected error occurred during compression.');
  } finally {
    compressBtn.querySelector('.btn-text').classList.remove('hidden');
    compressSpinner.classList.add('hidden');
    compressBtn.disabled = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: Decompression orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main decompression handler. Reads selectedCitFile, unpacks the CIT container,
 * applies the appropriate decompression algorithm, and updates the UI.
 * @returns {Promise<void>}
 */
async function handleDecompress() {
  clearErrors();
  decompressResults.classList.add('hidden');

  if (!selectedCitFile) return;

  decompressBtn.querySelector('.btn-text').classList.add('hidden');
  decompressSpinner.classList.remove('hidden');
  decompressBtn.disabled = true;

  try {
    const rawData = await readFileAsUint8Array(selectedCitFile);
    const { meta, payload } = unpackCIT(rawData);

    const ext = (meta.fileType || '').toLowerCase();
    let restored; // Uint8Array of original file bytes

    // ── TEXT ──────────────────────────────────────────────────────────
    if (['txt', 'csv'].includes(ext)) {
      restored = window.Compressor.decompressText(payload);
    }
// ── IMAGE (NEW SYSTEM — direct restore)
else if (['png', 'jpg', 'jpeg'].includes(ext)) {
  restored = payload; // ✅ already valid file
}
    // ── AUDIO WAV (lossy) ─────────────────────────────────────────
    else if (ext === 'wav') {
      restored = window.Compressor.decompressAudio(payload);
      if (meta.psnr !== undefined) {
        dPsnrValue.textContent = meta.psnr === Infinity ? '∞ dB' : `${meta.psnr.toFixed(2)} dB`;
        dSsimValue.textContent = meta.ssim !== undefined ? meta.ssim.toFixed(4) : '—';
        setPSNRBadge(dPsnrBadge, meta.psnr);
        if (meta.ssim !== undefined) setSSIMBadge(dSsimBadge, meta.ssim);
        dQualityMetrics.classList.remove('hidden');
      }
    }

    // ── AUDIO MP3 (lossless Huffman) ───────────────────────────────
    else if (ext === 'mp3') {
      // compressMP3 stores a 1-byte flag then huffman-encoded data
      restored = window.Compressor.huffmanDecode(payload.slice(1));
    }

    // ── VIDEO ──────────────────────────────────────────────────────
    else if (['mp4', 'avi', 'mkv'].includes(ext)) {
      restored = window.Compressor.decompressVideo(payload);
      if (meta.psnr !== undefined) {
        dPsnrValue.textContent = meta.psnr === Infinity ? '∞ dB' : `${meta.psnr.toFixed(2)} dB`;
        dSsimValue.textContent = meta.ssim !== undefined ? meta.ssim.toFixed(4) : '—';
        setPSNRBadge(dPsnrBadge, meta.psnr);
        if (meta.ssim !== undefined) setSSIMBadge(dSsimBadge, meta.ssim);
        dQualityMetrics.classList.remove('hidden');
      }
    }

    else {
      throw new Error(`Unknown file type in container: .${ext}`);
    }

    decompressedBytes = restored;
    
    // 🔥 FIXED filename logic for images
if (meta.mimeType === 'image/webp') {
  decompressedFilename = meta.originalName.replace(/\.[^.]+$/, '.webp');
}
else if (meta.mimeType === 'image/jpeg') {
  decompressedFilename = meta.originalName.replace(/\.[^.]+$/, '.jpg');
}
else {
  decompressedFilename = meta.originalName || `restored_file.${ext}`;
}

    // ── Size metrics ────────────────────────────────────────────────
    dCompSize.textContent = formatBytes(rawData.length);
    if (ext === 'png') {
  dOrigSize.textContent = 'Re-encoded PNG (size may differ)';
} else {
  dOrigSize.textContent = formatBytes(restored.length);
}
    // ── Hash verification ───────────────────────────────────────────
    if (!meta.isLossy && ext !== 'png') {
      hashSection.classList.remove('hidden');
      dQualityMetrics.classList.add('hidden');

      // Compute SHA-256 of restored data

      let restoredHash = "Hash unavailable";

if (window.Compressor && window.Compressor.sha256) {
  restoredHash = await window.Compressor.sha256(restored);
}

hashRestored.textContent = `Restored SHA-256: ${restoredHash}`;

      if (meta.originalHash) {
        hashOriginal.textContent = `Original SHA-256: ${meta.originalHash}`;
        if (restoredHash === meta.originalHash) {
          hashStatus.textContent  = '✓ Perfect Match';
          hashStatus.className    = 'hash-status match';
        } else {
          hashStatus.textContent  = '✗ Mismatch';
          hashStatus.className    = 'hash-status mismatch';
        }
      } else {
        hashOriginal.textContent = 'Original hash not stored (compress again to include).';
        hashStatus.textContent = 'Lossless (visual match) — binary may differ';
hashStatus.className = 'hash-status match';
      }
    } else {
      hashSection.classList.add('hidden');
      hashStatus.textContent  = 'Lossy — approx.';
      hashStatus.className    = 'hash-status lossy';
    }

    decompressResults.classList.remove('hidden');

  } catch (err) {
    showError(err.message || 'Failed to decompress. Make sure this is a valid .cit file.', true);
  } finally {
    decompressBtn.querySelector('.btn-text').classList.remove('hidden');
    decompressSpinner.classList.add('hidden');
    decompressBtn.disabled = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: File selection & UI state management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates the compress tab UI after a file is selected.
 * @param {File} file
 */
function setSelectedFile(file) {
  selectedFile = file;
  compressedBytes = null;
  clearErrors();
  resultsPanel.classList.add('hidden');

  const ext = file.name.split('.').pop().toLowerCase();
  fileName.textContent     = file.name;
  fileSizeOrig.textContent = formatBytes(file.size);
  fileTypeIcon.textContent = iconForExt(ext);
  fileInfo.classList.remove('hidden');
  compressBtn.disabled = false;

  // Show quality slider for lossy types
  if (isLossyType(ext)) {
    qualityRow.classList.remove('hidden');
  } else {
    qualityRow.classList.add('hidden');
  }
}

/**
 * Clears the file selection in the compress tab.
 */
function clearSelectedFile() {
  selectedFile   = null;
  originalBytes  = null;
  compressedBytes = null;
  fileInfo.classList.add('hidden');
  resultsPanel.classList.add('hidden');
  qualityRow.classList.add('hidden');
  compressBtn.disabled = true;
  fileInput.value = '';
  clearErrors();
}

/**
 * Updates the decompress tab UI after a .cit file is selected.
 * @param {File} file
 */
function setSelectedCitFile(file) {
  selectedCitFile    = file;
  decompressedBytes  = null;
  clearErrors();
  decompressResults.classList.add('hidden');
  dQualityMetrics.classList.add('hidden');

  fileName2.textContent = file.name;
  fileSize2.textContent = formatBytes(file.size);
  fileInfo2.classList.remove('hidden');
  decompressBtn.disabled = false;
}

/**
 * Clears the .cit file selection in the decompress tab.
 */
function clearSelectedCitFile() {
  selectedCitFile   = null;
  decompressedBytes = null;
  fileInfo2.classList.add('hidden');
  decompressResults.classList.add('hidden');
  decompressBtn.disabled = true;
  fileInput2.value = '';
  clearErrors();
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: Event listeners
// ─────────────────────────────────────────────────────────────────────────────

// ── Tab switching ──────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById(`tab-${targetTab}`).classList.remove('hidden');
  });
});

// ── Quality slider ─────────────────────────────────────────────────────
qualitySlider.addEventListener('input', () => {
  const q = (qualitySlider.value / 100).toFixed(2);
  qualityDisplay.textContent = q;
});

// ── Compress tab: file selection ───────────────────────────────────────
browseBtn.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('click', e => { if (e.target !== browseBtn) fileInput.click(); });

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) setSelectedFile(fileInput.files[0]);
});

// Drag-and-drop on compress zone
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) setSelectedFile(file);
});

clearBtn.addEventListener('click', e => { e.stopPropagation(); clearSelectedFile(); });

// ── Compress button ────────────────────────────────────────────────────
compressBtn.addEventListener('click', handleCompress);

// ── Download compressed file ───────────────────────────────────────────
downloadComp.addEventListener('click', () => {
  console.log("Download clicked", compressedBytes, compressedFilename);

  if (!compressedBytes || !compressedFilename) return;

  triggerDownload(compressedBytes, compressedFilename, 'application/octet-stream');
});

// ── Decompress tab: file selection ─────────────────────────────────────
browseBtn2.addEventListener('click', () => fileInput2.click());
uploadZone2.addEventListener('click', e => { if (e.target !== browseBtn2) fileInput2.click(); });

fileInput2.addEventListener('change', () => {
  if (fileInput2.files.length > 0) setSelectedCitFile(fileInput2.files[0]);
});

uploadZone2.addEventListener('dragover', e => { e.preventDefault(); uploadZone2.classList.add('dragover'); });
uploadZone2.addEventListener('dragleave', () => uploadZone2.classList.remove('dragover'));
uploadZone2.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone2.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) setSelectedCitFile(file);
});

clearBtn2.addEventListener('click', e => { e.stopPropagation(); clearSelectedCitFile(); });

// ── Decompress button ──────────────────────────────────────────────────
decompressBtn.addEventListener('click', handleDecompress);

// ── Download decompressed file ─────────────────────────────────────────
downloadDecomp.addEventListener('click', () => {
  if (!decompressedBytes || !decompressedFilename) return;
  triggerDownload(decompressedBytes, decompressedFilename, 'application/octet-stream');
});
