/**
 * Raven Mockup Studio - Professional Offline Mockup Generator
 * Core rendering engine using Pixi.js WebGL with Advanced Realism Engine
 */



/**
 * FabricMapFilter - Advanced WebGL High-Pass Generator
 * Dynamically detects local wrinkles by comparing pixel brightness to surrounding
 * neighbors. This guarantees 100% accurate wrapping on Pitch Black, Pure White,
 * and Grey mockups, while completely ignoring soft global gradients (like Coffee Mugs)
 * so they don't tear in half.
 */
// ═══════════════════════════════════════════════════════════════════
// FabricMapFilter v2 — Adobe-Grade Directional Displacement Engine
// ═══════════════════════════════════════════════════════════════════
// Generates a proper displacement map where:
//   R channel = horizontal (X) shift — wrinkles push design left/right
//   G channel = vertical (Y) shift   — folds push design up/down
//   0.5 (128) = neutral (no displacement)
//
// Uses multi-scale Sobel detection at 3 frequency octaves:
//   Fine   (2px)  — tiny fabric threads and micro-creases
//   Medium (6px)  — visible wrinkles and seams
//   Coarse (16px) — deep garment folds and draping curves
//
// Each octave contributes independently weighted gradients so the
// design conforms to every surface detail simultaneously.
// ═══════════════════════════════════════════════════════════════════
class FabricMapFilter extends PIXI.Filter {
    constructor(width, height) {
        const frag = `
            precision highp float;
            varying vec2 vTextureCoord;
            uniform sampler2D uSampler;
            uniform vec2 texelSize;

            // Sample luminance at offset
            float luma(vec2 uv) {
                vec3 c = texture2D(uSampler, uv).rgb;
                return dot(c, vec3(0.299, 0.587, 0.114));
            }

            // Sobel operator at a given radius — returns (dX, dY) gradients
            vec2 sobel(vec2 uv, float r) {
                float w = texelSize.x * r;
                float h = texelSize.y * r;

                // 3x3 Sobel neighborhood
                float tl = luma(uv + vec2(-w, -h));
                float tc = luma(uv + vec2( 0, -h));
                float tr = luma(uv + vec2( w, -h));
                float ml = luma(uv + vec2(-w,  0));
                float mr = luma(uv + vec2( w,  0));
                float bl = luma(uv + vec2(-w,  h));
                float bc = luma(uv + vec2( 0,  h));
                float br = luma(uv + vec2( w,  h));

                // Sobel X: detects vertical edges → horizontal push
                float gx = (tr + 2.0*mr + br) - (tl + 2.0*ml + bl);
                // Sobel Y: detects horizontal edges → vertical push
                float gy = (bl + 2.0*bc + br) - (tl + 2.0*tc + tr);

                return vec2(gx, gy);
            }

            void main() {
                vec2 uv = vTextureCoord;

                // ── Multi-Scale Sobel Octaves ─────────────────────────
                // Fine: micro threads, stitch lines, small creases
                vec2 fine   = sobel(uv, 2.0)  * 5.0;
                // Medium: visible wrinkles, seam ridges
                vec2 medium = sobel(uv, 6.0)  * 3.5;
                // Coarse: deep folds, draping, large fabric curves
                vec2 coarse = sobel(uv, 16.0) * 2.0;

                // ── Blend octaves with weighted sum ───────────────────
                // Fine detail is strongest for realism (thread-level),
                // coarse provides the "big shape" displacement
                vec2 gradient = fine * 0.35 + medium * 0.40 + coarse * 0.25;

                // ── Encode into 0-1 range centered at 0.5 ────────────
                // PIXI DisplacementFilter: R=X shift, G=Y shift, 0.5=neutral
                float rx = clamp(0.5 + gradient.x, 0.0, 1.0);
                float gy = clamp(0.5 + gradient.y, 0.0, 1.0);

                gl_FragColor = vec4(rx, gy, 0.5, 1.0);
            }
        `;
        super(null, frag);
        this.uniforms.texelSize = new Float32Array([1.0 / width, 1.0 / height]);
    }
}

class RavenMockupStudio {
  constructor() {
    // === GLOBAL RENDERING QUALITY ===
    // Force bilinear filtering on ALL textures globally (prevents jagged edges)
    PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.LINEAR;
    // Force all filters (displacement, blur, color) to render at 2x resolution
    PIXI.settings.FILTER_RESOLUTION = 2;

    // State
    this.mockupData = null;
    this.inputFolder = null;
    this.outputFolder = null;
    this.designFiles = [];
    this.outputFolder = null;
    this.designFiles = [];
    this.sampleDesignData = null;
    this.mockupQueue = []; // Queue for multi-mockup generation
    this.selectedLibraryItems = new Set(); // For UI selection state
    this.mockupOverrides = {}; // Per-mockup PARTIAL overrides: { [path]: { overriddenKeys: Set, settings: {}, ... } }
    this.activeQueueIndex = 0; // Which queue item is currently shown in canvas
    this.globalSettings = null; // Snapshot of "master" settings at queue creation time

    // Design transform state
    this.designPosition = { x: 0.5, y: 0.4 }; // Normalized position (0-1)
    this.designScale = 1;
    this.designRotation = 0;

    // Rendering settings
    this.settings = {
      opacity: 100,
      warpStrength: 7,
      scale: 100,
      rotation: 0,
      blendMode: 'multiply', // Still used for state, though render engine defaults to sophisticated blend
      textureStrength: 30,
      showOverlay: true,
      mockupColor: '#ffffff', // Feature 5: Mockup Tint
      // Watermark Settings (v1.0.2)
      watermarkOpacity: 50,
      watermarkScale: 20,
      watermarkPosition: 'bottom-right',
      exportPreset: 'original',
      exportFormat: 'jpg',
      customExportWidth: 2000,
      customExportHeight: null
    };

    // Pixi.js components
    this.app = null;
    this.background = null;
    this.displacementSprite = null;
    this.displacementFilter = null;
    this.designContainer = null;
    this.designSprite = null;
    this.watermarkSprite = null; // v1.0.2
    this.watermarkTexture = null; // v1.0.2
    // New Realism Components
    this.shadowLayer = null;
    this.highlightLayer = null;

    // Interaction state
    this.isDragging = false;
    this.isRotating = false;
    this.dragStart = { x: 0, y: 0 };
    this.designStartPos = { x: 0, y: 0 };

    // Processing state
    this.isProcessing = false;

    // Viewport State
    this.zoomLevel = 1;
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    
    // Mask Tool State
    this.isMaskMode = false;
    this.maskToolMode = 'brush';
    this.maskBrushSize = 30;
    this.maskBrushMode = 'erase';
    this.polygonPoints = [];
    this.maskOperations = []; // Store operations {mode, size, path: [{x,y}]}

    // Library State
    this.favoriteMockups = new Set();
    this.isLibraryMaximized = false;
    
    // --- GLOBAL NATIVE DROP NEUTRALIZER ---
    // Prevents Electron Chromium from navigating to the image natively 
    // and generating a giant phantom image over the UI when dropped outside a safe zone.
    document.body.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    document.body.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    this.init();
  }

  init() {
    this.bindElements();
    this.bindEvents();
    this.setupPresetListeners();
    this.loadSettings();
    this.initAutoUpdater();
    this.initWatermarkEvents();
    this.checkLicense();
  }

  saveSettings() {
    // Basic persistence to localStorage
    try {
      localStorage.setItem('ravenmock-settings', JSON.stringify(this.settings));
      localStorage.setItem('ravenmock-favorites', JSON.stringify(Array.from(this.favoriteMockups)));
    } catch (e) { console.error("Failed to save settings", e); }
  }

  loadSettings() {
    // Load from storage
    try {
      const saved = localStorage.getItem('ravenmock-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settings = { ...this.settings, ...parsed };
      }

      const savedFavorites = localStorage.getItem('ravenmock-favorites');
      if (savedFavorites) {
        this.favoriteMockups = new Set(JSON.parse(savedFavorites));
      }

      // CRITICAL FIX: To prevent "Default Custom" bug reported by user,
      // we always start in 'original' mode on fresh app launch.
      this.settings.exportPreset = 'original';
      // Force warp default on every launch to prevent stale cache issues.
      this.settings.warpStrength = 7;
    } catch (e) {
      console.error(e);
    }

    // Apply to UI
    if (this.presetSelect) {
      this.presetSelect.value = this.settings.exportPreset;
    }
    if (this.customWidthInput) {
      this.customWidthInput.value = this.settings.customExportWidth;
    }
    if (this.customHeightInput) {
      this.customHeightInput.value = this.settings.customExportHeight || '';
    }
    if (this.exportFormatSelect) {
      // Default to jpg if undefined
      if (!this.settings.exportFormat) this.settings.exportFormat = 'jpg';
      if (!this.settings.linkedFolders) this.settings.linkedFolders = [];
      this.exportFormatSelect.value = this.settings.exportFormat;
    }

    if (this.sliderWarp) {
      this.sliderWarp.value = this.settings.warpStrength;
      if (this.warpValue) this.warpValue.textContent = this.settings.warpStrength;
    }
    if (this.sliderOpacity) {
      this.sliderOpacity.value = this.settings.opacity;
      if (this.opacityValue) this.opacityValue.textContent = `${this.settings.opacity}%`;
    }
    if (this.sliderScale) {
        this.sliderScale.value = this.settings.scale;
        if (this.scaleValue) this.scaleValue.textContent = `${this.settings.scale}%`;
    }
    if (this.sliderRotation) {
        this.sliderRotation.value = this.settings.rotation;
        if (this.rotationValue) this.rotationValue.textContent = `${this.settings.rotation}°`;
    }
    if (this.sliderTexture) {
        this.sliderTexture.value = this.settings.textureStrength;
        if (this.textureValue) this.textureValue.textContent = `${this.settings.textureStrength}%`;
    }

    // Apply Watermark UI (v1.0.2)
    if (this.selectWatermarkPos) this.selectWatermarkPos.value = this.settings.watermarkPosition;
    if (this.sliderWatermarkScale) {
      this.sliderWatermarkScale.value = this.settings.watermarkScale;
      if (this.watermarkScaleValue) this.watermarkScaleValue.textContent = `${this.settings.watermarkScale}%`;
    }
    if (this.sliderWatermarkOpacity) {
      this.sliderWatermarkOpacity.value = this.settings.watermarkOpacity;
      if (this.watermarkOpacityValue) this.watermarkOpacityValue.textContent = `${this.settings.watermarkOpacity}%`;
    }

    // Update visibility using the new helper
    this.toggleCustomWidth();
  }

  bindElements() {
    // Setup panel
    this.btnLoadMockup = document.getElementById('btn-load-mockup');
    this.btnSelectInput = document.getElementById('btn-select-input');
    this.btnSelectOutput = document.getElementById('btn-select-output');
    this.mockupInfo = document.getElementById('mockup-info');
    this.inputInfo = document.getElementById('input-info');
    this.outputInfo = document.getElementById('output-info');
    this.sampleDesignArea = document.getElementById('sample-design-area');

    // Watermark UI (v1.0.2)
    this.btnLoadWatermark = document.getElementById('btn-load-watermark');
    this.btnClearWatermark = document.getElementById('btn-clear-watermark');
    this.watermarkControls = document.getElementById('watermark-controls');
    this.selectWatermarkPos = document.getElementById('select-watermark-pos');
    this.sliderWatermarkScale = document.getElementById('slider-watermark-scale');
    this.sliderWatermarkOpacity = document.getElementById('slider-watermark-opacity');
    this.watermarkScaleValue = document.getElementById('watermark-scale-value');
    this.watermarkOpacityValue = document.getElementById('watermark-opacity-value');

    // Canvas
    this.canvasWrapper = document.getElementById('canvas-wrapper');
    this.canvasPlaceholder = document.getElementById('canvas-placeholder');

    // Controls
    this.sliderOpacity = document.getElementById('slider-opacity');
    this.sliderWarp = document.getElementById('slider-warp');
    this.sliderScale = document.getElementById('slider-scale');
    this.sliderRotation = document.getElementById('slider-rotation');
    this.selectBlend = document.getElementById('select-blend');
    this.sliderTexture = document.getElementById('slider-texture');
    this.checkboxOverlay = document.getElementById('checkbox-overlay');

    // Values
    this.opacityValue = document.getElementById('opacity-value');
    this.warpValue = document.getElementById('warp-value');
    this.scaleValue = document.getElementById('scale-value');
    this.rotationValue = document.getElementById('rotation-value');
    this.textureValue = document.getElementById('texture-value');

    // Generate
    this.btnGenerate = document.getElementById('btn-generate');
    this.fileCount = document.getElementById('file-count');
    this.progressSection = document.getElementById('progress-section');
    this.progressFill = document.getElementById('progress-fill');
    this.progressText = document.getElementById('progress-text');

    // Library
    this.btnOpenLibrary = document.getElementById('btn-open-library');
    this.btnCloseLibrary = document.getElementById('btn-close-library');
    
    // License UI
    this.licenseModal = document.getElementById('license-modal');
    this.inputLicenseKey = document.getElementById('input-license-key');
    this.btnActivateLicense = document.getElementById('btn-activate-license');
    this.licenseErrorMessage = document.getElementById('license-error-message');
    this.libraryModal = document.getElementById('library-modal');
    this.libraryCategories = document.getElementById('library-categories');
    this.libraryGrid = document.getElementById('library-grid');
    this.librarySearch = document.getElementById('library-search');
    this.libraryCountTag = document.getElementById('library-count-tag');
    this.btnMaximizeLibrary = document.getElementById('btn-maximize-library');
    this.btnConfirmLibrary = document.getElementById('btn-confirm-library');
    this.btnImportLibrary = document.getElementById('btn-import-library');
    this.btnCloudStore = document.getElementById('btn-cloud-store'); // Cloud Store Button
    this.cloudFilterGroup = document.getElementById('cloud-filter-group');
    this.cloudFilterSelect = document.getElementById('cloud-filter-select');

    // Input Modal
    this.inputModal = document.getElementById('input-modal');
    this.inputModalTitle = document.getElementById('input-modal-title');
    this.inputModalValue = document.getElementById('input-modal-value');
    this.btnCloseInput = document.getElementById('btn-close-input');
    this.btnCancelInput = document.getElementById('btn-cancel-input');
    this.btnConfirmInput = document.getElementById('btn-confirm-input');

    // Batch Complete Modal
    this.batchModal = document.getElementById('batch-complete-modal');
    this.batchMessage = document.getElementById('batch-complete-message');

    // Auto-Updater UI (Modal)
    this.appVersion = document.getElementById('app-version');
    this.btnCheckUpdate = document.getElementById('btn-check-update');

    this.updateModal = document.getElementById('update-modal');
    this.updateModalTitle = document.getElementById('update-modal-title');
    this.updateModalMessage = document.getElementById('update-message-modal');
    this.updateSpinner = document.getElementById('update-spinner');
    this.updateProgressContainer = document.getElementById('update-progress-container');
    this.updateProgressFill = document.getElementById('update-progress-fill-modal');
    this.updateProgressText = document.getElementById('update-progress-text');
    this.updateNewVersion = document.getElementById('update-new-version');

    this.btnCloseUpdate = document.getElementById('btn-close-update');
    this.btnDownloadUpdate = document.getElementById('btn-download-update-modal');
    this.btnRestartUpdate = document.getElementById('btn-restart-update-modal');

    this.btnCloseBatch = document.getElementById('btn-close-batch');
    this.btnOpenFolder = document.getElementById('btn-open-folder');

    // Alignment Tools (v1.0.2)
    this.btnAlignCenterH = document.getElementById('btn-align-center-h');
    this.btnAlignCenterV = document.getElementById('btn-align-center-v');
    this.btnAlignFill = document.getElementById('btn-align-fill');
    this.btnResetTransform = document.getElementById('btn-transform-reset');

    // Generate Button & Count
    this.btnGenerate = document.getElementById('btn-generate');
    this.fileCount = document.getElementById('file-count');

    // Batch Toggle Elements
    this.batchToggle = document.getElementById('batch-toggle');
    this.btnSingleDesign = document.getElementById('btn-select-single-design');
    // We already have this.btnSelectInput for folder
    // We need to reference the "Select Folder" button more generally maybe?
    // Actually this.btnSelectInput is fine.

    // Export Preset Elements
    this.exportFormatSelect = document.getElementById('export-format'); // NEW: Bind Format Select
    this.presetSelect = document.getElementById('export-preset');
    this.customWidthGroup = document.getElementById('custom-width-group');
    this.customWidthInput = document.getElementById('custom-width-input');
    this.customWidthInput = document.getElementById('custom-width-input');
    this.customHeightInput = document.getElementById('custom-height-input');

    // Dynamic UX Elements
    this.step2Label = document.getElementById('step-2-label');
    this.step2Desc = document.getElementById('step-2-desc');
    this.step4Container = document.getElementById('step-4-container');

    // Mockup Color
    this.checkboxEnableTint = document.getElementById('checkbox-enable-tint');
    this.tintControls = document.getElementById('tint-controls');
    this.inputMockupColor = document.getElementById('input-mockup-color');
    this.btnResetTint = document.getElementById('btn-reset-tint');

    // Canvas Tools (Zoom & Mask)
    this.btnToggleMask = document.getElementById('btn-toggle-mask');
    this.maskControlsPanel = document.getElementById('mask-controls-panel');
    this.selectBrushMode = document.getElementById('select-brush-mode');
    this.sliderBrushSize = document.getElementById('slider-brush-size');
    this.brushSizeVal = document.getElementById('brush-size-val');
    this.btnClearMask = document.getElementById('btn-clear-mask');
    this.selectMaskTool = document.getElementById('select-mask-tool');
    this.brushSizeGroup = document.getElementById('brush-size-group');
    this.canvasHintText = document.getElementById('canvas-hint-text');

    this.btnZoomIn = document.getElementById('btn-zoom-in');
    this.btnZoomOut = document.getElementById('btn-zoom-out');
    this.btnZoomFit = document.getElementById('btn-zoom-fit');
    this.labelZoomLevel = document.getElementById('label-zoom-level');

    // Queue Off-Canvas
    this.queueOffcanvas = document.getElementById('queue-offcanvas');
    this.btnToggleQueue = document.getElementById('btn-toggle-queue');
    this.queueThumbnails = document.getElementById('queue-thumbnails');
    this.queueCount = document.getElementById('queue-count');
  }

  bindEvents() {
    // Setup buttons
    this.btnLoadMockup.addEventListener('click', () => this.loadMockup());
    if (this.btnOpenLibrary) this.btnOpenLibrary.addEventListener('click', () => this.openLibrary());
    if (this.btnCloseLibrary) this.btnCloseLibrary.addEventListener('click', () => this.closeLibrary());
    
    // Cloud Store UI
    if (this.btnCloudStore) {
      this.btnCloudStore.addEventListener('click', () => this.openCloudStore());
    }

    if (this.librarySearch) {
      this.librarySearch.addEventListener('input', () => {
        if (this._inCloudMode) {
          this._cloudSearch = this.librarySearch.value;
          this.renderCloudGrid();
        } else {
          // If we have a current category, re-render it to apply filter
          const activeItem = this.libraryCategories.querySelector('.active');
          if (activeItem) {
            activeItem.click(); // Trigger re-render
          }
        }
      });
    }

    // Close modal on outside click
    if (this.libraryModal) {
      this.libraryModal.addEventListener('click', (e) => {
        if (e.target === this.libraryModal) this.closeLibrary();
      });
    }

    this.btnSelectInput.addEventListener('click', () => this.selectInputFolder());
    this.btnSelectOutput.addEventListener('click', () => this.selectOutputFolder());

    // Batch Toggle Listener
    if (this.batchToggle) {
      this.batchToggle.addEventListener('change', (e) => {
        this.toggleBatchMode(e.target.checked);
      });
    }

    // Single Design Selection
    if (this.btnSingleDesign) {
      this.btnSingleDesign.addEventListener('click', () => this.selectSingleDesignInput());
    }

    // Alignment Tools (v1.0.2)
    if (this.btnAlignCenterH) {
      this.btnAlignCenterH.addEventListener('click', () => {
        this.designPosition.x = 0.5;
        this.updateDesignTransform();
      });
    }

    if (this.btnAlignCenterV) {
      this.btnAlignCenterV.addEventListener('click', () => {
        this.designPosition.y = 0.5;
        this.updateDesignTransform();
      });
    }

    if (this.btnAlignFill) {
      this.btnAlignFill.addEventListener('click', () => {
        this.fillDesignWidth();
      });
    }

    if (this.btnResetTransform) {
      this.btnResetTransform.addEventListener('click', () => {
        this.resetDesignTransform();
      });
    }
    // Sample design area
    this.sampleDesignArea.addEventListener('click', () => this.selectSampleDesign());
    this.sampleDesignArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.sampleDesignArea.style.borderColor = 'var(--accent-color)';
    });
    this.sampleDesignArea.addEventListener('dragleave', () => {
      this.sampleDesignArea.style.borderColor = '';
    });
    this.sampleDesignArea.addEventListener('drop', (e) => {
      e.preventDefault();
      this.sampleDesignArea.style.borderColor = '';
      if (e.dataTransfer.files.length > 0) {
        this.loadSampleDesignFromFile(e.dataTransfer.files[0]);
      }
    });

    // Sliders
    this.sliderOpacity.addEventListener('input', (e) => {
      this.settings.opacity = parseInt(e.target.value);
      this.opacityValue.textContent = `${this.settings.opacity}%`;
      this.updateDesign();
      this.saveSettings();
    });

    this.sliderWarp.addEventListener('input', (e) => {
      this.settings.warpStrength = parseInt(e.target.value);
      this.warpValue.textContent = this.settings.warpStrength;
      this.updateDisplacement();
      this.saveSettings();
    });

    this.sliderScale.addEventListener('input', (e) => {
      this.settings.scale = parseInt(e.target.value);
      this.scaleValue.textContent = `${this.settings.scale}%`;
      this.designScale = this.settings.scale / 100;
      this.updateDesignTransform();
      this.saveSettings();
    });

    this.sliderRotation.addEventListener('input', (e) => {
      this.settings.rotation = parseInt(e.target.value);
      this.rotationValue.textContent = `${this.settings.rotation}°`;
      this.designRotation = this.settings.rotation * (Math.PI / 180);
      this.updateDesignTransform();
      this.saveSettings();
    });

    this.selectBlend.addEventListener('change', (e) => {
      this.settings.blendMode = e.target.value;
      this.updateDesign();
      this.updateLighting();
      this.saveSettings();
    });

    this.sliderTexture.addEventListener('input', (e) => {
      this.settings.textureStrength = parseInt(e.target.value);
      this.textureValue.textContent = `${this.settings.textureStrength}%`;
      this.updateLighting();
    });

    this.checkboxOverlay.addEventListener('change', (e) => {
      this.settings.showOverlay = e.target.checked;
      this.updateLighting();
    });

    // Mockup Color Tint
    // Mockup Color Tint
    if (this.checkboxEnableTint) {
      this.checkboxEnableTint.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        if (this.tintControls) {
          this.tintControls.style.display = enabled ? 'block' : 'none';
        }
        this.settings.mockupColor = '#ffffff';
        if (this.inputMockupColor) this.inputMockupColor.value = '#ffffff';
        this.updateMockupColor();
      });
    }

    if (this.inputMockupColor) {
      this.inputMockupColor.addEventListener('input', (e) => {
        this.settings.mockupColor = e.target.value;
        this.updateMockupColor();
      });
    }

    if (this.btnResetTint) {
      this.btnResetTint.addEventListener('click', () => {
        this.settings.mockupColor = '#ffffff';
        if (this.inputMockupColor) this.inputMockupColor.value = '#ffffff';
        this.updateMockupColor();
      });
    }

    // Auto-Updater Listeners
    if (this.btnCheckUpdate) {
      this.btnCheckUpdate.addEventListener('click', () => {
        console.log('Check Update Clicked');
        window.electronAPI.checkForUpdates();
      });
    }
    if (this.btnDownloadUpdate) {
      this.btnDownloadUpdate.addEventListener('click', () => {
        window.electronAPI.startDownload();
        this.btnDownloadUpdate.classList.add('hidden');
      });
    }
    if (this.btnRestartUpdate) {
      this.btnRestartUpdate.addEventListener('click', () => {
        window.electronAPI.quitAndInstall();
      });
    }
    if (this.btnCloseUpdate) {
      this.btnCloseUpdate.addEventListener('click', () => {
        this.updateModal.style.display = 'none';
      });
    }

    // Generate button
    if (this.btnGenerate) this.btnGenerate.addEventListener('click', () => this.generateAll());

    // Enable Drag & Drop for all setup areas
    this.bindDragAndDropEvents();

    // Batch Modal Listeners
    if (this.batchModal) {
      this.btnCloseBatch.addEventListener('click', () => {
        this.batchModal.style.display = 'none';
      });

      this.btnOpenFolder.addEventListener('click', () => {
        this.batchModal.style.display = 'none';
        if (this.outputFolder) {
          window.electronAPI.openPathFolder(this.outputFolder);
        }
      });
    }

    // Handle Window Resize for responsive Canvas
    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        this.handleResize();
      }, 100);
    });

    // Zoom & Pan Events
    if (this.btnZoomIn) this.btnZoomIn.addEventListener('click', () => this.setZoom(this.zoomLevel + 0.25));
    if (this.btnZoomOut) this.btnZoomOut.addEventListener('click', () => this.setZoom(this.zoomLevel - 0.25));
    if (this.btnZoomFit) this.btnZoomFit.addEventListener('click', () => this.setZoom(1));

    // Mask Tool Events
    if (this.btnMaximizeLibrary) {
      this.btnMaximizeLibrary.addEventListener('click', () => this.toggleLibraryMaximize());
    }

    if (this.btnToggleMask) {
      this.btnToggleMask.addEventListener('click', () => {
        this.isMaskMode = !this.isMaskMode;
        this.btnToggleMask.classList.toggle('active', this.isMaskMode);
        if (this.maskControlsPanel) {
          this.maskControlsPanel.classList.toggle('visible', this.isMaskMode);
        }
        
        // Disable design selection if masking
        if (this.designSprite) {
          this.designSprite.eventMode = this.isMaskMode ? 'none' : 'static';
        }
        
        if (this.visualMaskSprite) {
          this.visualMaskSprite.visible = this.isMaskMode;
        }

        this.drawSelectionUI(); // Hide UI when masking
      });
    }

    if (this.selectBrushMode) {
      this.selectBrushMode.addEventListener('change', (e) => {
        this.maskBrushMode = e.target.value;
      });
    }

    if (this.selectMaskTool) {
      this.selectMaskTool.addEventListener('change', (e) => {
        this.maskToolMode = e.target.value;
        if (this.brushSizeGroup) {
          this.brushSizeGroup.style.display = this.maskToolMode === 'polygon' ? 'none' : 'block';
        }
        
        // Update hint text dynamically
        if (this.canvasHintText) {
          if (this.maskToolMode === 'polygon') {
            this.canvasHintText.textContent = "Click to add points, hit Enter/DblClick to close. Esc to cancel";
          } else {
            this.canvasHintText.textContent = "Drag to position, Shift+drag to rotate, Scroll to resize, Ctrl+Scroll to zoom";
          }
        }
        
        // Reset current polygon draw
        this.polygonPoints = [];
        if (this.polygonPreviewGraphics) this.polygonPreviewGraphics.clear();
      });
    }

    if (this.sliderBrushSize) {
      this.sliderBrushSize.addEventListener('input', (e) => {
        this.maskBrushSize = parseInt(e.target.value);
        if (this.brushSizeVal) this.brushSizeVal.textContent = `${this.maskBrushSize}px`;
      });
    }

    if (this.btnClearMask) {
      this.btnClearMask.addEventListener('click', () => this.clearMockupMask());
    }

    // Queue Off-Canvas toggle
    if (this.btnToggleQueue) {
      this.btnToggleQueue.addEventListener('click', () => {
        if (this.queueOffcanvas) {
          this.queueOffcanvas.classList.toggle('open');
        }
      });
    }

    // Slider change → mark that specific property as overridden for this mockup
    const markOverride = (key) => this.markSettingOverridden(key);
    if (this.sliderOpacity) this.sliderOpacity.addEventListener('input', () => markOverride('opacity'));
    if (this.sliderWarp) this.sliderWarp.addEventListener('input', () => markOverride('warpStrength'));
    if (this.sliderScale) this.sliderScale.addEventListener('input', () => markOverride('scale'));
    if (this.sliderRotation) this.sliderRotation.addEventListener('input', () => markOverride('rotation'));
    if (this.sliderTexture) this.sliderTexture.addEventListener('input', () => markOverride('textureStrength'));
    if (this.checkboxOverlay) this.checkboxOverlay.addEventListener('change', () => markOverride('showOverlay'));

    // Keyboard Shortcuts (Nudge, Pan, Zoom)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        this.isPanning = true;
        this.canvasWrapper.style.cursor = 'grab';
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.isPanning = false;
        this.canvasWrapper.style.cursor = 'default';
      }
    });

    // Keyboard Shortcuts (Nudge, Delete)
    window.addEventListener('keydown', (e) => {
      // Ignore if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // DELETE / BACKSPACE: Remove current design
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.designSprite || this.sampleDesignData) {
          this.clearDesign();
          e.preventDefault();
        }
        return;
      }

      // Polygon Tool complete or cancel
      if (this.isMaskMode && this.maskToolMode === 'polygon') {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.commitPolygonMask();
          return;
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.polygonPoints = [];
          if (this.polygonPreviewGraphics) this.polygonPreviewGraphics.clear();
          return;
        }
      }

      // Only active if a design is selected or exists
      if (!this.designSprite || !this.originalWidth) return;

      const stepPixels = 1; // 1 pixel nudge
      const stepX = stepPixels / this.originalWidth;
      const stepY = stepPixels / this.originalHeight;

      let handled = false;

      switch (e.key) {
        case 'ArrowLeft':
          this.designPosition.x -= stepX;
          handled = true;
          break;
        case 'ArrowRight':
          this.designPosition.x += stepX;
          handled = true;
          break;
        case 'ArrowUp':
          this.designPosition.y -= stepY;
          handled = true;
          break;
        case 'ArrowDown':
          this.designPosition.y += stepY;
          handled = true;
          break;
      }

      if (handled) {
        e.preventDefault(); // Prevent scrolling
        this.updateDesignTransform();
      }
    });

    // Patch Notes Logic
    this.btnViewPatchNotes = document.getElementById('btn-view-patch-notes');
    this.patchNotesModal = document.getElementById('patch-notes-modal');
    this.btnClosePatchNotes = document.getElementById('btn-close-patch-notes');
    this.btnAckPatchNotes = document.getElementById('btn-ack-patch-notes');

    if (this.btnViewPatchNotes) {
      this.btnViewPatchNotes.addEventListener('click', () => {
        this.patchNotesModal.style.display = 'flex';
      });
    }

    if (this.btnClosePatchNotes) {
      this.btnClosePatchNotes.addEventListener('click', () => {
        this.patchNotesModal.style.display = 'none';
      });
    }

    if (this.btnAckPatchNotes) {
      this.btnAckPatchNotes.addEventListener('click', () => {
        this.patchNotesModal.style.display = 'none';
        // Also save that they've seen it (redundant but safe)
        const currentVersion = '1.0.2';
        localStorage.setItem('lastViewedPatchNotes', currentVersion);
      });
    }

    // Auto-Show Patch Notes on First Load
    this.checkPatchNotes();
  }

  checkPatchNotes() {
    const currentVersion = '1.0.2'; // HARDCODED for this release
    const lastViewed = localStorage.getItem('lastViewedPatchNotes');

    if (lastViewed !== currentVersion) {
      // New version detected! Show notes.
      if (this.patchNotesModal) {
        this.patchNotesModal.style.display = 'flex';
      }
      // Update storage immediately so it doesn't show again
      localStorage.setItem('lastViewedPatchNotes', currentVersion);
    }
  }

  setupPresetListeners() {
    // NEW: Export Format Listener
    if (this.exportFormatSelect) {
      this.exportFormatSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        this.settings.exportFormat = val;
        
        // CRITICAL SYNC: Update global baseline if queue exists
        if (this.globalSettings) {
          this.globalSettings.exportFormat = val;
        }
        
        this.saveSettings();
      });
    }

    if (this.presetSelect) {
      this.presetSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        this.settings.exportPreset = val;
        
        // CRITICAL SYNC: Update global baseline if queue exists
        if (this.globalSettings) {
          this.globalSettings.exportPreset = val;
        }
        
        this.toggleCustomWidth();
        this.saveSettings();
      });
    }

    if (this.customWidthInput) {
      this.customWidthInput.addEventListener('change', (e) => {
        let val = parseInt(e.target.value);
        if (val < 100) val = 100;
        if (val > 8000) val = 8000;
        this.settings.customExportWidth = val;

        // Sync to global
        if (this.globalSettings) {
          this.globalSettings.customExportWidth = val;
        }

        this.saveSettings();
        if (this.updateHeightDisplay) this.updateHeightDisplay();
      });
    }

    if (this.customHeightInput) {
      this.customHeightInput.addEventListener('change', (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val)) {
          this.settings.customExportHeight = null;
        } else {
          if (val < 100) val = 100;
          if (val > 8000) val = 8000;
          this.settings.customExportHeight = val;
        }

        // Sync to global
        if (this.globalSettings) {
          this.globalSettings.customExportHeight = this.settings.customExportHeight;
        }

        this.saveSettings();
      });
    }
  }

  updateHeightDisplay() {
    // We no longer enforce auto-height. User can edit it.
    if (this.customHeightInput) {
      // If it's a fresh load or Width was changed, and current height is empty, suggest one.
      // But don't overwrite if user typed something.
      if (!this.settings.customExportHeight && this.background && this.background.texture && this.background.texture.valid) {
        const aspect = this.background.texture.width / this.background.texture.height;
        const h = Math.round(this.settings.customExportWidth / aspect);
        this.customHeightInput.placeholder = h; // Show as placeholder what it WOULD be
      }
    }
  }

  toggleCustomWidth() {
    if (!this.presetSelect || !this.customWidthGroup) return;

    // Use DOM value directly to be safe
    const isCustom = this.presetSelect.value === 'custom';

    // Force style update with priority
    this.customWidthGroup.style.setProperty('display', isCustom ? 'block' : 'none', 'important');

    if (isCustom) {
      this.updateHeightDisplay();
    }
  }

  bindDragAndDropEvents() {
    const setupDropZone = (element, handler) => {
      element.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Stop bubbling to prevent double-firing
        element.style.borderColor = 'var(--accent-color)';
        element.style.backgroundColor = 'rgba(0, 113, 227, 0.05)';
      });

      element.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        element.style.borderColor = '';
        element.style.backgroundColor = '';
      });

      element.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation(); // CRITICAL: Stop bubbling so button clicks don't double-fire parent zone
        element.style.borderColor = '';
        element.style.backgroundColor = '';

        if (e.dataTransfer.files.length > 0) {
          handler(e.dataTransfer.files);
        }
      });
    };

    // Helper: walk up to the nearest .setup-section parent for a generous drop target
    const getSection = (el) => {
      let node = el;
      while (node && !node.classList.contains('setup-section')) node = node.parentElement;
      return node || el.parentElement;
    };

    // 1. Base Mockup Drop — entire Step 1 section + the button itself
    const mockupSection = getSection(this.btnLoadMockup);
    setupDropZone(mockupSection, (files) => this.handleMockupDrop(files));
    setupDropZone(this.btnLoadMockup, (files) => this.handleMockupDrop(files));

    // 2. Design Input Drop — entire Step 2 section + both buttons
    const designSection = getSection(this.btnSelectInput);
    setupDropZone(designSection, (files) => this.handleInputFolderDrop(files));
    if (this.btnSingleDesign) {
      setupDropZone(this.btnSingleDesign, (files) => this.handleInputFolderDrop(files));
    }

    // 3. Output Folder Drop — entire section
    const outputSection = getSection(this.btnSelectOutput);
    setupDropZone(outputSection, (files) => this.handleOutputFolderDrop(files));

    // 4. Canvas Wrapper Drop (Smart: Respects Batch/Single Mode)
    if (this.canvasWrapper) {
      setupDropZone(this.canvasWrapper, (files) => {
        if (this.isBatchMode) {
          if (files[0]) {
            this.loadSampleDesignFromFile(files[0]);
          }
        } else {
          this.handleInputFolderDrop(files);
        }
      });
    }

    // 5. Watermark Drop (v1.0.2) — button + its parent section
    if (this.btnLoadWatermark) {
      const watermarkSection = getSection(this.btnLoadWatermark);
      setupDropZone(watermarkSection, (files) => this.handleWatermarkDrop(files));
      setupDropZone(this.btnLoadWatermark, (files) => this.handleWatermarkDrop(files));
    }

    // Bind Crop Button
    this.btnCrop = document.getElementById('btn-crop');
    if (this.btnCrop) {
      this.btnCrop.addEventListener('click', () => this.toggleCropMode());
    }
  }

  toggleCropMode() {
    console.log('Toggle Crop Mode called. Current state:', this.isCropping);

    if (!this.designSprite) {
      console.warn('Crop failed: No designSprite found.');
      return;
    }

    this.isCropping = !this.isCropping;
    console.log('New Crop State:', this.isCropping);

    // Update Button UI
    if (this.isCropping) {
      this.btnCrop.classList.add('active');
      this.btnCrop.style.backgroundColor = 'var(--accent-color)';
      this.btnCrop.style.color = '#fff';
    } else {
      this.btnCrop.classList.remove('active');
      this.btnCrop.style.backgroundColor = '';
      this.btnCrop.style.color = '';
    }

    if (this.isCropping) {
      // ENTER CROP MODE
      this.isSelected = true;

      if (!this.cropRect) {
        const tex = this.designSprite.texture;
        console.log('Initializing Crop Rect:', tex.width, tex.height);
        this.cropRect = { x: 0, y: 0, width: tex.width, height: tex.height };
      }

      if (!this.cropMask) {
        console.log('Creating new Crop Mask');
        this.cropMask = new PIXI.Graphics();
        this.designSprite.mask = this.cropMask;
        this.designSprite.addChild(this.cropMask);
      }
      this.updateCropMask();
    } else {
      // EXIT CROP MODE
      console.log('Exiting Crop Mode');
      if (this.designSprite && this.cropMask) {
        this.designSprite.mask = null;
        this.designSprite.removeChild(this.cropMask);
        this.cropMask.destroy();
        this.cropMask = null;
      }
    }
    this.drawSelectionUI();
  }

  handleWatermarkDrop(files) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/avif'];
    if (!validTypes.includes(file.type)) {
      console.warn("Invalid watermark file type:", file.type);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.watermarkTexture = PIXI.Texture.from(e.target.result);
      
      // Setup UI (Match loadWatermark logic)
      if (this.watermarkControls) this.watermarkControls.classList.remove('hidden');
      if (this.btnClearWatermark) this.btnClearWatermark.classList.remove('hidden');
      
      this.createWatermarkSprite();
    };
    reader.readAsDataURL(file);
  }

  async handleMockupDrop(files) {
    if (!files || files.length === 0) return;

    const validFiles = [];
    const readPromises = Array.from(files).map(file => {
      return new Promise(async (resolve) => {
        if (!file.path) return resolve(null);
        
        const info = await window.electronAPI.getDroppedFilePath(file.path);
        if (info && info.isFile && /\.(png|jpe?g|webp|avif)$/i.test(info.name)) {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({
              name: info.name,
              path: info.path,
              data: e.target.result
            });
          };
          reader.readAsDataURL(file);
        } else {
          resolve(null);
        }
      });
    });

    const results = (await Promise.all(readPromises)).filter(r => r !== null);
    
    if (results.length > 0) {
      // Replace batch queue with all dropped bases
      this.mockupQueue = results;
      this.activeQueueIndex = 0;
      this.mockupData = results[0];
      
      this.resetMockupSettings(); // Reset Tint
      
      if (results.length === 1) {
        this.mockupInfo.textContent = results[0].name;
      } else {
        this.mockupInfo.textContent = `${results.length} Bases Loaded`;
      }
      
      this.populateQueuePanel();
      this.initPixiApp();
    }
  }

  async handleInputFolderDrop(files) {
    const file = files[0];
    if (file.path) {
      const info = await window.electronAPI.getDroppedFilePath(file.path);
      if (info && info.isDirectory) {
        // It's a folder, trigger load
        const result = await window.electronAPI.scanFolder(file.path);
        if (result) {
          let files = result.files || result;
          let folderPath = result.path || file.path;

          if (Array.isArray(files)) {
            // Force Batch Mode if Folder Dropped
            if (this.batchToggle && !this.batchToggle.checked) {
              this.batchToggle.checked = true;
              this.toggleBatchMode(true);
            }

            this.inputFolder = folderPath;
            this.designFiles = files;
            this.inputInfo.textContent = `${files.length} files in ${folderPath.split(/[\\/]/).pop()}`;

            // Auto-set Output Folder
            try {
              const processedPath = await window.electronAPI.pathJoin(this.inputFolder, 'processed');
              this.outputFolder = processedPath;
              this.outputInfo.textContent = 'Auto: ' + processedPath.split(/[\\/]/).pop();
              this.outputInfo.title = processedPath;
            } catch (e) { console.error("Auto-output failed:", e); }

            this.updateGenerateButton();
          }
        }
      } else if (info && info.isFile && /\.(png|jpe?g|webp|avif)$/i.test(info.name)) {
        // SINGLE FILE DROPPED

        if (this.isBatchMode) {
          // BUG FIX: If user drops a single image onto the 'Design Folder' area while in Batch Mode,
          // do NOT forcefully switch to Single Mode. Instead, load it as the Sample Design preview.
          this.loadSampleDesignFromFile(file);
          return; // Exit without changing modes
        }

        // Force Single Mode (Only needed if UI somehow got out of sync)
        if (this.batchToggle && this.batchToggle.checked) {
          this.batchToggle.checked = false;
          this.toggleBatchMode(false);
        }

        this.inputFolder = null;
        this.designFiles = [info.path];
        this.inputInfo.textContent = "1 file selected: " + info.name;

        // Auto-Preview (Read file to update Canvas)
        const reader = new FileReader();
        reader.onload = (e) => {
          this.loadDesignToCanvas(e.target.result);
        };
        reader.readAsDataURL(file); // file object from drop event has native file access

        // Auto Output
        try {
          const sep = window.electronAPI.isWindows ? '\\' : '/';
          const parentDir = info.path.substring(0, info.path.lastIndexOf(sep));
          const processedPath = await window.electronAPI.pathJoin(parentDir, 'processed');
          this.outputFolder = processedPath;
          this.outputInfo.textContent = 'Auto: processed';
        } catch (e) { console.error("Auto-output single failed:", e); }

        this.updateGenerateButton();
      }
    }
  }

  async handleOutputFolderDrop(files) {
    const file = files[0];
    if (file.path) {
      const info = await window.electronAPI.getDroppedFilePath(file.path);
      if (info && info.isDirectory) {
        this.outputFolder = info.path;
        this.outputInfo.textContent = info.path.split(/[\\/]/).pop();
        this.updateGenerateButton();
      }
    }
  }

  clearDesign() {
    // 1. Remove from Pixi
    if (this.designSprite && this.designContainer) {
      this.designContainer.removeChild(this.designSprite);
    }
    this.designSprite = null;

    // 2. Clear Helpers
    this.isCropping = false;
    this.isSelected = false;
    if (this.handleGraphics) this.handleGraphics.clear();
    if (this.guideGraphics) this.guideGraphics.clear();

    if (this.cropMask) {
      this.cropMask.clear();
      this.cropMask = null;
    }
    this.cropRect = null;
    this.handles = null;
    this.cropHandles = null;

    // 3. Clear Data
    this.sampleDesignData = null;
    this.pendingDesignUrl = null;

    // 4. Clear Input File List (Crucial for Single Mode)
    // If not in batch mode, clear the design files list so "Generate" is disabled
    if (!this.isBatchMode) {
      this.designFiles = [];
      this.inputInfo.textContent = ''; // Clear file name text
    }

    // 5. Update UI (Sample Area)
    if (this.sampleDesignArea) {
      this.sampleDesignArea.innerHTML = '<p>Drag a design here or click to select</p>';
      this.sampleDesignArea.style.borderColor = '';
      this.sampleDesignArea.style.backgroundImage = '';
    }

    // 6. Update Buttons
    this.updateGenerateButton();

    // 7. Hide/Reset Crop Button UI if active
    if (this.btnCrop) {
      this.btnCrop.classList.remove('active');
      this.btnCrop.style.backgroundColor = '';
      this.btnCrop.style.color = '';
    }

    console.log('Design cleared.');
  }

  toggleBatchMode(isBatch) {
    this.isBatchMode = isBatch;
    // Show/Hide buttons based on mode
    if (isBatch) {
      this.btnSelectInput.classList.remove('hidden');
      this.btnSingleDesign.classList.add('hidden');
      this.inputInfo.textContent = ''; // Clear info when switching

      // Update Labels
      if (this.step2Label) this.step2Label.textContent = 'Design Folder';
      if (this.step2Desc) this.step2Desc.textContent = 'Select the folder containing your design files.';

      // Show Step 4 (Sample Design) is visible in Batch Mode
      if (this.step4Container) this.step4Container.classList.remove('hidden');

    } else {
      this.btnSelectInput.classList.add('hidden');
      this.btnSingleDesign.classList.remove('hidden');
      this.inputInfo.textContent = ''; // Clear info

      // Update Labels
      if (this.step2Label) this.step2Label.textContent = 'Design Image';
      if (this.step2Desc) this.step2Desc.textContent = 'Select the single design image file.';

      // Hide Step 4 (Redundant) in Single Mode
      if (this.step4Container) this.step4Container.classList.add('hidden');
    }

    // CRITICAL FIX: Reset all input states when switching modes
    this.inputFolder = null;
    this.designFiles = [];
    this.inputInfo.textContent = ''; // Clear visual text

    // Reset Output Folder (since it depends on input context)
    this.outputFolder = null;
    if (this.outputInfo) this.outputInfo.textContent = '';

    // Clear Design
    this.clearDesign();


    // Reset Sample Design Area Text (UI)
    if (this.sampleDesignArea) {
      this.sampleDesignArea.innerHTML = '<p>Drag a design here or click to select</p>';
      this.sampleDesignArea.style.borderColor = '';
    }

    // Update button state (will disable it until new input is selected)
    this.updateGenerateButton();
  }

  async selectSingleDesignInput() {
    // We use selectMockupFile because it returns the object { path, name, data } we need
    const resultObj = await window.electronAPI.selectMockupFile();
    if (resultObj && resultObj.path) {
      this.inputFolder = null; // No folder
      this.designFiles = [resultObj.path]; // Array with 1 file
      this.inputInfo.textContent = "1 file selected: " + resultObj.name;

      // Allow Manual Output Folder or Auto
      if (!this.outputFolder) {
        try {
          const sep = window.electronAPI.isWindows ? '\\' : '/';
          const parentDir = resultObj.path.substring(0, resultObj.path.lastIndexOf(sep));
          const processedPath = await window.electronAPI.pathJoin(parentDir, 'processed');
          this.outputFolder = processedPath;
          this.outputInfo.textContent = 'Auto: processed';
        } catch (e) {
          console.error("Auto output failed", e);
        }
      }

      // AUTO-LOAD to Canvas (Preview)
      if (resultObj.data) {
        this.loadDesignToCanvas(resultObj.data);
      }
      this.updateGenerateButton();
    }
  }

  async loadMockup() {
    const results = await window.electronAPI.selectMockupFile();
    if (results && results.length > 0) {
      // FIX: Replace batch queue with all manually selected bases
      this.mockupQueue = results;

      this.resetMockupSettings(); // Reset Tint

      this.mockupData = results[0];
      if (results.length === 1) {
        this.mockupInfo.textContent = results[0].name;
      } else {
        this.mockupInfo.textContent = `${results.length} Bases Loaded`;
      }
      
      this.activeQueueIndex = 0;
      this.populateQueuePanel();
      
      this.initPixiApp();
    }
  }

  async selectInputFolder() {
    const result = await window.electronAPI.selectInputFolder();
    if (result) {
      this.inputFolder = result.path;
      this.designFiles = result.files;
      this.inputInfo.textContent = `${result.files.length} files in ${result.path.split(/[\\/]/).pop()}`;

      // Auto-set Output Folder
      const processedPath = await window.electronAPI.pathJoin(this.inputFolder, 'processed');
      this.outputFolder = processedPath;
      this.outputInfo.textContent = 'Auto: ' + processedPath.split(/[\\/]/).pop(); // e.g. "processed"
      this.outputInfo.title = processedPath;

      this.updateGenerateButton();
    }
  }

  async selectOutputFolder() {
    const result = await window.electronAPI.selectOutputFolder();
    if (result) {
      this.outputFolder = result;
      this.outputInfo.textContent = result.split(/[\\/]/).pop();
      this.updateGenerateButton();
    }
  }

  async selectSampleDesign() {
    const designData = await window.electronAPI.selectSampleDesignFile();
    if (designData) {
      this.sampleDesignData = designData;
      this.showSampleDesignPreview(designData);
      this.loadDesignToCanvas(designData, true); // New Design = True
    }
  }

  async loadSampleDesignFromFile(file) {
    // Store original path for protection logic in export
    this.sampleDesignPath = file.path ? file.path.replace(/\\/g, '/') : null;

    // Check if it's a file object (from drag drop)
    if (file.path) {
      const designData = await window.electronAPI.loadDesignFile(file.path);
      if (designData) {
        this.sampleDesignData = designData;
        this.showSampleDesignPreview(designData);
        this.loadDesignToCanvas(designData, true); // New Design = True
      }
    } else {
      // Fallback for file object
      const reader = new FileReader();
      reader.onload = (e) => {
        this.sampleDesignData = e.target.result;
        this.showSampleDesignPreview(e.target.result);
        this.loadDesignToCanvas(e.target.result, true); // New Design = True
      };
      reader.readAsDataURL(file);
    }
  }

  showSampleDesignPreview(dataUrl) {
    this.sampleDesignArea.innerHTML = `<img src="${dataUrl}" alt="Sample Design">`;
  }

  updateGenerateButton() {
    // Robust check for both Single and Batch modes
    const hasMockup = !!this.mockupData;

    // In Single mode, 'inputFolder' is null, but 'designFiles' has 1 item.
    // In Batch mode, 'inputFolder' is set AND 'designFiles' has items.
    const hasInput = (this.designFiles && this.designFiles.length > 0);

    const hasOutput = !!this.outputFolder;

    // We don't strictly need sampleDesignData for generation if we have files.
    // However, for positioning, users *should* have loaded a design.
    // In Single Mode, the design IS the sample, so it's fine.

    if (hasMockup && hasInput && hasOutput) {
      this.btnGenerate.disabled = false;
      this.btnGenerate.classList.remove('disabled');
      this.btnGenerate.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg> Generate All Files`;

      const count = this.designFiles.length;
      // Update the hint text if it exists (it's the next sibling in HTML structure usually, or we find it)
      // The original code used 'this.fileCount'
      if (this.fileCount) {
        this.fileCount.textContent = `${count} files ready to process`;
        this.fileCount.style.opacity = '1';
      }
    } else {
      this.btnGenerate.disabled = true;
      this.btnGenerate.classList.add('disabled');
      // Keep icon to prevent layout shift
      this.btnGenerate.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg> Generate All Files`;

      if (this.fileCount) {
        this.fileCount.textContent = 'Select input/output to continue';
        this.fileCount.style.opacity = '0.7';
      }
    }
  }

  async generateNormalMap(imgDataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Use full resolution for quality normal maps
        const MAX_DIM = 2048;
        let w = img.width;
        let h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
          w = Math.floor(w * ratio);
          h = Math.floor(h * ratio);
        }
        
        canvas.width = w;
        ctx.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        // 1. Draw image with MASSIVE blur and grayscale
        // We MUST obliterate the fine fabric grain/threads, otherwise the normal map will
        // zig-zag the design over every thread causing "granular" pixelation.
        // We only want the macro-folds (large curves).
        ctx.filter = 'blur(16px) grayscale(100%)';
        ctx.drawImage(img, 0, 0, w, h);
        
        // 2. Extract pixels
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        
        // Create new imageData for Normal Map
        const normalData = ctx.createImageData(w, h);
        const nd = normalData.data;
        
        // 3. Sobel Filter for Normal Map
        // PIXI DisplacementFilter: R=X shift, G=Y shift. 128=neutral.
        // With a 16px blur, gradients are very smooth and faint. We boost strength
        // to clearly encode the large fold directions.
        const strength = 1.0;
        
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = (y * w + x) * 4;
            
            const tl = data[((y - 1) * w + (x - 1)) * 4];
            const tc = data[((y - 1) * w + x) * 4];
            const tr = data[((y - 1) * w + (x + 1)) * 4];
            
            const ml = data[(y * w + (x - 1)) * 4];
            const mr = data[(y * w + (x + 1)) * 4];
            
            const bl = data[((y + 1) * w + (x - 1)) * 4];
            const bc = data[((y + 1) * w + x) * 4];
            const br = data[((y + 1) * w + (x + 1)) * 4];
            
            // Sobel X and Y gradients
            const dX = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
            const dY = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
            
            // Encode into 0-255 range centered at 128
            nd[idx]     = Math.min(Math.max(128 + dX * strength, 0), 255); // R = X slope
            nd[idx + 1] = Math.min(Math.max(128 + dY * strength, 0), 255); // G = Y slope
            nd[idx + 2] = 255;                                            // B = Up
            nd[idx + 3] = 255;                                            // A = Full
          }
        }
        
        // Fill border pixels with neutral (128,128,255)
        for (let x = 0; x < w; x++) {
          // Top row
          nd[x * 4] = 128; nd[x * 4 + 1] = 128; nd[x * 4 + 2] = 255; nd[x * 4 + 3] = 255;
          // Bottom row
          const bi = ((h - 1) * w + x) * 4;
          nd[bi] = 128; nd[bi + 1] = 128; nd[bi + 2] = 255; nd[bi + 3] = 255;
        }
        for (let y = 0; y < h; y++) {
          // Left column
          const li = (y * w) * 4;
          nd[li] = 128; nd[li + 1] = 128; nd[li + 2] = 255; nd[li + 3] = 255;
          // Right column
          const ri = (y * w + w - 1) * 4;
          nd[ri] = 128; nd[ri + 1] = 128; nd[ri + 2] = 255; nd[ri + 3] = 255;
        }
        
        ctx.putImageData(normalData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = imgDataUrl;
    });
  }

  async initPixiApp() {
    // Remove existing app if any
    if (this.app) {
      this.app.destroy(true, { children: true, texture: true, baseTexture: true });
      // Remove old canvas
      const oldCanvas = this.canvasWrapper.querySelector('canvas');
      if (oldCanvas) oldCanvas.remove();
      this.interactionsBound = false; // FIX: Allow re-binding listeners for new canvas
    }

    // Hide placeholder
    this.canvasPlaceholder.style.display = 'none';

    // Create new Pixi application
    const img = new Image();

    img.onload = async () => {
      // Calculate display size to fit in canvas wrapper
      const wrapperRect = this.canvasWrapper.getBoundingClientRect();
      const maxWidth = wrapperRect.width - 40;
      const maxHeight = wrapperRect.height - 40;

      // Store original dimensions for export
      this.originalWidth = img.width;
      this.originalHeight = img.height;

      // Scale down for display if needed
      const scaleX = maxWidth / img.width;
      const scaleY = maxHeight / img.height;
      const displayScale = Math.min(scaleX, scaleY, 1);

      const displayWidth = Math.floor(img.width * displayScale);
      const displayHeight = Math.floor(img.height * displayScale);

      this.displayScale = displayScale;

      // Create Pixi Application
      // SUPERSAMPLING: render at devicePixelRatio * 2
      // This forces extreme 4k-like internal rendering, eliminating pixelation completely
      const renderRes = Math.max(window.devicePixelRatio || 1, 2) * 2;
      
      this.app = new PIXI.Application({
        width: displayWidth,
        height: displayHeight,
        backgroundColor: 0xf5f5f7,
        preserveDrawingBuffer: true,
        resolution: renderRes,
        autoDensity: true,
        antialias: true
      });

      this.canvasWrapper.appendChild(this.app.view);

      // Setup layers (interaction will be initialized inside once textures load)
      this.setupLayers();
    };

    img.onerror = (err) => {
      console.error('Failed to load mockup image:', err);
    };

    img.src = this.mockupData.data;
  }

  setupLayers() {
    const mockupTexture = PIXI.Texture.from(this.mockupData.data);

    // CRITICAL TIMING FIX: 
    // If the base texture hasn't been uploaded to the GPU yet, rendering it 
    // to a RenderTexture yields a blank/black image. A blank image generates 0 slope, 
    // meaning the grey hoodie receives exactly 0 displacement (perfectly flat).
    if (!mockupTexture.baseTexture.valid) {
      mockupTexture.baseTexture.once('loaded', () => {
        requestAnimationFrame(() => {
          this.setupLayers();
        });
      });
      return; // Abort and wait for GPU load
    }

    // Now safely setup interaction since texture is mathematically loaded and sized
    this.setupInteraction();

    // Layer 1: Background (Base mockup)
    this.background = new PIXI.Sprite(mockupTexture);
    this.background.width = this.app.screen.width;
    this.background.height = this.app.screen.height;

    // Apply persisted tint
    if (this.settings.mockupColor) {
      this.background.tint = this.settings.mockupColor;
    }

    // --- ADOBE-GRADE DISPLACEMENT ENGINE v2 ---
    // We must render the filters to a Texture! PIXI.DisplacementFilter ignores the .filters
    // array on its target sprite and reads the raw base texture instead.
    const tempSprite = new PIXI.Sprite(mockupTexture);
    tempSprite.width = this.app.screen.width;
    tempSprite.height = this.app.screen.height;

    // FabricMapFilter v2: Multi-scale directional Sobel with separate X/Y channels
    const fabricFilter = new FabricMapFilter(this.app.screen.width, this.app.screen.height);

    // Light blur to smooth out pixel noise without killing wrinkle directionality
    // Lower than v1 (was 6) because the multi-scale shader already handles smoothing internally
    const blurFilter = new PIXI.filters.BlurFilter();
    blurFilter.quality = 4;
    blurFilter.blur = 3;

    tempSprite.filters = [fabricFilter, blurFilter];

    // Force PIXI to bake the blur into a flat texture so the DisplacementFilter can read it
    const renderTexture = PIXI.RenderTexture.create({
      width: this.app.screen.width,
      height: this.app.screen.height,
      resolution: this.app.renderer.resolution
    });
    this.app.renderer.render(tempSprite, { renderTexture: renderTexture });

    this.displacementSprite = new PIXI.Sprite(renderTexture);
    this.displacementSprite.texture.baseTexture.wrapMode = PIXI.WRAP_MODES.CLAMP;

    this.displacementFilter = new PIXI.DisplacementFilter(this.displacementSprite);
    this.displacementFilter.resolution = Math.max(window.devicePixelRatio || 1, 2) * 2; // Match super sampling
    
    // Initialize at 0 to avoid jump cut
    this.displacementFilter.scale.x = 0;
    this.displacementFilter.scale.y = 0;

    // Layer 3: Design Container
    this.designContainer = new PIXI.Container();
    this.designContainer.filters = [this.displacementFilter];

    // --- TRI-LAYER REALISM ENGINE ---
    // 1. Shadow Map (Multiply): Deepens folds and crevices.
    this.shadowLayer = new PIXI.Sprite(mockupTexture);
    this.shadowLayer.width = this.app.screen.width;
    this.shadowLayer.height = this.app.screen.height;
    this.shadowLayer.blendMode = PIXI.BLEND_MODES.MULTIPLY;

    // Shadow Tuning: High contrast to keep midtones clean, deep blacks for folds.
    // Shadow Tuning: High contrast to keep midtones clean, deep blacks for folds.
    // FIX: Removed unsafe check for PIXI.features which caused crash. Using standard PIXI.filters location.
    const shadowMatrix = new PIXI.filters.ColorMatrixFilter();
    shadowMatrix.desaturate();
    // "Opaque Ink" Tuning v2.1: Adjusted for consistency
    // We boost brightness HIGH to ensure whites are pure (Transparent in Multiply)
    shadowMatrix.contrast(3, false); // Reduced from 4 to prevent crushing mids
    shadowMatrix.brightness(3.0, false); // Increased from 2.5 to washout greys
    this.shadowLayer.filters = [shadowMatrix];
    this.shadowLayer.alpha = 0; // Default to 0, let updateLighting handle it

    // 2. Texture Map (Hard Light): Re-introduces the fabric grain we blurred out.
    // This is the "Secret Sauce" for extreme realism.
    this.textureLayer = new PIXI.Sprite(mockupTexture);
    this.textureLayer.width = this.app.screen.width;
    this.textureLayer.height = this.app.screen.height;
    this.textureLayer.blendMode = PIXI.BLEND_MODES.HARD_LIGHT; // Hard Light = perfect for texturing

    // Texture Tuning: High Pass effect simulation
    // We want neutral gray (invisible) for flat areas, and light/dark for grain.
    const textureMatrix = new PIXI.filters.ColorMatrixFilter();
    textureMatrix.desaturate();
    textureMatrix.contrast(2, false); // Extreme contrast to isolate grain
    this.textureLayer.filters = [textureMatrix];
    this.textureLayer.alpha = 0; // Default to 0

    // 3. Highlight Map (Screen): Adds specular sheen on top.
    this.highlightLayer = new PIXI.Sprite(mockupTexture);
    this.highlightLayer.width = this.app.screen.width;
    this.highlightLayer.height = this.app.screen.height;
    this.highlightLayer.blendMode = PIXI.BLEND_MODES.SCREEN;

    const highlightMatrix = new PIXI.filters.ColorMatrixFilter();
    highlightMatrix.contrast(2, false); // Only brightest peaks
    highlightMatrix.brightness(0.6, false); // Darken everything else
    this.highlightLayer.filters = [highlightMatrix];
    this.highlightLayer.alpha = 0; // Default to 0

    // Build stage
    this.app.stage.addChild(this.background);

    this.displacementSprite.renderable = false; // Hidden but active
    this.app.stage.addChild(this.displacementSprite);

    this.app.stage.addChild(this.designContainer);

    // --- MASK SYSTEM ---
    this.maskTexture = PIXI.RenderTexture.create({
      width: this.app.screen.width,
      height: this.app.screen.height,
      resolution: 1
    });
    this.visualMaskTexture = PIXI.RenderTexture.create({
      width: this.app.screen.width,
      height: this.app.screen.height,
      resolution: 1
    });
    const bgRect = new PIXI.Graphics();
    bgRect.beginFill(0xFFFFFF);
    bgRect.drawRect(0, 0, this.app.screen.width, this.app.screen.height);
    bgRect.endFill();
    this.app.renderer.render(bgRect, { renderTexture: this.maskTexture });

    this.maskSprite = new PIXI.Sprite(this.maskTexture);
    this.maskSprite.renderable = false; // Important: hide the literal white sprite
    this.app.stage.addChild(this.maskSprite);

    this.visualMaskSprite = new PIXI.Sprite(this.visualMaskTexture);
    this.visualMaskSprite.alpha = 0.6; // Higher contrast red overlay
    this.visualMaskSprite.visible = false; // Hidden by default until Mask tool is active
    // We defer adding this until uiContainer is created so it sits on top
    
    // Apply Mask to Design ONLY (so background/shadows aren't erased)
    this.designContainer.mask = this.maskSprite;
    
    this.maskOperations = []; // Reset ops for new mockup
    this.brushGraphics = new PIXI.Graphics();
    // --- END MASK SYSTEM ---

    this.app.stage.addChild(this.shadowLayer);
    this.app.stage.addChild(this.textureLayer); // NEW: Add texture layer
    this.app.stage.addChild(this.highlightLayer);

    // Layer 5: UI Overlay (Guides & Handles)
    this.uiContainer = new PIXI.Container();

    // Smart Guides (Lines)
    this.guideGraphics = new PIXI.Graphics();
    this.uiContainer.addChild(this.guideGraphics);

    // Transform Handles (Box + Corners)
    this.handleGraphics = new PIXI.Graphics();
    this.uiContainer.addChild(this.handleGraphics);

    this.app.stage.addChild(this.uiContainer);

    // FIX: Add visualMaskSprite to uiContainer so it is guaranteed on top of Shadows/Textures
    if (this.visualMaskSprite) {
      this.uiContainer.addChild(this.visualMaskSprite);
    }
    
    // Polygon Preview (above visualMask)
    this.polygonPreviewGraphics = new PIXI.Graphics();
    this.uiContainer.addChild(this.polygonPreviewGraphics);

    this.updateLighting();

    // FIX: Initialize interactions for the new canvas
    this.setupInteraction();

    // FIX: Persist design across mockup switches
    if (this.pendingDesignUrl) {
      this.loadDesignToCanvas(this.pendingDesignUrl, false); // Existing Design = False
    }

    // FIX (v2): Apply pending mockup state AFTER canvas is fully ready
    // This replaces the old setTimeout(300) race condition that caused
    // design position to be lost on slow image loads.
    if (this._pendingMockupState) {
      const state = this._pendingMockupState;
      this._pendingMockupState = null;
      // Use requestAnimationFrame to ensure PIXI has rendered the first frame
      requestAnimationFrame(() => {
        this.applyMockupState(state);
      });
    }
  }

  handleResize() {
    if (!this.app || !this.originalWidth || !this.originalHeight) return;

    // Calculate display size to fit in canvas wrapper (matching init logic)
    const wrapperRect = this.canvasWrapper.getBoundingClientRect();
    const maxWidth = wrapperRect.width - 40;
    const maxHeight = wrapperRect.height - 40;

    const scaleX = maxWidth / this.originalWidth;
    const scaleY = maxHeight / this.originalHeight;
    const displayScale = Math.min(scaleX, scaleY, 1);

    const displayWidth = Math.floor(this.originalWidth * displayScale);
    const displayHeight = Math.floor(this.originalHeight * displayScale);

    this.displayScale = displayScale;

    // 1. Resize PIXI Renderer
    this.app.renderer.resize(displayWidth, displayHeight);

    // 2. Resize Background Layer
    if (this.background) {
      this.background.width = displayWidth;
      this.background.height = displayHeight;
    }

    // 3. Resize Displacement Layer
    if (this.displacementSprite) {
      this.displacementSprite.width = displayWidth;
      this.displacementSprite.height = displayHeight;
    }

    // 4. Resize Lighting / Textures
    if (this.shadowLayer) {
      this.shadowLayer.width = displayWidth;
      this.shadowLayer.height = displayHeight;
    }
    if (this.textureLayer) {
      this.textureLayer.width = displayWidth;
      this.textureLayer.height = displayHeight;
    }
    if (this.highlightLayer) {
      this.highlightLayer.width = displayWidth;
      this.highlightLayer.height = displayHeight;
    }

    // 5. Update Watermark Position
    if (this.watermarkSprite) {
      this.updateWatermarkTransform();
    }

    // 6. Update Design bounds
    if (this.designSprite) {
      // Re-calculate the base percentage-based width relative to the new canvas width!
      const targetWidth = displayWidth * 0.40;
      const aspectRatio = this.designSprite.texture.width / this.designSprite.texture.height;

      this.baseDesignWidth = targetWidth;
      this.baseDesignHeight = targetWidth / aspectRatio;
      
      this.updateDesignTransform();
      this.drawSelectionUI();
    }
  }

  loadDesignToCanvas(dataUrl, isNewDesign = false) {
    // FIX: Save URL so we can reload it if mockup changes
    this.pendingDesignUrl = dataUrl;

    if (!this.app || !this.designContainer) return;

    // Clear existing design
    this.designContainer.removeChildren();

    const designTexture = PIXI.Texture.from(dataUrl);

    // CRITICAL: Force bilinear filtering to prevent jagged/pixelated edges
    // This is the #1 cause of "pixelated" text on mockups — default is NEAREST.
    designTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
    designTexture.baseTexture.mipmap = PIXI.MIPMAP_MODES.ON;

    // We revert to SimplePlane with 80x80 mesh. 
    // Sprite + DisplacementFilter can cause harsh boundary clipping.
    // The adaptive mesh geometry smooths the linear UV coordinate interpolation.
    this.designSprite = new PIXI.SimplePlane(designTexture, 80, 80);
    
    // Enable Anisotropic filtering for angled texture precision
    designTexture.baseTexture.anisotropicLevel = 16;

    // FIX: Ensure interactions work even after switching mockups
    this.designSprite.eventMode = 'static';
    this.designSprite.cursor = 'pointer';

    // Reset interaction state
    this.isSelected = false;
    this.drawSelectionUI();

    // Wait for texture to load
    if (designTexture.baseTexture.valid) {
      this.positionDesign(isNewDesign);
    } else {
      designTexture.baseTexture.on('loaded', () => {
        this.positionDesign(isNewDesign);
      });
    }

    this.designContainer.addChild(this.designSprite);
    this.updateDesign(); // Apply initial opacity/blend

    // Setup Grid Processing for Mesh
    this.setupMeshGrid();

    this.updateGenerateButton();

    // FIX: Force displacement filter pipeline reset.
    // PIXI won't detect a scale change if the value is already the same.
    // So we: 1) null out the filters array, 2) wait for a render flush,
    // 3) reassign the filters AND set scale from 0 → warpStrength.
    this.displacementFilter.scale.set(0, 0);
    this.designContainer.filters = null;
    setTimeout(() => {
      this.designContainer.filters = [this.displacementFilter];
      const s = this._computeDisplacementScale(this.settings.warpStrength);
      this.displacementFilter.scale.set(s, s);
    }, 150);
  }

  positionDesign(isNewDesign = false) {
    if (!this.designSprite) return;

    // Smart Placement: Fit to 40% of mockup width (Chest Print Standard)
    const targetWidth = this.app.screen.width * 0.40;
    const aspectRatio = this.designSprite.texture.width / this.designSprite.texture.height;

    this.baseDesignWidth = targetWidth;
    this.baseDesignHeight = targetWidth / aspectRatio;

    // Removed: We no longer reset position to 0.5/0.5 for new designs.
    // This allows users to set a position on Mockup 1, and drop new designs into 
    // that exact same chest spot without losing their alignment work.
    
    // We still want to update the UI sliders to ensure they match internal state
    if (isNewDesign) {
      if (this.sliderScale) {
        this.sliderScale.value = Math.round(this.designScale * 100);
        this.scaleValue.textContent = `${Math.round(this.designScale * 100)}%`;
      }
      if (this.sliderRotation) {
        this.sliderRotation.value = this.designRotation;
        this.rotationValue.textContent = `${this.designRotation}°`;
      }
    }

    this.isSelected = true; // Auto-select new designs

    // Initial transform update will handle x/y/width/height
    this.updateDesignTransform();
  }

  fillDesignWidth() {
    if (!this.designSprite || !this.app) return;

    // Fill 95% of mockup width (Safety margin)
    const targetPixels = this.app.screen.width * 0.95;
    const newScale = targetPixels / this.baseDesignWidth;

    this.settings.scale = Math.round(newScale * 100);
    this.designScale = newScale;

    // Update UI
    if (this.sliderScale) {
      this.sliderScale.value = this.settings.scale;
      this.scaleValue.textContent = `${this.settings.scale}%`;
    }

    this.updateDesignTransform();
  }

  resetDesignTransform() {
    if (!this.designSprite) return;

    // Reset State
    this.designPosition = { x: 0.5, y: 0.5 };
    this.designScale = 1.0;
    this.designRotation = 0;

    this.settings.scale = 100;
    this.settings.rotation = 0;
    this.settings.opacity = 100;
    this.settings.warpStrength = 7; // Default

    // Update UI Sliders
    if (this.sliderScale) {
      this.sliderScale.value = 100;
      this.scaleValue.textContent = "100%";
    }
    if (this.sliderRotation) {
      this.sliderRotation.value = 0;
      this.rotationValue.textContent = "0°";
    }
    if (this.sliderOpacity) {
      this.sliderOpacity.value = 100;
      this.opacityValue.textContent = "100%";
    }
    if (this.sliderWarp) {
      this.sliderWarp.value = 7;
      this.warpValue.textContent = "7";
    }

    this.updateDesignTransform();
    this.updateDesign();
    this.updateDisplacement();
    this.updateLighting();
  }

  updateCropMask() {
    if (!this.cropMask || !this.cropRect || !this.designSprite) return;

    this.cropMask.clear();
    this.cropMask.beginFill(0xffffff);

    // Draw rect in Local Space
    // To apply a mask in local space of SimplePlane, we might need to handle transforms
    // If we add cropMask as child of designSprite, it inherits transform.
    // Check parenting - force it to be child of designSprite for local masking
    if (this.cropMask.parent !== this.designSprite) {
      this.designSprite.addChild(this.cropMask);
    }

    this.cropMask.drawRect(
      this.cropRect.x,
      this.cropRect.y,
      this.cropRect.width,
      this.cropRect.height
    );
    this.cropMask.endFill();
  }

  updateDesignTransform() {
    if (!this.designSprite) return;

    // Position
    this.designSprite.x = this.app.screen.width * this.designPosition.x;
    this.designSprite.y = this.app.screen.height * this.designPosition.y;

    // For SimplePlane, width/height setter works by scaling vertices
    this.designSprite.width = this.baseDesignWidth * this.designScale;
    this.designSprite.height = this.baseDesignHeight * this.designScale;

    // Rotation - SimplePlane supports rotation
    this.designSprite.rotation = this.designRotation;

    // Centering hack for SimplePlane
    // Since we can't easily set anchor to 0.5, 0.5 on SimplePlane without custom geometry
    // We offset x/y by half width/height (rotated)
    // For now, let's accept top-left pivot or basic rotation
    // To make it rotate around center, pivot is needed
    // ERROR FIX: Pivot must be in LOCAL space (texture dimensions), not screen space
    if (this.designSprite.texture) {
      this.designSprite.pivot.set(this.designSprite.texture.width / 2, this.designSprite.texture.height / 2);
    }

    // Update selection box
    this.drawSelectionUI();
  }

  updateDesign() {
    if (!this.designSprite) return;
    this.designSprite.alpha = this.settings.opacity / 100;
  }
  /**
   * Convert slider value (0-100) to a smooth displacement pixel offset.
   * v2 Tuning: Gentler curve with higher ceiling for directional map.
   *   0  -> 0px   (no warp)
   *   3  -> ~3px  (barely visible — subtle fabric breathing)
   *   10 -> ~18px (clean professional baseline)
   *   25 -> ~55px (medium — visible wrinkle conformance)
   *   50 -> ~93px (heavy — deep fold tracking)
   *  100 -> ~140px (maximum — extreme fabric pull)
   */
  _computeDisplacementScale(sliderValue) {
    const t = sliderValue / 100;
    const maxDisplacement = 140;
    return Math.pow(t, 1.8) * maxDisplacement;
  }

  updateDisplacement() {
    if (!this.displacementFilter) return;
    const s = this._computeDisplacementScale(this.settings.warpStrength);
    this.displacementFilter.scale.set(s, s);
  }

  // --- WATERMARK SYSTEM (v1.0.2) ---
  initWatermarkEvents() {
    if (this.btnLoadWatermark) {
      this.btnLoadWatermark.addEventListener('click', () => this.loadWatermark());
    }
    if (this.btnClearWatermark) {
      this.btnClearWatermark.addEventListener('click', () => this.clearWatermark());
    }
    if (this.selectWatermarkPos) {
      this.selectWatermarkPos.addEventListener('change', (e) => {
        this.settings.watermarkPosition = e.target.value;
        this.updateWatermarkTransform();
        this.saveSettings();
      });
    }
    if (this.sliderWatermarkScale) {
      this.sliderWatermarkScale.addEventListener('input', (e) => {
        this.settings.watermarkScale = parseInt(e.target.value);
        if (this.watermarkScaleValue) this.watermarkScaleValue.textContent = `${this.settings.watermarkScale}%`;
        this.updateWatermarkTransform();
        this.saveSettings();
      });
    }
    if (this.sliderWatermarkOpacity) {
      this.sliderWatermarkOpacity.addEventListener('input', (e) => {
        this.settings.watermarkOpacity = parseInt(e.target.value);
        if (this.watermarkOpacityValue) this.watermarkOpacityValue.textContent = `${this.settings.watermarkOpacity}%`;
        if (this.watermarkSprite) this.watermarkSprite.alpha = this.settings.watermarkOpacity / 100;
        this.saveSettings();
      });
    }
  }

  async loadWatermark() {
    const watermarkData = await window.electronAPI.selectSampleDesignFile(); // Reusing the high-res file picker
    if (watermarkData) {
      this.watermarkTexture = PIXI.Texture.from(watermarkData);
      
      // Setup UI
      this.watermarkControls.classList.remove('hidden');
      this.btnClearWatermark.classList.remove('hidden');
      
      this.createWatermarkSprite();
    }
  }

  createWatermarkSprite() {
    if (!this.app || !this.watermarkTexture) return;

    // Remove old one if exists
    if (this.watermarkSprite) {
      this.watermarkSprite.destroy();
    }

    this.watermarkSprite = new PIXI.Sprite(this.watermarkTexture);
    this.watermarkSprite.alpha = this.settings.watermarkOpacity / 100;

    // Add as the TOP layer
    this.app.stage.addChild(this.watermarkSprite);
    
    // Position it
    if (this.watermarkTexture.baseTexture.valid) {
      this.updateWatermarkTransform();
    } else {
      this.watermarkTexture.baseTexture.on('loaded', () => this.updateWatermarkTransform());
    }
  }

  clearWatermark() {
    if (this.watermarkSprite) {
      this.watermarkSprite.destroy();
      this.watermarkSprite = null;
    }
    this.watermarkTexture = null;
    this.watermarkControls.classList.add('hidden');
    this.btnClearWatermark.classList.add('hidden');
  }

  updateWatermarkTransform() {
    if (!this.watermarkSprite || !this.app) return;

    const canvasW = this.app.screen.width;
    const canvasH = this.app.screen.height;
    const padding = 20; // Padding from edges

    // 1. Scale
    // We scale relative to mockup width. 100% means the watermark spans the width.
    const targetScale = (canvasW * (this.settings.watermarkScale / 100)) / this.watermarkTexture.width;
    this.watermarkSprite.scale.set(targetScale);

    const w = this.watermarkSprite.width;
    const h = this.watermarkSprite.height;

    // 2. Position
    switch (this.settings.watermarkPosition) {
      case 'top-left':
        this.watermarkSprite.position.set(padding, padding);
        break;
      case 'top-right':
        this.watermarkSprite.position.set(canvasW - w - padding, padding);
        break;
      case 'bottom-left':
        this.watermarkSprite.position.set(padding, canvasH - h - padding);
        break;
      case 'center':
        this.watermarkSprite.position.set((canvasW - w) / 2, (canvasH - h) / 2);
        break;
      case 'bottom-right':
      default:
        this.watermarkSprite.position.set(canvasW - w - padding, canvasH - h - padding);
        break;
    }
  }

  updateMockupColor() {
    if (this.background) {
      // Safety: If null/undefined, force white
      const color = this.settings.mockupColor || '#ffffff';
      this.background.tint = color;
    }
  }

  updateLighting() {
    if (!this.shadowLayer || !this.highlightLayer || !this.textureLayer) return;

    // Master opacity toggle
    const visible = this.settings.showOverlay;
    this.shadowLayer.visible = visible;
    this.highlightLayer.visible = visible;
    this.textureLayer.visible = visible;

    if (!visible) return;

    // Intensity scaling (Slider 0-100)
    // We scale relative to our "Calibrated Max" values
    const intensity = this.settings.textureStrength / 100;

    // Advanced Realism Calibration (v1.0.2)
    // Increased maximums to allow deeper folds and highlights for advanced users
    // Shadow: 0.50 (Creates deeper folds on light shirts)
    // Texture: 0.25 (Pops fabric texture significantly)
    // Highlight: 0.50 (Stronger sheen on wet/glossy mockups)
    this.shadowLayer.alpha = 0.50 * intensity;
    this.textureLayer.alpha = 0.25 * intensity;
    this.highlightLayer.alpha = 0.50 * intensity;
  }

  getBlendMode(mode) {
    const modes = {
      'normal': PIXI.BLEND_MODES.NORMAL,
      'multiply': PIXI.BLEND_MODES.MULTIPLY,
      'darken': PIXI.BLEND_MODES.DARKEN,
      'hard-light': PIXI.BLEND_MODES.HARD_LIGHT
    };
    return modes[mode] || PIXI.BLEND_MODES.MULTIPLY;
  }

  setupMeshGrid() {
    // Initialize basic mesh interactions (future: draggable points)
    // For now, we rely on the displacement filter, but the mesh structure is ready
    // for manual "Arc" or "Bend" transforms.
  }

  drawSelectionUI() {
    if (!this.designSprite || !this.app || !this.handleGraphics) return;

    const g = this.handleGraphics;
    g.clear();

    // Smart Selection: Only draw if selected or cropping
    if (!this.isSelected && !this.isCropping) {
      this.handles = null;
      this.cropHandles = null;
      return;
    }

    // If not dragging or selected, maybe hide? For now always show when design exists
    // Calculate bounds in screen space
    // SimplePlane bounds are tricky, let's use the estimated position/size
    const x = this.designSprite.x;
    const y = this.designSprite.y;
    // Note: SimplePlane pivot is set to center (width/2, height/2) in updateDesignTransform
    // But rotation is around that pivot.

    // We need to draw a rotated box.
    const w = this.designSprite.width;
    const h = this.designSprite.height;
    const angle = this.designSprite.rotation;

    // Corners relative to center
    const tl = { x: -w / 2, y: -h / 2 };
    const tr = { x: w / 2, y: -h / 2 };
    const br = { x: w / 2, y: h / 2 };
    const bl = { x: -w / 2, y: h / 2 };

    const rotate = (p) => ({
      x: p.x * Math.cos(angle) - p.y * Math.sin(angle) + x,
      y: p.x * Math.sin(angle) + p.y * Math.cos(angle) + y
    });

    const pTL = rotate(tl);
    const pTR = rotate(tr);
    const pBR = rotate(br);
    const pBL = rotate(bl);

    // Draw Selection Box OR Crop Box
    if (this.isCropping && this.cropRect) {
      // --- CROP MODE UI ---
      // Hide standard handles
      this.handles = null;

      // Draw Crop Frame (High visibility Orange-Red)
      // Alignment 1 = Outer stroke (doesn't cover the image edge)
      g.lineStyle(3, 0xFF4500, 1, 1);

      // Pivot adjustment: p = p_local - pivot
      const pivotX = this.designSprite.pivot.x;
      const pivotY = this.designSprite.pivot.y;

      const scaleX = this.designSprite.scale.x;
      const scaleY = this.designSprite.scale.y;

      const localToScreen = (lx, ly) => {
        const px = (lx - pivotX) * scaleX;
        const py = (ly - pivotY) * scaleY;
        return rotate({ x: px, y: py });
      };

      const cTL = localToScreen(this.cropRect.x, this.cropRect.y);
      const cTR = localToScreen(this.cropRect.x + this.cropRect.width, this.cropRect.y);
      const cBR = localToScreen(this.cropRect.x + this.cropRect.width, this.cropRect.y + this.cropRect.height);
      const cBL = localToScreen(this.cropRect.x, this.cropRect.y + this.cropRect.height);

      // Draw Crop Box
      g.moveTo(cTL.x, cTL.y);
      g.lineTo(cTR.x, cTR.y);
      g.lineTo(cBR.x, cBR.y);
      g.lineTo(cBL.x, cBL.y);
      g.lineTo(cTL.x, cTL.y);

      // Draw Crop Handles (Squares)
      g.beginFill(0xFFFFFF); // White fill for contrast
      g.lineStyle(2, 0xFF4500, 1); // Orange border
      const cropHandleSize = 10;
      [cTL, cTR, cBR, cBL].forEach(p => {
        g.drawRect(p.x - cropHandleSize / 2, p.y - cropHandleSize / 2, cropHandleSize, cropHandleSize);
      });
      g.endFill();

      this.cropHandles = { cTL, cTR, cBR, cBL };

    } else {
      // --- STANDARD SELECTION UI ---
      // This should match the VISIBLE area (which is the crop rect if cropping happened)
      this.cropHandles = null;

      // Define the visible rectangle in local space
      // If cropRect exists, use it. Otherwise full texture.
      const rect = this.cropRect ? this.cropRect : { x: 0, y: 0, width: this.designSprite.texture.width, height: this.designSprite.texture.height };

      // Helper for transform (same as above)
      const pivotX = this.designSprite.pivot.x;
      const pivotY = this.designSprite.pivot.y;

      const scaleX = this.designSprite.scale.x;
      const scaleY = this.designSprite.scale.y;

      const localToScreen = (lx, ly) => {
        const px = (lx - pivotX) * scaleX;
        const py = (ly - pivotY) * scaleY;
        return rotate({ x: px, y: py });
      };

      const pTL = localToScreen(rect.x, rect.y);
      const pTR = localToScreen(rect.x + rect.width, rect.y);
      const pBR = localToScreen(rect.x + rect.width, rect.y + rect.height);
      const pBL = localToScreen(rect.x, rect.y + rect.height);

      // Draw Box
      g.lineStyle(2, 0x0071e3, 0.8);
      g.moveTo(pTL.x, pTL.y);
      g.lineTo(pTR.x, pTR.y);
      g.lineTo(pBR.x, pBR.y);
      g.lineTo(pBL.x, pBL.y);
      g.lineTo(pTL.x, pTL.y);

      // Draw Handles (Corners)
      g.beginFill(0xffffff);
      g.lineStyle(2, 0x0071e3, 1);
      const handleSize = 8;
      [pTL, pTR, pBR, pBL].forEach(p => {
        g.drawCircle(p.x, p.y, handleSize);
      });
      g.endFill();

      this.handles = { pTL, pTR, pBR, pBL };
    }
  }

  drawGuides(snapX, snapY) {
    if (!this.guideGraphics) return;
    const g = this.guideGraphics;
    g.clear();

    const cx = this.app.screen.width / 2;
    const cy = this.app.screen.height / 2;

    g.lineStyle(2, 0xff0055, 0.8); // Magenta for guides
    // smart guides look better dashed? Pixi v7 doesn't support native dashed lines easily without plugins
    // solid is fine for now

    if (snapX) {
      g.moveTo(cx, 0);
      g.lineTo(cx, this.app.screen.height);
    }

    if (snapY) {
      g.moveTo(0, cy);
      g.lineTo(this.app.screen.width, cy);
    }
  }

  setZoom(level, mouseX, mouseY) {
    if (!this.app || !this.app.stage) return;
    
    // Width and height of the canvas screen area
    const width = this.canvasWrapper.clientWidth || 800;
    const height = this.canvasWrapper.clientHeight || 800;

    // Use center of screen if no mouse coordinates are given (e.g. from UI buttons)
    if (mouseX === undefined) mouseX = width / 2;
    if (mouseY === undefined) mouseY = height / 2;

    const oldScale = this.app.stage.scale.x;
    let newScale = Math.max(0.1, Math.min(10, level));
    this.zoomLevel = newScale;

    if (this.labelZoomLevel) this.labelZoomLevel.textContent = `${Math.round(newScale * 100)}%`;

    // The point in the world space under the mouse currently
    const worldX = (mouseX - this.app.stage.position.x) / oldScale;
    const worldY = (mouseY - this.app.stage.position.y) / oldScale;

    // Apply new scale
    this.app.stage.scale.set(newScale);

    // Reposition stage so the same world point is under the mouse
    if (newScale === 1 && mouseX === width / 2 && mouseY === height / 2) {
      // Direct reset constraint to zero out pan drifting
      this.app.stage.position.set(0, 0);
    } else {
      const newX = mouseX - worldX * newScale;
      const newY = mouseY - worldY * newScale;
      this.app.stage.position.set(newX, newY);
    }
  }

  drawMaskBrush(x, y, isStart) {
    if (!this.brushGraphics || !this.maskTexture || !this.app) return;
    
    const size = this.maskBrushSize / this.app.stage.scale.x; // Scale brush visually
    
    // Store for high-res batch replay
    this.maskOperations.push({ x, y, size, mode: this.maskBrushMode });

    this.brushGraphics.clear();
    this.brushGraphics.beginFill(0xFFFFFF); // Color doesn't matter for erase blend mode if using ERASE, but wait
    
    // In Pixi, BLEND_MODES.ERASE creates transparency
    // To restore, we draw opaque white with NORMAL blend mode
    this.brushGraphics.blendMode = this.maskBrushMode === 'erase' ? PIXI.BLEND_MODES.ERASE : PIXI.BLEND_MODES.NORMAL;
    
    // Draw circle brush
    this.brushGraphics.drawCircle(x, y, size);
    this.brushGraphics.endFill();
    
    // Render the brush stroke onto the mask texture without clearing the previous content
    this.app.renderer.render(this.brushGraphics, { renderTexture: this.maskTexture, clear: false });

    // Render Red visual overlay to visualMaskTexture
    if (this.visualMaskTexture) {
      this.brushGraphics.clear();
      this.brushGraphics.beginFill(0xFF0000); // Red dot for erased areas
      // If erasing design, we ADD red to the visual layer. If restoring, we ERASE red.
      this.brushGraphics.blendMode = this.maskBrushMode === 'erase' ? PIXI.BLEND_MODES.NORMAL : PIXI.BLEND_MODES.ERASE;
      this.brushGraphics.drawCircle(x, y, size);
      this.brushGraphics.endFill();
      this.app.renderer.render(this.brushGraphics, { renderTexture: this.visualMaskTexture, clear: false });
    }
  }

  updatePolygonPreview(currentX, currentY) {
    if (!this.polygonPreviewGraphics || this.polygonPoints.length === 0) return;
    
    this.polygonPreviewGraphics.clear();
    
    const color = this.maskBrushMode === 'erase' ? 0xff0000 : 0x00ff00;
    this.polygonPreviewGraphics.lineStyle(2 / this.app.stage.scale.x, color, 1);
    
    this.polygonPreviewGraphics.moveTo(this.polygonPoints[0].x, this.polygonPoints[0].y);
    
    for (let i = 1; i < this.polygonPoints.length; i++) {
      this.polygonPreviewGraphics.lineTo(this.polygonPoints[i].x, this.polygonPoints[i].y);
    }
    
    if (currentX !== undefined && currentY !== undefined) {
      this.polygonPreviewGraphics.lineTo(currentX, currentY);
    }
  }

  commitPolygonMask() {
    if (!this.polygonPoints || this.polygonPoints.length < 3) {
      this.polygonPoints = [];
      if (this.polygonPreviewGraphics) this.polygonPreviewGraphics.clear();
      return;
    }
    
    this.maskOperations.push({ 
      type: 'polygon', 
      points: this.polygonPoints.map(p => ({ x: p.x, y: p.y })), 
      mode: this.maskBrushMode 
    });

    this.brushGraphics.clear();
    this.brushGraphics.beginFill(0xFFFFFF); 
    this.brushGraphics.blendMode = this.maskBrushMode === 'erase' ? PIXI.BLEND_MODES.ERASE : PIXI.BLEND_MODES.NORMAL;
    this.brushGraphics.drawPolygon(this.polygonPoints);
    this.brushGraphics.endFill();
    this.app.renderer.render(this.brushGraphics, { renderTexture: this.maskTexture, clear: false });

    if (this.visualMaskTexture) {
      this.brushGraphics.clear();
      this.brushGraphics.beginFill(0xFF0000); 
      this.brushGraphics.blendMode = this.maskBrushMode === 'erase' ? PIXI.BLEND_MODES.NORMAL : PIXI.BLEND_MODES.ERASE;
      this.brushGraphics.drawPolygon(this.polygonPoints);
      this.brushGraphics.endFill();
      this.app.renderer.render(this.brushGraphics, { renderTexture: this.visualMaskTexture, clear: false });
    }
    
    this.polygonPoints = [];
    if (this.polygonPreviewGraphics) this.polygonPreviewGraphics.clear();
  }

  clearMockupMask() {
    if (!this.maskTexture || !this.app) return;
    this.maskOperations = []; // Clear for batch export
    // Fill the mask texture with solid white to fully restore design
    this.brushGraphics.clear();
    this.brushGraphics.beginFill(0xFFFFFF);
    this.brushGraphics.blendMode = PIXI.BLEND_MODES.NORMAL;
    this.brushGraphics.drawRect(0, 0, this.app.screen.width, this.app.screen.height);
    this.brushGraphics.endFill();
    this.app.renderer.render(this.brushGraphics, { renderTexture: this.maskTexture, clear: true });

    if (this.visualMaskTexture) {
      // Clear visual overlay
      this.brushGraphics.clear();
      this.app.renderer.render(this.brushGraphics, { renderTexture: this.visualMaskTexture, clear: true });
    }
  }

  setupInteraction() {
    if (this.interactionsBound) return; // Prevent duplicate listeners
    this.interactionsBound = true;

    const canvas = this.app.view;

    // State for drag
    this.interactionState = {
      mode: 'none', // 'drag', 'rotate', 'resize'
      start: { x: 0, y: 0 },
      initialParam: 0 // scale or rotation or pos
    };

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Handle Pan Mode (Spacebar, Middle Click, Right Click, or holding Ctrl)
      if (this.isPanning || e.button === 1 || e.button === 2 || e.ctrlKey || e.metaKey) {
        this.interactionState = { 
          mode: 'pan', 
          startX: e.clientX, 
          startY: e.clientY, 
          initStageX: this.app.stage.position.x, 
          initStageY: this.app.stage.position.y 
        };
        return;
      }

      // Handle Mask Mode Tools
      if (this.isMaskMode) {
        // Convert screen to stage coordinates
        const stageX = (mouseX - this.app.stage.position.x) / this.app.stage.scale.x;
        const stageY = (mouseY - this.app.stage.position.y) / this.app.stage.scale.y;
        
        if (this.maskToolMode === 'brush') {
          this.isBrushing = true;
          this.drawMaskBrush(stageX, stageY, true);
        } else if (this.maskToolMode === 'polygon') {
          // Check if clicking near start to close
          if (this.polygonPoints.length > 2) {
            const first = this.polygonPoints[0];
            const dist = Math.hypot(first.x - stageX, first.y - stageY);
            if (dist < 20 / this.app.stage.scale.x) {
              this.commitPolygonMask();
              return;
            }
          }
          this.polygonPoints.push(new PIXI.Point(stageX, stageY));
          this.updatePolygonPreview(stageX, stageY);
        }
        return;
      }

      // Convert screen coordinates to world (zoomed) coordinates for hit math
      const x = (mouseX - this.app.stage.position.x) / this.app.stage.scale.x;
      const y = (mouseY - this.app.stage.position.y) / this.app.stage.scale.y;

      if (!this.designSprite) return;

      // 1. CROP HANDLES (Priority if Cropping)
      if (this.isCropping && this.cropHandles) {
        const handleRadius = 20;
        for (const [key, p] of Object.entries(this.cropHandles)) {
          const dx = x - p.x;
          const dy = y - p.y;
          if (dx * dx + dy * dy < handleRadius * handleRadius) {
            this.interactionState = {
              mode: 'crop_resize',
              start: { x, y },
              initialCrop: { ...this.cropRect }, // copy
              handle: key
            };
            return;
          }
        }
      }

      // 2. RESIZE HANDLES (Only if NOT cropping)
      if (!this.isCropping && this.handles) {
        const handleRadius = 20; // Increased hit area
        for (const [key, p] of Object.entries(this.handles)) {
          const dx = x - p.x;
          const dy = y - p.y;
          if (dx * dx + dy * dy < handleRadius * handleRadius) {
            this.interactionState = {
              mode: 'resize',
              start: { x, y },
              initialParam: this.settings.scale,
              handle: key // Store which handle
            };
            return;
          }
        }
      }

      // 3. BODY HIT
      // Use Pixi's bounds calculation for accurate hit detection
      // Note: We need to force update bounds sometimes if transform changed recently
      this.designSprite.calculateBounds();
      const bounds = this.designSprite.getBounds();

      // Expand bounds slightly for easier grabbing
      const hitMargin = 0;
      const isHit = x >= bounds.x - hitMargin && x <= bounds.x + bounds.width + hitMargin &&
        y >= bounds.y - hitMargin && y <= bounds.y + bounds.height + hitMargin;

      if (isHit) {
        this.isSelected = true; // Select on click
        this.drawSelectionUI(); // Force redraw to show handles

        if (this.isCropping) {
          // Dragging body while cropping -> Moves the Mask (Pan) or Moves the Design?
          // Typically moves the 'Crop Window' (Panning).
          // For now let's just ignore body drag in crop mode to avoid confusion, or implement Pan.
          // Let's implement Body Drag moves the DESIGN (standard), and crop stays?
          // No, standard Figma: Double click -> You can move image INSIDE the crop.
          // That means modifying offset.
          // Let's stick to simple: Dragging body moves the whole thing.
          this.interactionState = {
            mode: 'drag',
            start: { x, y },
            designStartPos: { ...this.designPosition }
          };
        } else {
          // Standard Drag / Rotate
          if (e.shiftKey) {
            const dx = x - this.designSprite.x;
            const dy = y - this.designSprite.y;
            this.interactionState = {
              mode: 'rotate',
              rotateStart: Math.atan2(dy, dx),
              rotateStartAngle: this.designRotation
            };
          } else {
            // Calculate scale to fit canvas with padding
            const currentInitialScale = Math.min(
              (this.app.screen.width * 0.8) / this.designSprite.width,
              (this.app.screen.height * 0.8) / this.designSprite.height
            );
            this.interactionState = {
              mode: 'drag',
              start: { x, y },
              designStartPos: { ...this.designPosition }
            };
          }
        }
      } else {
        // Clicked Background -> Deselect
        // Only if not clicking a Handle (handled above)
        this.isSelected = false;
        this.isCropping = false; // also exit crop
        this.drawSelectionUI(); // Redraw to clear handles
      }
    });

    // Double Click for Cropping
    canvas.addEventListener('dblclick', (e) => {
      this.toggleCropMode();
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (this.interactionState.mode === 'pan') {
        const dx = e.clientX - this.interactionState.startX;
        const dy = e.clientY - this.interactionState.startY;
        this.app.stage.position.set(
          this.interactionState.initStageX + dx,
          this.interactionState.initStageY + dy
        );
        return;
      }

      if (this.isMaskMode) {
        // Init cursor if missing
        if (!this.cursorGraphics) {
          this.cursorGraphics = new PIXI.Graphics();
          this.cursorGraphics.eventMode = 'none'; // click through
          this.uiContainer.addChild(this.cursorGraphics);
        }

        // Ensure cursor stays on top
        if (this.cursorGraphics && this.cursorGraphics.parent) {
          this.cursorGraphics.parent.addChild(this.cursorGraphics);
        }
        // Ensure visual overlay is rendered below cursor but above everything
        if (this.visualMaskSprite && this.visualMaskSprite.parent) {
           this.visualMaskSprite.parent.addChild(this.visualMaskSprite);
        }
        if (this.polygonPreviewGraphics && this.polygonPreviewGraphics.parent) {
           this.polygonPreviewGraphics.parent.addChild(this.polygonPreviewGraphics);
        }

        // Calculate location in world coordinates
        const stageX = (mouseX - this.app.stage.position.x) / this.app.stage.scale.x;
        const stageY = (mouseY - this.app.stage.position.y) / this.app.stage.scale.y;

        if (this.maskToolMode === 'brush') {
          this.canvasWrapper.style.cursor = 'none';
          const size = this.maskBrushSize / this.app.stage.scale.x;
          
          // Draw the ring
          this.cursorGraphics.clear();
          // Red brush for erase, green for restore
          const color = this.maskBrushMode === 'erase' ? 0xff0000 : 0x00ff00;
          this.cursorGraphics.lineStyle(2 / this.app.stage.scale.x, color, 0.8);
          this.cursorGraphics.drawCircle(stageX, stageY, size);
          this.cursorGraphics.visible = true;

          if (this.isBrushing) {
            this.drawMaskBrush(stageX, stageY, false);
          }
        } else if (this.maskToolMode === 'polygon') {
          this.cursorGraphics.visible = false;
          this.canvasWrapper.style.cursor = 'crosshair';
          
          if (this.polygonPoints.length > 0) {
             this.updatePolygonPreview(stageX, stageY);
          }
        }
        return;
      } else {
        if (this.cursorGraphics) this.cursorGraphics.visible = false;
        
        // Restore cursor
        if (!this.isPanning && this.interactionState.mode === 'none' && !e.ctrlKey && !e.metaKey) {
          this.canvasWrapper.style.cursor = 'default';
        }
      }

      // Convert screen coordinates to world computations just like mousedown
      const x = (mouseX - this.app.stage.position.x) / this.app.stage.scale.x;
      const y = (mouseY - this.app.stage.position.y) / this.app.stage.scale.y;

      if (this.interactionState.mode === 'crop_resize') {
        // --- CROP RESIZING LOGIC ---
        const startX = this.interactionState.start.x;
        const startY = this.interactionState.start.y;

        const dx = x - startX;
        const dy = y - startY;

        // Convert screen delta to local delta
        // 1. Unrotate (Screen space rotation)
        const angle = -this.designRotation;
        const rotatedDx = dx * Math.cos(angle) - dy * Math.sin(angle);
        const rotatedDy = dx * Math.sin(angle) + dy * Math.cos(angle);

        // 2. Unscale (Screen to Texture ratio)
        // We must calculate the current ratio between screen size and texture size
        const scaleX = this.designSprite.width / this.designSprite.texture.width;
        const scaleY = this.designSprite.height / this.designSprite.texture.height;

        // Avoid division by zero
        const sX = scaleX || 1;
        const sY = scaleY || 1;

        const localDx = rotatedDx / sX;
        const localDy = rotatedDy / sY;

        const handle = this.interactionState.handle;
        const init = this.interactionState.initialCrop;

        let newRect = { ...init };

        // Apply delta based on handle
        if (handle === 'cTL') {
          newRect.x += localDx;
          newRect.y += localDy;
          newRect.width -= localDx;
          newRect.height -= localDy;
        } else if (handle === 'cTR') {
          newRect.y += localDy;
          newRect.width += localDx;
          newRect.height -= localDy;
        } else if (handle === 'cBR') {
          newRect.width += localDx;
          newRect.height += localDy;
        } else if (handle === 'cBL') {
          newRect.x += localDx;
          newRect.width -= localDx;
          newRect.height += localDy;
        }

        // Min size constraint
        if (newRect.width < 10) newRect.width = 10;
        if (newRect.height < 10) newRect.height = 10;

        this.cropRect = newRect;
        this.updateCropMask();
        this.drawSelectionUI();
        return;
      }

      // Hover cursors
      // (Implementation optimization: check hits and set canvas.style.cursor)

      if (this.interactionState.mode === 'drag') {
        const deltaX = (x - this.interactionState.start.x) / this.app.screen.width;
        const deltaY = (y - this.interactionState.start.y) / this.app.screen.height;

        let newX = this.interactionState.designStartPos.x + deltaX;
        let newY = this.interactionState.designStartPos.y + deltaY;

        // --- SMART GUIDES & SNAPPING ---
        const snapThreshold = 0.02; // 2% of screen
        let snappedX = false;
        let snappedY = false;

        if (Math.abs(newX - 0.5) < snapThreshold) {
          newX = 0.5;
          snappedX = true;
        }

        if (Math.abs(newY - 0.5) < snapThreshold) {
          newY = 0.5;
          snappedY = true;
        }

        this.drawGuides(snappedX, snappedY);

        this.designPosition.x = Math.max(0, Math.min(1, newX));
        this.designPosition.y = Math.max(0, Math.min(1, newY));

        this.updateDesignTransform();

      } else if (this.interactionState.mode === 'resize') {
        // Calculate distance from center of design
        const dx = x - this.designSprite.x;
        const dy = y - this.designSprite.y;
        const currentDist = Math.sqrt(dx * dx + dy * dy);

        const startDx = this.interactionState.start.x - this.designSprite.x;
        const startDy = this.interactionState.start.y - this.designSprite.y;
        const startDist = Math.sqrt(startDx * startDx + startDy * startDy);

        const scaleFactor = currentDist / startDist;

        let newScale = this.interactionState.initialParam * scaleFactor;
        newScale = Math.max(10, Math.min(200, newScale));

        this.designSprite.scale.set(newScale / 100);
        this.settings.scale = Math.round(newScale);
        this.sliderScale.value = this.settings.scale;
        this.scaleValue.textContent = `${this.settings.scale}%`;
        this.designScale = this.settings.scale / 100;

        this.updateDesignTransform();

      } else if (this.interactionState.mode === 'rotate') {
        const dx = x - this.designSprite.x;
        const dy = y - this.designSprite.y;
        const angle = Math.atan2(dy, dx);
        this.designRotation = this.interactionState.rotateStartAngle + (angle - this.interactionState.rotateStart);

        // Update slider
        const degrees = Math.round(this.designRotation * (180 / Math.PI));
        this.sliderRotation.value = Math.max(-180, Math.min(180, degrees));
        this.rotationValue.textContent = `${this.sliderRotation.value}°`;
        this.settings.rotation = parseInt(this.sliderRotation.value);

        this.updateDesignTransform();
      }
    });

    const endDrag = (e) => {
      // If leaving canvas, forcibly restore cursor
      if (e.type === 'mouseleave') {
        this.canvasWrapper.style.cursor = 'default';
        if (this.cursorGraphics) this.cursorGraphics.visible = false;
      }

      if (this.interactionState.mode === 'pan') {
        // Stop panning but keep position
      }
      if (this.isMaskMode && this.isBrushing) {
        this.isBrushing = false;
        // Don't change interaction state so we stay in mask mode
      }

      // Mark explicit overrides so Elementor-style inheritance tracks spatial changes
      const mode = this.interactionState.mode;
      if (mode === 'drag') {
        this.markSettingOverridden('position');
      } else if (mode === 'resize') {
        this.markSettingOverridden('scale');
      } else if (mode === 'rotate') {
        this.markSettingOverridden('rotation');
      }

      this.interactionState = { mode: 'none' };
      if (this.guideGraphics) this.guideGraphics.clear(); // Clear guides on drop
    };

    canvas.addEventListener('mouseup', endDrag);
    canvas.addEventListener('mouseleave', endDrag);

    // Disable right click menu
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Scroll to resize or Zoom
    canvas.addEventListener('wheel', (e) => {
      // Prevent browser scroll bounding box jump while user scrolls on canvas
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Figma-style Canvas Zoom (Ctrl + Scroll)
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // e.deltaY > 0 is scroll down (zoom out). Adjust intensity for smoothness
        const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
        this.setZoom(this.zoomLevel + zoomDelta, mouseX, mouseY);
      } else {
        // Standard functionality: scale the design sprite
        if (!this.designSprite) return;

        const delta = e.deltaY > 0 ? -5 : 5;
        const newScale = Math.max(10, Math.min(200, this.settings.scale + delta));

        this.settings.scale = newScale;
        this.sliderScale.value = newScale;
        this.scaleValue.textContent = `${newScale}%`;
        this.designScale = newScale / 100;

        this.updateDesignTransform();
        this.markSettingOverridden('scale');
      }
    }, { passive: false }); // Needs passive: false to allow e.preventDefault()
  }


  async generateAll() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.btnGenerate.disabled = true;
    this.progressSection.style.display = 'block';

    // Save current active mockup's state before export
    this.saveCurrentMockupState();

    // Determine processing list
    // If mockupQueue has items, use that. Otherwise use current mockupData as single item.
    const mockupsToProcess = (this.mockupQueue && this.mockupQueue.length > 0)
      ? this.mockupQueue
      : [this.mockupData];

    const totalDesigns = this.designFiles.length;
    const totalMockups = mockupsToProcess.length;
    const totalOperations = totalDesigns * totalMockups;
    let processed = 0;

    // Create a separate high-resolution renderer for export
    const exportApp = new PIXI.Application({
      width: this.originalWidth,
      height: this.originalHeight,
      backgroundColor: 0xffffff,
      preserveDrawingBuffer: true,
      resolution: 1,
      antialias: true
    });

    try {
      // Loop MOCKUPS first (Outer Loop) to minimize texture switching
      for (const mockup of mockupsToProcess) {

        // Load Mockup Data
        let currentMockupData = null;
        if (mockup.path) {
          const safePath = mockup.path.replace(/\\/g, '/');
          currentMockupData = `file://${safePath}`;
        } else if (mockup.data) {
          currentMockupData = mockup.data;
        } else {
          console.error("Mockup has no path or data:", mockup);
          continue;
        }

        console.log("Generating Mockup using URL:", currentMockupData);

        // --- DYNAMIC SETTINGS RESOLUTION (v3) ---
        // Backup active canvas state so we can restore it after this mockup is processed
        const settingsBackup = { ...this.settings };
        const posBackup = { ...this.designPosition };
        const scaleBackup = this.designScale;
        const rotBackup = this.designRotation;
        const maskOpsBackup = [...(this.maskOperations || [])];

        const override = mockup.path ? this.mockupOverrides[mockup.path] : null;

        // ALWAYS calculate effective settings for THIS mockup (merges global + partial overrides)
        this.settings = this.getEffectiveSettings(mockup.path);

        const hasPos = override?.overriddenKeys?.has('position');
        const hasScale = override?.overriddenKeys?.has('scale');
        const hasRot = override?.overriddenKeys?.has('rotation');

        // If not explicitly overridden, fall back to global master transforms
        const masterPos = this.globalDesignPosition || posBackup;
        const masterScale = this.globalDesignScale !== undefined ? this.globalDesignScale : scaleBackup;
        const masterRot = this.globalDesignRotation !== undefined ? this.globalDesignRotation : rotBackup;

        this.designPosition = hasPos ? { ...override.designPosition } : { ...masterPos };
        this.designScale = hasScale ? override.designScale : masterScale;
        this.designRotation = hasRot ? override.designRotation : masterRot;
        
        // Masks are strictly per-mockup
        this.maskOperations = override ? [...(override.maskOperations || [])] : [];

        if (override && override.overriddenKeys?.size > 0) {
          console.log(`Applying explicit overrides for: ${mockup.name}`);
        }
        // --- END OVERRIDE ---

        // Setup Export Stage with this Mockup
        let previewWidth = 800;
        if (this.app && this.app.renderer) {
          previewWidth = this.app.renderer.width;
        }
        let exportWidth = this.originalWidth;

        const protectedTexture = await this.setupExportStage(exportApp, currentMockupData, previewWidth);

        // NOTE: Do NOT restore settings here — keep override active through the entire design loop

        if (!protectedTexture) {
          console.error(`Failed to setup stage for mockup: ${mockup.name}`);
          continue; // Skip this mockup if texture failed
        }

        for (const designFile of this.designFiles) {
          // Normalize designFile (it might be a string path or an object)
          const designPath = (typeof designFile === 'string') ? designFile : designFile.path;
          const designNameRaw = (typeof designFile === 'string') ? designFile.split(/[\\/]/).pop() : designFile.name;

          // Calculate target extension
          let ext = 'jpg';
          if (this.settings.exportFormat === 'png') ext = 'png';
          if (this.settings.exportFormat === 'webp') ext = 'webp';

          // Update progress
          processed++;
          const mockupBaseName = mockup.name.replace(/\.[^/.]+$/, "");
          this.progressText.textContent = `Processing ${processed} / ${totalOperations} (${mockupBaseName}.${ext})`;
          this.progressFill.style.width = `${(processed / totalOperations) * 100}%`;

          // Load design
          const designData = await window.electronAPI.loadDesignFile(designPath);
          if (!designData) {
            console.error(`Failed to load: ${designNameRaw}`);
            continue;
          }

          // Mockup Size Check
          // The exportApp was initialized with this.originalWidth/Height of the FIRST mockup or currently loaded one.
          // If the queued mockup has different dimensions, we MUST resize the renderer.
          // We can check the dimensions from the loaded texture in setupExportStage -> protectedTexture.
          if (protectedTexture && protectedTexture.baseTexture.valid) {
            const texW = protectedTexture.baseTexture.width;
            const texH = protectedTexture.baseTexture.height;

            // Always update global reference dimensions for design sizing logic
            this.originalWidth = texW;
            this.originalHeight = texH;
          }

          // Enforce linear scaling for design texture to prevent pixelation
          // We do this before creating sprite
          // Note: designData is a string (URI) so PIXI.Texture.from creates a new texture or pulls from cache
          // We can't easily access the internal texture before this point, but we can configure it now.
          const designTex = PIXI.Texture.from(designData);
          if (designTex.baseTexture) {
            designTex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
            designTex.baseTexture.mipmap = PIXI.MIPMAP_MODES.ON;
          }

          // Render at full resolution
          await this.renderExport(exportApp, designData);

          // Extract and save
          // Extract as PNG (Lossless) to avoid double-compression artifacts
          let base64 = await exportApp.renderer.extract.base64(exportApp.stage, 'image/png');

          // Resize if Preset is active
          // FIX: Pass exportFormat to ensure transparency/filetype is handled correctly
          if (this.settings.exportPreset !== 'original') {
            base64 = await this.resizeImage(base64, this.settings.exportPreset, this.settings.customExportWidth, this.settings.customExportHeight, this.settings.exportFormat);
          } else {
            // FIX: Even for 'original', we must respect the chosen format (PNG/WebP/JPG)
            base64 = await this.resizeImage(base64, 'original', null, null, this.settings.exportFormat);
          }

          // Generate output filename -> {DesignName}_{MockupName}.extension
          // Sanitize mockup name
          const mockupName = mockup.name.replace(/\.(png|jpg|jpeg)$/i, '');
          const designName = designNameRaw.replace(/\.(png|jpg|jpeg)$/i, '');

          const outputFilename = `${designName}_${mockupName}.${ext}`;

          // Construct full output path manually since main expecting filePath
          const fullOutputPath = await window.electronAPI.pathJoin(this.outputFolder, outputFilename);

          await window.electronAPI.saveRenderedImage({
            filePath: fullOutputPath,
            dataBase64: base64
          });

          // Clear textures to free memory
          this.clearExportTextures(exportApp, protectedTexture);

          // Small delay to prevent UI freeze
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Restore active UI state AFTER this mockup is exported, 
        // to ensure the next iteration starts from a clean baseline.
        this.settings = settingsBackup;
        this.designPosition = posBackup;
        this.designScale = scaleBackup;
        this.designRotation = rotBackup;
        this.maskOperations = maskOpsBackup;

        // Cleanup Mockup specific textures from Stage before switching Mockup
        // This is important because clearExportTextures only cleared the DESIGN.
        // We need to clear the Mockup Base Texture if we are done with it.
        // But Pixi might share it?
        // Let's force destroy the stage children (Background, displacement, etc)
        // exportApp.stage.removeChildren(); // destroy handled in setupExportStage or final

        // Explicitly destroy children and clean VRAM before next mockup load
        // We MUST destroy the baked RenderTexture (FabricMap displacement) to prevent VRAM crashes.
        while (exportApp.stage.children.length > 0) {
          const child = exportApp.stage.children[0];
          
          if (child instanceof PIXI.Sprite && child.texture instanceof PIXI.RenderTexture) {
            // Destroy the generated displacement map texture to free heavy GPU memory
            child.destroy({ children: true, texture: true, baseTexture: true });
          } else if (child instanceof PIXI.Container) {
            // Normal layers (mockup, shadows, etc): Do NOT destroy baseTexture to preserve cache/UI
            child.destroy({ children: true, texture: false, baseTexture: false });
          } else {
            child.destroy();
          }
        }
      }

      this.progressText.textContent = `Complete! ${processed} files generated.`;

      // Show Batch Complete Modal
      if (this.batchModal) {
        this.batchMessage.textContent = `Successfully processed ${processed} files.`;
        this.batchModal.style.display = 'flex';
      }

    } catch (error) {
      console.error('Generation error:', error);
      this.progressText.textContent = `Error: ${error.message}`;
    } finally {
      exportApp.destroy(true, { children: true, texture: false, baseTexture: false });

      this.isProcessing = false;
      this.btnGenerate.disabled = false;

      // Hide progress after delay
      setTimeout(() => {
        this.progressSection.style.display = 'none';
        this.progressFill.style.width = '0%';
      }, 3000);
    }
  }

  // Helper to setup the export stage with a specific mockup
  async setupExportStage(app, mockupUrl, previewWidth = 800) {
    // Clear stage
    app.stage.removeChildren();

    return new Promise((resolve) => {
      const texture = PIXI.Texture.from(mockupUrl);
      const onTextureLoad = () => {
        if (!texture || !texture.baseTexture) {
          console.error("SetupExportStage: Invalid texture loaded");
          resolve(null);
          return;
        }
        const texW = texture.baseTexture.width;
        const texH = texture.baseTexture.height;

        // 100% Visual Parity Engine: Lock the export app's logical dimensions to the UI preview,
        // and map the huge 4K texture to PIXI's hardware resolution scale.
        // This abstracts all mathematical scaling and directly guarantees 1:1 displacement & blur.
        const logicalW = this.app && this.app.screen ? this.app.screen.width : 800;
        const logicalH = texH * (logicalW / texW);
        const deviceRes = texW / logicalW;

        if (app.screen.width !== logicalW || app.screen.height !== logicalH || app.renderer.resolution !== deviceRes) {
          app.renderer.resolution = deviceRes;
          app.renderer.resize(logicalW, logicalH);
        }
        
        // Keep tracking raw pixels for later physical extractions if needed
        this.originalWidth = texW;
        this.originalHeight = texH;

        this._buildLayers(app, texture);
        resolve(texture);
      };

      if (texture.baseTexture.valid) {
        onTextureLoad();
      } else {
        texture.baseTexture.on('loaded', onTextureLoad);
        texture.baseTexture.on('error', () => {
          console.error("Failed to load export mockup texture");
          resolve(null);
        });
      }
    });
  }

  _buildLayers(app, mockupTexture) {
    if (!mockupTexture || !mockupTexture.valid) { // Check validity
      console.error("Invalid texture passed to _buildLayers");
      return;
    }

    // Replicate setupLayers logic but for the export app instance
    // 1. Background
    const bg = new PIXI.Sprite(mockupTexture);
    bg.width = app.screen.width;
    bg.height = app.screen.height;

    // Apply Persisted Mockup Tint (Fix for Universal Mockups)
    if (this.settings.mockupColor) {
      bg.tint = this.settings.mockupColor;
    }

    app.stage.addChild(bg);

    // 2. Displacement v2 — MUST match Editor's FabricMapFilter v2 pipeline exactly
    // Step A: Create a temp sprite, apply FabricMapFilter v2 + blur
    const tempSprite = new PIXI.Sprite(mockupTexture);
    tempSprite.width = app.screen.width;
    tempSprite.height = app.screen.height;

    // No math hacks needed. Using native logical resolution scaling.
    const fabricFilter = new FabricMapFilter(app.screen.width, app.screen.height);
    const blurFilter = new PIXI.filters.BlurFilter();
    blurFilter.quality = 4;
    blurFilter.blur = 3;  // pure logical pixels
    tempSprite.filters = [fabricFilter, blurFilter];

    // Step B: Bake filtered result into a RenderTexture (just like Editor's setupLayers)
    const renderTexture = PIXI.RenderTexture.create({
      width: app.screen.width,
      height: app.screen.height,
      resolution: app.renderer.resolution // CRITICAL: Extract at 4K density
    });
    app.renderer.render(tempSprite, { renderTexture: renderTexture });

    // Step C: Create displacement sprite from baked texture
    const dispSprite = new PIXI.Sprite(renderTexture);
    dispSprite.texture.baseTexture.wrapMode = PIXI.WRAP_MODES.CLAMP;
    dispSprite.renderable = false;

    app.stage.addChild(dispSprite);

    const dispFilter = new PIXI.DisplacementFilter(dispSprite);
    dispFilter.resolution = app.renderer.resolution; // Match hardware scale

    // Step D: Power curve
    const s = this._computeDisplacementScale(this.settings.warpStrength);
    dispFilter.scale.set(s, s);

    // 3. Design Container
    const designContainer = new PIXI.Container();
    designContainer.filters = [dispFilter];
    app.stage.addChild(designContainer);

    // --- MASK SYSTEM REPLAY (EXPORT) ---
    if (this.maskOperations && this.maskOperations.length > 0) {
      const exportMaskTex = PIXI.RenderTexture.create({
        width: app.screen.width,
        height: app.screen.height,
        resolution: app.renderer.resolution
      });

      const rect = new PIXI.Graphics();
      rect.beginFill(0xFFFFFF);
      rect.drawRect(0, 0, app.screen.width, app.screen.height);
      rect.endFill();
      app.renderer.render(rect, { renderTexture: exportMaskTex });

      const eBrush = new PIXI.Graphics();
      
      // Mask coordinates run purely in 1:1 logical space, no ratio scaling required!
      for (let op of this.maskOperations) {
        eBrush.clear();
        eBrush.beginFill(0xFFFFFF);
        eBrush.blendMode = op.mode === 'erase' ? PIXI.BLEND_MODES.ERASE : PIXI.BLEND_MODES.NORMAL;
        
        if (op.type === 'polygon' && op.points) {
          const scaledPoints = op.points.map(p => new PIXI.Point(p.x, p.y));
          eBrush.drawPolygon(scaledPoints);
        } else {
          eBrush.drawCircle(op.x, op.y, op.size);
        }
        
        eBrush.endFill();
        app.renderer.render(eBrush, { renderTexture: exportMaskTex, clear: false });
      }

      const exportMaskSprite = new PIXI.Sprite(exportMaskTex);
      exportMaskSprite.renderable = false; // Must be false or it covers screen in white
      app.stage.addChild(exportMaskSprite);
      
      // Enforce the mask onto the high-res design export container
      designContainer.mask = exportMaskSprite;
    }
    // --- END MASK SYSTEM REPLAY ---

    // 4. Realism Layers (Shadow/Highlight)
    // Shadow
    const shadow = new PIXI.Sprite(mockupTexture);
    shadow.width = app.screen.width;
    shadow.height = app.screen.height;
    shadow.blendMode = PIXI.BLEND_MODES.MULTIPLY;

    // FIX: Match Editor Realism (v2.1)
    // "Opaque Ink" Tuning v2.1: Adjusted for consistency
    const shadowMatrix = new PIXI.filters.ColorMatrixFilter();
    shadowMatrix.desaturate();
    shadowMatrix.contrast(3, false); // Reduced from 4 to prevent crushing mids
    shadowMatrix.brightness(3.0, false); // Increased from 2.5 to washout greys
    shadow.filters = [shadowMatrix];
    shadow.alpha = 0.50 * (this.settings.textureStrength / 100); // Matched to Editor: 0.50
    if (this.settings.showOverlay) app.stage.addChild(shadow);

    // Texture Layer (Hard Light)
    const texture = new PIXI.Sprite(mockupTexture);
    texture.width = app.screen.width;
    texture.height = app.screen.height;
    texture.blendMode = PIXI.BLEND_MODES.HARD_LIGHT;

    // Texture Tuning: High Pass effect simulation
    const textureMatrix = new PIXI.filters.ColorMatrixFilter();
    textureMatrix.desaturate();
    textureMatrix.contrast(2, false); // Extreme contrast to isolate grain
    texture.filters = [textureMatrix];
    texture.alpha = 0.25 * (this.settings.textureStrength / 100); // Matched to Editor: 0.25
    if (this.settings.showOverlay) app.stage.addChild(texture);

    // Highlight
    const highlight = new PIXI.Sprite(mockupTexture);
    highlight.width = app.screen.width;
    highlight.height = app.screen.height;
    highlight.blendMode = PIXI.BLEND_MODES.SCREEN;

    const highlightMatrix = new PIXI.filters.ColorMatrixFilter();
    highlightMatrix.contrast(2, false);
    highlightMatrix.brightness(0.6, false);
    highlight.filters = [highlightMatrix];
    highlight.alpha = 0.50 * (this.settings.textureStrength / 100); // Matched to Editor: 0.50
    if (this.settings.showOverlay) app.stage.addChild(highlight);

    // --- WATERMARK EXPORT LAYER (v1.0.2) ---
    // Must be the LAST layer added so it renders on top of everything
    if (this.watermarkTexture && this.watermarkTexture.baseTexture && this.watermarkTexture.baseTexture.valid) {
      const exportCanvasW = app.screen.width;
      const exportCanvasH = app.screen.height;

      const watermarkExport = new PIXI.Sprite(this.watermarkTexture);
      watermarkExport.alpha = this.settings.watermarkOpacity / 100;

      // Scale relative to export canvas width — same formula as updateWatermarkTransform()
      const targetWidth = exportCanvasW * (this.settings.watermarkScale / 100);
      const targetScale = targetWidth / this.watermarkTexture.width;
      watermarkExport.scale.set(targetScale);

      const w = watermarkExport.width;
      const h = watermarkExport.height;
      const padding = 20; // Proportional padding

      switch (this.settings.watermarkPosition) {
        case 'top-left':
          watermarkExport.position.set(padding, padding);
          break;
        case 'top-right':
          watermarkExport.position.set(exportCanvasW - w - padding, padding);
          break;
        case 'bottom-left':
          watermarkExport.position.set(padding, exportCanvasH - h - padding);
          break;
        case 'center':
          watermarkExport.position.set((exportCanvasW - w) / 2, (exportCanvasH - h) / 2);
          break;
        case 'bottom-right':
        default:
          watermarkExport.position.set(exportCanvasW - w - padding, exportCanvasH - h - padding);
          break;
      }

      app.stage.addChild(watermarkExport);
    }
  }

  async renderExport(exportApp, designData) {
    // Find the designContainer created by _buildLayers
    const designContainer = exportApp.stage.children.find(child => child instanceof PIXI.Container && child.filters && child.filters.some(f => f instanceof PIXI.DisplacementFilter));

    if (!designContainer) {
      console.error("Design container not found in exportApp stage.");
      return;
    }

    // Clear previous design sprite if any
    designContainer.removeChildren();

    const designTexture = PIXI.Texture.from(designData);

    // CRITICAL: Force bilinear filtering on export textures too (WYSIWYG)
    designTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
    designTexture.baseTexture.mipmap = PIXI.MIPMAP_MODES.ON;
    designTexture.baseTexture.anisotropicLevel = 16;

    // Attach source path for protection logic
    if (typeof designData === 'string') {
      designTexture._sourcePath = designData.replace(/\\/g, '/');
    }

    // Wait for texture to load
    if (!designTexture.baseTexture.valid) {
      await new Promise(resolve => {
        designTexture.baseTexture.once('loaded', resolve);
        designTexture.baseTexture.once('error', resolve);
      });
    }

    // Double check validity
    if (!designTexture.baseTexture.valid || designTexture.width === 1) { // 1x1 is usually invalid/placeholder
      console.warn("Skipping invalid design texture");
      return;
    }

    // Create Design Sprite (SimplePlane mesh is safer for Displacement map clipping bounds)
    const designSprite = new PIXI.SimplePlane(designTexture, 80, 80);

    // Apply same transforms at full resolution
    // Pivot for centering
    // Check local bounds to be safe
    const bounds = designSprite.getLocalBounds();
    if (bounds && bounds.width) {
      designSprite.pivot.set(bounds.width / 2, bounds.height / 2);
    }

    // Scale position to LOGICAL setup
    designSprite.x = exportApp.screen.width * this.designPosition.x;
    designSprite.y = exportApp.screen.height * this.designPosition.y;

    const baseWidthExport = exportApp.screen.width * 0.4;
    const aspectRatio = designTexture.width / designTexture.height;

    designSprite.width = baseWidthExport * this.designScale;
    designSprite.height = (baseWidthExport / aspectRatio) * this.designScale;

    designSprite.rotation = this.designRotation;
    designSprite.alpha = this.settings.opacity / 100;

    // Apply Crop if active
    // We need to scale the crop rect from Screen Space to Original Space
    if (this.cropRect && this.designSprite) { // Check if we have an active crop from the main app
      // The cropRect in main app is in Local Space of the LOCAL design sprite.
      // Since we are creating a NEW design sprite with potentially different pixel dimensions (if texture is same but scaled diff),
      // we simply need to apply the same UV-relative crop?
      // No, cropRect is in pixels relative to the texture size (since it's inside the sprite).
      // If the texture is the SAME (designData is same), then pixels are same.
      // So we can reuse cropRect x/y/w/h directly.

      const cropMask = new PIXI.Graphics();
      cropMask.beginFill(0xffffff);
      cropMask.drawRect(this.cropRect.x, this.cropRect.y, this.cropRect.width, this.cropRect.height);
      cropMask.endFill();

      designSprite.mask = cropMask;
      designSprite.addChild(cropMask);
    }

    designContainer.addChild(designSprite);
  }


  clearExportTextures(exportApp, protectedTexture) {
    // Safer Cleanup: Only destroy textures inside the Design Container
    const designContainer = exportApp.stage.children.find(c => c instanceof PIXI.Container && c.filters && c.filters.some(f => f instanceof PIXI.DisplacementFilter));

    if (designContainer) {
      designContainer.children.forEach(child => {
        if (child.texture) {
          // PROTECTION: Check if this texture is currently used by the Main Editor
          const isShared = this.designSprite && this.designSprite.texture &&
            this.designSprite.texture.baseTexture === child.texture.baseTexture;

          if (!isShared) {
            child.texture.destroy(true); // Only destroy if NOT shared
          }
        }
      });
      designContainer.removeChildren();
    }

    // Do NOT touch other stage children (Background, Shadow, etc)
    // This prevents accidentally destroying the shared Editor mockup texture.
  }

  // --- LIBRARY METHODS ---

  async resizeImage(base64, preset, customWidth, customHeight, format = 'jpg') {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let targetWidth, targetHeight;
        const aspect = img.width / img.height;

        if (preset === 'etsy') {
          // Etsy: 2000px width, maintain aspect ratio
          targetWidth = 2000;
          targetHeight = targetWidth / aspect;
        } else if (preset === 'shopify') {
          // Shopify: 2048px square (contain)
          // We need to create a square canvas and center the image
          targetWidth = 2048;
          targetHeight = 2048;
        } else if (preset === 'custom') {
          targetWidth = customWidth;
          // Use user height if provided, otherwise auto calc
          if (customHeight && !isNaN(customHeight)) {
            targetHeight = customHeight;
          } else {
            targetHeight = targetWidth / aspect;
          }
        } else if (preset === 'original') {
          // Pass-through for Quality Conversion (PNG -> JPEG 0.98)
          targetWidth = img.width;
          targetHeight = img.height;
        } else {
          // Fallback
          targetWidth = img.width;
          targetHeight = img.height;
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        // High quality smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // FIX: Ensure background is WHITE for JPEG export (handles transparency)
        // Otherwise transparent pixels turn BLACK in JPEG
        // ctx.fillStyle = '#ffffff';
        // ctx.fillRect(0, 0, targetWidth, targetHeight);

        if (preset === 'shopify') {
          // Fill white background (redundant but safe)
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetWidth, targetHeight);

          // Calculate centered position
          let drawW, drawH, offsetX, offsetY;

          if (aspect > 1) { // Landscape
            drawW = targetWidth;
            drawH = targetWidth / aspect;
            offsetX = 0;
            offsetY = (targetHeight - drawH) / 2;
          } else { // Portrait
            drawH = targetHeight;
            drawW = targetHeight * aspect;
            offsetY = 0;
            offsetX = (targetWidth - drawW) / 2;
          }
          ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

        } else {
          // Normal resize
          // FIX: Ensure background is WHITE for JPEG export ONLY
          if (format === 'jpg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
          }
          // For PNG/WebP, we want TRANSPARENCY, so NO fillRect (Canvas is transparent by default)

          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        }

        // Output Format
        let mimeType = 'image/jpeg';
        if (format === 'png') mimeType = 'image/png';
        if (format === 'webp') mimeType = 'image/webp';

        // Output Quality
        // JPG/WebP use quality. PNG ignores it.
        resolve(canvas.toDataURL(mimeType, 0.98));
      };

      img.src = base64;
    });
  }
  async openLibrary() {
    this._inCloudMode = false;
    this.libraryModal.style.display = 'flex';
    this.selectedLibraryItems.clear(); // Reset selection
    
    // Reset Header UI
    if (this.cloudFilterGroup) this.cloudFilterGroup.style.display = 'none';
    if (this.librarySearch) {
      this.librarySearch.placeholder = 'Search all mockups...';
    }
    
    this.loadLibraryData();
    this.updateLibraryFooter();
  }

  toggleLibraryMaximize() {
    this.isLibraryMaximized = !this.isLibraryMaximized;
    const modalContent = this.libraryModal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.classList.toggle('maximized', this.isLibraryMaximized);
    }

    if (this.btnMaximizeLibrary) {
      if (this.isLibraryMaximized) {
        this.btnMaximizeLibrary.title = 'Restore';
        this.btnMaximizeLibrary.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 9h6M9 9H3M15 9V3M9 9V3M15 15h6M9 15H3M15 15v6M9 15v6" />
          </svg>`;
      } else {
        this.btnMaximizeLibrary.title = 'Maximize';
        this.btnMaximizeLibrary.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 3h6v6M9 3H3v6M15 21h6v-6M9 21H3v-6" />
          </svg>`;
      }
    }
  }

  closeLibrary() {
    this.libraryModal.style.display = 'none';
  }

  async loadLibraryData() {
    try {
      console.log('Fetching library data...');
      if (!this.settings.linkedFolders) this.settings.linkedFolders = [];
      const response = await window.electronAPI.scanLibrary(this.settings.linkedFolders);
      this.libraryData = response.structure || {};
      this.renderLibraryCategories();
      
      // Default view: Show All Mockups
      const allFiles = this.getAllMockups(this.libraryData);
      console.log('Total mockups found:', allFiles.length);
      this.renderLibraryGrid(allFiles, 'All Mockups');
    } catch (error) {
      console.error('Failed to load library:', error);
    }
  }

  getAllMockups(folders) {
    if (!folders) return [];
    let files = [];
    for (const cat in folders) {
      const catData = folders[cat];
      if (catData.files && Array.isArray(catData.files)) {
        files = files.concat(catData.files);
      }
      if (catData.folders) {
        files = files.concat(this.getAllMockups(catData.folders));
      }
    }
    return files;
  }

  renderLibraryCategories() {
    this.libraryCategories.innerHTML = '';

    const allKeys = Object.keys(this.libraryData);

    // Define standard order
    const fixedOrder = ['T-Shirts', 'Hoodies', 'Cups', 'Mugs', 'Caps', 'Wall Frames'];

    // Separate keys
    const standard = fixedOrder.filter(k => allKeys.includes(k));
    const custom = allKeys.filter(k => !fixedOrder.includes(k)).sort();

    // Combine: Standard first, then Custom
    const keys = ['All Mockups', '★ Starred', ...standard, ...custom];

    keys.forEach((cat) => {
      const li = this.createCategoryElement(cat, this.libraryData[cat]);
      if (cat === 'All Mockups') {
        const row = li.querySelector('.category-row');
        if (row) row.classList.add('active');
      }
      this.libraryCategories.appendChild(li);
    });

    // Add "New Category" Button
    const addBtn = document.createElement('li');
    addBtn.className = 'library-category-add';
    addBtn.innerHTML = `<span>+ New Category</span>`;
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.createNewCategory();
    });
    this.libraryCategories.appendChild(addBtn);

    this.libraryCategories.appendChild(addBtn);
  }

  createCategoryElement(name, catData = { folders: {}, files: [] }, isSub = false) {
    const li = document.createElement('li');
    if (isSub) li.className = 'sub-category-item';

    const safeData = catData || { folders: {}, files: [] };
    const hasFolders = safeData && safeData.folders && Object.keys(safeData.folders).length > 0;
    
    // Fix: isRemovable was missing its definition
    const isRemovable = !['All Mockups', 'T-Shirts', 'Hoodies', 'Cups', 'Mugs', 'Caps', 'Wall Frames', 'Universal'].includes(name);

    li.innerHTML = `
      <div class="category-row">
        ${hasFolders ? `
        <div class="category-chevron-wrapper">
          <svg class="category-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>` : '<div style="width: 20px; margin-right: 4px; flex-shrink: 0;"></div>'}
        <span>${name}</span>
        ${isRemovable ? `
        <div class="delete-icon" title="Delete Category">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </div>` : ''}
      </div>`;

    // Default: Expand if it's a core category
    if (['T-Shirts', 'Hoodies'].includes(name) && !isSub) {
      li.classList.add('expanded');
    }

    const row = li.querySelector('.category-row');
    const chevron = li.querySelector('.category-chevron-wrapper');

    // 1. Chevron Click: Only Toggle Expansion
    if (chevron) {
      chevron.addEventListener('click', (e) => {
        e.stopPropagation(); // Stop from hitting row selector
        li.classList.toggle('expanded');
      });
    }

    // 2. Row Click: Select AND Toggle Expansion
    row.addEventListener('click', (e) => {
      // Handle Unlinking / Deleting
      if (e.target.closest('.delete-icon')) {
        // ... (existing delete logic)
        e.stopPropagation();
        if (name.includes('(Linked)')) {
          // Unlink Folder — Safe: only removes reference, never touches files
          if (confirm(`Unlink folder "${name}"?`)) {
            if (this.settings.linkedFolders) {
              const displayName = name.replace(' (Linked)', '').replace(/ \(\d+\)$/, '').trim().toLowerCase();
              this.settings.linkedFolders = this.settings.linkedFolders.filter(p => {
                const baseName = p.replace(/\\/g, '/').split('/').pop().trim().toLowerCase();
                return baseName !== displayName;
              });
              this.saveSettings();
            }
            this.loadLibraryData();
          }
        } else {
          // Delete physical Category — confirm first
          if (confirm(`Delete category "${name}" and all its mockups?`)) {
            window.electronAPI.deleteLibraryCategory(name).then(success => {
              if (success) this.loadLibraryData();
            });
          }
        }
        return;
      }
      
      // If clicking chevron, it's already handled by its own listener
      if (e.target.closest('.category-chevron-wrapper')) return;

      e.stopPropagation();

      // Reset Cloud Mode if navigating local categories
      this._inCloudMode = false;
      if (this.cloudFilterGroup) this.cloudFilterGroup.style.display = 'none';
      if (this.librarySearch) this.librarySearch.placeholder = 'Search all mockups...';

      // Update selection UI
      const categoriesList = document.getElementById('library-categories');
      if (categoriesList) {
        categoriesList.querySelectorAll('.category-row').forEach(el => el.classList.remove('active'));
      }
      row.classList.add('active');

      // Toggle expansion if it has children
      if (hasFolders) {
        li.classList.toggle('expanded');
      }

      // Render grid content: Show all files in category recursively
      if (name === 'All Mockups') {
        this.renderLibraryGrid(this.getAllMockups(this.libraryData), name);
      } else if (name === '★ Starred') {
        const allMockups = this.getAllMockups(this.libraryData);
        const starredMockups = allMockups.filter(m => this.favoriteMockups.has(m.path));
        this.renderLibraryGrid(starredMockups, name);
      } else {
        const allCategoryFiles = [...(safeData.files || []), ...this.getAllMockups(safeData.folders)];
        this.renderLibraryGrid(allCategoryFiles, name);
      }
    });

    // Recursively add sub-folders if they exist
    if (hasFolders) {
      const subList = document.createElement('ul');
      subList.className = 'sub-category-list';
      Object.keys(safeData.folders).forEach(subName => {
        subList.appendChild(this.createCategoryElement(subName, safeData.folders[subName], true));
      });
      li.appendChild(subList);
    }

    return li;
  }

  renderLibraryGrid(items, categoryName) {
    console.log(`Rendering grid for ${categoryName}, items:`, items?.length || 0);
    this.libraryGrid.innerHTML = '';

    // Handle Search Filter
    let displayItems = items || [];
    if (this.librarySearch && this.librarySearch.value.trim() !== '') {
      const query = this.librarySearch.value.toLowerCase();
      displayItems = displayItems.filter(item => item.name.toLowerCase().includes(query));
    }

    // Update Count
    if (this.libraryCountTag) {
      this.libraryCountTag.textContent = `${displayItems.length} mockups`;
    }

    // If items exist, render them. If not, we still want the "Add" button below.
    if (displayItems.length > 0) {
      displayItems.forEach(file => {
        const el = document.createElement('div');
        el.className = 'library-item';
        if (this.selectedLibraryItems.has(file.path)) {
          el.classList.add('selected');
        }

        // Encode path for src
        const safePath = file.path.replace(/\\/g, '/');
        const imgSrc = file.data ? file.data : `safe-file://${safePath}`;

        // Create a professional name (Remove ext, replace _ and - with space)
        const proName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

        const isStarred = this.favoriteMockups.has(file.path);

        el.innerHTML = `
          <img loading="lazy" style="opacity: 0; transition: opacity 0.2s ease;">
          <div class="library-item-label">${proName}</div>
          <div class="library-item-star ${isStarred ? 'active' : ''}" title="Favorite">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${isStarred ? '#ffb400' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </div>
          <div class="library-item-delete" title="Delete Mockup">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </div>
        `;

        const imgEl = el.querySelector('img');
        
        // Load instantly if it's an active base64 upload, else query OS thumbnail cache
        if (file.data) {
          imgEl.src = file.data;
          imgEl.style.opacity = '1';
        } else {
          window.electronAPI.getThumbnail(file.path).then(thumbUrl => {
            imgEl.src = thumbUrl || imgSrc; // Fallback to raw 8MB file if OS cache fails
            imgEl.style.opacity = '1';
          }).catch(() => {
            imgEl.src = imgSrc;
            imgEl.style.opacity = '1';
          });
        }

        // Click Handler: Toggle Selection
        el.addEventListener('click', (e) => {
          // Prevent selection if clicking delete or star
          if (e.target.closest('.library-item-delete') || e.target.closest('.library-item-star')) return;
          this.toggleLibrarySelection(file, el);
        });

        // Star/Favorite Handler
        const starBtn = el.querySelector('.library-item-star');
        starBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const path = file.path;
          if (this.favoriteMockups.has(path)) {
            this.favoriteMockups.delete(path);
            starBtn.classList.remove('active');
            starBtn.querySelector('svg').setAttribute('fill', 'none');
          } else {
            this.favoriteMockups.add(path);
            starBtn.classList.add('active');
            starBtn.querySelector('svg').setAttribute('fill', '#ffb400');
          }
          this.saveSettings();

          // If we are in the Starred view, re-render to reflect removal
          const activeCat = this.libraryCategories.querySelector('.category-row.active');
          if (activeCat && activeCat.textContent.trim() === '★ Starred') {
             const allMockups = this.getAllMockups(this.libraryData);
             const starredMockups = allMockups.filter(m => this.favoriteMockups.has(m.path));
             this.renderLibraryGrid(starredMockups, '★ Starred');
          }
        });

        // Delete Handler
        const deleteBtn = el.querySelector('.library-item-delete');
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Are you sure you want to delete "${file.name}"?`)) {
            const success = await window.electronAPI.deleteLibraryMockup(file.path);
            if (success) {
              this.selectedLibraryItems.delete(file.path);
              this.openLibrary();
            } else {
              alert("Failed to delete file.");
            }
          }
        });

        this.libraryGrid.appendChild(el);
      });
    }

    // Add "New Mockup" card
    const addCard = document.createElement('div');
    addCard.className = 'library-item library-item-add';
    addCard.innerHTML = `
      <div class="add-icon">+</div>
      <div style="font-size: 11px; font-weight: 500;">Add Mockup</div>
    `;
    addCard.addEventListener('click', () => {
      this.addMockupToCategory(categoryName);
    });

    // Drag & Drop Support
    addCard.addEventListener('dragover', (e) => {
      e.preventDefault();
      addCard.style.borderColor = 'var(--accent-color)';
      addCard.style.background = 'rgba(0, 113, 227, 0.05)';
    });

    addCard.addEventListener('dragleave', (e) => {
      e.preventDefault();
      addCard.style.borderColor = '';
      addCard.style.background = '';
    });

    addCard.addEventListener('drop', async (e) => {
      e.preventDefault();
      addCard.style.borderColor = '';
      addCard.style.background = '';

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        if (e.dataTransfer.files[0].path) {
          this.addMockupToCategory(categoryName, e.dataTransfer.files[0].path);
        }
      }
    });

    this.libraryGrid.appendChild(addCard);
  }

  toggleLibrarySelection(file, element) {
    if (this.selectedLibraryItems.has(file.path)) {
      this.selectedLibraryItems.delete(file.path);
      element.classList.remove('selected');
    } else {
      this.selectedLibraryItems.add(file.path);
      element.classList.add('selected');
    }
    this.updateLibraryFooter();
  }

  updateLibraryFooter() {
    // We need to inject a footer button if it doesn't exist, or update it
    const footer = this.libraryModal.querySelector('.modal-footer');
    if (!footer) return;

    // Clear existing or find specific button
    footer.innerHTML = '';

    // Hint
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = this.selectedLibraryItems.size > 0
      ? `${this.selectedLibraryItems.size} mockups selected`
      : 'Select multiple mockups to batch generate';
    footer.appendChild(hint);

    // Actions Container
    const actions = document.createElement('div');
    actions.className = 'footer-actions';

    // Link Folder Button
    const btnLink = document.createElement('button');
    btnLink.className = 'btn btn-secondary';
    btnLink.style.width = 'auto';
    btnLink.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
      </svg>
      Link Local Folder
    `;
    btnLink.addEventListener('click', async () => {
      try {
        const result = await window.electronAPI.selectInputFolder();
        if (result && result.path) {
          if (!this.settings.linkedFolders) this.settings.linkedFolders = [];
          const normalized = result.path.replace(/\\/g, '/');
          if (!this.settings.linkedFolders.some(p => p.replace(/\\/g, '/') === normalized)) {
            this.settings.linkedFolders.push(result.path);
            this.saveSettings();
            this.loadLibraryData();
          } else {
            alert('This folder is already linked to your library!');
          }
        }
      } catch (err) {
        console.error('Failed to link:', err);
        alert('Failed to link folder.');
      }
    });
    actions.appendChild(btnLink);

    // Context Action Button
    const btnAction = document.createElement('button');
    btnAction.className = 'btn btn-primary';
    btnAction.style.width = 'auto'; // Auto width

    if (this.selectedLibraryItems.size > 0) {
      btnAction.textContent = this.selectedLibraryItems.size === 1 ? 'Use Mockup' : `Use ${this.selectedLibraryItems.size} Mockups`;
      btnAction.disabled = false;
      btnAction.addEventListener('click', () => this.confirmLibrarySelection());
    } else {
      btnAction.textContent = 'Select Mockup';
      btnAction.disabled = true;
    }

    actions.appendChild(btnAction);
    footer.appendChild(actions);
  }

  async confirmLibrarySelection() {
    const selectedPaths = Array.from(this.selectedLibraryItems);

    if (selectedPaths.length === 0) return;

    // Queue Logic
    this.mockupQueue = selectedPaths.map(path => ({
      path: path,
      name: path.split(/[\\/]/).pop()
    }));

    // If only one, load it immediately like before
    // If multiple, load the FIRST one as preview, and queue the rest.

    const firstMockup = this.mockupQueue[0];

    // Load the first one
    const safePath = firstMockup.path.replace(/\\/g, '/');
    this.mockupData = {
      name: firstMockup.name,
      path: firstMockup.path,
      data: `safe-file://${firstMockup.path}`
    };

    this.mockupInfo.textContent = this.selectedLibraryItems.size > 1
      ? `${firstMockup.name} (+${this.selectedLibraryItems.size - 1} others)`
      : firstMockup.name;

    this.resetMockupSettings(); // FIX: Reset Tint in "Use" flow too!
    this.mockupOverrides = {}; // Clear all overrides for fresh queue
    this.activeQueueIndex = 0;
    this.globalSettings = { ...this.settings }; // Snapshot master settings baseline
    this.globalDesignPosition = { ...this.designPosition };
    this.globalDesignScale = this.designScale;
    this.globalDesignRotation = this.designRotation;

    this.initPixiApp();
    this.closeLibrary();
    this.populateQueuePanel();
    this.updateSliderDimming();
    this.updateGenerateButton(); // Important to update label
  }

  // --- QUEUE MANAGEMENT SYSTEM ---

  populateQueuePanel() {
    if (!this.queueThumbnails) return;
    this.queueThumbnails.innerHTML = '';

    const queue = this.mockupQueue;
    if (!queue || queue.length === 0) {
      if (this.queueOffcanvas) this.queueOffcanvas.classList.remove('open');
      if (this.queueCount) this.queueCount.textContent = '0 items';
      return;
    }

    if (this.queueCount) this.queueCount.textContent = `${queue.length} mockup${queue.length > 1 ? 's' : ''}`;

    queue.forEach((mockup, index) => {
      const item = document.createElement('div');
      item.className = 'queue-thumb-item' + (index === this.activeQueueIndex ? ' active' : '');
      item.dataset.index = index;

      // Indicator badge
      const indicator = document.createElement('div');
      indicator.className = 'queue-indicator';
      indicator.textContent = index + 1;
      item.appendChild(indicator);

      // Check if we have an override saved for this mockup with actual custom keys
      const entry = this.mockupOverrides[mockup.path];
      if (entry && entry.overriddenKeys && entry.overriddenKeys.size > 0 && index > 0) {
        const badge = document.createElement('div');
        badge.style.cssText = 'position:absolute;bottom:6px;right:6px;background:var(--accent-color);color:white;font-size:9px;padding:2px 5px;border-radius:4px;font-weight:bold;';
        badge.textContent = 'Custom';
        item.appendChild(badge);

        // Revert button — clears all overrides for this mockup
        const revertBtn = document.createElement('button');
        revertBtn.title = 'Revert to Mockup 1 settings';
        revertBtn.style.cssText = 'position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;border:none;background:rgba(0,0,0,0.6);color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;opacity:0;transition:opacity 0.2s;z-index:12;padding:0;';
        revertBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
        revertBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Don't trigger thumbnail click
          this.revertMockupToMaster(index);
        });
        item.appendChild(revertBtn);

        // Show revert button on hover
        item.addEventListener('mouseenter', () => revertBtn.style.opacity = '1');
        item.addEventListener('mouseleave', () => revertBtn.style.opacity = '0');
      }

      const img = document.createElement('img');
      const safePath = mockup.path.replace(/\\/g, '/');
      img.src = `safe-file://${mockup.path}`;
      img.alt = mockup.name;
      img.onerror = () => {
        img.style.display = 'none';
        item.style.background = 'var(--bg-secondary)';
      };
      item.appendChild(img);

      // Name label
      const label = document.createElement('div');
      label.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent, rgba(0,0,0,0.75));color:white;font-size:9px;padding:4px 6px;border-radius:0 0 6px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      label.textContent = mockup.name;
      item.appendChild(label);

      item.addEventListener('click', () => this.switchQueueMockup(index));
      this.queueThumbnails.appendChild(item);
    });

    // Auto-open panel if multiple mockups
    if (queue.length > 1 && this.queueOffcanvas) {
      setTimeout(() => this.queueOffcanvas.classList.add('open'), 400);
    }
  }
  revertMockupToMaster(index) {
    const mockup = this.mockupQueue[index];
    if (!mockup) return;

    // Step 1: Flush the currently-active mockup's live state to storage FIRST,
    // so no stale data leaks when we delete the target override.
    this.saveCurrentMockupState();

    // Step 2: Nuke the override for the target mockup
    delete this.mockupOverrides[mockup.path];

    // Step 3: If this mockup is currently active on-screen, reset ALL live state to master
    if (index === this.activeQueueIndex) {
      // Reset live settings to master baseline
      const masterSettings = this.globalSettings || this.settings;
      this.settings = { ...masterSettings };

      // Reset transforms to master baseline
      this.designPosition = { ...(this.globalDesignPosition || { x: 0.5, y: 0.4 }) };
      this.designScale = this.globalDesignScale !== undefined ? this.globalDesignScale : 1;
      this.designRotation = this.globalDesignRotation !== undefined ? this.globalDesignRotation : 0;
      this.maskOperations = [];

      // Apply visually to canvas
      this.applyMockupState({ overriddenKeys: new Set(), settings: {} });

      // CRITICAL: Delete again — applyMockupState/save may have re-created the entry
      delete this.mockupOverrides[mockup.path];
    }

    this.populateQueuePanel();
  }

  // Mark a specific setting as explicitly overridden for the active mockup
  markSettingOverridden(key) {
    if (!this.mockupQueue || this.mockupQueue.length === 0) return;
    const activeMockup = this.mockupQueue[this.activeQueueIndex];
    if (!activeMockup) return;

    if (!this.mockupOverrides[activeMockup.path]) {
      this.mockupOverrides[activeMockup.path] = { overriddenKeys: new Set() };
    }
    this.mockupOverrides[activeMockup.path].overriddenKeys.add(key);
    this.saveCurrentMockupState();
    this.updateSliderDimming();
    this.populateQueuePanel(); // refresh 'Custom' badges
  }

  saveCurrentMockupState() {
    if (!this.mockupQueue || this.mockupQueue.length === 0) return;
    const activeMockup = this.mockupQueue[this.activeQueueIndex];
    if (!activeMockup) return;

    if (!this.mockupOverrides[activeMockup.path]) {
      this.mockupOverrides[activeMockup.path] = { overriddenKeys: new Set() };
    }
    const entry = this.mockupOverrides[activeMockup.path];
    entry.settings = { ...this.settings };
    entry.designPosition = { ...this.designPosition };
    entry.designScale = this.designScale;
    entry.designRotation = this.designRotation;
    entry.maskOperations = [...(this.maskOperations || [])];
  }

  // Get the effective settings for a mockup: global merged with its partial overrides
  getEffectiveSettings(mockupPath) {
    const base = this.globalSettings || this.settings;
    const entry = this.mockupOverrides[mockupPath];
    if (!entry || !entry.overriddenKeys || entry.overriddenKeys.size === 0) {
      return { ...base };
    }
    const merged = { ...base };
    for (const key of entry.overriddenKeys) {
      if (entry.settings && entry.settings[key] !== undefined) {
        merged[key] = entry.settings[key];
      }
    }
    return merged;
  }

  // Visually dim sliders that are inherited (not overridden) for this mockup
  updateSliderDimming() {
    const clearAll = () => {
      this._setSliderDim('opacity', false);
      this._setSliderDim('warpStrength', false);
      this._setSliderDim('scale', false);
      this._setSliderDim('rotation', false);
      this._setSliderDim('textureStrength', false);
    };

    if (!this.mockupQueue || this.mockupQueue.length <= 1) {
      clearAll();
      return;
    }

    // First mockup (index 0) is the master — never dim its sliders
    if (this.activeQueueIndex === 0) {
      clearAll();
      return;
    }

    const activeMockup = this.mockupQueue[this.activeQueueIndex];
    if (!activeMockup) return;
    const entry = this.mockupOverrides[activeMockup.path];
    const overridden = entry ? entry.overriddenKeys : new Set();

    this._setSliderDim('opacity', !overridden.has('opacity'));
    this._setSliderDim('warpStrength', !overridden.has('warpStrength'));
    this._setSliderDim('scale', !overridden.has('scale'));
    this._setSliderDim('rotation', !overridden.has('rotation'));
    this._setSliderDim('textureStrength', !overridden.has('textureStrength'));
  }

  _setSliderDim(key, dimmed) {
    const map = {
      opacity: this.sliderOpacity,
      warpStrength: this.sliderWarp,
      scale: this.sliderScale,
      rotation: this.sliderRotation,
      textureStrength: this.sliderTexture
    };
    const slider = map[key];
    if (!slider) return;
    const group = slider.closest('.control-group');
    if (group) {
      group.style.opacity = dimmed ? '0.45' : '1';
      group.title = dimmed ? 'Inherited from global settings (change to override for this mockup)' : 'Custom override for this mockup';
    }
  }

  applyMockupState(savedState) {
    if (!savedState) return;
    const base = this.globalSettings || this.settings;
    const overridden = savedState.overriddenKeys || new Set();

    // Merge: start from global, then apply only overridden keys
    const merged = { ...base };
    if (savedState.settings) {
      for (const key of overridden) {
        if (savedState.settings[key] !== undefined) {
          merged[key] = savedState.settings[key];
        }
      }
    }
    this.settings = merged;

    // Update slider UI
    if (this.sliderOpacity) { this.sliderOpacity.value = merged.opacity; this.opacityValue.textContent = `${merged.opacity}%`; }
    if (this.sliderWarp) { this.sliderWarp.value = merged.warpStrength; this.warpValue.textContent = merged.warpStrength; }
    if (this.sliderScale) { this.sliderScale.value = merged.scale; this.scaleValue.textContent = `${merged.scale}%`; }
    if (this.sliderRotation) { this.sliderRotation.value = merged.rotation; this.rotationValue.textContent = `${merged.rotation}°`; }
    if (this.sliderTexture) { this.sliderTexture.value = merged.textureStrength; this.textureValue.textContent = `${merged.textureStrength}%`; }
    if (this.checkboxOverlay) this.checkboxOverlay.checked = merged.showOverlay;

    // Restore design transform: use saved if overridden, otherwise fall back to MASTER's position
    const masterPos = this.globalDesignPosition || { x: 0.5, y: 0.4 };
    const masterScale = this.globalDesignScale !== undefined ? this.globalDesignScale : 1;
    const masterRot = this.globalDesignRotation !== undefined ? this.globalDesignRotation : 0;

    this.designPosition = overridden.has('position') ? { ...savedState.designPosition } : { ...masterPos };
    this.designScale = overridden.has('scale') ? savedState.designScale : masterScale;
    this.designRotation = overridden.has('rotation') ? savedState.designRotation : masterRot;
    this.maskOperations = [...(savedState.maskOperations || [])];

    // Apply visuals
    this.updateDesign();
    this.updateDesignTransform();
    this.updateDisplacement();
    this.updateLighting();
    this.updateSliderDimming();
  }

  switchQueueMockup(index) {
    if (!this.mockupQueue || index === this.activeQueueIndex) return;

    // Save current mockup's state before leaving
    this.saveCurrentMockupState();

    // If leaving mockup 0 (master), update the global baseline with its current transforms
    if (this.activeQueueIndex === 0) {
      this.globalSettings = { ...this.settings };
      this.globalDesignPosition = { ...this.designPosition };
      this.globalDesignScale = this.designScale;
      this.globalDesignRotation = this.designRotation;
    }

    this.activeQueueIndex = index;
    const mockup = this.mockupQueue[index];
    if (!mockup) return;

    // Load this mockup into the canvas
    this.mockupData = {
      name: mockup.name,
      path: mockup.path,
      data: `safe-file://${mockup.path}`
    };
    this.mockupInfo.textContent = mockup.name;

    const savedState = this.mockupOverrides[mockup.path];

    // FIX (v2): Store the pending state for setupLayers() to apply deterministically
    // instead of the old setTimeout(300ms) which caused race condition position loss.
    if (savedState) {
      this._pendingMockupState = savedState;
    } else {
      this._pendingMockupState = { overriddenKeys: new Set(), settings: {} };
    }

    // Re-initialize pixi (loads new background → setupLayers → applies pending state)
    this.initPixiApp();

    this.populateQueuePanel();
  }

  resetMockupSettings() {
    // FIX: Reset Tint Settings to avoid "Black Overlay" from previous states
    this.settings.mockupColor = '#ffffff';
    if (this.checkboxEnableTint) {
      this.checkboxEnableTint.checked = false;
      this.checkboxEnableTint.dispatchEvent(new Event('change')); // Trigger UI update
    }
    if (this.tintControls) this.tintControls.style.display = 'none';
    if (this.inputMockupColor) this.inputMockupColor.value = '#ffffff';
  }

  async loadMockup() {
    const results = await window.electronAPI.selectMockupFile();
    if (results && results.length > 0) {
      this.mockupQueue = results;

      this.resetMockupSettings(); // Reset Tint

      this.mockupData = results[0];
      if (results.length === 1) {
        this.mockupInfo.textContent = results[0].name;
      } else {
        this.mockupInfo.textContent = `${results.length} Bases Loaded`;
      }
      
      this.activeQueueIndex = 0;
      this.populateQueuePanel();
      
      this.initPixiApp();
    }
  }


  loadMockupFromLibrary(file) {
    // Determine path with protocol for Electron/Pixi
    // Ensure properly escaped for URL (handle spaces etc)
    const formattedPath = file.path.replace(/\\/g, '/');
    const safeUrl = `file://${formattedPath.split('/').map(encodeURIComponent).join('/')}`;

    // We treat 'data' as the source URL for the image
    this.mockupData = {
      name: file.name,
      path: file.path,
      data: safeUrl
    };

    this.resetMockupSettings(); // Reset Tint

    console.log("Loading Library Mockup:", safeUrl);
    this.mockupInfo.textContent = file.name;
    this.initPixiApp();
    this.closeLibrary();
  }

  async createNewCategory() {
    try {
      const name = await this.showInputPrompt("Enter Category Name", "e.g. Custom Hoodies");
      if (!name) return;

      const result = await window.electronAPI.createLibraryCategory(name);
      if (result) {
        this.loadLibraryData();
      } else {
        alert("Could not create category. Name might be invalid or already exists.");
      }
    } catch (err) {
      console.error("Input cancelled or failed:", err);
    }
  }

  showInputPrompt(title, placeholder = "") {
    return new Promise((resolve, reject) => {
      this.inputModalTitle.textContent = title;
      this.inputModalValue.value = "";
      this.inputModalValue.placeholder = placeholder;
      this.inputModal.style.display = 'flex';
      this.inputModalValue.focus();

      const closeInfo = () => {
        this.inputModal.style.display = 'none';
        cleanup();
      };

      const handleConfirm = () => {
        const val = this.inputModalValue.value.trim();
        if (val) {
          resolve(val);
          closeInfo();
        }
      };

      const handleCancel = () => {
        resolve(null); // Return null on cancel
        closeInfo();
      };

      const handleKey = (e) => {
        if (e.key === 'Enter') handleConfirm();
        if (e.key === 'Escape') handleCancel();
      };

      const cleanup = () => {
        this.btnConfirmInput.removeEventListener('click', handleConfirm);
        this.btnCancelInput.removeEventListener('click', handleCancel);
        this.btnCloseInput.removeEventListener('click', handleCancel);
        this.inputModalValue.removeEventListener('keydown', handleKey);
      };

      this.btnConfirmInput.addEventListener('click', handleConfirm);
      this.btnCancelInput.addEventListener('click', handleCancel);
      this.btnCloseInput.addEventListener('click', handleCancel);
      this.inputModalValue.addEventListener('keydown', handleKey);
    });
  }



  initAutoUpdater() {
    console.log('Initializing Auto Updater (Modal)...');

    // Status Listener
    window.electronAPI.onUpdateStatus((data) => {
      console.log('Update Status:', data);
      this.updateModal.style.display = 'flex'; // Show modal
      this.updateModalMessage.innerText = data.message;
      this.updateModalTitle.innerText = "Software Update";

      if (data.status === 'checking') {
        this.updateSpinner.classList.remove('hidden');
        this.updateProgressContainer.classList.add('hidden');
        this.updateProgressText.classList.add('hidden');
        this.btnDownloadUpdate.classList.add('hidden');
        this.btnRestartUpdate.classList.add('hidden');
        this.btnCloseUpdate.classList.remove('hidden');
        this.updateNewVersion.classList.add('hidden');
      }
      else if (data.status === 'available') {
        this.updateSpinner.classList.add('hidden');
        this.updateNewVersion.innerText = `New Version: ${data.version}`;
        this.updateNewVersion.classList.remove('hidden');
        this.btnDownloadUpdate.classList.remove('hidden');
        this.btnCloseUpdate.classList.remove('hidden');
      }
      else if (data.status === 'not-available') {
        this.updateSpinner.classList.add('hidden');
        // Auto close after 3s
        setTimeout(() => {
          this.updateModal.style.display = 'none';
        }, 3000);
      }
      else if (data.status === 'downloaded') {
        this.updateSpinner.classList.add('hidden');
        this.updateProgressContainer.classList.add('hidden');
        this.updateProgressText.classList.add('hidden');
        this.btnCloseUpdate.classList.remove('hidden');
        this.btnDownloadUpdate.classList.add('hidden');
        this.btnRestartUpdate.classList.remove('hidden'); // Show Restart
      }
      else if (data.status === 'error') {
        this.updateSpinner.classList.add('hidden');
      }
    });

    // Progress Listener
    window.electronAPI.onDownloadProgress((data) => {
      console.log('Download Progress:', data);
      this.updateSpinner.classList.add('hidden');
      this.updateProgressContainer.classList.remove('hidden');
      this.updateProgressText.classList.remove('hidden');

      const percent = Math.round(data.percent);
      if (this.updateProgressFill) this.updateProgressFill.style.width = `${percent}%`;
      this.updateProgressText.innerText = `${percent}%`;
      this.updateModalMessage.innerText = `Downloading Update...`;
    });
  }

  async addMockupToCategory(category, droppedFilePath = null) {
    let filePath = droppedFilePath;

    if (!filePath) {
      const file = await window.electronAPI.selectMockupFile();
      if (file && file.path) filePath = file.path;
    }

    if (filePath) {
      const result = await window.electronAPI.addLibraryMockup({
        filePath: filePath,
        category: category
      });

      if (result) {
        this.loadLibraryData();
      }
    }
  }

  // --- Cloud Store / Sync Logic ---
  async openCloudStore() {
    this._inCloudMode = true;

    // 1. UI Updates — deselect sidebar
    this.libraryCategories.querySelectorAll('li').forEach(el => {
      el.classList.remove('active');
      const row = el.querySelector('.category-row');
      if (row) row.classList.remove('active');
    });

    // Toggle Header UI
    if (this.cloudFilterGroup) this.cloudFilterGroup.style.display = 'flex';
    if (this.librarySearch) {
      this.librarySearch.placeholder = 'Search cloud mockups...';
      this.librarySearch.value = '';
    }

    // Clear state
    this._cloudFilter = 'all'; // Track active category filter
    this._cloudSearch = '';     // Track active search text
    this._cloudItems = [];      // Cache fetched items for instant filtering
    if (this.librarySearch) this.librarySearch.value = '';
    if (this.libraryCountTag) this.libraryCountTag.textContent = 'Fetching Cloud...';

    // Show loading spinner
    this.libraryGrid.innerHTML = `
      <div style="grid-column: 1 / -1; width: 100%; height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-tertiary);">
        <div class="spinner" style="border-color: rgba(0,0,0,0.1); border-top-color: var(--accent-color); margin-bottom: 20px;"></div>
        <p style="margin: 0; font-weight: 500;">Connecting to Raven Cloud...</p>
      </div>
    `;

    try {
      // 2. Fetch Manifest (cache-busted)
      const manifestUrl = `https://raw.githubusercontent.com/ArhamAshfaqft/RavenMockup-Cloud/main/mockups.json?t=${Date.now()}`;
      const cloudData = await window.electronAPI.fetchCloudManifest(manifestUrl);

      if (!cloudData || cloudData.error) {
        throw new Error(cloudData?.error || 'Empty response from Cloud');
      }
      if (!Array.isArray(cloudData)) {
        throw new Error('Invalid manifest format');
      }

      // 3. Compare with Local Library
      const localFiles = this.getAllMockups(this.libraryData);
      const localFileNames = new Set(localFiles.map(f => f.name.toLowerCase()));

      this._cloudItems = cloudData.filter(item => {
        if (!item || !item.file) return false;
        const filename = item.file.split('/').pop().split('?')[0].toLowerCase();
        return !localFileNames.has(filename);
      });

      this.renderCloudGrid();

    } catch (err) {
      console.error("Cloud Store Error:", err);
      this.libraryGrid.innerHTML = `
        <div style="grid-column: 1 / -1; width: 100%; height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-tertiary);">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 15px; color: #ff3b30;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <p style="font-weight: 500;">Failed to connect to Cloud Store.</p>
          <p style="font-size: 12px; margin-top: 5px; max-width: 400px; text-align: center; color: var(--text-tertiary);">${err.message}</p>
          <button class="btn btn-secondary" onclick="window.mockupApp.openCloudStore()" style="margin-top: 20px;">Try Again</button>
        </div>
      `;
      if (this.libraryCountTag) this.libraryCountTag.textContent = 'Error';
    }
  }

  renderCloudGrid() {
    const allItems = this._cloudItems || [];
    const activeFilter = this._cloudFilter || 'all';
    this._cloudSearch = (this._cloudSearch || '').toLowerCase();

    // Clear loading spinner if present before first render
    if (this.libraryGrid.querySelector('.spinner')) {
      this.libraryGrid.innerHTML = '';
    }

    // ── Filter items ──────────────────────────────
    let filtered = allItems;
    
    // Category Filter
    if (activeFilter !== 'all') {
      filtered = filtered.filter(item => (item.category || 'Uncategorized') === activeFilter);
    }
    
    // Search Filter
    if (this._cloudSearch) {
      filtered = filtered.filter(item => {
        const filename = item.file.split('/').pop().split('?')[0].toLowerCase();
        const proName = (item.name || filename).replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").toLowerCase();
        return proName.includes(this._cloudSearch) || (item.category || '').toLowerCase().includes(this._cloudSearch);
      });
    }

    // ── Header UI Sync ──────────────────────────────
    if (this.cloudFilterSelect) {
      const categories = [...new Set(allItems.map(item => item.category || 'Uncategorized'))].sort();
      
      // Only rebuild if options changed or it's empty to avoid jitter
      if (this.cloudFilterSelect.options.length <= 1 || categories.length !== (this.cloudFilterSelect.options.length - 1)) {
        this.cloudFilterSelect.innerHTML = '';
        const allOpt = document.createElement('option');
        allOpt.value = 'all';
        allOpt.textContent = `All (${allItems.length})`;
        allOpt.selected = activeFilter === 'all';
        this.cloudFilterSelect.appendChild(allOpt);

        categories.forEach(cat => {
          const count = allItems.filter(i => (i.category || 'Uncategorized') === cat).length;
          const opt = document.createElement('option');
          opt.value = cat;
          opt.textContent = `${cat} (${count})`;
          opt.selected = activeFilter === cat;
          this.cloudFilterSelect.appendChild(opt);
        });

        // Add listener once
        if (!this.cloudFilterSelect.hasListener) {
          this.cloudFilterSelect.addEventListener('change', (e) => {
            this._cloudFilter = e.target.value;
            this.renderCloudGrid();
          });
          this.cloudFilterSelect.hasListener = true;
        }
      }
    }

    // ── Grid Container ────────────────────────
    let cardsContainer = this.libraryGrid.querySelector('#cloud-cards-grid');
    if (!cardsContainer) {
      this.libraryGrid.innerHTML = ''; // Full reset if transitioning
      cardsContainer = document.createElement('div');
      cardsContainer.id = 'cloud-cards-grid';
      cardsContainer.style.cssText = 'grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; width: 100%; padding: 20px 0;';
      this.libraryGrid.appendChild(cardsContainer);
    }
    cardsContainer.innerHTML = '';

    // Update count
    if (this.libraryCountTag) {
      this.libraryCountTag.textContent = `${filtered.length} mockups`;
    }

    // ── Empty State ──────────────────────────────────
    if (filtered.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.style.cssText = 'grid-column: 1 / -1; width: 100%; height: 250px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-tertiary);';
      if (allItems.length === 0) {
        emptyEl.innerHTML = `
          <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(52, 199, 89, 0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34c759" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <p style="font-size: 16px; font-weight: 500; color: var(--text-primary); margin: 0 0 5px 0;">You're all caught up!</p>
          <p style="margin: 0;">You have all the latest mockups installed.</p>
        `;
      } else {
        emptyEl.innerHTML = `<p>No search results for "${this._cloudSearch}" in "${activeFilter}".</p>`;
      }
      cardsContainer.appendChild(emptyEl);
      return;
    }

    // ── Render Cards ─────────────────────────────────
    const cacheBuster = Date.now();
    filtered.forEach(item => {
      const el = document.createElement('div');
      el.className = 'cloud-card';

      const filename = item.file.split('/').pop().split('?')[0];
      let previewUrl = item.thumb || item.file;
      let imgSrc = previewUrl.startsWith('http') ? previewUrl : `file:///${previewUrl.replace(/\\/g, '/')}`;
      if (imgSrc.startsWith('http')) {
        imgSrc += (imgSrc.includes('?') ? '&' : '?') + `t=${cacheBuster}`;
      }

      const rawName = (item.name || filename).replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      const proName = rawName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      const catLabel = item.category || 'Uncategorized';

      el.innerHTML = `
        <div class="cloud-preview">
          <img src="${imgSrc}" loading="lazy" onerror="this.src=''; this.style.background='var(--border-light)';">
          <div class="cloud-badge cloud-badge-new">NEW</div>
        </div>
        <div class="cloud-content">
          <div class="cloud-category">${catLabel}</div>
          <div class="cloud-title" title="${proName}">${proName}</div>
          <button class="btn btn-primary btn-download-cloud">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Download
          </button>
        </div>
      `;

      // Download Click Logic
      const btnObj = el.querySelector('.btn-download-cloud');
      btnObj.addEventListener('click', async (e) => {
        e.stopPropagation();
        btnObj.innerHTML = `<div class="spinner" style="width: 14px; height: 14px; border-width: 2px; border-top-color: white;"></div> Downloading...`;
        btnObj.disabled = true;

        try {
          const result = await window.electronAPI.downloadCloudMockup(item.file, item.category || 'T-Shirts', filename);

          if (result && result.success) {
            btnObj.style.background = 'var(--text-tertiary)';
            btnObj.innerText = 'Installed';
            btnObj.style.pointerEvents = 'none';

            // Remove from cached list so it doesn't appear on next filter
            this._cloudItems = this._cloudItems.filter(i => i.file !== item.file);

            // Reload local library (auto-discovers new category folders)
            setTimeout(() => {
              this.loadLibraryData().then(() => {
                const allTab = this.libraryCategories.querySelector('li[data-cat="all"]');
                if (allTab) {
                  const row = allTab.querySelector('.category-row');
                  if (row) row.click();
                }
              });
            }, 1000);
          } else {
            throw new Error(result?.error || 'Download failed');
          }
        } catch (downloadErr) {
          console.error("Download Failed:", downloadErr);
          btnObj.innerHTML = 'Retry';
          btnObj.style.background = '#ff3b30';
          btnObj.disabled = false;
        }
      });

      cardsContainer.appendChild(el);
    });
  }

  // ========================================================
  //  Gumroad License Verification
  // ========================================================
  async checkLicense() {
    try {
      // First, get the saved key from the local store
      const savedKey = await window.electronAPI.getSavedLicense();

      // If NO key is found at all, show the modal immediately
      if (!savedKey) {
        this.licenseModal.style.display = 'flex';
        this.setupLicenseListener();
        return;
      }

      // If a key IS found, verify it silently in the background
      const result = await window.electronAPI.verifyLicense(savedKey);
      
      // If verification fails (and it's NOT just a network timeout), show the modal
      if (!result.success && result.error !== 'Network error verifying license.') {
        this.licenseModal.style.display = 'flex';
      }
      
      // Always bind the listener so they can change keys in the future from within the modal
      this.setupLicenseListener();
    } catch (err) {
      console.error("License check err:", err);
      // In case of a major crash, show the modal as a fallback
      this.licenseModal.style.display = 'flex';
    }
  }

  setupLicenseListener() {
    if (this._licenseListenerBound) return;
    this._licenseListenerBound = true;

    this.btnActivateLicense.addEventListener('click', async () => {
      const key = this.inputLicenseKey.value.trim();
      if (!key) return;

      this.btnActivateLicense.disabled = true;
      this.btnActivateLicense.textContent = 'Verifying...';
      this.licenseErrorMessage.style.display = 'none';

      const result = await window.electronAPI.verifyLicense(key);

      if (result.success) {
        this.licenseModal.style.display = 'none';
        this.btnActivateLicense.textContent = 'Activate License';
      } else {
        this.licenseErrorMessage.textContent = result.error || 'Invalid License Key.';
        this.licenseErrorMessage.style.display = 'block';
        this.btnActivateLicense.disabled = false;
        this.btnActivateLicense.textContent = 'Activate License';
      }
    });

    // Press Enter to submit
    this.inputLicenseKey.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.btnActivateLicense.click();
      }
    });
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  window.mockupApp = new RavenMockupStudio();
});
