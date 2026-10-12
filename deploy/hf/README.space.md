---
title: WCAG Auditor
emoji: 🔍
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
short_description: ML-assisted WCAG 2.2 auditor for web UI screenshots
---

WCAG Auditor audits a web page against WCAG 2.2 using rule checks and a UI element detector.
The audit pages and the API sit behind a login; the study participant pages at `/study` are public.
Runs and study data are saved to a private Hugging Face dataset, because the Space disk is ephemeral.
The Space needs the secrets `ADMIN_USER`, `ADMIN_HASH`, `HF_TOKEN`, `HF_DATASET_REPO` and `HF_MODEL_REPO`.
Source and thesis context: see the project repository.
