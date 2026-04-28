const chartState = { loss: null, closure: null, nps: null, clientEntradas: null };
let currentFilters = {};

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
      throw new Error(data.error || "Erro na requisicao.");
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
  createClient: (payload) => request("/api/clients", { method: "POST", body: JSON.stringify(payload) }),
  createSale: (payload) => request("/api/sales", { method: "POST", body: JSON.stringify(payload) }),
  createChurn: (payload) => request("/api/support/churn", { method: "POST", body: JSON.stringify(payload) }),
  createNps: (payload) => request("/api/support/nps", { method: "POST", body: JSON.stringify(payload) }),
  logout: () => request("/api/auth/logout", { method: "POST" })
};

function switchTab(tabId) {
  ["resumo", "comercial", "suporte", "lancamentos", "clientes", "logs"].forEach((id) => {
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

async function logout() {
  await apiService.logout();
  localStorage.removeItem("mindlaw_token");
  window.location.href = "/login";
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function renderComercialKpis(kpis) {
  document.getElementById("kpi-ltv").textContent = money(kpis.ltvEstimado || 0);
  document.getElementById("kpi-conv").textContent = `${(kpis.taxaConversao || 0).toFixed(1)}%`;
  document.getElementById("kpi-resumo-receita").textContent = money(kpis.ltvEstimado || 0);
}

function renderSupportKpis(kpis) {
  document.getElementById("kpi-churn").textContent = `${(kpis.churnRate || 0).toFixed(1)}%`;
  document.getElementById("kpi-nps").textContent = `${(kpis.npsScore || 0).toFixed(1)}%`;
  document.getElementById("kpi-resumo-churn").textContent = `${(kpis.churnRate || 0).toFixed(1)}%`;
  document.getElementById("kpi-resumo-nps").textContent = `${(kpis.npsScore || 0).toFixed(1)}%`;
}

function renderComercialCharts(commercial) {
  const funnel = commercial.funnel || {};
  const reasons = commercial.lossReasons || {};

  const funnelCtx = document.getElementById("chartFunnel").getContext("2d");
  if (chartState.closure) chartState.closure.destroy();
  chartState.closure = new Chart(funnelCtx, {
    type: "doughnut",
    data: {
      labels: ["Ganho", "Perdido", "Em Negociacao"],
      datasets: [{
        data: [funnel.gains || 0, funnel.losses || 0, funnel.negotiating || 0],
        backgroundColor: ["#C5A059", "#FFFFFF", "#4B5563"],
        borderWidth: 0
      }]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: "#FFFFFF" } } } }
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
        backgroundColor: ["#C5A059", "#FFFFFF", "#4B5563", "#92733C"],
        borderWidth: useBar ? 1 : 0,
        borderRadius: useBar ? 8 : 0
      }]
    },
    options: {
      indexAxis: useBar ? "y" : "x",
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#FFFFFF" } } },
      scales: useBar
        ? {
            x: { ticks: { color: "#FFFFFF" }, grid: { color: "rgba(255,255,255,0.1)" } },
            y: { ticks: { color: "#FFFFFF" }, grid: { color: "rgba(255,255,255,0.1)" } }
          }
        : {}
    }
  });
}

function renderClientEntradaPanel(stats) {
  const byStatus = (stats && stats.byStatus) || {};
  const total = typeof stats?.total === "number" ? stats.total : 0;
  const kpi = document.getElementById("kpi-client-entradas-total");
  if (kpi) kpi.textContent = String(total);
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
  const leg = document.getElementById("client-dashboard-legend");
  if (leg) {
    leg.innerHTML = CLIENT_STATUS_CHART_ORDER.map((k) => {
      const n = byStatus[k] || 0;
      const c = CLIENT_CHART_COLORS[k] || "#94a3b8";
      const label = CLIENT_STATUS_LABELS[k] || k;
      return `<li class="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-mindlaw-teal/40 px-2 py-1"><span class="h-2 w-2 rounded-full" style="background:${c}"></span>${label}: <strong class="text-mindlaw-white">${n}</strong></li>`;
    }).join("");
  }
  const el = document.getElementById("chartClientesEntradas");
  if (!el) return;
  const cctx = el.getContext("2d");
  const labels = [];
  const data = [];
  const bg = [];
  for (const k of CLIENT_STATUS_CHART_ORDER) {
    const n = byStatus[k] || 0;
    if (n > 0) {
      labels.push(CLIENT_STATUS_LABELS[k] || k);
      data.push(n);
      bg.push(CLIENT_CHART_COLORS[k] || "#94a3b8");
    }
  }
  if (chartState.clientEntradas) chartState.clientEntradas.destroy();
  if (labels.length === 0) {
    chartState.clientEntradas = new Chart(cctx, {
      type: "doughnut",
      data: {
        labels: ["Sem entradas neste recorte"],
        datasets: [{ data: [1], backgroundColor: ["#374151"], borderWidth: 0 }]
      },
      options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: "#FFFFFF" } } } }
    });
    return;
  }
  chartState.clientEntradas = new Chart(cctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: bg, borderWidth: 0 }] },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: "#FFFFFF" } } }
    }
  });
}

function renderSupportCharts(supportDashboard) {
  const monthCount = supportDashboard.churnByMonth || Array.from({ length: 12 }, () => 0);
  const heatmap = document.getElementById("heatmap");
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
      return `<div class="rounded p-2 text-center font-semibold" style="background: ${bg}; color: ${textColor};">${monthLabels[i]}<br/><span class="text-[10px]">${count}</span></div>`;
    })
    .join("");

  const npsDist = supportDashboard.npsDistribution || { Promotor: 0, Neutro: 0, Detrator: 0 };
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
        backgroundColor: [promoterGradient, "#FFFFFF", "#4B5563"],
        borderWidth: 0
      }]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: "#FFFFFF" } } } }
  });
  document.getElementById("kpi-resumo-mrr").textContent = money(supportDashboard.totalMrrPerdido || 0);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderLogsTable(logs) {
  const statusClass = (value) => {
    const normalized = String(value || "").toLowerCase();
    if (normalized.includes("ganho")) return "status-ganho";
    if (normalized.includes("perdido") || normalized.includes("detrator") || normalized.includes("churn")) return "status-perdido";
    return "status-negociacao";
  };

  const body = document.getElementById("logs-table");
  body.innerHTML = logs.length
    ? logs.map((item) => `<tr>
      <td class="px-5 py-4">${item.tipo}</td>
      <td class="px-5 py-4">${item.cliente || "-"}</td>
      <td class="px-5 py-4">${item.data ? new Date(item.data).toLocaleDateString("pt-BR") : "-"}</td>
      <td class="px-5 py-4"><span class="status-chip ${statusClass(item.status)}">${item.status || "-"}</span></td>
      <td class="px-5 py-4">${item.detalhe || "-"}</td>
    </tr>`).join("")
    : `<tr><td colspan="5" class="px-5 py-6 text-center text-mindlaw-white/70">Sem registros.</td></tr>`;
}

function renderClients(clients) {
  const container = document.getElementById("clients-list");
  const datalist = document.getElementById("clients-options");
  if (!container || !datalist) return;
  const list = Array.isArray(clients) ? clients : [];
  datalist.innerHTML = list.map((c) => `<option value="${escapeHtml(c.nome)}"></option>`).join("");
  const statusKey = (s) => String(s || "cliente").replace(/[^a-z0-9_]/gi, "_");
  const fmtData = (d) => {
    if (!d) return "—";
    const t = new Date(d);
    return Number.isNaN(t.getTime()) ? "—" : t.toLocaleDateString("pt-BR");
  };
  container.innerHTML = list.length
    ? list.map((c) => {
      const st = c.statusContrato || "cliente";
      const chipClass = `cli-chip cli-st-${statusKey(st)}`;
      return `<article class="rounded-xl border border-white/10 bg-mindlaw-teal/40 p-3">
      <p class="font-semibold">${escapeHtml(c.nome)}</p>
      <span class="${chipClass}">${escapeHtml(CLIENT_STATUS_LABELS[st] || st)}</span>
      <p class="mt-1 text-xs text-mindlaw-white/70">${escapeHtml(c.plano || "—")} · ref. ${fmtData(c.dataReferencia)}</p>
      <p class="text-xs text-mindlaw-white/70">${escapeHtml(c.telefone || "Sem telefone")} • ${escapeHtml(c.email || "Sem e-mail")}</p>
    </article>`;
    }).join("")
    : `<p class="text-sm text-mindlaw-white/70">Nenhum cliente neste filtro. Confira o status, reinicie o servidor (import automático se a coleção estiver vazia) ou rode <code class="text-mindlaw-gold/90">npm run import:atividade</code>. Para reimportar: defina <code class="text-mindlaw-gold/90">FORCE_IMPORT_LISTA=1</code> no .env e reinicie.</p>`;
}

async function salvarSale() {
  try {
    const payload = {
      cliente: document.getElementById("sale_cliente").value.trim(),
      valorContrato: Number(document.getElementById("sale_valor").value || 0),
      data: document.getElementById("sale_data").value,
      status: document.getElementById("sale_status").value,
      motivoPerda: document.getElementById("sale_motivo").value,
      detalhamentoTecnico: document.getElementById("sale_detalhe").value.trim(),
      competidor: document.getElementById("sale_competidor").value.trim()
    };
    if (!payload.cliente || !payload.data) throw new Error("Cliente e data são obrigatórios.");
    await apiService.createSale(payload);
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
      motivoPrincipal: document.getElementById("churn_motivo").value
    };
    if (!payload.cliente || !payload.dataChurn) throw new Error("Cliente e data do churn são obrigatórios.");
    await apiService.createChurn(payload);
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
      throw new Error(data.error || "Falha ao exportar relatorio de clientes.");
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
  const [commercial, support, logs] = await Promise.all([
    apiService.commercialDashboard(query),
    apiService.supportDashboard(query),
    apiService.logs(query)
  ]);
  renderComercialKpis(commercial.kpis || {});
  renderSupportKpis(support.kpis || {});
  renderComercialCharts(commercial);
  renderSupportCharts(support);
  renderLogsTable(logs.logs || []);

  // Lista de clientes vem do dashboard de suporte (mesma auth que já funciona),
  // evitando depender só de GET /api/clients em ambientes com roteamento estranho.
  renderClientEntradaPanel(support.clientEntradaStats || {});
  renderClients(Array.isArray(support.clients) ? support.clients : []);
}

function collectFilters() {
  return {
    month: document.getElementById("filter-month")?.value || "",
    year: document.getElementById("filter-year")?.value || "",
    startDate: document.getElementById("filter-start")?.value || "",
    endDate: document.getElementById("filter-end")?.value || "",
    clientStatus: document.getElementById("filter-client-status")?.value || ""
  };
}

function buildFilterQuery(filters) {
  const params = new URLSearchParams();
  if (filters.month) params.set("month", filters.month);
  if (filters.year) params.set("year", filters.year);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.clientStatus) params.set("clientStatus", filters.clientStatus);
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
  document.getElementById("filter-month").value = parsed.month || defaultMonth;
  document.getElementById("filter-year").value = parsed.year || defaultYear;
  document.getElementById("filter-start").value = parsed.startDate || "";
  document.getElementById("filter-end").value = parsed.endDate || "";
  const stSel = document.getElementById("filter-client-status");
  if (stSel) stSel.value = parsed.clientStatus || "";
  currentFilters = collectFilters();
}

async function salvarCliente() {
  try {
    const payload = {
      nome: document.getElementById("client_nome").value.trim(),
      telefone: document.getElementById("client_telefone").value.trim(),
      email: document.getElementById("client_email").value.trim(),
      statusContrato: document.getElementById("client_status")?.value || "cliente",
      plano: document.getElementById("client_plano")?.value.trim() || "",
      dataReferencia: document.getElementById("client_data_ref")?.value || null
    };
    if (!payload.nome) throw new Error("Nome é obrigatório.");
    await apiService.createClient(payload);
    document.getElementById("client_nome").value = "";
    document.getElementById("client_telefone").value = "";
    document.getElementById("client_email").value = "";
    if (document.getElementById("client_plano")) document.getElementById("client_plano").value = "";
    toast("Cliente salvo.");
    await carregarTudo();
  } catch (error) {
    toast(error.message || "Erro ao salvar cliente.");
  }
}

function bindEvents() {
  document.getElementById("btn-menu-toggle")?.addEventListener("click", openDrawer);
  document.getElementById("btn-menu-close")?.addEventListener("click", closeDrawer);
  document.getElementById("drawer-backdrop")?.addEventListener("click", closeDrawer);
  document.getElementById("btn-toggle-filters")?.addEventListener("click", toggleFiltersPanel);
  document.getElementById("btn-apply-filters")?.addEventListener("click", applyFilters);
  document.getElementById("nav-resumo")?.addEventListener("click", () => switchTab("resumo"));
  document.getElementById("nav-comercial")?.addEventListener("click", () => switchTab("comercial"));
  document.getElementById("nav-suporte")?.addEventListener("click", () => switchTab("suporte"));
  document.getElementById("nav-lancamentos")?.addEventListener("click", () => switchTab("lancamentos"));
  document.getElementById("nav-clientes")?.addEventListener("click", () => switchTab("clientes"));
  document.getElementById("nav-logs")?.addEventListener("click", () => switchTab("logs"));
  document.getElementById("btn-save-sale")?.addEventListener("click", salvarSale);
  document.getElementById("btn-save-churn")?.addEventListener("click", salvarChurn);
  document.getElementById("btn-save-nps")?.addEventListener("click", salvarNPS);
  document.getElementById("btn-export")?.addEventListener("click", baixarPlanilha);
  document.getElementById("btn-export-clients")?.addEventListener("click", baixarRelatorioClientes);
  document.getElementById("btn-logout")?.addEventListener("click", logout);
  document.getElementById("btn-save-client")?.addEventListener("click", salvarCliente);
  document.getElementById("filter-client-status")?.addEventListener("change", async () => {
    currentFilters = collectFilters();
    localStorage.setItem("mindlaw_filters", JSON.stringify(currentFilters));
    try {
      await carregarTudo();
    } catch (error) {
      toast(error.message || "Erro ao filtrar clientes.");
    }
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
