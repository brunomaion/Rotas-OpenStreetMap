# ConsultaEnderecos2

Sistema web para cadastro de pontos, geocodificação de endereços, geração de matriz de custos e otimização de rota com Algoritmo Genético (AG), com exportação dos resultados em CSV e JSON.

## Visão geral

O projeto permite:

- Cadastrar pontos manualmente (`nome`, `endereco`, `latitude`, `longitude`)
- Buscar coordenadas por endereço usando Nominatim (OpenStreetMap)
- Visualizar os pontos no mapa (Leaflet)
- Gerar matriz de custos `n x n` por dois modos:
  - Euclidiana (local)
  - OSRM (rota viária via API)
- Exibir e salvar JSON com `pontos` + `matriz_custos`
- Executar otimizador AG com parâmetros configuráveis
- Comparar rota inicial vs rota otimizada
- Salvar melhor rota em:
  - CSV (`nome,latitude,longitude`)
  - JSON (pontos e matriz reordenados pela melhor rota)

## Estrutura do projeto

- `pontos.html`: interface principal
- `pontos.css`: estilos da interface
- `pontos.js`: lógica de UI, mapa, matriz, importação/exportação e integração com AG
- `ag.js`: implementação do Algoritmo Genético (browser + modo CLI em Node.js)
- `prompt.md`: especificação inicial de requisitos

## Funcionalidades detalhadas

### 1) Gerenciamento de pontos

Na tela principal é possível:

- Adicionar pontos
- Editar qualquer campo (`nome`, `endereco`, `latitude`, `longitude`)
- Remover pontos
- Reordenar com botões **Subir/Descer**

Cada alteração que impacta as coordenadas zera a matriz de custos atual, forçando nova geração consistente.

### 2) Busca de endereço (geocodificação)

O botão **Pesquisar** consulta:

- `https://nominatim.openstreetmap.org/search?format=json&q=<endereco>`

Ao encontrar resultado, atualiza `latitude` e `longitude` do ponto.

### 3) Mapa

- Renderizado com Leaflet
- Camada base do OpenStreetMap
- Cada ponto válido vira um marcador com popup do nome

### 4) Geração da matriz de custos

Disponível em dois modos:

- **Euclidiana**: cálculo local por distância euclidiana
- **OSRM**: consulta da API pública de roteamento (`router.project-osrm.org`)

Saída no formato:

```json
{
  "pontos": [ ... ],
  "matriz_custos": [ ... ]
}
```

### 5) Importação de dados

#### CSV

- Botão: **Carregar CSV**
- Cabeçalho obrigatório: `nome,latitude,longitude`
- Delimitador aceito: `,` ou `;`

#### JSON

- Botão: **Carregar JSON**
- Aceita:
  - `pontos` (ou `paradas`)
  - `matriz_custos` (ou `matrizCustos`)

### 6) Exportação de dados base

- Botão: **Salvar JSON** (bloco da matriz)
- Arquivo: `dados_pontos.json`
- Conteúdo: pontos atuais + matriz atual

---

## Otimizador de rota (AG)

### Disponível hoje

- Seletor de algoritmo com opção atual: `AG`

### Parâmetros do AG

- **Gerações** (`numGeracoes`)
- **População** (`tamanhoPopulacao`)
- **Elitismo** (`taxaElitismo`)

### Execução

Ao clicar **Executar Otimizador**:

1. Valida se existe matriz quadrada e numérica
2. Monta rota inicial padrão: `0 -> 1 -> 2 -> ... -> 0`
3. Calcula distância inicial
4. Executa `algoritmo_genetico(...)`
5. Exibe resultado textual com comparação:
   - Distância inicial
   - Distância final
   - Melhoria (m e %)
   - Rota inicial (nomes)
   - Rota otimizada (nomes)

### Exportações da melhor rota

Após executar o AG:

- **Salvar CSV**
  - Arquivo: `melhor_rota.csv`
  - Formato:
    ```csv
    nome,latitude,longitude
    ...
    ```
  - Ordem: sequência da melhor rota encontrada

- **Salvar JSON**
  - Arquivo: `melhor_rota.json`
  - Conteúdo:
    - `pontos` reordenados pela melhor rota
    - `matriz_custos` reordenada com a mesma ordem

> Observação: para o JSON otimizado, o último ponto de retorno (quando igual ao primeiro) é removido antes da reordenação para evitar duplicidade no vetor de pontos.

---

## Algoritmo Genético (implementação)

Arquivo: `ag.js`

Componentes principais:

- `Individuo`
  - Guarda `solucao` e `fit_distancia`
- `Populacao`
  - Geração inicial aleatória
  - Elitismo
  - Seleção por torneio
  - Crossover `OX` adaptado
  - Mutação/ajuste local com `2-opt`
- `algoritmo_genetico(...)`
  - Evolui por `num_geracoes`
  - Retorna melhor indivíduo

### Distância usada no fitness

`calc_distancia_solucao(solucao, arquivo)` soma os custos da matriz entre pares consecutivos da rota.

---

## Execução

## 1) Navegador (principal)

Como é um projeto estático, abra `pontos.html` no navegador.

Recomendação: usar servidor local para evitar limitações de CORS/arquivos em alguns navegadores.

Exemplo com Python:

```bash
python -m http.server 8000
```

Depois acesse:

- `http://localhost:8000/pontos.html`

## 2) API Node + Julia

O projeto agora inclui um servidor Node que expõe uma API para resolver a rota com os solvers do Julia.

Inicie com:

```bash
node server.js
```

Depois abra:

- `http://localhost:3000/pontos.html`

Na tela de pontos você pode escolher:

- `AG` para executar o algoritmo genético localmente
- `CBC`, `HiGHS` ou `SCIP` para resolver via API Node + `main.jl`

A resposta da API já retorna os textos de exportação:

- CSV da solução
- JSON da solução reordenada

## 3) Node.js (modo CLI do AG)

`ag.js` também roda em modo CLI:

```bash
node ag.js caminho/do/arquivo.json
```

Formato esperado no arquivo JSON:

```json
{
  "pontos": [
    { "nome": "A", "latitude": "-25.4", "longitude": "-49.2" }
  ],
  "matriz_custos": [
    [0, 10],
    [10, 0]
  ]
}
```

---

## Dependências externas

Carregadas via CDN/API:

- Leaflet (mapa)
- OpenStreetMap tiles
- Nominatim (geocodificação)
- OSRM público (roteamento)

Não há `package.json` no estado atual do projeto.

## Limitações conhecidas

- `salvarNoStorageCompartilhado()` e `carregarDoStorageCompartilhado()` estão vazias (sem persistência local implementada)
- AG executa de forma síncrona no thread principal (pode travar UI em parâmetros altos)
- Uso de serviços públicos (Nominatim/OSRM) depende de disponibilidade e limites externos

## Próximos passos sugeridos

- Implementar persistência local (LocalStorage)
- Mover AG para Web Worker para evitar bloqueio da interface
- Adicionar mais otimizadores no seletor
- Incluir testes de validação de matriz e parsers CSV/JSON
- Adicionar indicador de progresso da otimização
