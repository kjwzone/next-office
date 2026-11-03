// 앱 주소의 경로를 로컬 파일로 바꾸고 형식을 정하는 모듈
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const ROUTES = [
  ['/renderer/', path.join(ROOT, 'src', 'renderer')],
  ['/studio/', path.join(ROOT, 'build', 'studio')],
  ['/sdk/', path.join(ROOT, 'build', 'sdk')],
];
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.hwpx': 'application/octet-stream',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.md': 'text/plain; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function resolveAssetPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded === '/') decoded = '/renderer/index.html';
  for (const [prefix, directory] of ROUTES) {
    if (!decoded.startsWith(prefix)) continue;
    const resolved = path.resolve(directory, `.${decoded.slice(prefix.length - 1)}`);
    return resolved.startsWith(directory + path.sep) ? resolved : null;
  }
  return null;
}

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

module.exports = { getMimeType, resolveAssetPath };
