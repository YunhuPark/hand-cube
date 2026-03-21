/**
 * gpuCompute.js — GPGPU 유체 파티클 시뮬레이션 모듈
 * 
 * GPUComputationRenderer를 사용하여 Position/Velocity 텍스처를
 * FBO(Framebuffer Object)에 저장하고, 각 프레임마다 GLSL 셰이더로
 * 50,000개 이상의 파티클을 GPU 병렬 연산합니다.
 * 
 * 텍스처 크기: 256x256 = 65,536 파티클 (≈ Python 5,000개의 13배)
 */

import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

import velocityShader from './shaders/velocity.glsl?raw';
import positionShader from './shaders/position.glsl?raw';

// ── 파티클 텍스처 크기 (WIDTH × WIDTH = 총 파티클 수) ──
// 모바일: 128×128 = 16,384 / 데스크톱: 256×256 = 65,536
const _isMobile = /Mobi|Android/i.test(navigator.userAgent);
export const PARTICLE_TEX_WIDTH = _isMobile ? 128 : 256;
export const PARTICLE_COUNT = PARTICLE_TEX_WIDTH * PARTICLE_TEX_WIDTH;

let gpuCompute = null;
let positionVariable = null;
let velocityVariable = null;

// ── Burst 상태 (beat onset 시 triggerBurst()로 설정, 매 프레임 감쇠) ──
let _burstStrength = 0.0;
const BURST_DECAY = 0.80; // 빠른 감쇠: 폭발 후 즉시 소멸

/**
 * Beat onset 시 파티클 버스트를 트리거합니다.
 * @param {number} strength - 버스트 강도 (0.0~1.0)
 */
export function triggerBurst(strength) {
    _burstStrength = Math.min(strength, 0.12); // 상한 제한 (경계 이탈 방지)
}

// ── Uniforms (매 프레임 CPU에서 업데이트) ──
const uniforms = {
    cubeRotation: new THREE.Matrix3(),
    cubeRotationInverse: new THREE.Matrix3(),
    noiseScale: 1.0,
    noiseStrength: 0.030,  // 난류 증가: 파티클이 공간 전체를 채움
    damping: 0.978,
    gravityAccel: -0.0010, // 중력 약화: 바닥 쏠림 방지 (-0.003 → -0.001)
    bound: 0.95,
    time: 0,
};

/**
 * GPUComputationRenderer를 초기화합니다.
 * @param {THREE.WebGLRenderer} renderer
 */
export function initGPUCompute(renderer) {
    gpuCompute = new GPUComputationRenderer(PARTICLE_TEX_WIDTH, PARTICLE_TEX_WIDTH, renderer);

    // ── 초기 텍스처 데이터 (파티클 위치/속도) ──
    const posTexture = gpuCompute.createTexture();
    const velTexture = gpuCompute.createTexture();

    // 위치: 큐브 상단 집중 스폰 (폭포 시작점)
    const posData = posTexture.image.data;
    const isHalfFloat = posData.constructor.name === 'Uint16Array';

    for (let i = 0; i < posData.length; i += 4) {
        const px = Math.random() * 1.9 - 0.95;
        const py = Math.random() * 1.9 - 0.95;
        const pz = Math.random() * 1.9 - 0.95;

        if (isHalfFloat) {
            posData[i + 0] = THREE.DataUtils.toHalfFloat(px);
            posData[i + 1] = THREE.DataUtils.toHalfFloat(py);
            posData[i + 2] = THREE.DataUtils.toHalfFloat(pz);
            posData[i + 3] = THREE.DataUtils.toHalfFloat(1.0);
        } else {
            posData[i + 0] = px;
            posData[i + 1] = py;
            posData[i + 2] = pz;
            posData[i + 3] = 1.0;
        }
    }

    // 속도: 초기 정지
    const velData = velTexture.image.data;
    for (let i = 0; i < velData.length; i += 4) {
        velData[i + 0] = isHalfFloat ? THREE.DataUtils.toHalfFloat(0.0) : 0.0;
        velData[i + 1] = isHalfFloat ? THREE.DataUtils.toHalfFloat(0.0) : 0.0;
        velData[i + 2] = isHalfFloat ? THREE.DataUtils.toHalfFloat(0.0) : 0.0;
        velData[i + 3] = isHalfFloat ? THREE.DataUtils.toHalfFloat(1.0) : 1.0;
    }

    // ── GPGPU 변수(Variable) 등록 ──
    velocityVariable = gpuCompute.addVariable('textureVelocity', velocityShader, velTexture);
    positionVariable = gpuCompute.addVariable('texturePosition', positionShader, posTexture);

    // 의존성: Velocity 셰이더는 Position/Velocity 둘 다 읽어야 함
    gpuCompute.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable]);
    gpuCompute.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);

    // ── Velocity 셰이더 Uniform 바인딩 ──
    const velUniformsInit = velocityVariable.material.uniforms;
    velUniformsInit.cubeRotation = { value: uniforms.cubeRotation };
    velUniformsInit.cubeRotationInverse = { value: uniforms.cubeRotationInverse };
    velUniformsInit.noiseScale = { value: uniforms.noiseScale };
    velUniformsInit.noiseStrength = { value: uniforms.noiseStrength };
    velUniformsInit.damping = { value: uniforms.damping };
    velUniformsInit.gravityAccel = { value: uniforms.gravityAccel };
    velUniformsInit.bound = { value: uniforms.bound };
    velUniformsInit.time = { value: 0 };
    velUniformsInit.uResolution    = { value: new THREE.Vector2(PARTICLE_TEX_WIDTH, PARTICLE_TEX_WIDTH) };
    velUniformsInit.uBurstStrength = { value: 0.0 };
    velUniformsInit.uHandPos       = { value: new THREE.Vector3() };
    velUniformsInit.uHandRepulse   = { value: 0.0 };
    velUniformsInit.uGrabActive    = { value: 0.0 }; // 손/터치 Grab → 중력 OFF

    // ── Position 셰이더 Uniform 바인딩 ──
    const posUniforms = positionVariable.material.uniforms;
    posUniforms.bound      = { value: uniforms.bound };
    posUniforms.time       = { value: 0 };
    posUniforms.uResolution = { value: new THREE.Vector2(PARTICLE_TEX_WIDTH, PARTICLE_TEX_WIDTH) };

    // ── 초기화 실행 ──
    const error = gpuCompute.init();
    if (error !== null) {
        console.error('[GPUCompute] Initialization error:', error);
        return;
    }

    console.log(`[GPUCompute] Initialized with ${PARTICLE_COUNT.toLocaleString()} particles (${PARTICLE_TEX_WIDTH}×${PARTICLE_TEX_WIDTH} texture).`);
}

/**
 * 매 프레임 호출하여 GPGPU 물리 시뮬레이션을 실행합니다.
 * @param {THREE.Matrix3} cubeRotMat3 — 큐브의 현재 3x3 회전행렬
 * @param {number} elapsed — 누적 경과 시간 (초)
 * @param {number} bassLevel — 오디오 bass 에너지 0.0~1.0 (없으면 0)
 * @param {THREE.Vector3|null} handPos — 손 월드 좌표 (없으면 null)
 */
export function updateGPUCompute(cubeRotMat3, elapsed, bassLevel = 0, handPos = null, grabActive = false, midLevel = 0) {
    if (!gpuCompute) return;

    // Velocity 셰이더의 유니폼 업데이트
    const velUniforms = velocityVariable.material.uniforms;
    velUniforms.cubeRotation.value.copy(cubeRotMat3);
    velUniforms.cubeRotationInverse.value.copy(cubeRotMat3).transpose();
    velUniforms.time.value = elapsed;

    // 오디오 bass + mid에 따라 noiseStrength / gravityAccel 변조
    velUniforms.noiseStrength.value = uniforms.noiseStrength + bassLevel * 0.025 + midLevel * 0.015;
    velUniforms.gravityAccel.value  = uniforms.gravityAccel  - bassLevel * 0.002;
    velUniforms.uGrabActive.value   = grabActive ? 1.0 : 0.0;

    // 버스트 이펙트 (매 프레임 감쇠)
    velUniforms.uBurstStrength.value = _burstStrength;
    _burstStrength *= BURST_DECAY;

    // 손 물리력 (감지된 경우에만 활성화)
    if (handPos) {
        velUniforms.uHandPos.value.copy(handPos);
        velUniforms.uHandRepulse.value = 0.08;
    } else {
        velUniforms.uHandRepulse.value = 0.0;
    }

    // Position 셰이더(리스폰) 시간 업데이트
    positionVariable.material.uniforms.time.value = elapsed;

    // GPGPU 1스텝 실행 (GPU에서 병렬 연산)
    gpuCompute.compute();
}

/**
 * 현재 파티클 위치 텍스처를 반환합니다.
 * (Particle Renderer에서 읽기 위해 사용)
 * @returns {THREE.Texture|null}
 */
export function getPositionTexture() {
    if (!gpuCompute) return null;
    return gpuCompute.getCurrentRenderTarget(positionVariable).texture;
}

/**
 * 현재 파티클 속도 텍스처를 반환합니다.
 * (색상 다이내믹스 등에 활용)
 * @returns {THREE.Texture|null}
 */
export function getVelocityTexture() {
    if (!gpuCompute) return null;
    return gpuCompute.getCurrentRenderTarget(velocityVariable).texture;
}
