/**
 * physics.js — Cannon-es 3D 물리 시뮬레이션
 *
 * 유리 큐브 강체(Rigid Body) + 6면 보이지 않는 경계 박스
 * - 중력 낙하 + 바닥/벽 바운스 + 공중 텀블링
 * - 인트로 / 손추적 / 터치 중에는 KINEMATIC 모드로 직접 제어
 * - 킥 비트 시 위쪽 방향 충격 + 랜덤 각속도 → 공중 텀블
 */

import {
    World, Body, Box, Plane, Vec3,
    Material, ContactMaterial, SAPBroadphase,
} from 'cannon-es';

let world    = null;
let cubeBody = null;

const _cubeMat = new Material('cube');
const _wallMat = new Material('wall');

/**
 * 물리 월드 + 큐브 강체 + 경계 평면 6개 초기화
 */
export function initPhysics() {
    world = new World({ gravity: new Vec3(0, -9.82, 0) });
    world.broadphase       = new SAPBroadphase(world);
    world.solver.iterations = 10;
    world.allowSleep       = false;

    // ── 큐브 강체 (half-extents 1,1,1 → Three.js BoxGeometry(2,2,2)와 동일 크기) ──
    cubeBody = new Body({
        mass:           1,
        material:       _cubeMat,
        linearDamping:  0.05,
        angularDamping: 0.20,
        type:           Body.KINEMATIC,   // 인트로가 끝날 때까지 KINEMATIC
    });
    cubeBody.addShape(new Box(new Vec3(1, 1, 1)));
    cubeBody.position.set(0, 0, 0);
    world.addBody(cubeBody);

    // ── 경계 평면 6개 ──
    // Plane 기본 법선 = +Z → 각 방향으로 오일러 회전 후 배치
    _plane([0, -2.5,  0], [-Math.PI / 2, 0, 0]);  // 바닥   (법선 +Y)
    _plane([0,  5.0,  0], [ Math.PI / 2, 0, 0]);  // 천장   (법선 -Y)
    _plane([-4,  0,   0], [0,  Math.PI / 2, 0]);  // 왼쪽 벽 (법선 +X)
    _plane([ 4,  0,   0], [0, -Math.PI / 2, 0]);  // 오른쪽  (법선 -X)
    _plane([0,   0,  -3], [0, 0, 0]);              // 뒷벽    (법선 +Z)
    _plane([0,   0,   3], [0, Math.PI, 0]);        // 앞벽    (법선 -Z)

    // ── 탄성 접촉 재질: 자연스러운 바운스 ──
    world.addContactMaterial(new ContactMaterial(_cubeMat, _wallMat, {
        restitution: 0.55,
        friction:    0.25,
    }));
}

function _plane([px, py, pz], [ex, ey, ez]) {
    const b = new Body({ mass: 0, material: _wallMat });
    b.addShape(new Plane());
    b.position.set(px, py, pz);
    b.quaternion.setFromEuler(ex, ey, ez);
    world.addBody(b);
}

/**
 * 물리 시뮬레이션 1스텝 (animate() 루프에서 매 프레임 호출)
 * @param {number} dt - 실제 경과 시간 (초)
 */
export function stepPhysics(dt) {
    if (world) world.step(1 / 60, dt, 3);
}

/**
 * 물리 바디의 위치·회전을 Three.js 메쉬에 복사
 * @param {THREE.Object3D} mesh
 */
export function syncMeshFromBody(mesh) {
    if (!cubeBody) return;
    mesh.position.copy(cubeBody.position);
    mesh.quaternion.copy(cubeBody.quaternion);
}

/**
 * 큐브를 KINEMATIC ↔ DYNAMIC 전환
 * KINEMATIC: 물리 무시, 코드로 직접 위치·회전 제어
 * DYNAMIC  : 중력·충돌·바운스 적용
 * @param {boolean} kinematic
 */
export function setKinematic(kinematic) {
    if (!cubeBody) return;
    cubeBody.type = kinematic ? Body.KINEMATIC : Body.DYNAMIC;
    cubeBody.wakeUp();
}

/**
 * 킥 비트 순간 큐브에 위쪽 방향 충격 + 랜덤 텀블
 * DYNAMIC 상태일 때만 적용 (손·터치 제어 중엔 무시)
 * @param {number} intensity  0.0~1.0
 */
export function applyKickImpulse(intensity) {
    if (!cubeBody || cubeBody.type !== Body.DYNAMIC) return;

    // 위쪽 + 약간의 랜덤 측면 충격
    cubeBody.applyImpulse(new Vec3(
        (Math.random() - 0.5) * 4  * intensity,
        (3.5 + Math.random() * 2)  * intensity,
        (Math.random() - 0.5) * 3  * intensity,
    ));

    // 랜덤 각속도 → 공중에서 텀블링
    cubeBody.angularVelocity.x += (Math.random() - 0.5) * 12 * intensity;
    cubeBody.angularVelocity.y += (Math.random() - 0.5) * 12 * intensity;
    cubeBody.angularVelocity.z += (Math.random() - 0.5) * 12 * intensity;
}

/** 큐브 Cannon Body 직접 접근이 필요한 경우 사용 */
export function getCubeBody() { return cubeBody; }
