const CONFIG = {
  frameCount: 20,
  framePath: (index) => `assets-webp/frame-${String(index).padStart(2, '0')}.webp?v=webp-85`,
  fit: 'cover',
  backgroundColor: '#0000ff',
  wheelSensitivity: 0.0022,
  touchSensitivity: 0.008,
  keyboardImpulse: 0.34,
  scrollSensitivity: 0.002,
  inputSmoothing: 0.24,
  inertia: 0.78,
  maxVelocity: 0.13,
  maxPendingImpulse: 0.38,
  maxWheelDelta: 72,
  maxTouchDelta: 120,
  compactStart: 0.72,
  compactEnd: 1.12,
  compactIconHeight: 96,
  compactVisibleBounds: { x: 768, y: 104, w: 484, h: 932 },
  maxDevicePixelRatio: 2,
};

const canvas = document.getElementById('runnerCanvas');
const ctx = canvas?.getContext('2d', { alpha: true });
const loading = document.getElementById('loading');
const runnerStage = document.querySelector('.runner-stage');
const runnerSlot = document.querySelector('.runner-slot');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const frames = [];
let loadedFrames = 0;
let position = 0;
let velocity = 0;
let pendingImpulse = 0;
let resizePending = true;
let ready = false;
let renderedSignature = '';
let lastScrollY = window.scrollY || 0;
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

function preloadFrames() {
  return Promise.all(
    Array.from({ length: CONFIG.frameCount }, (_, index) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          frames[index] = img;
          loadedFrames += 1;

          if (loading) {
            loading.textContent = `Loading sequence ${loadedFrames}/${CONFIG.frameCount}`;
          }

          if (index === 0 && canvas && ctx) {
            resizeCanvas();
            renderFrame(0, true);
            document.body.classList.add('has-runner-frame');
          }

          resolve(img);
        };
        img.onerror = () => reject(new Error(`Frame non caricato: ${CONFIG.framePath(index)}`));
        img.src = CONFIG.framePath(index);
      });
    })
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function easeInOut(value) {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function resizeCanvas() {
  if (!canvas || !ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDevicePixelRatio);
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

function getHeroCompactProgress() {
  const viewport = getViewportSize();
  const start = viewport.height * CONFIG.compactStart;
  const end = viewport.height * CONFIG.compactEnd;

  if (end <= start) return 1;

  return easeInOut((window.scrollY - start) / (end - start));
}

function getBaseDrawRect(img) {
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

  return {
    x: (viewportW - drawW) / 2,
    y: (viewportH - drawH) / 2,
    w: drawW,
    h: drawH,
  };
}

function getRunnerSlotRect() {
  const viewport = getViewportSize();
  const rect = runnerSlot?.getBoundingClientRect();

  if (!rect || rect.width === 0 || rect.height === 0) {
    return {
      x: viewport.width / 2 - 78,
      y: 20,
      w: 156,
      h: CONFIG.compactIconHeight,
    };
  }

  return {
    x: rect.left,
    y: rect.top,
    w: rect.width,
    h: rect.height,
  };
}

function getDrawRect(img) {
  const fullRect = getBaseDrawRect(img);
  const slotRect = getRunnerSlotRect();
  const viewport = getViewportSize();
  const visibleHeight = Math.min(CONFIG.compactIconHeight, Math.max(slotRect.height * 1.75, viewport.height * 0.09));
  const visibleScale = visibleHeight / CONFIG.compactVisibleBounds.h;
  const compactW = img.width * visibleScale;
  const compactH = img.height * visibleScale;
  const visibleCenterX = (CONFIG.compactVisibleBounds.x + CONFIG.compactVisibleBounds.w / 2) * visibleScale;
  const visibleCenterY = (CONFIG.compactVisibleBounds.y + CONFIG.compactVisibleBounds.h / 2) * visibleScale;
  const compactRect = {
    x: slotRect.x + slotRect.w / 2 - visibleCenterX,
    y: slotRect.y + slotRect.h / 2 - visibleCenterY,
    w: compactW,
    h: compactH,
  };
  const progress = getHeroCompactProgress();

  document.body.classList.toggle('runner-compact', progress > 0.72);

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

function renderFrame(rawPosition, force = false) {
  if (!canvas || !ctx || frames.length === 0) return;

  const viewport = getViewportSize();
  const frameIndex = getLoopedIndex(Math.floor(rawPosition));
  const compactProgress = getHeroCompactProgress();
  const signature = `${frameIndex}:${compactProgress.toFixed(3)}:${viewport.width}x${viewport.height}`;

  if (signature === renderedSignature && !force) return;

  const img = frames[frameIndex];
  if (!img) return;
  const rect = getDrawRect(img);

  ctx.clearRect(0, 0, viewport.width, viewport.height);
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
  document.body.classList.add('canvas-ready');

  renderedSignature = signature;
}

function addImpulse(amount) {
  if (prefersReducedMotion.matches || !Number.isFinite(amount) || amount <= 0) return;

  pendingImpulse = Math.min(pendingImpulse + amount, CONFIG.maxPendingImpulse);
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

function normalizeWheelDelta(event) {
  const delta = Math.abs(event.deltaY) + Math.abs(event.deltaX);
  const unitMultiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? getViewportSize().height : 1;
  return clamp(delta * unitMultiplier, 0, CONFIG.maxWheelDelta);
}

function advanceFromWheel(event) {
  addImpulse(normalizeWheelDelta(event) * CONFIG.wheelSensitivity);
}

function advanceFromKeyboard(event) {
  const keys = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Space', 'Home', 'End'];
  if (!keys.includes(event.code)) return;

  addImpulse(CONFIG.keyboardImpulse);
}

function advanceFromScroll() {
  const currentScrollY = window.scrollY || 0;
  const delta = Math.abs(currentScrollY - lastScrollY);
  lastScrollY = currentScrollY;

  addImpulse(clamp(delta, 0, CONFIG.maxWheelDelta) * CONFIG.scrollSensitivity);
  renderedSignature = '';
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

  const deltaX = Math.abs(touch.clientX - lastTouchX);
  const deltaY = Math.abs(touch.clientY - lastTouchY);
  const normalizedDelta = clamp(deltaX + deltaY, 0, CONFIG.maxTouchDelta);

  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;

  addImpulse(normalizedDelta * CONFIG.touchSensitivity);
}

function advanceFromTouchEnd() {
  touchActive = false;
}

function updatePageBackground() {
  document.documentElement.style.backgroundColor = CONFIG.backgroundColor;
  document.body.style.backgroundColor = CONFIG.backgroundColor;

  if (canvas) {
    canvas.style.backgroundColor = 'transparent';
  }

  if (runnerStage) {
    runnerStage.style.backgroundColor = 'transparent';
  }
}

function queueResize() {
  resizePending = true;
}

function tick() {
  if (resizePending) {
    resizeCanvas();
  }

  if (ready) {
    advancePosition();
    renderFrame(position);
  }

  requestAnimationFrame(tick);
}

if (!canvas || !ctx) {
  if (loading) {
    loading.textContent = 'Canvas non disponibile';
  }
} else {
  window.addEventListener('resize', queueResize);
  window.addEventListener('orientationchange', queueResize);
  window.visualViewport?.addEventListener('resize', queueResize);
  window.addEventListener('scroll', advanceFromScroll, { passive: true });
  window.addEventListener('wheel', advanceFromWheel, { passive: true });
  window.addEventListener('keydown', advanceFromKeyboard, { passive: true });
  window.addEventListener('touchstart', advanceFromTouchStart, { passive: true });
  window.addEventListener('touchmove', advanceFromTouchMove, { passive: true });
  window.addEventListener('touchend', advanceFromTouchEnd, { passive: true });
  window.addEventListener('touchcancel', advanceFromTouchEnd, { passive: true });

  prefersReducedMotion.addEventListener?.('change', () => {
    velocity = 0;
    pendingImpulse = 0;
    renderedSignature = '';
  });

  updatePageBackground();

  preloadFrames()
    .then(() => {
      ready = true;
      document.body.classList.add('is-loaded');
      loading?.classList.add('is-hidden');
      resizeCanvas();
      renderFrame(0);
    })
    .catch((error) => {
      document.body.classList.add('runner-error');

      if (loading) {
        loading.textContent = error.message;
      }

      console.error(error);
    });

  tick();
}
