// 클립 이어 붙이기. 각 클립을 순서대로 재생하면서 캔버스에 (영상 + 촬영시각 + 문구)를 그리고,
// 그 캔버스 화면과 클립 소리를 MediaRecorder로 다시 녹화한다. 외부 라이브러리 없이 되는 대신
// 영상 길이만큼(실시간) 걸린다. 클립 사이에는 녹화를 일시정지해 로딩 공백이 들어가지 않게 한다.
(function (root) {
  const { Layout, Overlay, Format } = root;
  const MAX_LONG_SIDE = 1280;
  const FPS = 30;

  function once(target, event) {
    return new Promise((resolve, reject) => {
      const ok = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(target.error || new Error(`${event} 실패`)); };
      const cleanup = () => {
        target.removeEventListener(event, ok);
        target.removeEventListener('error', fail);
      };
      target.addEventListener(event, ok);
      target.addEventListener('error', fail);
    });
  }

  function drawFrame(ctx, W, H, video, clip, stampDir) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (video.videoWidth) {
      const r = Layout.containRect(video.videoWidth, video.videoHeight, W, H);
      ctx.drawImage(video, r.x, r.y, r.width, r.height);
    }
    Overlay.drawOverlay(ctx, W, H, { stamp: Format.formatStamp(clip.recordedAt), text: clip.text, stampDir });
  }

  /** 끝날 때까지 프레임을 그린다. ended가 안 오는 브라우저를 위해 시간 기준 안전장치도 둔다. */
  function playThrough(video, clip, draw, onTime) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        resolve();
      };
      const tick = () => {
        if (done) return;
        draw();
        onTime(video.currentTime);
        if (Number.isFinite(video.duration) && video.currentTime >= video.duration - 0.03) finish();
        else requestAnimationFrame(tick);
      };
      const guard = setTimeout(finish, ((clip.duration || 5) + 3) * 1000);
      video.addEventListener('ended', finish, { once: true });
      video.play().then(() => requestAnimationFrame(tick), (e) => { done = true; clearTimeout(guard); reject(e); });
    });
  }

  /**
   * clips: 정렬된 클립 배열 (1개면 그 클립만 오버레이를 입혀 내보낸다)
   * mimeType: 결과 포맷, stampDir: 'horizontal' | 'vertical', onProgress(0..1)
   * → Promise<Blob>
   */
  async function renderVlog(clips, { mimeType, stampDir, onProgress }) {
    const first = clips[0];
    const { width: W, height: H } = Layout.outputSize(first.width || 720, first.height || 1280, MAX_LONG_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const AC = root.AudioContext || root.webkitAudioContext;
    const audio = new AC();
    await audio.resume();
    const dest = audio.createMediaStreamDestination();

    const stream = new MediaStream([
      ...canvas.captureStream(FPS).getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    // iOS Safari는 DOM에 붙지 않은 video의 프레임을 캔버스로 못 그리는 경우가 있어 숨겨서 붙여 둔다
    const host = document.createElement('div');
    host.className = 'render-host';
    document.body.appendChild(host);

    const total = clips.reduce((s, c) => s + (c.duration || 5), 0);
    let elapsed = 0;

    try {
      for (const clip of clips) {
        const url = URL.createObjectURL(clip.blob);
        const video = document.createElement('video');
        video.playsInline = true;
        video.preload = 'auto';
        video.src = url;
        host.appendChild(video);
        try {
          await once(video, 'loadeddata');
          // 오디오 그래프로 보낸 소리는 스피커로 나가지 않는다 (녹화에만 들어감)
          const source = audio.createMediaElementSource(video);
          source.connect(dest);
          drawFrame(ctx, W, H, video, clip, stampDir);
          if (recorder.state === 'inactive') recorder.start(1000);
          else recorder.resume();
          await playThrough(
            video, clip,
            () => drawFrame(ctx, W, H, video, clip, stampDir),
            (t) => onProgress && onProgress(Math.min(1, (elapsed + t) / total)),
          );
          recorder.pause();
          source.disconnect();
          elapsed += clip.duration || 5;
        } finally {
          video.pause();
          video.removeAttribute('src');
          video.load();
          video.remove();
          URL.revokeObjectURL(url);
        }
      }
      const stopped = once(recorder, 'stop');
      recorder.stop();
      await stopped;
    } finally {
      stream.getTracks().forEach((t) => t.stop());
      host.remove();
      audio.close();
    }
    onProgress && onProgress(1);
    return new Blob(chunks, { type: (recorder.mimeType || mimeType).split(';')[0] });
  }

  root.Merge = { renderVlog };
})(typeof self !== 'undefined' ? self : this);
