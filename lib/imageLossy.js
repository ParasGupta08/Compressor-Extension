window.ImageLossy = {

  async compress(file, quality = 0.7) {
    const img = await this.loadImage(file);

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    let mime = "image/webp";
    let dataURL = canvas.toDataURL(mime, quality);

    // Fallback if WebP unsupported
    if (!dataURL.startsWith("data:image/webp")) {
      mime = "image/jpeg";
      dataURL = canvas.toDataURL(mime, quality);
    }

    const bytes = this.dataURLToUint8Array(dataURL);

    return {
      compressed: bytes,
      mimeType: mime,
      algorithm: mime.includes("webp") ? "WebP" : "JPEG"
    };
  },

  async decompress(bytes) {
    const blob = new Blob([bytes]);
    const url = URL.createObjectURL(blob);

    const img = await this.loadImage(url);

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    return {
      pixelData: imageData.data,
      width: canvas.width,
      height: canvas.height
    };
  },

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = typeof src === "string" ? src : URL.createObjectURL(src);
    });
  },

  dataURLToUint8Array(dataURL) {
    const base64 = dataURL.split(",")[1];
    const binary = atob(base64);
    const len = binary.length;

    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
};