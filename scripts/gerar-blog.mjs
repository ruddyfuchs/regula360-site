/**
 * Monta o BLOG da Regula360 a partir de conteudo-blog/*.md (um arquivo de texto por artigo).
 *
 * 🔑 POR QUE ISTO EXISTE (14/10): artigos com frequência, sem mexer em HTML para publicar.
 * Cada artigo é um arquivo com cabeçalho simples (titulo, slug, categoria, data, ordem,
 * minutos, descricao, resumo, chamada) e o texto depois de `---`. Este script gera, com a
 * mesma casca da página do Guia do síndico (head, menu, rodapé, aviso de cookies):
 *   - blog.html (a lista) e blog-<slug>.html (cada artigo), com marcação BlogPosting;
 *   - o bloco "Do blog" na página inicial (3 mais novos), entre marcadores;
 *   - as entradas do blog no sitemap.xml e a seção "## Blog" do llms.txt.
 * Depois de gerar, rode `node scripts/versionar-estaticos.mjs` (carimbo ?v=).
 *
 *   node scripts/gerar-blog.mjs             → gera
 *   node scripts/gerar-blog.mjs --conferir  → só acusa se algo gerado estiver desatualizado (sai 1)
 *
 * Os .md não vão para o ar: o .vercelignore tem `*.md`.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.regula360.com.br';
const conferir = process.argv.includes('--conferir');
const fora = [];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dataBR = (iso) => iso.split('-').reverse().join('/');

function lerArtigo(txt, nome) {
  const t = txt.split('\r\n').join('\n');
  const corte = t.indexOf('\n---\n');
  if (corte < 0) throw new Error(`${nome}: falta a linha --- entre o cabeçalho e o texto`);
  const cab = {};
  for (const linha of t.slice(0, corte).split('\n')) {
    const i = linha.indexOf(':');
    if (i > 0) cab[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  for (const k of ['titulo', 'slug', 'categoria', 'data', 'minutos', 'descricao', 'resumo', 'chamada']) {
    if (!cab[k]) throw new Error(`${nome}: falta "${k}" no cabeçalho`);
  }
  if (!/^[a-z0-9-]+$/.test(cab.slug)) throw new Error(`${nome}: slug só com letras minúsculas, números e hífen`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cab.data)) throw new Error(`${nome}: data no formato AAAA-MM-DD`);
  // titulo_seo (opcional): o título que vai para o Google quando o título do artigo passa de 60 com o " | Regula360".
  const tSeo = `${cab.titulo_seo || cab.titulo} | Regula360`;
  if ([...tSeo].length > 60) throw new Error(`${nome}: "${tSeo}" tem ${[...tSeo].length} caracteres; o Google corta acima de 60. Encurte o titulo ou ponha titulo_seo`);
  if ([...cab.descricao].length > 160) throw new Error(`${nome}: descricao com ${[...cab.descricao].length} caracteres; o Google corta acima de 160`);
  return { ...cab, corpo: t.slice(corte + 5).trim() };
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
    } else if (linhas.every((l) => /^\d+\.\s/.test(l))) {
      out.push(`<ol>${linhas.map((l) => `<li>${inline(l.replace(/^\d+\.\s/, ''))}</li>`).join('')}</ol>`);
    } else {
      out.push(`<p>${inline(linhas.join(' '))}</p>`);
    }
  }
  return out;
}

const artigos = readdirSync(join(RAIZ, 'conteudo-blog'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => lerArtigo(readFileSync(join(RAIZ, 'conteudo-blog', f), 'utf8'), f))
  .sort((a, b) => b.data.localeCompare(a.data) || (Number(a.ordem) || 99) - (Number(b.ordem) || 99) || a.slug.localeCompare(b.slug));
const slugs = new Set();
for (const a of artigos) {
  if (slugs.has(a.slug)) throw new Error(`slug repetido: ${a.slug}`);
  slugs.add(a.slug);
}

// ── casca: a página do Guia do síndico, sem os dados estruturados nem o miolo dela ──
const base = readFileSync(join(RAIZ, 'guia-do-sindico.html'), 'utf8').split('\r\n').join('\n');
const antesMain = base.slice(0, base.indexOf('<main>'));
const depoisMain = base.slice(base.indexOf('</main>') + '</main>'.length);
const T_GUIA = 'Guia do síndico: contas e documentos | Regula360';
const D_GUIA = 'Respostas curtas para o síndico: prestação de contas, boletos, AVCB, seguro obrigatório, auditoria e quais documentos manter em dia.';

function pagina(titulo, desc, url, tipo, ld, miolo) {
  let h = antesMain.split(T_GUIA).join(esc(titulo)).split(D_GUIA).join(esc(desc))
    .split(`${SITE}/guia-do-sindico"`).join(`${url}"`)
    .replace(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${tipo}">`);
  h = h.replace(/<script type="application\/ld\+json">\{"@context":"https:\/\/schema.org","@graph":[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(ld)}</script>`);
  h = h.replace('</head>', `${CSS}\n</head>`);
  h = h.replace('<a href="/blog">Blog</a><a href="/#contato">Contato</a></nav>', '<a href="/blog" class="on" aria-current="page">Blog</a><a href="/#contato">Contato</a></nav>');
  return `${h}<main>\n${miolo}\n</main>${depoisMain}`;
}

const CSS = `<style>
.rb-grade{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
.rb-card{display:flex;flex-direction:column;gap:.7rem;background:var(--papel);border:1px solid var(--linha);border-radius:6px;padding:1.6rem;color:var(--grafite);text-decoration:none;transition:border-color .3s}
.rb-card:hover{border-color:var(--azul)}
.rb-cat{font:600 .6rem var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--azul)}
.rb-card h3{font:600 1.15rem/1.3 var(--display);margin:0}
.rb-meta{font-size:.8rem;color:var(--steel);margin-top:auto}
.rb-num{font:300 italic 2rem var(--display);color:var(--azul);line-height:1}
.ra{max-width:720px;margin:0 auto;padding:4rem var(--gutter) 2rem}
.ra h1{font-size:clamp(2rem,4vw,2.9rem);margin:.8rem 0 1.2rem}
.ra .autor{font-size:.85rem;color:var(--steel);border-top:1px solid var(--linha);border-bottom:1px solid var(--linha);padding:.9rem 0;margin-bottom:2rem}
.ra .autor b{color:var(--grafite);font-weight:600}
.ra h2{font-size:1.5rem;margin:2.2rem 0 .8rem}
.ra p,.ra li{font-size:1.05rem;line-height:1.8;color:var(--grafite-soft)}
.ra ul,.ra ol{padding-left:1.3rem}
.ra .resumo{background:var(--osso-soft);border-left:4px solid var(--azul);padding:1.1rem 1.3rem;border-radius:4px;margin-bottom:1.8rem;font-size:1rem;line-height:1.7;color:var(--grafite)}
.ra .resumo b{display:block;font:600 .62rem var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--azul);margin-bottom:.4rem}
.ra .chamada{background:var(--grafite);color:var(--osso);border-radius:6px;padding:1.6rem 1.8rem;margin:2.4rem 0;display:flex;gap:1.2rem;align-items:center;justify-content:space-between;flex-wrap:wrap}
.ra .chamada b{color:var(--osso)}
.ra .chamada p{color:rgba(244,240,232,.75);margin:.3rem 0 0;font-size:.92rem}
.ra .calcule{background:var(--osso-soft);border-left:4px solid var(--azul);border-radius:4px;padding:1.1rem 1.3rem;margin:1.8rem 0;display:flex;flex-direction:column;gap:.35rem}
.ra .calcule b{font:600 .62rem var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--azul)}
.ra .calcule span{font-size:1rem;color:var(--grafite);line-height:1.6}
.ra .calcule a{font:600 .95rem var(--display);color:var(--azul)}
.ra .partilha{font-size:.85rem;color:var(--steel);border-top:1px solid var(--linha);padding-top:1rem;margin-top:2rem}
@media(max-width:880px){.rb-grade{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.rb-grade{grid-template-columns:1fr}}
</style>`;

const card = (a, i) => `<a class="rb-card" href="/blog-${a.slug}"><span class="rb-num">${String(i + 1).padStart(2, '0')}</span><span class="rb-cat">${esc(a.categoria)}</span><h3>${esc(a.titulo)}</h3><span class="rb-meta">${dataBR(a.data)} · ${a.minutos} min de leitura</span></a>`;
const autor = { '@type': 'Person', name: 'Ruddy Fuchs', jobTitle: 'Sócio', worksFor: { '@type': 'Organization', name: 'Regula360' } };
const editora = { '@type': 'Organization', name: 'Regula360', url: `${SITE}/` };
const trilha = (itens) => ({ '@type': 'BreadcrumbList', itemListElement: itens.map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: u })) });
const trilhaVisivel = (partes) => `<p style="font:600 .72rem var(--display);letter-spacing:.06em;color:var(--steel)">${partes}</p>`;

const saidas = new Map();
saidas.set('blog.html', pagina('Blog: contas e documentos do condomínio | Regula360',
  'Artigos para síndico, conselheiro e gestor de imóveis: como conferir boletos e prestação de contas, o que exigir e o que a lei pede.',
  `${SITE}/blog`, 'website',
  { '@context': 'https://schema.org', '@graph': [trilha([['Início', `${SITE}/`], ['Blog', `${SITE}/blog`]]),
    { '@type': 'Blog', name: 'Blog da Regula360', url: `${SITE}/blog`, publisher: editora,
      blogPost: artigos.map((a) => ({ '@type': 'BlogPosting', headline: a.titulo, url: `${SITE}/blog-${a.slug}`, datePublished: a.data })) }] },
  `<section class="hero" style="padding-top:4.5rem;padding-bottom:2rem">
  ${trilhaVisivel('<a href="/" style="color:var(--steel)">Início</a> <span style="opacity:.5">›</span> <span style="color:var(--grafite)">Blog</span>')}
  <p class="olho" style="margin-top:1.4rem">Blog da Regula360</p>
  <h1 style="font-size:clamp(2.1rem,4.4vw,3.4rem)">Contas e documentos <em>sem mistério.</em></h1>
  <p class="sec-desc" style="margin-top:1.2rem;max-width:58ch">Para síndico, conselheiro e gestor de imóveis: como conferir, o que exigir e o que a lei pede.</p>
</section>
<section class="sec" style="padding-top:1rem">
  <div class="rb-grade">${artigos.map(card).join('')}</div>
</section>`));

for (const a of artigos) {
  const url = `${SITE}/blog-${a.slug}`;
  const [cT, cS, cL, cB] = a.chamada.split('|').map((s) => s.trim());
  const c = corpoHtml(a.corpo);
  const h2s = c.map((x, i) => (x.startsWith('<h2>') ? i : -1)).filter((i) => i > 0);
  const meio = h2s.length ? h2s.reduce((m, i) => (Math.abs(i - c.length / 2) < Math.abs(m - c.length / 2) ? i : m)) : Math.max(2, Math.floor(c.length / 2));
  // o quadro entra ANTES de um subtítulo, nunca entre o subtítulo e o texto dele
  // "Calcule agora" (opcional, `calculadora: frase | link | botão`): antes do 1º subtítulo depois da abertura;
  // se esse for o lugar do quadro de serviço, vai para o subtítulo seguinte. Entra primeiro o que está mais abaixo,
  // para um splice não deslocar a posição do outro.
  const quadros = [[meio, `<div class="chamada"><div><b>${esc(cT)}</b><p>${esc(cS)}</p></div><a class="btn btn-azul" href="${cL}">${esc(cB)} →</a></div>`]];
  if (a.calculadora) {
    const [kT, kL, kB] = a.calculadora.split('|').map((s) => s.trim());
    if (!kT || !/^\/(quando-vence-meu-documento|o-que-meu-imovel-precisa-ter)(\?[a-z_=&0-9.]*)?$/.test(kL || '') || !kB) throw new Error(`blog-${a.slug}: "calculadora" é "frase | /quando-vence-meu-documento… ou /o-que-meu-imovel-precisa-ter… | botão"`);
    const onde = h2s.find((i) => i !== meio);
    if (onde === undefined) throw new Error(`blog-${a.slug}: sem subtítulo livre para o quadro da calculadora`);
    quadros.push([onde, `<div class="calcule"><b>Calcule agora · grátis</b><span>${esc(kT)}</span><a href="${kL}">${esc(kB)} →</a></div>`]);
  }
  for (const [i, html] of quadros.sort((x, y) => y[0] - x[0])) c.splice(i, 0, html);
  const outros = artigos.filter((o) => o.slug !== a.slug).sort((x, y) => (y.categoria === a.categoria) - (x.categoria === a.categoria)).slice(0, 3);
  saidas.set(`blog-${a.slug}.html`, pagina(`${a.titulo_seo || a.titulo} | Regula360`, a.descricao, url, 'article',
    { '@context': 'https://schema.org', '@graph': [trilha([['Início', `${SITE}/`], ['Blog', `${SITE}/blog`], [a.titulo, url]]),
      { '@type': 'BlogPosting', headline: a.titulo, description: a.descricao, url, mainEntityOfPage: url, datePublished: a.data,
        dateModified: a.atualizado || a.data, inLanguage: 'pt-BR', articleSection: a.categoria, author: autor, publisher: editora }] },
    `<article class="ra">
  ${trilhaVisivel(`<a href="/" style="color:var(--steel)">Início</a> <span style="opacity:.5">›</span> <a href="/blog" style="color:var(--steel)">Blog</a> <span style="opacity:.5">›</span> <span style="color:var(--grafite)">${esc(a.categoria)}</span>`)}
  <span class="rb-cat">${esc(a.categoria)}</span>
  <h1>${esc(a.titulo)}</h1>
  <div class="autor"><b>Ruddy Fuchs</b>, sócio da Regula360 · 15 anos como gerente geral e diretor de imóveis<br>${dataBR(a.data)} · ${a.minutos} min de leitura</div>
  <div class="resumo"><b>Em 20 segundos</b>${esc(a.resumo)}</div>
  ${c.join('\n  ')}
  <p class="partilha">Compartilhar: <a href="https://wa.me/?text=${encodeURIComponent(a.titulo + ' ' + url)}" target="_blank" rel="noopener">WhatsApp</a> · <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}" target="_blank" rel="noopener">LinkedIn</a></p>
</article>
<section class="sec" style="padding-top:1rem"><div class="sec-cab" style="margin-bottom:1.4rem"><p class="sec-olho">Leia também</p></div><div class="rb-grade">${outros.map(card).join('')}</div></section>`));
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
for (const f of readdirSync(RAIZ).filter((x) => /^blog-[a-z0-9-]+\.html$/.test(x))) {
  if (!saidas.has(f)) {
    if (conferir) fora.push(`${f} (sem .md: apagar)`);
    else console.log(`⚠️ ${f} não tem mais .md em conteudo-blog: apague o arquivo à mão`);
  }
}

function entreMarcadores(arquivo, abre, fecha, miolo, antesDe) {
  let t = (disco(arquivo) ?? '').split('\r\n').join('\n');
  const i = t.indexOf(abre);
  if (i >= 0) {
    const j = t.indexOf(fecha, i);
    t = t.slice(0, i) + abre + miolo + fecha + t.slice(j + fecha.length);
  } else {
    const k = t.indexOf(antesDe);
    if (k < 0) throw new Error(`${arquivo}: não achei onde pôr o bloco (${antesDe})`);
    t = t.slice(0, k) + abre + miolo + fecha + '\n' + t.slice(k);
  }
  gravar(arquivo, t);
}

entreMarcadores('index.html', '<!-- blog: GERADO por scripts/gerar-blog.mjs, não edite aqui -->', '<!-- /blog -->', `
${CSS}
<section style="background:var(--osso-soft);border-top:1px solid var(--linha)"><div class="sec" style="padding-top:5rem;padding-bottom:5rem">
  <div style="display:flex;justify-content:space-between;align-items:end;gap:1rem;flex-wrap:wrap;margin-bottom:2rem"><div class="sec-cab" style="margin:0"><p class="sec-olho">Do blog</p><h2 class="sec-titulo">Contas e documentos <em>sem mistério.</em></h2></div><a href="/blog" style="font:600 .85rem var(--display);color:var(--azul)">Ver todos os artigos →</a></div>
  <div class="rb-grade">${artigos.slice(0, 3).map(card).join('')}</div>
</div></section>
`, '<footer class="rodape">');

entreMarcadores('sitemap.xml', '  <!-- blog -->', '  <!-- /blog -->', '\n' + [
  `  <url>\n    <loc>${SITE}/blog</loc>\n    <lastmod>${artigos[0].data}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
  ...artigos.map((a) => `  <url>\n    <loc>${SITE}/blog-${a.slug}</loc>\n    <lastmod>${a.atualizado || a.data}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`),
].join('\n') + '\n', '</urlset>');

{
  const secao = ['## Blog', '',
    `Artigos curtos para síndico, conselheiro e gestor de imóveis, escritos por Ruddy Fuchs, sócio da Regula360. Lista: ${SITE}/blog`, '',
    ...artigos.map((a) => `- [${a.titulo}](${SITE}/blog-${a.slug}): ${a.resumo}`), '', ''].join('\n');
  let t = (disco('llms.txt') ?? '').split('\r\n').join('\n');
  t = t.replace(/## Blog\n[\s\S]*?(?=## Detalhes)/, '');
  const k = t.indexOf('## Detalhes');
  if (k < 0) throw new Error('llms.txt: não achei "## Detalhes"');
  gravar('llms.txt', t.slice(0, k) + secao + t.slice(k));
}

if (conferir) {
  if (fora.length) {
    console.error(`❌ blog desatualizado em: ${fora.join(', ')}`);
    console.error('   Rode: node scripts/gerar-blog.mjs && node scripts/versionar-estaticos.mjs');
    process.exit(1);
  }
  console.log(`✅ blog em dia: ${artigos.length} artigos, lista, página inicial, sitemap e llms.txt`);
}
