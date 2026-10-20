---
name: vibe-dev
version: 1.0.0
description: "Safe, collision-free AI pair programming & multi-agent Git worktree lifecycle engine for Claude Code, Cursor, Codex, and Antigravity. Features Snapshot-Driven Development and Anti-Frankenstein rollback rules."
category: devops
tags: [vibe-coding, git-worktrees, ai-agents, multi-agent, anti-frankenstein, snapshot-driven, claude, codex, cursor, antigravity]
---

# 🛡️ Vibe-Dev (`vibe-dev`)

> **Safe, collision-free AI pair programming for 100% Vibe Coders.**  
> Never let an AI agent hallucinate and destroy your `main` branch again.

In multi-agent and Vibe Coding environments, AI agents (Claude Code, Cursor, OpenAI Codex, Antigravity) often edit files directly on the production branch, overwrite each other's changes, or pile broken patches on top of broken patches (**The Frankenstein Effect**).

`vibe-dev` enforces a deterministic **5-step workbench methodology** using native **Git Worktrees (`.worktrees/`)**:
1. **Open a Table (Worktree):** The agent works in an isolated directory cloned from stable baseline;
2. **Edit Only on the Table:** The `main` branch remains untouched and deployable at all times;
3. **Snapshot-Driven Development:** Micro-commits at every stable functional milestone;
4. **Anti-Frankenstein Rollback:** If broken, rollback immediately within 1 turn instead of stacking hacks;
5. **Close & Cleanup:** Verify tests, merge cleanly, and tear down the worktree.

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
*Creates an isolated worktree under `<repo>/.worktrees/<slug>` and registers the task in the central registry.*

### 2. Edit Exclusively in the Table Directory
The agent navigates to `<repo>/.worktrees/<slug>` and performs all work there.
**Rule of Thumb:** Never touch files in the root repository while working on a task.

### 3. Save with Atomic Commits (Snapshot-Driven Development)
* Do not wait hours to commit everything at once. Commit at every stable functional milestone (schema ready ➔ commit; endpoint ready ➔ commit; UI connected ➔ commit).
* Always include the agent signature trailer:
  ```bash
  git commit -m "feat(module): describe what and why" --trailer "Agent=<agent-id>"
  ```
* **Anti-Frankenstein Rule (1-Turn Rollback):** If an implementation attempts break the application and is not resolved within 1 turn, **never stack patches on corrupted code**. Rollback immediately to the last working commit (`git checkout .` or `git revert`) and restart with fresh premises.

### 4. Deliver & Verify
Run smoke tests and build checks inside the worktree (`npm run build`, `pytest`, etc.). Only request merge into `main` after presenting fresh, reproducible evidence.

### 5. Tear Down the Table (`desmontar`)
```bash
npx vibe-dev desmontar --repo <path> --branch task/<slug>-<YYYYMMDD> --dono <agent-id>
```
*Tears down the temporary worktree and removes the branch, keeping your project clean and ready for continuous deployment.*

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
