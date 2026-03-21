/**
 * touchControls.js — 모바일 터치 입력으로 큐브 회전/스케일 제어
 *
 * - 단일 터치 드래그: 큐브 쿼터니언 회전
 * - 두 손가락 핀치: 큐브 스케일 (0.3 ~ 2.5)
 * 손 추적(MediaPipe)이 비활성화된 환경의 fallback 입력입니다.
 */

import * as THREE from 'three';

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _qDelta = new THREE.Quaternion();

export const touchState = {
  active: false,
  currentQuaternion: new THREE.Quaternion(),
  currentScale: 1.0,
};

let _prevTouch1 = null;
let _prevTouch2 = null;
let _prevPinchDist = null;

function getTouchPos(touch) {
  return { x: touch.clientX, y: touch.clientY };
}

function getPinchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function onTouchStart(e) {
  if (e.touches.length === 1) {
    _prevTouch1 = getTouchPos(e.touches[0]);
    _prevTouch2 = null;
    _prevPinchDist = null;
  } else if (e.touches.length === 2) {
    _prevTouch1 = getTouchPos(e.touches[0]);
    _prevTouch2 = getTouchPos(e.touches[1]);
    _prevPinchDist = getPinchDist(e.touches[0], e.touches[1]);
  }
  touchState.active = true;
}

function onTouchMove(e) {
  e.preventDefault();

  if (e.touches.length === 1 && _prevTouch1) {
    const cur = getTouchPos(e.touches[0]);
    const dx = cur.x - _prevTouch1.x;
    const dy = cur.y - _prevTouch1.y;

    // 드래그 → 회전 (화면 픽셀 → 라디안)
    _euler.setFromQuaternion(touchState.currentQuaternion);
    _euler.y += dx * 0.005;
    _euler.x += dy * 0.005;
    _euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, _euler.x));
    touchState.currentQuaternion.setFromEuler(_euler);

    _prevTouch1 = cur;
  } else if (e.touches.length === 2 && _prevPinchDist !== null) {
    const curDist = getPinchDist(e.touches[0], e.touches[1]);
    const ratio = curDist / _prevPinchDist;
    touchState.currentScale = Math.max(0.3, Math.min(2.5, touchState.currentScale * ratio));
    _prevPinchDist = curDist;

    // 핀치 중에도 회전 가능
    const cur1 = getTouchPos(e.touches[0]);
    if (_prevTouch1) {
      const dx = cur1.x - _prevTouch1.x;
      const dy = cur1.y - _prevTouch1.y;
      _euler.setFromQuaternion(touchState.currentQuaternion);
      _euler.y += dx * 0.003;
      _euler.x += dy * 0.003;
      touchState.currentQuaternion.setFromEuler(_euler);
    }
    _prevTouch1 = cur1;
  }
}

function onTouchEnd(e) {
  if (e.touches.length === 0) {
    touchState.active = false;
    _prevTouch1 = null;
    _prevTouch2 = null;
    _prevPinchDist = null;
  }
}

export function initTouchControls() {
  window.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: false });
}
