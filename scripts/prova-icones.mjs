/**
 * Prova dos ícones da marca no site.
 *
 * 🪤 Existe porque o Google mostrava um ícone que não é a marca. Na M5 o dono viu
 * um quadrado com "M5". No Regula o caso é outro: o Google mostrava um GLOBO CINZA
 * varredura achou mais: `/dashboard` servia um ícone de prancheta laranja de OUTRA
 * marca, e não havia ícone nenhum para iPhone e Android.
 *
 * O que ela garante:
 *   1. TODA página declara: favicon svg + png, apple-touch-icon, manifest e theme-color
 *   2. nenhuma página traz ícone embutido em data: (foi assim que o intruso entrou)
 *   3. os arquivos existem no disco e não estão vazios
 *   4. o favicon.svg é o mostrador encorpado, não texto — letra some a 16px
 *   5. o manifest aponta para ícones que existem, e fala da Regula360
 *
 * Uso: node scripts/prova-icones.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGINAS = readdirSync(RAIZ).filter((f) => f.endsWith('.html'));
const ARQUIVOS = ['favicon.svg', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png',
  'icon-192.png', 'icon-512.png', 'site.webmanifest'];

const erros = [];

for (const a of ARQUIVOS) {
  const caminho = join(RAIZ, a);
  if (!existsSync(caminho)) erros.push(`falta o arquivo ${a}`);
  else if (statSync(caminho).size < 200) erros.push(`${a} está vazio ou truncado`);
}

const EXIGIDOS = [
  // a ordem dos atributos varia entre os dois sites: aceita href antes ou depois do type
  [/rel="icon"[^>]*href="\/?favicon\.svg(?:\?v=[a-f0-9]+)?"[^>]*type="image\/svg\+xml"|rel="icon"[^>]*type="image\/svg\+xml"[^>]*href="\/?favicon\.svg(?:\?v=[a-f0-9]+)?"/, 'favicon.svg'],
  [/rel="icon"[^>]*href="\/?favicon-32\.png(?:\?v=[a-f0-9]+)?"/, 'favicon-32.png'],
  [/rel="apple-touch-icon"[^>]*href="\/?apple-touch-icon\.png(?:\?v=[a-f0-9]+)?"/, 'ícone do iPhone'],
  [/rel="manifest"[^>]*href="\/?site\.webmanifest(?:\?v=[a-f0-9]+)?"/, 'manifest'],
  [/name="theme-color"/, 'theme-color'],
];

for (const p of PAGINAS) {
  const html = readFileSync(join(RAIZ, p), 'utf8');
  for (const [re, oque] of EXIGIDOS) if (!re.test(html)) erros.push(`${p}: sem ${oque}`);
  // 🪤 ícone embutido foi exatamente como a prancheta laranja entrou
  if (/rel="[^"]*icon[^"]*"[^>]*href="data:/i.test(html)) erros.push(`${p}: ícone EMBUTIDO em data: — de onde veio?`);
  const svgs = (html.match(/href="\/?favicon\.svg(?:\?v=[a-f0-9]+)?"/g) || []).length;
  if (svgs > 1) erros.push(`${p}: declara favicon.svg ${svgs} vezes`);
}

// a imagem do link (og:image) tem que existir e ser a versão com a marca
for (const p of PAGINAS.filter((f) => !['privacidade.html'].includes(f))) {
  const html = readFileSync(join(RAIZ, p), 'utf8');
  const m = html.match(/property="og:image"[^>]*content="([^"]+)"/);
  if (!m) { erros.push(`${p}: sem og:image — o link chega sem imagem no WhatsApp`); continue; }
  const arq = m[1].split('?')[0].replace(/^https?:\/\/[^/]+\//, '');
  if (!existsSync(join(RAIZ, arq))) erros.push(`${p}: og:image aponta para ${arq}, que não existe`);
  if (!/\?v=[a-f0-9]+/.test(m[1])) erros.push(`${p}: og:image sem versão no endereço — WhatsApp guarda a prévia por URL`);
}

// o favicon tem que ser o símbolo, não texto
const svg = readFileSync(join(RAIZ, 'favicon.svg'), 'utf8');
if (/<text/i.test(svg)) erros.push('favicon.svg usa <text> — letra vira mancha a 16px; o símbolo é que aguenta');
if (!/<path[^>]*stroke=/.test(svg)) erros.push('favicon.svg sem o arco do mostrador');
if (!/<line[^>]*stroke=/.test(svg)) erros.push('favicon.svg sem o ponteiro em terracota');
// 🪤 as cores são as que o SITE desenha, não as do PNG do manual (#1F2937 / #C0622D).
// São duas paletas para a mesma marca; o ícone vive ao lado do site, então segue o site.
// 🪤 UMA SABOTAGEM ME ENSINOU ISTO (23/09): eu conferia a cor em QUALQUER lugar do
// arquivo, e o comentário do topo cita as duas cores. Trocar a cor do traço e deixar o
// comentário intacto passava batido — a régua lia a documentação e dava por provado.
// Agora só vale cor que esteja DESENHANDO, em stroke= ou fill=, fora de comentário.
const semComentario = svg.replace(/<!--[\s\S]*?-->/g, '');
const pintadas = [...semComentario.matchAll(/(?:stroke|fill)="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toUpperCase());
for (const cor of ['#34383D', '#C0653A']) {
  if (!pintadas.includes(cor)) erros.push(`favicon.svg não DESENHA nada com ${cor}, que é a cor que o site usa (achei: ${pintadas.join(', ') || 'nada'})`);
}
// o traço precisa ter CORPO: foi todo o motivo de existir uma arte separada para o pequeno
const larguras = [...semComentario.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
if (!larguras.length) erros.push('favicon.svg sem nenhum stroke-width');
else if (Math.min(...larguras) < 6) {
  erros.push(`favicon.svg com traço ${Math.min(...larguras)} num viewBox de 60 — fino demais, volta a sumir a 16px`);
}

// manifest coerente
try {
  const m = JSON.parse(readFileSync(join(RAIZ, 'site.webmanifest'), 'utf8'));
  if (!/Regula/i.test(m.name || '')) erros.push('manifest não fala da Regula360');
  for (const i of m.icons || []) {
    const arq = join(RAIZ, i.src.replace(/^\//, ''));
    if (!existsSync(arq)) erros.push(`manifest aponta para ${i.src}, que não existe`);
  }
} catch (e) {
  erros.push(`site.webmanifest inválido: ${e.message.slice(0, 60)}`);
}

console.log(`${PAGINAS.length} páginas · ${ARQUIVOS.length} arquivos de ícone`);
erros.forEach((e) => console.log('❌', e));
if (!erros.length) console.log('✅ marca em dia: navegador, iPhone, Android e Google');
process.exit(erros.length ? 1 : 0);
