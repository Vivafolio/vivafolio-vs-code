# Vivafolio Workspace Sync Service – Technical Specification (v0.1)

**Audience:** Implementation team (backend, client, DevOps/SRE, infra)  
**Goal:** Ship an open-source service that provides Dropbox-like *autosync* for teams’ “vaults” (Markdown, CSV/TSV, images/attachments), adds smart conflict behavior (table-aware merges; non-blocking merges for everything else), and optionally maintains a **local SQLite index** for search/analytics. NixOS-based servers; Windows/macOS/Linux clients; optional hosted plan.

---

## 0. TL;DR design summary
- **Transport & autosync:** Use **git-annex Assistant** + **SSH remotes** with `git-annex-shell notifychanges` for event-driven sync. This gives reliable, Git-aware autosync with offline support.
- **Repo model:** Each **vault = Git repo** initialized with **git-annex** (even if most files aren’t “large”).
- **Conflict policy:**
  - **CSV/TSV** → table-aware 3-way merge (e.g., **daff**). Users declare primary key(s) per path; conflicts resolved by rows/cells, minimizing manual merges.
  - **Markdown** → YAML front-matter merged structurally; body merged textually; *if* unresolved, fall back to **annex-style “variant files”** so work never blocks.
  - **Binary/other** → annex’s default **auto-resolve to `*.variant-*`** (never halts progress).
- **SQLite index (event-sourced):** Client daemon maintains an **event-sourced** SQLite database: it tracks the **last processed Git revision** and incrementally applies only new/changed files. It can be **safely nuked** and rebuilt from any chosen Git revision.
- **Storage mode:** Per-vault and per-user preferences choose **in-memory** or **file-backed** SQLite.
- **Security & tenancy:** Tenant isolation via **NetBird (WireGuard)** + **OpenSSH cert-based auth** + per-team UNIX users & repository namespaces. Optional **sub-teams/roles** mapped to per-vault ACLs.
- **Real-time collaboration:** Optional **editor/WebUI live sync** using an off‑the‑shelf **CRDT or OT server** (e.g., Yjs `y-websocket` or ShareDB). VS Code extension + WebUI integrate with the collab server; files on disk are kept in sync with the collaborative document.
- **Deliverables:** NixOS modules for the server stack; cross-platform client package/installer; reference infra-as-code; tests.
---

## 1. Goals & non-goals
### Goals
1. **Autosync** of one or more local directories (“vaults”) with a central server.
2. **Non-blocking collaboration**: conflicts never prevent syncing or progress; prefer automatic merges, else safe duplicates (`.variant-*`).
3. **Format-aware merges** for CSV/TSV; front-matter-aware merges for Obsidian-style Markdown.
4. **Local searchable mirror** using **SQLite** (FTS + lightweight relational views) refreshed continuously.
5. **Multi-OS clients**: Windows (service), macOS (LaunchAgent/Daemon), Linux (systemd & Nix). Easy install.
6. **NixOS-first servers**: reproducible deployment; minimal ops.
7. **Team isolation** with option for **sub-teams/roles**.
8. **Open-source** core; supports a **paid hosted plan** (auth, quotas, audit).

### Non-goals (v0.1)
- No web UI for editing/browsing (CLI and OS-native file explorer suffice). Optional browse via Gitea later.
- No CRDT editor integration for Markdown in v0.1 (merge drivers and non-blocking policy suffice).
- No central full-text search across all teams (clients index locally; hosted plan may add optional multi-tenant search later).

---

## 2. Architecture overview
```
+----------------------+          +------------------------+           +---------------------------+
|  Client (vaultagent) |  SSH/Annex  |   Vault Server (NixOS)  |  WebSocket/OT  |  Collab Server (CRDT/OT) |
|  - file watcher      +-----------> |  - git/annex repos      +<--------------> |  (Yjs or ShareDB)        |
|  - git-annex assistant <---------+ |  - sshd + annex-shell   |                +---------------------------+
|  - merge drivers     |  notify    |  - notifychanges daemon |
|  - sqlite indexer    |            |  - repo mgmt API        |
|  - collab adapter    |            |                         |
+----------+-----------+            +------------+------------+
           |                                        |
           | local CLI/HTTP (search, status)        | NetBird control plane (WireGuard ACLs)
           v                                        v
     User tools (shell, GUI, VS Code)          NetBird (team network)
```

**Key additions for collaboration**
- **Collab Server:** pluggable provider running either **CRDT (Yjs)** or **OT (ShareDB)**. Multi-tenant namespaces map to vaults. Auth uses short‑lived tokens minted by `vaultd`.
- **Collab Adapter (client):** bridges files ↔ collaborative docs. For Markdown: front matter ↔ Y.Map; body ↔ Y.Text (or OT text). For CSV/TSV: row-wise model (Y.Array of rows) or plain text in v0.1.

----------------------+          +------------------------+
|  Client (vaultagent) |  SSH/Annex  |   Vault Server (NixOS)  |
|  - file watcher      +-----------> |  - git/annex repos      |
|  - git-annex assistant <---------+ |  - sshd + annex-shell   |
|  - merge drivers     |  notify    |  - notifychanges daemon |
|  - sqlite indexer    |            |  - repo mgmt API        |
+----------+-----------+            +------------+------------+
           |                                        |
           | local CLI/HTTP (search, status)        | NetBird control plane (WireGuard ACLs)
           v                                        v
     User tools (shell, GUI)                   NetBird (team network)
```

**Key choices**
- **Event-driven sync:** `git annex remotedaemon` + server-side `git-annex-shell notifychanges` → pushes instantly notify peers (no polling).
- **Per-vault Git repo:** keeps history; supports offline work; annex assistant handles autosync and safe conflict behavior.
- **Merge drivers:** `daff` for CSV/TSV; `yaml-merge` for Markdown front matter; fallback to variant files.
- **SQLite index (client):** daemon updates per change; provides `vaultctl search` and optional local HTTP API.

---

## 3. Repositories and vault layout
- **One vault = one Git repo** on the server (`/var/lib/vaultd/repos/<team>/<vault>.git`).
- Clients clone into configured directories; each clone is `git annex init`-ed by the client on first run.
- **Default branch**: `main`.
- **Git attributes** committed to each vault:
  ```gitattributes
  # CSV/TSV → daff merge driver (table-aware)
  *.csv merge=daff-csv
  *.tsv merge=daff-csv

  # Markdown front-matter aware merge
  *.md  merge=md-frontmatter

  # Treat common binaries as annexed (optional patterns)
  *.png annex.largefiles=(largerthan=10mb)
  *.jpg annex.largefiles=(largerthan=10mb)
  *.pdf annex.largefiles=(largerthan=20mb)
  ```
- **Repository hooks** (server): disabled for arbitrary user code. Only first-party administrative hooks allowed (e.g., quota checks, creation of notify watchers).

---

## 4. Sync & conflict model
### 4.1 Autosync
- Client runs **git-annex Assistant** (or `remotedaemon`) that:
  - Watches filesystem via inotify/FSEvents/kqueue.
  - Auto-commits changes.
  - Syncs to server remote.
  - Listens for `notifychanges` to pull immediately on remote updates.

### 4.2 Conflict handling
- **CSV/TSV:**
  - Use **daff** merge driver (`daff git csv`) with **declared primary keys** per file (configurable by path pattern). Three-way merges become row/column-aware.
  - If merge fails (e.g., duplicate keys with incompatible updates), driver emits a **clean merged file** plus an adjacent `*.conflicts.csv` report; autosync continues.
- **Markdown:**
  - **Front matter** parsed as YAML → merged with a YAML-aware tool (keys merged; arrays with strategy: `set-union` by default; overridable per key).
  - **Body**: default to Git’s text 3-way merge. If unresolved, commit proceeds with **annex variant resolution**: keep both versions (`note.md.variant-<hash>`). Autosync never blocks.
- **Binary/other:** always **variant files** on conflict.
- **Policy knobs (per-vault):**
  - `merge.csv.keys`: map of glob → key column(s).
  - `merge.yaml.arrayPolicy`: `union|append|ours|theirs` (per key).
  - `merge.onFailure`: `variant|ours|theirs|abort` (default `variant`).

### 4.3 JJ-style “keep working”
- We achieve “never halt” semantics by **never leaving index/worktree in a conflicted state**. If a driver can’t produce a single file, it materializes **variants** (or a resolved file + sidecar report). Annex autosync then proceeds.

---

## 5. Client components
### 5.1 Processes
- **vaultagent** (daemon)
  - Supervises **git-annex Assistant** per-vault.
  - Runs **merge driver helpers** (daff, yaml-merge) as needed.
  - Maintains **SQLite** index (event-sourced; see §7.4–7.6).
  - Exposes a local **Unix/Named-pipe/localhost HTTP** control API (status, search, tail logs).
  - **Collab adapter**: syncs files with CRDT/OT docs when real-time sessions are active.
- **vaultctl** (CLI)
  - `vaultctl enroll` – join team, get credentials, set up remotes.
  - `vaultctl add-vault <name> --dir <path>` – clone/init & configure.
  - `vaultctl status` – sync/merge/index status.
  - `vaultctl search 'query'` – FTS search via SQLite.
  - `vaultctl config get/set` – manage client config.
- **VS Code extension (vault-vscode)**
  - Connects to Collab Server via WebSocket using tokens from `vaultagent`.
  - Mirrors edits live (CRDT/OT) and writes to disk; watches disk changes from annex sync.
- **WebUI (minimal)**
  - Browser editor (Monaco) bound to CRDT/OT provider for Markdown/CSV.

### 5.2 Installation/packaging
- **Windows:** MSI (WiX) installs `vaultagent` as a Windows Service; bundles git, git-annex, daff (Node or Python), SQLite; adds PATH shims. VS Code extension packaged in marketplace.
- **macOS:** notarized `.pkg`; LaunchDaemon for `vaultagent`; Homebrew formula for devs.
- **Linux:** `.deb`/`.rpm`, systemd unit; **Nix** package and module; optional AppImage.
- **Updates:** packaged via OS channels (MSI upgrade, pkg receipts, apt/yum, Homebrew, Nix). No custom auto-updater in v0.1.

### 5.3 Configuration
```yaml
# %PROGRAMDATA%/Vault/agent.yaml (Win)
# /Library/Application Support/Vault/agent.yaml (macOS)
# /etc/vaultagent/agent.yaml (Linux)
version: 1
team: acme
controlPlaneURL: https://control.acme.example
vpn:
  provider: netbird
  enrollmentURL: https://join.acme.example
ssh:
  ca: https://control.acme.example/ssh-ca.pub
  username: u1234   # short-lived cert will bind identity
collab:
  enabled: true
  provider: yjs   # yjs | sharedb
  serverURL: wss://collab.acme.internal
  tokenTTL: 3600
vaults:
  - name: notes
    dir: /home/user/Notes
    remote: ssh://git@vaults.acme.internal/acme/notes.git
    merge:
      csv:
        keys:
          "**/people.csv": ["id"]
          "**/prices.tsv": ["date","symbol"]
      yaml:
        arrays:
          tags: union
    index:
      include: ["**/*.md","**/*.csv","**/*.tsv"]
      exclude: ["archive/**"]
      storage: file   # file | memory
```

```yaml
# %PROGRAMDATA%/Vault/agent.yaml (Win)
# /Library/Application Support/Vault/agent.yaml (macOS)
# /etc/vaultagent/agent.yaml (Linux)
version: 1
team: acme
controlPlaneURL: https://control.acme.example
vpn:
  provider: netbird
  enrollmentURL: https://join.acme.example
ssh:
  ca: https://control.acme.example/ssh-ca.pub
  username: u1234   # short-lived cert will bind identity
vaults:
  - name: notes
    dir: /home/user/Notes
    remote: ssh://git@vaults.acme.internal/acme/notes.git
    merge:
      csv:
        keys:
          "**/people.csv": ["id"]
          "**/prices.tsv": ["date","symbol"]
      yaml:
        arrays:
          tags: union
    index:
      include: ["**/*.md","**/*.csv","**/*.tsv"]
      exclude: ["archive/**"]
```

---

## 6. Server components (NixOS)
### 6.1 Services
- **sshd** with **OpenSSH CA** and `ForceCommand` wrappers (restrict repo access by team/vault).
- **git** + **git-annex** + `git-annex-shell`.
- **vaultd** (management API): create/delete vaults; manage ACLs; issue SSH certs; configure notify watchers.
- **Collab Server** (optional but supported):
  - **Mode A (CRDT):** Node service running **Yjs y-websocket** with Redis adapter for horizontal scale.
  - **Mode B (OT):** Node service running **ShareDB** with Mongo/Memory backend.
  - **Auth:** JWT tokens minted by `vaultd`; per-vault rooms (namespaces); read/write roles.
- **netbird** agents (coordinator/management if self-hosted; else integrate with provider).
- **Optional**: **MinIO** (S3) if we later offload annex content to object storage; **Gitea** for UI.

### 6.2 NixOS module (high level)
```nix
{
  services.vaultd.enable = true;
  services.vaultd.repoRoot = "/var/lib/vaultd/repos";
  services.vaultd.stateDir = "/var/lib/vaultd";
  services.vaultd.manageOpenSSH = true;  # installs CA keys, Match blocks, ForceCommand
  services.vaultd.netbird.enable = true;
  services.vaultd.tenancy = {
    teams = [ ];  # declarative or via API
    subteams.enable = true;  # optional
  };
  services.vaultd.quotas = { perVaultBytes = 50 * 1024 * 1024 * 1024; };
  services.vaultd.announceNotify = true; # ensures notifychanges is active

  # Collaboration server (choose one)
  services.vaultd.collab.enable = true;
  services.vaultd.collab.provider = "yjs"; # or "sharedb"
  services.vaultd.collab.listen = "0.0.0.0:12345";
  services.vaultd.collab.backingStore = "redis://localhost:6379"; # or mongodb URL for ShareDB
}
```

**Module responsibilities:**
- Create per-team UNIX users & groups; set directory ACLs.
- Provision bare repos and run `git annex init --bare` + server-side settings.
- Configure sshd:
  - Trust CA public key.
  - `Match` blocks per team user.
  - `ForceCommand=/usr/lib/vaultd/ssh-gateway` that restricts git-annex-shell to allowed repos.
- Run a `vaultd` API (systemd) with a declarative/imperative interface.
- Register **notifychanges** watchers (systemd units) per repo.
- Provision **Collab Server** unit with TLS, JWT validation middleware, and per-vault room namespace.

### 6.3 Server repo layout & permissions
```
/var/lib/vaultd/repos/
  acme/
    notes.git/            (bare repo)
    research.git/
  beta/
    ops.git/
```
- Each repo owned by Unix user `team-acme`; group `team-acme`; mode `0770`.
- `ssh-gateway` maps presented SSH cert identity → team/subteam → repo allowlist.

```
/var/lib/vaultd/repos/
  acme/
    notes.git/            (bare repo)
    research.git/
  beta/
    ops.git/
```
- Each repo owned by Unix user `team-acme`; group `team-acme`; mode `0770`.
- `ssh-gateway` maps presented SSH cert identity → team/subteam → repo allowlist.

---

## 7. SQLite local index (client)
### 7.1 Scope
- **Markdown**: strip YAML front matter; index body in **FTS5**; keep `title`, `tags`, `links` from front matter.
- **CSV/TSV**: index selected columns (configurable) and entire rows for FTS.
- **Attachments**: filenames only (no OCR in v0.1).

### 7.2 Schema (proposed)
```sql
CREATE VIRTUAL TABLE fts_docs USING fts5(path, body, tokenize = 'porter');
CREATE TABLE docs (
  path TEXT PRIMARY KEY,
  title TEXT,
  tags TEXT,
  updated_at INTEGER
);
CREATE TABLE csv_rows (
  path TEXT,
  rowid_in_file INTEGER,
  json_row TEXT,
  PRIMARY KEY (path, rowid_in_file)
);
CREATE VIRTUAL TABLE fts_csv USING fts5(path, json_row);
CREATE TABLE index_state (
  vault TEXT PRIMARY KEY,
  last_processed_git_rev TEXT NOT NULL
);
```

### 7.3 Indexer behavior
- Triggered by file watcher and by annex sync events.
- For Markdown: parse front matter (YAML), update `docs`, update `fts_docs`.
- For CSV/TSV: stream rows; update `csv_rows` + `fts_csv` (batch to avoid churn).
- Provide **local HTTP** (127.0.0.1) `/search?q=...` (JSON) and CLI passthrough.
- DB is per-vault; stored under `.vaultagent/db.sqlite` unless **memory mode** is configured.

### 7.4 Event‑sourced updater semantics
- The indexer treats Git history as an **append‑only event log**:
  - Reads the **`index_state.last_processed_git_rev`**.
  - Computes the **set of changed paths** between that rev and `HEAD` (or the newest synced rev).
  - Applies **idempotent** upserts/deletes for only those paths.
  - Commits the new `last_processed_git_rev`.
- The indexer exposes `vaultctl index rewind --to <git-rev>` to reprocess from an earlier point if needed.

### 7.5 Safe rebuilds (nuking the DB)
- If the SQLite file is deleted or corrupted, the agent will **recreate it from scratch** by scanning the working copy at the **current Git revision** (or a pinned revision), then set `last_processed_git_rev` accordingly. No central state required.

### 7.6 Storage mode
- Per‑vault and per‑user preferences select **`storage: memory`** (ephemeral, fast) or **`storage: file`** (durable). Memory mode still writes `index_state` in memory and simply rebuilds on agent restart.
- Triggered by file watcher and by annex sync events.
- For Markdown: parse front matter (YAML), update `docs`, update `fts_docs`.
- For CSV/TSV: stream rows; update `csv_rows` + `fts_csv` (batch to avoid churn).
- Provide **local HTTP** (127.0.0.1) `/search?q=...` (JSON) and CLI passthrough.
- DB is per-vault; stored under `.vaultagent/db.sqlite`.

---

## 8. Authentication & authorization
### 8.1 Device & user identity
- **VPN enrollment (NetBird):** users join a team mesh network; ACLs limit east-west.
- **SSH access:**
  - Client generates key pair on first enroll.
  - `vaultctl enroll` performs OIDC (or team token) with **vaultd**, which issues a **short-lived OpenSSH user cert** (e.g., 24h) bound to team and subteam claims.
  - Client renews cert via background flow.

### 8.2 Repo access control
- `ssh-gateway` validates cert; extracts claims; restricts **git-annex-shell** to paths allowed for that identity (read/write per vault).
- Optional read-only roles.

### 8.3 Hosted plan specifics
- Multi-tenant **vaultd** with OIDC (Google/Microsoft) login.
- Billing/quotas tied to team.
- Audit logs: push/pull, repo create/delete, cert issuance.

---

## 9. APIs (control plane)
**Note:** data sync itself is via SSH/Git/annex; API is management only.

### 9.1 REST-ish endpoints
- `POST /enroll/start` → returns OIDC URL or validates team invite token.
- `POST /enroll/finish` → returns SSH user cert + allowed repos + **collab JWT** (scoped, short‑lived).
- `POST /teams/{id}/vaults` → create vault; returns SSH URL and collab room name.
- `GET /teams/{id}/vaults` → list.
- `POST /vaults/{id}/acl` → set repo ACLs.
- `GET /me` → user info; cert expiry.

### 9.2 CLI interaction
- `vaultctl enroll` calls `/enroll/*`.
- `vaultctl add-vault` calls `/teams/*/vaults` (or accepts existing URL if self-provisioned) then runs `git clone` + `git annex init` and writes `.gitattributes`.
- `vaultctl token collab` → mint/refresh JWT for the VS Code extension or WebUI.

---

## 10. Sub-teams / roles (optional)
- **Model:** team → subteam(s) (e.g., `ops`, `research`).
- **Mapping:** ACL entries are `(subteam|role, vault, permissions)`.
- **Enforcement:** SSH cert contains `permit-subteams=[ops,research]`; gateway maps to repo list.
- **Drop if complex:** If time-constrained, v0.1 ships **team-wide ACL** only; subteams return in v0.2.

---

## 11. Observability & ops
- **Client:** structured logs (JSON), `vaultctl logs`, health endpoint `/healthz`.
- **Server:** journald logs for vaultd & ssh-gateway; Prometheus metrics:
  - `vaultd_repo_push_total`, `vaultd_repo_pull_total`, `vaultd_active_sessions`.
  - **Collab:** connection counts, room counts, op throughput, latency p50/p95.
- **Backups:** `borg` or ZFS snapshots for `/var/lib/vaultd/repos`.
- **Upgrades:** NixOS generation rollbacks; blue/green not required.

---

## 12. Security model
- **Network:** WireGuard (NetBird) limits access to vault servers and (optionally) collab server endpoints.
- **AuthN:** OpenSSH user certificates (short-lived); identity via OIDC or team token. Collab server uses **JWT** minted by `vaultd`.
- **AuthZ:** path-restricted `git-annex-shell` via forced command and repo allowlist; collab rooms are ACL’d per vault/subteam.
- **Isolation:** UNIX users per team; file perms 0770; no cross-team read.
- **Supply chain:** pin Nixpkgs revisions; vendor daff/python libs via Nix; reproducible builds where possible.

---

## 13. Performance targets (initial)
- Small MD/CSV edits propagate **< 2s** on LAN VPN; **< 5s** over WAN.
- **Collab editing latency:** end-to-end keystroke echo **< 100 ms** p95 within a region; **< 250 ms** cross-region.
- Cold clone of 10k-file vault (500 MB total) **< 2 min**.
- Indexer updates **< 500 ms** for single-file edits.
- CPU/mem footprint of `vaultagent` **< 200 MB RSS** idle.

---

## 14. Test plan (high level)
- **Unit:** merge drivers (CSV keys, YAML strategies), index parser, CLI, **event-sourced indexer state machine**.
- **Integration:**
  - Two clients + server; simulate concurrent edits: CSV row updates; Markdown front-matter edits; binary conflicts → variants.
  - Offline changes on both clients; reconnect; ensure autosync without manual steps.
  - Notify path: server push triggers immediate client pull.
  - **Collab:** VS Code ↔ WebUI co-editing; network partitions and rejoin; room ACLs.
- **E2E:** enroll → add vault → edit → search → rotate cert → live co-edit.
- **Chaos:** restart server; network flap; clock skew; file churn.

---

## 15. Deliverables
1. **NixOS modules**
   - `services.vaultd` (API & repo manager)
   - `services.vaultd.ssh-gateway` (forced-command wrapper; CA integration)
   - `services.vaultd.gitrepos` (repo provisioning; notify watchers)
   - `services.vaultd.collab` (CRDT/OT server: Yjs y-websocket or ShareDB)
   - Optional: `services.vaultd.gitea` and/or `services.minio` for object storage
   - Example: `nixosConfigurations.vaults1` showing a complete server

2. **Client packages**
   - `vaultagent` (daemon) + `vaultctl` (CLI)
   - **VS Code extension** for live collaboration
   - **WebUI** (browser editor) for live collaboration
   - Installers: MSI, pkg (signed/notarized), deb/rpm, Nix package
   - Bundled: git, git-annex, daff (Node/Python), SQLite

3. **Reference infra**
   - Terraform or NixOps for a single-node deployment
   - NetBird setup docs (or scripts if self-hosted)

4. **Docs**
   - Admin guide (create team, vault, ACLs)
   - User guide (enroll, add-vault, resolve variants, search, **live collaboration**)
   - Merge policy cookbook (CSV keys, YAML strategies)

5. **CI**
   - Build pipelines (Nix + GitHub Actions)
   - Integration test harness (docker-compose or Nix test driver)

---

## 16. Implementation notes & snippets
### 16.1 Merge driver: YAML front matter wrapper (pseudo)
```bash
#!/usr/bin/env bash
# merge-md-frontmatter.sh %O %A %B
python3 - "$@" <<'PY'
import sys, yaml, re
base, ours, theirs = sys.argv[1:4]

fm = re.compile(r"(?s)^---
(.*?)
---
")

def split(path):
    t = open(path,'r',encoding='utf-8').read()
    m = fm.match(t)
    if m:
        y = yaml.safe_load(m.group(1)) or {}
        body = t[m.end():]
    else:
        y, body = {}, t
    return y, body

Yb, Ob = split(base)
Yo, Oo = split(ours)
Yt, Ot = split(theirs)

# simple strategy: dict union; arrays = set-union
def merge_yaml(a,b,c):
    out = {}
    keys = set(a)|set(b)|set(c)
    for k in keys:
        va, vb, vc = a.get(k), b.get(k), c.get(k)
        if all(isinstance(x,list) or x is None for x in (va,vb,vc)):
            s = set(va or []) | set(vb or []) | set(vc or [])
            out[k] = sorted(s)
        else:
            out[k] = vc if vc is not None else (vb if vb is not None else va)
    return out

Ym = merge_yaml(Yb, Yo, Yt)
# body: defer to simple textual 3-way via ours (already merged by git); if conflict markers remain, keep as-is
merged = "---
"+yaml.safe_dump(Ym, sort_keys=True)+"---
"+Oo
open(ours,'w',encoding='utf-8').write(merged)
PY
```

### 16.2 .gitattributes example (repo root)
```gitattributes
*.csv merge=daff-csv
*.tsv merge=daff-csv
*.md  merge=md-frontmatter
```

### 16.3 SSH gateway (concept)
- Validate OpenSSH cert.
- Map `principal` → team/subteam.
- Allow only `git-annex-shell -c <cmd>` for paths under `/var/lib/vaultd/repos/<team>/`.
- Deny if not in allowlist.

### 16.4 Systemd units (client)
```ini
[Unit]
Description=Vault Agent
After=network-online.target

[Service]
ExecStart=/usr/bin/vaultagent --config /etc/vaultagent/agent.yaml
Restart=always

[Install]
WantedBy=multi-user.target
```

### 16.5 Event‑sourced indexer (pseudo)
```python
last = db.get_last_rev(vault)
new = git.rev_parse('HEAD')
if last == new:
    return
changed = git.diff('--name-status', f'{last}..{new}')
for path, status in changed:
    if status in ('A','M'):
        upsert(path, read_and_parse(path))
    elif status == 'D':
        delete(path)
    else:
        noop()
db.set_last_rev(vault, new)
```

### 16.2 .gitattributes example (repo root)
```gitattributes
*.csv merge=daff-csv
*.tsv merge=daff-csv
*.md  merge=md-frontmatter
```

### 16.3 SSH gateway (concept)
- Validate OpenSSH cert.
- Map `principal` → team/subteam.
- Allow only `git-annex-shell -c <cmd>` for paths under `/var/lib/vaultd/repos/<team>/`.
- Deny if not in allowlist.

### 16.4 Systemd units (client)
```ini
[Unit]
Description=Vault Agent
After=network-online.target

[Service]
ExecStart=/usr/bin/vaultagent --config /etc/vaultagent/agent.yaml
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## 17. Roadmap (post v0.1)
- Optional **web UI** (Gitea or custom) for browsing vaults.
- **Object storage** offload for annex contents (MinIO), with presigned URLs.
- **CRDT Markdown** (Automerge-backed) as an opt-in file type.
- Centralized **multi-tenant search** (server-side index, opt-in upload).
- **Mobile** companion (read-only) backed by on-device SQLite.

---

## 18. Open questions (nice-to-have answers later)
- Server-side preview pipelines (Markdown render, CSV schema inference) for a hosted UI.
- Client-side configurable CSV key discovery (infer stable primary key).
- How strict to be about `.variant-*` cleanup policies (auto-sweep after human resolution?).

---

**End of spec v0.1**
