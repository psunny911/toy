# 5초 브이로그 (웹 MVP)

5초씩 찍은 클립을 순서대로 이어 붙여 영상 하나로 만드는 정적 웹 앱. 영상에는 촬영시각과
가운데 문구가 찍힌다. 기능 범위와 기술 검토는 `../docs/VLOG_SPEC.md` 참고.

## 실행

카메라(getUserMedia)는 **https 또는 localhost**에서만 열린다. `file://`로 열면 브라우저에 따라
카메라가 막힌다.

- **배포 주소**: GitHub Pages의 `/vlog/` (워크플로가 `vlog/`를 같이 올린다)
- **로컬 서버**:
  ```
  cd vlog
  python3 -m http.server 8000
  ```
  → `http://localhost:8000` (같은 Wi-Fi의 폰에서 IP로 접속하면 http라서 카메라가 막힌다.
  폰에서 확인할 때는 배포 주소를 쓴다.)

## 테스트 (Node 내장 러너, 외부 패키지 불필요)

```
cd vlog
npm test
```

`format.js`(시각 표시), `layout.js`(출력 크기·레터박스·줄바꿈), `clips.js`(목록 연산·녹화 포맷 선택),
`overlay.js`(시각/문구 그리기 위치)를 DOM 없이 검증한다. 카메라·녹화·합치기는 Chromium의 가짜
카메라(`--use-fake-device-for-media-stream`)로 직접 돌려서 확인했다.

## 구조

```
vlog/
  index.html        진입점. js/*.js를 클래식 <script>로 순서대로 로드
  css/style.css     다크 카메라 테마 (포인트 색: 촬영시각 오렌지 #FFB547)
  icons/icon.svg
  js/
    format.js       촬영시각·길이·파일명 문자열 (순수, UMD)
    layout.js       출력 해상도, contain 영역, 오버레이 치수, 줄바꿈 (순수, UMD)
    clips.js        클립 목록 연산, MediaRecorder 포맷 선택 (순수, UMD)
    overlay.js      캔버스에 촬영시각 + 가운데 문구 그리기 (미리보기·결과물 공용)
    db.js           IndexedDB 클립 저장소
    merge.js        클립 이어 붙이기 (캔버스 + MediaRecorder 재녹화)
    app.js          화면·카메라·녹화 (DOM 의존)
  test/
```

## 캐시 버스팅

JS/CSS 내용을 바꾸면 `index.html`의 모든 `?v=N`을 함께 +1 한다.
