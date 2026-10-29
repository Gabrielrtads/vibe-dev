"""
Vibe-Dev SDK Connector for Google Antigravity SDK & Multi-Agent Swarm.
Author: Gabriel Toledo (@Gabrielrtads) | License: MIT
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

try:
    from pydantic import field_validator
except ImportError:  # pydantic v1
    from pydantic import validator as field_validator

# Ensure UTF-8 output on Windows consoles to prevent cp1252 UnicodeEncodeError
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Try importing Google Antigravity SDK decorators if available
try:
    from google_antigravity import agent
    HAS_ANTIGRAVITY_SDK = True
except ImportError:
    HAS_ANTIGRAVITY_SDK = False
    # Mock decorator fallback for environments without SDK installed
    class _MockAgent:
        def tool(self, func):
            return func
    agent = _MockAgent()


def _get_mesa_script_path() -> Path:
    """Locate the canonical mesa.mjs script relative to this file."""
    current_dir = Path(__file__).resolve().parent
    mesa_script = current_dir / "mesa.mjs"
    if mesa_script.exists():
        return mesa_script
    
    # Fallback to workspace standard locations
    workspace_mesa = Path(os.getcwd()) / "scripts" / "mesa.mjs"
    if workspace_mesa.exists():
        return workspace_mesa
    
    return mesa_script


# Mesmo critério do mesa.mjs: "base" vira argumento do git, então só "<remoto>/<ref>" ou "<ref>",
# com segmentos que não começam por "-" ou "." (bloqueia "--upload-pack=...", "ext::...").
_BASE_VALIDA = re.compile(r"[A-Za-z0-9_][A-Za-z0-9._-]*(/[A-Za-z0-9_][A-Za-z0-9._-]*)*")


def _validar_base(base: str) -> str:
    if (
        not isinstance(base, str)
        or not _BASE_VALIDA.fullmatch(base)
        or ".." in base
        or base.endswith((".", ".lock"))
    ):
        raise ValueError(f"base inválida: {base!r}. Use <remoto>/<branch> (ex.: origin/main).")
    return base


def _run_node_command(args: List[str], cwd: Optional[str] = None) -> str:
    """Execute node command synchronously with UTF-8 encoding."""
    mesa_script = str(_get_mesa_script_path())
    cmd = ["node", mesa_script] + args
    result = subprocess.run(
        cmd,
        cwd=cwd or os.getcwd(),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace"
    )
    if result.returncode != 0:
        raise RuntimeError(f"vibe-dev falhou (exit code {result.returncode}): {result.stderr.strip() or result.stdout.strip()}")
    return result.stdout.strip()


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Schemas for Google Antigravity SDK Tool Calling
# ─────────────────────────────────────────────────────────────────────────────

class MesaCriarInput(BaseModel):
    branch: str = Field(
        ...,
        description="Nome canônico da branch no padrão estrito 'task/<slug>-YYYYMMDD' (ex: task/auth-stripe-20261025)"
    )
    dono: str = Field(
        ...,
        description="Identificador do agente responsável (ex: claude-local, codex-local, gemini-local, gemini-vps)"
    )
    objetivo: str = Field(
        ...,
        description="Frase curta e clara declarando o objetivo técnico da mesa (sem quebras de linha ou pipes)"
    )
    repo: str = Field(
        default=".",
        description="Caminho do repositório Git onde a mesa será criada (padrão: '.')"
    )
    base: str = Field(
        default="origin/main",
        description="Branch base de referência atualizada (padrão: 'origin/main')"
    )

    @field_validator("base")
    @classmethod
    def _base_segura(cls, v: str) -> str:
        return _validar_base(v)


class MesaDesmontarInput(BaseModel):
    branch: str = Field(
        ...,
        description="Nome exato da branch da mesa a ser desmontada (ex: task/auth-stripe-20261025)"
    )
    repo: str = Field(
        default=".",
        description="Caminho do repositório Git (padrão: '.')"
    )
    arquivar: bool = Field(
        default=True,
        description="Se True, cria uma tag em 'archive/YYYYMMDD/<branch>' para rollback seguro antes de deletar a branch"
    )
    salvar_sujo: Optional[str] = Field(
        default=None,
        description="Pasta de destino para criar um patch git caso existam arquivos modificados não commitados"
    )


class MesaAuditarInput(BaseModel):
    repo: str = Field(
        default=".",
        description="Caminho do repositório Git a ser auditado"
    )
    dono: Optional[str] = Field(
        default=None,
        description="Filtrar mesas pelo ID do agente para separar as suas mesas das mesas de outros agentes e órfãs"
    )
    base: str = Field(
        default="origin/main",
        description="Branch base de referência"
    )

    @field_validator("base")
    @classmethod
    def _base_segura(cls, v: str) -> str:
        return _validar_base(v)


# ─────────────────────────────────────────────────────────────────────────────
# Agent Tools (Google Antigravity SDK Compliant)
# ─────────────────────────────────────────────────────────────────────────────

@agent.tool
def abrir_mesa(params: MesaCriarInput) -> str:
    """
    [Vibe-Dev Tool] Abre uma mesa de trabalho isolada em Git Worktree (.worktrees/<slug>).
    Garante que o agente edite apenas dentro da pasta isolada, mantendo a branch 'main' 100% limpa.
    Cria automaticamente Junction Links no Windows para node_modules e .venv.
    """
    args = [
        "criar",
        "--repo", params.repo,
        "--branch", params.branch,
        "--dono", params.dono,
        "--objetivo", params.objetivo,
        "--base", _validar_base(params.base)
    ]
    return _run_node_command(args)


@agent.tool
def desmontar_mesa(params: MesaDesmontarInput) -> str:
    """
    [Vibe-Dev Tool] Desmonta uma mesa concluída de forma segura com retry contra EPERM no Windows.
    Remove o diretório da worktree e deleta a branch após a integração.
    """
    args = [
        "desmontar",
        "--repo", params.repo,
        "--branch", params.branch
    ]
    if params.arquivar:
        args.append("--arquivar")
    if params.salvar_sujo:
        args.extend(["--salvar-sujo", params.salvar_sujo])
        
    return _run_node_command(args)


@agent.tool
def auditar_mesas(params: MesaAuditarInput) -> str:
    """
    [Vibe-Dev Tool] Audita todas as mesas ativas, estrangeiras e órfãs no repositório.
    Verifica se alguma mesa está suja, se ultrapassou o limite de 5 mesas ou se está pronta para desmontar.
    """
    args = [
        "auditar",
        "--repo", params.repo,
        "--base", _validar_base(params.base)
    ]
    if params.dono:
        args.extend(["--dono", params.dono])
        
    return _run_node_command(args)


# ─────────────────────────────────────────────────────────────────────────────
# CLI Entrypoint for Direct Python Usage
# ─────────────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help", "help"):
        print("🛡️ Vibe-Dev Python SDK Connector (v1.1.0)")
        print("Uso:")
        print("  python vibe_dev_sdk.py auditar [--repo <dir>] [--dono <agente>]")
        print("  python vibe_dev_sdk.py criar --branch task/<slug>-<YYYYMMDD> --dono <agente> --objetivo '<frase>' [--repo <dir>]")
        print("  python vibe_dev_sdk.py desmontar --branch task/<slug>-<YYYYMMDD> [--repo <dir>] [--arquivar]")
        sys.exit(0)

    cmd = sys.argv[1]
    raw_args = sys.argv[2:]
    try:
        output = _run_node_command([cmd] + raw_args)
        print(output)
    except Exception as e:
        print(f"Erro no vibe-dev SDK: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
