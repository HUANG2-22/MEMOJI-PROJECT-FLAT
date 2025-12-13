// sketch.js
// Color-Emoji Mosaic (browser-only, no NPY)
// Goal: more consistent color matching with input image
// Method:
//  1) Load 9 emoji images (red/yellow/green/cyan/blue/purple/gray/black/white)
//  2) Compute each emoji's mean color (ignoring transparent pixels)
//  3) For each mosaic cell: sample the cell average color from a downsampled image
//  4) Match cell color to closest emoji color in Lab space (more perceptual consistency)
//  5) Draw emoji mosaic on a fixed 900x900 output

// =====================
// Config
// =====================
const TARGET_SIZE = 900;
const UI_HEIGHT = 200;

// Smaller => bigger emojis, faster. Larger => more detail, smaller emojis
const MOSAIC_DIM = 26; // try 18~40

// Optional pre-blur before sampling (reduces noisy color flipping)
// 0 = off; 1~3 recommended
const BLUR_RADIUS = 1;

// Ignore transparency when computing emoji mean color
const IGNORE_TRANSPARENT = true;
const ALPHA_CUTOFF = 10;

// If true: slightly shrink emojis in each cell for nicer spacing
const USE_PADDING = true;
const PAD_RATIO = 0.06;

// =====================
// Globals
// =====================
let emojis = {};              // key -> p5.Image
let emojiKeys = ["red","yellow","green","cyan","blue","purple","gray","black","white"];
let paletteLab = [];          // [{key, lab:[L,a,b], rgb:[r,g,b]}]

let uploadedImg = null;
let processedCanvas = null;

let fileInputEl, saveButtonEl;
let statusMsg = "Loading emoji palette...";

// =====================
// Preload emoji palette
// =====================
function preload() {
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

// =====================
// Setup UI
// =====================
function setup() {
  createCanvas(TARGET_SIZE, TARGET_SIZE + UI_HEIGHT);
  background(255);
  textAlign(CENTER, CENTER);

  fileInputEl = createInput("", "file");
  fileInputEl.attribute("accept", "image/*");
  fileInputEl.elt.onchange = handleFileChange;

  saveButtonEl = createButton("点击保存处理后的图片");
  saveButtonEl.mousePressed(saveImage);

  layoutUI();

  // Build palette (mean color of each emoji -> Lab)
  statusMsg = "Computing emoji palette colors...";
  buildEmojiPalette();

  statusMsg = "Ready. Upload an image.";
}

function layoutUI() {
  fileInputEl.position(width / 2 - 170, 40);
  fileInputEl.style("width", "200px");
  saveButtonEl.position(width / 2 + 60, 40);
}

// =====================
// Upload
// =====================
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

// =====================
// Core helpers
// =====================

// Crop+scale input image to square 900x900 (cover & center crop)
function drawToSquare900(srcImg) {
  const g = createGraphics(TARGET_SIZE, TARGET_SIZE);
  g.pixelDensity(1);

  const ow = srcImg.width;
  const oh = srcImg.height;

  const scale = Math.max(TARGET_SIZE / ow, TARGET_SIZE / oh);
  const w = ow * scale;
  const h = oh * scale;

  const dx = (TARGET_SIZE - w) / 2;
  const dy = (TARGET_SIZE - h) / 2;

  g.image(srcImg, dx, dy, w, h);
  return g;
}

// Compute mean RGB of an emoji image (ignore transparency)
function meanRgbOfImage(img) {
  img.loadPixels();
  const p = img.pixels;
  let rSum = 0, gSum = 0, bSum = 0, c = 0;

  for (let i = 0; i < p.length; i += 4) {
    const a = p[i + 3];
    if (IGNORE_TRANSPARENT && a <= ALPHA_CUTOFF) continue;
    rSum += p[i];
    gSum += p[i + 1];
    bSum += p[i + 2];
    c++;
  }

  if (c === 0) return [0, 0, 0];
  return [rSum / c, gSum / c, bSum / c];
}

// Build paletteLab: each emoji key -> mean rgb -> Lab
function buildEmojiPalette() {
  paletteLab = [];

  for (const key of emojiKeys) {
    const img = emojis[key];
    const rgb = meanRgbOfImage(img);
    const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
    paletteLab.push({ key, rgb, lab });
  }
}

// Match an RGB color to the nearest palette color in Lab space
function pickEmojiKeyByLab(r, g, b) {
  const lab = rgbToLab(r, g, b);

  let bestKey = paletteLab[0].key;
  let bestD = Infinity;

  for (let i = 0; i < paletteLab.length; i++) {
    const pl = paletteLab[i].lab;
    const dL = lab[0] - pl[0];
    const da = lab[1] - pl[1];
    const db = lab[2] - pl[2];
    const d = dL * dL + da * da + db * db; // squared distance
    if (d < bestD) {
      bestD = d;
      bestKey = paletteLab[i].key;
    }
  }
  return bestKey;
}

// Draw an emoji in a cell with optional padding
function drawEmojiInCell(g, emojiImg, x, y, cellSize) {
  if (!USE_PADDING) {
    g.image(emojiImg, x, y, cellSize, cellSize);
    return;
  }
  const pad = cellSize * PAD_RATIO;
  g.image(emojiImg, x + pad, y + pad, cellSize - 2 * pad, cellSize - 2 * pad);
}

// =====================
// Main processing
// =====================
function processImage() {
  if (!uploadedImg) return;

  statusMsg = "Processing image...";

  // A) crop to 900x900
  const base900 = drawToSquare900(uploadedImg);

  // B) downsample to MOSAIC_DIM x MOSAIC_DIM (cell average colors)
  //    (Resize acts like an averaging filter; optional blur reduces noise flipping)
  const small = base900.get();
  if (BLUR_RADIUS > 0) small.filter(BLUR, BLUR_RADIUS);
  small.resize(MOSAIC_DIM, MOSAIC_DIM);
  small.loadPixels();

  // C) render mosaic
  const finalCanvas = createGraphics(TARGET_SIZE, TARGET_SIZE);
  finalCanvas.pixelDensity(1);
  finalCanvas.background(255);

  const cell = TARGET_SIZE / MOSAIC_DIM;

  for (let y = 0; y < MOSAIC_DIM; y++) {
    for (let x = 0; x < MOSAIC_DIM; x++) {
      const idx = (x + y * MOSAIC_DIM) * 4;
      const r = small.pixels[idx];
      const g = small.pixels[idx + 1];
      const b = small.pixels[idx + 2];
      const a = small.pixels[idx + 3];
      if (a <= 0) continue;

      // More consistent matching using Lab distance
      const key = pickEmojiKeyByLab(r, g, b);
      drawEmojiInCell(finalCanvas, emojis[key], x * cell, y * cell, cell);
    }
  }

  processedCanvas = finalCanvas;
  uploadedImg = null;
  statusMsg = "Done. You can save the image.";
}

// =====================
// Draw / Save
// =====================
function draw() {
  background(255);
  fill(0);
  textSize(18);
  text(statusMsg, width / 2, 120);

  if (processedCanvas) {
    image(processedCanvas, 0, UI_HEIGHT);
  }
}

function saveImage() {
  if (processedCanvas) {
    save(processedCanvas, "color_emoji_mosaic", "png");
  } else {
    alert("请先上传图片并等待处理完成！");
  }
}

// =====================
// Color conversion: RGB -> Lab (sRGB D65)
// =====================

// sRGB 0..255 -> linear 0..1
function srgbToLinear(u) {
  u /= 255;
  return (u <= 0.04045) ? (u / 12.92) : Math.pow((u + 0.055) / 1.055, 2.4);
}

// RGB -> XYZ (D65)
function rgbToXyz(r, g, b) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);

  // sRGB D65 matrix
  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  const Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;

  return [X, Y, Z];
}

// XYZ -> Lab (D65 reference white)
function xyzToLab(X, Y, Z) {
  // D65 reference white
  const Xn = 0.95047;
  const Yn = 1.00000;
  const Zn = 1.08883;

  let x = X / Xn;
  let y = Y / Yn;
  let z = Z / Zn;

  const f = (t) => (t > 0.008856) ? Math.cbrt(t) : (7.787 * t + 16 / 116);

  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);

  return [L, a, b];
}

function rgbToLab(r, g, b) {
  const [X, Y, Z] = rgbToXyz(r, g, b);
  return xyzToLab(X, Y, Z);
}
