// sketch.js
// Simple Color-Emoji Mosaic (browser-only, no NPY)
// - Output fixed: 900x900
// - Use 9 local emoji images as color tokens
// - Mapping: image cell color -> HSV classify -> choose emoji -> draw mosaic

// =====================
// Config
// =====================
const TARGET_SIZE = 900;
const UI_HEIGHT = 200;

// Mosaic resolution: smaller => bigger single emoji
// e.g. 22 -> ~41px per emoji, 30 -> 30px per emoji
const MOSAIC_DIM = 66;

// HSV thresholds (tune to get a flatter / more stable classification)
const S_GRAY = 0.18;   // below this saturation => gray/black/white
const V_BLACK = 0.20;  // below this value => black
const V_WHITE = 0.88;  // above this value => white

// =====================
// Globals
// =====================
let emojis = {};
let isEmojiReady = false;

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

  // p5 preload guarantees loadImage done before setup,
  // so we can mark ready here.
  isEmojiReady = true;
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
  if (!isEmojiReady) {
    alert("Emoji palette not ready yet. Please wait.");
    return;
  }

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
// Helpers
// =====================

// Crop+scale input image to a square 900x900 (cover & center crop)
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

// Classify one RGB color to one of 9 emoji keys by HSV thresholds
function pickEmojiKeyByHSV(r, g, b) {
  // p5's colorMode defaults to RGB 0..255; hue/saturation/brightness are 0..255
  const c = color(r, g, b);

  // Convert to 0..1 for reasoning
  const h = hue(c) / 255.0;         // 0..1 corresponds to 0..360°
  const s = saturation(c) / 255.0;  // 0..1
  const v = brightness(c) / 255.0;  // 0..1

  // 1) low saturation: gray / black / white
  if (s < S_GRAY) {
    if (v < V_BLACK) return "black";
    if (v > V_WHITE) return "white";
    return "gray";
  }

  // 2) hue-based color groups (red, yellow, green, cyan, blue, purple)
  // h in [0..1). Map to 6 sectors:
  //   [0) red -> yellow -> green -> cyan -> blue -> purple -> back to red
  // Use 6 equal slices: each 1/6
  const sector = Math.floor(h * 6); // 0..5
  switch (sector) {
    case 0: return "red";
    case 1: return "yellow";
    case 2: return "green";
    case 3: return "cyan";
    case 4: return "blue";
    case 5: return "purple";
  }

  return "gray";
}

// Draw an emoji image centered in a cell (keeps margins nicer)
function drawEmojiInCell(g, emojiImg, x, y, cellSize) {
  // Slight padding so emojis don’t touch edges
  const pad = cellSize * 0.08;
  const dx = x + pad;
  const dy = y + pad;
  const d = cellSize - pad * 2;

  g.image(emojiImg, dx, dy, d, d);
}

// =====================
// Core processing
// =====================
function processImage() {
  if (!uploadedImg) return;

  statusMsg = "Processing image...";

  // A) crop to 900x900
  const base900 = drawToSquare900(uploadedImg);

  // B) downsample to MOSAIC_DIM x MOSAIC_DIM (color sampling grid)
  const small = base900.get();
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

      const key = pickEmojiKeyByHSV(r, g, b);
      const emojiImg = emojis[key];

      drawEmojiInCell(finalCanvas, emojiImg, x * cell, y * cell, cell);
    }
  }

  processedCanvas = finalCanvas;
  uploadedImg = null;
  statusMsg = "Done. You can save the image.";
}

// =====================
// Draw
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

// =====================
// Save
// =====================
function saveImage() {
  if (processedCanvas) {
    save(processedCanvas, "color_emoji_mosaic", "png");
  } else {
    alert("请先上传图片并等待处理完成！");
  }
}
