/**
 * O carimbador de versão funciona nos dois caminhos que nunca tinham sido exercidos:
 * uma url() dentro de um .css NOVO (este site ainda não tem nenhum), e uma página
 * DENTRO DE PASTA.
 *
 * 🪤 POR QUE ISTO EXISTE (24/09): o laço dos .css usava duas listas declaradas com
 * `const` LINHAS ABAIXO dele. Em JavaScript isso não é "lista vazia", é erro. Como este
 * site não tem .css próprio, o laço nunca chegou a usá-las e todas as provas passavam.
 * No primeiro .css com url(), `node scripts/versionar-estaticos.mjs` QUEBRARIA em vez
 * de carimbar. O mesmo defeito foi achado no site da M5 (#27 de lá). Régua que só roda
 * no estado de hoje não prova o caminho de amanhã: esta prova cria o estado de amanhã
 * numa cópia e roda o script.
 *
 * Não mexe no repositório: copia o site para uma pasta temporária e sabota a cópia.
 *   node scripts/prova-carimbo-css.mjs
 */
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORA = new Set(['node_modules', '.git', '.vercel', '.claude']);
const erros = [];

const rodar = (dir, ...args) => spawnSync(process.execPath, [join(dir, 'scripts/versionar-estaticos.mjs'), ...args], { encoding: 'utf8' });
const copia = () => {
  const dir = mkdtempSync(join(tmpdir(), 'prova-carimbo-'));
  cpSync(RAIZ, dir, { recursive: true, filter: (src) => !FORA.has(src.split(/[\/]/).pop()) });
  return dir;
};

// 0. o estado de hoje: conferir passa
{
  const r = rodar(RAIZ, '--conferir');
  if (r.status !== 0) erros.push(`o site de hoje não passa no --conferir:\n${r.stdout}${r.stderr}`);
}

// 1. .css novo com url(): --conferir tem que REPROVAR com mensagem (não com erro de JS),
//    carimbar tem que carimbar, e depois --conferir tem que passar
{
  const dir = copia();
  try {
    writeFileSync(join(dir, 'prova.css'), '.prova-carimbo{background:url(favicon-32.png)}\n');
    const c1 = rodar(dir, '--conferir');
    if (c1.status !== 1 || /Error/.test(c1.stderr) || !/prova\.css: url\(\) sem carimbo/.test(c1.stdout)) {
      erros.push(`.css novo: o --conferir devia reprovar com "prova.css: url() sem carimbo" e saiu ${c1.status}:\n${c1.stdout}${c1.stderr.slice(0, 300)}`);
    }
    const c2 = rodar(dir);
    if (c2.status !== 0) erros.push(`.css novo: carimbar QUEBROU (saída ${c2.status}):\n${c2.stderr.slice(0, 300)}`);
    if (!/url\(favicon-32\.png\?v=[a-f0-9]{8}\)/.test(readFileSync(join(dir, 'prova.css'), 'utf8'))) {
      erros.push('.css novo: depois de carimbar, a url(favicon-32.png) continua sem ?v=');
    }
    const c3 = rodar(dir, '--conferir');
    if (c3.status !== 0) erros.push(`.css novo: depois de carimbar, o --conferir ainda reprova:\n${c3.stdout}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// 2. página nova dentro de pasta: tem que ser carimbada também
{
  const dir = copia();
  try {
    mkdirSync(join(dir, 'campanha'), { recursive: true });
    writeFileSync(join(dir, 'campanha', 'prova.html'), '<link rel="icon" href="/favicon.svg"><img src="/favicon-32.png">');
    const c1 = rodar(dir, '--conferir');
    if (c1.status !== 1 || !/campanha\/prova\.html/.test(c1.stdout)) {
      erros.push(`página em pasta: o --conferir devia apontar campanha/prova.html e saiu ${c1.status}:\n${c1.stdout}${c1.stderr.slice(0, 300)}`);
    }
    rodar(dir);
    const html = readFileSync(join(dir, 'campanha', 'prova.html'), 'utf8');
    if (!/\/favicon\.svg\?v=[a-f0-9]{8}/.test(html) || !/\/favicon-32\.png\?v=[a-f0-9]{8}/.test(html)) {
      erros.push(`página em pasta: depois de carimbar, ficou sem ?v=: ${html}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (erros.length) {
  console.log(`❌ ${erros.length} problemas:`);
  erros.forEach((e) => console.log('   ', e));
  process.exit(1);
}
console.log('✅ carimbador: .css novo com url() e página em pasta, os dois carimbados e conferidos');
