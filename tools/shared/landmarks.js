// ชื่อจุดของ MediaPipe Pose (33 จุด) และสูตรมุมข้อต่อที่ใช้ร่วมกันทุกเครื่องมือ
// ซ้าย/ขวา หมายถึงซ้าย/ขวาของ "ร่างกายผู้ถูกวัด" ไม่ใช่ซ้าย/ขวาของภาพ

export const LANDMARK_NAMES = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
  'left_index', 'right_index', 'left_thumb', 'right_thumb',
  'left_hip', 'right_hip', 'left_knee', 'right_knee',
  'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index',
];

export const LANDMARK_TH = {
  nose: 'จมูก',
  left_shoulder: 'ไหล่ซ้าย', right_shoulder: 'ไหล่ขวา',
  left_elbow: 'ศอกซ้าย', right_elbow: 'ศอกขวา',
  left_wrist: 'ข้อมือซ้าย', right_wrist: 'ข้อมือขวา',
  left_hip: 'สะโพกซ้าย', right_hip: 'สะโพกขวา',
  left_knee: 'เข่าซ้าย', right_knee: 'เข่าขวา',
  left_ankle: 'ข้อเท้าซ้าย', right_ankle: 'ข้อเท้าขวา',
  left_heel: 'ส้นเท้าซ้าย', right_heel: 'ส้นเท้าขวา',
  left_foot_index: 'ปลายเท้าซ้าย', right_foot_index: 'ปลายเท้าขวา',
};

// จุดหลักที่ใช้วิเคราะห์การเคลื่อนไหวของแขน ลำตัว และขา (17 จุด)
export const MAIN_LANDMARKS = [
  'nose',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
  'left_heel', 'right_heel', 'left_foot_index', 'right_foot_index',
];

export const INDEX = Object.fromEntries(LANDMARK_NAMES.map((n, i) => [n, i]));

// มุมระหว่างสามจุด (มุมที่จุดกลาง) ค่า 0–180 องศา
// เช่น เข่าเหยียดตรง ≈ 180°, งอเข่า 90° → มุม ≈ 90°
export const ANGLE_DEFS = [
  { key: 'left_elbow', label: 'ศอกซ้าย', pts: ['left_shoulder', 'left_elbow', 'left_wrist'] },
  { key: 'right_elbow', label: 'ศอกขวา', pts: ['right_shoulder', 'right_elbow', 'right_wrist'] },
  { key: 'left_shoulder', label: 'ไหล่ซ้าย', pts: ['left_hip', 'left_shoulder', 'left_elbow'] },
  { key: 'right_shoulder', label: 'ไหล่ขวา', pts: ['right_hip', 'right_shoulder', 'right_elbow'] },
  { key: 'left_hip', label: 'สะโพกซ้าย', pts: ['left_shoulder', 'left_hip', 'left_knee'] },
  { key: 'right_hip', label: 'สะโพกขวา', pts: ['right_shoulder', 'right_hip', 'right_knee'] },
  { key: 'left_knee', label: 'เข่าซ้าย', pts: ['left_hip', 'left_knee', 'left_ankle'] },
  { key: 'right_knee', label: 'เข่าขวา', pts: ['right_hip', 'right_knee', 'right_ankle'] },
  { key: 'left_ankle', label: 'ข้อเท้าซ้าย', pts: ['left_knee', 'left_ankle', 'left_foot_index'] },
  { key: 'right_ankle', label: 'ข้อเท้าขวา', pts: ['right_knee', 'right_ankle', 'right_foot_index'] },
];

const DEG = 180 / Math.PI;

// มุม 2 มิติในระนาบภาพ: ต้องใช้พิกัดหน่วยพิกเซล (x และ y สเกลเดียวกัน)
export function angle2D(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const cross = v1x * v2y - v1y * v2x;
  return Math.abs(Math.atan2(cross, dot)) * DEG;
}

// มุม 3 มิติจาก world landmarks (หน่วยเมตร)
export function angle3D(a, b, c) {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const n = Math.hypot(...v1) * Math.hypot(...v2);
  if (n === 0) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, dot / n))) * DEG;
}
