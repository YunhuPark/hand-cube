/**
 * scene.js — Three.js Scene, Camera, Renderer, 애니메이션 네뷸라 배경
 *
 * 배경: 정적 CanvasTexture 대신 풀스크린 쿼드 ShaderMaterial.
 * - FBM(Fractal Brownian Motion) 2D 노이즈 기반 성운 레이어
 * - bass 에너지에 따라 중앙에서 펄스 링 파동
 * - 테마 색상(uThemeColor)에 맞춰 색조 변화
 * - updateNebula(elapsed, bass) / setNebulaThemeColor(r,g,b) 로 main.js에서 제어
 */

import * as THREE from 'three';

// ─── Scene ───
const scene = new THREE.Scene();

// ─── Camera ───
const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
);
camera.position.set(0, 0, 6);
camera.lookAt(0, 0, 0);

// ─── Renderer ───
const _isMobile = /Mobi|Android/i.test(navigator.userAgent);
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !_isMobile,
    alpha: false
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(_isMobile ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;  // 1.2 → 1.35 (더 밝고 시네마틱)

// ─── Environment Map (PMREMGenerator) ───
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
const envScene = new THREE.Scene();
const envGeo   = new THREE.SphereGeometry(10, 32, 32);
const envMat   = new THREE.MeshBasicMaterial({ color: 0x111122, side: THREE.BackSide });
envScene.add(new THREE.Mesh(envGeo, envMat));

// HDR 환경광 — MeshStandardMaterial emissive로 PMREM이 진짜 HDR 신호를 읽음
// MeshBasicMaterial은 LDR이라 유리 이리데선스/반사가 평탄해짐
// emissiveIntensity 3.0 → 유리에서 선명한 스펙큘러 하이라이트·무지개 shimmer
const _envLights = [
    { pos: [ 3,  3,  3], color: [1.0, 0.27, 0.13], r: 0.80 },
    { pos: [-4, -2,  2], color: [0.20, 0.40, 1.00], r: 0.55 },
    { pos: [ 0,  4, -3], color: [1.00, 0.67, 0.00], r: 0.60 },
    { pos: [-3,  2, -4], color: [0.13, 1.00, 0.80], r: 0.40 },
    { pos: [ 4, -3, -2], color: [1.00, 0.13, 0.40], r: 0.40 },
    { pos: [-2, -4, -3], color: [0.53, 0.27, 1.00], r: 0.50 },
    { pos: [ 5,  0,  1], color: [1.00, 0.87, 0.27], r: 0.35 },
    { pos: [-4,  0, -3], color: [0.27, 0.67, 1.00], r: 0.35 },
    // 추가 4개: 상/하/전/후 — iridescence·dispersion 강화
    { pos: [ 0,  6,  0], color: [2.5, 1.4, 0.3],   r: 0.45 },
    { pos: [ 0, -6,  0], color: [0.2, 0.4, 1.8],   r: 0.40 },
    { pos: [ 0,  0,  6], color: [1.8, 0.6, 0.1],   r: 0.50 },
    { pos: [ 0,  0, -6], color: [0.3, 1.2, 2.0],   r: 0.40 },
];
for (const { pos, color, r } of _envLights) {
    const em = new THREE.Mesh(
        new THREE.SphereGeometry(r, 16, 16),
        new THREE.MeshStandardMaterial({
            emissive: new THREE.Color(...color),
            emissiveIntensity: 3.0,
            roughness: 1.0,
            metalness: 0.0,
        })
    );
    em.position.set(...pos);
    envScene.add(em);
}
const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
scene.environment = envMap;
pmremGenerator.dispose();

// ─── Lights ───
scene.add(new THREE.AmbientLight(0xffffff, 0.55));  // 0.4 → 0.55
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
hemiLight.position.set(0, 10, 0);
scene.add(hemiLight);

// SpotLight: 큐브를 향한 집중 조명 — 유리 이리데선스 시각화에 핵심
const cubeSpot = new THREE.SpotLight(0xff6622, 3.0, 15, Math.PI / 6, 0.3, 2.0);
cubeSpot.position.set(3, 4, 3);
cubeSpot.target.position.set(0, 0, 0);
scene.add(cubeSpot);
scene.add(cubeSpot.target);

// ─── 스타필드 (고정 별자리 배경) ───
{
    const starGeo = new THREE.BufferGeometry();
    const starCount = 5000;
    const starPos = new Float32Array(starCount * 3);
    const starAlpha = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const r     = 60 + Math.random() * 120;
        starPos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
        starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        starPos[i * 3 + 2] = r * Math.cos(phi) - 40;
        starAlpha[i] = 0.3 + Math.random() * 0.7;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('aAlpha',   new THREE.BufferAttribute(starAlpha, 1));
    const starMat = new THREE.ShaderMaterial({
        uniforms: {},
        vertexShader: `
            attribute float aAlpha;
            varying float vAlpha;
            void main() {
                vAlpha = aAlpha;
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_Position  = projectionMatrix * mv;
                gl_PointSize = 1.5 + aAlpha * 1.5;
            }
        `,
        fragmentShader: `
            varying float vAlpha;
            void main() {
                vec2 c = gl_PointCoord - 0.5;
                float d = length(c);
                if (d > 0.5) discard;
                float alpha = (1.0 - smoothstep(0.0, 0.5, d)) * vAlpha * 0.8;
                gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    stars.renderOrder = -1;
    stars.frustumCulled = false;
    scene.add(stars);
}

// ─── 애니메이션 네뷸라 배경 ───
const _nebulaGeo = new THREE.PlaneGeometry(2, 2);
const _nebulaMat = new THREE.ShaderMaterial({
    uniforms: {
        uTime:       { value: 0.0 },
        uBass:       { value: 0.0 },
        uThemeColor: { value: new THREE.Vector3(1.0, 0.6, 0.1) },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
    vertexShader: `
        void main() {
            gl_Position = vec4(position.xy, 1.0, 1.0);
        }
    `,
    fragmentShader: `
        uniform float uTime;
        uniform float uBass;
        uniform vec3  uThemeColor;
        uniform vec2  uResolution;

        vec2 hash2(vec2 p) {
            p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
            return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
        }
        float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(dot(hash2(i + vec2(0,0)), f - vec2(0,0)),
                    dot(hash2(i + vec2(1,0)), f - vec2(1,0)), u.x),
                mix(dot(hash2(i + vec2(0,1)), f - vec2(0,1)),
                    dot(hash2(i + vec2(1,1)), f - vec2(1,1)), u.x),
                u.y);
        }
        float fbm(vec2 p) {
            float v = 0.0; float a = 0.5;
            mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
            for (int i = 0; i < 5; i++) {
                v += a * noise(p);
                p  = rot * p * 2.0 + 100.0;
                a *= 0.5;
            }
            return v;
        }

        void main() {
            vec2 uv = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
            uv.x *= uResolution.x / uResolution.y;
            float dist = length(uv);

            vec3 bg = mix(vec3(0.020, 0.008, 0.045), vec3(0.008, 0.004, 0.022), smoothstep(0.0, 0.6, dist));
            bg       = mix(bg, vec3(0.002, 0.002, 0.008), smoothstep(0.5, 1.2, dist));

            float angle  = atan(uv.y, uv.x);
            float spiral = angle / (2.0 * 3.14159) + dist * 0.6 - uTime * 0.018;
            vec2 spiralUV = uv + vec2(cos(spiral * 6.28) * 0.12, sin(spiral * 6.28) * 0.12) * (1.0 - dist * 0.6);

            vec2 q = vec2(
                fbm(spiralUV * 1.6 + vec2(0.0,    uTime * 0.020)),
                fbm(spiralUV * 1.6 + vec2(5.2,    uTime * 0.020))
            );
            vec2 r = vec2(
                fbm(spiralUV * 2.2 + 4.0 * q + vec2(uTime * 0.010, 0.0)),
                fbm(spiralUV * 2.2 + 4.0 * q + vec2(0.0, uTime * 0.014))
            );
            float nebula  = pow(max(0.0, fbm(spiralUV * 2.6 + 4.5 * r) * 0.5 + 0.5), 1.6);
            float detail  = pow(max(0.0, fbm(uv * 5.0 + vec2(uTime * 0.007, -uTime * 0.009)) * 0.5 + 0.5), 2.8);

            float focus   = 1.0 - smoothstep(0.0, 1.5, dist);
            vec3 hot  = uThemeColor * 2.2;
            vec3 cold = uThemeColor * 0.25 + vec3(0.03, 0.01, 0.06);
            vec3 nebulaColor = mix(cold, hot, nebula) * nebula * focus * 0.32;
            nebulaColor     += uThemeColor * detail * focus * 0.10;

            float veinRaw  = fbm(spiralUV * 4.5 + vec2(uTime * 0.006, -uTime * 0.004));
            float vein     = pow(max(0.0, 1.0 - abs(veinRaw) * 2.5), 3.5);
            float vein2    = pow(max(0.0, 1.0 - abs(fbm(uv * 7.0 + vec2(uTime * 0.003, 0.0))) * 2.8), 4.0);
            vec3 veinColor = uThemeColor * (vein * 0.22 + vein2 * 0.10) * focus;

            float ring = uBass * smoothstep(0.3, 0.0, abs(dist - uBass * 0.5)) * 0.35;
            vec3 bassGlow = uThemeColor * ring;

            vec3 final = bg + nebulaColor + veinColor + bassGlow;
            final *= 1.0 - smoothstep(0.55, 1.3, dist);

            gl_FragColor = vec4(final, 1.0);
        }
    `,
    depthWrite: false,
    depthTest:  false,
});
const _nebulaMesh = new THREE.Mesh(_nebulaGeo, _nebulaMat);
_nebulaMesh.renderOrder   = -1;
_nebulaMesh.frustumCulled = false;
scene.add(_nebulaMesh);

// ─── Resize Handler ───
function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    _nebulaMat.uniforms.uResolution.value.set(w, h);
}
window.addEventListener('resize', onResize);

// ─── 네뷸라 제어 API ───

/** 매 프레임 호출: 시간 + bass 에너지 업데이트 */
export function updateNebula(elapsed, bassLevel) {
    _nebulaMat.uniforms.uTime.value = elapsed;
    _nebulaMat.uniforms.uBass.value = bassLevel;
}

/** 테마 전환 시 네뷸라 색조 변경 */
export function setNebulaThemeColor(r, g, b) {
    _nebulaMat.uniforms.uThemeColor.value.set(r, g, b);
}

export { scene, camera, renderer };
