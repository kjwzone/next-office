// 새 문서의 시작점인 빈 A4 HWPX를 엔진으로 만들어 저장하는 스크립트
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE_DIR = join(ROOT, 'vendor', 'rhwp-core');
const { default: init, HwpDocument } = await import(pathToFileURL(join(CORE_DIR, 'rhwp.js')).href);
await init({ module_or_path: readFileSync(join(CORE_DIR, 'rhwp_bg.wasm')) });

const doc = HwpDocument.createEmpty();
doc.createBlankDocument();
const bytes = doc.exportHwpx();
doc.free();

const out = join(ROOT, 'src', 'renderer', 'assets', 'blank.hwpx');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log(`${out} (${bytes.length} 바이트)`);
