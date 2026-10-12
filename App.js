(() => {
  const $ = id => document.getElementById(id);
  const fmt = (n, max = 2) => Number(n).toLocaleString('en-US', { maximumFractionDigits: max });
  const money = n => {
    if (n === null || n === undefined) return '--';
    if (n < 0.0001) return '$' + Number(n).toFixed(8);
    if (n < 0.01) return '$' + Number(n).toFixed(6);
    if (n < 1) return '$' + Number(n).toFixed(4);
    return '$' + fmt(n, 2);
  };
  const bigMoney = n => {
    if (n >= 1e12) return '$' + fmt(n / 1e12, 2) + 'T';
    if (n >= 1e9) return '$' + fmt(n / 1e9, 2) + 'B';
    if (n >= 1e6) return '$' + fmt(n / 1e6, 2) + 'M';
    return money(n);
  };

  let coins = [];
  let oldPrices = {};
  let toastTimer, refreshTimer;
  let currentRange = 7;

  const DEFAULT_SETTINGS = { dark: true, notify: true, notifyPercent: 3, refreshInterval: 60 };
  const settings = {
    load() { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('crypto_settings') || '{}') }; } catch { return { ...DEFAULT_SETTINGS }; } },
    save(s) { localStorage.setItem('crypto_settings', JSON.stringify(s)); }
  };
  let currentSettings = settings.load();

  const favorites = {
    load() { try { return JSON.parse(localStorage.getItem('crypto_favs') || '[]'); } catch { return []; } },
    save(list) { localStorage.setItem('crypto_favs', JSON.stringify(list)); },
    has(s) { return this.load().includes(s); },
    toggle(s) { const l = this.load(); const i = l.indexOf(s); if (i >= 0) l.splice(i, 1); else l.push(s); this.save(l); return i < 0; }
  };

  function notify(msg, error = false) {
    const t = $('toast');
    t.textContent = msg;
    t.style.borderColor = error ? 'var(--red)' : 'var(--green)';
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.hidden = true, 3500);
  }

  async function loadPrices() {
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h';
    try {
      $('status').textContent = '⏳ جاري الاتصال بـ CoinGecko...';
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      const newCoins = data.map(c => ({
        id: c.id, symbol: c.symbol.toUpperCase(), name: c.name,
        price: c.current_price || 0,
        change: c.price_change_percentage_24h || 0,
        cap: c.market_cap || 0, volume: c.total_volume || 0,
        high: c.high_24h || 0, low: c.low_24h || 0,
        image: c.image
      }));

      if (currentSettings.notify && Object.keys(oldPrices).length > 0) {
        newCoins.forEach(c => {
          const old = oldPrices[c.symbol];
          if (old && old > 0) {
            const diff = Math.abs((c.price - old) / old) * 100;
            if (diff >= currentSettings.notifyPercent) {
              notify(`${c.price > old ? '📈' : '📉'} ${c.symbol}: ${fmt(diff, 2)}%`);
            }
          }
        });
      }

      newCoins.forEach(c => { oldPrices[c.symbol] = c.price; });
      coins = newCoins;
      $('status').textContent = `✅ ${coins.length} عملة — آخر تحديث: ` + new Date().toLocaleTimeString('ar-EG');
      render();
      populateConverter();
      populateCompare();
    } catch (e) {
      console.error(e);
      $('status').innerHTML = '❌ تعذر الاتصال بـ CoinGecko.';
      notify('فشل تحميل الأسعار', true);
    }
  }

  function renderCards() {
    const root = $('price-cards');
    root.innerHTML = '';
    const favs = favorites.load();
    const sorted = [...coins].sort((a, b) => (favs.includes(b.symbol) ? 1 : 0) - (favs.includes(a.symbol) ? 1 : 0));
    sorted.slice(0, 8).forEach(c => {
      const card = document.createElement('div');
      card.className = 'panel p-4 cursor-pointer';
      const isFav = favorites.has(c.symbol);
      card.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <img src="${c.image}" class="w-7 h-7 rounded-full">
            <strong>${c.symbol}</strong>
          </div>
          <button class="fav-btn" data-sym="${c.symbol}">${isFav ? '⭐' : '☆'}</button>
        </div>
        <div class="font-bold text-lg" dir="ltr">${money(c.price)}</div>
        <div class="${c.change >= 0 ? 'up' : 'down'} text-sm mt-1">${c.change >= 0 ? '+' : ''}${fmt(c.change, 2)}%</div>
        <div class="muted text-xs mt-1">${c.name}</div>
      `;
      card.querySelector('.fav-btn').addEventListener('click', e => { e.stopPropagation(); favorites.toggle(c.symbol); render(); });
      card.addEventListener('click', () => openDetail(c));
      root.append(card);
    });
  }

  function renderTable() {
    const q = ($('search').value || '').trim().toLowerCase();
    const filter = $('filter').value;
    const favs = favorites.load();
    const filtered = coins.filter(c => {
      if (q && !c.symbol.toLowerCase().includes(q) && !c.name.toLowerCase().includes(q)) return false;
      if (filter === 'fav' && !favs.includes(c.symbol)) return false;
      if (filter === 'up' && c.change < 0) return false;
      if (filter === 'down' && c.change >= 0) return false;
      return true;
    });
    const tbody = $('rows');
    tbody.innerHTML = '';
    if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-center muted py-5">لا توجد نتائج</td></tr>'; return; }
    filtered.forEach((c, i) => {
      const isFav = favs.includes(c.symbol);
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.innerHTML = `
        <td><button class="fav-btn" data-sym="${c.symbol}">${isFav ? '⭐' : '☆'}</button></td>
        <td class="muted">${i + 1}</td>
        <td><div class="flex items-center gap-2"><img src="${c.image}" class="w-6 h-6 rounded-full"><div><div class="font-bold">${c.symbol}</div><div class="muted text-xs">${c.name}</div></div></div></td>
        <td dir="ltr">${money(c.price)}</td>
        <td class="${c.change >= 0 ? 'up' : 'down'}">${c.change >= 0 ? '+' : ''}${fmt(c.change, 2)}%</td>
        <td dir="ltr">${bigMoney(c.cap)}</td>
      `;
      tr.querySelector('.fav-btn').addEventListener('click', e => { e.stopPropagation(); favorites.toggle(c.symbol); render(); });
      tr.addEventListener('click', () => openDetail(c));
      tbody.append(tr);
    });
  }

  function render() { renderCards(); renderTable(); }

  async function openDetail(c) {
    $('detail-img').src = c.image;
    $('detail-name').textContent = c.name;
    $('detail-symbol').textContent = c.symbol;
    $('detail-price').textContent = money(c.price);
    $('detail-change').innerHTML = `<span class="${c.change >= 0 ? 'up' : 'down'}">${c.change >= 0 ? '+' : ''}${fmt(c.change, 2)}%</span>`;
    $('detail-cap').textContent = bigMoney(c.cap);
    $('detail-vol').textContent = bigMoney(c.volume);
    $('detail-high').textContent = money(c.high);
    $('detail-low').textContent = money(c.low);
    $('detail-modal').hidden = false;
    $('chart-days').innerHTML = '';
    [1, 7, 30, 90].forEach(d => {
      const b = document.createElement('button');
      b.className = d === currentRange ? 'primary' : 'secondary';
      b.textContent = d + ' يوم'; b.style.padding = '6px 12px';
      b.addEventListener('click', () => { currentRange = d; document.querySelectorAll('#chart-days button').forEach((x, idx) => { x.className = [1, 7, 30, 90][idx] === d ? 'primary' : 'secondary'; x.style.padding = '6px 12px'; }); loadChart(c.id, d); });
      $('chart-days').append(b);
    });
    loadChart(c.id, currentRange);
  }

  async function loadChart(id, days) {
    $('chart-line').setAttribute('points', '');
    $('chart-area').setAttribute('d', '');
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`);
      const data = await res.json();
      drawChart(data.prices.map(p => p[1]));
    } catch (e) { notify('تعذر تحميل الرسم', true); }
  }

  function drawChart(prices) {
    if (!prices.length) return;
    const w = 800, h = 220, pad = 10;
    const min = Math.min(...prices), max = Math.max(...prices);
    const range = max - min || 1;
    const step = w / (prices.length - 1);
    const points = prices.map((p, i) => [i * step, pad + (1 - (p - min) / range) * (h - 2 * pad)]);
    const lineStr = points.map(p => `${p[0]},${p[1]}`).join(' ');
    const areaStr = `M${points[0][0]},${h} L${lineStr} L${points[points.length - 1][0]},${h} Z`;
    $('chart-line').setAttribute('points', lineStr);
    $('chart-area').setAttribute('d', areaStr);
  }

  $('close-detail').addEventListener('click', () => $('detail-modal').hidden = true);
  $('detail-modal').addEventListener('click', e => { if (e.target.id === 'detail-modal') $('detail-modal').hidden = true; });

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      $(tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'tab-news' && !$('news-list').dataset.loaded) loadNews();
    });
  });

  function populateConverter() {
    const from = $('conv-from'), to = $('conv-to');
    if (!from || !to) return;
    const fromVal = from.value, toVal = to.value;
    from.innerHTML = to.innerHTML = '';
    coins.slice(0, 30).forEach(c => {
      const o1 = document.createElement('option'); o1.value = c.symbol; o1.textContent = `${c.symbol} — ${c.name}`;
      const o2 = o1.cloneNode(true);
      from.append(o1); to.append(o2);
    });
    if (fromVal) from.value = fromVal;
    if (toVal) to.value = toVal; else to.value = 'USDT';
    convert();
  }

  function convert() {
    if (!coins.length) return;
    const a = coins.find(c => c.symbol === $('conv-from').value);
    const b = coins.find(c => c.symbol === $('conv-to').value);
    if (!a || !b) return;
    const amt = Number($('conv-amount').value) || 0;
    const result = (amt * a.price) / b.price;
    $('conv-value').textContent = `${fmt(result, 8)} ${b.symbol}`;
    $('conv-rate').textContent = `1 ${a.symbol} = ${fmt(a.price / b.price, 8)} ${b.symbol}`;
  }

  $('conv-from')?.addEventListener('change', convert);
  $('conv-to')?.addEventListener('change', convert);
  $('conv-amount')?.addEventListener('input', convert);
  $('swap-conv')?.addEventListener('click', () => { const a = $('conv-from').value; $('conv-from').value = $('conv-to').value; $('conv-to').value = a; convert(); });

  function populateCompare() {
    const a = $('cmp-a'), b = $('cmp-b');
    if (!a || !b) return;
    a.innerHTML = b.innerHTML = '';
    coins.slice(0, 30).forEach(c => {
      const o = document.createElement('option'); o.value = c.symbol; o.textContent = `${c.symbol} — ${c.name}`;
      a.append(o); b.append(o.cloneNode(true));
    });
    a.value = 'BTC'; b.value = 'ETH';
  }

  $('cmp-btn')?.addEventListener('click', () => {
    const a = coins.find(c => c.symbol === $('cmp-a').value);
    const b = coins.find(c => c.symbol === $('cmp-b').value);
    if (!a || !b) return;
    $('cmp-result').innerHTML = `
      <div class="grid grid-cols-2 gap-4">
        <div class="panel p-4">
          <div class="flex items-center gap-2 mb-2"><img src="${a.image}" class="w-6 h-6 rounded-full"><strong>${a.symbol}</strong></div>
          <div class="font-bold text-xl" dir="ltr">${money(a.price)}</div>
          <div class="${a.change >= 0 ? 'up' : 'down'}">${a.change >= 0 ? '+' : ''}${fmt(a.change, 2)}%</div>
        </div>
        <div class="panel p-4">
          <div class="flex items-center gap-2 mb-2"><img src="${b.image}" class="w-6 h-6 rounded-full"><strong>${b.symbol}</strong></div>
          <div class="font-bold text-xl" dir="ltr">${money(b.price)}</div>
          <div class="${b.change >= 0 ? 'up' : 'down'}">${b.change >= 0 ? '+' : ''}${fmt(b.change, 2)}%</div>
        </div>
      </div>
      <div class="mt-4 p-4 rounded-xl text-center" style="background:var(--surface2)">
        <div class="font-bold text-lg" dir="ltr">1 ${a.symbol} = ${fmt(a.price / b.price, 6)} ${b.symbol}</div>
      </div>
    `;
  });

  async function loadNews() {
    const list = $('news-list');
    list.innerHTML = '<div class="loading">⏳ جاري تحميل الأخبار...</div>';
    list.dataset.loaded = '1';
    try {
      const proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent('https://www.coindesk.com/arc/outboundfeeds/rss/');
      const res = await fetch(proxyUrl);
      const json = await res.json();
      const xml = new DOMParser().parseFromString(json.contents, 'text/xml');
      const items = Array.from(xml.querySelectorAll('item')).slice(0, 15);
      list.innerHTML = '';
      items.forEach(item => {
        const title = item.querySelector('title')?.textContent || '';
        const link = item.querySelector('link')?.textContent || '';
        const pubDate = item.querySelector('pubDate')?.textContent || '';
        const div = document.createElement('div');
        div.className = 'news-item';
        div.innerHTML = `<div class="news-title">${title}</div><div class="news-meta">${new Date(pubDate).toLocaleString('ar-EG')}</div>`;
        div.addEventListener('click', () => window.open(link, '_blank'));
        list.append(div);
      });
    } catch (e) { list.innerHTML = '<div class="loading">❌ تعذر تحميل الأخبار.</div>'; }
  }

  $('news-refresh')?.addEventListener('click', () => { $('news-list').dataset.loaded = ''; loadNews(); });

  function applySettings() {
    document.body.classList.toggle('light', !currentSettings.dark);
    $('theme-toggle')?.classList.toggle('on', currentSettings.dark);
    $('notif-toggle')?.classList.toggle('on', currentSettings.notify);
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadPrices, currentSettings.refreshInterval * 1000);
  }

  $('settings-btn')?.addEventListener('click', () => { $('settings-panel').hidden = !$('settings-panel').hidden; });
  $('theme-toggle')?.addEventListener('click', () => { currentSettings.dark = !currentSettings.dark; settings.save(currentSettings); applySettings(); });
  $('notif-toggle')?.addEventListener('click', () => { currentSettings.notify = !currentSettings.notify; settings.save(currentSettings); applySettings(); });

  $('refresh-btn')?.addEventListener('click', loadPrices);
  $('search')?.addEventListener('input', renderTable);
  $('filter')?.addEventListener('change', renderTable);

  applySettings();
  loadPrices();
})();