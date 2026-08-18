const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_TILES_PER_MASTER = 15;
const TILE_PIXEL_GRID = 8;
const LEDS_PER_TILE = TILE_PIXEL_GRID * TILE_PIXEL_GRID;

const DEMOS = {
  mario: {
    key: "mario",
    type: "static",
    name: "Super Mario (NES)",
    width: 256,
    height: 240,
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/5/50/NES_Super_Mario_Bros.png",
    sourcePage: "https://en.wikipedia.org/wiki/File:NES_Super_Mario_Bros.png",
  },
  sonic_sms: {
    key: "sonic_sms",
    type: "static",
    name: "Sonic (Master System)",
    width: 248,
    height: 192,
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/f/f9/Sonic_1_8-bit.png",
    sourcePage: "https://en.wikipedia.org/wiki/File:Sonic_1_8-bit.png",
  },
  sonic_md: {
    key: "sonic_md",
    type: "static",
    name: "Sonic (Mega Drive)",
    width: 320,
    height: 224,
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/d/d3/MD_Sonic_the_Hedgehog.png",
    sourcePage: "https://en.wikipedia.org/wiki/File:MD_Sonic_the_Hedgehog.png",
  },
  mario_anim: {
    key: "mario_anim",
    type: "animation",
    name: "Animated Mario Run",
    width: 256,
    height: 240,
    backgroundColor: "#0f1724",
    character: "mario",
    spriteUrl: "assets/sprites/mario_sheet.png",
    spritePage: "https://www.spriters-resource.com/nes/supermariobros/asset/50365/",
  },
  sonic_sms_anim: {
    key: "sonic_sms_anim",
    type: "animation",
    name: "Animated Sonic Run (Master System)",
    width: 248,
    height: 192,
    backgroundColor: "#102039",
    character: "sonic_sms",
    spriteUrl: "assets/sprites/sonic_sms_sheet.png",
    spritePage: "https://www.spriters-resource.com/master_system/sonicthehedgehog/asset/5859/",
  },
  sonic_md_anim: {
    key: "sonic_md_anim",
    type: "animation",
    name: "Animated Sonic Run (Mega Drive)",
    width: 320,
    height: 224,
    backgroundColor: "#102039",
    character: "sonic_md",
    spriteUrl: "assets/sprites/sonic_md_sheet.png",
    spritePage: "https://www.spriters-resource.com/sega_genesis/sonicth1/asset/21628/",
  },
};

const state = {
  activeView: "map",
  rows: 5,
  cols: 7,
  expectedMasters: 3,
  selectedTileId: null,
  tiles: [],
  masterIPs: {},
  masterLeds: {},
  tileRotations: {},
  twinklyTokens: {},
  livePushActive: false,
  livePushRafId: null,
  discoveredDevices: [],
  wizard: {
    active: false,
    selectedIp: "",
    currentIp: "",
    startNonce: 0,
    reportedLedCount: 0,
    rawLedCount: 0,
    ledCount: 0,
    totalSegments: 0,
    currentSegment: 0,
    phase: "idle",
    yellowShown: false,
    segmentTileIds: {},
    skippedSegments: [],
    lockedTiles: {},
    assignments: [],
    queueIps: [],
    blinkTimerId: null,
    blinkOn: false,
    blinkInFlight: false,
    segmentLedGroups: [],
    segmentGroupSource: "fallback",
    segmentResolvedGroupIndex: {},
    currentProbeGroupIndex: null,
    probeCursor: 0,
    tileCountOverrides: {},
  },
  demoPreset: "mario",
  demoOffsetX: 0,
  demoOffsetY: 0,
  draggingDemo: false,
  dragStartClientX: 0,
  dragStartClientY: 0,
  dragStartOffsetX: 0,
  dragStartOffsetY: 0,
  sourceFrame: null,
  animation: {
    active: false,
    label: "",
    spriteUrl: null,
    spritePage: null,
    frames: [],
    frameIndex: 0,
    frameTimerMs: 0,
    frameDurationMs: 120,
    posX: 0,
    posY: 0,
    velocityX: 0.018,
    lastTickMs: 0,
    rafId: null,
  },
  characters: {
    searchResults: [],
    loadedAssetUrl: null,
    loadedSheetUrl: null,
    sheetDataUrl: null,
    sheetImageData: null,
    sprites: [],
    detectStrictness: 0.65,
    actions: {
      run: { name: "run", frames: [] },
    },
    selectedAction: "run",
    previewRafId: null,
    previewLastTs: 0,
    previewElapsed: 0,
    previewFrameIndex: 0,
    autosaveTimer: null,
    autosaveStorageKey: "gamewall.characters.autosave.v1",
  },
  lastExportPreviewJson: "",
};

const el = {
  menuMap: document.getElementById("menuMap"),
  menuCharacters: document.getElementById("menuCharacters"),
  mapView: document.getElementById("mapView"),
  charactersView: document.getElementById("charactersView"),
  gridSvg: document.getElementById("gridSvg"),
  statusText: document.getElementById("statusText"),
  validationList: document.getElementById("validationList"),
  tileDetails: document.getElementById("tileDetails"),
  masterIpInput: document.getElementById("masterIpInput"),
  masterIpRow: document.getElementById("masterIpRow"),
  btnDiscoverTwinkly: document.getElementById("btnDiscoverTwinkly"),
  btnPushHardware: document.getElementById("btnPushHardware"),
  btnToggleLivePush: document.getElementById("btnToggleLivePush"),
  btnQueryMaster: document.getElementById("btnQueryMaster"),
  btnWizardDiscover: document.getElementById("btnWizardDiscover"),
  wizardDeviceSelect: document.getElementById("wizardDeviceSelect"),
  wizardTileCountOverride: document.getElementById("wizardTileCountOverride"),
  btnWizardStartDevice: document.getElementById("btnWizardStartDevice"),
  btnWizardBlinkRed: document.getElementById("btnWizardBlinkRed"),
  btnWizardShowYellow: document.getElementById("btnWizardShowYellow"),
  btnWizardRotateLeft: document.getElementById("btnWizardRotateLeft"),
  btnWizardRotateRight: document.getElementById("btnWizardRotateRight"),
  btnWizardConfirmTile: document.getElementById("btnWizardConfirmTile"),
  btnWizardSkipSegment: document.getElementById("btnWizardSkipSegment"),
  btnWizardGroupPrev: document.getElementById("btnWizardGroupPrev"),
  btnWizardGroupNext: document.getElementById("btnWizardGroupNext"),
  btnWizardGroupSelect: document.getElementById("btnWizardGroupSelect"),
  wizardGroupBadge: document.getElementById("wizardGroupBadge"),
  btnWizardUnlockTile: document.getElementById("btnWizardUnlockTile"),
  btnWizardUnlockAll: document.getElementById("btnWizardUnlockAll"),
  btnWizardReplay: document.getElementById("btnWizardReplay"),
  btnWizardNextDevice: document.getElementById("btnWizardNextDevice"),
  btnWizardCancel: document.getElementById("btnWizardCancel"),
  wizardStatus: document.getElementById("wizardStatus"),
  wizardProgressBody: document.getElementById("wizardProgressBody"),
  pushStatus: document.getElementById("pushStatus"),
  discoveryResults: document.getElementById("discoveryResults"),
  discoveryStatus: document.getElementById("discoveryStatus"),
  exportPreview: document.getElementById("exportPreview"),
  jsonOutput: document.getElementById("jsonOutput"),
  rowsInput: document.getElementById("rowsInput"),
  colsInput: document.getElementById("colsInput"),
  mastersInput: document.getElementById("mastersInput"),
  btnResize: document.getElementById("btnResize"),
  btnReset: document.getElementById("btnReset"),
  btnExport: document.getElementById("btnExport"),
  importFile: document.getElementById("importFile"),
  headerSize: document.getElementById("headerSize"),
  headerTileCount: document.getElementById("headerTileCount"),
  headerSizeSub: document.getElementById("headerSizeSub"),
  demoPreset: document.getElementById("demoPreset"),
  demoImageFile: document.getElementById("demoImageFile"),
  demoInfo: document.getElementById("demoInfo"),
  charSearchInput: document.getElementById("charSearchInput"),
  btnCharSearch: document.getElementById("btnCharSearch"),
  charSheetFile: document.getElementById("charSheetFile"),
  characterFileName: document.getElementById("characterFileName"),
  btnSaveCharacterJson: document.getElementById("btnSaveCharacterJson"),
  loadCharacterJson: document.getElementById("loadCharacterJson"),
  charSearchStatus: document.getElementById("charSearchStatus"),
  charSearchResults: document.getElementById("charSearchResults"),
  detectStrictness: document.getElementById("detectStrictness"),
  detectStrictnessValue: document.getElementById("detectStrictnessValue"),
  btnDetectNow: document.getElementById("btnDetectNow"),
  btnDetectSweep: document.getElementById("btnDetectSweep"),
  detectSummary: document.getElementById("detectSummary"),
  spriteSheetMeta: document.getElementById("spriteSheetMeta"),
  spritePalette: document.getElementById("spritePalette"),
  actionNameInput: document.getElementById("actionNameInput"),
  btnCreateAction: document.getElementById("btnCreateAction"),
  actionSelect: document.getElementById("actionSelect"),
  timelineDrop: document.getElementById("timelineDrop"),
  actionTimeline: document.getElementById("actionTimeline"),
  charPreviewCanvas: document.getElementById("charPreviewCanvas"),
  previewInfo: document.getElementById("previewInfo"),
};

function setStatus(message) {
  el.statusText.textContent = message;
}

function updateHeader() {
  const size = `${state.cols}x${state.rows}`;
  const count = state.tiles.length;
  document.title = `GameWall Mapper ${size}`;
  el.headerSize.textContent = size;
  el.headerSizeSub.textContent = size;
  el.headerTileCount.textContent = String(count);
}

function makeTiles(rows, cols) {
  const tiles = [];
  let id = 1;
  for (let r = 1; r <= rows; r += 1) {
    for (let c = 1; c <= cols; c += 1) {
      tiles.push({ id, row: r, col: c, isMaster: false });
      id += 1;
    }
  }
  return tiles;
}

function getTileById(id) {
  return state.tiles.find((t) => t.id === id) || null;
}

function isTileLocked(tileId) {
  return Boolean(state.wizard.lockedTiles[String(tileId)]);
}

function getTileAt(row, col) {
  return state.tiles.find((t) => t.row === row && t.col === col) || null;
}

function buildTileMasterAssignmentMap() {
  const assignments = new Map();
  const masterTileByIp = new Map();

  for (const tile of state.tiles) {
    if (!tile.isMaster) continue;
    const ip = state.masterIPs[tile.id] || null;
    assignments.set(tile.id, {
      masterTileId: tile.id,
      masterIp: ip,
      segment: 0,
    });
    if (ip) masterTileByIp.set(ip, tile.id);
  }

  const segmentZeroByIp = new Map();
  for (const item of state.wizard.assignments || []) {
    if (Number(item.segment) === 0 && Number.isInteger(item.tileId) && typeof item.ip === "string") {
      segmentZeroByIp.set(item.ip, item.tileId);
    }
  }

  const ordered = (state.wizard.assignments || [])
    .slice()
    .sort((a, b) => a.segment - b.segment);

  for (const item of ordered) {
    const tileId = Number(item.tileId);
    if (!Number.isInteger(tileId)) continue;

    const ip = typeof item.ip === "string" ? item.ip : null;
    let masterTileId = ip ? masterTileByIp.get(ip) : null;
    if (!masterTileId && ip && segmentZeroByIp.has(ip)) {
      masterTileId = segmentZeroByIp.get(ip);
      masterTileByIp.set(ip, masterTileId);
    }

    assignments.set(tileId, {
      masterTileId: Number.isInteger(masterTileId) ? masterTileId : null,
      masterIp: ip,
      segment: Number.isInteger(item.segment) ? item.segment : null,
    });
  }

  return assignments;
}

function getOrderedTilesForMaster(masterId) {
  const master = getTileById(masterId);
  if (!master || !master.isMaster) return [];

  const masterIp = state.masterIPs[masterId] || null;
  if (!masterIp) return [masterId];

  const ordered = (state.wizard.assignments || [])
    .filter((a) => a.ip === masterIp && Number.isInteger(a.tileId))
    .slice()
    .sort((a, b) => a.segment - b.segment)
    .map((a) => a.tileId);

  if (ordered.length === 0) return [masterId];
  if (!ordered.includes(masterId)) ordered.unshift(masterId);

  const deduped = [];
  const seen = new Set();
  for (const tileId of ordered) {
    if (!seen.has(tileId)) {
      seen.add(tileId);
      deduped.push(tileId);
    }
  }
  return deduped;
}

function wallPixelWidth() {
  return state.cols * TILE_PIXEL_GRID;
}

function wallPixelHeight() {
  return state.rows * TILE_PIXEL_GRID;
}

function clampDemoOffsets() {
  if (!state.sourceFrame) return;
  const maxX = Math.max(0, state.sourceFrame.width - wallPixelWidth());
  const maxY = Math.max(0, state.sourceFrame.height - wallPixelHeight());
  state.demoOffsetX = Math.max(0, Math.min(maxX, state.demoOffsetX));
  state.demoOffsetY = Math.max(0, Math.min(maxY, state.demoOffsetY));
}

function resetAnimation() {
  const anim = state.animation;
  anim.active = false;
  anim.label = "";
  anim.spriteUrl = null;
  anim.spritePage = null;
  anim.frames = [];
  anim.frameIndex = 0;
  anim.frameTimerMs = 0;
  anim.posX = 0;
  anim.posY = 0;
  anim.lastTickMs = 0;
  if (anim.rafId != null) {
    cancelAnimationFrame(anim.rafId);
    anim.rafId = null;
  }
}

function renderDemoInfo() {
  if (!state.sourceFrame) {
    el.demoInfo.textContent = "No demo loaded.";
    return;
  }

  const maxX = Math.max(0, state.sourceFrame.width - wallPixelWidth());
  const maxY = Math.max(0, state.sourceFrame.height - wallPixelHeight());

  const lines = [
    `source: ${state.sourceFrame.label}`,
    `resolution: ${state.sourceFrame.width}x${state.sourceFrame.height}`,
    `wall sample: ${wallPixelWidth()}x${wallPixelHeight()}`,
    `offset: x=${state.demoOffsetX}/${maxX}, y=${state.demoOffsetY}/${maxY}`,
  ];

  if (state.sourceFrame.imageUrl) {
    lines.push(`image url: ${state.sourceFrame.imageUrl}`);
  }
  if (state.sourceFrame.sourcePage) {
    lines.push(`source page: ${state.sourceFrame.sourcePage}`);
  }

  if (state.animation.active) {
    lines.push(`animation: ${state.animation.label}`);
    lines.push(`frames: ${state.animation.frames.length}`);
    if (state.animation.spriteUrl) lines.push(`sprite url: ${state.animation.spriteUrl}`);
    if (state.animation.spritePage) lines.push(`sprite source: ${state.animation.spritePage}`);
  }

  el.demoInfo.textContent = lines.join("\n");
}

function imageToImageData(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, image.width, image.height);
  try {
    return ctx.getImageData(0, 0, image.width, image.height);
  } catch (err) {
    throw new Error("Image host blocked pixel access (CORS).");
  }
}

function createFrameFromImage(image, meta) {
  const imageData = imageToImageData(image);

  state.sourceFrame = {
    width: image.width,
    height: image.height,
    imageData,
    label: meta.label,
    imageUrl: meta.imageUrl || null,
    sourcePage: meta.sourcePage || null,
    presetKey: meta.presetKey || null,
    custom: Boolean(meta.custom),
  };

  state.demoOffsetX = 0;
  state.demoOffsetY = 0;
  clampDemoOffsets();
  renderDemoInfo();
  render();
}

function createSolidFrame(width, height, color, meta) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  state.sourceFrame = {
    width,
    height,
    imageData: ctx.getImageData(0, 0, width, height),
    label: meta.label,
    imageUrl: meta.imageUrl || null,
    sourcePage: meta.sourcePage || null,
    presetKey: meta.presetKey || null,
    custom: Boolean(meta.custom),
  };

  state.demoOffsetX = 0;
  state.demoOffsetY = 0;
  clampDemoOffsets();
  renderDemoInfo();
  render();
}

function loadImageFromUrl(url) {
  function attemptLoad(src, useCors) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      if (useCors) image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Image download failed."));
      image.src = src;
    });
  }

  function toWeservProxy(src) {
    const withoutScheme = src.replace(/^https?:\/\//i, "");
    return `https://images.weserv.nl/?url=${encodeURIComponent(withoutScheme)}`;
  }

  return attemptLoad(url, true)
    .catch(() => attemptLoad(toWeservProxy(url), true));
}

const SPRITE_SCAN_PROFILES = {
  mario: { minW: 8, maxW: 48, minH: 10, maxH: 48, rowTolerance: 14, maxFrames: 8 },
  sonic_sms: { minW: 10, maxW: 44, minH: 12, maxH: 56, rowTolerance: 16, maxFrames: 8 },
  sonic_md: { minW: 12, maxW: 72, minH: 14, maxH: 88, rowTolerance: 20, maxFrames: 10 },
};

function isOpaqueSpritePixel(data, i) {
  const a = data[i + 3];
  if (a < 24) return false;
  return true;
}

function colorDistanceSq(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

function detectSpriteMaskSettings(imageData, strictness = 0.65) {
  const { width, height, data } = imageData;
  const pixelCount = width * height;
  const sampleStep = Math.max(1, Math.floor(Math.sqrt(pixelCount / 25000)));

  let transparentSamples = 0;
  let totalSamples = 0;
  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const i = (y * width + x) * 4;
      totalSamples += 1;
      if (data[i + 3] < 24) {
        transparentSamples += 1;
      }
    }
  }

  const hasMeaningfulTransparency = totalSamples > 0 && (transparentSamples / totalSamples) > 0.03;
  if (hasMeaningfulTransparency) {
    return {
      useAlphaOnly: true,
      matteColor: null,
      matteToleranceSq: 0,
    };
  }

  // For non-transparent sheets, estimate dominant border colors as matte/background palette.
  const bins = new Map();
  const addBin = (r, g, b) => {
    const qr = r >> 4;
    const qg = g >> 4;
    const qb = b >> 4;
    const key = `${qr},${qg},${qb}`;
    const rec = bins.get(key);
    if (rec) {
      rec.count += 1;
      rec.r += r;
      rec.g += g;
      rec.b += b;
    } else {
      bins.set(key, { count: 1, r, g, b });
    }
  };

  const edgeStep = Math.max(1, Math.floor(Math.max(width, height) / 700));
  for (let x = 0; x < width; x += edgeStep) {
    const topI = x * 4;
    const bottomI = ((height - 1) * width + x) * 4;
    if (data[topI + 3] >= 24) addBin(data[topI], data[topI + 1], data[topI + 2]);
    if (data[bottomI + 3] >= 24) addBin(data[bottomI], data[bottomI + 1], data[bottomI + 2]);
  }
  for (let y = 0; y < height; y += edgeStep) {
    const leftI = (y * width) * 4;
    const rightI = (y * width + (width - 1)) * 4;
    if (data[leftI + 3] >= 24) addBin(data[leftI], data[leftI + 1], data[leftI + 2]);
    if (data[rightI + 3] >= 24) addBin(data[rightI], data[rightI + 1], data[rightI + 2]);
  }

  if (bins.size === 0) {
    return {
      useAlphaOnly: false,
      matteColors: [],
      matteToleranceSq: 0,
    };
  }

  const sortedBins = Array.from(bins.values()).sort((a, b) => b.count - a.count);
  const topBins = sortedBins.slice(0, 6).filter((rec) => rec.count >= 6);
  if (!topBins.length) {
    return {
      useAlphaOnly: false,
      matteColors: [],
      matteToleranceSq: 0,
    };
  }

  const matteColors = topBins.map((rec) => ({
    r: Math.round(rec.r / rec.count),
    g: Math.round(rec.g / rec.count),
    b: Math.round(rec.b / rec.count),
  }));

  // Lower strictness removes a broader matte range; higher strictness is more selective.
  const tolerance = Math.max(10, Math.round(14 + (1 - strictness) * 30));

  return {
    useAlphaOnly: false,
    matteColors,
    matteToleranceSq: tolerance * tolerance,
  };
}

function isLikelySpritePixel(data, i, maskSettings) {
  if (!isOpaqueSpritePixel(data, i)) return false;

  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];

  if (maskSettings.useAlphaOnly) {
    return true;
  }

  if (maskSettings.matteColors && maskSettings.matteColors.length) {
    for (const matte of maskSettings.matteColors) {
      const d2 = colorDistanceSq(r, g, b, matte.r, matte.g, matte.b);
      if (d2 <= maskSettings.matteToleranceSq) return false;
    }
  }

  return true;
}

function extractSpriteBoxes(imageData, profile, strictness = 0.65) {
  const { width, height, data } = imageData;
  const maskSettings = detectSpriteMaskSettings(imageData, strictness);
  const minPixels = Number.isFinite(profile.minPixels) ? profile.minPixels : 12;
  const visited = new Uint8Array(width * height);
  const boxes = [];
  const qx = [];
  const qy = [];

  const idx = (x, y) => y * width + x;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const linear = idx(x, y);
      if (visited[linear]) continue;
      const pix = linear * 4;
      if (!isLikelySpritePixel(data, pix, maskSettings)) continue;

      visited[linear] = 1;
      qx.length = 0;
      qy.length = 0;
      qx.push(x);
      qy.push(y);

      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let count = 0;

      for (let qi = 0; qi < qx.length; qi += 1) {
        const cx = qx[qi];
        const cy = qy[qi];
        count += 1;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const ns = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];

        for (const [nx, ny] of ns) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nLinear = idx(nx, ny);
          if (visited[nLinear]) continue;
          const nPix = nLinear * 4;
          if (!isLikelySpritePixel(data, nPix, maskSettings)) continue;
          visited[nLinear] = 1;
          qx.push(nx);
          qy.push(ny);
        }
      }

      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      if (count < minPixels) continue;
      if (w < profile.minW || w > profile.maxW) continue;
      if (h < profile.minH || h > profile.maxH) continue;
      boxes.push({ x: minX, y: minY, w, h, count });
    }
  }

  return boxes;
}

function boxesNear(a, b, pad = 2) {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  return !(
    ax2 + pad < b.x ||
    bx2 + pad < a.x ||
    ay2 + pad < b.y ||
    by2 + pad < a.y
  );
}

function mergeBoxPair(a, b) {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.w, b.x + b.w);
  const maxY = Math.max(a.y + a.h, b.y + b.h);
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    count: (a.count || 0) + (b.count || 0),
  };
}

function shouldMergeBoxes(a, b, maxGap, maxMergedW, maxMergedH) {
  const aRight = a.x + a.w;
  const bRight = b.x + b.w;
  const aBottom = a.y + a.h;
  const bBottom = b.y + b.h;

  const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(aRight, bRight));
  const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(aBottom, bBottom));

  if (gapX > maxGap || gapY > maxGap) return false;

  const merged = mergeBoxPair(a, b);
  if (merged.w > maxMergedW || merged.h > maxMergedH) return false;
  return true;
}

function mergeNearbyBoxes(boxes, options = {}) {
  const pad = Number.isFinite(options.pad) ? options.pad : 2;
  const maxPasses = Number.isFinite(options.maxPasses) ? options.maxPasses : 2;
  const maxMergedW = Number.isFinite(options.maxMergedW) ? options.maxMergedW : 120;
  const maxMergedH = Number.isFinite(options.maxMergedH) ? options.maxMergedH : 120;

  let current = boxes.slice();
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    const next = [];
    const used = new Uint8Array(current.length);

    for (let i = 0; i < current.length; i += 1) {
      if (used[i]) continue;
      let merged = current[i];
      used[i] = 1;

      for (let j = i + 1; j < current.length; j += 1) {
        if (used[j]) continue;
        if (!boxesNear(merged, current[j], pad)) continue;
        if (!shouldMergeBoxes(merged, current[j], pad, maxMergedW, maxMergedH)) continue;
        merged = mergeBoxPair(merged, current[j]);
        used[j] = 1;
        changed = true;
      }

      next.push(merged);
    }

    current = next;
    if (!changed) break;
  }
  return current;
}

function pickRunBoxes(boxes, profile) {
  if (!boxes.length) return [];
  const sorted = boxes.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));

  let best = null;
  for (const anchor of sorted) {
    const group = sorted
      .filter((b) => Math.abs(b.y - anchor.y) <= profile.rowTolerance)
      .filter((b) => Math.abs(b.h - anchor.h) <= Math.max(4, Math.floor(anchor.h * 0.4)))
      .filter((b) => Math.abs(b.w - anchor.w) <= Math.max(4, Math.floor(anchor.w * 0.5)))
      .sort((a, b) => a.x - b.x);

    if (group.length < 3) continue;
    const score = group.length * 1000 - anchor.y;
    if (!best || score > best.score) {
      best = { score, group };
    }
  }

  const chosen = best ? best.group : sorted;
  return chosen.slice(0, profile.maxFrames);
}

function cropFramesFromBoxes(imageData, boxes) {
  const { width, data } = imageData;
  return boxes.map((box) => {
    const out = new Uint8ClampedArray(box.w * box.h * 4);
    for (let y = 0; y < box.h; y += 1) {
      for (let x = 0; x < box.w; x += 1) {
        const srcI = ((box.y + y) * width + (box.x + x)) * 4;
        const dstI = (y * box.w + x) * 4;
        out[dstI] = data[srcI];
        out[dstI + 1] = data[srcI + 1];
        out[dstI + 2] = data[srcI + 2];
        out[dstI + 3] = data[srcI + 3];
      }
    }
    return { width: box.w, height: box.h, data: out };
  });
}

function tryExtractRunFramesFromSheet(imageData, character) {
  const profile = SPRITE_SCAN_PROFILES[character] || SPRITE_SCAN_PROFILES.sonic_md;
  const boxes = extractSpriteBoxes(imageData, profile);
  const runBoxes = pickRunBoxes(boxes, profile);
  if (runBoxes.length >= 2) return cropFramesFromBoxes(imageData, runBoxes);

  // Fallback extraction path: still use sprites if we can find at least 2 candidate boxes.
  const sorted = boxes.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
  if (sorted.length < 2) return [];
  return cropFramesFromBoxes(imageData, sorted.slice(0, Math.min(profile.maxFrames, sorted.length)));
}

function createEmptyAnimFrame(width, height) {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  };
}

function paintPixel(frame, x, y, color) {
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) return;
  const i = (y * frame.width + x) * 4;
  frame.data[i] = color[0];
  frame.data[i + 1] = color[1];
  frame.data[i + 2] = color[2];
  frame.data[i + 3] = color[3];
}

function paintRect(frame, x, y, w, h, color) {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      paintPixel(frame, px, py, color);
    }
  }
}

function buildMarioRunFrames() {
  const RED = [188, 33, 33, 255];
  const SKIN = [238, 186, 142, 255];
  const BROWN = [116, 74, 42, 255];
  const BLUE = [45, 88, 201, 255];
  const BLACK = [18, 18, 18, 255];

  function frame(legShift) {
    const f = createEmptyAnimFrame(16, 16);
    paintRect(f, 3, 1, 10, 2, RED);
    paintRect(f, 3, 3, 4, 1, BROWN);
    paintRect(f, 5, 4, 6, 4, SKIN);
    paintRect(f, 4, 8, 8, 3, RED);
    paintRect(f, 5, 11, 6, 3, BLUE);
    paintRect(f, 4, 9, 1, 2, SKIN);
    paintRect(f, 11, 9, 1, 2, SKIN);
    paintRect(f, 5 + legShift, 14, 2, 2, BROWN);
    paintRect(f, 9 - legShift, 14, 2, 2, BROWN);
    paintRect(f, 5 + legShift, 15, 3, 1, BLACK);
    paintRect(f, 8 - legShift, 15, 3, 1, BLACK);
    return f;
  }

  return [frame(0), frame(1), frame(-1), frame(0)];
}

function buildSonicRunFrames(kind) {
  const isSms = kind === "sonic_sms";
  const BLUE = isSms ? [58, 150, 245, 255] : [37, 108, 219, 255];
  const TAN = [241, 203, 160, 255];
  const RED = isSms ? [206, 82, 40, 255] : [207, 34, 34, 255];
  const WHITE = [245, 245, 245, 255];
  const BLACK = [20, 20, 20, 255];

  function frame(legShift) {
    const f = createEmptyAnimFrame(18, 16);
    paintRect(f, 6, 1, 7, 4, BLUE);
    paintRect(f, 4, 2, 2, 2, BLUE);
    paintRect(f, 13, 2, 2, 2, BLUE);
    paintRect(f, 7, 5, 6, 6, BLUE);
    paintRect(f, 9, 7, 2, 3, TAN);
    paintRect(f, 6, 8, 1, 2, TAN);
    paintRect(f, 12, 8, 1, 2, TAN);
    paintRect(f, 7 + legShift, 11, 2, 3, BLUE);
    paintRect(f, 10 - legShift, 11, 2, 3, BLUE);
    paintRect(f, 6 + legShift, 14, 4, 2, RED);
    paintRect(f, 9 - legShift, 14, 4, 2, RED);
    paintRect(f, 7 + legShift, 14, 2, 1, WHITE);
    paintRect(f, 10 - legShift, 14, 2, 1, WHITE);
    paintPixel(f, 10, 4, BLACK);
    return f;
  }

  return [frame(0), frame(1), frame(-1), frame(0)];
}

function createBuiltInRunFrames(character) {
  if (character === "mario") return buildMarioRunFrames();
  if (character === "sonic_sms") return buildSonicRunFrames("sonic_sms");
  return buildSonicRunFrames("sonic_md");
}

function startAnimation(label, spriteUrl, spritePage, frames) {
  if (!frames.length) {
    throw new Error("No animation frames found in sprite sheet.");
  }

  const anim = state.animation;
  anim.active = true;
  anim.label = label;
  anim.spriteUrl = spriteUrl;
  anim.spritePage = spritePage;
  anim.frames = frames;
  anim.frameIndex = 0;
  anim.frameTimerMs = 0;
  anim.lastTickMs = performance.now();

  const first = frames[0];
  anim.posX = Math.floor((wallPixelWidth() - first.width) / 2);
  anim.posY = Math.floor((wallPixelHeight() - first.height) / 2);

  if (anim.rafId != null) {
    cancelAnimationFrame(anim.rafId);
  }

  const tick = (now) => {
    if (!anim.active) {
      anim.rafId = null;
      return;
    }

    const dt = Math.min(64, now - anim.lastTickMs);
    anim.lastTickMs = now;
    anim.frameTimerMs += dt;

    if (anim.frameTimerMs >= anim.frameDurationMs) {
      anim.frameTimerMs = 0;
      anim.frameIndex = (anim.frameIndex + 1) % anim.frames.length;
    }

    const frame = anim.frames[anim.frameIndex];
    const bob = anim.frameIndex % 2 === 0 ? 0 : -1;
    anim.posX = Math.floor((wallPixelWidth() - frame.width) / 2);
    anim.posY = Math.floor((wallPixelHeight() - frame.height) / 2) + bob;

    render();
    renderDemoInfo();
    anim.rafId = requestAnimationFrame(tick);
  };

  anim.rafId = requestAnimationFrame(tick);
}

function getPresetByKey(presetKey) {
  return DEMOS[presetKey] || DEMOS.mario;
}

async function loadPresetFrame(presetKey) {
  const preset = getPresetByKey(presetKey);

  try {
    resetAnimation();
    setStatus(`Loading ${preset.name}...`);

    if (preset.type === "animation") {
      createSolidFrame(preset.width, preset.height, preset.backgroundColor || "#101215", {
        label: `${preset.name} (character-only animation)`,
        imageUrl: null,
        sourcePage: preset.spritePage,
        presetKey,
        custom: false,
      });

      let frames = [];
      let usingFallback = false;

      if (preset.spriteUrl) {
        try {
          const spriteImage = await loadImageFromUrl(preset.spriteUrl);
          const spriteImageData = imageToImageData(spriteImage);
          frames = tryExtractRunFramesFromSheet(spriteImageData, preset.character);
        } catch (_err) {
          frames = [];
        }
      }

      if (frames.length < 2) {
        frames = createBuiltInRunFrames(preset.character);
        usingFallback = true;
      }

      startAnimation(preset.name, usingFallback ? null : preset.spriteUrl, preset.spritePage, frames);
      setStatus(
        usingFallback
          ? `Loaded ${preset.name} with local fallback frames. Animation is running.`
          : `Loaded ${preset.name} from sprite sheet. Animation is running.`
      );
    } else {
      const backgroundImage = await loadImageFromUrl(preset.imageUrl);
      createFrameFromImage(backgroundImage, {
        label: preset.name,
        imageUrl: preset.imageUrl,
        sourcePage: preset.sourcePage,
        presetKey,
        custom: false,
      });
      setStatus(`Loaded ${preset.name}. Drag on the wall to pan the sample window.`);
    }

    renderDemoInfo();
    render();
  } catch (err) {
    resetAnimation();
    setStatus(`Could not load preset. ${err.message} Try Load Real Screenshot for a static image.`);
  }
}

function toggleMaster(tileId) {
  const tile = getTileById(tileId);
  if (!tile) return;

  if (isTileLocked(tileId) && !state.wizard.active) {
    setStatus(`Tile ${tileId} is locked by the hardware wizard.`);
    return;
  }

  if (!tile.isMaster) {
    const current = state.tiles.filter((t) => t.isMaster).length;
    if (current >= state.expectedMasters) {
      setStatus(`You already have ${state.expectedMasters} masters. Increase Expected Masters to add more.`);
      return;
    }
  }

  tile.isMaster = !tile.isMaster;
  state.selectedTileId = tileId;
  setStatus(tile.isMaster ? `Tile ${tileId} set as master.` : `Tile ${tileId} is no longer a master.`);
  render();
  runValidation();
  saveMapAutosave();
}

function onTileClick(tileId) {
  const tile = getTileById(tileId);
  if (!tile) return;

  if (state.wizard.active && state.wizard.phase === "locate") {
    wizardSelectTileFromMap(tileId).catch((err) => {
      setWizardStatus(`Could not select tile ${tileId}: ${err.message}`);
    });
    return;
  }

  state.selectedTileId = tileId;
  setStatus(`Selected tile ${tileId}.`);

  render();
  runValidation();
  saveMapAutosave();
}

function getLayout() {
  const viewW = 980;
  const viewH = 720;
  const margin = 46;
  const gap = 0;

  const availW = viewW - margin * 2;
  const availH = viewH - margin * 2;
  const tileW = (availW - (state.cols - 1) * gap) / state.cols;
  const tileH = (availH - (state.rows - 1) * gap) / state.rows;
  const size = Math.max(16, Math.min(tileW, tileH));

  const gridW = state.cols * size + (state.cols - 1) * gap;
  const gridH = state.rows * size + (state.rows - 1) * gap;
  const originX = (viewW - gridW) / 2;
  const originY = (viewH - gridH) / 2;

  const positions = new Map();
  for (const tile of state.tiles) {
    const x = originX + (tile.col - 1) * (size + gap);
    const y = originY + (tile.row - 1) * (size + gap);
    positions.set(tile.id, { x, y, cx: x + size / 2, cy: y + size / 2 });
  }

  return { size, positions };
}

function makeSvgNode(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    node.setAttribute(name, String(value));
  }
  return node;
}

function getPixelColorAtSource(sourceX, sourceY) {
  if (!state.sourceFrame) return "#101215";
  if (sourceX < 0 || sourceY < 0 || sourceX >= state.sourceFrame.width || sourceY >= state.sourceFrame.height) {
    return "#101215";
  }

  const i = (sourceY * state.sourceFrame.width + sourceX) * 4;
  const data = state.sourceFrame.imageData.data;
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const a = data[i + 3] / 255;
  if (a <= 0) return "#101215";
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

function getAnimatedPixelColorAtWall(wallX, wallY) {
  const anim = state.animation;
  if (!anim.active || anim.frames.length === 0) return null;

  const frame = anim.frames[anim.frameIndex];
  const fx = wallX - Math.round(anim.posX);
  const fy = wallY - Math.round(anim.posY);

  if (fx < 0 || fy < 0 || fx >= frame.width || fy >= frame.height) return null;

  const i = (fy * frame.width + fx) * 4;
  const a = frame.data[i + 3] / 255;
  if (a < 0.1) return null;

  return `rgba(${frame.data[i]}, ${frame.data[i + 1]}, ${frame.data[i + 2]}, ${a.toFixed(3)})`;
}

// Returns a flat 64-element array of [r,g,b] triples for the 8x8 tile, with rotation applied.
function getTilePixelRgb(tileId) {
  const rot = state.tileRotations[tileId] || 0;
  const grid = TILE_PIXEL_GRID;
  const pixels = [];

  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      // Map output (x,y) back to source (sx,sy) by rotating inversely.
      let sx, sy;
      if (rot === 0)   { sx = x;           sy = y; }
      else if (rot === 90)  { sx = y;           sy = grid - 1 - x; }
      else if (rot === 180) { sx = grid - 1 - x; sy = grid - 1 - y; }
      else                  { sx = grid - 1 - y; sy = x; }

      const tile = getTileById(tileId);
      const wallX = (tile.col - 1) * grid + sx;
      const wallY = (tile.row - 1) * grid + sy;
      const sourceX = state.demoOffsetX + wallX;
      const sourceY = state.demoOffsetY + wallY;

      const animated = getAnimatedPixelColorAtWall(wallX, wallY);
      const cssColor = animated || getPixelColorAtSource(sourceX, sourceY);

      // Parse the css color string to r,g,b
      const m = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        pixels.push([Number(m[1]), Number(m[2]), Number(m[3])]);
      } else {
        const hex = cssColor.replace("#", "");
        const n = parseInt(hex.length === 3
          ? hex.split("").map((c) => c + c).join("")
          : hex, 16) || 0x101215;
        pixels.push([(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
      }
    }
  }
  return pixels;
}

// ── Twinkly HTTP API helpers ──────────────────────────────────────────────────

// All Twinkly requests are routed through the local CORS proxy (server.py).
// If the proxy is unavailable, fall back to direct fetch (works in non-CORS
// contexts, e.g. if the browser allows mixed-content local fetches).
async function twinklyFetch(ip, path, options = {}) {
  const deviceUrl = `http://${ip}${path}`;
  const proxyUrl = `/proxy?url=${encodeURIComponent(deviceUrl)}`;
  const fetchOnce = (url) => fetch(url, {
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body,
  });

  // Proxy-first: if proxy responds (even with error), use that result and do not
  // mask it by falling back to direct browser fetch.
  let proxyRes;
  try {
    proxyRes = await fetchOnce(proxyUrl);
  } catch (proxyErr) {
    const directRes = await fetchOnce(deviceUrl).catch((directErr) => {
      const pMsg = proxyErr && proxyErr.message ? proxyErr.message : String(proxyErr);
      const dMsg = directErr && directErr.message ? directErr.message : String(directErr);
      throw new Error(`Could not reach ${deviceUrl} (proxy fetch failed: ${pMsg} | direct fetch failed: ${dMsg})`);
    });
    if (directRes.ok || directRes.status === 200) return directRes;

    let directBody = "";
    try {
      directBody = (await directRes.text()).trim();
    } catch (_e) {
      directBody = "";
    }
    if (directBody.length > 180) directBody = `${directBody.slice(0, 180)}...`;
    throw new Error(
      `Could not reach ${deviceUrl} (proxy fetch failed: ${proxyErr.message || String(proxyErr)} | ` +
      `direct HTTP ${directRes.status} for ${path}${directBody ? ` - ${directBody}` : ""})`
    );
  }

  if (proxyRes.ok || proxyRes.status === 200) return proxyRes;

  let proxyBody = "";
  try {
    proxyBody = (await proxyRes.text()).trim();
  } catch (_e) {
    proxyBody = "";
  }
  if (proxyBody.length > 180) proxyBody = `${proxyBody.slice(0, 180)}...`;
  throw new Error(`proxy HTTP ${proxyRes.status} for ${path}${proxyBody ? ` - ${proxyBody}` : ""}`);
}

async function twinklyLogin(ip) {
  const body = { challenge: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))) };
  const res = await twinklyFetch(ip, "/xled/v1/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Login failed (${res.status})`);
  const json = await res.json();
  const token = json.authentication_token;
  const challengeResponse = json["challenge-response"];

  await twinklyFetch(ip, "/xled/v1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Auth-Token": token },
    body: JSON.stringify({ "challenge-response": challengeResponse }),
  });

  state.twinklyTokens[ip] = { token, expiresAt: Date.now() + 14 * 60 * 1000 };
  return token;
}

async function twinklyToken(ip) {
  const cached = state.twinklyTokens[ip];
  if (cached && cached.expiresAt > Date.now() + 5000) return cached.token;
  return twinklyLogin(ip);
}

async function twinklySetRtMode(ip, token) {
  await twinklyFetch(ip, "/xled/v1/led/mode", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Auth-Token": token },
    body: JSON.stringify({ mode: "rt" }),
  });
}

async function twinklyPushFrame(ip, token, rgbFrameBytes) {
  // HTTP RT frame is raw RGB bytes only — no version byte (that's UDP-only).
  await twinklyFetch(ip, "/xled/v1/led/rt/frame", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-Auth-Token": token },
    body: rgbFrameBytes,
  });
}

function setWizardStatus(message) {
  if (el.wizardStatus) {
    el.wizardStatus.textContent = message;
  }
}

function getWizardGroupCount() {
  return Array.isArray(state.wizard.segmentLedGroups) ? state.wizard.segmentLedGroups.length : 0;
}

function isWizardManualProbeMode() {
  return getWizardGroupCount() > MAX_TILES_PER_MASTER && state.wizard.currentSegment > 0;
}

function ensureWizardProbeIndexForCurrentSegment() {
  if (!isWizardManualProbeMode()) return;
  const groupCount = getWizardGroupCount();
  const seg = state.wizard.currentSegment;
  const resolved = state.wizard.segmentResolvedGroupIndex?.[seg];
  if (Number.isInteger(resolved) && resolved >= 0 && resolved < groupCount) {
    state.wizard.currentProbeGroupIndex = resolved;
    return;
  }

  const isSelectable = (idx) => {
    if (!Number.isInteger(idx) || idx < 0 || idx >= groupCount) return false;
    if (idx === 0) return false; // Group 1 is consistently master; skip for slave selection.
    for (const [segKey, segVal] of Object.entries(state.wizard.segmentResolvedGroupIndex || {})) {
      const mappedSeg = Number(segKey);
      if (!Number.isInteger(mappedSeg) || mappedSeg === seg) continue;
      if (Number(segVal) === idx) return false;
    }
    return true;
  };

  const pickNext = (start, delta) => {
    if (groupCount <= 1) return null;
    let idx = ((start % groupCount) + groupCount) % groupCount;
    for (let i = 0; i < groupCount; i += 1) {
      if (isSelectable(idx)) return idx;
      idx = ((idx + delta) % groupCount + groupCount) % groupCount;
    }
    return null;
  };

  if (
    Number.isInteger(state.wizard.currentProbeGroupIndex)
    && isSelectable(state.wizard.currentProbeGroupIndex)
  ) {
    return;
  }

  const startFrom = Number.isInteger(state.wizard.probeCursor)
    ? state.wizard.probeCursor
    : 1;
  const next = pickNext(startFrom, 1);
  state.wizard.currentProbeGroupIndex = Number.isInteger(next) ? next : null;
}

function renderWizardGroupBadge() {
  if (!el.wizardGroupBadge) return;
  const inLocate = state.wizard.active && state.wizard.phase === "locate";
  const manual = inLocate && isWizardManualProbeMode();

  if (!manual) {
    el.wizardGroupBadge.textContent = "Group: n/a";
    el.wizardGroupBadge.classList.remove("active");
    el.wizardGroupBadge.classList.remove("warn");
    return;
  }

  const total = getWizardGroupCount();
  const current = Number.isInteger(state.wizard.currentProbeGroupIndex)
    ? (state.wizard.currentProbeGroupIndex + 1)
    : 0;
  const resolved = state.wizard.segmentResolvedGroupIndex?.[state.wizard.currentSegment];
  const selected = Number.isInteger(resolved) ? (resolved + 1) : 0;
  const selectedText = selected ? String(selected) : "none";
  el.wizardGroupBadge.textContent = `Group ${current || "?"}/${total} | Selected ${selectedText}`;
  el.wizardGroupBadge.classList.add("active");
  const mismatch = selected > 0 && current > 0 && selected !== current;
  if (mismatch) el.wizardGroupBadge.classList.add("warn");
  else el.wizardGroupBadge.classList.remove("warn");
}

function updateWizardControlStates() {
  const active = state.wizard.active;
  const inLocate = active && state.wizard.phase === "locate";
  const inOrient = active && state.wizard.phase === "orient";
  const hasQueue = state.wizard.queueIps.length > 0;
  const manualProbe = inLocate && isWizardManualProbeMode();

  if (el.btnWizardRotateLeft) el.btnWizardRotateLeft.disabled = !inOrient;
  if (el.btnWizardRotateRight) el.btnWizardRotateRight.disabled = !inOrient;
  if (el.btnWizardConfirmTile) el.btnWizardConfirmTile.disabled = !inOrient;
  if (el.btnWizardSkipSegment) el.btnWizardSkipSegment.disabled = !inLocate;
  if (el.btnWizardGroupPrev) el.btnWizardGroupPrev.disabled = !manualProbe;
  if (el.btnWizardGroupNext) el.btnWizardGroupNext.disabled = !manualProbe;
  if (el.btnWizardGroupSelect) el.btnWizardGroupSelect.disabled = !manualProbe;

  if (el.btnWizardStartDevice) {
    const hasIp = Boolean((el.wizardDeviceSelect?.value || state.wizard.selectedIp || "").trim());
    el.btnWizardStartDevice.disabled = !hasIp;
  }

  if (el.btnWizardUnlockTile) {
    const selectedId = state.selectedTileId;
    el.btnWizardUnlockTile.disabled = !Number.isInteger(selectedId) || !isTileLocked(selectedId);
  }

  if (el.btnWizardUnlockAll) {
    el.btnWizardUnlockAll.disabled = Object.keys(state.wizard.lockedTiles || {}).length === 0;
  }

  if (el.btnWizardReplay) {
    const currentIp = state.wizard.currentIp || state.wizard.selectedIp || "";
    const replayable = (state.wizard.assignments || []).some((a) => !currentIp || a.ip === currentIp);
    el.btnWizardReplay.disabled = !replayable;
  }

  if (el.btnWizardNextDevice) el.btnWizardNextDevice.disabled = !hasQueue;
  if (el.btnWizardCancel) el.btnWizardCancel.disabled = !active;
  renderWizardGroupBadge();
  updateGeneralButtonStates();
}

function updateGeneralButtonStates() {
  const selectedTile = Number.isInteger(state.selectedTileId) ? getTileById(state.selectedTileId) : null;
  const selectedMasterHasIp = Boolean(selectedTile?.isMaster && state.masterIPs[selectedTile.id]);
  const mastersWithIp = state.tiles.filter((t) => t.isMaster && state.masterIPs[t.id]).length;

  if (el.btnQueryMaster) el.btnQueryMaster.disabled = !selectedMasterHasIp;
  if (el.btnPushHardware) el.btnPushHardware.disabled = mastersWithIp === 0;
  if (el.btnToggleLivePush) {
    el.btnToggleLivePush.disabled = !state.livePushActive && mastersWithIp === 0;
  }

  if (el.btnResize) {
    const rows = Number(el.rowsInput?.value);
    const cols = Number(el.colsInput?.value);
    const expectedMasters = Number(el.mastersInput?.value);
    const validRowsCols = Number.isInteger(rows) && Number.isInteger(cols) && rows >= 1 && cols >= 1 && rows <= 20 && cols <= 20;
    const validMasters = Number.isInteger(expectedMasters) && expectedMasters >= 1 && expectedMasters <= 10;
    el.btnResize.disabled = !(validRowsCols && validMasters);
  }

  if (el.btnCharSearch) {
    el.btnCharSearch.disabled = !(el.charSearchInput?.value || "").trim();
  }

  const hasSheet = Boolean(state.characters.sheetImageData);
  if (el.btnDetectNow) el.btnDetectNow.disabled = !hasSheet;
  if (el.btnDetectSweep) el.btnDetectSweep.disabled = !hasSheet;
  if (el.btnSaveCharacterJson) el.btnSaveCharacterJson.disabled = !state.characters.sheetDataUrl;

  if (el.btnCreateAction) {
    el.btnCreateAction.disabled = !(el.actionNameInput?.value || "").trim();
  }
}

function getWizardOverrideTileCountForIp(ip) {
  const v = Number(state.wizard.tileCountOverrides[ip]);
  if (!Number.isInteger(v) || v < 1 || v > MAX_TILES_PER_MASTER) return null;
  return v;
}

function updateWizardOverrideInputForSelection() {
  if (!el.wizardTileCountOverride) return;
  const ip = (el.wizardDeviceSelect?.value || state.wizard.selectedIp || "").trim();
  if (!ip) {
    el.wizardTileCountOverride.value = "";
    return;
  }
  const override = getWizardOverrideTileCountForIp(ip);
  el.wizardTileCountOverride.value = override ? String(override) : "";
}

function inferSegmentsFromLedCount(ip, ledCountRaw) {
  const overrideTiles = getWizardOverrideTileCountForIp(ip);
  if (overrideTiles) {
    return {
      segments: overrideTiles,
      effectiveLedCount: overrideTiles * LEDS_PER_TILE,
      reason: `using override ${overrideTiles} tile(s)`,
    };
  }

  const raw = Number(ledCountRaw || 0);
  const inferred = raw > 0 ? Math.max(1, Math.round(raw / LEDS_PER_TILE)) : 1;

  if (inferred > MAX_TILES_PER_MASTER) {
    const fallback = 6;
    return {
      segments: fallback,
      effectiveLedCount: fallback * LEDS_PER_TILE,
      reason: `raw ${raw} LEDs looked implausible (${inferred} tiles), defaulted to ${fallback} tiles`,
    };
  }

  return {
    segments: inferred,
    effectiveLedCount: inferred * LEDS_PER_TILE,
    reason: `from raw ${raw} LEDs`,
  };
}

function stopWizardRedBlink() {
  if (state.wizard.blinkTimerId != null) {
    clearTimeout(state.wizard.blinkTimerId);
    state.wizard.blinkTimerId = null;
  }
  state.wizard.blinkOn = false;
  state.wizard.blinkInFlight = false;
  updateWizardControlStates();
}

function renderWizardProgressTable() {
  if (!el.wizardProgressBody) return;
  el.wizardProgressBody.innerHTML = "";

  const rows = state.wizard.assignments
    .slice()
    .sort((a, b) => (a.ip.localeCompare(b.ip) || a.segment - b.segment));

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "wizard-progress-empty";
    td.textContent = "No mapped segments yet.";
    tr.appendChild(td);
    el.wizardProgressBody.appendChild(tr);
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");
    const lock = state.wizard.lockedTiles[String(row.tileId)];
    const rotation = Number.isFinite(lock?.rotation)
      ? lock.rotation
      : (state.tileRotations[row.tileId] || 0);

    const cells = [
      row.ip,
      String(row.segment),
      row.role,
      String(row.tileId),
      `${rotation}°`,
    ];

    for (const value of cells) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    }

    el.wizardProgressBody.appendChild(tr);
  }
}

function updateWizardDeviceSelect() {
  if (!el.wizardDeviceSelect) return;
  el.wizardDeviceSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = state.discoveredDevices.length
    ? "Select discovered device..."
    : "No discovered devices";
  el.wizardDeviceSelect.appendChild(placeholder);

  for (const dev of state.discoveredDevices) {
    const opt = document.createElement("option");
    opt.value = dev.ip;
    const ledsText = dev.leds ? ` (${dev.leds} LEDs)` : "";
    opt.textContent = `${dev.name || "Twinkly"} - ${dev.ip}${ledsText}`;
    el.wizardDeviceSelect.appendChild(opt);
  }

  if (state.wizard.selectedIp) {
    el.wizardDeviceSelect.value = state.wizard.selectedIp;
  }
  updateWizardOverrideInputForSelection();
  updateWizardControlStates();
}

function rotatePatternCoord(x, y, rot) {
  if (rot === 0) return [x, y];
  if (rot === 90) return [y, TILE_PIXEL_GRID - 1 - x];
  if (rot === 180) return [TILE_PIXEL_GRID - 1 - x, TILE_PIXEL_GRID - 1 - y];
  return [TILE_PIXEL_GRID - 1 - y, x];
}

function tileCoordToLedIndex(x, y) {
  // Twinkly Squares report LEDs in a column-serpentine order.
  return x * TILE_PIXEL_GRID + (x % 2 === 0 ? y : (TILE_PIXEL_GRID - 1 - y));
}

function extractLayoutCoordinates(layoutData) {
  const out = [];
  const seen = new Set();

  const pushPoint = (idxCandidate, xCandidate, yCandidate) => {
    const x = Number(xCandidate);
    const y = Number(yCandidate);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    let idx = Number(idxCandidate);
    if (!Number.isInteger(idx) || idx < 0) {
      idx = out.length;
      while (seen.has(idx)) idx += 1;
    }
    if (seen.has(idx)) return;

    seen.add(idx);
    out.push({ idx, x, y });
  };

  const parseArray = (arr) => {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i += 1) {
      const p = arr[i];
      if (Array.isArray(p) && p.length >= 2) {
        pushPoint(i, p[0], p[1]);
        continue;
      }
      if (!p || typeof p !== "object") continue;

      const idx = p.index ?? p.idx ?? p.led ?? p.led_index ?? p.id ?? i;
      if (Array.isArray(p.pos) && p.pos.length >= 2) {
        pushPoint(idx, p.pos[0], p.pos[1]);
        continue;
      }
      if (Array.isArray(p.coord) && p.coord.length >= 2) {
        pushPoint(idx, p.coord[0], p.coord[1]);
        continue;
      }
      pushPoint(idx, p.x ?? p.X, p.y ?? p.Y);
    }
  };

  const parseObjectMap = (obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    for (const [k, v] of Object.entries(obj)) {
      const keyIdx = Number(k);
      const idx = Number.isInteger(keyIdx) && keyIdx >= 0 ? keyIdx : undefined;

      if (Array.isArray(v) && v.length >= 2) {
        pushPoint(idx, v[0], v[1]);
        continue;
      }
      if (!v || typeof v !== "object") continue;

      if (Array.isArray(v.pos) && v.pos.length >= 2) {
        pushPoint(v.index ?? v.idx ?? v.led ?? v.led_index ?? v.id ?? idx, v.pos[0], v.pos[1]);
        continue;
      }
      if (Array.isArray(v.coord) && v.coord.length >= 2) {
        pushPoint(v.index ?? v.idx ?? v.led ?? v.led_index ?? v.id ?? idx, v.coord[0], v.coord[1]);
        continue;
      }

      pushPoint(v.index ?? v.idx ?? v.led ?? v.led_index ?? v.id ?? idx, v.x ?? v.X, v.y ?? v.Y);
    }
  };

  if (Array.isArray(layoutData)) {
    parseArray(layoutData);
  } else if (layoutData && typeof layoutData === "object") {
    parseArray(layoutData.coordinates);
    parseArray(layoutData.coordinates_2d);
    parseArray(layoutData.layout);
    parseArray(layoutData.leds);
    parseArray(layoutData.points);
    if (out.length === 0 && Array.isArray(layoutData.coords)) parseArray(layoutData.coords);

    parseObjectMap(layoutData.coordinates);
    parseObjectMap(layoutData.coordinates_2d);
    parseObjectMap(layoutData.layout);
    parseObjectMap(layoutData.leds);
    parseObjectMap(layoutData.points);
    parseObjectMap(layoutData.coords);
    parseObjectMap(layoutData.map);
    parseObjectMap(layoutData.pixel_map);
    parseObjectMap(layoutData.led_map);

    // Some payloads store coordinates under an arbitrary object key.
    if (out.length === 0) {
      for (const value of Object.values(layoutData)) {
        parseArray(value);
        parseObjectMap(value);
      }
    }
  }

  out.sort((a, b) => a.idx - b.idx);
  return out;
}

function buildSegmentGroupsFromLayout(layoutData) {
  const points = extractLayoutCoordinates(layoutData);
  if (points.length < LEDS_PER_TILE) return [];

  const uniqueX = Array.from(new Set(points.map((p) => p.x))).sort((a, b) => a - b);
  const uniqueY = Array.from(new Set(points.map((p) => p.y))).sort((a, b) => a - b);
  if (!uniqueX.length || !uniqueY.length) return [];

  const rankX = new Map(uniqueX.map((v, i) => [v, i]));
  const rankY = new Map(uniqueY.map((v, i) => [v, i]));
  const byPanel = new Map();

  for (const p of points) {
    const rx = rankX.get(p.x);
    const ry = rankY.get(p.y);
    if (!Number.isInteger(rx) || !Number.isInteger(ry)) continue;

    const panelX = Math.floor(rx / TILE_PIXEL_GRID);
    const panelY = Math.floor(ry / TILE_PIXEL_GRID);
    const localX = rx % TILE_PIXEL_GRID;
    const localY = ry % TILE_PIXEL_GRID;
    const key = `${panelY},${panelX}`;
    if (!byPanel.has(key)) byPanel.set(key, []);
    byPanel.get(key).push({
      idx: p.idx,
      panelX,
      panelY,
      localX,
      localY,
    });
  }

  const panelGroups = [];
  const panelKeys = Array.from(byPanel.keys()).sort((a, b) => {
    const [ay, ax] = a.split(",").map(Number);
    const [by, bx] = b.split(",").map(Number);
    return ay - by || ax - bx;
  });

  for (const key of panelKeys) {
    const panelPoints = byPanel.get(key);
    const byLocal = new Map();
    for (const p of panelPoints) {
      const localKey = `${p.localX},${p.localY}`;
      if (!byLocal.has(localKey)) byLocal.set(localKey, p.idx);
    }

    const ordered = [];
    for (let y = 0; y < TILE_PIXEL_GRID; y += 1) {
      for (let x = 0; x < TILE_PIXEL_GRID; x += 1) {
        const localKey = `${x},${y}`;
        const idx = byLocal.get(localKey);
        if (!Number.isInteger(idx)) continue;
        ordered[tileCoordToLedIndex(x, y)] = idx;
      }
    }

    const compact = ordered.filter((v) => Number.isInteger(v));
    if (compact.length === LEDS_PER_TILE) panelGroups.push(compact);
  }

  const chunkIntoGroups = (indices) => {
    const out = [];
    for (let i = 0; i + LEDS_PER_TILE <= indices.length; i += LEDS_PER_TILE) {
      const chunk = indices.slice(i, i + LEDS_PER_TILE);
      if (chunk.length === LEDS_PER_TILE) out.push(chunk);
    }
    return out;
  };

  const indexOrdered = points
    .map((p) => Number(p.idx))
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b);
  const indexGroups = chunkIntoGroups(indexOrdered);

  const spatialOrdered = points
    .slice()
    .sort((a, b) => {
      const ay = rankY.get(a.y) ?? 0;
      const by = rankY.get(b.y) ?? 0;
      const ax = rankX.get(a.x) ?? 0;
      const bx = rankX.get(b.x) ?? 0;
      return ay - by || ax - bx;
    })
    .map((p) => Number(p.idx))
    .filter((n) => Number.isInteger(n) && n >= 0);
  const spatialGroups = chunkIntoGroups(spatialOrdered);

  const candidates = [panelGroups, spatialGroups, indexGroups];
  let best = [];
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || !candidate.length) continue;

    const count = candidate.length;
    const plausible = count >= 1 && count <= MAX_TILES_PER_MASTER;

    // Strongly prefer physically plausible tile counts for one master.
    // Oversized counts are usually synthetic chunking from dense index maps.
    const score = plausible ? (1000 + count) : count;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function buildSegmentGroupsFromLedConfig(configData) {
  const extractEntries = (value) => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];
    return Object.values(value);
  };

  const tryCollections = [];
  if (configData && typeof configData === "object") {
    tryCollections.push(configData.strings);
    tryCollections.push(configData.segments);
    tryCollections.push(configData.strips);
    tryCollections.push(configData.channels);
    tryCollections.push(configData.leds);
  }

  const groups = [];
  for (const collection of tryCollections) {
    const entries = extractEntries(collection);
    for (const e of entries) {
      if (!e || typeof e !== "object") continue;
      const start = Number(
        e.first_led_id
        ?? e.first_led
        ?? e.start_led
        ?? e.start
        ?? e.offset
        ?? e.led_offset
      );
      const len = Number(
        e.num_leds
        ?? e.length
        ?? e.leds_count
        ?? e.count
        ?? e.size
      );
      if (!Number.isInteger(start) || start < 0 || !Number.isInteger(len) || len < LEDS_PER_TILE) continue;

      for (let offset = 0; offset + LEDS_PER_TILE <= len; offset += LEDS_PER_TILE) {
        const base = start + offset;
        const segment = [];
        for (let i = 0; i < LEDS_PER_TILE; i += 1) segment.push(base + i);
        groups.push(segment);
      }
    }
  }

  groups.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  return groups;
}

async function fetchWizardSegmentGroups(ip) {
  const token = await twinklyToken(ip);
  const paths = ["/xled/v1/led/layout/full", "/xled/v1/led/layout", "/xled/v1/led/config"];
  let best = { groups: [], source: "fallback" };
  let bestScore = -Infinity;

  const consider = (groups, source) => {
    if (!Array.isArray(groups) || !groups.length) return;
    const count = groups.length;
    const plausible = count >= 1 && count <= MAX_TILES_PER_MASTER;
    const score = plausible ? (1000 + count) : count;
    if (score > bestScore) {
      bestScore = score;
      best = { groups, source };
    }
  };

  for (const path of paths) {
    try {
      const res = await twinklyFetch(ip, path, {
        headers: { "X-Auth-Token": token },
      });
      if (!res.ok) continue;

      const json = await res.json();
      consider(buildSegmentGroupsFromLayout(json), path.includes("layout/full") ? "layout-full" : (path.includes("layout") ? "layout" : "config-layout"));
      consider(buildSegmentGroupsFromLedConfig(json), "config");
    } catch (_e) {
      // Keep trying alternate endpoints; fallback logic handles empty groups.
    }
  }

  return best;
}

function getWizardSegmentIndices(segment, transportLedCount, activeLedCount) {
  if (!Number.isInteger(segment) || segment < 0) return [];
  const transportMax = Number(transportLedCount || 0);
  const contiguousMax = Math.min(transportMax, Number(activeLedCount || 0));
  if (transportMax <= 0) return [];

  const groups = state.wizard.segmentLedGroups;
  const inProbeMode = Array.isArray(groups) && groups.length > MAX_TILES_PER_MASTER && segment > 0;
  let groupIndex = segment;
  if (inProbeMode) {
    const resolved = state.wizard.segmentResolvedGroupIndex?.[segment];
    if (Number.isInteger(resolved) && resolved >= 0 && resolved < groups.length) {
      groupIndex = resolved;
    } else if (
      Number.isInteger(state.wizard.currentProbeGroupIndex)
      && state.wizard.currentProbeGroupIndex >= 0
      && state.wizard.currentProbeGroupIndex < groups.length
      && segment === state.wizard.currentSegment
    ) {
      groupIndex = state.wizard.currentProbeGroupIndex;
    }
  }

  const fromLayout = Array.isArray(groups) && Array.isArray(groups[groupIndex]) ? groups[groupIndex] : null;
  if (fromLayout) {
    const seen = new Set();
    const mapped = [];
    for (const n of fromLayout) {
      const idx = Number(n);
      if (!Number.isInteger(idx) || idx < 0 || idx >= transportMax || seen.has(idx)) continue;
      seen.add(idx);
      mapped.push(idx);
      if (mapped.length >= LEDS_PER_TILE) break;
    }
    if (mapped.length) return mapped;
  }

  if (contiguousMax <= 0) return [];
  const start = segment * LEDS_PER_TILE;
  if (start >= contiguousMax) return [];
  const contiguous = [];
  for (let i = 0; i < LEDS_PER_TILE; i += 1) {
    const idx = start + i;
    if (idx >= contiguousMax) break;
    contiguous.push(idx);
  }
  return contiguous;
}

function buildSegmentPatternPixels(pattern, rotation = 0) {
  const pixels = Array.from({ length: LEDS_PER_TILE }, () => [0, 0, 0]);
  for (let y = 0; y < TILE_PIXEL_GRID; y += 1) {
    for (let x = 0; x < TILE_PIXEL_GRID; x += 1) {
      let rgb = [0, 0, 0];
      if (pattern === "off") {
        rgb = [0, 0, 0];
      } else if (pattern === "red") {
        rgb = [255, 0, 0];
      } else if (pattern === "green") {
        rgb = [0, 220, 0];
      } else {
        const [sx, sy] = rotatePatternCoord(x, y, rotation);
        rgb = sy < 2 ? [255, 210, 0] : [0, 0, 0];
      }

      const ledIndex = tileCoordToLedIndex(x, y);
      pixels[ledIndex] = rgb;
    }
  }
  return pixels;
}

async function queryLedCountForIp(ip) {
  const res = await twinklyFetch(ip, "/xled/v1/gestalt");
  if (!res.ok) throw new Error(`gestalt failed (${res.status})`);
  const json = await res.json();
  return Number(json.number_of_led || 0);
}

async function pushWizardSegmentPattern(pattern, rotation = 0) {
  const ip = state.wizard.currentIp;
  if (!ip) throw new Error("No active wizard device.");
  let maxLayoutLedIndex = -1;
  const groups = Array.isArray(state.wizard.segmentLedGroups) ? state.wizard.segmentLedGroups : [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const idx of group) {
      const n = Number(idx);
      if (Number.isInteger(n) && n > maxLayoutLedIndex) maxLayoutLedIndex = n;
    }
  }

  const layoutTransportMin = maxLayoutLedIndex >= 0 ? (maxLayoutLedIndex + 1) : 0;
  const expectedSegmentLeds = Math.max(1, Number(state.wizard.totalSegments || 0)) * LEDS_PER_TILE;
  const inferredTransportMin = Math.max(
    LEDS_PER_TILE,
    Number(state.wizard.ledCount || 0),
    expectedSegmentLeds,
    layoutTransportMin
  );
  const transportLedCount = Math.max(Number(state.wizard.rawLedCount || 0), inferredTransportMin);
  const activeLedCount = state.wizard.ledCount || transportLedCount;
  const segment = state.wizard.currentSegment;
  const frameBytes = new Uint8Array(transportLedCount * 3);
  const currentIndices = getWizardSegmentIndices(segment, transportLedCount, activeLedCount);

  for (const assignment of state.wizard.assignments) {
    if (assignment.ip !== ip) continue;
    if (!Number.isInteger(assignment.segment) || assignment.segment >= segment) continue;

    const confirmedIndices = getWizardSegmentIndices(assignment.segment, transportLedCount, activeLedCount);
    for (const ledIndex of confirmedIndices) {
      const base = ledIndex * 3;
      frameBytes[base] = 0;
      frameBytes[base + 1] = 220;
      frameBytes[base + 2] = 0;
    }
  }

  if (currentIndices.length) {
    const pixels = buildSegmentPatternPixels(pattern, rotation);
    for (let i = 0; i < currentIndices.length; i += 1) {
      const ledIndex = currentIndices[i];
      const base = ledIndex * 3;
      const [r, g, b] = pixels[i] || [0, 0, 0];
      frameBytes[base] = r;
      frameBytes[base + 1] = g;
      frameBytes[base + 2] = b;
    }
  }

  const token = await twinklyToken(ip);
  await twinklySetRtMode(ip, token);
  await twinklyPushFrame(ip, token, frameBytes);
}

function startWizardRedBlink() {
  if (!state.wizard.active) return;
  stopWizardRedBlink();
  let failureCount = 0;

  const tick = async () => {
    if (!state.wizard.active || state.wizard.phase !== "locate") {
      state.wizard.blinkTimerId = null;
      return;
    }

    if (!state.wizard.blinkInFlight) {
      state.wizard.blinkInFlight = true;
      try {
        state.wizard.blinkOn = !state.wizard.blinkOn;
        await pushWizardSegmentPattern(state.wizard.blinkOn ? "red" : "off", 0);
        failureCount = 0;
      } catch (err) {
        failureCount += 1;
        const msg = err && err.message ? err.message : String(err);
        const hardNetworkFailure = /timed out|could not reach|networkerror|failed to fetch|proxy http 50/i.test(msg);
        if (hardNetworkFailure || failureCount >= 2) {
          stopWizardRedBlink();
          setWizardStatus(
            `Blink push failed on ${state.wizard.currentIp}: ${msg}. ` +
            "Check device power/Wi-Fi and that server.py can reach that IP, then click Start Mapping Selected again."
          );
          return;
        }
        setWizardStatus(`Blink push failed on ${state.wizard.currentIp}: ${msg}`);
      } finally {
        state.wizard.blinkInFlight = false;
      }
    }

    state.wizard.blinkTimerId = setTimeout(tick, 500);
  };

  tick();
  updateWizardControlStates();
}

function currentWizardRoleLabel() {
  return state.wizard.currentSegment === 0 ? "master" : `slave ${state.wizard.currentSegment}`;
}

function buildWizardLocateStatus() {
  const role = currentWizardRoleLabel();
  const total = state.wizard.totalSegments;
  const debugTransport = Math.max(
    Number(state.wizard.rawLedCount || 0),
    Number(state.wizard.ledCount || 0),
    Math.max(1, Number(state.wizard.totalSegments || 0)) * LEDS_PER_TILE
  );
  const debugIndices = getWizardSegmentIndices(state.wizard.currentSegment, debugTransport, state.wizard.ledCount || debugTransport);
  const firstIdx = debugIndices.length ? debugIndices[0] : "none";
  const lastIdx = debugIndices.length ? debugIndices[debugIndices.length - 1] : "none";
  const groupCount = getWizardGroupCount();
  const probeTag = (isWizardManualProbeMode() && Number.isInteger(state.wizard.currentProbeGroupIndex))
    ? ` probe:${state.wizard.currentProbeGroupIndex + 1}/${groupCount}`
    : "";
  const hasLayoutGroup = Array.isArray(state.wizard.segmentLedGroups)
    && Array.isArray(state.wizard.segmentLedGroups[state.wizard.currentSegment])
    && state.wizard.segmentLedGroups[state.wizard.currentSegment].length > 0;
  const mapMode = hasLayoutGroup ? (state.wizard.segmentGroupSource || "layout") : "fallback";
  const reportedLedCount = Number(state.wizard.reportedLedCount || 0);
  const segmentStart = state.wizard.currentSegment * LEDS_PER_TILE;
  const exceedsReported = reportedLedCount > 0 && segmentStart >= reportedLedCount;
  const reportedSuffix = exceedsReported
    ? ` WARNING: device reports ${reportedLedCount} LEDs (~${Math.floor(reportedLedCount / LEDS_PER_TILE)} tile(s)), so this segment may not light until remaining tiles are paired to this master.`
    : "";
  const manualProbeHint = isWizardManualProbeMode()
    ? " Use Group Prev/Next to find the lit tile, then Select Group, then click its map tile."
    : "";
  return (
    `Segment ${state.wizard.currentSegment + 1}/${total} (${role}) is blinking RED. Click its map tile location. ` +
    `[LEDs:${debugIndices.length} ${firstIdx}-${lastIdx} mode:${mapMode} groups:${groupCount}${probeTag} reported:${reportedLedCount || "n/a"}]` +
    reportedSuffix +
    manualProbeHint
  );
}

async function wizardStepProbeGroup(delta) {
  if (!state.wizard.active || state.wizard.phase !== "locate") return;
  if (!isWizardManualProbeMode()) {
    setWizardStatus("Group stepping is only needed for slave segments when many candidate groups are exposed.");
    return;
  }
  const groupCount = getWizardGroupCount();
  if (!groupCount) return;
  ensureWizardProbeIndexForCurrentSegment();
  const seg = state.wizard.currentSegment;
  const isSelectable = (idx) => {
    if (!Number.isInteger(idx) || idx < 0 || idx >= groupCount) return false;
    if (idx === 0) return false;
    for (const [segKey, segVal] of Object.entries(state.wizard.segmentResolvedGroupIndex || {})) {
      const mappedSeg = Number(segKey);
      if (!Number.isInteger(mappedSeg) || mappedSeg === seg) continue;
      if (Number(segVal) === idx) return false;
    }
    return true;
  };

  const step = delta >= 0 ? 1 : -1;
  let cursor = Number.isInteger(state.wizard.currentProbeGroupIndex)
    ? state.wizard.currentProbeGroupIndex
    : (step > 0 ? 1 : groupCount - 1);
  let next = null;
  for (let i = 0; i < groupCount; i += 1) {
    cursor = ((cursor + step) % groupCount + groupCount) % groupCount;
    if (isSelectable(cursor)) {
      next = cursor;
      break;
    }
  }
  if (!Number.isInteger(next)) {
    setWizardStatus("No available groups left for this slave segment.");
    renderWizardGroupBadge();
    updateWizardControlStates();
    return;
  }
  state.wizard.currentProbeGroupIndex = next;
  state.wizard.blinkOn = true;
  await pushWizardSegmentPattern("red", 0);
  setWizardStatus(buildWizardLocateStatus());
  renderWizardGroupBadge();
  updateWizardControlStates();
}

function wizardSelectCurrentProbeGroup() {
  if (!state.wizard.active || state.wizard.phase !== "locate") return;
  if (!isWizardManualProbeMode()) {
    setWizardStatus("Select Group is only needed for slave segments when many candidate groups are exposed.");
    return;
  }
  const idx = state.wizard.currentProbeGroupIndex;
  const groups = state.wizard.segmentLedGroups;
  if (!Number.isInteger(idx) || idx < 0 || idx >= groups.length) {
    setWizardStatus("Choose a group first with Group Prev/Next.");
    return;
  }
  state.wizard.segmentResolvedGroupIndex[state.wizard.currentSegment] = idx;
  state.wizard.probeCursor = idx + 1;
  setWizardStatus(`Group ${idx + 1}/${groups.length} selected for this segment. Now click its map tile location.`);
  renderWizardGroupBadge();
  updateWizardControlStates();
}

async function wizardBlinkRed() {
  if (!state.wizard.active) {
    setWizardStatus("Start mapping a selected device first.");
    return;
  }
  state.wizard.phase = "locate";
  ensureWizardProbeIndexForCurrentSegment();
  startWizardRedBlink();
  setWizardStatus(buildWizardLocateStatus());
  updateWizardControlStates();
}

async function wizardShowYellow() {
  if (!state.wizard.active) return;
  if (state.selectedTileId == null) {
    setWizardStatus("Select a map tile first.");
    return;
  }
  stopWizardRedBlink();
  const rot = state.tileRotations[state.selectedTileId] || 0;
  await pushWizardSegmentPattern("yellow", rot);
  state.wizard.phase = "orient";
  state.wizard.yellowShown = true;
  setWizardStatus("Yellow orientation shown. Rotate left/right until the two yellow rows are UP, then Confirm Orientation.");
  updateWizardControlStates();
}

async function wizardSelectTileFromMap(tileId) {
  if (!state.wizard.active || state.wizard.phase !== "locate") return;

  const tile = getTileById(tileId);
  if (!tile) return;

  const locked = state.wizard.lockedTiles[String(tile.id)];
  const lockOwner = locked && (locked.ip !== state.wizard.currentIp || locked.segment !== state.wizard.currentSegment);
  if (lockOwner) {
    setWizardStatus(`Tile ${tile.id} is locked by ${locked.ip} segment ${locked.segment}.`);
    return;
  }

  if (isWizardManualProbeMode()) {
    const resolved = state.wizard.segmentResolvedGroupIndex?.[state.wizard.currentSegment];
    if (!Number.isInteger(resolved)) {
      setWizardStatus("Use Group Prev/Next and Select Group before choosing the tile location for this slave.");
      return;
    }
  }

  state.selectedTileId = tile.id;

  if (state.wizard.currentSegment === 0) {
    tile.isMaster = true;
    state.masterIPs[tile.id] = state.wizard.currentIp;
  }

  render();
  renderTileDetails();
  saveMapAutosave();

  await wizardShowYellow();
}

async function wizardRotate(delta) {
  if (!state.wizard.active) return;
  if (state.selectedTileId == null) {
    setWizardStatus("Select a tile to rotate.");
    return;
  }
  const id = state.selectedTileId;
  const cur = state.tileRotations[id] || 0;
  const next = (cur + delta + 360) % 360;
  state.tileRotations[id] = next;
  renderTileDetails();
  render();
  saveMapAutosave();

  if (state.wizard.phase === "orient") {
    await pushWizardSegmentPattern("yellow", next);
    setWizardStatus(`Tile ${id} rotated to ${next}°. Adjust until yellow rows point UP, then Confirm Orientation.`);
  }
  updateWizardControlStates();
}

function recordWizardAssignment(ip, segment, tileId, role) {
  const key = `${ip}|${segment}`;
  const existingIdx = state.wizard.assignments.findIndex((a) => `${a.ip}|${a.segment}` === key);
  const next = { ip, segment, tileId, role };
  if (existingIdx >= 0) state.wizard.assignments[existingIdx] = next;
  else state.wizard.assignments.push(next);
  renderWizardProgressTable();
}

function removeWizardAssignmentByTile(tileId) {
  const before = state.wizard.assignments.length;
  state.wizard.assignments = state.wizard.assignments.filter((a) => a.tileId !== tileId);
  if (state.wizard.assignments.length !== before) {
    renderWizardProgressTable();
  }
}

function unlockSelectedWizardTile() {
  const tileId = state.selectedTileId;
  if (tileId == null) {
    setWizardStatus("Select a tile first, then unlock it.");
    return;
  }
  if (!isTileLocked(tileId)) {
    setWizardStatus(`Tile ${tileId} is not locked.`);
    return;
  }
  delete state.wizard.lockedTiles[String(tileId)];
  removeWizardAssignmentByTile(tileId);
  renderTileDetails();
  render();
  saveMapAutosave();
  setWizardStatus(`Unlocked tile ${tileId}.`);
  updateWizardControlStates();
}

function unlockAllWizardTiles() {
  state.wizard.lockedTiles = {};
  state.wizard.assignments = [];
  renderWizardProgressTable();
  renderTileDetails();
  render();
  saveMapAutosave();
  setWizardStatus("All wizard tile locks cleared.");
  updateWizardControlStates();
}

async function replayWizardGreenAudit() {
  const currentIp = state.wizard.currentIp || state.wizard.selectedIp || "";
  const assignments = state.wizard.assignments
    .filter((a) => !currentIp || a.ip === currentIp)
    .slice()
    .sort((a, b) => a.segment - b.segment);

  if (!assignments.length) {
    setWizardStatus("No mapped segments to replay.");
    return;
  }

  const ip = assignments[0].ip;
  if (state.livePushActive) {
    stopLivePush();
  }

  const ledCount = state.wizard.ledCount > 0
    ? state.wizard.ledCount
    : (await queryLedCountForIp(ip) || LEDS_PER_TILE);

  state.wizard.currentIp = ip;
  state.wizard.ledCount = ledCount;
  state.wizard.phase = "replay";
  setWizardStatus(`Replaying ${assignments.length} mapped segment(s) for ${ip}...`);
  updateWizardControlStates();

  for (let i = 0; i < assignments.length; i += 1) {
    const item = assignments[i];
    state.wizard.currentSegment = item.segment;
    await pushWizardSegmentPattern("green", 0);
    setWizardStatus(`Replay ${i + 1}/${assignments.length}: segment ${item.segment} -> tile ${item.tileId}`);
    await new Promise((resolve) => setTimeout(resolve, 320));
  }

  state.wizard.phase = "idle";
  setWizardStatus(`Replay complete for ${ip}.`);
  updateWizardControlStates();
}

async function wizardConfirmTile() {
  if (!state.wizard.active) {
    setWizardStatus("Start mapping a selected device first.");
    return;
  }
  if (!state.wizard.yellowShown) {
    setWizardStatus("Show Yellow and orient tile before confirming.");
    return;
  }
  const tile = getTileById(state.selectedTileId);
  if (!tile) {
    setWizardStatus("Select a map tile before confirming.");
    return;
  }

  const locked = state.wizard.lockedTiles[String(tile.id)];
  const lockOwner = locked && (locked.ip !== state.wizard.currentIp || locked.segment !== state.wizard.currentSegment);
  if (lockOwner) {
    setWizardStatus(`Tile ${tile.id} is locked by ${locked.ip} segment ${locked.segment}.`);
    return;
  }

  const role = currentWizardRoleLabel();
  const ip = state.wizard.currentIp;
  const segment = state.wizard.currentSegment;

  if (segment === 0) {
    tile.isMaster = true;
    state.masterIPs[tile.id] = ip;
    if (state.wizard.ledCount) state.masterLeds[tile.id] = state.wizard.ledCount;
  }

  state.wizard.segmentTileIds[segment] = tile.id;
  state.wizard.lockedTiles[String(tile.id)] = {
    ip,
    segment,
    role,
    rotation: state.tileRotations[tile.id] || 0,
  };
  recordWizardAssignment(ip, segment, tile.id, role);

  await pushWizardSegmentPattern("green", 0);

  state.wizard.yellowShown = false;
  state.wizard.phase = "confirmed";
  render();
  runValidation();
  saveMapAutosave();

  // After master orientation is confirmed, pull LED count and infer slave count.
  if (segment === 0) {
    const rawLeds = state.wizard.rawLedCount || state.wizard.ledCount || LEDS_PER_TILE;
    const inferred = inferSegmentsFromLedCount(ip, rawLeds);
    const overrideTiles = getWizardOverrideTileCountForIp(ip);
    const layoutGroupCount = Array.isArray(state.wizard.segmentLedGroups)
      ? state.wizard.segmentLedGroups.length
      : 0;
    const useLayoutGroups = !overrideTiles
      && layoutGroupCount >= 1
      && layoutGroupCount <= MAX_TILES_PER_MASTER;
    const effectiveLedCount = useLayoutGroups
      ? layoutGroupCount * LEDS_PER_TILE
      : inferred.effectiveLedCount;
    const effectiveSegments = useLayoutGroups
      ? layoutGroupCount
      : inferred.segments;
    const reason = useLayoutGroups
      ? `from layout groups (${layoutGroupCount} tile(s))`
      : inferred.reason;
    const reportedLedCount = Number(state.wizard.reportedLedCount || 0);
    const reportedTiles = reportedLedCount > 0 ? Math.floor(reportedLedCount / LEDS_PER_TILE) : 0;
    const reportedWarning = (reportedTiles > 0 && effectiveSegments > reportedTiles)
      ? ` Device currently exposes about ${reportedTiles} tile(s) (${reportedLedCount} LEDs); additional slaves may not light until paired to this master.`
      : "";

    state.wizard.ledCount = effectiveLedCount;
    state.wizard.rawLedCount = Math.max(Number(state.wizard.rawLedCount || 0), effectiveLedCount);
    state.masterLeds[tile.id] = effectiveLedCount;
    state.wizard.totalSegments = effectiveSegments;
    const slaveCount = Math.max(0, state.wizard.totalSegments - 1);
    setWizardStatus(
      `Master confirmed. Device reports ${rawLeds} transport LEDs; using ${effectiveLedCount} active LEDs, ` +
      `inferred ${slaveCount} slave tile(s) (${reason}).` +
      reportedWarning
    );
  }

  state.wizard.currentSegment += 1;
  state.wizard.currentProbeGroupIndex = null;
  const lastSelected = Number(state.wizard.segmentResolvedGroupIndex?.[segment]);
  if (Number.isInteger(lastSelected)) {
    state.wizard.probeCursor = lastSelected + 1;
  }
  renderWizardProgressTable();
  if (state.wizard.currentSegment >= state.wizard.totalSegments) {
    stopWizardRedBlink();
    state.wizard.phase = "device-complete";
    const remaining = state.wizard.queueIps.length;
    setWizardStatus(`Mapped ${state.wizard.totalSegments} segment(s) for ${ip}. ${remaining} master device(s) left.`);
    setStatus(`Wizard: mapped device ${ip}.`);
    saveMapAutosave();
    updateWizardControlStates();
    return;
  }

  await wizardBlinkRed();
  updateWizardControlStates();
}

function wizardSkipSegment() {
  if (!state.wizard.active) return;
  stopWizardRedBlink();
  state.wizard.skippedSegments.push(state.wizard.currentSegment);
  const skippedSeg = state.wizard.currentSegment;
  state.wizard.currentSegment += 1;
  state.wizard.currentProbeGroupIndex = null;
  const skippedResolved = Number(state.wizard.segmentResolvedGroupIndex?.[skippedSeg]);
  if (Number.isInteger(skippedResolved)) {
    state.wizard.probeCursor = skippedResolved + 1;
  }
  state.wizard.yellowShown = false;
  if (state.wizard.currentSegment >= state.wizard.totalSegments) {
    state.wizard.phase = "device-complete";
    setWizardStatus(`Device ${state.wizard.currentIp} finished with skipped segments: ${state.wizard.skippedSegments.join(", ") || "none"}.`);
    saveMapAutosave();
    updateWizardControlStates();
    return;
  }
  wizardBlinkRed().catch((err) => {
    setWizardStatus(`Could not continue segment mapping: ${err.message}`);
  });
  renderWizardProgressTable();
  updateWizardControlStates();
}

function wizardCancel() {
  stopWizardRedBlink();
  state.wizard.active = false;
  state.wizard.phase = "idle";
  state.wizard.yellowShown = false;
  setWizardStatus("Wizard cancelled.");
  renderWizardProgressTable();
  saveMapAutosave();
  updateWizardControlStates();
}

async function refreshWizardMetadataInBackground(ip, nonceAtStart) {
  let reportedLedCount = 0;
  try {
    reportedLedCount = await queryLedCountForIp(ip);
  } catch (_e) {
    reportedLedCount = 0;
  }

  const seedRaw = reportedLedCount > 0
    ? reportedLedCount
    : Math.max(Number(state.wizard.rawLedCount || 0), LEDS_PER_TILE);
  const inferred = inferSegmentsFromLedCount(ip, seedRaw);
  const segmentGroupInfo = await fetchWizardSegmentGroups(ip).catch(() => ({ groups: [], source: "fallback" }));
  const segmentLedGroups = Array.isArray(segmentGroupInfo?.groups) ? segmentGroupInfo.groups : [];
  const segmentGroupSource = segmentGroupInfo?.source || "fallback";

  if (!state.wizard.active) return;
  if (state.wizard.currentIp !== ip) return;
  if (state.wizard.startNonce !== nonceAtStart) return;

  if (reportedLedCount > 0) {
    state.wizard.reportedLedCount = reportedLedCount;
  }
  state.wizard.rawLedCount = Math.max(Number(state.wizard.rawLedCount || 0), seedRaw, inferred.effectiveLedCount);
  state.wizard.ledCount = Math.max(Number(state.wizard.ledCount || 0), inferred.effectiveLedCount);
  state.wizard.segmentLedGroups = segmentLedGroups;
  state.wizard.segmentGroupSource = segmentGroupSource;

  if (state.wizard.phase === "locate") {
    ensureWizardProbeIndexForCurrentSegment();
    setWizardStatus(buildWizardLocateStatus());
  }
  updateWizardControlStates();
}

async function wizardStartForIp(ip) {
  if (!ip) {
    setWizardStatus("Choose a discovered master first.");
    return;
  }
  if (state.livePushActive) {
    stopLivePush();
  }

  // Start immediately using discovered/override estimates. Device metadata
  // probing (gestalt + layout/config) runs in background to avoid start lag.
  const discovered = state.discoveredDevices.find((d) => d.ip === ip);
  let rawLedCount = Number(discovered?.leds || 0);
  let reportedLedCount = 0;
  if (!rawLedCount) {
    const overrideTiles = getWizardOverrideTileCountForIp(ip);
    rawLedCount = overrideTiles ? overrideTiles * LEDS_PER_TILE : LEDS_PER_TILE;
  }
  const inferredInit = inferSegmentsFromLedCount(ip, rawLedCount);

  stopWizardRedBlink();
  state.wizard.startNonce = Number(state.wizard.startNonce || 0) + 1;
  state.wizard.active = true;
  state.wizard.currentIp = ip;
  state.wizard.selectedIp = ip;
  state.wizard.reportedLedCount = reportedLedCount;
  state.wizard.rawLedCount = Math.max(rawLedCount, inferredInit.effectiveLedCount);
  state.wizard.ledCount = inferredInit.effectiveLedCount;
  state.wizard.totalSegments = 1;
  state.wizard.currentSegment = 0;
  state.wizard.phase = "locate";
  state.wizard.yellowShown = false;
  state.wizard.segmentLedGroups = [];
  state.wizard.segmentGroupSource = "fallback";
  state.wizard.segmentResolvedGroupIndex = {};
  state.wizard.currentProbeGroupIndex = null;
  state.wizard.probeCursor = 0;
  state.wizard.segmentTileIds = {};
  state.wizard.skippedSegments = [];
  state.wizard.queueIps = state.discoveredDevices.map((d) => d.ip).filter((addr) => addr !== ip);

  const selectedMasterTile = getTileById(state.selectedTileId);
  if (selectedMasterTile && selectedMasterTile.isMaster && state.masterIPs[selectedMasterTile.id] === ip) {
    state.masterLeds[selectedMasterTile.id] = inferredInit.effectiveLedCount;
  }

  setStatus(`Wizard started for ${ip}.`);
  const reportedMessage = "Probing device metadata in background. ";
  setWizardStatus(
    `Device ${ip}: transport ${rawLedCount} LEDs, active window ${inferredInit.effectiveLedCount} LEDs (${inferredInit.reason}). ` +
    reportedMessage +
    "Master segment is blinking RED. Click master tile location."
  );
  renderWizardProgressTable();
  saveMapAutosave();
  updateWizardControlStates();
  await wizardBlinkRed();

  const nonceAtStart = state.wizard.startNonce;
  refreshWizardMetadataInBackground(ip, nonceAtStart).catch((err) => {
    if (!state.wizard.active || state.wizard.currentIp !== ip || state.wizard.startNonce !== nonceAtStart) return;
    setWizardStatus(`Metadata probe warning on ${ip}: ${err.message}. Continuing with current mapping data.`);
  });
}

async function wizardStartNextDevice() {
  if (!state.wizard.queueIps.length) {
    setWizardStatus("No queued discovered masters remain. Discovery may find more.");
    return;
  }
  const nextIp = state.wizard.queueIps.shift();
  if (el.wizardDeviceSelect) el.wizardDeviceSelect.value = nextIp;
  updateWizardOverrideInputForSelection();
  updateWizardControlStates();
  await wizardStartForIp(nextIp);
}

async function probeSelectedMaster() {
  const tile = getTileById(state.selectedTileId);
  if (!tile || !tile.isMaster) {
    el.pushStatus.textContent = "Select a master tile first, then query it.";
    setStatus("Select a master tile first.");
    return;
  }

  const ip = state.masterIPs[tile.id];
  if (!ip) {
    el.pushStatus.textContent = `Master tile ${tile.id} has no IP assigned.`;
    setStatus(`Master tile ${tile.id} has no IP assigned.`);
    return;
  }

  el.pushStatus.textContent = `Querying master tile ${tile.id} (${ip})...`;

  try {
    const gestaltRes = await twinklyFetch(ip, "/xled/v1/gestalt");
    if (!gestaltRes.ok) {
      throw new Error(`gestalt failed (${gestaltRes.status})`);
    }
    const gestalt = await gestaltRes.json();
    const ledCount = Number(gestalt.number_of_led || 0);
    if (ledCount > 0) state.masterLeds[tile.id] = ledCount;

    const estimatedTiles = ledCount > 0 ? Math.round(ledCount / (TILE_PIXEL_GRID * TILE_PIXEL_GRID)) : 0;
    const mappedTiles = getOrderedTilesForMaster(tile.id);

    let topologyHint = "No explicit topology endpoint exposed by device.";
    let token = null;
    try {
      token = await twinklyToken(ip);
    } catch (_e) {
      token = null;
    }

    if (token) {
      const candidates = [
        "/xled/v1/led/layout/full",
        "/xled/v1/led/layout",
        "/xled/v1/led/config",
      ];
      for (const path of candidates) {
        try {
          const res = await twinklyFetch(ip, path, {
            headers: { "X-Auth-Token": token },
          });
          if (!res.ok) continue;
          const data = await res.json();
          const keys = Object.keys(data || {});
          topologyHint = `${path} available (keys: ${keys.slice(0, 8).join(", ") || "none"})`;
          break;
        } catch (_e) {
          // Keep probing other likely endpoints.
        }
      }
    }

    const mismatch = estimatedTiles > 0
      ? `Device tiles≈${estimatedTiles} (from ${ledCount} LEDs), mapped tiles=${mappedTiles.length}.`
      : `Mapped tiles=${mappedTiles.length}. Device did not report LED count.`;

    el.pushStatus.textContent = `Master ${tile.id} (${ip}): ${mismatch} ${topologyHint}`;
    setStatus(`Queried master ${tile.id}. ${mismatch}`);
    renderTileDetails();
    saveMapAutosave();
  } catch (err) {
    el.pushStatus.textContent = `Master query failed for ${ip}: ${err.message}`;
    setStatus(`Master query failed for ${ip}: ${err.message}`);
  }
}

async function pushMasterToHardware(masterId) {
  const ip = state.masterIPs[masterId];
  if (!ip) return;

  // Query the device's actual LED count if we don't have it cached.
  let totalLeds = state.masterLeds[masterId];
  if (!totalLeds) {
    try {
      const res = await twinklyFetch(ip, "/xled/v1/gestalt");
      if (res.ok) {
        const info = await res.json();
        totalLeds = info.number_of_led || 64;
        state.masterLeds[masterId] = totalLeds;
      }
    } catch (_e) {
      totalLeds = 64;
    }
  }

  const chain = getOrderedTilesForMaster(masterId);

  // Allocate a full frame for the device (zeros = black for unprogrammed LEDs).
  const frameBytes = new Uint8Array(totalLeds * 3);

  chain.forEach((tileId, tileIdx) => {
    if (tileIdx >= totalLeds / LEDS_PER_TILE) return; // don't exceed device size
    const pixels = getTilePixelRgb(tileId);
    const base = tileIdx * LEDS_PER_TILE * 3;
    pixels.forEach(([r, g, b], pIdx) => {
      frameBytes[base + pIdx * 3]     = r;
      frameBytes[base + pIdx * 3 + 1] = g;
      frameBytes[base + pIdx * 3 + 2] = b;
    });
  });

  const token = await twinklyToken(ip);
  await twinklySetRtMode(ip, token);
  await twinklyPushFrame(ip, token, frameBytes);
}

async function pushAllTilesToHardware() {
  const masters = state.tiles.filter((t) => t.isMaster && state.masterIPs[t.id]);
  if (!masters.length) {
    el.pushStatus.textContent = "No masters with IP addresses assigned.";
    return;
  }
  el.pushStatus.textContent = `Pushing to ${masters.length} master(s)…`;
  const errors = [];
  await Promise.all(masters.map((m) =>
    pushMasterToHardware(m.id).catch((err) => errors.push(`${state.masterIPs[m.id]}: ${err.message}`))
  ));
  el.pushStatus.textContent = errors.length
    ? `Errors: ${errors.join(" | ")}`
    : `Pushed to ${masters.length} master(s) OK.`;
}

function startLivePush() {
  if (state.livePushActive) return;
  state.livePushActive = true;
  el.btnToggleLivePush.textContent = "⏹ Stop Live Push";
  el.btnToggleLivePush.classList.add("danger");
  updateGeneralButtonStates();

  let lastPush = 0;
  function loop(now) {
    if (!state.livePushActive) return;
    state.livePushRafId = requestAnimationFrame(loop);
    if (now - lastPush < 50) return;   // cap at ~20 fps
    lastPush = now;
    pushAllTilesToHardware().catch(() => {});
  }
  state.livePushRafId = requestAnimationFrame(loop);
}

function stopLivePush() {
  state.livePushActive = false;
  if (state.livePushRafId != null) cancelAnimationFrame(state.livePushRafId);
  state.livePushRafId = null;
  el.btnToggleLivePush.textContent = "▶ Live Push";
  el.btnToggleLivePush.classList.remove("danger");
  el.pushStatus.textContent = "Live push stopped.";
  updateGeneralButtonStates();
}

function getTilePixelColors(tileId) {
  const tile = getTileById(tileId);
  if (!tile) {
    return Array.from({ length: TILE_PIXEL_GRID }, () => Array(TILE_PIXEL_GRID).fill("#101215"));
  }

  const out = [];
  const baseWallX = (tile.col - 1) * TILE_PIXEL_GRID;
  const baseWallY = (tile.row - 1) * TILE_PIXEL_GRID;

  for (let y = 0; y < TILE_PIXEL_GRID; y += 1) {
    const row = [];
    for (let x = 0; x < TILE_PIXEL_GRID; x += 1) {
      const wallX = baseWallX + x;
      const wallY = baseWallY + y;
      const sourceX = state.demoOffsetX + wallX;
      const sourceY = state.demoOffsetY + wallY;
      const animated = getAnimatedPixelColorAtWall(wallX, wallY);
      row.push(animated || getPixelColorAtSource(sourceX, sourceY));
    }
    out.push(row);
  }

  return out;
}

function updateDemoDragCursor() {
  if (state.sourceFrame) {
    el.gridSvg.classList.add("demo-drag");
  } else {
    el.gridSvg.classList.remove("demo-drag");
    el.gridSvg.classList.remove("dragging");
  }
}

const MASTER_PALETTE = [
  { fill: "#1a6bbf", stroke: "#0d3d70" },
  { fill: "#b04a00", stroke: "#5c2600" },
  { fill: "#1a9150", stroke: "#0a4828" },
  { fill: "#7b2fbf", stroke: "#3d1070" },
  { fill: "#b5880a", stroke: "#6b4f00" },
  { fill: "#b01a4a", stroke: "#5c0020" },
  { fill: "#148c8c", stroke: "#064040" },
  { fill: "#8c5014", stroke: "#3c1e00" },
  { fill: "#2b5ab0", stroke: "#0d2f60" },
  { fill: "#7ab010", stroke: "#3a5000" },
];

function buildMasterColorMap() {
  const masters = state.tiles.filter((t) => t.isMaster);
  const assignmentMap = buildTileMasterAssignmentMap();
  const map = new Map();
  const paletteByMaster = new Map();

  masters.forEach((master, idx) => {
    paletteByMaster.set(master.id, MASTER_PALETTE[idx % MASTER_PALETTE.length]);
  });

  for (const [tileId, info] of assignmentMap.entries()) {
    if (!Number.isInteger(info.masterTileId)) continue;
    const palette = paletteByMaster.get(info.masterTileId);
    if (!palette) continue;
    map.set(tileId, { ...palette, masterTileId: info.masterTileId });
  }

  return map;
}

function render() {
  const { size, positions } = getLayout();
  updateDemoDragCursor();

  while (el.gridSvg.firstChild) {
    el.gridSvg.removeChild(el.gridSvg.firstChild);
  }

  // Arrow marker defs
  const defs = makeSvgNode("defs");
  for (const [id, color] of [["arrowhead-light", "#fff"], ["arrowhead-dark", "#4f5d68"]]) {
    const marker = makeSvgNode("marker", {
      id, markerWidth: "6", markerHeight: "6", refX: "5", refY: "3", orient: "auto",
    });
    const path = makeSvgNode("path", { d: "M0,0 L6,3 L0,6 Z", fill: color });
    marker.appendChild(path);
    defs.appendChild(marker);
  }
  el.gridSvg.appendChild(defs);

  const masterColorMap = buildMasterColorMap();

  for (const tile of state.tiles) {
    const p = positions.get(tile.id);
    if (!p) continue;

    const group = makeSvgNode("g");
    group.addEventListener("click", () => onTileClick(tile.id));

    const masterColor = masterColorMap.get(tile.id);
    const klass = ["node"];
    if (tile.id === state.selectedTileId) klass.push("selected");
    if (tile.isMaster) klass.push("master");
    if (isTileLocked(tile.id)) klass.push("locked");

    const rectAttrs = {
      class: klass.join(" "),
      x: p.x,
      y: p.y,
      width: size,
      height: size,
      rx: Math.max(4, size * 0.15),
      ry: Math.max(4, size * 0.15),
    };
    if (masterColor && !tile.isMaster) {
      rectAttrs.fill = masterColor.fill;
      rectAttrs.stroke = masterColor.stroke;
    }
    const rect = makeSvgNode("rect", rectAttrs);
    group.appendChild(rect);

    const pixelSize = size / TILE_PIXEL_GRID;
    const tilePixels = getTilePixelColors(tile.id);
    for (let py = 0; py < TILE_PIXEL_GRID; py += 1) {
      for (let px = 0; px < TILE_PIXEL_GRID; px += 1) {
        const pixel = makeSvgNode("rect", {
          class: "tile-pixel",
          x: p.x + px * pixelSize,
          y: p.y + py * pixelSize,
          width: pixelSize,
          height: pixelSize,
          fill: tilePixels[py][px],
        });
        group.appendChild(pixel);
      }
    }

    const label = makeSvgNode("text", {
      class: "tile-label",
      x: p.cx,
      y: p.cy,
    });
    label.textContent = String(tile.id);
    group.appendChild(label);

    if (tile.isMaster) {
      const m = makeSvgNode("text", {
        class: "master-label",
        x: p.cx,
        y: p.y + 11,
      });
      m.textContent = state.masterIPs[tile.id] ? `IP:${state.masterIPs[tile.id].split(".").pop()}` : "MASTER";
      group.appendChild(m);
    }

    if (isTileLocked(tile.id)) {
      const lockText = makeSvgNode("text", {
        class: "lock-label",
        x: p.cx,
        y: p.y + size - 10,
      });
      lockText.textContent = "LOCK";
      group.appendChild(lockText);
    }

    // Rotation arrow
    const rot = (state.tileRotations[tile.id] || 0);
    const arrowLen = size * 0.28;
    const arrowRad = (rot - 90) * (Math.PI / 180);
    const ax = p.cx + Math.cos(arrowRad) * arrowLen;
    const ay = p.cy + Math.sin(arrowRad) * arrowLen;
    const arrowColor = masterColor ? "#fff" : "#4f5d68";
    const arrow = makeSvgNode("line", {
      x1: p.cx, y1: p.cy, x2: ax, y2: ay,
      stroke: arrowColor,
      "stroke-width": Math.max(2, size * 0.05),
      "stroke-linecap": "round",
      "marker-end": `url(#arrowhead-${masterColor ? "light" : "dark"})`,
      opacity: "0.85",
      "pointer-events": "none",
    });
    group.appendChild(arrow);

    el.gridSvg.appendChild(group);
  }

  renderTileDetails();
}

function renderTileDetails() {
  if (state.selectedTileId == null) {
    el.tileDetails.textContent = "No tile selected.";
    el.masterIpRow.hidden = true;
    updateGeneralButtonStates();
    return;
  }

  const tile = getTileById(state.selectedTileId);
  if (!tile) {
    el.tileDetails.textContent = "No tile selected.";
    el.masterIpRow.hidden = true;
    updateGeneralButtonStates();
    return;
  }

  const assignmentMap = buildTileMasterAssignmentMap();
  const assignment = assignmentMap.get(tile.id) || null;
  const details = [
    `id: ${tile.id}`,
    `row: ${tile.row}`,
    `col: ${tile.col}`,
    `master: ${tile.isMaster ? "yes" : "no"}`,
    `mapped master tile: ${Number.isInteger(assignment?.masterTileId) ? assignment.masterTileId : "none"}`,
    `mapped master ip: ${assignment?.masterIp || "none"}`,
    `segment: ${Number.isInteger(assignment?.segment) ? assignment.segment : "none"}`,
  ];

  const lock = state.wizard.lockedTiles[String(tile.id)];
  if (lock) {
    details.push(`locked: yes (${lock.role} @ ${lock.ip} seg ${lock.segment})`);
  }

  if (tile.isMaster) {
    const ip = state.masterIPs[tile.id] || "";
    details.push(`ip: ${ip || "not set"}`);
    el.masterIpRow.hidden = false;
    el.masterIpInput.value = ip;
    el.masterIpInput.placeholder = "192.168.1.x";
  } else {
    el.masterIpRow.hidden = true;
  }

  const rot = state.tileRotations[tile.id] || 0;
  details.push(`rotation: ${rot}°`);

  el.tileDetails.textContent = details.join("\n");
  updateGeneralButtonStates();
}

function pushValidation(items, level, text) {
  items.push({ level, text });
}

function runValidation() {
  const issues = [];
  const masters = state.tiles.filter((t) => t.isMaster);

  if (masters.length === state.expectedMasters) {
    pushValidation(issues, "ok", `Master count looks good (${masters.length}/${state.expectedMasters}).`);
  } else {
    pushValidation(issues, "warn", `Master count is ${masters.length}; expected ${state.expectedMasters}.`);
  }

  const lockedCount = Object.keys(state.wizard.lockedTiles || {}).length;
  if (lockedCount > 0) {
    pushValidation(issues, "ok", `${lockedCount} tile(s) mapped/locked by Hardware Wizard.`);
  } else {
    pushValidation(issues, "warn", "No mapped tiles yet. Start Hardware Wizard mapping.");
  }

  while (el.validationList.firstChild) {
    el.validationList.removeChild(el.validationList.firstChild);
  }

  for (const issue of issues) {
    const li = document.createElement("li");
    li.className = issue.level;
    li.textContent = issue.text;
    el.validationList.appendChild(li);
  }

  renderExportPreview();
}

function buildExportPayload(includeGeneratedAt = true) {
  const assignmentMap = buildTileMasterAssignmentMap();

  const masters = state.tiles
    .filter((t) => t.isMaster)
    .map((t) => ({ id: t.id, row: t.row, col: t.col, ip: state.masterIPs[t.id] || null, leds: state.masterLeds[t.id] || null }));

  const tiles = state.tiles.map((tile) => {
    const assignment = assignmentMap.get(tile.id) || null;
    return {
      tileId: tile.id,
      row: tile.row,
      col: tile.col,
      rotation: state.tileRotations[tile.id] || 0,
      isMaster: tile.isMaster,
      masterId: Number.isInteger(assignment?.masterTileId) ? assignment.masterTileId : null,
      masterIp: assignment?.masterIp || null,
      segment: Number.isInteger(assignment?.segment) ? assignment.segment : null,
    };
  });

  const masterMappings = masters.map((master) => ({
    masterId: master.id,
    masterIp: master.ip || null,
    tiles: tiles
      .filter((tile) => tile.masterId === master.id)
      .sort((a, b) => {
        if (Number.isInteger(a.segment) && Number.isInteger(b.segment)) return a.segment - b.segment;
        if (Number.isInteger(a.segment)) return -1;
        if (Number.isInteger(b.segment)) return 1;
        return a.tileId - b.tileId;
      })
      .map((tile) => ({
        tileId: tile.tileId,
        row: tile.row,
        col: tile.col,
        rotation: tile.rotation,
        segment: tile.segment,
      })),
  }));

  return {
    version: 3,
    generatedAt: includeGeneratedAt ? new Date().toISOString() : "preview",
    wall: {
      width: state.cols,
      height: state.rows,
      tileCount: state.tiles.length,
      expectedMasters: state.expectedMasters,
    },
    demo: {
      preset: state.demoPreset,
      offsetX: state.demoOffsetX,
      offsetY: state.demoOffsetY,
      imageUrl: state.sourceFrame?.imageUrl || null,
      sourcePage: state.sourceFrame?.sourcePage || null,
      label: state.sourceFrame?.label || null,
      custom: Boolean(state.sourceFrame?.custom),
      animationActive: state.animation.active,
    },
    masters,
    tiles,
    masterMappings,
  };
}

function renderExportPreview() {
  if (!el.exportPreview) return;
  const previewJson = JSON.stringify(buildExportPayload(false), null, 2);
  if (previewJson === state.lastExportPreviewJson) return;
  state.lastExportPreviewJson = previewJson;
  el.exportPreview.textContent = previewJson;
}

function exportData() {
  const data = buildExportPayload(true);

  el.jsonOutput.value = JSON.stringify(data, null, 2);
  setStatus("Mapping exported to JSON.");
}

function rebuildGrid(rows, cols, preserveMasters = false) {
  const previousMasters = new Set(
    preserveMasters ? state.tiles.filter((t) => t.isMaster).map((t) => `${t.row}:${t.col}`) : []
  );

  state.rows = rows;
  state.cols = cols;
  state.tiles = makeTiles(rows, cols);
  state.selectedTileId = null;

  for (const tile of state.tiles) {
    tile.isMaster = previousMasters.has(`${tile.row}:${tile.col}`);
  }

  clampDemoOffsets();
  if (state.animation.active && state.animation.frames.length > 0) {
    const frame = state.animation.frames[state.animation.frameIndex];
    state.animation.posX = Math.floor((wallPixelWidth() - frame.width) / 2);
    state.animation.posY = Math.floor((wallPixelHeight() - frame.height) / 2);
  }
  updateHeader();
  renderDemoInfo();
  render();
  runValidation();
}

async function importData(data) {
  if (!data || (!data.wall && !data.grid) || !Array.isArray(data.masters)) {
    throw new Error("Invalid mapping file format.");
  }

  const rows = Number(data.wall?.height ?? data.grid?.rows);
  const cols = Number(data.wall?.width ?? data.grid?.cols);
  const expectedMasters = Number(data.wall?.expectedMasters ?? data.grid?.expectedMasters ?? data.masters.length ?? 3);
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error("Invalid grid size in file.");
  }

  state.expectedMasters = Math.max(1, expectedMasters);
  el.mastersInput.value = String(state.expectedMasters);
  el.rowsInput.value = String(rows);
  el.colsInput.value = String(cols);

  rebuildGrid(rows, cols, false);

  state.masterIPs = {};
  state.masterLeds = {};
  state.tileRotations = {};
  state.wizard.lockedTiles = {};
  state.wizard.assignments = [];
  state.wizard.segmentTileIds = {};
  for (const m of data.masters) {
    const tile = getTileById(Number(m.id));
    if (tile) {
      tile.isMaster = true;
      if (m.ip) state.masterIPs[tile.id] = m.ip;
      if (m.leds) state.masterLeds[tile.id] = m.leds;
    }
  }
  if (Array.isArray(data.tiles)) {
    for (const item of data.tiles) {
      const tile = getTileById(Number(item.tileId));
      if (!tile) continue;

      if (typeof item.isMaster === "boolean") tile.isMaster = item.isMaster;

      const rot = Number(item.rotation);
      if ([0, 90, 180, 270].includes(rot)) {
        state.tileRotations[tile.id] = rot;
      }

      const segment = Number(item.segment);
      const masterIp = typeof item.masterIp === "string" ? item.masterIp : null;
      if (masterIp && Number.isInteger(segment) && segment >= 0) {
        state.wizard.assignments.push({
          ip: masterIp,
          segment,
          tileId: tile.id,
          role: segment === 0 ? "master" : "slave",
        });
        state.wizard.lockedTiles[String(tile.id)] = {
          ip: masterIp,
          segment,
          role: segment === 0 ? "master" : "slave",
          rotation: state.tileRotations[tile.id] || 0,
        };
      }
    }
    renderWizardProgressTable();
  } else if (data.tileRotations && typeof data.tileRotations === "object") {
    for (const [k, v] of Object.entries(data.tileRotations)) {
      const numV = Number(v);
      if ([0, 90, 180, 270].includes(numV)) state.tileRotations[Number(k)] = numV;
    }
  }

  const demo = data.demo || {};
  if (typeof demo.preset === "string" && DEMOS[demo.preset]) {
    state.demoPreset = demo.preset;
    el.demoPreset.value = demo.preset;
    await loadPresetFrame(demo.preset);
  }

  if (Number.isInteger(demo.offsetX)) state.demoOffsetX = demo.offsetX;
  if (Number.isInteger(demo.offsetY)) state.demoOffsetY = demo.offsetY;
  clampDemoOffsets();
  renderDemoInfo();

  setStatus("Mapping imported.");
  render();
  runValidation();
  saveMapAutosave();
}

async function discoverTwinklyDevices() {
  if (el.discoveryStatus) el.discoveryStatus.textContent = "Checking server…";
  if (el.discoveryResults) el.discoveryResults.innerHTML = "";
  const previousDiscovered = state.discoveredDevices.slice();
  state.discoveredDevices = [];
  updateWizardDeviceSelect();

  // Verify the proxy/scan server is running.
  let localip = null;
  try {
    const r = await fetch("/localip");
    if (r.ok) {
      const data = await r.json();
      localip = (data.ips || [])[0] || null;
    }
  } catch (_e) {}

  if (!localip) {
    const msg = "server.py not running. Start with: python3 server.py then reload http://localhost:8080";
    if (el.discoveryStatus) el.discoveryStatus.textContent = `⚠️ ${msg}`;
    setWizardStatus(msg);
    return;
  }

  const subnet = localip.split(".").slice(0, 3).join(".");
  if (el.discoveryStatus) el.discoveryStatus.textContent = `Scanning ${subnet}.1–254 via server…`;

  try {
    const res = await fetch(`/scan?subnet=${encodeURIComponent(subnet)}`);
    if (!res.ok) throw new Error(`scan returned ${res.status}`);
    const { found } = await res.json();
    const discoveredByIp = new Map();
    for (const dev of (found || [])) {
      if (dev && dev.ip) discoveredByIp.set(dev.ip, dev);
    }

    // If subnet scan misses devices, retry known candidate IPs directly.
    const knownIps = new Set();
    for (const ip of Object.values(state.masterIPs || {})) {
      if (typeof ip === "string" && ip) knownIps.add(ip);
    }
    const manualMasterIp = String(el.masterIpInput?.value || "").trim();
    if (/^\d+\.\d+\.\d+\.\d+$/.test(manualMasterIp)) {
      knownIps.add(manualMasterIp);
    }
    if (typeof state.wizard.selectedIp === "string" && state.wizard.selectedIp) {
      knownIps.add(state.wizard.selectedIp);
    }
    for (const dev of previousDiscovered) {
      if (dev && typeof dev.ip === "string" && dev.ip) knownIps.add(dev.ip);
    }

    for (const ip of knownIps) {
      if (discoveredByIp.has(ip)) continue;
      try {
        const url = `/proxy?url=${encodeURIComponent(`http://${ip}/xled/v1/gestalt`)}`;
        const knownRes = await fetch(url);
        if (!knownRes.ok) continue;
        const data = await knownRes.json();
        if (!data || !data.product_name) continue;
        discoveredByIp.set(ip, {
          ip,
          name: data.device_name || data.product_name || ip,
          leds: Number(data.number_of_led || 0),
          product: data.product_name || "",
        });
      } catch (_e) {
        // Ignore probe failures; scan results still stand.
      }
    }

    state.discoveredDevices = Array.from(discoveredByIp.values())
      .sort((a, b) => String(a.ip).localeCompare(String(b.ip)));

    const stillValidSelection = state.discoveredDevices.some((d) => d.ip === state.wizard.selectedIp);
    if (!stillValidSelection) state.wizard.selectedIp = "";
    if (!state.wizard.selectedIp && state.discoveredDevices.length === 1) {
      state.wizard.selectedIp = state.discoveredDevices[0].ip;
    }

    renderDiscoveryResults();
    updateWizardDeviceSelect();

    if (el.wizardDeviceSelect && state.wizard.selectedIp) {
      el.wizardDeviceSelect.value = state.wizard.selectedIp;
    }

    const discoverMsg = state.discoveredDevices.length
      ? `Found ${state.discoveredDevices.length} Twinkly device(s).`
      : `No Twinkly devices found on ${subnet}.0/24.`;
    if (el.discoveryStatus) el.discoveryStatus.textContent = discoverMsg;

    if (!state.discoveredDevices.length) {
      setWizardStatus("Discovery found no devices.");
    } else if (state.wizard.selectedIp) {
      setWizardStatus(`Selected discovered master ${state.wizard.selectedIp}. Click Start Mapping Selected.`);
    } else {
      setWizardStatus(`Discovery finished: ${state.discoveredDevices.length} device(s). Select one, then click Start Mapping Selected.`);
    }

    updateWizardControlStates();
  } catch (err) {
    if (el.discoveryStatus) el.discoveryStatus.textContent = `Scan failed: ${err.message}`;
    setWizardStatus(`Discovery failed: ${err.message}`);
  }
}

function renderDiscoveryResults() {
  if (!el.discoveryResults) return;
  el.discoveryResults.innerHTML = "";

  for (const dev of state.discoveredDevices) {
    const row = document.createElement("div");
    row.className = "discovery-item";

    const label = document.createElement("span");
    label.className = "discovery-label";
    label.textContent = `${dev.name} (${dev.ip})` + (dev.leds ? ` — ${dev.leds} LEDs` : "");
    row.appendChild(label);

    const assignBtn = document.createElement("button");
    assignBtn.type = "button";
    assignBtn.textContent = "Assign to selected master";
    assignBtn.addEventListener("click", () => {
      const tile = getTileById(state.selectedTileId);
      if (!tile || !tile.isMaster) {
        setStatus("Select a master tile first, then assign a device.");
        return;
      }
      state.masterIPs[tile.id] = dev.ip;
      if (dev.leds) state.masterLeds[tile.id] = dev.leds;
      el.masterIpInput.value = dev.ip;
      renderTileDetails();
      render();
      setStatus(`Assigned ${dev.name} (${dev.ip}) → master tile ${tile.id}.`);
    });
    row.appendChild(assignBtn);

    el.discoveryResults.appendChild(row);
  }
}

function resetAll() {
  stopWizardRedBlink();
  state.expectedMasters = Number(el.mastersInput.value) || 3;
  el.rowsInput.value = "5";
  el.colsInput.value = "7";
  state.demoPreset = "mario";
  el.demoPreset.value = "mario";
  state.demoOffsetX = 0;
  state.demoOffsetY = 0;
  state.masterIPs = {};
  state.masterLeds = {};
  state.tileRotations = {};
  state.discoveredDevices = [];
  state.wizard = {
    active: false,
    selectedIp: "",
    currentIp: "",
    startNonce: 0,
    reportedLedCount: 0,
    rawLedCount: 0,
    ledCount: 0,
    totalSegments: 0,
    currentSegment: 0,
    phase: "idle",
    yellowShown: false,
    segmentTileIds: {},
    skippedSegments: [],
    lockedTiles: {},
    assignments: [],
    queueIps: [],
    blinkTimerId: null,
    blinkOn: false,
    blinkInFlight: false,
    segmentLedGroups: [],
    segmentGroupSource: "fallback",
    segmentResolvedGroupIndex: {},
    currentProbeGroupIndex: null,
    probeCursor: 0,
    tileCountOverrides: {},
  };
  updateWizardDeviceSelect();
  renderWizardProgressTable();
  setWizardStatus("Wizard idle. Discover masters to begin.");
  updateWizardControlStates();
  resetAnimation();
  rebuildGrid(5, 7, false);
  el.jsonOutput.value = "";
  loadPresetFrame("mario");
  setStatus("Reset to 7x5.");
  localStorage.removeItem(MAP_AUTOSAVE_KEY);
}

function beginDemoDrag(event) {
  if (!state.sourceFrame) return;
  state.draggingDemo = true;
  state.dragStartClientX = event.clientX;
  state.dragStartClientY = event.clientY;
  state.dragStartOffsetX = state.demoOffsetX;
  state.dragStartOffsetY = state.demoOffsetY;
  el.gridSvg.classList.add("dragging");
}

function moveDemoDrag(event) {
  if (!state.draggingDemo || !state.sourceFrame) return;
  const { size } = getLayout();
  const screenPerSourcePixel = size / TILE_PIXEL_GRID;
  const dx = event.clientX - state.dragStartClientX;
  const dy = event.clientY - state.dragStartClientY;

  state.demoOffsetX = Math.round(state.dragStartOffsetX - dx / screenPerSourcePixel);
  state.demoOffsetY = Math.round(state.dragStartOffsetY - dy / screenPerSourcePixel);
  clampDemoOffsets();
  renderDemoInfo();
  render();
}

function endDemoDrag() {
  if (!state.draggingDemo) return;
  state.draggingDemo = false;
  el.gridSvg.classList.remove("dragging");
}

function switchView(nextView) {
  state.activeView = nextView;
  const isMap = nextView === "map";
  el.menuMap.classList.toggle("active", isMap);
  el.menuCharacters.classList.toggle("active", !isMap);

  el.mapView.hidden = !isMap;
  el.charactersView.hidden = isMap;
  el.mapView.classList.toggle("active-view", isMap);
  el.charactersView.classList.toggle("active-view", !isMap);

  if (isMap) {
    if (state.characters.previewRafId != null) {
      cancelAnimationFrame(state.characters.previewRafId);
      state.characters.previewRafId = null;
    }
  } else {
    startCharacterPreview();
  }

  updateGeneralButtonStates();
}

function characterProjectSnapshot() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    source: {
      assetUrl: state.characters.loadedAssetUrl,
      sheetUrl: state.characters.loadedSheetUrl,
      sheetDataUrl: state.characters.sheetDataUrl,
      width: state.characters.sheetImageData?.width || null,
      height: state.characters.sheetImageData?.height || null,
    },
    sprites: state.characters.sprites.map((s) => ({ id: s.id, x: s.x, y: s.y, w: s.w, h: s.h })),
    actions: state.characters.actions,
    selectedAction: state.characters.selectedAction,
    detectStrictness: state.characters.detectStrictness,
  };
}

function persistCharacterAutosave() {
  const key = state.characters.autosaveStorageKey;
  const payload = characterProjectSnapshot();
  localStorage.setItem(key, JSON.stringify(payload));
}

function scheduleCharacterAutosave() {
  if (state.characters.autosaveTimer != null) {
    clearTimeout(state.characters.autosaveTimer);
  }

  state.characters.autosaveTimer = setTimeout(() => {
    state.characters.autosaveTimer = null;
    try {
      persistCharacterAutosave();
    } catch (_err) {
      // Ignore storage failures silently.
    }
  }, 350);
}

async function applyCharacterProjectData(data) {
  if (!data || !data.source || !data.source.sheetDataUrl || !Array.isArray(data.sprites) || !data.actions) {
    throw new Error("Invalid character JSON format.");
  }

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode sheetDataUrl image."));
    img.src = data.source.sheetDataUrl;
  });

  const imageData = imageToImageData(image);
  state.characters.loadedAssetUrl = data.source.assetUrl || null;
  state.characters.loadedSheetUrl = data.source.sheetUrl || null;
  state.characters.sheetDataUrl = data.source.sheetDataUrl;
  state.characters.sheetImageData = imageData;
  state.characters.sprites = buildSpriteRecordsFromBoxes(imageData, data.sprites);
  state.characters.detectStrictness = Math.max(0, Math.min(1, Number(data.detectStrictness) || 0.65));
  state.characters.actions = data.actions;
  state.characters.selectedAction = data.selectedAction || Object.keys(data.actions)[0] || "run";

  if (!state.characters.actions[state.characters.selectedAction]) {
    state.characters.actions[state.characters.selectedAction] = { name: state.characters.selectedAction, frames: [] };
  }

  renderDetectStrictnessUI();
  updateSpriteSheetMetaText();

  renderActionSelect();
  renderSpritePalette();
  renderActionTimeline();
  startCharacterPreview();
}

async function restoreCharacterAutosaveIfAny() {
  const key = state.characters.autosaveStorageKey;
  const raw = localStorage.getItem(key);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    await applyCharacterProjectData(data);
    return true;
  } catch (_err) {
    return false;
  }
}

async function fetchTextViaProxy(url) {
  const proxied = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
  const res = await fetch(proxied);
  if (!res.ok) {
    throw new Error(`Proxy fetch failed (${res.status}).`);
  }
  return res.text();
}

function extractAssetLinksFromText(text) {
  const unique = [];
  const seen = new Set();
  const addUrl = (candidate) => {
    if (!candidate) return;
    let value = String(candidate).trim();

    // Unwrap markdown links and strip common trailing punctuation.
    value = value.replace(/^\[.*?\]\((.*)\)$/, "$1").replace(/[)>\].,;!?]+$/g, "");

    // Decode nested URL-encoded wrappers such as uddg=... from search engines.
    for (let i = 0; i < 3; i += 1) {
      try {
        const decoded = decodeURIComponent(value);
        if (decoded === value) break;
        value = decoded;
      } catch (_err) {
        break;
      }
    }

    const match = value.match(/https?:\/\/www\.spriters-resource\.com\/[a-z0-9_\-\/]+\/asset\/\d+\/?/i);
    if (!match) return;
    const normalized = match[0].replace(/^http:\/\//i, "https://").replace(/\/?$/, "/");
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(normalized);
  };

  const direct = text.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  for (const token of direct) addUrl(token);

  const encoded = text.match(/(?:uddg|u)=([^\s"'&]+)/gi) || [];
  for (const token of encoded) {
    const value = token.split("=").slice(1).join("=");
    addUrl(value);
  }

  return unique.slice(0, 30);
}

function extractBrowseResultEntries(text) {
  const entries = [];
  const seen = new Set();
  const iconCardRe = /\[([^\]]*?)\s*!\[[^\]]*\]\((https?:\/\/www\.spriters-resource\.com\/media\/asset_icons\/[^)\s]+)\)\]\((https?:\/\/www\.spriters-resource\.com\/[a-z0-9_\-\/]+\/asset\/\d+\/?(?:\?[^)\s]+)?)\)/gi;
  let match;
  while ((match = iconCardRe.exec(text)) !== null) {
    const rawLabel = (match[1] || "").replace(/\s+/g, " ").trim();
    const thumbnailUrl = (match[2] || "").replace(/^http:\/\//i, "https://");
    const assetUrl = match[3].replace(/^http:\/\//i, "https://").replace(/\?.*$/, "").replace(/\/?$/, "/");
    const key = assetUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      assetUrl,
      label: rawLabel || labelFromAssetUrl(assetUrl),
      thumbnailUrl,
    });
  }

  const plainRe = /\[([^\]]*)\]\((https?:\/\/www\.spriters-resource\.com\/[a-z0-9_\-\/]+\/asset\/\d+\/?(?:\?[^)\s]+)?)\)/gi;
  while ((match = plainRe.exec(text)) !== null) {
    const rawLabel = (match[1] || "").replace(/\s+/g, " ").trim();
    const assetUrl = match[2].replace(/^http:\/\//i, "https://").replace(/\?.*$/, "").replace(/\/?$/, "/");
    const key = assetUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      assetUrl,
      label: rawLabel || labelFromAssetUrl(assetUrl),
      thumbnailUrl: null,
    });
  }

  return entries.slice(0, 40);
}

function fallbackCharacterSearch(query) {
  const q = (query || "").toLowerCase();
  const catalog = [
    { assetUrl: DEMOS.mario_anim.spritePage, label: "supermariobros asset 50365" },
    { assetUrl: DEMOS.sonic_sms_anim.spritePage, label: "sonicthehedgehog asset 5859" },
    { assetUrl: DEMOS.sonic_md_anim.spritePage, label: "sonicth1 asset 21628" },
  ];

  const byKeyword = catalog.filter((item) => item.label.includes(q));
  if (byKeyword.length) return byKeyword;

  if (q.includes("mario")) return [catalog[0]];
  if (q.includes("sonic")) return [catalog[1], catalog[2]];
  return [];
}

function labelFromAssetUrl(url) {
  const parts = url.split("/").filter(Boolean);
  if (parts.length < 3) return url;
  const game = parts[parts.length - 4] || "game";
  const id = parts[parts.length - 2] || "asset";
  return `${game} asset ${id}`;
}

function renderCharacterSearchResults() {
  while (el.charSearchResults.firstChild) {
    el.charSearchResults.removeChild(el.charSearchResults.firstChild);
  }

  if (!state.characters.searchResults.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No results.";
    el.charSearchResults.appendChild(empty);
    return;
  }

  for (const item of state.characters.searchResults) {
    const row = document.createElement("div");
    row.className = "search-result-item";

    const head = document.createElement("div");
    head.className = "search-result-head";

    const icon = document.createElement("img");
    icon.className = "search-result-icon";
    icon.alt = `${item.label} thumbnail`;
    icon.loading = "lazy";
    icon.decoding = "async";
    icon.src = item.thumbnailUrl || "";
    head.appendChild(icon);

    const textWrap = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent = item.label;
    textWrap.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "search-result-meta";
    meta.textContent = item.assetUrl;
    textWrap.appendChild(meta);

    head.appendChild(textWrap);
    row.appendChild(head);

    const actions = document.createElement("div");
    actions.className = "data-actions";

    const useBtn = document.createElement("button");
    useBtn.type = "button";
    useBtn.textContent = "Load & Detect";
    useBtn.addEventListener("click", async () => {
      await loadSheetFromAssetUrl(item.assetUrl);
    });
    actions.appendChild(useBtn);

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "secondary";
    openBtn.textContent = "Open Page";
    openBtn.addEventListener("click", () => {
      window.open(item.assetUrl, "_blank", "noopener");
    });
    actions.appendChild(openBtn);

    row.appendChild(actions);
    el.charSearchResults.appendChild(row);
  }
}

async function runCharacterSearch() {
  const query = (el.charSearchInput.value || "").trim();
  if (!query) {
    el.charSearchStatus.textContent = "Enter a character name.";
    return;
  }

  el.charSearchStatus.textContent = "Searching...";
  try {
    const q = encodeURIComponent(query);
    const browseUrls = [
      `https://www.spriters-resource.com/browse/assets/?name=${q}`,
      `https://www.spriters-resource.com/browse/assets/page-2/?name=${q}`,
    ];

    const allLinks = [];
    const allEntries = [];
    for (const url of browseUrls) {
      try {
        const text = await fetchTextViaProxy(url);
        allEntries.push(...extractBrowseResultEntries(text));
        allLinks.push(...extractAssetLinksFromText(text));
      } catch (_err) {
        // Continue; partial page results are still useful.
      }
    }

    const seen = new Set();
    const resultsFromEntries = [];
    for (const item of allEntries) {
      const key = item.assetUrl.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      resultsFromEntries.push(item);
    }

    for (const link of allLinks) {
      const key = link.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      resultsFromEntries.push({ assetUrl: link, label: labelFromAssetUrl(link), thumbnailUrl: null });
    }

    let results = resultsFromEntries;
    if (results.length === 0) {
      results = fallbackCharacterSearch(query);
    }

    state.characters.searchResults = results;
    el.charSearchStatus.textContent = `${state.characters.searchResults.length} result(s).`;
    renderCharacterSearchResults();
  } catch (err) {
    state.characters.searchResults = fallbackCharacterSearch(query);
    if (state.characters.searchResults.length) {
      el.charSearchStatus.textContent = `Search network failed (${err.message}). Showing local known results.`;
      renderCharacterSearchResults();
      return;
    }
    el.charSearchStatus.textContent = `Search failed: ${err.message}`;
  }
}

function parseSheetDownloadUrl(assetPageText) {
  const candidates = [];
  const seen = new Set();
  const add = (url) => {
    if (!url) return;
    const clean = String(url).replace(/^http:\/\//i, "https://").trim();
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(clean);
  };

  const patterns = [
    /\[download\]\((https?:\/\/www\.spriters-resource\.com\/media\/assets\/[^)\s]+\.(?:png|gif|webp|jpg|jpeg)(?:\?[^)\s]*)?)\)/gi,
    /!\[[^\]]*\]\((https?:\/\/www\.spriters-resource\.com\/media\/assets\/[^)\s]+\.(?:png|gif|webp|jpg|jpeg)(?:\?[^)\s]*)?)\)/gi,
    /https?:\/\/www\.spriters-resource\.com\/media\/assets\/[^\s"')]+\.(?:png|gif|webp|jpg|jpeg)(?:\?[^\s"')]*)?/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(assetPageText)) !== null) {
      add(match[1] || match[0]);
    }
  }

  return candidates[0] || null;
}

function buildSpriteRecordsFromBoxes(imageData, boxes) {
  const frames = cropFramesFromBoxes(imageData, boxes);
  return boxes.map((box, idx) => ({
    id: idx + 1,
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    data: frames[idx].data,
  }));
}

function autoDetectCharacterSprites(imageData, strictness = 0.65) {
  const s = Math.max(0, Math.min(1, Number(strictness) || 0));
  const profile = {
    minW: Math.max(2, Math.round(5 - 2 * s)),
    maxW: Math.round(140 + 100 * s),
    minH: Math.max(2, Math.round(5 - 2 * s)),
    maxH: Math.round(140 + 100 * s),
    rowTolerance: Math.round(12 + 10 * s),
    maxFrames: Math.round(900 + 2100 * s),
    minPixels: Math.max(3, Math.round(12 - 8 * s)),
  };

  const rawBoxes = extractSpriteBoxes(imageData, profile, s);
  const mergePad = Math.round(1 + s);
  const mergePasses = Math.round(1 + s);
  const mergedBoxes = mergeNearbyBoxes(rawBoxes, {
    pad: mergePad,
    maxPasses: mergePasses,
    maxMergedW: Math.round(72 + 80 * s),
    maxMergedH: Math.round(72 + 80 * s),
  });
  const minArea = Math.max(8, Math.round(24 - 12 * s));
  const minDensity = Math.max(0.03, 0.08 - 0.04 * s);
  const boxes = mergedBoxes
    .filter((b) => b.w * b.h >= minArea)
    .filter((b) => (b.count / Math.max(1, b.w * b.h)) >= minDensity)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));

  return buildSpriteRecordsFromBoxes(imageData, boxes.slice(0, profile.maxFrames));
}

function renderDetectStrictnessUI() {
  const value = Math.max(0, Math.min(1, Number(state.characters.detectStrictness) || 0));
  el.detectStrictness.value = String(value);
  el.detectStrictnessValue.textContent = value.toFixed(2);
  updateGeneralButtonStates();
}

function updateSpriteSheetMetaText() {
  const imageData = state.characters.sheetImageData;
  if (!imageData) {
    el.spriteSheetMeta.textContent = "No sheet loaded.";
    return;
  }

  el.spriteSheetMeta.textContent =
    `sheet: ${imageData.width}x${imageData.height}\n` +
    `detected sprites: ${state.characters.sprites.length}\n` +
    `strictness: ${Number(state.characters.detectStrictness || 0).toFixed(2)}\n` +
    `asset page: ${state.characters.loadedAssetUrl || "n/a"}\n` +
    `sheet url: ${state.characters.loadedSheetUrl || "local file"}`;
}

function runCharacterDetection(strictness = state.characters.detectStrictness) {
  const imageData = state.characters.sheetImageData;
  if (!imageData) {
    throw new Error("No sheet loaded.");
  }

  const s = Math.max(0, Math.min(1, Number(strictness) || 0));
  state.characters.detectStrictness = s;
  const detected = autoDetectCharacterSprites(imageData, s);
  state.characters.sprites = detected;

  renderDetectStrictnessUI();
  updateSpriteSheetMetaText();
  renderSpritePalette();
  renderActionTimeline();
  startCharacterPreview();
  scheduleCharacterAutosave();
  return detected;
}

function runDetectStrictnessSweep() {
  const imageData = state.characters.sheetImageData;
  if (!imageData) {
    throw new Error("No sheet loaded.");
  }

  const trials = 20;
  let best = null;

  for (let i = 0; i < trials; i += 1) {
    const strictness = i / (trials - 1);
    const detected = autoDetectCharacterSprites(imageData, strictness);
    const score = detected.length;
    if (!best || score > best.score) {
      best = { strictness, score, detected };
    }
  }

  state.characters.detectStrictness = best.strictness;
  state.characters.sprites = best.detected;
  renderDetectStrictnessUI();
  updateSpriteSheetMetaText();
  renderSpritePalette();
  renderActionTimeline();
  startCharacterPreview();
  scheduleCharacterAutosave();

  el.detectSummary.textContent =
    `Best of 20 strictness runs: ${best.strictness.toFixed(2)} with ${best.score} sprites.`;

  return best;
}

function renderSpriteThumb(sprite, canvas) {
  const ctx = canvas.getContext("2d");
  const maxSide = Math.max(sprite.w, sprite.h);
  const scale = Math.max(1, Math.floor(48 / maxSide));
  canvas.width = sprite.w * scale;
  canvas.height = sprite.h * scale;

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = sprite.w;
  srcCanvas.height = sprite.h;
  srcCanvas.getContext("2d").putImageData(new ImageData(sprite.data, sprite.w, sprite.h), 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(srcCanvas, 0, 0, canvas.width, canvas.height);
}

function renderSpritePalette() {
  while (el.spritePalette.firstChild) {
    el.spritePalette.removeChild(el.spritePalette.firstChild);
  }

  for (const sprite of state.characters.sprites) {
    const chip = document.createElement("div");
    chip.className = "sprite-chip";
    chip.draggable = true;
    chip.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/sprite-id", String(sprite.id));
      event.dataTransfer.effectAllowed = "copy";
    });

    const canvas = document.createElement("canvas");
    renderSpriteThumb(sprite, canvas);
    chip.appendChild(canvas);

    const meta = document.createElement("div");
    meta.textContent = `#${sprite.id} ${sprite.w}x${sprite.h}`;
    chip.appendChild(meta);

    el.spritePalette.appendChild(chip);
  }
}

function getSelectedAction() {
  return state.characters.actions[state.characters.selectedAction] || null;
}

function ensureAction(name) {
  const key = (name || "").trim().toLowerCase().replace(/[^a-z0-9_\-]+/g, "_");
  if (!key) return null;
  if (!state.characters.actions[key]) {
    state.characters.actions[key] = { name: key, frames: [] };
  }
  state.characters.selectedAction = key;
  return state.characters.actions[key];
}

function renderActionSelect() {
  while (el.actionSelect.firstChild) {
    el.actionSelect.removeChild(el.actionSelect.firstChild);
  }

  const keys = Object.keys(state.characters.actions);
  for (const key of keys) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    if (key === state.characters.selectedAction) opt.selected = true;
    el.actionSelect.appendChild(opt);
  }

  updateGeneralButtonStates();
}

function addFrameToSelectedAction(spriteId) {
  const action = getSelectedAction();
  if (!action) return;
  action.frames.push({ spriteId, durationMs: 120, offsetX: 0, offsetY: 0, offsetZ: 0 });
  renderActionTimeline();
  scheduleCharacterAutosave();
}

function renderActionTimeline() {
  while (el.actionTimeline.firstChild) {
    el.actionTimeline.removeChild(el.actionTimeline.firstChild);
  }

  const action = getSelectedAction();
  if (!action) {
    el.previewInfo.textContent = "No action selected.";
    return;
  }

  action.frames.forEach((frame, idx) => {
    const sprite = state.characters.sprites.find((s) => s.id === frame.spriteId);
    if (!sprite) return;

    const row = document.createElement("div");
    row.className = "timeline-frame";

    const thumb = document.createElement("canvas");
    renderSpriteThumb(sprite, thumb);
    row.appendChild(thumb);

    const controls = document.createElement("div");
    controls.className = "frame-controls";

    const fields = [
      ["ms", "durationMs"],
      ["x", "offsetX"],
      ["y", "offsetY"],
      ["z", "offsetZ"],
    ];

    for (const [label, key] of fields) {
      const input = document.createElement("input");
      input.type = "number";
      input.value = String(frame[key]);
      input.title = `${label} offset`;
      input.addEventListener("change", () => {
        frame[key] = Number(input.value) || 0;
        scheduleCharacterAutosave();
      });
      controls.appendChild(input);
    }

    row.appendChild(controls);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "danger";
    removeBtn.textContent = `Remove ${idx + 1}`;
    removeBtn.addEventListener("click", () => {
      action.frames.splice(idx, 1);
      renderActionTimeline();
      scheduleCharacterAutosave();
    });
    row.appendChild(removeBtn);

    el.actionTimeline.appendChild(row);
  });
}

function renderPreviewInfo(text) {
  el.previewInfo.textContent = text;
}

function drawCharacterPreview(now) {
  const c = state.characters;
  const canvas = el.charPreviewCanvas;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#10213a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const action = getSelectedAction();
  if (!action || action.frames.length === 0) {
    ctx.fillStyle = "#aac7ff";
    ctx.font = "14px Space Grotesk";
    ctx.fillText("Add timeline frames to preview.", 16, 24);
    c.previewRafId = requestAnimationFrame(drawCharacterPreview);
    return;
  }

  const dt = c.previewLastTs ? now - c.previewLastTs : 16;
  c.previewLastTs = now;
  c.previewElapsed += dt;

  let current = action.frames[c.previewFrameIndex];
  if (c.previewElapsed >= Math.max(20, Number(current.durationMs) || 120)) {
    c.previewElapsed = 0;
    c.previewFrameIndex = (c.previewFrameIndex + 1) % action.frames.length;
    current = action.frames[c.previewFrameIndex];
  }

  const sprite = state.characters.sprites.find((s) => s.id === current.spriteId);
  if (sprite) {
    const src = document.createElement("canvas");
    src.width = sprite.w;
    src.height = sprite.h;
    src.getContext("2d").putImageData(new ImageData(sprite.data, sprite.w, sprite.h), 0, 0);

    const scale = 3;
    const drawW = sprite.w * scale;
    const drawH = sprite.h * scale;
    const x = Math.floor((canvas.width - drawW) / 2 + (Number(current.offsetX) || 0));
    const y = Math.floor((canvas.height - drawH) / 2 + (Number(current.offsetY) || 0) - (Number(current.offsetZ) || 0));

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, x, y, drawW, drawH);

    renderPreviewInfo(
      `action: ${c.selectedAction}\nframe: ${c.previewFrameIndex + 1}/${action.frames.length}\n` +
      `sprite: #${sprite.id} ${sprite.w}x${sprite.h}\n` +
      `offset: x=${current.offsetX}, y=${current.offsetY}, z=${current.offsetZ}`
    );
  }

  c.previewRafId = requestAnimationFrame(drawCharacterPreview);
}

function startCharacterPreview() {
  const c = state.characters;
  if (c.previewRafId != null) cancelAnimationFrame(c.previewRafId);
  c.previewLastTs = 0;
  c.previewElapsed = 0;
  c.previewFrameIndex = 0;
  c.previewRafId = requestAnimationFrame(drawCharacterPreview);
}

async function loadSheetFromImage(image, meta = {}) {
  const imageData = imageToImageData(image);
  const detected = autoDetectCharacterSprites(imageData, state.characters.detectStrictness);

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);

  state.characters.loadedAssetUrl = meta.assetUrl || null;
  state.characters.loadedSheetUrl = meta.sheetUrl || null;
  state.characters.sheetDataUrl = canvas.toDataURL("image/png");
  state.characters.sheetImageData = imageData;
  state.characters.sprites = detected;

  updateSpriteSheetMetaText();
  el.detectSummary.textContent = `Detected ${detected.length} sprites at strictness ${state.characters.detectStrictness.toFixed(2)}.`;

  renderSpritePalette();
  renderActionTimeline();
  startCharacterPreview();
  scheduleCharacterAutosave();
}

async function loadSheetFromAssetUrl(assetUrl) {
  el.charSearchStatus.textContent = "Loading asset page...";
  try {
    const pageText = await fetchTextViaProxy(assetUrl);
    const sheetUrl = parseSheetDownloadUrl(pageText);
    if (!sheetUrl) {
      throw new Error("Could not find downloadable sprite image on asset page.");
    }

    el.charSearchStatus.textContent = "Loading sprite sheet image...";
    const image = await loadImageFromUrl(sheetUrl);
    await loadSheetFromImage(image, { assetUrl, sheetUrl });
    el.charSearchStatus.textContent = "Sheet loaded and sprites detected.";
  } catch (err) {
    el.charSearchStatus.textContent = `Could not auto-load sheet: ${err.message}. Use Load Sheet File.`;
  }
}

function exportCharacterJson() {
  const payload = characterProjectSnapshot();

  const fileNameBase = ((el.characterFileName.value || "character").trim() || "character").replace(/[^a-z0-9_\-]+/gi, "_");
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileNameBase}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus(`Character JSON saved: ${fileNameBase}.json`);
}

function dataUrlToBlob(dataUrl) {
  const [header, body] = String(dataUrl || "").split(",", 2);
  if (!header || !body) {
    throw new Error("Invalid sheet image data.");
  }

  const mimeMatch = header.match(/^data:([^;]+);base64$/i);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function saveCharacterBundle() {
  const currentName = (el.characterFileName.value || "character").trim() || "character";
  const askedName = window.prompt("Character name:", currentName);
  if (askedName == null) {
    throw new DOMException("User cancelled", "AbortError");
  }

  const normalizedName = askedName.trim() || currentName;
  el.characterFileName.value = normalizedName;

  const fileNameBase = normalizedName.replace(/[^a-z0-9_\-]+/gi, "_");

  const payload = characterProjectSnapshot();
  if (!payload?.source?.sheetDataUrl) {
    throw new Error("No sprite sheet loaded yet.");
  }

  payload.bundle = {
    version: 1,
    folderName: fileNameBase,
    sheetFile: "sheet.png",
    jsonFile: `${fileNameBase}.json`,
  };

  const jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const sheetBlob = dataUrlToBlob(payload.source.sheetDataUrl);

  if (typeof window.showDirectoryPicker === "function") {
    const rootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    const charDirHandle = await rootHandle.getDirectoryHandle(fileNameBase, { create: true });

    const jsonHandle = await charDirHandle.getFileHandle(`${fileNameBase}.json`, { create: true });
    const jsonWritable = await jsonHandle.createWritable();
    await jsonWritable.write(jsonBlob);
    await jsonWritable.close();

    const sheetHandle = await charDirHandle.getFileHandle("sheet.png", { create: true });
    const sheetWritable = await sheetHandle.createWritable();
    await sheetWritable.write(sheetBlob);
    await sheetWritable.close();

    setStatus(`Character bundle saved: ${fileNameBase}/ (${fileNameBase}.json + sheet.png)`);
    return;
  }

  // Fallback for browsers without File System Access API.
  downloadBlob(jsonBlob, `${fileNameBase}__${fileNameBase}.json`);
  downloadBlob(sheetBlob, `${fileNameBase}__sheet.png`);
  setStatus("Browser does not support folder write. Downloaded JSON + sheet files separately.");
}

async function importCharacterJsonFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  await applyCharacterProjectData(data);
  scheduleCharacterAutosave();
}

function bindEvents() {
  el.menuMap.addEventListener("click", () => {
    switchView("map");
  });

  el.menuCharacters.addEventListener("click", () => {
    switchView("characters");
    startCharacterPreview();
  });

  el.btnResize.addEventListener("click", () => {
    const rows = Number(el.rowsInput.value);
    const cols = Number(el.colsInput.value);
    const expectedMasters = Number(el.mastersInput.value);

    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > 20 || cols > 20) {
      setStatus("Rows and columns must be integers between 1 and 20.");
      return;
    }

    if (!Number.isInteger(expectedMasters) || expectedMasters < 1 || expectedMasters > 10) {
      setStatus("Expected masters must be an integer between 1 and 10.");
      return;
    }

    state.expectedMasters = expectedMasters;
    rebuildGrid(rows, cols, false);
    setStatus(`Grid resized to ${cols}x${rows}. `);
    saveMapAutosave();
  });

  el.rowsInput.addEventListener("input", updateGeneralButtonStates);
  el.colsInput.addEventListener("input", updateGeneralButtonStates);
  el.mastersInput.addEventListener("input", updateGeneralButtonStates);

  el.masterIpInput.addEventListener("change", () => {
    const tile = getTileById(state.selectedTileId);
    if (!tile || !tile.isMaster) return;
    const ip = el.masterIpInput.value.trim();
    if (ip) {
      state.masterIPs[tile.id] = ip;
    } else {
      delete state.masterIPs[tile.id];
    }
    renderTileDetails();
    render();
    setStatus(`Master tile ${tile.id} IP set to ${ip || "(cleared)"}.`);
    saveMapAutosave();
    updateGeneralButtonStates();
  });

  if (el.btnWizardDiscover) {
    el.btnWizardDiscover.addEventListener("click", async () => {
      await discoverTwinklyDevices();
    });
  }

  if (el.wizardDeviceSelect) {
    el.wizardDeviceSelect.addEventListener("change", () => {
      state.wizard.selectedIp = el.wizardDeviceSelect.value;
      updateWizardOverrideInputForSelection();
      if (state.wizard.selectedIp) {
        setWizardStatus(`Selected discovered master ${state.wizard.selectedIp}. Start mapping when ready.`);
      }
      updateWizardControlStates();
      saveMapAutosave();
    });
  }

  if (el.wizardTileCountOverride) {
    el.wizardTileCountOverride.addEventListener("change", () => {
      const ip = (el.wizardDeviceSelect?.value || state.wizard.selectedIp || "").trim();
      if (!ip) {
        el.wizardTileCountOverride.value = "";
        updateWizardControlStates();
        return;
      }

      const raw = Number(el.wizardTileCountOverride.value);
      if (Number.isInteger(raw) && raw >= 1 && raw <= MAX_TILES_PER_MASTER) {
        state.wizard.tileCountOverrides[ip] = raw;
        setWizardStatus(`Tile override for ${ip} set to ${raw}.`);
      } else {
        delete state.wizard.tileCountOverrides[ip];
        el.wizardTileCountOverride.value = "";
        setWizardStatus(`Tile override for ${ip} cleared (auto).`);
      }

      updateWizardControlStates();
      saveMapAutosave();
    });
  }

  if (el.btnWizardStartDevice) {
    el.btnWizardStartDevice.addEventListener("click", async () => {
      const ip = (el.wizardDeviceSelect?.value || state.wizard.selectedIp || "").trim();
      try {
        await wizardStartForIp(ip);
      } catch (err) {
        setWizardStatus(`Could not start wizard for ${ip}: ${err.message}`);
      }
    });
  }

  if (el.btnWizardRotateLeft) {
    el.btnWizardRotateLeft.addEventListener("click", async () => {
      try {
        await wizardRotate(-90);
      } catch (err) {
        setWizardStatus(`Rotate left failed: ${err.message}`);
      }
    });
  }

  if (el.btnWizardRotateRight) {
    el.btnWizardRotateRight.addEventListener("click", async () => {
      try {
        await wizardRotate(90);
      } catch (err) {
        setWizardStatus(`Rotate right failed: ${err.message}`);
      }
    });
  }

  if (el.btnWizardConfirmTile) {
    el.btnWizardConfirmTile.addEventListener("click", async () => {
      try {
        await wizardConfirmTile();
      } catch (err) {
        setWizardStatus(`Confirm failed: ${err.message}`);
      }
    });
  }

  if (el.btnWizardSkipSegment) {
    el.btnWizardSkipSegment.addEventListener("click", () => {
      wizardSkipSegment();
    });
  }

  if (el.btnWizardGroupPrev) {
    el.btnWizardGroupPrev.addEventListener("click", async () => {
      try {
        await wizardStepProbeGroup(-1);
      } catch (err) {
        setWizardStatus(`Group prev failed: ${err.message}`);
      }
    });
  }

  if (el.btnWizardGroupNext) {
    el.btnWizardGroupNext.addEventListener("click", async () => {
      try {
        await wizardStepProbeGroup(1);
      } catch (err) {
        setWizardStatus(`Group next failed: ${err.message}`);
      }
    });
  }

  if (el.btnWizardGroupSelect) {
    el.btnWizardGroupSelect.addEventListener("click", () => {
      wizardSelectCurrentProbeGroup();
    });
  }

  if (el.btnWizardUnlockTile) {
    el.btnWizardUnlockTile.addEventListener("click", () => {
      unlockSelectedWizardTile();
    });
  }

  if (el.btnWizardUnlockAll) {
    el.btnWizardUnlockAll.addEventListener("click", () => {
      unlockAllWizardTiles();
    });
  }

  if (el.btnWizardReplay) {
    el.btnWizardReplay.addEventListener("click", async () => {
      try {
        await replayWizardGreenAudit();
      } catch (err) {
        setWizardStatus(`Replay failed: ${err.message}`);
      }
    });
  }

  if (el.btnWizardNextDevice) {
    el.btnWizardNextDevice.addEventListener("click", async () => {
      try {
        await wizardStartNextDevice();
      } catch (err) {
        setWizardStatus(`Next master failed: ${err.message}`);
      }
    });
  }

  if (el.btnWizardCancel) {
    el.btnWizardCancel.addEventListener("click", () => {
      wizardCancel();
    });
  }

  el.btnExport.addEventListener("click", exportData);
  el.btnReset.addEventListener("click", resetAll);

  el.demoPreset.addEventListener("change", async (event) => {
    state.demoPreset = event.target.value;
    await loadPresetFrame(state.demoPreset);
    render();
  });

  el.demoImageFile.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;

    try {
      resetAnimation();
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Could not decode image."));
          img.src = reader.result;
        };
        reader.onerror = () => reject(new Error("Could not read file."));
        reader.readAsDataURL(file);
      });

      createFrameFromImage(image, {
        label: `Custom screenshot: ${file.name}`,
        imageUrl: null,
        sourcePage: null,
        presetKey: null,
        custom: true,
      });
      setStatus("Custom screenshot loaded.");
    } catch (err) {
      setStatus(`Image load failed: ${err.message}`);
    } finally {
      event.target.value = "";
    }
  });

  el.importFile.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importData(data);
    } catch (err) {
      setStatus(`Import failed: ${err.message}`);
    } finally {
      event.target.value = "";
    }
  });

  el.gridSvg.addEventListener("pointerdown", beginDemoDrag);
  el.gridSvg.addEventListener("pointermove", moveDemoDrag);
  window.addEventListener("pointerup", endDemoDrag);
  window.addEventListener("pointercancel", endDemoDrag);

  el.btnCharSearch.addEventListener("click", runCharacterSearch);
  el.charSearchInput.addEventListener("input", updateGeneralButtonStates);
  el.charSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runCharacterSearch();
    }
  });

  el.charSheetFile.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;

    try {
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Could not decode image."));
          img.src = reader.result;
        };
        reader.onerror = () => reject(new Error("Could not read file."));
        reader.readAsDataURL(file);
      });

      await loadSheetFromImage(image, { sheetUrl: file.name });
      el.charSearchStatus.textContent = `Loaded local sheet: ${file.name}`;
    } catch (err) {
      el.charSearchStatus.textContent = `Sheet load failed: ${err.message}`;
    } finally {
      event.target.value = "";
    }
  });

  el.detectStrictness.addEventListener("input", () => {
    state.characters.detectStrictness = Math.max(0, Math.min(1, Number(el.detectStrictness.value) || 0.65));
    renderDetectStrictnessUI();
  });

  el.btnDetectNow.addEventListener("click", () => {
    try {
      const detected = runCharacterDetection();
      el.detectSummary.textContent =
        `Detected ${detected.length} sprites at strictness ${state.characters.detectStrictness.toFixed(2)}.`;
    } catch (err) {
      el.detectSummary.textContent = `Detect failed: ${err.message}`;
    }
  });

  el.btnDetectSweep.addEventListener("click", () => {
    try {
      runDetectStrictnessSweep();
    } catch (err) {
      el.detectSummary.textContent = `Sweep failed: ${err.message}`;
    }
  });

  el.btnCreateAction.addEventListener("click", () => {
    const action = ensureAction(el.actionNameInput.value);
    if (!action) {
      setStatus("Action name is required.");
      return;
    }
    renderActionSelect();
    renderActionTimeline();
    startCharacterPreview();
    scheduleCharacterAutosave();
  });
  el.actionNameInput.addEventListener("input", updateGeneralButtonStates);

  el.actionSelect.addEventListener("change", (event) => {
    state.characters.selectedAction = event.target.value;
    renderActionTimeline();
    startCharacterPreview();
    scheduleCharacterAutosave();
  });

  el.timelineDrop.addEventListener("dragover", (event) => {
    event.preventDefault();
    el.timelineDrop.classList.add("over");
  });

  el.timelineDrop.addEventListener("dragleave", () => {
    el.timelineDrop.classList.remove("over");
  });

  el.timelineDrop.addEventListener("drop", (event) => {
    event.preventDefault();
    el.timelineDrop.classList.remove("over");
    const raw = event.dataTransfer.getData("text/sprite-id");
    const spriteId = Number(raw);
    if (!Number.isInteger(spriteId) || spriteId < 1) return;
    addFrameToSelectedAction(spriteId);
    startCharacterPreview();
  });

  el.btnSaveCharacterJson.addEventListener("click", async () => {
    try {
      await saveCharacterBundle();
    } catch (err) {
      if (err?.name === "AbortError") {
        setStatus("Save cancelled.");
        return;
      }
      setStatus(`Character save failed: ${err.message}`);
    }
  });
  el.loadCharacterJson.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;

    try {
      await importCharacterJsonFile(file);
      setStatus(`Character JSON loaded: ${file.name}`);
    } catch (err) {
      setStatus(`Character JSON import failed: ${err.message}`);
    } finally {
      event.target.value = "";
    }
  });

  updateGeneralButtonStates();
}

const MAP_AUTOSAVE_KEY = "gamewall.map.autosave.v1";

function saveMapAutosave() {
  try {
    const payload = {
      rows: state.rows,
      cols: state.cols,
      expectedMasters: state.expectedMasters,
      masters: state.tiles
        .filter((t) => t.isMaster)
        .map((t) => ({
          id: t.id, row: t.row, col: t.col,
          ip: state.masterIPs[t.id] || null,
          leds: state.masterLeds[t.id] || null,
        })),
      tileRotations: { ...state.tileRotations },
      tiles: state.tiles.map((tile) => {
        const lock = state.wizard.lockedTiles[String(tile.id)] || null;
        return {
          tileId: tile.id,
          row: tile.row,
          col: tile.col,
          isMaster: tile.isMaster,
          rotation: state.tileRotations[tile.id] || 0,
          masterIp: lock?.ip || (tile.isMaster ? (state.masterIPs[tile.id] || null) : null),
          segment: Number.isInteger(lock?.segment) ? lock.segment : (tile.isMaster ? 0 : null),
        };
      }),
      wizard: {
        selectedIp: state.wizard.selectedIp,
        lockedTiles: { ...state.wizard.lockedTiles },
        assignments: state.wizard.assignments.slice(),
        tileCountOverrides: { ...state.wizard.tileCountOverrides },
      },
      demoPreset: state.demoPreset,
      demoOffsetX: state.demoOffsetX,
      demoOffsetY: state.demoOffsetY,
    };
    localStorage.setItem(MAP_AUTOSAVE_KEY, JSON.stringify(payload));
    renderExportPreview();
  } catch (_e) {}
}

function restoreMapAutosave() {
  try {
    const raw = localStorage.getItem(MAP_AUTOSAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    const rows = Number(d.rows);
    const cols = Number(d.cols);
    if (!rows || !cols || rows < 1 || cols < 1) return false;

    state.expectedMasters = Number(d.expectedMasters) || 3;
    el.mastersInput.value = String(state.expectedMasters);
    el.rowsInput.value = String(rows);
    el.colsInput.value = String(cols);
    rebuildGrid(rows, cols, false);

    state.masterIPs = {};
    state.masterLeds = {};
    state.tileRotations = {};
    state.wizard.selectedIp = String(d.wizard?.selectedIp || "");
    state.wizard.lockedTiles = (d.wizard && typeof d.wizard.lockedTiles === "object" && d.wizard.lockedTiles)
      ? d.wizard.lockedTiles
      : {};
    state.wizard.assignments = Array.isArray(d.wizard?.assignments) ? d.wizard.assignments : [];
    state.wizard.tileCountOverrides = (d.wizard && typeof d.wizard.tileCountOverrides === "object" && d.wizard.tileCountOverrides)
      ? d.wizard.tileCountOverrides
      : {};
    state.wizard.queueIps = [];
    state.wizard.blinkTimerId = null;
    state.wizard.blinkOn = false;
    state.wizard.blinkInFlight = false;
    state.wizard.segmentLedGroups = [];
    state.wizard.segmentGroupSource = "fallback";
    state.wizard.segmentResolvedGroupIndex = {};
    state.wizard.currentProbeGroupIndex = null;
    state.wizard.probeCursor = 0;
    state.wizard.segmentTileIds = {};
    state.wizard.skippedSegments = [];
    state.wizard.currentIp = "";
    state.wizard.startNonce = 0;
    state.wizard.reportedLedCount = 0;
    state.wizard.ledCount = 0;
    state.wizard.totalSegments = 0;
    state.wizard.currentSegment = 0;
    state.wizard.yellowShown = false;
    state.wizard.rawLedCount = 0;
    state.wizard.active = false;
    state.wizard.phase = "idle";
    updateWizardDeviceSelect();
    renderWizardProgressTable();
    if (state.wizard.selectedIp && el.wizardDeviceSelect) {
      el.wizardDeviceSelect.value = state.wizard.selectedIp;
    }
    for (const m of d.masters || []) {
      const tile = getTileById(Number(m.id));
      if (tile) {
        tile.isMaster = true;
        if (m.ip) state.masterIPs[tile.id] = m.ip;
        if (m.leds) state.masterLeds[tile.id] = m.leds;
      }
    }

    for (const item of d.tiles || []) {
      const tile = getTileById(Number(item.tileId));
      if (!tile) continue;
      if (typeof item.isMaster === "boolean") tile.isMaster = item.isMaster;
      const rot = Number(item.rotation);
      if ([0, 90, 180, 270].includes(rot)) state.tileRotations[tile.id] = rot;
      const ip = typeof item.masterIp === "string" ? item.masterIp : null;
      const segment = Number(item.segment);
      if (ip && Number.isInteger(segment) && segment >= 0) {
        state.wizard.lockedTiles[String(tile.id)] = {
          ip,
          segment,
          role: segment === 0 ? "master" : "slave",
          rotation: state.tileRotations[tile.id] || 0,
        };
        state.wizard.assignments.push({
          ip,
          segment,
          tileId: tile.id,
          role: segment === 0 ? "master" : "slave",
        });
      }
    }
    if (d.tileRotations && typeof d.tileRotations === "object") {
      for (const [k, v] of Object.entries(d.tileRotations)) {
        const numV = Number(v);
        if ([0, 90, 180, 270].includes(numV)) state.tileRotations[Number(k)] = numV;
      }
    }
    if (d.demoPreset && DEMOS[d.demoPreset]) {
      state.demoPreset = d.demoPreset;
      el.demoPreset.value = d.demoPreset;
      loadPresetFrame(d.demoPreset);
    }
    if (Number.isInteger(d.demoOffsetX)) state.demoOffsetX = d.demoOffsetX;
    if (Number.isInteger(d.demoOffsetY)) state.demoOffsetY = d.demoOffsetY;
    clampDemoOffsets();
    updateHeader();
    render();
    runValidation();
    setStatus("Map restored from last session.");
    return true;
  } catch (_e) {
    return false;
  }
}

async function init() {
  renderDetectStrictnessUI();
  switchView("map");
  renderActionSelect();
  renderActionTimeline();
  renderCharacterSearchResults();
  bindEvents();
  await restoreCharacterAutosaveIfAny();
  updateWizardDeviceSelect();
  renderWizardProgressTable();
  setWizardStatus("Wizard idle. Discover masters to begin.");

  // Restore last map session if available, otherwise build default grid.
  if (!restoreMapAutosave()) {
    rebuildGrid(state.rows, state.cols, false);
    await loadPresetFrame(state.demoPreset);
  }

  setStatus("Ready. Set masters and map tile locations with the Hardware Wizard. Drag on the wall to pan the demo window.");
  updateWizardControlStates();
  updateGeneralButtonStates();
}

init();
