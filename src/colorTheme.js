/**
 * colorTheme.js — 파티클 색상 테마 정의
 *
 * 키보드 1~8로 테마를 전환합니다 (main.js에서 처리).
 * slow: 느린 파티클 색상 / fast: 빠른 파티클 색상 (RGB 0~1)
 */

export const THEMES = {
  lava:   { slow: [0.6,  0.1,  0.0 ], fast: [1.0,  0.6,  0.1 ] }, // 용암
  ocean:  { slow: [0.0,  0.1,  0.5 ], fast: [0.0,  0.8,  1.0 ] }, // 바다
  forest: { slow: [0.0,  0.2,  0.0 ], fast: [0.3,  1.0,  0.2 ] }, // 숲
  ghost:  { slow: [0.1,  0.0,  0.3 ], fast: [0.8,  0.5,  1.0 ] }, // 유령
  plasma: { slow: [0.4,  0.0,  0.6 ], fast: [1.0,  0.2,  1.0 ] }, // 플라즈마
  ice:    { slow: [0.0,  0.3,  0.5 ], fast: [0.6,  0.95, 1.0 ] }, // 얼음
  sunset: { slow: [0.5,  0.1,  0.0 ], fast: [1.0,  0.5,  0.0 ] }, // 석양
  void:   { slow: [0.02, 0.0,  0.05], fast: [0.3,  0.0,  0.8 ] }, // 공허
};

export let currentTheme = 'lava';

export function setTheme(name) {
  if (THEMES[name]) currentTheme = name;
}
