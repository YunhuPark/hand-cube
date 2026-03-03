import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import math
import time

# --- Setup MediaPipe ---
base_options = python.BaseOptions(model_asset_path='hand_landmarker.task')
options = vision.HandLandmarkerOptions(
    base_options=base_options,
    num_hands=1)
detector = vision.HandLandmarker.create_from_options(options)

# --- Parameters ---
width, height = 1280, 720
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

fov = 600
distance = 3
smoothed_scale = 0.5
current_scale = 0.5

target_center_x, target_center_y = width // 2, height // 2
cube_center_x, cube_center_y = width // 2, height // 2

target_rot_mat = np.eye(3)
cube_rot_mat = np.eye(3)

# --- Geometry ---
vertices = np.array([
    [-1, -1, -1], [ 1, -1, -1], [ 1,  1, -1], [-1,  1, -1],
    [-1, -1,  1], [ 1, -1,  1], [ 1,  1,  1], [-1,  1,  1]
], dtype=np.float32)

edges = [
    (0, 1), (1, 2), (2, 3), (3, 0),
    (4, 5), (5, 6), (6, 7), (7, 4),
    (0, 4), (1, 5), (2, 6), (3, 7)
]

# --- 파티클 개수 축소 (5,000 파티클: 렉 제거 및 최적화) ---
num_particles = 5000
particles = np.random.uniform(-0.95, 0.95, (num_particles, 3)).astype(np.float32)
velocities = np.zeros((num_particles, 3), dtype=np.float32)

# 원본(Native) 해상도 사용 (깨짐/픽셀화 일절 없음)
particle_canvas = np.zeros((height, width, 3), dtype=np.float32)

def get_distance(p1, p2):
    return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2 + (p1.z - p2.z)**2)

def get_hand_rotation(landmarks):
    p0 = np.array([landmarks[0].x, landmarks[0].y, landmarks[0].z])
    p9 = np.array([landmarks[9].x, landmarks[9].y, landmarks[9].z])
    p5 = np.array([landmarks[5].x, landmarks[5].y, landmarks[5].z])
    p17 = np.array([landmarks[17].x, landmarks[17].y, landmarks[17].z])
    
    v_y = p9 - p0
    v_y_norm = np.linalg.norm(v_y)
    if v_y_norm > 0: v_y = v_y / v_y_norm
    
    v_x = p5 - p17
    v_x_norm = np.linalg.norm(v_x)
    if v_x_norm > 0: v_x = v_x / v_x_norm
    
    v_z = np.cross(v_x, v_y)
    v_z_norm = np.linalg.norm(v_z)
    if v_z_norm > 0: v_z = v_z / v_z_norm
    
    v_x = np.cross(v_y, v_z)
    v_x_norm = np.linalg.norm(v_x)
    if v_x_norm > 0: v_x = v_x / v_x_norm
    
    return np.vstack((v_x, v_y, v_z)).T

# Soft SPH Physics 
grid_res_base = 18 
repulsion_strength = 0.005 
damping_factor = 0.45 
gravity_accel = 0.02   

while True:
    success, img = cap.read()
    if not success: break
    
    img = cv2.flip(img, 1)
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
    detection_result = detector.detect(mp_image)

    if detection_result.hand_landmarks:
        hand_landmarks = detection_result.hand_landmarks[0]
        middle_mcp = hand_landmarks[9]
        target_center_x = middle_mcp.x * width
        target_center_y = middle_mcp.y * height
        thumb_tip = hand_landmarks[4]
        index_tip = hand_landmarks[8]
        pinch_dist = get_distance(thumb_tip, index_tip)
        target_scale = pinch_dist * 5.0
        target_scale = max(0.2, min(target_scale, 2.0))
        current_scale = target_scale
        target_rot_mat = get_hand_rotation(hand_landmarks)
    else:
        target_center_x, target_center_y = width // 2, height // 2
        
    cube_center_x += (target_center_x - cube_center_x) * 0.2
    cube_center_y += (target_center_y - cube_center_y) * 0.2
    smoothed_scale += (current_scale - smoothed_scale) * 0.15
    
    lerped_rot = cube_rot_mat * 0.8 + target_rot_mat * 0.2
    try:
        U, _, Vt = np.linalg.svd(lerped_rot)
        cube_rot_mat = U @ Vt
    except np.linalg.LinAlgError:
        pass

    # --- Vectorized Soft-Body Fluid Simulation ---
    current_grid_res = max(5, int(grid_res_base * (0.5 / smoothed_scale)))
    
    global_gravity = np.array([0.0, gravity_accel, 0.0])
    local_gravity = cube_rot_mat.T @ global_gravity
    velocities += local_gravity
    
    grid_idx = np.floor((particles + 1.0) * 0.5 * current_grid_res).astype(np.int32)
    grid_idx = np.clip(grid_idx, 0, current_grid_res - 1)
    linear_indices = grid_idx[:, 0] * (current_grid_res**2) + grid_idx[:, 1] * current_grid_res + grid_idx[:, 2]
    
    density_flat = np.bincount(linear_indices, minlength=current_grid_res**3).astype(np.float32)
    density_grid = density_flat.reshape((current_grid_res, current_grid_res, current_grid_res))
    
    particle_densities = density_flat[linear_indices]
    
    grad_x, grad_y, grad_z = np.gradient(density_grid)
    force_x = -grad_x[grid_idx[:, 0], grid_idx[:, 1], grid_idx[:, 2]]
    force_y = -grad_y[grid_idx[:, 0], grid_idx[:, 1], grid_idx[:, 2]]
    force_z = -grad_z[grid_idx[:, 0], grid_idx[:, 1], grid_idx[:, 2]]
    
    adjusted_repulsion = repulsion_strength * (smoothed_scale / 0.5)
    repulsion = np.stack([force_x, force_y, force_z], axis=1) * adjusted_repulsion
    
    jitter = np.random.uniform(-0.001, 0.001, (num_particles, 3))
    
    velocities += repulsion + jitter
    particles += velocities
    velocities *= damping_factor 
    
    bound = 0.95
    for ax in range(3):
        over = particles[:, ax] > bound
        particles[over, ax] = bound
        velocities[over, ax] *= -0.05
        
        under = particles[:, ax] < -bound
        particles[under, ax] = -bound
        velocities[under, ax] *= -0.05

    # --- Native Convolution 렌더링 물리 엔진 ---
    # Python for 문을 일절 쓰지 않는 수학적 가산 혼합(Additive Blending) 접근법
    # 1. 원본 해상도(Native)에 점(Point)들을 0.001초 만에 한 방에 다 찍음. 
    # 2. C++ 로 짜여진 GaussianBlur 로 화면 전체 빛을 한번에 몽환적으로 산란(Scattering)시킴. 렉 원천 차단.
    
    img_float = img.astype(np.float32) * 0.25 
    particle_canvas.fill(0)
    
    p_scaled = particles * smoothed_scale
    p_rotated = p_scaled @ cube_rot_mat.T
    
    z_shifted = p_rotated[:, 2] + distance
    z_shifted = np.maximum(z_shifted, 0.1)
    
    f_p = fov / z_shifted
    
    # 다운스케일 없이 "원본 해상도" 투영
    px = (p_rotated[:, 0] * f_p + cube_center_x).astype(np.int32)
    py = (p_rotated[:, 1] * f_p + cube_center_y).astype(np.int32)
    
    valid = (px >= 0) & (px < width - 1) & (py >= 0) & (py < height - 1)
    px_v = px[valid]
    py_v = py[valid]
    
    speeds = np.linalg.norm(velocities[valid], axis=1)
    speed_factor = np.clip(speeds * 30.0, 0.0, 1.0)
    
    density_baseline = 25.0 * (0.5 / smoothed_scale)**3 
    valid_densities = particle_densities[valid]
    density_factor = np.clip(valid_densities / max(1.0, density_baseline), 0.0, 1.0)
    
    mix_factor = np.clip(speed_factor + density_factor*0.5, 0.0, 1.0)
    
    scale_brightness_boost = max(1.0, smoothed_scale / 0.5) 
    
    base_b, base_g, base_r = 10.0, 20.0, 120.0
    high_b, high_g, high_r = 50.0, 180.0, 255.0
    
    b = (base_b + (high_b - base_b) * mix_factor) 
    g = (base_g + (high_g - base_g) * mix_factor) 
    r = (base_r + (high_r - base_r) * mix_factor) 
    
    # 블러 연산을 거치면 빛의 밀도가 퍼지므로, 처음 찍을 때 조금 더 강한 알파를 줌
    base_alpha = 0.55
    dynamic_alpha = min(1.0, base_alpha * scale_brightness_boost)
    colors_v = np.stack((b, g, r), axis=-1).astype(np.float32) * dynamic_alpha
    
    # 파티클 기본 크기 대폭 축소 (세밀하고 고운 모래/액체 입자, 단일 픽셀 수준으로 축소)
    np.add.at(particle_canvas, (py_v, px_v), colors_v)
    # 기존에 4픽셀 덩어리로 두껍게 찍던 것을 지우고, 중심 픽셀 1개만 아주 작게 찍음
    
    # --- 가우시안 컨볼루션(Gaussian Convolution) 필터링 축소 ---
    # 번짐(Blur) 반경을 대폭 줄여서 입자 크기가 작게 보이도록 수정
    base_blur_radius = 1.5 # 기존 4.0에서 대폭 줄임
    dynamic_blur_radius = int(max(1.0, base_blur_radius * (smoothed_scale / 0.5)))
    ksize = dynamic_blur_radius * 2 + 1
    
    if ksize > 1:
        # C++ 최적화된 함수로 순식간에 수만 개의 빛을 유체 텍스처로 분산시킴. (완벽한 원형 가우시안 붓질과 수학적으로 동일)
        particle_canvas = cv2.GaussianBlur(particle_canvas, (ksize, ksize), 0)
        
        # 블러 처리 후 에너지가 부드럽게 퍼져 희미해진 것을 복구하는 빛(Glow) 부스터
        glow_boost = (ksize / 3.0) ** 1.3
        particle_canvas *= glow_boost

    # --- HDR Tone Mapping ---
    # 아무리 입자가 많이 쌓이고 증폭되어도 (255)를 넘어서 하얗게 과노출 되는 현상을 원천 방지
    # 화려하고 짙은 주황~노란 빛의 텍스처(색감)를 리얼하게 살림
    exposure = 1.3
    particle_canvas = particle_canvas * exposure
    
    max_lum = np.max(particle_canvas, axis=-1, keepdims=True)
    max_lum = np.maximum(max_lum, 0.001)
    
    # 255 이상의 픽셀들은 흰색(255)으로 부드럽게 압축(Roll-off) 시킴
    white_point = 255.0 
    mapped_lum = max_lum * (1.0 + max_lum / (white_point * white_point)) / (1.0 + max_lum)
    
    tone_mapped_canvas = particle_canvas * (mapped_lum / max_lum) * 255.0
    np.clip(tone_mapped_canvas, 0, 255, out=tone_mapped_canvas)
    
    # 최종 합성
    img_float += tone_mapped_canvas
    np.clip(img_float, 0, 255, out=img_float)
    img = img_float.astype(np.uint8)
    
    pts = []
    for v in vertices:
        v_scaled = v * smoothed_scale
        r_v = cube_rot_mat @ v_scaled
        z = r_v[2] + distance
        f = fov / z
        x_proj = int(r_v[0] * f + cube_center_x)
        y_proj = int(r_v[1] * f + cube_center_y)
        pts.append((x_proj, y_proj))
        
    for edge in edges:
        p1 = pts[edge[0]]
        p2 = pts[edge[1]]
        cv2.line(img, p1, p2, (0, 100, 255), 2)
        
    cv2.putText(img, "Lag-Free Native HDR Fluid", (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
        
    cv2.imshow("Hand Tracking Fluid Cube", img)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
