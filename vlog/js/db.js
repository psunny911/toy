// 클립 저장소: IndexedDB (영상 Blob은 localStorage에 못 넣는다). 서버로는 아무것도 보내지 않는다.
(function (root) {
  const DB_NAME = 'vlog';
  const STORE = 'clips';
  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = root.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  function run(mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const result = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  root.ClipDB = {
    all: () => run('readonly', (s) => s.getAll()),
    put: (clip) => run('readwrite', (s) => { s.put(clip); }),
    putMany: (clips) => run('readwrite', (s) => { clips.forEach((c) => s.put(c)); }),
    remove: (id) => run('readwrite', (s) => { s.delete(id); }),
    clear: () => run('readwrite', (s) => { s.clear(); }),
  };
})(typeof self !== 'undefined' ? self : this);
