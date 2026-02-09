let map;
let routingControl;
let marcadores = [];
let paradaCount = 0;

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
            const distance = (route.summary.totalDistance / 1000).toFixed(2);
            const time = Math.round(route.summary.totalTime / 60);

            // Atualizar detalhes da rota
            document.getElementById('distance').textContent = distance + ' km';
            document.getElementById('time').textContent = time + ' minutos';
            
            // Mostrar nome ou coordenadas
            document.getElementById('originInfo').textContent = origemLabel;
            document.getElementById('destinyInfo').textContent = destinoLabel;
            
            // Extrair e mostrar instruções
            const instructionsList = document.getElementById('instructionsList');
            instructionsList.innerHTML = '';
            
            route.instructions.forEach(function(instruction, index) {
                const li = document.createElement('li');
                li.textContent = instruction.text;
                instructionsList.appendChild(li);
            });
            
            document.getElementById('routeDetails').style.display = 'block';
            document.getElementById('routeInstructions').style.display = 'block';
            document.getElementById('noRoute').style.display = 'none';
            document.getElementById('routeInfo').classList.add('active');

            // Ajustar o mapa para mostrar toda a rota
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
    
    document.getElementById('routeDetails').style.display = 'none';
    document.getElementById('routeInstructions').style.display = 'none';
    document.getElementById('noRoute').style.display = 'block';
    document.getElementById('routeInfo').classList.remove('active');
    
    document.getElementById('origem').value = '';
    document.getElementById('origem-nome').value = '';
    document.getElementById('destino').value = '';
    document.getElementById('destino-nome').value = '';
    document.getElementById('paradasContainer').innerHTML = '';
    paradaCount = 0;
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

// Inicializar mapa quando a página carregar
window.addEventListener('DOMContentLoaded', initMap);
