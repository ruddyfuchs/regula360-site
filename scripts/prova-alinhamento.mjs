/**
 * Nenhum bloco de conteúdo pode escapar da margem da página.
 *
 * 🪤 POR QUE ISTO EXISTE (24/09): no site da M5, o bloco de perguntas subiu encostado
 * na borda esquerda, 1905px numa tela de 1920px, e nenhuma régua viu: todas mediam
 * que o bloco APARECIA, nenhuma media ONDE. Medir que algo aparece não é medir que
 * está no lugar.
 *
 * 🟥 E A PRIMEIRA TENTATIVA DE TRAZER A PROVA PARA CÁ DEU VERDE SEM MEDIR NADA. A da M5
 * procura `[class*="-inner"], .container`; o Regula não usa nenhuma das duas, então
 * zero blocos, zero erros, "✅". Por isso esta aqui mira o que o SITE declara (todo
 * elemento cujo max-width é o `--container` da página: 1280px, ou 760px na
 * privacidade) e reprova se medir poucos blocos. Verde sem medir é o pior verde.
 *
 * Roda de onde o playwright estiver instalado:
 *   node caminho/para/scripts/prova-alinhamento.mjs [endereço]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'https://www.regula360.com.br';
const PAGS = ['', 'diagnostico-e-painel', 'regularizacao-e-gestao-ativa',
  'gestao-mensal-de-boletos', 'auditoria-e-recuperacao', 'privacidade'];
const JANELA = 1920;
const FOLGA = 40; // bordas arredondadas, sombras e faixas decorativas
const MINIMO = 3; // cabeçalho, uma seção e o rodapé, no mínimo

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: JANELA, height: 1000 } });
const page = await ctx.newPage();
const erros = [];
let blocos = 0;

for (const p of PAGS) {
  const nome = p || 'home';
  await page.goto(`${BASE}/${p}`, { waitUntil: 'load' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);

  const r = await page.evaluate((folga) => {
    const limite = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--container'));
    if (!limite) return { limite: 0, medidos: 0, fora: [] };
    const fora = [];
    let medidos = 0;
    for (const el of document.body.querySelectorAll('*')) {
      if (parseFloat(getComputedStyle(el).maxWidth) !== limite) continue;
      if (!el.checkVisibility || !el.checkVisibility({ visibilityProperty: true })) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 100) continue;
      medidos++;
      const centrado = Math.abs(b.left - (innerWidth - b.width) / 2) <= folga;
      if (b.width > limite + folga || !centrado) {
        fora.push({ cls: `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 30)}`, larg: Math.round(b.width), esq: Math.round(b.left) });
      }
    }
    return { limite, medidos, fora };
  }, FOLGA);

  blocos += r.medidos;
  if (!r.limite) erros.push(`${nome}: a página não declara --container — não há margem para conferir`);
  else if (r.medidos < MINIMO) erros.push(`${nome}: só ${r.medidos} bloco(s) com max-width ${r.limite}px — a prova não está medindo a página`);
  for (const f of r.fora) erros.push(`${nome}: ${f.cls} tem ${f.larg}px começando em ${f.esq}px — a página usa ${r.limite}px centrados`);
}

await browser.close();
console.log(`${PAGS.length} páginas medidas em ${JANELA}px · ${blocos} blocos`);
if (erros.length) {
  console.log(`❌ ${erros.length} problemas:`);
  erros.forEach((e) => console.log('   ', e));
  process.exit(1);
}
console.log('✅ nenhum bloco de conteúdo escapa da margem da página');
