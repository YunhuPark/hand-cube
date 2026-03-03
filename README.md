# Hand Tracking Fluid Particle Cube

인터랙티브 웹캠 손 추적 데이터를 활용하여 화면 상의 3D 큐브 내부에서 부유하는 실시간 오일/액체 물리 기반의 GPU 렌더링 스타일 유체 파티클 시뮬레이션입니다. 미디어파이프(MediaPipe) AI를 사용해 빠르고 정확하게 손을 인식하고 반응합니다.

## 🌟 주요 기능 (Features)

- **🖐 실시간 손 추적 제어 (Hand Tracking)**:
  - 검지와 엄지(Pinch)의 거리를 계산하여 큐브의 **크기(Scale)** 를 줌인 / 줌아웃 할 수 있습니다.
  - 손바닥의 기울기 및 궤적을 3차원 축(Pitch, Yaw, Roll)으로 계산해 큐브를 자유롭게 회전시킵니다.
- **🌊 60FPS Native HDR Fluid Rendering (액체 물리엔진)**:
  - 5,000개가 넘는 파티클 입자가 터치디자이너(TouchDesigner) 스타일의 고해상도 가우시안 컨볼루션(Gaussian Convolution) 렌더링 기법으로 처리되어 끊김 없는 부드러운 유체의 움직임을 재현합니다.
  - 파티클 간의 소프트 SPH(Soft-Body Particle) 반발력 공식을 사용하여 실제 꿀이나 오일처럼 점성(Viscosity) 있는 유체 덩어리를 묘사합니다.
- **🔥 가산 혼합 글로우 및 톤 매핑 (Glow & Tone Mapping)**:
  - 입자들이 뭉칠수록 HDR 광원처럼 빛나는 Additive Blending을 사용하며, 카메라 노출이 하얗게 타버리지 않도록 톤 매핑(Reinhard Tone Mapping) 보정 알고리즘을 씌워 진한 용암/오렌지 빛의 유체 질감을 완벽하게 매핑합니다.

## ⚙️ 요구 환경 (Prerequisites)

이 프로젝트는 Python 환경과 다음의 의존성 패키지들이 필요합니다:

```bash
pip install opencv-python numpy mediapipe
```

*참고: 모델 구동을 위해 루트 경로에 `hand_landmarker.task` (MediaPipe 훈련 모델 파일)이 필요합니다.*

## 🚀 실행 방법 (Usage)

웹캠이 연결된 상태에서 메인 파이썬 스크립트를 실행합니다:

```bash
python hand_cube.py
```

- 웹캠 팝업이 뜨면 손바닥을 펼쳐 카메라에 보여주세요. (1개의 손만 추적하도록 최적화되어 있습니다.)
- **회전**: 손을 이리저리 기울여 큐브 상자를 회전시키고 물을 찰랑이게 해보세요.
- **확대 비율 조절**: 검지와 엄지를 오므렸다가(Pinch) 펴면서 큐브 상자를 줌인/아웃 컨트롤 할 수 있습니다. 
- **종료**: 키보드의 `q` 키를 누르면 종료됩니다.

## 🛠️ 퍼포먼스 튜닝 (Performance Configuration)

`hand_cube.py` 상단 부근 매개변수를 직접 수정하여 퍼포먼스/물리를 커스텀 할 수 있습니다:

- `num_particles`: 파티클 입자수 조절 (사양에 따라 3,000 ~ 15,000)
- `repulsion_strength`: 파티클 간 밀어내는 힘 (낮을수록 점성이 강한 꿀처럼 찰싹 붙음)
- `damping_factor`: 공기 저항 및 마찰력 (1.0에 가까울수록 물, 0.5 이하면 젤리)
- `exposure`: 유체가 빛나는 발광 밝기 텍스처 조정

## 🤝 라이선스 (License)

이 프로젝트는 오픈 소스로 제공되며 누구나 사용할 수 있습니다.
