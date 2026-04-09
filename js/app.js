/**
 * app.js
 *
 * Builds the UI, runs the detection loop for each godown,
 * and draws bounding boxes on the canvas overlay.
 */

const GODOWNS = [
    { id: 1, src: 'videos/CCTV_Godown_Fire_Video_Generation.mp4'  },
    { id: 2, src: 'videos/Fight_Detection_Model_Test_Video.mp4'   },
    { id: 3, src: 'videos/Video_of_Fire_and_Fighting.mp4'         },
    { id: 4, src: 'videos/Video_Generation_Without_Fire.mp4'      },
    { id: 5, src: 'videos/Video_Generation_Without_Fire.mp4'      },
];

const DETECTION_INTERVAL_MS = 0; // run inference back-to-back, no artificial wait

// ─── Telegram alert config ───────────────────────────────────────────────────
// TG_BOT_TOKEN and TG_CHAT_ID are loaded from config.js (gitignored)

function sendTelegramAlert(godownId, type = 'fire') {
    const messages = {
        fire:  `🚨 FIRE DETECTED — Godown ${godownId}\nImmediate attention required!`,
        fight: `⚠️ FIGHT DETECTED — Godown ${godownId}\nImmediate attention required!`,
    };
    const text = messages[type] || messages.fire;
    fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, text }),
    })
    .then(r => r.json())
    .then(data => console.log(`Telegram alert (${type}) sent for Godown ${godownId}:`, data.ok))
    .catch(err => console.error('Telegram error:', err));
}

// ─── Alert state (consecutive frame tracking per godown) ─────────────────────
// Bounding boxes still draw at CONF_THRESHOLD (0.35) for visual responsiveness.
// But the badge / alert only triggers after ALERT_CONSECUTIVE consecutive frames
// where at least one detection has confidence > ALERT_CONF_THRESHOLD.

const ALERT_CONF_THRESHOLD = 0.45; // confidence required for a "strong" frame
const WINDOW_SIZE          = 5;   // look at last 5 frames
const WINDOW_MIN           = 3;   // need 3 out of 5 to be strong

const alertState = {};  // godownId → { history: boolean[], alerted: boolean }

const ALERT_COOLDOWN_MS = 60000; // 60 seconds between Telegram alerts per godown

function initAlertState(id) {
    alertState[id] = { history: [], alerted: false, lastAlertTime: 0 };
}

function updateAlertState(id, detections) {
    const state = alertState[id];
    const hasStrong = detections.some(d => d.confidence >= ALERT_CONF_THRESHOLD);

    // Push latest result, keep only last WINDOW_SIZE entries
    state.history.push(hasStrong);
    if (state.history.length > WINDOW_SIZE) state.history.shift();

    // Count how many of the last N frames had strong detections
    const strongCount = state.history.filter(Boolean).length;
    const confirmed   = strongCount >= WINDOW_MIN;

    const now = Date.now();
    if (confirmed && now - state.lastAlertTime > ALERT_COOLDOWN_MS) {
        state.alerted = true;
        state.lastAlertTime = now;
        console.log(`🚨 [Godown ${id}] FIRE CONFIRMED — ${strongCount}/${WINDOW_SIZE} frames`);
        sendTelegramAlert(id);

        // Log to incident store for the analytics dashboard
        if (typeof IncidentLogger !== 'undefined') {
            const bestDet = detections.reduce((a, b) => a.confidence > b.confidence ? a : b, detections[0]);
            IncidentLogger.log({
                godownId: id,
                type: bestDet ? bestDet.label : 'fire',
                confidence: bestDet ? bestDet.confidence : 0.5,
            });
        }
    }

    // Reset alerted flag when fire clears (so it can re-trigger if fire returns)
    if (strongCount === 0) {
        if (state.alerted && typeof IncidentLogger !== 'undefined') {
            IncidentLogger.resolve(id, 'fire');
            IncidentLogger.resolve(id, 'smoke');
        }
        state.alerted = false;
    }

    return confirmed;
}

// ─── Fight alert state (same sliding window approach) ───────────────────────

const FIGHT_ALERT_THRESHOLD = 0.5;
const FIGHT_WINDOW_SIZE     = 5;
const FIGHT_WINDOW_MIN      = 3;

const fightAlertState = {};

function initFightAlertState(id) {
    fightAlertState[id] = { history: [], alerted: false, lastAlertTime: 0 };
}

function updateFightAlertState(id, fightProb) {
    const state = fightAlertState[id];
    const isStrong = fightProb >= FIGHT_ALERT_THRESHOLD;

    state.history.push(isStrong);
    if (state.history.length > FIGHT_WINDOW_SIZE) state.history.shift();

    const strongCount = state.history.filter(Boolean).length;
    const confirmed   = strongCount >= FIGHT_WINDOW_MIN;

    const now = Date.now();
    if (confirmed && now - state.lastAlertTime > ALERT_COOLDOWN_MS) {
        state.alerted = true;
        state.lastAlertTime = now;
        console.log(`⚠️ [Godown ${id}] FIGHT CONFIRMED — ${strongCount}/${FIGHT_WINDOW_SIZE} frames`);
        sendTelegramAlert(id, 'fight');

        // Log to incident store for the analytics dashboard
        if (typeof IncidentLogger !== 'undefined') {
            IncidentLogger.log({
                godownId: id,
                type: 'fight',
                confidence: fightProb,
            });
        }
    }

    if (strongCount === 0) {
        if (state.alerted && typeof IncidentLogger !== 'undefined') {
            IncidentLogger.resolve(id, 'fight');
        }
        state.alerted = false;
    }

    return confirmed;
}

// ─── Draw skeleton overlays ─────────────────────────────────────────────────

function drawSkeletonsOverlay(canvas, persons, fightConfirmed) {
    // Draws on existing canvas without clearing — call after drawDetections
    const ctx = canvas.getContext('2d');
    const color = fightConfirmed ? '#ff3333' : '#00ccff';

    persons.forEach(({ keypoints, confidence }) => {
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;

        SKELETON.forEach(([a, b]) => {
            const kpA = keypoints[a];
            const kpB = keypoints[b];
            if (kpA.conf > 0.3 && kpB.conf > 0.3) {
                ctx.beginPath();
                ctx.moveTo(kpA.x, kpA.y);
                ctx.lineTo(kpB.x, kpB.y);
                ctx.stroke();
            }
        });

        keypoints.forEach(kp => {
            if (kp.conf > 0.3) {
                ctx.beginPath();
                ctx.arc(kp.x, kp.y, 3, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
            }
        });
    });
}

// ─── Update card status for fight godowns ───────────────────────────────────

function updateCardFight(id, fightProb) {
    const card  = document.getElementById(`card-${id}`);
    const badge = document.getElementById(`badge-${id}`);

    const confirmed = updateFightAlertState(id, fightProb);

    if (confirmed) {
        card.classList.add('on-fight');
        badge.textContent = 'FIGHT';
        badge.className   = 'badge fight';
    } else {
        card.classList.remove('on-fight');
        badge.textContent = 'NORMAL';
        badge.className   = 'badge';
    }

    return confirmed;
}

// ─── Combined detection loop (fire + fight in parallel) ─────────────────────

function startCombinedLoop(id) {
    const video  = document.getElementById(`video-${id}`);
    const canvas = document.getElementById(`canvas-${id}`);

    async function loop() {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        // Run fire and fight detection in parallel on the same frame
        const [detections, { persons, fightProb }] = await Promise.all([
            detect(video),
            detectFight(video, id),
        ]);

        // Draw fire bounding boxes first, then skeletons on top
        canvas.width  = video.clientWidth;
        canvas.height = video.clientHeight;
        drawDetections(canvas, video, detections);

        const fightConfirmed = updateCardFight(id, fightProb);
        drawSkeletonsOverlay(canvas, persons, fightConfirmed);

        // Fire alert state (runs independently)
        updateCard(id, detections);

        // If fight is confirmed, override the badge to show FIGHT
        // (fire badge takes priority only if both are active)
        const fireConfirmed = alertState[id] && alertState[id].alerted;
        const card  = document.getElementById(`card-${id}`);
        const badge = document.getElementById(`badge-${id}`);

        if (fireConfirmed && fightConfirmed) {
            card.classList.add('on-fire');
            card.classList.add('on-fight');
            badge.textContent = 'FIRE + FIGHT';
            badge.className   = 'badge fire';
        } else if (fireConfirmed) {
            card.classList.remove('on-fight');
        } else if (fightConfirmed) {
            card.classList.remove('on-fire');
            card.classList.add('on-fight');
            badge.textContent = 'FIGHT';
            badge.className   = 'badge fight';
        }

        setTimeout(loop, DETECTION_INTERVAL_MS);
    }

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        loop();
    } else {
        video.addEventListener('canplay', loop, { once: true });
    }
}

// ─── Which godowns use fight detection ──────────────────────────────────────
const FIGHT_GODOWNS = new Set([1, 2, 3, 4, 5]);

// ─── Build UI ────────────────────────────────────────────────────────────────

function buildUI() {
    const grid = document.getElementById('grid');

    GODOWNS.forEach(({ id, src }) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.id = `card-${id}`;

        card.innerHTML = `
            <div class="video-wrap">
                <div class="card-header">
                    <span class="godown-label">Godown ${id}</span>
                    <span class="badge" id="badge-${id}">NORMAL</span>
                </div>
                <video id="video-${id}"
                       src="${src}"
                       autoplay muted loop playsinline>
                </video>
                <canvas id="canvas-${id}"></canvas>
            </div>
        `;

        grid.appendChild(card);
    });
}

// ─── Draw bounding boxes ─────────────────────────────────────────────────────

function drawDetections(canvas, video, detections) {
    // Sync canvas pixel size to the video's rendered size on screen
    canvas.width  = video.clientWidth;
    canvas.height = video.clientHeight;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach(({ box, confidence, label }) => {
        const [x1, y1, x2, y2] = box;
        const w = x2 - x1;
        const h = y2 - y1;

        // Fire = red, Smoke = orange
        const color = label === 'fire' ? '#ff3333' : '#ff9900';

        // Draw the bounding box rectangle
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.strokeRect(x1, y1, w, h);

        // Draw label background + text
        const text = `${label} ${Math.round(confidence * 100)}%`;
        ctx.font = 'bold 12px monospace';
        const textW = ctx.measureText(text).width;

        ctx.fillStyle = color;
        ctx.fillRect(x1, y1 - 20, textW + 8, 20);

        ctx.fillStyle = '#fff';
        ctx.fillText(text, x1 + 4, y1 - 5);
    });
}

// ─── Update card status ───────────────────────────────────────────────────────

function updateCard(id, detections) {
    const card  = document.getElementById(`card-${id}`);
    const badge = document.getElementById(`badge-${id}`);

    // Use consecutive-frame confirmation, not single-frame detection
    const confirmed = updateAlertState(id, detections);

    if (confirmed) {
        card.classList.add('on-fire');
        badge.textContent = 'FIRE';
        badge.className   = 'badge fire';
    } else {
        card.classList.remove('on-fire');
        badge.textContent = 'NORMAL';
        badge.className   = 'badge';
    }
}

// ─── Detection loop (one per godown) ─────────────────────────────────────────

function startLoop(id) {
    const video  = document.getElementById(`video-${id}`);
    const canvas = document.getElementById(`canvas-${id}`);

    async function loop() {
        // Clear immediately so previous boxes don't linger during inference
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        const detections = await detect(video); // from detector.js
        drawDetections(canvas, video, detections);
        updateCard(id, detections);
        setTimeout(loop, DETECTION_INTERVAL_MS);
    }

    // Wait until the video has at least one frame ready before starting
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        loop();
    } else {
        video.addEventListener('canplay', loop, { once: true });
    }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
    const statusEl = document.getElementById('status');

    buildUI();

    try {
        statusEl.textContent = 'Loading models...';

        // Load fire + fight models in parallel
        await Promise.all([
            loadModel('model/fire_model.onnx'),
            loadFightModels('model/yolov8n-pose.onnx', 'model/fight_classifier.onnx'),
        ]);

        statusEl.textContent = 'All systems active — monitoring 5 godowns';
        statusEl.className   = 'status ok';

        // Init alert tracking and stagger starts
        GODOWNS.forEach(({ id }, index) => {
            initAlertState(id); // all godowns get fire detection
            if (FIGHT_GODOWNS.has(id)) {
                initFightAlertState(id);
                initFightBuffer(id);
                setTimeout(() => startCombinedLoop(id), index * 400);
            } else {
                setTimeout(() => startLoop(id), index * 400);
            }
        });
    } catch (err) {
        statusEl.textContent = `Model error: ${err.message}`;
        statusEl.className   = 'status error';
        console.error(err);
    }
}

main();
