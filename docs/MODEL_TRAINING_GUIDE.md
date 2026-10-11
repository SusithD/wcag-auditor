# Model training explained from scratch

A guide for someone who has never trained a model. It explains what we are training, why, how the training works, what every setting means, what went wrong on 10 and 11 October 2026 and how it was fixed, and what to do next. Everything here matches what is in the repository (`DECISIONS.md` ADR-018 to ADR-031, `NOTES.md`, `packages/auditor/auditor/detector/`).

---

## Part 1. The big picture

### 1.1 What the project does

The project is an auditor for web page accessibility. You give it a screenshot (or a page) and it checks it against WCAG 2.2, the international rules for making web content usable by people with disabilities. For example, WCAG says text must have enough contrast against its background, and buttons must be big enough to tap.

To check these rules, the tool has to know **where things are on the page**: where the text is, where the buttons are, where the form fields are. There are two ways to find that out:

1. **Read the page's code (the DOM).** This is exact, because the code says "this is a button". It needs access to the page's code.
2. **Look at the pixels only.** If all you have is a screenshot, you have to *see* the page the way a person does and work out where the buttons are.

Option 2 needs a computer-vision model: a program that looks at an image and draws boxes around the things it recognises. That model is the **detector**, and it is what we are training now.

### 1.2 What the detector learns to do

Given a screenshot, the detector outputs a list of boxes, each with a label and a confidence score. It knows six kinds of thing (`classmap.yaml`):

| Class | What it covers |
|---|---|
| text | plain text and labels |
| link | links and menu items |
| button | buttons, tabs, tree items |
| input | text fields, search boxes, sliders, dropdowns |
| choice | checkboxes, radio buttons, switches, list options |
| image_icon | images, icons, canvases |

Those boxes then feed the rule checks (contrast, target size and so on). Where a rule result rests on a box the model guessed, the report marks it "needs review" instead of "automated", because a guess is less certain than reading the code.

### 1.3 Why this matters for the thesis

The research asks whether a **hybrid** auditor (rules plus a learned model) is better than **rules only**. The trained detector is one of the two ingredients of the hybrid. Chapter 4 and 5 will use the trained model, so the way we train it must be recorded and reproducible. That is why so many decisions are written down as ADRs (architecture decision records).

---

## Part 2. Machine learning in plain words

### 2.1 What "training" is

A model is a very large pile of numbers called **parameters** (also called weights). Our model has **30.4 million** of them. With random numbers it does nothing useful. Training is the process of nudging those numbers, millions of times, until the model gives good answers.

The loop is always the same:

1. **Show** the model an example (a screenshot).
2. **Predict:** the model guesses where the elements are.
3. **Compare** the guess with the correct answer (the human-made labels) and compute a **loss**, a single number that says how wrong the model was. Smaller is better.
4. **Learn:** work out, for every parameter, which direction would reduce the loss (the **gradient**), then change each parameter a tiny bit in that direction (the **optimizer step**).
5. Repeat with the next example.

Think of tuning 30 million knobs by feel, where after each attempt someone tells you "warmer" or "colder".

### 2.2 Key words

- **Dataset:** the examples. Ours is a collection of web screenshots with labelled boxes. Each labelled box is "ground truth".
- **Training set / validation set:** the training set (15,000 screenshots) is what the model learns from. The validation set (1,500 screenshots) is kept aside and never used for learning. It is used to check honestly how well the model works on pictures it has not seen. A model that only memorised its training pictures would score badly there.
- **Epoch:** one full pass over the training set. We run **20 epochs**: the model sees every training screenshot 20 times (with random changes, see augmentation).
- **Batch:** the model does not look at one image at a time; it looks at a small group. We use **8 images** per update (explained in Part 4).
- **Step (optimizer step):** one update of the parameters. With 15,000 images and 8 per step, one epoch is **1,875 steps**. You see this number in `metrics.csv`.
- **Learning rate:** how big each nudge is. Too big and training is unstable; too small and it is slow. Ours starts at 0.0001 and the schedule gradually changes it.
- **Overfitting:** when the model memorises the training pictures but fails on new ones. The validation set is how we catch it.
- **Pretrained weights / fine-tuning:** we do not start from random numbers. We start from a model already trained on a huge general collection of photos (COCO), which already knows what edges, shapes and objects look like. Then we **fine-tune** it on web screenshots. This is far faster and better than starting from nothing. In the log you see "Checkpoint has 90 classes but model is configured for 6. The detection head will be re-initialized": the pretrained model recognised 90 kinds of everyday object, and we replace only its last layer so it outputs our six classes.

### 2.3 The model: RF-DETR Nano

- **DETR** is a type of detector built on a **transformer** (the same family of architecture behind chatbots), which looks at the whole image at once and directly outputs a set of boxes.
- **RF-DETR** is a recent, fast, accurate version of it. We use the smallest size, **Nano** (30.4 million parameters), because it can run on a laptop and later on a CPU.
- The library is called `rfdetr` (version 1.11.2) and is built on a training framework called **PyTorch Lightning**, which handles the loop, checkpoints and logging.

### 2.4 Input size: 576 pixels

Each screenshot is resized to a square of **576 × 576**. It must be a multiple of 32 (the model cuts the image into 16-pixel patches and groups them), which is why we use 576 and not the 560 in the original plan (ADR-019). Long web pages are handled later by tiling them into viewport-sized pieces at inference.

During training RF-DETR also uses **multi-scale training**: each step it randomly picks a slightly different size (between about 416 and 736 pixels). This makes the model robust to size changes. It also has a side effect on memory, explained in Part 6.

### 2.5 Augmentation

Showing the exact same 15,000 images 20 times invites memorising. So each time an image is shown it is randomly altered (flipped, rescaled, colour-shifted and so on). The model sees a slightly different version every epoch. This is called **data augmentation**. It matters later for reproducibility (Part 5).

### 2.6 EMA (exponential moving average)

During training the weights jitter from step to step. EMA keeps a second, smoothed copy of the weights, a running average that follows the real ones slowly. The smoothed copy usually performs better and more steadily, so **we evaluate and export the EMA weights**. In the logs you see `val/ema_mAP...` for the smoothed model and `val/mAP...` for the raw one.

---

## Part 3. How we measure whether it is any good

### 3.1 IoU

When the model draws a box, how do we decide whether it matches a labelled box? **IoU (intersection over union)** is the overlap area divided by the combined area of the two boxes: 1 means identical, 0 means no overlap. A prediction counts as correct if IoU is above a threshold.

### 3.2 mAP

**mAP (mean average precision)** is the standard score for detectors. In words: for each class, how many of the boxes the model draws are right (precision) and how many of the real ones it finds (recall), measured across all confidence levels, then averaged over the classes. It ranges from 0 to 1; higher is better.

- **mAP 50** counts a box as correct if IoU is at least 0.5 (a loose match).
- **mAP 50:95** averages over strict thresholds from 0.5 to 0.95. This is the harder, headline number.

### 3.3 Our numbers so far (EMA, validation set)

| Epoch | mAP 50:95 | mAP 50 |
|---|---|---|
| 1 | 0.130 | 0.251 |
| 2 | 0.166 | 0.309 |
| 3 | 0.184 | 0.345 |
| 4 | 0.197 | 0.364 |
| 5 | 0.204 | 0.366 |
| 6 | 0.206 | 0.372 |
| 7 | 0.213 | 0.376 |

It improves each epoch and the gains are shrinking, which is the normal shape of a learning curve. Training loss falls too: 6.25, 5.76, 5.59, 5.43, 5.34, 5.21, 5.13 for epochs 1 to 7. This is an early look at a hard task (web UI elements of six classes, many tiny items), so the absolute value is modest; do not compare it with the 50+ scores quoted for everyday-object benchmarks. What the thesis needs is how much the detector helps the whole auditor, which is what the later ablation measures.

---

## Part 4. The training recipe we chose, and why

All of this was decided by the researcher and recorded in ADR-028.

| Setting | Value | Why |
|---|---|---|
| Model | RF-DETR Nano | Small enough for a laptop and for CPU inference later |
| Training images | 15,000 | The full planned recipe, not a smaller shortcut |
| Validation images | 1,500 | Honest check on unseen screenshots |
| Epochs | 20 | The full recipe |
| Input size | 576 px | Multiple of 32 (ADR-019) |
| Effective batch | 8 | The recipe (see below) |
| EMA | on | Smoother, better final weights |
| Seed | 20261004 | Fixed so the run is reproducible |
| Mixed precision | off | Half-precision on Apple GPUs is unreliable |
| Device | `mps` | Apple's GPU backend for PyTorch |

### 4.1 Where the data comes from and how leakage is prevented

The images come from the public WebUI dataset (ADR-020). Two safeguards:

1. **Train/validation split by page.** The same page can appear at several screen sizes. A split by individual image would put the same page in both sets, so the validation score would be inflated. We group images that share the same label pattern and split by group.
2. **No overlap with our benchmark.** The thesis benchmark is 110 real pages. We must never train on them. Every candidate training image is compared with the first screen of every benchmark capture using an image fingerprint (a perceptual "difference hash") and dropped if it looks too similar. A test fails if any training image is too close. This is similarity screening, not a guarantee about web domains, and that limit is stated in the ADR.

### 4.2 Two phases of ten epochs

The whole 20-epoch run takes many hours, so ADR-028 splits it:

- **Phase 1:** epochs 1 to 10, then stop cleanly.
- **Phase 2:** epochs 11 to 20, continuing from where phase 1 stopped.

Phase 1 ends with an interim model, the **epoch-10 EMA weights exported as `detector-phase1.onnx`**, with its mAP recorded. That model is for development only. **Chapter 5 uses the epoch-20 model.**

The important point: the schedule (learning rate over time, warm-up, EMA) is set up for all 20 epochs from the start. Stopping after epoch 10 does not change the plan; it is just a pause. So the final result should be the same as an uninterrupted 20-epoch run. That is what "resume-exact" means, and Part 5 explains how we made it true and proved it.

---

## Part 5. Why "resume-exact" was hard, and what we built

### 5.1 Checkpoints

A **checkpoint** is a save file. After each epoch we write `checkpoint_N.ckpt` (N counts from 0, so `checkpoint_9` means ten epochs are done). It contains the model weights, the EMA copy, the optimizer's internal memory (which dampens and shapes the updates), the learning-rate schedule position and the epoch counter. You can stop and later continue from it.

### 5.2 The catch: randomness

Training is full of randomness: the order the images are shuffled, the random augmentations, random choices inside the model. A normal resume brings back the weights but **not** the random stream, so "train 2 epochs" and "train 1 epoch, stop, resume, train 1 more" give slightly different models. For a thesis you want the claim "splitting the run changed nothing", so we made it provably true.

### 5.3 What we did

Every random choice is now a **pure function of (run seed, epoch number, image index)**. In words, instead of "draw the next random number from a stream that has to be remembered", it is "for epoch 8, image 4,001, the random numbers are computed from those three values". Because they are computed rather than remembered, a resumed run draws exactly what an uninterrupted run would. The code is in `packages/auditor/auditor/detector/train.py`:

- `SeededDataset` seeds each sample's augmentation from (seed, epoch, index).
- `EpochRandomSampler` decides the shuffle order from (seed, epoch).
- A callback re-seeds the global random generators at the start of each epoch.
- Data-loader worker processes are rebuilt each epoch so none keeps hidden state.

### 5.4 The proof

`packages/auditor/tests/test_detector_resume.py` trains a tiny model on a tiny dataset on the CPU in two ways, 3 epochs straight versus 2 epochs, stop, resume, 1 more epoch, and asserts that every weight, the optimizer state, the schedule and the EMA state are **bit-for-bit identical**. It does this with 0 and 2 data workers and with gradient accumulation of 1 and 2. A separate test simulates a crash in the middle of a phase and a restart.

Limit to remember: the proof runs on the CPU. Apple's GPU does not guarantee bit-identical results between runs, so the real run is exact in data order, optimizer state and schedule, but not bit-identical to a hypothetical uninterrupted GPU run. This is written in ADR-030.

### 5.5 `--resume-latest`

If a phase is interrupted, re-running the same command picks up the newest `checkpoint_N.ckpt`. It refuses to run if the phase is already complete, so it can never overwrite later checkpoints. It also checks that the settings (batch size, accumulation, epochs, seed, resolution) match the ones that wrote the checkpoint and aborts if they differ.

---

## Part 6. What went wrong on the real run (and how it was fixed)

This is the part most worth understanding, because it is a real engineering story that belongs in the methods chapter.

### 6.1 Attempt 1: plain batch 8

The recipe says batch 8. On the Mac (48 GB of memory, with Apple's CPU and GPU sharing it) the process grew to **40 GB**, memory spilled into swap (disk used as slow memory), and training stopped making progress after about 50 steps. Memory use is not just "the model": it includes intermediate results kept for the backward pass, which scale with batch size and image size.

### 6.2 Attempt 2: batch 4 with gradient accumulation 2

**Gradient accumulation** means: run two small batches of 4, add up their gradients, and only then update the weights. The update uses the same 8 images as a batch of 8 would, but only half has to be in memory at once. It is mathematically almost identical (not bit-identical, because the loss is averaged per mini-batch; ADR-031 says this). So the **effective batch stayed 8**. This ran faster and was healthier but still crept up from 33 to 40 GB over 40 minutes and then stalled at step 1,099.

### 6.3 The real cause: the allocator's cache

We added a memory log (`AUDITOR_MEM_LOG`) and found something clear: the **live tensors stayed at 0.6 GB** the whole time, but the **GPU memory the driver had reserved kept growing** (21 to 24 GB within 2 minutes). That is not a leak in our code. PyTorch's Apple-GPU memory manager keeps freed blocks in a cache for reuse, and because multi-scale training changes the image size every step, new block sizes keep being added to the cache, so it grows until the machine runs out.

### 6.4 The fix: cap the cache

Two environment variables tell the manager how much it may hold:

- `PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.7`: do not exceed about 26 GB.
- `PYTORCH_MPS_LOW_WATERMARK_RATIO=0.55`: when above this, start releasing cached blocks.

A tighter cap (0.4, about 15 GB) crashed with out-of-memory, which showed the real per-step peak is above that. With 0.7 and 0.55 the memory held flat at about 27 to 28 GB for hours. This changes nothing about the model, the data or the schedule; it only manages memory. The phase script now sets these automatically.

### 6.5 Speed

At the smoke test we measured 2.23 images per second and projected 19 to 20 hours per phase. In the real run the speed is about **6.7 images per second**, so one epoch takes about **40 minutes** and a phase about 7 hours.

### 6.6 The overnight stop

The process died at about 02:55 on 11 October, after finishing epoch 7, while epoch 8 was 94% done. The Mac did not sleep and no out-of-memory kill is logged. The likely cause is that the terminal window running it was closed or hung up, but that is not confirmed. Nothing was lost except the unfinished epoch: re-running the same command resumed from `checkpoint_6` (the end of epoch 7) at step 13,125. Advice: run long jobs inside `tmux`, or with `nohup`, and keep the output in a log file.

---

## Part 7. How to run it (cheat sheet)

All commands are run from the repository root.

```
scripts/train_detector.sh phase1          # epochs 1-10, stops after epoch 10
scripts/train_detector.sh export-phase1   # exports epoch-10 EMA to ONNX, prints its mAP
scripts/train_detector.sh phase2          # epochs 11-20 from the newest checkpoint
```

What `phase1` expands to:

```
caffeinate -i uv run python -m auditor.detector.train \
  --dataset data/webui/prepared_full --out data/models/rfdetr-nano-full \
  --model nano --epochs 20 --batch-size 4 --grad-accum 2 --num-workers 2 \
  --resolution 576 --device mps --stop-after-epoch 10 --resume-latest
```

| Part | Meaning |
|---|---|
| `caffeinate -i` | stops the Mac idle-sleeping while the job runs |
| `--dataset` | folder with the 15,000 train and 1,500 validation images |
| `--out` | where checkpoints and logs go |
| `--epochs 20` | the schedule covers 20 epochs |
| `--stop-after-epoch 10` | pause cleanly after epoch 10 (phase 1 only) |
| `--batch-size 4 --grad-accum 2` | micro-batch 4 times accumulation 2 equals effective batch 8 |
| `--num-workers 2` | two helper processes load and augment images |
| `--resume-latest` | continue from the newest checkpoint if one exists |

### Files in the output folder (`data/models/rfdetr-nano-full/`)

| File | What it is |
|---|---|
| `checkpoint_N.ckpt` | full save after epoch N+1 (use this to resume) |
| `last_ema.pth` | latest EMA weights, used for export |
| `metrics.csv` | one row per logging point: loss, learning rate, validation mAP |
| `config.json` | the settings used (batch size, seed, dataset hash) |

### How to check on a run

- Is it alive: `pgrep -fl "auditor.detector.train"`.
- Progress: the last line of `metrics.csv`. The second column is the step; an epoch is 1,875 steps, so epoch 10 ends at step 18,749 (counting from 0, the epoch-N row appears near step 1,875 times N).
- Memory: look at the process in Activity Monitor; about 27 to 28 GB is normal now.
- Healthy sign: the step number keeps going up every minute or so.
- Warning sign: no new row for 5 or more minutes, and swap climbing.

### Keeping the Mac awake

Plug it in and keep the lid open. `caffeinate -i` (inside the script) prevents idle sleep. Extra insurance: `caffeinate -dimsu -t <seconds>` in another terminal.

---

## Part 8. What happens after phase 1

1. When `checkpoint_9.ckpt` exists, run `scripts/train_detector.sh export-phase1`. It converts the epoch-10 EMA weights to **ONNX** (a portable model file that runs without PyTorch, on a plain CPU) as `data/models/detector-phase1.onnx` and prints the epoch-10 mAP. Record the numbers in `NOTES.md`.
2. Run `scripts/train_detector.sh phase2` for epochs 11 to 20 (about another 7 hours).
3. Export the epoch-20 model. This is the one the thesis uses.
4. Remaining M10 work needs the trained model:
   - the **mAP report** (per class, on the validation set);
   - the **ablation**: how much does adding the detector change the whole auditor's results compared with rules only;
   - the **label-noise check**: a hand check of 200 sampled boxes to see how much the public dataset's labels can be trusted;
   - detector-based results on the real benchmark pages.
5. Only then is the `m10-detector` branch merged to main.

---

## Part 9. Glossary

| Term | Plain meaning |
|---|---|
| Parameter / weight | one of the model's millions of adjustable numbers |
| Loss | one number measuring how wrong the model is; training pushes it down |
| Gradient | the direction to change each weight to reduce the loss |
| Optimizer | the rule that applies the changes (here AdamW) |
| Learning rate | how big each change is |
| Epoch | one pass over all training images |
| Step | one weight update |
| Batch | images processed together for one update |
| Gradient accumulation | adding up the gradients of several small batches before one update |
| Checkpoint | a save file you can resume from |
| Fine-tuning | continuing training from a model that already learned general vision |
| Validation set | images never trained on, used to measure quality honestly |
| Overfitting | memorising training images and failing on new ones |
| Augmentation | random alterations of images during training |
| EMA | a smoothed running average of the weights; the one we evaluate |
| IoU | overlap score of two boxes (0 to 1) |
| mAP | overall detection score (0 to 1); 50:95 is the strict version |
| Transformer | the neural-network architecture RF-DETR is built on |
| MPS | PyTorch's backend for Apple's GPU |
| ONNX | portable model format for running without PyTorch |
| Seed | fixed starting value for random numbers so runs can be reproduced |
| Swap | disk used as overflow memory; far slower than RAM |
| ADR | architecture decision record: a written, dated design decision |

---

## Part 10. Where to read more in this repository

- `DECISIONS.md`: ADR-018 (why the recipe was a concern), ADR-019 (576 px), ADR-020 (data split and leak control), ADR-028 (final plan, two phases), ADR-030 (exact resume), ADR-031 (memory fix).
- `FAILED_ATTEMPTS.md`: approaches that did not work and why.
- `NOTES.md`: the current phase-1 commands and progress notes.
- `packages/auditor/auditor/detector/`: `train.py` (training wrapper), `prepare_webui.py` (building the dataset), `export_onnx.py`, `infer.py` (running the model), `label_noise.py`.
- `scripts/train_detector.sh`: the phase commands.
