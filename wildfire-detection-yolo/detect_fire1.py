from ultralytics import YOLO

# Load trained model
model = YOLO("runs/detect/train2/weights/best.pt")

# Run detection on video
model.predict(
    source="C:/Users/Admin/OneDrive/Desktop/wildfire/test2.mp4",  # your video file name
    show=True,
    conf=0.4,
    save=True
)