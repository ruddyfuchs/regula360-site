/**
 * Monta uma página por TIPO DE IMÓVEL ("Documentos obrigatórios do condomínio…") a partir de conteudo-tipos/*.md.
 *
 * 🔑 POR QUE ISTO EXISTE (23/10): "documentos obrigatórios condomínio" é busca comum, e a resposta já existe na
 * ferramenta "O que meu imóvel precisa ter" (/api/public/regula/calculadora/documentos?tipo_imovel=…). A LISTA vem
 * da plataforma, guardada em scripts/dados-tipos.json; o texto é escrito à mão no .md. Cada documento da lista leva
 * à página dele (conteudo-documentos) quando existe, senão à calculadora já preenchida.
 *
 *   node scripts/gerar-tipos.mjs --atualizar   → relê a plataforma, grava o .json e gera
 *   node scripts/gerar-tipos.mjs               → gera a partir do .json
 *   node scripts/gerar-tipos.mjs --conferir    → só acusa página desatualizada (sai 1)
 *   node scripts/gerar-tipos.mjs --ao-vivo [base] → acusa lista diferente da plataforma (sai 1)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.regula360.com.br';
const DADOS = join(RAIZ, 'scripts', 'dados-tipos.json');
const args = process.argv.slice(2);
const conferir = args.includes('--conferir'), atualizar = args.includes('--atualizar'), aoVivo = args.includes('--ao-vivo');
const API = (args.find((a) => /^https?:\/\//.test(a)) || SITE).replace(/\/$/, '');
const fora = [];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function lerCab(txt, nome, obrig) {
  const t = txt.split('\r\n').join('\n');
  const corte = t.indexOf('\n---\n');
  if (corte < 0) throw new Error(`${nome}: falta a linha ---`);
  const cab = {};
  for (const l of t.slice(0, corte).split('\n')) { const i = l.indexOf(':'); if (i > 0) cab[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
  for (const k of obrig) if (!cab[k]) throw new Error(`${nome}: falta "${k}"`);
  return { ...cab, corpo: t.slice(corte + 5).trim() };
}
const tipos = readdirSync(join(RAIZ, 'conteudo-tipos')).filter((f) => f.endsWith('.md'))
  .map((f) => lerCab(readFileSync(join(RAIZ, 'conteudo-tipos', f), 'utf8'), f, ['tipo_imovel', 'slug', 'nome', 'titulo', 'descricao', 'resumo', 'chamada']));
for (const t of tipos) {
  const tSeo = `${t.titulo_seo || t.titulo} | Regula360`;
  if ([...tSeo].length > 60) throw new Error(`${t.slug}: título do Google com ${[...tSeo].length} caracteres`);
  if ([...t.descricao].length > 160) throw new Error(`${t.slug}: descrição com ${[...t.descricao].length} caracteres`);
  if (/\b\d+ (dias|meses|anos)\b/.test(t.corpo)) throw new Error(`${t.slug}: prazo escrito à mão no texto; a lista já mostra a validade`);
}
// páginas por documento: codigo → slug e nome curto
const DOCS = new Map(readdirSync(join(RAIZ, 'conteudo-documentos')).filter((f) => f.endsWith('.md'))
  .map((f) => lerCab(readFileSync(join(RAIZ, 'conteudo-documentos', f), 'utf8'), f, ['codigo', 'slug', 'nome'])).map((d) => [d.codigo, d]));

const CAMPOS = ['codigo', 'documento', 'vigencia_meses', 'nao_vence', 'base_legal'];
async function listaAoVivo(tipo) {
  const r = await fetch(`${API}/api/public/regula/calculadora/documentos?tipo_imovel=${tipo}&uf=SP`);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.data?.documentos) throw new Error(`plataforma não respondeu a lista de ${tipo} (HTTP ${r.status})`);
  return j.data.documentos.map((d) => Object.fromEntries(CAMPOS.map((k) => [k, d[k] ?? null])));
}
let dados = existsSync(DADOS) ? JSON.parse(readFileSync(DADOS, 'utf8')) : { listas: {} };
if (atualizar || aoVivo) {
  const vivo = {};
  for (const t of tipos) vivo[t.tipo_imovel] = await listaAoVivo(t.tipo_imovel);
  if (aoVivo) {
    const dif = tipos.map((t) => t.tipo_imovel).filter((k) => JSON.stringify(vivo[k]) !== JSON.stringify(dados.listas[k]));
    if (dif.length) { console.error(`❌ a lista mudou na plataforma para: ${dif.join(', ')}. Rode: node scripts/gerar-tipos.mjs --atualizar && node scripts/versionar-estaticos.mjs`); process.exit(1); }
    console.log(`✅ ${tipos.length} lista(s) por tipo de imóvel iguais às da plataforma (${API})`);
    process.exit(0);
  }
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  dados = { conferido_em: JSON.stringify(vivo) !== JSON.stringify(dados.listas) ? hoje : dados.conferido_em || hoje, listas: vivo };
  writeFileSync(DADOS, JSON.stringify(dados, null, 2) + '\n');
}
for (const t of tipos) if (!dados.listas[t.tipo_imovel]) throw new Error(`sem a lista de ${t.tipo_imovel} em scripts/dados-tipos.json: rode --atualizar`);

const prazo = (m) => (m % 12 === 0 && m >= 12 ? `${m} meses (${m / 12 === 1 ? '1 ano' : `${m / 12} anos`})` : `${m} meses`);
const dataBR = (iso) => iso.split('-').reverse().join('/');
function corpoHtml(md) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  return md.split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean)).filter((l) => l.length).map((l) => {
    if (l[0].startsWith('## ')) return `<h2>${inline(l[0].slice(3))}</h2>` + (l.length > 1 ? `<p>${inline(l.slice(1).join(' '))}</p>` : '');
    if (l.every((x) => x.startsWith('- '))) return `<ul>${l.map((x) => `<li>${inline(x.slice(2))}</li>`).join('')}</ul>`;
    return `<p>${inline(l.join(' '))}</p>`;
  });
}

const base = readFileSync(join(RAIZ, 'guia-do-sindico.html'), 'utf8').split('\r\n').join('\n');
const antesMain = base.slice(0, base.indexOf('<main>'));
const depoisMain = base.slice(base.indexOf('</main>') + '</main>'.length);
const T_GUIA = 'Guia do síndico: contas e documentos | Regula360';
const D_GUIA = 'Respostas curtas para o síndico: prestação de contas, boletos, AVCB, seguro obrigatório, auditoria e quais documentos manter em dia.';
const CSS = `<style>
.ra{max-width:760px;margin:0 auto;padding:4rem var(--gutter) 2rem}
.ra h1{font-size:clamp(2rem,4vw,2.9rem);margin:.8rem 0 1.4rem}
.ra h2{font-size:1.5rem;margin:2.2rem 0 .8rem}
.ra p,.ra li{font-size:1.05rem;line-height:1.8;color:var(--grafite-soft)}
.rb-cat{font:600 .6rem var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--azul)}
.ra .resumo{background:var(--osso-soft);border-left:4px solid var(--azul);padding:1.1rem 1.3rem;border-radius:4px;margin-bottom:1.8rem;font-size:1rem;line-height:1.7;color:var(--grafite)}
.ra .resumo b{display:block;font:600 .62rem var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--azul);margin-bottom:.4rem}
.rt-lista{background:var(--papel);border:1px solid var(--linha);border-top:4px solid var(--azul);border-radius:6px;padding:1.2rem 1.4rem;margin-bottom:1.6rem}
.rt-lista>b{display:block;font:600 .62rem var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--azul);margin-bottom:.8rem}
.rt-lista ul{list-style:none;padding:0;margin:0}
.rt-lista li{border-bottom:1px solid var(--linha)}
.rt-lista li:last-child{border-bottom:0}
.rt-lista a{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;padding:.7rem 0;color:var(--grafite);text-decoration:none;font-size:1rem;line-height:1.45}
.rt-lista a:hover{color:var(--azul)}
.rt-lista span{color:var(--steel);white-space:nowrap;font-size:.92rem}
.rt-fonte{font-size:.8rem;color:var(--steel);margin:.8rem 0 0}
.rt-acoes{display:flex;flex-wrap:wrap;gap:.8rem;margin-bottom:2rem}
.ra .chamada{background:var(--grafite);color:var(--osso);border-radius:6px;padding:1.6rem 1.8rem;margin:2.4rem 0;display:flex;gap:1.2rem;align-items:center;justify-content:space-between;flex-wrap:wrap}
.ra .chamada b{color:var(--osso)}
.ra .chamada p{color:rgba(244,240,232,.75);margin:.3rem 0 0;font-size:.92rem}
@media(max-width:560px){.rt-lista a{flex-direction:column;gap:.15rem}}
</style>`;
function pagina(titulo, desc, url, ld, miolo) {
  let h = antesMain.split(T_GUIA).join(esc(titulo)).split(D_GUIA).join(esc(desc))
    .split(`${SITE}/guia-do-sindico"`).join(`${url}"`)
    .replace(/<meta property="og:type" content="[^"]*">/, '<meta property="og:type" content="article">');
  h = h.replace(/<script type="application\/ld\+json">\{"@context":"https:\/\/schema.org","@graph":[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(ld)}</script>`);
  h = h.replace('</head>', `${CSS}\n</head>`);
  return `${h}<main>\n${miolo}\n</main>${depoisMain}`;
}

const saidas = new Map();
for (const t of tipos) {
  const url = `${SITE}/${t.slug}`;
  const lista = dados.listas[t.tipo_imovel].filter((d) => !d.nao_vence && d.vigencia_meses);
  const itens = lista.map((d) => {
    const p = DOCS.get(d.codigo);
    const nome = p ? p.nome : d.documento;
    const href = p ? `/${p.slug}` : `/quando-vence-meu-documento?documento=${d.codigo}`;
    return `<li><a href="${href}">${esc(nome)}<span>vale ${prazo(d.vigencia_meses)} →</span></a></li>`;
  });
  const [cT, cS, cL, cB] = t.chamada.split('|').map((s) => s.trim());
  const c = corpoHtml(t.corpo);
  c.splice(Math.min(2, c.length), 0, `<div class="chamada"><div><b>${esc(cT)}</b><p>${esc(cS)}</p></div><a class="btn btn-azul" href="${cL}">${esc(cB)} →</a></div>`);
  const nomes = lista.map((d) => (DOCS.get(d.codigo) || { nome: d.documento }).nome);
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [['Início', `${SITE}/`], ['O que meu imóvel precisa ter?', `${SITE}/o-que-meu-imovel-precisa-ter`], [t.nome, url]].map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: u })) },
    { '@type': 'Article', headline: t.titulo, description: t.descricao, url, mainEntityOfPage: url, dateModified: dados.conferido_em, inLanguage: 'pt-BR',
      author: { '@type': 'Organization', name: 'Regula360', url: `${SITE}/` }, publisher: { '@type': 'Organization', name: 'Regula360', url: `${SITE}/` } },
    { '@type': 'ItemList', name: `Documentos com prazo: ${t.nome}`, numberOfItems: lista.length, itemListElement: nomes.map((n, i) => ({ '@type': 'ListItem', position: i + 1, name: n })) }] };
  saidas.set(`${t.slug}.html`, pagina(`${t.titulo_seo || t.titulo} | Regula360`, t.descricao, url, ld, `<article class="ra">
  <p style="font:600 .72rem var(--display);letter-spacing:.06em;color:var(--steel)"><a href="/" style="color:var(--steel)">Início</a> <span style="opacity:.5">›</span> <a href="/o-que-meu-imovel-precisa-ter" style="color:var(--steel)">O que meu imóvel precisa ter?</a> <span style="opacity:.5">›</span> <span style="color:var(--grafite)">${esc(t.nome)}</span></p>
  <span class="rb-cat">Documentos por tipo de imóvel</span>
  <h1>${esc(t.titulo)}</h1>
  <div class="resumo"><b>Em 20 segundos</b>${esc(t.resumo)}</div>
  <div class="rt-lista"><b>${lista.length} documentos com prazo · ${esc(t.nome.toLowerCase())}</b><ul>${itens.join('')}</ul>
    <p class="rt-fonte">Validade de referência em São Paulo; a data que vale é a impressa em cada documento. Mesma lista da ferramenta da Regula360, conferida em ${dataBR(dados.conferido_em)}.</p></div>
  <div class="rt-acoes"><a class="btn btn-azul" href="/quando-vence-meu-documento">Calcular quando vence um documento →</a><a class="btn btn-linha" href="/o-que-meu-imovel-precisa-ter?tipo=${esc(t.tipo_imovel)}">Ver outros tipos de imóvel →</a></div>
  ${c.join('\n  ')}
</article>`));
}

const disco = (f) => (existsSync(join(RAIZ, f)) ? readFileSync(join(RAIZ, f), 'utf8') : null);
const norm = (x) => (x ?? '').split('\r\n').join('\n').replace(/\?v=[a-f0-9]{8}/g, '');
function gravar(f, conteudo) {
  if (norm(disco(f)) === norm(conteudo)) return;
  if (conferir) { fora.push(f); return; }
  writeFileSync(join(RAIZ, f), conteudo.split('\n').join('\r\n'));
  console.log(`gerado: ${f}`);
}
for (const [f, c] of saidas) gravar(f, c);

// ── o caminho até as páginas: ferramenta "O que meu imóvel precisa ter", sitemap e llms.txt ──
function entreMarcadores(arquivo, abre, fecha, miolo, antesDe) {
  let t = (disco(arquivo) ?? '').split('\r\n').join('\n');
  const i = t.indexOf(abre);
  if (i >= 0) t = t.slice(0, i) + abre + miolo + fecha + t.slice(t.indexOf(fecha, i) + fecha.length);
  else {
    const k = t.indexOf(antesDe);
    if (k < 0) throw new Error(`${arquivo}: não achei onde pôr o bloco (${antesDe})`);
    t = t.slice(0, k) + abre + miolo + fecha + '\n' + t.slice(k);
  }
  gravar(arquivo, t);
}
entreMarcadores('o-que-meu-imovel-precisa-ter.html', '<!-- paginas-por-tipo: GERADO por scripts/gerar-tipos.mjs, não edite aqui -->', '<!-- /paginas-por-tipo -->',
  `<section class="sec" style="padding-top:0"><p style="font-size:.95rem;color:var(--steel);margin:0"><b style="color:var(--grafite)">A lista explicada, por tipo de imóvel:</b> ${tipos.map((t) => `<a href="/${t.slug}" style="color:var(--azul)">${esc(t.nome)}</a>`).join(' · ')}</p></section>`, '</main>');
entreMarcadores('sitemap.xml', '  <!-- tipos -->', '  <!-- /tipos -->', '\n' +
  tipos.map((t) => `  <url>\n    <loc>${SITE}/${t.slug}</loc>\n    <lastmod>${dados.conferido_em}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`).join('\n') + '\n', '</urlset>');
{
  const secao = ['## Documentos por tipo de imóvel', '', 'A lista de documentos com prazo de cada tipo de imóvel em São Paulo, com a validade de cada um.', '',
    ...tipos.map((t) => `- [${t.titulo}](${SITE}/${t.slug}): ${dados.listas[t.tipo_imovel].filter((d) => !d.nao_vence && d.vigencia_meses).length} documentos com prazo.`), '', ''].join('\n');
  let t = (disco('llms.txt') ?? '').split('\r\n').join('\n');
  t = t.replace(/## Documentos por tipo de imóvel\n[\s\S]*?(?=## )/, '');
  // antes da seção do gerar-documentos (se houver), senão antes do Blog: ordem estável entre os dois geradores
  const k = t.includes('## Validade de documentos') ? t.indexOf('## Validade de documentos') : t.indexOf('## Blog');
  if (k < 0) throw new Error('llms.txt: não achei "## Blog"');
  gravar('llms.txt', t.slice(0, k) + secao + t.slice(k));
}

if (conferir) {
  if (fora.length) { console.error(`❌ páginas por tipo desatualizadas: ${fora.join(', ')}\n   Rode: node scripts/gerar-tipos.mjs && node scripts/versionar-estaticos.mjs`); process.exit(1); }
  console.log(`✅ ${saidas.size} página(s) por tipo de imóvel em dia`);
}
