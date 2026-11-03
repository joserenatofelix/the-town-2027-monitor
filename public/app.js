const statusLabels = {
  waiting: "Aguardando consulta",
  checking: "Verificando página",
  unchanged: "Monitor ativo",
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
  notice: document.querySelector("#change-notice"),
  toast: document.querySelector("#toast"),
  form: document.querySelector("#preferences-form"),
  quantity: document.querySelector("#quantity"),
  ticketSummary: document.querySelector("#ticket-summary"),
  emailEnabled: document.querySelector("#notify-email"),
  email: document.querySelector("#email-address"),
  emailReadiness: document.querySelector("#email-readiness"),
  whatsappEnabled: document.querySelector("#notify-whatsapp"),
  whatsapp: document.querySelector("#whatsapp-number"),
  whatsappReadiness: document.querySelector("#whatsapp-readiness"),
  preferencesMessage: document.querySelector("#preferences-message"),
  saveButton: document.querySelector(".save-button"),
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

function atualizarResumoIngresso() {
  const quantidade = Number(elements.quantity.value) || 1;
  const tipo = elements.form.querySelector('input[name="tipoIngresso"]:checked')?.value ?? "meia";
  elements.ticketSummary.textContent = `${quantidade} ${quantidade === 1 ? "ingresso" : "ingressos"} · ${tipo === "meia" ? "meia-entrada, se elegível" : "inteira"}`;
}

function atualizarCanais(canais) {
  const emailPronto = canais?.email === true;
  const whatsappPronto = canais?.whatsapp === true;
  elements.emailReadiness.textContent = emailPronto ? "SMTP configurado" : "SMTP pendente: configure no arquivo .env";
  elements.emailReadiness.className = `channel-readiness ${emailPronto ? "is-ready" : "is-pending"}`;
  elements.whatsappReadiness.textContent = whatsappPronto ? "WhatsApp Cloud API configurada" : "Pendente: token, número e modelo da Meta no .env";
  elements.whatsappReadiness.className = `channel-readiness ${whatsappPronto ? "is-ready" : "is-pending"}`;
}

async function carregarPreferencias() {
  try {
    const resposta = await fetch("/api/settings", { cache: "no-store" });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const dados = await resposta.json();
    const preferencias = dados.preferencias;
    elements.quantity.value = preferencias.quantidade;
    elements.form.querySelector(`input[name="tipoIngresso"][value="${preferencias.tipoIngresso}"]`).checked = true;
    elements.email.value = preferencias.email;
    elements.whatsapp.value = preferencias.whatsapp;
    elements.emailEnabled.checked = preferencias.avisarEmail;
    elements.whatsappEnabled.checked = preferencias.avisarWhatsapp;
    elements.email.required = elements.emailEnabled.checked;
    elements.whatsapp.required = elements.whatsappEnabled.checked;
    atualizarCanais(dados.canaisConfigurados);
    atualizarResumoIngresso();
  } catch {
    elements.preferencesMessage.textContent = "Não foi possível carregar as preferências locais.";
    elements.preferencesMessage.className = "form-message is-error";
  }
}

function desenharStatus(status) {
  elements.label.textContent = statusLabels[status.fase] ?? "Status desconhecido";
  elements.message.textContent = status.mensagem;
  elements.lastCheck.textContent = formatarData(status.ultimaConsulta);
  elements.interval.textContent = `A cada ${status.intervaloMinutos ?? 30} minutos`;
  elements.dot.className = `status-dot ${status.fase === "checking" ? "is-checking" : ""} ${status.fase === "unchanged" ? "is-good" : ""} ${status.fase === "changed" ? "is-changed" : ""} ${status.fase === "error" ? "is-error" : ""}`;
  elements.button.disabled = status.fase === "checking";
  elements.button.querySelector("span").textContent = status.fase === "checking" ? "Consultando..." : "Verificar agora";
  elements.notice.hidden = status.fase !== "changed";

  const situacao = status.situacaoIngressos ?? "nao-confirmado";
  elements.ticketAlert.className = `ticket-alert ${situacao === "disponivel" ? "is-available" : situacao === "indisponivel" ? "is-unavailable" : "is-unknown"}`;
  if (situacao === "disponivel") {
    elements.ticketAlertMessage.textContent = "Ingressos à venda!";
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

async function carregarStatus() {
  try {
    const resposta = await fetch("/api/status", { cache: "no-store" });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    desenharStatus(await resposta.json());
  } catch {
    elements.label.textContent = "Monitor indisponível";
    elements.message.textContent = "Confira se o processo npm start continua ativo.";
    elements.dot.className = "status-dot is-error";
  }
}

elements.button.addEventListener("click", async () => {
  elements.button.disabled = true;
  elements.button.querySelector("span").textContent = "Consultando...";
  try {
    const resposta = await fetch("/api/check", { method: "POST" });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const status = await resposta.json();
    desenharStatus(status);
    mostrarToast(status.fase === "changed" ? "Mudança detectada. Confira o site oficial." : "Verificação concluída.");
  } catch (erro) {
    mostrarToast(`Não foi possível verificar: ${erro.message}`);
    await carregarStatus();
  }
});

elements.quantity.addEventListener("input", atualizarResumoIngresso);
elements.form.querySelectorAll('input[name="tipoIngresso"]').forEach((opcao) => {
  opcao.addEventListener("change", atualizarResumoIngresso);
});
elements.emailEnabled.addEventListener("change", () => {
  elements.email.required = elements.emailEnabled.checked;
});
elements.whatsappEnabled.addEventListener("change", () => {
  elements.whatsapp.required = elements.whatsappEnabled.checked;
});

elements.form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  elements.saveButton.disabled = true;
  elements.preferencesMessage.textContent = "Salvando preferências...";
  elements.preferencesMessage.className = "form-message";

  const preferencias = {
    quantidade: Number(elements.quantity.value),
    tipoIngresso: elements.form.querySelector('input[name="tipoIngresso"]:checked').value,
    email: elements.email.value,
    whatsapp: elements.whatsapp.value,
    avisarEmail: elements.emailEnabled.checked,
    avisarWhatsapp: elements.whatsappEnabled.checked,
  };

  try {
    const resposta = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferencias),
    });
    const resultado = await resposta.json();
    if (!resposta.ok) throw new Error(resultado.erro ?? `HTTP ${resposta.status}`);

    atualizarCanais(resultado.canaisConfigurados);
    const pendencias = [];
    if (preferencias.avisarEmail && !resultado.canaisConfigurados.email) pendencias.push("SMTP");
    if (preferencias.avisarWhatsapp && !resultado.canaisConfigurados.whatsapp) pendencias.push("WhatsApp Cloud API");
    elements.preferencesMessage.textContent = pendencias.length
      ? `Preferências salvas localmente. Configure ${pendencias.join(" e ")} no .env para habilitar os envios.`
      : "Preferências salvas neste computador.";
    elements.preferencesMessage.className = `form-message ${pendencias.length ? "is-pending" : "is-success"}`;
    atualizarResumoIngresso();
  } catch (erro) {
    elements.preferencesMessage.textContent = erro.message;
    elements.preferencesMessage.className = "form-message is-error";
  } finally {
    elements.saveButton.disabled = false;
  }
});

atualizarRelogio();
setInterval(atualizarRelogio, 1000);
void carregarPreferencias();
void carregarStatus();
setInterval(carregarStatus, 4000);