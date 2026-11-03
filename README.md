# 다음오피스

교사가 한 쪽짜리 수업 안내문을 작성해 학생이 한컴 한글에서 열 수 있는 HWPX 파일로 전달하는 Windows용 한글 문서 에디터입니다.

## 실행

Node.js 22 이상과 git이 필요합니다. 첫 빌드 때 rhwp-studio 소스를 내려받습니다.

```bash
npm install
```

```bash
npm start
```

## 기능

| 기능 | 위치 | 단축키 |
|---|---|---|
| 새 문서 | 도구 막대, 파일 메뉴 | Ctrl+N |
| HWPX 열기 | 도구 막대, 파일 메뉴 | Ctrl+O |
| 저장 | 도구 막대, 파일 메뉴 | Ctrl+S |
| 다른 이름으로 저장 | 도구 막대, 파일 메뉴 | Ctrl+Shift+S |
| 글꼴 설정 | 글자를 선택한 뒤 도구 막대, 서식 메뉴 | |
| 인쇄 미리보기 | 도구 막대, 파일 메뉴 | Ctrl+Shift+P |
| 인쇄 | 도구 막대, 미리보기, 파일 메뉴 | Ctrl+P |

- 표, 문단 모양, 쪽 설정 같은 편집 기능은 편집기 안쪽의 메뉴와 도구 상자에 있습니다.
- 저장하지 않은 문서를 닫거나 바꾸면 먼저 묻습니다.
- 실행 전부터 있던 파일을 처음 덮어쓸 때 원본을 `파일이름.hwpx.bak`으로 남깁니다.
- 앱은 외부 주소로 요청을 보내지 않습니다.

## 테스트

```bash
npm test
```

단위 테스트와 실제 Electron 창 테스트를 실행합니다. 다음 항목은 사람이 확인해야 합니다.

1. Windows 한글 입력기로 입력해 조합 중 글자 중복이나 누락이 없는지 봅니다.
2. 저장한 파일을 한컴 한글에서 열어 복구 안내가 없는지 보고, 고친 사본을 이 앱에서 다시 엽니다.
3. 실제 프린터 또는 Microsoft Print to PDF로 인쇄합니다.

## 구조

| 경로 | 역할 |
|---|---|
| `src/main` | 창, 메뉴, 파일 대화상자, 저장, 인쇄 |
| `src/renderer` | 도구 막대, 미리보기, 명령 연결 |
| `scripts` | studio 빌드, 빈 문서 생성 |
| `vendor/rhwp-core` | 패치된 문서 엔진 |
| `tests` | 완료 기준 테스트 |

기준 문서는 [SPEC.md](SPEC.md), 결정 기록은 [context-notes.md](context-notes.md)입니다.

## 고지

본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.

- 문서 엔진과 편집 화면은 [rhwp](https://github.com/edwardkim/rhwp)(MIT)를 사용합니다.
- 엔진은 [이음오피스](https://github.com/pblsketch/openoffice)(Apache-2.0)가 패치한 `vendor/rhwp-core`를 그대로 사용합니다.
- `scripts/build-studio.mjs`는 이음오피스의 같은 이름 스크립트를 줄여 고친 것입니다.
- 라이선스와 고지 전문은 [LICENSES](LICENSES) 폴더에 있습니다.
