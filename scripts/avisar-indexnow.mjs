/**
 * Avisa o Bing (e quem mais usa IndexNow: Yandex, Seznam, Naver) das páginas que MUDARAM no último merge.
 *
 * 🔑 POR QUE ISTO EXISTE (25/10): o ChatGPT e o Copilot buscam pelo índice do Bing. Até aqui cada página nova
 * era enviada à mão no Bing Webmaster depois de publicar, e o que dependia de lembrar ficava para trás.
 * Agora o pós-deploy avisa sozinho. O Google NÃO usa IndexNow (lá continua o "Solicitar indexação").
 *
 * O que entra: .html alterado no commit publicado (squash = 1 commit por PR) que está no sitemap.xml.
 * Mudança que é só o carimbo ?v= (versionar-estaticos mexe em todas as páginas quando o CSS muda) NÃO conta:
 * avisar 50 páginas iguais a cada ajuste de estilo é ruído.
 *
 *   node scripts/avisar-indexnow.mjs            → compara HEAD~1 com HEAD e envia
 *   node scripts/avisar-indexnow.mjs --seco     → só mostra a lista, não envia
 *   node scripts/avisar-indexnow.mjs --seco --de <commit>  → compara <commit> com HEAD
 *
 * A chave é o arquivo <32 hex>.txt da raiz (NÃO apagar: o IndexNow confere que ela está no ar).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const seco = args.includes('--seco');
const de = args.includes('--de') ? args[args.indexOf('--de') + 1] : 'HEAD~1';
const git = (...a) => execFileSync('git', a, { cwd: RAIZ, encoding: 'utf8' });

const chaveArq = readdirSync(RAIZ).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!chaveArq) { console.error('❌ sem o arquivo de chave <32 hex>.txt na raiz'); process.exit(1); }
const chave = readFileSync(join(RAIZ, chaveArq), 'utf8').trim();
if (`${chave}.txt` !== chaveArq) { console.error(`❌ ${chaveArq} não contém a própria chave`); process.exit(1); }

const noSitemap = [...readFileSync(join(RAIZ, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const SITE = new URL(noSitemap[0]).origin;
const urlDe = (arq) => (arq === 'index.html' ? `${SITE}/` : `${SITE}/${arq.replace(/\.html$/, '')}`);

const semCarimbo = (l) => l.replace(/\?v=[a-f0-9]{8}/g, '');
function mudouDeVerdade(arq) {
  const saiu = []; const entrou = [];
  for (const l of git('diff', '-U0', de, 'HEAD', '--', arq).split('\n')) {
    if (l.startsWith('---') || l.startsWith('+++')) continue;
    if (l.startsWith('-')) saiu.push(semCarimbo(l.slice(1)));
    else if (l.startsWith('+')) entrou.push(semCarimbo(l.slice(1)));
  }
  return saiu.sort().join('\n') !== entrou.sort().join('\n');
}

const alterados = git('diff', '--name-only', '--diff-filter=AM', de, 'HEAD').split('\n').filter((f) => /^[^/]+\.html$/.test(f));
const lista = alterados.filter(mudouDeVerdade).map(urlDe).filter((u) => noSitemap.includes(u));
const fora = alterados.length - lista.length;
console.log(`${alterados.length} páginas alteradas no commit; ${lista.length} com mudança de conteúdo e no sitemap${fora ? ` (${fora} ficaram de fora: só carimbo ?v= ou fora do sitemap)` : ''}`);
for (const u of lista) console.log(`  ${u}`);
if (!lista.length) { console.log('✅ nada a avisar'); process.exit(0); }
if (seco) { console.log('(--seco: não enviado)'); process.exit(0); }

// o IndexNow só aceita se a chave estiver no ar; conferir antes dá um erro que se entende
const noAr = await fetch(`${SITE}/${chaveArq}`).then((r) => (r.ok ? r.text() : '')).catch(() => '');
if (noAr.trim() !== chave) { console.error(`❌ ${SITE}/${chaveArq} não devolve a chave; o IndexNow recusaria`); process.exit(1); }

const r = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(SITE).host, key: chave, keyLocation: `${SITE}/${chaveArq}`, urlList: lista }),
});
if (r.status !== 200 && r.status !== 202) { console.error(`❌ IndexNow respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`); process.exit(1); }
console.log(`✅ IndexNow recebeu ${lista.length} páginas (HTTP ${r.status})`);
