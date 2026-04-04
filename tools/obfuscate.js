const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');
const distDir = path.join(__dirname, '../build-src');

// Obfuscation options — high security
const options = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: true,
    debugProtectionInterval: 4000,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayEncoding: ['base64'],
    stringArrayIndexesType: ['hexadecimal-number'],
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
};

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function obfuscateFile(filePath, targetPath) {
    console.log(`🔒 Obfuscating: ${path.relative(srcDir, filePath)}`);
    const code = fs.readFileSync(filePath, 'utf8');
    const result = JavaScriptObfuscator.obfuscate(code, options);
    fs.writeFileSync(targetPath, result.getObfuscatedCode());
}

function copyFile(filePath, targetPath) {
    console.log(`📄 Copying: ${path.relative(srcDir, filePath)}`);
    fs.copyFileSync(filePath, targetPath);
}

function processDir(dir, target) {
    ensureDir(target);
    const items = fs.readdirSync(dir);

    for (const item of items) {
        const itemPath = path.join(dir, item);
        const targetPath = path.join(target, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
            processDir(itemPath, targetPath);
        } else if (item.endsWith('.js')) {
            obfuscateFile(itemPath, targetPath);
        } else {
            // Copy CSS, HTML, images as is
            copyFile(itemPath, targetPath);
        }
    }
}

console.log('🚀 Starting Code Obfuscation...');
if (fs.existsSync(distDir)) {
    console.log('🧹 Cleaning old build directory...');
    fs.rmSync(distDir, { recursive: true, force: true });
}

processDir(srcDir, distDir);
console.log('✅ Obfuscation Complete! Files ready in /build-src');
