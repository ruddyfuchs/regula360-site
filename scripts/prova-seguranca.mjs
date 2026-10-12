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
const erros = julgar(html, dados);

// sabotagens: a prova tem que pegar
const sab = [];
const k1 = Object.keys(dados).find((k) => typeof dados[k] === 'number');
if (k1 && !julgar(html, { ...dados, [k1]: dados[k1] + 1 }).length) sab.push(`não pegou ${k1} trocado`);
if (!julgar(html, { ...dados, whatsapp_so_com_consentimento: false }).length) sab.push('não pegou booleano desligado');
if (!julgar(html, { ...dados, copia_imutavel_ligada: !dados.copia_imutavel_ligada }).length) sab.push('não pegou a trava da cópia invertida');

console.log(`${Object.keys(dados).length} campos no JSON · revisado em ${dados.revisado_em}`);
if (erros.length || sab.length) {
  console.log(`❌ ${erros.length + sab.length} problemas:`);
  [...erros, ...sab.map((s) => 'SABOTAGEM ' + s)].forEach((e) => console.log('   ', e));
  process.exit(1);
}
console.log('✅ cada número da página bate com a plataforma, e a prova pega as 3 sabotagens');
