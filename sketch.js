// sketch.js (Complete)
// B: choose emoji PNG by color, with thresholded "flattening" and inside-out smoothing
// Output size = input image size (emojis drawn on top of the original image)

let uploadedImg = null;
let processedCanvas = null;

let fileInputEl, saveButtonEl;

// Grid / size control
const grid = 10;
const maxDiameter = grid + 12;
const minDiameter = 12;

// ---- Flatten controls (tune these) ----
const SAMPLE_STEP = 2;             // 1 = best quality (slower), 2~3 faster
const BASE_RADIUS = 4;             // neighborhood radius (pixels)
const EXTRA_RADIUS_CENTER = 14;    // extra radius near center (inside-out flatten strength)

// Color thresholds
const SAT_GRAY_EDGE = 0.18;        // grayscale cutoff near edges
const SAT_GRAY_CENTER = 0.38;      // grayscale cutoff near center (bigger = flatter center)
const V_BLACK = 0.18;
const V_WHITE = 0.90;

// Hue bin borders (wide bins = flatter)
const HUE_BORDERS = [30, 90, 150, 210, 270, 330]; // red|yellow|green|cyan|blue|purple|red

// Emoji assets (replace filenames to match your repo)
let emojis = {};

function preload() {
  // Replace these filenames with your actual PNG names
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
  // initial canvas; will resize to image size after upload
  createCanvas(600, 800);
  background(255);

  // CSP-safe file input
  fileInputEl = createInput("", "file");
  fileInputEl.attribute("accept", "image/*");
  fileInputEl.elt.onchange = handleFileChange;

  // save button
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
// Math / color helpers
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

// Average RGB from a neighborhood around (cx, cy)
function sampleAverageRGB(pixels, w, h, cx, cy, radius, step) {
  const x0 = clamp(cx - radius, 0, w - 1);
  const x1 = clamp(cx + radius, 0, w - 1);
  const y0 = clamp(cy - radius, 0, h - 1);
  const y1 = clamp(cy + radius, 0, h - 1);

  let rs = 0, gs = 0, bs = 0, count = 0;

  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const idx = (x + y * w) * 4;
      rs += pixels[idx];
      gs += pixels[idx + 1];
      bs += pixels[idx + 2];
      count++;
    }
  }

  return {
    r: rs / count,
    g: gs / count,
    b: bs / count
  };
}

// Pick emoji with thresholds + inside-out flatten control
function pickEmojiByColorFlatten(r, g, b, x, y, w, h) {
  const hsv = rgbToHsv(r, g, b);
  const hue = hsv.h;
  const s = hsv.s;
  const v = hsv.v;

  // inside-out factor: 0 at center, 1 at farthest edge
  const dx = x - w / 2;
  const dy = y - h / 2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const maxDist = Math.sqrt((w / 2) ** 2 + (h / 2) ** 2);
  const t = maxDist === 0 ? 1 : clamp(dist / maxDist, 0, 1);

  // center flatter => higher grayscale cutoff at center
  const satGray = SAT_GRAY_CENTER + (SAT_GRAY_EDGE - SAT_GRAY_CENTER) * t;

  // grayscale handling
  if (s < satGray) {
    if (v < V_BLACK) return emojis.black;
    if (v > V_WHITE) return emojis.white;
    return emojis.gray;
  }

  // hue bins (wide bins => flatter)
  if (hue < HUE_BORDERS[0] || hue >= HUE_BORDERS[5]) return emojis.red;
  if (hue < HUE_BORDERS[1]) return emojis.yellow;
  if (hue < HUE_BORDERS[2]) return emojis.green;
  if (hue < HUE_BORDERS[3]) return emojis.cyan;
  if (hue < HUE_BORDERS[4]) return emojis.blue;
  return emojis.purple;
}

// ------------------------------------
// Core processing: draw on original size
// ------------------------------------
function processImage() {
  if (uploadedImg === null) return;

  const originalWidth = uploadedImg.width;
  const originalHeight = uploadedImg.height;

  // Resize main canvas to match image + UI space
  resizeCanvas(originalWidth, originalHeight + 200);
  layoutUI();

  // temp canvas = original pixels (same size)
  const tempCanvas = createGraphics(originalWidth, originalHeight);
  tempCanvas.pixelDensity(1);
  tempCanvas.image(uploadedImg, 0, 0, originalWidth, originalHeight);
  tempCanvas.loadPixels();

  // final canvas = original image as background + emojis on top
  const finalCanvas = createGraphics(originalWidth, originalHeight);
  finalCanvas.pixelDensity(1);
  finalCanvas.image(tempCanvas, 0, 0);

  // density variation (optional)
  const skipThreshold = 0.5;

  for (let y = 0; y < tempCanvas.height; y += grid + 2) {
    for (let x = 0; x < tempCanvas.width; x += grid + 2) {

      // inside-out smoothing radius: bigger near center => flatter center
      const dx = x - tempCanvas.width / 2;
      const dy = y - tempCanvas.height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = Math.sqrt((tempCanvas.width / 2) ** 2 + (tempCanvas.height / 2) ** 2);
      const t = maxDist === 0 ? 1 : clamp(dist / maxDist, 0, 1);

      const radius = Math.floor(BASE_RADIUS + (1 - t) * EXTRA_RADIUS_CENTER);

      // Sample average color around (x,y)
      const c = sampleAverageRGB(
        tempCanvas.pixels,
        tempCanvas.width,
        tempCanvas.height,
        x,
        y,
        radius,
        SAMPLE_STEP
      );

      // brightness drives density + size (using averaged color)
      const brightnessVal = (c.r + c.g + c.b) / 3;
      const brightnessMap = map(brightnessVal, 0, 255, 0.0, 1.0);

      if (brightnessMap > skipThreshold) {
        const skipProbability = map(brightnessMap, skipThreshold, 1.0, 0.0, 0.8);
        if (random(1) < skipProbability) continue;
      }

      const reversedPix = 255 - brightnessVal;
      const currentDiameter = map(reversedPix, 0, 255, minDiameter, maxDiameter);

      // NEW: choose emoji by thresholded color (flattened)
      const emoji = pickEmojiByColorFlatten(
        c.r, c.g, c.b,
        x, y,
        tempCanvas.width, tempCanvas.height
      );

      finalCanvas.image(emoji, x, y, currentDiameter, currentDiameter);
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
  textSize(20);
  text("上传图片后，处理结果将在下方显示 (原尺寸)", width / 2, 120);

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
