/**
 * velocity.glsl — GPGPU 속도 업데이트 (Local Space 파티클 폭포)
 *
 * Phase 7: 파티클이 큐브 로컬 좌표계에서 동작
 * - 중력은 cubeRotationInverse 변환을 통해 로컬 공간에 적용
 * - uGrabActive = 1.0 → 중력 OFF (손이 큐브를 잡고 있는 상태)
 * - uGrabActive = 0.0 → 중력 ON, 폭포 흐름
 * - 바닥 근처(y < -bound+0.2)에서 XZ 퍼짐 강화
 */

uniform mat3 cubeRotation;
uniform mat3 cubeRotationInverse;

uniform float time;
uniform float noiseScale;
uniform float noiseStrength;
uniform float damping;
uniform float gravityAccel;
uniform float bound;

uniform vec2  uResolution;
uniform float uBurstStrength;
uniform vec3  uHandPos;
uniform float uHandRepulse;
uniform float uGrabActive;   // 1.0 = Grab 중 (중력 OFF), 0.0 = 자유 낙하

// ── Simplex 3D Noise ──
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0);
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j  = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

vec3 curlNoise(vec3 p) {
    const float e = 0.01;
    vec3 dx = vec3(e, 0.0, 0.0);
    vec3 dy = vec3(0.0, e, 0.0);
    vec3 dz = vec3(0.0, 0.0, e);
    vec3 p_x0 = vec3(snoise(p-dx), snoise(p-dx+vec3(43.23)), snoise(p-dx+vec3(127.1)));
    vec3 p_x1 = vec3(snoise(p+dx), snoise(p+dx+vec3(43.23)), snoise(p+dx+vec3(127.1)));
    vec3 p_y0 = vec3(snoise(p-dy), snoise(p-dy+vec3(43.23)), snoise(p-dy+vec3(127.1)));
    vec3 p_y1 = vec3(snoise(p+dy), snoise(p+dy+vec3(43.23)), snoise(p+dy+vec3(127.1)));
    vec3 p_z0 = vec3(snoise(p-dz), snoise(p-dz+vec3(43.23)), snoise(p-dz+vec3(127.1)));
    vec3 p_z1 = vec3(snoise(p+dz), snoise(p+dz+vec3(43.23)), snoise(p+dz+vec3(127.1)));
    float x = p_y1.z - p_y0.z - p_z1.y + p_z0.y;
    float y = p_z1.x - p_z0.x - p_x1.z + p_x0.z;
    float z = p_x1.y - p_x0.y - p_y1.x + p_y0.x;
    return normalize(vec3(x, y, z)) * 2.0;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  float freeMode = 1.0 - uGrabActive;  // 1 = 자유 낙하, 0 = Grab 중

  // ── 1. 로컬 공간 중력 (cubeRotationInverse 로 월드→로컬 변환) ──
  vec3 worldGravity = vec3(0.0, gravityAccel, 0.0);
  vel += cubeRotationInverse * worldGravity * freeMode;

  // ── 2. Curl Noise 난류 ──
  vec3 noiseVec = curlNoise(pos * noiseScale + vec3(0.0, time * 0.2, 0.0));
  vel += noiseVec * noiseStrength;

  // ── 2b. 보조 노이즈 — 입체적 회오리 (다른 위상) ──
  vec3 noiseVec2 = curlNoise(pos * noiseScale * 1.8 + vec3(time * 0.08, 0.0, time * 0.12));
  vel += noiseVec2 * noiseStrength * 0.55;

  // ── 3. 보텍스 (Y축 회전 — 강화, Grab 시 비활성) ──
  vec3 vortexAxis = normalize(cubeRotationInverse * vec3(0.0, 1.0, 0.0));
  vec3 toAxis = pos - dot(pos, vortexAxis) * vortexAxis;
  vel += cross(vortexAxis, toAxis) * 0.022 * freeMode;

  // ── 3b. 중심 인력: 경계 근처 파티클을 안쪽으로 당김 ──
  float edgeDist = bound - max(abs(pos.x), max(abs(pos.y), abs(pos.z)));
  float centerPull = smoothstep(0.25, 0.0, edgeDist) * 0.018;
  vel -= pos * centerPull;

  // ── 4. 바닥 근처(y < -bound+0.2): XZ 퍼짐 강화, Y 감쇠 ──
  float floorThresh = -bound + 0.2;
  float belowFloor = 1.0 - clamp((pos.y - floorThresh) / 0.3, 0.0, 1.0);
  float floorFrac = belowFloor * freeMode;
  vel.y  = mix(vel.y, min(vel.y, 0.0) * 0.3, floorFrac);
  vel.x += noiseVec.x * noiseStrength * floorFrac * 4.0;
  vel.z += noiseVec.z * noiseStrength * floorFrac * 4.0;

  // ── 5. 천장 바운스 (y > bound) ──
  if (pos.y > bound) vel.y -= (pos.y - bound) * 0.08;

  // ── 6. 손 반발력 (로컬 좌표 변환) ──
  if (uHandRepulse > 0.001) {
      vec3 localHandPos = cubeRotationInverse * uHandPos;
      vec3 diff = pos - localHandPos;
      float dist = length(diff);
      if (dist < 0.8) {
          float falloff = 1.0 - smoothstep(0.0, 0.8, dist);
          vel += normalize(diff) * uHandRepulse * falloff;
      }
  }

  // ── 7. 버스트 이펙트 (큐브 중심=원점 기준) ──
  if (uBurstStrength > 0.001) {
      float dist = length(pos) + 0.001;
      vel += (pos / dist) * uBurstStrength / (dist * dist + 0.1);
  }

  // ── 8. Damping ──
  vel *= damping;

  gl_FragColor = vec4(vel, 1.0);
}
