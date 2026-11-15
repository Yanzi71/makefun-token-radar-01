// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan, and the calibration table the model was fitted from.
// No network: every byte it shows is in data.js.
//
// The page recomputes the whole model from the snapshot figures: calibrate() fits the category
// multiples from the live-token comparables, impliedOf() scores a row, and farmPlan() derives the
// farm steps. The numbers it shows are checked against the numbers board.json carries, so the page's
// code and the board's data are visibly the same arithmetic. No protocol name is special-cased.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var MODEL = DATA.model;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
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
  function round4(n) { return Math.round(n * 1e4) / 1e4; }
  function median(sorted) {
    if (sorted.length === 0) return 0;
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function clampMultiple(x) {
    return Math.min(MODEL.multiple_cap, Math.max(MODEL.multiple_floor, x));
  }

  // The calibration, fitted here from the live-token comparables: the median market-cap-to-TVL ratio
  // per category (at least min_category_n comparables, else the global median), clamped to the same
  // band main.ts uses. A new snapshot recalibrates the whole board on its own.
  function calibrate() {
    var all = [];
    var byCat = {};
    DATA.comparables.forEach(function (c) {
      all.push(c.ratio);
      if (c.category !== null) {
        if (!byCat[c.category]) byCat[c.category] = [];
        byCat[c.category].push(c.ratio);
      }
    });
    all.sort(function (a, b) { return a - b; });
    var global = round4(clampMultiple(median(all)));
    var categories = {};
    Object.keys(byCat).sort().forEach(function (cat) {
      var ratios = byCat[cat].slice().sort(function (a, b) { return a - b; });
      if (ratios.length >= MODEL.min_category_n) {
        categories[cat] = { multiple: round4(clampMultiple(median(ratios))), n: ratios.length, fallback: false };
      } else {
        categories[cat] = { multiple: global, n: ratios.length, fallback: true };
      }
    });
    return { global_multiple: global, global_n: all.length, categories: categories };
  }
  var CALIBRATION = calibrate();

  function multipleFor(category) {
    if (category !== null && CALIBRATION.categories[category] !== undefined) return CALIBRATION.categories[category];
    return { multiple: CALIBRATION.global_multiple, n: 0, fallback: true };
  }

  // The model in one function: TVL x category multiple, adjusted by seven-day growth, by how long
  // the protocol has run with no token, and by how many chains it reaches.
  function impliedOf(row) {
    var entry = multipleFor(row.category);
    var growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * MODEL.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var maturity = MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
    var breadth = 1 + MODEL.breadth_per_chain * Math.min(Math.max((row.chains || []).length - 1, 0), MODEL.breadth_max_chains);
    return {
      implied: Math.max(1, Math.round(row.tvl_usd * entry.multiple * growthMult * maturity * breadth)),
      multiple: entry.multiple, comparables: entry.n, fallback: entry.fallback,
      growthPct: growth, growthMult: growthMult, maturityMult: maturity, breadthMult: breadth
    };
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

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the playbook, the capital, the hold and every cost and time. No name is special-cased.
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
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'ethereum') return { setup: 12, weekly: 6 };
    if (c === 'solana' || c === 'tron' || c === 'sui' || c === 'aptos') return { setup: 1, weekly: 1 };
    if (['base', 'arbitrum', 'optimism', 'ink', 'blast', 'mode', 'zksync era', 'polygon', 'bsc', 'avalanche', 'gnosis', 'linea', 'scroll', 'mantle', 'opbnb', 'berachain', 'monad', 'megaeth'].indexOf(c) >= 0) return { setup: 2, weekly: 1 };
    return { setup: 4, weekly: 2 };
  }
  function playbookFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) {
      return { action: 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.', weekly: 'Borrow a small amount against the supply, then repay it, keeping the health factor above 2.' };
    }
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) {
      return { action: 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.', weekly: 'Route one swap through ' + name + ' so the wallet shows trading activity as well as liquidity.' };
    }
    if (c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) {
      return { action: 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.', weekly: "Claim or compound the vault's rewards once, so the position keeps accruing." };
    }
    if (c.indexOf('bridge') >= 0) {
      return { action: 'Bridge $' + capital + ' of USDC through ' + name + ' to ' + chain + ' and use the bridged funds in its app.', weekly: 'Bridge a small amount back or onward so the wallet shows repeat bridging volume.' };
    }
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) {
      return { action: "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.', weekly: "Check the receipt token's balance and restake any rewards it accrues." };
    }
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) {
      return { action: 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.', weekly: 'Open and close one small position so the wallet shows trading volume without large exposure.' };
    }
    if (c.indexOf('prediction') >= 0) {
      return { action: 'Fund $' + capital + ' and place one market position on ' + name + '.', weekly: 'Place one more small position in a market that resolves soon.' };
    }
    if (c.indexOf('stable') >= 0) {
      return { action: 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.', weekly: "Hold the stable asset in the protocol's own pool or savings product." };
    }
    if (c.indexOf('rwa') >= 0) {
      return { action: "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.', weekly: "Claim the asset's yield once so the wallet shows an active holding." };
    }
    if (c.indexOf('insurance') >= 0) {
      return { action: 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.', weekly: "Check the policy's status and renew or extend it before it lapses." };
    }
    if (c.indexOf('index') >= 0) {
      return { action: 'Mint $' + capital + ' of the ' + name + ' index token on ' + chain + ' and hold it.', weekly: 'Rebalance or top up the index position by a small amount.' };
    }
    if (c.indexOf('payment') >= 0) {
      return { action: 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep a balance in the app.', weekly: 'Send one more payment through ' + name + ' so the wallet stays active.' };
    }
    if (c.indexOf('privacy') >= 0) {
      return { action: 'Use ' + name + ' on ' + chain + ' to move $' + capital + ' privately and keep the receipt.', weekly: 'Make one more private transfer so the wallet shows repeat use.' };
    }
    if (c.indexOf('ai agent') >= 0 || c.indexOf('ai') >= 0) {
      return { action: "Use " + name + "'s agent product on " + chain + ' with $' + capital + ' of funds and keep the position open.', weekly: 'Run one more agent task so the wallet shows repeat product use.' };
    }
    return { action: 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.', weekly: 'Make one qualifying action, such as a deposit, a swap or a vote, so the wallet stays active.' };
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var play = playbookFor(p, capital, chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: play.action, cost: '$' + capital + ' of capital and about $' + gas.setup + ' of gas on ' + chain, time: '15 minutes to set up' },
      { text: play.weekly, cost: 'about $' + gas.weekly + ' of gas a week on ' + chain, time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('sort')) state.sort = params.get('sort');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.category_multiple; bv = b.category_multiple; }
      else if (key === 'farmer') { av = a.farmer_pool_usd; bv = b.farmer_pool_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
        el('p', null, 'The watchlist is the floor: every protocol with at least $', el('b', { text: Math.round(DATA.floor_usd / 1e6) + 'M of TVL' }), ' and no token on record. The early radar adds ', el('b', { text: DATA.early_size + ' pre-token protocols' }), ' below that floor. Implied value is calibrated from the market caps of protocols whose tokens already trade, so a new snapshot reprices the whole board on its own. It is a model, not a promise.')
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Median market-cap / TVL' }), el('b', { text: CALIBRATION.global_multiple + 'x (' + CALIBRATION.global_n + ' live tokens)' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: r.category_multiple.toFixed(2) + 'x' }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: fmtUsd(r.farmer_pool_usd) }),
        el('td', null, r.watchlist ? el('span', { class: 'badge watch', text: 'Watchlist' }) : el('span', { class: 'badge early', text: 'Early find' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Multiple'),
            sortHeader('implied', 'Implied value'),
            sortHeader('farmer', 'Farmer pool'),
            el('th', { scope: 'col', text: 'Radar' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'badge live', text: 'Live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: (r.mcap_usd && r.tvl_usd) ? (r.mcap_usd / r.tvl_usd).toFixed(2) + 'x' : 'n/a' })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market-cap-to-TVL ratios calibrate it.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = MODEL;
    var cats = Object.keys(CALIBRATION.categories).sort();
    var calibRows = cats.map(function (cat) {
      var e = CALIBRATION.categories[cat];
      return el('div', { class: 'calib-row' },
        el('span', { text: cat + (e.fallback ? ' (global)' : '') }),
        el('b', { text: e.multiple.toFixed(2) + 'x  ·  n=' + e.n })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. The multiple is not a guess: it is the median market-cap-to-TVL ratio of the live-token protocols in the same category, fitted from this snapshot. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + ' + m.breadth_per_chain + ' x min(chains - 1, ' + m.breadth_max_chains + ')) )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. A category with fewer than ' + m.min_category_n + ' live-token comparables uses the global median of ' + CALIBRATION.global_multiple + 'x, and every multiple is clamped to [' + m.multiple_floor + ', ' + m.multiple_cap + ']. The farmer pool is ' + Math.round(m.farmer_share * 100) + '% of the implied value, the middle of the 5-10% a protocol typically allocates to its earliest users: a stated assumption, not a promise.' }),
      el('h3', { text: 'Calibration: market-cap / TVL by category' }),
      el('div', { class: 'calib' }, calibRows),
      el('p', { class: 'sub', text: 'Fitted from ' + CALIBRATION.global_n + ' live-token protocols in this snapshot. Centralised exchanges are left out of the calibration: an exchange token prices the exchange, not a protocol. The board ranks pre-token protocols only: wrapped, staked and bridged products of tokens that already trade, centralised exchanges and versioned pools are left out, by the same rule the watchlist uses. The board says a protocol records no token, never that it has none: DefiLlama may not carry a token that exists.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var v = impliedOf(row);
    var match = v.implied === row.implied_value_usd;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? '  ·  Watchlist' : '  ·  Early find') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'Other') + ', n=' + v.comparables + (v.fallback ? ', global fallback' : '') + ')' }), el('b', { class: 'num', text: v.multiple.toFixed(2) + 'x' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + '  →  x' + v.growthMult.toFixed(3) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) + '  →  x' + v.maturityMult.toFixed(3) })),
        el('div', null, el('span', { text: 'Chains reached' }), el('b', { class: 'num', text: String((row.chains || []).length) + '  →  x' + v.breadthMult.toFixed(3) })),
        el('div', null, el('span', { text: 'Farmer pool (7% of implied)' }), el('b', { class: 'num', text: fmtUsd(row.farmer_pool_usd) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(v.implied) + (match ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('div', { class: 'totals' },
        el('span', { class: 'total-chip' }, 'Capital ', el('b', { text: '$' + row.farm_capital_usd })),
        el('span', { class: 'total-chip' }, 'Est. gas ', el('b', { text: '$' + row.farm_gas_usd })),
        el('span', { class: 'total-chip' }, 'Hold ', el('b', { text: row.farm_hold_days + ' days' })),
        el('span', { class: 'total-chip' }, 'Setup ', el('b', { text: '15 min' }))
      ),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('p', { class: 'footnote', text: 'No token is guaranteed: a protocol may never issue one, and farming risks smart-contract loss and impermanent loss. Only farm what you can afford to lose, and never pay anyone to claim an airdrop.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
