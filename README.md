# 🛡️ Vibe-Dev (`vibe-dev`)

[![skills.sh compatible](https://img.shields.io/badge/skills.sh-compatible-6366f1?style=for-the-badge)](https://skills.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Zero-Dependency](https://img.shields.io/badge/Dependencies-Zero-emerald?style=for-the-badge)](#)
[![Multi-Agent Guard](https://img.shields.io/badge/Multi--Agent-Claude_|_Codex_|_Cursor_|_AGY-orange?style=for-the-badge)](#)

> **The Safe, Collision-Free Git Worktree & Lifecycle Engine for AI Pair Programming.**  
> Prevent AI agents from hallucinating, overwriting code, or destroying your production branch.

---

## ⚡ The Problem with 100% Vibe Coding

When delegating development to AI agents (Claude Code, Cursor, OpenAI Codex, Antigravity):
1. **Agents destroy the `main` branch:** AI writes incomplete code directly on production, triggering automatic cloud builds (Vercel, Netlify) that crash your site.
2. **Multi-agent collisions:** Two AI agents editing the same repository at the same time overwrite each other's work silently.
3. **The Frankenstein Effect:** When an AI makes a mistake, it tends to pile hack after hack on top of broken code, creating an un-debuggable nightmare.
4. **Orphan work:** Interrupted agent sessions leave dirty files, lost commits, and abandoned branches everywhere.

---

## 💡 The Solution: Deterministic Workbenches (`vibe-dev`)

`vibe-dev` gives every AI agent an isolated, temporary **Workbench ("Mesa")** powered by native Git Worktrees:

```
[Production / main Branch] ── (Protected & Clean at all times)
       │
       ├───> Claude Table   (.worktrees/task-ui-20261020)   ──> Atomic commits ──┐
       │                                                                         │
       └───> Codex Table    (.worktrees/task-api-20261020)  ──> Atomic commits ──┤
                                                                                 ▼
                                                          [CI / Smoke Tests Pass]
                                                                                 ▼
                                                          [Merge to main & Cleanup]
```

---

## 🚀 Quick Install (Via skills.sh)

Install directly into your AI coding assistant:

```bash
npx skills add Gabrielrtads/vibe-dev
```

Or run via `npx`:

```bash
# Audit active tables and orphans
npx vibe-dev auditar --repo .

# Create a new isolated table
npx vibe-dev criar --repo . --branch task/feature-auth-20261020 --dono claude-local --objetivo "Setup Stripe checkout"

# Teardown after verified merge
npx vibe-dev desmontar --repo . --branch task/feature-auth-20261020 --dono claude-local
```

---

## 🛠️ The 5 Golden Rules of Vibe-Dev

### 1. 🪑 Open a Workbench Table (`criar`)
Always work inside `.worktrees/<slug>` cloned from the updated baseline. The `main` branch remains untouched.

### 2. 🔒 Edit Exclusively in the Table Directory
The agent must never touch files in the root repository while working on a feature.

### 3. 📸 Snapshot-Driven Development
Do not accumulate hours of uncommitted work. Commit at every stable functional milestone:
- Schema ready ➔ `commit`
- Endpoint connected ➔ `commit`
- UI completed ➔ `commit`

Always sign with the agent trailer:
```bash
git commit -m "feat(auth): add OAuth2 provider" --trailer "Agent=claude-local"
```

### 4. 🛑 The Anti-Frankenstein Rule (1-Turn Rollback)
If an implementation breaks the code and is not fixed within **1 turn**, **never stack patches on corrupted code**. Rollback immediately to the last working micro-commit (`git checkout .`) and restart from a stable state.

### 5. 🧹 Teardown & Clean (`desmontar`)
Once smoke tests pass and merge is authorized, tear down the worktree. No zombie branches left behind.

---

## 📄 License

MIT License — Created with ❤️ by [Gabriel Toledo (@Gabrielrtads)](https://github.com/Gabrielrtads).
