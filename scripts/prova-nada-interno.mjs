/**
 * Nada que é nota interna, configuração ou ferramenta vai para o ar — só o site.
 *
 * 🟥 POR QUE ISTO EXISTE (24/09, trazida do site da M5): lá, www.m5group.com.br/CLAUDE.md estava aberto para
 * qualquer um. Era a nota de trabalho do primeiro dia do site, e dizia com todas as
 * letras que os 6 depoimentos da home eram "fictícios mas realistas". Junto, o TASKS.md
 * e a pasta .claude/ com as permissões da máquina. O Vercel publica TUDO o que está no
 * repositório e não é escondido, e ninguém tinha escondido nada.
 *
 * 🔑 A regra é a inversa de uma lista de proibidos: todo arquivo do repositório ou é
 * SITE (página, estilo, script de página, imagem, fonte, manifesto, sitemap, txt) ou
 * está no `.vercelignore`. Arquivo novo de qualquer outro tipo reprova até alguém
 * decidir de que lado ele fica — esquecer passou a ser o caminho difícil.
 *
 *   node scripts/prova-nada-interno.mjs                 (confere o repositório)
 *   node scripts/prova-nada-interno.mjs <endereço>      (e confere NO AR que dá 404)
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2];
const SITE = /\.(html|css|js|png|jpe?g|webp|avif|gif|svg|ico|webmanifest|woff2?|ttf|otf|xml|txt|pdf|mp4|webm)$/i;
// o que o Vercel esconde SOZINHO — só o que foi MEDIDO dando 404 no ar em 24/09.
// 🪤 a 1ª versão supunha "tudo que começa com ponto é escondido" e estava ERRADA: a
// pasta .claude/ estava publicada. Com a suposição, tirar /.claude do .vercelignore
// passava calado. Suposição não entra aqui; medição entra.
const ESCONDIDO_PELO_VERCEL = new Set(['vercel.json', '.gitignore', '.vercelignore']);
const erros = [];

// o .vercelignore, só nas duas formas que esta prova sabe ler; outra forma é erro,
// para a prova nunca "entender errado" em silêncio
const regras = [];
const IGNORE = join(RAIZ, '.vercelignore');
if (!existsSync(IGNORE)) erros.push('não existe .vercelignore — o Vercel publica o repositório inteiro');
else {
  for (const linha of readFileSync(IGNORE, 'utf8').split(/\r?\n/).map((l) => l.trim())) {
    if (!linha || linha.startsWith('#')) continue;
    if (/^\/[^*?[\]!]+$/.test(linha)) regras.push({ linha, casa: (f) => f === linha.slice(1) || f.startsWith(`${linha.slice(1)}/`) });
    else if (/^\*\.[a-z0-9]+$/i.test(linha)) regras.push({ linha, casa: (f) => f.toLowerCase().endsWith(linha.slice(1).toLowerCase()) });
    else erros.push(`.vercelignore: "${linha}" é uma forma que a prova não sabe ler — use "/caminho" ou "*.ext"`);
  }
}
const ignorado = (f) => regras.some((r) => r.casa(f));

const git = spawnSync('git', ['ls-files', '-z'], { cwd: RAIZ, encoding: 'utf8' });
if (git.status !== 0) { console.log('❌ não consegui listar os arquivos do repositório com o git'); process.exit(1); }
const arquivos = git.stdout.split('\0').filter(Boolean);
if (arquivos.length < 10) erros.push(`só ${arquivos.length} arquivos no repositório — a prova não está olhando o site`);

const escondidos = [];
for (const f of arquivos) {
  if (ignorado(f)) { escondidos.push(f); continue; }
  if (ESCONDIDO_PELO_VERCEL.has(f)) continue;
  if (!SITE.test(f)) erros.push(`${f}: vai para o ar e não é site — ponha no .vercelignore (ou, se for site, na lista SITE desta prova)`);
}
// uma página nunca pode ser escondida por engano
for (const f of escondidos) if (/\.html$/i.test(f)) erros.push(`${f}: é página e está no .vercelignore — sairia do ar`);

// no ar: o escondido responde 404, e o site responde 200 (senão "tudo 404" passaria)
if (BASE) {
  const casa = await fetch(BASE + '/', { redirect: 'manual' });
  if (casa.status !== 200) erros.push(`${BASE}/ respondeu ${casa.status} — sem o site no ar, os 404 abaixo não provam nada`);
  const conferir = escondidos;
  for (const f of conferir) {
    const r = await fetch(`${BASE}/${f.split('/').map(encodeURIComponent).join('/')}`, { redirect: 'manual' });
    if (r.status !== 404) erros.push(`NO AR: ${BASE}/${f} respondeu ${r.status} — deveria ser 404`);
  }
  console.log(`no ar: ${conferir.length} arquivos internos conferidos em ${BASE}`);
}

console.log(`${arquivos.length} arquivos no repositório · ${escondidos.length} fora do ar pelo .vercelignore`);
if (erros.length) {
  console.log(`❌ ${erros.length} problemas:`);
  erros.forEach((e) => console.log('   ', e));
  process.exit(1);
}
console.log('✅ só o site vai para o ar: nenhuma nota interna, configuração ou ferramenta publicada');
