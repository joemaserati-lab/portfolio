const CONFIG = {
  frameCount: 20,
  framePath: (index) => `assets-webp/frame-${String(index).padStart(2, '0')}.webp?v=webp-85`,
  fit: 'cover',
  backgroundColor: '#0000ff',
  playbackSpeed: 0.16,
  maxDevicePixelRatio: 2,
};

const canvas = document.getElementById('runnerCanvas');
const ctx = canvas?.getContext('2d', { alpha: true });
const loading = document.getElementById('loading');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const frames = [];
let loadedFrames = 0;
let framePosition = 0;
let resizePending = true;
let ready = false;
let renderedSignature = '';

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

          resolve(img);
        };
        img.onerror = () => reject(new Error(`Frame non caricato: ${CONFIG.framePath(index)}`));
        img.src = CONFIG.framePath(index);
      });
    })
  );
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

  return {
    x: (viewportW - drawW) / 2,
    y: (viewportH - drawH) / 2,
    w: drawW,
    h: drawH,
  };
}

function getLoopedIndex(index) {
  const looped = index % CONFIG.frameCount;
  return looped < 0 ? looped + CONFIG.frameCount : looped;
}

function renderFrame(rawPosition) {
  if (!canvas || !ctx || frames.length === 0) return;

  const viewport = getViewportSize();
  const frameIndex = getLoopedIndex(Math.floor(rawPosition));
  const signature = `${frameIndex}:${viewport.width}x${viewport.height}`;

  if (signature === renderedSignature) return;

  const img = frames[frameIndex];
  const rect = getDrawRect(img);

  ctx.clearRect(0, 0, viewport.width, viewport.height);
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);

  renderedSignature = signature;
}

function updatePageBackground() {
  document.documentElement.style.backgroundColor = CONFIG.backgroundColor;
  document.body.style.backgroundColor = CONFIG.backgroundColor;

  if (canvas) {
    canvas.style.backgroundColor = 'transparent';
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
    if (!prefersReducedMotion.matches) {
      framePosition += CONFIG.playbackSpeed;
    }

    renderFrame(framePosition);
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

  prefersReducedMotion.addEventListener?.('change', () => {
    framePosition = 0;
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
      if (loading) {
        loading.textContent = error.message;
      }

      console.error(error);
    });

  tick();
}
