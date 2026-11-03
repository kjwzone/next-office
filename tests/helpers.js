// 실제 Electron 창을 띄우고 편집기를 조작하는 테스트 도우미
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { _electron: electron } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const CORE_DIR = path.join(ROOT, 'vendor', 'rhwp-core');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'next-office-test-'));
}

async function launchApp() {
  const userDataDir = makeTempDir();
  const app = await electron.launch({
    args: [ROOT, `--user-data-dir=${userDataDir}`],
    executablePath: require('electron'),
  });
  const page = await app.firstWindow();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.waitForSelector('html[data-ready="true"]', { timeout: 60000 });
  const frame = page.frames().find((candidate) => candidate.url().includes('/studio/'));
  return { app, page, frame, userDataDir, consoleErrors };
}

// 닫기 확인을 건너뛰고 앱을 끝낸다.
async function closeApp({ app, userDataDir }) {
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
  });
  await app.close().catch(() => {});
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

async function clickDocument({ frame, page }) {
  const canvas = frame.locator('#scroll-container canvas').first();
  await canvas.waitFor({ timeout: 30000 });
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + 150);
}

// 다음에 뜨는 파일 대화상자가 고를 경로를 정한다.
async function mockSaveDialog(app, filePath) {
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, filePath);
}

async function mockOpenDialog(app, filePath) {
  await app.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  }, filePath);
}

async function mockUnsavedChoice(app, buttonIndex) {
  await app.evaluate(({ dialog }, response) => {
    globalThis.unsavedPromptCount = 0;
    dialog.showMessageBox = async () => {
      globalThis.unsavedPromptCount += 1;
      return { response };
    };
  }, buttonIndex);
}

async function waitForFile(filePath) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (fs.existsSync(filePath)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${filePath}이(가) 만들어지지 않았다.`);
}

async function loadEngine() {
  const { default: init, HwpDocument } = await import(pathToFileURL(path.join(CORE_DIR, 'rhwp.js')).href);
  await init({ module_or_path: fs.readFileSync(path.join(CORE_DIR, 'rhwp_bg.wasm')) });
  return HwpDocument;
}

function readParagraphs(HwpDocument, filePath) {
  const doc = new HwpDocument(fs.readFileSync(filePath));
  const paragraphs = [];
  for (let index = 0; index < doc.getParagraphCount(0); index += 1) {
    paragraphs.push(doc.getTextRange(0, index, 0, doc.getParagraphLength(0, index)));
  }
  doc.free();
  return paragraphs;
}

module.exports = {
  ROOT,
  clickDocument,
  closeApp,
  launchApp,
  loadEngine,
  makeTempDir,
  mockOpenDialog,
  mockSaveDialog,
  mockUnsavedChoice,
  readParagraphs,
  waitForFile,
};
