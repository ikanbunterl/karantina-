// ==================== GLOBAL VARIABLES ====================
let gameState = {
  plates: 3,
  collection: [],
  stats: { totalSpins: 0, totalConsumed: 0, platesEarned: 0, freeSpins: 5, lastFreeSpin: Date.now() },
  pendingItem: null,
  unlockedAchievements: [],
  activeBuffs: { doubleLuckSpins: 0, infinitePlatesUntil: 0 },
  cosmetics: { background: "clouds", liveBackground: null },
  purchasedBackgrounds: [],
  settings: { volume: 0.8, darkMode: false, powerSaving: false },
  upgrades: { owned: [], consumables: {}, currentLuckBonus: 0, doublePlateChance: 0 }
};
let config = {};
let allFoods = [];
let inventoryItemForModal = null;
let bgmUnlocked = false;
let saveTimeout = null;
let currentSearch = { collection: '', inventory: '' };
let currentFilter = { collection: 'all', inventory: 'all' };
const rarityWeightsMap = { common: '0%', rare: '0%', epic: '0%', legendary: '0%' };
let totalRarityWeight = 0;
let spinInterval = null;
let isSpinning = false;

// Fallback data (jika fetch gagal)
const FALLBACK_CONFIG = {
  gameName: "8-Bit Food RNG",
  spinCost: 1,
  freeSpinInterval: 3600000,
  freeSpinMax: 5,
  rarityWeights: { common: 60, rare: 25, epic: 12, legendary: 3 },
  plateReward: { consume: 1, bonus: { streak: 5, collection: 10 } },
  achievements: { firstSpin: "Spin pertama!", collector10: "Kolektor 10 item", collector50: "Kolektor 50 item" },
  shopBackgrounds: [],
  liveBackgrounds: [],
  credits: [],
  updateLog: [],
  upgrades: []
};
const FALLBACK_FOODS = [
  {id:1, name: "Omlet", rarity: "common", image: "", emoji: "🍳", description: "Telur dadar lezat"},
  {id:2, name: "Burger", rarity: "legendary", image: "", emoji: "🍔", description: "Burger spesial"},
  {id:3, name: "Pizza", rarity: "rare", image: "", emoji: "🍕", description: "Pizza Italia"},
  {id:4, name: "Sushi", rarity: "epic", image: "", emoji: "🍣", description: "Sushi Jepang"},
  {id:5, name: "Pudding", rarity: "common", image: "", emoji: "🍮", description: "Puding manis"}
];

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    let configRes, itemsRes;
    
    // Load config.json
    try {
      configRes = await fetch('config.json');
      if (!configRes.ok) throw new Error(`HTTP ${configRes.status}`);
      config = await configRes.json();
    } catch (e) {
      console.warn("Gagal load config.json, pakai fallback", e);
      config = { ...FALLBACK_CONFIG };
    }
    
    // Load items.json
    try {
      itemsRes = await fetch('items.json');
      if (!itemsRes.ok) throw new Error(`HTTP ${itemsRes.status}`);
      const itemsData = await itemsRes.json();
      allFoods = Array.isArray(itemsData.foods) ? itemsData.foods : (itemsData["foods"] || []);
    } catch (e) {
      console.warn("Gagal load items.json, pakai fallback foods", e);
      allFoods = [...FALLBACK_FOODS];
    }
    
    if (allFoods.length === 0) allFoods = [...FALLBACK_FOODS];
    
    // Hitung rarity chance untuk tooltip
    totalRarityWeight = Object.values(config.rarityWeights).reduce((a, b) => a + b, 0);
    for (const [key, val] of Object.entries(config.rarityWeights)) {
      const cleanKey = key.trim();
      rarityWeightsMap[cleanKey] = ((val / totalRarityWeight) * 100).toFixed(1) + '%';
    }
    
    loadSave();
    validateGameState();
    applySettingsUI();
    applyBackground();
    applyLiveBackground();
    updateUI();
    renderItemList('collectionGrid', 'collection');
    renderItemList('inventoryGrid', 'inventory');
    renderShop();
    renderCreatorTab();
    renderUpdateLog();
    renderUpgradesTab();
    setupEvents();
    setupLazyLoader();
    
    setInterval(checkFreeSpin, 60000);
    setInterval(checkBuffs, 1000);
    checkFreeSpin();
    checkBuffs();
    
    // Unlock BGM pada interaksi pertama (ignore 404)
    document.addEventListener('click', () => {
      if (!bgmUnlocked) {
        const bgm = document.getElementById('bgm');
        if (bgm) {
          bgm.volume = gameState.settings.volume;
          bgm.play().catch(() => {});
        }
        bgmUnlocked = true;
      }
    }, { once: true });
    
  } catch (e) {
    console.error("Init error:", e);
    showNotif("⚠️ Gagal load data. Gunakan fallback.", "error");
    if (allFoods.length === 0) allFoods = [...FALLBACK_FOODS];
    if (!config.rarityWeights) config = { ...FALLBACK_CONFIG };
  }
});

// ==================== UTILITIES ====================
function toggleSidebar() { document.body.classList.toggle('sidebar-open'); }

function loadSave() {
  const saved = localStorage.getItem('foodRNGSave');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      Object.keys(parsed).forEach(k => { if (gameState[k] !== undefined) gameState[k] = parsed[k]; });
      if (!gameState.purchasedBackgrounds) gameState.purchasedBackgrounds = [];
      if (!gameState.settings) gameState.settings = { volume: 0.8, darkMode: false, powerSaving: false };
      if (!gameState.upgrades) gameState.upgrades = { owned: [], consumables: {}, currentLuckBonus: 0, doublePlateChance: 0 };
    } catch (e) { console.error("Save error", e); }
  }
}

function validateGameState() {
  if (!Array.isArray(gameState.collection)) gameState.collection = [];
  if (!Array.isArray(gameState.unlockedAchievements)) gameState.unlockedAchievements = [];
  if (!Array.isArray(gameState.purchasedBackgrounds)) gameState.purchasedBackgrounds = [];
  if (typeof gameState.stats !== 'object') gameState.stats = {};
  if (typeof gameState.activeBuffs !== 'object') gameState.activeBuffs = {};
  if (typeof gameState.cosmetics !== 'object') gameState.cosmetics = {};
  if (typeof gameState.settings !== 'object') gameState.settings = {};
  // Validate upgrades
  if (!gameState.upgrades) gameState.upgrades = { owned: [], consumables: {}, currentLuckBonus: 0, doublePlateChance: 0 };
  if (!Array.isArray(gameState.upgrades.owned)) gameState.upgrades.owned = [];
  if (typeof gameState.upgrades.consumables !== 'object') gameState.upgrades.consumables = {};
  if (typeof gameState.upgrades.currentLuckBonus !== 'number') gameState.upgrades.currentLuckBonus = 0;
  if (typeof gameState.upgrades.doublePlateChance !== 'number') gameState.upgrades.doublePlateChance = 0;
}

function scheduleSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    localStorage.setItem('foodRNGSave', JSON.stringify(gameState));
    updateUI();
    showSaveIndicator();
  }, 500);
}

function showSaveIndicator() {
  const el = document.getElementById('saveIndicator');
  if (el) { el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 1000); }
}

function saveGame() { localStorage.setItem('foodRNGSave', JSON.stringify(gameState)); updateUI(); }

function setupEvents() {
  // Tombol spin & free spin
  document.getElementById('spinBtn')?.addEventListener('click', doSpin);
  document.getElementById('freeSpinBtn')?.addEventListener('click', doFreeSpin);
  document.getElementById('closeModal')?.addEventListener('click', closeModal);
  document.getElementById('itemModal')?.addEventListener('click', (e) => { if (e.target.id === 'itemModal') closeModal(); });
  
  // TAB UTAMA (Koleksi, Inv, Shop, Dev, Log, Settings, Upgrades)
  document.querySelectorAll('.sidebar-tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Aktifkan tab yang diklik
      document.querySelectorAll('.sidebar-tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      // Tampilkan pane yang sesuai
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const activePaneId = e.target.dataset.tab;
      const activePane = document.getElementById(activePaneId);
      if (activePane) activePane.classList.add('active');
      
      // Jika pane yang aktif adalah collection atau inventory, render ulang grid dengan reset filter
      if (activePaneId === 'collectionTab' || activePaneId === 'inventoryTab') {
        const type = activePaneId === 'collectionTab' ? 'collection' : 'inventory';
        currentFilter[type] = 'all';
        currentSearch[type] = '';
        const searchInput = activePane.querySelector('.search-input');
        if (searchInput) searchInput.value = '';
        const allBtn = activePane.querySelector('.filter-btn[data-rarity="all"]');
        if (allBtn) {
          allBtn.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
          allBtn.classList.add('active');
        }
        const gridId = activePaneId === 'collectionTab' ? 'collectionGrid' : 'inventoryGrid';
        renderItemList(gridId, type);
      }
      // Jika pane upgrades, render ulang
      if (activePaneId === 'upgradesTab') {
        renderUpgradesTab();
      }
    });
  });
  
  // Tombol consume & keep
  document.getElementById('consumeBtn')?.addEventListener('click', handleConsume);
  document.getElementById('keepBtn')?.addEventListener('click', handleKeep);
  
  // Volume slider
  const volSlider = document.getElementById('volumeSlider');
  if (volSlider) {
    volSlider.value = gameState.settings.volume;
    volSlider.addEventListener('input', (e) => {
      gameState.settings.volume = parseFloat(e.target.value);
      applyAudioSettings();
      scheduleSave();
    });
  }
  
  // Dark mode & power saving
  document.getElementById('darkModeToggle')?.addEventListener('click', toggleDarkMode);
  document.getElementById('powerSavingToggle')?.addEventListener('click', togglePowerSaving);
  
  // SEARCH & FILTER untuk Collection dan Inventory
  document.querySelectorAll('.search-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const targetGridId = e.target.dataset.target;
      if (!targetGridId) return;
      const type = targetGridId === 'collectionGrid' ? 'collection' : 'inventory';
      currentSearch[type] = e.target.value.toLowerCase();
      renderItemList(targetGridId, type);
    });
  });
  
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetGridId = e.target.dataset.target;
      if (!targetGridId) return;
      const type = targetGridId === 'collectionGrid' ? 'collection' : 'inventory';
      const parent = e.target.parentElement;
      parent.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter[type] = e.target.dataset.rarity;
      renderItemList(targetGridId, type);
    });
  });
  
  // Tooltip
  document.addEventListener('mouseover', (e) => handleTooltip(e, true));
  document.addEventListener('mouseout', (e) => handleTooltip(e, false));
  document.addEventListener('mousemove', (e) => moveTooltip(e));
  
  // === CLICK OUTSIDE TO CLOSE MENU ===
  setupMenuCloseLogic();
}

// === MENU CLOSE LOGIC ===
function setupMenuCloseLogic() {
  const exemptSelectors = [
    '#spinBtn', '#freeSpinBtn', '.sidebar-toggle', 
    '.sidebar-container', '.sidebar-tab-btn', 
    '.search-input', '.filter-btn', '.item-card',
    '.shop-item', '.upgrade-card', '.modal', '.modal-content',
    '.ctrl-btn', '.action-btn', '#closeModal'
  ];
  
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('sidebar-open')) return;
    const isExempt = exemptSelectors.some(selector => e.target.closest(selector));
    if (!isExempt) {
      document.body.classList.remove('sidebar-open');
    }
  });
  
  document.querySelector('.sidebar-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.body.classList.toggle('sidebar-open');
  });
}

function applySettingsUI() {
  if (gameState.settings.darkMode) document.body.classList.add('dark-mode');
  if (gameState.settings.powerSaving) document.body.classList.add('power-saving');
  const dmBtn = document.getElementById('darkModeToggle');
  const psBtn = document.getElementById('powerSavingToggle');
  if (dmBtn) { dmBtn.textContent = gameState.settings.darkMode ? 'ON' : 'OFF'; dmBtn.classList.toggle('active', gameState.settings.darkMode); }
  if (psBtn) { psBtn.textContent = gameState.settings.powerSaving ? 'ON' : 'OFF'; psBtn.classList.toggle('active', gameState.settings.powerSaving); }
  applyAudioSettings();
}

function toggleDarkMode() {
  gameState.settings.darkMode = !gameState.settings.darkMode;
  document.body.classList.toggle('dark-mode', gameState.settings.darkMode);
  applySettingsUI();
  scheduleSave();
}

function togglePowerSaving() {
  gameState.settings.powerSaving = !gameState.settings.powerSaving;
  document.body.classList.toggle('power-saving', gameState.settings.powerSaving);
  applySettingsUI();
  const video = document.getElementById('liveBgVideo');
  if (video) gameState.settings.powerSaving ? video.pause() : (gameState.cosmetics.liveBackground && video.play().catch(() => {}));
  scheduleSave();
}

function applyAudioSettings() {
  const vol = gameState.settings.volume;
  ['sfx-spin', 'sfx-win', 'bgm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.volume = vol;
  });
}

function playSfx(type) {
  if (gameState.settings.powerSaving) return;
  const sfx = type === 'spin' ? document.getElementById('sfx-spin') : document.getElementById('sfx-win');
  if (sfx) { sfx.currentTime = 0; sfx.play().catch(() => {}); }
}

function applyBackground() {
  const layer = document.querySelector('.bg-layer');
  if (!layer) return;
  if (gameState.cosmetics.liveBackground) { layer.style.backgroundImage = 'none'; return; }
  const bgId = gameState.cosmetics.background || 'clouds';
  const bg = config.shopBackgrounds?.find(b => b.id === bgId);
  layer.style.backgroundImage = bg?.path ? `url('${bg.path}')` : 'url("assets/background/clouds.png")';
}

function applyLiveBackground() {
  const layer = document.querySelector('.live-bg-layer');
  const video = document.getElementById('liveBgVideo');
  const id = gameState.cosmetics.liveBackground;
  if (!id || !config.liveBackgrounds) { layer?.classList.remove('active'); if (video) video.pause(); return; }
  applyBackground();
  const bg = config.liveBackgrounds.find(b => b.id === id);
  if (bg && video) {
    video.src = bg.path;
    video.load();
    if (!gameState.settings.powerSaving) video.play().catch(() => {});
    layer.classList.add('active');
  }
}

function renderShop() {
  const grid = document.getElementById('shopGrid');
  if (!grid) return;
  grid.innerHTML = '';
  if (config.shopBackgrounds && config.shopBackgrounds.length) {
    const header = document.createElement('h3');
    header.className = 'section-title';
    header.textContent = '🖼️ Static BG';
    grid.appendChild(header);
    config.shopBackgrounds.forEach(bg => createShopCard(bg, 'static', grid));
  }
  if (config.liveBackgrounds && config.liveBackgrounds.length) {
    const header = document.createElement('h3');
    header.className = 'section-title';
    header.textContent = '🎬 Live BG';
    grid.appendChild(header);
    config.liveBackgrounds.forEach(bg => createShopCard(bg, 'live', grid));
  }
}

function createShopCard(bg, type, container) {
  const card = document.createElement('div');
  card.className = 'shop-item';
  const isOwned = gameState.purchasedBackgrounds.includes(bg.id);
  const isActive = type === 'static' ? gameState.cosmetics.background === bg.id : gameState.cosmetics.liveBackground === bg.id;
  if (isOwned) card.classList.add('owned');
  if (isActive) card.style.borderColor = '#FF6B6B';
  const nameDiv = document.createElement('div');
  nameDiv.className = 'shop-item-name';
  nameDiv.textContent = bg.name;
  card.appendChild(nameDiv);
  const priceDiv = document.createElement('div');
  priceDiv.className = 'shop-item-price';
  priceDiv.textContent = isActive ? '✓ AKTIF' : (isOwned ? 'PUNYA' : `${bg.price} 🍽️`);
  card.appendChild(priceDiv);
  card.onclick = () => buyBackground(bg, type);
  container.appendChild(card);
}

let tempBgBackup = { static: '', live: '' };
function previewBackground(bg, type, enter) {
  if (gameState.purchasedBackgrounds.includes(bg.id)) return;
  if (enter) {
    tempBgBackup.static = gameState.cosmetics.background;
    tempBgBackup.live = gameState.cosmetics.liveBackground;
    if (type === 'static') gameState.cosmetics.background = bg.id;
    else gameState.cosmetics.liveBackground = bg.id;
    applyBackground();
    applyLiveBackground();
  } else {
    gameState.cosmetics.background = tempBgBackup.static;
    gameState.cosmetics.liveBackground = tempBgBackup.live;
    applyBackground();
    applyLiveBackground();
  }
}

function buyBackground(bg, type) {
  if (gameState.purchasedBackgrounds.includes(bg.id)) {
    if (type === 'static') { gameState.cosmetics.background = bg.id; gameState.cosmetics.liveBackground = null; }
    else { gameState.cosmetics.liveBackground = bg.id; gameState.cosmetics.background = 'clouds'; }
    applyBackground();
    applyLiveBackground();
    showNotif(`✓ ${bg.name} diaktifkan!`, "success");
  } else {
    if (gameState.plates < bg.price) return showNotif("🍽️ Piring kurang!", "error");
    gameState.plates -= bg.price;
    gameState.purchasedBackgrounds.push(bg.id);
    if (type === 'static') { gameState.cosmetics.background = bg.id; gameState.cosmetics.liveBackground = null; applyBackground(); }
    else { gameState.cosmetics.liveBackground = bg.id; gameState.cosmetics.background = 'clouds'; applyBackground(); applyLiveBackground(); }
    showNotif(`💰 Dibeli: ${bg.name}`, "success");
  }
  scheduleSave();
  renderShop();
  updateUI();
}

// === RENDER UPGRADES TAB ===
function renderUpgradesTab() {
  const grid = document.getElementById('upgradesGrid');
  if (!grid || !config.upgrades) return;
  grid.innerHTML = '';
  
  config.upgrades.forEach(upgrade => {
    const isOwned = gameState.upgrades?.owned?.includes(upgrade.id);
    const card = document.createElement('div');
    card.className = `upgrade-card ${upgrade.type} ${isOwned ? 'owned' : ''}`;
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'upgrade-name';
    nameDiv.textContent = upgrade.name;
    
    const descDiv = document.createElement('div');
    descDiv.className = 'upgrade-desc';
    descDiv.textContent = upgrade.description;
    
    const priceDiv = document.createElement('div');
    priceDiv.className = 'upgrade-price';
    priceDiv.textContent = isOwned ? '✓ ACTIVE' : `${upgrade.price} 🍽️`;
    
    card.appendChild(nameDiv);
    card.appendChild(descDiv);
    card.appendChild(priceDiv);
    
    if (!isOwned) {
      card.onclick = () => buyUpgrade(upgrade);
    }
    
    grid.appendChild(card);
  });
}

// === BUY UPGRADE LOGIC ===
function buyUpgrade(upgrade) {
  if (gameState.plates < upgrade.price) {
    return showNotif("🍽️ Piring tidak cukup!", "error");
  }
  
  gameState.plates -= upgrade.price;
  
  if (!gameState.upgrades) gameState.upgrades = { owned: [], consumables: {}, currentLuckBonus: 0, doublePlateChance: 0 };
  if (!gameState.upgrades.owned) gameState.upgrades.owned = [];
  
  if (upgrade.type === 'permanent') {
    if (!gameState.upgrades.owned.includes(upgrade.id)) {
      gameState.upgrades.owned.push(upgrade.id);
      applyUpgradeEffect(upgrade);
      showNotif(`✓ ${upgrade.name} diaktifkan permanen!`, "success");
    }
  } else if (upgrade.type === 'consumable') {
    if (!gameState.upgrades.consumables) gameState.upgrades.consumables = {};
    gameState.upgrades.consumables[upgrade.id] = (gameState.upgrades.consumables[upgrade.id] || 0) + 1;
    applyUpgradeEffect(upgrade);
    showNotif(`✓ ${upgrade.name} digunakan!`, "success");
  }
  
  scheduleSave();
  renderUpgradesTab();
  updateUI();
}

// === APPLY UPGRADE EFFECTS ===
function applyUpgradeEffect(upgrade) {
  if (!upgrade.effect) return;
  
  if (upgrade.effect.luckBonus) {
    gameState.upgrades = gameState.upgrades || {};
    gameState.upgrades.currentLuckBonus = (gameState.upgrades.currentLuckBonus || 0) + upgrade.effect.luckBonus;
  }
  
  if (upgrade.effect.doublePlateChance) {
    gameState.upgrades = gameState.upgrades || {};
    gameState.upgrades.doublePlateChance = (gameState.upgrades.doublePlateChance || 0) + upgrade.effect.doublePlateChance;
  }
  
  if (upgrade.effect.freeSpinReduction) {
    gameState.upgrades = gameState.upgrades || {};
    gameState.upgrades.temporaryFreeSpinReduction = upgrade.effect.freeSpinReduction;
  }
  
  if (upgrade.effect.addDoubleLuck) {
    gameState.activeBuffs.doubleLuckSpins += upgrade.effect.addDoubleLuck;
  }
}

function renderCreatorTab() {
  const list = document.getElementById('creatorList');
  if (!list || !config.credits) return;
  list.innerHTML = '';
  const header = document.createElement('h3');
  header.className = 'section-title';
  header.textContent = 'Credits & Attribution';
  list.appendChild(header);
  config.credits.forEach(c => {
    const card = document.createElement('div');
    card.className = 'creator-card';
    const strong = document.createElement('strong');
    strong.textContent = c.name;
    card.appendChild(strong);
    card.appendChild(document.createElement('br'));
    const link = document.createElement('a');
    link.href = c.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = c.source;
    card.appendChild(link);
    list.appendChild(card);
  });
}

function renderUpdateLog() {
  const list = document.getElementById('updateLogList');
  if (!list || !config.updateLog) return;
  list.innerHTML = '';
  config.updateLog.forEach(log => {
    const container = document.createElement('div');
    container.style.marginBottom = '12px';
    const verDiv = document.createElement('div');
    verDiv.className = 'update-ver';
    verDiv.textContent = `v${log.v}`;
    container.appendChild(verDiv);
    const dateDiv = document.createElement('div');
    dateDiv.className = 'update-date';
    dateDiv.textContent = log.date;
    container.appendChild(dateDiv);
    const ul = document.createElement('ul');
    ul.className = 'update-changes';
    log.changes.forEach(change => {
      const li = document.createElement('li');
      li.textContent = change;
      ul.appendChild(li);
    });
    container.appendChild(ul);
    list.appendChild(container);
  });
}

function doSpin() {
  if (isSpinning) return;
  if (allFoods.length === 0) { showNotif("❌ Data makanan belum siap!", "error"); return; }
  if (gameState.activeBuffs.infinitePlatesUntil <= Date.now() && gameState.plates < 1) { showNotif("🍽️ Piring habis!", "error"); return; }
  if (gameState.activeBuffs.infinitePlatesUntil <= Date.now()) gameState.plates--;
  gameState.stats.totalSpins++;
  playSfx('spin');
  runSpinAnimation();
}

function doFreeSpin() {
  if (isSpinning) return;
  if (allFoods.length === 0) { showNotif("❌ Data makanan belum siap!", "error"); return; }
  if (gameState.stats.freeSpins <= 0) return;
  gameState.stats.freeSpins--;
  gameState.stats.totalSpins++;
  playSfx('spin');
  runSpinAnimation();
}

function runSpinAnimation() {
  const display = document.getElementById('spinDisplay');
  const spinBtn = document.getElementById('spinBtn');
  const freeBtn = document.getElementById('freeSpinBtn');
  if (!display || !spinBtn || !freeBtn) return;
  
  isSpinning = true;
  spinBtn.disabled = true;
  freeBtn.disabled = true;
  display.classList.add('shaking');
  
  let count = 0;
  if (spinInterval) clearInterval(spinInterval);
  spinInterval = setInterval(() => {
    if (allFoods.length === 0) { 
      clearInterval(spinInterval); 
      spinInterval = null; 
      return; 
    }
    const randomFood = allFoods[Math.floor(Math.random() * allFoods.length)];
    displayItem(display, randomFood, false);
    if (++count >= 30) {
      clearInterval(spinInterval);
      spinInterval = null;
      display.classList.remove('shaking');
      finalizeSpin();
    }
  }, 100);
}

function finalizeSpin() {
  if (spinInterval) { 
    clearInterval(spinInterval); 
    spinInterval = null; 
  }
  
  const display = document.getElementById('spinDisplay');
  const hasBuff = gameState.activeBuffs.doubleLuckSpins > 0;
  let rarity = getRarityFromWeights(config.rarityWeights, hasBuff);
  if (hasBuff) gameState.activeBuffs.doubleLuckSpins--;
  let pool = allFoods.filter(f => f.rarity === rarity);
  if (pool.length === 0) pool = [...allFoods];
  if (pool.length === 0) { showNotif("⚠️ Error: tidak ada item", "error"); isSpinning = false; return; }
  
  let result = pool[Math.floor(Math.random() * pool.length)];
  
  // === SHINY CHANCE LOGIC (1%) ===
  const isShiny = Math.random() < 0.01;
  if (isShiny) {
    result = { ...result, isShiny: true };
    showNotif("🌟 SHINY FOUND! ✨", "success");
  }
  
  gameState.pendingItem = result;
  displayItem(display, result, isShiny);
  showModal(result, false);
  playSfx('win');
  
  document.getElementById('spinBtn').disabled = false;
  document.getElementById('freeSpinBtn').disabled = gameState.stats.freeSpins <= 0;
  isSpinning = false;
  
  scheduleSave();
  checkAchievements();
}

function handleConsume() {
  const item = gameState.pendingItem || inventoryItemForModal;
  if (!item) return;
  let reward = (config.plateReward && config.plateReward.consume) || 1;
  let msg = " ";
  
  // Check double plate chance dari upgrade
  const doubleChance = gameState.upgrades?.doublePlateChance || 0;
  const rollDouble = Math.random() < doubleChance;
  if (rollDouble) reward *= 2;
  
  const map = { common: { p: 1 }, rare: { p: 2, m: "⏰ Free Spin +30m " }, epic: { p: 3, m: "🍀 +5 Double Luck " }, legendary: { p: 5, m: "♾️ Inf Plates 30s " } };
  const r = map[item.rarity] || { p: 0 };
  reward += r.p;
  msg = r.m || " ";
  
  if (item.rarity === 'rare') gameState.stats.lastFreeSpin -= 300000;
  else if (item.rarity === 'epic') gameState.activeBuffs.doubleLuckSpins += 5;
  else if (item.rarity === 'legendary') { gameState.activeBuffs.infinitePlatesUntil = Date.now() + 30000; gameState.plates = 999; }
  
  if (inventoryItemForModal) {
    const idx = gameState.collection.findIndex(i => i.id === item.id);
    if (idx > -1) { gameState.collection[idx].count--; if (gameState.collection[idx].count <= 0) gameState.collection.splice(idx, 1); }
    inventoryItemForModal = null;
  } else {
    gameState.pendingItem = null;
  }
  
  gameState.stats.totalConsumed++;
  gameState.stats.platesEarned += reward;
  gameState.plates += reward;
  
  const doubleMsg = rollDouble ? "🎲 DOUBLE PLATES! " : "";
  showNotif(`✓ +${reward} Piring. ${doubleMsg}${msg}`, "success");
  
  closeModal();
  scheduleSave();
  renderItemList('collectionGrid', 'collection');
  renderItemList('inventoryGrid', 'inventory');
}

function handleKeep() {
  const item = gameState.pendingItem;
  if (!item) return;
  const ex = gameState.collection.find(i => i.id === item.id);
  if (ex) ex.count++;
  else gameState.collection.push({ ...item, count: 1, isShiny: item.isShiny });
  gameState.pendingItem = null;
  showNotif("📦 Disimpan!", "success");
  closeModal();
  scheduleSave();
  renderItemList('collectionGrid', 'collection');
  renderItemList('inventoryGrid', 'inventory');
}

function checkAchievements() {
  const s = gameState.stats, c = gameState.unlockedAchievements;
  const achievements = [
    { id: 'firstSpin', check: s.totalSpins >= 1, text: config.achievements?.firstSpin || 'Spin pertama!' },
    { id: 'c10', check: gameState.collection.length >= 10, text: config.achievements?.collector10 || 'Kolektor 10' },
    { id: 'c50', check: gameState.collection.length >= 50, text: config.achievements?.collector50 || 'Kolektor 50' }
  ];
  achievements.forEach(a => { if (a.check && !c.includes(a.id)) { c.push(a.id); showNotif(`🏆 ${a.text}`, "success"); } });
}

function renderItemList(containerId, type) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  grid.innerHTML = '';
  const filterRarity = currentFilter[type] || 'all';
  const searchTerm = currentSearch[type] || '';
  let items = type === 'collection' ? allFoods : gameState.collection.filter(i => i.count > 0);
  if (filterRarity !== 'all') items = items.filter(f => f.rarity === filterRarity);
  if (searchTerm) items = items.filter(f => f.name.toLowerCase().includes(searchTerm));
  items.forEach(food => {
    const owned = gameState.collection.find(i => i.id === food.id);
    const count = owned ? owned.count : 0;
    const card = createCard(food, count, type, owned?.isShiny);
    grid.appendChild(card);
  });
}

function createCard(item, count, type, isShiny) {
  const card = document.createElement('div');
  const locked = type === 'collection' && count === 0;
  card.className = `item-card ${item.rarity} ${locked ? 'locked' : ''} ${isShiny ? 'shiny-card' : ''}`;
  card.dataset.rarity = item.rarity;
  card.dataset.id = item.id;
  
  const img = document.createElement('div');
  img.className = `item-image ${locked ? 'silhouette' : ''}`;
  img.dataset.imgUrl = item.image || '';
  displayItem(img, item, isShiny);
  card.appendChild(img);
  
  const nameDiv = document.createElement('div');
  nameDiv.className = 'item-name';
  nameDiv.textContent = locked ? '???' : (isShiny ? item.name + ' ✨' : item.name);
  card.appendChild(nameDiv);
  
  const countDiv = document.createElement('div');
  countDiv.className = 'item-count';
  countDiv.textContent = locked ? '🔒' : (count ? `x${count}` : '');
  card.appendChild(countDiv);
  
  if (type === 'inventory' && count > 0) { 
    card.style.cursor = 'pointer'; 
    card.onclick = () => showModal(item, true); 
  }
  
  return card;
}

function setupLazyLoader() {
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const url = el.dataset.imgUrl;
        if (url && url !== "") el.style.backgroundImage = `url('${url}')`;
        obs.unobserve(el);
      }
    });
  }, { rootMargin: '50px' });
  const gridMut = new MutationObserver(() => {
    document.querySelectorAll('.item-image[data-img-url]').forEach(el => observer.observe(el));
  });
  document.querySelectorAll('.scroll-grid').forEach(g => gridMut.observe(g, { childList: true }));
}

function displayItem(el, item, isShiny) {
  el.style.backgroundImage = 'none';
  el.textContent = '';
  el.className = 'item-image';
  
  if (isShiny) el.classList.add('shiny-item');
  
  if (item.image && item.image.trim() !== "") {
    el.style.backgroundImage = `url('${item.image}')`;
    el.style.backgroundSize = 'contain';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = 'center';
    el.onerror = () => {
      el.style.backgroundImage = 'none';
      el.textContent = item.emoji || '?';
    };
  } else if (item.emoji) {
    el.textContent = item.emoji;
  } else {
    el.textContent = '?';
  }
}

function handleTooltip(e, show) {
  const card = e.target.closest('.item-card');
  if (!card || card.classList.contains('locked')) return;
  const tooltip = document.getElementById('tooltip');
  if (show) {
    const name = card.querySelector('.item-name')?.textContent || '';
    const rarity = card.dataset.rarity || card.className.split(' ').find(c => ['common', 'rare', 'epic', 'legendary'].includes(c));
    const chance = rarityWeightsMap[rarity] || '0%';
    const buffMap = { rare: '⏰ Free Spin +30m', epic: '🍀 +5 Double Luck', legendary: '♾️ Inf Plates 30s' };
    
    // Check if item is shiny
    const itemId = parseInt(card.dataset.id);
    const owned = gameState.collection.find(i => i.id === itemId);
    const isShiny = owned?.isShiny;
    
    tooltip.className = `tooltip${isShiny ? ' shiny' : ''}`;
    tooltip.innerHTML = `<strong>${name}</strong>${isShiny ? '<br>🌟 SHINY!' : ''}<br>Chance: ${chance}<br>Buff: ${buffMap[rarity] || 'Standar'}`;
    tooltip.classList.add('visible');
  } else { 
    tooltip.classList.remove('visible'); 
  }
}

function moveTooltip(e) {
  const t = document.getElementById('tooltip');
  if (t && t.classList.contains('visible')) { t.style.left = (e.clientX + 15) + 'px'; t.style.top = (e.clientY - 10) + 'px'; }
}

function showModal(item, fromInv) {
  inventoryItemForModal = fromInv ? item : null;
  gameState.pendingItem = fromInv ? null : item;
  const m = document.getElementById('itemModal');
  displayItem(document.getElementById('modalImage'), item, item.isShiny);
  document.getElementById('modalTitle').textContent = item.isShiny ? item.name + ' ✨' : item.name;
  document.getElementById('modalDesc').textContent = item.description;
  const rEl = document.getElementById('modalRarity');
  rEl.textContent = item.rarity.toUpperCase();
  rEl.className = `modal-rarity ${item.rarity}`;
  const rewardMap = { legendary: 5, epic: 3, rare: 2, common: 1 };
  document.getElementById('consumeBtn').textContent = `MAKAN 💾 (+${rewardMap[item.rarity] || 1})`;
  m?.classList.add('active');
}

function closeModal() { 
  document.getElementById('itemModal')?.classList.remove('active'); 
  inventoryItemForModal = null; 
  gameState.pendingItem = null; 
}

function checkFreeSpin() {
  const now = Date.now(), int = config.freeSpinInterval || 3600000;
  if (now - gameState.stats.lastFreeSpin >= int) {
    const amt = Math.floor((now - gameState.stats.lastFreeSpin) / int);
    gameState.stats.freeSpins = Math.min(gameState.stats.freeSpins + amt, config.freeSpinMax || 5);
    gameState.stats.lastFreeSpin = now;
    scheduleSave();
    updateUI();
    showNotif(`⏰ +${amt} Free Spin!`, "success");
  }
}

function checkBuffs() {
  const el = document.getElementById('buffIndicator');
  if (!el) return;
  const now = Date.now();
  let msg = [];
  const pulseEl = document.getElementById('buffIndicator');
  if (gameState.activeBuffs.doubleLuckSpins > 0) { msg.push(`🍀 Luck:${gameState.activeBuffs.doubleLuckSpins}`); pulseEl?.classList.add('buffFlash'); }
  else { pulseEl?.classList.remove('buffFlash'); }
  if (gameState.activeBuffs.infinitePlatesUntil > now) { msg.push(`♾️ Inf:${Math.ceil((gameState.activeBuffs.infinitePlatesUntil - now) / 1000)}s`); pulseEl?.classList.add('buffFlash'); }
  el.textContent = msg.length ? msg.join(' | ') : '⏳ No Buffs';
}

function updateUI() {
  const p = document.getElementById('plateCount');
  if (p) { p.textContent = gameState.plates; p.style.animation = 'none'; setTimeout(() => { p.style.animation = ''; }, 10); }
  const f = document.getElementById('freeSpinBtn');
  if (f) f.textContent = `FREE (${gameState.stats.freeSpins})`;
  const spinBtn = document.getElementById('spinBtn');
  if (spinBtn) spinBtn.textContent = `🎲 SPIN (-${config.spinCost || 1})`;
}

function showNotif(msg, type = 'success') {
  const n = document.createElement('div');
  n.className = `notification ${type}`;
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 300); }, 2000);
}

function getRarityFromWeights(w, buff) {
  let wt = { ...w };
  
  // Apply luck bonus dari upgrades
  const luckBonus = gameState.upgrades?.currentLuckBonus || 0;
  if (luckBonus > 0) {
    wt.legendary = (wt.legendary || 0) * (1 + luckBonus * 2);
    wt.epic = (wt.epic || 0) * (1 + luckBonus);
  }
  
  if (buff && wt.legendary) wt.legendary *= 2;
  
  const tot = Object.values(wt).reduce((a, b) => a + b, 0);
  let r = Math.random() * tot;
  
  for (const [key, val] of Object.entries(wt)) { 
    if (r < val) return key.trim(); 
    r -= val; 
  }
  return 'legendary';
}
