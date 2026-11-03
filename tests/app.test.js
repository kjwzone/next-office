// 실제 Electron 창에서 완료 기준 R1~R4, R6~R8을 확인하는 테스트
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');
const {
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
} = require('./helpers');

const TITLE = '네트워크 실습 안내';
const BODY_1 = '라우터와 스위치의 차이를 정리한다';
const BODY_2 = '실습 결과를 다음 시간까지 제출한다';
const LESSON = [TITLE, BODY_1, BODY_2];

let HwpDocument;
let directory;

before(async () => {
  HwpDocument = await loadEngine();
  directory = makeTempDir();
});

after(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

// 앱을 띄워 테스트를 돌리고 실패해도 항상 닫는다.
async function withApp(run) {
  const context = await launchApp();
  try {
    await clickDocument(context);
    await run(context);
    assert.deepStrictEqual(context.consoleErrors, []);
  } finally {
    await closeApp(context);
  }
}

async function typeLesson({ page }) {
  await page.keyboard.type(TITLE);
  await page.keyboard.press('Enter');
  await page.keyboard.type(BODY_1);
  await page.keyboard.press('Enter');
  await page.keyboard.type(BODY_2);
}

async function saveAs({ app, page }, filePath) {
  await mockSaveDialog(app, filePath);
  await page.click('[data-command="save-as"]');
  await waitForFile(filePath);
  await page.waitForFunction(() => document.getElementById('doc-state').textContent === '');
}

async function openFile({ app, page }, filePath) {
  await mockOpenDialog(app, filePath);
  await page.click('[data-command="open"]');
  const name = path.basename(filePath);
  await page.waitForFunction((expected) => document.getElementById('doc-name').textContent === expected, name);
}

async function waitForDirty({ page }) {
  await page.waitForFunction(() => document.getElementById('doc-state').textContent !== '', null, { timeout: 5000 });
}

function targetPath(name) {
  return path.join(directory, name);
}

test('R1: 빈 A4 문서가 열리고 입력할 수 있다', async () => {
  await withApp(async (context) => {
    const { app, page, frame } = context;
    const windowCount = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    assert.strictEqual(windowCount, 1);
    assert.match(await frame.locator('#sb-page').textContent(), /1\s*\/\s*1/);

    await page.keyboard.type('가');
    const file = targetPath('r1.hwpx');
    await saveAs(context, file);
    assert.deepStrictEqual(readParagraphs(HwpDocument, file), ['가']);

    const doc = new HwpDocument(fs.readFileSync(file));
    const pageDef = JSON.parse(doc.getPageDef(0));
    doc.free();
    assert.deepStrictEqual([pageDef.width, pageDef.height], [59528, 84186]);
  });
});

test('R2: 세 문단 입력과 실행 취소', async () => {
  await withApp(async (context) => {
    const { page } = context;
    await typeLesson(context);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    // 편집기는 연속해서 지운 글자를 실행 취소 한 번으로 묶는다.
    await page.keyboard.press('Control+KeyZ');
    const file = targetPath('r2.hwpx');
    await saveAs(context, file);
    assert.deepStrictEqual(readParagraphs(HwpDocument, file), LESSON);
  });
});

test('R2: 입력기 조합 신호로 글자가 중복되거나 빠지지 않는다', async () => {
  await withApp(async (context) => {
    const { page } = context;
    const cdp = await page.context().newCDPSession(page);
    for (const text of ['ㄱ', '가', '각']) {
      await cdp.send('Input.imeSetComposition', { text, selectionStart: 1, selectionEnd: 1 });
    }
    await cdp.send('Input.insertText', { text: '각' });
    for (const text of ['ㄴ', '나']) {
      await cdp.send('Input.imeSetComposition', { text, selectionStart: 1, selectionEnd: 1 });
    }
    await cdp.send('Input.insertText', { text: '나' });
    await page.waitForTimeout(300);
    const file = targetPath('r2-ime.hwpx');
    await saveAs(context, file);
    assert.deepStrictEqual(readParagraphs(HwpDocument, file), ['각나']);
  });
});

test('R3: 저장 후 다시 열어도 문단이 같다', async () => {
  const file = targetPath('수업안내.hwpx');
  await withApp(async (context) => {
    await typeLesson(context);
    await saveAs(context, file);
    assert.deepStrictEqual(readParagraphs(HwpDocument, file), LESSON);
  });
  // 앱을 닫고 새로 띄워 다시 연 뒤 저장해도 같아야 한다.
  await withApp(async (context) => {
    await openFile(context, file);
    const copy = targetPath('수업안내_다시열기.hwpx');
    await saveAs(context, copy);
    assert.deepStrictEqual(readParagraphs(HwpDocument, copy), LESSON);
  });
});

test('R4: 다른 이름 저장은 원본을 바꾸지 않는다', async () => {
  const original = targetPath('r4-원본.hwpx');
  const edited = targetPath('r4-수정.hwpx');
  await withApp(async (context) => {
    await typeLesson(context);
    await saveAs(context, original);
    const originalBytes = fs.readFileSync(original);
    await context.page.keyboard.type(' 수정');
    await waitForDirty(context);
    await saveAs(context, edited);
    assert.deepStrictEqual(fs.readFileSync(original), originalBytes);
    assert.strictEqual(fs.existsSync(`${original}.bak`), false);
    assert.deepStrictEqual(readParagraphs(HwpDocument, edited), [TITLE, BODY_1, `${BODY_2} 수정`]);
  });
});

test('R4: 닫기를 취소하면 문장이 남는다', async () => {
  await withApp(async (context) => {
    const { app, page } = context;
    await page.keyboard.type('닫기 전 문장');
    await waitForDirty(context);
    await mockUnsavedChoice(app, 2);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await page.waitForTimeout(800);
    assert.strictEqual(await app.evaluate(() => globalThis.unsavedPromptCount), 1);
    assert.strictEqual(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    const file = targetPath('r4-취소.hwpx');
    await saveAs(context, file);
    assert.deepStrictEqual(readParagraphs(HwpDocument, file), ['닫기 전 문장']);
  });
});

test('R4: 저장 안 함을 고르면 창이 닫히고, 저장이 끝난 문서는 묻지 않는다', async () => {
  const context = await launchApp();
  const { app, page } = context;
  await clickDocument(context);
  await page.keyboard.type('버릴 문장');
  await waitForDirty(context);
  await mockUnsavedChoice(app, 1);
  const closed = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed;
  fs.rmSync(context.userDataDir, { recursive: true, force: true });

  const clean = await launchApp();
  await clickDocument(clean);
  await clean.page.keyboard.type('저장할 문장');
  await saveAs(clean, targetPath('r4-깨끗함.hwpx'));
  await mockUnsavedChoice(clean.app, 2);
  const cleanClosed = clean.app.waitForEvent('close');
  await clean.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await cleanClosed;
  fs.rmSync(clean.userDataDir, { recursive: true, force: true });
});

// Playwright 키 입력은 앱 단축키가 듣는 경로를 거치지 않아 Electron 입력 이벤트로 보낸다.
async function pressCtrlS({ app, page }) {
  await app.evaluate(({ BrowserWindow }) => {
    const { webContents } = BrowserWindow.getAllWindows()[0];
    webContents.sendInputEvent({ type: 'keyDown', keyCode: 'S', modifiers: ['control'] });
    webContents.sendInputEvent({ type: 'keyUp', keyCode: 'S', modifiers: ['control'] });
  });
  await page.waitForFunction(() => document.getElementById('doc-state').textContent === '');
}

test('R9: 이번 실행에서 만든 파일은 .bak 없이 덮어쓰고, 포커스는 편집기로 돌아온다', async () => {
  await withApp(async (context) => {
    const { page } = context;
    const file = targetPath('새파일.hwpx');
    await page.keyboard.type('처음');
    await saveAs(context, file);
    await page.keyboard.type(' 이어서');
    await waitForDirty(context);
    await pressCtrlS(context);
    assert.deepStrictEqual(readParagraphs(HwpDocument, file), ['처음 이어서']);
    assert.strictEqual(fs.existsSync(`${file}.bak`), false);
  });
});

test('R9: 실행 전부터 있던 파일을 덮어쓰면 원본이 .bak으로 남는다', async () => {
  const file = targetPath('기존파일.hwpx');
  await withApp(async (context) => {
    await context.page.keyboard.type('원본 문장');
    await saveAs(context, file);
  });
  const originalBytes = fs.readFileSync(file);
  await withApp(async (context) => {
    await openFile(context, file);
    await clickDocument(context);
    await context.page.keyboard.type('고침 ');
    await waitForDirty(context);
    await pressCtrlS(context);
    assert.deepStrictEqual(fs.readFileSync(`${file}.bak`), originalBytes);
    assert.notDeepStrictEqual(fs.readFileSync(file), originalBytes);
    assert.match(readParagraphs(HwpDocument, file)[0], /고침 /);
  });
});

test('HWPX가 아닌 파일을 열면 알리고 작업 중인 문서를 유지한다', async () => {
  const context = await launchApp();
  try {
    const { app, page } = context;
    await clickDocument(context);
    await page.keyboard.type('유지할 문장');
    const fake = targetPath('가짜.hwpx');
    fs.writeFileSync(fake, 'not a zip');
    await mockUnsavedChoice(app, 1);
    await mockOpenDialog(app, fake);
    await page.waitForTimeout(1200);
    await page.click('[data-command="open"]');
    await page.waitForTimeout(500);
    assert.strictEqual(await app.evaluate(() => globalThis.unsavedPromptCount), 2);
    assert.strictEqual(await page.textContent('#doc-name'), '제목 없음');
    const file = targetPath('유지.hwpx');
    await saveAs(context, file);
    assert.deepStrictEqual(readParagraphs(HwpDocument, file), ['유지할 문장']);
  } finally {
    await closeApp(context);
  }
});

test('R6: 글꼴 변경이 저장 후에도 유지된다', async () => {
  await withApp(async (context) => {
    const { frame, page } = context;
    await page.keyboard.type('글꼴 시험');
    await page.keyboard.press('Shift+Home');
    await page.click('[data-command="font"]');
    const dialog = frame.locator('.cs-dialog');
    await dialog.waitFor({ timeout: 5000 });
    const selects = dialog.locator('select.dialog-select');
    await selects.nth(1).selectOption({ label: '맑은 고딕' });
    await dialog.locator('input').first().fill('20');
    await dialog.locator('.dialog-btn-primary').click();
    await dialog.waitFor({ state: 'detached', timeout: 5000 });

    const file = targetPath('r6.hwpx');
    await saveAs(context, file);
    const doc = new HwpDocument(fs.readFileSync(file));
    const props = JSON.parse(doc.getCharPropertiesAt(0, 0, 0));
    doc.free();
    assert.strictEqual(props.fontFamily, '맑은 고딕');
    assert.strictEqual(props.fontSize, 2000);
  });
});

test('글꼴 설정은 선택이 없으면 먼저 글자를 고르라고 알린다', async () => {
  await withApp(async (context) => {
    const { app, frame, page } = context;
    await mockUnsavedChoice(app, 0);
    await page.keyboard.type('선택 없음');
    await page.click('[data-command="font"]');
    await page.waitForTimeout(500);
    assert.strictEqual(await app.evaluate(() => globalThis.unsavedPromptCount), 1);
    assert.strictEqual(await frame.locator('.cs-dialog').count(), 0);
  });
});

async function typeTwoPages({ page }) {
  await page.keyboard.type('첫 쪽');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.type('둘째 쪽');
  await page.waitForTimeout(500);
}

test('R7: 미리보기에 모든 쪽이 보인다', async () => {
  await withApp(async (context) => {
    const { page } = context;
    await typeTwoPages(context);
    await page.click('[data-command="preview"]');
    await page.waitForSelector('#preview:not([hidden])');
    const images = await page.$$eval('.page-sheet img', (nodes) =>
      nodes.map((image) => ({ ratio: image.naturalHeight / image.naturalWidth, loaded: image.complete && image.naturalWidth > 0 })),
    );
    assert.strictEqual(images.length, 2);
    for (const image of images) {
      assert.strictEqual(image.loaded, true);
      assert.ok(Math.abs(image.ratio - 297 / 210) < 0.01, `쪽 비율이 ${image.ratio}다`);
    }
    assert.match(await page.textContent('#preview-title'), /2쪽/);

    await page.keyboard.press('Escape');
    await page.waitForSelector('#preview', { state: 'hidden' });
    await page.keyboard.type(' 이어서');
    const file = targetPath('r7.hwpx');
    await saveAs(context, file);
    assert.ok(readParagraphs(HwpDocument, file).join('').includes('둘째 쪽 이어서'));
  });
});

test('R8: 인쇄 결과는 문서 쪽만 담는다', async () => {
  await withApp(async (context) => {
    const { app, page } = context;
    await typeTwoPages(context);
    // 프린터 없이 확인하도록 인쇄 호출을 같은 화면의 PDF 출력으로 바꾼다.
    await app.evaluate(({ BrowserWindow }) => {
      const { webContents } = BrowserWindow.getAllWindows()[0];
      globalThis.printCount = 0;
      webContents.print = (_options, callback) => {
        globalThis.printCount += 1;
        webContents.printToPDF({ preferCSSPageSize: true, printBackground: true }).then((pdf) => {
          globalThis.printedPdf = pdf.toString('latin1');
          callback(true, '');
        });
      };
    });
    await page.click('[data-command="print"]');
    await page.waitForFunction(() => document.querySelectorAll('.page-sheet').length === 2);
    await page.waitForTimeout(1500);
    assert.strictEqual(await app.evaluate(() => globalThis.printCount), 1);
    const pdf = await app.evaluate(() => globalThis.printedPdf);
    assert.strictEqual(pdf.match(/\/Type\s*\/Page\b/g)?.length, 2);
    const mediaBox = pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
    assert.ok(Math.abs(Number(mediaBox[1]) - 595.3) < 2, `쪽 너비가 ${mediaBox[1]}pt다`);
    assert.ok(Math.abs(Number(mediaBox[2]) - 841.9) < 2, `쪽 높이가 ${mediaBox[2]}pt다`);

    await page.emulateMedia({ media: 'print' });
    assert.strictEqual(await page.isVisible('#toolbar'), false);
    assert.strictEqual(await page.isVisible('#editor'), false);
    assert.strictEqual(await page.isVisible('.page-sheet img >> nth=0'), true);
    await page.emulateMedia({ media: 'screen' });
    assert.strictEqual(await page.isVisible('#preview'), false);
  });
});

test('앱은 외부 주소로 요청을 보내지 않는다', async () => {
  const context = await launchApp();
  try {
    const status = await context.app.evaluate(({ net }) => net.fetch('https://example.com/').then((response) => response.status));
    assert.strictEqual(status, 403);
  } finally {
    await closeApp(context);
  }
});
