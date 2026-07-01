const CONFIG = {
  frameCount: 20,
  framePath: (index) => `assets-webp/frame-${String(index).padStart(2, '0')}.webp?v=webp-85`,

  // Profilo reattivo: basta meno scroll per completare il ciclo.
  wheelSensitivity: 0.0022,

  // Taglia i picchi dei mouse wheel tradizionali e dei trackpad molto sensibili.
  maxWheelDelta: 80,

  // Swipe mobile: come il wheel, qualunque direzione manda avanti la sequenza.
  touchSensitivity: 0.009,
  minTouchImpulse: 0.026,
  maxTouchDelta: 140,
  maxTouchPendingImpulse: 0.58,

  // Impedisce l'accumulo eccessivo di input durante scroll ripetuti.
  maxPendingImpulse: 0.32,

  // Più vicino a 1 = animazione più lunga e morbida dopo lo scroll.
  inertia: 0.78,

  // Smussa l'arrivo degli impulsi di scroll prima di applicarli alla sequenza.
  inputSmoothing: 0.24,

  // Interpola visivamente tra un frame e il successivo.
  frameInterpolation: false,

  // Limite reale di velocità: anche scrollando forte, l'animazione resta controllata.
  maxVelocity: 0.18,

  // Dimensionamento della sequenza nel viewport.
  fit: 'cover', // 'cover' o 'contain'

  backgroundColor: '#0000ff',

  // Dopo un ciclo il runner diventa un'icona fixed in alto, ma resta controllato dallo scroll.
  compactLoopCount: 1,
  compactIconHeight: 200,
  compactIconTop: 28,
  compactTransitionSpeed: 0.018,
  compactVisibleBounds: { x: 768, y: 104, w: 484, h: 932 },
};

const canvas = document.getElementById('runnerCanvas');
const ctx = canvas.getContext('2d', { alpha: true });
const loading = document.getElementById('loading');
const stage = document.querySelector('.stage');
const finalContent = document.getElementById('finalContent');

const frames = [];
let loadedFrames = 0;
let position = 0;
let velocity = 0;
let pendingImpulse = 0;
let completedLoops = 0;
let compactMode = false;
let compactProgress = 0;
let contentReady = false;
let renderedSignature = '';
let ready = false;
let resizePending = true;
let touchActive = false;
let lastTouchX = 0;
let lastTouchY = 0;

function getViewportSize() {
  const visualViewport = window.visualViewport;

  return {
    width: Math.round(visualViewport?.width || window.innerWidth),
    height: Math.round(visualViewport?.height || window.innerHeight),
  };
}

function updateViewportVars() {
  const { height } = getViewportSize();
  document.documentElement.style.setProperty('--app-height', `${height}px`);
}

function getSafeAreaInset(name) {
  const rawValue = getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = Number.parseFloat(rawValue);
  return Number.isFinite(value) ? value : 0;
}

function preloadFrames() {
  return Promise.all(
    Array.from({ length: CONFIG.frameCount }, (_, index) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          frames[index] = img;
          loadedFrames += 1;
          loading.textContent = `Loading sequence ${loadedFrames}/${CONFIG.frameCount}`;
          resolve(img);
        };
        img.onerror = () => reject(new Error(`Frame non caricato: ${CONFIG.framePath(index)}`));
        img.src = CONFIG.framePath(index);
      });
    })
  );
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = getViewportSize();
  const width = Math.round(viewport.width * dpr);
  const height = Math.round(viewport.height * dpr);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  resizePending = false;
  renderedSignature = '';
}

function getDrawRect(img) {
  const { width: viewportW, height: viewportH } = getViewportSize();
  const imageRatio = img.width / img.height;
  const viewportRatio = viewportW / viewportH;

  let drawW;
  let drawH;

  if (CONFIG.fit === 'contain') {
    if (imageRatio > viewportRatio) {
      drawW = viewportW;
      drawH = viewportW / imageRatio;
    } else {
      drawH = viewportH;
      drawW = viewportH * imageRatio;
    }
  } else if (imageRatio > viewportRatio) {
    drawH = viewportH;
    drawW = viewportH * imageRatio;
  } else {
    drawW = viewportW;
    drawH = viewportW / imageRatio;
  }

  const fullRect = {
    x: (viewportW - drawW) / 2,
    y: (viewportH - drawH) / 2,
    w: drawW,
    h: drawH,
  };

  if (!compactMode) return fullRect;

  const visibleScale = Math.min(CONFIG.compactIconHeight, viewportH * 0.3) / CONFIG.compactVisibleBounds.h;
  const compactW = img.width * visibleScale;
  const compactH = img.height * visibleScale;
  const visibleCenterX = (CONFIG.compactVisibleBounds.x + CONFIG.compactVisibleBounds.w / 2) * visibleScale;
  const compactRect = {
    x: viewportW / 2 - visibleCenterX,
    y: getSafeAreaInset('--safe-top') + CONFIG.compactIconTop - CONFIG.compactVisibleBounds.y * visibleScale,
    w: compactW,
    h: compactH,
  };
  const progress = easeInOut(compactProgress);

  return {
    x: fullRect.x + (compactRect.x - fullRect.x) * progress,
    y: fullRect.y + (compactRect.y - fullRect.y) * progress,
    w: fullRect.w + (compactRect.w - fullRect.w) * progress,
    h: fullRect.h + (compactRect.h - fullRect.h) * progress,
  };
}

function getLoopedIndex(index) {
  const looped = index % CONFIG.frameCount;
  return looped < 0 ? looped + CONFIG.frameCount : looped;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function easeInOut(value) {
  return value * value * (3 - 2 * value);
}

function drawImageFull(img, alpha = 1) {
  const rect = getDrawRect(img);
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
  ctx.globalAlpha = 1;
}

function updatePageBackground() {
  document.documentElement.style.backgroundColor = CONFIG.backgroundColor;
  document.documentElement.style.setProperty('--label-color', '#ffffff');
  document.body.style.backgroundColor = CONFIG.backgroundColor;
  canvas.style.backgroundColor = 'transparent';
}

function advancePosition() {
  velocity += pendingImpulse * CONFIG.inputSmoothing;
  pendingImpulse *= 1 - CONFIG.inputSmoothing;

  velocity = clamp(velocity, 0, CONFIG.maxVelocity);
  position += velocity;
  velocity *= CONFIG.inertia;

  if (velocity < 0.0004 && pendingImpulse < 0.0004) {
    velocity = 0;
    pendingImpulse = 0;
  }
}

function revealContent() {
  if (contentReady) return;

  contentReady = true;
  document.body.classList.add('content-ready');
  finalContent?.setAttribute('aria-hidden', 'false');
}

function enterCompactMode() {
  if (compactMode) return;

  compactMode = true;
  stage.classList.add('is-compact');
  renderedSignature = '';
}

function updateCompactMode() {
  if (compactMode) {
    compactProgress = Math.min(compactProgress + CONFIG.compactTransitionSpeed, 1);
    document.documentElement.style.setProperty('--compact-progress', compactProgress.toFixed(3));

    if (compactProgress >= 1) {
      revealContent();
    }

    return;
  }

  const nextCompletedLoops = Math.floor(position / CONFIG.frameCount);
  if (nextCompletedLoops === completedLoops) return;

  completedLoops = nextCompletedLoops;

  if (completedLoops >= CONFIG.compactLoopCount) {
    enterCompactMode();
  }
}

function renderPosition(rawPosition) {
  const viewport = getViewportSize();
  const basePosition = Math.floor(rawPosition);
  const frameA = getLoopedIndex(basePosition);
  const frameB = getLoopedIndex(basePosition + 1);
  const blend = CONFIG.frameInterpolation ? easeInOut(rawPosition - basePosition) : 0;
  const signature = `${frameA}:${frameB}:${blend.toFixed(3)}:${CONFIG.backgroundColor}:${compactProgress.toFixed(3)}:${viewport.width}x${viewport.height}`;

  if (signature === renderedSignature) return;

  ctx.clearRect(0, 0, viewport.width, viewport.height);
  drawImageFull(frames[frameA], 1);

  if (CONFIG.frameInterpolation && blend > 0.001) {
    drawImageFull(frames[frameB], blend);
  }

  renderedSignature = signature;
}

function normalizeWheelDelta(event) {
  const delta = Math.abs(event.deltaY) + Math.abs(event.deltaX);

  // deltaMode: 0 pixel, 1 line, 2 page.
  const unitMultiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? getViewportSize().height : 1;
  return clamp(delta * unitMultiplier, 0, CONFIG.maxWheelDelta);
}

function tick() {
  if (resizePending) {
    updateViewportVars();
    resizeCanvas();
  }

  if (ready) {
    advancePosition();
    updateCompactMode();
    renderPosition(position);
  }

  requestAnimationFrame(tick);
}

function advanceFromWheel(event) {
  event.preventDefault();

  // Regola chiave: si usa il valore assoluto dello scroll.
  // Quindi scroll verso il basso e verso l'alto mandano sempre avanti la sequenza.
  const normalizedDelta = normalizeWheelDelta(event);
  if (!Number.isFinite(normalizedDelta) || normalizedDelta === 0) return;

  pendingImpulse = Math.min(
    pendingImpulse + normalizedDelta * CONFIG.wheelSensitivity,
    CONFIG.maxPendingImpulse
  );
}

function advanceFromKeyboard(event) {
  const keys = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Space'];
  if (!keys.includes(event.code)) return;

  event.preventDefault();
  pendingImpulse = Math.min(
    pendingImpulse + (event.code.includes('Page') || event.code === 'Space' ? 0.5 : 0.22),
    CONFIG.maxPendingImpulse
  );
}

function advanceFromTouchStart(event) {
  const touch = event.touches[0];
  if (!touch) return;

  touchActive = true;
  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;
}

function advanceFromTouchMove(event) {
  if (!touchActive) return;

  const touch = event.touches[0];
  if (!touch) return;

  event.preventDefault();

  const deltaX = Math.abs(touch.clientX - lastTouchX);
  const deltaY = Math.abs(touch.clientY - lastTouchY);
  const normalizedDelta = clamp(deltaX + deltaY, 0, CONFIG.maxTouchDelta);

  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;

  if (!Number.isFinite(normalizedDelta) || normalizedDelta === 0) return;

  const touchImpulse = Math.max(normalizedDelta * CONFIG.touchSensitivity, CONFIG.minTouchImpulse);

  pendingImpulse = Math.min(
    pendingImpulse + touchImpulse,
    CONFIG.maxTouchPendingImpulse
  );
}

function advanceFromTouchEnd() {
  touchActive = false;
}

function queueResize() {
  resizePending = true;
}

updateViewportVars();

window.addEventListener('resize', queueResize);
window.addEventListener('orientationchange', queueResize);
window.visualViewport?.addEventListener('resize', queueResize);
window.visualViewport?.addEventListener('scroll', queueResize);

window.addEventListener('wheel', advanceFromWheel, { passive: false });
window.addEventListener('keydown', advanceFromKeyboard, { passive: false });
window.addEventListener('touchstart', advanceFromTouchStart, { passive: false });
window.addEventListener('touchmove', advanceFromTouchMove, { passive: false });
window.addEventListener('touchend', advanceFromTouchEnd, { passive: true });
window.addEventListener('touchcancel', advanceFromTouchEnd, { passive: true });

preloadFrames()
  .then(() => {
    ready = true;
    stage.classList.add('is-loaded');
    loading.classList.add('is-hidden');
    resizeCanvas();
    updatePageBackground();
    renderPosition(0);
  })
  .catch((error) => {
    loading.textContent = error.message;
    console.error(error);
  });

tick();
