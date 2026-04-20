/**
 * Gemini Watermark Remover v4 — Full-fidelity port of the open-source engine.
 * Uses the REAL alpha maps from embedded-alpha-maps.js (loaded before this file).
 * Composite scoring: Spatial (50%) + Gradient (30%) + Variance (20%).
 */

// ── Constants ──────────────────────────────────────────────────────
const CONFIDENCE_THRESHOLD = 0.25;
const EPSILON = 1e-8;
const BLEND_NOISE_FLOOR = 4 / 255;
const BLEND_ALPHA_THRESHOLD = 0.002;
const BLEND_MAX_ALPHA = 0.99;
const BLEND_LOGO_VALUE = 255;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Official Gemini Image Size Catalog ─────────────────────────────
// See geminiSizeCatalog.js in the original project.
const WATERMARK_CONFIG_BY_TIER = {
    '0.5k': { logoSize: 48, marginRight: 32, marginBottom: 32 },
    '1k':   { logoSize: 96, marginRight: 64, marginBottom: 64 },
    '2k':   { logoSize: 96, marginRight: 64, marginBottom: 64 },
    '4k':   { logoSize: 96, marginRight: 64, marginBottom: 64 },
};

const OFFICIAL_SIZES = [
    // 0.5k tier
    ['0.5k',512,512],['0.5k',256,1024],['0.5k',192,1536],['0.5k',424,632],['0.5k',632,424],
    ['0.5k',448,600],['0.5k',1024,256],['0.5k',600,448],['0.5k',464,576],['0.5k',576,464],
    ['0.5k',1536,192],['0.5k',384,688],['0.5k',688,384],['0.5k',792,168],
    // 1k tier
    ['1k',1024,1024],['1k',512,2064],['1k',352,2928],['1k',848,1264],['1k',1264,848],
    ['1k',896,1200],['1k',2064,512],['1k',1200,896],['1k',928,1152],['1k',1152,928],
    ['1k',2928,352],['1k',768,1376],['1k',1376,768],['1k',1408,768],['1k',1584,672],
    // 2k tier
    ['2k',2048,2048],['2k',512,2048],['2k',384,3072],['2k',1696,2528],['2k',2528,1696],
    ['2k',1792,2400],['2k',2048,512],['2k',2400,1792],['2k',1856,2304],['2k',2304,1856],
    ['2k',3072,384],['2k',1536,2752],['2k',2752,1536],['2k',3168,1344],
    // 4k tier
    ['4k',4096,4096],['4k',2048,8192],['4k',1536,12288],['4k',3392,5056],['4k',5056,3392],
    ['4k',3584,4800],['4k',8192,2048],['4k',4800,3584],['4k',3712,4608],['4k',4608,3712],
    ['4k',12288,1536],['4k',3072,5504],['4k',5504,3072],['4k',6336,2688],
    // gemini-2.5-flash
    ['1k',832,1248],['1k',1248,832],['1k',864,1184],['1k',1184,864],
    ['1k',896,1152],['1k',1152,896],['1k',768,1344],['1k',1344,768],['1k',1536,672],
];

const OFFICIAL_SIZE_INDEX = new Map();
for (const [tier, w, h] of OFFICIAL_SIZES) {
    OFFICIAL_SIZE_INDEX.set(`${w}x${h}`, { tier, width: w, height: h });
}

// ── Config Resolution ──────────────────────────────────────────────

function detectWatermarkConfig(width, height) {
    // Exact official match
    const exact = OFFICIAL_SIZE_INDEX.get(`${width}x${height}`);
    if (exact) return { ...WATERMARK_CONFIG_BY_TIER[exact.tier] };

    // Fallback heuristic
    if (width > 1024 && height > 1024) {
        return { logoSize: 96, marginRight: 64, marginBottom: 64 };
    }
    return { logoSize: 48, marginRight: 32, marginBottom: 32 };
}

function resolveSearchConfigs(width, height, defaultConfig) {
    const configs = [defaultConfig];
    const seen = new Set();
    seen.add(`${defaultConfig.logoSize}:${defaultConfig.marginRight}:${defaultConfig.marginBottom}`);

    // Also try the other standard config
    const altConfig = defaultConfig.logoSize === 96
        ? { logoSize: 48, marginRight: 32, marginBottom: 32 }
        : { logoSize: 96, marginRight: 64, marginBottom: 64 };
    const altKey = `${altConfig.logoSize}:${altConfig.marginRight}:${altConfig.marginBottom}`;
    if (!seen.has(altKey)) {
        seen.add(altKey);
        configs.push(altConfig);
    }

    // Project from near-official sizes (scaled)
    const ar = width / height;
    for (const [tier, ow, oh] of OFFICIAL_SIZES) {
        const oar = ow / oh;
        if (Math.abs(ar - oar) / oar > 0.02) continue;
        const scaleX = width / ow;
        const scaleY = height / oh;
        if (Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY) > 0.12) continue;

        const base = WATERMARK_CONFIG_BY_TIER[tier];
        const scale = (scaleX + scaleY) / 2;
        const cfg = {
            logoSize: clamp(Math.round(base.logoSize * scale), 24, 192),
            marginRight: Math.max(8, Math.round(base.marginRight * scaleX)),
            marginBottom: Math.max(8, Math.round(base.marginBottom * scaleY)),
        };
        const key = `${cfg.logoSize}:${cfg.marginRight}:${cfg.marginBottom}`;
        if (!seen.has(key)) {
            seen.add(key);
            configs.push(cfg);
            if (configs.length >= 5) break;
        }
    }

    return configs;
}

// ── Math Utilities ─────────────────────────────────────────────────

function meanAndVariance(values) {
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += values[i];
    const mean = sum / values.length;
    let sq = 0;
    for (let i = 0; i < values.length; i++) {
        const d = values[i] - mean;
        sq += d * d;
    }
    return { mean, variance: sq / values.length };
}

function normalizedCrossCorrelation(a, b) {
    if (a.length !== b.length || a.length === 0) return 0;
    const sa = meanAndVariance(a);
    const sb = meanAndVariance(b);
    const den = Math.sqrt(sa.variance * sb.variance) * a.length;
    if (den < EPSILON) return 0;
    let num = 0;
    for (let i = 0; i < a.length; i++) {
        num += (a[i] - sa.mean) * (b[i] - sb.mean);
    }
    return num / den;
}

function sobelMagnitude(gray, width, height) {
    const grad = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            const gx =
                -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1] +
                gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
            const gy =
                -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] +
                gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
            grad[i] = Math.sqrt(gx * gx + gy * gy);
        }
    }
    return grad;
}

function interpolateAlphaMap(sourceAlpha, sourceSize, targetSize) {
    if (targetSize <= 0) return new Float32Array(0);
    if (sourceSize === targetSize) return new Float32Array(sourceAlpha);
    const out = new Float32Array(targetSize * targetSize);
    const scale = (sourceSize - 1) / Math.max(1, targetSize - 1);
    for (let y = 0; y < targetSize; y++) {
        const sy = y * scale;
        const y0 = Math.floor(sy);
        const y1 = Math.min(sourceSize - 1, y0 + 1);
        const fy = sy - y0;
        for (let x = 0; x < targetSize; x++) {
            const sx = x * scale;
            const x0 = Math.floor(sx);
            const x1 = Math.min(sourceSize - 1, x0 + 1);
            const fx = sx - x0;
            const p00 = sourceAlpha[y0 * sourceSize + x0];
            const p10 = sourceAlpha[y0 * sourceSize + x1];
            const p01 = sourceAlpha[y1 * sourceSize + x0];
            const p11 = sourceAlpha[y1 * sourceSize + x1];
            const top = p00 + (p10 - p00) * fx;
            const bottom = p01 + (p11 - p01) * fx;
            out[y * targetSize + x] = top + (bottom - top) * fy;
        }
    }
    return out;
}

// ── Image Helpers ──────────────────────────────────────────────────

function toGrayscale(imageData) {
    const { width, height, data } = imageData;
    const out = new Float32Array(width * height);
    for (let i = 0; i < out.length; i++) {
        const j = i * 4;
        out[i] = (0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]) / 255;
    }
    return out;
}

function getRegion(data, width, x, y, size) {
    const out = new Float32Array(size * size);
    for (let row = 0; row < size; row++) {
        const srcBase = (y + row) * width + x;
        const dstBase = row * size;
        for (let col = 0; col < size; col++) {
            out[dstBase + col] = data[srcBase + col];
        }
    }
    return out;
}

function stdDevRegion(data, width, x, y, size) {
    let sum = 0, sq = 0, n = 0;
    for (let row = 0; row < size; row++) {
        const base = (y + row) * width + x;
        for (let col = 0; col < size; col++) {
            const v = data[base + col];
            sum += v; sq += v * v; n++;
        }
    }
    if (n === 0) return 0;
    const mean = sum / n;
    return Math.sqrt(Math.max(0, sq / n - mean * mean));
}

// ── Template Cache ─────────────────────────────────────────────────

const templateCache = new Map();

function getTemplate(alpha96, size) {
    if (templateCache.has(size)) return templateCache.get(size);
    const alpha = size === 96 ? alpha96 : interpolateAlphaMap(alpha96, 96, size);
    const grad = sobelMagnitude(alpha, size, size);
    const tpl = { alpha, grad };
    templateCache.set(size, tpl);
    return tpl;
}

// ── Candidate Scoring (the triple-weighted composite from the original) ───

function scoreCandidate(context, alphaMap, templateGrad, candidate) {
    const { x, y, size } = candidate;
    const { gray, grad, width, height } = context;
    if (x < 0 || y < 0 || x + size > width || y + size > height) return null;

    const grayRegion = getRegion(gray, width, x, y, size);
    const gradRegion = getRegion(grad, width, x, y, size);

    const spatial  = normalizedCrossCorrelation(grayRegion, alphaMap);
    const gradient = normalizedCrossCorrelation(gradRegion, templateGrad);

    let varianceScore = 0;
    if (y > 8) {
        const refY = Math.max(0, y - size);
        const refH = Math.min(size, y - refY);
        if (refH > 8) {
            const wmStd  = stdDevRegion(gray, width, x, y, size);
            const refStd = stdDevRegion(gray, width, x, refY, refH);
            if (refStd > EPSILON) {
                varianceScore = clamp(1 - wmStd / refStd, 0, 1);
            }
        }
    }

    const confidence =
        Math.max(0, spatial) * 0.5 +
        Math.max(0, gradient) * 0.3 +
        varianceScore * 0.2;

    return {
        confidence: clamp(confidence, 0, 1),
        spatialScore: spatial,
        gradientScore: gradient,
        varianceScore,
    };
}

// ── Adaptive Detection (coarse-to-fine, from adaptiveDetector.js) ──

function createScaleList(minSize, maxSize) {
    const set = new Set();
    for (let s = minSize; s <= maxSize; s += 8) set.add(s);
    if (48 >= minSize && 48 <= maxSize) set.add(48);
    if (96 >= minSize && 96 <= maxSize) set.add(96);
    return [...set].sort((a, b) => a - b);
}

function detectAdaptiveRegion(imageData, alpha48, alpha96, defaultConfig) {
    const { width, height } = imageData;
    const gray = toGrayscale(imageData);
    const grad = sobelMagnitude(gray, width, height);
    const context = { gray, grad, width, height };

    const seedConfigs = resolveSearchConfigs(width, height, defaultConfig);

    console.log(`[GeminiRemover v4] Image: ${width}x${height}, searching ${seedConfigs.length} seed configs...`);

    // ─── Phase 1: Score every seed config at its exact position ────
    const seedCandidates = [];
    for (const config of seedConfigs) {
        const size = config.logoSize;
        const x = width - config.marginRight - size;
        const y = height - config.marginBottom - size;
        if (x < 0 || y < 0 || x + size > width || y + size > height) continue;

        const tpl = getTemplate(alpha96, size);
        const score = scoreCandidate(context, tpl.alpha, tpl.grad, { x, y, size });
        if (!score) continue;

        seedCandidates.push({ x, y, size, ...score });
        console.log(`[GeminiRemover v4]   Seed ${size}px@(${x},${y}): Spatial=${score.spatialScore.toFixed(3)}, Gradient=${score.gradientScore.toFixed(3)}, Variance=${score.varianceScore.toFixed(3)} => ${score.confidence.toFixed(4)}`);
    }

    // Check if any seed is already high-confidence
    let bestSeed = seedCandidates.reduce((best, c) => (!best || c.confidence > best.confidence) ? c : best, null);
    if (bestSeed && bestSeed.confidence >= CONFIDENCE_THRESHOLD + 0.08) {
        console.log(`[GeminiRemover v4] High-confidence seed match! Skipping deep search.`);
        return { found: true, ...bestSeed };
    }

    // ─── Phase 2: Coarse grid search (8px steps across margin ranges) ──
    const baseSize = defaultConfig.logoSize;
    const minSize = clamp(Math.round(baseSize * 0.65), 24, 144);
    const maxSize = clamp(
        Math.min(Math.round(baseSize * 2.8), Math.floor(Math.min(width, height) * 0.4)),
        minSize, 192
    );
    const scaleList = createScaleList(minSize, maxSize);

    const marginRange = Math.max(32, Math.round(baseSize * 0.75));
    const minMR = clamp(defaultConfig.marginRight - marginRange, 8, width - minSize - 1);
    const maxMR = clamp(defaultConfig.marginRight + marginRange, minMR, width - minSize - 1);
    const minMB = clamp(defaultConfig.marginBottom - marginRange, 8, height - minSize - 1);
    const maxMB = clamp(defaultConfig.marginBottom + marginRange, minMB, height - minSize - 1);

    // Collect top-K coarse candidates
    const topK = [];
    const pushTopK = (c) => {
        topK.push(c);
        topK.sort((a, b) => b.adjustedScore - a.adjustedScore);
        if (topK.length > 5) topK.length = 5;
    };

    for (const sc of seedCandidates) {
        pushTopK({ size: sc.size, x: sc.x, y: sc.y, adjustedScore: sc.confidence * Math.min(1, Math.sqrt(sc.size / 96)) });
    }

    for (const size of scaleList) {
        const tpl = getTemplate(alpha96, size);
        for (let mr = minMR; mr <= maxMR; mr += 8) {
            const x = width - mr - size;
            if (x < 0) continue;
            for (let mb = minMB; mb <= maxMB; mb += 8) {
                const y = height - mb - size;
                if (y < 0) continue;
                const score = scoreCandidate(context, tpl.alpha, tpl.grad, { x, y, size });
                if (!score) continue;
                const adjustedScore = score.confidence * Math.min(1, Math.sqrt(size / 96));
                if (adjustedScore < 0.08) continue;
                pushTopK({ size, x, y, adjustedScore });
            }
        }
    }

    // ─── Phase 3: Fine search around top-K (2px steps, ±8px, ±10 scale) ──
    let best = bestSeed ?? {
        x: width - defaultConfig.marginRight - defaultConfig.logoSize,
        y: height - defaultConfig.marginBottom - defaultConfig.logoSize,
        size: defaultConfig.logoSize,
        confidence: 0, spatialScore: 0, gradientScore: 0, varianceScore: 0,
    };

    for (const coarse of topK) {
        const scaleLo = clamp(coarse.size - 10, minSize, maxSize);
        const scaleHi = clamp(coarse.size + 10, minSize, maxSize);
        for (let size = scaleLo; size <= scaleHi; size += 2) {
            const tpl = getTemplate(alpha96, size);
            for (let x = coarse.x - 8; x <= coarse.x + 8; x += 2) {
                if (x < 0 || x + size > width) continue;
                for (let y = coarse.y - 8; y <= coarse.y + 8; y += 2) {
                    if (y < 0 || y + size > height) continue;
                    const score = scoreCandidate(context, tpl.alpha, tpl.grad, { x, y, size });
                    if (!score) continue;
                    if (score.confidence > best.confidence) {
                        best = { x, y, size, ...score };
                    }
                }
            }
        }
    }

    console.log(`[GeminiRemover v4] Winner: Size=${best.size}px@(${best.x},${best.y}), Spatial=${best.spatialScore.toFixed(3)}, Gradient=${best.gradientScore.toFixed(3)}, Variance=${best.varianceScore.toFixed(3)} => Confidence=${best.confidence.toFixed(4)}`);

    return {
        found: best.confidence >= CONFIDENCE_THRESHOLD,
        ...best,
    };
}

// ── Reverse Alpha Blending (from blendModes.js) ───────────────────

function removeWatermarkPixels(ctx, region, alphaMap) {
    const { x, y, size } = region;
    const imageData = ctx.getImageData(x, y, size, size);
    const data = imageData.data;

    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const alphaIdx = row * size + col;
            const imgIdx = (row * size + col) * 4;
            const rawAlpha = alphaMap[alphaIdx];
            const signalAlpha = Math.max(0, rawAlpha - BLEND_NOISE_FLOOR);

            if (signalAlpha < BLEND_ALPHA_THRESHOLD) continue;

            const alpha = Math.min(rawAlpha, BLEND_MAX_ALPHA);
            const oneMinusAlpha = 1.0 - alpha;

            for (let c = 0; c < 3; c++) {
                const watermarked = data[imgIdx + c];
                const original = (watermarked - alpha * BLEND_LOGO_VALUE) / oneMinusAlpha;
                data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
            }
        }
    }

    ctx.putImageData(imageData, x, y);
}

// ── Main Entry Point ──────────────────────────────────────────────

async function removeGeminiWatermark(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { width, height } = canvas;

    // Get real alpha maps from embedded-alpha-maps.js
    const alpha48 = window.getEmbeddedAlphaMap(48);
    const alpha96 = window.getEmbeddedAlphaMap(96);

    if (!alpha48 || !alpha96) {
        console.error('[GeminiRemover v4] FATAL: Alpha maps not loaded! Is embedded-alpha-maps.js included?');
        return { success: false, error: 'ALPHA_MAPS_NOT_LOADED' };
    }

    // Cache the 48px template too
    if (!templateCache.has(48)) {
        templateCache.set(48, { alpha: alpha48, grad: sobelMagnitude(alpha48, 48, 48) });
    }

    const defaultConfig = detectWatermarkConfig(width, height);
    const fullImageData = ctx.getImageData(0, 0, width, height);

    const result = detectAdaptiveRegion(fullImageData, alpha48, alpha96, defaultConfig);

    if (!result.found) {
        console.warn(`[GeminiRemover v4] No watermark detected. Best confidence: ${result.confidence.toFixed(4)}`);
        return { success: false, confidence: result.confidence };
    }

    // Get the correct alpha map for the detected size
    const tpl = getTemplate(alpha96, result.size);

    removeWatermarkPixels(ctx, { x: result.x, y: result.y, size: result.size }, tpl.alpha);

    console.log(`[GeminiRemover v4] ✓ Watermark removed! Size=${result.size}px, Confidence=${result.confidence.toFixed(4)}`);

    return {
        success: true,
        confidence: result.confidence,
        anchor: { x: result.x, y: result.y },
        size: result.size,
    };
}

window.GeminiRemover = {
    remove: removeGeminiWatermark,
};
