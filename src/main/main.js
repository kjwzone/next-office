// 앱 창, 메뉴, 파일 대화상자, 인쇄를 맡는 Electron 메인 프로세스
const path = require('node:path');
const fs = require('node:fs/promises');
const { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell } = require('electron');
const { getMimeType, resolveAssetPath } = require('./assets');
const { ensureHwpxExtension, isHwpxBytes, saveHwpx } = require('./file-ops');

const APP_NAME = '다음오피스';
const APP_HOST = 'next-office.invalid';
const APP_ORIGIN = `https://${APP_HOST}`;
const HWPX_FILTERS = [{ name: '한글 문서 (HWPX)', extensions: ['hwpx'] }];
// 입력기 상태와 상관없이 잡도록 key가 아니라 code로 비교한다.
const SHORTCUTS = {
  'ctrl+KeyN': 'new',
  'ctrl+KeyO': 'open',
  'ctrl+KeyS': 'save',
  'ctrl+shift+KeyS': 'save-as',
  'ctrl+KeyP': 'print',
  'ctrl+shift+KeyP': 'preview',
};

let mainWindow = null;
let currentPath = null;
let pendingOpenPath = null;
let closeConfirmed = false;
const backedUpPaths = new Set();

async function respondWithAsset(request) {
  const url = new URL(request.url);
  if (url.host !== APP_HOST) return new Response('외부 요청은 허용하지 않습니다.', { status: 403 });
  const filePath = resolveAssetPath(url.pathname);
  if (!filePath) return new Response('잘못된 경로입니다.', { status: 400 });
  try {
    return new Response(await fs.readFile(filePath), { headers: { 'content-type': getMimeType(filePath) } });
  } catch {
    return new Response('파일을 찾을 수 없습니다.', { status: 404 });
  }
}

function denyRequest() {
  return new Response('외부 요청은 허용하지 않습니다.', { status: 403 });
}

function isTrustedSender(event) {
  return event.senderFrame === mainWindow?.webContents.mainFrame && event.senderFrame.url.startsWith(`${APP_ORIGIN}/`);
}

function handleTrusted(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('허용되지 않은 요청입니다.');
    return handler(...args);
  });
}

function sendCommand(command) {
  mainWindow?.webContents.send('shell:command', command);
}

function buildMenu() {
  const fileItem = (label, command, accelerator) => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: () => sendCommand(command),
  });
  return Menu.buildFromTemplate([
    {
      label: '파일',
      submenu: [
        fileItem('새 문서', 'new', 'Ctrl+N'),
        fileItem('열기…', 'open', 'Ctrl+O'),
        { type: 'separator' },
        fileItem('저장', 'save', 'Ctrl+S'),
        fileItem('다른 이름으로 저장…', 'save-as', 'Ctrl+Shift+S'),
        { type: 'separator' },
        fileItem('인쇄 미리보기', 'preview', 'Ctrl+Shift+P'),
        fileItem('인쇄…', 'print', 'Ctrl+P'),
        { type: 'separator' },
        { label: '끝내기', click: () => mainWindow?.close() },
      ],
    },
    {
      label: '서식',
      submenu: [{ label: '글꼴 설정…', click: () => sendCommand('font') }],
    },
    {
      label: '도움말',
      submenu: [{ label: `${APP_NAME} 정보`, click: showAbout }],
    },
  ]);
}

async function showAbout() {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: `${APP_NAME} 정보`,
    message: `${APP_NAME} ${app.getVersion()}`,
    detail:
      '본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.\n\n' +
      '문서 엔진: rhwp (MIT)\n이음오피스·GenOffice의 엔진 패치를 사용합니다 (Apache-2.0).',
    buttons: ['확인', '오픈소스 고지 열기'],
    defaultId: 0,
    cancelId: 0,
  });
  if (response === 1) await shell.openPath(path.join(app.getAppPath(), 'LICENSES'));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    title: APP_NAME,
    backgroundColor: '#24423a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const { webContents } = mainWindow;
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-frame-navigate', (event) => {
    if (!event.url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });
  webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt) return;
    const command = SHORTCUTS[`ctrl+${input.shift ? 'shift+' : ''}${input.code}`];
    if (!command) return;
    event.preventDefault();
    sendCommand(command);
  });
  // 닫기 확인은 앱이 직접 묻는다. 편집기 쪽 beforeunload가 창을 조용히 막지 못하게 한다.
  webContents.on('will-prevent-unload', (event) => event.preventDefault());
  mainWindow.on('close', (event) => {
    if (closeConfirmed) return;
    event.preventDefault();
    webContents.send('shell:close-requested');
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(`${APP_ORIGIN}/`);
}

async function openDocument() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '문서 열기',
    filters: HWPX_FILTERS,
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return { canceled: true };
  const filePath = filePaths[0];
  const bytes = await fs.readFile(filePath);
  if (path.extname(filePath).toLowerCase() !== '.hwpx' || !isHwpxBytes(bytes)) {
    return { error: `${path.basename(filePath)}은(는) HWPX 파일이 아닙니다. HWPX 파일을 고르세요.` };
  }
  pendingOpenPath = filePath;
  return { name: path.basename(filePath), bytes };
}

async function writeTo(filePath, data) {
  try {
    await saveHwpx(filePath, Buffer.from(data), backedUpPaths);
  } catch (error) {
    return { error: `${path.basename(filePath)}을(를) 저장하지 못했습니다. ${error.message}` };
  }
  currentPath = filePath;
  return { name: path.basename(filePath) };
}

async function saveDocumentAs(data) {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '다른 이름으로 저장',
    defaultPath: currentPath ?? '제목 없음.hwpx',
    filters: HWPX_FILTERS,
  });
  if (canceled || !filePath) return { canceled: true };
  return writeTo(ensureHwpxExtension(filePath), data);
}

function registerIpcHandlers() {
  handleTrusted('file:open', openDocument);
  handleTrusted('file:commit-open', () => {
    currentPath = pendingOpenPath;
    pendingOpenPath = null;
    return { name: path.basename(currentPath) };
  });
  handleTrusted('file:new', () => {
    currentPath = null;
    pendingOpenPath = null;
  });
  handleTrusted('file:save', (data) => (currentPath ? writeTo(currentPath, data) : saveDocumentAs(data)));
  handleTrusted('file:save-as', saveDocumentAs);
  handleTrusted('dialog:unsaved', async () => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: APP_NAME,
      message: '저장하지 않은 변경 내용이 있습니다.',
      detail: '저장하지 않으면 변경 내용이 사라집니다.',
      buttons: ['저장', '저장 안 함', '취소'],
      defaultId: 0,
      cancelId: 2,
    });
    return ['save', 'discard', 'cancel'][response];
  });
  handleTrusted('dialog:error', async (message) => {
    await dialog.showMessageBox(mainWindow, { type: 'error', title: APP_NAME, message, buttons: ['확인'] });
  });
  handleTrusted('window:set-title', (title) => mainWindow.setTitle(title));
  handleTrusted('window:confirm-close', () => {
    closeConfirmed = true;
    mainWindow.close();
  });
  handleTrusted(
    'window:print',
    () =>
      new Promise((resolve) => {
        mainWindow.webContents.print({ printBackground: true, margins: { marginType: 'none' } }, (success, failureReason) => {
          resolve({ success, failureReason });
        });
      }),
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(() => {
    protocol.handle('https', respondWithAsset);
    protocol.handle('http', denyRequest);
    Menu.setApplicationMenu(buildMenu());
    registerIpcHandlers();
    createMainWindow();
  });
}
