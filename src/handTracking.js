/**
 * handTracking.js — MediaPipe HandLandmarker 웹 통합 모듈
 * 
 * 수학/렌더링 기법 브리핑:
 * ─────────────────────────
 * 1. 손 회전 → 큐브 회전 매핑:
 *    - 랜드마크 0(손목), 5(검지 MCP), 9(중지 MCP), 17(소지 MCP)에서
 *      손바닥의 로컬 좌표축 3개(X, Y, Z)를 추출합니다.
 *    - 이 3축으로 3x3 회전행렬을 구성한 뒤, Three.js의 Quaternion으로
 *      변환하여 큐브에 적용합니다.
 *    - 보간(Slerp)을 사용해 떨림 없는 부드러운 회전을 구현합니다.
 * 
 * 2. 핀치(Pinch) → 스케일 제어:
 *    - 엄지(4)와 검지(8)의 3D 유클리드 거리를 실시간으로 계산합니다.
 *    - 이 거리를 [0.3, 2.5] 범위의 균일한 스케일 값으로 매핑한 뒤,
 *      Lerp(선형 보간)을 적용하여 부드럽게 스케일을 변화시킵니다.
 * 
 * GC 최소화: 매 프레임 벡터/쿼터니언 객체를 new로 생성하지 않고,
 * 모듈 스코프에 미리 할당한 객체를 재사용합니다.
 */

import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as THREE from 'three';

// ─── 외부 노출 상태 (매 프레임 업데이트) ───
export const handState = {
    detected: false,
    targetQuaternion: new THREE.Quaternion(),   // 목표 회전
    currentQuaternion: new THREE.Quaternion(),  // 보간된 현재 회전
    targetScale: 1.0,                          // 목표 스케일
    currentScale: 1.0,                         // 보간된 현재 스케일
    worldPos: new THREE.Vector3(),             // 손 중심의 3D 근사 위치 (월드 좌표)
};

// ─── GC 최소화를 위한 재사용 벡터/행렬 ───
const _v0 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v9 = new THREE.Vector3();
const _v17 = new THREE.Vector3();
const _vX = new THREE.Vector3();
const _vY = new THREE.Vector3();
const _vZ = new THREE.Vector3();
const _rotMatrix = new THREE.Matrix4();

let handLandmarker = null;
let videoElement = null;
let lastTimestamp = -1;

/**
 * MediaPipe HandLandmarker를 초기화하고 웹캠 스트림을 연결합니다.
 * @returns {Promise<void>}
 */
export async function initHandTracking() {
    // MediaPipe WASM 런타임 로드
    const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    // HandLandmarker 생성
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 1
    });

    // 웹캠 스트림 연결
    videoElement = document.getElementById('webcam');
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
    });
    videoElement.srcObject = stream;

    await new Promise((resolve) => {
        videoElement.onloadeddata = resolve;
    });

    console.log('[HandTracking] MediaPipe HandLandmarker initialized.');
}

/**
 * 매 프레임 호출하여 손 추적 결과를 갱신합니다.
 * @param {number} delta - 프레임 델타 타임 (초)
 */
export function updateHandTracking(delta) {
    if (!handLandmarker || !videoElement || videoElement.readyState < 2) return;

    // MediaPipe는 동일 타임스탬프에 중복 호출하면 에러를 뱉으므로 방어
    const timestamp = performance.now();
    if (timestamp === lastTimestamp) return;
    lastTimestamp = timestamp;

    const results = handLandmarker.detectForVideo(videoElement, timestamp);

    if (results.landmarks && results.landmarks.length > 0) {
        const lm = results.landmarks[0];
        handState.detected = true;

        // ── 1. 손 회전행렬 → Quaternion 변환 ──
        // 기존 Python get_hand_rotation()과 동일한 수학
        _v0.set(lm[0].x, lm[0].y, lm[0].z);
        _v9.set(lm[9].x, lm[9].y, lm[9].z);
        _v5.set(lm[5].x, lm[5].y, lm[5].z);
        _v17.set(lm[17].x, lm[17].y, lm[17].z);

        // Y축: 손목(0) → 중지 MCP(9)
        _vY.subVectors(_v9, _v0).normalize();

        // X축: 소지 MCP(17) → 검지 MCP(5)
        _vX.subVectors(_v5, _v17).normalize();

        // Z축: X × Y (손바닥 법선)
        _vZ.crossVectors(_vX, _vY).normalize();

        // X축 재직교화: Y × Z
        _vX.crossVectors(_vY, _vZ).normalize();

        // 회전행렬 구성 (Column-major for Three.js Matrix4)
        _rotMatrix.set(
            _vX.x, _vY.x, _vZ.x, 0,
            _vX.y, _vY.y, _vZ.y, 0,
            _vX.z, _vY.z, _vZ.z, 0,
            0, 0, 0, 1
        );

        handState.targetQuaternion.setFromRotationMatrix(_rotMatrix);

        // ── 2. 손 중심 3D 위치 계산 (lm[9] = 중지 MCP, 손 중심에 가장 가까움) ──
        // MediaPipe normalized [0,1] → NDC [-1,1] → Three.js world coords 근사
        const lm9 = lm[9];
        const ndcX =   lm9.x * 2.0 - 1.0;
        const ndcY = -(lm9.y * 2.0 - 1.0); // y는 상하 반전
        // fov=45, z=4 평면에 투영: tan(22.5°) * 4 ≈ 1.657
        const halfH = Math.tan(THREE.MathUtils.degToRad(22.5)) * 4.0;
        const halfW = halfH * (window.innerWidth / window.innerHeight);
        handState.worldPos.set(ndcX * halfW, ndcY * halfH, 0.0);

        // ── 3. 핀치(Pinch) → 스케일 ──
        // 엄지(4)와 검지(8) 사이의 3D 거리
        const dx = lm[4].x - lm[8].x;
        const dy = lm[4].y - lm[8].y;
        const dz = lm[4].z - lm[8].z;
        const pinchDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // 거리를 스케일로 매핑 (Python: pinch_dist * 5.0, clamp [0.2, 2.0])
        handState.targetScale = Math.max(0.3, Math.min(pinchDist * 5.0, 2.5));
    } else {
        handState.detected = false;
    }

    // ── 보간 (Slerp / Lerp) : 떨림 없는 부드러운 움직임 ──
    const rotLerp = 1.0 - Math.pow(0.001, delta); // ~0.15 at 60fps
    const scaleLerp = 1.0 - Math.pow(0.01, delta); // ~0.08 at 60fps

    handState.currentQuaternion.slerp(handState.targetQuaternion, rotLerp);
    handState.currentScale += (handState.targetScale - handState.currentScale) * scaleLerp;
}
