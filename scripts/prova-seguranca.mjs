/**
 * Os números da página /seguranca batem com o que a plataforma publica?
 *
 * 🔑 POR QUE ISTO EXISTE (12/10): a página afirma fatos da plataforma ("120 pedidos por
 * minuto", "90 dias de cópia", "mais de 280 regras"). Eles ficam ESCRITOS no HTML, porque
 * Google, Bing e as IAs não rodam JavaScript; o JS só atualiza na tela de quem visita.
 * Se a plataforma mudar um fato e ninguém mexer no HTML, o robô continua lendo o número
 * velho, calado. Esta prova compara cada `data-k` do HTML com o JSON publicado
 * (`/api/public/regula/seguranca.json`, servido pela plataforma via rewrite da Vercel) e
 * reprova na diferença. Booleano `false` exige que o item correspondente saia da página.
 *
 * No fim ela SABOTA a si mesma: um número trocado, um booleano desligado e a trava invertida têm que reprovar.
 *
 * Uso: node scripts/prova-seguranca.mjs [endereço]   (padrão: https://www.regula360.com.br)
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || 'https://www.regula360.com.br';
const html = readFileSync(join(RAIZ, 'seguranca.html'), 'utf8');

/** O que o HTML mostra, já no formato do JSON. */
function lerHtml(h) {
  const vistos = {};
  for (const m of h.matchAll(/<(\w+)[^>]*\sdata-k="([a-z_]+)"(?:\s+data-fmt="([a-z]+)")?[^>]*>([^<]*)</g)) {
    const [, , k, fmt, txt] = m;
    let v = txt.trim();
    if (fmt === 'mais') v = Number(v.replace('+', ''));
    else if (fmt === 'min') v = Number(v.replace(' min', '')) * 60;
    else if (fmt === 'dias') v = Number(v.replace(' dias', ''));
    else if (fmt === 'data') v = v.split('/').reverse().join('-');
    else if (/^\d+$/.test(v)) v = Number(v);
    (vistos[k] ??= new Set()).add(JSON.stringify(v));
  }
  return vistos;
}

function julgar(h, d) {
  const erros = [];
  const vistos = lerHtml(h);
  for (const [k, vals] of Object.entries(vistos)) {
    if (vals.size > 1) erros.push(`${k}: a página mostra valores diferentes entre si (${[...vals].join(' e ')})`);
    if (!(k in d)) { erros.push(`${k}: está na página mas não existe no JSON`); continue; }
    const esperado = JSON.stringify(d[k]);
    if (!vals.has(esperado)) erros.push(`${k}: página diz ${[...vals].join('/')}, a plataforma diz ${esperado}`);
  }
  // todo número da plataforma tem que aparecer (os booleanos são tratados abaixo)
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === 'boolean') continue;
    if (!(k in vistos)) erros.push(`${k}: a plataforma publica, mas a página não mostra`);
  }
  // booleano false: o item que afirma o fato não pode estar na página sem o hidden
  for (const k of ['passaporte_oculta_sensiveis', 'whatsapp_so_com_consentimento']) {
    if (d[k] === false && new RegExp(`data-se="${k}"(?![^>]*hidden)`).test(h)) erros.push(`${k}: a plataforma diz false e a página ainda afirma o fato`);
  }
  // a trava da cópia: o que a página mostra SEM JavaScript tem que bater com a plataforma
  const honestoVisivel = /data-imutavel="nao"(?![^>]*hidden)/.test(h);
  const travaAfirmada = /data-imutavel="sim"(?![^>]*hidden)/.test(h);
  if (d.copia_imutavel_ligada === true && (honestoVisivel || !travaAfirmada)) erros.push('copia_imutavel_ligada: a trava está ligada e a página não afirma (ou ainda diz que não temos)');
  if (d.copia_imutavel_ligada === false && (!honestoVisivel || travaAfirmada)) erros.push('copia_imutavel_ligada: a trava está desligada e a página afirma que está ligada (ou não avisa)');
  return erros;
}

const r = await fetch(`${BASE}/api/public/regula/seguranca.json`, { headers: { accept: 'application/json' } }).catch((e) => ({ ok: false, status: e.message }));
if (!r.ok) {
  console.log(`❌ o JSON da plataforma não respondeu (${r.status}) em ${BASE}/api/public/regula/seguranca.json`);
  process.exit(1);
}
const dados = await r.json();
// a data pode vir como 2026-10-12 ou 12/10/2026: compara sempre no formato ISO
if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(dados.revisado_em))) dados.revisado_em = dados.revisado_em.split('/').reverse().join('-');
const erros = julgar(html, dados);

// sabotagens: a prova tem que pegar
const sab = [];
const k1 = Object.keys(dados).find((k) => typeof dados[k] === 'number');
if (k1 && !julgar(html, { ...dados, [k1]: dados[k1] + 1 }).length) sab.push(`não pegou ${k1} trocado`);
if (!julgar(html, { ...dados, whatsapp_so_com_consentimento: false }).length) sab.push('não pegou booleano desligado');
if (!julgar(html, { ...dados, copia_imutavel_ligada: !dados.copia_imutavel_ligada }).length) sab.push('não pegou a trava da cópia invertida');

// ── acurácia da IA e teste de separação (28/10): o mesmo contrato, outro JSON ──
// A página só pode mostrar campo que a plataforma publicou (ela já tira o que fica abaixo
// de 90%) e cada número escrito no HTML tem que bater com o publicado.
function brData(s) { const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : null; }
function julgarConfianca(h, c) {
  const e = [];
  const mostrados = [...h.matchAll(/<div class="ac-item" data-campo="([a-z_]+)"><div class="ac-pct">(\d+)%<\/div><div class="ac-rot">([^<]+)<\/div><div class="ac-conta">(\d+) de (\d+) conferidos<\/div><\/div>/g)]
    .map(([, campo, pct, rotulo, acertos, conferidos]) => ({ campo, pct: +pct, rotulo, acertos: +acertos, conferidos: +conferidos }));
  const publicados = (c.acuracia || []).filter((a) => a.pct >= 90);
  for (const m of mostrados) {
    const p = publicados.find((a) => a.campo === m.campo);
    if (!p) { e.push(`acurácia ${m.campo}: a página mostra, mas a plataforma não publica (ou está abaixo de 90%)`); continue; }
    for (const k of ['pct', 'rotulo', 'acertos', 'conferidos']) if (p[k] !== m[k]) e.push(`acurácia ${m.campo}.${k}: página diz ${m[k]}, a plataforma diz ${p[k]}`);
  }
  for (const p of publicados) if (!mostrados.some((m) => m.campo === p.campo)) e.push(`acurácia ${p.campo}: a plataforma publica, mas a página não mostra`);
  const span = (k) => (h.match(new RegExp(`data-${k}">([^<]*)<`)) || [])[1];
  if (span('ac="amostra_por_rodada') !== String(c.amostra_por_rodada)) e.push(`amostra_por_rodada: página diz ${span('ac="amostra_por_rodada')}, a plataforma diz ${c.amostra_por_rodada}`);
  if (span('ac="base') !== c.base) e.push(`base: página diz "${span('ac="base')}", a plataforma diz "${c.base}"`);
  if (span('ac="atualizado_em') !== brData(c.atualizado_em)) e.push(`atualizado_em: página diz ${span('ac="atualizado_em')}, a plataforma diz ${brData(c.atualizado_em)}`);
  const i = c.isolamento || {};
  if (i.teste_por_publicacao !== true || i.vazamentos !== 0) e.push('isolamento: a plataforma não confirma teste por publicação com 0 vazamentos e a página afirma');
  for (const k of ['acessos', 'telas', 'papeis', 'vazamentos']) {
    const v = span(`iso="${k}`);
    if (v === undefined || Number(v.replace(/\./g, '')) !== i[k]) e.push(`isolamento ${k}: página diz ${v}, a plataforma diz ${i[k]}`);
  }
  if (span('iso="data_teste') !== brData(i.data_teste)) e.push(`isolamento data_teste: página diz ${span('iso="data_teste')}, a plataforma diz ${brData(i.data_teste)}`);
  return e;
}
const rc = await fetch(`${BASE}/api/public/regula/confianca`, { headers: { accept: 'application/json' } }).catch((e) => ({ ok: false, status: e.message }));
if (!rc.ok) erros.push(`o JSON de confiança não respondeu (${rc.status}) em ${BASE}/api/public/regula/confianca`);
else {
  const conf = await rc.json();
  erros.push(...julgarConfianca(html, conf));
  const a0 = conf.acuracia?.[0];
  if (a0 && !julgarConfianca(html, { ...conf, acuracia: [{ ...a0, pct: a0.pct === 100 ? 99 : a0.pct + 1 }, ...conf.acuracia.slice(1)] }).length) sab.push('não pegou acurácia trocada');
  if (a0 && !julgarConfianca(html, { ...conf, acuracia: conf.acuracia.slice(1) }).length) sab.push('não pegou campo que a plataforma deixou de publicar');
  if (!julgarConfianca(html, { ...conf, isolamento: { ...conf.isolamento, vazamentos: 1 } }).length) sab.push('não pegou vazamento no teste de separação');
}

console.log(`${Object.keys(dados).length} campos no JSON · revisado em ${dados.revisado_em}`);
if (erros.length || sab.length) {
  console.log(`❌ ${erros.length + sab.length} problemas:`);
  [...erros, ...sab.map((s) => 'SABOTAGEM ' + s)].forEach((e) => console.log('   ', e));
  process.exit(1);
}
console.log('✅ cada número da página bate com a plataforma (segurança, acurácia da IA e teste de separação), e a prova pega as 6 sabotagens');
