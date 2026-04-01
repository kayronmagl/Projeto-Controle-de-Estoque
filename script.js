"use strict";

const supabaseUrl = "https://tehaofdyrhzvqvwrevye.supabase.co";
const supabasePublishableKey = "sb_publishable_7pEMqm6zURvQkYP57zRzFA_kUUN6idt";

const state = {
  view: "products",
  products: [],
  history: [],
  pendingIds: new Set(),
  isCreating: false,
  logoutRequested: false,
  session: null,
};

const els = {
  authShell: document.getElementById("authShell"),
  authForm: document.getElementById("authForm"),
  authNotice: document.getElementById("authNotice"),
  authSubmitButton: document.getElementById("authSubmitButton"),
  appShell: document.getElementById("appShell"),
  currentUserChip: document.getElementById("currentUserChip"),
  signOutButton: document.getElementById("signOutButton"),
  noticeBar: document.getElementById("noticeBar"),
  refreshButton: document.getElementById("refreshButton"),
  productsTab: document.getElementById("productsTab"),
  historyTab: document.getElementById("historyTab"),
  productsView: document.getElementById("productsView"),
  historyView: document.getElementById("historyView"),
  productList: document.getElementById("productList"),
  historyList: document.getElementById("historyList"),
  alertsList: document.getElementById("alertsList"),
  productsEmptyState: document.getElementById("productsEmptyState"),
  historyEmptyState: document.getElementById("historyEmptyState"),
  alertsEmptyState: document.getElementById("alertsEmptyState"),
  createProductForm: document.getElementById("createProductForm"),
  createProductButton: document.getElementById("createProductButton"),
  accessModeNote: document.getElementById("accessModeNote"),
  metricTotal: document.getElementById("metricTotal"),
  metricOk: document.getElementById("metricOk"),
  metricLow: document.getElementById("metricLow"),
  metricCritical: document.getElementById("metricCritical"),
  productCardTemplate: document.getElementById("productCardTemplate"),
  historyCardTemplate: document.getElementById("historyCardTemplate"),
};

const isConfigured =
  supabaseUrl &&
  supabasePublishableKey &&
  supabasePublishableKey !== "SUA_PUBLISHABLE_KEY" &&
  typeof window.supabase !== "undefined";

const supabaseClient = isConfigured
  ? window.supabase.createClient(supabaseUrl, supabasePublishableKey)
  : null;

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  bindEvents();
  renderProducts();
  renderHistory();
  setAuthenticated(false);

  if (!isConfigured) {
    showAuthNotice(
      "Configure a SUPABASE_PUBLISHABLE_KEY em script.js e execute o database.sql no Supabase para iniciar.",
      "error",
      true,
    );
    return;
  }

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    await applySession(session);
  });

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    showAuthNotice(getErrorMessage(error, "Nao foi possivel validar a sessao atual."), "error", true);
    return;
  }

  await applySession(data.session, true);
}

function bindEvents() {
  els.authForm.addEventListener("submit", handleSignIn);
  els.signOutButton.addEventListener("click", handleSignOut);
  els.productsTab.addEventListener("click", () => setView("products"));
  els.historyTab.addEventListener("click", () => setView("history"));
  els.refreshButton.addEventListener("click", handleRefresh);
  els.productList.addEventListener("click", handleProductAction);
  els.createProductForm.addEventListener("submit", handleCreateProduct);
}

async function applySession(session, silent = false) {
  const currentToken = state.session?.access_token || null;
  const nextToken = session?.access_token || null;
  const sessionChanged = currentToken !== nextToken;

  state.session = session || null;
  setAuthenticated(Boolean(session?.user));

  if (!state.session) {
    if (sessionChanged || !silent) {
      resetState();
      clearNotice();

      if (state.logoutRequested) {
        state.logoutRequested = false;
        showAuthNotice("Sessao encerrada.", "success", true);
      } else {
        showAuthNotice("Entre com email e senha para acessar o controle de estoque.", "warning", true);
      }
    }

    return;
  }

  state.logoutRequested = false;
  clearAuthNotice();
  updateCurrentUser(session.user);

  if (!sessionChanged && silent) {
    return;
  }

  await fetchProducts(true);

  if (state.view === "history") {
    await fetchHistory(true);
  }

  if (!silent) {
    showNotice("Acesso liberado.", "success");
  }
}

function setAuthenticated(authenticated) {
  const isAuthenticated = Boolean(authenticated);

  els.authShell.hidden = isAuthenticated;
  els.appShell.hidden = !isAuthenticated;
  els.currentUserChip.hidden = !isAuthenticated;

  if (els.accessModeNote) {
    els.accessModeNote.hidden = !isAuthenticated;
    els.accessModeNote.classList.remove("is-warning", "is-success");

    if (isAuthenticated) {
      els.accessModeNote.textContent =
        "Acesso autenticado ativo. Cadastro, atualizacao de estoque e historico estao liberados.";
      els.accessModeNote.classList.add("is-success");
    }
  }

  syncCreateFormState();
}

function updateCurrentUser(user) {
  const email = user?.email || "usuario autenticado";
  els.currentUserChip.textContent = email;
}

async function handleSignIn(event) {
  event.preventDefault();

  if (!supabaseClient) {
    showAuthNotice("A configuracao do Supabase ainda nao foi concluida.", "error", true);
    return;
  }

  const formData = new FormData(els.authForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    showAuthNotice("Informe email e senha para entrar.", "error", true);
    return;
  }

  setAuthFormDisabled(true);
  showAuthNotice("Validando acesso...", "warning", true);

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    showAuthNotice("Acesso validado. Carregando painel...", "success", true);
    els.authForm.reset();
  } catch (error) {
    showAuthNotice(getErrorMessage(error, "Nao foi possivel realizar o login."), "error", true);
  } finally {
    setAuthFormDisabled(false);
  }
}

async function handleSignOut() {
  if (!supabaseClient) {
    return;
  }

  els.signOutButton.disabled = true;

  try {
    state.logoutRequested = true;
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      throw error;
    }
  } catch (error) {
    state.logoutRequested = false;
    showNotice(getErrorMessage(error, "Nao foi possivel encerrar a sessao."), "error", true);
  } finally {
    els.signOutButton.disabled = false;
  }
}

async function handleRefresh() {
  if (!supabaseClient || !state.session) {
    showAuthNotice("Faca login para atualizar os dados.", "warning", true);
    return;
  }

  if (state.view === "history") {
    await fetchHistory();
    return;
  }

  await fetchProducts();
}

function setView(view) {
  state.view = view;
  els.productsTab.classList.toggle("is-active", view === "products");
  els.historyTab.classList.toggle("is-active", view === "history");
  els.productsView.classList.toggle("is-active", view === "products");
  els.historyView.classList.toggle("is-active", view === "history");

  if (view === "history" && state.session) {
    fetchHistory();
  }
}

async function fetchProducts(silent = false) {
  if (!supabaseClient || !state.session) {
    return;
  }

  if (!silent) {
    showNotice("Carregando produtos...");
  }

  try {
    const { data, error } = await supabaseClient
      .from("products")
      .select("id, name, quantity, min_quantity, created_at")
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    state.products = Array.isArray(data) ? data : [];
    renderProducts();
    clearNotice();
  } catch (error) {
    showNotice(getErrorMessage(error, "Nao foi possivel carregar os produtos."), "error", true);
  }
}

async function fetchHistory(silent = false) {
  if (!supabaseClient || !state.session) {
    return;
  }

  if (!silent) {
    showNotice("Carregando historico...");
  }

  try {
    const { data, error } = await supabaseClient
      .from("movements")
      .select("id, product_id, type, quantity, previous_quantity, result_quantity, created_at, products(name)")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      throw error;
    }

    state.history = Array.isArray(data) ? data : [];
    renderHistory();
    clearNotice();
  } catch (error) {
    showNotice(getErrorMessage(error, "Nao foi possivel carregar o historico."), "error", true);
  }
}

async function handleProductAction(event) {
  const button = event.target.closest("[data-action]");

  if (!button || !ensureWriteAccess()) {
    return;
  }

  const card = button.closest("[data-product-id]");

  if (!card) {
    return;
  }

  const productId = card.dataset.productId;
  const action = button.dataset.action;
  const type = action === "increase" ? "entrada" : "saida";

  await updateStock(productId, type);
}

async function handleCreateProduct(event) {
  event.preventDefault();

  if (!supabaseClient || !ensureWriteAccess()) {
    return;
  }

  if (state.isCreating) {
    return;
  }

  const formData = new FormData(els.createProductForm);
  const name = String(formData.get("name") || "").trim();
  const quantity = Number.parseInt(String(formData.get("quantity") || "0"), 10);
  const minQuantity = Number.parseInt(String(formData.get("min_quantity") || "0"), 10);

  if (!name) {
    showNotice("Informe o nome do item antes de salvar.", "error", true);
    return;
  }

  if (!Number.isInteger(quantity) || quantity < 0) {
    showNotice("A quantidade inicial precisa ser um inteiro maior ou igual a zero.", "error", true);
    return;
  }

  if (!Number.isInteger(minQuantity) || minQuantity < 1) {
    showNotice("O minimo ideal precisa ser um inteiro maior ou igual a um.", "error", true);
    return;
  }

  const duplicate = state.products.some(
    (product) => String(product.name || "").trim().toLowerCase() === name.toLowerCase(),
  );

  if (duplicate) {
    showNotice("Ja existe um item com esse nome no estoque.", "error", true);
    return;
  }

  state.isCreating = true;
  syncCreateFormState();
  showNotice("Salvando novo item...");

  try {
    const { error } = await supabaseClient.rpc("create_product_with_initial_stock", {
      p_name: name,
      p_initial_quantity: quantity,
      p_min_quantity: minQuantity,
    });

    if (error) {
      throw error;
    }

    await fetchProducts(true);
    await fetchHistory(true);
    resetCreateForm();
    showNotice(`Item ${name} cadastrado com sucesso.`, "success");
  } catch (error) {
    showNotice(getErrorMessage(error, "Nao foi possivel cadastrar o item."), "error", true);
  } finally {
    state.isCreating = false;
    syncCreateFormState();
  }
}

async function updateStock(id, type) {
  if (!supabaseClient || !state.session || state.pendingIds.has(id)) {
    return;
  }

  const product = state.products.find((item) => item.id === id);

  if (!product) {
    return;
  }

  const delta = type === "entrada" ? 1 : -1;
  const previousQuantity = Number(product.quantity) || 0;
  const nextQuantity = Math.max(0, previousQuantity + delta);

  if (type === "saida" && previousQuantity === 0) {
    showNotice("A quantidade ja esta em zero.", "error");
    return;
  }

  state.pendingIds.add(id);
  renderProducts();
  showNotice("Atualizando estoque...");

  try {
    const { error } = await supabaseClient.rpc("apply_stock_movement", {
      p_product_id: id,
      p_type: type,
      p_quantity: 1,
    });

    if (error) {
      throw error;
    }

    await fetchProducts(true);
    await fetchHistory(true);

    const updatedProduct = state.products.find((item) => item.id === id) || {
      ...product,
      quantity: nextQuantity,
    };

    showNotice(buildStockNotice(updatedProduct, type), getNoticeTone(updatedProduct));
  } catch (error) {
    showNotice(getErrorMessage(error, "Nao foi possivel atualizar o estoque."), "error", true);
  } finally {
    state.pendingIds.delete(id);
    renderProducts();
  }
}

function renderProducts() {
  els.productList.innerHTML = "";

  const metrics = {
    total: state.products.length,
    ok: 0,
    low: 0,
    critical: 0,
  };

  if (state.products.length === 0) {
    els.productsEmptyState.hidden = false;
    els.productsEmptyState.textContent = state.session
      ? "Nenhum produto encontrado. Cadastre itens na tabela products para iniciar o controle."
      : "Entre no sistema para carregar os produtos cadastrados.";
  } else {
    els.productsEmptyState.hidden = true;
  }

  state.products.forEach((product) => {
    const status = getStatus(product.quantity, product.min_quantity);
    metrics[status.key] += 1;

    const card = els.productCardTemplate.content.firstElementChild.cloneNode(true);
    const pending = state.pendingIds.has(product.id);

    card.dataset.productId = product.id;
    card.classList.toggle("is-pending", pending);
    card.classList.add(`product-card-${status.key}`);
    card.querySelector(".product-name").textContent = product.name;
    card.querySelector(".product-min").textContent = product.min_quantity ?? 5;
    card.querySelector(".quantity-value").textContent = String(product.quantity ?? 0);

    const statusBadge = card.querySelector(".status-badge");
    statusBadge.textContent = status.label;
    statusBadge.classList.add(`status-${status.key}`);

    card.querySelectorAll(".action-button").forEach((button) => {
      button.disabled = pending || !state.session;
    });

    els.productList.appendChild(card);
  });

  els.metricTotal.textContent = String(metrics.total);
  els.metricOk.textContent = String(metrics.ok);
  els.metricLow.textContent = String(metrics.low);
  els.metricCritical.textContent = String(metrics.critical);
  renderAlerts();
}

function renderHistory() {
  els.historyList.innerHTML = "";

  if (state.history.length === 0) {
    els.historyEmptyState.hidden = false;
    els.historyEmptyState.textContent =
      "As movimentacoes mais recentes vao aparecer aqui em ordem decrescente.";
    return;
  }

  els.historyEmptyState.hidden = true;

  state.history.forEach((movement) => {
    const card = els.historyCardTemplate.content.firstElementChild.cloneNode(true);
    const productName = movement.products?.name || "Produto removido";

    card.querySelector(".history-product").textContent = productName;
    card.querySelector(".history-summary").textContent = formatMovementSummary(movement);
    card.querySelector(".history-date").textContent = formatDate(movement.created_at);

    const typeNode = card.querySelector(".history-type");
    typeNode.textContent = movement.type;
    typeNode.classList.add(`history-type-${movement.type}`);

    card.querySelector(".history-quantity").textContent = `${movement.quantity} unidade(s)`;
    els.historyList.appendChild(card);
  });
}

function renderAlerts() {
  els.alertsList.innerHTML = "";

  const alertProducts = state.products
    .map((product) => ({
      product,
      status: getStatus(product.quantity, product.min_quantity),
    }))
    .filter((entry) => entry.status.key !== "ok")
    .sort((left, right) => {
      const severity = {
        critical: 0,
        low: 1,
      };

      const severityDiff = severity[left.status.key] - severity[right.status.key];

      if (severityDiff !== 0) {
        return severityDiff;
      }

      return (left.product.quantity ?? 0) - (right.product.quantity ?? 0);
    });

  if (alertProducts.length === 0) {
    els.alertsEmptyState.hidden = false;
    els.alertsEmptyState.textContent =
      "Nenhum item em falta no momento. O estoque esta operando dentro do minimo ideal.";
    return;
  }

  els.alertsEmptyState.hidden = true;

  alertProducts.forEach(({ product, status }) => {
    const card = document.createElement("article");
    card.className = `alert-card alert-${status.key}`;

    const top = document.createElement("div");
    top.className = "alert-card-top";

    const title = document.createElement("h3");
    title.className = "alert-card-title";
    title.textContent = product.name;

    const badge = document.createElement("span");
    badge.className = `status-badge status-${status.key}`;
    badge.textContent = status.label;

    const body = document.createElement("p");
    body.className = "alert-card-body";
    body.textContent = buildAlertMessage(product, status);

    top.append(title, badge);
    card.append(top, body);
    els.alertsList.appendChild(card);
  });
}

function getStatus(quantity, minQuantity) {
  const safeQuantity = Number(quantity) || 0;
  const safeMin = Number(minQuantity) || 5;
  const criticalLimit = Math.max(1, Math.floor(safeMin / 2));

  if (safeQuantity <= criticalLimit) {
    return { key: "critical", label: "Critico" };
  }

  if (safeQuantity <= safeMin) {
    return { key: "low", label: "Baixo" };
  }

  return { key: "ok", label: "OK" };
}

function formatDate(value) {
  if (!value) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMovementSummary(movement) {
  const amount = Number(movement.quantity) || 0;
  const previousQuantity =
    movement.previous_quantity !== null && movement.previous_quantity !== undefined
      ? Number(movement.previous_quantity)
      : null;
  const resultQuantity =
    movement.result_quantity !== null && movement.result_quantity !== undefined
      ? Number(movement.result_quantity)
      : null;

  if (previousQuantity !== null && resultQuantity !== null) {
    return `${capitalize(movement.type)} de ${amount} unidade(s): ${previousQuantity} -> ${resultQuantity}`;
  }

  return `${capitalize(movement.type)} de ${amount} unidade(s) registrada.`;
}

function buildAlertMessage(product, status) {
  const quantity = Number(product.quantity) || 0;
  const minimum = Number(product.min_quantity) || 5;
  const missing = Math.max(0, minimum - quantity);

  if (status.key === "critical") {
    return `Nivel critico: ${quantity} unidade(s) em estoque. Reponha ${missing || 1} ou mais para sair da zona critica.`;
  }

  return `Estoque baixo: ${quantity} unidade(s) disponiveis. O minimo ideal configurado e ${minimum}.`;
}

function buildStockNotice(product, type) {
  const status = getStatus(product.quantity, product.min_quantity);
  const actionText = type === "entrada" ? "Entrada registrada." : "Saida registrada.";

  if (status.key === "critical") {
    return `${actionText} ${product.name} ficou em nivel critico.`;
  }

  if (status.key === "low") {
    return `${actionText} ${product.name} esta com estoque baixo.`;
  }

  return `${actionText} ${product.name} segue com estoque OK.`;
}

function getNoticeTone(product) {
  const status = getStatus(product.quantity, product.min_quantity);

  if (status.key === "critical") {
    return "error";
  }

  if (status.key === "low") {
    return "warning";
  }

  return "success";
}

function showNotice(message, tone = "info", keepVisible = false) {
  window.clearTimeout(showNotice.timeoutId);
  els.noticeBar.hidden = false;
  els.noticeBar.textContent = message;
  els.noticeBar.classList.remove("is-error", "is-success", "is-warning");

  if (tone === "error") {
    els.noticeBar.classList.add("is-error");
  }

  if (tone === "success") {
    els.noticeBar.classList.add("is-success");
  }

  if (tone === "warning") {
    els.noticeBar.classList.add("is-warning");
  }

  if (keepVisible) {
    return;
  }

  showNotice.timeoutId = window.setTimeout(clearNotice, 2400);
}

function clearNotice() {
  els.noticeBar.hidden = true;
  els.noticeBar.textContent = "";
  els.noticeBar.classList.remove("is-error", "is-success", "is-warning");
}

function showAuthNotice(message, tone = "info", keepVisible = false) {
  window.clearTimeout(showAuthNotice.timeoutId);
  els.authNotice.hidden = false;
  els.authNotice.textContent = message;
  els.authNotice.classList.remove("is-error", "is-success", "is-warning");

  if (tone === "error") {
    els.authNotice.classList.add("is-error");
  }

  if (tone === "success") {
    els.authNotice.classList.add("is-success");
  }

  if (tone === "warning") {
    els.authNotice.classList.add("is-warning");
  }

  if (keepVisible) {
    return;
  }

  showAuthNotice.timeoutId = window.setTimeout(clearAuthNotice, 3000);
}

function clearAuthNotice() {
  els.authNotice.hidden = true;
  els.authNotice.textContent = "";
  els.authNotice.classList.remove("is-error", "is-success", "is-warning");
}

function getErrorMessage(error, fallbackMessage) {
  if (!error) {
    return fallbackMessage;
  }

  const code = String(error.code || "");
  const message = String(error.message || "").trim();

  if (code === "23505" || message.toLowerCase().includes("duplicate key")) {
    return "Ja existe um item com esse nome no estoque.";
  }

  if (message.includes("Estoque insuficiente")) {
    return "Estoque insuficiente para registrar a saida.";
  }

  if (message.includes("Produto nao encontrado")) {
    return "Produto nao encontrado.";
  }

  if (message.includes("Operacao nao autorizada")) {
    return "Voce nao tem permissao para realizar esta operacao.";
  }

  if (message.includes("Invalid login credentials")) {
    return "Email ou senha invalidos.";
  }

  return fallbackMessage;
}

function capitalize(value) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function ensureWriteAccess() {
  if (state.session) {
    return true;
  }

  showAuthNotice("Faca login para editar o estoque.", "warning", true);
  return false;
}

function setAuthFormDisabled(disabled) {
  Array.from(els.authForm.elements).forEach((element) => {
    element.disabled = disabled;
  });

  els.authSubmitButton.textContent = disabled ? "Entrando..." : "Entrar no controle";
}

function syncCreateFormState() {
  const disabled = state.isCreating || !state.session;

  Array.from(els.createProductForm.elements).forEach((element) => {
    element.disabled = disabled;
  });

  els.createProductButton.textContent = state.isCreating ? "Salvando..." : "Adicionar item";
}

function resetCreateForm() {
  els.createProductForm.reset();
  els.createProductForm.elements.namedItem("quantity").value = "0";
  els.createProductForm.elements.namedItem("min_quantity").value = "5";
}

function resetState() {
  state.products = [];
  state.history = [];
  state.pendingIds.clear();
  state.isCreating = false;
  syncCreateFormState();
  renderProducts();
  renderHistory();
}
