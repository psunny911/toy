// 터치 좌표 기반 제스처 판별(탭/팬/핀치) — 순수 함수, DOM 이벤트 객체에 의존하지 않는다.
// 호출부에서 TouchEvent를 { x, y } 포인트 배열로 변환해 넘긴다.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Gestures = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const TAP_MOVE_THRESHOLD_PX = 8;

  function distance(pointA, pointB) {
    return Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
  }

  function midpoint(pointA, pointB) {
    return { x: (pointA.x + pointB.x) / 2, y: (pointA.y + pointB.y) / 2 };
  }

  /** 시작/종료 지점 사이 이동 거리가 임계값보다 작으면 탭으로 판단 */
  function isTap(startPoint, endPoint, thresholdPx) {
    if (thresholdPx === undefined) thresholdPx = TAP_MOVE_THRESHOLD_PX;
    return distance(startPoint, endPoint) <= thresholdPx;
  }

  /** 핀치 시작 대비 현재 두 손가락 간 거리 비율만큼 시작 줌에 곱해 새 줌을 계산 */
  function computeZoomFromPinch(startZoom, startDistancePx, currentDistancePx) {
    if (startDistancePx <= 0) return startZoom;
    const ratio = currentDistancePx / startDistancePx;
    return startZoom * ratio;
  }

  return { TAP_MOVE_THRESHOLD_PX, distance, midpoint, isTap, computeZoomFromPinch };
});
