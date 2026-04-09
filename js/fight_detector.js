/**
 * fight_detector.js
 *
 * Two-stage fight detection:
 *  1. YOLOv8n-pose  → detect people and extract 17 keypoints per person
 *  2. LSTM classifier → classify the keypoint sequence as fight / normal
 *
 * Maintains a rolling buffer of the last SEQUENCE_LEN frames of keypoints
 * so the LSTM can see temporal context.
 */

const POSE_MODEL_INPUT = 640;
const POSE_CONF        = 0.35;   // minimum person confidence
const POSE_IOU         = 0.45;
const SEQUENCE_LEN     = 16;     // frames the LSTM expects
const MAX_PERSONS      = 2;
const NUM_KEYPOINTS    = 17;
const FIGHT_THRESHOLD  = 0.5;    // classifier output > this = fight

let poseSession      = null;
let classifierSession = null;

// Per-godown rolling keypoint buffers: godownId → Float32Array[]
const keypointBuffers = {};

// ─── Skeleton connections (COCO 17-keypoint topology) ────────────────────────
const SKELETON = [
    [0, 1], [0, 2], [1, 3], [2, 4],           // head
    [5, 6],                                     // shoulders
    [5, 7], [7, 9], [6, 8], [8, 10],           // arms
    [5, 11], [6, 12],                           // torso
    [11, 12],                                   // hips
    [11, 13], [13, 15], [12, 14], [14, 16],    // legs
];

// ─── 1. Load models ─────────────────────────────────────────────────────────

async function loadFightModels(posePath, classifierPath) {
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';

    [poseSession, classifierSession] = await Promise.all([
        ort.InferenceSession.create(posePath,       { executionProviders: ['wasm'] }),
        ort.InferenceSession.create(classifierPath,  { executionProviders: ['wasm'] }),
    ]);

    console.log('Fight models loaded');
    console.log('  Pose inputs :', poseSession.inputNames);
    console.log('  Pose outputs:', poseSession.outputNames);
    console.log('  Classifier inputs :', classifierSession.inputNames);
    console.log('  Classifier outputs:', classifierSession.outputNames);
}

// ─── 2. Preprocess (same as fire — video frame → [1,3,640,640] tensor) ──────

function preprocessPose(videoEl) {
    const canvas = document.createElement('canvas');
    canvas.width  = POSE_MODEL_INPUT;
    canvas.height = POSE_MODEL_INPUT;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, POSE_MODEL_INPUT, POSE_MODEL_INPUT);

    const { data } = ctx.getImageData(0, 0, POSE_MODEL_INPUT, POSE_MODEL_INPUT);
    const pixels = POSE_MODEL_INPUT * POSE_MODEL_INPUT;
    const input  = new Float32Array(3 * pixels);

    for (let i = 0; i < pixels; i++) {
        input[i]                 = data[i * 4]     / 255;
        input[pixels + i]        = data[i * 4 + 1] / 255;
        input[2 * pixels + i]    = data[i * 4 + 2] / 255;
    }

    return new ort.Tensor('float32', input, [1, 3, POSE_MODEL_INPUT, POSE_MODEL_INPUT]);
}

// ─── 3. Postprocess pose output ─────────────────────────────────────────────
// YOLOv8-pose output: [1, 56, 8400]
//   rows 0-3: cx, cy, w, h
//   row  4:   person confidence
//   rows 5-55: 17 keypoints × 3 (x, y, kp_conf)

function postprocessPose(tensor, displayW, displayH) {
    const data     = tensor.data;
    const NUM_BOXES = 8400;
    const persons   = [];

    for (let i = 0; i < NUM_BOXES; i++) {
        const conf = data[4 * NUM_BOXES + i];
        if (conf < POSE_CONF) continue;

        const cx = data[0 * NUM_BOXES + i] / POSE_MODEL_INPUT * displayW;
        const cy = data[1 * NUM_BOXES + i] / POSE_MODEL_INPUT * displayH;
        const w  = data[2 * NUM_BOXES + i] / POSE_MODEL_INPUT * displayW;
        const h  = data[3 * NUM_BOXES + i] / POSE_MODEL_INPUT * displayH;

        // Extract 17 keypoints
        const keypoints = [];
        for (let k = 0; k < NUM_KEYPOINTS; k++) {
            const offset = (5 + k * 3) * NUM_BOXES + i;
            keypoints.push({
                x:    data[offset]                 / POSE_MODEL_INPUT * displayW,
                y:    data[(offset + NUM_BOXES)]   / POSE_MODEL_INPUT * displayH,
                conf: data[(offset + 2 * NUM_BOXES)],
            });
        }

        persons.push({
            box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2],
            confidence: conf,
            keypoints,
        });
    }

    // NMS on person boxes
    return nmsPose(persons);
}

function nmsPose(persons) {
    persons.sort((a, b) => b.confidence - a.confidence);
    const kept = [];
    const suppressed = new Set();

    for (let i = 0; i < persons.length; i++) {
        if (suppressed.has(i)) continue;
        kept.push(persons[i]);
        for (let j = i + 1; j < persons.length; j++) {
            if (iouPose(persons[i].box, persons[j].box) > POSE_IOU) {
                suppressed.add(j);
            }
        }
    }
    return kept;
}

function iouPose(a, b) {
    const x1 = Math.max(a[0], b[0]);
    const y1 = Math.max(a[1], b[1]);
    const x2 = Math.min(a[2], b[2]);
    const y2 = Math.min(a[3], b[3]);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const areaA = (a[2] - a[0]) * (a[3] - a[1]);
    const areaB = (b[2] - b[0]) * (b[3] - b[1]);
    return inter / (areaA + areaB - inter);
}

// ─── 4. Build classifier input from keypoint buffer ─────────────────────────
// The LSTM expects [1, 16, 68] — 16 frames, each with 2 persons × 17 kps × 2 coords
// Keypoints are normalised to [0,1] using display dimensions.

function buildClassifierInput(buffer, displayW, displayH) {
    // buffer has SEQUENCE_LEN entries, each is an array of persons (up to MAX_PERSONS)
    const input = new Float32Array(SEQUENCE_LEN * MAX_PERSONS * NUM_KEYPOINTS * 2);

    for (let f = 0; f < SEQUENCE_LEN; f++) {
        const persons = buffer[f] || [];
        for (let p = 0; p < MAX_PERSONS; p++) {
            for (let k = 0; k < NUM_KEYPOINTS; k++) {
                const idx = f * (MAX_PERSONS * NUM_KEYPOINTS * 2) + p * (NUM_KEYPOINTS * 2) + k * 2;
                if (p < persons.length && persons[p].keypoints) {
                    input[idx]     = persons[p].keypoints[k].x / displayW;
                    input[idx + 1] = persons[p].keypoints[k].y / displayH;
                } // else stays 0
            }
        }
    }

    return new ort.Tensor('float32', input, [1, SEQUENCE_LEN, MAX_PERSONS * NUM_KEYPOINTS * 2]);
}

// ─── 5. Init buffer for a godown ────────────────────────────────────────────

function initFightBuffer(godownId) {
    keypointBuffers[godownId] = [];
}

// ─── 6. Main detect function ────────────────────────────────────────────────

async function detectFight(videoEl, godownId) {
    if (!poseSession || !classifierSession) return { persons: [], fightProb: 0 };
    if (videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return { persons: [], fightProb: 0 };

    const t0 = performance.now();

    // Stage 1: Pose detection
    const tensor   = preprocessPose(videoEl);
    const output   = await poseSession.run({ [poseSession.inputNames[0]]: tensor });
    const t1       = performance.now();
    const result   = output[poseSession.outputNames[0]];
    const persons  = postprocessPose(result, videoEl.clientWidth, videoEl.clientHeight);

    // Push into rolling buffer
    const buffer = keypointBuffers[godownId];
    buffer.push(persons);
    if (buffer.length > SEQUENCE_LEN) buffer.shift();

    // Stage 2: Fight classification (only when buffer is full)
    let fightProb = 0;
    let classMs   = 0;
    if (buffer.length === SEQUENCE_LEN) {
        const t2          = performance.now();
        const classInput  = buildClassifierInput(buffer, videoEl.clientWidth, videoEl.clientHeight);
        const classOutput = await classifierSession.run({ [classifierSession.inputNames[0]]: classInput });
        fightProb = classOutput[classifierSession.outputNames[0]].data[0];
        classMs   = (performance.now() - t2).toFixed(0);
    }

    const poseMs = (t1 - t0).toFixed(0);
    const totalMs = (performance.now() - t0).toFixed(0);
    const id = videoEl.id;
    if (fightProb >= FIGHT_THRESHOLD) {
        console.log(`[${id}] FIGHT | prob=${(fightProb * 100).toFixed(1)}% persons=${persons.length} | pose=${poseMs}ms class=${classMs}ms total=${totalMs}ms`);
    } else {
        console.log(`[${id}] clear | prob=${(fightProb * 100).toFixed(1)}% persons=${persons.length} | pose=${poseMs}ms class=${classMs}ms total=${totalMs}ms`);
    }

    return { persons, fightProb };
}
