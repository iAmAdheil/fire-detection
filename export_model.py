"""
Converts fire_best.pt (YOLOv8n) → model/fire_model.onnx

YOLOv8 export is straightforward via the ultralytics package.
No torch.load patching needed — ultralytics handles it natively.
"""

import os
import shutil
from ultralytics import YOLO

WEIGHTS = "new/best.pt"
OUTPUT  = "model/fire_model.onnx"

os.makedirs("model", exist_ok=True)

print("Loading YOLOv8 model...")
model = YOLO(WEIGHTS)
print("Model loaded.")

print("\nExporting to ONNX...")
exported_path = model.export(format="onnx", imgsz=640)
print(f"Exported to: {exported_path}")

shutil.move(str(exported_path), OUTPUT)
print(f"\nDone! Saved to: {OUTPUT}")
