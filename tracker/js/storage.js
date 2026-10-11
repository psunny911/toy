// 저장소 어댑터. 지금은 localStorage, 네이티브 앱으로 옮길 때는 이 파일만
// Capacitor Preferences / SQLite 등으로 바꾸면 된다 (load/save 시그니처 유지).
(function (root) {
  const DATA_KEY = 'tracker.data.v1';
  const PREFS_KEY = 'tracker.prefs.v1';

  function readJson(key) {
    try {
      const raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      root.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  root.TrackerStorage = {
    loadData() {
      const raw = readJson(DATA_KEY);
      if (!raw) return root.Store.createEmptyData();
      try {
        return root.Store.sanitizeData(raw);
      } catch (e) {
        return root.Store.createEmptyData();
      }
    },
    saveData(data) {
      return writeJson(DATA_KEY, data);
    },
    loadPrefs() {
      return readJson(PREFS_KEY) || {};
    },
    savePrefs(prefs) {
      return writeJson(PREFS_KEY, prefs);
    },
  };
})(typeof self !== 'undefined' ? self : this);
