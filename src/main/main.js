const { app, BrowserWindow, ipcMain, dialog, shell, protocol, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

let store;
const GUMROAD_PERMALINK = 'rpmm'; // Change this to your actual Gumroad product permalink

// --- Auto-Updater Config ---
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f5f5f7',
    show: false,
    icon: path.join(__dirname, '../../assets/icon_safe.png')
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // --- Auto-Updater Events ---
  autoUpdater.on('checking-for-update', () => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'checking', message: 'Checking for updates...' });
  });

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'available', message: `Version ${info.version} available!`, version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'not-available', message: 'You are already on the latest version.' });
  });

  autoUpdater.on('error', (err) => {
    console.error('AutoUpdater Error:', err);
    // Treat network/missing-file errors as "No updates" to avoid scaring user
    if (mainWindow) mainWindow.webContents.send('update-status', {
      status: 'not-available',
      message: 'No new updates available.'
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow) mainWindow.webContents.send('download-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloaded', message: 'Update downloaded. Ready to install.' });
  });
}

app.whenReady().then(async () => {
  const Store = (await import('electron-store')).default;
  store = new Store();

  // Register custom protocol for local files
  protocol.registerFileProtocol('safe-file', (request, callback) => {
    const url = request.url.replace('safe-file://', '');
    try {
      return callback(decodeURIComponent(url));
    } catch (error) {
      console.error(error);
      return callback(404);
    }
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC Handlers ---

// Auto-Updater Handlers
ipcMain.handle('check-for-updates', () => {
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { status: 'checking', message: 'Checking (Dev Mode)...' });
      setTimeout(() => {
        mainWindow.webContents.send('update-status', {
          status: 'not-available',
          message: 'Auto-Update is disabled in Development Mode. Please test in installed app.'
        });
      }, 1000);
    }
    return;
  }

  try {
    autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    console.error("Update Check Failed:", err);
    // Treat error as "No updates" for better UX
    if (mainWindow) mainWindow.webContents.send('update-status', {
      status: 'not-available',
      message: 'No new updates available.'
    });
  }
});

ipcMain.handle('start-download', () => {
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    if (mainWindow) {
      // Simulate Download Progress
      let percent = 0;
      const interval = setInterval(() => {
        percent += 10;
        if (percent > 100) {
          clearInterval(interval);
          mainWindow.webContents.send('update-status', {
            status: 'downloaded',
            message: 'Update downloaded. Ready to install.'
          });
        } else {
          mainWindow.webContents.send('download-progress', { percent: percent });
        }
      }, 500);
    }
    return;
  }
  autoUpdater.downloadUpdate();
});

ipcMain.handle('quit-and-install', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('get-thumbnail', async (event, filePath) => {
  try {
    const normalizedPath = path.normalize(filePath);
    const thumb = await nativeImage.createThumbnailFromPath(normalizedPath, { width: 400, height: 400 });
    return thumb.toDataURL();
  } catch (err) {
    console.error('Error generating thumbnail:', err);
    return null;
  }
});

// --- Gumroad Licensing Handlers ---
ipcMain.handle('get-saved-license', () => {
  if (!app.isPackaged) return 'dev-license';
  return store.get('gumroad_license_key') || null;
});

ipcMain.handle('verify-license', async (event, key) => {
  if (!app.isPackaged) {
    return { success: true, message: 'Dev Mode: License bypass active.' };
  }
  try {
    const https = require('https');
    const postData = JSON.stringify({
      product_permalink: GUMROAD_PERMALINK,
      license_key: key
    });

    const options = {
      hostname: 'api.gumroad.com',
      path: '/v2/licenses/verify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.success) {
              // Valid key
              store.set('gumroad_license_key', key);
              if (result.uses !== undefined) store.set('gumroad_uses', result.uses);
              resolve({ success: true, message: 'License verified successfully!' });
            } else {
              // Invalid key or expired
              resolve({ success: false, error: result.message || 'Invalid license key.' });
            }
          } catch (e) {
            resolve({ success: false, error: 'Failed to parse Gumroad API response.' });
          }
        });
      });

      req.on('error', (e) => {
        resolve({ success: false, error: 'Network error verifying license.' });
      });

      req.write(postData);
      req.end();
    });

  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- Cloud Library IPC Handlers ---
ipcMain.handle('fetch-cloud-manifest', async (event, url) => {
  try {
    if (url.startsWith('file://')) {
      const fs = require('fs');
      let filePath = decodeURI(new URL(url).pathname);
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.substring(1);
      }
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
    
    const httpModule = url.startsWith('https') ? require('https') : require('http');
    
    // Parse URL to add cache-busting headers
    const parsedUrl = new URL(url);
    const requestOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      },
      timeout: 10000 // 10 second timeout — prevents app hanging
    };

    return new Promise((resolve) => {
      const req = httpModule.get(requestOptions, (res) => {
        // Handle redirects (GitHub raw sometimes 301s)
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectReq = httpModule.get(res.headers.location, (res2) => {
            let data = '';
            res2.on('data', chunk => data += chunk);
            res2.on('end', () => {
              try { resolve(JSON.parse(data)); } catch (e) { resolve([]); }
            });
          });
          redirectReq.on('error', err => resolve({ error: err.message }));
          redirectReq.on('timeout', () => { redirectReq.destroy(); resolve({ error: 'Connection timed out (redirect)' }); });
          return;
        }
        if (res.statusCode !== 200) {
          resolve([]);
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { resolve([]); }
        });
      });
      req.on('error', err => resolve({ error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ error: 'Connection timed out. Please check your internet.' }); });
    });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('download-cloud-mockup', async (event, url, category, filename) => {
  try {
    const https = require('https');
    const fs = require('fs');
    
    // Ensure category folder exists in the correct local portable Library path
    const basePath = app.isPackaged ? path.dirname(app.getPath('exe')) : path.resolve('.');
    const categoryPath = path.join(basePath, 'Library', category);
    if (!fs.existsSync(categoryPath)) {
      fs.mkdirSync(categoryPath, { recursive: true });
    }
    
    const savePath = path.join(categoryPath, filename);
    const file = fs.createWriteStream(savePath);
    
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (res.statusCode !== 200) {
          resolve({ success: false, error: `Failed to download: ${res.statusCode}` });
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve({ success: true, path: savePath });
        });
      }).on('error', (err) => {
        fs.unlink(savePath, () => {});
        resolve({ success: false, error: err.message });
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Existing Handlers
ipcMain.handle('select-mockup-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif'] }]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mimeType = ext === 'jpg' ? 'jpeg' : ext;
    return {
      path: filePath,
      name: path.basename(filePath),
      data: `data:image/${mimeType};base64,${data.toString('base64')}`
    };
  }
  return null;
});

ipcMain.handle('select-sample-design-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif'] }]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mimeType = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mimeType};base64,${data.toString('base64')}`;
  }
  return null;
});

ipcMain.handle('get-dropped-file-path', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      path: filePath,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      name: path.basename(filePath)
    };
  } catch (e) {
    return null;
  }
});

ipcMain.handle('scan-folder', async (event, folderPath) => {
  try {
    const files = fs.readdirSync(folderPath);
    const imageFiles = files
      .filter(file => /\.(png|jpe?g|webp|avif)$/i.test(file))
      .map(file => path.join(folderPath, file));
    return { path: folderPath, files: imageFiles };
  } catch (err) {
    console.error('Error scanning folder:', err);
    return null;
  }
});

ipcMain.handle('select-input-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0];
    try {
      const files = fs.readdirSync(folderPath);
      const imageFiles = files
        .filter(file => /\.(png|jpe?g)$/i.test(file))
        .map(file => path.join(folderPath, file));
      return { path: folderPath, files: imageFiles };
    } catch (e) {
      console.error("Error scanning selected input folder:", e);
      return { path: folderPath, files: [] };
    }
  }
  return null;
});

ipcMain.handle('select-output-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('load-design-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mimeType = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mimeType};base64,${data.toString('base64')}`;
  } catch (e) {
    console.error("Error loading design file:", e);
    return null;
  }
});

ipcMain.handle('save-rendered-image', async (event, { filePath, dataBase64 }) => {
  try {
    const base64Data = dataBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');

    // Ensure dir exists
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true });
    }

    fs.writeFileSync(filePath, buffer);
    console.log(`Saved: ${filePath}`);
    return true;
  } catch (e) {
    console.error("Error saving image:", e);
    return false;
  }
});

// Library Handlers
ipcMain.handle('scan-library', async (event, linkedFolders = []) => {
  try {
    const basePath = app.isPackaged ? path.dirname(app.getPath('exe')) : path.resolve('.');
    const libraryPath = path.join(basePath, 'Library');

    if (!fs.existsSync(libraryPath)) {
      fs.mkdirSync(libraryPath, { recursive: true });
    }

    const scan = (dir) => {
      const structure = { folders: {}, files: [] };
      if (!fs.existsSync(dir)) return structure;

      const items = fs.readdirSync(dir);
      for (const itemName of items) {
        const fullPath = path.join(dir, itemName);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            const sub = scan(fullPath);
            // Only add folder if it has files OR subfolders with files
            // SPECIAL CASE: Keep 'Mugs' if it's a top-level folder (per user request)
            const hasContent = sub.files.length > 0 || Object.keys(sub.folders).length > 0;
            const isMugs = itemName === 'Mugs' && dir === libraryPath;
            
            if (hasContent || isMugs) {
              structure.folders[itemName] = sub;
            }
          } else if (stat.isFile() && /\.(png|jpe?g|webp|avif)$/i.test(itemName)) {
            structure.files.push({
              name: itemName,
              path: fullPath.replace(/\\/g, '/')
            });
          }
        } catch (e) {
          console.error(`Error scanning ${fullPath}:`, e);
        }
      }
      return structure;
    };

    const fullStructure = scan(libraryPath);

    // Only ensure 'Universal' exists as a fallback
    if (!fullStructure.folders['Universal']) {
      const uniPath = path.join(libraryPath, 'Universal');
      if (!fs.existsSync(uniPath)) fs.mkdirSync(uniPath, { recursive: true });
      fullStructure.folders['Universal'] = { folders: {}, files: [] };
    }

    // Process Linked Folders
    if (Array.isArray(linkedFolders)) {
      for (const linkedPath of linkedFolders) {
        try {
          if (!fs.existsSync(linkedPath)) continue; // skip if deleted/disconnected
          
          const stat = fs.statSync(linkedPath);
          if (!stat.isDirectory()) continue; // skip if it's not a directory
          
          // Scan the linked directory
          const linkedStructure = scan(linkedPath);
          
          let folderName = path.basename(linkedPath);
          
          // Prevent name collision: if two linked dirs share basename, suffix (2), (3)...
          let finalName = folderName + ' (Linked)';
          let counter = 2;
          while (fullStructure.folders[finalName]) {
            finalName = folderName + ' (Linked) (' + counter + ')';
            counter++;
          }
          
          // ALWAYS add linked folders to structure so users get visual confirmation
          fullStructure.folders[finalName] = linkedStructure;

        } catch (linkErr) {
          console.error(`Error scanning linked folder ${linkedPath}:`, linkErr);
          // Skip this linked folder gracefully — don't crash the entire library scan
        }
      }
    }

    return { 
      rootPath: libraryPath.replace(/\\/g, '/'), 
      structure: fullStructure.folders 
    };
  } catch (err) {
    console.error('CRITICAL Library Scan Error:', err);
    return { structure: {} };
  }
});

ipcMain.handle('save-to-library', async (event, { category, filePath }) => {
  const basePath = app.isPackaged ? path.dirname(app.getPath('exe')) : path.resolve('.');
  const libraryPath = path.join(basePath, 'Library');
  const catPath = path.join(libraryPath, category);

  if (!fs.existsSync(catPath)) {
    fs.mkdirSync(catPath);
  }

  const fileName = path.basename(filePath);
  const destPath = path.join(catPath, fileName);

  fs.copyFileSync(filePath, destPath);
  return destPath;
});

ipcMain.handle('create-library-category', async (event, name) => {
  const libraryPath = path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : '.', 'Library');
  const catPath = path.join(libraryPath, name);
  if (!fs.existsSync(catPath)) {
    fs.mkdirSync(catPath);
    return true;
  }
  return false;
});

ipcMain.handle('delete-library-category', async (event, name) => {
  const libraryPath = path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : '.', 'Library');
  const catPath = path.join(libraryPath, name);
  if (fs.existsSync(catPath)) {
    fs.rmdirSync(catPath, { recursive: true });
    return true;
  }
  return false;
});

ipcMain.handle('add-library-mockup', async (event, { category, filePath }) => {
  const libraryPath = path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : '.', 'Library');
  const catPath = path.join(libraryPath, category);
  if (!fs.existsSync(catPath)) return false;

  const dest = path.join(catPath, path.basename(filePath));
  fs.copyFileSync(filePath, dest);
  return true;
});

ipcMain.handle('open-path-folder', async (event, folderPath) => {
  try {
    const error = await shell.openPath(folderPath);
    return error ? false : true;
  } catch (err) {
    console.error('Error opening folder:', err);
    return false;
  }
});

ipcMain.handle('path-join', (event, ...args) => {
  return path.join(...args);
});

ipcMain.handle('delete-library-mockup', async (event, filePath) => {
  try {
    // shell.trashItem allows "Moving to Recycle Bin" which is safer and less prone to EBUSY locks
    await shell.trashItem(filePath);
    return true;
  } catch (err) {
    console.error('Error deleting mockup:', err);
    // Fallback: If trash fails, try force unlink
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
    } catch (err2) {
      console.error('Fallback verify failed:', err2);
    }
    return false;
  }
});
