/**
 * energyField.js — 큐브 주변 플라즈마 에너지 왜곡 필드
 *
 * 큐브를 둘러싸는 반투명 구체에 프레스넬 + 애니메이션 플라즈마 패턴을 적용.
 * Additive Blending으로 배경과 자연스럽게 합성.
 */

import * as THREE from 'three';

let _fieldMat = null;

export function createEnergyField(scene) {
    _fieldMat = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(0.5, 0.0, 1.8) },
            uTime:  { value: 0.0 },
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vViewDir;
            varying vec3 vWorldPos;
            void main() {
                vNormal   = normalize(normalMatrix * normal);
                vec4 wp   = modelMatrix * vec4(position, 1.0);
                vWorldPos = wp.xyz;
                vViewDir  = normalize(cameraPosition - wp.xyz);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3  uColor;
            uniform float uTime;
            varying vec3  vNormal;
            varying vec3  vViewDir;
            varying vec3  vWorldPos;

            void main() {
                // 좁은 rim: 경계 실루엣에만 빛남 (pow 5 → 매우 얇은 링)
                float rim = pow(1.0 - abs(dot(vNormal, vViewDir)), 5.0);

                // 시간에 따라 흐르는 플라즈마 파동
                float wave = sin(vWorldPos.x * 4.0 + uTime * 2.0)
                           * sin(vWorldPos.y * 4.0 + uTime * 1.6)
                           * sin(vWorldPos.z * 4.0 + uTime * 1.8);

                float plasma = rim * (0.6 + wave * 0.4);
                plasma = clamp(plasma, 0.0, 1.0);

                // 매우 낮은 알파: 필드 느낌만, 시야 방해 없이
                float alpha = plasma * 0.12;
                gl_FragColor = vec4(uColor * plasma, alpha);
            }
        `,
        transparent: true,
        blending:    THREE.AdditiveBlending,
        depthWrite:  false,
        side:        THREE.FrontSide,
    });

    const field = new THREE.Mesh(
        new THREE.SphereGeometry(1.85, 48, 48),
        _fieldMat
    );
    field.frustumCulled = false;
    field.renderOrder   = 1;
    scene.add(field);
}

export function updateEnergyField(elapsed) {
    if (_fieldMat) _fieldMat.uniforms.uTime.value = elapsed;
}

export function setEnergyFieldColor(r, g, b) {
    if (_fieldMat) _fieldMat.uniforms.uColor.value.setRGB(r, g, b);
}
