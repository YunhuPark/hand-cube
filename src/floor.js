/**
 * floor.js — 반사 바닥 (환경맵 기반 Glossy Floor)
 *
 * THREE.Reflector는 AfterimagePass와 충돌하므로 사용하지 않음.
 * 대신 MeshStandardMaterial + 환경맵으로 광택 바닥 구현.
 */

import * as THREE from 'three';

let _floorMesh = null;

export function createFloor(scene) {
    // 바닥 플레인 비활성 — 배경을 가르는 문제로 제거
    _floorMesh = null;

    return _floorMesh;
}

export function setFloorGlowColor(r, g, b) {
    if (_floorMesh) {
        _floorMesh.material.color.setRGB(r * 0.025, g * 0.02, b * 0.04);
    }
}
