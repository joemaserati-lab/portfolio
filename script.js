const CONFIG = {
  debug: true,
  frameCount: 20,
  framePath: (index) => `assets-webp/frame-${String(index).padStart(2, '0')}.webp?v=webp-85`,
  fit: 'cover',
  mobileFit: 'contain',
  mobileBreakpoint: 760,
  mobileHeroVisibleHeightRatio: 0.78,
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
};

const runnerFrame = document.getElementById('runnerFrame');
const loading = document.getElementById('loading');
const runnerStage = document.querySelector('.runner-stage');
const runnerSlot = document.querySelector('.runner-slot');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const frames = [];
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
let renderLogCount = 0;
let inputLogCount = 0;

function debugLog(label, data = {}) {
  if (!CONFIG.debug) return;

  console.log(`[runner] ${label}`, data);
}

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
          debugLog('frame loaded', {
            index,
            src: img.src,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            loadedFrames,
          });

          if (loading) {
            loading.textContent = `Loading sequence ${loadedFrames}/${CONFIG.frameCount}`;
          }

          if (index === 0) {
            renderRunner(0, true);
            document.body.classList.add('runner-ready');
          }

          resolve(img);
        };
        img.onerror = () => {
          debugLog('frame error', { index, src: CONFIG.framePath(index) });
          reject(new Error(`Frame non caricato: ${CONFIG.framePath(index)}`));
        };
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

function getHeroCompactProgress() {
  const viewport = getViewportSize();
  const start = viewport.height * CONFIG.compactStart;
  const end = viewport.height * CONFIG.compactEnd;

  if (end <= start) return 1;

  return easeInOut((window.scrollY - start) / (end - start));
}

function getBaseDrawRect(img) {
  const { width: viewportW, height: viewportH } = getViewportSize();
  const imageRatio = img.naturalWidth / img.naturalHeight;
  const viewportRatio = viewportW / viewportH;
  const fit = viewportW <= CONFIG.mobileBreakpoint ? CONFIG.mobileFit : CONFIG.fit;

  if (viewportW <= CONFIG.mobileBreakpoint) {
    const visibleHeight = viewportH * CONFIG.mobileHeroVisibleHeightRatio;
    const visibleScale = visibleHeight / CONFIG.compactVisibleBounds.h;
    const visibleCenterX = (CONFIG.compactVisibleBounds.x + CONFIG.compactVisibleBounds.w / 2) * visibleScale;
    const visibleCenterY = (CONFIG.compactVisibleBounds.y + CONFIG.compactVisibleBounds.h / 2) * visibleScale;

    return {
      x: viewportW / 2 - visibleCenterX,
      y: viewportH / 2 - visibleCenterY,
      w: img.naturalWidth * visibleScale,
      h: img.naturalHeight * visibleScale,
    };
  }

  let drawW;
  let drawH;

  if (fit === 'contain') {
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

function getRunnerRect(img) {
  const fullRect = getBaseDrawRect(img);
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

function renderRunner(rawPosition, force = false) {
  if (!runnerFrame || frames.length === 0) {
    debugLog('render skipped', {
      reason: !runnerFrame ? 'missing runnerFrame' : 'no frames loaded',
      frameArrayLength: frames.length,
      loadedFrames,
    });
    return;
  }

  const frameIndex = getLoopedIndex(Math.floor(rawPosition));
  const img = frames[frameIndex] || frames[0];
  if (!img) {
    debugLog('render skipped', { reason: 'missing img', frameIndex, hasFrameZero: !!frames[0] });
    return;
  }

  const viewport = getViewportSize();
  const compactProgress = getHeroCompactProgress();
  const signature = `${frameIndex}:${compactProgress.toFixed(3)}:${viewport.width}x${viewport.height}`;

  if (signature === renderedSignature && !force) return;

  if (frameIndex !== currentFrameIndex && frames[frameIndex]) {
    runnerFrame.src = frames[frameIndex].src;
    currentFrameIndex = frameIndex;
  }

  const rect = getRunnerRect(img);
  runnerFrame.style.left = `${rect.x.toFixed(2)}px`;
  runnerFrame.style.top = `${rect.y.toFixed(2)}px`;
  runnerFrame.style.width = `${rect.w.toFixed(2)}px`;
  runnerFrame.style.height = `${rect.h.toFixed(2)}px`;
  document.body.classList.add('runner-ready');

  if (renderLogCount < 40 || force) {
    renderLogCount += 1;
    debugLog('render applied', {
      rawPosition,
      frameIndex,
      currentFrameIndex,
      src: runnerFrame.src,
      compactProgress,
      viewport,
      image: {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      },
      rect,
      styles: {
        left: runnerFrame.style.left,
        top: runnerFrame.style.top,
        width: runnerFrame.style.width,
        height: runnerFrame.style.height,
      },
      computed: {
        stageOpacity: runnerStage ? getComputedStyle(runnerStage).opacity : null,
        frameDisplay: getComputedStyle(runnerFrame).display,
        frameVisibility: getComputedStyle(runnerFrame).visibility,
        frameRect: runnerFrame.getBoundingClientRect(),
      },
    });
  }

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
  const normalizedDelta = normalizeWheelDelta(event);
  addImpulse(normalizedDelta * CONFIG.wheelSensitivity);

  if (inputLogCount < 20) {
    inputLogCount += 1;
    debugLog('wheel input', { normalizedDelta, pendingImpulse, velocity, position });
  }
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

  if (inputLogCount < 20) {
    inputLogCount += 1;
    debugLog('scroll input', { scrollY: currentScrollY, delta, pendingImpulse, velocity, position });
  }
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

  if (runnerStage) {
    runnerStage.style.backgroundColor = 'transparent';
  }
}

function queueResize() {
  resizePending = true;
  renderedSignature = '';
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

if (!runnerFrame) {
  if (loading) {
    loading.textContent = 'Runner non disponibile';
  }
} else {
  debugLog('init', {
    runnerFrame: !!runnerFrame,
    runnerStage: !!runnerStage,
    runnerSlot: !!runnerSlot,
    href: window.location.href,
    initialSrc: runnerFrame.src,
    initialRect: runnerFrame.getBoundingClientRect(),
  });

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
  renderRunner(0, true);

  preloadFrames()
    .then(() => {
      ready = true;
      document.body.classList.add('is-loaded');
      loading?.classList.add('is-hidden');
      renderRunner(0, true);
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
