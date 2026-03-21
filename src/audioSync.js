/**
 * audioSync.js — Web Audio API 절차적 합성 음악 (풍부한 버전)
 *
 * 3개의 스타일 트랙:
 * - 🔴 Lava Pulse  : 120 BPM, 다크 일렉트로 — 묵직한 킥 + Em 베이스 라인 + 대기 패드
 * - 🔵 Ocean Flow  :  75 BPM, 앰비언트   — 부드러운 킥 + Am 아르페지오 + 광활한 패드
 * - 🟢 Forest Rush : 150 BPM, 하이에너지  — 빠른 킥 + 스네어 + Cm 빠른 베이스 + 16분 히햇
 *
 * [ / ] 키: 이전/다음 트랙  |  Space: 일시정지/재개
 */

// ── 트랙 정의 ──
const SYNTH_TRACKS = [
    { name: '🔴 Lava Pulse',   bpm: 120, style: 'lava',   subFreq: 45,   subMod: 0.22 },
    { name: '🔵 Ocean Flow',   bpm:  75, style: 'ocean',  subFreq: 33,   subMod: 0.60 },
    { name: '🟢 Forest Rush',  bpm: 150, style: 'forest', subFreq: 55,   subMod: 0.10 },
    { name: '👻 Ghost Void',   bpm:  55, style: 'ghost',  subFreq: 27.5, subMod: 0.08 },
];

export const TRACKS = SYNTH_TRACKS;

// ── 음표 주파수 표 (Hz) ──
const N = {
    B1: 61.74,
    C2: 65.41, Cs2: 69.30, D2: 73.42, Eb2: 77.78, E2: 82.41,
    F2: 87.31, Fs2: 92.50, G2: 98.00, Ab2: 103.8, A2: 110.0, Bb2: 116.5, B2: 123.5,
    C3: 130.8, Cs3: 138.6, D3: 146.8, Eb3: 155.6, E3: 164.8,
    F3: 174.6, G3: 196.0, Ab3: 207.7, A3: 220.0, Bb3: 233.1, B3: 246.9,
    C4: 261.6, E4: 329.6, G4: 392.0, A4: 440.0,
};

// ── 트랙별 베이스 시퀀스 — [주파수, 박수] 배열 ──
const BASS_SEQ = {
    // Em 펜타토닉 — 어둡고 무거운 라인
    lava: [
        [N.E2, 1], [N.E2, 0.5], [N.G2, 0.5], [N.A2, 1],  [N.G2, 1],
        [N.E2, 1], [N.D2, 0.5], [N.C2, 0.5], [N.B1, 0.5], [N.E2, 1.5],
    ],
    // Am 아르페지오 — 느리고 흐르는 라인
    ocean: [
        [N.A2, 2], [N.E2, 2], [N.C3, 2], [N.G2, 2],
        [N.F2, 2], [N.A2, 2], [N.E2, 2], [N.A2, 2],
    ],
    // Cm 빠른 반음계 라인 — 에너지 폭발
    forest: [
        [N.C2,  0.5], [N.Eb2, 0.5], [N.G2, 0.25], [N.Bb2, 0.25],
        [N.C2,  0.5], [N.D2,  0.25],[N.Eb2, 0.25],
        [N.F2,  0.5], [N.Eb2, 0.25],[N.D2, 0.25],
        [N.C2,  0.5], [N.G2,  0.5],
    ],
    // Cm 에테리얼 — 매우 느리고 깊음
    ghost: [
        [N.C2, 4], [N.Eb2, 4], [N.G2, 4], [N.Ab2, 4],
        [N.C2, 4], [N.Bb2, 4], [N.G2, 4], [N.C2,  4],
    ],
};

// ── 트랙별 코드 패드 — 두 개의 코드가 번갈아 등장 ──
const PAD_CHORDS = {
    lava:   [ [N.A2, N.E3, N.A3, N.C4],   [N.G2, N.D3, N.B3, N.E4]   ],
    ocean:  [ [N.A2, N.C3, N.E3, N.G3],   [N.F2, N.A2, N.C3, N.E3]   ],
    forest: [ [N.C3, N.Eb3, N.G3, N.Bb3], [N.Ab2, N.C3, N.Eb3, N.G3] ],
    ghost:  [ [N.C2, N.Eb3, N.G3, N.Bb3], [N.Ab2, N.C3, N.Eb3, N.G4] ],
};

// ── Web Audio 상태 ──
let audioCtx   = null;
let analyser   = null;
let masterGain = null;
let noiseBuffer = null;

// ── 킥 콜백 (main.js에서 등록, 킥 발생 순간 정확히 호출) ──
let _kickCallback = null;
export function setKickCallback(fn) { _kickCallback = fn; }

let isPlaying   = false;
let initialized = false;
let currentTrackIndex = 0;
let currentStyle = 'lava';
let currentBpm   = 120;

// ── 스케줄러 ──
let schedulerTimer = null;
let nextBeatTime   = 0;
let beatCount      = 0;
let bassSeqIdx     = 0;
let bassSeqTime    = 0;
const LOOKAHEAD         = 0.15;
const SCHEDULE_INTERVAL = 50;

// ── 서브 베이스 ──
let subOsc  = null;
let subGain = null;

const FFT_SIZE      = 256;
const SAMPLE_RATE   = 44100;
const BIN_HZ        = SAMPLE_RATE / FFT_SIZE;
const BASS_BIN_END  = Math.floor(300  / BIN_HZ);  // ~17
const MID_BIN_START = Math.floor(300  / BIN_HZ);  // ~17
const MID_BIN_END   = Math.floor(2000 / BIN_HZ);  // ~23
const TRB_BIN_START = Math.floor(2000 / BIN_HZ);  // ~23
const TRB_BIN_END   = Math.floor(8000 / BIN_HZ);  // ~93

let trackNameEl = null;

// ─────────────────────────────────────────────
function ensureContext() {
    if (!audioCtx) {
        audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
        analyser   = audioCtx.createAnalyser();
        analyser.fftSize               = FFT_SIZE;
        analyser.smoothingTimeConstant  = 0.8;
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.62;
        masterGain.connect(analyser);
        analyser.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

// 화이트 노이즈 버퍼 (히햇·스네어 공유)
function getNoiseBuffer() {
    if (noiseBuffer) return noiseBuffer;
    const size = audioCtx.sampleRate * 2;
    noiseBuffer = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
    const data  = noiseBuffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
}

// ─────────────────────────────────────────────
// 킥 드럼: 사인파 주파수 스윕 160→38 Hz
// ─────────────────────────────────────────────
function scheduleKick(time, intensity = 1.0) {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(175 * intensity, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.10);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.95 * intensity, time + 0.004); // 강화
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.32);
    osc.start(time);
    osc.stop(time + 0.38);

    // 킥 타이밍에 정확히 콜백 발동 (analyser 지연 없음)
    if (_kickCallback) {
        const delayMs = Math.max(0, (time - audioCtx.currentTime) * 1000);
        setTimeout(() => _kickCallback(intensity), delayMs);
    }
}

// ─────────────────────────────────────────────
// 하이햇: 노이즈 하이패스
// ─────────────────────────────────────────────
function scheduleHihat(time, vol = 0.22, decay = 0.035) {
    const src    = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const gain   = audioCtx.createGain();
    src.buffer         = getNoiseBuffer();
    filter.type        = 'highpass';
    filter.frequency.value = 9500;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    src.start(time);
    src.stop(time + decay + 0.01);
}

// ─────────────────────────────────────────────
// 스네어: 노이즈(밴드패스) + 톤(사인)
// ─────────────────────────────────────────────
function scheduleSnare(time, vol = 0.32) {
    const nSrc    = audioCtx.createBufferSource();
    const nFilter = audioCtx.createBiquadFilter();
    const nGain   = audioCtx.createGain();
    nSrc.buffer        = getNoiseBuffer();
    nFilter.type       = 'bandpass';
    nFilter.frequency.value = 1600;
    nFilter.Q.value    = 0.55;
    nSrc.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(masterGain);
    nGain.gain.setValueAtTime(vol * 0.55, time);
    nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    const osc   = audioCtx.createOscillator();
    const oGain = audioCtx.createGain();
    osc.connect(oGain);
    oGain.connect(masterGain);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, time);
    osc.frequency.exponentialRampToValueAtTime(90, time + 0.06);
    oGain.gain.setValueAtTime(vol * 0.28, time);
    oGain.gain.exponentialRampToValueAtTime(0.001, time + 0.10);

    nSrc.start(time); nSrc.stop(time + 0.20);
    osc.start(time);  osc.stop(time + 0.12);
}

// ─────────────────────────────────────────────
// 베이스 신스 노트: 오버드라이브 사운드
// ─────────────────────────────────────────────
function scheduleBassNote(time, freq, duration, vol = 0.35, oscType = 'sawtooth') {
    const osc  = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    // 로우패스 필터로 고음 제거 → 따뜻한 베이스 톤
    filter.type            = 'lowpass';
    filter.frequency.value  = freq * 6;
    filter.Q.value          = 1.2;

    osc.type            = oscType;
    osc.frequency.value  = freq;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.015);
    gain.gain.setValueAtTime(vol * 0.8, time + duration * 0.65);
    gain.gain.linearRampToValueAtTime(0.001, time + duration);

    osc.start(time);
    osc.stop(time + duration + 0.05);
}

// ─────────────────────────────────────────────
// 코드 패드: 느리게 페이드인/아웃
// ─────────────────────────────────────────────
function schedulePad(time, freqs, duration, vol = 0.055) {
    freqs.forEach((freq, i) => {
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(masterGain);
        // 저음 사인, 고음 트라이앵글 → 자연스러운 배음
        osc.type            = i < 2 ? 'sine' : 'triangle';
        osc.frequency.value  = freq;
        osc.detune.value     = (i % 2 === 0 ? 1 : -1) * 4; // 살짝 디튠으로 코러스 효과
        const attack = duration * 0.12;
        const release = duration * 0.15;
        gain.gain.setValueAtTime(0.001, time);
        gain.gain.linearRampToValueAtTime(vol, time + attack);
        gain.gain.setValueAtTime(vol, time + duration - release);
        gain.gain.linearRampToValueAtTime(0.001, time + duration);
        osc.start(time);
        osc.stop(time + duration + 0.1);
    });
}

// ─────────────────────────────────────────────
// 서브 베이스 드론 (지속음, LFO 변조)
// ─────────────────────────────────────────────
function startSubBass(freq, modDepth) {
    stopSubBass();
    subOsc  = audioCtx.createOscillator();
    subGain = audioCtx.createGain();
    const lfo     = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.type             = 'sine';
    lfo.frequency.value   = 0.32;
    lfoGain.gain.value    = freq * modDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(subOsc.frequency);
    subOsc.type            = 'sine';
    subOsc.frequency.value  = freq;
    subGain.gain.value      = 0.28;
    subOsc.connect(subGain);
    subGain.connect(masterGain);
    lfo.start();
    subOsc.start();
}

function stopSubBass() {
    if (subOsc) { try { subOsc.stop(); } catch (_) {} subOsc = null; }
}

// ─────────────────────────────────────────────
// 스타일별 비트 패턴
// ─────────────────────────────────────────────
function scheduleBeat(time, beat, bpm, style) {
    const q = 60 / bpm;   // 4분음표(초)
    const e = q * 0.5;    // 8분음표
    const s = q * 0.25;   // 16분음표

    if (style === 'lava') {
        // ── LAVA: 다크 일렉트로 ──
        // 킥: 1·3박 강세, 5박에 고스트킥
        if (beat % 4 === 0) scheduleKick(time, 1.0);
        if (beat % 4 === 2) scheduleKick(time, 0.78);
        if (beat % 8 === 5) scheduleKick(time + e, 0.40);
        // 하이햇: 8분음표 (강/약 교대)
        scheduleHihat(time,     beat % 2 === 0 ? 0.20 : 0.12, 0.050);
        scheduleHihat(time + e, 0.09, 0.028);
        // 코드 패드: 8박마다 교체
        const padDur = q * 8;
        if (beat % 16 === 0)  schedulePad(time, PAD_CHORDS.lava[0], padDur, 0.062);
        if (beat % 16 === 8)  schedulePad(time, PAD_CHORDS.lava[1], padDur, 0.058);

    } else if (style === 'ocean') {
        // ── OCEAN: 앰비언트 ──
        // 킥: 매우 부드럽게, 4박에 한 번
        if (beat % 8 === 0)  scheduleKick(time, 0.42);
        if (beat % 16 === 8) scheduleKick(time, 0.25);
        // 라이드 심벌처럼 넓은 하이햇 (매우 작게)
        if (beat % 4 === 0) scheduleHihat(time, 0.07, 0.18);
        // 광활한 패드: 10박 지속
        const padDur = q * 10;
        if (beat % 16 === 0)  schedulePad(time, PAD_CHORDS.ocean[0], padDur, 0.085);
        if (beat % 16 === 8)  schedulePad(time, PAD_CHORDS.ocean[1], padDur, 0.070);

    } else if (style === 'ghost') {
        // ── GHOST: 에테리얼 앰비언트 ──
        // 킥: 8박마다 1번, 매우 부드럽게
        if (beat % 8 === 0) scheduleKick(time, 0.28);
        // 넓고 느린 하이햇 (라이드 심벌 느낌)
        if (beat % 4 === 0) scheduleHihat(time, 0.05, 0.28);
        if (beat % 8 === 2) scheduleHihat(time, 0.03, 0.15);
        // 깊은 패드: 16박 지속 (매우 느린 전환)
        const padDur = q * 16;
        if (beat % 16 === 0) schedulePad(time, PAD_CHORDS.ghost[0], padDur, 0.045);
        if (beat % 32 === 16) schedulePad(time, PAD_CHORDS.ghost[1], padDur, 0.040);

    } else if (style === 'forest') {
        // ── FOREST: 하이에너지 ──
        // 킥: 매 박 + 엇박 강조
        scheduleKick(time, beat % 2 === 0 ? 0.88 : 0.52);
        if (beat % 8 === 3) scheduleKick(time + e * 0.5, 0.32);
        // 스네어: 2박, 4박
        if (beat % 4 === 2) scheduleSnare(time, 0.38);
        // 16분음표 하이햇 (빽빽하게)
        scheduleHihat(time,           0.22, 0.022);
        scheduleHihat(time + s,       0.11, 0.018);
        scheduleHihat(time + e,       0.20, 0.022);
        scheduleHihat(time + e + s,   0.10, 0.016);
        // 코드 패드: 4박마다 빠른 전환
        const padDur = q * 4;
        if (beat % 8 === 0) schedulePad(time, PAD_CHORDS.forest[0], padDur, 0.040);
        if (beat % 8 === 4) schedulePad(time, PAD_CHORDS.forest[1], padDur, 0.040);
    }
}

// 베이스 시퀀스: 시간 기반으로 별도 스케줄
function scheduleBassSequence(untilTime, bpm, style) {
    const seq = BASS_SEQ[style];
    if (!seq) return;
    const q = 60 / bpm;
    // 스타일별 베이스 오실레이터 타입 + 볼륨
    const cfg = {
        lava:   { oscType: 'sawtooth', vol: 0.36 },
        ocean:  { oscType: 'sine',     vol: 0.30 },
        forest: { oscType: 'square',   vol: 0.28 },
        ghost:  { oscType: 'sine',     vol: 0.22 },
    }[style] ?? { oscType: 'sawtooth', vol: 0.32 };

    while (bassSeqTime < untilTime) {
        const [freq, beats] = seq[bassSeqIdx % seq.length];
        const duration = beats * q;
        scheduleBassNote(bassSeqTime, freq, duration * 0.90, cfg.vol, cfg.oscType);
        bassSeqTime += duration;
        bassSeqIdx++;
    }
}

// ─────────────────────────────────────────────
// 스케줄러 루프
// ─────────────────────────────────────────────
function scheduleNotes() {
    const until = audioCtx.currentTime + LOOKAHEAD;
    const beatDuration = 60 / currentBpm;
    while (nextBeatTime < until) {
        scheduleBeat(nextBeatTime, beatCount, currentBpm, currentStyle);
        nextBeatTime += beatDuration;
        beatCount++;
    }
    scheduleBassSequence(until, currentBpm, currentStyle);
}

function startScheduler() {
    stopScheduler();
    const t0       = audioCtx.currentTime + 0.05;
    nextBeatTime   = t0;
    beatCount      = 0;
    bassSeqIdx     = 0;
    bassSeqTime    = t0;
    schedulerTimer = setInterval(scheduleNotes, SCHEDULE_INTERVAL);
    isPlaying = true;
}

function stopScheduler() {
    if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
    stopSubBass();
    isPlaying = false;
}

// ─────────────────────────────────────────────
// 트랙 전환
// ─────────────────────────────────────────────
function playTrack(index) {
    stopScheduler();
    const track = SYNTH_TRACKS[index];
    if (!track) return;
    currentTrackIndex = index;
    currentStyle      = track.style;
    currentBpm        = track.bpm;
    setTrackName(track.name);
    startSubBass(track.subFreq, track.subMod);
    startScheduler();
    console.log(`[AudioSync] Synthesizing: ${track.name} (${track.bpm} BPM)`);
}

function setTrackName(name) {
    if (trackNameEl) trackNameEl.textContent = name;
}

// ─────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────
// 공용 FFT 데이터 버퍼 (매 프레임 getBassLevel 호출 시 갱신)
const _fftData = new Uint8Array(FFT_SIZE / 2);
let _fftDirty = true;

function _refreshFFT() {
    if (!analyser || !isPlaying) { _fftData.fill(0); return; }
    analyser.getByteFrequencyData(_fftData);
}

function _bandAvg(start, end) {
    const s = Math.max(0, start);
    const e = Math.min(end, _fftData.length);
    if (e <= s) return 0;
    let sum = 0;
    for (let i = s; i < e; i++) sum += _fftData[i];
    return Math.min(1.0, (sum / (e - s)) / 128.0);
}

export function getBassLevel() {
    _refreshFFT();
    return _bandAvg(0, BASS_BIN_END);
}

export function getMidLevel() {
    return _bandAvg(MID_BIN_START, MID_BIN_END);
}

export function getTrebleLevel() {
    return _bandAvg(TRB_BIN_START, TRB_BIN_END);
}


export function getCurrentTrackName() {
    return SYNTH_TRACKS[currentTrackIndex]?.name ?? '';
}

export function initAudioSync() {
    trackNameEl = document.getElementById('ui-track-name');

    const startAudio = () => {
        if (initialized) return;
        initialized = true;
        ensureContext();
        playTrack(currentTrackIndex);
    };
    window.addEventListener('click',   startAudio, { once: true });
    window.addEventListener('keydown', startAudio, { once: true });

    // Space: 일시정지/재개
    window.addEventListener('keydown', (e) => {
        if (e.code !== 'Space') return;
        e.preventDefault();
        if (!audioCtx || !initialized) return;
        if (isPlaying) {
            stopScheduler();
            setTrackName(`⏸ ${SYNTH_TRACKS[currentTrackIndex]?.name}`);
        } else {
            playTrack(currentTrackIndex);
        }
    });

    // [ / ] 키: 이전/다음 트랙
    window.addEventListener('keydown', (e) => {
        if (!audioCtx || !initialized) return;
        if (e.key === '[') {
            playTrack((currentTrackIndex - 1 + SYNTH_TRACKS.length) % SYNTH_TRACKS.length);
        }
        if (e.key === ']') {
            playTrack((currentTrackIndex + 1) % SYNTH_TRACKS.length);
        }
    });

    // 드래그&드롭으로 커스텀 오디오 재생
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', async (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file || !file.type.startsWith('audio/')) return;
        ensureContext();
        stopScheduler();
        const arrayBuffer = await file.arrayBuffer();
        const buffer      = await audioCtx.decodeAudioData(arrayBuffer);
        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        src.loop   = true;
        src.connect(analyser);
        src.start(0);
        isPlaying = true;
        setTrackName(file.name.replace(/\.[^.]+$/, ''));
        console.log(`[AudioSync] Drop: ${file.name}`);
    });

    console.log('[AudioSync] Initialized. Click or press any key to start synthesized music.');
}
