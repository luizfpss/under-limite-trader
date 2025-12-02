/**
 * Popup Script (Versão Storage Direto - Final com Destacar Janela)
 */

let currentData = null;
let referenceTable = [];
let rhythmTable = [];
let tickTable = [];

let gameTimeInterval = null; 
let lastScrapedTime = null; 
let localGameTimeInSeconds = null; 
let currentTargetOdd = null; 
let lastKnownUnderOdd = null; 
let lastOddChangeTimestamp = null; 
let currentMarketRhythm = null;

async function init() {
  // --- NOVO: Lógica do Botão Destacar Janela ---
  const detachBtn = document.getElementById('btn-detach');
  if (detachBtn) {
    detachBtn.addEventListener('click', () => {
      // Cria uma nova janela do tipo 'popup' com este mesmo arquivo HTML
      chrome.windows.create({
        url: chrome.runtime.getURL("popup.html"),
        type: "popup",
        width: 410,  // Largura um pouco maior para garantir scroll
        height: 600
      });
      // Fecha o popup original preso ao navegador
      window.close();
    });
  }
  // ---------------------------------------------

  await loadReferenceTables(); 
  await loadCurrentOdds();
  updateUI();
  
  // Auto-refresh a cada 0.5s
  setInterval(async () => {
    await loadCurrentOdds();
    updateUI();
  }, 500);
}

async function loadReferenceTables() {
  try {
    const resAlvo = await fetch(chrome.runtime.getURL('odds-reference.json'));
    const dataAlvo = await resAlvo.json();
    referenceTable = dataAlvo.reference || [];

    const resRitmo = await fetch(chrome.runtime.getURL('under-limite-ritmo.json'));
    const dataRitmo = await resRitmo.json();
    rhythmTable = dataRitmo.ritmo || [];

    const resTick = await fetch(chrome.runtime.getURL('under-limite-tick.json'));
    const dataTick = await resTick.json();
    tickTable = dataTick.tick || [];

  } catch (error) {
    console.error('Erro tabelas:', error);
  }
}

/**
 * LER DIRETO DO STORAGE
 */
async function loadCurrentOdds() {
  try {
    // Lê direto da memória local (onde o content.js salvou)
    const result = await chrome.storage.local.get('bet365_data');
    
    if (result && result.bet365_data) {
      // Se o dado for muito antigo (mais de 10 segundos), ignora
      if (Date.now() - result.bet365_data.timestamp < 10000) {
        currentData = result.bet365_data;
      } else {
        currentData = null; // Dado velho
      }
    } else {
      currentData = null;
    }
  } catch (error) {
    console.error('Erro storage:', error);
    currentData = null;
  }
}

function updateUI() {
  const el = {
    bet365Odd: document.getElementById('bet365-odd'),
    marketName: document.getElementById('market-name'),
    timeValue: document.getElementById('game-time-value'),
    betfairTarget: document.getElementById('betfair-target'),
    nextGoalSection: document.getElementById('next-goal-section'),
    nextGoalTitle: document.getElementById('next-goal-title'),
    nextGoalHome: document.getElementById('next-goal-home'),
    nextGoalAway: document.getElementById('next-goal-away'),
    oddPerMinute: document.getElementById('odd-per-minute'),
    staleTimer: document.getElementById('odd-stale-timer'),
    rhythmValue: document.getElementById('market-rhythm-value'),
    tickValue: document.getElementById('tick-percent-value'),
    nextTargetOdd: document.getElementById('next-target-odd'),
    addedTimeLabel: document.getElementById('added-time-label') 
  };

  if (!el.bet365Odd) return;

  if (!currentData) { 
    showWaitingState(el);
    return;
  }
  
  updateStatus(true);
  
  // --- Odds ---
  if (currentData.under) {
    el.bet365Odd.textContent = currentData.under.toFixed(2);
    if (el.marketName) el.marketName.textContent = currentData.market || 'Gols';

    if (currentData.under !== lastKnownUnderOdd) {
      lastKnownUnderOdd = currentData.under;
      lastOddChangeTimestamp = Date.now(); 
    }
  }

  // --- Tempo ---
  if (currentData.time) {
    el.timeValue.style.display = 'block';
    if (currentData.time !== lastScrapedTime) {
      lastScrapedTime = currentData.time;
      localGameTimeInSeconds = parseTimeToSeconds(currentData.time);
      el.timeValue.textContent = currentData.time;
      startLocalTimer(); 
    }
  } else {
    el.timeValue.textContent = '--:--';
  }
  
  // --- Betfair Alvo ---
  if (currentData.under) {
    const target = findBetfairTarget(currentData.under);
    if (target) {
      el.betfairTarget.textContent = target.toFixed(2);
      currentTargetOdd = target; 
    } else {
      el.betfairTarget.textContent = '-';
    }
  }

  // --- Próximo Gol (Visualização) ---
  if (el.nextGoalSection) {
      el.nextGoalSection.style.display = 'none'; 
  }

  // --- Cálculos ---
  updatePercentPerMinute(localGameTimeInSeconds, el.oddPerMinute, el.addedTimeLabel); 
  
  // Timer de Odd Parada
  if (el.staleTimer) {
    if (lastOddChangeTimestamp) {
      const diffMs = Date.now() - lastOddChangeTimestamp;
      const diffSeconds = Math.floor(diffMs / 1000);
      el.staleTimer.textContent = `${diffSeconds}s`;
      if (diffSeconds > 60) el.staleTimer.classList.add('warning');
      else el.staleTimer.classList.remove('warning');
    } else {
      el.staleTimer.textContent = '--s';
    }
  }

  // --- Risco e Tick ---
  if (el.rhythmValue && el.tickValue && el.nextTargetOdd) {
    if (currentTargetOdd && localGameTimeInSeconds !== null) {
      const gameMinutes = Math.floor(localGameTimeInSeconds / 60);
      
      currentMarketRhythm = findMarketRhythm(gameMinutes, currentTargetOdd); 
      el.rhythmValue.textContent = currentMarketRhythm;

      const tickData = findTickValue(currentTargetOdd); 
      el.tickValue.textContent = tickData.percent;

      const nextTarget = findNextTargetOdd(gameMinutes, currentMarketRhythm);
      el.nextTargetOdd.textContent = nextTarget;
    } else {
      el.rhythmValue.textContent = '--';
      el.tickValue.textContent = '-- %';
      el.nextTargetOdd.textContent = '--.--';
    }
  }
}

function showWaitingState(el) { 
  updateStatus(false);
  if(el.bet365Odd) el.bet365Odd.textContent = '-';
  if(el.betfairTarget) el.betfairTarget.textContent = '-';
  if(el.timeValue) el.timeValue.textContent = '--:--';
  // Zera o resto...
}

function updateStatus(active) {
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = active ? 'Ativo' : 'Aguardando...';
    statusEl.className = active ? 'status-badge status-active' : 'status-badge status-waiting';
  }
}

// --- Funções Auxiliares (Mesmas de antes) ---
function findBetfairTarget(bet365Under) {
  if (!referenceTable || referenceTable.length === 0) return null;
  let closest = null;
  let minDiff = Infinity;
  for (const entry of referenceTable) {
    const diff = Math.abs(entry.bet365_under - bet365Under);
    if (diff < minDiff) {
      minDiff = diff;
      closest = entry;
    }
  }
  return closest ? closest.betfair_target : null;
}

function findMarketRhythm(gameMinutes, oddToCompare) { 
  if (!rhythmTable.length) return '--';
  const minuteKey = Math.floor(gameMinutes / 5) * 5; 
  const row = rhythmTable.find(entry => entry.min === minuteKey);
  if (!row) return '--'; 
  if (oddToCompare <= row.baixa) return 'BAIXA';
  if (oddToCompare <= row.media) return 'MÉDIA';
  return 'ALTA';
}

function findNextTargetOdd(gameMinutes, currentRhythm) {
  if (!rhythmTable.length || currentRhythm === '--') return '--.--';
  const nextMinuteKey = (Math.floor(gameMinutes / 5) * 5) + 5; 
  const nextRow = rhythmTable.find(entry => entry.min === nextMinuteKey);
  if (!nextRow) return 'Enc.'; 
  if (currentRhythm === 'BAIXA') return nextRow.baixa.toFixed(2);
  if (currentRhythm === 'MÉDIA') return nextRow.media.toFixed(2);
  return nextRow.alta.toFixed(2);
}

function findTickValue(oddToCompare) { 
  if (!tickTable.length) return { percent: '-- %' };
  for (let i = 0; i < tickTable.length; i++) {
    const currentRow = tickTable[i]; 
    const nextRow = tickTable[i + 1]; 
    const lowerBound = nextRow ? nextRow.odd : 0; 
    if (oddToCompare > lowerBound && oddToCompare <= currentRow.odd) {
      return { percent: `${currentRow.percent.toFixed(2)}%` };
    }
  }
  return { percent: `${tickTable[tickTable.length - 1].percent.toFixed(2)}%` };
}

function parseTimeToSeconds(timeString) {
  if (!timeString || !timeString.includes(':')) return null;
  const parts = timeString.split(':');
  return (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
}

function startLocalTimer() {
  if (gameTimeInterval) clearInterval(gameTimeInterval);
  gameTimeInterval = setInterval(() => {
    if (localGameTimeInSeconds !== null) {
      localGameTimeInSeconds++;
      const timeValue = document.getElementById('game-time-value');
      if (timeValue) { 
        const m = Math.floor(localGameTimeInSeconds / 60);
        const s = localGameTimeInSeconds % 60;
        timeValue.textContent = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
      }
      updatePercentPerMinute(localGameTimeInSeconds, null, null); 
    }
  }, 1000); 
}

function updatePercentPerMinute(totalSeconds, oddPerMinElement, addedTimeElement) {
  if (!oddPerMinElement) oddPerMinElement = document.getElementById('odd-per-minute');
  if (!addedTimeElement) addedTimeElement = document.getElementById('added-time-label');
  if (!oddPerMinElement || !addedTimeElement) return; 

  if (!currentTargetOdd || totalSeconds === null) {
    oddPerMinElement.textContent = '--'; 
    addedTimeElement.textContent = '(--m)';
    return;
  }
  const gameMinutes = Math.floor(totalSeconds / 60); 
  let periodEndTime = (gameMinutes < 45) ? 45 : 90;
  let addedTime = (gameMinutes < 45) ? (gameMinutes >= 25 ? 2 : 0) : (gameMinutes >= 70 ? 5 : 3);
  let remainingTime = Math.max(1, (periodEndTime - gameMinutes) + addedTime); 
  
  const profitPercent = (currentTargetOdd - 1) * 100;
  oddPerMinElement.textContent = `${(profitPercent / remainingTime).toFixed(2)}`; 
  addedTimeElement.textContent = addedTime > 0 ? `(+${addedTime}m)` : "(--m)";
}

document.addEventListener('DOMContentLoaded', init);