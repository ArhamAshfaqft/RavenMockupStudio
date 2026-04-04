const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectMockupFile: () => ipcRenderer.invoke('select-mockup-file'),
  selectSampleDesignFile: () => ipcRenderer.invoke('select-sample-design-file'),
  getDroppedFilePath: (path) => ipcRenderer.invoke('get-dropped-file-path', path),
  scanFolder: (path) => ipcRenderer.invoke('scan-folder', path),
  scanLibrary: (linkedFolders) => ipcRenderer.invoke('scan-library', linkedFolders),
  saveToLibrary: (data) => ipcRenderer.invoke('save-to-library', data),
  selectInputFolder: () => ipcRenderer.invoke('select-input-folder'),
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  loadDesignFile: (filePath) => ipcRenderer.invoke('load-design-file', filePath),
  saveRenderedImage: (data) => ipcRenderer.invoke('save-rendered-image', data),
  createLibraryCategory: (name) => ipcRenderer.invoke('create-library-category', name),
  addLibraryMockup: (data) => ipcRenderer.invoke('add-library-mockup', data),
  deleteLibraryCategory: (name) => ipcRenderer.invoke('delete-library-category', name),
  deleteLibraryMockup: (filePath) => ipcRenderer.invoke('delete-library-mockup', filePath), // NEW
  openPathFolder: (path) => ipcRenderer.invoke('open-path-folder', path),
  getThumbnail: (filePath) => ipcRenderer.invoke('get-thumbnail', filePath),
  
  // Cloud Library
  fetchCloudManifest: (url) => ipcRenderer.invoke('fetch-cloud-manifest', url),
  downloadCloudMockup: (url, category, filename) => ipcRenderer.invoke('download-cloud-mockup', url, category, filename),

  // Gumroad Licensing
  verifyLicense: (key) => ipcRenderer.invoke('verify-license', key),
  getSavedLicense: () => ipcRenderer.invoke('get-saved-license'),

  // Auto-Updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  startDownload: () => ipcRenderer.invoke('start-download'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, data) => callback(data)),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, data) => callback(data)),

  // Utils
  pathJoin: (...args) => ipcRenderer.invoke('path-join', ...args),
  isWindows: process.platform === 'win32' // NEW: Expose platform for path separator logic
});
