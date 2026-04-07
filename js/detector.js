/**
 * detector.js
 *
 * Handles everything model-related:
 *  - Loading the ONNX model into ONNX Runtime Web (runs via WASM)
 *  - Preprocessing: video frame → Float32 tensor the model understands
 *  - Running inference
 *  - Postprocessing: raw numbers → list of {box, confidence} objects
 */

const MODEL_INPUT    = 640;   // YOLOv8 expects 640×640 images
const CONF_THRESHOLD = 0.35;  // ignore detections below this confidence
const IOU_THRESHOLD  = 0.45;  // for NMS — suppress boxes that overlap more than this

let session = null; // the loaded ONNX model session

// ─── 1. Load the model ───────────────────────────────────────────────────────

async function loadModel(path) {
    // wasmPaths tells ORT where to fetch the WASM binary from.
    // We point it to a CDN so we don't need to bundle it ourselves.
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';

    session = await ort.InferenceSession.create(path, {
        executionProviders: ['wasm'], // use WASM backend (runs in browser, no server)
    });

    console.log('Model loaded');
    console.log('  Input names :', session.inputNames);
    console.log('  Output names:', session.outputNames);
}

// ─── 2. Preprocess ───────────────────────────────────────────────────────────

function preprocess(videoEl) {
    // Step 1: draw the current video frame onto a 640×640 canvas
    const canvas = document.createElement('canvas');
    canvas.width  = MODEL_INPUT;
    canvas.height = MODEL_INPUT;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, MODEL_INPUT, MODEL_INPUT);

    // Step 2: read raw pixel data → [R,G,B,A, R,G,B,A, ...] as Uint8 (0–255)
    const { data } = ctx.getImageData(0, 0, MODEL_INPUT, MODEL_INPUT);
    const pixels = MODEL_INPUT * MODEL_INPUT;

    // Step 3: convert to Float32 in CHW format (channels first), normalised to [0,1]
    // The model was trained expecting channels in this layout:
    //   [R of all pixels][G of all pixels][B of all pixels]
    const input = new Float32Array(3 * pixels);
    for (let i = 0; i < pixels; i++) {
        input[i]             = data[i * 4]     / 255; // R
        input[pixels + i]    = data[i * 4 + 1] / 255; // G
        input[2 * pixels + i] = data[i * 4 + 2] / 255; // B
        // Alpha (data[i*4+3]) is ignored — the model doesn't use it
    }

    // Wrap in an ORT Tensor: dtype, data, shape [batch=1, channels=3, H=640, W=640]
    return new ort.Tensor('float32', input, [1, 3, MODEL_INPUT, MODEL_INPUT]);
}

// ─── 3. NMS (Non-Maximum Suppression) ────────────────────────────────────────
// The model outputs many overlapping boxes for the same fire.
// NMS keeps only the best one by suppressing boxes that overlap too much.

function iou(a, b) {
    // a, b are [x1, y1, x2, y2]
    const x1 = Math.max(a[0], b[0]);
    const y1 = Math.max(a[1], b[1]);
    const x2 = Math.min(a[2], b[2]);
    const y2 = Math.min(a[3], b[3]);

    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const areaA = (a[2] - a[0]) * (a[3] - a[1]);
    const areaB = (b[2] - b[0]) * (b[3] - b[1]);

    return intersection / (areaA + areaB - intersection);
}

function nms(detections) {
    detections.sort((a, b) => b.confidence - a.confidence); // highest confidence first

    const kept = [];
    const suppressed = new Set();

    for (let i = 0; i < detections.length; i++) {
        if (suppressed.has(i)) continue;
        kept.push(detections[i]);

        for (let j = i + 1; j < detections.length; j++) {
            if (iou(detections[i].box, detections[j].box) > IOU_THRESHOLD) {
                suppressed.add(j); // this box overlaps too much — discard it
            }
        }
    }

    return kept;
}

// ─── 4. Postprocess ──────────────────────────────────────────────────────────

function postprocess(tensor, displayW, displayH) {
    // YOLOv8 output shape: [1, 6, 8400] for 2 classes (fire + smoke)
    // This is TRANSPOSED compared to YOLOv5.
    //
    // 6 rows of 8400 values each:
    //   row 0 → all cx values           data[0 * 8400 + i]
    //   row 1 → all cy values           data[1 * 8400 + i]
    //   row 2 → all widths              data[2 * 8400 + i]
    //   row 3 → all heights             data[3 * 8400 + i]
    //   row 4 → all fire confidence     data[4 * 8400 + i]
    //   row 5 → all smoke confidence    data[5 * 8400 + i]

    const data = tensor.data;
    const NUM_BOXES = 8400;
    const CLASS_NAMES = ['fire', 'smoke'];
    const detections = [];

    for (let i = 0; i < NUM_BOXES; i++) {
        const fireConf  = data[4 * NUM_BOXES + i];
        const smokeConf = data[5 * NUM_BOXES + i];

        // Pick the class with higher confidence
        const confidence = Math.max(fireConf, smokeConf);
        const classIdx   = fireConf >= smokeConf ? 0 : 1;

        if (confidence < CONF_THRESHOLD) continue;

        // Coordinates are in 640×640 space — scale to the video's display size
        const cx = data[0 * NUM_BOXES + i] / MODEL_INPUT * displayW;
        const cy = data[1 * NUM_BOXES + i] / MODEL_INPUT * displayH;
        const w  = data[2 * NUM_BOXES + i] / MODEL_INPUT * displayW;
        const h  = data[3 * NUM_BOXES + i] / MODEL_INPUT * displayH;

        // Convert center format (cx,cy,w,h) → corner format (x1,y1,x2,y2) for drawing
        detections.push({
            box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2],
            confidence,
            label: CLASS_NAMES[classIdx],
        });
    }

    return nms(detections);
}

// ─── 5. Main detect function ─────────────────────────────────────────────────

async function detect(videoEl) {
    if (!session) return [];
    if (videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return [];

    const t0 = performance.now();

    const tensor = preprocess(videoEl);
    const output = await session.run({ [session.inputNames[0]]: tensor });
    const result = output[session.outputNames[0]];

    const inferenceMs = (performance.now() - t0).toFixed(0);
    const detections  = postprocess(result, videoEl.clientWidth, videoEl.clientHeight);

    // Log every detection run so we can see confidence scores + timing
    const id = videoEl.id;
    if (detections.length > 0) {
        console.log(`[${id}] ALERT | ${detections.map(d => `${d.label} ${(d.confidence*100).toFixed(1)}%`).join(', ')} | ${inferenceMs}ms`);
    } else {
        const data  = result.data;
        const N     = 8400;
        let maxFire = 0, maxSmoke = 0;
        for (let i = 0; i < N; i++) {
            maxFire  = Math.max(maxFire,  data[4 * N + i]);
            maxSmoke = Math.max(maxSmoke, data[5 * N + i]);
        }
        console.log(`[${id}] clear | fire: ${(maxFire*100).toFixed(1)}% smoke: ${(maxSmoke*100).toFixed(1)}% | ${inferenceMs}ms`);
    }

    return detections;
}
