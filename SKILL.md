---
name: vibe-dev
version: 1.1.0
description: "Safe, collision-free AI pair programming & multi-agent Git worktree lifecycle engine for Claude Code, Cursor, Codex, and Antigravity. Features Snapshot-Driven Development, rollback-guard rollback rules, concurrent atomic file locks, Windows junction links, and native Google Antigravity SDK tools."
category: devops
tags: [vibe-coding, git-worktrees, ai-agents, multi-agent, rollback-guard, snapshot-driven, claude, codex, cursor, antigravity, google-antigravity-sdk]
---

# 🛡️ Vibe-Dev (`vibe-dev`)

> **Safe, collision-free AI pair programming for 100% Vibe Coders.**  
> Never let an AI agent hallucinate and destroy your `main` branch again.

In multi-agent and Vibe Coding environments, AI agents (Claude Code, Cursor, OpenAI Codex, Antigravity) often edit files directly on the production branch, overwrite each other's changes, or pile broken patches on top of broken patches (**The Frankenstein Effect**).

`vibe-dev` enforces a deterministic **5-step workbench methodology** using native **Git Worktrees (`.worktrees/`)**:
1. **Open a Table (Worktree):** The agent works in an isolated directory cloned from stable baseline;
2. **Edit Only on the Table:** The `main` branch remains untouched and deployable at all times;
3. **Snapshot-Driven Development:** Micro-commits at every stable functional milestone;
4. **rollback-guard Rollback:** If broken, rollback immediately within 1 turn instead of stacking hacks;
5. **Close & Cleanup:** Verify tests, merge cleanly, and tear down the worktree with resilient EPERM retry.

---

## ⚡ Quick Install (Via skills.sh)

Install this skill directly into your AI coding assistant:

```bash
npx skills add Gabrielrtads/vibe-dev
```

---

## 🚀 The 5 Canonical Steps

### 1. Open a Worktree Table (`criar`)
```bash
npx vibe-dev criar --repo <path> --branch task/<slug>-<YYYYMMDD> --dono <agent-id> --objetivo "<task summary>"
```
*Creates an isolated worktree under `<repo>/.worktrees/<slug>`, automatically binds `node_modules` and `.venv` via Windows Directory Junctions (saving SSD space and allowing instant tests), and safely registers the task using atomic file locks.*

### 2. Edit Exclusively in the Table Directory
The agent navigates to `<repo>/.worktrees/<slug>` and performs all work there.
**Rule of Thumb:** Never touch files in the root repository while working on a task.

### 3. Save with Atomic Commits (Snapshot-Driven Development)
* Do not wait hours to commit everything at once. Commit at every stable functional milestone (schema ready ➔ commit; endpoint ready ➔ commit; UI connected ➔ commit).
* Always include the agent signature trailer:
  ```bash
  git commit -m "feat(module): describe what and why" --trailer "Agent=<agent-id>"
  ```
* **rollback-guard Rule (1-Turn Rollback):** If an implementation attempts break the application and is not resolved within 1 turn, **never stack patches on corrupted code**. Rollback immediately to the last working commit (`git checkout .` or `git revert`) and restart with fresh premises.

### 4. Deliver & Verify
Run smoke tests and build checks inside the worktree (`npm run build`, `npm test`, `pytest`, etc.). Because `node_modules` / `.venv` are linked via junctions, tests run immediately without duplicate installs.

### 5. Tear Down the Table (`desmontar`)
```bash
npx vibe-dev desmontar --repo <path> --branch task/<slug>-<YYYYMMDD> --dono <agent-id>
```
*Safely unlinks dependencies, unlinks the temporary worktree with backoff retry (resilient to Windows EPERM / locked file handles), and removes the branch.*

---

## 🐍 Google Antigravity SDK Integration (Python)

If you are developing agents with the **Google Antigravity SDK** (`google-antigravity`), use the native Python connector:

```python
from vibe_dev_sdk import abrir_mesa, desmontar_mesa, auditar_mesas, MesaCriarInput

# Use directly inside your Antigravity agent or as an @agent.tool:
resultado = abrir_mesa(MesaCriarInput(
    branch="task/feature-billing-20261025",
    dono="gemini-local",
    objetivo="Implementar webhook Asaas",
    repo="."
))
print(resultado)
```

---

## 🔍 Audit & Rescue Orphan Tables (`auditar`)

If an AI session crashes, network drops, or a task is abandoned:
```bash
npx vibe-dev auditar --repo <path> --dono <agent-id>
```
Detects active, foreign, and orphan tables. Preserves uncommitted work safely into backup patches.

---

## 📄 License

MIT License — Created with ❤️ by [Gabriel Toledo (@Gabrielrtads)](https://github.com/Gabrielrtads).
