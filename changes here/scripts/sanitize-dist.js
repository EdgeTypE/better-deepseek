import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetArg = process.argv.find(arg => arg.startsWith('--target='));
const target = targetArg ? targetArg.split('=')[1] : 'chrome';
const distDir = path.resolve(__dirname, `../dist-${target}`);

const files = ['content.js', 'background.js', 'injected.js', 'manifest.json'];

console.log('--- Starting ASCII Sanitization ---');

files.forEach(fileName => {
  const filePath = path.join(distDir, fileName);
  if (fs.existsSync(filePath)) {
    const buf = fs.readFileSync(filePath);
    let hasNonAscii = false;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] > 127) {
        hasNonAscii = true;
        break;
      }
    }

    if (!hasNonAscii) {
      console.log(`OK: ${fileName} is already pure ASCII.`);
      return;
    }

    console.log(`Processing ${fileName} to escape non-ASCII characters...`);
    const content = buf.toString('utf8');
    
    // Replace all non-ASCII with \uXXXX
    const sanitized = content.replace(/[^\x00-\x7F]/g, char => {
      const code = char.charCodeAt(0).toString(16).padStart(4, '0');
      return `\\u${code}`;
    });

    fs.writeFileSync(filePath, sanitized, 'utf8');
    console.log(`DONE: ${fileName} sanitization complete.`);
  } else {
    console.log(`SKIP: ${fileName} not found.`);
  }
});

console.log('--- Sanitization Finished ---');
