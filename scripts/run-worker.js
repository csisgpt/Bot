const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const cwd = process.cwd();
const candidates = [
  path.join(cwd, 'dist', 'apps', 'worker', 'main.js'),
  path.join(cwd, 'dist', 'apps', 'worker', 'src', 'main.js'),
  path.join(cwd, 'dist', 'apps', 'worker', 'apps', 'worker', 'src', 'main.js'),
];

const exists = (filePath) => {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const findEntry = () => {
  for (const candidate of candidates) {
    if (exists(candidate)) {
      return candidate;
    }
  }

  const distRoot = path.join(cwd, 'dist');
  if (!exists(distRoot)) {
    return null;
  }

  const stack = [{ dir: distRoot, depth: 0 }];
  const maxDepth = 7;

  while (stack.length) {
    const { dir, depth } = stack.pop();
    if (depth > maxDepth) {
      continue;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push({ dir: fullPath, depth: depth + 1 });
      } else if (entry.isFile() && entry.name === 'main.js') {
        if (fullPath.includes(`${path.sep}apps${path.sep}worker${path.sep}`)) {
          return fullPath;
        }
      }
    }
  }
  return null;
};

const entry = findEntry();
if (!entry) {
  console.error('Could not find worker entrypoint in dist/.');
  process.exit(1);
}

const child = spawn('node', [entry], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
