// รูปแบบไฟล์ CSV ของ toolkit
// - บรรทัดขึ้นต้นด้วย "# " คือ metadata รูปแบบ key=value; key=value
// - ตามด้วยหัวตาราง 1 บรรทัด และข้อมูล
// - ขึ้นต้นไฟล์ด้วย BOM เพื่อให้ Excel อ่านภาษาไทยถูกต้อง

export const TOOLKIT_ID = 'movement-science-toolkit';

function cleanValue(v) {
  return String(v ?? '').replace(/[;\r\n]+/g, ' ').trim();
}

export function metaLine(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${cleanValue(v)}`)
    .join('; ');
}

export function buildCSV(metaObjects, header, rows) {
  const cell = (v) => (v === null || v === undefined || Number.isNaN(v) ? '' : String(v));
  const lines = [];
  for (const m of metaObjects) lines.push('# ' + metaLine(m));
  lines.push(header.join(','));
  for (const r of rows) lines.push(r.map(cell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// อ่านไฟล์ CSV ของ toolkit กลับมาเป็น { meta, header, rows }
export function parseCSV(text) {
  const meta = {};
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  let i = 0;
  for (; i < lines.length && lines[i].startsWith('#'); i++) {
    for (const part of lines[i].slice(1).split(';')) {
      const eq = part.indexOf('=');
      if (eq > 0) meta[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
  }
  const header = (lines[i++] || '').split(',');
  const rows = [];
  for (; i < lines.length; i++) {
    if (!lines[i]) continue;
    rows.push(lines[i].split(',').map((v) => (v === '' ? NaN : Number(v))));
  }
  return { meta, header, rows };
}

export function timestampSlug(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// บันทึกไฟล์: แชร์ผ่าน share sheet (iPhone/iPad) หรือดาวน์โหลด
export function downloadText(text, filename, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function canShareFiles() {
  try {
    const f = new File(['x'], 'x.csv', { type: 'text/csv' });
    return !!(navigator.canShare && navigator.canShare({ files: [f] }));
  } catch {
    return false;
  }
}

export async function shareText(text, filename, mime = 'text/csv') {
  const file = new File([text], filename, { type: mime });
  await navigator.share({ files: [file], title: filename });
}
