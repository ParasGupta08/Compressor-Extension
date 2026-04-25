/**
 * compressor.js
 * Core compression/decompression module for CompressIt Chrome Extension.
 * Implements lossless (LZ77 + Huffman) and lossy (quantization-based) strategies
 * for text, image, audio, and video files.
 *
 * All functions are pure JavaScript — no external libraries required.
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: LZ77 + HUFFMAN — Lossless compression for text / binary data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a frequency table for all bytes in the input Uint8Array.
 * @param {Uint8Array} data - Raw input bytes
 * @returns {Map<number, number>} Map of byte value → frequency
 */
function buildFrequencyTable(data) {
  const freq = new Map();
  for (let i = 0; i < data.length; i++) {
    const b = data[i];
    freq.set(b, (freq.get(b) || 0) + 1);
  }
  return freq;
}

/**
 * Builds a Huffman tree from a frequency table.
 * Each leaf node: { symbol, freq }
 * Each internal node: { left, right, freq }
 * @param {Map<number, number>} freqMap
 * @returns {object} Root node of the Huffman tree
 */
function buildHuffmanTree(freqMap) {
  if (freqMap.size === 0) return null;

  // Priority queue (min-heap by freq)
  const heap = [];
  for (const [sym, freq] of freqMap) {
    heap.push({ symbol: sym, freq });
  }

  // Simple sort-based priority queue insertion
  const insertSorted = (arr, node) => {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].freq <= node.freq) lo = mid + 1;
      else hi = mid;
    }
    arr.splice(lo, 0, node);
  };

  heap.sort((a, b) => a.freq - b.freq);

  while (heap.length > 1) {
    const left = heap.shift();
    const right = heap.shift();
    const merged = { left, right, freq: left.freq + right.freq };
    insertSorted(heap, merged);
  }

  return heap[0] || null;
}

/**
 * Generates binary code strings for each symbol from the Huffman tree.
 * @param {object} node - Root of Huffman tree
 * @param {string} prefix - Accumulated bit string
 * @param {Map<number, string>} table - Output code table
 */
function generateCodes(node, prefix, table) {
  if (!node) return;
  if (node.symbol !== undefined) {
    // Leaf node — assign code (handle single-symbol edge case)
    table.set(node.symbol, prefix || '0');
    return;
  }
  generateCodes(node.left, prefix + '0', table);
  generateCodes(node.right, prefix + '1', table);
}

/**
 * Serialises the Huffman code table into a compact byte stream.
 * Format: [2-byte entry count] [symbol byte] [1-byte code length] [packed code bits...]
 * @param {Map<number, string>} codeTable
 * @returns {Uint8Array}
 */
function serialiseCodeTable(codeTable) {
  const entries = [...codeTable.entries()];
  const parts = [];

  // 2-byte entry count (big-endian)
  parts.push((entries.length >> 8) & 0xff);
  parts.push(entries.length & 0xff);

  for (const [sym, code] of entries) {
    parts.push(sym);           // 1 byte: symbol
    parts.push(code.length);   // 1 byte: code bit length
    // Pack code bits into bytes
    let bitBuf = 0, bitCount = 0;
    for (const bit of code) {
      bitBuf = (bitBuf << 1) | (bit === '1' ? 1 : 0);
      bitCount++;
      if (bitCount === 8) {
        parts.push(bitBuf);
        bitBuf = 0;
        bitCount = 0;
      }
    }
    if (bitCount > 0) parts.push((bitBuf << (8 - bitCount)) & 0xff);
  }
  return new Uint8Array(parts);
}

/**
 * Deserialises the Huffman code table from a byte stream.
 * @param {Uint8Array} bytes
 * @param {number} offset - Starting byte offset
 * @returns {{ codeTable: Map<string, number>, bytesRead: number }}
 */
function deserialiseCodeTable(bytes, offset) {
  let pos = offset;
  const count = (bytes[pos] << 8) | bytes[pos + 1];
  pos += 2;

  const codeTable = new Map(); // code string → symbol

  for (let i = 0; i < count; i++) {
    const sym = bytes[pos++];
    const len = bytes[pos++];
    const byteCount = Math.ceil(len / 8);
    let code = '';
    for (let b = 0; b < byteCount; b++) {
      const byte = bytes[pos++];
      for (let bit = 7; bit >= 0; bit--) {
        code += ((byte >> bit) & 1) ? '1' : '0';
      }
    }
    code = code.slice(0, len);
    codeTable.set(code, sym);
  }
  return { codeTable, bytesRead: pos - offset };
}

/**
 * Huffman-encodes a Uint8Array.
 * Returns a Uint8Array with the format:
 *   [4-byte original length] [code table] [2-byte padding bits count] [encoded bits packed]
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
function huffmanEncode(data) {
  if (data.length === 0) return new Uint8Array(0);

  const freqMap = buildFrequencyTable(data);
  const tree = buildHuffmanTree(freqMap);
  const codeTable = new Map();
  generateCodes(tree, '', codeTable);

  // Build bit stream
  let bitString = '';
  for (let i = 0; i < data.length; i++) {
    bitString += codeTable.get(data[i]);
  }

  // Pad to byte boundary
  const padding = (8 - (bitString.length % 8)) % 8;
  bitString += '0'.repeat(padding);

  // Pack bits into bytes
  const encodedBytes = new Uint8Array(bitString.length / 8);
  for (let i = 0; i < encodedBytes.length; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      if (bitString[i * 8 + b] === '1') byte |= (1 << (7 - b));
    }
    encodedBytes[i] = byte;
  }

  const tableBytes = serialiseCodeTable(codeTable);

  // Header: 4-byte original length + 1-byte padding count
  const header = new Uint8Array(5);
  const origLen = data.length;
  header[0] = (origLen >> 24) & 0xff;
  header[1] = (origLen >> 16) & 0xff;
  header[2] = (origLen >> 8) & 0xff;
  header[3] = origLen & 0xff;
  header[4] = padding;

  // Combine: header + tableBytes + encodedBytes
  const result = new Uint8Array(header.length + tableBytes.length + encodedBytes.length);
  result.set(header, 0);
  result.set(tableBytes, header.length);
  result.set(encodedBytes, header.length + tableBytes.length);
  return result;
}

/**
 * Huffman-decodes a previously encoded Uint8Array.
 * @param {Uint8Array} data - Encoded data from huffmanEncode
 * @returns {Uint8Array} - Original data
 */
function huffmanDecode(data) {
  if (data.length === 0) return new Uint8Array(0);

  let pos = 0;
  // Read original length (4 bytes)
  const origLen = (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
  const padding = data[4];
  pos = 5;

  // Read code table
  const { codeTable, bytesRead } = deserialiseCodeTable(data, pos);
  pos += bytesRead;

  // Build reverse decode tree
  const decodeTree = {};
  for (const [code, sym] of codeTable) {
    let node = decodeTree;
    for (const bit of code) {
      if (!node[bit]) node[bit] = {};
      node = node[bit];
    }
    node.symbol = sym;
  }

  // Decode bits
  const output = new Uint8Array(origLen);
  let outPos = 0;
  let node = decodeTree;

  for (let i = pos; i < data.length; i++) {
    const byte = data[i];
    const bitsToProcess = (i === data.length - 1) ? (8 - padding) : 8;
    for (let b = 7; b >= 8 - bitsToProcess; b--) {
      const bit = ((byte >> b) & 1) ? '1' : '0';
      node = node[bit];
      if (!node) break;
      if (node.symbol !== undefined) {
        if (outPos < origLen) output[outPos++] = node.symbol;
        node = decodeTree;
      }
    }
  }

  return output;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: LZ77 Compression — Sliding window for text
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_SIZE = 255;  // Sliding window size (fits in 1 byte)
const LOOKAHEAD  = 255;   // Max match length (fits in 1 byte)

/**
 * LZ77-compresses a Uint8Array.
 * Each token is 3 bytes: [offset, matchLen, nextLiteral]
 * offset=0 and matchLen=0 means raw literal.
 * @param {Uint8Array} input
 * @returns {Uint8Array}
 */
function lz77Compress(input) {
  const tokens = [];
  let pos = 0;

  while (pos < input.length) {
    let bestOffset = 0, bestLength = 0;
    const windowStart = Math.max(0, pos - WINDOW_SIZE);

    for (let offset = 1; offset <= pos - windowStart; offset++) {
      let len = 0;
      while (
        len < LOOKAHEAD &&
        pos + len < input.length &&
        input[pos - offset + (len % offset)] === input[pos + len]
      ) {
        len++;
      }
      if (len > bestLength) {
        bestLength = len;
        bestOffset = offset;
      }
    }

    if (bestLength >= 3) {
      const next = pos + bestLength < input.length ? input[pos + bestLength] : 0;
      tokens.push(bestOffset, bestLength, next);
      pos += bestLength + 1;
    } else {
      tokens.push(0, 0, input[pos]);
      pos++;
    }
  }

  // 4-byte original length header + tokens
  const result = new Uint8Array(4 + tokens.length);
  result[0] = (input.length >> 24) & 0xff;
  result[1] = (input.length >> 16) & 0xff;
  result[2] = (input.length >> 8) & 0xff;
  result[3] = input.length & 0xff;
  for (let i = 0; i < tokens.length; i++) result[4 + i] = tokens[i];
  return result;
}

/**
 * LZ77-decompresses data produced by lz77Compress.
 * @param {Uint8Array} input
 * @returns {Uint8Array}
 */
function lz77Decompress(input) {
  const origLen = (input[0] << 24) | (input[1] << 16) | (input[2] << 8) | input[3];
  const output = new Uint8Array(origLen);
  let outPos = 0;

  for (let i = 4; i < input.length; i += 3) {
    const offset = input[i];
    const matchLen = input[i + 1];
    const literal = input[i + 2];

    if (offset === 0 && matchLen === 0) {
      output[outPos++] = literal;
    } else {
      const start = outPos - offset;
      for (let j = 0; j < matchLen; j++) {
        output[outPos] = output[start + (j % offset)];
        outPos++;
      }
      if (outPos < origLen) output[outPos++] = literal;
    }
  }
  return output;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Combined LZ77 + Huffman for text files
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compresses text file data using LZ77 followed by Huffman coding.
 * @param {Uint8Array} data - Raw file bytes
 * @returns {{ compressed: Uint8Array, algorithm: string }}
 */
function compressText(data) {
  const lzData = lz77Compress(data);
  const hData  = huffmanEncode(lzData);
  // Use whichever is smaller
  if (hData.length < lzData.length) {
    // Prepend a 1-byte flag: 1 = huffman over lz77, 0 = lz77 only
    const result = new Uint8Array(1 + hData.length);
    result[0] = 1;
    result.set(hData, 1);
    return { compressed: result, algorithm: 'LZ77 + Huffman Coding' };
  } else {
    const result = new Uint8Array(1 + lzData.length);
    result[0] = 0;
    result.set(lzData, 1);
    return { compressed: result, algorithm: 'LZ77' };
  }
}

/**
 * Decompresses text data produced by compressText.
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
function decompressText(data) {
  const flag = data[0];
  const payload = data.slice(1);
  if (flag === 1) {
    const lzData = huffmanDecode(payload);
    return lz77Decompress(lzData);
  } else {
    return lz77Decompress(payload);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: PNG Lossless compression (run-length encoding on raw pixel data)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lossless image compression: applies Huffman coding to the raw pixel bytes.
 * Works on ArrayBuffer from canvas/FileReader for PNG images.
 * @param {Uint8Array} data - Raw image file bytes
 * @returns {{ compressed: Uint8Array, algorithm: string }}
 */
function compressImageLossless(data) {
  const compressed = huffmanEncode(data);
  const result = new Uint8Array(1 + compressed.length);
  result[0] = 0; // lossless flag
  result.set(compressed, 1);
  return { compressed: result, algorithm: 'Huffman Coding (lossless)' };
}

/**
 * Lossy image compression: quantises pixel colour values then Huffman-encodes.
 * Reduces colour precision, similar to JPEG quantisation tables.
 * @param {Uint8Array} data - Raw RGBA pixel data (from ImageData.data)
 * @param {number} quality - 0 (lowest) to 100 (highest)
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @returns {{ compressed: Uint8Array, algorithm: string }}
 */
function compressImageLossy(data, quality, width, height) {
  // quality 1-100 → quantisation step 1 (no loss) to 32 (high loss)
  const q = Math.max(1, Math.min(100, quality));
  const step = Math.round((100 - q) / 3) + 1; // step 1..34

  const quantised = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    if ((i + 1) % 4 === 0) {
      // Keep alpha channel untouched
      quantised[i] = data[i];
    } else {
      // Round to nearest multiple of step
      quantised[i] = Math.min(255, Math.round(data[i] / step) * step);
    }
  }

  // Prepend width + height as 2×2 bytes for reconstruction
  const header = new Uint8Array(4);
  header[0] = (width >> 8) & 0xff;  header[1] = width & 0xff;
  header[2] = (height >> 8) & 0xff; header[3] = height & 0xff;

  const combined = new Uint8Array(4 + quantised.length);
  combined.set(header, 0);
  combined.set(quantised, 4);

  const compressed = huffmanEncode(combined);
  const result = new Uint8Array(1 + compressed.length);
  result[0] = 1; // lossy flag
  result.set(compressed, 1);
  return { compressed: result, algorithm: `Colour Quantisation (step=${step}) + Huffman` };
}

/**
 * Decompresses image data. Returns { pixelData, isLossy, width, height } for
 * lossy images, or { fileData } for lossless images.
 * @param {Uint8Array} data
 * @returns {object}
 */
function decompressImage(data) {
  const flag = data[0];
  const payload = data.slice(1);
  const decoded = huffmanDecode(payload);

  if (flag === 0) {
    // Lossless — decoded is the original file bytes
    return { fileData: decoded, isLossy: false };
  } else {
    // Lossy — decoded is [4-byte header][RGBA bytes]
    const width  = (decoded[0] << 8) | decoded[1];
    const height = (decoded[2] << 8) | decoded[3];
    const pixelData = decoded.slice(4);
    return { pixelData, isLossy: true, width, height };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: Audio compression (WAV → lossy via sample bit-depth reduction)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compresses WAV/audio data by reducing sample bit depth (lossy) and
 * Huffman encoding the result.
 * @param {Uint8Array} data - Raw audio file bytes
 * @param {number} quality - 1-100 (100 = least loss)
 * @returns {{ compressed: Uint8Array, algorithm: string }}
 */
function compressAudio(data, quality) {
  const q = Math.max(1, Math.min(100, quality));
  // Bit-mask to zero lower bits of each sample byte
  const bitsToKeep = Math.max(4, Math.round(q / 100 * 8));
  const mask = (0xff << (8 - bitsToKeep)) & 0xff;

  const quantised = new Uint8Array(data.length);
  // Keep WAV header (44 bytes) intact, quantise audio samples only
  const headerLen = Math.min(44, data.length);
  for (let i = 0; i < headerLen; i++) quantised[i] = data[i];
  for (let i = headerLen; i < data.length; i++) {
    quantised[i] = data[i] & mask;
  }

  const compressed = huffmanEncode(quantised);
  const result = new Uint8Array(1 + compressed.length);
  result[0] = q; // store quality in first byte for metadata
  result.set(compressed, 1);
  return { compressed: result, algorithm: `Bit-Depth Reduction (${bitsToKeep} bits) + Huffman` };
}

/**
 * Decompresses audio data produced by compressAudio.
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
function decompressAudio(data) {
  const payload = data.slice(1);
  return huffmanDecode(payload);
}

/**
 * Compresses MP3 files (binary) using pure Huffman coding (lossless for the container).
 * @param {Uint8Array} data
 * @returns {{ compressed: Uint8Array, algorithm: string }}
 */
function compressMP3(data) {
  const compressed = huffmanEncode(data);
  const result = new Uint8Array(1 + compressed.length);
  result[0] = 200; // flag: mp3 lossless
  result.set(compressed, 1);
  return { compressed: result, algorithm: 'Huffman Coding (MP3 binary, lossless)' };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: Video compression (browser media re-encode)
// ─────────────────────────────────────────────────────────────────────────────

const VIDEO_PAYLOAD_MAGIC = 'CITV2\0';
const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

function clampVideoQuality(quality) {
  const q = Number.isFinite(quality) ? quality : 75;
  return Math.max(10, Math.min(100, q));
}

function pickVideoMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Video compression requires MediaRecorder support in this browser.');
  }
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return VIDEO_MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function getVideoBitrate(quality) {
  const q = clampVideoQuality(quality);
  const t = (q - 10) / 90;
  return Math.round(250000 + Math.pow(t, 1.6) * 2750000);
}

function getAudioBitrate(quality) {
  const q = clampVideoQuality(quality);
  if (q >= 75) return 128000;
  if (q >= 45) return 96000;
  return 64000;
}

function getTargetFrameRate(quality) {
  const q = clampVideoQuality(quality);
  if (q >= 75) return 30;
  if (q >= 45) return 24;
  return 18;
}

function getTargetDimensions(width, height, quality) {
  const q = clampVideoQuality(quality);
  const maxEdge = q >= 85 ? 1280 : q >= 65 ? 960 : q >= 40 ? 720 : 540;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const even = value => Math.max(2, Math.round(value / 2) * 2);
  return {
    width: even(width * scale),
    height: even(height * scale),
  };
}

function getVideoInputBlob(input, options = {}) {
  if (input instanceof Blob) return input;
  if (input instanceof Uint8Array) {
    return new Blob([input], { type: options.mimeType || 'video/mp4' });
  }
  throw new Error('compressVideo expects a File, Blob, or Uint8Array.');
}

function waitForVideoMetadata(video) {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('This video could not be decoded by Chrome.'));
    video.load();
  });
}

function waitForSeek(video, time) {
  if (Math.abs(video.currentTime - time) < 0.01) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done, { once: true });
    video.currentTime = time;
  });
}

async function createVideoAudioTrackProvider(video) {
  const AudioContextCtor =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : typeof webkitAudioContext !== 'undefined'
        ? webkitAudioContext
        : null;

  if (!AudioContextCtor) {
    return { tracks: [], cleanup: () => {} };
  }

  try {
    const audioContext = new AudioContextCtor();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const source = audioContext.createMediaElementSource(video);
    const destination = audioContext.createMediaStreamDestination();
    source.connect(destination);

    return {
      tracks: destination.stream.getAudioTracks(),
      cleanup: () => {
        if (audioContext.state !== 'closed') {
          audioContext.close().catch(() => {});
        }
      },
    };
  } catch (err) {
    return { tracks: [], cleanup: () => {} };
  }
}

function encodeVideoPayload(videoBytes, metadata) {
  const header = new TextEncoder().encode(VIDEO_PAYLOAD_MAGIC + JSON.stringify(metadata) + '\0');
  const result = new Uint8Array(header.length + videoBytes.length);
  result.set(header, 0);
  result.set(videoBytes, header.length);
  return result;
}

function decodeVideoPayload(data) {
  const magic = new TextEncoder().encode(VIDEO_PAYLOAD_MAGIC);
  if (data.length < magic.length) return null;

  for (let i = 0; i < magic.length; i++) {
    if (data[i] !== magic[i]) return null;
  }

  let headerEnd = magic.length;
  while (headerEnd < data.length && data[headerEnd] !== 0) headerEnd++;

  try {
    const json = new TextDecoder().decode(data.slice(magic.length, headerEnd));
    return {
      metadata: JSON.parse(json),
      bytes: data.slice(headerEnd + 1),
    };
  } catch (err) {
    throw new Error('Invalid video payload metadata.');
  }
}

/**
 * Compresses a browser-decodable video by re-encoding it to WebM at a lower
 * resolution, frame rate, and bitrate. The returned bytes are still packed by
 * popup.js into the normal .cit container.
 *
 * @param {File|Blob|Uint8Array} input - Source video file/blob/bytes
 * @param {number} quality - 10-100 (higher = better quality/larger file)
 * @param {{ mimeType?: string }} options
 * @returns {Promise<{
 *   compressed: Uint8Array,
 *   algorithm: string,
 *   mimeType: string,
 *   extension: string,
 *   width: number,
 *   height: number,
 *   originalWidth: number,
 *   originalHeight: number,
 *   duration: number
 * }>}
 */
async function compressVideo(input, quality = 75, options = {}) {
  if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') {
    throw new Error('Video compression must run in a browser page.');
  }

  const q = clampVideoQuality(quality);
  const sourceBlob = getVideoInputBlob(input, options);
  const sourceUrl = URL.createObjectURL(sourceBlob);
  const video = document.createElement('video');
  const outputMimeType = pickVideoMimeType();
  let cleanupAudio = () => {};
  let cleanupRecording = () => {};

  video.preload = 'auto';
  video.playsInline = true;
  video.muted = true;
  video.src = sourceUrl;

  let objectUrlRevoked = false;
  const revokeObjectUrl = () => {
    if (!objectUrlRevoked) {
      URL.revokeObjectURL(sourceUrl);
      objectUrlRevoked = true;
    }
  };

  try {
    await waitForVideoMetadata(video);

    const originalWidth = video.videoWidth;
    const originalHeight = video.videoHeight;
    if (!originalWidth || !originalHeight) {
      throw new Error('Could not read video dimensions.');
    }

    await waitForSeek(video, 0);

    const target = getTargetDimensions(originalWidth, originalHeight, q);
    const frameRate = getTargetFrameRate(q);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not create a video canvas.');

    const canvasStream = canvas.captureStream(frameRate);
    const tracks = [...canvasStream.getVideoTracks()];
    const audioProvider = await createVideoAudioTrackProvider(video);
    cleanupAudio = audioProvider.cleanup;
    if (audioProvider.tracks.length) {
      video.muted = false;
      video.volume = 1;
      tracks.push(...audioProvider.tracks);
    }

    // If Web Audio is blocked, Chrome may still expose capturable audio tracks.
    if (audioProvider.tracks.length === 0 && typeof video.captureStream === 'function') {
      try {
        const sourceStream = video.captureStream();
        tracks.push(...sourceStream.getAudioTracks());
      } catch (err) {
        // Some codecs/containers do not expose capturable audio tracks.
      }
    }

    const recordStream = new MediaStream(tracks);
    cleanupRecording = () => {
      recordStream.getTracks().forEach(track => track.stop());
    };
    const chunks = [];
    const recorderOptions = {
      videoBitsPerSecond: getVideoBitrate(q),
      audioBitsPerSecond: getAudioBitrate(q),
    };
    if (outputMimeType) recorderOptions.mimeType = outputMimeType;

    const recorder = new MediaRecorder(recordStream, recorderOptions);
    const recordingDone = new Promise((resolve, reject) => {
      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = event => {
        reject(new Error(event.error?.message || 'Video recorder failed.'));
      };
      recorder.onstop = resolve;
    });

    let animationId = 0;
    const drawFrame = () => {
      if (!video.paused && !video.ended) {
        ctx.drawImage(video, 0, 0, target.width, target.height);
      }
      animationId = requestAnimationFrame(drawFrame);
    };

    const stopRecording = () => {
      cancelAnimationFrame(animationId);
      if (recorder.state !== 'inactive') recorder.stop();
      cleanupRecording();
    };

    video.onended = stopRecording;
    recorder.start(500);
    drawFrame();
    await video.play();
    await recordingDone;

    if (!chunks.length) {
      throw new Error('Video encoder did not produce output.');
    }

    const outputBlob = new Blob(chunks, { type: outputMimeType || 'video/webm' });
    const outputBytes = new Uint8Array(await outputBlob.arrayBuffer());
    const metadata = {
      mimeType: outputBlob.type || 'video/webm',
      extension: 'webm',
      width: target.width,
      height: target.height,
      originalWidth,
      originalHeight,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      quality: q,
      frameRate,
      videoBitrate: recorderOptions.videoBitsPerSecond,
      audioBitrate: recorderOptions.audioBitsPerSecond,
    };

    return {
      compressed: encodeVideoPayload(outputBytes, metadata),
      algorithm: `WebM Re-encode (${target.width}x${target.height}, ${frameRate} fps)`,
      mimeType: metadata.mimeType,
      extension: metadata.extension,
      width: target.width,
      height: target.height,
      originalWidth,
      originalHeight,
      duration: metadata.duration,
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    cleanupRecording();
    cleanupAudio();
    revokeObjectUrl();
  }
}

/**
 * Decompresses video data produced by compressVideo. New video payloads are
 * already playable compressed video bytes, so decompression unwraps the stored
 * WebM. Legacy delta+Huffman payloads are still decoded for old .cit files.
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
function decompressVideo(data) {
  const packed = decodeVideoPayload(data);
  if (packed) return packed.bytes;

  // Legacy support for the old Delta Encoding + Huffman payload format.
  const deltas = huffmanDecode(data);
  const output = new Uint8Array(deltas.length);
  if (deltas.length === 0) return output;
  output[0] = deltas[0];
  for (let i = 1; i < deltas.length; i++) {
    output[i] = (output[i - 1] + deltas[i]) & 0xff;
  }
  return output;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: Quality metrics (PSNR, SSIM)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes PSNR (Peak Signal-to-Noise Ratio) between two Uint8Arrays of equal length.
 * PSNR > 40 dB = excellent; < 25 dB = visibly degraded.
 * @param {Uint8Array} original
 * @param {Uint8Array} reconstructed
 * @returns {number} PSNR in decibels (dB), or Infinity if identical
 */
function computePSNR(original, reconstructed) {
  const len = Math.min(original.length, reconstructed.length);
  if (len === 0) return Infinity;

  let mse = 0;
  for (let i = 0; i < len; i++) {
    const diff = original[i] - reconstructed[i];
    mse += diff * diff;
  }
  mse /= len;

  if (mse === 0) return Infinity;
  return 10 * Math.log10((255 * 255) / mse);
}

/**
 * Computes a simplified SSIM (Structural Similarity Index) between two arrays.
 * Processes in 8-element windows. Returns value between 0 (no similarity) and 1 (identical).
 * @param {Uint8Array} original
 * @param {Uint8Array} reconstructed
 * @returns {number} SSIM value
 */
function computeSSIM(original, reconstructed) {
  const len = Math.min(original.length, reconstructed.length);
  if (len === 0) return 1;

  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  const windowSize = 8;
  let ssimSum = 0, count = 0;

  for (let i = 0; i + windowSize <= len; i += windowSize) {
    let muX = 0, muY = 0;
    for (let j = 0; j < windowSize; j++) {
      muX += original[i + j];
      muY += reconstructed[i + j];
    }
    muX /= windowSize;
    muY /= windowSize;

    let sigX2 = 0, sigY2 = 0, sigXY = 0;
    for (let j = 0; j < windowSize; j++) {
      const dx = original[i + j] - muX;
      const dy = reconstructed[i + j] - muY;
      sigX2 += dx * dx;
      sigY2 += dy * dy;
      sigXY += dx * dy;
    }
    sigX2 /= windowSize;
    sigY2 /= windowSize;
    sigXY /= windowSize;

    const num   = (2 * muX * muY + C1) * (2 * sigXY + C2);
    const denom = (muX * muX + muY * muY + C1) * (sigX2 + sigY2 + C2);
    ssimSum += num / denom;
    count++;
  }

  return count > 0 ? ssimSum / count : 1;
}

/**
 * Computes SHA-256 hash of a Uint8Array using the Web Crypto API.
 * @param {Uint8Array} data
 * @returns {Promise<string>} Hex-encoded hash string
 */
async function sha256(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: Public API — exported on the window object for popup.js
// ─────────────────────────────────────────────────────────────────────────────

window.Compressor = {
  compressText,
  decompressText,
  compressImageLossless,
  compressImageLossy,
  decompressImage,
  compressAudio,
  decompressAudio,
  compressMP3,
  compressVideo,
  decompressVideo,
  computePSNR,
  computeSSIM,
  sha256,
  // Exposed for direct use in decompression paths
  huffmanEncode,
  huffmanDecode,
};
