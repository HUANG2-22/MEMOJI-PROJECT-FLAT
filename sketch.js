// sketch.js (Complete) - Emoji Mosaic by nearest mean color (article-style)
// Output fixed: 900x900

// --------------------
// Config
// --------------------
const TARGET_SIZE = 900;     // final output size
const UI_HEIGHT = 200;       // UI area height (top)
const MOSAIC_DIM = 60;       // mosaic resolution (60x60). Increase => more detailed but slower
const DRAW_BG = false;       // true: draw original image as background under emojis
const IGNORE_TRANSPARENT = true; // ignore pixels with low alpha when computing emoji mean color
const ALPHA_CUTOFF = 10;     // alpha threshold (0-255)

// IMPORTANT: replace with your real emoji PNG filenames in your repo root (or paths)
const EMOJI_FILES = [
  "emoji_red.png",
  "emoji_yellow.png",
  "emoji_green.png",
  "emoji_cyan.png",
  "emoji_blue.png",
  "emoji_purple.png",
  "emoji_gray.png",
  "emoji_black.png",
  "emoji_white.png"
];

// --------------------
// Globals
// --------------------
let uploadedImg = null;
let processedCanvas = null;

let fileInputEl, saveButtonEl;

let emojiImgs = [];   // p5.Image[]
let emojiMeans = [];  // {r,g,b}[]

// --------------------
// Preload emoji bank
// --------------------
function preload() {
  emojiImgs = EMOJI_FILES.map((f) => loadImage(f));
}

// --------------------
// Setup UI
// --------------------
function setup() {
  createCanvas(TARGET_SIZE, TARGET_SIZE + UI_HEIGHT);
  background(255);

  fileInputEl = createInput("", "file");
  fileInputEl.attribute("accept", "image/*");
  fileInputEl.elt.onchange = handleFileChange;

  saveButtonEl = createButton("点击保存处理后的图片");
  saveButtonEl.mousePressed(saveImage);

  textAlign(CENTER, CENTER);
  layoutUI();

  // Precompute emoji mean colors once
  computeAllEmojiMeans();
}

function layoutUI() {
  fileInputEl.position(width / 2 - 170, 40);
  fileInputEl.style("width", "200px");
  saveButtonEl.position(width / 2 + 60, 40);
}

// --------------------
// Upload handling (CSP-safe)
// --------------------
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

// --------------------
// Compute mean colors for emoji bank (article-style)
// --------------------
function computeAllEmojiMeans() {
  emojiMeans = emojiImgs.map((img) => computeMeanColor(img));
}

function computeMeanColor(img) {
  img.loadPixels();
  const px = img.pixels;

  let rSum = 0, gSum = 0, bSum = 0, count = 0;

  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const a = px[i + 3];

    if (IGNORE_TRANSPARENT && a <= ALPHA_CUTOFF) continue;

    rSum += r;
    gSum += g;
    bSum += b;
    count++;
  }

  if (count === 0) {
    return { r: 0, g: 0, b: 0 };
  }
  return { r: rSum / count, g: gSum / count, b: bSum / count };
}

// Find nearest emoji index by RGB distance (squared)
function nearestEmojiIndex(r, g, b) {
  let bestIdx = 0;
  let bestD = Infinity;

  for (let i = 0; i < emojiMeans.length; i++) {
    const m = emojiMeans[i];
    const dr = r - m.r;
    const dg = g - m.g;
    const db = b - m.b;
    const d = dr * dr + dg * dg + db * db;

    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// --------------------
// Core processing
// --------------------
function processImage() {
  if (!uploadedImg) return;

  // A) draw uploaded image into a 900x900 temp canvas (center-crop, keep aspect)
  const temp = createGraphics(TARGET_SIZE, TARGET_SIZE);
  temp.pixelDensity(1);

  const ow = uploadedImg.width;
  const oh = uploadedImg.height;

  // scale to fill TARGET_SIZE then center-crop
  const scale = Math.max(TARGET_SIZE / ow, TARGET_SIZE / oh);
  const w = ow * scale;
  const h = oh * scale;
  const dx = (TARGET_SIZE - w) / 2;
  const dy = (TARGET_SIZE - h) / 2;

  temp.image(uploadedImg, dx, dy, w, h);

  // B) make a small version MOSAIC_DIM x MOSAIC_DIM (each pixel becomes one emoji)
  const small = temp.get();
  small.resize(MOSAIC_DIM, MOSAIC_DIM);
  small.loadPixels();

  // C) final canvas 900x900
  const finalCanvas = createGraphics(TARGET_SIZE, TARGET_SIZE);
  finalCanvas.pixelDensity(1);

  if (DRAW_BG) {
    finalCanvas.image(temp, 0, 0);
  } else {
    finalCanvas.background(255);
  }

  const cell = TARGET_SIZE / MOSAIC_DIM;

  // D) replace each small pixel with nearest-color emoji
  for (let y = 0; y < MOSAIC_DIM; y++) {
    for (let x = 0; x < MOSAIC_DIM; x++) {
      const idx = (x + y * MOSAIC_DIM) * 4;
      const r = small.pixels[idx];
      const g = small.pixels[idx + 1];
      const b = small.pixels[idx + 2];
      const a = small.pixels[idx + 3];

      // If original pixel is transparent (rare for photos), skip
      if (a <= 0) continue;

      const ei = nearestEmojiIndex(r, g, b);
      const emoji = emojiImgs[ei];

      finalCanvas.image(emoji, x * cell, y * cell, cell, cell);
    }
  }

  processedCanvas = finalCanvas;
  uploadedImg = null;
}

// --------------------
// Draw
// --------------------
function draw() {
  background(255);
  fill(0);
  textSize(18);
  text(
    `上传图片后生成 Emoji Mosaic（输出固定 ${TARGET_SIZE}×${TARGET_SIZE}，网格 ${MOSAIC_DIM}×${MOSAIC_DIM}）`,
    width / 2,
    120
  );

  if (processedCanvas) {
    image(processedCanvas, 0, UI_HEIGHT);
  }
}

// --------------------
// Save
// --------------------
function saveImage() {
  if (processedCanvas) {
    save(processedCanvas, "emojified_image", "png");
  } else {
    alert("请先上传图片并等待处理完成！");
  }
}
