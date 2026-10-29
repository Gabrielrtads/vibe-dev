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

test("desmontar --salvar-sujo: grava patch aplicavel com alteracoes, staged e arquivos novos antes de remover", () => {
  const { raiz, rodarMesa } = criarAmbienteRepo();
  const pastaMesa = criarMesa(rodarMesa, raiz, "salvar-sujo-20261029");
  fs.writeFileSync(path.join(pastaMesa, "README.md"), "# Test Repo\nlinha nova que nao pode sumir\n");
  fs.writeFileSync(path.join(pastaMesa, "staged.txt"), "arquivo no index\n");
  execFileSync("git", ["-C", pastaMesa, "add", "staged.txt"]);
  fs.mkdirSync(path.join(pastaMesa, "src"));
  fs.writeFileSync(path.join(pastaMesa, "src", "novo.txt"), "arquivo novo nao rastreado\n");
  fs.writeFileSync(path.join(pastaMesa, "binario.bin"), Buffer.from([0, 1, 2, 255, 0, 7]));

  const salvos = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-dev-salvos-"));
  const r = rodarMesa(["desmontar", "--repo", raiz, "--branch", "task/salvar-sujo-20261029", "--salvar-sujo", salvos]);
  assert.equal(r.codigo, 0, `Desmontar com --salvar-sujo falhou: ${r.saida}`);
  assert.equal(fs.existsSync(pastaMesa), false, "A worktree deve ser removida depois de salvar");

  const patches = fs.readdirSync(salvos).filter((f) => f.endsWith(".patch"));
  assert.equal(patches.length, 1, `Deveria existir exatamente um patch salvo, achei: ${patches}`);
  const patch = path.join(salvos, patches[0]);
  assert.ok(r.saida.includes(patches[0]), "A saída deve dizer onde o patch foi salvo");

  // Prova de que o trabalho é recuperável: aplicar o patch na main (mesmo commit) devolve tudo.
  execFileSync("git", ["-C", raiz, "apply", "--index", patch]);
  const ler = (f) => fs.readFileSync(path.join(raiz, f), "utf8").replace(/\r\n/g, "\n");
  assert.equal(ler("README.md"), "# Test Repo\nlinha nova que nao pode sumir\n");
  assert.equal(ler("staged.txt"), "arquivo no index\n");
  assert.equal(ler(path.join("src", "novo.txt")), "arquivo novo nao rastreado\n");
  assert.deepEqual([...fs.readFileSync(path.join(raiz, "binario.bin"))], [0, 1, 2, 255, 0, 7]);
});

test("desmontar --salvar-sujo: recusa pasta de destino dentro da propria mesa", () => {
  const { raiz, rodarMesa } = criarAmbienteRepo();
  const pastaMesa = criarMesa(rodarMesa, raiz, "salvar-dentro-20261029");
  fs.writeFileSync(path.join(pastaMesa, "README.md"), "alterado\n");
  const r = rodarMesa(["desmontar", "--repo", raiz, "--branch", "task/salvar-dentro-20261029", "--salvar-sujo", path.join(pastaMesa, "backup")]);
  assert.equal(r.codigo, 1, `Deveria recusar salvar dentro da mesa: ${r.saida}`);
  assert.equal(fs.existsSync(pastaMesa), true, "A mesa não pode ser removida");
  assert.equal(fs.readFileSync(path.join(pastaMesa, "README.md"), "utf8"), "alterado\n");
});

test("desmontar --salvar-sujo: se o patch nao cobre tudo que esta sujo, recusa e nao apaga nada", () => {
  const { raiz, rodarMesa } = criarAmbienteRepo();
  const pastaMesa = criarMesa(rodarMesa, raiz, "patch-incompleto-20261029");
  // Arquivo só no index e já apagado do disco ("AD"): o conteúdo staged não cabe num patch do working tree.
  fs.writeFileSync(path.join(pastaMesa, "so-no-index.txt"), "conteudo que so existe no index\n");
  execFileSync("git", ["-C", pastaMesa, "add", "so-no-index.txt"]);
  fs.unlinkSync(path.join(pastaMesa, "so-no-index.txt"));

  const salvos = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-dev-salvos-"));
  const r = rodarMesa(["desmontar", "--repo", raiz, "--branch", "task/patch-incompleto-20261029", "--salvar-sujo", salvos]);
  assert.equal(r.codigo, 1, `Salvamento incompleto deveria recusar: ${r.saida}`);
  assert.match(r.saida, /não consegui salvar/);
  assert.equal(fs.existsSync(pastaMesa), true, "A mesa não pode ser removida");
  assert.deepEqual(fs.readdirSync(salvos), [], "Patch incompleto não pode ficar parecendo backup válido");
  const staged = execFileSync("git", ["-C", pastaMesa, "diff", "--cached", "--name-only"], { encoding: "utf8" }).trim();
  assert.equal(staged, "so-no-index.txt", "O index real da mesa não pode ser alterado");
});

test("desmontar --arquivar: cria tag archive/<data>/<branch> apontando para a ponta da branch", () => {
  const { raiz, rodarMesa } = criarAmbienteRepo();
  const pastaMesa = criarMesa(rodarMesa, raiz, "arquivar-20261029");
  fs.writeFileSync(path.join(pastaMesa, "feature.txt"), "commit que so existe na mesa\n");
  execFileSync("git", ["-C", pastaMesa, "add", "feature.txt"]);
  execFileSync("git", ["-C", pastaMesa, "commit", "-qm", "feature"]);
  const ponta = execFileSync("git", ["-C", pastaMesa, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  const r = rodarMesa(["desmontar", "--repo", raiz, "--branch", "task/arquivar-20261029", "--arquivar"]);
  assert.equal(r.codigo, 0, `Desmontar com --arquivar falhou: ${r.saida}`);
  const tags = execFileSync("git", ["-C", raiz, "tag", "--list", "archive/*/task/arquivar-20261029"], { encoding: "utf8" }).trim();
  assert.match(tags, /^archive\/\d{8}\/task\/arquivar-20261029$/, `Tag de arquivo ausente: '${tags}'`);
  const alvo = execFileSync("git", ["-C", raiz, "rev-parse", `${tags}^{commit}`], { encoding: "utf8" }).trim();
  assert.equal(alvo, ponta);
});
