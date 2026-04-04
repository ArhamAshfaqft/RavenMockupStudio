const fs = require('fs');
const path = require('path');

function getPngResolution(filePath) {
    const buffer = fs.readFileSync(filePath);
    if (buffer.toString('ascii', 1, 4) !== 'PNG') {
        throw new Error('Not a PNG file');
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
}

const filePath = process.argv[2];
try {
    const res = getPngResolution(filePath);
    console.log(`Resolution: ${res.width}x${res.height}`);
} catch (err) {
    console.error(err.message);
}
