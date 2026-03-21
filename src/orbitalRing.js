/**
 * orbitalRing.js — 큐브 모서리 흐름 파티클 (Edge Flow)
 *
 * 큐브의 12개 직각 모서리를 따라 파티클이 흐릅니다.
 * glassCube의 자식으로 추가되므로 큐브 회전을 자동 추종합니다.
 */

import * as THREE from 'three';

const HALF = 0.96; // 큐브 로컬 반크기 (bound=0.95보다 살짝 밖)

// 큐브 엣지 정의 — 아랫면 4개 제외 (바닥 축적 방지)
const EDGES = [
    // 위 면 4개
    [[-HALF, HALF,-HALF], [ HALF, HALF,-HALF]],
    [[ HALF, HALF,-HALF], [ HALF, HALF, HALF]],
    [[ HALF, HALF, HALF], [-HALF, HALF, HALF]],
    [[-HALF, HALF, HALF], [-HALF, HALF,-HALF]],
    // 수직 4개
    [[-HALF,-HALF,-HALF], [-HALF, HALF,-HALF]],
    [[ HALF,-HALF,-HALF], [ HALF, HALF,-HALF]],
    [[ HALF,-HALF, HALF], [ HALF, HALF, HALF]],
    [[-HALF,-HALF, HALF], [-HALF, HALF, HALF]],
];

const PER_EDGE   = 28;  // 엣지당 파티클 수 (18→28)
const TOTAL      = EDGES.length * PER_EDGE;  // 224개

let _edgePoints = null;
let _edgeData   = null;  // [t, speed, edgeIdx] per particle

export function createOrbitalRing() {
    const geo  = new THREE.BufferGeometry();
    const pos  = new Float32Array(TOTAL * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(1.0, 0.6, 0.1) },
            uBass:  { value: 0.0 },
        },
        vertexShader: `
            uniform float uBass;
            void main() {
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_Position  = projectionMatrix * mv;
                gl_PointSize = 3.2 + uBass * 3.5;
            }
        `,
        fragmentShader: `
            uniform vec3  uColor;
            uniform float uBass;
            void main() {
                vec2 c = gl_PointCoord - 0.5;
                float d = length(c);
                if (d > 0.5) discard;
                // 이중 글로우: 핵 + 후광
                float inner = exp(-d * d * 28.0);
                float outer = exp(-d * d * 5.0) * 0.35;
                float alpha = max(inner, outer) * (0.85 + uBass * 0.5);
                gl_FragColor = vec4(uColor, alpha);
            }
        `,
        transparent: true,
        blending:    THREE.AdditiveBlending,
        depthWrite:  false,
        depthTest:   true,
    });

    _edgePoints = new THREE.Points(geo, mat);
    _edgePoints.frustumCulled = false;

    // 파티클 데이터 초기화 [t, speed, edgeIdx]
    _edgeData = new Float32Array(TOTAL * 3);
    for (let i = 0; i < TOTAL; i++) {
        const edgeIdx = Math.floor(i / PER_EDGE);
        _edgeData[i * 3 + 0] = (i % PER_EDGE) / PER_EDGE;  // t: 균등 분포
        _edgeData[i * 3 + 1] = 0.18 + Math.random() * 0.32; // speed
        _edgeData[i * 3 + 2] = edgeIdx;
    }

    return _edgePoints;
}

export function updateOrbitalRing(delta) {
    if (!_edgePoints || !_edgeData) return;

    const posAttr = _edgePoints.geometry.attributes.position;
    const arr     = posAttr.array;

    for (let i = 0; i < TOTAL; i++) {
        let   t       = _edgeData[i * 3 + 0];
        const speed   = _edgeData[i * 3 + 1];
        const eIdx    = _edgeData[i * 3 + 2] | 0;

        t += speed * delta;
        if (t > 1.0) t -= 1.0;
        _edgeData[i * 3 + 0] = t;

        const [a, b] = EDGES[eIdx];
        arr[i * 3 + 0] = a[0] + (b[0] - a[0]) * t;
        arr[i * 3 + 1] = a[1] + (b[1] - a[1]) * t;
        arr[i * 3 + 2] = a[2] + (b[2] - a[2]) * t;
    }

    posAttr.needsUpdate = true;
}

export function setOrbitalRingColor(r, g, b) {
    if (_edgePoints) _edgePoints.material.uniforms.uColor.value.setRGB(r, g, b);
}

export function setOrbitalRingBass(level) {
    if (_edgePoints) _edgePoints.material.uniforms.uBass.value = level;
}
