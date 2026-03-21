/**
 * glassCube.js — PBR 유리 큐브 메쉬 생성 모듈
 *
 * 에너지 컨테이너 스타일:
 * - iridescence (무지개 shimmer), dispersion (RGB 프리즘 분산)
 * - IOR 1.85 (사파이어급 굴절)
 * - 3-레이어 내부 볼륨 (outer dim / mid bright / core white-hot)
 * - 4-펄스 엣지 흐름 + 높은 base brightness
 * - 8 코너 스파크 (bloom trigger 역할)
 */

import * as THREE from 'three';

let edgesMaterial    = null;
let _innerLight      = null;
let _cubeMaterial    = null;
let _innerVolMat     = null;   // Layer 1 (outer)
let _innerVol2       = null;   // Layer 2 (mid)
let _innerVol3       = null;   // Layer 3 (core)
let _cornerSparkMat  = null;
let _fresnelMat      = null;

export function setCubeEdgeColor(r, g, b) {
    if (edgesMaterial) edgesMaterial.uniforms.uColor.value.setRGB(r, g, b);
}

/** 프레스넬 외곽 글로우 색상 (제거됨, 호환성 유지) */
export function setCubeFresnelColor(r, g, b) {
    if (_fresnelMat) _fresnelMat.uniforms.uColor.value.setRGB(r, g, b);
}

/** 코너 스파크 색상 (테마 전환 시 호출) */
export function setCubeCornerColor(r, g, b) {
    if (_cornerSparkMat) _cornerSparkMat.color.setRGB(r * 2.0, g * 1.0, b * 0.3 + 0.2);
}

/** 매 프레임 호출: 엣지 흐름 애니메이션 업데이트 */
export function updateGlassCube(elapsed) {
    if (edgesMaterial) edgesMaterial.uniforms.uTime.value = elapsed;
}

/** 내부 PointLight 색상 (테마 전환 시 호출) */
export function setCubeInnerLightColor(r, g, b) {
    if (_innerLight) _innerLight.color.setRGB(r, g, b);
}

/** 내부 PointLight 강도 (매 프레임 펄스에 따라 변조) */
export function setCubeInnerLightIntensity(i) {
    if (_innerLight) _innerLight.intensity = i;
}

/** 큐브 emissive 강도 (beat에 반응) */
export function setCubeEmissiveIntensity(i) {
    if (_cubeMaterial) _cubeMaterial.emissiveIntensity = i;
}

/** 큐브 emissive 색상 (테마 전환 시 호출) */
export function setCubeEmissiveColor(r, g, b) {
    if (_cubeMaterial) _cubeMaterial.emissive.setRGB(r, g, b);
}

/** 내부 볼륨 에테르 색상 — 3개 레이어 전부 업데이트 */
export function setCubeInnerVolColor(r, g, b) {
    if (_innerVolMat) _innerVolMat.color.setRGB(r, g, b);
    if (_innerVol2)   _innerVol2.color.setRGB(r * 1.1, g * 1.0, b * 1.0);
    if (_innerVol3)   _innerVol3.color.setRGB(r * 1.5 + 0.3, g * 0.8 + 0.2, b * 0.3 + 0.1);
}

export function createGlassCube(size = 2) {
    const geometry = new THREE.BoxGeometry(size, size, size);

    // ── 에너지 컨테이너 유리 재질 ──
    _cubeMaterial = new THREE.MeshPhysicalMaterial({
        transmission: 0.98,               // 0.96 → 0.98
        roughness: 0.02,                  // 0.04 → 0.02 (미러 스무스)
        metalness: 0.0,
        ior: 1.85,                        // 1.52 → 1.85 (사파이어급 굴절)
        thickness: 1.2,                   // 0.5 → 1.2 (굴절 깊이 증가)
        clearcoat: 1.0,                   // 0.6 → 1.0 (완전 미러 코팅)
        clearcoatRoughness: 0.0,          // 0.05 → 0.0
        reflectivity: 0.95,               // 0.6 → 0.95
        color: new THREE.Color(0xffffff),
        emissive: new THREE.Color(1.0, 0.3, 0.05),
        emissiveIntensity: 0.10,          // main.js 펄스로 0.10~0.25 변조
        iridescence: 0.7,                 // 회전 시 무지갯빛 shimmer
        iridescenceIOR: 1.35,
        iridescenceThicknessRange: [100, 400],
        dispersion: 5.0,                  // RGB 프리즘 분산 (엣지 컬러 분리)
        attenuationColor: new THREE.Color(1.0, 0.4, 0.05),
        attenuationDistance: 0.8,
        side: THREE.FrontSide,            // DoubleSide는 transmission 아티팩트 발생
        transparent: true,
        depthWrite: false,
        envMapIntensity: 2.5,             // 1.2 → 2.5
    });

    const mesh = new THREE.Mesh(geometry, _cubeMaterial);
    mesh.name = 'glassCube';

    // ── 내부 PointLight: 강화된 플라즈마 발광 ──
    _innerLight = new THREE.PointLight(new THREE.Color(1.0, 0.35, 0.05), 2.0, 8.0);
    _innerLight.position.set(0, 0, 0);
    mesh.add(_innerLight);

    // ── 내부 볼륨 에테르: 3-레이어 (depth 있는 에너지 코어) ──

    // Layer 1: outer — 크고 희미한 외곽 안개
    _innerVolMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.0, 0.35, 0.05),
        transparent: true,
        opacity: 0.035,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    mesh.add(new THREE.Mesh(new THREE.BoxGeometry(size * 0.85, size * 0.85, size * 0.85), _innerVolMat));

    // Layer 2: mid — 중간 레이어
    _innerVol2 = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.0, 0.45, 0.08),
        transparent: true,
        opacity: 0.045,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    mesh.add(new THREE.Mesh(new THREE.BoxGeometry(size * 0.65, size * 0.65, size * 0.65), _innerVol2));

    // Layer 3: core — 작고 밝은 코어 (opacity 낮춰서 큐브 가시성 확보)
    _innerVol3 = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.0, 0.65, 0.2),
        transparent: true,
        opacity: 0.030,  // 과포화 방지
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    mesh.add(new THREE.Mesh(new THREE.BoxGeometry(size * 0.40, size * 0.40, size * 0.40), _innerVol3));

    _fresnelMat = null; // 제거됨

    _cornerSparkMat = null;

    // ── 외부 엣지: 4-펄스 발광 엣지 (base brightness 높음) ──
    const edgesGeo = new THREE.EdgesGeometry(geometry);
    const vertCount = edgesGeo.attributes.position.count;
    const progressArr = new Float32Array(vertCount);
    for (let i = 0; i < vertCount; i++) {
        progressArr[i] = (i % 2 === 0) ? 0.0 : 1.0;
    }
    edgesGeo.setAttribute('aProgress', new THREE.BufferAttribute(progressArr, 1));

    edgesMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color().setRGB(1.5, 0.6, 0.15) },
            uTime:  { value: 0.0 },
        },
        vertexShader: `
            attribute float aProgress;
            varying float vProgress;
            void main() {
                vProgress = aProgress;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3  uColor;
            uniform float uTime;
            varying float vProgress;
            void main() {
                // 4개 펄스: 2개 느린(0.30×) + 2개 빠른(0.55×)
                float p1 = mod(uTime * 0.30, 1.0);
                float p2 = mod(uTime * 0.30 + 0.50, 1.0);
                float p3 = mod(uTime * 0.55 + 0.25, 1.0);
                float p4 = mod(uTime * 0.55 + 0.75, 1.0);
                float g1 = exp(-pow((vProgress - p1) * 9.0,  2.0));
                float g2 = exp(-pow((vProgress - p2) * 9.0,  2.0));
                float g3 = exp(-pow((vProgress - p3) * 11.0, 2.0)) * 0.75;
                float g4 = exp(-pow((vProgress - p4) * 11.0, 2.0)) * 0.75;
                // base brightness 0.22 → 0.38 (엣지 전체가 항상 발광)
                float glow = clamp(0.38 + g1*1.6 + g2*1.6 + g3*1.1 + g4*1.1, 0.0, 3.0);
                gl_FragColor = vec4(uColor * glow, glow * 0.85);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    mesh.add(new THREE.LineSegments(edgesGeo, edgesMaterial));

    return mesh;
}
