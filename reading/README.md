# 소리 내어 읽기 — 영어 문장 읽기 학습 (웹 MVP)

CSV로 넣은 영어 문장을 소리 내어 읽으면 브라우저 음성 인식으로 채점하고, **정확도 80% 이상**이면
다음 문장으로 넘어가는 정적 웹 앱. 기능 범위와 채점 규칙은 `../docs/READING_SPEC.md` 참고.

## 실행

음성 인식(Web Speech API)과 마이크는 **https 또는 localhost**에서만 열린다.

- **배포 주소**: GitHub Pages의 `/reading/` (워크플로가 `reading/`을 같이 올린다)
- **로컬 서버**:
  ```
  cd reading
  python3 -m http.server 8000
  ```
  → `http://localhost:8000`
- **브라우저**: Android·PC는 Chrome(또는 Edge), iPhone·iPad는 Safari(iOS 14.5+, 설정에서 Siri가 켜져 있어야 함).
  Firefox는 음성 인식을 지원하지 않는다. Chrome의 음성 인식은 서버에서 처리되므로 인터넷이 필요하다.

## 문장 CSV

```
english,meaning
How are you?,잘 지내요?
"Well, I think so.","글쎄, 그런 것 같아요."
```

- 첫 칸 = 영어 문장, 둘째 칸 = 뜻(선택). 머리글 줄은 있어도 없어도 된다.
- 쉼표가 들어간 칸은 큰따옴표로 감싼다. 엑셀에서 저장한 EUC-KR(CP949) 파일도 읽는다.
- 엑셀·구글 시트에서 두 열을 복사해 붙여넣어도 된다(탭 구분).
- 예시: `sample/sentences.csv`
- CSV 하나가 **세트** 하나가 된다. 세트는 여러 개 둘 수 있고(상단 세트 이름 또는 `세트`), 세트마다 진행 기록이
  따로 저장된다. 세트의 `⋯` › `CSV로 저장`으로 문장을 다시 꺼낼 수 있다.

## 테스트 (Node 내장 러너, 외부 패키지 불필요)

```
cd reading
npm test
```

`csv.js`(파싱·인코딩·내보내기), `score.js`(정규화·정렬·정확도), `mask.js`(숨길 단어), `progress.js`(진행 상태),
`sets.js`(세트 추가·전환·이름·삭제·예전 저장소 옮기기)를
DOM 없이 검증한다. 화면 흐름은 Chromium에서 음성 인식을 가짜로 바꿔 끼워 확인했다.

## 구조

```
reading/
  index.html        진입점. js/*.js를 클래식 <script>로 순서대로 로드
  css/style.css     라이트/다크 테마 (포인트 색 #2f5bea, 통과 초록, 놓친 단어 빨강)
  icons/icon.svg
  sample/sentences.csv
  js/
    csv.js          CSV/TSV 파싱·내보내기, UTF-8 → EUC-KR 대체 디코딩 (순수, UMD)
    score.js        단어 정규화(축약형·숫자), LCS 정렬, 정확도·단어별 결과 (순수, UMD)
    mask.js         "일부 단어 숨기기"에서 숨길 단어 고르기 (순수, UMD)
    progress.js     현재 문장·통과 여부·시도 횟수 (순수, UMD)
    sets.js         문장 세트 모음, 세트별 진행 (순수, UMD, progress.js 사용)
    samples.js      처음 열었을 때 쓰는 예시 문장 (sample/sentences.csv와 같은 내용)
    speech.js       SpeechRecognition / speechSynthesis 래퍼
    app.js          화면·흐름 (DOM 의존)
  test/
```

## 캐시 버스팅

JS/CSS 내용을 바꾸면 `index.html`의 모든 `?v=N`을 함께 +1 한다.
