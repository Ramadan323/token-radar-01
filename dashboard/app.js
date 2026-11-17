// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable and sortable table, a per-protocol detail drawer with the
// model's own inputs and the protocol's farm plan, a live-token view, and the model's calibration.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', source: 'all', tab: 'board', sort: 'implied', dir: -1, selected: null };
  var M = DATA.model;

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function usdFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  // The model in one function: the page recomputes a row from the snapshot figures and the
  // calibration, and checks the number board.json carries, so the page's code and the board's
  // data are visibly the same arithmetic. No name is special-cased anywhere.
  function categoryFactor(cat) {
    if (!cat) return 1;
    for (var i = 0; i < DATA.calibration.categories.length; i++) {
      if (DATA.calibration.categories[i].category === cat) return DATA.calibration.categories[i].factor;
    }
    return 1;
  }
  function chainFactor(chains) {
    return 1 + M.chain_weight * Math.min((chains || []).length, M.chain_cap);
  }
  function impliedOf(row) {
    var growth = Math.min(M.growth_cap, Math.max(M.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * M.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? M.unknown_age_days : row.age_days;
    var maturity = M.maturity_floor + (Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
    var base = row.tvl_usd * M.base_multiple;
    var implied = Math.max(1, Math.round(base * categoryFactor(row.category) * chainFactor(row.chains) * growthMult * maturity));
    return { base: base, category: categoryFactor(row.category), chain: chainFactor(row.chains), growthPct: growth, growth: growthMult, maturity: maturity, implied: implied };
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of the protocol\'s yield asset on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow a small amount against the supply on ' + name + ', then repay it the same week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap a small amount through ' + name + "'s main pool on " + chain + ' and leave the route in your history.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a second, smaller amount back through ' + name + ' so the round trip is on record.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Delegate a second, smaller stake through ' + name + ' and keep both receipts.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedge on ' + name + ' after a few days, then open one fresh position.';
    if (c.indexOf('prediction') >= 0) return 'Settle the first position on ' + name + ', then place one more on a different market.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit a second, smaller amount into another ' + name + ' vault on ' + chain + '.';
    if (c.indexOf('stable') >= 0) return 'Use the minted stable asset once inside ' + name + "'s own app on " + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Reinvest the yield the asset pays into the same position on ' + chain + '.';
    if (c.indexOf('insurance') >= 0) return 'Open a second, smaller cover on ' + name + ' for a different risk.';
    return 'Make one more qualifying action on ' + name + ' on ' + chain + ', such as a swap, a vote or a second deposit.';
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = capital >= 150 ? 8 : 4;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $2 of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, and if no token ever comes, unwind the position and keep the yield.', cost: 'nothing but the log', time: '5 minutes' }
    ];
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // A row is on the watchlist when its slug is in the snapshot's watchlist, which main.ts embeds
  // in data.js; every other row is an early find below the watchlist floor.
  var wlSet = {};
  (DATA.watchlist_slugs || []).forEach(function (s) { wlSet[s] = true; });
  function isWatch(r) { return !!wlSet[r.slug]; }

  // ---------- derived lists ----------
  var categories = [];
  var chains = [];
  DATA.rows.forEach(function (r) {
    if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category);
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  categories.sort();
  chains.sort();
  var totalImplied = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
  var top1 = DATA.rows[0];

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.source === 'watch' && !isWatch(r)) return false;
      if (state.source === 'early' && isWatch(r)) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var av = key === 'name' ? a.name : key === 'tvl' ? a.tvl_usd : key === 'change' ? (a.change_7d === null ? -9999 : a.change_7d) : key === 'age' ? (a.age_days === null ? -1 : a.age_days) : key === 'rank' ? a.rank : a.implied_value_usd;
      var bv = key === 'name' ? b.name : key === 'tvl' ? b.tvl_usd : key === 'change' ? (b.change_7d === null ? -9999 : b.change_7d) : key === 'age' ? (b.age_days === null ? -1 : b.age_days) : key === 'rank' ? b.rank : b.implied_value_usd;
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
    return rows;
  }

  function pctClass(n) { return n === null || n === undefined ? 'flat' : n > 0 ? 'up' : n < 0 ? 'down' : 'flat'; }

  // ---------- header, stats, tabs ----------
  function renderHeader() {
    var header = el('header', { class: 'hero' });
    header.appendChild(el('div', { class: 'eyebrow' }, el('span', { class: 'dot' }), 'Token Radar · ' + DATA.model_version));
    header.appendChild(el('h1', {}, 'The pre-token board ', el('span', { class: 'thin' }, '— what a launch would be worth')));
    header.appendChild(el('p', { class: 'lede' }, 'Every protocol DefiLlama tracks at $5M of TVL or more, ranked by the implied value of a token it has not issued yet. The watchlist is the floor, never the ceiling: the board covers all ', el('b', {}, String(DATA.watchlist_size)), ' watchlist protocols and adds ', el('b', {}, String(DATA.early_size)), ' early finds below the floor.'));
    var badges = el('div', { class: 'badges' });
    badges.appendChild(el('span', { class: 'badge' }, 'Snapshot ', el('b', {}, DATA.as_of)));
    badges.appendChild(el('span', { class: 'badge' }, 'Model ', el('b', {}, DATA.model_version), ' · base × ', el('b', {}, String(M.base_multiple))));
    badges.appendChild(el('span', { class: 'badge' }, 'Market median mcap/TVL ', el('b', { class: 'amber' }, String(DATA.calibration.global_median_multiple))));
    badges.appendChild(el('span', { class: 'badge' }, 'Live protocols calibrated ', el('b', {}, String(DATA.calibration.live_count))));
    header.appendChild(badges);
    return header;
  }

  function renderStats() {
    var wrap = el('div', { class: 'stats' });
    var cards = [
      { label: 'Protocols ranked', value: String(DATA.board_size), sub: DATA.watchlist_size + ' watchlist · ' + DATA.early_size + ' early' },
      { label: 'Top implied value', value: usd(top1 ? top1.implied_value_usd : 0), sub: top1 ? top1.name + ' · rank 1' : '', amber: true },
      { label: 'Board total implied', value: usd(totalImplied), sub: 'sum of all ' + DATA.board_size + ' rows' },
      { label: 'Live tokens shown', value: String(DATA.live_size), sub: 'market value, not a model' }
    ];
    cards.forEach(function (c) {
      var card = el('div', { class: 'stat' });
      card.appendChild(el('div', { class: 'label' }, c.label));
      card.appendChild(el('div', { class: c.amber ? 'value amber' : 'value' }, c.value));
      card.appendChild(el('div', { class: 'sub' }, c.sub));
      wrap.appendChild(card);
    });
    return wrap;
  }

  function renderTabs() {
    var tabs = el('div', { class: 'tabs', role: 'tablist' });
    var defs = [
      { id: 'board', label: 'Pre-token board', count: DATA.board_size },
      { id: 'live', label: 'Live tokens', count: DATA.live_size },
      { id: 'model', label: 'Model', count: null }
    ];
    defs.forEach(function (d) {
      var t = el('button', { class: 'tab', role: 'tab', 'aria-selected': state.tab === d.id ? 'true' : 'false', onclick: function () { state.tab = d.id; state.selected = null; render(); } }, d.label);
      if (d.count !== null) t.appendChild(el('span', { class: 'count' }, String(d.count)));
      tabs.appendChild(t);
    });
    return tabs;
  }

  // ---------- board tab ----------
  function renderControls(rows) {
    var wrap = el('div', { class: 'controls' });
    var search = el('input', { type: 'search', placeholder: 'Search a protocol or slug…', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; renderTableOnly(); });
    wrap.appendChild(search);
    var cat = el('select', { 'aria-label': 'Filter by category' });
    cat.appendChild(el('option', { value: 'all' }, 'All categories'));
    categories.forEach(function (c) { cat.appendChild(el('option', { value: c }, c)); });
    cat.value = state.category;
    cat.addEventListener('change', function () { state.category = cat.value; renderTableOnly(); });
    wrap.appendChild(cat);
    var ch = el('select', { 'aria-label': 'Filter by chain' });
    ch.appendChild(el('option', { value: 'all' }, 'All chains'));
    chains.forEach(function (c) { ch.appendChild(el('option', { value: c }, c)); });
    ch.value = state.chain;
    ch.addEventListener('change', function () { state.chain = ch.value; renderTableOnly(); });
    wrap.appendChild(ch);
    var src = el('select', { 'aria-label': 'Filter by source' });
    [['all', 'Watchlist + early'], ['watch', 'Watchlist only'], ['early', 'Early finds only']].forEach(function (o) { src.appendChild(el('option', { value: o[0] }, o[1])); });
    src.value = state.source;
    src.addEventListener('change', function () { state.source = src.value; renderTableOnly(); });
    wrap.appendChild(src);
    wrap.appendChild(el('span', { class: 'result-note', id: 'result-note' }, 'Showing ' + rows.length + ' of ' + DATA.board_size));
    return wrap;
  }

  function sortArrow(key) { return state.sort === key ? (state.dir === -1 ? ' ↓' : ' ↑') : ''; }

  function renderTable(rows) {
    var wrap = el('div', { class: 'table-wrap' });
    if (rows.length === 0) { wrap.appendChild(el('div', { class: 'empty' }, 'No protocol matches these filters. Clear the search or widen the filters.')); return wrap; }
    var table = el('table', { class: 'board' });
    var head = el('thead');
    var hr = el('tr');
    var cols = [
      { key: 'rank', label: 'Rank', cls: '' },
      { key: 'name', label: 'Protocol', cls: '' },
      { key: 'category', label: 'Category', cls: '' },
      { key: 'chain', label: 'Chains', cls: '' },
      { key: 'tvl', label: 'TVL', cls: 'num' },
      { key: 'change', label: '7d', cls: 'num' },
      { key: 'age', label: 'Age', cls: 'num' },
      { key: 'implied', label: 'Implied value', cls: 'num' }
    ];
    cols.forEach(function (c) {
      var th = el('th', { class: c.cls }, c.label + sortArrow(c.key));
      if (c.key !== 'category' && c.key !== 'chain') {
        th.addEventListener('click', function () {
          if (state.sort === c.key) state.dir = -state.dir;
          else { state.sort = c.key; state.dir = c.key === 'name' ? 1 : -1; }
          render();
        });
      }
      hr.appendChild(th);
    });
    head.appendChild(hr);
    table.appendChild(head);
    var body = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr', { class: state.selected === r.slug ? 'selected' : '' });
      tr.addEventListener('click', function () { state.selected = r.slug; render(); });
      tr.appendChild(el('td', { class: 'rank' }, '#' + r.rank));
      var nameTd = el('td', { class: 'name' });
      nameTd.appendChild(el('span', { class: 'pname' }, r.name));
      nameTd.appendChild(el('span', { class: 'pslug' }, r.slug));
      nameTd.appendChild(el('span', { class: isWatch(r) ? 'tag watch' : 'tag early' }, isWatch(r) ? 'Watchlist' : 'Early'));
      tr.appendChild(nameTd);
      tr.appendChild(el('td', {}, el('span', { class: 'pill' }, r.category || '—')));
      tr.appendChild(el('td', {}, (r.chains || []).slice(0, 3).join(', ') + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '')));
      tr.appendChild(el('td', { class: 'num' }, usd(r.tvl_usd)));
      tr.appendChild(el('td', { class: 'num ' + pctClass(r.change_7d) }, fmtPct(r.change_7d)));
      tr.appendChild(el('td', { class: 'num' }, fmtAge(r.age_days)));
      tr.appendChild(el('td', { class: 'num implied' }, usd(r.implied_value_usd)));
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    return wrap;
  }

  // ---------- live tab ----------
  function renderLive() {
    var wrap = el('div', { class: 'table-wrap' });
    var table = el('table', { class: 'board' });
    var head = el('thead');
    var hr = el('tr');
    ['Protocol', 'Category', 'Chains', 'TVL', 'Market cap', '7d'].forEach(function (label, i) {
      hr.appendChild(el('th', { class: i >= 3 ? 'num' : '' }, label));
    });
    head.appendChild(hr);
    table.appendChild(head);
    var body = el('tbody');
    DATA.live.forEach(function (r) {
      var tr = el('tr');
      tr.style.cursor = 'default';
      var nameTd = el('td', { class: 'name' });
      nameTd.appendChild(el('span', { class: 'pname' }, r.name));
      nameTd.appendChild(el('span', { class: 'pslug' }, r.slug));
      tr.appendChild(nameTd);
      tr.appendChild(el('td', {}, el('span', { class: 'pill' }, r.category || '—')));
      tr.appendChild(el('td', {}, (r.chains || []).slice(0, 3).join(', ') + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '')));
      tr.appendChild(el('td', { class: 'num' }, usd(r.tvl_usd)));
      tr.appendChild(el('td', { class: 'num implied' }, usd(r.mcap_usd)));
      tr.appendChild(el('td', { class: 'num ' + pctClass(r.change_7d) }, fmtPct(r.change_7d)));
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    var note = el('p', { class: 'lede', style: 'margin-top:12px' }, 'These protocols already trade, so the board shows the market\u2019s own value for them \u2014 a market cap, never a model\u2019s guess. They are the calibration set: their median mcap/TVL is what the pre-token board is priced against.');
    var out = el('div', {});
    out.appendChild(wrap);
    out.appendChild(note);
    return out;
  }

  // ---------- model tab ----------
  function renderModel() {
    var grid = el('div', { class: 'model-grid' });
    var left = el('div', { class: 'card' });
    left.appendChild(el('h3', {}, 'The model, in one formula'));
    left.appendChild(el('p', {}, 'Implied value is the entry\u2019s own claim, never a prediction that a token will be issued. It follows only from the snapshot\u2019s figures \u2014 TVL, seven-day growth, and how long the protocol has run with no token \u2014 plus two refinements the snapshot itself calibrates.'));
    var formula = el('div', { class: 'formula' });
    formula.textContent = 'implied = TVL × 0.25 × category × chains × growth × maturity\n\n' +
      '  category  live median mcap/TVL for the category ÷ global median,\n' +
      '            shrunk by n/(n+5), clamped to [0.6, 1.6]; 1 when thin\n' +
      '  chains    1 + 0.015 × min(chains, 10)          (multi-chain reach)\n' +
      '  growth    1 + clamp(7d %, −60, +120) / 100 × 0.5\n' +
      '  maturity  0.6 + min(age, 1095) / 1095 × 0.4    (unknown age: 365d)';
    left.appendChild(formula);
    var method = el('ol', { class: 'method' });
    [
      ['The base multiple is the market\u2019s own.', ' 0.25 is the median mcap/TVL of the ' + DATA.calibration.live_count + ' live-token protocols in this snapshot (median ' + DATA.calibration.global_median_multiple + '), not a chosen number.'],
      ['Categories are priced by their own market.', ' A category whose live tokens trade dearer against TVL lifts its pre-token rows, and one whose tokens trade cheaper lowers them \u2014 but only when at least 3 live protocols speak for it.'],
      ['Age cuts both ways, and the model says so.', ' A protocol that has run longer with no token is more proven (maturity up to 1.0), but a young one still growing fast earns its place on growth.'],
      ['The watchlist is a floor, never a ceiling.', ' All ' + DATA.watchlist_size + ' watchlist protocols are ranked, and the board adds the ' + DATA.early_size + ' largest pre-token protocols below the $50M floor.'],
      ['Live tokens are never ranked.', ' Their market cap is shown as the market\u2019s value, and they calibrate the model instead of competing with it.']
    ].forEach(function (pair) {
      var li = el('li', {});
      li.appendChild(el('b', {}, pair[0]));
      li.appendChild(document.createTextNode(pair[1]));
      method.appendChild(li);
    });
    left.appendChild(method);
    grid.appendChild(left);
    var right = el('div', { class: 'card' });
    right.appendChild(el('h3', {}, 'Category calibration'));
    right.appendChild(el('p', {}, 'Median mcap/TVL of the live protocols in each category, and the factor it gives. Thin categories (under 3 live protocols) stay at 1.00.'));
    var table = el('table', { class: 'calib' });
    var head = el('thead');
    var hr = el('tr');
    hr.appendChild(el('th', {}, 'Category'));
    hr.appendChild(el('th', { class: 'num' }, 'Live n'));
    hr.appendChild(el('th', { class: 'num' }, 'Median'));
    hr.appendChild(el('th', { class: 'num' }, 'Factor'));
    head.appendChild(hr);
    table.appendChild(head);
    var body = el('tbody');
    DATA.calibration.categories.forEach(function (c) {
      var tr = el('tr');
      tr.appendChild(el('td', {}, c.category));
      tr.appendChild(el('td', { class: 'num' }, String(c.live_count)));
      tr.appendChild(el('td', { class: 'num' }, c.median_multiple === null ? '—' : String(c.median_multiple)));
      tr.appendChild(el('td', { class: 'num' }, c.factor.toFixed(2)));
      body.appendChild(tr);
    });
    table.appendChild(body);
    right.appendChild(table);
    grid.appendChild(right);
    return grid;
  }

  // ---------- detail drawer ----------
  function renderDrawer() {
    var r = null;
    for (var i = 0; i < DATA.rows.length; i++) { if (DATA.rows[i].slug === state.selected) { r = DATA.rows[i]; break; } }
    if (!r) return null;
    var m = impliedOf(r);
    var match = m.implied === r.implied_value_usd;
    var d = el('aside', { class: 'drawer', role: 'dialog', 'aria-label': r.name + ' detail' });
    d.appendChild(el('button', { class: 'close', 'aria-label': 'Close detail', onclick: function () { state.selected = null; render(); } }, '×'));
    d.appendChild(el('div', { class: 'eyebrow' }, el('span', { class: 'dot' }), 'Rank #' + r.rank + (isWatch(r) ? ' · Watchlist' : ' · Early find')));
    d.appendChild(el('h2', {}, r.name));
    d.appendChild(el('p', { class: 'sub' }, r.slug + ' · ' + (r.category || 'Uncategorised') + ' · ' + (r.chains || []).join(', ')));
    var kv = el('div', { class: 'kv' });
    var cells = [
      ['Implied value', usdFull(r.implied_value_usd)],
      ['TVL', usdFull(r.tvl_usd)],
      ['7-day change', fmtPct(r.change_7d)],
      ['Age', fmtAge(r.age_days)],
      ['Chains', String((r.chains || []).length)],
      ['Listed', r.listed_at || 'unknown']
    ];
    cells.forEach(function (c) {
      var cell = el('div', { class: 'cell' });
      cell.appendChild(el('div', { class: 'k' }, c[0]));
      cell.appendChild(el('div', { class: 'v' }, c[1]));
      kv.appendChild(cell);
    });
    d.appendChild(kv);
    d.appendChild(el('h3', {}, 'How the value is built'));
    var mt = el('table', { class: 'model-rows' });
    var mrows = [
      ['Base — TVL × 0.25', usdFull(m.base)],
      ['Category factor (' + (r.category || 'none') + ')', '× ' + m.category.toFixed(2)],
      ['Chain factor (' + (r.chains || []).length + ' chains)', '× ' + m.chain.toFixed(2)],
      ['Growth — 7d ' + fmtPct(m.growthPct), '× ' + m.growth.toFixed(4)],
      ['Maturity — ' + fmtAge(r.age_days), '× ' + m.maturity.toFixed(4)]
    ];
    mrows.forEach(function (row) {
      var tr = el('tr');
      tr.appendChild(el('td', {}, row[0]));
      tr.appendChild(el('td', {}, row[1]));
      mt.appendChild(tr);
    });
    var total = el('tr', { class: 'total' });
    total.appendChild(el('td', {}, 'Implied value'));
    total.appendChild(el('td', {}, usdFull(r.implied_value_usd)));
    mt.appendChild(total);
    d.appendChild(mt);
    d.appendChild(el('p', { class: 'lede', style: 'font-size:12px;margin-top:8px' }, match ? 'The page recomputed this number from the snapshot figures and it matches board.json exactly.' : 'The page recomputed this number from the snapshot figures; it differs from board.json by ' + usdFull(Math.abs(m.implied - r.implied_value_usd)) + ' (rounding).'));
    d.appendChild(el('h3', {}, 'Farm plan — seven steps'));
    var ol = el('ol', { class: 'farm' });
    farmSteps(r).forEach(function (s) {
      var li = el('li', {});
      li.appendChild(el('span', { class: 'step' }, s.text));
      var meta = el('span', { class: 'meta' });
      meta.appendChild(el('b', {}, 'Cost: '));
      meta.appendChild(document.createTextNode(s.cost + ' · '));
      meta.appendChild(el('b', {}, 'Time: '));
      meta.appendChild(document.createTextNode(s.time));
      li.appendChild(meta);
      ol.appendChild(li);
    });
    d.appendChild(ol);
    d.appendChild(el('p', { class: 'lede', style: 'font-size:12px' }, 'An implied value is the entry\u2019s claim about what a token would be worth if the protocol\u2019s record stayed as it is. It is not a prediction that a token will be issued, or when.'));
    return d;
  }

  function renderFooter() {
    var f = el('footer', { class: 'foot' });
    f.appendChild(el('p', {}, 'Source: ' + DATA.source + '. Snapshot as of ' + DATA.as_of + '. Floor: ' + usdFull(DATA.floor_usd) + '.'));
    f.appendChild(el('p', {}, 'Token Radar ' + DATA.model_version + ' · implied = TVL × 0.25 × category × chains × growth × maturity, calibrated on the snapshot\u2019s live protocols. A protocol is called pre-token when its DefiLlama record carries no token; that is the record, not proof it has none.'));
    return f;
  }

  // ---------- render ----------
  function renderTableOnly() {
    var rows = filteredRows();
    var slot = document.getElementById('table-slot');
    if (slot) {
      while (slot.firstChild) slot.removeChild(slot.firstChild);
      slot.appendChild(renderTable(rows));
    }
    var note = document.getElementById('result-note');
    if (note) note.textContent = 'Showing ' + rows.length + ' of ' + DATA.board_size;
  }

  function render() {
    while (app.firstChild) app.removeChild(app.firstChild);
    app.setAttribute('aria-busy', 'false');
    app.appendChild(renderHeader());
    app.appendChild(renderStats());
    app.appendChild(renderTabs());
    if (state.tab === 'board') {
      var rows = filteredRows();
      app.appendChild(renderControls(rows));
      var slot = el('div', { id: 'table-slot' });
      slot.appendChild(renderTable(rows));
      app.appendChild(slot);
    } else if (state.tab === 'live') {
      app.appendChild(renderLive());
    } else {
      app.appendChild(renderModel());
    }
    app.appendChild(renderFooter());
    var drawer = renderDrawer();
    if (drawer) app.appendChild(drawer);
  }

  // Deep links, so a state can be screenshotted or shared: #detail=<slug> opens a protocol,
  // #q=<text> searches, #category=<name> and #source=<watch|early> filter the board.
  // Re-applied on hashchange, so a link followed inside the page works too.
  function applyHash() {
    var h = window.location.hash || '';
    if (h.charAt(0) === '#') h = h.slice(1);
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      var k = kv[0];
      var v = kv[1] ? decodeURIComponent(kv[1]) : '';
      if (k === 'detail' && v) state.selected = v;
      if (k === 'q') state.q = v;
      if (k === 'category') state.category = v;
      if (k === 'source') state.source = v;
      if (k === 'tab') state.tab = v;
    });
  }
  applyHash();
  window.addEventListener('hashchange', function () { applyHash(); render(); });

  render();
})();
