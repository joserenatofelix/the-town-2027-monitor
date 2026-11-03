export const CONFIG = { url: "https://thetown.com.br/pt/" };

const palavrasRelevantes = [
  "ingressos",
  "venda",
  "pré-venda",
  "pre-venda",
  "ticketmaster",
  "2027",
  "04/09/2027",
  "4 de setembro",
  "slipknot",
  "marilyn manson",
];

const indicadoresVenda = [
  "vendas abertas",
  "ingressos a venda",
  "ingressos disponiveis",
  "venda iniciada",
  "compre agora",
  "comprar ingresso",
  "garanta seu ingresso",
  "garanta ja seu ingresso",
];

const indicadoresIndisponibilidade = [
  "ingressos indisponiveis",
  "ingressos esgotados",
  "vendas encerradas",
];

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function extrairTexto(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_entity, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/\s+/g, " ")
    .trim();
}


export async function verificarPagina() {
  const base = {
    url: CONFIG.url,
    modo: "sob-demanda",
    ultimaConsulta: new Date().toISOString(),
    palavrasEncontradas: [] as string[],
    sinalVenda: false,
    situacaoIngressos: "nao-confirmado",
  };
  try {
    const resposta = await fetch(CONFIG.url, {
      headers: {
        "User-Agent": "TheTownMonitor/1.0",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!resposta.ok) throw new Error("Falha na página oficial");
    const texto = normalizarTexto(extrairTexto(await resposta.text()));
    const palavrasEncontradas = palavrasRelevantes.filter(palavra =>
      texto.includes(normalizarTexto(palavra)));
    const indisponivel = indicadoresIndisponibilidade.some(indicador => texto.includes(indicador));
    const sinalVenda = !indisponivel && indicadoresVenda.some(indicador => texto.includes(indicador));
    return {
      ...base,
      ultimaConsulta: new Date().toISOString(),
      fase: "checked",
      mensagem: "Consulta concluída. Os sinais encontrados não confirmam disponibilidade; confira o site oficial.",
      palavrasEncontradas,
      sinalVenda,
      situacaoIngressos: indisponivel ? "indisponivel" : sinalVenda ? "disponivel" : "nao-confirmado",
    };
  } catch {
    return {
      ...base,
      fase: "error",
      mensagem: "Não foi possível consultar a página oficial. Tente novamente mais tarde.",
    };
  }
}
