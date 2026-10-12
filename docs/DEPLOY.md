# Deploying wcag-auditor for free

Recommended free option: a Hugging Face Docker Space, see [DEPLOY_HF.md](DEPLOY_HF.md). The Oracle Cloud and Cloudflare Tunnel options below remain as alternatives.

Two free ways to put the app on the internet. Both run the same three containers (api, web, caddy) from `deploy/compose.yaml`.

| Option | Cost | Always on | Best for |
| --- | --- | --- | --- |
| A. Oracle Cloud Always Free VM (Ampere A1, arm64) | 0 | yes | the real thing, study participants |
| B. Your Mac plus a Cloudflare Tunnel | 0 | only while the Mac is awake | a quick demo, a supervisor walkthrough |

What the public sees: the study participant pages (`/study`, `/study/<code>`) and the API calls they make work without a login. Everything else, including `/study/admin`, the audit pages and the rest of the API, asks for the admin user name and password (HTTP basic auth, set in `.env`).

## 0. What you need on your laptop

- The repo and the model file `data/models/detector.onnx` (109 MB; never committed to git).
- An SSH key pair (`ssh-keygen -t ed25519` if you have none).

## Option A: Oracle Cloud Always Free

### 1. Sign up

1. Go to https://www.oracle.com/cloud/free/ and create an account. Pick a home region close to your participants; it cannot be changed later.
2. A credit or debit card is asked for identity verification only. Always Free resources are not billed. Do not click "Upgrade to paid".
3. Wait for the "account ready" email (can take a few hours).

### 2. Create the VM

1. Console menu, Compute, Instances, Create instance.
2. Image: Canonical Ubuntu 24.04 (aarch64 / Arm). Shape: Ampere, VM.Standard.A1.Flex, 2 OCPU, 12 GB memory.
3. Networking: keep the default VCN, assign a public IPv4 address.
4. Add SSH keys: upload your public key (`~/.ssh/id_ed25519.pub`).
5. Boot volume: set it to 100 GB (the free tier gives 200 GB in total, leave room for backups).
6. Create. If you get "Out of capacity for shape VM.Standard.A1.Flex", pick another availability domain in the same form and try again, or retry every few minutes (capacity frees up, often overnight). Starting with 1 OCPU and 6 GB and resizing later also works.
7. Note the public IP, for example `203.0.113.10`.

### 3. Open ports 80 and 443

Oracle blocks traffic twice, so open both layers.

In the console: Networking, Virtual cloud networks, your VCN, Security lists, Default security list, Add ingress rules. Add three rules with source `0.0.0.0/0`: TCP destination port 80, TCP destination port 443, UDP destination port 443.

On the VM (Oracle's Ubuntu image ships with restrictive iptables rules):

```
ssh ubuntu@203.0.113.10
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
sudo apt-get update && sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

### 4. Install Docker and fetch the code

```
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
ssh ubuntu@203.0.113.10
docker version
git clone <your-repo-url> wcag-auditor
cd wcag-auditor
```

For a private repo, create a GitHub personal access token (read-only, this repo) and use it as the password when git asks.

### 5. Pick a free domain name

Caddy needs a host name to get a free HTTPS certificate. Two zero-effort choices:

- sslip.io, no sign-up: if the IP is `203.0.113.10`, the domain is `203-0-113-10.sslip.io` (dashes or dots both work). Nothing to configure.
- DuckDNS, a nicer name: sign in at https://www.duckdns.org, create `myaudits`, set its IP to the VM's public IP. The domain is `myaudits.duckdns.org`.

### 6. Configure

```
cd ~/wcag-auditor/deploy
cp .env.example .env
docker run --rm caddy:2 caddy hash-password --plaintext 'choose-a-long-password'
nano .env
```

In `.env` set `DOMAIN`, `ADMIN_USER`, and paste the hash into `ADMIN_HASH` inside single quotes (the hash contains `$` characters, the quotes keep them literal). Set `STUDY_ADMIN_TOKEN` to a long random string (`openssl rand -hex 24`); it is the second lock on the study admin page. Leave `STUDY_ETHICS_APPROVED=0` until ethics approval is in place. Leave `TUNNEL_TOKEN` empty here.

| Variable | Meaning |
| --- | --- |
| `DOMAIN` | host name Caddy serves and gets a certificate for |
| `ADMIN_USER`, `ADMIN_HASH` | basic auth for everything except the participant pages |
| `STUDY_ADMIN_TOKEN` | header token required by the study admin API |
| `STUDY_ETHICS_APPROVED` | `1` enables real (non-synthetic) participants |
| `AUDIT_PDF` | `1` writes a PDF report per audit (slower), `0` skips it |
| `JOB_TIMEOUT_S` | per-audit time limit, default 900 |
| `DECIDED_BY_NAME` | name stored on review decisions |
| `TUNNEL_TOKEN` | Cloudflare tunnel token (option B only) |
| `HTTP_PORT`, `HTTPS_PORT` | host ports, default 80 and 443 |

### 7. Start it

```
cd ~/wcag-auditor/deploy
docker compose up -d --build
```

The first build downloads about 3.4 GB of base image and takes 10 to 20 minutes on the A1. Watch with `docker compose logs -f`.

### 8. Upload the model

The detector model is not in git. From your laptop:

```
scp -i ~/.ssh/id_ed25519 "/path/to/wcag-auditor/data/models/detector.onnx" ubuntu@203.0.113.10:/tmp/detector.onnx
```

Then on the VM:

```
cd ~/wcag-auditor/deploy
docker compose exec api mkdir -p /data/models
docker cp /tmp/detector.onnx wcag-auditor-api-1:/data/models/detector.onnx
rm /tmp/detector.onnx
```

No restart is needed; each audit is a fresh process and picks the model up. Without the model the audit still runs but the hybrid condition falls back to the pixel pipeline, and `VERSIONS.json` shows `model_sha: null`.

### 9. Smoke checks

Replace the domain and password with yours.

```
curl -s -o /dev/null -w '%{http_code}\n' https://DOMAIN/api/health
curl -s -u admin:PASSWORD https://DOMAIN/api/health
curl -s -o /dev/null -w '%{http_code}\n' https://DOMAIN/study
curl -s -o /dev/null -w '%{http_code}\n' https://DOMAIN/study/admin
```

Expected: `401`, `{"status":"ok"}`, `200`, `401`. Then open `https://DOMAIN/` in a browser, log in, choose New audit, enter `https://example.com`, and wait for the report (under a minute).

### 10. Everyday operations

- Logs: `docker compose logs -f api` (or `web`, `caddy`). Status: `docker compose ps`.
- Update to the latest code: `bash scripts/deploy/update.sh` (git pull, rebuild, restart; the data volume is kept).
- Backups: `bash scripts/deploy/backup.sh` writes a SQLite snapshot plus the runs and uploads folders to `~/wcag-auditor-backups/` and keeps the newest 7. Schedule it nightly with `crontab -e`:

  ```
  30 2 * * * /home/ubuntu/wcag-auditor/scripts/deploy/backup.sh >> /home/ubuntu/backup.log 2>&1
  ```

  Copy the archives off the VM now and then (`scp ubuntu@IP:wcag-auditor-backups/*.tar.gz .`). Restore by extracting an archive into the data volume with `docker compose exec -T api tar -xzf - -C /data < backup.tar.gz`, then rename `app.backup.db` to `app.db` and restart the api.
- Change the Caddy config: edit files in `deploy/caddy/`, then `docker compose up -d --force-recreate caddy`.
- Oracle reclaims Always Free instances that sit idle for 7 days (CPU, network and memory all under 20%). A server that is used occasionally is fine; if it is idle for weeks, run an audit now and then.

## Option B: your Mac and a Cloudflare Tunnel

The Mac must stay on, awake and connected whenever someone needs the site. Nothing is opened on your router.

1. Create a free Cloudflare account at https://dash.cloudflare.com. You need a domain on Cloudflare for a stable name; a free domain is not enough. If you have none, use the quick tunnel instead (see the end of this section).
2. Zero Trust, Networks, Tunnels, Create a tunnel, type Cloudflared. Name it, and copy the token from the install command (the long string after `--token`).
3. In the tunnel's Public Hostname tab, add your host name (for example `audits.example.com`), service type HTTP, URL `caddy:80`.
4. On the Mac install Docker (Colima or Docker Desktop), then:

   ```
   cd wcag-auditor/deploy
   cp .env.example .env
   ```

   Fill `ADMIN_USER`, `ADMIN_HASH`, `STUDY_ADMIN_TOKEN` and `TUNNEL_TOKEN`. `DOMAIN` is not used in this mode.
5. Start it and upload the model as in step 8 (the container name is the same):

   ```
   docker compose -f compose.tunnel.yaml up -d --build
   ```

   In this mode only Cloudflare reaches the app: no host ports are published, and Caddy serves plain HTTP inside the compose network. Basic auth, the headers and the participant allow-list are identical to option A.
6. Mac settings: System Settings, Battery, prevent sleep while plugged in (or run `caffeinate -s`).

Quick tunnel with no domain (random `trycloudflare.com` address that changes on every start): `docker run --rm --network wcag-auditor_default cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://caddy:80`.

## Hugging Face Spaces (demo only)

A Docker Space can run these images and is free, but it is a poor main option: the disk is wiped whenever the Space restarts or sleeps, so the database, runs and the model must be re-created each time (you would have to put the 109 MB model in a Hugging Face repo and download it on start); free hardware is 2 vCPU with 16 GB and sleeps after 48 hours without traffic; and there is no way to keep study responses safe. Use it only for a throwaway public demo, never for the participant study.

## Limits to expect

- One instance, one worker, one audit at a time (the job runner is in-process; further audits queue). Do not scale to several replicas.
- Audits are CPU heavy. Measured on this Mac with the api container limited to `--cpus 2` (same count as the A1 shape; an Ampere core is a little slower than an Apple core, so allow up to 1.5 times as long):
  - tiny page (example.com, desktop and mobile): about 12 seconds;
  - dense page (news.ycombinator.com, 920 findings, desktop and mobile): about 45 seconds with PDF output on;
  - peak container memory about 1.4 GB, so the 8 GB limit has plenty of headroom on the 12 GB VM.
- Expect roughly one to two minutes for typical pages and longer when Chromium has to wait on a slow site; `JOB_TIMEOUT_S` (900 s) is the ceiling.
- The "verify in a browser window" (headed) option cannot work on a server, there is no display. Leave it off.
- Uploads up to 25 MB per screenshot; Caddy rejects any request body over 60 MB.
- The HTTPS certificate is issued by Let's Encrypt on first start and renewed automatically; ports 80 and 443 must stay reachable.
- Never commit `deploy/.env`, the model, or backups.
