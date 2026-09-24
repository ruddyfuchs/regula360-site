/**
 * A frase de consentimento dos formulários (LGPD) é UMA frase: caixinha à esquerda, texto
 * corrido à direita, com o link da política dentro dele — em qualquer largura de celular.
 *
 * 🟥 POR QUE ISTO EXISTE (24/09): o <label class="lgpd"> é flex, e texto e link soltos
 * dentro dele viram COLUNAS. No site da M5 o Ruddy viu no iPhone o link partido em
 * "privacidad / e"; aqui no Regula o mesmo: "Política de privacidade" numa colunazinha de
 * 60px ao lado do texto, nas 5 páginas com formulário.
 *
 * 🔑 A régua da M5 ("o link não passa de 2 linhas") NÃO pegaria o do Regula: a coluna daqui
 * tem exatamente 2 linhas. Por isso esta cobra a ESTRUTURA — o label tem só a caixinha e UM
 * bloco de texto — e confere na tela que o link está dentro desse bloco, não ao lado.
 *
 * Roda de onde o playwright estiver instalado:
 *   node caminho/para/scripts/prova-consentimento.mjs [endereço]
 */
import { abrirNavegador } from './navegador.mjs';

const BASE = process.argv[2] || 'https://www.regula360.com.br';
const PAGS = ['', 'diagnostico-e-painel', 'regularizacao-e-gestao-ativa', 'gestao-mensal-de-boletos', 'auditoria-e-recuperacao'];
const b = await abrirNavegador();
const erros = [];
let medidos = 0;
for (const larg of [320, 390, 1280]) {
  const p = await b.newPage({ viewport: { width: larg, height: 800 } });
  for (const pg of PAGS) {
    const nome = pg || 'home';
    await p.goto(`${BASE}/${pg}`, { waitUntil: 'load' });
    const r = await p.evaluate(() => [...document.querySelectorAll('label.lgpd')].map((l) => {
      const pedacos = [...l.childNodes].filter((n) => n.nodeType === 1 || n.textContent.trim());
      const a = l.querySelector('a'); const bloco = a && a.closest('label > :not(input)');
      const lb = l.getBoundingClientRect(), ab = a?.getBoundingClientRect(), bb = bloco?.getBoundingClientRect();
      return {
        pedacos: pedacos.map((n) => n.nodeType === 1 ? n.tagName.toLowerCase() : 'texto solto'),
        linkNoBloco: !!(bloco && ab.left >= bb.left - 1 && ab.right <= bb.right + 1),
        larguraBloco: bb ? Math.round(100 * bb.width / lb.width) : 0,
      };
    }));
    if (!r.length) { erros.push(`${nome}: nenhum label.lgpd — a prova não está olhando o formulário`); continue; }
    for (const x of r) {
      medidos++;
      if (x.pedacos.length !== 2 || x.pedacos[0] !== 'input') erros.push(`${nome} ${larg}px: o aviso tem ${x.pedacos.length} pedaços (${x.pedacos.join(', ')}) — cada pedaço solto vira uma coluna`);
      else if (!x.linkNoBloco || x.larguraBloco < 70) erros.push(`${nome} ${larg}px: o link da política não corre junto do texto (bloco com ${x.larguraBloco}% da largura)`);
    }
  }
  await p.close();
}
await b.close();
console.log(`${medidos} avisos de consentimento medidos (5 páginas × 320, 390 e 1280px)`);
if (erros.length) { console.log(`❌ ${erros.length} problemas:`); erros.forEach((e) => console.log('   ', e)); process.exit(1); }
console.log('✅ a frase de consentimento é uma frase só, com o link dentro dela, em qualquer largura');
