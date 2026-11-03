// 도구 막대 명령을 편집기와 파일 기능에 연결하는 앱 화면의 시작점
import { createStudio } from '/sdk/index.js';
import { renderPages } from '/renderer/preview.js';

const APP_NAME = '다음오피스';
const UNTITLED_NAME = '제목 없음';
const STUDIO_URL = `${location.origin}/studio/index.html?chrome=embed`;
const DIRTY_POLL_MS = 1000;
const EDITOR_INPUT_SELECTOR = '[aria-label="문서 편집 입력"]';

const api = window.nextOffice;
const docNameElement = document.getElementById('doc-name');
const docStateElement = document.getElementById('doc-state');
const previewElement = document.getElementById('preview');

let studio = null;
let documentName = UNTITLED_NAME;
let isDirty = false;
let isBusy = false;

async function loadBytes(bytes, name) {
  // 전달 과정에서 원본 버퍼가 비워질 수 있어 사본을 보낸다.
  await studio.loadFile(new Uint8Array(bytes).slice(), name, { skipUnsavedGuard: true });
}

function updateTitle() {
  docNameElement.textContent = documentName;
  docStateElement.textContent = isDirty ? '저장되지 않음' : '';
  api.setTitle(`${isDirty ? '* ' : ''}${documentName} - ${APP_NAME}`);
}

async function refreshDirtyState() {
  const context = await studio.commands.context();
  const nextDirty = context.isDirty === true;
  if (nextDirty !== isDirty) {
    isDirty = nextDirty;
    updateTitle();
  }
  return isDirty;
}

async function markSaved(name) {
  documentName = name;
  await studio.notifySaved(name);
  isDirty = false;
  updateTitle();
}

async function saveWith(saveFunction) {
  const bytes = await studio.exportHwpx();
  const result = await saveFunction(bytes);
  if (result.error) {
    await api.showError(result.error);
    return false;
  }
  if (result.canceled) return false;
  await markSaved(result.name);
  return true;
}

// 문서를 버려도 되면 true를 돌려준다. 저장을 고르면 저장이 성공한 때만 true다.
async function confirmLeavingDocument() {
  if (!(await refreshDirtyState())) return true;
  const choice = await api.askUnsaved();
  if (choice === 'discard') return true;
  if (choice === 'save') return saveWith(api.saveDocument);
  return false;
}

async function startNewDocument() {
  if (!(await confirmLeavingDocument())) return;
  const response = await fetch('/renderer/assets/blank.hwpx');
  await loadBytes(await response.arrayBuffer(), `${UNTITLED_NAME}.hwpx`);
  await api.startNewDocument();
  documentName = UNTITLED_NAME;
  isDirty = false;
  updateTitle();
}

async function openDocument() {
  if (!(await confirmLeavingDocument())) return;
  const result = await api.openDocument();
  if (result.canceled) return;
  if (result.error) {
    await api.showError(result.error);
    return;
  }
  try {
    await loadBytes(result.bytes, result.name);
  } catch (error) {
    await api.showError(`${result.name}을(를) 열지 못했습니다. 파일이 손상되었을 수 있습니다. (${error.message})`);
    return;
  }
  const { name } = await api.commitOpen();
  documentName = name;
  isDirty = false;
  updateTitle();
}

async function openFontDialog() {
  // 편집기의 글자 모양 명령은 선택이 없으면 아무 반응 없이 끝나므로 먼저 알린다.
  const selection = await studio.getSelectionContext();
  if (selection.collapsed) {
    await api.showError('글꼴을 바꿀 글자를 먼저 선택하세요.');
    return;
  }
  const result = await studio.commands.execute('format:char-shape', {}, { allowDialog: true });
  if (result?.ok === false) await api.showError('글꼴을 설정할 수 없는 위치입니다. 본문을 누른 뒤 다시 시도하세요.');
}

async function showPreview() {
  const pageCount = await renderPages(studio);
  document.getElementById('preview-title').textContent = `인쇄 미리보기 (${pageCount}쪽)`;
  previewElement.hidden = false;
  document.getElementById('preview-close').focus();
}

// 도구 막대를 누른 뒤에도 바로 이어서 입력할 수 있게 포커스를 편집기로 돌린다.
// 창에만 포커스를 주면 입력칸이 비어 있어 첫 글자가 사라지므로 입력칸까지 잡는다.
function focusEditor() {
  const frame = document.querySelector('#editor iframe');
  if (!frame) return;
  frame.contentWindow.focus();
  frame.contentDocument.querySelector(EDITOR_INPUT_SELECTOR)?.focus();
}

function closePreview() {
  previewElement.hidden = true;
  focusEditor();
}

async function printDocument() {
  if (previewElement.hidden) await renderPages(studio);
  const result = await api.print();
  if (!result.success && result.failureReason !== 'Print job canceled') {
    await api.showError(`인쇄하지 못했습니다. 프린터 설정을 확인하세요. (${result.failureReason})`);
  }
}

const COMMANDS = {
  new: startNewDocument,
  open: openDocument,
  save: () => saveWith(api.saveDocument),
  'save-as': () => saveWith(api.saveDocumentAs),
  font: openFontDialog,
  preview: showPreview,
  print: printDocument,
};

// 대화상자가 열린 동안 같은 명령이 겹쳐 실행되지 않게 한 번에 하나만 돌린다.
async function runExclusive(task) {
  if (isBusy || !studio) return;
  isBusy = true;
  try {
    await task();
  } catch (error) {
    console.error(error);
    await api.showError(`작업을 끝내지 못했습니다. ${error.message}`);
  } finally {
    isBusy = false;
    if (previewElement.hidden) focusEditor();
  }
}

function runCommand(command) {
  // 미리보기 중에는 인쇄와 닫기만 뜻이 있다.
  if (!previewElement.hidden && command !== 'print') return;
  const handler = COMMANDS[command];
  if (handler) void runExclusive(handler);
}

function installEvents() {
  document.querySelector('.actions').addEventListener('click', (event) => {
    const command = event.target.closest('button')?.dataset.command;
    if (command) runCommand(command);
  });
  document.getElementById('preview-print').addEventListener('click', () => runCommand('print'));
  document.getElementById('preview-close').addEventListener('click', closePreview);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !previewElement.hidden) closePreview();
  });
  api.onCommand(runCommand);
  api.onCloseRequested(() => {
    void runExclusive(async () => {
      if (!(await confirmLeavingDocument())) return;
      // 사용자가 이미 답했으므로 편집기의 이탈 경고가 다시 뜨지 않게 표시를 지운다.
      await studio.notifySaved(documentName);
      await api.confirmClose();
    });
  });
}

async function start() {
  installEvents();
  studio = await createStudio('#editor', { studioUrl: STUDIO_URL });
  const response = await fetch('/renderer/assets/blank.hwpx');
  await loadBytes(await response.arrayBuffer(), `${UNTITLED_NAME}.hwpx`);
  updateTitle();
  focusEditor();
  setInterval(() => void refreshDirtyState().catch(console.error), DIRTY_POLL_MS);
  document.documentElement.dataset.ready = 'true';
}

start().catch(async (error) => {
  console.error(error);
  await api.showError(`편집기를 시작하지 못했습니다. ${error.message}`);
});
