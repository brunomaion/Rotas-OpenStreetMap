let pontos = [];
let marcadores = [];
let matrizCustos = [];
let melhorRotaEncontrada = null;

const listaPontosEl = document.getElementById("listaPontos");
const saidaEl = document.getElementById("matrizOutput");
const modoMatrizEl = document.getElementById("modoMatriz");
const csvInputEl = document.getElementById("csvInput");
const jsonInputEl = document.getElementById("jsonInput");
const otimizadorSelectEl = document.getElementById("otimizadorSelect");
const agGeracoesEl = document.getElementById("agGeracoes");
const agPopulacaoEl = document.getElementById("agPopulacao");
const agElitismoEl = document.getElementById("agElitismo");
const otimizadorOutputEl = document.getElementById("otimizadorOutput");

const mapa = L.map("map").setView([-25.0, -53.0], 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
	attribution: "© OpenStreetMap"
}).addTo(mapa);

function paraNumero(valor) {
	if (typeof valor === "number") {
		return Number.isFinite(valor) ? valor : null;
	}

	const texto = String(valor ?? "").replace(",", ".").trim();
	if (!texto) {
		return null;
	}

	const numero = Number(texto);
	return Number.isFinite(numero) ? numero : null;
}

function atualizarSaidaJson() {
	const dados = {
		pontos,
		matriz_custos: matrizCustos
	};
	saidaEl.textContent = JSON.stringify(dados, null, 2);
}

function parseInteiroPositivo(valor, valorPadrao) {
	const numero = Number.parseInt(String(valor ?? ""), 10);
	if (!Number.isFinite(numero) || numero < 1) {
		return valorPadrao;
	}
	return numero;
}

function parseNumeroIntervalo(valor, min, max, valorPadrao) {
	const numero = Number.parseFloat(String(valor ?? ""));
	if (!Number.isFinite(numero)) {
		return valorPadrao;
	}

	if (numero < min || numero > max) {
		return valorPadrao;
	}

	return numero;
}

function obterParametrosAG() {
	return {
		numGeracoes: parseInteiroPositivo(agGeracoesEl?.value, 500),
		tamanhoPopulacao: Math.max(2, parseInteiroPositivo(agPopulacaoEl?.value, 150)),
		taxaElitismo: parseNumeroIntervalo(agElitismoEl?.value, 0, 1, 0.01)
	};
}

function matrizValida() {
	if (!Array.isArray(matrizCustos) || matrizCustos.length !== pontos.length || pontos.length < 2) {
		return false;
	}

	for (let i = 0; i < matrizCustos.length; i += 1) {
		const linha = matrizCustos[i];
		if (!Array.isArray(linha) || linha.length !== pontos.length) {
			return false;
		}

		for (let j = 0; j < linha.length; j += 1) {
			if (!Number.isFinite(linha[j])) {
				return false;
			}
		}
	}

	return true;
}

function gerarSolucaoInicialPadrao(totalPontos) {
	const solucao = [];
	for (let i = 0; i < totalPontos; i += 1) {
		solucao.push(i);
	}
	solucao.push(0);
	return solucao;
}

function calcularDistanciaSolucao(solucao) {
	let distanciaTotal = 0;
	for (let i = 0; i < solucao.length - 1; i += 1) {
		const origem = solucao[i];
		const destino = solucao[i + 1];
		distanciaTotal += Number(matrizCustos[origem][destino]);
	}
	return distanciaTotal;
}

function formatarRotaComNomes(solucao) {
	return solucao
		.map((indice) => pontos[indice]?.nome || `Ponto ${indice + 1}`)
		.join(" -> ");
}

function montarResumoResultadoAG(melhor, solucaoInicial, distanciaInicial) {
	const distanciaFinal = Number(melhor.fit_distancia);
	const ganhoMetros = distanciaInicial - distanciaFinal;
	const ganhoPercentual = distanciaInicial > 0
		? (ganhoMetros / distanciaInicial) * 100
		: 0;

	return [
		"Resultados do Otimizador (AG)",
		"",
		`Distância inicial: ${distanciaInicial.toFixed(3)} m`,
		`Distância final:   ${distanciaFinal.toFixed(3)} m`,
		`Melhoria:          ${ganhoMetros.toFixed(3)} m (${ganhoPercentual.toFixed(2)}%)`,
		"",
		"Rota inicial:",
		formatarRotaComNomes(solucaoInicial),
		"",
		"Rota otimizada:",
		formatarRotaComNomes(melhor.solucao)
	].join("\n");
}

function escaparCampoCSV(valor) {
	const texto = String(valor ?? "");
	if (texto.includes(",") || texto.includes("\"") || texto.includes("\n")) {
		return `"${texto.replace(/\"/g, '""')}"`;
	}
	return texto;
}

function montarCSVMelhorRota(solucao) {
	const linhas = ["nome,latitude,longitude"];

	for (let i = 0; i < solucao.length; i += 1) {
		const indice = solucao[i];
		const ponto = pontos[indice];
		if (!ponto) {
			continue;
		}

		const nome = escaparCampoCSV(ponto.nome || `Ponto ${indice + 1}`);
		const latitude = escaparCampoCSV(ponto.latitude ?? "");
		const longitude = escaparCampoCSV(ponto.longitude ?? "");
		linhas.push(`${nome},${latitude},${longitude}`);
	}

	return linhas.join("\n");
}

function salvarMelhorRotaCSV() {
	if (!Array.isArray(melhorRotaEncontrada) || melhorRotaEncontrada.length === 0) {
		alert("Execute o otimizador primeiro para gerar a melhor rota.");
		return;
	}

	const conteudo = montarCSVMelhorRota(melhorRotaEncontrada);
	const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);

	const link = document.createElement("a");
	link.href = url;
	link.download = "melhor_rota.csv";
	link.click();

	URL.revokeObjectURL(url);
}

function obterRotaSemRetorno(solucao) {
	if (!Array.isArray(solucao) || solucao.length === 0) {
		return [];
	}

	if (solucao.length > 1 && solucao[0] === solucao[solucao.length - 1]) {
		return solucao.slice(0, -1);
	}

	return [...solucao];
}

function montarDadosJSONMelhorRota(solucao) {
	const ordem = obterRotaSemRetorno(solucao);
	const pontosOrdenados = ordem.map((indice) => {
		const ponto = pontos[indice] || {};
		return {
			nome: ponto.nome || `Ponto ${indice + 1}`,
			endereco: ponto.endereco || "",
			latitude: ponto.latitude ?? "",
			longitude: ponto.longitude ?? ""
		};
	});

	const matrizOrdenada = ordem.map((origemIndice) => {
		return ordem.map((destinoIndice) => Number(matrizCustos[origemIndice][destinoIndice]));
	});

	return {
		pontos: pontosOrdenados,
		matriz_custos: matrizOrdenada
	};
}

function salvarMelhorRotaJSON() {
	if (!Array.isArray(melhorRotaEncontrada) || melhorRotaEncontrada.length === 0) {
		alert("Execute o otimizador primeiro para gerar a melhor rota.");
		return;
	}

	const dados = montarDadosJSONMelhorRota(melhorRotaEncontrada);
	const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);

	const link = document.createElement("a");
	link.href = url;
	link.download = "melhor_rota.json";
	link.click();

	URL.revokeObjectURL(url);
}

function executarOtimizador() {
	if (!matrizValida()) {
		alert("Gere uma matriz de custos válida antes de executar o otimizador.");
		return;
	}

	const otimizador = otimizadorSelectEl?.value || "ag";
	if (otimizador !== "ag") {
		alert("Otimizador não suportado no momento.");
		return;
	}

	if (typeof window.algoritmo_genetico !== "function") {
		alert("Função do AG não encontrada. Verifique o carregamento do ag.js.");
		return;
	}

	const { numGeracoes, tamanhoPopulacao, taxaElitismo } = obterParametrosAG();
	const solucaoInicial = gerarSolucaoInicialPadrao(pontos.length);
	const distanciaInicial = calcularDistanciaSolucao(solucaoInicial);
	const arquivo = {
		pontos,
		matriz: matrizCustos
	};

	const melhor = window.algoritmo_genetico(arquivo, numGeracoes, tamanhoPopulacao, taxaElitismo);
	if (!melhor || !Array.isArray(melhor.solucao)) {
		alert("Falha ao executar o otimizador AG.");
		return;
	}

	melhorRotaEncontrada = [...melhor.solucao];

	if (otimizadorOutputEl) {
		otimizadorOutputEl.textContent = montarResumoResultadoAG(melhor, solucaoInicial, distanciaInicial);
	}
}

function salvarNoStorageCompartilhado() {}

function carregarDoStorageCompartilhado() {}

function atualizarMapa() {
	marcadores.forEach((marcador) => mapa.removeLayer(marcador));
	marcadores = [];

	pontos.forEach((ponto) => {
		const latitude = paraNumero(ponto.latitude);
		const longitude = paraNumero(ponto.longitude);
		if (latitude === null || longitude === null) {
			return;
		}

		const marcador = L.marker([latitude, longitude]).addTo(mapa).bindPopup(ponto.nome || "Ponto");
		marcadores.push(marcador);
	});
}

function adicionarPonto() {
	pontos.push({
		nome: "",
		endereco: "",
		latitude: "",
		longitude: ""
	});

	matrizCustos = [];
	renderizarLista();
	atualizarSaidaJson();
	salvarNoStorageCompartilhado();
}

function criarInput(placeholder, value, onInput) {
	const input = document.createElement("input");
	input.placeholder = placeholder;
	input.value = value ?? "";
	input.addEventListener("input", onInput);
	return input;
}

function renderizarLista() {
	listaPontosEl.innerHTML = "";

	if (pontos.length === 0) {
		const vazio = document.createElement("div");
		vazio.className = "vazio";
		vazio.textContent = "Sem pontos";
		listaPontosEl.appendChild(vazio);
		atualizarMapa();
		return;
	}

	pontos.forEach((ponto, index) => {
		const card = document.createElement("div");
		card.className = "ponto";
		card.dataset.index = String(index);

		const header = document.createElement("div");
		header.className = "ponto-header";
		header.textContent = `Ponto ${index + 1}`;

		const nomeInput = criarInput("Nome", ponto.nome, (event) => {
			ponto.nome = event.target.value;
			atualizarMapa();
			atualizarSaidaJson();
			salvarNoStorageCompartilhado();
		});

		const enderecoInput = criarInput("Endereço", ponto.endereco, (event) => {
			ponto.endereco = event.target.value;
			atualizarSaidaJson();
			salvarNoStorageCompartilhado();
		});

		const linhaBotoes = document.createElement("div");
		linhaBotoes.className = "linha-botoes";

		const pesquisarBtn = document.createElement("button");
		pesquisarBtn.type = "button";
		pesquisarBtn.textContent = "Pesquisar";
		pesquisarBtn.addEventListener("click", () => pesquisarEndereco(index));

		const subirBtn = document.createElement("button");
		subirBtn.type = "button";
		subirBtn.className = "secondary";
		subirBtn.textContent = "↑ Subir";
		subirBtn.disabled = index === 0;
		subirBtn.addEventListener("click", () => moverPontoPasso(index, -1));

		const descerBtn = document.createElement("button");
		descerBtn.type = "button";
		descerBtn.className = "secondary";
		descerBtn.textContent = "↓ Descer";
		descerBtn.disabled = index === pontos.length - 1;
		descerBtn.addEventListener("click", () => moverPontoPasso(index, 1));

		const removerBtn = document.createElement("button");
		removerBtn.type = "button";
		removerBtn.className = "secondary";
		removerBtn.textContent = "Remover";
		removerBtn.addEventListener("click", () => removerPonto(index));

		linhaBotoes.appendChild(pesquisarBtn);
		linhaBotoes.appendChild(subirBtn);
		linhaBotoes.appendChild(descerBtn);
		linhaBotoes.appendChild(removerBtn);

		const latitudeInput = criarInput("Latitude", ponto.latitude, (event) => {
			ponto.latitude = event.target.value;
			atualizarMapa();
			matrizCustos = [];
			atualizarSaidaJson();
			salvarNoStorageCompartilhado();
		});

		const longitudeInput = criarInput("Longitude", ponto.longitude, (event) => {
			ponto.longitude = event.target.value;
			atualizarMapa();
			matrizCustos = [];
			atualizarSaidaJson();
			salvarNoStorageCompartilhado();
		});

		card.appendChild(header);
		card.appendChild(nomeInput);
		card.appendChild(enderecoInput);
		card.appendChild(latitudeInput);
		card.appendChild(longitudeInput);
		card.appendChild(linhaBotoes);

		listaPontosEl.appendChild(card);
	});

	atualizarMapa();
}

function moverPontoPasso(index, direcao) {
	const novoIndex = index + direcao;
	if (novoIndex < 0 || novoIndex >= pontos.length) {
		return;
	}

	const atual = pontos[index];
	pontos[index] = pontos[novoIndex];
	pontos[novoIndex] = atual;

	matrizCustos = [];
	renderizarLista();
	atualizarSaidaJson();
	salvarNoStorageCompartilhado();
}

function removerPonto(index) {
	pontos.splice(index, 1);
	matrizCustos = [];
	renderizarLista();
	atualizarSaidaJson();
	salvarNoStorageCompartilhado();
}

async function pesquisarEndereco(index) {
	const ponto = pontos[index];
	if (!ponto?.endereco) {
		return;
	}

	const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(ponto.endereco)}`;
	const response = await fetch(url);
	const data = await response.json();

	if (!Array.isArray(data) || data.length === 0) {
		alert("Endereço não encontrado");
		return;
	}

	ponto.latitude = Number(data[0].lat).toFixed(6);
	ponto.longitude = Number(data[0].lon).toFixed(6);

	matrizCustos = [];
	renderizarLista();
	atualizarSaidaJson();
	salvarNoStorageCompartilhado();
}

function distanciaEuclidiana(p1, p2) {
	const lat1 = paraNumero(p1.latitude);
	const lon1 = paraNumero(p1.longitude);
	const lat2 = paraNumero(p2.latitude);
	const lon2 = paraNumero(p2.longitude);

	if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) {
		return null;
	}

	const dx = lat1 - lat2;
	const dy = lon1 - lon2;
	return Math.sqrt(dx * dx + dy * dy);
}

async function buscarDistanciaOSRM(p1, p2) {
	const lat1 = paraNumero(p1.latitude);
	const lon1 = paraNumero(p1.longitude);
	const lat2 = paraNumero(p2.latitude);
	const lon2 = paraNumero(p2.longitude);

	if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) {
		return null;
	}

	const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;

	try {
		const response = await fetch(url);
		if (!response.ok) {
			return null;
		}

		const data = await response.json();
		const distanciaMetros = data?.routes?.[0]?.distance;
		if (!Number.isFinite(distanciaMetros)) {
			return null;
		}

		return Number(distanciaMetros.toFixed(3));
	} catch {
		return null;
	}
}

function gerarMatrizEuclidiana() {
	const n = pontos.length;
	const matriz = [];

	for (let i = 0; i < n; i += 1) {
		matriz[i] = [];
		for (let j = 0; j < n; j += 1) {
			if (i === j) {
				matriz[i][j] = 0;
				continue;
			}

			const dist = distanciaEuclidiana(pontos[i], pontos[j]);
			matriz[i][j] = dist === null ? null : Number(dist.toFixed(6));
		}
	}

	return matriz;
}

async function gerarMatrizOSRM() {
	const n = pontos.length;
	const matriz = Array.from({ length: n }, () => Array(n).fill(null));

	const tarefas = [];
	for (let i = 0; i < n; i += 1) {
		for (let j = 0; j < n; j += 1) {
			if (i === j) {
				matriz[i][j] = 0;
				continue;
			}

			tarefas.push(
				buscarDistanciaOSRM(pontos[i], pontos[j]).then((distancia) => {
					matriz[i][j] = distancia;
				})
			);
		}
	}

	await Promise.all(tarefas);
	return matriz;
}

async function gerarMatriz() {
	const modo = modoMatrizEl?.value || "euclidiana";
	matrizCustos = modo === "osrm" ? await gerarMatrizOSRM() : gerarMatrizEuclidiana();

	atualizarSaidaJson();
	salvarNoStorageCompartilhado();
}

function salvarJSON() {
	const dados = {
		pontos,
		matriz_custos: matrizCustos
	};

	const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);

	const a = document.createElement("a");
	a.href = url;
	a.download = "dados_pontos.json";
	a.click();

	URL.revokeObjectURL(url);
}

function abrirSeletorCSV() {
	if (!csvInputEl) {
		return;
	}
	csvInputEl.click();
}

function abrirSeletorJSON() {
	if (!jsonInputEl) {
		return;
	}
	jsonInputEl.click();
}

function normalizarRegistroPonto(registro) {
	if (!registro || typeof registro !== "object") {
		return null;
	}

	const nome = String(registro.nome || registro.nome_local || registro.name || "").trim();
	const endereco = String(registro.endereco || registro.address || "").trim();
	const latitude = paraNumero(registro.latitude ?? registro.lat);
	const longitude = paraNumero(registro.longitude ?? registro.lon ?? registro.lng);

	if (latitude === null || longitude === null) {
		return null;
	}

	return {
		nome: nome || "Ponto",
		endereco,
		latitude: String(latitude),
		longitude: String(longitude)
	};
}

function carregarDadosJson(texto) {
	let data;
	try {
		data = JSON.parse(texto);
	} catch {
		throw new Error("JSON inválido.");
	}

	const listaBruta = Array.isArray(data?.pontos)
		? data.pontos
		: Array.isArray(data?.paradas)
			? data.paradas
			: [];

	const pontosNormalizados = listaBruta
		.map(normalizarRegistroPonto)
		.filter(Boolean);

	if (pontosNormalizados.length === 0) {
		throw new Error("JSON sem pontos válidos.");
	}

	const matriz = Array.isArray(data?.matriz_custos)
		? data.matriz_custos
		: Array.isArray(data?.matrizCustos)
			? data.matrizCustos
			: [];

	pontos = pontosNormalizados;
	matrizCustos = matriz;
	renderizarLista();
	atualizarSaidaJson();
	salvarNoStorageCompartilhado();
}

async function carregarJSONArquivo(arquivo) {
	const texto = await arquivo.text();
	carregarDadosJson(texto);
}

function parseLinhaCSV(linha, delimitador) {
	return linha.split(delimitador).map((parte) => parte.trim());
}

function lerPontosDoCSV(texto) {
	const linhas = String(texto)
		.replace(/\r/g, "")
		.split("\n")
		.map((linha) => linha.trim())
		.filter((linha) => linha.length > 0);

	if (linhas.length < 2) {
		throw new Error("CSV vazio ou sem dados.");
	}

	const delimitador = linhas[0].includes(";") ? ";" : ",";
	const cabecalho = parseLinhaCSV(linhas[0], delimitador).map((coluna) => coluna.toLowerCase());

	const idxNome = cabecalho.indexOf("nome");
	const idxLatitude = cabecalho.indexOf("latitude");
	const idxLongitude = cabecalho.indexOf("longitude");

	if (idxNome === -1 || idxLatitude === -1 || idxLongitude === -1) {
		throw new Error("CSV deve ter colunas: nome,latitude,longitude");
	}

	const novosPontos = [];
	for (let i = 1; i < linhas.length; i += 1) {
		const colunas = parseLinhaCSV(linhas[i], delimitador);
		const nome = colunas[idxNome] ?? "";
		const latitude = paraNumero(colunas[idxLatitude]);
		const longitude = paraNumero(colunas[idxLongitude]);

		if (!nome || latitude === null || longitude === null) {
			continue;
		}

		novosPontos.push({
			nome,
			endereco: "",
			latitude: String(latitude),
			longitude: String(longitude)
		});
	}

	if (novosPontos.length === 0) {
		throw new Error("Nenhuma linha válida encontrada no CSV.");
	}

	return novosPontos;
}

async function carregarCSVArquivo(arquivo) {
	const texto = await arquivo.text();
	const novosPontos = lerPontosDoCSV(texto);

	pontos = novosPontos;
	matrizCustos = [];
	renderizarLista();
	atualizarSaidaJson();
	salvarNoStorageCompartilhado();
}

function voltarSitePrincipal() {
	salvarNoStorageCompartilhado();
	const destino = "index.html?sistema=pontos";
	if (window.top && window.top !== window) {
		window.top.location.href = destino;
		return;
	}
	window.location.href = destino;
}

if (csvInputEl) {
	csvInputEl.addEventListener("change", async (event) => {
		const input = event.target;
		const arquivo = input.files?.[0];
		if (!arquivo) {
			return;
		}

		try {
			await carregarCSVArquivo(arquivo);
		} catch (error) {
			const mensagem = error instanceof Error ? error.message : "Falha ao carregar CSV.";
			alert(mensagem);
		} finally {
			input.value = "";
		}
	});
}

if (jsonInputEl) {
	jsonInputEl.addEventListener("change", async (event) => {
		const input = event.target;
		const arquivo = input.files?.[0];
		if (!arquivo) {
			return;
		}

		try {
			await carregarJSONArquivo(arquivo);
		} catch (error) {
			const mensagem = error instanceof Error ? error.message : "Falha ao carregar JSON.";
			alert(mensagem);
		} finally {
			input.value = "";
		}
	});
}

carregarDoStorageCompartilhado();
renderizarLista();
atualizarSaidaJson();

window.executarOtimizador = executarOtimizador;
window.salvarMelhorRotaCSV = salvarMelhorRotaCSV;
window.salvarMelhorRotaJSON = salvarMelhorRotaJSON;
