# Godown Fire Detection System

Real-time fire and smoke detection for 5 godown CCTV feeds, running entirely in the browser using WebAssembly. When fire is detected, a Telegram alert is sent instantly.

## How It Works

```
Browser Tab
├── 5 video feeds (one per godown) play on loop
├── Every frame:
│   ├── Frame drawn to canvas, converted to float tensor
│   ├── YOLOv8n model runs inference via ONNX Runtime Web (WASM)
│   └── If fire/smoke confidence > threshold → draw bounding box
├── Sliding window confirmation (3/5 strong frames) → badge turns FIRE
└── Telegram Bot API sends alert with godown number
```

All ML inference happens client-side in the browser — no backend server required for detection.

## Tech Stack

| Layer | Technology |
|---|---|
| ML Model | YOLOv8n (nano), trained on fire+smoke dataset |
| Inference | ONNX Runtime Web (WASM backend) |
| Model Format | ONNX (exported from PyTorch .pt) |
| Frontend | Vanilla HTML/CSS/JS, Canvas API |
| Notifications | Telegram Bot API (called directly from browser) |

## Project Structure

```
├── index.html          # Main page — loads ORT, config, detector, app
├── style.css           # CCTV monitor dark theme
├── config.js           # Telegram bot token + chat ID (gitignored)
├── js/
│   ├── detector.js     # Model loading, preprocessing, inference, postprocessing
│   └── app.js          # UI, detection loop, bounding box drawing, alerts
├── model/
│   └── fire_model.onnx # YOLOv8n fire+smoke model (exported from .pt)
├── videos/             # 5 godown CCTV videos (gitignored)
├── export_model.py     # One-time script to convert .pt → .onnx
└── .gitignore
```

## Setup

### 1. Clone the repo

```bash
git clone <repo-url>
cd iot-project
```

### 2. Add video files

Place 5 `.mp4` video files in the `videos/` folder. Update the filenames in `js/app.js` if needed:

```javascript
const GODOWNS = [
    { id: 1, src: 'videos/fire-video.mp4'    },
    { id: 2, src: 'videos/normal-video.mp4'  },
    { id: 3, src: 'videos/normal-video.mp4'  },
    { id: 4, src: 'videos/normal-video.mp4'  },
    { id: 5, src: 'videos/normal-video.mp4'  },
];
```

### 3. Add the ONNX model

Place `fire_model.onnx` in the `model/` folder. To train and export your own:

1. Train YOLOv8n on Google Colab (free T4 GPU):
   ```python
   from ultralytics import YOLO
   model = YOLO("yolov8n.pt")
   model.train(data="path/to/data.yaml", epochs=50, imgsz=640, batch=16)
   ```

2. Export to ONNX locally:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install ultralytics
   python export_model.py
   ```

### 4. Set up Telegram notifications

1. Open Telegram, message **@BotFather**, send `/newbot`
2. Copy the bot token
3. Start a chat with your bot, send it any message
4. Get your chat ID: `https://api.telegram.org/bot<TOKEN>/getUpdates`
5. Create `config.js` in the project root:
   ```javascript
   const TG_BOT_TOKEN = 'your-bot-token';
   const TG_CHAT_ID   = 'your-chat-id';
   ```

### 5. Run

Open `index.html` with VS Code Live Server (or any local HTTP server).

```bash
# Alternative: Python HTTP server
python3 -m http.server 8080
```

Open `http://localhost:8080` in your browser.

## Detection Logic

- **Bounding boxes** appear at 35% confidence (visual feedback)
- **Fire alert** triggers only when 3 out of the last 5 frames have confidence > 45% (sliding window)
- **Telegram cooldown**: 60 seconds between alerts per godown
- **Classes detected**: fire (red boxes), smoke (orange boxes)

## Model Details

- **Architecture**: YOLOv8n (nano) — 3M parameters, ~6MB
- **Classes**: fire, smoke
- **Input**: 640x640 RGB
- **Output**: `[1, 6, 8400]` — 8400 candidate detections, each with (x, y, w, h, fire_conf, smoke_conf)
- **Inference**: ~250ms per frame on CPU via WASM
