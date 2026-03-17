class Individuo {
  constructor(solucao, arquivo) {
        this.solucao = solucao;
    this.fit_distancia = calc_distancia_solucao(solucao, arquivo); // metros
    }
}

class Populacao {
  constructor(tamanho_populacao, solucao_inicial, taxa_elitismo, arquivo) {
      this.taxa_elitismo = taxa_elitismo;
    this.arquivo = arquivo;
      this.individuos = [];
      for (let i = 0; i < tamanho_populacao; i++) {
          const nova_solucao = this.gerar_solucao_aleatoria(solucao_inicial);
      const novo_individuo = new Individuo(nova_solucao, this.arquivo);
          this.individuos.push(novo_individuo);
      }
  }
  gerar_solucao_aleatoria(solucao_inicial) {
    const solucao = [...solucao_inicial];
    for (let i = solucao.length - 2; i > 1; i--) {
      const j = Math.floor(Math.random() * i) + 1;
      let temp = solucao[i];
      solucao[i] = solucao[j];
      solucao[j] = temp;
    }
    return solucao;
  }
  nova_populacao() {
    const nova_populacao = [];
    const num_elites = Math.floor(this.individuos.length * this.taxa_elitismo);
    const elites = [...this.individuos]
      .sort((a, b) => a.fit_distancia - b.fit_distancia)
      .slice(0, num_elites);
    nova_populacao.push(...elites);
    while (nova_populacao.length < this.individuos.length) {
      const pai1 = this.selecao_torneio(this, 3);
      const pai2 = this.selecao_torneio(this, 3);
      let [filho1, filho2] = this.operadorOX(pai1.solucao, pai2.solucao);
      filho1 = this.operador2opt(filho1);
      filho2 = this.operador2opt(filho2);
      nova_populacao.push(new Individuo(filho1, this.arquivo));
      if (nova_populacao.length < this.individuos.length) {
        nova_populacao.push(new Individuo(filho2, this.arquivo));
      }
    }
    this.individuos = nova_populacao;
  }
  operadorOX(pai1, pai2) {
    const tamanho = pai1.length;
    const inicio = pai1[0];
    const fim = pai1[tamanho - 1];
    const miolo1 = pai1.slice(1, tamanho - 1);
    const miolo2 = pai2.slice(1, tamanho - 1);
    const ponto = Math.floor(miolo1.length * (Math.random() * 0.25 + 0.15));
    const centro1 = miolo1.slice(ponto, -ponto || undefined);
    const centro2 = miolo2.slice(ponto, -ponto || undefined);
    const resto1 = miolo2.filter(x => !centro2.includes(x));
    const resto2 = miolo1.filter(x => !centro1.includes(x));
    const filhoMiolo1 = resto1.slice(ponto).concat(centro2).concat(resto1.slice(0, ponto));
    const filhoMiolo2 = resto2.slice(ponto).concat(centro1).concat(resto2.slice(0, ponto));
    const filho1 = [inicio, ...filhoMiolo1, fim];
    const filho2 = [inicio, ...filhoMiolo2, fim];
    return [filho1, filho2];
  }
  operador2opt(solucao) {
    const tamanho = solucao.length;
    const idx1 = Math.floor(Math.random() * (tamanho - 2)) + 1;
    const idx2 = Math.floor(Math.random() * (tamanho - 2)) + 1;
    if (idx1 !== idx2) {
      const [i, j] = idx1 < idx2 ? [idx1, idx2] : [idx2, idx1];
      const nova_solucao = [
        ...solucao.slice(0, i),
        ...solucao.slice(i, j + 1).reverse(),
        ...solucao.slice(j + 1)
      ];
      return nova_solucao;
    } else {
      return solucao;
    }
  }
  selecao_torneio(populacao, k) {
    const selecionados = [];
    for (let i = 0; i < k; i++) {
      const idx = Math.floor(Math.random() * populacao.individuos.length);
      selecionados.push(populacao.individuos[idx]);
    }
    selecionados.sort((a, b) => a.fit_distancia - b.fit_distancia);
    return selecionados[0];
  }
}





function calc_distancia_solucao(solucao, arquivo) {
  let distancia_total = 0;
  const matriz = arquivo.matriz;
  for (let i = 0; i < solucao.length - 1; i++) {
    const idx1 = solucao[i];
    const idx2 = solucao[i + 1];
    distancia_total += parseFloat(matriz[idx1][idx2]);
  }
  return distancia_total;
}


function algoritmo_genetico(arq_json, num_geracoes, tamanho_populacao, taxa_elitismo) {
  const solucao_inicial = gerar_solucao_inicial(arq_json.pontos);
  const populacao = new Populacao(tamanho_populacao, solucao_inicial, taxa_elitismo, arq_json);
  let melhor_individuo = null; 
  for (let geracao = 0; geracao < num_geracoes; geracao++) {
    populacao.nova_populacao();
    melhor_individuo = populacao.individuos.reduce((melhor, individuo) => {
      return individuo.fit_distancia < melhor.fit_distancia ? individuo : melhor;
    }, populacao.individuos[0]);
    console.log(
      `Geração ${geracao + 1}: Melhor distância = ${melhor_individuo.fit_distancia.toFixed(2)} metros`
    );
  }
  return melhor_individuo;
}


function gerar_solucao_inicial(pontos) {
  const solucao = [];
  for (let i = 0; i < Object.keys(pontos).length; i++) {
    solucao.push(i);
  }
  solucao.push(0);
  return solucao;
}


class ArquivoJSON {
  constructor(caminho) {
    this.caminho = caminho;
    this.conteudo = null;
    this.pontos = null;
    this.matriz = null;
    this.carregar(); 
  }
  carregar() {
    const fs = require("fs");
    this.conteudo = fs.readFileSync(this.caminho, "utf-8");
    const json = JSON.parse(this.conteudo);
    this.pontos = json.pontos;
    this.matriz = json.matriz_custos;
    this.tratar_matriz();
  }
  tratar_matriz() {
    const tamanho = this.matriz.length;
    this.matriz = this.matriz.map((linha, i) => {
      return linha.map((valor, j) => {
        const numero = Number(valor);
        return numero;
      });
    });
  }
}


const emNode = typeof process !== "undefined" && !!process.versions?.node;

if (emNode && typeof window === "undefined") {
  const file_path = process.argv[2];

  if (!file_path) {
    console.error("Uso: node ag.js <caminho-do-json>");
    process.exit(1);
  }

  const arquivo = new ArquivoJSON(file_path);
  const num_elites = 0.01;
  const tamanho_populacao = 300;
  const num_geracoes = 5000;
  const best = algoritmo_genetico(arquivo, num_geracoes, tamanho_populacao, num_elites);
  console.log("Melhor distância final:", best.fit_distancia);
}

if (typeof window !== "undefined") {
  window.algoritmo_genetico = algoritmo_genetico;
}

