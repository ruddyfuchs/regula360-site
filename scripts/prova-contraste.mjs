/**
 * Todo texto do site é legível, e o site inteiro passa no axe — a mesma engine de
 * acessibilidade que o Lighthouse e o Google usam.
 *
 * 🪤 POR QUE ISTO EXISTE (23/09): o Lighthouse reprovava 23 elementos por contraste, e
 * o pior era o "360" do logo NO RODAPÉ: azul escuro sobre fundo escuro, contraste 1,8.
 * O nome da empresa praticamente invisível, e ninguém tinha visto.
 *
 * 🔑 Nenhuma cor da marca foi trocada por outra. Em cada caso mexeu-se só na
 * luminosidade (ou na opacidade), mantendo matiz e saturação, parando no primeiro valor
 * que passa. A prova cobra o RESULTADO, não hexadecimais — não engessa o design.
 *
 * 🟥 DUAS COISAS ME PEGARAM AQUI, e as duas valem mais que o conserto:
 *
 * 1. A primeira tentativa de conserto FALHOU EM SILÊNCIO. Empilhei regras novas no fim
 *    do CSS e elas perderam: a do medidor perdeu por especificidade (a original tinha
 *    dois atributos, a minha tinha um) e a do valor perdeu para um `style=` inline no
 *    HTML. O CSS estava escrito, bonito, e sem efeito nenhum. Escrever regra não é
 *    aplicar cor: só medindo no navegador é que apareceu.
 *
 * 2. A primeira versão DESTA PROVA acusou 60 textos com o site já em 100 no Lighthouse.
 *    Eu tinha reimplementado o cálculo de contraste na mão, e a minha detecção de fundo
 *    errava em gradiente e em fundo herdado — texto claro sobre fundo escuro aparecia
 *    como 1,06:1. Régua que discorda da régua oficial e culpa o site está errada ela.
 *    Por isso agora roda o **axe-core**, a engine de verdade, em vez da minha conta.
 *
 * Precisa do axe.min.js ao lado (baixado uma vez) e do playwright:
 *   node caminho/para/scripts/prova-contraste.mjs [endereço] [caminho/axe.min.js]
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'https://www.regula360.com.br';
const AQUI = dirname(fileURLToPath(import.meta.url));
const AXE = process.argv[3] || join(AQUI, 'axe.min.js');
const PAGS = ['', 'diagnostico-e-painel', 'regularizacao-e-gestao-ativa',
  'gestao-mensal-de-boletos', 'auditoria-e-recuperacao', 'privacidade'];

if (!existsSync(AXE)) {
  console.log(`❌ não achei o axe.min.js em ${AXE}`);
  console.log('   baixe uma vez: curl -sL -o axe.min.js https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js');
  process.exit(1);
}
const fonte = readFileSync(AXE, 'utf8');

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const erros = [];
let medidos = 0;

for (const p of PAGS) {
  const nome = p || 'home';
  await page.goto(`${BASE}/${p}`, { waitUntil: 'load' });
  // 🪤 ESPERAR A ANIMAÇÃO TERMINAR. O aviso de cookies entra com transição de
  // opacidade, e medir no meio dela dava contraste 2,69 num botão que, parado, tem
  // 10,9 — o axe misturava o fundo do banner (ainda transparente) com o da página.
  // Era falso positivo do instrumento, não defeito do site.
  await page.waitForTimeout(600);
  await page.waitForFunction(() => {
    const emTransicao = [...document.querySelectorAll('[class*=lgpd],[class*=reveal],[style*=opacity]')]
      .some((e) => { const o = Number(getComputedStyle(e).opacity); return o > 0 && o < 1; });
    return !emTransicao;
  }, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  // 🪤 injetado como conteúdo, não por URL: a CSP do site é `script-src 'self'
  // 'unsafe-inline'` e recusaria um script de outro domínio.
  await page.addScriptTag({ content: fonte });

  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return res.violations.map((v) => ({
      id: v.id, help: v.help, n: v.nodes.length,
      exemplo: (v.nodes[0]?.html || '').replace(/\s+/g, ' ').slice(0, 80),
      porque: (v.nodes[0]?.any?.[0]?.message || v.nodes[0]?.failureSummary || '').slice(0, 110),
    }));
  });
  medidos++;
  for (const v of r) erros.push(`${nome}: ${v.help} — ${v.n} elemento(s) · ${v.exemplo} · ${v.porque}`);
}

await browser.close();
console.log(`${medidos} páginas medidas com axe-core (WCAG 2 A e AA)`);
if (erros.length) {
  console.log(`❌ ${erros.length} problemas:`);
  erros.forEach((e) => console.log('   ', e));
  process.exit(1);
}
console.log('✅ nenhuma violação de acessibilidade: contraste, rótulos e o resto');
