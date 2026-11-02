// 저장소 어댑터 (localStorage). 다른 저장소로 옮길 때는 이 파일만 바꾸면 된다.
(function (root) {
  const DATA_KEY = 'counters.data.v1';

  root.CounterStorage = {
    loadData() {
      try {
        const raw = root.localStorage.getItem(DATA_KEY);
        if (!raw) return root.CounterStore.createEmptyData();
        return root.CounterStore.sanitizeData(JSON.parse(raw));
      } catch (e) {
        return root.CounterStore.createEmptyData();
      }
    },
    saveData(data) {
      try {
        root.localStorage.setItem(DATA_KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        return false;
      }
    },
  };
})(typeof self !== 'undefined' ? self : this);
