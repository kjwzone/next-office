// 문서 쪽을 SVG 이미지로 그려 미리보기와 인쇄에 쓰는 모듈
const PX_PER_MM = 96 / 25.4;
const A4_FALLBACK = { width: 210 * PX_PER_MM, height: 297 * PX_PER_MM };

const pagesElement = document.getElementById('preview-pages');
const pageStyleElement = document.getElementById('print-page-style');
let pageUrls = [];

function readSvgSize(svg) {
  const tag = svg.match(/<svg\b[^>]*>/)?.[0] ?? '';
  const width = Number.parseFloat(tag.match(/\swidth="([\d.]+)/)?.[1]);
  const height = Number.parseFloat(tag.match(/\sheight="([\d.]+)/)?.[1]);
  if (width > 0 && height > 0) return { width, height };
  const viewBox = tag.match(/viewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/);
  return viewBox ? { width: Number(viewBox[1]), height: Number(viewBox[2]) } : A4_FALLBACK;
}

function clearPages() {
  for (const url of pageUrls) URL.revokeObjectURL(url);
  pageUrls = [];
  pagesElement.replaceChildren();
}

async function appendPage(svg, pageNumber, pageCount) {
  const { width, height } = readSvgSize(svg);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  pageUrls.push(url);

  const image = new Image(width, height);
  image.alt = `${pageCount}쪽 중 ${pageNumber}쪽`;
  image.src = url;
  const sheet = document.createElement('div');
  sheet.className = 'page-sheet';
  sheet.append(image);
  pagesElement.append(sheet);
  await image.decode();
  return { width, height };
}

// 스크립트가 실행되지 않도록 쪽 SVG를 img로 넣는다.
export async function renderPages(studio) {
  clearPages();
  const pageCount = await studio.pageCount();
  let firstPageSize = A4_FALLBACK;
  for (let page = 0; page < pageCount; page += 1) {
    const size = await appendPage(await studio.getPageSvg(page), page + 1, pageCount);
    if (page === 0) firstPageSize = size;
  }
  pageStyleElement.textContent = `@page { size: ${firstPageSize.width}px ${firstPageSize.height}px; margin: 0; }`;
  return pageCount;
}
