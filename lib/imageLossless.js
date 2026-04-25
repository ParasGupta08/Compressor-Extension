window.ImageLossless = {

  async compress(fileBytes) {
    // Decode image to RGBA
    const img = UPNG.decode(fileBytes);
    const rgba = UPNG.toRGBA8(img)[0];

    // Re-encode with UPNG (compression happens here)
    const compressed = UPNG.encode(
      [rgba],
      img.width,
      img.height,
      0 // 0 = lossless
    );

    return {
      compressed: new Uint8Array(compressed),
      width: img.width,
      height: img.height,
      algorithm: "UPNG Lossless"
    };
  },

  async decompress(bytes) {
    const img = UPNG.decode(bytes);
    const rgba = UPNG.toRGBA8(img)[0];

    return {
      pixelData: new Uint8Array(rgba),
      width: img.width,
      height: img.height
    };
  }
};