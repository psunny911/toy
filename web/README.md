# 사진 콜라주 (웹 MVP)

빌드 없이 브라우저에서 바로 여는 정적 웹 앱. 자세한 기능 범위는
`../docs/FEATURE_SPEC.md` 참고.

## 폰에서 바로 확인하기

`index.html`이 같은 폴더의 `css/style.css`, `js/*.js`를 상대 경로로
불러오므로, **`web/` 폴더 전체**를 함께 전송해야 한다 (`index.html` 파일 하나만
옮기면 스타일/스크립트가 로드되지 않는다). 폴더째로 압축해서 폰으로 옮긴 뒤
`index.html`을 눌러 열면 별도 서버나 설치 없이 바로 동작한다.

## 로직 테스트 실행 (Node, 외부 패키지 불필요)

```
cd web
npm test
```

`node --test`(Node 내장 테스트 러너)로 `test/*.test.js`를 실행한다.
`geometry.js`(그리드/팬/줌 계산), `gestures.js`(탭·팬·핀치 판별),
`state.js`(상태 리듀서)를 DOM 없이 순수 함수 단위로 검증한다.

## 구조

```
web/
  index.html         진입점. js/*.js를 <script> 클래식 스크립트로 순서대로 로드
  css/style.css
  js/
    geometry.js       그리드 슬롯/팬·줌 clamp 계산 (순수 함수, UMD)
    gestures.js        탭/팬/핀치 판별 (순수 함수, UMD)
    state.js           상태 리듀서 (순수 함수, UMD)
    render.js          Canvas 렌더링 (DOM 의존)
    app.js             파일 입력/터치 이벤트/슬라이더/저장 와이어링
  test/                Node 내장 테스트 러너용 유닛 테스트
```

`type="module"` 대신 클래식 `<script src>`를 쓰는 이유: 모바일에서 파일을
`file://`로 직접 열면 ES 모듈의 상호 import가 "Cross origin requests are only
supported for HTTP" CORS 에러로 막힌다 (Chromium에서 직접 검증함). UMD 패턴으로
작성해 브라우저에서는 전역 객체(`Geometry`, `Gestures`, `State`, `Render`)로,
Node 테스트에서는 `require()`로 동일 코드를 재사용한다.
