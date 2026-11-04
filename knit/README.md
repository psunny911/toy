# 배색뜨개 미리보기 (웹 MVP)

격자에 배색 도안을 그리면 메리야스 뜨개 원단처럼 미리 보여 준다. 도안 이미지와 미리보기 이미지를 기기에 저장할 수 있다.
빌드 없는 정적 웹 앱이다. 기능 범위는 `../docs/KNIT_SPEC.md` 참고.

## 실행

- `knit/` 폴더의 `index.html`을 바로 연다 (서버 불필요).
- 또는 로컬 서버: `cd knit && python3 -m http.server 8000` → `http://localhost:8000`

## 테스트 (Node 내장 러너, 외부 패키지 불필요)

```
cd knit
npm test
```

## 구조

```
knit/
  index.html        진입점. js/*.js를 클래식 <script>로 순서대로 로드
  icons/icon.svg    앱 아이콘
  css/style.css     파스텔 테마 (주 색: 버터 옐로 #F3D98B)
  js/
    pattern.js      도안 데이터 + 불변 편집 함수 + 파일명 (순수, UMD)
    render.js       캔버스 그리기: 도안(격자) 이미지, 뜨개 미리보기
    storage.js      저장소 어댑터 (localStorage)
    app.js          화면·이벤트 (DOM 의존)
  test/             Node 내장 테스트 러너용 유닛 테스트
```

## 캐시 버스팅

JS/CSS 내용을 바꾸면 `index.html`의 모든 `?v=N`을 함께 +1 한다.
