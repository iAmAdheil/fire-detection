#  Real-Time Wildfire Detection using UAVs

<div align="center">

![Python](https://img.shields.io/badge/Python-3.10-3776AB?style=for-the-badge&logo=python&logoColor=white)
![YOLOv8](https://img.shields.io/badge/YOLOv8-Ultralytics-FF6F00?style=for-the-badge&logo=pytorch&logoColor=white)
![OpenCV](https://img.shields.io/badge/OpenCV-4.x-5C3EE8?style=for-the-badge&logo=opencv&logoColor=white)
![Raspberry Pi](https://img.shields.io/badge/Raspberry_Pi_3-A22846?style=for-the-badge&logo=raspberrypi&logoColor=white)
![Jetson Nano](https://img.shields.io/badge/NVIDIA_Jetson_Nano-76B900?style=for-the-badge&logo=nvidia&logoColor=white)
![REST API](https://img.shields.io/badge/REST_API-FF6C37?style=for-the-badge&logo=postman&logoColor=white)

**A real-time fire and smoke detection system using YOLOv8, optimized for edge deployment on UAVs — enabling early wildfire detection in remote, resource-constrained environments.**

[Overview](#-overview) • [Key Features](#-key-features) • [System Architecture](#-system-architecture) • [Tech Stack](#-tech-stack) • [Setup](#-setup--installation) • [Results](#-results--performance) • [How It Works](#-how-it-works)

</div>

---

##  Overview

Wildfires spread within minutes and cause catastrophic damage to forests, wildlife, and human settlements. Traditional detection systems rely on fixed camera networks or manual aerial surveys — both of which are slow and expensive.

This project deploys a **YOLOv8-based fire and smoke detection model** on a UAV (drone), enabling autonomous real-time detection in remote areas. The system runs on **low-power edge devices** (Raspberry Pi 3 / NVIDIA Jetson Nano), sends **instant REST API alerts with geo-tagged snapshots**, and achieves **sub-2-second response times**.

> 🗓️ **Timeline:** January 2025 – March 2025

---

##  Key Features

| Feature | Details |
|---|---|
|  **Fast Alert Response** | < 2 seconds from detection to REST API alert |
|  **YOLOv8 Model** | Custom-trained on fire & smoke aerial imagery |
|  **INT8 Quantization** | Reduces model size and latency for edge inference |
|  **Geo-Tagged Snapshots** | Alerts include GPS coordinates + image frame |
|  **REST API Integration** | HTTP POST alerts to remote server / dashboard |
|  **Edge Optimized** | Runs on Raspberry Pi 3 and NVIDIA Jetson Nano |
|  **Real-Time Video Feed** | Processed using OpenCV frame-by-frame |
|  **UAV Compatible** | Designed for UAV/drone deployment in field conditions |

---

##  System Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                        UAV / Drone                            │
│                                                               │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Camera    │───▶│  Raspberry   │──▶│  YOLOv8 (INT8)   │  │
│  │  (Live Feed)│    │   Pi 3 /     │    │  Fire & Smoke    │  │
│  └─────────────┘    │ Jetson Nano  │    │  Detection Model │  │
│                     └──────────────┘    └────────┬─────────┘  │
│                                                  │            │
│                                         Fire/Smoke Detected?  │
└─────────────────────────────────────────────────┼─────────────┘
                                                  │ YES
                                    ┌─────────────▼──────────────┐
                                    │      Alert Trigger         │
                                    │  • Capture Frame Snapshot  │
                                    │  • Tag with GPS Coords     │
                                    │  • Timestamp Metadata      │
                                    └─────────────┬──────────────┘
                                                  │
                                    ┌─────────────▼──────────────┐
                                    │     REST API (HTTP POST)   │
                                    │  Payload: image + GPS +    │
                                    │  confidence + timestamp    │
                                    └─────────────┬──────────────┘
                                                  │
                                    ┌─────────────▼──────────────┐
                                    │   Remote Server / Dashboard│
                                    │   Receives alert in < 2s   │
                                    └────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Programming Language** | Python 3.10 |
| **Detection Model** | YOLOv8 (Ultralytics) |
| **Computer Vision** | OpenCV 4.x |
| **Model Optimization** | INT8 Quantization (ONNX / TFLite) |
| **Edge Hardware** | Raspberry Pi 3, NVIDIA Jetson Nano |
| **Alert System** | REST API (HTTP POST with JSON payload) |
| **GPS Integration** | NMEA GPS Module (serial interface) |

---








---

## 🧠 Model Details

### YOLOv8 Training

- **Dataset:** Custom dataset of aerial fire/smoke images collected from public wildfire datasets and UAV footage
- **Classes:** `fire`, `smoke`
- **Input Resolution:** 640×640
- **Training:** Fine-tuned YOLOv8n (nano) for edge deployment

### INT8 Quantization

To reduce inference time on Raspberry Pi and Jetson Nano, the model is quantized from FP32 to INT8:


## 🌐 REST API Alert Format

When fire/smoke is detected, the system sends an HTTP POST request



---

## 📊 Results & Performance

| Metric | Value |
|---|---|
| **Alert Response Time** | < 2 seconds |
| **Model (FP32) Size** | ~6 MB (YOLOv8n) |
| **Model (INT8) Size** | ~1.5 MB |
| **Inference Speed (Pi 3)** | ~8–12 FPS |
| **Inference Speed (Jetson Nano)** | ~25–30 FPS |
| **Detection Confidence Threshold** | 0.5 |
| **Classes Detected** | Fire, Smoke |

---

## 🔍 How It Works

1. **UAV captures live video** using an onboard camera module
2. **OpenCV reads frames** from the video stream in real-time
3. **YOLOv8 (INT8 quantized)** runs inference on each frame, detecting fire and smoke
4. **If fire/smoke is detected** with confidence > 50%:
   - The current frame is captured as a snapshot
   - GPS coordinates are read from the serial GPS module
   - A JSON payload is assembled with image + location + timestamp
   - An HTTP POST request is sent to the configured REST API endpoint
   - (Optional) A Telegram alert is dispatched via Telegram Bot API
5. **Remote server / dashboard** receives the alert in under 2 seconds

---



## 🔮 Future Improvements

- [ ] Add night-vision / thermal camera support
- [ ] On-device model with TensorFlow Lite for even lower latency
- [ ] Real-time dashboard with map visualization of alerts
- [ ] Multi-UAV swarm coordination for larger coverage area
- [ ] 5G / LoRa connectivity fallback for remote areas

---

---

##  Author

**Hardik Mittal**  
[GitHub: @hardikm21](https://github.com/hardikm21)

---


---

<div align="center">

 **If this project was helpful, please give it a star!** ⭐

*Built with 🔥 to fight 🔥*

</div>
