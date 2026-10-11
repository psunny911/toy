# 데일리 트래커 (웹 MVP)

영어 학습, 영양제, 운동처럼 매일 하는 습관을 기록하는 트래커. 빌드 없는 정적 웹 앱이고,
나중에 네이티브 앱으로 옮기는 것을 전제로 구조를 나눴다. 기능 범위와 앱 전환 계획은
`../docs/TRACKER_SPEC.md` 참고.

## 실행

- **폰/PC에서 바로**: `tracker/` 폴더 전체를 옮긴 뒤 `index.html`을 연다 (서버 불필요).
- **로컬 서버** (PWA 설치·오프라인 캐시까지 확인할 때):
  ```
  cd tracker
  python3 -m http.server 8000
  ```
  → `http://localhost:8000` 접속. Android Chrome에서 메뉴 › "홈 화면에 추가"로 앱처럼 설치된다.
  (서비스 워커는 http/https에서만 동작하므로 `file://`로 열면 오프라인 캐시만 빠진다.)

## 테스트 (Node 내장 러너, 외부 패키지 불필요)

```
cd tracker
npm test
```

`dates.js`(날짜 계산), `store.js`(데이터 리듀서·가져오기 검증), `stats.js`(달성/연속/달성률)를
DOM 없이 순수 함수 단위로 검증한다.

## 구조

```
tracker/
  index.html            진입점. js/*.js를 클래식 <script>로 순서대로 로드
  manifest.webmanifest  PWA 매니페스트 (홈 화면 설치)
  sw.js                 서비스 워커 — 네트워크 우선 + 오프라인 캐시 폴백
  icons/                앱 아이콘 (svg 원본 + 192/512 png)
  css/style.css         파스텔 테마 (주 색: 파스텔 블루 #A7C7E7)
  js/
    dates.js            'YYYY-MM-DD' 키 기반 날짜 유틸, 월요일 시작 주 (순수, UMD)
    store.js            데이터 모양 + 불변 리듀서 + 백업 검증 (순수, UMD)
    stats.js            달성 여부, 연속 기록, 기간 달성률 (순수, UMD)
    storage.js          저장소 어댑터 (현재 localStorage) ← 앱 전환 시 이것만 교체
    app.js              렌더링·이벤트 (DOM 의존)
  test/                 Node 내장 테스트 러너용 유닛 테스트
```

`web/`(사진 콜라주)과 같은 이유로 ES 모듈 대신 UMD + 클래식 스크립트를 쓴다 — `file://`로
열었을 때 모듈 import가 CORS로 막히기 때문.

## 캐시 버스팅

JS/CSS 내용을 바꾸면 `index.html`의 모든 `?v=N`과 `sw.js`의 `SHELL` 목록·`CACHE` 이름을
함께 +1 한다.
