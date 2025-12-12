// sketch.js (Complete)
// B: pick a colored emoji PNG by pixel color
// Output size = input image size (draw emojis on top of the original image)

let uploadedImg = null;
let processedCanvas = null;

let fileInputEl, saveButtonEl;

// Grid / size control
const grid = 10;
const maxDiameter = grid + 2;
const minDiameter = 10;

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
// Color helpers (RGB -> HSV)
// -------------------------
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

function pickEmojiByColor(r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);

  // low saturation = grayscale
  if (s < 0.18) {
    if (v < 0.20) return emojis.black;
    if (v > 0.88) return emojis.white;
    return emojis.gray;
  }

  // hue bins
  if (h < 30 || h >= 330) return emojis.red;
  if (h < 90)  return emojis.yellow;
  if (h < 150) return emojis.green;
  if (h < 210) return emojis.cyan;
  if (h < 270) return emojis.blue;
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
      const index = (x + y * tempCanvas.width) * 4;
      if (index + 3 >= tempCanvas.pixels.length) continue;

      const r = tempCanvas.pixels[index];
      const g = tempCanvas.pixels[index + 1];
      const b = tempCanvas.pixels[index + 2];

      // brightness drives density + size (keeps your original logic idea)
      const brightnessVal = (r + g + b) / 3;
      const brightnessMap = map(brightnessVal, 0, 255, 0.0, 1.0);

      if (brightnessMap > skipThreshold) {
        const skipProbability = map(brightnessMap, skipThreshold, 1.0, 0.0, 0.8);
        if (random(1) < skipProbability) continue;
      }

      const reversedPix = 255 - brightnessVal;
      const currentDiameter = map(reversedPix, 0, 255, minDiameter, maxDiameter);

      // NEW: choose emoji by pixel color
      const emoji = pickEmojiByColor(r, g, b);

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
