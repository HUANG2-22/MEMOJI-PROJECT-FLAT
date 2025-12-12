// sketch.js (Complete)
// Option 1: "Color-block segmentation" via K-means clustering in (R,G,B,X,Y) on a downsampled image.
// Then draw emojis by REGION (cluster label), not by a single pixel.
//
// ✅ Output image size = input image size
// ✅ Draw emojis on top of original image
//
// NOTE: Replace the emoji filenames in preload() to match your repo assets.

let uploadedImg = null;
let processedCanvas = null;

let fileInputEl, saveButtonEl;

// Mosaic controls
const grid = 10;
const maxDiameter = grid + 12;
const minDiameter = 12;

// Segmentation controls (tune these)
const SEG_MAX_SIDE = 220;     // downsample max side for segmentation (smaller = faster, blockier)
const K_CLUSTERS = 36;        // number of color blocks (smaller = flatter)
const K_ITERS = 8;            // kmeans iterations
const XY_WEIGHT = 0.35;       // spatial weight (bigger = more coherent "blocks", less color-only mixing)
const SAMPLE_STEP = 1;        // sample every N pixels in downsample for speed (1 = best)

// Density variation (optional)
const USE_DENSITY_SKIP = true;
const SKIP_THRESHOLD = 0.55;  // higher = less skipping
const SKIP_MAX = 0.75;        // max skip probability

// Color-to-emoji thresholds (tune these)
const SAT_GRAY = 0.20;
const V_BLACK = 0.18;
const V_WHITE = 0.90;
const HUE_BORDERS = [30, 90, 150, 210, 270, 330]; // red|yellow|green|cyan|blue|purple|red

// Emoji assets (replace filenames!)
let emojis = {};

function preload() {
  // Replace with your actual PNG names
  emojis.red    = loadImage("emoji_red.png");
  emojis.yellow = loadImage("emoji_yellow.png");
  emojis.green  = loadImage("emoji_green.png");
  emojis.cyan   = loadImage("emoji_cyan.png");
  emojis.blue   = loadImage("emoji_blue.png");
  emojis.purple = loadImage("emoji_purple.png");
  emojis.gray   = loadImage("emoji_gray.png");
  emojis.black  = loadImage("emoji_black.png");
  emojis.white  = loadImage("emoji_white.png");
}

function setup() {
  createCanvas(600, 800);
  background(255);

  fileInputEl = createInput("", "file");
  fileInputEl.attribute("accept", "image/*");
  fileInputEl.elt.onchange = handleFileChange;

  saveButtonEl = createButton("点击保存处理后的图片");
  saveButtonEl.mousePressed(saveImage);

  textAlign(CENTER, CENTER);
  layoutUI();
}

function layoutUI() {
  fileInputEl.position(width / 2 - 150, 40);
  fileInputEl.style("width", "180px");
  saveButtonEl.position(width / 2 + 50, 40);
}

function handleFileChange(event) {
  const file = event.target.files[0];
  if (!file || !file.type.startsWith("image/")) {
    uploadedImg = null;
    console.error("文件类型错误，请上传图片文件");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    loadImage(
      e.target.result,
      (img) => {
        uploadedImg = img;
        processImage();
      },
      () => {
        uploadedImg = null;
        console.error("图片加载失败");
      }
    );
  };
  reader.readAsDataURL(file);
}

// -------------------------
// Helpers
// -------------------------
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const maxV = Math.max(r, g, b);
  const minV = Math.min(r, g, b);
  const d = maxV - minV;

  let h = 0;
  if (d !== 0) {
    if (maxV === r) h = ((g - b) / d) % 6;
    else if (maxV === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = maxV === 0 ? 0 : d / maxV;
  const v = maxV;
  return { h, s, v };
}

function pickEmojiByMeanRGB(r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);

  if (s < SAT_GRAY) {
    if (v < V_BLACK) return emojis.black;
    if (v > V_WHITE) return emojis.white;
    return emojis.gray;
  }

  if (h < HUE_BORDERS[0] || h >= HUE_BORDERS[5]) return emojis.red;
  if (h < HUE_BORDERS[1]) return emojis.yellow;
  if (h < HUE_BORDERS[2]) return emojis.green;
  if (h < HUE_BORDERS[3]) return emojis.cyan;
  if (h < HUE_BORDERS[4]) return emojis.blue;
  return emojis.purple;
}

// -------------------------
// K-means segmentation on downsampled pixels
// Features are normalized: r,g,b in [0,1], x,y in [0,1] * XY_WEIGHT
// Returns: { labels, centersRGB, w, h }
// -------------------------
function segmentKMeans(pixels, w, h, K, iters, xyWeight, sampleStep) {
  const n = w * h;

  // Precompute normalized features for each pixel
  // Store as Float32Array for speed: [r,g,b,x,y] per pixel
  const feat = new Float32Array(n * 5);

  for (let y = 0; y < h; y++) {
    const yn = (h <= 1) ? 0 : (y / (h - 1));
    for (let x = 0; x < w; x++) {
      const xn = (w <= 1) ? 0 : (x / (w - 1));
      const i = x + y * w;
      const idx = i * 4;

      feat[i * 5 + 0] = pixels[idx] / 255;
      feat[i * 5 + 1] = pixels[idx + 1] / 255;
      feat[i * 5 + 2] = pixels[idx + 2] / 255;
      feat[i * 5 + 3] = xn * xyWeight;
      feat[i * 5 + 4] = yn * xyWeight;
    }
  }

  // Labels
  const labels = new Int16Array(n);

  // Initialize centers by picking random pixels
  const centers = new Float32Array(K * 5);
  for (let k = 0; k < K; k++) {
    const ri = Math.floor(Math.random() * n);
    for (let d = 0; d < 5; d++) centers[k * 5 + d] = feat[ri * 5 + d];
  }

  // K-means iterations
  for (let it = 0; it < iters; it++) {
    // Accumulators
    const sum = new Float32Array(K * 5);
    const count = new Int32Array(K);

    // Assign step (optionally subsample for speed)
    for (let y = 0; y < h; y += sampleStep) {
      for (let x = 0; x < w; x += sampleStep) {
        const i = x + y * w;

        let bestK = 0;
        let bestD = Infinity;

        const fr = feat[i * 5 + 0];
        const fg = feat[i * 5 + 1];
        const fb = feat[i * 5 + 2];
        const fx = feat[i * 5 + 3];
        const fy = feat[i * 5 + 4];

        for (let k = 0; k < K; k++) {
          const cr = centers[k * 5 + 0];
          const cg = centers[k * 5 + 1];
          const cb = centers[k * 5 + 2];
          const cx = centers[k * 5 + 3];
          const cy = centers[k * 5 + 4];

          const dr = fr - cr;
          const dg = fg - cg;
          const db = fb - cb;
          const dx = fx - cx;
          const dy = fy - cy;

          const dist2 = dr * dr + dg * dg + db * db + dx * dx + dy * dy;
          if (dist2 < bestD) {
            bestD = dist2;
            bestK = k;
          }
        }

        labels[i] = bestK;
        count[bestK]++;

        sum[bestK * 5 + 0] += fr;
        sum[bestK * 5 + 1] += fg;
        sum[bestK * 5 + 2] += fb;
        sum[bestK * 5 + 3] += fx;
        sum[bestK * 5 + 4] += fy;
      }
    }

    // Update step (reseed empty clusters)
    for (let k = 0; k < K; k++) {
      if (count[k] === 0) {
        const ri = Math.floor(Math.random() * n);
        for (let d = 0; d < 5; d++) centers[k * 5 + d] = feat[ri * 5 + d];
      } else {
        const inv = 1.0 / count[k];
        for (let d = 0; d < 5; d++) centers[k * 5 + d] = sum[k * 5 + d] * inv;
      }
    }
  }

  // Final full-resolution labeling pass (no subsampling) for clean mapping
  for (let i = 0; i < n; i++) {
    let bestK = 0;
    let bestD = Infinity;

    const fr = feat[i * 5 + 0];
    const fg = feat[i * 5 + 1];
    const fb = feat[i * 5 + 2];
    const fx = feat[i * 5 + 3];
    const fy = feat[i * 5 + 4];

    for (let k = 0; k < K; k++) {
      const cr = centers[k * 5 + 0];
      const cg = centers[k * 5 + 1];
      const cb = centers[k * 5 + 2];
      const cx = centers[k * 5 + 3];
      const cy = centers[k * 5 + 4];

      const dr = fr - cr;
      const dg = fg - cg;
      const db = fb - cb;
      const dx = fx - cx;
      const dy = fy - cy;

      const dist2 = dr * dr + dg * dg + db * db + dx * dx + dy * dy;
      if (dist2 < bestD) {
        bestD = dist2;
        bestK = k;
      }
    }

    labels[i] = bestK;
  }

  // Compute cluster mean RGB (from original pixels, but via labels)
  const sumRGB = new Float32Array(K * 3);
  const cntRGB = new Int32Array(K);
  for (let i = 0; i < n; i++) {
    const k = labels[i];
    const idx = i * 4;
    sumRGB[k * 3 + 0] += pixels[idx];
    sumRGB[k * 3 + 1] += pixels[idx + 1];
    sumRGB[k * 3 + 2] += pixels[idx + 2];
    cntRGB[k]++;
  }

  const centersRGB = new Float32Array(K * 3);
  for (let k = 0; k < K; k++) {
    if (cntRGB[k] === 0) {
      // fallback: use kmeans center rgb (normalized) if empty
      centersRGB[k * 3 + 0] = centers[k * 5 + 0] * 255;
      centersRGB[k * 3 + 1] = centers[k * 5 + 1] * 255;
      centersRGB[k * 3 + 2] = centers[k * 5 + 2] * 255;
    } else {
      const inv = 1.0 / cntRGB[k];
      centersRGB[k * 3 + 0] = sumRGB[k * 3 + 0] * inv;
      centersRGB[k * 3 + 1] = sumRGB[k * 3 + 1] * inv;
      centersRGB[k * 3 + 2] = sumRGB[k * 3 + 2] * inv;
    }
  }

  return { labels, centersRGB, w, h };
}

// ------------------------------------
// Core processing
// ------------------------------------
function processImage() {
  if (uploadedImg === null) return;

  const W = uploadedImg.width;
  const H = uploadedImg.height;

  // Resize main canvas to match image + UI area
  resizeCanvas(W, H + 200);
  layoutUI();

  // Original pixels canvas
  const tempCanvas = createGraphics(W, H);
  tempCanvas.pixelDensity(1);
  tempCanvas.image(uploadedImg, 0, 0, W, H);
  tempCanvas.loadPixels();

  // Downsample for segmentation
  const scale = Math.min(1, SEG_MAX_SIDE / Math.max(W, H));
  const sW = Math.max(1, Math.floor(W * scale));
  const sH = Math.max(1, Math.floor(H * scale));

  const segCanvas = createGraphics(sW, sH);
  segCanvas.pixelDensity(1);
  segCanvas.image(tempCanvas, 0, 0, sW, sH);
  segCanvas.loadPixels();

  // Run K-means segmentation on downsampled pixels
  const seg = segmentKMeans(
    segCanvas.pixels,
    sW,
    sH,
    K_CLUSTERS,
    K_ITERS,
    XY_WEIGHT,
    SAMPLE_STEP
  );

  // Precompute emoji per cluster + mean brightness per cluster
  const clusterEmoji = new Array(K_CLUSTERS);
  const clusterBrightness = new Float32Array(K_CLUSTERS);

  for (let k = 0; k < K_CLUSTERS; k++) {
    const r = seg.centersRGB[k * 3 + 0];
    const g = seg.centersRGB[k * 3 + 1];
    const b = seg.centersRGB[k * 3 + 2];
    clusterEmoji[k] = pickEmojiByMeanRGB(r, g, b);
    clusterBrightness[k] = (r + g + b) / 3; // 0..255
  }

  // Final canvas (same size as original)
  const finalCanvas = createGraphics(W, H);
  finalCanvas.pixelDensity(1);

  // Draw original image as background
  finalCanvas.image(tempCanvas, 0, 0);

  // Draw emoji mosaic using cluster labels (color blocks)
  for (let y = 0; y < H; y += grid + 2) {
    for (let x = 0; x < W; x += grid + 2) {

      // Map (x,y) in original image to (sx,sy) in segmentation map
      const sx = clamp(Math.floor((x / (W - 1 || 1)) * (sW - 1)), 0, sW - 1);
      const sy = clamp(Math.floor((y / (H - 1 || 1)) * (sH - 1)), 0, sH - 1);
      const label = seg.labels[sx + sy * sW];

      const bVal = clusterBrightness[label]; // 0..255

      if (USE_DENSITY_SKIP) {
        const brightnessMap = map(bVal, 0, 255, 0.0, 1.0);
        if (brightnessMap > SKIP_THRESHOLD) {
          const skipProb = map(brightnessMap, SKIP_THRESHOLD, 1.0, 0.0, SKIP_MAX);
          if (random(1) < skipProb) continue;
        }
      }

      const reversedPix = 255 - bVal;
      const d = map(reversedPix, 0, 255, minDiameter, maxDiameter);

      finalCanvas.image(clusterEmoji[label], x, y, d, d);
    }
  }

  processedCanvas = finalCanvas;
  uploadedImg = null;
}

// ---------------------------
// Render
// ---------------------------
function draw() {
  background(255);
  fill(0);
  textSize(18);
  text("上传图片后，处理结果将在下方显示 (原尺寸 + 颜色块分割)", width / 2, 120);

  if (processedCanvas) {
    image(processedCanvas, 0, 200);
  }
}

// ---------------------------
// Save
// ---------------------------
function saveImage() {
  if (processedCanvas) {
    save(processedCanvas, "emojified_image", "png");
  } else {
    alert("请先上传图片并等待处理完成！");
  }
}
