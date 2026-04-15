"use strict";

const urlSupabase = "https://bmxlvsxluwcxuydnlawc.supabase.co";
const chavePublicaSupabase = "sb_publishable_jWyWeiYTnu4c8UllXXvm3g_0meVpJM2";
const INTERVALO_ATUALIZACAO_AUTOMATICA_MS = 15000;

const estado = {
  visualizacao: "produtos",
  produtos: [],
  historico: [],
  buscaProduto: "",
  filtroTipoProduto: "all",
  idsPendentes: new Set(),
  estaCriando: false,
  saidaSolicitada: false,
  sessao: null,
  produtosAtualizadosEm: null,
  historicoAtualizadoEm: null,
  idTemporizadorAtualizacao: null,
};

const ROTULOS_TIPO_PRODUTO = {
  ingrediente: "Ingrediente",
  bebida: "Bebida",
  insumo: "Insumo",
  produto_preparado: "Preparado",
};

const ORDEM_TIPO_PRODUTO = {
  ingrediente: 0,
  bebida: 1,
  insumo: 2,
  produto_preparado: 3,
};

const ROTULOS_UNIDADE_ESTOQUE = {
  un: { short: "un", singular: "unidade", plural: "unidades" },
  kg: { short: "kg", singular: "kg", plural: "kg" },
  g: { short: "g", singular: "g", plural: "g" },
  l: { short: "l", singular: "l", plural: "l" },
  ml: { short: "ml", singular: "ml", plural: "ml" },
  lata: { short: "lata", singular: "lata", plural: "latas" },
  garrafa: { short: "garrafa", singular: "garrafa", plural: "garrafas" },
  pct: { short: "pct", singular: "pacote", plural: "pacotes" },
  cx: { short: "cx", singular: "caixa", plural: "caixas" },
};

const elementos = {
  telaLogin: document.getElementById("telaLogin"),
  formLogin: document.getElementById("formLogin"),
  avisoLogin: document.getElementById("avisoLogin"),
  botaoEntrar: document.getElementById("botaoEntrar"),
  aplicacao: document.getElementById("aplicacao"),
  chipUsuarioAtual: document.getElementById("chipUsuarioAtual"),
  botaoSair: document.getElementById("botaoSair"),
  barraAviso: document.getElementById("barraAviso"),
  botaoAtualizar: document.getElementById("botaoAtualizar"),
  abaProdutos: document.getElementById("abaProdutos"),
  abaHistorico: document.getElementById("abaHistorico"),
  painelProdutos: document.getElementById("painelProdutos"),
  painelHistorico: document.getElementById("painelHistorico"),
  listaProdutos: document.getElementById("listaProdutos"),
  listaHistorico: document.getElementById("listaHistorico"),
  listaAlertas: document.getElementById("listaAlertas"),
  estadoVazioProdutos: document.getElementById("estadoVazioProdutos"),
  estadoVazioHistorico: document.getElementById("estadoVazioHistorico"),
  estadoVazioAlertas: document.getElementById("estadoVazioAlertas"),
  formNovoProduto: document.getElementById("formNovoProduto"),
  botaoNovoProduto: document.getElementById("botaoNovoProduto"),
  buscaProduto: document.getElementById("buscaProduto"),
  filtrosTipoProduto: document.getElementById("filtrosTipoProduto"),
  notaModoAcesso: document.getElementById("notaModoAcesso"),
  resumoAtualizacaoProdutos: document.getElementById("resumoAtualizacaoProdutos"),
  resumoAtualizacaoHistorico: document.getElementById("resumoAtualizacaoHistorico"),
  metricaTotal: document.getElementById("metricaTotal"),
  metricaOk: document.getElementById("metricaOk"),
  metricaBaixa: document.getElementById("metricaBaixa"),
  metricaCritica: document.getElementById("metricaCritica"),
  modeloCardProduto: document.getElementById("modeloCardProduto"),
  modeloCardHistorico: document.getElementById("modeloCardHistorico"),
};

const estaConfigurado =
  urlSupabase &&
  chavePublicaSupabase &&
  chavePublicaSupabase !== "SUA_PUBLISHABLE_KEY" &&
  typeof window.supabase !== "undefined";

const clienteSupabase = estaConfigurado
  ? window.supabase.createClient(urlSupabase, chavePublicaSupabase)
  : null;

document.addEventListener("DOMContentLoaded", inicializarAplicacao);

async function inicializarAplicacao() {
  registrarEventos();
  sincronizarEstadoFiltroTipo();
  resetarFormularioCriacao();
  renderizarProdutos();
  renderizarHistorico();
  definirAutenticacao(false);

  if (!estaConfigurado) {
    mostrarAvisoLogin(
      "Configure a SUPABASE_PUBLISHABLE_KEY em script.js e execute o database.sql no Supabase para iniciar.",
      "error",
      true,
    );
    return;
  }

  clienteSupabase.auth.onAuthStateChange(async (_event, sessao) => {
    await aplicarSessao(sessao);
  });

  const { data, error } = await clienteSupabase.auth.getSession();

  if (error) {
    mostrarAvisoLogin(obterMensagemErro(error, "Nao foi possivel validar a sessao atual."), "error", true);
    return;
  }

  await aplicarSessao(data.session, true);
}

function registrarEventos() {
  elementos.formLogin.addEventListener("submit", processarLogin);
  elementos.botaoSair.addEventListener("click", processarSaida);
  elementos.abaProdutos.addEventListener("click", () => definirVisualizacao("produtos"));
  elementos.abaHistorico.addEventListener("click", () => definirVisualizacao("historico"));
  elementos.abaProdutos.addEventListener("keydown", lidarComTeclaAbas);
  elementos.abaHistorico.addEventListener("keydown", lidarComTeclaAbas);
  elementos.botaoAtualizar.addEventListener("click", processarAtualizacao);
  elementos.listaProdutos.addEventListener("click", lidarComAcaoProduto);
  elementos.formNovoProduto.addEventListener("submit", lidarComCriacaoProduto);
  elementos.buscaProduto.addEventListener("input", lidarComBuscaProduto);
  elementos.filtrosTipoProduto.addEventListener("click", lidarComCliqueFiltroTipo);
  window.addEventListener("focus", lidarComFocoJanela);
  document.addEventListener("visibilitychange", lidarComMudancaVisibilidade);
}

async function aplicarSessao(sessao, silent = false) {
  const tokenAtual = estado.sessao?.access_token || null;
  const proximoToken = sessao?.access_token || null;
  const sessaoAlterada = tokenAtual !== proximoToken;

  estado.sessao = sessao || null;
  definirAutenticacao(Boolean(sessao?.user));
  sincronizarAtualizacaoAutomatica();

  if (!estado.sessao) {
    if (sessaoAlterada || !silent) {
      resetarEstado();
      limparAviso();

      if (estado.saidaSolicitada) {
        estado.saidaSolicitada = false;
        mostrarAvisoLogin("Sessao encerrada.", "success", true);
      } else {
        mostrarAvisoLogin("Entre com email e senha para acessar o controle de estoque.", "warning", true);
      }
    }

    return;
  }

  estado.saidaSolicitada = false;
  limparAvisoLogin();
  atualizarUsuarioAtual(sessao.user);

  if (!sessaoAlterada && silent) {
    return;
  }

  await buscarProdutos(true);

  if (estado.visualizacao === "historico") {
    await buscarHistorico(true);
  }

  if (!silent) {
    mostrarAviso("Acesso liberado.", "success");
  }
}

function definirAutenticacao(authenticated) {
  const estaAutenticado = Boolean(authenticated);

  elementos.telaLogin.hidden = estaAutenticado;
  elementos.aplicacao.hidden = !estaAutenticado;
  elementos.chipUsuarioAtual.hidden = !estaAutenticado;

  if (elementos.notaModoAcesso) {
    elementos.notaModoAcesso.hidden = !estaAutenticado;
    elementos.notaModoAcesso.classList.remove("is-warning", "is-success");

    if (estaAutenticado) {
      elementos.notaModoAcesso.textContent =
        "Acesso autenticado ativo. Cadastro, atualizacao de estoque e historico estao liberados.";
      elementos.notaModoAcesso.classList.add("is-success");
    }
  }

  sincronizarEstadoFormularioCriacao();
}

function atualizarUsuarioAtual(user) {
  const email = user?.email || "usuario autenticado";
  elementos.chipUsuarioAtual.textContent = email;
}

async function processarLogin(event) {
  event.preventDefault();

  if (!clienteSupabase) {
    mostrarAvisoLogin("A configuracao do Supabase ainda nao foi concluida.", "error", true);
    return;
  }

  const formData = new FormData(elementos.formLogin);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    mostrarAvisoLogin("Informe email e senha para entrar.", "error", true);
    return;
  }

  definirFormularioLoginDesabilitado(true);
  mostrarAvisoLogin("Validando acesso...", "warning", true);

  try {
    const { data, error } = await clienteSupabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    const sessaoAtiva =
      data?.session ||
      (await clienteSupabase.auth.getSession()).data.session ||
      null;

    if (!sessaoAtiva?.user) {
      throw new Error("Sessao de login nao retornada.");
    }

    await aplicarSessao(sessaoAtiva);
    mostrarAvisoLogin("Acesso validado. Carregando painel...", "success", true);
    elementos.formLogin.reset();
  } catch (error) {
    mostrarAvisoLogin(obterMensagemErro(error, "Nao foi possivel realizar o login."), "error", true);
  } finally {
    definirFormularioLoginDesabilitado(false);
  }
}

async function processarSaida() {
  if (!clienteSupabase) {
    return;
  }

  if (estado.saidaSolicitada) {
    return;
  }

  elementos.botaoSair.disabled = true;
  estado.saidaSolicitada = true;
  await aplicarSessao(null, true);

  try {
    const { error } = await clienteSupabase.auth.signOut({ scope: "local" });

    if (error) {
      throw error;
    }
  } catch (error) {
    mostrarAvisoLogin(obterMensagemErro(error, "Nao foi possivel encerrar a sessao."), "error", true);
  } finally {
    elementos.botaoSair.disabled = false;
  }
}

async function processarAtualizacao() {
  if (!clienteSupabase || !estado.sessao) {
    mostrarAvisoLogin("Faca login para atualizar os dados.", "warning", true);
    return;
  }

  await atualizarDadosAtivos();
}

function definirVisualizacao(visualizacao) {
  estado.visualizacao = visualizacao;
  const exibeProdutos = visualizacao === "produtos";
  const exibeHistorico = visualizacao === "historico";

  elementos.abaProdutos.classList.toggle("is-active", exibeProdutos);
  elementos.abaHistorico.classList.toggle("is-active", exibeHistorico);
  elementos.abaProdutos.setAttribute("aria-selected", String(exibeProdutos));
  elementos.abaHistorico.setAttribute("aria-selected", String(exibeHistorico));
  elementos.abaProdutos.tabIndex = exibeProdutos ? 0 : -1;
  elementos.abaHistorico.tabIndex = exibeHistorico ? 0 : -1;
  elementos.painelProdutos.classList.toggle("is-active", exibeProdutos);
  elementos.painelHistorico.classList.toggle("is-active", exibeHistorico);
  elementos.painelProdutos.hidden = !exibeProdutos;
  elementos.painelHistorico.hidden = !exibeHistorico;

  if (visualizacao === "produtos" && estado.sessao) {
    buscarProdutos(true);
  }

  if (visualizacao === "historico" && estado.sessao) {
    buscarHistorico();
  }
}

function lidarComTeclaAbas(event) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }

  event.preventDefault();

  if (event.key === "ArrowRight") {
    definirVisualizacao("historico");
    elementos.abaHistorico.focus();
    return;
  }

  definirVisualizacao("produtos");
  elementos.abaProdutos.focus();
}

async function buscarProdutos(silent = false) {
  if (!clienteSupabase || !estado.sessao) {
    return;
  }

  if (!silent) {
    mostrarAviso("Carregando produtos...");
  }

  try {
    const { data, error } = await clienteSupabase.rpc("list_products");

    if (error) {
      throw error;
    }

    estado.produtos = ordenarProdutos(
      (Array.isArray(data) ? data : []).filter((product) => product?.is_active !== false),
    );
    estado.produtosAtualizadosEm = new Date().toISOString();
    renderizarProdutos();
    limparAviso();
  } catch (error) {
    mostrarAviso(obterMensagemErro(error, "Nao foi possivel carregar os produtos."), "error", true);
  }
}

async function buscarHistorico(silent = false) {
  if (!clienteSupabase || !estado.sessao) {
    return;
  }

  if (!silent) {
    mostrarAviso("Carregando historico...");
  }

  try {
    const { data, error } = await clienteSupabase.rpc("list_movements");

    if (error) {
      throw error;
    }

    estado.historico = (Array.isArray(data) ? data : []).slice(0, 30);
    estado.historicoAtualizadoEm = new Date().toISOString();
    renderizarHistorico();
    limparAviso();
  } catch (error) {
    mostrarAviso(obterMensagemErro(error, "Nao foi possivel carregar o historico."), "error", true);
  }
}

function lidarComBuscaProduto(event) {
  estado.buscaProduto = String(event.target.value || "").trim().toLowerCase();
  renderizarProdutos();
}

function lidarComCliqueFiltroTipo(event) {
  const button = event.target.closest("[data-type-filter]");

  if (!button) {
    return;
  }

  estado.filtroTipoProduto = button.dataset.typeFilter || "all";
  sincronizarEstadoFiltroTipo();
  renderizarProdutos();
}

async function lidarComFocoJanela() {
  await atualizarDadosAtivos(true);
}

async function lidarComMudancaVisibilidade() {
  if (document.hidden) {
    return;
  }

  await atualizarDadosAtivos(true);
}

async function lidarComAcaoProduto(event) {
  const button = event.target.closest("[data-action]");

  if (!button || !garantirAcessoEscrita()) {
    return;
  }

  const card = button.closest("[data-product-id]");

  if (!card) {
    return;
  }

  const idProduto = card.dataset.productId;
  const acao = button.dataset.action;
  const tipoMovimentacao = acao === "increase" ? "entrada" : "saida";
  const campoQuantidadeAjuste = card.querySelector(".campo-ajuste-quantidade");
  const quantidadeInformadaAjuste = obterQuantidadeAjuste(campoQuantidadeAjuste);

  if (quantidadeInformadaAjuste === null) {
    mostrarAviso("Informe uma quantidade inteira maior ou igual a 1.", "error", true);
    if (campoQuantidadeAjuste) {
      campoQuantidadeAjuste.focus();
    }
    return;
  }

  await atualizarEstoque(idProduto, tipoMovimentacao, quantidadeInformadaAjuste);
}

async function lidarComCriacaoProduto(event) {
  event.preventDefault();

  if (!clienteSupabase || !garantirAcessoEscrita()) {
    return;
  }

  if (estado.estaCriando) {
    return;
  }

  const formData = new FormData(elementos.formNovoProduto);
  const nome = String(formData.get("name") || "").trim();
  const tipoProduto = String(formData.get("product_type") || "ingrediente").trim();
  const unidadeEstoque = String(formData.get("stock_unit") || "un").trim();
  const quantidade = Number.parseInt(String(formData.get("quantity") || "0"), 10);
  const quantidadeMinima = Number.parseInt(String(formData.get("min_quantity") || "0"), 10);

  if (!nome) {
    mostrarAviso("Informe o nome do item antes de salvar.", "error", true);
    return;
  }

  if (!Number.isInteger(quantidade) || quantidade < 0) {
    mostrarAviso("A quantidade inicial precisa ser um inteiro maior ou igual a zero.", "error", true);
    return;
  }

  if (!Number.isInteger(quantidadeMinima) || quantidadeMinima < 1) {
    mostrarAviso("O minimo ideal precisa ser um inteiro maior ou igual a um.", "error", true);
    return;
  }

  if (!ROTULOS_TIPO_PRODUTO[tipoProduto]) {
    mostrarAviso("Selecione um tipo de item valido.", "error", true);
    return;
  }

  if (!ROTULOS_UNIDADE_ESTOQUE[unidadeEstoque]) {
    mostrarAviso("Selecione uma unidade valida.", "error", true);
    return;
  }

  const produtoDuplicado = estado.produtos.some(
    (produto) => String(produto.name || "").trim().toLowerCase() === nome.toLowerCase(),
  );

  if (produtoDuplicado) {
    mostrarAviso("Ja existe um item com esse nome no estoque.", "error", true);
    return;
  }

  estado.estaCriando = true;
  sincronizarEstadoFormularioCriacao();
  mostrarAviso("Salvando novo item...");

  try {
    const { error } = await clienteSupabase.rpc("create_product_with_initial_stock", {
      p_name: nome,
      p_initial_quantity: quantidade,
      p_min_quantity: quantidadeMinima,
      p_product_type: tipoProduto,
      p_stock_unit: unidadeEstoque,
    });

    if (error) {
      throw error;
    }

    await buscarProdutos(true);
    await buscarHistorico(true);
    resetarFormularioCriacao();
    mostrarAviso(`Item ${nome} cadastrado com sucesso.`, "success");
  } catch (error) {
    mostrarAviso(obterMensagemErro(error, "Nao foi possivel cadastrar o item."), "error", true);
  } finally {
    estado.estaCriando = false;
    sincronizarEstadoFormularioCriacao();
  }
}

async function atualizarEstoque(id, tipoMovimentacao, quantidade = 1) {
  if (!clienteSupabase || !estado.sessao || estado.idsPendentes.has(id)) {
    return;
  }

  const produto = estado.produtos.find((item) => item.id === id);

  if (!produto) {
    return;
  }

  const quantidadeSegura = Number.parseInt(String(quantidade), 10);

  if (!Number.isInteger(quantidadeSegura) || quantidadeSegura < 1) {
    mostrarAviso("Informe uma quantidade inteira maior ou igual a 1.", "error", true);
    return;
  }

  const diferenca = tipoMovimentacao === "entrada" ? quantidadeSegura : -quantidadeSegura;
  const quantidadeAnterior = Number(produto.quantity) || 0;
  const proximaQuantidade = Math.max(0, quantidadeAnterior + diferenca);

  if (tipoMovimentacao === "saida" && quantidadeAnterior === 0) {
    mostrarAviso("A quantidade ja esta em zero.", "error");
    return;
  }

  if (tipoMovimentacao === "saida" && quantidadeSegura > quantidadeAnterior) {
    mostrarAviso("A quantidade informada e maior do que o estoque atual.", "error", true);
    return;
  }

  estado.idsPendentes.add(id);
  renderizarProdutos();
  mostrarAviso("Atualizando estoque...");

  try {
    const { error } = await clienteSupabase.rpc("apply_stock_movement", {
      p_product_id: id,
      p_type: tipoMovimentacao,
      p_quantity: quantidadeSegura,
    });

    if (error) {
      throw error;
    }

    await buscarProdutos(true);
    await buscarHistorico(true);

    const produtoAtualizado = estado.produtos.find((item) => item.id === id) || {
      ...produto,
      quantity: proximaQuantidade,
    };

    mostrarAviso(montarAvisoEstoque(produtoAtualizado, tipoMovimentacao), obterTomAviso(produtoAtualizado));
  } catch (error) {
    mostrarAviso(obterMensagemErro(error, "Nao foi possivel atualizar o estoque."), "error", true);
  } finally {
    estado.idsPendentes.delete(id);
    renderizarProdutos();
  }
}

function renderizarProdutos() {
  elementos.listaProdutos.innerHTML = "";

  const produtosVisiveis = obterProdutosVisiveis();
  const metricas = {
    total: produtosVisiveis.length,
    ok: 0,
    low: 0,
    critical: 0,
  };

  if (produtosVisiveis.length === 0) {
    elementos.estadoVazioProdutos.hidden = false;
    elementos.estadoVazioProdutos.textContent = montarMensagemEstadoVazioProdutos();
  } else {
    elementos.estadoVazioProdutos.hidden = true;
  }

  produtosVisiveis.forEach((produto) => {
    const status = obterStatus(produto.quantity, produto.min_quantity);
    metricas[status.key] += 1;

    const card = elementos.modeloCardProduto.content.firstElementChild.cloneNode(true);
    const pendente = estado.idsPendentes.has(produto.id);

    card.dataset.productId = produto.id;
    card.classList.toggle("is-pending", pendente);
    card.classList.add(`card-produto-${status.key}`);
    card.querySelector(".nome-produto").textContent = produto.name;
    card.querySelector(".etiqueta-tipo-produto").textContent = obterRotuloTipoProduto(produto.product_type);
    card.querySelector(".etiqueta-unidade-produto").textContent = obterRotuloCurtoUnidade(produto.stock_unit);
    card.querySelector(".minimo-produto").textContent = String(produto.min_quantity ?? 5);
    card.querySelector(".unidade-produto").textContent = obterRotuloCurtoUnidade(produto.stock_unit);
    card.querySelector(".valor-quantidade").textContent = String(produto.quantity ?? 0);
    card.querySelector(".unidade-quantidade").textContent = obterRotuloUnidade(produto.stock_unit, produto.quantity ?? 0);
    card.querySelector(".observacao-estoque").textContent = montarObservacaoEstoqueProduto(produto, status);

    const blocoQuantidade = card.querySelector(".bloco-quantidade");
    blocoQuantidade.classList.add(`bloco-quantidade-${status.key}`);

    const preenchimentoProgressoEstoque = card.querySelector(".preenchimento-progresso-estoque");
    preenchimentoProgressoEstoque.style.width = `${obterPercentualProgressoEstoque(produto.quantity, produto.min_quantity)}%`;
    preenchimentoProgressoEstoque.classList.add(`preenchimento-progresso-estoque-${status.key}`);

    const etiquetaStatus = card.querySelector(".etiqueta-status");
    etiquetaStatus.textContent = status.label;
    etiquetaStatus.classList.add(`status-${status.key}`);

    const campoQuantidadeAjuste = card.querySelector(".campo-ajuste-quantidade");
    const idCampoQuantidadeAjuste = `campo-ajuste-quantidade-${produto.id}`;
    const rotuloQuantidadeAjuste = card.querySelector(".rotulo-ajuste-quantidade");
    campoQuantidadeAjuste.id = idCampoQuantidadeAjuste;
    campoQuantidadeAjuste.disabled = pendente || !estado.sessao;
    campoQuantidadeAjuste.value = "1";
    campoQuantidadeAjuste.setAttribute("aria-label", `Quantidade do ajuste para ${produto.name}`);
    rotuloQuantidadeAjuste.setAttribute("for", idCampoQuantidadeAjuste);

    card.querySelectorAll(".botao-acao").forEach((botao) => {
      botao.disabled = pendente || !estado.sessao;
    });

    elementos.listaProdutos.appendChild(card);
  });

  elementos.metricaTotal.textContent = String(metricas.total);
  elementos.metricaOk.textContent = String(metricas.ok);
  elementos.metricaBaixa.textContent = String(metricas.low);
  elementos.metricaCritica.textContent = String(metricas.critical);
  if (elementos.resumoAtualizacaoProdutos) {
    elementos.resumoAtualizacaoProdutos.textContent = montarResumoAtualizacaoProdutos(
      produtosVisiveis.length,
      estado.produtos.length,
    );
  }
  renderizarAlertas();
}

function renderizarHistorico() {
  elementos.listaHistorico.innerHTML = "";

  if (estado.historico.length === 0) {
    elementos.estadoVazioHistorico.hidden = false;
    elementos.estadoVazioHistorico.textContent =
      "As movimentacoes mais recentes vao aparecer aqui em ordem decrescente.";
    if (elementos.resumoAtualizacaoHistorico) {
      elementos.resumoAtualizacaoHistorico.textContent = montarResumoAtualizacaoHistorico(0);
    }
    return;
  }

  elementos.estadoVazioHistorico.hidden = true;
  if (elementos.resumoAtualizacaoHistorico) {
    elementos.resumoAtualizacaoHistorico.textContent = montarResumoAtualizacaoHistorico(estado.historico.length);
  }

  estado.historico.forEach((movimentacao) => {
    const card = elementos.modeloCardHistorico.content.firstElementChild.cloneNode(true);
    const nomeProduto = movimentacao.products?.name || "Produto removido";
    const unidadeEstoque = movimentacao.products?.stock_unit || "un";
    const fluxoHistorico = obterFluxoHistorico(movimentacao);

    card.classList.add(`card-historico-${movimentacao.type}`);
    card.querySelector(".produto-historico").textContent = nomeProduto;
    card.querySelector(".resumo-historico").textContent = formatarResumoMovimentacao(movimentacao);
    card.querySelector(".detalhe-historico").textContent = montarDetalheHistorico(movimentacao);
    card.querySelector(".data-historico").textContent = formatarData(movimentacao.created_at);

    const noFluxoHistorico = card.querySelector(".fluxo-historico");

    if (fluxoHistorico) {
      card.querySelector(".valor-fluxo-historico-anterior").textContent = fluxoHistorico.before;
      card.querySelector(".valor-fluxo-historico-posterior").textContent = fluxoHistorico.after;
    } else {
      noFluxoHistorico.hidden = true;
    }

    const noTipoHistorico = card.querySelector(".tipo-historico");
    noTipoHistorico.textContent = capitalizar(movimentacao.type);
    noTipoHistorico.classList.add(`tipo-historico-${movimentacao.type}`);

    card.querySelector(".quantidade-historico").textContent = formatarQuantidadeComUnidade(movimentacao.quantity, unidadeEstoque);
    elementos.listaHistorico.appendChild(card);
  });
}

function renderizarAlertas() {
  elementos.listaAlertas.innerHTML = "";

  const alertProducts = estado.produtos
    .map((product) => ({
      product,
      status: obterStatus(product.quantity, product.min_quantity),
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
    elementos.estadoVazioAlertas.hidden = false;
    elementos.estadoVazioAlertas.textContent =
      "Nenhum item em falta no momento. O estoque esta operando dentro do minimo ideal.";
    return;
  }

  elementos.estadoVazioAlertas.hidden = true;

  alertProducts.forEach(({ product, status }) => {
    const card = document.createElement("article");
    card.className = `card-alerta alert-${status.key}`;

    const top = document.createElement("div");
    top.className = "topo-card-alerta";

    const title = document.createElement("h3");
    title.className = "titulo-card-alerta";
    title.textContent = product.name;

    const badge = document.createElement("span");
    badge.className = `etiqueta-status status-${status.key}`;
    badge.textContent = status.label;

    const body = document.createElement("p");
    body.className = "corpo-card-alerta";
    body.textContent = montarMensagemAlerta(product, status);

    top.append(title, badge);
    card.append(top, body);
    elementos.listaAlertas.appendChild(card);
  });
}

function obterStatus(quantity, minQuantity) {
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

function formatarData(value) {
  if (!value) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatarResumoMovimentacao(movimentacao) {
  const quantidadeMovimentada = Number(movimentacao.quantity) || 0;
  const unidadeEstoque = movimentacao.products?.stock_unit || "un";
  return `${capitalizar(movimentacao.type)} de ${formatarQuantidadeComUnidade(quantidadeMovimentada, unidadeEstoque)}`;
}

function montarMensagemAlerta(produto, status) {
  const quantidade = Number(produto.quantity) || 0;
  const minimoIdeal = Number(produto.min_quantity) || 5;
  const quantidadeFaltante = Math.max(0, minimoIdeal - quantidade);
  const unidadeEstoque = produto.stock_unit || "un";

  if (status.key === "critical") {
    return `Nivel critico: ${formatarQuantidadeComUnidade(quantidade, unidadeEstoque)} em estoque. Reponha ${formatarQuantidadeComUnidade(quantidadeFaltante || 1, unidadeEstoque)} ou mais para sair da zona critica.`;
  }

  return `Estoque baixo: ${formatarQuantidadeComUnidade(quantidade, unidadeEstoque)} disponiveis. O minimo ideal configurado e ${formatarQuantidadeComUnidade(minimoIdeal, unidadeEstoque)}.`;
}

function montarAvisoEstoque(produto, tipoMovimentacao) {
  const status = obterStatus(produto.quantity, produto.min_quantity);
  const textoAcao = tipoMovimentacao === "entrada" ? "Entrada registrada." : "Saida registrada.";

  if (status.key === "critical") {
    return `${textoAcao} ${produto.name} ficou em nivel critico.`;
  }

  if (status.key === "low") {
    return `${textoAcao} ${produto.name} esta com estoque baixo.`;
  }

  return `${textoAcao} ${produto.name} segue com estoque OK.`;
}

function obterTomAviso(produto) {
  const status = obterStatus(produto.quantity, produto.min_quantity);

  if (status.key === "critical") {
    return "error";
  }

  if (status.key === "low") {
    return "warning";
  }

  return "success";
}

function mostrarAviso(mensagem, tom = "info", manterVisivel = false) {
  window.clearTimeout(mostrarAviso.timeoutId);
  elementos.barraAviso.hidden = false;
  elementos.barraAviso.textContent = mensagem;
  elementos.barraAviso.classList.remove("is-error", "is-success", "is-warning");
  elementos.barraAviso.setAttribute("role", tom === "error" ? "alert" : "status");
  elementos.barraAviso.setAttribute("aria-live", tom === "error" ? "assertive" : "polite");

  if (tom === "error") {
    elementos.barraAviso.classList.add("is-error");
  }

  if (tom === "success") {
    elementos.barraAviso.classList.add("is-success");
  }

  if (tom === "warning") {
    elementos.barraAviso.classList.add("is-warning");
  }

  if (manterVisivel) {
    return;
  }

  mostrarAviso.timeoutId = window.setTimeout(limparAviso, 2400);
}

function limparAviso() {
  elementos.barraAviso.hidden = true;
  elementos.barraAviso.textContent = "";
  elementos.barraAviso.classList.remove("is-error", "is-success", "is-warning");
}

function mostrarAvisoLogin(mensagem, tom = "info", manterVisivel = false) {
  window.clearTimeout(mostrarAvisoLogin.timeoutId);
  elementos.avisoLogin.hidden = false;
  elementos.avisoLogin.textContent = mensagem;
  elementos.avisoLogin.classList.remove("is-error", "is-success", "is-warning");
  elementos.avisoLogin.setAttribute("role", tom === "error" ? "alert" : "status");
  elementos.avisoLogin.setAttribute("aria-live", tom === "error" ? "assertive" : "polite");

  if (tom === "error") {
    elementos.avisoLogin.classList.add("is-error");
  }

  if (tom === "success") {
    elementos.avisoLogin.classList.add("is-success");
  }

  if (tom === "warning") {
    elementos.avisoLogin.classList.add("is-warning");
  }

  if (manterVisivel) {
    return;
  }

  mostrarAvisoLogin.timeoutId = window.setTimeout(limparAvisoLogin, 3000);
}

function limparAvisoLogin() {
  elementos.avisoLogin.hidden = true;
  elementos.avisoLogin.textContent = "";
  elementos.avisoLogin.classList.remove("is-error", "is-success", "is-warning");
}

function obterMensagemErro(error, mensagemPadrao) {
  if (!error) {
    return mensagemPadrao;
  }

  const codigo = String(error.code || "");
  const mensagem = String(error.message || "").trim();

  if (codigo === "23505" || mensagem.toLowerCase().includes("duplicate key")) {
    return "Ja existe um item com esse nome no estoque.";
  }

  if (mensagem.includes("Estoque insuficiente")) {
    return "Estoque insuficiente para registrar a saida.";
  }

  if (mensagem.includes("Produto nao encontrado")) {
    return "Produto nao encontrado.";
  }

  if (mensagem.includes("Operacao nao autorizada")) {
    return "Voce nao tem permissao para realizar esta operacao.";
  }

  if (mensagem.includes("Invalid login credentials")) {
    return "Email ou senha invalidos.";
  }

  return mensagemPadrao;
}

function capitalizar(value) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function obterRotuloTipoProduto(tipoProduto) {
  return ROTULOS_TIPO_PRODUTO[tipoProduto] || "Item";
}

function obterRotuloCurtoUnidade(unidadeEstoque) {
  return ROTULOS_UNIDADE_ESTOQUE[unidadeEstoque]?.short || "un";
}

function obterRotuloUnidade(unidadeEstoque, quantidade = 1) {
  const metaUnidade = ROTULOS_UNIDADE_ESTOQUE[unidadeEstoque] || ROTULOS_UNIDADE_ESTOQUE.un;

  return quantidade === 1 ? metaUnidade.singular : metaUnidade.plural;
}

function formatarQuantidadeComUnidade(quantidade, unidadeEstoque) {
  const quantidadeSegura = Number(quantidade) || 0;

  return `${quantidadeSegura} ${obterRotuloUnidade(unidadeEstoque, quantidadeSegura)}`;
}

function montarResumoAtualizacaoProdutos(quantidadeVisivel, quantidadeTotal) {
  const ultimaSincronizacao = formatarHorarioSincronizacao(estado.produtosAtualizadosEm);

  if (!estado.sessao) {
    return "Sem sessao ativa.";
  }

  if (quantidadeTotal === 0) {
    return `Nenhum item carregado${ultimaSincronizacao ? ` | ${ultimaSincronizacao}` : ""}`;
  }

  if (quantidadeVisivel !== quantidadeTotal) {
    return `${quantidadeVisivel} de ${quantidadeTotal} itens visiveis | ${ultimaSincronizacao}`;
  }

  return `${quantidadeTotal} itens carregados | ${ultimaSincronizacao}`;
}

function montarResumoAtualizacaoHistorico(quantidadeTotal) {
  const ultimaSincronizacao = formatarHorarioSincronizacao(estado.historicoAtualizadoEm);

  if (!estado.sessao) {
    return "Sem sessao ativa.";
  }

  return `${quantidadeTotal} registros recentes | ${ultimaSincronizacao}`;
}

function formatarHorarioSincronizacao(value) {
  if (!value) {
    return "aguardando sincronizacao";
  }

  return `atualizado ${new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))}`;
}

function obterPercentualProgressoEstoque(quantidade, quantidadeMinima) {
  const quantidadeSegura = Math.max(0, Number(quantidade) || 0);
  const minimoSeguro = Math.max(1, Number(quantidadeMinima) || 1);

  return Math.min(100, Math.round((quantidadeSegura / minimoSeguro) * 100));
}

function montarObservacaoEstoqueProduto(produto, status) {
  const quantidade = Number(produto.quantity) || 0;
  const minimoIdeal = Math.max(1, Number(produto.min_quantity) || 1);
  const unidadeEstoque = produto.stock_unit || "un";
  const quantidadeFaltante = Math.max(0, minimoIdeal - quantidade);
  const excedente = Math.max(0, quantidade - minimoIdeal);

  if (status.key === "critical") {
    if (quantidade === 0) {
      return `Item zerado. Reponha ${formatarQuantidadeComUnidade(minimoIdeal, unidadeEstoque)} para normalizar o estoque.`;
    }

    return `Faltam ${formatarQuantidadeComUnidade(quantidadeFaltante, unidadeEstoque)} para sair do nivel critico.`;
  }

  if (status.key === "low") {
    return `Faltam ${formatarQuantidadeComUnidade(quantidadeFaltante, unidadeEstoque)} para atingir o minimo ideal.`;
  }

  if (excedente === 0) {
    return "Estoque exatamente no minimo ideal configurado.";
  }

  return `${formatarQuantidadeComUnidade(excedente, unidadeEstoque)} acima do minimo ideal.`;
}

function montarDetalheHistorico(movimentacao) {
  const tipoProduto = obterRotuloTipoProduto(movimentacao.products?.product_type);
  const unidadeCurta = obterRotuloCurtoUnidade(movimentacao.products?.stock_unit);
  const motivo = obterRotuloMotivoMovimentacao(movimentacao.reason);

  return `${tipoProduto} | ${unidadeCurta} | ${motivo}`;
}

function obterFluxoHistorico(movimentacao) {
  const unidadeEstoque = movimentacao.products?.stock_unit || "un";
  const quantidadeAnterior =
    movimentacao.previous_quantity !== null && movimentacao.previous_quantity !== undefined
      ? Number(movimentacao.previous_quantity)
      : null;
  const quantidadeResultante =
    movimentacao.result_quantity !== null && movimentacao.result_quantity !== undefined
      ? Number(movimentacao.result_quantity)
      : null;

  if (quantidadeAnterior === null || quantidadeResultante === null) {
    return null;
  }

  return {
    before: formatarQuantidadeComUnidade(quantidadeAnterior, unidadeEstoque),
    after: formatarQuantidadeComUnidade(quantidadeResultante, unidadeEstoque),
  };
}

function obterRotuloMotivoMovimentacao(motivo) {
  const rotulosMotivo = {
    cadastro_inicial: "Cadastro inicial",
    entrada_manual: "Entrada manual",
    saida_manual: "Saida manual",
    ajuste_manual: "Ajuste manual",
    correcao: "Correcao",
    reposicao: "Reposicao",
    perda: "Perda",
  };

  return rotulosMotivo[motivo] || "Movimentacao";
}

function sincronizarEstadoFiltroTipo() {
  elementos.filtrosTipoProduto.querySelectorAll("[data-type-filter]").forEach((botao) => {
    const filtroAtivo = botao.dataset.typeFilter === estado.filtroTipoProduto;
    botao.classList.toggle("is-active", filtroAtivo);
    botao.setAttribute("aria-pressed", String(filtroAtivo));
  });
}

function obterQuantidadeAjuste(entrada) {
  if (!entrada) {
    return 1;
  }

  const valorInformado = Number.parseInt(String(entrada.value || "").trim(), 10);

  if (!Number.isInteger(valorInformado) || valorInformado < 1) {
    return null;
  }

  return valorInformado;
}

function obterProdutosVisiveis() {
  const termoBusca = estado.buscaProduto;

  return estado.produtos.filter((produto) => {
    const correspondeTipo =
      estado.filtroTipoProduto === "all" || produto.product_type === estado.filtroTipoProduto;
    const correspondeBusca =
      !termoBusca || String(produto.name || "").toLowerCase().includes(termoBusca);

    return correspondeTipo && correspondeBusca;
  });
}

function montarMensagemEstadoVazioProdutos() {
  if (!estado.sessao) {
    return "Entre no sistema para carregar os produtos cadastrados.";
  }

  if (estado.produtos.length === 0) {
    return "Nenhum produto encontrado. Cadastre itens para iniciar o controle.";
  }

  return "Nenhum item corresponde aos filtros atuais.";
}

function ordenarProdutos(produtos) {
  return [...produtos].sort((esquerda, direita) => {
    const diferencaTipo =
      (ORDEM_TIPO_PRODUTO[esquerda.product_type] ?? 99) - (ORDEM_TIPO_PRODUTO[direita.product_type] ?? 99);

    if (diferencaTipo !== 0) {
      return diferencaTipo;
    }

    return String(esquerda.name || "").localeCompare(String(direita.name || ""), "pt-BR");
  });
}

async function atualizarDadosAtivos(silent = false) {
  if (!clienteSupabase || !estado.sessao) {
    return;
  }

  await buscarProdutos(silent);

  if (estado.visualizacao === "historico") {
    await buscarHistorico(silent);
  }
}

function sincronizarAtualizacaoAutomatica() {
  if (estado.idTemporizadorAtualizacao) {
    window.clearInterval(estado.idTemporizadorAtualizacao);
    estado.idTemporizadorAtualizacao = null;
  }

  if (!estado.sessao) {
    return;
  }

  estado.idTemporizadorAtualizacao = window.setInterval(() => {
    if (document.hidden) {
      return;
    }

    atualizarDadosAtivos(true);
  }, INTERVALO_ATUALIZACAO_AUTOMATICA_MS);
}

function garantirAcessoEscrita() {
  if (estado.sessao) {
    return true;
  }

  mostrarAvisoLogin("Faca login para editar o estoque.", "warning", true);
  return false;
}

function definirFormularioLoginDesabilitado(desabilitado) {
  Array.from(elementos.formLogin.elements).forEach((elemento) => {
    elemento.disabled = desabilitado;
  });

  elementos.botaoEntrar.textContent = desabilitado ? "Entrando..." : "Entrar no controle";
}

function sincronizarEstadoFormularioCriacao() {
  const desabilitado = estado.estaCriando || !estado.sessao;

  Array.from(elementos.formNovoProduto.elements).forEach((elemento) => {
    elemento.disabled = desabilitado;
  });

  elementos.botaoNovoProduto.textContent = estado.estaCriando ? "Salvando..." : "Adicionar item";
}

function resetarFormularioCriacao() {
  elementos.formNovoProduto.reset();
  elementos.formNovoProduto.elements.namedItem("product_type").value = "ingrediente";
  elementos.formNovoProduto.elements.namedItem("stock_unit").value = "un";
  elementos.formNovoProduto.elements.namedItem("quantity").value = "0";
  elementos.formNovoProduto.elements.namedItem("min_quantity").value = "5";
}

function resetarEstado() {
  estado.produtos = [];
  estado.historico = [];
  estado.buscaProduto = "";
  estado.filtroTipoProduto = "all";
  estado.idsPendentes.clear();
  estado.estaCriando = false;
  estado.produtosAtualizadosEm = null;
  estado.historicoAtualizadoEm = null;
  elementos.buscaProduto.value = "";
  if (elementos.resumoAtualizacaoProdutos) {
    elementos.resumoAtualizacaoProdutos.textContent = "";
  }
  if (elementos.resumoAtualizacaoHistorico) {
    elementos.resumoAtualizacaoHistorico.textContent = "";
  }
  sincronizarEstadoFiltroTipo();
  sincronizarEstadoFormularioCriacao();
  renderizarProdutos();
  renderizarHistorico();
}

