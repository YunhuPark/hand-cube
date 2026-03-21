# Energy Container — Glass Cube Particle Simulation

실시간 WebGL 기반의 에너지 컨테이너 시뮬레이션. 플라즈마를 담은 유리 큐브 안에서 65,536개의 파티클이 GPU 병렬 연산(GPGPU)으로 유체 물리를 시뮬레이션합니다.

**Live Demo**: [GitHub Pages에 배포된 링크]

---

## 주요 기능

### 유리 큐브 (PBR Glass Material)
- **IOR 1.85** — 사파이어급 굴절률, 배경이 왜곡되며 투과
- **Iridescence** — 시야각에 따라 면에서 무지갯빛 shimmer 발생
- **Dispersion 5.0** — 엣지에서 RGB 프리즘 분산 (빛이 색별로 분리)
- **Clearcoat 1.0** — 완전 미러 코팅, 환경광 반사
- 4-펄스 발광 엣지 + 8 코너 스파크 (Bloom 트리거)
- 3-레이어 내부 볼륨 에테르 (깊이감 있는 에너지 코어)

### GPGPU 파티클 (65,536개)
- **256×256 위치/속도 텍스처** — GPU 병렬 물리 연산 (CPU 부담 없음)
- SPH 반발력 + 큐브 경계 반사 + 손 인터랙션 힘장
- 3-레이어 가우시안 글로우 (핵 / 중간 후광 / 넓은 성운 아우라)
- 속도에 비례한 화이트-핫 백열 색상 (빠를수록 흰색으로 과열)
- 8가지 색상 테마 (키보드 1~8)

### 인터랙션
- **웹캠 손 추적** (MediaPipe): 손바닥 기울기 → 큐브 회전, Pinch → 크기 조절
- **터치/드래그**: 모바일 및 데스크톱 터치 지원
- **키보드 1~8**: 색상 테마 전환 (Lava / Ocean / Forest / Ghost / Plasma / Ice / Sunset / Void)

### 포스트 프로세싱
- **UnrealBloomPass** — 상위 14% 밝기만 선택적 블룸 (큐브 형태 보존)
- **AfterimagePass** — 파티클 에너지 트레일
- **God Rays** (48샘플) — 큐브 중심에서 방사되는 체적 광선
- **Chromatic Aberration** — 렌즈 색수차
- ACESFilmic 톤매핑

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 렌더링 | Three.js r172 (WebGL 2.0) |
| 물리 | GPUComputationRenderer (GPGPU) |
| 손 추적 | MediaPipe Hand Landmarker (브라우저 내 AI) |
| 빌드 | Vite |
| 언어 | JavaScript (ES Modules) + GLSL |

---

## 실행 방법

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (http://localhost:5173)
npm run dev

# 프로덕션 빌드
npm run build
```

웹캠 권한을 허용하면 손 추적이 자동으로 활성화됩니다. 웹캠 없이도 마우스/터치로 조작 가능합니다.

---

## 조작법

| 입력 | 동작 |
|------|------|
| 손바닥 기울이기 | 큐브 회전 |
| Pinch (엄지+검지) | 큐브 크기 조절 |
| 터치 드래그 | 큐브 회전 |
| 두 손가락 핀치 | 큐브 크기 조절 |
| 키보드 `1`~`8` | 색상 테마 전환 |

---

## 프로젝트 구조

```
src/
├── main.js           # 앱 오케스트레이터, 애니메이션 루프
├── scene.js          # Scene / Camera / Renderer / 네뷸라 배경
├── glassCube.js      # PBR 유리 큐브 메쉬 + 엣지 + 코너 스파크
├── gpuCompute.js     # GPGPU 파티클 물리 (Position / Velocity FBO)
├── particles.js      # 파티클 렌더러 (Points + Streak LineSegments)
├── postProcessing.js # EffectComposer 포스트 프로세싱 패스
├── handTracking.js   # MediaPipe 손 추적 → 회전/스케일 변환
├── touchControls.js  # 터치/마우스 인터랙션
└── colorTheme.js     # 8가지 색상 테마 정의
```

---

## 라이선스

MIT
