// One-time build script: converts the original embeddedAlphaMaps.js to browser format
const fs = require('fs');
const path = require('path');

const srcPath = path.resolve(__dirname, '../../gemini-watermark-remover-main/src/core/embeddedAlphaMaps.js');
const dstPath = path.resolve(__dirname, 'embedded-alpha-maps.js');

let src = fs.readFileSync(srcPath, 'utf8');

// Strip ES module export keyword
src = src.replace(/^export\s+/gm, '');

// Add browser global
src += '\nwindow.getEmbeddedAlphaMap = getEmbeddedAlphaMap;\n';

fs.writeFileSync(dstPath, src);
console.log('Done! Written to:', dstPath);
console.log('File size:', fs.statSync(dstPath).size, 'bytes');
