const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PORT = 3020;
const MAX_PORT_ATTEMPTS = 20;
const ROOT_DIR = __dirname;
const MAIN_JL = path.join(ROOT_DIR, 'main.jl');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, contentType, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extraHeaders
  });
  res.end(payload);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length > 10 * 1024 * 1024) {
        reject(new Error('Payload muito grande.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function resolverAlgoritmo(algoritmo) {
  const valor = String(algoritmo || '').trim().toLowerCase();

  if (valor === 'cbc' || valor === 'cpc') {
    return 'Cbc';
  }
  if (valor === 'highs') {
    return 'HiGHS';
  }
  if (valor === 'scip') {
    return 'SCIP';
  }

  throw new Error(`Algoritmo não suportado: ${algoritmo}`);
}

function validarEntrada(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Corpo JSON inválido.');
  }

  const pontos = Array.isArray(payload.pontos) ? payload.pontos : null;
  const matrizCustos = Array.isArray(payload.matriz_custos) ? payload.matriz_custos : null;

  if (!pontos || pontos.length < 2) {
    throw new Error('Envie ao menos 2 pontos.');
  }

  if (!matrizCustos || matrizCustos.length !== pontos.length) {
    throw new Error('A matriz de custos deve ter o mesmo tamanho da lista de pontos.');
  }

  for (let i = 0; i < matrizCustos.length; i += 1) {
    const linha = matrizCustos[i];
    if (!Array.isArray(linha) || linha.length !== pontos.length) {
      throw new Error('A matriz de custos precisa ser quadrada.');
    }

    for (let j = 0; j < linha.length; j += 1) {
      const numero = Number(linha[j]);
      if (!Number.isFinite(numero)) {
        throw new Error('A matriz de custos contém valores inválidos.');
      }
    }
  }

  return {
    pontos,
    matriz_custos: matrizCustos,
    algoritmo: resolverAlgoritmo(payload.algoritmo || payload.solver || 'Cbc')
  };
}

function executarJulia(payload) {
  if (!fs.existsSync(MAIN_JL)) {
    throw new Error('Arquivo main.jl não encontrado.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotas-openstreetmap-'));
  const inputPath = path.join(tempDir, 'entrada.json');
  const outputCsvPath = path.join(tempDir, 'rota.csv');

  fs.writeFileSync(inputPath, JSON.stringify({
    pontos: payload.pontos,
    matriz_custos: payload.matriz_custos
  }, null, 2));

  const resultado = spawnSync('julia', [MAIN_JL, inputPath, outputCsvPath, payload.algoritmo], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });

  if (resultado.error) {
    throw new Error(`Falha ao executar Julia: ${resultado.error.message}`);
  }

  // Capturar stderr para mensagens de erro do Julia
  const stderr = (resultado.stderr || '').trim();
  if (stderr && stderr.length > 0) {
    console.error(`Julia stderr (${payload.algoritmo}):`, stderr);
  }

  if (resultado.status !== 0) {
    const erro = stderr || (resultado.stdout || '').trim();
    if (erro && erro.length > 0) {
      throw new Error(`${payload.algoritmo}: ${erro}`);
    }
    throw new Error(`Julia terminou com código ${resultado.status}.`);
  }

  const linhas = String(resultado.stdout || '')
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);

  if (linhas.length === 0) {
    throw new Error('Julia não retornou saída estruturada.');
  }

  let saida;
  try {
    saida = JSON.parse(linhas[linhas.length - 1]);
  } catch {
    throw new Error(`Não foi possível interpretar a saída do Julia: ${linhas[linhas.length - 1]}`);
  }

  // Validar que a rota foi retornada
  if (!Array.isArray(saida.rota) || saida.rota.length === 0) {
    throw new Error(`${payload.algoritmo} retornou rota inválida.`);
  }

  return {
    saida,
    tempDir
  };
}

function removerUltimoRetorno(indices) {
  if (!Array.isArray(indices) || indices.length === 0) {
    return [];
  }

  if (indices.length > 1 && indices[0] === indices[indices.length - 1]) {
    return indices.slice(0, -1);
  }

  return [...indices];
}

function montarCsvSolucao(pontos, rotaIndices) {
  const linhas = ['nome,latitude,longitude'];

  rotaIndices.forEach((indice) => {
    const ponto = pontos[indice - 1];
    if (!ponto) {
      return;
    }

    const nome = String(ponto.nome ?? `Ponto ${indice}`).replace(/"/g, '""');
    const latitude = String(ponto.latitude ?? '').replace(/"/g, '""');
    const longitude = String(ponto.longitude ?? '').replace(/"/g, '""');
    linhas.push(`${nome},${latitude},${longitude}`);
  });

  return `${linhas.join('\n')}\n`;
}

function montarJsonSolucao(pontos, matrizCustos, rotaIndices, algoritmo, custoTotal) {
  const indicesSemRetorno = removerUltimoRetorno(rotaIndices);
  const pontosOrdenados = indicesSemRetorno.map((indice) => {
    const ponto = pontos[indice - 1] || {};
    return {
      nome: ponto.nome ?? `Ponto ${indice}`,
      endereco: ponto.endereco ?? '',
      latitude: ponto.latitude ?? '',
      longitude: ponto.longitude ?? ''
    };
  });

  const matrizOrdenada = indicesSemRetorno.map((origemIndice) => {
    return indicesSemRetorno.map((destinoIndice) => {
      const origem = matrizCustos[origemIndice - 1];
      return Number(origem?.[destinoIndice - 1] ?? 0);
    });
  });

  return JSON.stringify({
    algoritmo,
    custo_total: custoTotal,
    rota: rotaIndices,
    pontos: pontosOrdenados,
    matriz_custos: matrizOrdenada
  }, null, 2);
}

async function tratarApiSolve(req, res) {
  try {
    const corpo = await readRequestBody(req);
    const payloadBruto = JSON.parse(corpo || '{}');
    const payload = validarEntrada(payloadBruto);

    const execucao = executarJulia(payload);
    const rota = Array.isArray(execucao.saida?.rota) ? execucao.saida.rota.map((valor) => Number(valor)) : [];
    const custoTotal = Number(execucao.saida?.custo_total ?? 0);
    const csvText = montarCsvSolucao(payload.pontos, rota);
    const jsonText = montarJsonSolucao(payload.pontos, payload.matriz_custos, rota, payload.algoritmo, custoTotal);

    sendJson(res, 200, {
      algoritmo: payload.algoritmo,
      rota,
      custo_total: custoTotal,
      csvText,
      jsonText,
      csv_path: execucao.saida?.csv_path ?? null
    });

    fs.rm(execucao.tempDir, { recursive: true, force: true }, () => {});
  } catch (error) {
    sendJson(res, 400, {
      error: error.message || 'Erro inesperado ao resolver a rota.'
    });
  }
}

function servirArquivoEstático(req, res, urlPath) {
  let caminho = decodeURIComponent(urlPath);
  if (caminho === '/') {
    caminho = '/pontos.html';
  }

  const arquivo = path.resolve(ROOT_DIR, `.${caminho}`);

  if (!arquivo.startsWith(ROOT_DIR)) {
    sendText(res, 403, 'text/plain; charset=utf-8', 'Acesso negado.');
    return;
  }

  if (!fs.existsSync(arquivo) || !fs.statSync(arquivo).isFile()) {
    sendText(res, 404, 'text/plain; charset=utf-8', 'Arquivo não encontrado.');
    return;
  }

  const extensao = path.extname(arquivo).toLowerCase();
  const contentType = MIME_TYPES[extensao] || 'application/octet-stream';
  const conteudo = fs.readFileSync(arquivo);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(conteudo);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    sendText(res, 204, 'text/plain; charset=utf-8', '');
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/solve') {
    tratarApiSolve(req, res);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'text/plain; charset=utf-8', 'Método não permitido.');
    return;
  }

  servirArquivoEstático(req, res, url.pathname);
});

let portaAtual = PORT;
let tentativas = 0;

server.on('listening', () => {
  const endereco = server.address();
  const porta = typeof endereco === 'object' && endereco ? endereco.port : portaAtual;
  console.log(`Servidor rodando em http://localhost:${porta}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    tentativas += 1;
    if (tentativas >= MAX_PORT_ATTEMPTS) {
      console.error(`Não foi possível iniciar o servidor após ${tentativas} tentativas de porta.`);
      process.exit(1);
    }

    const proximaPorta = portaAtual + 1;
    console.log(`Porta ${portaAtual} em uso. Tentando a porta ${proximaPorta}...`);
    portaAtual = proximaPorta;
    setTimeout(() => {
      server.listen(portaAtual);
    }, 50);
    return;
  }

  console.error(error);
  process.exit(1);
});

server.listen(portaAtual);