from ultralytics import YOLO

# Load trained model
model = YOLO("runs/detect/train2/weights/best.pt")

# Run detection on live webcam
model.predict(
    source=0,          # 0 = default webcam
    show=True,         # show live video window
    conf=0.4,          # confidence threshold
    save=True          # save output video in runs folder
)