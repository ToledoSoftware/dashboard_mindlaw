const chartState = { loss: null, closure: null, nps: null, churnReasons: null, clientEntradas: null, clientResumo: null, clientPlanos: null, clientEtapasResumo: null };
let currentFilters = {};
let currentClientList = [];
let currentClientRawList = [];
let editingClientId = null;
let lastCreatedClientName = "";
let rawLogsCache = [];
let interactiveFilter = null;
let clientsPage = 1;
let clientsPageSize = 25;
let clientsSearchTerm = "";
let selectedSupportMonth = null;
let logsFilterType = "";
let logsFilterPlan = "";
let logsSearchTerm = "";
let editingLog = null;
const LOG_DETAIL_PREVIEW_LIMIT = 220;

const CLIENT_STATUS_LABELS = {
  cliente: "Cliente (ativo)",
  pagamento_pendente: "Pagamento pendente",
  pagamento_recusado: "Pagamento recusado",
  cancelado: "Cancelado",
  novo_lead: "Novo lead"
};

const CLIENT_STATUS_CHART_ORDER = ["cliente", "pagamento_pendente", "pagamento_recusado", "cancelado", "novo_lead"];
const CLIENT_CHART_COLORS = {
  cliente: "#4ade80",
  pagamento_pendente: "#facc15",
  pagamento_recusado: "#fb923c",
  cancelado: "#f87171",
  novo_lead: "#60a5fa"
};
const PLAN_CHART_COLORS = {
  starter: "#60a5fa",
  premium: "#c5a059",
  advanced: "#34d399",
  outros: "#a78bfa",
  sem_plano: "#6b7280"
};

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3000);
}

function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem("mindlaw_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra
  };
}

async function request(url, options = {}) {
  try {
    const response = await fetch(url, {
      credentials: "include",
      ...options,
      headers: getAuthHeaders(options.headers || {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[MindLaw] API error", { url, status: response.status, data });
      if (response.status === 401) {
        localStorage.removeItem("mindlaw_token");
        window.location.href = "/login";
      }
      throw new Error(data.error || "Erro na requisição.");
    }
    return data;
  } catch (error) {
    console.error("[MindLaw] Network error", { url, options, error });
    throw error;
  }
}

const apiService = {
  commercialDashboard: (query = "") => request(`/api/commercial/dashboard${query}`),
  supportDashboard: (query = "") => request(`/api/support/dashboard${query}`),
  logs: (query = "") => request(`/api/logs${query}`),
  clients: (query = "") => request(`/api/clients${query}`),
  createClient: (payload) => request("/api/clients", { method: "POST", body: JSON.stringify(payload) }),
  updateClient: (id, payload) => request(`/api/clients/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  updateSale: (id, payload) => request(`/api/sales/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  updateSupport: (id, payload) => request(`/api/support/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteSale: (id) => request(`/api/sales/${id}`, { method: "DELETE" }),
  deleteSupport: (id) => request(`/api/support/${id}`, { method: "DELETE" }),
  createSale: (payload) => request("/api/sales", { method: "POST", body: JSON.stringify(payload) }),
  createChurn: (payload) => request("/api/support/churn", { method: "POST", body: JSON.stringify(payload) }),
  createNps: (payload) => request("/api/support/nps", { method: "POST", body: JSON.stringify(payload) }),
  logout: () => request("/api/auth/logout", { method: "POST" })
};

function switchTab(tabId) {
  ["resumo", "clientes", "comercial", "suporte", "lancamentos", "logs"].forEach((id) => {
    const view = document.getElementById(`view-${id}`);
    if (view) {
      view.classList.add("hidden");
      view.style.opacity = "0";
      view.style.transform = "translateY(8px)";
    }
  });
  const active = document.getElementById(`view-${tabId}`);
  if (active) {
    active.classList.remove("hidden");
    requestAnimationFrame(() => {
      active.style.opacity = "1";
      active.style.transform = "translateY(0)";
    });
  }

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.remove("bg-mindlaw-gold/10", "border-mindlaw-gold/50");
    btn.classList.add("border-transparent");
  });
  const selected = document.getElementById(`nav-${tabId}`);
  if (selected) {
    selected.classList.add("bg-mindlaw-gold/10", "border-mindlaw-gold/50");
    selected.classList.remove("border-transparent");
  }
  closeDrawer();
  localStorage.setItem("mindlaw_active_tab", tabId);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openDrawer() {
  document.getElementById("sidebar")?.classList.add("open");
  document.getElementById("drawer-backdrop")?.classList.remove("hidden");
}

function closeDrawer() {
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("drawer-backdrop")?.classList.add("hidden");
}

function toggleFiltersPanel() {
  document.getElementById("filters-panel")?.classList.toggle("hidden");
}

function renderSectionPeriodFilters() {
  const sections = ["resumo", "clientes", "comercial", "suporte", "lancamentos", "logs"];
  const monthOpts = `
    <option value="1">Jan</option><option value="2">Fev</option><option value="3">Mar</option>
    <option value="4">Abr</option><option value="5">Mai</option><option value="6">Jun</option>
    <option value="7">Jul</option><option value="8">Ago</option><option value="9">Set</option>
    <option value="10">Out</option><option value="11">Nov</option><option value="12">Dez</option>
  `;
  const nowYear = new Date().getFullYear();
  const yearOpts = Array.from({ length: 9 }, (_, i) => nowYear - 4 + i)
    .map((y) => `<option value="${y}">${y}</option>`)
    .join("");
  sections.forEach((sid) => {
    const section = document.getElementById(`view-${sid}`);
    if (!section) return;
    if (section.querySelector(`[data-section-period="${sid}"]`)) return;
    const holder = document.createElement("article");
    holder.className = "panel border-t-2 border-mindlaw-gold p-5";
    holder.setAttribute("data-section-period", sid);
    holder.innerHTML = `
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-xs uppercase tracking-[0.12em] text-mindlaw-white/65">Período</span>
        <div class="flex items-center gap-2 rounded-lg border border-white/20 p-2">
          <span class="px-2 text-xs text-mindlaw-white/60">De</span>
          <select id="period-from-month-${sid}" data-period-input="${sid}" class="input-ui !min-h-10 !w-[94px] !py-2">${monthOpts}</select>
          <select id="period-from-year-${sid}" data-period-input="${sid}" class="input-ui !min-h-10 !w-[100px] !py-2">${yearOpts}</select>
        </div>
        <div class="flex items-center gap-2 rounded-lg border border-white/20 p-2">
          <span class="px-2 text-xs text-mindlaw-white/60">Até</span>
          <select id="period-to-month-${sid}" data-period-input="${sid}" class="input-ui !min-h-10 !w-[94px] !py-2">${monthOpts}</select>
          <select id="period-to-year-${sid}" data-period-input="${sid}" class="input-ui !min-h-10 !w-[100px] !py-2">${yearOpts}</select>
        </div>
        <button data-extend-period="${sid}" class="rounded-lg border border-white/20 px-4 py-2.5 text-xs hover:border-mindlaw-gold/60">+ mês</button>
      </div>
    `;
    const title = section.querySelector("h2");
    if (title && title.parentNode) {
      title.insertAdjacentElement("afterend", holder);
    } else {
      section.prepend(holder);
    }
  });
}

function syncSectionPeriodInputs() {
  const sections = ["resumo", "clientes", "comercial", "suporte", "lancamentos", "logs"];
  const fromStart = currentFilters.startDate ? new Date(`${currentFilters.startDate}T00:00:00`) : null;
  const fromEnd = currentFilters.endDate ? new Date(`${currentFilters.endDate}T00:00:00`) : null;
  const startMonth = !fromStart || Number.isNaN(fromStart.getTime()) ? Number(currentFilters.month || new Date().getMonth() + 1) : fromStart.getMonth() + 1;
  const startYear = !fromStart || Number.isNaN(fromStart.getTime()) ? Number(currentFilters.year || new Date().getFullYear()) : fromStart.getFullYear();
  const endMonth = !fromEnd || Number.isNaN(fromEnd.getTime()) ? startMonth : fromEnd.getMonth() + 1;
  const endYear = !fromEnd || Number.isNaN(fromEnd.getTime()) ? startYear : fromEnd.getFullYear();
  sections.forEach((sid) => {
    const fM = document.getElementById(`period-from-month-${sid}`);
    const fY = document.getElementById(`period-from-year-${sid}`);
    const tM = document.getElementById(`period-to-month-${sid}`);
    const tY = document.getElementById(`period-to-year-${sid}`);
    if (fM) fM.value = String(startMonth);
    if (fY) fY.value = String(startYear);
    if (tM) tM.value = String(endMonth);
    if (tY) tY.value = String(endYear);
  });
}

function collectPeriodFiltersFromSection(sectionId) {
  const startMonth = Number(document.getElementById(`period-from-month-${sectionId}`)?.value || 0);
  const startYear = Number(document.getElementById(`period-from-year-${sectionId}`)?.value || 0);
  const endMonth = Number(document.getElementById(`period-to-month-${sectionId}`)?.value || 0);
  const endYear = Number(document.getElementById(`period-to-year-${sectionId}`)?.value || 0);
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date(endYear, endMonth, 0, 23, 59, 59, 999);
  const startDate = Number.isNaN(start.getTime()) ? "" : start.toISOString().slice(0, 10);
  const endDate = Number.isNaN(end.getTime()) ? "" : end.toISOString().slice(0, 10);
  const isSingleMonth = startMonth === endMonth && startYear === endYear;
  return {
    month: isSingleMonth ? String(startMonth) : "",
    year: isSingleMonth ? String(startYear) : "",
    startDate,
    endDate
  };
}

async function logout() {
  await apiService.logout();
  localStorage.removeItem("mindlaw_token");
  window.location.href = "/login";
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function includesSearch(client, term) {
  if (!term) return true;
  const base = normalizeText(term);
  const nome = normalizeText(client?.nome);
  const email = normalizeText(client?.email);
  const tel = String(client?.telefone || "").replace(/\D/g, "");
  const raw = String(term || "").replace(/\D/g, "");
  const phoneMatch = raw ? tel.includes(raw) : false;
  return nome.includes(base) || email.includes(base) || phoneMatch;
}

function formatPhoneBr(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 3) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function hasValidPhoneBr(value) {
  return String(value || "").replace(/\D/g, "").length === 11;
}

function setupPhoneMask(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.maxLength = 16;
  input.placeholder = "(xx) x xxxx-xxxx";
  input.addEventListener("input", () => {
    input.value = formatPhoneBr(input.value);
  });
  input.addEventListener("blur", () => {
    const formatted = formatPhoneBr(input.value);
    if (!formatted) {
      input.value = "";
      return;
    }
    if (!hasValidPhoneBr(formatted)) {
      toast("Telefone inválido. Use o padrão (xx) x xxxx-xxxx.");
      input.focus();
      return;
    }
    input.value = formatted;
  });
}

function getElapsedMonthsSince(cadastroDate) {
  if (!cadastroDate) return null;
  const start = new Date(cadastroDate);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  if (now <= start) return 0;
  let monthDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) monthDiff -= 1;
  return Math.max(0, monthDiff);
}

function getClienteEtapaMes(cadastroDate) {
  const elapsedMonths = getElapsedMonthsSince(cadastroDate);
  if (elapsedMonths === null) return null;
  return elapsedMonths + 1;
}

function formatClientTenure(cadastroDate) {
  const elapsedMonths = getElapsedMonthsSince(cadastroDate);
  if (elapsedMonths === null) return "Mês 1";
  if (elapsedMonths < 12) return `Mês ${elapsedMonths + 1}`;
  const years = Math.floor(elapsedMonths / 12);
  const months = elapsedMonths % 12;
  if (!months) return `${years} ano${years > 1 ? "s" : ""}`;
  return `${years} ano${years > 1 ? "s" : ""} e ${months} ${months === 1 ? "mês" : "meses"}`;
}

function getClientStageBaseDate(client) {
  return client?.dataReferencia || client?.createdAt || null;
}

function isMotivoComDetalhamento(value) {
  const normalized = normalizeText(value);
  return normalized === normalizeText("Falta de Funcionalidade")
    || normalized === normalizeText("Falta de Integracao")
    || normalized === normalizeText("Outros");
}

function updateFuncionalidadeFieldVisibility(prefix) {
  const motivo = document.getElementById(`${prefix}_motivo`)?.value || "";
  const wrapper = document.getElementById(`${prefix}_funcionalidade_wrap`);
  const input = document.getElementById(`${prefix}_funcionalidade_faltante`);
  const shouldShow = isMotivoComDetalhamento(motivo);
  if (wrapper) wrapper.classList.toggle("hidden", !shouldShow);
  if (!shouldShow && input) input.value = "";
}

async function copyText(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_error) {
    // fallback abaixo
  }
  const hiddenInput = document.createElement("textarea");
  hiddenInput.value = value;
  hiddenInput.setAttribute("readonly", "true");
  hiddenInput.style.position = "fixed";
  hiddenInput.style.opacity = "0";
  document.body.appendChild(hiddenInput);
  hiddenInput.select();
  const copied = document.execCommand("copy");
  hiddenInput.remove();
  return copied;
}

async function navigateToClientByName(clientName) {
  const nome = String(clientName || "").trim();
  if (!nome) return;
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  };
  clientsPage = 1;
  clientsSearchTerm = nome;
  setVal("filter-client-segment", "");
  setVal("filter-client-plan", "");
  setVal("filter-client-status", "");
  setVal("filter-client-stage", "");
  setVal("filter-client-sort-by", "cadastro");
  setVal("filter-client-sort-dir", "desc");
  setVal("filter-client-search", nome);
  currentFilters = {
    ...currentFilters,
    clientSegment: "",
    clientPlan: "",
    clientStatus: "",
    clientStage: "",
    sortBy: "cadastro",
    sortDir: "desc",
    clientSearch: nome
  };
  localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
  switchTab("clientes");
  await carregarTudo();
}

function renderComercialKpis(kpis) {
  document.getElementById("kpi-ltv").textContent = money(kpis.ltvEstimado || 0);
  document.getElementById("kpi-conv").textContent = `${(kpis.taxaConversao || 0).toFixed(1)}%`;
  document.getElementById("kpi-resumo-receita").textContent = money(kpis.ltvEstimado || 0);
}

function renderSupportKpis(kpis) {
  document.getElementById("kpi-churn").textContent = `${(kpis.churnRate || 0).toFixed(1)}%`;
  document.getElementById("kpi-nps").textContent = `${(kpis.npsScore || 0).toFixed(1)}`;
  document.getElementById("kpi-resumo-churn").textContent = `${(kpis.churnRate || 0).toFixed(1)}%`;
  document.getElementById("kpi-resumo-nps").textContent = `${(kpis.npsScore || 0).toFixed(1)}`;
}

function renderComercialCharts(commercial) {
  const funnel = commercial.funnel || {};
  const reasons = commercial.lossReasons || {};

  const funnelCtx = document.getElementById("chartFunnel").getContext("2d");
  const gainGradient = funnelCtx.createLinearGradient(0, 0, 0, 260);
  gainGradient.addColorStop(0, "#C5A059");
  gainGradient.addColorStop(1, "#92733C");
  if (chartState.closure) chartState.closure.destroy();
  chartState.closure = new Chart(funnelCtx, {
    type: "doughnut",
    data: {
      labels: ["Ganho", "Perdido", "Em Negociação"],
      datasets: [{
        data: [funnel.gains || 0, funnel.losses || 0, funnel.negotiating || 0],
        backgroundColor: [gainGradient, "#E7D4AB", "#5B4A27"],
        borderWidth: 0
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#FFFFFF" } } },
      onClick: (_evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        const labels = ["Ganho", "Perdido", "Em Negociação"];
        const selected = labels[idx];
        if (!selected) return;
        const key = normalizeText(selected);
        interactiveFilter = interactiveFilter?.type === "commercialStatus" && interactiveFilter?.value === key
          ? null
          : { type: "commercialStatus", value: key };
        renderLogsTable(rawLogsCache);
        switchTab("logs");
        toast(interactiveFilter ? `Filtro Comercial: ${selected}` : "Filtro Comercial removido.");
      }
    }
  });

  const reasonLabels = Object.keys(reasons);
  const reasonValues = Object.values(reasons);
  const lossCtx = document.getElementById("chartLoss").getContext("2d");
  if (chartState.loss) chartState.loss.destroy();

  const useBar = reasonLabels.length > 3;
  chartState.loss = new Chart(lossCtx, {
    type: useBar ? "bar" : "doughnut",
    data: {
      labels: reasonLabels.length ? reasonLabels : ["Sem dados"],
      datasets: [{
        data: reasonValues.length ? reasonValues : [1],
        backgroundColor: ["#C5A059", "#E7D4AB", "#92733C", "#6E562B"],
        borderWidth: useBar ? 1 : 0,
        borderRadius: useBar ? 8 : 0
      }]
    },
    options: {
      indexAxis: useBar ? "y" : "x",
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#FFFFFF" } } },
      onClick: (_evt, elements) => {
        if (!elements.length || !reasonLabels.length) return;
        const selected = reasonLabels[elements[0].index];
        if (!selected) return;
        const key = normalizeText(selected);
        interactiveFilter = interactiveFilter?.type === "commercialReason" && interactiveFilter?.value === key
          ? null
          : { type: "commercialReason", value: key };
        renderLogsTable(rawLogsCache);
        switchTab("logs");
        toast(interactiveFilter ? `Filtro Comercial (motivo): ${selected}` : "Filtro de motivo comercial removido.");
      },
      scales: useBar
        ? {
            x: { ticks: { color: "#FFFFFF" }, grid: { color: "rgba(255,255,255,0.1)" } },
            y: { ticks: { color: "#FFFFFF" }, grid: { color: "rgba(255,255,255,0.1)" } }
          }
        : {}
    }
  });
}

function buildClientStatsFromList(clients) {
  const byStatus = {};
  let total = 0;
  (Array.isArray(clients) ? clients : []).forEach((c) => {
    const st = c?.statusContrato || "cliente";
    byStatus[st] = (byStatus[st] || 0) + 1;
    total += 1;
  });
  return { byStatus, total };
}

function buildClientPlanStats(clients) {
  const byPlan = {};
  (Array.isArray(clients) ? clients : []).forEach((c) => {
    const raw = normalizeText(c?.plano || "");
    let key = "sem_plano";
    if (raw.includes("starter")) key = "starter";
    else if (raw.includes("premium")) key = "premium";
    else if (raw.includes("advanced")) key = "advanced";
    else if (raw) key = "outros";
    byPlan[key] = (byPlan[key] || 0) + 1;
  });
  return byPlan;
}

function buildClientStageStats(clients) {
  const byStage = new Map();
  (Array.isArray(clients) ? clients : []).forEach((client) => {
    if (String(client?.statusContrato || "") !== "cliente") return;
    const stage = getClienteEtapaMes(getClientStageBaseDate(client));
    if (!stage) return;
    const normalizedStage = stage >= 12 ? 12 : stage;
    byStage.set(normalizedStage, (byStage.get(normalizedStage) || 0) + 1);
  });
  return byStage;
}

function buildGeneralClientFilters(filters = {}) {
  return {
    month: filters.month || "",
    year: filters.year || "",
    startDate: filters.startDate || "",
    endDate: filters.endDate || "",
    clientStatus: "cliente"
  };
}

function applyClientStatusFilter(status) {
  const selected = String(status || "");
  const dropdown = document.getElementById("filter-client-status");
  if (dropdown) dropdown.value = selected;
  currentFilters = {
    ...currentFilters,
    clientStatus: selected
  };
  localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
  carregarTudo().catch((error) => toast(error.message || "Erro ao aplicar filtro de cliente."));
  switchTab("clientes");
}

function applyClientPlanFilter(planKey) {
  const selected = String(planKey || "");
  const planDropdown = document.getElementById("filter-client-plan");
  if (planDropdown) planDropdown.value = selected;
  currentFilters = {
    ...currentFilters,
    clientPlan: selected
  };
  localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
  carregarTudo().catch((error) => toast(error.message || "Erro ao aplicar filtro de plano."));
  switchTab("clientes");
}

function applyClientStageFilter(stageValue) {
  const selected = String(stageValue || "");
  const stageDropdown = document.getElementById("filter-client-stage");
  if (stageDropdown) stageDropdown.value = selected;
  clientsPage = 1;
  currentFilters = {
    ...currentFilters,
    clientStage: selected
  };
  localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
  carregarTudo().catch((error) => toast(error.message || "Erro ao aplicar filtro de etapa."));
  switchTab("clientes");
}

function renderClientStatusWidget({ byStatus, total, chartId, legendId, kpiId, clickableLegend = false }) {
  const kpi = document.getElementById(kpiId);
  if (kpi) kpi.textContent = String(total || 0);
  const leg = document.getElementById(legendId);
  if (leg) {
    leg.innerHTML = CLIENT_STATUS_CHART_ORDER.map((k) => {
      const n = byStatus[k] || 0;
      const c = CLIENT_CHART_COLORS[k] || "#94a3b8";
      const label = CLIENT_STATUS_LABELS[k] || k;
      const attrs = clickableLegend ? `data-client-status-filter="${k}"` : "";
      const hover = clickableLegend ? "hover:border-mindlaw-gold/60 cursor-pointer" : "";
      return `<li ${attrs} class="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-mindlaw-teal/40 px-2 py-1 ${hover}"><span class="h-2 w-2 rounded-full" style="background:${c}"></span>${label}: <strong class="text-mindlaw-white">${n}</strong></li>`;
    }).join("");
  }
  const el = document.getElementById(chartId);
  if (!el) return;
  const cctx = el.getContext("2d");
  const labels = [];
  const data = [];
  const bg = [];
  const statusKeys = [];
  for (const k of CLIENT_STATUS_CHART_ORDER) {
    const n = byStatus[k] || 0;
    if (n > 0) {
      labels.push(CLIENT_STATUS_LABELS[k] || k);
      data.push(n);
      bg.push(CLIENT_CHART_COLORS[k] || "#94a3b8");
      statusKeys.push(k);
    }
  }
  const keyState = chartId === "chartClientesResumo" ? "clientResumo" : "clientEntradas";
  if (chartState[keyState]) chartState[keyState].destroy();
  if (!labels.length) {
    chartState[keyState] = new Chart(cctx, {
      type: "doughnut",
      data: { labels: ["Sem dados"], datasets: [{ data: [1], backgroundColor: ["#374151"], borderWidth: 0 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: "#FFFFFF" } } } }
    });
    return;
  }
  chartState[keyState] = new Chart(cctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: bg, borderWidth: 0 }] },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: "#FFFFFF" } } },
      onClick: (_evt, elements) => {
        if (!clickableLegend || !elements.length) return;
        const idx = elements[0].index;
        const status = statusKeys[idx];
        if (status) applyClientStatusFilter(status);
      }
    }
  });
}

function renderClientPlanWidget(planStats) {
  const planLabels = {
    starter: "Starter",
    premium: "Premium",
    advanced: "Advanced",
    outros: "Outros",
    sem_plano: "Sem plano"
  };
  const order = ["starter", "premium", "advanced", "outros", "sem_plano"];
  const legend = document.getElementById("client-plan-legend");
  if (legend) {
    legend.innerHTML = order
      .filter((k) => (planStats[k] || 0) > 0)
      .map((k) => `<li data-client-plan-filter="${k}" class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-mindlaw-teal/40 px-2 py-1 hover:border-mindlaw-gold/60"><span class="h-2 w-2 rounded-full" style="background:${PLAN_CHART_COLORS[k]}"></span>${planLabels[k]}: <strong class="text-mindlaw-white">${planStats[k]}</strong></li>`)
      .join("");
  }
  const canvas = document.getElementById("chartClientesPlanos");
  if (!canvas) return;
  const labels = [];
  const data = [];
  const colors = [];
  const availableOrder = order.filter((k) => (planStats[k] || 0) > 0);
  availableOrder.forEach((k) => {
    const n = planStats[k] || 0;
    if (n > 0) {
      labels.push(planLabels[k]);
      data.push(n);
      colors.push(PLAN_CHART_COLORS[k]);
    }
  });
  const ctx = canvas.getContext("2d");
  if (chartState.clientPlanos) chartState.clientPlanos.destroy();
  chartState.clientPlanos = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels.length ? labels : ["Sem dados"],
      datasets: [{ data: data.length ? data : [1], backgroundColor: data.length ? colors : ["#374151"], borderWidth: 0 }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#FFFFFF" } } },
      onClick: (_evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        const key = availableOrder[idx];
        if (key) applyClientPlanFilter(key);
      }
    }
  });
}

function renderClientStageWidget(stageStats) {
  const canvas = document.getElementById("chartClientesEtapasResumo");
  if (!canvas) return;
  const labels = [];
  const values = [];
  const stageKeys = [];
  for (let stage = 1; stage <= 12; stage += 1) {
    labels.push(stage === 12 ? "Mês 12+" : `Mês ${stage}`);
    values.push(stageStats.get(stage) || 0);
    stageKeys.push(String(stage));
  }
  const ctx = canvas.getContext("2d");
  if (chartState.clientEtapasResumo) chartState.clientEtapasResumo.destroy();
  chartState.clientEtapasResumo = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Clientes ativos",
        data: values,
        backgroundColor: "#c5a059",
        borderRadius: 6
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#FFFFFF" } } },
      onClick: (_evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        const stage = stageKeys[idx];
        if (!stage) return;
        applyClientStageFilter(stage);
      },
      scales: {
        x: { ticks: { color: "#FFFFFF" }, grid: { color: "rgba(255,255,255,0.08)" } },
        y: { beginAtZero: true, ticks: { color: "#FFFFFF", precision: 0 }, grid: { color: "rgba(255,255,255,0.08)" } }
      }
    }
  });
}

function renderClientEntradaPanel(stats) {
  const byStatus = (stats && stats.byStatus) || {};
  const total = typeof stats?.total === "number" ? stats.total : 0;
  const periodEl = document.getElementById("client-dashboard-period");
  if (periodEl) {
    if (stats && stats.range && stats.range.start) {
      const a = new Date(stats.range.start);
      const b = new Date(stats.range.end);
      periodEl.textContent = `Período: ${a.toLocaleDateString("pt-BR")} a ${b.toLocaleDateString("pt-BR")} (inclusivo). Registros sem data de referência não entram neste corte.`;
    } else {
      periodEl.textContent = "Sem mês/ano ou intervalo no header: contagem geral da base, por status.";
    }
  }
  renderClientStatusWidget({
    byStatus,
    total,
    chartId: "chartClientesEntradas",
    legendId: "client-dashboard-legend",
    kpiId: "kpi-client-entradas-total",
    clickableLegend: true
  });
}

function renderSupportCharts(supportDashboard) {
  const monthCount = supportDashboard.churnByMonth || Array.from({ length: 12 }, () => 0);
  const heatmap = document.getElementById("heatmap");
  const yearSelect = document.getElementById("support-heatmap-year");
  if (yearSelect) {
    if (!yearSelect.options.length) {
      const nowYear = new Date().getFullYear();
      for (let y = nowYear - 5; y <= nowYear + 1; y += 1) {
        const opt = document.createElement("option");
        opt.value = String(y);
        opt.textContent = String(y);
        yearSelect.appendChild(opt);
      }
    }
    yearSelect.value = String(currentFilters.churnYear || supportDashboard.churnYear || new Date().getFullYear());
  }
  const max = Math.max(...monthCount, 1);
  const monthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  heatmap.innerHTML = monthCount
    .map((count, i) => {
      const ratio = count / max;
      const r = Math.round(31 + (197 - 31) * ratio);
      const g = Math.round(20 + (160 - 20) * ratio);
      const b = Math.round(0 + (89 - 0) * ratio);
      const bg = `rgb(${r}, ${g}, ${b})`;
      const textColor = ratio > 0.55 ? "#001A1E" : "#FFFFFF";
      const activeCls = selectedSupportMonth === i ? "ring-2 ring-mindlaw-gold/80" : "";
      return `<button type="button" data-support-month="${i}" class="rounded p-2 text-center font-semibold ${activeCls}" style="background: ${bg}; color: ${textColor};">${monthLabels[i]}<br/><span class="text-[10px]">${count}</span></button>`;
    })
    .join("");

  const monthIndex = selectedSupportMonth === null ? monthCount.findIndex((n) => n > 0) : selectedSupportMonth;
  renderSupportMonthDetails(supportDashboard, monthIndex >= 0 ? monthIndex : null);

  let npsDist = supportDashboard.npsDistribution || { Promotor: 0, Neutro: 0, Detrator: 0 };
  let totalNps = (npsDist.Promotor || 0) + (npsDist.Neutro || 0) + (npsDist.Detrator || 0);
  // Fallback para bases legadas sem categoriaNPS preenchida: deriva pelos valores de notaNPS.
  if (!totalNps && Array.isArray(supportDashboard.support)) {
    const npsRows = supportDashboard.support.filter((item) => {
      const nota = Number(item?.notaNPS);
      return !Number.isNaN(nota) && nota >= 0 && nota <= 10;
    });
    npsDist = {
      Promotor: npsRows.filter((item) => Number(item.notaNPS) >= 9).length,
      Neutro: npsRows.filter((item) => Number(item.notaNPS) >= 7 && Number(item.notaNPS) <= 8).length,
      Detrator: npsRows.filter((item) => Number(item.notaNPS) <= 6).length
    };
    totalNps = npsDist.Promotor + npsDist.Neutro + npsDist.Detrator;
  }
  const npsScore = totalNps ? (((npsDist.Promotor || 0) - (npsDist.Detrator || 0)) / totalNps) * 100 : 0;
  const npsScoreText = `${npsScore.toFixed(1)}`;
  const kpiNps = document.getElementById("kpi-nps");
  const kpiNpsResumo = document.getElementById("kpi-resumo-nps");
  if (kpiNps) kpiNps.textContent = npsScoreText;
  if (kpiNpsResumo) kpiNpsResumo.textContent = npsScoreText;
  const npsCtx = document.getElementById("chartNps").getContext("2d");
  if (chartState.nps) chartState.nps.destroy();
  const promoterGradient = npsCtx.createLinearGradient(0, 0, 0, 260);
  promoterGradient.addColorStop(0, "#C5A059");
  promoterGradient.addColorStop(1, "#92733C");
  chartState.nps = new Chart(npsCtx, {
    type: "doughnut",
    data: {
      labels: ["Promotor", "Neutro", "Detrator"],
      datasets: [{
        data: [npsDist.Promotor || 0, npsDist.Neutro || 0, npsDist.Detrator || 0],
        backgroundColor: [promoterGradient, "#E7D4AB", "#6E562B"],
        borderWidth: 0
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#FFFFFF" } } },
      onClick: (_evt, elements) => {
        if (!elements.length) return;
        const labels = ["Promotor", "Neutro", "Detrator"];
        const selected = labels[elements[0].index];
        if (!selected) return;
        const key = normalizeText(selected);
        interactiveFilter = interactiveFilter?.type === "supportNps" && interactiveFilter?.value === key
          ? null
          : { type: "supportNps", value: key };
        renderLogsTable(rawLogsCache);
        switchTab("logs");
        toast(interactiveFilter ? `Filtro Suporte: ${selected}` : "Filtro Suporte removido.");
      }
    }
  });
  const churnReasons = supportDashboard.churnReasonDistribution || {};
  const churnReasonLabels = Object.keys(churnReasons);
  const churnReasonValues = Object.values(churnReasons);
  const churnReasonCanvas = document.getElementById("chartChurnReasons");
  if (churnReasonCanvas) {
    const churnReasonCtx = churnReasonCanvas.getContext("2d");
    if (chartState.churnReasons) chartState.churnReasons.destroy();
    const useBar = churnReasonLabels.length > 4;
    chartState.churnReasons = new Chart(churnReasonCtx, {
      type: useBar ? "bar" : "doughnut",
      data: {
        labels: churnReasonLabels.length ? churnReasonLabels : ["Sem dados"],
        datasets: [{
          data: churnReasonValues.length ? churnReasonValues : [1],
          backgroundColor: ["#C5A059", "#E7D4AB", "#92733C", "#6E562B", "#4B3B1E"],
          borderWidth: useBar ? 1 : 0,
          borderRadius: useBar ? 8 : 0
        }]
      },
      options: {
        indexAxis: useBar ? "y" : "x",
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#FFFFFF" } } },
        onClick: (_evt, elements) => {
          if (!elements.length || !churnReasonLabels.length) return;
          const selected = churnReasonLabels[elements[0].index];
          if (!selected) return;
          const key = normalizeText(selected);
          interactiveFilter = interactiveFilter?.type === "supportChurnReason" && interactiveFilter?.value === key
            ? null
            : { type: "supportChurnReason", value: key };
          renderLogsTable(rawLogsCache);
          switchTab("logs");
          toast(interactiveFilter ? `Filtro Suporte (motivo): ${selected}` : "Filtro de motivo de cancelamento removido.");
        },
        scales: useBar
          ? {
              x: { ticks: { color: "#FFFFFF" }, grid: { color: "rgba(255,255,255,0.1)" } },
              y: { ticks: { color: "#FFFFFF" }, grid: { color: "rgba(255,255,255,0.1)" } }
            }
          : {}
      }
    });
  }
  document.getElementById("kpi-resumo-mrr").textContent = money(supportDashboard.totalMrrPerdido || 0);
}

function renderSupportMonthDetails(supportDashboard, monthIndex) {
  const title = document.getElementById("support-month-detail-title");
  const list = document.getElementById("support-month-detail-list");
  if (!title || !list) return;
  const monthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  if (monthIndex === null || monthIndex < 0) {
    title.textContent = "Detalhes do mês";
    list.innerHTML = `<p class="text-mindlaw-white/60">Selecione um mês para listar os churns cadastrados.</p>`;
    return;
  }
  selectedSupportMonth = monthIndex;
  const rows = (supportDashboard.churnDetailsByMonth && supportDashboard.churnDetailsByMonth[monthIndex]) || [];
  title.textContent = `Detalhes de ${monthLabels[monthIndex]}`;
  if (!rows.length) {
    list.innerHTML = `<p class="text-mindlaw-white/60">Sem churns registrados neste mês.</p>`;
    return;
  }
  list.innerHTML = rows
    .map((row) => {
      const data = row.dataChurn ? new Date(row.dataChurn).toLocaleDateString("pt-BR") : "—";
      const plano = row.plano || "Sem plano";
      const status = row.statusContrato || "—";
      const funcionalidade = row.funcionalidadeFaltante ? escapeHtml(row.funcionalidadeFaltante) : "";
      return `<article class="rounded-lg border border-white/10 bg-mindlaw-teal/40 p-3">
        <button class="font-semibold text-left hover:text-mindlaw-gold/90 hover:underline" data-client-link="${escapeHtml(row.cliente || "")}">${escapeHtml(row.cliente || "—")}</button>
        <p class="text-xs text-mindlaw-white/70">${escapeHtml(plano)} · status: ${escapeHtml(status)}</p>
        <p class="text-xs text-mindlaw-white/70">Data: ${data} · Motivo: ${escapeHtml(row.motivoPrincipal || "Sem Motivo")} · Valor: ${money(row.valorPerdido || 0)}</p>
        ${funcionalidade ? `<p class="text-xs text-mindlaw-white/70">Justificativa do motivo: ${funcionalidade}</p>` : ""}
      </article>`;
    })
    .join("");
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderLogDetailCell(detailText, logId) {
  const raw = String(detailText || "-");
  const safe = escapeHtml(raw);
  if (raw.length <= LOG_DETAIL_PREVIEW_LIMIT) return safe;
  const short = escapeHtml(`${raw.slice(0, LOG_DETAIL_PREVIEW_LIMIT)}...`);
  const safeId = escapeHtml(String(logId || ""));
  return `
    <span data-log-detail-short="${safeId}">${short}</span>
    <span class="hidden whitespace-pre-wrap" data-log-detail-full="${safeId}">${safe}</span>
    <button class="ml-2 text-xs text-mindlaw-gold/90 hover:underline" data-log-detail-toggle="${safeId}" data-expanded="0">Ver mais</button>
  `;
}

function mapPlanToOption(plano) {
  const planNormalized = normalizeText(plano || "");
  if (!planNormalized) return "";
  if (planNormalized.includes("starter")) return "Starter";
  if (planNormalized.includes("premium")) return "Premium";
  if (planNormalized.includes("advanced")) return "Advanced";
  return "Outros";
}

function clearSaleForm() {
  const ids = ["sale_cliente", "sale_valor", "sale_competidor", "sale_detalhe", "sale_funcionalidade_faltante"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const saleStatus = document.getElementById("sale_status");
  if (saleStatus) saleStatus.value = "Em Negociacao";
  const saleMotivo = document.getElementById("sale_motivo");
  if (saleMotivo) saleMotivo.value = "Sem Motivo";
  updateFuncionalidadeFieldVisibility("sale");
  const saleData = document.getElementById("sale_data");
  if (saleData) saleData.valueAsDate = new Date();
  const salePlano = document.getElementById("sale_plano");
  if (salePlano) salePlano.value = "";
}

function clearChurnForm() {
  const ids = ["churn_cliente", "churn_valor_mensal", "churn_funcionalidade_faltante"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const churnMotivo = document.getElementById("churn_motivo");
  if (churnMotivo) churnMotivo.value = "Sem Motivo";
  updateFuncionalidadeFieldVisibility("churn");
  const churnData = document.getElementById("churn_data");
  if (churnData) churnData.valueAsDate = new Date();
}

function clearNpsForm() {
  const ids = ["nps_cliente", "nps_nota", "nps_comentario"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const npsData = document.getElementById("nps_data");
  if (npsData) npsData.valueAsDate = new Date();
}

function toggleFormFields(tipo) {
  const groups = {
    comercial: document.getElementById("form-group-comercial"),
    churn: document.getElementById("form-group-churn"),
    nps: document.getElementById("form-group-nps")
  };
  Object.entries(groups).forEach(([key, el]) => {
    if (!el) return;
    const active = key === tipo;
    el.classList.toggle("hidden", !active);
    el.classList.toggle("is-active", active);
  });

  const action = document.getElementById("btn-save-registro");
  if (action) {
    if (tipo === "comercial") action.textContent = "Salvar venda";
    if (tipo === "churn") action.textContent = "Confirmar churn";
    if (tipo === "nps") action.textContent = "Salvar feedback NPS";
  }
  updateFuncionalidadeFieldVisibility("sale");
  updateFuncionalidadeFieldVisibility("churn");
}

function renderLogsTable(logs) {
  const source = Array.isArray(logs) ? logs : [];
  let filtered = source;
  if (interactiveFilter?.type === "commercialStatus") {
    filtered = source.filter((item) => normalizeText(item.tipo) === "comercial" && normalizeText(item.status) === interactiveFilter.value);
  }
  if (interactiveFilter?.type === "supportNps") {
    filtered = source.filter((item) => normalizeText(item.tipo) === "nps" && normalizeText(item.status).includes(interactiveFilter.value));
  }
  if (interactiveFilter?.type === "commercialReason") {
    filtered = filtered.filter((item) => {
      if (normalizeText(item.origem) !== "comercial") return false;
      return normalizeText(item.payload?.motivoPerda || item.detalhe || "").includes(interactiveFilter.value);
    });
  }
  if (interactiveFilter?.type === "supportChurnReason") {
    filtered = filtered.filter((item) => {
      if (normalizeText(item.origem) !== "churn") return false;
      return normalizeText(item.payload?.motivoPrincipal || item.detalhe || "").includes(interactiveFilter.value);
    });
  }
  if (logsFilterType) {
    filtered = filtered.filter((item) => normalizeText(item.origem) === normalizeText(logsFilterType));
  }
  if (logsFilterPlan) {
    filtered = filtered.filter((item) => {
      const raw = normalizeText(item.plano || "");
      if (logsFilterPlan === "sem_plano") return !raw;
      if (logsFilterPlan === "outros") {
        return raw && !raw.includes("starter") && !raw.includes("premium") && !raw.includes("advanced");
      }
      return raw.includes(logsFilterPlan);
    });
  }
  if (logsSearchTerm) {
    const term = normalizeText(logsSearchTerm);
    filtered = filtered.filter((item) => {
      if (normalizeText(item.cliente).includes(term) || normalizeText(item.detalhe).includes(term)) return true;
      if (String(item.origem) === "nps" && item.npsColunas) {
        const blob = Object.values(item.npsColunas).join(" ");
        if (normalizeText(blob).includes(term)) return true;
      }
      const notaStr = item.npsNota != null && item.npsNota !== "" ? String(item.npsNota) : "";
      if (notaStr && normalizeText(notaStr).includes(term)) return true;
      return false;
    });
  }
  const statusClass = (value, tipo) => {
    const normalized = String(value || "").toLowerCase();
    if (normalizeText(tipo) === "nps") {
      if (normalized.includes("promotor")) return "status-ganho";
      if (normalized.includes("detrator")) return "status-perdido";
      if (normalized.includes("neutro")) return "status-negociacao";
    }
    if (normalized.includes("ganho")) return "status-ganho";
    if (normalized.includes("perdido") || normalized.includes("detrator") || normalized.includes("churn")) return "status-perdido";
    return "status-negociacao";
  };

  const npsAuditCells = (item) => {
    const c = item.npsColunas || {};
    const mk = (text, suffix) =>
      `<td class="px-3 py-4 align-top text-xs max-w-[200px]">${renderLogDetailCell(text || "—", `${item.id}-${suffix}`)}</td>`;
    return (
      mk(c.melhorar, "melhorar") +
      mk(c.faltouNota9, "faltou") +
      mk(c.areas, "areas") +
      mk(c.experiencia, "exp") +
      mk(c.funcionalidade, "func") +
      mk(c.adicional, "adic")
    );
  };

  const interactiveFilterEl = document.getElementById("logs-active-interactive-filter");
  const filterLabelMap = {
    commercialStatus: "Comercial · Status",
    supportNps: "Suporte · NPS",
    commercialReason: "Comercial · Motivo",
    supportChurnReason: "Suporte · Motivo de cancelamento"
  };
  const filterClassMap = {
    commercialStatus: "border-sky-300/60 bg-sky-400/10",
    supportNps: "border-emerald-300/60 bg-emerald-400/10",
    commercialReason: "border-amber-300/60 bg-amber-400/10",
    supportChurnReason: "border-rose-300/60 bg-rose-400/10"
  };
  if (interactiveFilterEl) {
    if (interactiveFilter?.type && interactiveFilter?.value) {
      const label = filterLabelMap[interactiveFilter.type] || "Filtro";
      const chipClass = filterClassMap[interactiveFilter.type] || "border-mindlaw-gold/45 bg-mindlaw-gold/10";
      interactiveFilterEl.classList.remove("hidden");
      interactiveFilterEl.innerHTML = `
        <button id="btn-clear-interactive-filter" class="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs text-mindlaw-white hover:border-mindlaw-gold/75 ${chipClass}">
          <span>${escapeHtml(label)}: <strong>${escapeHtml(interactiveFilter.value)}</strong></span>
          <span aria-hidden="true">✕</span>
        </button>
      `;
    } else {
      interactiveFilterEl.classList.add("hidden");
      interactiveFilterEl.innerHTML = "";
    }
  }

  const body = document.getElementById("logs-table");
  body.innerHTML = filtered.length
    ? filtered.map((item) => {
      const isNps = normalizeText(item.origem) === "nps";
      const notaCell = isNps && item.npsNota != null && item.npsNota !== "" ? escapeHtml(String(item.npsNota)) : "—";
      const detalheCell = isNps
        ? "—"
        : renderLogDetailCell(item.detalhe || "-", item.id);
      const dashSix =
        '<td class="px-3 py-4 align-top text-xs text-mindlaw-white/50">—</td>'.repeat(6);
      const npsRow = isNps ? npsAuditCells(item) : dashSix;
      return `<tr>
      <td class="px-4 py-4">${item.tipo}</td>
      <td class="px-4 py-4"><button class="text-left hover:text-mindlaw-gold/90 hover:underline" data-client-link="${escapeHtml(item.cliente || "")}">${item.cliente || "-"}</button></td>
      <td class="px-4 py-4">${item.plano || "Sem plano"}</td>
      <td class="px-4 py-4">${item.data ? new Date(item.data).toLocaleDateString("pt-BR") : "-"}</td>
      <td class="px-4 py-4"><span class="status-chip ${statusClass(item.status, item.tipo)}">${item.status || "-"}</span></td>
      <td class="px-4 py-4 font-mono">${notaCell}</td>
      <td class="px-4 py-4 align-top">${detalheCell}</td>
      ${npsRow}
      <td class="px-4 py-4">
        <div class="flex items-center gap-2">
          <button class="rounded-lg border border-white/20 px-3 py-1 text-xs hover:border-mindlaw-gold/60" data-edit-log-id="${escapeHtml(item.id)}" data-edit-log-origem="${escapeHtml(item.origem)}">Editar</button>
          <button class="rounded-lg border border-rose-400/40 px-3 py-1 text-xs text-rose-200 hover:border-rose-300/70" data-delete-log-id="${escapeHtml(item.id)}" data-delete-log-origem="${escapeHtml(item.origem)}">Apagar</button>
        </div>
      </td>
    </tr>`;
    }).join("")
    : `<tr><td colspan="14" class="px-6 py-6 text-center text-mindlaw-white/70">Sem registros.</td></tr>`;
}

function openLogEditModal(item) {
  editingLog = item;
  const container = document.getElementById("log-edit-fields");
  const modal = document.getElementById("log-edit-modal");
  if (!container || !modal || !item) return;
  if (item.origem === "comercial") {
    const p = item.payload || {};
    container.innerHTML = `
      <input id="log_edit_cliente" class="input-ui" type="text" placeholder="Cliente" value="${escapeHtml(p.cliente || "")}" />
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <input id="log_edit_data" class="input-ui" type="date" value="${p.data ? new Date(p.data).toISOString().slice(0, 10) : ""}" />
        <input id="log_edit_valor_contrato" class="input-ui" type="number" step="0.01" value="${escapeHtml(String(p.valorContrato ?? 0))}" />
      </div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <select id="log_edit_status" class="input-ui"><option value="Em Negociacao">Em Negociação</option><option value="Ganho">Ganho</option><option value="Perdido">Perdido</option></select>
        <select id="log_edit_motivo_perda" class="input-ui"><option value="Sem Motivo">Sem Motivo</option><option value="Preco">Preço</option><option value="Falta de Funcionalidade">Falta de Funcionalidade</option><option value="Falta de Integracao">Falta de Integração</option><option value="Outros">Outros</option></select>
      </div>
      <div id="log_edit_funcionalidade_perda_wrap" class="hidden">
        <textarea id="log_edit_funcionalidade_perda" class="input-ui" rows="2" placeholder="Justificativa do motivo">${escapeHtml(p.funcionalidadeFaltante || "")}</textarea>
      </div>
      <select id="log_edit_plano" class="input-ui">
        <option value="">Sem plano</option>
        <option value="Starter">Starter</option>
        <option value="Premium">Premium</option>
        <option value="Advanced">Advanced</option>
        <option value="Outros">Outros</option>
      </select>
      <input id="log_edit_competidor" class="input-ui" type="text" placeholder="Competidor" value="${escapeHtml(p.competidor || "")}" />
      <textarea id="log_edit_detalhe" class="input-ui" rows="3" placeholder="Detalhamento">${escapeHtml(p.detalhamentoTecnico || "")}</textarea>
    `;
    document.getElementById("log_edit_status").value = p.status || "Em Negociacao";
    document.getElementById("log_edit_motivo_perda").value = p.motivoPerda || "Sem Motivo";
    const showDetalhePerda = isMotivoComDetalhamento(p.motivoPerda) || !!String(p.funcionalidadeFaltante || "").trim();
    document.getElementById("log_edit_funcionalidade_perda_wrap")?.classList.toggle("hidden", !showDetalhePerda);
    const relatedClient = currentClientRawList.find((c) => normalizeText(c?.nome) === normalizeText(p.cliente));
    document.getElementById("log_edit_plano").value = mapPlanToOption(relatedClient?.plano || "");
  } else if (item.origem === "churn") {
    const p = item.payload || {};
    container.innerHTML = `
      <input id="log_edit_cliente" class="input-ui" type="text" placeholder="Cliente" value="${escapeHtml(p.cliente || "")}" />
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <input id="log_edit_data_churn" class="input-ui" type="date" value="${p.dataChurn ? new Date(p.dataChurn).toISOString().slice(0, 10) : ""}" />
        <input id="log_edit_valor_perdido" class="input-ui" type="number" step="0.01" value="${escapeHtml(String(p.valorPerdido ?? 0))}" />
      </div>
      <select id="log_edit_motivo_principal" class="input-ui"><option value="Sem Motivo">Sem Motivo</option><option value="Preco">Preço</option><option value="Falta de Funcionalidade">Falta de Funcionalidade</option><option value="Falta de Integracao">Falta de Integração</option><option value="Atendimento">Atendimento</option><option value="Outros">Outros</option></select>
      <div id="log_edit_funcionalidade_churn_wrap" class="hidden">
        <textarea id="log_edit_funcionalidade_churn" class="input-ui" rows="2" placeholder="Justificativa do motivo">${escapeHtml(p.funcionalidadeFaltante || "")}</textarea>
      </div>
      <select id="log_edit_plano" class="input-ui">
        <option value="">Sem plano</option>
        <option value="Starter">Starter</option>
        <option value="Premium">Premium</option>
        <option value="Advanced">Advanced</option>
        <option value="Outros">Outros</option>
      </select>
    `;
    document.getElementById("log_edit_motivo_principal").value = p.motivoPrincipal || "Sem Motivo";
    const showDetalheChurn = isMotivoComDetalhamento(p.motivoPrincipal) || !!String(p.funcionalidadeFaltante || "").trim();
    document.getElementById("log_edit_funcionalidade_churn_wrap")?.classList.toggle("hidden", !showDetalheChurn);
    const relatedClient = currentClientRawList.find((c) => normalizeText(c?.nome) === normalizeText(p.cliente));
    document.getElementById("log_edit_plano").value = mapPlanToOption(relatedClient?.plano || "");
  } else {
    const p = item.payload || {};
    const t = (v) => escapeHtml(String(v ?? ""));
    container.innerHTML = `
      <input id="log_edit_cliente" class="input-ui" type="text" placeholder="Cliente" value="${t(p.cliente)}" />
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <input id="log_edit_data_nps" class="input-ui" type="date" value="${p.dataNPS ? new Date(p.dataNPS).toISOString().slice(0, 10) : ""}" />
        <input id="log_edit_nota_nps" class="input-ui" type="number" min="0" max="10" value="${t(p.notaNPS)}" />
      </div>
      <p class="text-xs text-mindlaw-white/60">Respostas por pergunta (NPS)</p>
      <textarea id="log_edit_nps_melhorar" class="input-ui" rows="2" placeholder="O que poderíamos melhorar... (0–6)">${t(p.npsMelhorarExperiencia)}</textarea>
      <textarea id="log_edit_nps_faltou" class="input-ui" rows="2" placeholder="O que faltou para nota 9–10... (7–8)">${t(p.npsFaltouNota9)}</textarea>
      <textarea id="log_edit_nps_areas" class="input-ui" rows="2" placeholder="Áreas a melhorar">${t(p.npsAreasMelhorar)}</textarea>
      <textarea id="log_edit_nps_experiencia" class="input-ui" rows="2" placeholder="Experiência até aqui (9–10)">${t(p.npsExperienciaAteAqui)}</textarea>
      <textarea id="log_edit_nps_funcionalidade" class="input-ui" rows="2" placeholder="Funcionalidade / diferencial (9–10)">${t(p.npsFuncionalidadeDiaadia)}</textarea>
      <textarea id="log_edit_nps_adicional" class="input-ui" rows="2" placeholder="Comentário adicional (sempre)">${t(p.npsComentarioAdicional)}</textarea>
      <textarea id="log_edit_comentario_nps" class="input-ui" rows="2" placeholder="Texto combinado legado (opcional)">${t(p.comentarioNPS)}</textarea>
      <select id="log_edit_plano" class="input-ui">
        <option value="">Sem plano</option>
        <option value="Starter">Starter</option>
        <option value="Premium">Premium</option>
        <option value="Advanced">Advanced</option>
        <option value="Outros">Outros</option>
      </select>
    `;
    const relatedClient = currentClientRawList.find((c) => normalizeText(c?.nome) === normalizeText(p.cliente));
    document.getElementById("log_edit_plano").value = mapPlanToOption(relatedClient?.plano || "");
  }
  document.getElementById("log_edit_motivo_perda")?.addEventListener("change", (event) => {
    const show = isMotivoComDetalhamento(event.target.value);
    const wrap = document.getElementById("log_edit_funcionalidade_perda_wrap");
    const field = document.getElementById("log_edit_funcionalidade_perda");
    if (wrap) wrap.classList.toggle("hidden", !show);
    if (!show && field) field.value = "";
  });
  document.getElementById("log_edit_motivo_principal")?.addEventListener("change", (event) => {
    const show = isMotivoComDetalhamento(event.target.value);
    const wrap = document.getElementById("log_edit_funcionalidade_churn_wrap");
    const field = document.getElementById("log_edit_funcionalidade_churn");
    if (wrap) wrap.classList.toggle("hidden", !show);
    if (!show && field) field.value = "";
  });
  modal.showModal();
}

async function saveLogEdit() {
  if (!editingLog?.id || !editingLog?.origem) throw new Error("Registro inválido para edição.");
  if (editingLog.origem === "comercial") {
    const motivoPerda = document.getElementById("log_edit_motivo_perda").value;
    const funcionalidadeFaltante = document.getElementById("log_edit_funcionalidade_perda")?.value?.trim() || "";
    if (isMotivoComDetalhamento(motivoPerda) && !funcionalidadeFaltante) {
      throw new Error("Descreva o detalhe do motivo selecionado.");
    }
    await apiService.updateSale(editingLog.id, {
      cliente: document.getElementById("log_edit_cliente").value.trim(),
      data: document.getElementById("log_edit_data").value || null,
      valorContrato: Number(document.getElementById("log_edit_valor_contrato").value || 0),
      status: document.getElementById("log_edit_status").value,
      plano: document.getElementById("log_edit_plano")?.value || "",
      motivoPerda,
      justificativaMotivo: funcionalidadeFaltante,
      funcionalidadeFaltante,
      competidor: document.getElementById("log_edit_competidor").value.trim(),
      detalhamentoTecnico: document.getElementById("log_edit_detalhe").value.trim()
    });
  } else if (editingLog.origem === "churn") {
    const motivoPrincipal = document.getElementById("log_edit_motivo_principal").value;
    const funcionalidadeFaltante = document.getElementById("log_edit_funcionalidade_churn")?.value?.trim() || "";
    if (isMotivoComDetalhamento(motivoPrincipal) && !funcionalidadeFaltante) {
      throw new Error("Descreva o detalhe do motivo selecionado.");
    }
    await apiService.updateSupport(editingLog.id, {
      registerType: "churn",
      cliente: document.getElementById("log_edit_cliente").value.trim(),
      dataChurn: document.getElementById("log_edit_data_churn").value || null,
      valorPerdido: Number(document.getElementById("log_edit_valor_perdido").value || 0),
      motivoPrincipal,
      justificativaMotivo: funcionalidadeFaltante,
      funcionalidadeFaltante,
      plano: document.getElementById("log_edit_plano")?.value || ""
    });
  } else if (editingLog.origem === "nps") {
    await apiService.updateSupport(editingLog.id, {
      registerType: "nps",
      cliente: document.getElementById("log_edit_cliente").value.trim(),
      dataNPS: document.getElementById("log_edit_data_nps").value || null,
      notaNPS: document.getElementById("log_edit_nota_nps").value,
      comentarioNPS: document.getElementById("log_edit_comentario_nps").value.trim(),
      npsMelhorarExperiencia: document.getElementById("log_edit_nps_melhorar")?.value?.trim() || "",
      npsFaltouNota9: document.getElementById("log_edit_nps_faltou")?.value?.trim() || "",
      npsAreasMelhorar: document.getElementById("log_edit_nps_areas")?.value?.trim() || "",
      npsExperienciaAteAqui: document.getElementById("log_edit_nps_experiencia")?.value?.trim() || "",
      npsFuncionalidadeDiaadia: document.getElementById("log_edit_nps_funcionalidade")?.value?.trim() || "",
      npsComentarioAdicional: document.getElementById("log_edit_nps_adicional")?.value?.trim() || "",
      plano: document.getElementById("log_edit_plano")?.value || ""
    });
  } else {
    throw new Error("Origem do registro não reconhecida.");
  }
  document.getElementById("log-edit-modal")?.close();
  toast("Lançamento atualizado.");
  await carregarTudo();
}

async function deleteLogRecord(item) {
  if (!item?.id || !item?.origem) throw new Error("Registro inválido para exclusão.");
  const confirmed = window.confirm("Tem certeza que deseja apagar este lançamento? Esta ação não pode ser desfeita.");
  if (!confirmed) return;
  if (item.origem === "comercial") {
    await apiService.deleteSale(item.id);
  } else if (item.origem === "churn" || item.origem === "nps") {
    await apiService.deleteSupport(item.id);
  } else {
    throw new Error("Origem do registro não reconhecida.");
  }
  toast("Lançamento apagado.");
  await carregarTudo();
}

function renderClients(clients) {
  const container = document.getElementById("clients-list");
  if (!container) return;
  const list = Array.isArray(clients) ? clients : [];
  currentClientRawList = list;
  const stageFilter = Number(document.getElementById("filter-client-stage")?.value || 0);
  const searched = list.filter((c) => {
    if (!includesSearch(c, clientsSearchTerm)) return false;
    if (!stageFilter) return true;
    if (String(c?.statusContrato || "") !== "cliente") return false;
    const stage = getClienteEtapaMes(getClientStageBaseDate(c));
    if (!stage) return false;
    if (stageFilter >= 12) return stage >= 12;
    return stage === stageFilter;
  });
  currentClientList = searched;
  const totalResults = searched.length;
  const pageSizeSel = document.getElementById("clients-page-size");
  if (pageSizeSel) {
    const selected = Number(pageSizeSel.value || clientsPageSize);
    clientsPageSize = Number.isNaN(selected) ? 25 : selected;
  }
  const totalPages = Math.max(1, Math.ceil(totalResults / clientsPageSize));
  if (clientsPage > totalPages) clientsPage = totalPages;
  if (clientsPage < 1) clientsPage = 1;
  const startIdx = (clientsPage - 1) * clientsPageSize;
  const endIdx = startIdx + clientsPageSize;
  const pageList = searched.slice(startIdx, endIdx);
  const countEl = document.getElementById("clients-results-count");
  if (countEl) {
    const from = totalResults ? startIdx + 1 : 0;
    const to = Math.min(endIdx, totalResults);
    countEl.textContent = `${totalResults} resultado(s)${totalResults ? ` • exibindo ${from}-${to}` : ""}`;
  }
  const pageInfo = document.getElementById("clients-page-info");
  if (pageInfo) pageInfo.textContent = `Página ${clientsPage} de ${totalPages}`;
  const prevBtn = document.getElementById("clients-prev-page");
  const nextBtn = document.getElementById("clients-next-page");
  if (prevBtn) prevBtn.disabled = clientsPage <= 1;
  if (nextBtn) nextBtn.disabled = clientsPage >= totalPages;
  const statusKey = (s) => String(s || "cliente").replace(/[^a-z0-9_]/gi, "_");
  const fmtData = (d) => {
    if (!d) return "—";
    const t = new Date(d);
    return Number.isNaN(t.getTime()) ? "—" : t.toLocaleDateString("pt-BR");
  };
  container.innerHTML = pageList.length
    ? pageList.map((c) => {
      const st = c.statusContrato || "cliente";
      const chipClass = `cli-chip cli-st-${statusKey(st)}`;
      const phone = formatPhoneBr(c.telefone || "");
      const phoneHtml = phone
        ? `<button class="hover:text-mindlaw-gold/90 hover:underline" data-copy-phone="${escapeHtml(phone)}">${escapeHtml(phone)}</button>`
        : "Sem telefone";
      const tempoCliente = st === "cliente" ? formatClientTenure(getClientStageBaseDate(c)) : "";
      const etapaHtml = tempoCliente ? `<p class="text-xs text-mindlaw-gold/90">Tempo na base: ${tempoCliente}</p>` : "";
      return `<article class="rounded-xl border border-white/10 bg-mindlaw-teal/40 p-3">
      <p class="font-semibold">${escapeHtml(c.nome)}</p>
      <span class="${chipClass}">${escapeHtml(CLIENT_STATUS_LABELS[st] || st)}</span>
      ${etapaHtml}
      <p class="mt-1 text-xs text-mindlaw-white/70">${escapeHtml(c.plano || "—")} · ref. ${fmtData(c.dataReferencia)}</p>
      <p class="text-xs text-mindlaw-white/70">${phoneHtml} • ${escapeHtml(c.email || "Sem e-mail")}</p>
      <div class="mt-2">
        <button class="rounded-lg border border-white/15 px-2 py-1 text-xs hover:border-mindlaw-gold/50" data-client-edit="${escapeHtml(c._id || "")}">Editar</button>
      </div>
    </article>`;
    }).join("")
    : `<p class="text-sm text-mindlaw-white/70">Nenhum cliente neste filtro. Confira o status, reinicie o servidor (import automático se a coleção estiver vazia) ou rode <code class="text-mindlaw-gold/90">npm run import:atividade</code>. Para reimportar: defina <code class="text-mindlaw-gold/90">FORCE_IMPORT_LISTA=1</code> no .env e reinicie.</p>`;
}

async function refreshClientOptionsForForms() {
  const saleSelect = document.getElementById("sale_cliente");
  const churnSelect = document.getElementById("churn_cliente");
  const npsSelect = document.getElementById("nps_cliente");
  const targets = [saleSelect, churnSelect, npsSelect].filter(Boolean);
  if (!targets.length) return;

  const previousValues = new Map(targets.map((el) => [el.id, String(el.value || "")]));
  const response = await apiService.clients("?forForms=1");
  const list = Array.isArray(response.clients) ? response.clients : [];
  const names = list
    .filter((c) => c && c.nome)
    .map((c) => String(c.nome).trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const optionsHtml = `
    <option value="">Selecione um cliente</option>
    ${names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}
  `;

  targets.forEach((el) => {
    const previous = previousValues.get(el.id) || "";
    el.innerHTML = optionsHtml;
    if (previous && names.includes(previous)) {
      el.value = previous;
    } else {
      el.value = "";
    }
  });
}

function openClientEditModal(clientId) {
  const modal = document.getElementById("client-edit-modal");
  if (!modal) return;
  const target = currentClientList.find((c) => String(c._id) === String(clientId));
  if (!target) return;
  editingClientId = String(target._id);
  document.getElementById("edit_client_nome").value = target.nome || "";
  document.getElementById("edit_client_telefone").value = formatPhoneBr(target.telefone || "");
  document.getElementById("edit_client_email").value = target.email || "";
  document.getElementById("edit_client_status").value = target.statusContrato || "cliente";
  const editPlano = document.getElementById("edit_client_plano");
  if (editPlano) {
    editPlano.value = mapPlanToOption(target.plano);
  }
  if (target.dataReferencia) {
    const d = new Date(target.dataReferencia);
    document.getElementById("edit_client_data_ref").value = Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  } else {
    document.getElementById("edit_client_data_ref").value = "";
  }
  modal.showModal();
}

async function salvarEdicaoCliente() {
  try {
    if (!editingClientId) throw new Error("Cliente inválido.");
    const payload = {
      nome: document.getElementById("edit_client_nome").value.trim(),
      telefone: formatPhoneBr(document.getElementById("edit_client_telefone").value.trim()),
      email: document.getElementById("edit_client_email").value.trim(),
      statusContrato: document.getElementById("edit_client_status").value,
      plano: document.getElementById("edit_client_plano").value || "",
      dataReferencia: document.getElementById("edit_client_data_ref").value || null
    };
    if (payload.telefone && !hasValidPhoneBr(payload.telefone)) {
      throw new Error("Telefone inválido. Use o padrão (xx) x xxxx-xxxx.");
    }
    await apiService.updateClient(editingClientId, payload);
    document.getElementById("client-edit-modal")?.close();
    toast("Cliente atualizado.");
    await carregarTudo();
  } catch (error) {
    toast(error.message || "Erro ao atualizar cliente.");
  }
}

async function salvarSale() {
  try {
    const payload = {
      cliente: document.getElementById("sale_cliente").value.trim(),
      valorContrato: Number(document.getElementById("sale_valor").value || 0),
      data: document.getElementById("sale_data").value,
      status: document.getElementById("sale_status").value,
      plano: document.getElementById("sale_plano")?.value || "",
      motivoPerda: document.getElementById("sale_motivo").value,
      justificativaMotivo: document.getElementById("sale_funcionalidade_faltante")?.value?.trim() || "",
      funcionalidadeFaltante: document.getElementById("sale_funcionalidade_faltante")?.value?.trim() || "",
      detalhamentoTecnico: document.getElementById("sale_detalhe").value.trim(),
      competidor: document.getElementById("sale_competidor").value.trim()
    };
    if (!payload.cliente || !payload.data) throw new Error("Cliente e data são obrigatórios.");
    if (isMotivoComDetalhamento(payload.motivoPerda) && !payload.funcionalidadeFaltante) {
      throw new Error("Descreva o detalhe do motivo selecionado.");
    }
    await apiService.createSale(payload);
    clearSaleForm();
    toast("Registro comercial salvo.");
    await carregarTudo();
  } catch (error) {
    console.error("[MindLaw] Falha ao salvar comercial", error);
    toast(error.message);
  }
}

async function salvarChurn() {
  try {
    const payload = {
      cliente: document.getElementById("churn_cliente").value.trim(),
      valorPerdido: Number(document.getElementById("churn_valor_mensal").value || 0),
      dataChurn: document.getElementById("churn_data").value || null,
      motivoPrincipal: document.getElementById("churn_motivo").value,
      justificativaMotivo: document.getElementById("churn_funcionalidade_faltante")?.value?.trim() || "",
      funcionalidadeFaltante: document.getElementById("churn_funcionalidade_faltante")?.value?.trim() || ""
    };
    if (!payload.cliente || !payload.dataChurn) throw new Error("Cliente e data do churn são obrigatórios.");
    if (isMotivoComDetalhamento(payload.motivoPrincipal) && !payload.funcionalidadeFaltante) {
      throw new Error("Descreva o detalhe do motivo selecionado.");
    }
    await apiService.createChurn(payload);
    clearChurnForm();
    toast("Churn registrado.");
    await carregarTudo();
  } catch (error) {
    console.error("[MindLaw] Falha ao salvar churn", error);
    toast(error.message);
  }
}

async function salvarNPS() {
  try {
    const payload = {
      cliente: document.getElementById("nps_cliente").value.trim(),
      notaNPS: document.getElementById("nps_nota").value,
      comentarioNPS: document.getElementById("nps_comentario").value.trim(),
      dataNPS: document.getElementById("nps_data").value || null
    };
    if (!payload.cliente || payload.notaNPS === "") throw new Error("Cliente e nota são obrigatórios.");
    await apiService.createNps(payload);
    clearNpsForm();
    toast("NPS registrado.");
    await carregarTudo();
  } catch (error) {
    console.error("[MindLaw] Falha ao salvar NPS", error);
    toast(error.message);
  }
}

async function baixarRelatorioClientes() {
  try {
    const response = await fetch(`/api/clients/export${buildFilterQuery(currentFilters)}`, {
      method: "GET",
      credentials: "include",
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Falha ao exportar relatório de clientes.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MindLaw_Clientes.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Arquivo de clientes gerado.");
  } catch (error) {
    console.error("[MindLaw] Falha export clientes", error);
    toast(error.message);
  }
}

async function baixarPlanilha() {
  try {
    const response = await fetch(`/api/export${buildFilterQuery(currentFilters)}`, { method: "GET", credentials: "include", headers: getAuthHeaders() });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Falha ao exportar planilha.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MindLaw_Export.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("[MindLaw] Falha export", error);
    toast(error.message);
  }
}

async function carregarTudo() {
  const query = buildFilterQuery(currentFilters);
  const [commercial, support, logs, _forms, clientsResponse, activeClientsResponse] = await Promise.all([
    apiService.commercialDashboard(query),
    apiService.supportDashboard(query),
    apiService.logs(query),
    refreshClientOptionsForForms(),
    apiService.clients(buildFilterQuery(currentFilters)),
    apiService.clients(buildFilterQuery(buildGeneralClientFilters(currentFilters)))
  ]);
  renderComercialKpis(commercial.kpis || {});
  renderSupportKpis(support.kpis || {});
  renderComercialCharts(commercial);
  renderSupportCharts(support);
  rawLogsCache = logs.logs || [];
  renderLogsTable(rawLogsCache);

  // Lista de clientes vem do dashboard de suporte (mesma auth que já funciona),
  // e recebe os filtros dedicados da aba de clientes.
  const statsBase = support.clientEntradaStats || {};
  renderClientEntradaPanel(statsBase);
  renderClients(Array.isArray(clientsResponse.clients) ? clientsResponse.clients : []);
  renderClientStatusWidget({
    byStatus: statsBase.byStatus || {},
    total: typeof statsBase.total === "number" ? statsBase.total : 0,
    chartId: "chartClientesResumo",
    legendId: "client-resumo-legend",
    kpiId: "kpi-resumo-clientes-total",
    clickableLegend: true
  });
  const activeClients = Array.isArray(activeClientsResponse.clients) ? activeClientsResponse.clients : [];
  renderClientPlanWidget(buildClientPlanStats(activeClients));
  renderClientStageWidget(buildClientStageStats(activeClients));
  syncSectionPeriodInputs();
}

function collectFilters() {
  const activeSection = document.querySelector(".tab-view:not(.hidden)")?.id?.replace("view-", "") || "resumo";
  const period = collectPeriodFiltersFromSection(activeSection);
  return {
    month: period.month,
    year: period.year,
    startDate: period.startDate,
    endDate: period.endDate,
    clientStatus: document.getElementById("filter-client-status")?.value || "",
    clientStage: document.getElementById("filter-client-stage")?.value || "",
    clientPlan: document.getElementById("filter-client-plan")?.value || currentFilters.clientPlan || "",
    clientSegment: document.getElementById("filter-client-segment")?.value || "",
    sortBy: document.getElementById("filter-client-sort-by")?.value || "cadastro",
    sortDir: document.getElementById("filter-client-sort-dir")?.value || "desc",
    churnYear: document.getElementById("support-heatmap-year")?.value || String(currentFilters.churnYear || new Date().getFullYear()),
    logsFilterType: document.getElementById("filter-logs-type")?.value || logsFilterType || "",
    logsFilterPlan: document.getElementById("filter-logs-plan")?.value || logsFilterPlan || "",
    logsSearchTerm: document.getElementById("filter-logs-search")?.value || logsSearchTerm || ""
  };
}

function buildFilterQuery(filters) {
  const params = new URLSearchParams();
  if (filters.month) params.set("month", filters.month);
  if (filters.year) params.set("year", filters.year);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.clientStatus) params.set("clientStatus", filters.clientStatus);
  if (filters.clientPlan) params.set("clientPlan", filters.clientPlan);
  if (filters.clientSegment) params.set("clientSegment", filters.clientSegment);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortDir) params.set("sortDir", filters.sortDir);
  if (filters.churnYear) params.set("churnYear", filters.churnYear);
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function applyFilters() {
  currentFilters = collectFilters();
  localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
  try {
    await carregarTudo();
    toast("Filtros aplicados.");
  } catch (error) {
    toast(error.message || "Erro ao aplicar filtros.");
  }
}

function restoreFilters() {
  const now = new Date();
  const defaultMonth = String(now.getMonth() + 1);
  const defaultYear = String(now.getFullYear());
  const raw = localStorage.getItem("mindlaw_filters");
  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch (_error) {
    parsed = {};
  }
  currentFilters.month = parsed.month || defaultMonth;
  currentFilters.year = parsed.year || defaultYear;
  currentFilters.startDate = parsed.startDate || "";
  currentFilters.endDate = parsed.endDate || "";
  const stSel = document.getElementById("filter-client-status");
  if (stSel) stSel.value = parsed.clientStatus || "";
  const stageSel = document.getElementById("filter-client-stage");
  if (stageSel) stageSel.value = parsed.clientStage || "";
  const segmentSel = document.getElementById("filter-client-segment");
  if (segmentSel) segmentSel.value = parsed.clientSegment || "";
  const planSel = document.getElementById("filter-client-plan");
  if (planSel) planSel.value = parsed.clientPlan || "";
  const sortBySel = document.getElementById("filter-client-sort-by");
  if (sortBySel) sortBySel.value = parsed.sortBy || "cadastro";
  const sortDirSel = document.getElementById("filter-client-sort-dir");
  if (sortDirSel) sortDirSel.value = parsed.sortDir || "desc";
  const searchInput = document.getElementById("filter-client-search");
  if (searchInput) {
    searchInput.value = parsed.clientSearch || "";
    clientsSearchTerm = searchInput.value;
  }
  currentFilters.churnYear = parsed.churnYear || String(new Date().getFullYear());
  logsFilterType = parsed.logsFilterType || "";
  logsFilterPlan = parsed.logsFilterPlan || "";
  logsSearchTerm = parsed.logsSearchTerm || "";
  const logsTypeSel = document.getElementById("filter-logs-type");
  if (logsTypeSel) logsTypeSel.value = logsFilterType;
  const logsPlanSel = document.getElementById("filter-logs-plan");
  if (logsPlanSel) logsPlanSel.value = logsFilterPlan;
  const logsSearchInput = document.getElementById("filter-logs-search");
  if (logsSearchInput) logsSearchInput.value = logsSearchTerm;
  const pageSizeSel = document.getElementById("clients-page-size");
  if (pageSizeSel) {
    pageSizeSel.value = parsed.clientsPageSize || "25";
    clientsPageSize = Number(pageSizeSel.value || 25);
  }
  currentFilters = {
    ...currentFilters,
    clientStatus: parsed.clientStatus || "",
    clientStage: parsed.clientStage || "",
    clientPlan: parsed.clientPlan || "",
    clientSegment: parsed.clientSegment || "",
    sortBy: parsed.sortBy || "cadastro",
    sortDir: parsed.sortDir || "desc",
    clientSearch: parsed.clientSearch || "",
    churnYear: parsed.churnYear || String(new Date().getFullYear()),
    logsFilterType: parsed.logsFilterType || "",
    logsFilterPlan: parsed.logsFilterPlan || "",
    logsSearchTerm: parsed.logsSearchTerm || ""
  };
  syncSectionPeriodInputs();
}

async function salvarCliente() {
  try {
    const modal = document.getElementById("new-client-modal");
    const payload = {
      nome: document.getElementById("new_client_nome").value.trim(),
      telefone: formatPhoneBr(document.getElementById("new_client_telefone").value.trim()),
      email: document.getElementById("new_client_email").value.trim(),
      statusContrato: document.getElementById("new_client_status")?.value || "cliente",
      plano: document.getElementById("new_client_plano")?.value || "",
      dataReferencia: document.getElementById("new_client_data_ref")?.value || null
    };
    if (!payload.nome) throw new Error("Nome é obrigatório.");
    if (payload.telefone && !hasValidPhoneBr(payload.telefone)) {
      throw new Error("Telefone inválido. Use o padrão (xx) x xxxx-xxxx.");
    }
    await apiService.createClient(payload);
    lastCreatedClientName = payload.nome;
    document.getElementById("new_client_nome").value = "";
    document.getElementById("new_client_telefone").value = "";
    document.getElementById("new_client_email").value = "";
    if (document.getElementById("new_client_plano")) document.getElementById("new_client_plano").value = "";
    if (modal) modal.close();
    toast("Cliente salvo.");
    await carregarTudo();
    document.getElementById("post-client-modal")?.showModal();
  } catch (error) {
    toast(error.message || "Erro ao salvar cliente.");
  }
}

function openNewClientModal() {
  closeDrawer();
  document.getElementById("new-client-modal")?.showModal();
}

function bindEvents() {
  document.getElementById("btn-menu-toggle")?.addEventListener("click", openDrawer);
  document.getElementById("btn-menu-close")?.addEventListener("click", closeDrawer);
  document.getElementById("drawer-backdrop")?.addEventListener("click", closeDrawer);
  document.getElementById("nav-resumo")?.addEventListener("click", () => switchTab("resumo"));
  document.getElementById("nav-clientes")?.addEventListener("click", () => switchTab("clientes"));
  document.getElementById("nav-comercial")?.addEventListener("click", () => switchTab("comercial"));
  document.getElementById("nav-suporte")?.addEventListener("click", () => switchTab("suporte"));
  document.getElementById("nav-lancamentos")?.addEventListener("click", () => switchTab("lancamentos"));
  document.getElementById("nav-logs")?.addEventListener("click", () => switchTab("logs"));
  const registroTipo = document.getElementById("registro_tipo");
  if (registroTipo) {
    toggleFormFields(registroTipo.value || "comercial");
    registroTipo.addEventListener("change", () => {
      const tipo = registroTipo.value || "comercial";
      if (tipo !== "comercial") clearSaleForm();
      if (tipo !== "churn") clearChurnForm();
      if (tipo !== "nps") clearNpsForm();
      toggleFormFields(tipo);
    });
  }
  document.getElementById("sale_motivo")?.addEventListener("change", () => updateFuncionalidadeFieldVisibility("sale"));
  document.getElementById("churn_motivo")?.addEventListener("change", () => updateFuncionalidadeFieldVisibility("churn"));
  document.getElementById("btn-save-registro")?.addEventListener("click", async () => {
    const tipo = document.getElementById("registro_tipo")?.value || "comercial";
    if (tipo === "comercial") return salvarSale();
    if (tipo === "churn") return salvarChurn();
    return salvarNPS();
  });
  document.getElementById("btn-export")?.addEventListener("click", baixarPlanilha);
  document.getElementById("btn-export-clients")?.addEventListener("click", baixarRelatorioClientes);
  document.getElementById("btn-logout")?.addEventListener("click", logout);
  setupPhoneMask("new_client_telefone");
  setupPhoneMask("edit_client_telefone");
  document.getElementById("btn-open-new-client-modal")?.addEventListener("click", openNewClientModal);
  document.getElementById("btn-comercial-new-client")?.addEventListener("click", openNewClientModal);
  document.getElementById("btn-suporte-new-client")?.addEventListener("click", openNewClientModal);
  document.getElementById("btn-new-client-close")?.addEventListener("click", () => {
    document.getElementById("new-client-modal")?.close();
  });
  document.getElementById("btn-save-new-client")?.addEventListener("click", salvarCliente);
  document.getElementById("btn-post-client-close")?.addEventListener("click", () => {
    document.getElementById("post-client-modal")?.close();
  });
  document.getElementById("btn-post-client-later")?.addEventListener("click", () => {
    document.getElementById("post-client-modal")?.close();
  });
  document.getElementById("btn-post-client-open-launch")?.addEventListener("click", () => {
    document.getElementById("post-client-modal")?.close();
    switchTab("lancamentos");
    const tipo = document.getElementById("registro_tipo");
    if (tipo) {
      tipo.value = "comercial";
      toggleFormFields("comercial");
    }
    const saleCliente = document.getElementById("sale_cliente");
    if (saleCliente && lastCreatedClientName) {
      saleCliente.value = lastCreatedClientName;
      saleCliente.focus();
    }
  });

  const applyPeriodFromSection = async (sid) => {
    const period = collectPeriodFiltersFromSection(sid);
    currentFilters = {
      ...currentFilters,
      ...period,
      clientStatus: document.getElementById("filter-client-status")?.value || currentFilters.clientStatus || "",
      clientStage: document.getElementById("filter-client-stage")?.value || currentFilters.clientStage || "",
      clientSegment: document.getElementById("filter-client-segment")?.value || currentFilters.clientSegment || "",
      sortBy: document.getElementById("filter-client-sort-by")?.value || currentFilters.sortBy || "cadastro",
      sortDir: document.getElementById("filter-client-sort-dir")?.value || currentFilters.sortDir || "desc"
    };
    localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
    await carregarTudo();
  };

  document.addEventListener("click", async (event) => {
    const extend = event.target.closest("[data-extend-period]");
    if (!extend) return;
    const sid = extend.getAttribute("data-extend-period");
    const tM = document.getElementById(`period-to-month-${sid}`);
    const tY = document.getElementById(`period-to-year-${sid}`);
    const baseM = Number(tM?.value || currentFilters.month || new Date().getMonth() + 1);
    const baseY = Number(tY?.value || currentFilters.year || new Date().getFullYear());
    const d = new Date(baseY, baseM, 1);
    if (tM) tM.value = String(d.getMonth() + 1);
    if (tY) tY.value = String(d.getFullYear());
    try {
      await applyPeriodFromSection(sid);
      toast("Período atualizado.");
    } catch (error) {
      toast(error.message || "Erro ao atualizar período.");
    }
  });
  document.addEventListener("change", async (event) => {
    const input = event.target.closest("[data-period-input]");
    if (!input) return;
    const sid = input.getAttribute("data-period-input");
    try {
      await applyPeriodFromSection(sid);
      toast("Período atualizado.");
    } catch (error) {
      toast(error.message || "Erro ao atualizar período.");
    }
  });
  const reloadClients = async () => {
    clientsPage = 1;
    currentFilters = collectFilters();
    currentFilters.clientSearch = clientsSearchTerm;
    currentFilters.clientsPageSize = String(clientsPageSize);
    localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
    try {
      await carregarTudo();
    } catch (error) {
      toast(error.message || "Erro ao filtrar clientes.");
    }
  };
  document.getElementById("filter-client-status")?.addEventListener("change", reloadClients);
  document.getElementById("filter-client-stage")?.addEventListener("change", reloadClients);
  document.getElementById("filter-client-segment")?.addEventListener("change", reloadClients);
  document.getElementById("filter-client-plan")?.addEventListener("change", reloadClients);
  document.getElementById("filter-client-sort-by")?.addEventListener("change", reloadClients);
  document.getElementById("filter-client-sort-dir")?.addEventListener("change", reloadClients);
  document.getElementById("btn-clear-client-filters")?.addEventListener("click", async () => {
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    };
    setVal("filter-client-segment", "");
    setVal("filter-client-plan", "");
    setVal("filter-client-status", "");
    setVal("filter-client-stage", "");
    setVal("filter-client-sort-by", "cadastro");
    setVal("filter-client-sort-dir", "desc");
    setVal("filter-client-search", "");
    clientsSearchTerm = "";
    clientsPage = 1;
    currentFilters = {
      ...currentFilters,
      clientSegment: "",
      clientPlan: "",
      clientStatus: "",
      clientStage: "",
      sortBy: "cadastro",
      sortDir: "desc",
      clientSearch: ""
    };
    localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
    try {
      await carregarTudo();
      toast("Filtros de clientes limpos.");
    } catch (error) {
      toast(error.message || "Erro ao limpar filtros.");
    }
  });
  document.getElementById("filter-client-search")?.addEventListener("input", (event) => {
    clientsSearchTerm = event.target.value || "";
    clientsPage = 1;
    currentFilters = { ...currentFilters, clientSearch: clientsSearchTerm };
    localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
    renderClients(Array.isArray(currentClientRawList) ? currentClientRawList : []);
  });
  document.getElementById("support-heatmap-year")?.addEventListener("change", async (event) => {
    selectedSupportMonth = null;
    currentFilters = { ...currentFilters, churnYear: event.target.value || String(new Date().getFullYear()) };
    localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
    try {
      await carregarTudo();
      toast("Ano do churn atualizado.");
    } catch (error) {
      toast(error.message || "Erro ao atualizar ano do churn.");
    }
  });
  document.getElementById("clients-page-size")?.addEventListener("change", async (event) => {
    clientsPageSize = Number(event.target.value || 25);
    clientsPage = 1;
    currentFilters = { ...currentFilters, clientsPageSize: String(clientsPageSize) };
    localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
    renderClients(currentClientList);
  });
  document.getElementById("clients-prev-page")?.addEventListener("click", () => {
    clientsPage -= 1;
    renderClients(currentClientList);
  });
  document.getElementById("clients-next-page")?.addEventListener("click", () => {
    clientsPage += 1;
    renderClients(currentClientList);
  });
  document.getElementById("filter-logs-type")?.addEventListener("change", (event) => {
    logsFilterType = event.target.value || "";
    currentFilters = { ...currentFilters, logsFilterType };
    localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
    renderLogsTable(rawLogsCache);
  });
  document.getElementById("filter-logs-plan")?.addEventListener("change", (event) => {
    logsFilterPlan = event.target.value || "";
    currentFilters = { ...currentFilters, logsFilterPlan };
    localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
    renderLogsTable(rawLogsCache);
  });
  document.getElementById("filter-logs-search")?.addEventListener("input", (event) => {
    logsSearchTerm = event.target.value || "";
    currentFilters = { ...currentFilters, logsSearchTerm };
    localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
    renderLogsTable(rawLogsCache);
  });
  document.getElementById("btn-clear-logs-filters")?.addEventListener("click", () => {
    logsFilterType = "";
    logsFilterPlan = "";
    logsSearchTerm = "";
    const logsTypeSel = document.getElementById("filter-logs-type");
    if (logsTypeSel) logsTypeSel.value = "";
    const logsPlanSel = document.getElementById("filter-logs-plan");
    if (logsPlanSel) logsPlanSel.value = "";
    const logsSearchInput = document.getElementById("filter-logs-search");
    if (logsSearchInput) logsSearchInput.value = "";
    currentFilters = { ...currentFilters, logsFilterType: "", logsFilterPlan: "", logsSearchTerm: "" };
    localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
    renderLogsTable(rawLogsCache);
  });
  document.getElementById("logs-active-interactive-filter")?.addEventListener("click", (event) => {
    const clearBtn = event.target.closest("#btn-clear-interactive-filter");
    if (!clearBtn) return;
    interactiveFilter = null;
    renderLogsTable(rawLogsCache);
    toast("Filtro interativo removido.");
  });
  document.getElementById("logs-table")?.addEventListener("click", async (event) => {
    const detailToggle = event.target.closest("[data-log-detail-toggle]");
    if (detailToggle) {
      const id = detailToggle.getAttribute("data-log-detail-toggle") || "";
      const expanded = detailToggle.getAttribute("data-expanded") === "1";
      const shortEl = document.querySelector(`[data-log-detail-short="${id}"]`);
      const fullEl = document.querySelector(`[data-log-detail-full="${id}"]`);
      if (shortEl && fullEl) {
        shortEl.classList.toggle("hidden", !expanded);
        fullEl.classList.toggle("hidden", expanded);
        detailToggle.setAttribute("data-expanded", expanded ? "0" : "1");
        detailToggle.textContent = expanded ? "Ver mais" : "Ver menos";
      }
      return;
    }
    const editBtn = event.target.closest("[data-edit-log-id]");
    if (editBtn) {
      const origem = editBtn.getAttribute("data-edit-log-origem") || "";
      const id = editBtn.getAttribute("data-edit-log-id") || "";
      const record = rawLogsCache.find((r) => String(r.origem) === origem && String(r.id) === id);
      if (record) openLogEditModal(record);
      return;
    }
    const deleteBtn = event.target.closest("[data-delete-log-id]");
    if (!deleteBtn) return;
    const origem = deleteBtn.getAttribute("data-delete-log-origem") || "";
    const id = deleteBtn.getAttribute("data-delete-log-id") || "";
    const record = rawLogsCache.find((r) => String(r.origem) === origem && String(r.id) === id);
    if (!record) return;
    try {
      await deleteLogRecord(record);
    } catch (error) {
      toast(error.message || "Erro ao apagar lançamento.");
    }
  });
  document.getElementById("btn-log-edit-close")?.addEventListener("click", () => {
    document.getElementById("log-edit-modal")?.close();
  });
  document.getElementById("btn-log-edit-save")?.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await saveLogEdit();
    } catch (error) {
      toast(error.message || "Erro ao atualizar lançamento.");
    }
  });
  document.getElementById("heatmap")?.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-support-month]");
    if (!trigger) return;
    const idx = Number(trigger.getAttribute("data-support-month"));
    if (Number.isNaN(idx)) return;
    selectedSupportMonth = idx;
    const supportView = document.getElementById("view-suporte");
    if (!supportView?.classList.contains("hidden")) {
      carregarTudo().catch((error) => toast(error.message || "Erro ao carregar detalhes do mês."));
    }
  });
  document.getElementById("clients-list")?.addEventListener("click", (event) => {
    const copyPhoneBtn = event.target.closest("[data-copy-phone]");
    if (copyPhoneBtn) {
      const phone = copyPhoneBtn.getAttribute("data-copy-phone") || "";
      copyText(phone)
        .then((ok) => toast(ok ? "Telefone copiado." : "Não foi possível copiar o telefone."))
        .catch(() => toast("Não foi possível copiar o telefone."));
      return;
    }
    const trigger = event.target.closest("[data-client-edit]");
    if (!trigger) return;
    openClientEditModal(trigger.getAttribute("data-client-edit"));
  });
  document.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-client-link]");
    if (!trigger) return;
    const clientName = trigger.getAttribute("data-client-link") || "";
    if (!clientName) return;
    try {
      await navigateToClientByName(clientName);
      toast(`Cliente localizado: ${clientName}`);
    } catch (error) {
      toast(error.message || "Erro ao abrir cliente.");
    }
  });
  document.addEventListener("click", (event) => {
    const navTrigger = event.target.closest("[data-go-tab]");
    if (!navTrigger) return;
    const tab = navTrigger.getAttribute("data-go-tab");
    if (tab) switchTab(tab);
  });
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-client-status-filter]");
    if (!target) return;
    const status = target.getAttribute("data-client-status-filter");
    if (status) applyClientStatusFilter(status);
  });
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-client-plan-filter]");
    if (!target) return;
    const plan = target.getAttribute("data-client-plan-filter");
    if (plan) applyClientPlanFilter(plan);
  });
  document.getElementById("btn-client-edit-save")?.addEventListener("click", salvarEdicaoCliente);
  document.getElementById("btn-client-edit-close")?.addEventListener("click", () => {
    document.getElementById("client-edit-modal")?.close();
  });
}

function bindRevealObserver() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll(".reveal-card").forEach((card) => observer.observe(card));
}

document.addEventListener("DOMContentLoaded", async () => {
  if (window.Chart) {
    Chart.defaults.color = "#FFFFFF";
    Chart.defaults.borderColor = "rgba(255,255,255,0.14)";
    Chart.defaults.plugins.legend.labels.color = "#FFFFFF";
  }
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
  renderSectionPeriodFilters();
  document.querySelectorAll('input[type="date"]').forEach((el) => { el.valueAsDate = new Date(); });
  bindEvents();
  bindRevealObserver();
  renderClients([]);
  restoreFilters();
  switchTab(localStorage.getItem("mindlaw_active_tab") || "resumo");
  try {
    await carregarTudo();
  } catch (error) {
    console.error("[MindLaw] Falha ao carregar dashboard", error);
    toast(error.message || "Falha ao carregar dados.");
  }
});
