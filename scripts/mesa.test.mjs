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

  const rodarMesa = (args = [], envExtra = {}) => {
    const env = { ...process.env, PATH: PATH_BASE.join(";"), ...envExtra };
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

function criarMesa(rodarMesa, raiz, slug) {
  const registroPath = path.join(raiz, "TASK_REGISTRY.md");
  const r = rodarMesa([
    "criar",
    "--repo", raiz,
    "--branch", `task/${slug}`,
    "--dono", "claude-local",
    "--objetivo", "Teste de seguranca",
    "--registro", registroPath
  ]);
  assert.equal(r.codigo, 0, `Criar mesa falhou: ${r.saida}`);
  return path.join(raiz, ".worktrees", slug);
}

test("seguranca --base: recusa injecao de argumento no git fetch (criar e auditar)", () => {
  const { raiz, rodarMesa } = criarAmbienteRepo();
  const registroPath = path.join(raiz, "TASK_REGISTRY.md");
  const marcador = path.join(os.tmpdir(), `vibe-dev-pwned-${path.basename(raiz)}`);
  // PATH completo: com o PATH reduzido da suíte o git não consegue abrir o shell e o ataque não seria exercitado.
  const env = { MARCADOR_PWNED: marcador, PATH: process.env.PATH };
  // O primeiro segmento vira o "remoto" do git fetch: sem validação, o git executa o --upload-pack.
  const malicioso = `--upload-pack=node -e "require('fs').writeFileSync(process.env.MARCADOR_PWNED,'x')"/.`;

  const rCriar = rodarMesa([
    "criar", "--repo", raiz, "--branch", "task/injecao-20261029", "--dono", "claude-local",
    "--objetivo", "Teste de injecao", "--registro", registroPath, "--base", malicioso
  ], env);
  assert.equal(fs.existsSync(marcador), false, "O git NUNCA pode executar comando vindo de --base");
  assert.equal(rCriar.codigo, 1, `Criar com --base malicioso deveria ser recusado: ${rCriar.saida}`);
  assert.match(rCriar.saida, /--base inválida/);
  assert.equal(fs.existsSync(path.join(raiz, ".worktrees", "injecao-20261029")), false, "Nenhuma mesa pode ser criada");

  const rAuditar = rodarMesa(["auditar", "--repo", raiz, "--registro", registroPath, "--base", malicioso], env);
  assert.equal(fs.existsSync(marcador), false, "O git NUNCA pode executar comando vindo de --base");
  assert.equal(rAuditar.codigo, 1, `Auditar com --base malicioso deveria ser recusado: ${rAuditar.saida}`);

  for (const base of ["ext::sh -c touch% /tmp/x/main", "origin/-x", "origin/../main", "-origin/main"]) {
    const r = rodarMesa(["auditar", "--repo", raiz, "--registro", registroPath, "--base", base]);
    assert.equal(r.codigo, 1, `--base '${base}' deveria ser recusada: ${r.saida}`);
  }
});

test("seguranca --base: base bem formada com remoto inexistente nao quebra o fluxo local", () => {
  const { raiz, rodarMesa } = criarAmbienteRepo();
  const r = rodarMesa(["auditar", "--repo", raiz, "--registro", path.join(raiz, "TASK_REGISTRY.md"), "--base", "upstream/release/v2"]);
  assert.equal(r.codigo, 0, `Base bem formada deveria ser aceita: ${r.saida}`);
});

test("desmontar fail-closed: status maior que 1MB (ENOBUFS) nao pode virar 'mesa limpa'", () => {
  const { raiz, rodarMesa } = criarAmbienteRepo();
  const pastaMesa = criarMesa(rodarMesa, raiz, "enobufs-20261029");
  const pasta = path.join(pastaMesa, "muitos");
  fs.mkdirSync(pasta);
  const sufixo = "x".repeat(80);
  for (let i = 0; i < 14000; i++) fs.writeFileSync(path.join(pasta, `arquivo-${i}-${sufixo}.txt`), "");

  const r = rodarMesa(["desmontar", "--repo", raiz, "--branch", "task/enobufs-20261029"]);
  assert.equal(r.codigo, 1, `Mesa suja deveria ser recusada: ${r.saida}`);
  assert.match(r.saida, /14000 arquivo\(s\) não salvos/, "O status grande deve ser lido inteiro, não virar erro");
  assert.equal(fs.existsSync(pastaMesa), true, "Arquivos não salvos NUNCA podem ser apagados");
  assert.equal(fs.readdirSync(pasta).length, 14000);
});

test("desmontar fail-closed: se o git nao consegue verificar a sujeira, recusa", () => {
  const { raiz, rodarMesa } = criarAmbienteRepo();
  const pastaMesa = criarMesa(rodarMesa, raiz, "index-corrompido-20261029");
  fs.writeFileSync(path.join(pastaMesa, "trabalho.txt"), "trabalho nao salvo\n");
  fs.writeFileSync(path.join(raiz, ".git", "worktrees", "index-corrompido-20261029", "index"), "lixo que nao e um index");

  const r = rodarMesa(["desmontar", "--repo", raiz, "--branch", "task/index-corrompido-20261029"]);
  assert.equal(r.codigo, 1, `Deveria recusar quando não dá para verificar: ${r.saida}`);
  assert.match(r.saida, /não consegui verificar/);
  assert.equal(fs.existsSync(path.join(pastaMesa, "trabalho.txt")), true, "Trabalho não salvo NUNCA pode ser apagado");
});

test("desmontar: avisa e recusa quando ha arquivos ignorados importantes (.env.local)", () => {
  const { raiz, rodarMesa } = criarAmbienteRepo();
  fs.appendFileSync(path.join(raiz, ".git", "info", "exclude"), ".env.local\n");
  const pastaMesa = criarMesa(rodarMesa, raiz, "ignorados-20261029");
  fs.writeFileSync(path.join(pastaMesa, ".env.local"), "SEGREDO=so-existe-aqui\n");

  const r = rodarMesa(["desmontar", "--repo", raiz, "--branch", "task/ignorados-20261029"]);
  assert.equal(r.codigo, 1, `Deveria recusar por causa do .env.local: ${r.saida}`);
  assert.match(r.saida, /\.env\.local/);
  assert.doesNotMatch(r.saida, /so-existe-aqui/, "O conteúdo do arquivo ignorado nunca pode aparecer na saída");
  assert.equal(fs.existsSync(path.join(pastaMesa, ".env.local")), true);

  const rConfirmado = rodarMesa(["desmontar", "--repo", raiz, "--branch", "task/ignorados-20261029", "--descartar-ignorados"]);
  assert.equal(rConfirmado.codigo, 0, `Com --descartar-ignorados deveria prosseguir: ${rConfirmado.saida}`);
  assert.equal(fs.existsSync(pastaMesa), false);
});
