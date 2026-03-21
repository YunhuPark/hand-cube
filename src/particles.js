/**
 * particles.js — GPGPU 파티클 렌더러 모듈
 *
 * 렌더링 요소:
 * 1. Points (3-Layer Glow Dots) — 3중 가우시안 글로우, 화이트-핫 속도 색상
 * 2. LineSegments (Velocity Streaks) — 10× 길이 속도 꼬리, 에너지 방전 필라멘트
 */

import * as THREE from 'three';
import { PARTICLE_TEX_WIDTH, PARTICLE_COUNT } from './gpuCompute.js';

let particlePoints  = null;
let particleStreaks = null;

// ── Vertex Shader (Points) ──
const particleVertexShader = /* glsl */`
  uniform sampler2D texturePosition;
  uniform sampler2D textureVelocity;
  uniform float pointSize;

  attribute vec2 reference;

  varying float vSpeed;
  varying float vLife;

  void main() {
    vec4 posData = texture2D(texturePosition, reference);
    vec3 pos = posData.xyz;
    float life = posData.w;
    vec3 vel = texture2D(textureVelocity, reference).xyz;

    vSpeed = length(vel);
    vLife  = life;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = pointSize * (800.0 / -mvPosition.z) * 3.2;
  }
`;

// ── Fragment Shader (Points) — 3-레이어 Gaussian + 화이트-핫 속도 색상 ──
const particleFragmentShader = /* glsl */`
  uniform vec3 uSlowColor;
  uniform vec3 uFastColor;
  uniform vec3 uWhiteColor;

  varying float vSpeed;
  varying float vLife;

  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    if (dist > 0.5) discard;

    // 3중 글로우: 핵(tight) + 중간 후광 + 넓은 성운 아우라
    float inner = exp(-dist * dist * 60.0);          // 밝고 선명한 핵
    float mid   = exp(-dist * dist * 15.0) * 0.45;   // 중간 후광
    float outer = exp(-dist * dist * 4.5)  * 0.18;   // 넓은 성운 아우라
    float alpha = max(inner, max(mid, outer));

    float speedFactor = clamp(vSpeed * 25.0, 0.0, 1.0);
    // hotFactor: 극한 속도에서만 활성화 → 백열 플라즈마
    float hotFactor   = clamp(vSpeed * 40.0 - 0.5, 0.0, 1.0);

    vec3 coreColor = mix(uFastColor, uWhiteColor, hotFactor);
    vec3 haloColor = mix(uSlowColor, uFastColor, speedFactor * 0.5);
    vec3 color = mix(haloColor, coreColor, inner / max(alpha, 0.001));

    // life 기반 페이드
    float lifeFade = mix(0.10, 1.0, clamp(vLife, 0.0, 1.0));

    gl_FragColor = vec4(color, alpha * 0.62 * lifeFade);
  }
`;

// ── Vertex Shader (Streak Lines) ──
const streakVertexShader = /* glsl */`
  uniform sampler2D texturePosition;
  uniform sampler2D textureVelocity;
  uniform float uStreakLength;

  attribute vec2 reference;
  attribute float vertexIndex;

  varying float vSpeed;
  varying float vAlpha;

  void main() {
    vec4 posData = texture2D(texturePosition, reference);
    vec3 pos = posData.xyz;
    vec3 vel = texture2D(textureVelocity, reference).xyz;

    float speed = length(vel);
    vSpeed = speed;

    vec3 worldPos = (vertexIndex > 0.5)
      ? pos
      : pos - vel * uStreakLength;

    // alpha: 0.50 → 0.75 (더 강렬한 필라멘트)
    vAlpha = (vertexIndex > 0.5) ? clamp(speed * 22.0, 0.0, 0.75) : 0.0;

    vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// ── Fragment Shader (Streak Lines) ──
const streakFragmentShader = /* glsl */`
  uniform vec3 uSlowColor;
  uniform vec3 uFastColor;

  varying float vSpeed;
  varying float vAlpha;

  void main() {
    float speedFactor = clamp(vSpeed * 25.0, 0.0, 1.0);
    vec3 color = mix(uSlowColor, uFastColor, speedFactor);
    gl_FragColor = vec4(color, vAlpha);
  }
`;

/**
 * 파티클 Points + Streak LineSegments 생성
 */
export function createParticles() {
  // ── Points Geometry ──
  const geo = new THREE.BufferGeometry();

  const positions  = new Float32Array(PARTICLE_COUNT * 3);
  const references = new Float32Array(PARTICLE_COUNT * 2);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const x = (i % PARTICLE_TEX_WIDTH) / PARTICLE_TEX_WIDTH;
    const y = Math.floor(i / PARTICLE_TEX_WIDTH) / PARTICLE_TEX_WIDTH;
    references[i * 2 + 0] = x + 0.5 / PARTICLE_TEX_WIDTH;
    references[i * 2 + 1] = y + 0.5 / PARTICLE_TEX_WIDTH;
  }
  geo.setAttribute('position',  new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('reference', new THREE.BufferAttribute(references, 2));

  const pointsMat = new THREE.ShaderMaterial({
    uniforms: {
      texturePosition: { value: null },
      textureVelocity: { value: null },
      pointSize:   { value: 0.026 },
      uSlowColor:  { value: new THREE.Color(0.6, 0.1, 0.0) },
      uFastColor:  { value: new THREE.Color(1.0, 0.6, 0.1) },
      uWhiteColor: { value: new THREE.Color(1.8, 1.6, 1.4) },  // 백열 플라즈마 (over-unity)
    },
    vertexShader:   particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
    depthTest:   false,
  });

  particlePoints = new THREE.Points(geo, pointsMat);
  particlePoints.name = 'fluidParticles';
  particlePoints.frustumCulled = false;

  // ── Streak LineSegments Geometry ──
  const streakGeo = new THREE.BufferGeometry();
  const streakCount = PARTICLE_COUNT * 2;
  const streakPos = new Float32Array(streakCount * 3);
  const streakRef = new Float32Array(streakCount * 2);
  const streakVI  = new Float32Array(streakCount);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const x = (i % PARTICLE_TEX_WIDTH) / PARTICLE_TEX_WIDTH + 0.5 / PARTICLE_TEX_WIDTH;
    const y = Math.floor(i / PARTICLE_TEX_WIDTH) / PARTICLE_TEX_WIDTH + 0.5 / PARTICLE_TEX_WIDTH;
    streakRef[i * 4 + 0] = x; streakRef[i * 4 + 1] = y;
    streakVI [i * 2 + 0] = 0.0;
    streakRef[i * 4 + 2] = x; streakRef[i * 4 + 3] = y;
    streakVI [i * 2 + 1] = 1.0;
  }
  streakGeo.setAttribute('position',    new THREE.BufferAttribute(streakPos, 3));
  streakGeo.setAttribute('reference',   new THREE.BufferAttribute(streakRef, 2));
  streakGeo.setAttribute('vertexIndex', new THREE.BufferAttribute(streakVI,  1));

  const streakMat = new THREE.ShaderMaterial({
    uniforms: {
      texturePosition: { value: null },
      textureVelocity: { value: null },
      uStreakLength:   { value: 10.0 },   // 5.0 → 10.0 (에너지 방전 필라멘트)
      uSlowColor:      { value: new THREE.Color(0.6, 0.1, 0.0) },
      uFastColor:      { value: new THREE.Color(1.0, 0.6, 0.1) },
    },
    vertexShader:   streakVertexShader,
    fragmentShader: streakFragmentShader,
    transparent: true,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
    depthTest:   false,
  });

  particleStreaks = new THREE.LineSegments(streakGeo, streakMat);
  particleStreaks.name = 'fluidStreaks';
  particleStreaks.frustumCulled = false;

  return { points: particlePoints, streaks: particleStreaks };
}

/**
 * 매 프레임 GPGPU 텍스처 바인딩
 */
export function updateParticles(positionTexture, velocityTexture) {
  if (particlePoints) {
    particlePoints.material.uniforms.texturePosition.value = positionTexture;
    particlePoints.material.uniforms.textureVelocity.value = velocityTexture;
  }
  if (particleStreaks) {
    particleStreaks.material.uniforms.texturePosition.value = positionTexture;
    particleStreaks.material.uniforms.textureVelocity.value = velocityTexture;
  }
}

/**
 * 파티클 크기를 동적으로 설정합니다.
 */
export function setParticlePointSize(size) {
  if (particlePoints) particlePoints.material.uniforms.pointSize.value = size;
}

/**
 * 파티클 색상 테마 실시간 변경
 */
export function updateParticleTheme(slowRGB, fastRGB) {
  if (particlePoints) {
    particlePoints.material.uniforms.uSlowColor.value.setRGB(...slowRGB);
    particlePoints.material.uniforms.uFastColor.value.setRGB(...fastRGB);
  }
  if (particleStreaks) {
    particleStreaks.material.uniforms.uSlowColor.value.setRGB(...slowRGB);
    particleStreaks.material.uniforms.uFastColor.value.setRGB(...fastRGB);
  }
}
