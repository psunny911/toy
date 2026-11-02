# 카운터 (웹 MVP)

항목별로 숫자를 세는 카운터. 항목마다 스테퍼(− / ＋)로 카운트를 올리고 내린다.
빌드 없는 정적 웹 앱이다. 기능 범위는 `../docs/COUNTERS_SPEC.md` 참고.

## 실행

- `counters/` 폴더의 `index.html`을 바로 연다 (서버 불필요).
- 또는 로컬 서버: `cd counters && python3 -m http.server 8000` → `http://localhost:8000`

## 테스트 (Node 내장 러너, 외부 패키지 불필요)

```
cd counters
npm test
```

## 구조

```
counters/
  index.html        진입점. js/*.js를 클래식 <script>로 순서대로 로드
  icons/icon.svg    앱 아이콘
  css/style.css     파스텔 테마 (주 색: 파스텔 민트 #B5E5CF)
  js/
    store.js        데이터 모양 + 불변 리듀서 + 백업 검증 (순수, UMD)
    storage.js      저장소 어댑터 (localStorage)
    app.js          렌더링·이벤트 (DOM 의존)
  test/             Node 내장 테스트 러너용 유닛 테스트
```

`file://`로 열어도 동작하도록 ES 모듈 대신 UMD + 클래식 스크립트를 쓴다.

## 캐시 버스팅

JS/CSS 내용을 바꾸면 `index.html`의 모든 `?v=N`을 함께 +1 한다.
