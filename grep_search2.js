const fs = require('fs');
const content = fs.readFileSync('d:\\Bulk Mockup\\src\\renderer\\app.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('patch-notes') || line.includes('v1.0.1')) {
        console.log(`${i+1}: ${line.trim()}`);
    }
});
