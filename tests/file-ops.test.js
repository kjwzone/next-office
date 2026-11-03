// 파일 쓰기 모듈과 앱 주소 경로 변환을 확인하는 단위 테스트
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { resolveAssetPath } = require('../src/main/assets');
const { ensureHwpxExtension, isHwpxBytes, saveHwpx } = require('../src/main/file-ops');
const { makeTempDir } = require('./helpers');

const HWPX_V1 = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1]);
const HWPX_V2 = Buffer.from([0x50, 0x4b, 0x03, 0x04, 2]);
const HWPX_V3 = Buffer.from([0x50, 0x4b, 0x03, 0x04, 3]);

test('isHwpxBytes는 ZIP 머리글만 받아들인다', () => {
  assert.strictEqual(isHwpxBytes(HWPX_V1), true);
  assert.strictEqual(isHwpxBytes(Buffer.from('hello')), false);
  assert.strictEqual(isHwpxBytes(Buffer.alloc(0)), false);
});

test('ensureHwpxExtension은 확장자가 없을 때만 붙인다', () => {
  assert.strictEqual(ensureHwpxExtension('수업안내'), '수업안내.hwpx');
  assert.strictEqual(ensureHwpxExtension('수업안내.HWPX'), '수업안내.HWPX');
});

test('R9: 새 파일 저장은 .bak을 만들지 않는다', async () => {
  const directory = makeTempDir();
  const target = path.join(directory, 'a.hwpx');
  await saveHwpx(target, HWPX_V1, new Set());
  assert.deepStrictEqual(fs.readFileSync(target), HWPX_V1);
  assert.strictEqual(fs.existsSync(`${target}.bak`), false);
});

test('R9: 첫 덮어쓰기에서만 원본을 .bak으로 남긴다', async () => {
  const directory = makeTempDir();
  const target = path.join(directory, 'a.hwpx');
  fs.writeFileSync(target, HWPX_V1);
  const backedUp = new Set();
  await saveHwpx(target, HWPX_V2, backedUp);
  await saveHwpx(target, HWPX_V3, backedUp);
  assert.deepStrictEqual(fs.readFileSync(target), HWPX_V3);
  assert.deepStrictEqual(fs.readFileSync(`${target}.bak`), HWPX_V1);
});

test('R9: HWPX가 아닌 내용은 파일을 건드리지 않고 거절한다', async () => {
  const directory = makeTempDir();
  const target = path.join(directory, 'a.hwpx');
  fs.writeFileSync(target, HWPX_V1);
  await assert.rejects(saveHwpx(target, Buffer.from('broken'), new Set()));
  assert.deepStrictEqual(fs.readFileSync(target), HWPX_V1);
  assert.strictEqual(fs.existsSync(`${target}.bak`), false);
});

test('R9: 쓰기에 실패하면 기존 파일과 임시 파일이 깨끗하게 남는다', async () => {
  const directory = makeTempDir();
  const target = path.join(directory, 'folder.hwpx');
  fs.mkdirSync(target);
  const backedUp = new Set([target]);
  await assert.rejects(saveHwpx(target, HWPX_V1, backedUp));
  assert.strictEqual(fs.statSync(target).isDirectory(), true);
  assert.deepStrictEqual(fs.readdirSync(directory), ['folder.hwpx']);
});

test('resolveAssetPath는 정해진 폴더 밖을 가리키지 못한다', () => {
  assert.match(resolveAssetPath('/'), /index\.html$/);
  assert.match(resolveAssetPath('/studio/index.html'), /build[\\/]studio[\\/]index\.html$/);
  assert.strictEqual(resolveAssetPath('/studio/../../package.json'), null);
  assert.strictEqual(resolveAssetPath('/studio/%2e%2e/%2e%2e/package.json'), null);
  assert.strictEqual(resolveAssetPath('/src/main/main.js'), null);
  assert.strictEqual(resolveAssetPath('/studio/%E0%A4%A'), null);
});
