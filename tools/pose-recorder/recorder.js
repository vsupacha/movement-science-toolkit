// Pose Recorder: บันทึก landmark จาก MediaPipe Pose เป็น CSV
// โหมดไฟล์วิดีโอ: เลื่อนวิดีโอทีละเฟรมตามความถี่ที่เลือก ผลลัพธ์ทำซ้ำได้
// โหมดกล้องสด: ประมวลผลทุกเฟรมที่ได้ พร้อมเวลานาฬิกาเครื่อง (t_ms) สำหรับซิงก์กับอุปกรณ์อื่น

import {
  LANDMARK_NAMES, LANDMARK_TH, MAIN_LANDMARKS, INDEX, ANGLE_DEFS, angle2D,
} from '../shared/landmarks.js';
import {
  TOOLKIT_ID, buildCSV, timestampSlug, downloadText, canShareFiles, shareText,
} from '../shared/csv.js';

const TASKS_VERSION = '0.10.35';
const LOCAL_VENDOR = new URL('../vendor/', import.meta.url).href;
const CDN_TASKS = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/`;
const CDN_MODEL = (m) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/1/pose_landmarker_${m}.task`;

// ท่าและมุมกล้องที่แนะนำ
const EXERCISES = [
  { id: 'squat', th: 'สควอท (Squat)', view: 'sagittal_left', tip: 'ด้านข้างเพื่อดูมุมสะโพก เข่า ข้อเท้า · ถ้าต้องการดูเข่าบิดเข้า (knee valgus) ให้ถ่ายด้านหน้าเพิ่ม' },
  { id: 'chair_stand', th: 'ลุก–นั่งจากเก้าอี้ (Chair stand)', view: 'sagittal_left', tip: 'ด้านข้าง ตั้งกล้องระดับสะโพก เห็นเก้าอี้และเท้าทั้งหมด' },
  { id: 'lunge', th: 'ลันจ์ (Lunge)', view: 'sagittal_left', tip: 'ด้านข้าง ให้ขาหน้าอยู่ฝั่งใกล้กล้อง' },
  { id: 'deadlift', th: 'เดดลิฟต์ (Deadlift)', view: 'sagittal_left', tip: 'ด้านข้างเพื่อดูมุมสะโพกและการงอหลัง' },
  { id: 'bicep_curl', th: 'ไบเซปส์เคิร์ล (Bicep curl)', view: 'sagittal_left', tip: 'ด้านข้างของแขนที่ต้องการวัด · ถ้าเทียบซ้าย–ขวา ให้ถ่ายแยกทีละข้าง หรือถ่ายด้านหน้าโดยหันฝ่ามือเข้ากล้อง' },
  { id: 'front_raise', th: 'ยกแขนด้านหน้า (Front raise)', view: 'sagittal_left', tip: 'ด้านข้าง การยกแขนไปด้านหน้าอยู่ในระนาบ sagittal' },
  { id: 'lateral_raise', th: 'ยกแขนด้านข้าง (Lateral raise)', view: 'frontal_front', tip: 'ด้านหน้า การกางแขนอยู่ในระนาบ frontal เห็นทั้งสองข้างพร้อมกัน' },
  { id: 'shoulder_press', th: 'ดันไหล่ (Shoulder press)', view: 'frontal_front', tip: 'ด้านหน้าเพื่อเทียบซ้าย–ขวา' },
  { id: 'hip_abduction', th: 'กางสะโพก (Hip abduction)', view: 'frontal_front', tip: 'ด้านหน้า การกางขาอยู่ในระนาบ frontal' },
  { id: 'gait', th: 'การเดิน (Gait)', view: 'sagittal_left', tip: 'ด้านข้าง ตั้งกล้องห่างพอให้เห็นอย่างน้อย 2 ก้าวเต็ม' },
  { id: 'balance', th: 'ทรงตัว (Balance)', view: 'frontal_front', tip: 'ด้านหน้า เห็นทั้งตัวตั้งแต่ศีรษะถึงเท้า' },
  { id: 'other', th: 'อื่น ๆ (ระบุเอง)', view: 'sagittal_left', tip: 'เลือกมุมกล้องที่การเคลื่อนไหวหลักขนานกับหน้ากล้อง' },
];

const $ = (id) => document.getElementById(id);
const el = {
  engine: $('engine-status'), tabFile: $('tab-file'), tabCamera: $('tab-camera'),
  fileControls: $('file-controls'), cameraControls: $('camera-controls'),
  videoFile: $('video-file'), sampleFps: $('sample-fps'), processBtn: $('process-btn'), cancelBtn: $('cancel-btn'),
  cameraBtn: $('camera-btn'), flipBtn: $('flip-btn'), recDuration: $('rec-duration'), countdown: $('countdown'), recordBtn: $('record-btn'),
  canvas: $('canvas'), video: $('video'), overlay: $('overlay'), placeholder: $('placeholder'),
  status: $('status'), progress: $('progress'), fps: $('fps'),
  exercise: $('exercise'), exerciseOther: $('exercise-other'), view: $('view'), viewTip: $('view-tip'),
  subject: $('subject'), note: $('note'), model: $('model'), landmarkSet: $('landmark-set'),
  optWorld: $('opt-world'), optAngles: $('opt-angles'),
  visList: $('vis-list'), angleList: $('angle-list'),
  result: $('result'), summary: $('summary'), warnings: $('warnings'),
  downloadBtn: $('download-btn'), shareBtn: $('share-btn'), filename: $('filename'),
};
const ctx = el.canvas.getContext('2d');

const state = {
  vision: null,          // โมดูล tasks-vision
  fileset: null,
  landmarker: null,
  delegate: '',
  modelName: '',
  mode: 'file',
  lastTs: 0,             // timestamp ล่าสุดที่ส่งให้ MediaPipe (ต้องเพิ่มขึ้นเสมอ)
  videoFile: null,
  processing: false,
  cancel: false,
  stream: null,
  facing: 'environment',
  live: false,
  recording: false,
  recStart: 0,
  recTimer: null,
  frames: [],            // { frame, time_s, t_ms, lm, wl }
  frameCount: 0,
  lastUiUpdate: 0,
  fpsTimes: [],
  wakeLock: null,
  csv: '',
  csvName: '',
  session: null,         // ข้อมูลประกอบของการบันทึกล่าสุด
};

// ---------- การโหลดไลบรารีและโมเดล ----------

async function urlExists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

async function loadVision() {
  try {
    const mod = await import(LOCAL_VENDOR + 'tasks-vision/vision_bundle.mjs');
    return { mod, wasmBase: LOCAL_VENDOR + 'tasks-vision/wasm' };
  } catch {
    const mod = await import(CDN_TASKS + 'vision_bundle.mjs');
    return { mod, wasmBase: CDN_TASKS + 'wasm' };
  }
}

async function modelUrl(name) {
  const local = `${LOCAL_VENDOR}models/pose_landmarker_${name}.task`;
  return (await urlExists(local)) ? local : CDN_MODEL(name);
}

async function createLandmarker(name) {
  setEngine(`กำลังโหลดโมเดล ${name}…`);
  if (!state.vision) {
    const { mod, wasmBase } = await loadVision();
    state.vision = mod;
    state.fileset = await mod.FilesetResolver.forVisionTasks(wasmBase);
  }
  if (state.landmarker) {
    state.landmarker.close();
    state.landmarker = null;
  }
  const path = await modelUrl(name);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: path, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    state.landmarker = await state.vision.PoseLandmarker.createFromOptions(state.fileset, opts('GPU'));
    state.delegate = 'GPU';
  } catch (e) {
    console.warn('GPU ใช้ไม่ได้ เปลี่ยนเป็น CPU', e);
    state.landmarker = await state.vision.PoseLandmarker.createFromOptions(state.fileset, opts('CPU'));
    state.delegate = 'CPU';
  }
  state.modelName = name;
  state.lastTs = 0;
  setEngine(`พร้อม · ${name} · ${state.delegate}`, 'ok');
}

function setEngine(text, cls = '') {
  el.engine.textContent = text;
  el.engine.className = 'pill ' + cls;
}

function setStatus(text) {
  el.status.textContent = text;
}

// MediaPipe โหมด VIDEO ต้องการ timestamp ที่เพิ่มขึ้นเสมอ
function detect(source, desiredTs) {
  const ts = Math.max(desiredTs, state.lastTs + 1);
  state.lastTs = ts;
  return state.landmarker.detectForVideo(source, ts);
}

// ---------- การวาดผล ----------

function sideColor(name) {
  if (name.startsWith('left_')) return getCss('--left');
  if (name.startsWith('right_')) return getCss('--right');
  return '#dddddd';
}
const cssCache = {};
function getCss(v) {
  return (cssCache[v] ??= getComputedStyle(document.documentElement).getPropertyValue(v).trim());
}

function draw(source, lm) {
  const w = el.canvas.width, h = el.canvas.height;
  ctx.drawImage(source, 0, 0, w, h);
  if (!lm) return;
  const lw = Math.max(2, w / 400);
  ctx.lineWidth = lw;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  for (const { start, end } of state.vision.PoseLandmarker.POSE_CONNECTIONS) {
    const a = lm[start], b = lm[end];
    if (Math.min(a.visibility ?? 1, b.visibility ?? 1) < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
  }
  lm.forEach((p, i) => {
    const name = LANDMARK_NAMES[i];
    ctx.globalAlpha = Math.max(0.25, p.visibility ?? 1);
    ctx.fillStyle = sideColor(name);
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, lw * 1.8, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function sizeCanvasTo(vw, vh) {
  if (el.canvas.width !== vw || el.canvas.height !== vh) {
    el.canvas.width = vw;
    el.canvas.height = vh;
  }
  el.canvas.parentElement.style.aspectRatio = `${vw} / ${vh}`;
  el.placeholder.hidden = true;
}

// ---------- แผงข้อมูลสด ----------

function buildPanels() {
  el.visList.innerHTML = MAIN_LANDMARKS.filter((n) => n !== 'nose').map((n) => `
    <div class="vis-item"><span>${LANDMARK_TH[n]}</span>
      <div class="vis-bar"><div data-vis="${n}"></div></div></div>`).join('');
  const pairs = [];
  for (let i = 0; i < ANGLE_DEFS.length; i += 2) pairs.push([ANGLE_DEFS[i], ANGLE_DEFS[i + 1]]);
  el.angleList.innerHTML = '<span class="h"></span><span class="h">ซ้าย</span><span class="h">ขวา</span>' +
    pairs.map(([l, r]) => `<span>${l.label.replace('ซ้าย', '')}</span>
      <span class="l" data-angle="${l.key}">–</span><span class="r" data-angle="${r.key}">–</span>`).join('');
}

function updatePanels(lm, w, h) {
  const now = performance.now();
  if (now - state.lastUiUpdate < 200) return;
  state.lastUiUpdate = now;
  for (const div of el.visList.querySelectorAll('[data-vis]')) {
    const v = lm ? lm[INDEX[div.dataset.vis]].visibility ?? 0 : 0;
    div.style.width = `${Math.round(v * 100)}%`;
    div.className = v >= 0.7 ? 'good' : v >= 0.5 ? 'warn' : '';
  }
  for (const span of el.angleList.querySelectorAll('[data-angle]')) {
    const def = ANGLE_DEFS.find((d) => d.key === span.dataset.angle);
    span.textContent = lm ? angleOf(def, lm, w, h).toFixed(0) : '–';
  }
}

function angleOf(def, lm, w, h) {
  const [a, b, c] = def.pts.map((n) => {
    const p = lm[INDEX[n]];
    return { x: p.x * w, y: p.y * h };
  });
  return angle2D(a, b, c);
}

function tickFps() {
  const now = performance.now();
  state.fpsTimes.push(now);
  while (state.fpsTimes.length && now - state.fpsTimes[0] > 2000) state.fpsTimes.shift();
  if (state.fpsTimes.length > 1) {
    const fps = (state.fpsTimes.length - 1) / ((now - state.fpsTimes[0]) / 1000);
    el.fps.textContent = `${fps.toFixed(1)} เฟรม/วินาที`;
  }
}

// ---------- ข้อมูลประกอบ ----------

function exerciseId() {
  if (el.exercise.value !== 'other') return el.exercise.value;
  const t = el.exerciseOther.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return t || 'other';
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const isIPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const dev = isIPad ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'other';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari'
    : /Firefox/.test(ua) ? 'Firefox' : 'browser';
  return `${dev} ${br}`;
}

function startSession(source, extra) {
  state.frames = [];
  state.session = {
    source,
    exercise: exerciseId(),
    view: el.view.value,
    subject: el.subject.value.trim(),
    note: el.note.value.trim(),
    created: new Date(),
    width: el.canvas.width,
    height: el.canvas.height,
    landmarkSet: el.landmarkSet.value,
    world: el.optWorld.checked,
    angles: el.optAngles.checked,
    ...extra,
  };
  el.result.hidden = true;
}

function pushFrame(frame, time_s, t_ms, result) {
  const lm = result.landmarks?.[0] ?? null;
  const wl = result.worldLandmarks?.[0] ?? null;
  state.frames.push({ frame, time_s, t_ms, lm, wl });
}

// ---------- สร้าง CSV ----------

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '');
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : '');
const f4 = (v) => (Number.isFinite(v) ? v.toFixed(4) : '');

function buildOutput() {
  const s = state.session;
  const names = s.landmarkSet === 'all' ? LANDMARK_NAMES : MAIN_LANDMARKS;
  const header = ['frame', 'time_s', 't_ms', 'detected'];
  for (const n of names) header.push(`${n}_x`, `${n}_y`, `${n}_z`, `${n}_vis`);
  if (s.world) for (const n of names) header.push(`${n}_wx`, `${n}_wy`, `${n}_wz`);
  if (s.angles) for (const d of ANGLE_DEFS) header.push(`${d.key}_angle`);

  const w = s.width, h = s.height;
  const rows = state.frames.map((fr) => {
    const row = [fr.frame, fr.time_s.toFixed(4), fr.t_ms ?? '', fr.lm ? 1 : 0];
    for (const n of names) {
      const p = fr.lm?.[INDEX[n]];
      row.push(p ? f1(p.x * w) : '', p ? f1(p.y * h) : '', p ? f4(p.z) : '', p ? f3(p.visibility) : '');
    }
    if (s.world) for (const n of names) {
      const p = fr.wl?.[INDEX[n]];
      row.push(p ? f4(p.x) : '', p ? f4(p.y) : '', p ? f4(p.z) : '');
    }
    if (s.angles) for (const d of ANGLE_DEFS) row.push(fr.lm ? f1(angleOf(d, fr.lm, w, h)) : '');
    return row;
  });

  const st = stats();
  const meta = [
    { toolkit: TOOLKIT_ID, type: 'pose', version: 1 },
    {
      source: s.source, file: s.fileName, device: deviceLabel(), width: w, height: h,
      sample_fps: s.sampleFps, mean_fps: st.meanFps.toFixed(2), mirrored: false,
    },
    { model: `pose_landmarker_${state.modelName}`, delegate: state.delegate, library: `tasks-vision ${TASKS_VERSION}` },
    { exercise: s.exercise, view: s.view, subject: s.subject, note: s.note },
    {
      created: s.created.toISOString(),
      coords: 'x_y_pixels_origin_top_left_y_down',
      z: 'relative_depth_unitless',
      world: 'meters_origin_hip_center_y_down',
      angle: 'interior_2d_degrees_180_is_straight',
    },
  ];
  state.csv = buildCSV(meta, header, rows);
  const subj = s.subject ? `_${s.subject.replace(/[^A-Za-z0-9-]+/g, '')}` : '';
  state.csvName = `pose_${s.exercise}_${s.view}${subj}_${timestampSlug(s.created)}.csv`;
}

function stats() {
  const n = state.frames.length;
  const detected = state.frames.filter((f) => f.lm).length;
  const dur = n > 1 ? state.frames[n - 1].time_s - state.frames[0].time_s : 0;
  const meanFps = dur > 0 ? (n - 1) / dur : 0;
  const visMean = {};
  for (const name of MAIN_LANDMARKS) {
    let sum = 0, k = 0;
    for (const f of state.frames) if (f.lm) { sum += f.lm[INDEX[name]].visibility ?? 0; k++; }
    visMean[name] = k ? sum / k : 0;
  }
  return { n, detected, dur, meanFps, visMean };
}

function showResult() {
  if (state.frames.length === 0) {
    setStatus('ไม่มีข้อมูลที่บันทึกได้');
    return;
  }
  buildOutput();
  const st = stats();
  const pct = st.n ? (100 * st.detected) / st.n : 0;
  el.summary.innerHTML = `
    <dt>จำนวนเฟรม</dt><dd>${st.n}</dd>
    <dt>ตรวจพบคน</dt><dd>${st.detected} เฟรม (${pct.toFixed(0)}%)</dd>
    <dt>ความยาว</dt><dd>${st.dur.toFixed(1)} วินาที</dd>
    <dt>อัตราเฟรมเฉลี่ย</dt><dd>${st.meanFps.toFixed(1)} เฟรม/วินาที</dd>`;
  const warns = [];
  if (pct < 90) warns.push(`ตรวจไม่พบคน ${(100 - pct).toFixed(0)}% ของเฟรม (ช่องว่างในไฟล์มี detected = 0)`);
  if (state.session.source === 'camera' && st.meanFps < 15) warns.push('อัตราเฟรมต่ำกว่า 15 ลองใช้โมเดล Lite หรือโหมดไฟล์วิดีโอ');
  const low = MAIN_LANDMARKS.filter((n) => n !== 'nose' && st.visMean[n] < 0.5).map((n) => LANDMARK_TH[n]);
  if (low.length && st.detected > 0) warns.push(`มองเห็นไม่ชัด (visibility เฉลี่ย < 0.5): ${low.join(', ')} – อาจถูกบัง ไม่ควรใช้จุดเหล่านี้วิเคราะห์`);
  el.warnings.innerHTML = warns.map((w) => `<li>${w}</li>`).join('');
  el.filename.textContent = state.csvName;
  el.shareBtn.hidden = !canShareFiles();
  el.result.hidden = false;
  el.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- โหมดไฟล์วิดีโอ ----------

function waitEvent(target, name) {
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error(name + ' failed')); };
    const cleanup = () => {
      target.removeEventListener(name, ok);
      target.removeEventListener('error', bad);
    };
    target.addEventListener(name, ok, { once: true });
    target.addEventListener('error', bad, { once: true });
  });
}

// เลื่อนวิดีโอไปยังเวลา t แล้วรอจนเฟรมพร้อม (มี timeout กันกรณีเบราว์เซอร์ไม่ส่ง seeked)
function seekTo(v, t) {
  const done = waitEvent(v, 'seeked');
  v.currentTime = t;
  return Promise.race([done, new Promise((r) => setTimeout(r, 2000))]);
}

async function loadVideoFile(file) {
  stopCamera();
  state.videoFile = null;
  el.processBtn.disabled = true;
  const v = el.video;
  v.srcObject = null;
  v.src = URL.createObjectURL(file);
  try {
    await waitEvent(v, 'loadedmetadata');
  } catch {
    setStatus('เปิดไฟล์นี้ไม่ได้ ถ้าถ่ายจาก iPhone/iPad ให้ตั้งกล้องเป็น “ใช้ร่วมกันได้มากที่สุด” หรือประมวลผลบน iPad');
    return;
  }
  // ไฟล์ webm บางไฟล์ (เช่น จากโปรแกรมอัดหน้าจอ) ไม่บอกความยาว: เลื่อนไปท้ายไฟล์เพื่อให้เบราว์เซอร์คำนวณ
  if (!Number.isFinite(v.duration)) {
    await seekTo(v, 1e7);
  }
  if (!Number.isFinite(v.duration) || v.duration <= 0) {
    setStatus('อ่านความยาวของวิดีโอนี้ไม่ได้ ลองแปลงเป็น MP4 ก่อน');
    return;
  }
  // Safari บน iOS ต้องเล่นสั้น ๆ ก่อนจึงจะวาดเฟรมลง canvas ได้
  try { await v.play(); } catch { /* ไม่เป็นไร */ }
  v.pause();
  await seekTo(v, 0).catch(() => {});
  sizeCanvasTo(v.videoWidth, v.videoHeight);
  ctx.drawImage(v, 0, 0, el.canvas.width, el.canvas.height);
  state.videoFile = file;
  setStatus(`${file.name} · ${v.duration.toFixed(1)} วินาที · ${v.videoWidth}×${v.videoHeight}`);
  el.processBtn.disabled = !state.landmarker;
}

async function processVideo() {
  const v = el.video;
  const step = 1 / Number(el.sampleFps.value);
  const total = Math.floor(v.duration / step) + 1;
  state.processing = true;
  state.cancel = false;
  el.processBtn.hidden = true;
  el.cancelBtn.hidden = false;
  el.progress.hidden = false;
  startSession('video-file', { fileName: state.videoFile.name, sampleFps: Number(el.sampleFps.value) });
  const base = state.lastTs + 1000;
  try {
    for (let i = 0; i < total && !state.cancel; i++) {
      const t = Math.min(i * step, v.duration - 0.001);
      await seekTo(v, t);
      const mediaT = v.currentTime;
      const res = detect(v, base + mediaT * 1000);
      pushFrame(i, mediaT, null, res);
      const lm = res.landmarks?.[0];
      draw(v, lm);
      updatePanels(lm, el.canvas.width, el.canvas.height);
      tickFps();
      el.progress.value = (i + 1) / total;
      setStatus(`ประมวลผล ${i + 1}/${total} เฟรม`);
    }
    setStatus(state.cancel ? 'หยุดแล้ว (บันทึกเฉพาะส่วนที่ประมวลผล)' : 'ประมวลผลเสร็จ');
  } catch (e) {
    console.error(e);
    setStatus('เกิดข้อผิดพลาดระหว่างประมวลผล: ' + e.message);
  }
  state.processing = false;
  el.processBtn.hidden = false;
  el.cancelBtn.hidden = true;
  el.progress.hidden = true;
  showResult();
}

// ---------- โหมดกล้องสด ----------

async function startCamera() {
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('เบราว์เซอร์นี้ใช้กล้องไม่ได้ (ต้องเปิดผ่าน https)');
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (e) {
    setStatus('เปิดกล้องไม่ได้: ' + e.message);
    return;
  }
  const v = el.video;
  v.removeAttribute('src');
  v.srcObject = state.stream;
  await v.play();
  sizeCanvasTo(v.videoWidth, v.videoHeight);
  // แสดงภาพกลับซ้าย–ขวาเฉพาะกล้องหน้าเหมือนส่องกระจก ข้อมูลที่บันทึกไม่กลับ
  el.canvas.classList.toggle('mirrored', state.facing === 'user');
  state.live = true;
  el.cameraBtn.textContent = 'ปิดกล้อง';
  el.flipBtn.disabled = false;
  el.recordBtn.disabled = !state.landmarker;
  setStatus(`กล้อง ${v.videoWidth}×${v.videoHeight}`);
  requestAnimationFrame(liveLoop);
}

function stopCamera() {
  if (state.recording) stopRecording();
  state.live = false;
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  state.stream = null;
  el.canvas.classList.remove('mirrored');
  el.cameraBtn.textContent = 'เปิดกล้อง';
  el.flipBtn.disabled = true;
  el.recordBtn.disabled = true;
}

let lastVideoTime = -1;
function liveLoop() {
  if (!state.live) return;
  const v = el.video;
  if (state.landmarker && v.readyState >= 2 && v.currentTime !== lastVideoTime) {
    lastVideoTime = v.currentTime;
    if (v.videoWidth !== el.canvas.width) sizeCanvasTo(v.videoWidth, v.videoHeight);
    const now = performance.now();
    const res = detect(v, now);
    const lm = res.landmarks?.[0];
    if (state.recording) {
      pushFrame(state.frameCount++, (now - state.recStart) / 1000, Math.round(performance.timeOrigin + now), res);
    }
    draw(v, lm);
    updatePanels(lm, el.canvas.width, el.canvas.height);
    tickFps();
  }
  requestAnimationFrame(liveLoop);
}

async function countdown(sec) {
  el.overlay.hidden = false;
  for (let s = sec; s > 0; s--) {
    el.overlay.textContent = s;
    await new Promise((r) => setTimeout(r, 1000));
  }
  el.overlay.hidden = true;
}

async function startRecording() {
  el.recordBtn.disabled = true;
  if (el.countdown.checked) await countdown(5);
  if (!state.live) return;
  startSession('camera', { fileName: '' });
  state.frameCount = 0;
  state.recStart = performance.now();
  state.recording = true;
  el.recordBtn.disabled = false;
  el.recordBtn.textContent = 'หยุดบันทึก';
  el.recordBtn.classList.add('recording');
  requestWakeLock();
  const dur = Number(el.recDuration.value);
  if (dur > 0) state.recTimer = setTimeout(stopRecording, dur * 1000);
  updateRecStatus();
}

function updateRecStatus() {
  if (!state.recording) return;
  const t = (performance.now() - state.recStart) / 1000;
  const dur = Number(el.recDuration.value);
  setStatus(`กำลังบันทึก ${t.toFixed(0)}${dur ? '/' + dur : ''} วินาที · ${state.frames.length} เฟรม`);
  setTimeout(updateRecStatus, 250);
}

function stopRecording() {
  if (!state.recording) return;
  clearTimeout(state.recTimer);
  state.recording = false;
  el.recordBtn.textContent = 'เริ่มบันทึก';
  el.recordBtn.classList.remove('recording');
  releaseWakeLock();
  setStatus('บันทึกเสร็จ');
  showResult();
}

async function requestWakeLock() {
  try {
    state.wakeLock = await navigator.wakeLock?.request('screen');
  } catch { /* เบราว์เซอร์ไม่รองรับ */ }
}

function releaseWakeLock() {
  state.wakeLock?.release().catch(() => {});
  state.wakeLock = null;
}

// ---------- ส่วนติดต่อผู้ใช้ ----------

function setMode(mode) {
  if (state.processing || state.recording) return;
  state.mode = mode;
  el.tabFile.classList.toggle('active', mode === 'file');
  el.tabCamera.classList.toggle('active', mode === 'camera');
  el.tabFile.setAttribute('aria-selected', mode === 'file');
  el.tabCamera.setAttribute('aria-selected', mode === 'camera');
  el.fileControls.hidden = mode !== 'file';
  el.cameraControls.hidden = mode !== 'camera';
  if (mode === 'file') stopCamera();
}

function fillExercises() {
  el.exercise.innerHTML = EXERCISES.map((e) => `<option value="${e.id}">${e.th}</option>`).join('');
  const update = () => {
    const ex = EXERCISES.find((e) => e.id === el.exercise.value);
    el.view.value = ex.view;
    el.viewTip.textContent = '📷 ' + ex.tip;
    el.exerciseOther.hidden = ex.id !== 'other';
  };
  el.exercise.addEventListener('change', update);
  update();
}

function bind() {
  el.tabFile.onclick = () => setMode('file');
  el.tabCamera.onclick = () => setMode('camera');
  el.videoFile.onchange = () => el.videoFile.files[0] && loadVideoFile(el.videoFile.files[0]);
  el.processBtn.onclick = () => processVideo();
  el.cancelBtn.onclick = () => { state.cancel = true; };
  el.cameraBtn.onclick = () => (state.live ? stopCamera() : startCamera());
  el.flipBtn.onclick = () => {
    state.facing = state.facing === 'environment' ? 'user' : 'environment';
    startCamera();
  };
  el.recordBtn.onclick = () => (state.recording ? stopRecording() : startRecording());
  el.model.onchange = async () => {
    if (state.processing || state.recording) return;
    el.processBtn.disabled = true;
    el.recordBtn.disabled = true;
    await createLandmarker(el.model.value).catch(onEngineError);
    el.processBtn.disabled = !state.videoFile;
    el.recordBtn.disabled = !state.live;
  };
  el.downloadBtn.onclick = () => downloadText(state.csv, state.csvName);
  el.shareBtn.onclick = () => shareText(state.csv, state.csvName).catch((e) => {
    if (e.name !== 'AbortError') setStatus('แชร์ไม่สำเร็จ ใช้ปุ่มดาวน์โหลดแทน');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.recording) requestWakeLock();
  });
}

function onEngineError(e) {
  console.error(e);
  setEngine('โหลดโมเดลไม่สำเร็จ', 'err');
  setStatus('โหลดโมเดลไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วโหลดหน้าใหม่');
}

fillExercises();
buildPanels();
bind();
createLandmarker(el.model.value)
  .then(() => {
    el.processBtn.disabled = !state.videoFile;
    el.recordBtn.disabled = !state.live;
  })
  .catch(onEngineError);
