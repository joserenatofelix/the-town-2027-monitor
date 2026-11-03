import "dotenv/config";
import crypto from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import notifier from "node-notifier";
import nodemailer from "nodemailer";
import open from "open";

const CONFIG = {
  url: "https://thetown.com.br/pt/",
  intervaloMinutos: 30,
  arquivoEstado: "./estado.json",
  arquivoPreferencias: "./preferencias.json",
  porta: 4173,
};

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

interface Estado {
  hash: string;
  data: string;
  vendaNotificada?: boolean;
}

interface Preferencias {
  quantidade: number;
  tipoIngresso: "meia" | "inteira";
  email: string;
  whatsapp: string;
  avisarEmail: boolean;
  avisarWhatsapp: boolean;
}

const preferenciasPadrao: Preferencias = {
  quantidade: 2,
  tipoIngresso: "meia",
  email: "",
  whatsapp: "",
  avisarEmail: false,
  avisarWhatsapp: false,
}

type Fase = "waiting" | "checking" | "unchanged" | "changed" | "error";

interface StatusMonitor {
  fase: Fase;
  ultimaConsulta: string | null;
  ultimaAlteracao: string | null;
  mensagem: string;
  palavrasEncontradas: string[];
  sinalVenda: boolean;
  situacaoIngressos: "disponivel" | "indisponivel" | "nao-confirmado";
  statusNotificacoes: string;
}

const statusMonitor: StatusMonitor = {
  fase: "waiting",
  ultimaConsulta: null,
  ultimaAlteracao: null,
  mensagem: "Aguardando a primeira consulta.",
  palavrasEncontradas: [],
  sinalVenda: false,
  situacaoIngressos: "nao-confirmado",
  statusNotificacoes: "Configure os canais para receber alertas externos.",
};

async function carregarEstado(): Promise<Estado | null> {
  try {
    const conteudo = await fs.readFile(CONFIG.arquivoEstado, "utf8");
    const estado: unknown = JSON.parse(conteudo);

    if (
      typeof estado === "object" &&
      estado !== null &&
      "hash" in estado &&
      typeof estado.hash === "string" &&
      "data" in estado &&
      typeof estado.data === "string" &&
      (!("vendaNotificada" in estado) || typeof estado.vendaNotificada === "boolean")
    ) {
      return {
        hash: estado.hash,
        data: estado.data,
        vendaNotificada:
          "vendaNotificada" in estado && typeof estado.vendaNotificada === "boolean"
            ? estado.vendaNotificada
            : false,
      };
    }
  } catch {
    return null;
  }

  return null;
}

async function carregarPreferencias(): Promise<Preferencias> {
  try {
    const conteudo = await fs.readFile(CONFIG.arquivoPreferencias, "utf8");
    const valor: unknown = JSON.parse(conteudo);
    if (typeof valor !== "object" || valor === null) return preferenciasPadrao;

    const dados = valor as Partial<Preferencias>;
    return {
      quantidade:
        Number.isInteger(dados.quantidade) && dados.quantidade! >= 1 && dados.quantidade! <= 10
          ? dados.quantidade!
          : preferenciasPadrao.quantidade,
      tipoIngresso: dados.tipoIngresso === "inteira" ? "inteira" : "meia",
      email: typeof dados.email === "string" ? dados.email : "",
      whatsapp: typeof dados.whatsapp === "string" ? dados.whatsapp : "",
      avisarEmail: dados.avisarEmail === true,
      avisarWhatsapp: dados.avisarWhatsapp === true,
    };
  } catch {
    return { ...preferenciasPadrao };
  }
}

async function salvarPreferencias(preferencias: Preferencias): Promise<void> {
  const arquivoTemporario = `${CONFIG.arquivoPreferencias}.tmp`;
  await fs.writeFile(arquivoTemporario, JSON.stringify(preferencias, null, 2), "utf8");
  await fs.rename(arquivoTemporario, CONFIG.arquivoPreferencias);
}

function configuracaoNotificacoes() {
  return {
    email: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    whatsapp: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN &&
        process.env.WHATSAPP_PHONE_NUMBER_ID &&
        process.env.WHATSAPP_TEMPLATE_NAME &&
        process.env.WHATSAPP_API_VERSION,
    ),
  };
}

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

async function enviarEmail(destinatario: string, quantidade: number, tipoIngresso: string): Promise<void> {
  const porta = Number(process.env.SMTP_PORT || 587);
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: porta,
    secure: process.env.SMTP_SECURE === "true" || porta === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporte.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: destinatario,
    subject: "Possível abertura de vendas: The Town 2027",
    text: `O monitor encontrou um possível sinal de venda na página oficial do The Town. Preferência cadastrada: ${quantidade} ingresso(s), ${tipoIngresso}. Isso não confirma disponibilidade. Confira: ${CONFIG.url}`,
  });
}

async function enviarWhatsApp(destinatario: string, quantidade: number, tipoIngresso: string): Promise<void> {
  const versao = process.env.WHATSAPP_API_VERSION;
  const numeroId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const nomeModelo = process.env.WHATSAPP_TEMPLATE_NAME;

  const resposta = await fetch(`https://graph.facebook.com/${versao}/${numeroId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: destinatario.replace(/\D/g, ""),
      type: "template",
      template: {
        name: nomeModelo,
        language: { code: "pt_BR" },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: `${quantidade} ingresso(s), ${tipoIngresso}. Confira manualmente: ${CONFIG.url}`,
              },
            ],
          },
        ],
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resposta.ok) {
    throw new Error(`WhatsApp Cloud API retornou HTTP ${resposta.status}`);
  }
}

async function enviarAlertasVenda(preferencias: Preferencias): Promise<string> {
  const canais = configuracaoNotificacoes();
  const resultados: string[] = [];

  if (preferencias.avisarEmail && preferencias.email && canais.email) {
    try {
      await enviarEmail(preferencias.email, preferencias.quantidade, preferencias.tipoIngresso);
      resultados.push("e-mail enviado");
    } catch (erro) {
      resultados.push(`falha no e-mail: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  } else if (preferencias.avisarEmail) {
    resultados.push("e-mail aguardando endereço e configuração SMTP");
  }

  if (preferencias.avisarWhatsapp && preferencias.whatsapp && canais.whatsapp) {
    try {
      await enviarWhatsApp(preferencias.whatsapp, preferencias.quantidade, preferencias.tipoIngresso);
      resultados.push("WhatsApp enviado");
    } catch (erro) {
      resultados.push(`falha no WhatsApp: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  } else if (preferencias.avisarWhatsapp) {
    resultados.push("WhatsApp aguardando número e configuração Cloud API");
  }

  return resultados.length ? resultados.join("; ") : "Nenhum canal externo ativado.";
}

async function salvarEstado(estado: Estado): Promise<void> {
  const arquivoTemporario = `${CONFIG.arquivoEstado}.tmp`;
  await fs.writeFile(arquivoTemporario, JSON.stringify(estado, null, 2), "utf8");
  await fs.rename(arquivoTemporario, CONFIG.arquivoEstado);
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

function gerarHash(texto: string): string {
  return crypto.createHash("sha256").update(texto).digest("hex");
}

function notificar(titulo: string, mensagem: string): void {
  notifier.notify({
    title: titulo,
    message: mensagem,
    sound: true,
    wait: false,
  });
}

async function verificarPagina(): Promise<void> {
  if (statusMonitor.fase === "checking") {
    return;
  }

  statusMonitor.fase = "checking";
  statusMonitor.mensagem = "Consultando a página oficial...";

  try {
    console.log(`[${new Date().toLocaleString("pt-BR")}] Consultando página...`);

    const resposta = await fetch(CONFIG.url, {
      headers: {
        "User-Agent": "TheTownMonitor/1.0",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    const texto = extrairTexto(await resposta.text());
    const hashAtual = gerarHash(texto);
    const estadoAnterior = await carregarEstado();
    const textoMinusculo = texto.toLocaleLowerCase("pt-BR");
    const encontrados = palavrasRelevantes.filter((palavra) =>
      textoMinusculo.includes(palavra.toLocaleLowerCase("pt-BR")),
    );
    const textoNormalizado = normalizarTexto(texto);
    const sinalEncontrado = indicadoresVenda.some((indicador) =>
      textoNormalizado.includes(indicador),
    );
    const indisponibilidadeEncontrada = indicadoresIndisponibilidade.some((indicador) =>
      textoNormalizado.includes(indicador),
    );
    const agora = new Date().toISOString();
    statusMonitor.ultimaConsulta = agora;
    statusMonitor.palavrasEncontradas = encontrados;
    statusMonitor.sinalVenda = sinalEncontrado;
    statusMonitor.situacaoIngressos = indisponibilidadeEncontrada
      ? "indisponivel"
      : sinalEncontrado
        ? "disponivel"
        : "nao-confirmado";

    if (!estadoAnterior) {
      statusMonitor.fase = "unchanged";
      statusMonitor.mensagem = "Consulta inicial concluída; referência salva.";
      console.log("Primeira consulta concluída. Estado inicial salvo.");
    } else if (estadoAnterior.hash !== hashAtual) {
      console.log("A página apresentou uma alteração.");
      statusMonitor.fase = "changed";
      statusMonitor.ultimaAlteracao = agora;
      statusMonitor.mensagem = "A página mudou. Confira o site oficial.";
      notificar(
        "The Town 2027: página alterada",
        "Houve uma mudança no site oficial. Confira a página manualmente.",
      );
      await open(CONFIG.url);
    } else {
      statusMonitor.fase = "unchanged";
      statusMonitor.mensagem = "Nenhuma alteração detectada na página.";
      console.log("Nenhuma alteração detectada.");
    }

    const vendaJaNotificada = estadoAnterior?.vendaNotificada === true;
    let vendaNotificada = vendaJaNotificada;
    if (sinalEncontrado && !vendaJaNotificada) {
      const preferencias = await carregarPreferencias();
      statusMonitor.mensagem = "Possível sinal de venda encontrado; confirme no site oficial.";
      statusMonitor.statusNotificacoes = await enviarAlertasVenda(preferencias);
      notificar(
        "The Town 2027: possível sinal de venda",
        "A página contém um possível aviso de venda. Confira manualmente; disponibilidade não confirmada.",
      );
      statusMonitor.fase = "changed";
      vendaNotificada = true;
    }

    await salvarEstado({ hash: hashAtual, data: agora, vendaNotificada });

    console.log("Palavras encontradas:", encontrados.join(", ") || "nenhuma");
    if (sinalEncontrado) {
      console.log("Possível sinal de venda encontrado; confirme manualmente.");
    }
    console.log("Consulta concluída.");
  } catch (erro: unknown) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    statusMonitor.fase = "error";
    statusMonitor.ultimaConsulta = new Date().toISOString();
    statusMonitor.mensagem = mensagem;
    console.error("Erro no monitor:", mensagem);
  }
}

function responderJson(resposta: ServerResponse, codigo: number, dados: unknown): void {
  resposta.writeHead(codigo, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  resposta.end(JSON.stringify(dados));
}

async function lerJson(requisicao: IncomingMessage): Promise<unknown> {
  const partes: Buffer[] = [];
  let tamanho = 0;

  for await (const parte of requisicao) {
    const buffer = Buffer.isBuffer(parte) ? parte : Buffer.from(parte);
    tamanho += buffer.length;
    if (tamanho > 10_000) throw new Error("Corpo da requisição muito grande.");
    partes.push(buffer);
  }

  return JSON.parse(Buffer.concat(partes).toString("utf8"));
}

async function atenderRequisicao(
  requisicao: IncomingMessage,
  resposta: ServerResponse,
): Promise<void> {
  const url = new URL(requisicao.url ?? "/", `http://127.0.0.1:${CONFIG.porta}`);

  if (url.pathname === "/api/status" && requisicao.method === "GET") {
    responderJson(resposta, 200, {
      ...statusMonitor,
      url: CONFIG.url,
      intervaloMinutos: CONFIG.intervaloMinutos,
    });
    return;
  }

  if (url.pathname === "/api/settings" && requisicao.method === "GET") {
    responderJson(resposta, 200, {
      preferencias: await carregarPreferencias(),
      canaisConfigurados: configuracaoNotificacoes(),
    });
    return;
  }

  if (url.pathname === "/api/settings" && requisicao.method === "POST") {
    let dados: unknown;
    try {
      dados = await lerJson(requisicao);
    } catch {
      responderJson(resposta, 400, { erro: "Envie configurações válidas em JSON." });
      return;
    }

    if (typeof dados !== "object" || dados === null) {
      responderJson(resposta, 400, { erro: "Configurações inválidas." });
      return;
    }

    const entrada = dados as Partial<Preferencias>;
    const email = typeof entrada.email === "string" ? entrada.email.trim() : "";
    const whatsapp = typeof entrada.whatsapp === "string" ? entrada.whatsapp.trim() : "";
    const telefone = whatsapp.replace(/\D/g, "");

    if (!Number.isInteger(entrada.quantidade) || entrada.quantidade! < 1 || entrada.quantidade! > 10) {
      responderJson(resposta, 400, { erro: "A quantidade deve ser entre 1 e 10 ingressos." });
      return;
    }
    if (entrada.tipoIngresso !== "meia" && entrada.tipoIngresso !== "inteira") {
      responderJson(resposta, 400, { erro: "Selecione meia-entrada ou inteira." });
      return;
    }
    if (entrada.avisarEmail === true && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      responderJson(resposta, 400, { erro: "Informe um endereço de e-mail válido para ativar esse canal." });
      return;
    }
    if (entrada.avisarWhatsapp === true && (telefone.length < 10 || telefone.length > 15)) {
      responderJson(resposta, 400, { erro: "Informe o WhatsApp com código do país, DDD e número." });
      return;
    }

    const preferencias: Preferencias = {
      quantidade: entrada.quantidade!,
      tipoIngresso: entrada.tipoIngresso,
      email,
      whatsapp,
      avisarEmail: entrada.avisarEmail === true,
      avisarWhatsapp: entrada.avisarWhatsapp === true,
    };
    await salvarPreferencias(preferencias);
    responderJson(resposta, 200, {
      preferencias,
      canaisConfigurados: configuracaoNotificacoes(),
    });
    return;
  }

  if (url.pathname === "/api/check" && requisicao.method === "POST") {
    await verificarPagina();
    responderJson(resposta, 200, statusMonitor);
    return;
  }

  const arquivos: Record<string, { nome: string; tipo: string }> = {
    "/": { nome: "index.html", tipo: "text/html; charset=utf-8" },
    "/styles.css": { nome: "styles.css", tipo: "text/css; charset=utf-8" },
    "/app.js": { nome: "app.js", tipo: "text/javascript; charset=utf-8" },
  };
  const assetImagem = url.pathname === "/town-banner.png";
  const arquivo = arquivos[url.pathname];

  if (!arquivo && !assetImagem) {
    resposta.writeHead(404);
    resposta.end("Não encontrado");
    return;
  }

  try {
    const caminho = assetImagem
      ? path.join(process.cwd(), "fotos", "Captura de tela 2026-09-28 151601.png")
      : path.join(process.cwd(), "public", arquivo!.nome);
    const conteudo = await fs.readFile(caminho);
    resposta.writeHead(200, {
      "Content-Type": assetImagem ? "image/png" : arquivo!.tipo,
      "Cache-Control": "no-cache",
    });
    resposta.end(conteudo);
  } catch {
    resposta.writeHead(404);
    resposta.end("Arquivo do painel não encontrado");
  }
}

async function iniciar(): Promise<void> {
  console.log("Monitor The Town iniciado.");
  console.log("Página:", CONFIG.url);
  console.log(`Intervalo: ${CONFIG.intervaloMinutos} minutos`);

  const servidor = createServer((requisicao, resposta) => {
    void atenderRequisicao(requisicao, resposta).catch((erro: unknown) => {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      responderJson(resposta, 500, { erro: mensagem });
    });
  });

  servidor.listen(CONFIG.porta, "127.0.0.1", () => {
    const endereco = `http://127.0.0.1:${CONFIG.porta}`;
    console.log("Painel local:", endereco);
    void open(endereco);
  });

  await verificarPagina();
  setInterval(() => void verificarPagina(), CONFIG.intervaloMinutos * 60_000);
}

void iniciar();