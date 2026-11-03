// HWPX 형식 확인과 원본을 보호하는 파일 쓰기를 맡는 모듈
const fs = require('node:fs/promises');
const path = require('node:path');

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

function isHwpxBytes(bytes) {
  return bytes.length >= ZIP_SIGNATURE.length && ZIP_SIGNATURE.every((value, index) => bytes[index] === value);
}

function ensureHwpxExtension(filePath) {
  return path.extname(filePath).toLowerCase() === '.hwpx' ? filePath : `${filePath}.hwpx`;
}

// 끝까지 쓴 임시 파일을 옮겨 쓰므로, 실패해도 기존 파일은 그대로 남는다.
async function writeFileAtomic(filePath, bytes) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tempPath, bytes);
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// 이번 실행에서 처음 덮어쓰는 파일이면 먼저 .bak을 남긴다. 복사에 실패하면 저장도 하지 않는다.
async function saveHwpx(filePath, bytes, backedUpPaths) {
  if (!isHwpxBytes(bytes)) throw new Error('저장할 내용이 HWPX 형식이 아닙니다. 파일을 쓰지 않았습니다.');
  if (!backedUpPaths.has(filePath) && (await pathExists(filePath))) {
    await fs.copyFile(filePath, `${filePath}.bak`);
  }
  await writeFileAtomic(filePath, bytes);
  backedUpPaths.add(filePath);
}

module.exports = { ensureHwpxExtension, isHwpxBytes, saveHwpx, writeFileAtomic };
