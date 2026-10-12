# Deploying wcag-auditor on a free Hugging Face Space

The recommended free option. One Docker container runs the API, the web app and Caddy on port 7860. Admin pages sit behind a login; the participant pages (`/study`, `/study/<code>`) are public. No credit card is needed.

The Space disk is wiped whenever the Space restarts or sleeps, so the app copies its data (`app.db` and `runs/`) to a private Hugging Face dataset repo and restores it on start. The detector (`detector.onnx`, 109 MB, never in git) lives in a private model repo and is downloaded on start.

Oracle Cloud and the Cloudflare tunnel are described in [DEPLOY.md](DEPLOY.md).

## What you need

- The repo checked out on your laptop, with `data/models/detector.onnx` present.
- A GitHub repository for the code (the Space is updated from it by GitHub Actions).
- Docker (only to make the password hash) and `uv`.

Below, `YOURNAME` is your Hugging Face user name and `wcag-auditor` the Space name. Change them to your own.

## 1. Create the account

Go to https://huggingface.co/join and sign up. Confirm your email. No card is asked for.

## 2. Create the three repos

Log in once from the repo folder (paste a token when asked; step 3 shows how to make one, or use the browser flow):

```
uv run hf auth login
uv run hf auth whoami
```

Model repo (private) and the detector upload:

```
uv run hf repos create YOURNAME/wcag-detector --type model --private
uv run hf upload YOURNAME/wcag-detector data/models/detector.onnx detector.onnx --type model
```

The file name inside the repo must be `detector.onnx`, or set the variable `HF_MODEL_FILE` (step 5) to the name you used.

Dataset repo (private) for the backups:

```
uv run hf repos create YOURNAME/wcag-data --type dataset --private
```

Create it yourself. The app would create it on first start if it were missing, but a token limited to named repos may not be allowed to create new ones.

Space (SDK Docker, **public**):

```
uv run hf repos create YOURNAME/wcag-auditor --type space --space-sdk docker --public
```

Why public: a private Space answers 404 to everyone who is not a collaborator, so study participants could not open their links. Public only means the front door is reachable. The admin pages, the audit pages and the whole API except the participant routes still ask for the admin user name and password (HTTP basic auth, done by Caddy inside the container). The source of the Space is visible; the data and the model are in private repos and are not.

## 3. Create the access token

1. https://huggingface.co/settings/tokens, New token, type **Fine-grained**.
2. Under repositories, add exactly the three repos from step 2 and give each **Write** access (read and write contents).
3. Name it `wcag-auditor`, create it and copy it now; it is shown once.

Use this token for the Space secret `HF_TOKEN` and for the GitHub secret `HF_TOKEN` (step 6). If you want a separate token for GitHub, make a second one with write access to the Space repo only.

## 4. Make the admin password hash

```
docker run --rm caddy:2 caddy hash-password --plaintext 'choose-a-long-password'
```

Copy the whole output (it starts with `$2a$`). Also make the study admin token:

```
openssl rand -hex 24
```

## 5. Set the Space secrets and variables

Open `https://huggingface.co/spaces/YOURNAME/wcag-auditor/settings`, section **Variables and secrets**.

New secrets:

| Name | Value |
| --- | --- |
| `HF_TOKEN` | the token from step 3 |
| `HF_DATASET_REPO` | `YOURNAME/wcag-data` |
| `HF_MODEL_REPO` | `YOURNAME/wcag-detector` |
| `ADMIN_USER` | the login name you want |
| `ADMIN_HASH` | the hash from step 4, pasted as is (no quotes needed in this form) |
| `STUDY_ADMIN_TOKEN` | the random string from step 4 |

New variable:

| Name | Value |
| --- | --- |
| `APP_ENV` | `production` |

Optional variables: `HF_MODEL_FILE` (default `detector.onnx`), `SYNC_INTERVAL_S` (backup interval in seconds, default `300`), `STUDY_ETHICS_APPROVED` (`1` only once ethics approval is in place), `AUDIT_PDF`, `JOB_TIMEOUT_S`, `DECIDED_BY_NAME` (same meaning as in [DEPLOY.md](DEPLOY.md)). A site-owner header secret for bot-protected sites goes in as a secret too; see [BOT_PROTECTION.md](BOT_PROTECTION.md).

Changing a secret restarts the Space.

## 6. Push the code

The Space repo needs a file called `Dockerfile` at its root and a `README.md` with the Space settings in its front matter. This repo keeps them under other names (`Dockerfile.hf`, `deploy/hf/README.space.md`) so they do not clash with the normal Docker setup. The GitHub workflow `.github/workflows/hf-space.yml` builds a clean tree for the Space: it copies only the files the Dockerfile needs, renames `Dockerfile.hf` to `Dockerfile` and `README.space.md` to `README.md`, leaves out `.env`, `data/` and every `*.onnx`, and force-pushes that tree to the Space. (The Space config reference has no setting to choose another Dockerfile name, so the rename is what is documented to work.)

Set it up once in GitHub, repository Settings, Secrets and variables, Actions:

- Variable `HF_SPACE` = `YOURNAME/wcag-auditor`
- Secret `HF_TOKEN` = a token with write access to the Space

Then either push to `main` (the deploy runs after the `ci` workflow succeeds on `main`) or run it by hand: Actions tab, `hf-space`, Run workflow. If either value is missing, the workflow prints a notice and does nothing, so forks stay green.

Manual fallback without GitHub (from the repo root; run the tree-building steps of the workflow, or in short):

```
rm -rf /tmp/space && mkdir -p /tmp/space/deploy /tmp/space/apps /tmp/space/eval
cp pyproject.toml uv.lock CHECK_CATALOGUE.md /tmp/space/
cp -R packages services fixtures study /tmp/space/
cp -R eval/detector /tmp/space/eval/detector
cp -R apps/web /tmp/space/apps/web && rm -rf /tmp/space/apps/web/node_modules /tmp/space/apps/web/.next
cp -R deploy/caddy deploy/hf /tmp/space/deploy/
cp Dockerfile.hf /tmp/space/Dockerfile
cp deploy/hf/README.space.md /tmp/space/README.md
uv run hf upload YOURNAME/wcag-auditor /tmp/space . --type space
```

## 7. First boot

After the push the Space shows "Building". The first build downloads the Playwright base image and installs Python and Node packages: expect 10 to 20 minutes. Later builds reuse layers and take a few minutes. Watch it under the **Logs** button, tab **Build**. When the status turns **Running**, the container log (tab **Container**) shows the restore step, then the API, web and Caddy starting.

On the very first boot there is nothing to restore, so the app starts with an empty database. Open `https://YOURNAME-wcag-auditor.hf.space/`, log in with `ADMIN_USER` and the password you hashed, and run a test audit.

## 8. Links to share

Use the direct address, not the `huggingface.co/spaces/...` page (that one wraps the app in a frame and breaks cookies and the page layout):

- Admin: `https://YOURNAME-wcag-auditor.hf.space/`
- Study admin: `https://YOURNAME-wcag-auditor.hf.space/study/admin`
- Participant: `https://YOURNAME-wcag-auditor.hf.space/study/<code>`

The host name is your user name and the Space name joined by a dash, lower case, dots and underscores turned into dashes.

## 9. Sleep, wake-up and backups

- A free Space goes to sleep after about 48 hours without a visit. The next visit wakes it up; this takes a minute or two, and the start script restores `app.db` and `runs/` from the dataset repo and downloads the detector again.
- Anything on the Space disk is lost on restart, rebuild (every push) or sleep. Only what reached the dataset repo survives.
- The app saves `app.db` (a consistent SQLite copy) and the `runs/` and `uploads/` folders to the dataset repo every `SYNC_INTERVAL_S` seconds (default 300, five minutes) and once more on a normal shutdown. **If the container crashes hard (out of memory, a platform fault), data written in the last few minutes before the crash can be lost.** A normal stop, restart or sleep does push first. Do not rebuild the Space in the middle of a study session; pushes to `main` restart it.
- Before and after a study, look at the dataset repo (`https://huggingface.co/datasets/YOURNAME/wcag-data`) to see that the files are there, and download a copy: `uv run hf download YOURNAME/wcag-data --type dataset --local-dir backup-$(date +%F)`.

## 10. Limits

- Free hardware is 2 vCPU and 16 GB RAM. One audit takes about 15 to 45 seconds per page; audits queue behind each other. One Space only; do not expect many simultaneous audits.
- Sites behind bot protection (Cloudflare and similar) block a datacentre address. The site owner must allowlist the auditor with the secret request header; see [BOT_PROTECTION.md](BOT_PROTECTION.md).
- "Verify in a browser window" (the person-verified browser session) does not work on a server, because there is no screen to open a window on. Use the allowlist header instead.
- Private and local addresses cannot be audited (`ALLOW_PRIVATE_TARGETS=0`).

## 11. Troubleshooting

| Symptom | What to check |
| --- | --- |
| Build fails | Logs, tab **Build**. Look at the last lines of the failing Docker step. A missing file means the workflow tree is missing something the Dockerfile copies. |
| Space stays "Starting" or turns "Runtime error" | Logs, tab **Container**. The start script exits when the API, web or Caddy stops; the line `process N exited` is followed by the cause above it. A missing `ADMIN_USER` or `ADMIN_HASH` makes Caddy refuse to start. |
| Login asks again and again (401 loop) | The hash was pasted wrong or the password does not match it. Make the hash again (step 4), paste it as the whole value of `ADMIN_HASH` with no spaces or quotes around it. `ADMIN_USER` is case sensitive. |
| `model not found` or the detector is missing | `HF_MODEL_REPO` is wrong, the file is not called `detector.onnx` (set `HF_MODEL_FILE`), or the token has no access to the model repo (step 3). The Container log shows `model downloaded to ...` or `model up to date`, or `hfsync model failed: ...` with the reason. |
| Data is empty after a wake-up | `HF_DATASET_REPO` or `HF_TOKEN` is missing or has no write access; the Container log shows a skipped restore or push. |
| Participant link shows 404 | The Space is private. Settings, Change visibility, Public. |
| Participant page loads but nothing saves | Open the page on the `.hf.space` address, not inside the huggingface.co frame. |
| The workflow does nothing | `HF_SPACE` or `HF_TOKEN` is not set in GitHub (see the notice in the run), or `ci` did not succeed. |
