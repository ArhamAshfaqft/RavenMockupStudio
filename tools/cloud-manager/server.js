const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8080;
const CONFIG_FILE = path.join(__dirname, 'cloud-config.json');

// ── Config ──────────────────────────────────────────────────────
if (!fs.existsSync(CONFIG_FILE)) {
    const defaultRepoPath = path.join(__dirname, '../../RavenMockup-Cloud');
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ repoPath: defaultRepoPath }));
}

function getRepoPath() {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return config.repoPath;
}

function getManifest() {
    const manifestPath = path.join(getRepoPath(), 'mockups.json');
    if (!fs.existsSync(manifestPath)) return [];
    try { return JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch { return []; }
}

function saveManifest(manifest) {
    const manifestPath = path.join(getRepoPath(), 'mockups.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function execPromise(cmd, cwd) {
    return new Promise((resolve) => {
        exec(cmd, { cwd, timeout: 30000 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Command failed: ${cmd}\n${stderr}`);
                resolve({ error: true, output: stderr || error.message });
            } else {
                resolve({ error: false, output: stdout });
            }
        });
    });
}

async function gitSync(repoPath, message) {
    await execPromise('git add .', repoPath);
    await execPromise(`git commit -m "${message}"`, repoPath);
    const pushResult = await execPromise('git push', repoPath);
    if (pushResult.error && pushResult.output.includes('fatal:')) {
        throw new Error(`Git Push Failed: ${pushResult.output}`);
    }
    return pushResult;
}

// ── Helpers ─────────────────────────────────────────────────────
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

function sendJSON(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function sendError(res, message, status = 500) {
    sendJSON(res, { error: message }, status);
}

function serveStatic(res, filePath, contentType) {
    if (fs.existsSync(filePath)) {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(fs.readFileSync(filePath));
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
}

// ── Server ──────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    try {
        // ── Static ──────────────────────────────────────────
        if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
            return serveStatic(res, path.join(__dirname, 'index.html'), 'text/html');
        }

        // ── API: Info ───────────────────────────────────────
        if (req.method === 'GET' && req.url === '/api/info') {
            return sendJSON(res, { repoPath: getRepoPath() });
        }

        // ── API: Set Repo Path ──────────────────────────────
        if (req.method === 'POST' && req.url === '/api/set-repo') {
            const data = await parseBody(req);
            fs.writeFileSync(CONFIG_FILE, JSON.stringify({ repoPath: data.path }));
            return sendJSON(res, { success: true });
        }

        // ── API: List Mockups ───────────────────────────────
        if (req.method === 'GET' && req.url === '/api/mockups') {
            const manifest = getManifest();
            return sendJSON(res, manifest);
        }

        // ── API: List Categories ────────────────────────────
        if (req.method === 'GET' && req.url === '/api/categories') {
            const manifest = getManifest();
            const categories = [...new Set(manifest.map(m => m.category).filter(Boolean))];
            return sendJSON(res, categories);
        }

        // ── API: Upload Mockup ──────────────────────────────
        if (req.method === 'POST' && req.url === '/api/upload') {
            const data = await parseBody(req);
            const repoPath = getRepoPath();
            if (!repoPath || !fs.existsSync(repoPath)) {
                throw new Error("Invalid or missing GitHub Repository Path. Please configure it in Settings.");
            }

            const { name, category, filename, base64, base64Thumb } = data;
            if (!name || !category || !filename || !base64) {
                return sendError(res, "Missing required fields: name, category, filename, base64", 400);
            }

            // Save full-res image
            const imageBuffer = Buffer.from(base64.split(',')[1], 'base64');
            fs.writeFileSync(path.join(repoPath, filename), imageBuffer);

            // Save thumbnail
            let thumbUrl = null;
            if (base64Thumb) {
                const thumbBuffer = Buffer.from(base64Thumb.split(',')[1], 'base64');
                const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;
                const thumbFilename = baseName + '_thumb.jpg';
                fs.writeFileSync(path.join(repoPath, thumbFilename), thumbBuffer);
                thumbUrl = `https://raw.githubusercontent.com/ArhamAshfaqft/RavenMockup-Cloud/main/${encodeURIComponent(thumbFilename)}`;
            }

            // Update manifest
            const manifest = getManifest();
            const rawUrl = `https://raw.githubusercontent.com/ArhamAshfaqft/RavenMockup-Cloud/main/${encodeURIComponent(filename)}`;
            const filtered = manifest.filter(m => m.file !== rawUrl);
            filtered.push({
                name,
                category,
                file: rawUrl,
                ...(thumbUrl && { thumb: thumbUrl }),
                uploadedAt: new Date().toISOString()
            });
            saveManifest(filtered);

            // Git sync
            await gitSync(repoPath, `Published: ${name}`);

            return sendJSON(res, { success: true, message: `Successfully published "${name}" to Cloud!` });
        }

        // ── API: Update Mockup ──────────────────────────────
        if (req.method === 'POST' && req.url === '/api/mockup/update') {
            const data = await parseBody(req);
            const { file, newName, newCategory } = data;
            if (!file) return sendError(res, "Missing 'file' identifier", 400);

            const manifest = getManifest();
            const item = manifest.find(m => m.file === file);
            if (!item) return sendError(res, "Mockup not found in manifest", 404);

            if (newName) item.name = newName;
            if (newCategory) item.category = newCategory;
            saveManifest(manifest);

            const repoPath = getRepoPath();
            await gitSync(repoPath, `Updated: ${item.name}`);

            return sendJSON(res, { success: true, message: `Updated "${item.name}"` });
        }

        // ── API: Delete Mockup ──────────────────────────────
        if (req.method === 'POST' && req.url === '/api/mockup/delete') {
            const data = await parseBody(req);
            const { file } = data;
            if (!file) return sendError(res, "Missing 'file' identifier", 400);

            const repoPath = getRepoPath();
            const manifest = getManifest();
            const item = manifest.find(m => m.file === file);
            if (!item) return sendError(res, "Mockup not found in manifest", 404);

            // Delete files from disk
            const filename = decodeURIComponent(item.file.split('/').pop());
            const filePath = path.join(repoPath, filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

            // Delete thumbnail
            if (item.thumb) {
                const thumbFilename = decodeURIComponent(item.thumb.split('/').pop());
                const thumbPath = path.join(repoPath, thumbFilename);
                if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
            }

            // Remove from manifest
            const newManifest = manifest.filter(m => m.file !== file);
            saveManifest(newManifest);

            // Git sync
            await gitSync(repoPath, `Deleted: ${item.name}`);

            return sendJSON(res, { success: true, message: `Deleted "${item.name}"` });
        }

        // ── API: Regenerate Thumbnails ─────────────────────
        if (req.method === 'POST' && req.url === '/api/maintenance/regen-thumbs') {
            const repoPath = getRepoPath();
            const manifest = getManifest();
            let count = 0;

            // We need canvas to generate thumbs on server, but let's just 
            // use a client-assisted approach or simple FS check.
            // Actually, we can return the items missing thumbs and let the client
            // generate them and send them back. This is safer than installing 'canvas' npm.
            const missing = manifest.filter(m => !m.thumb).map(m => ({
                name: m.name,
                file: m.file,
                localPath: path.join(repoPath, decodeURIComponent(m.file.split('/').pop()))
            }));

            return sendJSON(res, { missing });
        }

        // ── API: Save Generated Thumb ──────────────────────
        if (req.method === 'POST' && req.url === '/api/maintenance/save-thumb') {
            const data = await parseBody(req);
            const { file, base64Thumb } = data;
            const repoPath = getRepoPath();
            const manifest = getManifest();
            const item = manifest.find(m => m.file === file);

            if (item && base64Thumb) {
                const thumbBuffer = Buffer.from(base64Thumb.split(',')[1], 'base64');
                const filename = decodeURIComponent(file.split('/').pop());
                const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;
                const thumbFilename = baseName + '_thumb.jpg';
                fs.writeFileSync(path.join(repoPath, thumbFilename), thumbBuffer);
                
                item.thumb = `https://raw.githubusercontent.com/ArhamAshfaqft/RavenMockup-Cloud/main/${encodeURIComponent(thumbFilename)}`;
                saveManifest(manifest);
                return sendJSON(res, { success: true });
            }
            return sendError(res, "Invalid data", 400);
        }

        // ── 404 ─────────────────────────────────────────────
        res.writeHead(404);
        res.end('Not found');

    } catch (err) {
        console.error("Server Error:", err);
        sendError(res, err.message);
    }
});

server.listen(PORT, () => {
    console.log(`\n==============================================`);
    console.log(`☁️  Raven Mockups Cloud Manager started!`);
    console.log(`➡️  Open http://localhost:${PORT} in your browser`);
    console.log(`==============================================\n`);

    const startCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${startCmd} http://localhost:${PORT}`);
});
