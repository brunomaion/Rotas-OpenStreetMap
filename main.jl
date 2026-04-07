using JSON
using JuMP
using GLPK
using CSV
using DataFrames
using HiGHS
using SCIP
using Cbc

function carregar_dados(json_path)
    dados = JSON.parsefile(json_path)
    if !haskey(dados, "matriz_custos")
        error("'matriz_custos' não encontrada no JSON.")
    end
    if !haskey(dados, "pontos")
        error("'pontos' não encontrado no JSON.")
    end
    matriz_custo = dados["matriz_custos"]
    pontos = dados["pontos"]

    matriz_custo = [Float64.(linha) for linha in matriz_custo]
    matriz_custo = hcat(matriz_custo...)'
    return matriz_custo, pontos
end


function glpk_tsp(matriz_custo)
    n = size(matriz_custo, 1)
    model = Model(GLPK.Optimizer)
    @variable(model, x[1:n, 1:n], Bin)
    @variable(model, u[1:n] >= 0)
    @constraint(model, [i in 1:n], x[i,i] == 0)
    @objective(model, Min,
        sum(matriz_custo[i,j] * x[i,j] for i in 1:n, j in 1:n)
    )
    @constraint(model, [i in 1:n], sum(x[i,j] for j in 1:n if j != i) == 1)
    @constraint(model, [j in 1:n], sum(x[i,j] for i in 1:n if i != j) == 1)

    # SUBROTAS
    for i in 2:n, j in 2:n
        if i != j
            @constraint(model, u[i] - u[j] + n * x[i,j] <= n - 1)
        end
    end
    optimize!(model)
    return value.(x)
end


function scip_tsp(matriz_custo)
    n = size(matriz_custo, 1)
    model = Model(SCIP.Optimizer)
    
    # Desabilitar logs verbosos do SCIP
    set_optimizer_attribute(model, "display/verblevel", 0)
    
    @variable(model, x[1:n, 1:n], Bin)
    @variable(model, u[1:n] >= 0)
    @constraint(model, [i in 1:n], x[i,i] == 0)
    @objective(model, Min,
        sum(matriz_custo[i,j] * x[i,j] for i in 1:n, j in 1:n)
    )
    @constraint(model, [i in 1:n],
        sum(x[i,j] for j in 1:n if j != i) == 1
    )
    @constraint(model, [j in 1:n],
        sum(x[i,j] for i in 1:n if i != j) == 1
    )
    for i in 2:n, j in 2:n
        if i != j
            @constraint(model, u[i] - u[j] + n * x[i,j] <= n - 1)
        end
    end
    optimize!(model)
    
    # Verificar se a solução é viável
    if termination_status(model) != OPTIMAL && termination_status(model) != LOCALLY_SOLVED
        error("SCIP não encontrou solução ótima. Status: $(termination_status(model))")
    end
    
    return value.(x)
end

function cbc_tsp(matriz_custo)
    n = size(matriz_custo, 1)
    model = Model(Cbc.Optimizer)
    
    # Desabilitar logs verbosos do CBC
    set_optimizer_attribute(model, "logLevel", 0)
    
    @variable(model, x[1:n, 1:n], Bin)
    @variable(model, u[1:n] >= 0)
    @constraint(model, [i in 1:n], x[i,i] == 0)
    @objective(model, Min,
        sum(matriz_custo[i,j] * x[i,j] for i in 1:n, j in 1:n)
    )
    @constraint(model, [i in 1:n],
        sum(x[i,j] for j in 1:n if j != i) == 1
    )
    @constraint(model, [j in 1:n],
        sum(x[i,j] for i in 1:n if i != j) == 1
    )
    for i in 2:n, j in 2:n
        if i != j
            @constraint(model, u[i] - u[j] + n * x[i,j] <= n - 1)
        end
    end
    optimize!(model)
    
    # Verificar se a solução é viável
    if termination_status(model) != OPTIMAL && termination_status(model) != LOCALLY_SOLVED
        error("CBC não encontrou solução ótima. Status: $(termination_status(model))")
    end
    
    return value.(x)
end

function highs_tsp(matriz_custo)
    n = size(matriz_custo, 1)
    model = Model(HiGHS.Optimizer)
    
    # Desabilitar logs verbosos do HiGHS
    set_optimizer_attribute(model, "log_to_console", false)
    
    @variable(model, x[1:n, 1:n], Bin)
    @variable(model, u[1:n] >= 0)

    @constraint(model, [i in 1:n], x[i,i] == 0)

    @objective(model, Min,
        sum(matriz_custo[i,j] * x[i,j] for i in 1:n, j in 1:n)
    )
    @constraint(model, [i in 1:n],
        sum(x[i,j] for j in 1:n if j != i) == 1
    )
    @constraint(model, [j in 1:n],
        sum(x[i,j] for i in 1:n if i != j) == 1
    )
    for i in 2:n, j in 2:n
        if i != j
            @constraint(model, u[i] - u[j] + n * x[i,j] <= n - 1)
        end
    end
    optimize!(model)
    
    # Verificar se a solução é viável
    if termination_status(model) != OPTIMAL && termination_status(model) != LOCALLY_SOLVED
        error("HiGHS não encontrou solução ótima. Status: $(termination_status(model))")
    end
    
    return value.(x)
end

function extrair_rota(x)
    n = size(x, 1)
    
    # Verificar se x tem valores válidos
    if isempty(x) || any(isnan.(x))
        error("Matriz de solução contém valores inválidos")
    end
    
    rota = [1]
    atual = 1
    visitados = Set([1])
    
    for passo in 1:n-1
        encontrado = false
        for j in 1:n
            # Verificar se x[atual, j] é significativamente > 0 (com margem para erros numéricos)
            if j != atual && j ∉ visitados && x[atual, j] > 0.5
                push!(rota, j)
                push!(visitados, j)
                atual = j
                encontrado = true
                break
            end
        end
        
        if !encontrado
            # Se não encontrar, tentar com threshold menor
            for j in 1:n
                if j != atual && j ∉ visitados && x[atual, j] > 0.1
                    push!(rota, j)
                    push!(visitados, j)
                    atual = j
                    encontrado = true
                    break
                end
            end
        end
        
        if !encontrado
            # Se ainda não encontrou, há um problema na solução
            error("Não foi possível construir rota válida no passo $passo. visitados=$visitados, n=$n")
        end
    end
    
    # Fechar ciclo retornando a 1
    push!(rota, 1)
    return rota
end

function calc_custo_inicial(rota, matriz_custo)
    custo_inicial = 0.0
    for i in 1:length(rota)-1
        custo_inicial += matriz_custo[rota[i], rota[i+1]]
    end
    return custo_inicial
end

function calc_custo_total(rota, matriz_custo)
    custo_total = 0.0
    for i in 1:length(rota)-1
        custo_total += matriz_custo[rota[i], rota[i+1]]
    end
    return custo_total
end


function pipeline_glpk(execucao, json_path)
    algoritmo = "GLPK"
    tempo_inicio = time()
    matriz_custo, pontos = carregar_dados(json_path)
    n = size(matriz_custo, 1)
    rota_inicial = vcat(1:n, 1)
    #custo_inicial = calc_custo_inicial(rota_inicial, matriz_custo)
    #println("Custo inicial da rota: ", custo_inicial)
    x = glpk_tsp(matriz_custo)
    rota = extrair_rota(x)
    println("Rota encontrada:")
    println(rota)
    custo_total = calc_custo_total(rota, matriz_custo)
    println("Custo final da rota: ", custo_total)
    tempo_fim = time()
    tempo_execucao = tempo_fim - tempo_inicio
    println("Tempo de execução: ", tempo_execucao, " segundos")
    salvar_resultados(
        execucao,
        "resultados.csv",
        json_path,
        algoritmo,
        rota,
        custo_inicial,
        custo_total,
        tempo_execucao
    )
    println("Resultados salvos em resultados.csv")
    return rota, pontos
end

function pipeline_SCIP(execucao, json_path)
    algoritmo = "SCIP"
    tempo_inicio = time()
    matriz_custo, pontos = carregar_dados(json_path)
    n = size(matriz_custo, 1)
    rota_inicial = vcat(1:n, 1)
    #custo_inicial = calc_custo_inicial(rota_inicial, matriz_custo)
    #println("Custo inicial da rota: ", custo_inicial)
    x = scip_tsp(matriz_custo)
    rota = extrair_rota(x)
    println("Rota encontrada:")
    println(rota)
    custo_total = calc_custo_total(rota, matriz_custo)
    println("Custo final da rota: ", custo_total)
    tempo_fim = time()
    tempo_execucao = tempo_fim - tempo_inicio
    println("Tempo de execução: ", tempo_execucao, " segundos")
    salvar_resultados(
        execucao,
        "resultados.csv",
        json_path,
        algoritmo,
        rota,
        custo_total,
        tempo_execucao
    )
    println("Resultados salvos em resultados.csv")
    return rota, pontos
end

function pipeline_Cbc(execucao, json_path)
    algoritmo = "Cbc"
    tempo_inicio = time()
    matriz_custo, pontos = carregar_dados(json_path)
    n = size(matriz_custo, 1)
    rota_inicial = vcat(1:n, 1)
    #custo_inicial = calc_custo_inicial(rota_inicial, matriz_custo)
    #println("Custo inicial da rota: ", custo_inicial)
    x = cbc_tsp(matriz_custo)
    rota = extrair_rota(x)
    println("Rota encontrada:")
    println(rota)
    custo_total = calc_custo_total(rota, matriz_custo)
    println("Custo final da rota: ", custo_total)
    tempo_fim = time()
    tempo_execucao = tempo_fim - tempo_inicio
    println("Tempo de execução: ", tempo_execucao, " segundos")
    salvar_resultados(
        execucao,
        "resultados.csv",
        json_path,
        algoritmo,
        rota,
        custo_total,
        tempo_execucao
    )
    println("Resultados salvos em resultados.csv")
    return rota, pontos
end

function pipeline_highs(execucao, json_path)
    algoritmo = "HiGHS"
    tempo_inicio = time()
    matriz_custo, pontos = carregar_dados(json_path)

    n = size(matriz_custo, 1)
    rota_inicial = vcat(1:n, 1)
    #custo_inicial = calc_custo_inicial(rota_inicial, matriz_custo)
    #println("Custo inicial da rota: ", custo_inicial)
    x = highs_tsp(matriz_custo)
    rota = extrair_rota(x)
    println("Rota encontrada:")
    println(rota)
    custo_total = calc_custo_total(rota, matriz_custo)
    println("Custo final da rota: ", custo_total)
    tempo_fim = time()
    tempo_execucao = tempo_fim - tempo_inicio
    println("Tempo de execução: ", tempo_execucao, " segundos")
    salvar_resultados(
        execucao,
        "resultados.csv",
        json_path,
        algoritmo,
        rota,
        custo_total,
        tempo_execucao
    )
    println("Resultados salvos em resultados.csv")
    return rota, pontos
end

function salvar_resultados(execucao, csv_path, json_path, algoritmo, rota, custo_final, tempo_execucao)
    arquivo = replace(json_path, "Custos_originais/" => "")
    df = DataFrame(
        execucao = execucao,
        arquivo = arquivo,
        algoritmo = algoritmo,
        rota = join(rota, ","),
        custo_final = round(custo_final, digits=3),
        tempo_execucao = round(tempo_execucao, digits=3)
    )

    if isfile(csv_path)
        CSV.write(csv_path, df; append=true, writeheader=false, newline="\n")
    else
        CSV.write(csv_path, df)
    end
end

function salvar_rota_geo_csv(json_entrada, rota, pontos)
    nomes = String[]
    latitudes = Float64[]
    longitudes = Float64[]
    for idx in rota
        p = pontos[idx]  # Julia já usa 1-based → funciona direto

        push!(nomes, p["nome"])
        push!(latitudes, parse(Float64, p["latitude"]))
        push!(longitudes, parse(Float64, p["longitude"]))
    end
    df = DataFrame(
        nome = nomes,
        latitude = latitudes,
        longitude = longitudes
    )
    csv_path = replace(json_entrada, ".json" => "")
    csv_path = replace(csv_path, "Custos_originais/" => "")
    csv_path = ("RotaOtimizadaCSV/" * csv_path * ".csv")
    mkpath(dirname(csv_path))
    CSV.write(csv_path, df)
    println("CSV da rota salvo em: ", csv_path)
end

function salvar_rota_geo_csv_saida(csv_saida, rota, pontos)
    nomes = String[]
    latitudes = Float64[]
    longitudes = Float64[]

    for idx in rota
        p = pontos[idx]
        push!(nomes, p["nome"])
        push!(latitudes, parse(Float64, p["latitude"]))
        push!(longitudes, parse(Float64, p["longitude"]))
    end

    df = DataFrame(
        nome = nomes,
        latitude = latitudes,
        longitude = longitudes
    )
    mkpath(dirname(csv_saida))
    CSV.write(csv_saida, df)
    return csv_saida
end

function salvar_rota_geo_json(path, json_entrada,rota,pontos)
    dados=JSON.parsefile(json_entrada)
    rota_geo=Vector{Dict{String,String}}()
    for idx in rota
        p=pontos[idx]
        push!(rota_geo,Dict("nome"=>p["nome"],"latitude"=>p["latitude"],"longitude"=>p["longitude"]))
    end
    dados["rota_otimizada"]=rota_geo
    nova_string=replace(json_entrada,".json"=>"")
    nova_string=replace(nova_string,"Custos_originais/"=>"")
    json_saida="RotaOtimizadaJSON/"*nova_string*".json"
    mkpath(dirname(json_saida))
    open(json_saida,"w") do f
        JSON.print(f,dados,4)
    end
    println("JSON com rota salvo em: ",json_saida)
end

function criar_arquivo(csv_path)
    df = DataFrame(
        execucao = Int[],
        nomearquivo = String[],
        algoritmo = String[],
        rota = String[],
        custo_final = Float64[],
        tempo_execucao = Float64[]
    )
    CSV.write(csv_path, df)
end

function resolver_rota(json_path; csv_saida="", algoritmo="Cbc")
    matriz_custo, pontos = carregar_dados(json_path)

    algoritmo_normalizado = lowercase(String(algoritmo))
    if algoritmo_normalizado == "cpc" || algoritmo_normalizado == "cbc"
        algoritmo = "Cbc"
    elseif algoritmo_normalizado == "highs"
        algoritmo = "HiGHS"
    elseif algoritmo_normalizado == "scip"
        algoritmo = "SCIP"
    end

    if algoritmo == "Cbc"
        x = cbc_tsp(matriz_custo)
    elseif algoritmo == "GLPK"
        x = glpk_tsp(matriz_custo)
    elseif algoritmo == "HiGHS"
        x = highs_tsp(matriz_custo)
    elseif algoritmo == "SCIP"
        x = scip_tsp(matriz_custo)
    else
        error("Algoritmo não suportado: $algoritmo")
    end

    rota = extrair_rota(x)
    custo_total = calc_custo_total(rota, matriz_custo)

    if isempty(csv_saida)
        base = replace(basename(json_path), ".json" => "")
        csv_saida = joinpath(pwd(), "saida", "$base-rota.csv")
    end

    salvar_rota_geo_csv_saida(csv_saida, rota, pontos)

    return rota, custo_total, csv_saida
end

function executar_cli()
    if length(ARGS) < 1
        println("Uso: julia main.jl <entrada.json> [saida.csv] [algoritmo]")
        return
    end

    json_path = ARGS[1]
    csv_saida = length(ARGS) >= 2 ? ARGS[2] : ""
    algoritmo = length(ARGS) >= 3 ? ARGS[3] : "Cbc"
    algoritmo_saida = lowercase(String(algoritmo)) == "cpc" || lowercase(String(algoritmo)) == "cbc" ? "Cbc" :
        lowercase(String(algoritmo)) == "highs" ? "HiGHS" :
        lowercase(String(algoritmo)) == "scip" ? "SCIP" : algoritmo

    rota, custo_total, csv_gerado = resolver_rota(json_path; csv_saida=csv_saida, algoritmo=algoritmo)
    println(JSON.json(Dict(
        "algoritmo" => algoritmo_saida,
        "rota" => rota,
        "custo_total" => custo_total,
        "csv_path" => csv_gerado
    )))
end

if abspath(PROGRAM_FILE) == @__FILE__
    executar_cli()
end



