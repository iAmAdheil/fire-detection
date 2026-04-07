from ultralytics import YOLO
import requests

# Load trained model
model = YOLO("runs/detect/train2/weights/best.pt")

BOT_TOKEN = "8665798203:AAFfSzqFKooNNIGPTzPfIBNLMrYDzyDIO1M"
CHAT_ID = "1257234796"

def send_telegram_message(text):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = {
        "chat_id": CHAT_ID,
        "text": text
    }
    requests.post(url, data=data)

# Run detection
results = model.predict(
    source=0,
    show=True,
    conf=0.4,
    save=True,
    stream=True   # important for frame-by-frame processing
)

fire_detected = False

for r in results:
    if r.boxes is not None and len(r.boxes) > 0:
        fire_detected = True
        send_telegram_message("🔥 Fire detected in video!")
        break   # send only once