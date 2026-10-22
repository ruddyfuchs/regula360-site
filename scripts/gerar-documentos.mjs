/**
 * Monta uma página por DOCUMENTO com prazo ("Laudo de SPDA: validade…") a partir de conteudo-documentos/*.md.
 *
 * 🔑 POR QUE ISTO EXISTE (21/10): ninguém busca "governança documental"; buscam "validade do laudo de SPDA",
 * "AVCB vence quando". Cada página responde a UMA busca dessas. O texto é escrito à mão (o .md); os NÚMEROS
 * (validade, antecedência, base legal, o que acontece se vencer) vêm da MESMA regra da calculadora
 * (/api/public/regula/calculadora/vencimento), guardados em scripts/dados-documentos.json. Um fato, uma vez:
 * se a regra mudar na plataforma, a prova do CI (--ao-vivo) acusa e basta rodar --atualizar.
 *
 *   node scripts/gerar-documentos.mjs --atualizar  → relê a plataforma, grava o .json e gera as páginas
 *   node scripts/gerar-documentos.mjs              → gera as páginas a partir do .json
 *   node scripts/gerar-documentos.mjs --conferir   → só acusa página desatualizada (sai 1)
 *   node scripts/gerar-documentos.mjs --ao-vivo [https://www.regula360.com.br] → acusa .json diferente da plataforma (sai 1)
 *
 * Depois de gerar, rode `node scripts/versionar-estaticos.mjs` (carimbo ?v=).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.regula360.com.br';
const DADOS = join(RAIZ, 'scripts', 'dados-documentos.json');
const args = process.argv.slice(2);
const conferir = args.includes('--conferir');
const atualizar = args.includes('--atualizar');
const aoVivo = args.includes('--ao-vivo');
const API = (args.find((a) => /^https?:\/\//.test(a)) || 'https://www.regula360.com.br').replace(/\/$/, '');
const fora = [];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function lerDoc(txt, nome) {
  const t = txt.split('\r\n').join('\n');
  const corte = t.indexOf('\n---\n');
  if (corte < 0) throw new Error(`${nome}: falta a linha --- entre o cabeçalho e o texto`);
  const cab = {};
  for (const linha of t.slice(0, corte).split('\n')) {
    const i = linha.indexOf(':');
    if (i > 0) cab[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  for (const k of ['codigo', 'slug', 'nome', 'chamado', 'titulo', 'descricao', 'resumo', 'chamada']) {
    if (!cab[k]) throw new Error(`${nome}: falta "${k}" no cabeçalho`);
  }
  if (!/^[a-z0-9-]+$/.test(cab.slug)) throw new Error(`${nome}: slug só com letras minúsculas, números e hífen`);
  if (!/^(o|a|os|as) /.test(cab.chamado)) throw new Error(`${nome}: "chamado" começa com o artigo (ex.: "o laudo de SPDA", "a licença…")`);
  const tSeo = `${cab.titulo_seo || cab.titulo} | Regula360`;
  if ([...tSeo].length > 60) throw new Error(`${nome}: "${tSeo}" tem ${[...tSeo].length} caracteres; o Google corta acima de 60`);
  if ([...cab.descricao].length > 160) throw new Error(`${nome}: descricao com ${[...cab.descricao].length} caracteres; o Google corta acima de 160`);
  return { ...cab, relacionados: (cab.relacionados || '').split(',').map((s) => s.trim()).filter(Boolean), corpo: t.slice(corte + 5).trim() };
}

function corpoHtml(md) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const out = [];
  for (const bloco of md.split(/\n\s*\n/)) {
    const linhas = bloco.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!linhas.length) continue;
    if (linhas[0].startsWith('## ')) {
      out.push(`<h2>${inline(linhas[0].slice(3))}</h2>`);
      if (linhas.length > 1) out.push(`<p>${inline(linhas.slice(1).join(' '))}</p>`);
    } else if (linhas.every((l) => l.startsWith('- '))) {
      out.push(`<ul>${linhas.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`);
    } else {
      out.push(`<p>${inline(linhas.join(' '))}</p>`);
    }
  }
  return out;
}

const docs = readdirSync(join(RAIZ, 'conteudo-documentos')).filter((f) => f.endsWith('.md'))
  .map((f) => lerDoc(readFileSync(join(RAIZ, 'conteudo-documentos', f), 'utf8'), f))
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

// ── a regra de cada documento, como a calculadora a usa (só o que não depende da data) ──
const CAMPOS = ['documento', 'nao_vence', 'vigencia_meses', 'antecedencia_dias', 'origem_da_validade', 'base_legal', 'consequencia'];
async function regraAoVivo(codigo) {
  const r = await fetch(`${API}/api/public/regula/calculadora/vencimento?documento=${codigo}&emissao=2026-01-10&uf=SP`);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.data) throw new Error(`plataforma não respondeu a regra do documento ${codigo} (HTTP ${r.status})`);
  return Object.fromEntries(CAMPOS.map((k) => [k, j.data[k] ?? null]));
}
const codigos = [...new Set(docs.flatMap((d) => [d.codigo, ...d.relacionados]))].sort();
let dados = existsSync(DADOS) ? JSON.parse(readFileSync(DADOS, 'utf8')) : { regras: {} };
if (atualizar || aoVivo) {
  const vivo = {};
  for (const c of codigos) vivo[c] = await regraAoVivo(c);
  if (aoVivo) {
    const dif = codigos.filter((c) => JSON.stringify(vivo[c]) !== JSON.stringify(dados.regras[c]));
    if (dif.length) {
      console.error(`❌ a regra mudou na plataforma para: ${dif.join(', ')}. Rode: node scripts/gerar-documentos.mjs --atualizar && node scripts/versionar-estaticos.mjs`);
      process.exit(1);
    }
    console.log(`✅ ${codigos.length} regras de documentos iguais às da plataforma (${API})`);
    process.exit(0);
  }
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const mudou = JSON.stringify(vivo) !== JSON.stringify(dados.regras);
  dados = { conferido_em: mudou ? hoje : dados.conferido_em || hoje, regras: vivo };
  writeFileSync(DADOS, JSON.stringify(dados, null, 2) + '\n');
}
for (const c of codigos) if (!dados.regras[c]) throw new Error(`sem a regra do documento ${c} em scripts/dados-documentos.json: rode --atualizar`);

const maiuscula = (s) => s[0].toUpperCase() + s.slice(1);
const de = (s) => s.replace(/^(os|as|o|a) /, (m, a) => `d${a} `);
const prazo = (m) => (m % 12 === 0 && m >= 12 ? `${m} meses (${m / 12 === 1 ? '1 ano' : `${m / 12} anos`})` : `${m} meses`);
function seVencer(cons) {
  if (!cons) return null;
  return cons.split(' Base: ')[0].replace(/^Se vencer:\s*/, '').trim();
}

// ── casca: a página do Guia do síndico (head, menu, rodapé, cookies) ──
const base = readFileSync(join(RAIZ, 'guia-do-sindico.html'), 'utf8').split('\r\n').join('\n');
const antesMain = base.slice(0, base.indexOf('<main>'));
const depoisMain = base.slice(base.indexOf('</main>') + '</main>'.length);
const T_GUIA = 'Guia do síndico: contas e documentos | Regula360';
const D_GUIA = 'Respostas curtas para o síndico: prestação de contas, boletos, AVCB, seguro obrigatório, auditoria e quais documentos manter em dia.';

const CSS = `<style>
.ra{max-width:720px;margin:0 auto;padding:4rem var(--gutter) 2rem}
.ra h1{font-size:clamp(2rem,4vw,2.9rem);margin:.8rem 0 1.4rem}
.ra h2{font-size:1.5rem;margin:2.2rem 0 .8rem}
.ra p,.ra li{font-size:1.05rem;line-height:1.8;color:var(--grafite-soft)}
.ra ul{padding-left:1.3rem}
.rb-cat{font:600 .6rem var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--azul)}
.rd-resp{background:var(--papel);border:1px solid var(--linha);border-top:4px solid var(--azul);border-radius:6px;padding:1.4rem 1.5rem;margin-bottom:1.6rem}
.rd-resp>b{display:block;font:600 .62rem var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--azul);margin-bottom:1rem}
.rd-3{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1rem}
.rd-3 div{border-left:1px solid var(--linha);padding-left:.9rem}
.rd-3 small{display:block;font:600 .6rem var(--display);letter-spacing:.1em;text-transform:uppercase;color:var(--steel);margin-bottom:.3rem}
.rd-3 strong{font:600 1.15rem/1.3 var(--display);color:var(--grafite)}
.rd-risco{font-size:.98rem;line-height:1.65;color:var(--grafite);border-top:1px solid var(--linha);padding-top:.9rem;margin:0}
.rd-fonte{font-size:.8rem;color:var(--steel);margin:.7rem 0 0}
.rd-calc{background:var(--grafite);border-radius:6px;padding:1.4rem 1.5rem;margin-bottom:2rem;display:flex;flex-wrap:wrap;gap:.8rem 1rem;align-items:end}
.rd-calc label{flex:1 1 220px;display:flex;flex-direction:column;gap:.45rem;font:600 .9rem var(--display);color:var(--osso)}
.rd-calc input{font:500 1rem var(--corpo,inherit);padding:.75rem .8rem;border-radius:4px;border:1px solid var(--linha);background:var(--papel);color:var(--grafite)}
.ra .resumo{background:var(--osso-soft);border-left:4px solid var(--azul);padding:1.1rem 1.3rem;border-radius:4px;margin-bottom:1.8rem;font-size:1rem;line-height:1.7;color:var(--grafite)}
.ra .resumo b{display:block;font:600 .62rem var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--azul);margin-bottom:.4rem}
.ra .chamada{background:var(--grafite);color:var(--osso);border-radius:6px;padding:1.6rem 1.8rem;margin:2.4rem 0;display:flex;gap:1.2rem;align-items:center;justify-content:space-between;flex-wrap:wrap}
.ra .chamada b{color:var(--osso)}
.ra .chamada p{color:rgba(244,240,232,.75);margin:.3rem 0 0;font-size:.92rem}
.rd-outros{list-style:none;padding:0!important;display:grid;gap:.6rem}
.rd-outros a{display:flex;justify-content:space-between;gap:1rem;background:var(--papel);border:1px solid var(--linha);border-radius:6px;padding:.9rem 1.1rem;color:var(--grafite);text-decoration:none;font-size:.98rem}
.rd-outros a:hover{border-color:var(--azul)}
.rd-outros span{color:var(--steel);white-space:nowrap}
@media(max-width:560px){.rd-3{grid-template-columns:1fr}.rd-3 div{border-left:0;padding-left:0;border-top:1px solid var(--linha);padding-top:.6rem}}
</style>`;

function pagina(titulo, desc, url, ld, miolo) {
  let h = antesMain.split(T_GUIA).join(esc(titulo)).split(D_GUIA).join(esc(desc))
    .split(`${SITE}/guia-do-sindico"`).join(`${url}"`)
    .replace(/<meta property="og:type" content="[^"]*">/, '<meta property="og:type" content="article">');
  h = h.replace(/<script type="application\/ld\+json">\{"@context":"https:\/\/schema.org","@graph":[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(ld)}</script>`);
  h = h.replace('</head>', `${CSS}\n</head>`);
  return `${h}<main>\n${miolo}\n</main>${depoisMain}`;
}

const porCodigo = new Map(docs.map((d) => [d.codigo, d]));
const dataBR = (iso) => iso.split('-').reverse().join('/');
const saidas = new Map();
for (const d of docs) {
  const r = dados.regras[d.codigo];
  if (r.nao_vence) throw new Error(`${d.slug}: o documento ${d.codigo} não vence; página de validade não faz sentido`);
  const url = `${SITE}/${d.slug}`;
  const risco = seVencer(r.consequencia);
  const ondeVale = r.origem_da_validade === 'regra_da_uf' ? 'Regra do estado de São Paulo; em outros estados o prazo pode ser outro.' : 'Regra nacional, igual em todos os estados.';
  const respValidade = `${maiuscula(d.chamado)} vale ${prazo(r.vigencia_meses)} a partir da emissão (${r.base_legal}).`;
  const PERGUNTAS = () => [[`Qual a validade ${de(d.chamado)}?`, `${respValidade} ${ondeVale}`], [`Quando começar a renovar ${d.chamado}?`, respRenovar]]; // sem 'o que acontece se vencer': a prova-faq proíbe preço (R$) em pergunta; o risco fica no quadro de cima
  // renovar_antes_dias (opcional no .md): decisão do Ruddy quando a antecedência da plataforma é curta demais
  // para a vida real; vale só nesta página e fica registrado para a plataforma revisar (ver o .md).
  const antes = Number(d.renovar_antes_dias) || r.antecedencia_dias;
  const antesTxt = antes % 30 === 0 && antes >= 60 ? `${antes / 30} meses` : `${antes} dias`;
  const respRenovar = `Comece a renovar pelo menos ${antesTxt} antes do vencimento.`;
  const [cT, cS, cL, cB] = d.chamada.split('|').map((s) => s.trim());
  const c = corpoHtml(d.corpo);
  const h2s = c.map((x, i) => (x.startsWith('<h2>') ? i : -1)).filter((i) => i > 0);
  const meio = h2s.length ? h2s.reduce((m, i) => (Math.abs(i - c.length / 2) < Math.abs(m - c.length / 2) ? i : m)) : Math.floor(c.length / 2);
  c.splice(meio, 0, `<div class="chamada"><div><b>${esc(cT)}</b><p>${esc(cS)}</p></div><a class="btn btn-azul" href="${cL}">${esc(cB)} →</a></div>`);
  const outros = d.relacionados.map((cod) => {
    const p = porCodigo.get(cod);
    const rr = dados.regras[cod];
    return p ? `<li><a href="/${p.slug}">${esc(p.nome)}<span>vale ${prazo(rr.vigencia_meses)} →</span></a></li>`
      : `<li><a href="/quando-vence-meu-documento?documento=${cod}">${esc(rr.documento)}<span>vale ${prazo(rr.vigencia_meses)} →</span></a></li>`;
  });
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [['Início', `${SITE}/`], ['Quando vence meu documento?', `${SITE}/quando-vence-meu-documento`], [d.nome, url]].map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: u })) },
    { '@type': 'Article', headline: d.titulo, description: d.descricao, url, mainEntityOfPage: url, dateModified: dados.conferido_em, inLanguage: 'pt-BR',
      author: { '@type': 'Organization', name: 'Regula360', url: `${SITE}/` }, publisher: { '@type': 'Organization', name: 'Regula360', url: `${SITE}/` } },
    { '@type': 'FAQPage', mainEntity: PERGUNTAS().map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] };
  saidas.set(`${d.slug}.html`, pagina(`${d.titulo_seo || d.titulo} | Regula360`, d.descricao, url, ld,
    `<article class="ra">
  <p style="font:600 .72rem var(--display);letter-spacing:.06em;color:var(--steel)"><a href="/" style="color:var(--steel)">Início</a> <span style="opacity:.5">›</span> <a href="/quando-vence-meu-documento" style="color:var(--steel)">Quando vence meu documento?</a> <span style="opacity:.5">›</span> <span style="color:var(--grafite)">${esc(d.nome)}</span></p>
  <span class="rb-cat">Validade de documentos</span>
  <h1>${esc(d.titulo)}</h1>
  <div class="rd-resp" id="resposta"><b>Resposta rápida</b>
    <div class="rd-3"><div><small>Validade</small><strong>${prazo(r.vigencia_meses)}</strong></div><div><small>Comece a renovar</small><strong>${antesTxt} antes</strong></div><div><small>Base</small><strong>${esc(r.base_legal)}</strong></div></div>
    ${risco ? `<p class="rd-risco"><b>Se vencer:</b> ${esc(risco)}</p>` : ''}
    <p class="rd-fonte">${ondeVale} Mesma regra da calculadora da Regula360, conferida em ${dataBR(dados.conferido_em)}.</p>
  </div>
  <form class="rd-calc" action="/quando-vence-meu-documento" method="get">
    <input type="hidden" name="documento" value="${esc(d.codigo)}"><input type="hidden" name="uf" value="SP">
    <label>Quando vence o seu? Informe a data de emissão:<input type="date" name="emissao" required></label>
    <button class="btn btn-azul" type="submit">Calcular o vencimento →</button>
  </form>
  <div class="resumo"><b>Em 20 segundos</b>${esc(d.resumo)}</div>
  ${c.join('\n  ')}
  <h2>Perguntas rápidas</h2>
  ${PERGUNTAS().map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join(' ')}
  <h2>Outros documentos com prazo</h2>
  <ul class="rd-outros">${outros.join('')}<li><a href="/o-que-meu-imovel-precisa-ter">Ver a lista completa do seu tipo de imóvel<span>→</span></a></li></ul>
</article>`));
}

const disco = (f) => (existsSync(join(RAIZ, f)) ? readFileSync(join(RAIZ, f), 'utf8') : null);
const norm = (t) => (t ?? '').split('\r\n').join('\n').replace(/\?v=[a-f0-9]{8}/g, '');
function gravar(f, conteudo) {
  if (norm(disco(f)) === norm(conteudo)) return;
  if (conferir) { fora.push(f); return; }
  writeFileSync(join(RAIZ, f), conteudo.split('\n').join('\r\n'));
  console.log(`gerado: ${f}`);
}
for (const [f, c] of saidas) gravar(f, c);

// ── o caminho até as páginas: sem link, nem visitante nem Google acha a página (o guia da M5 ficou 14 dias invisível) ──
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
// 1) a calculadora: depois de calcular um documento que tem página, mostra "Saiba mais sobre…"
const mapa = Object.fromEntries(docs.map((d) => [d.codigo, [`/${d.slug}`, d.chamado]]));
entreMarcadores('quando-vence-meu-documento.html', '<!-- paginas-de-documento: GERADO por scripts/gerar-documentos.mjs, não edite aqui -->', '<!-- /paginas-de-documento -->',
  `<script>window.R360_DOC=${JSON.stringify(mapa)};</script>`, '</head>');
// 2) o mapa do site
entreMarcadores('sitemap.xml', '  <!-- documentos -->', '  <!-- /documentos -->', '\n' +
  docs.map((d) => `  <url>\n    <loc>${SITE}/${d.slug}</loc>\n    <lastmod>${dados.conferido_em}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`).join('\n') + '\n', '</urlset>');
// 3) o resumo para IAs (llms.txt)
{
  const secao = ['## Validade de documentos', '', 'Uma página por documento com prazo: validade, quando começar a renovar, o que acontece se vencer e a calculadora já preenchida.', '',
    ...docs.map((d) => { const r = dados.regras[d.codigo]; return `- [${d.titulo}](${SITE}/${d.slug}): vale ${prazo(r.vigencia_meses)} (${r.base_legal}).`; }), '', ''].join('\n');
  let t = (disco('llms.txt') ?? '').split('\r\n').join('\n');
  t = t.replace(/## Validade de documentos\n[\s\S]*?(?=## )/, '');
  const k = t.indexOf('## Blog');
  if (k < 0) throw new Error('llms.txt: não achei "## Blog"');
  gravar('llms.txt', t.slice(0, k) + secao + t.slice(k));
}

if (conferir) {
  if (fora.length) {
    console.error(`❌ páginas de documento desatualizadas: ${fora.join(', ')}`);
    console.error('   Rode: node scripts/gerar-documentos.mjs && node scripts/versionar-estaticos.mjs');
    process.exit(1);
  }
  console.log(`✅ ${saidas.size} página(s) de documento em dia com o texto e a regra guardada`);
}
