"""ดาวน์โหลดไลบรารี MediaPipe และโมเดลมาไว้ใน tools/vendor/

ใช้ทั้งตอนดูตัวอย่างในเครื่อง และใน GitHub Actions ก่อน render
เว็บจึงไม่ต้องพึ่งเซิร์ฟเวอร์ภายนอกระหว่างสอน (ถ้าไม่มีไฟล์ เครื่องมือจะโหลดจาก CDN แทน)

    python scripts/fetch_vendor.py
"""

from pathlib import Path
from urllib.request import urlopen

TASKS_VERSION = "0.10.35"
TASKS = f"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@{TASKS_VERSION}/"
MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_{0}/float16/1/pose_landmarker_{0}.task"

ROOT = Path(__file__).resolve().parent.parent / "tools" / "vendor"

FILES = {
    "tasks-vision/vision_bundle.mjs": TASKS + "vision_bundle.mjs",
    "tasks-vision/wasm/vision_wasm_internal.js": TASKS + "wasm/vision_wasm_internal.js",
    "tasks-vision/wasm/vision_wasm_internal.wasm": TASKS + "wasm/vision_wasm_internal.wasm",
    "tasks-vision/wasm/vision_wasm_nosimd_internal.js": TASKS + "wasm/vision_wasm_nosimd_internal.js",
    "tasks-vision/wasm/vision_wasm_nosimd_internal.wasm": TASKS + "wasm/vision_wasm_nosimd_internal.wasm",
    "models/pose_landmarker_lite.task": MODEL.format("lite"),
    "models/pose_landmarker_full.task": MODEL.format("full"),
    "models/pose_landmarker_heavy.task": MODEL.format("heavy"),
}


def main() -> None:
    for rel, url in FILES.items():
        dest = ROOT / rel
        if dest.exists() and dest.stat().st_size > 0:
            print(f"มีแล้ว  {rel}")
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        with urlopen(url) as r:
            data = r.read()
        dest.write_bytes(data)
        print(f"โหลดแล้ว {rel} ({len(data) / 1e6:.1f} MB)")
    (ROOT / "VERSION.txt").write_text(f"tasks-vision {TASKS_VERSION}\npose_landmarker float16/1\n", encoding="utf-8")


if __name__ == "__main__":
    main()
