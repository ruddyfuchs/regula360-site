/**
 * O que o Google lê nas perguntas é o que a pessoa vê na tela.
 *
 * 🪤 POR QUE ISTO EXISTE (23/09): a home tinha SETE perguntas escritas, bem escritas,
 * e nenhuma marcação FAQPage. Para o visitante estava tudo lá; para o Google, não
 * existia. E o contrário é ainda pior: marcação que promete algo que a tela não diz é
 * o tipo de coisa que o Google penaliza.
 *
 * 🔑 Por isso a prova não confere só "existe FAQPage": ela compara pergunta por
 * pergunta com o que está no <details> da página.
 *
 * Uso: node scripts/prova-faq.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGINAS = readdirSync(RAIZ).filter((f) => f.endsWith('.html'));
const erros = [];
let comFaq = 0;

const limpar = (s) => s
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
  .replace(/&#39;|&rsquo;/g, "'").replace(/&mdash;/g, '—')
  .replace(/\s+/g, ' ')
  .trim();

for (const p of PAGINAS) {
  const html = readFileSync(join(RAIZ, p), 'utf8');

  // 🪤 o que a PESSOA vê — fora de <style>, <script> e comentário. A primeira versão
  // desta prova pescou um COMENTÁRIO de CSS que fala de `summary` e acusou as quatro
  // páginas por uma pergunta que não existe. Instrumento que lê o arquivo inteiro
  // acaba lendo a própria documentação e chamando isso de conteúdo.
  const visivel = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const naTela = [...visivel.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)]
    .map((m) => ({ q: limpar(m[1]), r: limpar(m[2]) }))
    // o menu do celular também usa <details>; só conta o que tem cara de pergunta
    .filter((x) => x.q.includes('?') && x.r.length > 30);

  // o que o GOOGLE lê
  const blocos = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  let faq = null;
  for (const [, cru] of blocos) {
    let dados;
    try { dados = JSON.parse(cru); } catch (e) {
      erros.push(`${p}: dados estruturados inválidos (${e.message.slice(0, 50)}) — o Google ignora o bloco inteiro, em silêncio`);
      continue;
    }
    for (const no of [].concat(dados['@graph'] || dados)) {
      if (no && no['@type'] === 'FAQPage') faq = faq ? 'duplicado' : no;
    }
  }

  if (!naTela.length) {
    if (faq) erros.push(`${p}: tem marcação FAQPage e NENHUMA pergunta na tela`);
    continue;
  }
  comFaq++;

  if (!faq) { erros.push(`${p}: ${naTela.length} perguntas na tela e nenhuma marcação FAQPage — para o Google elas não existem`); continue; }
  if (faq === 'duplicado') { erros.push(`${p}: dois blocos FAQPage`); continue; }

  const marcadas = [].concat(faq.mainEntity || []).map((q) => ({
    q: limpar(String(q.name || '')),
    r: limpar(String(q.acceptedAnswer?.text || '')),
  }));

  if (marcadas.length !== naTela.length) {
    erros.push(`${p}: ${naTela.length} perguntas na tela e ${marcadas.length} na marcação`);
  }
  for (const t of naTela) {
    const par = marcadas.find((m) => m.q === t.q);
    if (!par) { erros.push(`${p}: "${t.q.slice(0, 50)}" está na tela e não na marcação`); continue; }
    if (par.r !== t.r) erros.push(`${p}: a resposta de "${t.q.slice(0, 40)}" difere entre tela e marcação`);
  }
  for (const m of marcadas) {
    if (!naTela.find((t) => t.q === m.q)) erros.push(`${p}: "${m.q.slice(0, 50)}" está na marcação e NÃO na tela`);
  }

  // 🔒 regras da casa: sem preço e sem promessa que a empresa não pode cumprir
  for (const { q, r } of naTela) {
    const txt = `${q} ${r}`;
    if (/R\$\s*\d|por apenas|a partir de R/i.test(txt)) erros.push(`${p}: preço no texto das perguntas — "${q.slice(0, 40)}"`);
    if (/garantid[oa]|100% de|sempre recuperamos/i.test(txt)) erros.push(`${p}: promessa absoluta em "${q.slice(0, 40)}"`);
  }
}

console.log(`${PAGINAS.length} páginas · ${comFaq} com perguntas na tela`);
erros.forEach((e) => console.log('❌', e));
if (!erros.length) console.log('✅ o que o Google lê é exatamente o que está na tela');
process.exit(erros.length ? 1 : 0);
