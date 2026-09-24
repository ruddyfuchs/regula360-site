/**
 * Qual navegador abre as provas. NAVEGADOR=webkit roda no motor do Safari — o do iPhone,
 * e o do navegador de dentro do WhatsApp e do LinkedIn no iPhone. Sem nada, o Chrome.
 *
 * 🪤 POR QUE (24/09): no iPhone do Ruddy, pelo WhatsApp, a frase de consentimento do
 * formulário da campanha saiu partida em colunas. O defeito existia também no Chrome,
 * mas até ali um defeito só-de-iPhone só apareceria quando ele testasse no aparelho.
 *
 * 🔑 A prova IMPRIME em que motor rodou. Régua que não diz onde rodou não denuncia a si
 * mesma: um "teste de iPhone" que caiu calado no Chrome daria verde sem ter visto iPhone.
 * Valor desconhecido é ERRO, nunca um Chrome por engano.
 */
import { chromium, webkit } from 'playwright';

const pedido = (process.env.NAVEGADOR || 'chrome').toLowerCase();
if (!['chrome', 'webkit'].includes(pedido)) {
  console.log(`❌ NAVEGADOR="${process.env.NAVEGADOR}" não existe — use chrome ou webkit`);
  process.exit(1);
}
export const MOTOR = pedido === 'webkit' ? 'WebKit (Safari do iPhone)' : 'Chrome';

export async function abrirNavegador() {
  const b = pedido === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome' });
  console.log(`motor: ${MOTOR} ${b.version()}`);
  return b;
}
