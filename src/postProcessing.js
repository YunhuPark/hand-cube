/**
 * postProcessing.js — 화면 포스트 프로세싱
 *
 * 패스 순서:
 *   RenderPass
 *   → AfterimagePass (damp: 0.28 — 에너지 트레일)
 *   → UnrealBloomPass TIGHT (str 0.50 / r 0.06 / thresh 0.55 — 샤프 코어 글로우)
 *   → UnrealBloomPass BROAD (str 0.25 / r 0.35 / thresh 0.75 — 넓은 드리미 아우라)
 *   → OutputPass (ACESFilmic 톤매핑)
 *   → AnamorphicStreakPass (시네마틱 렌즈 수평 스트릭)
 *   → GodRaysPass (큐브 중심 체적 광선, 64샘플)
 *   → CustomFXPass (크로마틱 어버레이션 + 킥 플래시)
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const _isMobile = /Mobi|Android/i.test(navigator.userAgent);

let composer         = null;
let bloomPassTight   = null;
let bloomPassBroad   = null;
let afterimagePass   = null;
let customFXPass     = null;
let godRaysPass      = null;
let anamorphicPass   = null;

// ── God Rays: 큐브 중심에서 방사되는 체적 광선 셰이더 ──
const GodRaysShader = {
    uniforms: {
        tDiffuse:  { value: null },
        uLightPos: { value: new THREE.Vector2(0.5, 0.5) },
        uExposure: { value: 0.018 },
        uDecay:    { value: 0.965 },
        uDensity:  { value: 0.50  },
        uWeight:   { value: 0.18  },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2  uLightPos;
        uniform float uExposure;
        uniform float uDecay;
        uniform float uDensity;
        uniform float uWeight;
        varying vec2 vUv;

        #define SAMPLES 48

        void main() {
            vec2 tc    = vUv;
            vec2 delta = (tc - uLightPos) * (uDensity / float(SAMPLES));
            float decay = 1.0;
            vec3  rays  = vec3(0.0);

            for (int i = 0; i < SAMPLES; i++) {
                tc -= delta;
                vec3  s    = texture2D(tDiffuse, clamp(tc, 0.001, 0.999)).rgb;
                float luma = dot(s, vec3(0.2126, 0.7152, 0.0722));
                rays += s * max(0.0, luma - 0.55) * decay * uWeight;
                decay *= uDecay;
            }

            vec3 color = texture2D(tDiffuse, vUv).rgb;
            gl_FragColor = vec4(min(color + rays * uExposure, vec3(1.0)), 1.0);
        }
    `,
};

// ── Anamorphic Lens Streak: 시네마틱 렌즈 수평 광선 ──
// OutputPass 이후에 실행 → 톤매핑된 LDR 이미지에서 밝은 픽셀을 수평으로 번짐
const AnamorphicStreakShader = {
    uniforms: {
        tDiffuse:   { value: null },
        uStrength:  { value: 0.15 },  // 기본값 낮춤 — 과도한 번짐 방지
        uThreshold: { value: 0.65 },
        uAspect:    { value: window.innerWidth / window.innerHeight },
        uTint:      { value: new THREE.Color(0.7, 0.85, 1.0) },  // cool blue tint
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uStrength;
        uniform float uThreshold;
        uniform float uAspect;
        uniform vec3  uTint;
        varying vec2 vUv;

        #define SAMPLES 32

        void main() {
            vec3 base = texture2D(tDiffuse, vUv).rgb;

            // 수평 스트릭 (메인)
            vec3 streak = vec3(0.0);
            float totalW = 0.0;
            for (int i = -SAMPLES; i <= SAMPLES; i++) {
                float t = float(i) / float(SAMPLES);
                vec2 uv2 = clamp(vUv + vec2(t * 0.35 / uAspect, 0.0), 0.001, 0.999);
                vec3 s = texture2D(tDiffuse, uv2).rgb;
                float luma = dot(s, vec3(0.2126, 0.7152, 0.0722));
                float w = 1.0 - abs(t);
                streak += s * max(0.0, luma - uThreshold) * w;
                totalW += w;
            }
            streak = streak / max(totalW, 0.001) * uStrength * uTint;

            // 수직 스트릭 (25% 강도)
            vec3 vstreak = vec3(0.0);
            float totalW2 = 0.0;
            for (int i = -SAMPLES; i <= SAMPLES; i++) {
                float t = float(i) / float(SAMPLES);
                vec2 uv2 = clamp(vUv + vec2(0.0, t * 0.12), 0.001, 0.999);
                vec3 s = texture2D(tDiffuse, uv2).rgb;
                float luma = dot(s, vec3(0.2126, 0.7152, 0.0722));
                float w = 1.0 - abs(t);
                vstreak += s * max(0.0, luma - uThreshold) * w;
                totalW2 += w;
            }
            vstreak = vstreak / max(totalW2, 0.001) * uStrength * 0.25 * uTint;

            gl_FragColor = vec4(base + streak + vstreak, 1.0);
        }
    `,
};

// ── 크로마틱 어버레이션 + 킥 플래시 셰이더 ──
const CustomFXShader = {
    uniforms: {
        tDiffuse:       { value: null },
        uCAStrength:    { value: 0.012 },  // 0.008 → 0.012
        uFlashStrength: { value: 0.0  },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uCAStrength;
        uniform float uFlashStrength;
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;
            vec2 fromCenter = uv - 0.5;
            float dist = length(fromCenter);

            float caR = uCAStrength * dist;
            float caB = uCAStrength * dist * 1.8;
            float r = texture2D(tDiffuse, uv + fromCenter * caR).r;
            float g = texture2D(tDiffuse, uv + fromCenter * uCAStrength * dist * 0.5).g;
            float b = texture2D(tDiffuse, uv - fromCenter * caB).b;
            vec3 color = vec3(r, g, b);

            float flashFalloff = 1.0 - smoothstep(0.0, 0.7, dist);
            color += vec3(uFlashStrength * 0.45 * flashFalloff);

            float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(color, vec3(luma), uFlashStrength * 0.25);

            gl_FragColor = vec4(color, 1.0);
        }
    `,
};

/**
 * EffectComposer와 렌더링 패스를 초기화합니다.
 */
export function initPostProcessing(renderer, scene, camera) {
    composer = new EffectComposer(renderer);

    // 1. Scene 기본 렌더 패스
    composer.addPass(new RenderPass(scene, camera));

    // 2. Trail(잔상)
    afterimagePass = new AfterimagePass(0.12);
    if (_isMobile) afterimagePass.uniforms['damp'].value = 0;
    composer.addPass(afterimagePass);

    // 3. Bloom — 단일 패스 (원본 기준에서 소폭 강화만)
    // threshold 0.86: 상위 14% 밝기만 bloom → 큐브 형태 보존
    bloomPassTight = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.18, // strength
        0.14, // radius
        0.86  // threshold
    );
    composer.addPass(bloomPassTight);

    // 4. Output (ACESFilmic 색공간 + 톤매핑)
    composer.addPass(new OutputPass());

    // NOTE: AnamorphicStreakPass 제거 — 이미 과포화된 이미지에서 65샘플 수평 적산시
    //       전체 화면 폭발 현상 발생. 큐브 가시성 확보 후 추후 재도입 예정.

    // 5. God Rays (큐브 중심에서 체적 광선)
    godRaysPass = new ShaderPass(GodRaysShader);
    composer.addPass(godRaysPass);

    // 6. CustomFX (크로마틱 어버레이션 + 킥 플래시)
    customFXPass = new ShaderPass(CustomFXShader);
    composer.addPass(customFXPass);

    console.log('[PostProcessing] Bloom + GodRays initialized.');
}

export function resizePostProcessing(width, height) {
    if (composer) composer.setSize(width, height);
    if (bloomPassTight) bloomPassTight.setSize(width, height);
    if (bloomPassBroad) bloomPassBroad.setSize(width, height);
    if (anamorphicPass) anamorphicPass.uniforms.uAspect.value = width / height;
}

export function renderPostProcessing() {
    if (composer) composer.render();
}

/** 킥 플래시 강도 */
export function setFlashStrength(v) {
    if (customFXPass) customFXPass.uniforms.uFlashStrength.value = v;
}

export function setAfterimageStrength(damp) {
    if (afterimagePass) afterimagePass.uniforms['damp'].value = damp;
}

/** 크로마틱 어버레이션 강도 (매 프레임 동적 변조) */
export function setCAStrength(v) {
    if (customFXPass) customFXPass.uniforms.uCAStrength.value = v;
}

/** God Rays 강도 (매 프레임 pulse 변조) */
export function setGodRayExposure(v) {
    if (godRaysPass) godRaysPass.uniforms.uExposure.value = v;
}

/** Anamorphic Streak 강도 (내부 조명 pulse와 동기화) */
export function setAnamorphicStrength(v) {
    if (anamorphicPass) anamorphicPass.uniforms.uStrength.value = v;
}
