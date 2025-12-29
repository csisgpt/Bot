const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const skipDirs = new Set(['node_modules', 'dist', '.git']);
const textExtensions = new Set([
  '.ts',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.env',
  '.sh',
  '.txt',
]);

const isTextFile = (filePath) => {
  const base = path.basename(filePath);
  if (base.startsWith('.env')) {
    return true;
  }
  if (base === 'Dockerfile') {
    return true;
  }
  const ext = path.extname(base);
  return textExtensions.has(ext);
};

const replaceContent = (content) => {
  const formFeed = String.fromCharCode(12);
  const escapedSequence = '\\\\u' + '000c';
  return content
    .replace(new RegExp(formFeed, 'g'), '\u200c')
    .replace(new RegExp(escapedSequence, 'g'), '\u200c');
};

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) {
        continue;
      }
      walk(path.join(dir, entry.name));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (!isTextFile(fullPath)) {
      continue;
    }

    const original = fs.readFileSync(fullPath, 'utf8');
    const updated = replaceContent(original);

    if (updated !== original) {
      fs.writeFileSync(fullPath, updated, 'utf8');
      console.log(`Updated: ${path.relative(rootDir, fullPath)}`);
    }
  }
};

walk(rootDir);
