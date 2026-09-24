/**
 * O site da Regula aponta para o Perfil da Empresa no Google, em todo lugar onde se
 * apresenta como empresa — e nenhum dado estruturado está quebrado.
 *
 * 🪤 POR QUE ISTO EXISTE (23/09): o perfil da Regula foi criado hoje e o site não dizia
 * ao Google que os dois eram a mesma empresa. O `sameAs` com o CID é esse elo. Veio do
 * site da M5, onde a mesma régua achou o site e o perfil se contradizendo no horário.
 *
 * 🔑 Dado de negócio quebra em SILÊNCIO: um JSON-LD com vírgula a mais não aparece na
 * tela, não derruba a página e não acende alarme — o Google só ignora o bloco inteiro.
 * Por isso a primeira coisa que a prova faz é dar parse.
 *
 *   node scripts/prova-dados-do-negocio.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
// o fato, escrito UMA vez, aqui
const PERFIL_GOOGLE = 'https://maps.google.com/?cid=14763954742094493269';

const erros = [];
const paginas = readdirSync(RAIZ).filter((f) => f.endsWith('.html'));
let nos = 0;

const andar = (n, visita) => {
  if (Array.isArray(n)) return n.forEach((x) => andar(x, visita));
  if (n && typeof n === 'object') { visita(n); Object.values(n).forEach((v) => andar(v, visita)); }
};

for (const p of paginas) {
  const html = readFileSync(join(RAIZ, p), 'utf8');
  for (const [, cru] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let dados;
    try { dados = JSON.parse(cru); } catch (e) {
      erros.push(`${p}: um bloco de dados estruturados não é JSON válido (${e.message.slice(0, 60)}) — o Google ignora o bloco inteiro, em silêncio`);
      continue;
    }
    andar(dados, (no) => {
      // nota quem dá é o cliente, no perfil; nota declarada no código o Google pune
      if (no.aggregateRating) erros.push(`${p}: declara aggregateRating no código`);
      if (no['@type'] !== 'ProfessionalService') return;
      nos++;
      if (![].concat(no.sameAs || []).includes(PERFIL_GOOGLE)) {
        erros.push(`${p}: ProfessionalService sem o Perfil da Empresa no sameAs — o Google não liga este site àquele perfil`);
      }
    });
  }
}

if (!nos) erros.push('nenhuma página se declara ProfessionalService');

console.log(`${paginas.length} páginas · ${nos} nós ProfessionalService`);
if (erros.length) {
  console.log(`❌ ${erros.length} problemas:`);
  erros.forEach((e) => console.log('   ', e));
  process.exit(1);
}
console.log('✅ todo nó da empresa aponta para o perfil do Google, e os dados estruturados estão íntegros');
