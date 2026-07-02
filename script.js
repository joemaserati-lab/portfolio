const CONFIG = {
  debug: false,
  frameCount: 20,
  framePath: (index) => `assets-webp/frame-${String(index).padStart(2, '0')}.webp`,
  mobileFramePath: (index) => `asset-webp-mobile/mobile${String(index).padStart(2, '0')}.webp`,
  fit: 'cover',
  mobileFit: 'cover',
  mobileBreakpoint: 760,
  backgroundColor: '#0000ff',
  wheelSensitivity: 0.0022,
  touchSensitivity: 0.008,
  minTouchImpulse: 0.018,
  keyboardImpulse: 0.34,
  scrollSensitivity: 0.002,
  mobileDirectScrollSensitivity: 0.035,
  mobileDirectTouchSensitivity: 0.045,
  inputSmoothing: 0.24,
  inertia: 0.78,
  maxVelocity: 0.13,
  maxPendingImpulse: 0.38,
  maxWheelDelta: 72,
  maxTouchDelta: 120,
  compactStart: 0.72,
  compactEnd: 1.12,
  mobileCompactStart: 0.95,
  mobileCompactEnd: 1.35,
  compactIconHeight: 96,
  compactVisibleBounds: { x: 768, y: 104, w: 484, h: 932 },
};

const runnerFrame = document.getElementById('runnerFrame');
const loading = document.getElementById('loading');
const runnerStage = document.querySelector('.runner-stage');
const runnerSlot = document.querySelector('.runner-slot');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let frames = [];
let loadedFrames = 0;
let position = 0;
let velocity = 0;
let pendingImpulse = 0;
let ready = false;
let resizePending = true;
let renderedSignature = '';
let currentFrameIndex = -1;
let lastScrollY = window.scrollY || 0;
let touchActive = false;
let lastTouchX = 0;
let lastTouchY = 0;
let currentSource = '';
let loadToken = 0;
let reloadTimer = null;

function debugLog(label, data = {}) {
  if (CONFIG.debug) console.log(`[runner] ${label}`, data);
}

function getViewportSize() {
  const isMobile = window.innerWidth <= CONFIG.mobileBreakpoint;
  const visualViewport = window.visualViewport;

  if (isMobile) {
    return {
      width: Math.round(visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0),
      height: Math.round(visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0),
    };
  }

  return {
    width: Math.round(window.innerWidth || document.documentElement.clientWidth || 0),
    height: Math.round(window.innerHeight || document.documentElement.clientHeight || 0),
  };
}

function syncViewportVars() {
  if (!isMobileViewport()) {
    document.documentElement.style.removeProperty('--runner-vw');
    document.documentElement.style.removeProperty('--runner-vh');
    return;
  }

  const viewport = getViewportSize();
  document.documentElement.style.setProperty('--runner-vw', `${viewport.width}px`);
  document.documentElement.style.setProperty('--runner-vh', `${viewport.height}px`);
}

function isMobileViewport() {
  return (window.innerWidth || document.documentElement.clientWidth || 0) <= CONFIG.mobileBreakpoint;
}

function getSourceName() {
  return isMobileViewport() ? 'mobile' : 'desktop';
}

function getFramePath(index, source = getSourceName()) {
  return source === 'mobile' ? CONFIG.mobileFramePath(index) : CONFIG.framePath(index);
}

function firstAvailableFrame() {
  return frames.find(Boolean) || null;
}

function initializeRunnerImage() {
  if (!runnerFrame) return;
  runnerFrame.removeAttribute('srcset');
  runnerFrame.removeAttribute('sizes');
  runnerFrame.src = getFramePath(0);
  currentFrameIndex = -1;
}

function preloadFrames() {
  const source = getSourceName();
  const token = loadToken + 1;

  loadToken = token;
  currentSource = source;
  frames = [];
  loadedFrames = 0;
  currentFrameIndex = -1;
  renderedSignature = '';

  if (loading) {
    loading.textContent = `Loading sequence 0/${CONFIG.frameCount}`;
    loading.classList.remove('is-hidden');
  }

  const loaders = Array.from({ length: CONFIG.frameCount }, (_, index) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';

      img.onload = () => {
        if (token !== loadToken) {
          resolve(null);
          return;
        }

        frames[index] = img;
        loadedFrames += 1;

        if (loading) loading.textContent = `Loading sequence ${loadedFrames}/${CONFIG.frameCount}`;
        if (index === 0 || !runnerFrame?.src) renderRunner(position, true);

        resolve(img);
      };

      img.onerror = () => {
        debugLog('frame error', { source, index, src: getFramePath(index, source) });
        resolve(null);
      };

      img.src = getFramePath(index, source);
    });
  });

  return Promise.all(loaders).then(() => {
    const availableFrames = frames.filter(Boolean);

    if (availableFrames.length === 0) {
      throw new Error(`Nessun frame caricato per la sorgente ${source}`);
    }

    if (!frames[0]) frames[0] = availableFrames[0];
    return frames;
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function easeInOut(value) {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function getHeroCompactProgress() {
  const viewport = getViewportSize();
  const startRatio = isMobileViewport() ? CONFIG.mobileCompactStart : CONFIG.compactStart;
  const endRatio = isMobileViewport() ? CONFIG.mobileCompactEnd : CONFIG.compactEnd;
  const start = viewport.height * startRatio;
  const end = viewport.height * endRatio;
  if (end <= start) return 1;
  return easeInOut((window.scrollY - start) / (end - start));
}

function getBaseDrawRect(img) {
  const { width: viewportW, height: viewportH } = getViewportSize();
  const imageRatio = img.naturalWidth / img.naturalHeight;

  /*
    The runner is artwork, not a generic background.
    It must be as tall as the visible viewport and centered on both axes.
  */
  const drawH = viewportH;
  const drawW = drawH * imageRatio;

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
    return { x: viewport.width / 2 - 78, y: 20, w: 156, h: CONFIG.compactIconHeight };
  }
  return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
}

function getRunnerRect(img) {
  const fullRect = getBaseDrawRect(img);

  if (isMobileViewport()) {
    document.body.classList.remove('runner-compact');
    return fullRect;
  }

  const progress = getHeroCompactProgress();

  /*
    Desktop hero rule:
    keep the runner centered and full-height while the compact transition has not started.
  */
  if (progress <= 0.02) {
    document.body.classList.remove('runner-compact');
    return fullRect;
  }

  const slotRect = getRunnerSlotRect();
  const viewport = getViewportSize();
  const visibleHeight = Math.min(CONFIG.compactIconHeight, Math.max(slotRect.height * 1.75, viewport.height * 0.09));
  const visibleScale = visibleHeight / CONFIG.compactVisibleBounds.h;
  const compactW = img.naturalWidth * visibleScale;
  const compactH = img.naturalHeight * visibleScale;
  const visibleCenterX = (CONFIG.compactVisibleBounds.x + CONFIG.compactVisibleBounds.w / 2) * visibleScale;
  const visibleCenterY = (CONFIG.compactVisibleBounds.y + CONFIG.compactVisibleBounds.h / 2) * visibleScale;
  const compactRect = {
    x: slotRect.x + slotRect.w / 2 - visibleCenterX,
    y: slotRect.y + slotRect.h / 2 - visibleCenterY,
    w: compactW,
    h: compactH,
  };

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

function renderRunner(rawPosition, force = false) {
  if (!runnerFrame) return;
  syncViewportVars();
  const frameIndex = getLoopedIndex(Math.floor(rawPosition));
  const img = frames[frameIndex] || firstAvailableFrame();
  if (!img) return;

  const viewport = getViewportSize();
  const compactProgress = getHeroCompactProgress();
  const signature = `${currentSource}:${frameIndex}:${compactProgress.toFixed(3)}:${viewport.width}x${viewport.height}`;
  if (signature === renderedSignature && !force) return;

  if (frameIndex !== currentFrameIndex && frames[frameIndex]) {
    runnerFrame.src = frames[frameIndex].src;
    currentFrameIndex = frameIndex;
  } else if (currentFrameIndex === -1) {
    runnerFrame.src = img.src;
    currentFrameIndex = frameIndex;
  }

  const rect = getRunnerRect(img);
  runnerFrame.style.left = `${rect.x.toFixed(2)}px`;
  runnerFrame.style.top = `${rect.y.toFixed(2)}px`;
  runnerFrame.style.width = `${rect.w.toFixed(2)}px`;
  runnerFrame.style.height = `${rect.h.toFixed(2)}px`;
  runnerFrame.style.transform = 'none';
  document.body.classList.add('runner-ready');
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
  if (keys.includes(event.code)) addImpulse(CONFIG.keyboardImpulse);
}

function advanceFromScroll() {
  const currentScrollY = window.scrollY || 0;
  const delta = Math.abs(currentScrollY - lastScrollY);
  lastScrollY = currentScrollY;

  if (isMobileViewport()) {
    position += clamp(delta, 0, CONFIG.maxWheelDelta) * CONFIG.mobileDirectScrollSensitivity;
    renderedSignature = '';
    renderRunner(position, true);
    return;
  }

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

  if (isMobileViewport()) {
    position += Math.max(normalizedDelta * CONFIG.mobileDirectTouchSensitivity, CONFIG.minTouchImpulse);
    renderedSignature = '';
    renderRunner(position, true);
    return;
  }

  addImpulse(Math.max(normalizedDelta * CONFIG.touchSensitivity, CONFIG.minTouchImpulse));
}

function advanceFromTouchEnd() {
  touchActive = false;
}

function updatePageBackground() {
  document.documentElement.style.backgroundColor = CONFIG.backgroundColor;
  document.body.style.backgroundColor = CONFIG.backgroundColor;
  if (runnerStage) runnerStage.style.backgroundColor = 'transparent';
}

function completeLoadState() {
  document.body.classList.add('is-loaded');
  loading?.classList.add('is-hidden');
}

function handleFrameError(error) {
  document.body.classList.add('runner-error', 'runner-disabled');
  completeLoadState();
  if (loading) loading.textContent = '';
  console.error(error);
}

function reloadFramesForViewport() {
  const nextSource = getSourceName();
  if (nextSource === currentSource) {
    renderedSignature = '';
    return;
  }

  ready = false;
  document.body.classList.remove('runner-disabled');

  preloadFrames()
    .then(() => {
      ready = true;
      completeLoadState();
      renderRunner(position, true);
    })
    .catch(handleFrameError);
}

function queueResize() {
  resizePending = true;
  renderedSignature = '';
  syncViewportVars();
  window.clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(reloadFramesForViewport, 120);
}

function tick() {
  if (resizePending) {
    resizePending = false;
    renderedSignature = '';
  }
  if (ready) {
    advancePosition();
    renderRunner(position);
  }
  requestAnimationFrame(tick);
}

syncViewportVars();

if (!runnerFrame || prefersReducedMotion.matches) {
  document.body.classList.add('runner-disabled');
  completeLoadState();
} else {
  initializeRunnerImage();
  updatePageBackground();

  window.addEventListener('resize', queueResize, { passive: true });
  window.addEventListener('orientationchange', queueResize, { passive: true });
  window.visualViewport?.addEventListener('resize', queueResize, { passive: true });
  window.visualViewport?.addEventListener('scroll', queueResize, { passive: true });
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
    if (prefersReducedMotion.matches) {
      document.body.classList.add('runner-disabled');
      completeLoadState();
    }
  });

  preloadFrames()
    .then(() => {
      ready = true;
      completeLoadState();
      renderRunner(0, true);
    })
    .catch(handleFrameError);

  tick();
}
