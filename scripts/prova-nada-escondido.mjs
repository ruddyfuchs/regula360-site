/**
 * Nada do conteúdo fica invisível para sempre: nem para quem roda JavaScript (depois de
 * rolar a página), nem para quem não roda.
 *
 * 🪤 NO REGULA (24/09): sem JavaScript, os 3 passos de "como funciona" da home ficavam
 * invisíveis (.tl-item.rev com opacity:0 até o script revelar). Trazida do site da M5, onde:
 *
 * 🟥 POR QUE ISTO EXISTE (24/09): a foto de 8 páginas (as 5 de serviço, Serviços,
 * Contato e Onde atendemos) NUNCA apareceu para ninguém. Ela começava recortada a
 * largura zero para "abrir" quando entrasse na tela — e o Chrome não conta como "na
 * tela" um elemento de área visível zero. O observador nunca disparava, a imagem nem
 * era baixada, e o lado direito da página ficava em branco. Todas as provas estavam
 * verdes: mediam alinhamento, rede, WhatsApp — nenhuma perguntava "dá para VER?".
 * Sem JavaScript era pior: de 25 a 55 itens invisíveis por página.
 *
 * 🔑 A pergunta é a do visitante, não a do código: depois de rolar até o fim, sobra
 * alguma foto, título, parágrafo ou botão com opacidade zero ou recortado a nada?
 *
 * Roda de onde o playwright estiver instalado:
 *   node caminho/para/scripts/prova-nada-escondido.mjs [endereço]
 */
import { abrirNavegador } from './navegador.mjs';

const BASE = process.argv[2] || 'https://www.regula360.com.br';
const PAGS = ['', 'diagnostico-e-painel', 'regularizacao-e-gestao-ativa', 'gestao-mensal-de-boletos', 'auditoria-e-recuperacao', 'privacidade'];
const MINIMO = 5; // itens medidos por página, no mínimo (o Contato, quase só formulário, tem 7)

const b = await abrirNavegador();
const erros = [];
let medidos = 0;

for (const js of [true, false]) {
  const modo = js ? 'com JavaScript' : 'sem JavaScript';
  const ctx = await b.newContext({ javaScriptEnabled: js, viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  for (const pg of PAGS) {
    const nome = pg || 'home';
    await p.goto(`${BASE}/${pg}`, { waitUntil: 'load' });
    if (js) {
      // rola como uma pessoa: em passos, dando tempo às animações de entrada
      const altura = await p.evaluate(() => document.body.scrollHeight);
      // 🪤 24/09: em saltos de 500px a cada 90 ms, na máquina LENTA do GitHub (motor do
      // iPhone), um texto entrava e saía da tela entre dois quadros e o navegador nunca
      // registrava que ele passou — ficava transparente e a prova acusava 31 na home. Uma
      // pessoa não rola assim. Agora: meia tela por vez, esperando o navegador DESENHAR
      // (dois quadros) antes do próximo passo.
      const passo = Math.round(844 / 2);
      for (let y = 0; y <= altura + passo; y += passo) {
        await p.evaluate((yy) => new Promise((ok) => { scrollTo(0, yy); requestAnimationFrame(() => requestAnimationFrame(ok)); }), y);
        await p.waitForTimeout(120);
      }
      await p.waitForTimeout(1600);
    } else await p.waitForTimeout(2500); // animações só de CSS (o título do topo) terminam
    const r = await p.evaluate(() => {
      const escondidos = []; let vistos = 0;
      for (const el of document.body.querySelectorAll('img, [role=img], h1, h2, h3, p, a.btn')) {
        const s = getComputedStyle(el); const box = el.getBoundingClientRect();
        if (box.width < 20 || box.height < 10 || s.display === 'none' || s.visibility === 'hidden') continue;
        if (el.closest('#lgpd, [role=dialog], dialog, [hidden], noscript')) continue; // aviso de cookies e o que só abre por clique
        vistos++;
        let o = 1; for (let e = el; e && e !== document.body; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
        const recortado = /inset\(\s*0(px)?\s+100%/.test(s.clipPath);
        const imagemVazia = el.tagName === 'IMG' && !(el.complete && el.naturalWidth > 0);
        if (o < 0.05 || recortado || imagemVazia) {
          escondidos.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''} (${o < 0.05 ? 'transparente' : recortado ? 'recortado a nada' : 'imagem não carregou'})`);
        }
      }
      return { vistos, escondidos };
    });
    medidos += r.vistos;
    if (r.vistos < MINIMO) erros.push(`${nome}, ${modo}: só ${r.vistos} itens medidos — a prova não está olhando a página`);
    const unicos = [...new Set(r.escondidos)];
    if (unicos.length) erros.push(`${nome}, ${modo}: ${r.escondidos.length} invisíveis — ${unicos.slice(0, 3).join(' · ')}`);
  }
  await ctx.close();
}
await b.close();

console.log(`${PAGS.length} páginas × com e sem JavaScript · ${medidos} itens medidos`);
if (erros.length) {
  console.log(`❌ ${erros.length} problemas:`);
  erros.forEach((e) => console.log('   ', e));
  process.exit(1);
}
console.log('✅ nada fica invisível: fotos, títulos, textos e botões aparecem, com ou sem JavaScript');
