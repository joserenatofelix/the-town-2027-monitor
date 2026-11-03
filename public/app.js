const statusLabels = {
  waiting: "Aguardando consulta",
  checking: "Verificando página",
  checked: "Consulta concluída",
  unchanged: "Consulta concluída",
  changed: "Alteração detectada",
  error: "Falha na consulta",
};

const elements = {
  button: document.querySelector("#check-button"),
  dot: document.querySelector("#status-dot"),
  label: document.querySelector("#status-label"),
  message: document.querySelector("#status-message"),
  lastCheck: document.querySelector("#last-check"),
  interval: document.querySelector("#interval"),
  keywords: document.querySelector("#keywords"),
  toast: document.querySelector("#toast"),
  ticketAlert: document.querySelector("#ticket-alert"),
  ticketAlertMessage: document.querySelector("#ticket-alert-message"),
  ticketAlertDetail: document.querySelector("#ticket-alert-detail"),
};

let toastTimeout;

function formatarData(data) {
  if (!data) return "Ainda não consultada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(data));
}

function mostrarToast(mensagem) {
  elements.toast.textContent = mensagem;
  elements.toast.classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => elements.toast.classList.remove("is-visible"), 3200);
}

function atualizarRelogio() {
  const agora = new Date();
  document.querySelector("#current-clock").textContent = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(agora);
  document.querySelector("#current-date").textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(agora);
}

function desenharStatus(status) {
  elements.label.textContent = statusLabels[status.fase] ?? "Status desconhecido";
  elements.message.textContent = status.mensagem;
  elements.lastCheck.textContent = formatarData(status.ultimaConsulta);
  elements.interval.textContent = "Sob demanda";
  elements.dot.className = `status-dot ${status.fase === "checking" ? "is-checking" : ""} ${["checked", "unchanged"].includes(status.fase) ? "is-good" : ""} ${status.fase === "changed" ? "is-changed" : ""} ${status.fase === "error" ? "is-error" : ""}`;
  elements.button.disabled = status.fase === "checking";
  elements.button.querySelector("span").textContent = status.fase === "checking" ? "Consultando..." : "Verificar agora";

  const situacao = status.situacaoIngressos ?? "nao-confirmado";
  elements.ticketAlert.className = `ticket-alert ${situacao === "disponivel" ? "is-available" : situacao === "indisponivel" ? "is-unavailable" : "is-unknown"}`;
  if (situacao === "disponivel") {
    elements.ticketAlertMessage.textContent = "Possível sinal de venda";
    elements.ticketAlertDetail.textContent = "Sinal encontrado no texto; confirme no site oficial";
  } else if (situacao === "indisponivel") {
    elements.ticketAlertMessage.textContent = "Ingressos indisponíveis para venda!";
    elements.ticketAlertDetail.textContent = "Aviso explícito encontrado na página oficial";
  } else {
    elements.ticketAlertMessage.textContent = "Disponibilidade não confirmada";
    elements.ticketAlertDetail.textContent = "A página não trouxe um sinal conclusivo";
  }

  elements.keywords.replaceChildren();
  if (status.palavrasEncontradas?.length) {
    for (const palavra of status.palavrasEncontradas) {
      const tag = document.createElement("span");
      tag.textContent = palavra;
      elements.keywords.append(tag);
    }
  } else {
    const vazio = document.createElement("span");
    vazio.className = "muted";
    vazio.textContent = status.fase === "waiting" ? "Aguardando consulta" : "Nenhuma palavra encontrada";
    elements.keywords.append(vazio);
  }
}

async function carregarStatus(manual = false) {
  elements.button.disabled = true;
  elements.button.querySelector("span").textContent = "Consultando...";
  elements.label.textContent = "Verificando página";
  elements.message.textContent = "Consultando a página oficial...";
  elements.dot.className = "status-dot is-checking";
  try {
    const resposta = await fetch(manual ? "/api/check" : "/api/status", {
      method: manual ? "POST" : "GET",
      cache: "no-store",
    });
    const status = await resposta.json();
    if (!resposta.ok && status.fase !== "error") throw new Error("Falha na API");
    desenharStatus(status);
    if (manual) mostrarToast(status.fase === "error" ? status.mensagem : "Verificação concluída.");
  } catch {
    elements.label.textContent = "Monitor indisponível";
    elements.message.textContent = "Não foi possível consultar a API. Tente novamente em instantes.";
    elements.dot.className = "status-dot is-error";
  } finally {
    elements.button.disabled = false;
    elements.button.querySelector("span").textContent = "Verificar agora";
  }
}

elements.button.addEventListener("click", () => { void carregarStatus(true); });
atualizarRelogio();
setInterval(atualizarRelogio, 1000);
void carregarStatus();
