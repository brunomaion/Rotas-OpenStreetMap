let map;
let routingControl;
let marcadores = [];
let paradaCount = 0;
let segmentosParciais = [];
let waypointsInfo = [];
let linhaParcialAtiva = null;
let segmentoSelecionado = null;
let segmentosPercorridos = {};

function limparParadas() {
    document.getElementById('paradasContainer').innerHTML = '';
    paradaCount = 0;
}

function selecionarCampo(campo) {
    document.querySelector(`input[name="campoAtivo"][value="${campo}"]`).checked = true;
}

function initMap() {
    const cascavelCenter = [-24.955296, -53.4747252];
    
    map = L.map('map').setView(cascavelCenter, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        minZoom: 10
    }).addTo(map);

    document.getElementById('origem').value = '';
    document.getElementById('origem-nome').value = '';
    document.getElementById('destino').value = '';
    document.getElementById('destino-nome').value = '';
}

// Função auxiliar para extrair coordenadas
function parseCoordinates(str) {
    if (!str) return null;
    
    str = str.trim();
    const parts = str.split(',').map(p => p.trim());
    if (parts.length === 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
            return [lat, lng];
        }
    }
    return null;
}

function calcularRota() {
    try {
        const origemValue = document.getElementById('origem').value.trim();
        const destinoValue = document.getElementById('destino').value.trim();
        const origemNome = document.getElementById('origem-nome').value.trim();
        const destinoNome = document.getElementById('destino-nome').value.trim();

        const origem = parseCoordinates(origemValue);
        const destino = parseCoordinates(destinoValue);

        if (!origem || !destino) {
            alert('Por favor, preencha as coordenadas de origem e destino no formato: -24.955296, -53.4747252');
            return;
        }

        document.getElementById('loading').classList.add('active');
        document.getElementById('routeInfo').classList.remove('active');

        // Limpar marcadores anteriores
        marcadores.forEach(marker => map.removeLayer(marker));
        marcadores = [];

        // Remover rota anterior
        if (routingControl) {
            map.removeControl(routingControl);
        }

        // Adiciona marcador de origem (azul)
        const startMarker = L.circleMarker(origem, {
            radius: 10,
            fillColor: '#0066ff',
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
        }).addTo(map);
        const origemLabel = origemNome || 'Origem';
        startMarker.bindPopup(`<b>${origemLabel}</b>`);
        marcadores.push(startMarker);

        // Adiciona marcador de destino (verde)
        const endMarker = L.circleMarker(destino, {
            radius: 10,
            fillColor: '#00cc00',
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
        }).addTo(map);
        const destinoLabel = destinoNome || 'Destino';
        endMarker.bindPopup(`<b>${destinoLabel}</b>`);
        marcadores.push(endMarker);

        // Coletar waypoints
        const waypoints = [L.latLng(origem[0], origem[1])];

        // Adicionar paradas intermediárias
        const paradasCoordenadas = [];
        const paradasInputs = document.querySelectorAll('.parada-input');
        paradasInputs.forEach((input, index) => {
            const coords = parseCoordinates(input.value.trim());
            if (coords) {
                const paradaId = input.id;
                const nomeInput = document.getElementById(paradaId + '-nome');
                const paradaNome = nomeInput ? nomeInput.value.trim() : '';
                
                paradasCoordenadas.push(coords);
                waypoints.push(L.latLng(coords[0], coords[1]));
                
                // Adiciona marcador para parada intermediária (laranja)
                const paradaMarker = L.circleMarker(coords, {
                    radius: 8,
                    fillColor: '#ff8800',
                    color: '#ffffff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.9
                }).addTo(map);
                const paradaLabel = paradaNome || `Parada ${paradasCoordenadas.length}`;
                paradaMarker.bindPopup(`<b>${paradaLabel}</b>`);
                marcadores.push(paradaMarker);
            }
        });

        waypoints.push(L.latLng(destino[0], destino[1]));

        // Criar nova rota
        routingControl = L.Routing.control({
            waypoints: waypoints,
            router: L.Routing.osrmv1({
                serviceUrl: 'https://router.project-osrm.org/route/v1',
                language: 'pt-BR'
            }),
            lineOptions: {
                styles: [
                    {color: '#667eea', opacity: 0.8, weight: 5}
                ]
            },
            addWaypoints: false,
            draggableWaypoints: false,
            fitSelectedRoutes: true,
            showAlternatives: false,
            createMarker: function() {
                return null; // Não criar marcadores padrão
            }
        }).addTo(map);

        routingControl.on('routesfound', function(e) {
            document.getElementById('loading').classList.remove('active');
            
            const route = e.routes[0];

            calcularSegmentosParciais(route, waypoints);
            
            // Calcular soma de todos os segmentos
            let distanciaTotal = 0;
            let tempoTotal = 0;
            
            segmentosParciais.forEach(segmento => {
                distanciaTotal += segmento.distancia;
                tempoTotal += segmento.tempo;
            });
            
            const distanciaKm = (distanciaTotal / 1000).toFixed(2);
            const tempoMin = Math.round(tempoTotal);

            document.getElementById('distance').textContent = distanciaKm + ' km';
            document.getElementById('time').textContent = tempoMin + ' minutos';
            
            document.getElementById('originInfo').textContent = origemLabel;
            document.getElementById('destinyInfo').textContent = destinoLabel;
            
            exibirSegmentosParciais();
            
            document.getElementById('routeDetails').style.display = 'block';
            document.getElementById('routePartialsInfo').style.display = 'block';
            document.getElementById('noRoute').style.display = 'none';
            document.getElementById('routeInfo').classList.add('active');

            setTimeout(() => {
                const bounds = routingControl.getBounds();
                if (bounds && bounds.isValid()) {
                    map.fitBounds(bounds, {
                        padding: [80, 80],
                        maxZoom: 15
                    });
                }
            }, 300);
        });

        routingControl.on('routingerror', function(e) {
            document.getElementById('loading').classList.remove('active');
            alert('Erro ao calcular rota: ' + e.status);
        });

    } catch (error) {
        alert('Erro: ' + error.message);
        document.getElementById('loading').classList.remove('active');
    }
}

function setPreset(name, lat, lng) {
    const campoAtivo = document.querySelector('input[name="campoAtivo"]:checked').value;
    const campoNome = document.getElementById(campoAtivo + '-nome');
    const campoCoordenadas = document.getElementById(campoAtivo);
    
    if (campoNome && campoCoordenadas) {
        campoNome.value = name;
        campoCoordenadas.value = `${lat}, ${lng}`;
    }
}

function limparMapa() {
    // Limpar marcadores
    marcadores.forEach(marker => map.removeLayer(marker));
    marcadores = [];
    
    // Limpar rota
    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }
    
    // Limpar linha parcial
    if (linhaParcialAtiva) {
        map.removeLayer(linhaParcialAtiva);
        linhaParcialAtiva = null;
    }
    
    // Limpar segmentos parciais
    segmentosParciais = [];
    waypointsInfo = [];
    segmentoSelecionado = null;
    segmentosPercorridos = {};
    
    document.getElementById('routeDetails').style.display = 'none';
    document.getElementById('routePartialsInfo').style.display = 'none';
    document.getElementById('routeProgressInfo').style.display = 'none';
    document.getElementById('noRoute').style.display = 'block';
    document.getElementById('routeInfo').classList.remove('active');
    
    document.getElementById('origem').value = '';
    document.getElementById('origem-nome').value = '';
    document.getElementById('destino').value = '';
    document.getElementById('destino-nome').value = '';
    limparParadas();
}

function parseCsv(text) {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    const rows = lines.map(line => line.split(',').map(value => value.trim()));

    const header = rows[0].map(cell => cell.toLowerCase());
    const hasHeader = header.includes('nome') && header.includes('latitude') && header.includes('longitude');

    const dataRows = hasHeader ? rows.slice(1) : rows;
    return dataRows
        .filter(row => row.length >= 3)
        .map(row => ({
            nome: row[0],
            latitude: row[1],
            longitude: row[2]
        }));
}

function carregarCsv(textoCsv) {
    const registros = parseCsv(textoCsv);
    if (registros.length < 2) {
        alert('O CSV precisa ter ao menos 2 linhas de dados (origem e destino).');
        return;
    }

    const origem = registros[0];
    const destino = registros[registros.length - 1];
    const paradas = registros.slice(1, -1);

    document.getElementById('origem-nome').value = origem.nome;
    document.getElementById('origem').value = `${origem.latitude}, ${origem.longitude}`;

    document.getElementById('destino-nome').value = destino.nome;
    document.getElementById('destino').value = `${destino.latitude}, ${destino.longitude}`;

    limparParadas();

    paradas.forEach(parada => {
        adicionarParada();
        const id = `parada-input-${paradaCount}`;
        const nomeInput = document.getElementById(`${id}-nome`);
        const coordInput = document.getElementById(id);
        if (nomeInput) nomeInput.value = parada.nome;
        if (coordInput) coordInput.value = `${parada.latitude}, ${parada.longitude}`;
    });
}

function adicionarParada() {
    paradaCount++;
    const container = document.getElementById('paradasContainer');
    const paradaDiv = document.createElement('div');
    paradaDiv.className = 'input-group';
    paradaDiv.id = `parada-${paradaCount}`;
    paradaDiv.innerHTML = `
        <label>
            <input type="radio" name="campoAtivo" value="parada-input-${paradaCount}" onclick="selecionarCampo('parada-input-${paradaCount}')">
            Parada ${paradaCount}
        </label>
        <input type="text" id="parada-input-${paradaCount}-nome" placeholder="Nome do local (opcional)" onfocus="selecionarCampo('parada-input-${paradaCount}')" style="margin-bottom: 5px;">
        <div style="display: flex; gap: 5px;">
            <input type="text" class="parada-input" id="parada-input-${paradaCount}" placeholder="Latitude, Longitude" onfocus="selecionarCampo('parada-input-${paradaCount}')">
            <button class="btn-secondary" onclick="removerParada(${paradaCount})" style="width: 40px; padding: 8px;">✕</button>
        </div>
    `;
    container.appendChild(paradaDiv);
}

function removerParada(id) {
    const paradaDiv = document.getElementById(`parada-${id}`);
    if (paradaDiv) {
        paradaDiv.remove();
    }
}

function calcularSegmentosParciais(route, waypoints) {
    segmentosParciais = [];
    waypointsInfo = [];
    
    const coordsCompletas = route.coordinates;
    const instructions = route.instructions;
    
    // Armazenar informações dos waypoints
    const origemNome = document.getElementById('origem-nome').value.trim() || 'Origem';
    const destinoNome = document.getElementById('destino-nome').value.trim() || 'Destino';
    
    waypointsInfo.push({ nome: origemNome, coords: waypoints[0] });
    
    // Adicionar paradas intermediárias
    const paradasInputs = document.querySelectorAll('.parada-input');
    paradasInputs.forEach((input, index) => {
        const coords = parseCoordinates(input.value.trim());
        if (coords) {
            const paradaId = input.id;
            const nomeInput = document.getElementById(paradaId + '-nome');
            const paradaNome = nomeInput ? nomeInput.value.trim() : '';
            waypointsInfo.push({ 
                nome: paradaNome || `Parada ${index + 1}`, 
                coords: L.latLng(coords[0], coords[1]) 
            });
        }
    });
    
    waypointsInfo.push({ nome: destinoNome, coords: waypoints[waypoints.length - 1] });
    
    // Calcular cada segmento
    for (let i = 0; i < waypoints.length - 1; i++) {
        const inicio = waypoints[i];
        const fim = waypoints[i + 1];
        
        // Encontrar índices mais próximos nas coordenadas da rota
        let indiceInicio = 0;
        let indiceFim = coordsCompletas.length - 1;
        let menorDistInicio = Infinity;
        let menorDistFim = Infinity;
        
        coordsCompletas.forEach((coord, idx) => {
            const distInicio = Math.sqrt(
                Math.pow(coord.lat - inicio.lat, 2) + 
                Math.pow(coord.lng - inicio.lng, 2)
            );
            const distFim = Math.sqrt(
                Math.pow(coord.lat - fim.lat, 2) + 
                Math.pow(coord.lng - fim.lng, 2)
            );
            
            if (distInicio < menorDistInicio) {
                menorDistInicio = distInicio;
                indiceInicio = idx;
            }
            if (distFim < menorDistFim && idx > indiceInicio) {
                menorDistFim = distFim;
                indiceFim = idx;
            }
        });
        
        const coordsSegmento = coordsCompletas.slice(indiceInicio, indiceFim + 1);
        
        // Calcular distância do segmento
        let distanciaSegmento = 0;
        for (let j = 0; j < coordsSegmento.length - 1; j++) {
            distanciaSegmento += map.distance(
                [coordsSegmento[j].lat, coordsSegmento[j].lng],
                [coordsSegmento[j + 1].lat, coordsSegmento[j + 1].lng]
            );
        }
        
        // Estimar tempo (assumindo velocidade média de 50 km/h)
        const tempoSegmento = (distanciaSegmento / 1000) / 50 * 60;
        
        // Filtrar instruções relevantes para este segmento
        const instrucoesSegmento = instructions.filter(inst => {
            const idx = inst.index || 0;
            return idx >= indiceInicio && idx <= indiceFim;
        });
        
        segmentosParciais.push({
            origem: waypointsInfo[i].nome,
            destino: waypointsInfo[i + 1].nome,
            distancia: distanciaSegmento,
            tempo: tempoSegmento,
            instrucoes: instrucoesSegmento,
            coordenadas: coordsSegmento
        });
    }
}

function exibirSegmentosParciais() {
    const container = document.getElementById('partialsContainer');
    container.innerHTML = '';
    
    if (segmentosParciais.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.7);">Nenhum segmento calculado</p>';
        return;
    }
    
    segmentosParciais.forEach((segmento, index) => {
        const segmentoDiv = document.createElement('div');
        segmentoDiv.className = 'partial-segment';
        segmentoDiv.style.cursor = 'pointer';
        
        const distanciaKm = (segmento.distancia / 1000).toFixed(2);
        const tempoMin = Math.round(segmento.tempo);
        
        segmentoDiv.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 10px;">
                <input type="checkbox" id="segment-check-${index}" class="segment-checkbox" style="margin-top: 12px; cursor: pointer;" onchange="toggleSegmentoPercorrido(${index})">
                <div style="flex: 1;">
                    <div class="segment-header">
                        <strong style="font-size: 14px;">${segmento.origem}</strong>
                        <span style="font-size: 20px; margin: 5px 0;">↓</span>
                        <strong style="font-size: 14px;">${segmento.destino}</strong>
                    </div>
                    <div class="segment-info">
                        <div class="info-item">
                            <span class="info-label">Distância:</span>
                            <span class="info-value">${distanciaKm} km</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Tempo:</span>
                            <span class="info-value">${tempoMin} min</span>
                        </div>
                    </div>
                    <button class="btn-segment-details" onclick="event.stopPropagation(); toggleInstrucoesSegmento(${index})">
                        Ver Instruções ▼
                    </button>
                    <div class="segment-instructions" id="segment-instructions-${index}" style="display: none;">
                        <ol>
                            ${segmento.instrucoes.map(inst => `<li>${inst.text}</li>`).join('') || '<li>Siga em frente até o destino</li>'}
                        </ol>
                    </div>
                </div>
            </div>
        `;
        
        // Adicionar evento de clique no segmento
        segmentoDiv.addEventListener('click', function() {
            mostrarRotaParcial(index);
        });
        
        container.appendChild(segmentoDiv);
    });
}

function toggleInstrucoesSegmento(index) {
    const instrucoesDiv = document.getElementById(`segment-instructions-${index}`);
    const btn = instrucoesDiv.previousElementSibling;
    
    if (instrucoesDiv.style.display === 'none') {
        instrucoesDiv.style.display = 'block';
        btn.textContent = 'Ocultar Instruções ▲';
    } else {
        instrucoesDiv.style.display = 'none';
        btn.textContent = 'Ver Instruções ▼';
    }
}

function toggleSegmentoPercorrido(index) {
    const checkbox = document.getElementById(`segment-check-${index}`);
    const segmento = document.querySelector(`.partial-segment:nth-child(${index + 1})`);
    
    if (checkbox.checked) {
        segmentosPercorridos[index] = true;
        segmento.style.opacity = '0.6';
    } else {
        segmentosPercorridos[index] = false;
        segmento.style.opacity = '1';
    }
    
    // Atualizar progresso
    atualizarProgressoNavegacao();
}

function atualizarProgressoNavegacao() {
    const totalSegmentos = segmentosParciais.length;
    const segmentosMarked = Object.values(segmentosPercorridos).filter(v => v === true).length;
    
    // Calcular distância e tempo percorridos
    let distanciaTotal = 0;
    let tempoTotal = 0;
    
    Object.keys(segmentosPercorridos).forEach(idx => {
        if (segmentosPercorridos[idx]) {
            distanciaTotal += segmentosParciais[idx].distancia;
            tempoTotal += segmentosParciais[idx].tempo;
        }
    });
    
    const distanciaKm = (distanciaTotal / 1000).toFixed(2);
    const tempoMin = Math.round(tempoTotal);
    
    // Atualizar elementos na tela
    document.getElementById('segmentosPercorridosCount').textContent = `${segmentosMarked}/${totalSegmentos}`;
    document.getElementById('distanciaPercorrida').textContent = `${distanciaKm} km`;
    document.getElementById('tempoPercorrido').textContent = `${tempoMin} min`;
    
    // Mostrar container de progresso
    if (segmentosMarked > 0) {
        document.getElementById('routeProgressInfo').style.display = 'block';
    }
}

function mostrarRotaParcial(index) {
    if (index < 0 || index >= segmentosParciais.length) return;
    
    const segmento = segmentosParciais[index];
    
    // Se clicar no mesmo segmento, volta a mostrar rota completa
    if (segmentoSelecionado === index) {
        segmentoSelecionado = null;
        
        // Remover linha parcial
        if (linhaParcialAtiva) {
            map.removeLayer(linhaParcialAtiva);
            linhaParcialAtiva = null;
        }
        
        // Restaurar rota completa - encontrar todas as linhas e restaurá-las
        map.eachLayer(function(layer) {
            if (layer instanceof L.Polyline && layer !== linhaParcialAtiva) {
                if (layer.setStyle) {
                    layer.setStyle({ opacity: 0.8, weight: 5 });
                }
            }
        });
        
        // Remover destaque dos segmentos
        document.querySelectorAll('.partial-segment').forEach(seg => {
            seg.style.border = '2px solid #000000';
            seg.style.transform = '';
        });
        
        // Ajustar visualização para rota completa
        if (routingControl) {
            const bounds = routingControl.getBounds();
            if (bounds && bounds.isValid()) {
                map.fitBounds(bounds, {
                    padding: [80, 80],
                    maxZoom: 15
                });
            }
        }
        
        return;
    }
    
    segmentoSelecionado = index;
    
    // Remover linha parcial anterior se existir
    if (linhaParcialAtiva) {
        map.removeLayer(linhaParcialAtiva);
    }
    

    map.eachLayer(function(layer) {
        if (layer instanceof L.Polyline) {
            if (layer.setStyle) {
                layer.setStyle({ opacity: 0.5, weight: 4 });
            }
        }
    });
    

    const latlngs = segmento.coordenadas.map(c => [c.lat, c.lng]);
    linhaParcialAtiva = L.polyline(latlngs, {
        color: '#002fff',
        weight: 6,
        opacity: 1,
        zIndex: 1000
    }).addTo(map);
    
    // Ajustar o mapa para o segmento
    const bounds = linhaParcialAtiva.getBounds();
    if (bounds && bounds.isValid()) {
        map.fitBounds(bounds, {
            padding: [100, 100],
            maxZoom: 16
        });
    }
    
    // Destacar visualmente o segmento selecionado
    document.querySelectorAll('.partial-segment').forEach((seg, idx) => {
        if (idx === index) {
            seg.style.border = '3px solid #002fff';
            seg.style.transform = 'scale(1.02)';
        } else {
            seg.style.border = '2px solid #000000';
            seg.style.transform = '';
        }
    });
}

// Inicializar mapa quando a página carregar
window.addEventListener('DOMContentLoaded', initMap);
window.addEventListener('DOMContentLoaded', () => {
    const csvInput = document.getElementById('csvInput');
    if (!csvInput) return;

    csvInput.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            carregarCsv(String(reader.result || ''));
        };
        reader.readAsText(file);
        event.target.value = '';
    });
});
