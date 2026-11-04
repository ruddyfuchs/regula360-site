/**
 * Reescreve, a partir da plataforma, os dois trechos das calculadoras que ficam ESCRITOS no HTML:
 * a lista de condomínio da "O que meu imóvel precisa ter" e o exemplo (AVCB) da "Quando vence".
 *
 * 🔑 POR QUE ISTO EXISTE (04/11): os dois trechos eram cópia feita à mão. Quando a plataforma mudou a
 * consequência ("o seguro predial deixa de cobrir" → "pode comprometer a cobertura", multa estimada →
 * multa legal), as páginas de documento se atualizaram pelo `gerar-documentos --atualizar`, e estes dois
 * trechos ficaram com a frase velha, calados. A prova-calculadoras agora confere a consequência também.
 *
 * Uso: node scripts/atualizar-calculadoras.mjs [endereço]   (padrão: https://m5group.pages.dev)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.argv[2] || 'https://m5group.pages.dev').replace(/\/$/, '');
const API = `${BASE}/api/public/regula/calculadora`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "Se vencer: X. Base: Y" → { efeito: "Se vencer: X.", base: "Y" } (a mesma leitura que a prova usa). */
export function partirConsequencia(c) {
  if (!c) return null;
  const i = c.indexOf('. Base: ');
  const efeito = i >= 0 ? c.slice(0, i + 1) : c.trim();
  return { efeito: /[.!]$/.test(efeito) ? efeito : efeito + '.', base: i >= 0 ? c.slice(i + 8).trim() : '' };
}

async function pedir(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.data) throw new Error(`a plataforma respondeu ${r.status} em ${url}`);
  return j.data;
}

function trocar(arquivo, achar, novo) {
  const p = join(RAIZ, arquivo);
  const bruto = readFileSync(p, 'utf8');
  const crlf = bruto.includes('\r\n');
  const s = bruto.split('\r\n').join('\n');
  const m = s.match(achar);
  if (!m) throw new Error(`${arquivo}: não achei o trecho a reescrever`);
  const t = s.replace(m[0], novo);
  writeFileSync(p, crlf ? t.split('\n').join('\r\n') : t);
  return m[0] !== novo;
}

const lista = await pedir(`${API}/documentos?tipo_imovel=condominio_residencial&uf=SP`);
const itens = lista.documentos.map((d) => {
  const c = partirConsequencia(d.consequencia);
  return `<li><span class="d">${esc(d.documento)}</span><span class="v">${d.nao_vence ? 'Não vence' : `Vale ${d.vigencia_meses} meses`}</span>`
    + (d.base_legal ? `<span class="b">Base: ${esc(d.base_legal)}</span>` : '')
    + (c ? `<span class="r">${esc(c.efeito)}</span>` : '') + '</li>';
}).join('');
const m1 = trocar('o-que-meu-imovel-precisa-ter.html', /<ul class="cx-lista"><li><span class="d">[\s\S]*?<\/ul>/, `<ul class="cx-lista">${itens}</ul>`);

const ex = await pedir(`${API}/vencimento?documento=002&emissao=2024-03-10&uf=SP`);
const c = partirConsequencia(ex.consequencia);
const alerta = c ? `<div class="cx-alerta"><b>Se vencer</b>${esc(c.efeito.replace(/^Se vencer: /, ''))}${c.base ? `<small>Base: ${esc(c.base)}</small>` : ''}</div>` : '';
const m2 = trocar('quando-vence-meu-documento.html', /<div class="cx-alerta"><b>Se vencer<\/b>[\s\S]*?<\/div>/, alerta);

console.log(`✔ lista de condomínio (${lista.documentos.length} itens) ${m1 ? 'atualizada' : 'já em dia'} · exemplo do AVCB ${m2 ? 'atualizado' : 'já em dia'}`);
