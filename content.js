(function() {
    // Desenvolvido para capturar odds em tempo real via análise de texto (DOM Text Node)

    if (window.top !== window.self) return;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    function start() {
        // Varredura a cada 1 segundo
        setInterval(scan, 1000);
    }

    function scan() {
        const url = location.href;
        
        // Verifica se é uma página de jogo ao vivo
        // Adicionado /IP/ e /HO/ para compatibilidade com Bet365 Brasil
        const isGamePage = url.includes('/inplay') || 
                           url.includes('/sport/') || 
                           url.includes('/IP/') || 
                           url.includes('/HO/');

        if (!isGamePage) return;

        try {
            const time = findTimeStrategy();
            const underOdd = findUnderOddStrategy();

            // Só atualiza se encontrar uma Odd válida
            if (underOdd > 0) {
                const data = {
                    time: time || "00:00",
                    under: underOdd,
                    market: "Partida - Gols", // Nome padrão
                    timestamp: Date.now()
                };

                // Salva no Storage Local (Comunicação rápida com o Popup)
                chrome.storage.local.set({ 'bet365_data': data });
            }

        } catch (e) {
        }
    }

    // --- ESTRATÉGIA DE CAPTURA (TEXT-BASED) ---
    // Mais robusta contra mudanças de classes CSS da Bet365

    function findUnderOddStrategy() {
        // Varre elementos de texto buscando 'Menos de' ou 'Under'
        const elements = document.querySelectorAll('div, span');
        
        for (let el of elements) {
            const text = el.innerText ? el.innerText.trim().toLowerCase() : "";
            
            if (text === 'menos de' || text === 'under' || text === 'abaixo') {
                
                // Cenário 1: A odd é o "irmão" do texto (Next Sibling)
                let sibling = el.nextElementSibling;
                if (sibling) {
                    let val = extractNumber(sibling.innerText);
                    if (val) return val;
                }

                // Cenário 2: A odd e o texto estão dentro do mesmo pai
                let parent = el.parentElement;
                if (parent) {
                    let val = extractNumber(parent.innerText);
                    if (val) return val;
                }
            }
        }
        return 0;
    }

    function findTimeStrategy() {
        const bodyText = document.body.innerText || "";
        
        // Se for intervalo
        if (bodyText.includes("Intervalo") || bodyText.includes("Half Time")) {
            return "45:00";
        }

        // Busca padrão de tempo (ex: 12:34)
        // O match pega a primeira ocorrência na página, que geralmente é o relógio do jogo
        const timeMatch = bodyText.match(/(\d{1,2}:\d{2})/);
        if (timeMatch) {
            return normalizeTime(timeMatch[0]);
        }
        
        return "00:00";
    }

    // Auxiliar: Extrai número float de string (ex: "2.00" -> 2.00)
    function extractNumber(str) {
        if (!str) return null;
        // Regex para pegar números decimais (ex: 1.50, 10.00)
        const match = str.match(/(\d+\.\d{2})/);
        if (match) {
            const num = parseFloat(match[0]);
            // Filtro de segurança: Odd deve ser lógica (entre 1.01 e 40)
            if (num > 1.01 && num < 40) return num;
        }
        return null;
    }

    // Auxiliar: Formata tempo para mm:ss
    function normalizeTime(t) {
        if (!t.includes(':')) return t;
        let parts = t.split(':');
        return parts[0].padStart(2, '0') + ':' + parts[1].padStart(2, '0');
    }

})();