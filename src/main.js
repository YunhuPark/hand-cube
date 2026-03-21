/**
 * main.js — 앱 오케스트레이터
 */

import * as THREE from 'three';
import { scene, camera, renderer, updateNebula, setNebulaThemeColor } from './scene.js';
import { createGlassCube, setCubeEdgeColor, setCubeInnerLightColor, setCubeInnerLightIntensity, setCubeEmissiveIntensity, setCubeEmissiveColor, setCubeInnerVolColor, setCubeFresnelColor, setCubeCornerColor, updateGlassCube } from './glassCube.js';
import { initHandTracking, updateHandTracking, handState } from './handTracking.js';
import { initGPUCompute, updateGPUCompute, getPositionTexture, getVelocityTexture } from './gpuCompute.js';
import { createParticles, updateParticles, updateParticleTheme, setParticlePointSize } from './particles.js';
import { initPostProcessing, resizePostProcessing, renderPostProcessing, setCAStrength, setGodRayExposure } from './postProcessing.js';
import { initTouchControls, touchState } from './touchControls.js';
import { THEMES, setTheme } from './colorTheme.js';

// ─── 유리 큐브 ───
const glassCube = createGlassCube(2);
scene.add(glassCube);

// ─── 파티클 시스템 (Points + Streaks) ───
const { points: particles } = createParticles();
glassCube.add(particles);

// ─── GPGPU 초기화 ───
initGPUCompute(renderer);

// ─── 포스트프로세싱 초기화 ───
initPostProcessing(renderer, scene, camera);

// ─── 터치 컨트롤 초기화 ───
initTouchControls();

// ─── 리사이즈 핸들러 ───
window.addEventListener('resize', () => {
    resizePostProcessing(window.innerWidth, window.innerHeight);
});

// ─── 테마 전환 헬퍼 ───
const _edgeColorMap = {
    lava: [1.8, 0.55, 0.08],
    ocean: [0.05, 1.2, 2.0],
    forest: [0.25, 2.0, 0.18],
    ghost: [1.4, 0.5, 2.5],
    plasma: [1.6, 0.1, 2.2],
    ice: [0.2, 1.8, 2.5],
    sunset: [2.0, 0.7, 0.05],
    void: [0.5, 0.0, 1.8],
};

const _themeHudNames = {
    lava: 'LAVA', ocean: 'OCEAN', forest: 'FOREST', ghost: 'GHOST',
    plasma: 'PLASMA', ice: 'ICE', sunset: 'SUNSET', void: 'VOID',
};

function applyTheme(name) {
    if (!THEMES[name]) return;
    setTheme(name);
    const t = THEMES[name];
    updateParticleTheme(t.slow, t.fast);
    setNebulaThemeColor(...t.fast);
    setCubeEdgeColor(..._edgeColorMap[name]);
    setCubeInnerLightColor(...t.fast);
    setCubeEmissiveColor(...t.fast);
    setCubeInnerVolColor(...t.fast);
    setCubeFresnelColor(...t.fast);
    setCubeCornerColor(..._edgeColorMap[name]);  // 코너 스파크 테마 연동
    const hudTheme = document.getElementById('hud-theme');
    if (hudTheme) hudTheme.textContent = _themeHudNames[name] ?? name.toUpperCase();
}

// ─── 키보드: 색상 테마 전환 (1~8) ───
window.addEventListener('keydown', (e) => {
    const themeMap = {
        '1': 'lava', '2': 'ocean', '3': 'forest', '4': 'ghost',
        '5': 'plasma', '6': 'ice', '7': 'sunset', '8': 'void',
    };
    if (themeMap[e.key]) applyTheme(themeMap[e.key]);
});

// ─── GC 최소화 재사용 객체 ───
const clock = { elapsed: 0, delta: 0, last: performance.now() };
const _rotMatrix3 = new THREE.Matrix3();

// ─── 시네마틱 인트로 상태 ───
const introState = {
    active: true,
    elapsed: 0,
    duration: 3.0,
    camStartZ: 16.0,
    camEndZ: 4.8,
    fovStart: 25.0,
    fovEnd: 65.0,
};

// ─── 손 추적 상태 HUD ───
const _handDot  = document.getElementById('hand-status-dot');
const _handText = document.getElementById('hand-status-text');
function _setHandStatus(state, text) {
    if (_handDot)  { _handDot.className  = `hand-dot hand-dot--${state}`; }
    if (_handText) { _handText.className = `hand-status-text hand-status-text--${state}`; _handText.textContent = text; }
}

// ─── 손 추적 비동기 초기화 ───
let handTrackingReady = false;
initHandTracking()
    .then(() => {
        handTrackingReady = true;
        _setHandStatus('ready', 'SHOW YOUR HAND');
    })
    .catch((err) => {
        console.warn('[Main] Hand tracking unavailable:', err.message);
        _setHandStatus('error', 'WEBCAM UNAVAILABLE');
    });

// ─── 애니메이션 루프 ───
function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    clock.delta = Math.min((now - clock.last) * 0.001, 0.05);
    clock.last = now;
    clock.elapsed += clock.delta;

    // ── 시네마틱 인트로 처리 ──
    if (introState.active) {
        introState.elapsed += clock.delta;
        const t = Math.min(introState.elapsed / introState.duration, 1.0);
        const ease = 1.0 - Math.pow(1.0 - t, 3.0);

        camera.position.z = introState.camStartZ + (introState.camEndZ - introState.camStartZ) * ease;
        camera.fov = introState.fovStart + (introState.fovEnd - introState.fovStart) * ease;
        camera.updateProjectionMatrix();

        glassCube.rotation.y = clock.elapsed * 0.3;
        glassCube.rotation.x = Math.sin(clock.elapsed * 0.2) * 0.15;

        _rotMatrix3.setFromMatrix4(glassCube.matrixWorld);
        updateGPUCompute(_rotMatrix3, clock.elapsed, 0, null, false);
        const posTex = getPositionTexture();
        const velTex = getVelocityTexture();
        if (posTex && velTex) updateParticles(posTex, velTex);

        updateGlassCube(clock.elapsed);
        updateNebula(clock.elapsed, 0);
        renderPostProcessing();

        if (t >= 1.0) {
            introState.active = false;
            camera.position.z = introState.camEndZ;
            camera.fov = introState.fovEnd;
            camera.updateProjectionMatrix();
        }
        return;
    }

    // ── 손 추적 업데이트 ──
    if (handTrackingReady) {
        updateHandTracking(clock.delta);
        if (handState.detected) {
            _setHandStatus('active', 'HAND DETECTED');
        } else {
            _setHandStatus('ready', 'SHOW YOUR HAND');
        }
    }

    // ── 큐브 회전/스케일 적용 ──
    const grabActive = (handTrackingReady && handState.detected) || touchState.active;

    if (handTrackingReady && handState.detected) {
        glassCube.quaternion.copy(handState.currentQuaternion);
        glassCube.scale.setScalar(handState.currentScale);
    } else if (touchState.active) {
        glassCube.quaternion.copy(touchState.currentQuaternion);
        glassCube.scale.setScalar(touchState.currentScale);
    } else {
        glassCube.rotation.y = clock.elapsed * 0.3;
        glassCube.rotation.x = Math.sin(clock.elapsed * 0.2) * 0.15;
        glassCube.scale.setScalar(1.0);
    }

    // ── GPGPU 물리 시뮬레이션 ──
    _rotMatrix3.setFromMatrix4(glassCube.matrixWorld);
    const handPos = (handTrackingReady && handState.detected) ? handState.worldPos : null;
    updateGPUCompute(_rotMatrix3, clock.elapsed, 0, handPos, grabActive, 0);

    // ── 파티클 텍스처 바인딩 ──
    const posTex = getPositionTexture();
    const velTex = getVelocityTexture();
    if (posTex && velTex) updateParticles(posTex, velTex);

    // ── 파티클 크기 (고정) ──
    setParticlePointSize(0.020);

    // ── 내부 조명 맥동 — 범위 [0.85, 1.30] (큐브 가시성 우선) ──
    const _lightPulse = 0.85 + Math.sin(clock.elapsed * 1.7) * 0.15 + Math.sin(clock.elapsed * 3.3) * 0.07;
    setCubeInnerLightIntensity(_lightPulse * 1.2);

    // ── Emissive 맥동 ──
    setCubeEmissiveIntensity(0.04 + _lightPulse * 0.028);

    // ── 엣지 흐름 애니메이션 ──
    updateGlassCube(clock.elapsed);

    // ── God Rays 강도 ──
    setGodRayExposure(0.018 + Math.sin(clock.elapsed * 1.4) * 0.005);

    // ── 크로마틱 어버레이션 ──
    setCAStrength(0.006);

    // ── 네뷸라 배경 업데이트 ──
    updateNebula(clock.elapsed, 0);

    // ── 렌더 ──
    renderPostProcessing();
}

// ─── 기본 테마: LAVA ───
applyTheme('lava');

// ─── 시작 ───
animate();
console.log('[Hand-Cube] Loaded.');
