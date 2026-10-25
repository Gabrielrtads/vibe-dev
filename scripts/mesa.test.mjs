import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "mesa.mjs");
const onde = (exe) => path.dirname(execFileSync("where.exe", [exe], { encoding: "utf8" }).split(/\r?\n/)[0]);
const PATH_BASE = [onde("git"), onde("node"), onde("pwsh"), path.join(process.env.SystemRoot, "System32")];

function criarAmbienteRepo() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-dev-test-"));
  execFileSync("git", ["init", "-q", "-b", "main", raiz]);
  execFileSync("git", ["-C", raiz, "config", "user.email", "dev@swarm.local"]);
  execFileSync("git", ["-C", raiz, "config", "user.name", "Swarm Dev"]);

  fs.writeFileSync(path.join(raiz, ".gitignore"), ".worktrees/\nnode_modules/\n");
  fs.writeFileSync(path.join(raiz, "README.md"), "# Test Repo\n");
  
  // Criar pasta simulada de node_modules na raiz para testar junctions
  const nodeModulesPath = path.join(raiz, "node_modules");
  fs.mkdirSync(nodeModulesPath);
  fs.writeFileSync(path.join(nodeModulesPath, "pacote-teste.txt"), "conteudo node modules original");

  execFileSync("git", ["-C", raiz, "add", "."]);
  execFileSync("git", ["-C", raiz, "commit", "-qm", "commit inicial de teste"]);

  const rodarMesa = (args = []) => {
    const env = { ...process.env, PATH: PATH_BASE.join(";") };
    const r = spawnSync(
      "node",
      [SCRIPT, ...args],
      { env, encoding: "utf8", cwd: raiz }
    );
    return { codigo: r.status, saida: (r.stdout || "") + (r.stderr || "") };
  };

  return { raiz, rodarMesa, nodeModulesPath };
}

test("mesa criar: abre worktree isolada, cria junction de dependencias e grava registro com lock", () => {
  const { raiz, rodarMesa, nodeModulesPath } = criarAmbienteRepo();
  const registroPath = path.join(raiz, "TASK_REGISTRY.md");

  const rCriar = rodarMesa([
    "criar",
    "--repo", raiz,
    "--branch", "task/feature-auth-20261025",
    "--dono", "gemini-local",
    "--objetivo", "Implementar autenticacao segura",
    "--registro", registroPath
  ]);

  assert.equal(rCriar.codigo, 0, `Criar mesa falhou: ${rCriar.saida}`);
  assert.match(rCriar.saida, /Mesa criada: task\/feature-auth-20261025/);

  const pastaMesa = path.join(raiz, ".worktrees", "feature-auth-20261025");
  assert.equal(fs.existsSync(pastaMesa), true, "Pasta da mesa deve existir fisicamente");

  // Verificar Junction Link de node_modules
  const mesaNodeModules = path.join(pastaMesa, "node_modules");
  assert.equal(fs.existsSync(mesaNodeModules), true, "Junction de node_modules deve existir na mesa");
  const stat = fs.lstatSync(mesaNodeModules);
  assert.equal(stat.isSymbolicLink(), true, "node_modules na mesa deve ser um link simbólico / junction");

  // Verificar Registro e ausência de lockfile residual
  assert.equal(fs.existsSync(registroPath), true, "TASK_REGISTRY.md deve ter sido criado");
  assert.equal(fs.existsSync(`${registroPath}.lock`), false, "Lockfile deve ser liberado apos gravacao");
  const registroConteudo = fs.readFileSync(registroPath, "utf8");
  assert.match(registroConteudo, /TASK-FEATURE-AUTH-20261025/);
  assert.match(registroConteudo, /gemini-local/);
});

test("mesa auditar: detecta mesas abertas, dono e prontas para desmontar", () => {
  const { raiz, rodarMesa } = criarAmbienteRepo();
  const registroPath = path.join(raiz, "TASK_REGISTRY.md");

  rodarMesa([
    "criar",
    "--repo", raiz,
    "--branch", "task/audit-test-20261025",
    "--dono", "claude-local",
    "--objetivo", "Teste de auditoria de mesa",
    "--registro", registroPath
  ]);

  const rAuditar = rodarMesa([
    "auditar",
    "--repo", raiz,
    "--dono", "claude-local",
    "--registro", registroPath
  ]);

  assert.equal(rAuditar.codigo, 0, `Auditar falhou: ${rAuditar.saida}`);
  assert.match(rAuditar.saida, /task\/audit-test-20261025/);
  assert.match(rAuditar.saida, /claude-local/);
  assert.match(rAuditar.saida, /Mesas ativas: 1 de no máximo 5/);
});

test("mesa desmontar: desvincula junctions e remove worktree com sucesso", () => {
  const { raiz, rodarMesa, nodeModulesPath } = criarAmbienteRepo();
  const registroPath = path.join(raiz, "TASK_REGISTRY.md");

  rodarMesa([
    "criar",
    "--repo", raiz,
    "--branch", "task/teardown-20261025",
    "--dono", "codex-local",
    "--objetivo", "Teste de teardown de mesa",
    "--registro", registroPath
  ]);

  const pastaMesa = path.join(raiz, ".worktrees", "teardown-20261025");
  assert.equal(fs.existsSync(pastaMesa), true);

  const rDesmontar = rodarMesa([
    "desmontar",
    "--repo", raiz,
    "--branch", "task/teardown-20261025"
  ]);

  assert.equal(rDesmontar.codigo, 0, `Desmontar falhou: ${rDesmontar.saida}`);
  assert.match(rDesmontar.saida, /Mesa desmontada com sucesso/);
  assert.equal(fs.existsSync(pastaMesa), false, "Pasta da worktree deve ser removida");
  assert.equal(fs.existsSync(nodeModulesPath), true, "node_modules original NUNCA deve ser apagado!");
});
