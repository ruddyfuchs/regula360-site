/**
 * As calculadoras do site falam a mesma língua da plataforma.
 *
 * 🔑 POR QUE ISTO EXISTE (15/10): a conta das calculadoras é da plataforma (/api, via
 * rewrite da Vercel), mas três coisas ficam ESCRITAS no HTML: os códigos dos documentos
 * do seletor da página inicial, o exemplo da "Quando vence" e a lista de condomínio da
 * "O que meu imóvel precisa ter" (é o que Google, Bing e as IAs leem, porque não rodam
 * JavaScript). Se a plataforma tirar um documento do catálogo, a página inicial passaria
 * a responder "não conseguimos calcular" para quem escolher ele, calada. Se mudar uma
 * regra, o robô seguiria lendo o prazo velho. Esta prova pergunta à plataforma, item por
 * item, e reprova na diferença.
 *
 * No fim ela SABOTA a si mesma: um código inventado e um prazo trocado têm que reprovar.
 *
 * Uso: node scripts/prova-calculadoras.mjs [endereço]   (padrão: https://www.regula360.com.br)
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.argv[2] || 'https://www.regula360.com.br').replace(/\/$/, '');
const API = `${BASE}/api/public/regula/calculadora`;
const ler = (f) => readFileSync(join(RAIZ, f), 'utf8');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(url) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url);
    if (r.status === 429) { await esperar(20000); continue; }
    const j = await r.json().catch(() => null);
    return { status: r.status, data: j && j.data };
  }
  return { status: 429, data: null };
}
const dBR = (s) => (s ? s.split('-').reverse().join('/') : '');
const desfaz = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function lerSite(home, p1, p2) {
  const sel = home.match(/<select id="cq-doc">([\s\S]*?)<\/select>/);
  const tipoH = home.match(/<select id="cq-tipo">([\s\S]*?)<\/select>/);
  const ex = p1.match(/<div class="cx-res" id="r1"[\s\S]*?<\/div>\n<\/div>/);
  const lst = p2.match(/<ul class="cx-lista">([\s\S]*?)<\/ul>/);
  return {
    codigos: sel ? [...sel[1].matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]) : [],
    tiposHome: tipoH ? [...tipoH[1].matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]) : [],
    tiposP2: [...p2.matchAll(/data-tipo="([^"]+)"/g)].map((m) => m[1]),
    exemplo: ex ? ex[0] : '',
    listaCond: lst ? [...lst[1].matchAll(/<span class="d">([^<]+)<\/span>/g)].map((m) => desfaz(m[1])) : [],
  };
}

async function conferir(site, plataforma) {
  const erros = [];
  if (site.codigos.length < 5) erros.push(`seletor da página inicial com ${site.codigos.length} documentos: a prova não está lendo o site`);
  for (const c of site.codigos) {
    const v = plataforma.venc[c];
    if (!v || v.status !== 200 || !v.data?.vence_em) erros.push(`página inicial oferece o documento ${c}, e a plataforma responde ${v?.status ?? 'nada'}${v?.status === 200 ? ' sem vencimento' : ''}`);
  }
  for (const t of [...new Set([...site.tiposHome, ...site.tiposP2])]) {
    const d = plataforma.tipos[t];
    if (!d || d.status !== 200 || !(d.data?.documentos?.length > 0)) erros.push(`tipo de imóvel "${t}": a plataforma responde ${d?.status ?? 'nada'} ou lista vazia`);
  }
  const ex = plataforma.exemplo;
  if (!ex) erros.push('a plataforma não calculou o exemplo (AVCB, 10/03/2024, SP)');
  else for (const [rot, val] of [['vencimento', dBR(ex.vence_em)], ['renovar até', dBR(ex.comece_a_renovar_em)], ['validade', `${ex.vigencia_meses} meses`], ['base legal', ex.base_legal]]) {
    if (!site.exemplo.includes(val)) erros.push(`exemplo da "Quando vence" está velho: a plataforma diz ${rot} = ${val}, a página não`);
  }
  const vivo = (plataforma.tipos.condominio_residencial?.data?.documentos || []).map((d) => d.documento);
  const falta = vivo.filter((n) => !site.listaCond.includes(n)), sobra = site.listaCond.filter((n) => !vivo.includes(n));
  if (falta.length || sobra.length) erros.push(`lista de condomínio da "O que meu imóvel precisa ter" difere da plataforma: falta [${falta.join('; ')}], sobra [${sobra.join('; ')}]`);
  return erros;
}

const site = lerSite(ler('index.html'), ler('quando-vence-meu-documento.html'), ler('o-que-meu-imovel-precisa-ter.html'));
const plataforma = { venc: {}, tipos: {} };
for (const c of site.codigos) plataforma.venc[c] = await pedir(`${API}/vencimento?documento=${encodeURIComponent(c)}&emissao=2024-01-15&uf=SP`);
for (const t of [...new Set([...site.tiposHome, ...site.tiposP2])]) plataforma.tipos[t] = await pedir(`${API}/documentos?tipo_imovel=${t}&uf=SP`);
plataforma.exemplo = (await pedir(`${API}/vencimento?documento=002&emissao=2024-03-10&uf=SP`)).data;

console.log(`${site.codigos.length} documentos na página inicial · ${Object.keys(plataforma.tipos).length} tipos de imóvel · exemplo e lista de condomínio · contra ${BASE}`);
const erros = await conferir(site, plataforma);

// sabotagem: a prova tem que pegar um código inventado e um prazo trocado
const sab1 = await conferir({ ...site, codigos: [...site.codigos, 'NAO-EXISTE'] }, { ...plataforma, venc: { ...plataforma.venc, 'NAO-EXISTE': { status: 404, data: null } } });
const sab2 = await conferir({ ...site, exemplo: site.exemplo.split('36 meses').join('35 meses') }, plataforma);
if (!sab1.some((e) => e.includes('NAO-EXISTE'))) erros.push('SABOTAGEM PASSOU: um código inventado no seletor não reprovou');
if (!sab2.some((e) => e.includes('validade'))) erros.push('SABOTAGEM PASSOU: um prazo trocado no exemplo não reprovou');

if (erros.length) { console.log(`❌ ${erros.length} problemas:\n    ` + erros.join('\n    ')); process.exit(1); }
console.log('✅ as calculadoras do site batem com a plataforma, e a prova pega as 2 sabotagens');
