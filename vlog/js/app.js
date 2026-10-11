// 화면·카메라·녹화 (DOM 의존). 순수 로직은 format/layout/clips/overlay, 합치기는 merge.js.
(function () {
  const { Format, Layout, Clips, Overlay, ClipDB, Merge } = window;
  const $ = (id) => document.getElementById(id);

  const els = {
    live: $('live'), liveOverlay: $('live-overlay'), viewfinder: $('viewfinder'),
    recBadge: $('rec-badge'), recSec: $('rec-sec'), recRing: $('rec-ring'),
    camMsg: $('cam-msg'), camMsgText: $('cam-msg-text'), camStart: $('cam-start'),
    caption: $('caption'), recBtn: $('rec-btn'), flipBtn: $('flip-btn'), nextHint: $('next-hint'),
    clipList: $('clip-list'), clipEmpty: $('clip-empty'), clipCount: $('clip-count'), clipTotal: $('clip-total'),
    clearBtn: $('clear-btn'), makeBtn: $('make-btn'),
    clipSheet: $('clip-sheet'), clipTitle: $('clip-sheet-title'), clipPlayer: $('clip-player'),
    clipVideo: $('clip-video'), clipOverlay: $('clip-overlay'), clipCaption: $('clip-caption'),
    clipLeft: $('clip-left'), clipRight: $('clip-right'), clipSave: $('clip-save'), clipDelete: $('clip-delete'),
    secondsSeg: $('seconds-seg'), stampSeg: $('stamp-seg'), saveHint: $('save-hint'),
    renderSheet: $('render-sheet'), renderTitle: $('render-title'), renderClose: $('render-close'),
    renderProgress: $('render-progress'), progressBar: $('progress-bar'), progressText: $('progress-text'),
    renderResult: $('render-result'), resultPlayer: $('result-player'), resultVideo: $('result-video'), saveBtn: $('save-btn'), shareBtn: $('share-btn'),
    toast: $('toast'),
  };

  const RING_LEN = 2 * Math.PI * 36;
  const PREFS_KEY = 'vlog.prefs.v1';
  // iPadOS는 데스크톱 Safari처럼 보이므로 터치 지원으로 구분한다
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mimeType = window.MediaRecorder ? Clips.pickMimeType((t) => MediaRecorder.isTypeSupported(t)) : '';

  const state = {
    clips: [],
    stream: null,
    facing: 'environment',
    recording: null, // { startedAt, seconds }
    prefs: Clips.normalizePrefs(readPrefs()),
    editingId: null,
    rendering: false,
  };
  const thumbUrls = new Map(); // clip.id → object URL
  let resultUrl = null;
  let resultBlob = null;
  let resultFile = null;

  // ---------- 공통 ----------

  function readPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY)); } catch (e) { return null; }
  }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch (e) { /* 설정 저장은 선택 */ }
  }

  /** 문구 입력칸: 줄바꿈은 MAX_LINES줄까지만 */
  function limitLines(textarea) {
    const lines = textarea.value.split('\n');
    if (lines.length > Clips.MAX_LINES) textarea.value = lines.slice(0, Clips.MAX_LINES).join('\n');
  }

  let toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2600);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /** 오버레이 캔버스를 화면 크기 × DPR로 맞추고 그린다. */
  function paintOverlay(canvas, info) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    Overlay.drawOverlay(ctx, w, h, info);
  }

  /**
   * 박스를 영상 비율 그대로(폭 100%, 높이 화면의 maxVh 이하) 맞춘다.
   * 레터박스가 없어야 오버레이 위치가 결과물과 같아진다 (보이는 것 = 녹화되는 것).
   */
  function fitBox(box, video, maxVh) {
    if (!video.videoWidth || !video.videoHeight) return;
    const parent = box.parentElement;
    const cs = getComputedStyle(parent);
    const avail = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const r = Layout.containRect(video.videoWidth, video.videoHeight, avail, window.innerHeight * maxVh);
    box.style.width = `${Math.floor(r.width)}px`;
    box.style.height = `${Math.floor(r.height)}px`;
  }
  const fitLive = () => fitBox(els.viewfinder, els.live, 0.58);
  const fitClip = () => fitBox(els.clipPlayer, els.clipVideo, 0.52);
  const fitResult = () => fitBox(els.resultPlayer, els.resultVideo, 0.52);

  // ---------- 카메라 ----------

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCamMsg('이 브라우저에서는 카메라를 쓸 수 없어요. https 주소(또는 localhost)로 열어 주세요.', false);
      return;
    }
    if (!mimeType) {
      showCamMsg('이 브라우저는 영상 녹화(MediaRecorder)를 지원하지 않아요. 최신 Chrome이나 Safari에서 열어 주세요.', false);
      return;
    }
    stopCamera();
    const video = { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
    try {
      try {
        state.stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
      } catch (e) {
        if (e && e.name === 'NotAllowedError') throw e;
        // 마이크가 없거나 막힌 경우 → 소리 없이라도 찍을 수 있게
        state.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        toast('마이크 없이 녹화해요 (소리 없음)');
      }
    } catch (e) {
      showCamMsg(e && e.name === 'NotAllowedError'
        ? '카메라 권한이 막혀 있어요. 브라우저 설정에서 허용한 뒤 다시 눌러 주세요.'
        : '카메라를 켜지 못했어요. 다른 앱이 쓰고 있는지 확인해 주세요.', true);
      return;
    }
    els.live.srcObject = state.stream;
    const settings = state.stream.getVideoTracks()[0].getSettings();
    els.live.classList.toggle('mirror', settings.facingMode === 'user' || (!settings.facingMode && state.facing === 'user'));
    els.camMsg.hidden = true;
    els.recBtn.disabled = false;
    els.flipBtn.disabled = false;
    try { await els.live.play(); } catch (e) { /* autoplay 정책: 사용자가 누르면 재생됨 */ }
  }

  function stopCamera() {
    if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
    els.recBtn.disabled = true;
  }

  function showCamMsg(text, retry) {
    els.camMsgText.textContent = text;
    els.camStart.hidden = !retry;
    els.camMsg.hidden = false;
    els.recBtn.disabled = true;
    els.flipBtn.disabled = true;
  }

  els.live.addEventListener('loadedmetadata', fitLive);
  els.live.addEventListener('resize', fitLive);
  window.addEventListener('resize', () => { fitLive(); fitClip(); fitResult(); });

  // 실시간 미리보기 오버레이: 녹화 중엔 시작 시각, 아니면 현재 시각
  function liveLoop() {
    const at = state.recording ? state.recording.startedAt : Date.now();
    paintOverlay(els.liveOverlay, { stamp: Format.formatStamp(at), text: Clips.cleanText(els.caption.value), stampDir: state.prefs.stampDir });
    if (state.recording) {
      const { seconds } = state.recording;
      const left = seconds - (Date.now() - state.recording.startedAt) / 1000;
      els.recSec.textContent = Math.max(0, Math.ceil(left));
      const p = Math.min(1, 1 - left / seconds);
      els.recRing.style.strokeDashoffset = String(RING_LEN * (1 - p));
    }
    requestAnimationFrame(liveLoop);
  }

  // ---------- 녹화 ----------

  function captureThumb() {
    const v = els.live;
    if (!v.videoWidth) return Promise.resolve(null);
    const scale = 240 / Math.max(v.videoWidth, v.videoHeight);
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.75));
  }

  async function record() {
    if (state.recording || !state.stream || state.rendering) return;
    let recorder;
    try {
      recorder = new MediaRecorder(state.stream, { mimeType, videoBitsPerSecond: 4_000_000 });
    } catch (e) {
      toast('녹화를 시작하지 못했어요');
      return;
    }
    const chunks = [];
    const text = Clips.cleanText(els.caption.value);
    const width = els.live.videoWidth;
    const height = els.live.videoHeight;
    const thumbPromise = captureThumb();
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    const startedAt = Date.now();
    const { seconds } = state.prefs;
    state.recording = { startedAt, seconds };
    els.recSec.textContent = seconds;
    els.recBtn.classList.add('recording');
    els.recBadge.hidden = false;
    els.flipBtn.disabled = true;
    els.caption.disabled = true;
    setSegDisabled(true);

    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();
    setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, seconds * 1000);
    await stopped;
    const duration = Math.min(seconds, (Date.now() - startedAt) / 1000);

    state.recording = null;
    els.recBtn.classList.remove('recording');
    els.recRing.style.strokeDashoffset = String(RING_LEN);
    els.recBadge.hidden = true;
    els.flipBtn.disabled = false;
    els.caption.disabled = false;
    setSegDisabled(false);

    if (!chunks.length) {
      toast('녹화된 내용이 없어요. 다시 시도해 주세요');
      return;
    }
    const clip = {
      id: uid(),
      blob: new Blob(chunks, { type: (recorder.mimeType || mimeType).split(';')[0] }),
      type: recorder.mimeType || mimeType,
      thumb: await thumbPromise,
      recordedAt: startedAt,
      duration,
      width,
      height,
      text,
      order: state.clips.length,
    };
    state.clips = Clips.addClip(state.clips, clip);
    els.caption.value = '';
    render();
    try {
      await ClipDB.put(clip);
    } catch (e) {
      toast('저장 공간이 부족해서 클립을 보관하지 못했어요 (새로고침하면 사라져요)');
    }
    els.clipList.lastElementChild && els.clipList.lastElementChild.scrollIntoView({ behavior: 'smooth', inline: 'end', block: 'nearest' });
  }

  // ---------- 클립 목록 ----------

  function thumbUrl(clip) {
    if (!clip.thumb) return '';
    if (!thumbUrls.has(clip.id)) thumbUrls.set(clip.id, URL.createObjectURL(clip.thumb));
    return thumbUrls.get(clip.id);
  }

  function dropThumb(id) {
    if (thumbUrls.has(id)) URL.revokeObjectURL(thumbUrls.get(id));
    thumbUrls.delete(id);
  }

  function render() {
    const { clips } = state;
    els.clipCount.textContent = clips.length;
    els.clipTotal.textContent = Format.formatDuration(Clips.totalDuration(clips));
    els.clipEmpty.hidden = clips.length > 0;
    els.clearBtn.hidden = clips.length === 0;
    els.makeBtn.disabled = clips.length === 0 || state.rendering;
    els.makeBtn.textContent = clips.length ? `영상 만들기 · ${Format.formatDuration(Clips.totalDuration(clips))}` : '영상 만들기';
    els.nextHint.textContent = clips.length ? `${clips.length + 1}번째 클립` : `${state.prefs.seconds}초씩 녹화돼요`;
    els.recBtn.setAttribute('aria-label', `${state.prefs.seconds}초 녹화`);
    paintSeg(els.secondsSeg, String(state.prefs.seconds));
    paintSeg(els.stampSeg, state.prefs.stampDir);

    els.clipList.replaceChildren(...clips.map((clip, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'clip-card';
      btn.dataset.id = clip.id;
      btn.setAttribute('aria-label', `${i + 1}번째 클립, ${Format.formatClock(clip.recordedAt)}${clip.text ? `, ${clip.text}` : ''}`);
      const img = document.createElement('img');
      img.alt = '';
      const src = thumbUrl(clip);
      if (src) img.src = src;
      const num = document.createElement('span');
      num.className = 'clip-num';
      num.textContent = i + 1;
      const time = document.createElement('span');
      time.className = 'clip-time';
      time.textContent = Format.formatClock(clip.recordedAt);
      btn.append(img, num, time);
      if (clip.text) {
        const cap = document.createElement('span');
        cap.className = 'clip-text';
        cap.textContent = clip.text;
        btn.append(cap);
      }
      li.append(btn);
      return li;
    }));
  }

  els.clipList.addEventListener('click', (e) => {
    const card = e.target.closest('.clip-card');
    if (card) openClip(card.dataset.id);
  });

  async function persistOrder() {
    try { await ClipDB.putMany(state.clips); } catch (e) { toast('순서를 저장하지 못했어요'); }
  }

  // ---------- 클립 편집 시트 ----------

  let clipVideoUrl = null;
  let clipLoopRaf = 0;

  function editingClip() {
    return state.clips.find((c) => c.id === state.editingId);
  }

  function openClip(id) {
    const clip = state.clips.find((c) => c.id === id);
    if (!clip) return;
    state.editingId = id;
    if (clipVideoUrl) URL.revokeObjectURL(clipVideoUrl);
    clipVideoUrl = URL.createObjectURL(clip.blob);
    els.clipVideo.src = clipVideoUrl;
    els.clipCaption.value = clip.text;
    els.clipSheet.hidden = false;
    updateClipSheet();
    els.clipVideo.muted = false;
    els.clipVideo.play().catch(() => { els.clipVideo.muted = true; els.clipVideo.play().catch(() => {}); });
    cancelAnimationFrame(clipLoopRaf);
    const loop = () => {
      const c = editingClip();
      if (!c || els.clipSheet.hidden) return;
      paintOverlay(els.clipOverlay, { stamp: Format.formatStamp(c.recordedAt), text: Clips.cleanText(els.clipCaption.value), stampDir: state.prefs.stampDir });
      clipLoopRaf = requestAnimationFrame(loop);
    };
    loop();
  }

  function updateClipSheet() {
    const i = state.clips.findIndex((c) => c.id === state.editingId);
    const clip = state.clips[i];
    if (!clip) return;
    els.clipTitle.textContent = `${i + 1}번째 클립 · ${Format.formatClock(clip.recordedAt)}`;
    els.clipLeft.disabled = i === 0;
    els.clipRight.disabled = i === state.clips.length - 1;
  }

  async function closeClip() {
    const clip = editingClip();
    if (clip) {
      const next = Clips.setText(state.clips, clip.id, els.clipCaption.value);
      const updated = next.find((c) => c.id === clip.id);
      if (updated !== clip) {
        state.clips = next;
        try { await ClipDB.put(updated); } catch (e) { toast('문구를 저장하지 못했어요'); }
      }
    }
    state.editingId = null;
    els.clipSheet.hidden = true;
    els.clipVideo.pause();
    els.clipVideo.removeAttribute('src');
    els.clipVideo.load();
    if (clipVideoUrl) URL.revokeObjectURL(clipVideoUrl);
    clipVideoUrl = null;
    render();
  }

  els.clipVideo.addEventListener('loadedmetadata', fitClip);
  els.resultVideo.addEventListener('loadedmetadata', fitResult);

  function moveEditing(delta) {
    state.clips = Clips.moveClip(state.clips, state.editingId, delta);
    updateClipSheet();
    render();
    persistOrder();
  }

  els.clipLeft.addEventListener('click', () => moveEditing(-1));
  els.clipRight.addEventListener('click', () => moveEditing(1));
  els.clipCaption.addEventListener('input', () => limitLines(els.clipCaption));

  els.clipSave.addEventListener('click', async () => {
    const id = state.editingId;
    await closeClip(); // 고친 문구를 먼저 저장
    const i = state.clips.findIndex((c) => c.id === id);
    if (i >= 0) renderAndShow([state.clips[i]], `${i + 1}번째 클립`);
  });

  els.clipDelete.addEventListener('click', async () => {
    const id = state.editingId;
    if (!id || !confirm('이 클립을 삭제할까요?')) return;
    state.editingId = null;
    state.clips = Clips.removeClip(state.clips, id);
    dropThumb(id);
    await closeClip();
    try {
      await ClipDB.remove(id);
      await persistOrder();
    } catch (e) {
      toast('삭제를 저장하지 못했어요');
    }
  });

  els.clearBtn.addEventListener('click', async () => {
    if (!state.clips.length || !confirm(`클립 ${state.clips.length}개를 모두 지울까요?`)) return;
    state.clips.forEach((c) => dropThumb(c.id));
    state.clips = [];
    render();
    try { await ClipDB.clear(); } catch (e) { toast('지우기를 저장하지 못했어요'); }
  });

  // ---------- 영상 만들기 ----------

  /** clips를 (시각·문구를 입혀) 하나의 영상으로 렌더하고 결과 시트를 띄운다. 개별 클립 저장도 이걸 쓴다. */
  async function renderAndShow(clips, label) {
    if (!clips.length || state.rendering || state.recording) return;
    state.rendering = true;
    render();
    const single = clips.length === 1;
    const working = single
      ? '시각과 문구를 입히는 중이에요. 화면을 켜 둔 채로 기다려 주세요.'
      : '클립을 차례로 재생하면서 합치고 있어요. 화면을 켜 둔 채로 기다려 주세요.';
    els.renderTitle.textContent = single ? `${label} 만드는 중` : '영상 만드는 중';
    els.renderClose.hidden = true;
    els.renderProgress.hidden = false;
    els.renderResult.hidden = true;
    els.progressBar.style.width = '0%';
    els.progressText.textContent = working;
    els.renderSheet.hidden = false;

    let wakeLock = null;
    try { wakeLock = navigator.wakeLock ? await navigator.wakeLock.request('screen') : null; } catch (e) { /* 선택 기능 */ }

    // 렌더하는 동안 카메라를 꺼서 기기 부담을 줄인다
    stopCamera();
    const total = Clips.totalDuration(clips);
    try {
      resultBlob = await Merge.renderVlog(clips, {
        mimeType,
        stampDir: state.prefs.stampDir,
        onProgress: (p) => {
          els.progressBar.style.width = `${Math.round(p * 100)}%`;
          els.progressText.textContent = `${Format.formatDuration(p * total)} / ${Format.formatDuration(total)} · ${working}`;
        },
      });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(resultBlob);
      els.resultVideo.src = resultUrl;
      // 클립 하나면 그 클립의 촬영시각으로, 합친 영상이면 만든 시각으로 이름을 붙인다
      const name = Format.fileName(single ? clips[0].recordedAt : Date.now(), Clips.extForMime(resultBlob.type));
      resultFile = new File([resultBlob], name, { type: resultBlob.type });
      const canShareFile = !!(navigator.canShare && navigator.canShare({ files: [resultFile] }));
      // iOS는 공유 창의 '동영상 저장'이 사진 앱으로 가는 유일한 길이라 저장 버튼이 곧 공유다
      els.shareBtn.hidden = !canShareFile || isIOS;
      els.saveHint.textContent = isIOS && canShareFile
        ? '저장을 누른 뒤 공유 창에서 ‘동영상 저장’을 고르면 사진 앱에 들어가요.'
        : '기기의 다운로드 폴더에 저장돼요. 갤러리(사진) 앱에서 바로 볼 수 있어요.';
      els.renderTitle.textContent = `${single ? label : '완성'} · ${Format.formatDuration(total)}`;
      els.renderProgress.hidden = true;
      els.renderResult.hidden = false;
    } catch (e) {
      console.error(e);
      els.renderTitle.textContent = '만들지 못했어요';
      els.progressText.textContent = '영상을 만드는 중에 문제가 생겼어요. 다시 시도해 주세요.';
    } finally {
      state.rendering = false;
      els.renderClose.hidden = false;
      if (wakeLock) wakeLock.release().catch(() => {});
      render();
    }
  }

  function downloadFile(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function shareFile(file) {
    try {
      await navigator.share({ files: [file], title: '브이로그' });
      return true;
    } catch (e) {
      return e && e.name === 'AbortError'; // 사용자가 닫은 건 실패가 아니다
    }
  }

  async function saveToGallery() {
    if (!resultFile) return;
    if (isIOS && navigator.canShare && navigator.canShare({ files: [resultFile] })) {
      if (await shareFile(resultFile)) return;
    }
    downloadFile(resultFile);
    toast('저장했어요');
  }

  els.saveBtn.addEventListener('click', saveToGallery);
  els.shareBtn.addEventListener('click', () => { if (resultFile) shareFile(resultFile); });
  els.makeBtn.addEventListener('click', () => renderAndShow(state.clips));

  function closeRender() {
    if (state.rendering) return;
    els.renderSheet.hidden = true;
    els.resultVideo.pause();
    startCamera();
  }

  // ---------- 시트 공통 ----------

  for (const [sheet, close] of [[els.clipSheet, closeClip], [els.renderSheet, closeRender]]) {
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet || e.target.closest('[data-close]')) close();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!els.clipSheet.hidden) closeClip();
    else if (!els.renderSheet.hidden) closeRender();
  });

  // ---------- 시작 ----------

  els.recBtn.addEventListener('click', record);
  els.camStart.addEventListener('click', startCamera);
  els.flipBtn.addEventListener('click', () => {
    state.facing = state.facing === 'user' ? 'environment' : 'user';
    startCamera();
  });
  els.caption.addEventListener('input', () => limitLines(els.caption));

  // ---------- 설정 (길이 / 시각 방향) ----------

  function paintSeg(seg, value) {
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === value)));
  }

  function setSegDisabled(disabled) {
    els.secondsSeg.querySelectorAll('button').forEach((b) => { b.disabled = disabled; });
  }

  els.secondsSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || state.recording) return;
    state.prefs = Clips.normalizePrefs({ ...state.prefs, seconds: Number(b.dataset.value) });
    savePrefs();
    render();
  });

  els.stampSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.prefs = Clips.normalizePrefs({ ...state.prefs, stampDir: b.dataset.value });
    savePrefs();
    render();
  });

  // 백그라운드로 가면 카메라를 끄고, 돌아오면 다시 켠다 (배터리·다른 앱 카메라 점유 방지)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (!state.recording && !state.rendering) stopCamera();
    } else if (!state.stream && els.renderSheet.hidden && els.camMsg.hidden) {
      startCamera();
    }
  });

  els.recRing.style.strokeDasharray = String(RING_LEN);
  els.recRing.style.strokeDashoffset = String(RING_LEN);

  (async function init() {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    try {
      state.clips = Clips.renumber(Clips.sortClips(await ClipDB.all()));
    } catch (e) {
      toast('저장된 클립을 불러오지 못했어요');
    }
    render();
    requestAnimationFrame(liveLoop);
    startCamera();
  })();
})();
