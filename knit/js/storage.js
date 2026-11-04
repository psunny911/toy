// 저장소 어댑터 (localStorage). 다른 저장소로 옮길 때는 이 파일만 바꾸면 된다.
(function (root) {
  const DATA_KEY = 'knit.pattern.v1';

  root.KnitStorage = {
    /** 저장된 도안이 없으면 null (처음 열 때는 예시 도안을 보여준다) */
    load() {
      try {
        const raw = root.localStorage.getItem(DATA_KEY);
        if (!raw) return null;
        return root.KnitPattern.sanitize(JSON.parse(raw));
      } catch (e) {
        return null;
      }
    },
    save(pattern) {
      try {
        root.localStorage.setItem(DATA_KEY, JSON.stringify(pattern));
        return true;
      } catch (e) {
        return false;
      }
    },
  };
})(typeof self !== 'undefined' ? self : this);
