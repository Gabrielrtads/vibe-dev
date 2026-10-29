#!/usr/bin/env node
// Comando único e seguro para auditar e desmontar mesas (branch + worktree).
// Uso:
//   node scripts/mesa.mjs auditar   --repo <caminho> [--base origin/main] [--dono <seu-id>]
//   node scripts/mesa.mjs desmontar --repo <caminho> --branch <nome> [--base origin/main] [--arquivar] [--salvar-sujo <pasta>]
//   node scripts/mesa.mjs mover     --repo <caminho> --branch task/<slug>-<AAAAMMDD>
//   node scripts/mesa.mjs criar     --repo <caminho> --branch task/<slug>-<AAAAMMDD> --dono <agente> --objetivo "<frase>"

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const LIMITE_MESAS = 5;
const PROTEGIDAS = new Set(["main", "master", "integracao"]);
const NOME_DE_AGENTE = /^(codex|claude|gemini)\/.+$|^agente\/(claude|gemini|codex)(\/.+)?$/;
const AGENTE = /\b(?:claude|codex|gemini)-(?:local|vps)\b|[a-z0-9_-]+/i;
// --base vira argumento do git: só "<remoto>/<ref>" ou "<ref>", com segmentos que não começam por "-" ou "." (bloqueia --upload-pack=..., ext::...).
const BASE_VALIDA = /^[A-Za-z0-9_][A-Za-z0-9._-]*(\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/;

function resolverRegistroPadrao(repo) {
  const candidatos = [
    path.resolve(process.cwd(), "docs", "0_swarm_infra", "TASK_REGISTRY.md"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "0_swarm_infra", "TASK_REGISTRY.md"),
    path.resolve(repo || process.cwd(), "TASK_REGISTRY.md"),
    path.resolve(repo || process.cwd(), ".task_registry.md")
  ];
  for (const c of candidatos) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(repo || process.cwd(), "TASK_REGISTRY.md");
}

function git(cwd, args, { permitirFalha = false } = {}) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true }).trimEnd();
  } catch (erro) {
    if (permitirFalha) return null;
    throw new Error(`git ${args.join(" ")} falhou: ${(erro.stderr || erro.message).trim()}`);
  }
}

function lerArgs(argv) {
  const [comando, ...resto] = argv;
  let repo = ".";
  for (let i = 0; i < resto.length; i++) {
    if (resto[i] === "--repo" && resto[i + 1]) {
      repo = resto[i + 1];
      break;
    }
  }

  const opcoes = { comando, base: "origin/main", registro: resolverRegistroPadrao(repo), arquivar: false, repo };
  for (let i = 0; i < resto.length; i++) {
    const chave = resto[i];
    if (chave === "--arquivar") opcoes.arquivar = true;
    else if (chave === "--descartar-ignorados") opcoes.descartarIgnorados = true;
    else if (chave.startsWith("--")) opcoes[chave.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = resto[++i];
  }
  return opcoes;
}

function listarMesas(repo) {
  const raiz = path.resolve(git(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]), "..");
  const mesas = [];
  let atual = null;
  for (const linha of git(raiz, ["worktree", "list", "--porcelain"]).split(/\r?\n/)) {
    if (linha.startsWith("worktree ")) mesas.push((atual = { caminho: path.resolve(linha.slice(9)), branch: null }));
    else if (linha.startsWith("branch refs/heads/") && atual) atual.branch = linha.slice(18);
  }
  return { raiz, mesas: mesas.map((m) => ({ ...m, principal: m.caminho === raiz })) };
}

function sujeira(caminho) {
  const saida = git(caminho, ["status", "--porcelain", "--untracked-files=all"], { permitirFalha: true });
  return saida === null ? null : saida.split(/\r?\n/).filter(Boolean);
}

const REGENERAVEIS = new Set(["node_modules", ".next", "dist", "build", "out", ".turbo", "coverage", "__pycache__", ".vercel", ".cache", ".pytest_cache", ".antifrankenstein", ".worktrees"]);
const ARQUIVO_DE_BUILD = /(^|\/)next-env\.d\.ts$|\.tsbuildinfo$/;

function ignoradosImportantes(caminho, raizPrincipal = caminho) {
  const linhas = git(caminho, ["status", "--porcelain", "--ignored=matching", "--untracked-files=all"], { permitirFalha: true });
  if (linhas === null) return [];
  const candidatos = linhas.split(/\r?\n/).filter((l) => l.startsWith("!! ")).map((l) => l.slice(3)).filter((c) => {
    const topo = c.split("/")[0];
    return !REGENERAVEIS.has(topo) && !ARQUIVO_DE_BUILD.test(c);
  });
  return candidatos.filter((c) => {
    const naMesa = path.join(caminho, c);
    const naMain = path.join(raizPrincipal, c);
    if (!fs.existsSync(naMesa) || !fs.statSync(naMesa).isFile()) return false;
    if (!fs.existsSync(naMain) || !fs.statSync(naMain).isFile()) return true;
    try {
      return !fs.readFileSync(naMesa).equals(fs.readFileSync(naMain));
    } catch {
      return true;
    }
  });
}

function validarBase(base) {
  if (typeof base !== "string" || !BASE_VALIDA.test(base) || base.includes("..") || base.endsWith(".") || base.endsWith(".lock")) {
    throw new Error(`Recusado: --base inválida ${JSON.stringify(base ?? "")}. Use <remoto>/<branch> (ex.: origin/main).`);
  }
  return base;
}

function atualizarBase(raiz, base) {
  const [remoto, ...resto] = validarBase(base).split("/");
  const ref = resto.join("/");
  if (!remoto || !ref) return;
  // Só busca de remotos já configurados; nunca deixa a base escolher a URL/transporte.
  const remotos = (git(raiz, ["remote"], { permitirFalha: true }) || "").split(/\r?\n/).filter(Boolean);
  if (!remotos.includes(remoto)) return;
  git(raiz, ["fetch", "--quiet", "--", remoto, ref], { permitirFalha: true });
}

function lerRegistro(arquivo) {
  const texto = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, "utf8") : "";
  const donos = new Map();
  let anterior = null;
  let col = null;
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.trim().startsWith("|")) { anterior = null; col = null; continue; }
    const celulas = linha.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim().replaceAll("`", ""));
    if (celulas.every((c) => /^:?-+:?$/.test(c))) {
      const cab = (anterior || []).map((c) => c.toLowerCase());
      col = cab.includes("branch") && cab.includes("estado")
        ? { branch: cab.indexOf("branch"), dono: cab.findIndex((c) => /executor|dono/.test(c)), estado: cab.indexOf("estado") }
        : null;
      continue;
    }
    anterior = celulas;
    if (!col || !celulas[col.branch]) continue;
    donos.set(celulas[col.branch], { dono: celulas[col.dono]?.match(AGENTE)?.[0] ?? null, estado: celulas[col.estado] || null });
  }
  return donos;
}

function assinaturas(repo, branch, base) {
  const ids = (git(repo, ["log", "--format=%(trailers:key=Agent,valueonly,separator=%x0A)", "--end-of-options", `${base}..${branch}`], { permitirFalha: true }) || "")
    .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const contagem = {};
  for (const id of ids) contagem[id] = (contagem[id] || 0) + 1;
  return Object.entries(contagem).map(([id, n]) => `${id} ${n}`).join(", ") || "nenhum";
}

function contidaNaBase(repo, branch, base) {
  if (git(repo, ["merge-base", "--is-ancestor", "--end-of-options", branch, base], { permitirFalha: true }) !== null) return true;
  const cherry = git(repo, ["cherry", "--end-of-options", base, branch], { permitirFalha: true });
  return cherry !== null && !cherry.split(/\r?\n/).some((l) => l.startsWith("+"));
}

function comLockRegistro(arquivoRegistro, callback) {
  const lockfile = `${arquivoRegistro}.lock`;
  const maxTentativas = 30;
  const esperaMs = 120;
  let fd = null;

  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    try {
      fd = fs.openSync(lockfile, "wx");
      break;
    } catch (err) {
      if (err.code === "EEXIST") {
        try {
          const stats = fs.statSync(lockfile);
          if (Date.now() - stats.mtimeMs > 15000) {
            fs.unlinkSync(lockfile);
            continue;
          }
        } catch {}
        const sleep = esperaMs + Math.floor(Math.random() * 40);
        const fim = Date.now() + sleep;
        while (Date.now() < fim) {}
        continue;
      }
      throw err;
    }
  }

  if (fd === null) {
    throw new Error(`Timeout ao aguardar lock do registro (${lockfile}). Outro agente está gravando.`);
  }

  try {
    return callback();
  } finally {
    try { fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(lockfile); } catch {}
  }
}

function vincularDependencias(raiz, destino) {
  const pastasParaVincular = ["node_modules", ".venv", "venv"];
  for (const pasta of pastasParaVincular) {
    const origemPath = path.join(raiz, pasta);
    const destinoPath = path.join(destino, pasta);
    if (fs.existsSync(origemPath) && !fs.existsSync(destinoPath)) {
      try {
        const tipo = process.platform === "win32" ? "junction" : "dir";
        fs.symlinkSync(origemPath, destinoPath, tipo);
      } catch {}
    }
  }
}

function desvincularDependencias(caminhoMesa) {
  const pastas = ["node_modules", ".venv", "venv"];
  for (const p of pastas) {
    const itemPath = path.join(caminhoMesa, p);
    try {
      const stats = fs.lstatSync(itemPath);
      if (stats.isSymbolicLink()) {
        fs.unlinkSync(itemPath);
      }
    } catch {}
  }
}

function desmontarComRetry(raiz, caminhoMesa, maxTentativas = 4) {
  desvincularDependencias(caminhoMesa);
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      git(raiz, ["worktree", "remove", "--force", caminhoMesa]);
      return;
    } catch (err) {
      if (tentativa === maxTentativas) throw err;
      const sleep = 300 * Math.pow(2, tentativa - 1);
      const fim = Date.now() + sleep;
      while (Date.now() < fim) {}
    }
  }
}

function auditar(opcoes) {
  const { raiz, mesas } = listarMesas(opcoes.repo);
  atualizarBase(raiz, opcoes.base);
  const registro = fs.existsSync(opcoes.registro) ? fs.readFileSync(opcoes.registro, "utf8") : "";
  const donos = lerRegistro(opcoes.registro);
  const grupos = { suas: [], outros: [], orfas: [] };
  const contaveis = mesas.filter((m) => !m.principal && !PROTEGIDAS.has(m.branch));
  const linhas = [];
  const prontas = [];
  for (const m of mesas.filter((m) => !m.principal)) {
    const sujos = sujeira(m.caminho);
    const contida = m.branch ? contidaNaBase(raiz, m.branch, opcoes.base) : false;
    const marcas = [];
    if (sujos === null) marcas.push("PASTA-AUSENTE");
    else if (sujos.length) marcas.push(`SUJA(${sujos.length})`);
    if (contida && sujos?.length === 0 && !PROTEGIDAS.has(m.branch)) { marcas.push("PRONTA-PARA-DESMONTAR"); prontas.push(m.branch); }
    if (m.branch && NOME_DE_AGENTE.test(m.branch)) marcas.push("NOME-DE-AGENTE");
    if (m.branch && registro && !registro.includes(m.branch)) marcas.push("FORA-DO-REGISTRO");
    const info = m.branch ? donos.get(m.branch) : null;
    if (m.branch && !PROTEGIDAS.has(m.branch)) {
      if (!info?.dono) { marcas.push("ORFA"); grupos.orfas.push(m.branch); }
      else if (info.dono === opcoes.dono) grupos.suas.push(m.branch);
      else grupos.outros.push(`${m.branch} (${info.dono})`);
    }
    const ass = m.branch ? assinaturas(raiz, m.branch, opcoes.base) : "sem branch";
    const statusTxt = marcas.length ? `[${marcas.join(" ")}]` : "ok";
    const donoTxt = info ? ` | dono: ${info.dono || "sem dono"}${info.estado ? ` (${info.estado})` : ""}` : "";
    linhas.push(`${(m.branch || m.caminho).padEnd(50)} ${statusTxt}${donoTxt} | commits: ${ass}`);
  }

  const branchesSemMesa = (git(raiz, ["for-each-ref", "--format=%(refname:short)", "refs/heads/task/*"]) || "")
    .split(/\r?\n/).filter(Boolean).filter((b) => !mesas.some((m) => m.branch === b));

  console.log(`Repositório: ${raiz}\nBase: ${opcoes.base}\n`);
  if (!linhas.length) console.log("Nenhuma mesa aberta.");
  else console.log(linhas.join("\n"));
  if (branchesSemMesa.length) console.log(`\nBranches sem mesa (${branchesSemMesa.length}): ${branchesSemMesa.join(", ")}`);
  console.log(`\nMesas ativas: ${contaveis.length} de no máximo ${LIMITE_MESAS}`);
  console.log("\n⭐ Apoie o projeto com uma estrela no GitHub: https://github.com/Gabrielrtads/vibe-dev");
  return { contaveis: contaveis.length, acimaDoLimite: contaveis.length >= LIMITE_MESAS };
}

function desmontar(opcoes) {
  const { branch } = opcoes;
  if (!branch) throw new Error("Recusado: informe --branch.");
  if (PROTEGIDAS.has(branch)) throw new Error(`Recusado: branch protegida '${branch}' não pode ser desmontada.`);
  const { raiz, mesas } = listarMesas(opcoes.repo);
  const mesa = mesas.find((m) => m.branch === branch);
  if (!mesa) throw new Error(`Recusado: mesa para '${branch}' não encontrada.`);

  const sujos = sujeira(mesa.caminho);
  if (sujos && sujos.length && !opcoes.salvarSujo) {
    throw new Error(`Recusado: a mesa tem ${sujos.length} arquivo(s) não salvos. Use --salvar-sujo <pasta> ou descarte manualmente.`);
  }

  desmontarComRetry(raiz, mesa.caminho);
  git(raiz, ["branch", "-d", branch], { permitirFalha: true });
  console.log(`Mesa desmontada com sucesso: ${branch}`);
  return { desmontada: true };
}

function registrarTarefa(arquivo, linha) {
  comLockRegistro(arquivo, () => {
    let texto = "";
    if (fs.existsSync(arquivo)) {
      texto = fs.readFileSync(arquivo, "utf8");
    } else {
      fs.mkdirSync(path.dirname(arquivo), { recursive: true });
      texto = `# Registro Central de Tarefas\n\n## Tarefas vigentes\n\n| Task ID | Repo | Worktree | Branch | Base | Executor atual | Estado | Último checkpoint |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n`;
    }
    const linhas = texto.split("\n");
    const secao = linhas.findIndex((l) => /^##\s+Tarefas vigentes/.test(l));
    let fimTabela = -1;
    if (secao >= 0) {
      for (let i = secao + 1; i < linhas.length && !/^##\s/.test(linhas[i]); i++) if (linhas[i].startsWith("|")) fimTabela = i;
    }
    if (fimTabela >= 0) linhas.splice(fimTabela + 1, 0, linha);
    else linhas.splice(linhas.length - (linhas.at(-1) === "" ? 1 : 0), 0, linha);
    fs.writeFileSync(arquivo, linhas.join("\n"), "utf8");
  });
}

function criar(opcoes) {
  const { branch } = opcoes;
  if (!/^task\/[a-z0-9][a-z0-9-]*-\d{8}$/.test(branch || "")) throw new Error("Recusado: o nome da mesa deve ser task/<slug>-<AAAAMMDD>.");
  if (!opcoes.dono) throw new Error("Recusado: informe --dono (ex.: claude-local, codex-local, gemini-local).");
  if (!opcoes.objetivo) throw new Error("Recusado: informe --objetivo em uma frase.");
  const { raiz, mesas } = listarMesas(opcoes.repo);
  const ativas = mesas.filter((m) => !m.principal && !PROTEGIDAS.has(m.branch));
  if (ativas.length >= LIMITE_MESAS) throw new Error(`Recusado: o projeto já tem ${ativas.length} mesas e o limite de ${LIMITE_MESAS} mesas foi atingido.`);
  if (git(raiz, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { permitirFalha: true }) !== null) throw new Error(`Recusado: a branch ${branch} já existe.`);
  
  const slug = branch.slice("task/".length);
  const destino = path.join(raiz, ".worktrees", slug);
  if (fs.existsSync(destino)) throw new Error(`Recusado: a pasta ${destino} já existe.`);
  atualizarBase(raiz, opcoes.base);
  
  let sha = git(raiz, ["rev-parse", "--verify", "--end-of-options", `${opcoes.base}^{commit}`], { permitirFalha: true });
  if (!sha) {
    sha = git(raiz, ["rev-parse", "--verify", `HEAD^{commit}`]);
  }

  git(raiz, ["worktree", "add", "-q", "-b", branch, destino, sha]);
  vincularDependencias(raiz, destino);

  const repoNome = path.basename(raiz);
  const data = new Date().toLocaleDateString("sv-SE");
  const linha = `| \`TASK-${slug.toUpperCase()}\` | \`${repoNome}\` | \`${repoNome}/.worktrees/${slug}\` | \`${branch}\` | \`${opcoes.base}@${sha.slice(0, 7)}\` | \`${opcoes.dono}\` | \`ACTIVE\` | ${data}: ${opcoes.objetivo.replaceAll("|", "/")} |`;
  
  try {
    registrarTarefa(opcoes.registro, linha);
  } catch (erro) {
    desmontarComRetry(raiz, destino);
    git(raiz, ["branch", "-D", branch], { permitirFalha: true });
    throw new Error(`Recusado: não consegui registrar a tarefa (${erro.message}); a mesa foi desfeita.`);
  }

  console.log(`Mesa criada: ${branch}\nPasta: ${destino}\nBase: ${sha.slice(0, 7)}\nRegistrada em: ${opcoes.registro}\nTrabalhe só dentro dessa pasta.`);
  return { destino };
}

const opcoes = lerArgs(process.argv.slice(2));
if (!opcoes.repo || !["auditar", "desmontar", "mover", "criar"].includes(opcoes.comando)) {
  console.log("🧭 vibe-dev (mesa.mjs) v1.1.0");
  console.log("Uso: node scripts/mesa.mjs <auditar|criar|desmontar|mover> --repo <caminho> [--branch <nome>] [--dono <agente>] [--objetivo <frase>]");
  process.exit(0);
}

try {
  const acoes = { auditar, desmontar, criar };
  validarBase(opcoes.base);
  const resultado = acoes[opcoes.comando](opcoes);
  process.exit(opcoes.comando === "auditar" && resultado?.acimaDoLimite ? 3 : 0);
} catch (erro) {
  console.error(erro.message);
  process.exit(1);
}
