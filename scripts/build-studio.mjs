// rhwp-studio를 고정 태그에서 빌드하고 SDK와 함께 build 폴더에 넣는 스크립트
// 이음오피스 apps/hwp/scripts/build-studio.mjs를 줄여 고쳤다. studio 패치와 앱 플러그인은 뺐다.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE_DIR = join(ROOT, 'vendor', 'rhwp-core');
const CORE = JSON.parse(readFileSync(join(CORE_DIR, 'package.json'), 'utf8'));

const REPO = 'https://github.com/edwardkim/rhwp.git';
const TAG = CORE.rhwp.tag;
const PINNED_COMMIT = CORE.rhwp.commit;
// 저장소의 대용량 견본과 라이선스가 섞인 글꼴 묶음은 받지 않는다.
const SPARSE_PATTERNS = [
  '/LICENSE',
  '/THIRD_PARTY_LICENSES.md',
  '/rhwp-studio/index.html',
  '/rhwp-studio/src/',
  '/rhwp-studio/public/',
  '!/rhwp-studio/public/fonts',
  '!/rhwp-studio/public/samples',
  '/npm/hwpctrl-ocx/src/',
];

const CACHE = join(ROOT, 'node_modules', '.cache', 'rhwp-studio', TAG);
const STUDIO_OUT = join(ROOT, 'build', 'studio');
const SDK_OUT = join(ROOT, 'build', 'sdk');
const SDK_DIR = join(ROOT, 'node_modules', '@rhwp', 'editor');
const SDK_FILES = ['index.js', 'transport.js', 'document-agent-contract.js'];
const STAMP = join(ROOT, 'build', '.stamp');

function runGit(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
}

function computeStamp() {
  const hash = createHash('sha256');
  hash.update(TAG);
  hash.update(readFileSync(fileURLToPath(import.meta.url)));
  hash.update(readFileSync(join(CORE_DIR, 'rhwp_bg.wasm')));
  return hash.digest('hex');
}

function fetchSource() {
  if (existsSync(join(CACHE, '.git')) && runGit(['rev-parse', 'HEAD'], CACHE) === PINNED_COMMIT) return;
  rmSync(CACHE, { recursive: true, force: true });
  mkdirSync(dirname(CACHE), { recursive: true });
  console.log(`rhwp-studio: ${TAG}를 받는 중`);
  runGit(['clone', '--depth', '1', '--branch', TAG, '--filter=blob:none', '--no-checkout', REPO, CACHE], dirname(CACHE));
  runGit(['sparse-checkout', 'set', '--no-cone', ...SPARSE_PATTERNS], CACHE);
  runGit(['checkout', '--quiet', TAG], CACHE);
  const head = runGit(['rev-parse', 'HEAD'], CACHE);
  if (head !== PINNED_COMMIT) {
    rmSync(CACHE, { recursive: true, force: true });
    throw new Error(`rhwp-studio: ${TAG}가 ${head}를 가리킨다. 기대한 커밋은 ${PINNED_COMMIT}다.`);
  }
}

async function buildStudio() {
  const studio = join(CACHE, 'rhwp-studio');
  await build({
    configFile: false,
    root: studio,
    base: './',
    logLevel: 'warn',
    define: {
      __APP_VERSION__: JSON.stringify(CORE.version),
      // 앱은 사용자가 시키지 않은 외부 요청을 하지 않는다.
      __RHWP_DISABLE_EXTERNAL_WEBFONTS__: 'true',
      __RHWP_HWPCTRL__: 'false',
    },
    resolve: {
      alias: {
        '@': join(studio, 'src'),
        '@wasm': CORE_DIR,
        '@rhwp/hwpctrl/studio-plugin': join(CACHE, 'npm', 'hwpctrl-ocx', 'src', 'studio-plugin.mjs'),
      },
    },
    build: { outDir: STUDIO_OUT, emptyOutDir: true, chunkSizeWarningLimit: 4096 },
  });
  copyFileSync(join(CACHE, 'LICENSE'), join(STUDIO_OUT, 'LICENSE-rhwp.txt'));
  copyFileSync(join(CACHE, 'THIRD_PARTY_LICENSES.md'), join(STUDIO_OUT, 'THIRD-PARTY-LICENSES-rhwp.md'));
}

function copySdk() {
  rmSync(SDK_OUT, { recursive: true, force: true });
  mkdirSync(SDK_OUT, { recursive: true });
  for (const file of SDK_FILES) copyFileSync(join(SDK_DIR, file), join(SDK_OUT, file));
}

const stamp = computeStamp();
if (existsSync(join(STUDIO_OUT, 'index.html')) && existsSync(STAMP) && readFileSync(STAMP, 'utf8') === stamp) {
  console.log(`rhwp-studio: ${TAG} 빌드가 최신이다`);
} else {
  fetchSource();
  await buildStudio();
  copySdk();
  writeFileSync(STAMP, stamp);
  console.log(`rhwp-studio: ${TAG}를 ${STUDIO_OUT}에 빌드했다`);
}
