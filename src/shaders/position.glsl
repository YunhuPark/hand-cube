/**
 * position.glsl — GPGPU 위치 업데이트 (Local Space 파티클 폭포)
 *
 * W 채널 = floorLife (1.0=공중, 감소=바닥 체류, ≤0=재스폰)
 *
 * 폭포 순환:
 *   큐브 상단(y≈bound*0.9) 스폰 → 중력으로 낙하 → 바닥(y=-bound) 도달
 *   → XZ 퍼지며 고임 (~2.8초) → 큐브 상단에서 재스폰
 */

uniform float bound;      // 큐브 로컬 경계 (0.95)
uniform float time;
uniform vec2  uResolution;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  vec4 posData = texture2D(texturePosition, uv);
  vec3 pos     = posData.xyz;
  float life   = posData.w;   // 바닥 잔류 수명

  vec3 vel = texture2D(textureVelocity, uv).xyz;

  // 오일러 적분
  pos += vel;

  // ── 바닥 도달: 고임 → 수명 감소 → 큐브 상단 재스폰 ──
  if (pos.y <= -bound) {
      pos.y = -bound;
      life -= 0.006;  // ~167 프레임 (≈2.8초) 후 재스폰

      if (life <= 0.0) {
          // 큐브 전체 볼륨에 고르게 재스폰 (상단 집중 제거 → 큐브 가득 채움)
          float rx = (hash(uv + time)         * 2.0 - 1.0) * bound * 0.88;
          float ry = (hash(uv + time + 5.0)   * 2.0 - 1.0) * bound * 0.88;
          float rz = (hash(uv + time + 10.0)  * 2.0 - 1.0) * bound * 0.88;
          pos  = vec3(rx, ry, rz);
          life = 1.0;
      } else {
          // 바닥 체류 중: XZ 방향으로 퍼질 수 있도록 약간 허용
          pos.x = clamp(pos.x, -bound, bound);
          pos.z = clamp(pos.z, -bound, bound);
      }

  } else {
      // 공중 비행 중: 수명 초기화, 경계 클램프
      life  = 1.0;
      pos.y = clamp(pos.y, -bound, bound);
      pos.x = clamp(pos.x, -bound, bound);
      pos.z = clamp(pos.z, -bound, bound);
  }

  gl_FragColor = vec4(pos, life);
}
