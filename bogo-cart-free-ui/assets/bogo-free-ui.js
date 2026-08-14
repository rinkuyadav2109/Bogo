(function () {
  var CONFIG_ID = 'bogo-free-ui-config';
  var ATTR_FREE_ROW = 'data-bogo-free-row';
  var ATTR_BUY_ROW = 'data-bogo-buy-row';
  var ATTR_PRICE = 'data-bogo-free-price';
  var ATTR_ORIG_HTML = 'data-bogo-free-orig';

  function readConfig() {
    var node = document.getElementById(CONFIG_ID);
    if (!node) return null;
    try {
      var parsed = JSON.parse(node.textContent || '{}');
      if (!parsed || parsed.enabled === false) return null;
      return {
        moneyFormat: parsed.moneyFormat || '${{amount}}',
        discountPrefix: String(parsed.discountPrefix || 'BXGY').trim(),
        maxFloorCents: Number(parsed.maxFloorCents) || 100,
      };
    } catch (e) {
      return null;
    }
  }

  function isCheckoutPage() {
    var path = (window.location && window.location.pathname) || '';
    return (
      path.indexOf('/checkouts') !== -1 ||
      path.indexOf('/checkout') !== -1 ||
      path.indexOf('/thank_you') !== -1
    );
  }

  function formatMoney(cents, moneyFormat) {
    var value = (Number(cents) || 0) / 100;
    if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      try {
        return window.Shopify.formatMoney(cents, moneyFormat);
      } catch (e) {
        /* fall through */
      }
    }
    var amount = value.toFixed(2);
    var amountNoDecimals = String(Math.round(value));
    var amountWithComma = amount.replace('.', ',');
    return String(moneyFormat || '${{amount}}')
      .replace(/\{\{\s*amount_no_decimals_with_comma_separator\s*\}\}/g, amountNoDecimals)
      .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/g, amountWithComma)
      .replace(/\{\{\s*amount_no_decimals\s*\}\}/g, amountNoDecimals)
      .replace(/\{\{\s*amount\s*\}\}/g, amount);
  }

  function fetchCart() {
    return fetch('/cart.js', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }).then(function (res) {
      if (!res.ok) throw new Error('cart.js ' + res.status);
      return res.json();
    });
  }

  function itemDiscountTitles(item) {
    var titles = [];
    var discounts = item.discounts || [];
    for (var i = 0; i < discounts.length; i++) {
      var title = String((discounts[i] && discounts[i].title) || '').trim();
      if (title) titles.push(title);
    }
    var allocations = item.line_level_discount_allocations || [];
    for (var j = 0; j < allocations.length; j++) {
      var app =
        allocations[j] &&
        allocations[j].discount_application &&
        allocations[j].discount_application.title;
      var t = String(app || '').trim();
      if (t) titles.push(t);
    }
    return titles;
  }

  function titleMatchesPrefix(title, prefix) {
    if (!prefix) return false;
    return (
      String(title || '')
        .trim()
        .toLowerCase()
        .indexOf(String(prefix).trim().toLowerCase()) === 0
    );
  }

  function itemHasPrefixDiscount(item, prefix) {
    var titles = itemDiscountTitles(item);
    for (var i = 0; i < titles.length; i++) {
      if (titleMatchesPrefix(titles[i], prefix)) return true;
    }
    return false;
  }

  function matchedPrefixTitles(item, prefix) {
    var out = {};
    var titles = itemDiscountTitles(item);
    for (var i = 0; i < titles.length; i++) {
      if (titleMatchesPrefix(titles[i], prefix)) out[titles[i]] = true;
    }
    return out;
  }

  function sharesTitle(itemTitles, titleSet) {
    for (var key in itemTitles) {
      if (Object.prototype.hasOwnProperty.call(itemTitles, key) && titleSet[key]) {
        return true;
      }
    }
    return false;
  }

  function classifyItems(cart, config) {
    var items = (cart && cart.items) || [];
    var prefix = config.discountPrefix;
    var maxFloorCents = config.maxFloorCents;
    var free = [];
    var titleSet = {};

    if (!prefix) return { free: free, buy: [] };

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!itemHasPrefixDiscount(item, prefix)) continue;

      var qty = Math.max(1, Number(item.quantity) || 1);
      var finalUnit = Number(item.final_price) || 0;
      var originalUnit = Number(item.original_price) || Number(item.price) || 0;
      var finalLine = Number(item.final_line_price) || finalUnit * qty;
      var originalLine =
        Number(item.original_line_price) || originalUnit * qty;

      // True free / native — leave alone.
      if (finalUnit === 0 && finalLine === 0) continue;
      // Get Y at floor per unit.
      if (finalUnit <= 0 || finalUnit > maxFloorCents) continue;
      if (originalUnit > 0 && originalUnit <= maxFloorCents) continue;
      // Whole line must be floored (skip mixed free+full on one row).
      if (finalLine > maxFloorCents * qty + 1) continue;

      var titles = matchedPrefixTitles(item, prefix);
      free.push({
        key: String(item.key || ''),
        index: i,
        quantity: qty,
        originalPrice: originalUnit,
        originalLinePrice: originalLine,
        titles: titles,
        role: 'free',
      });
      for (var t in titles) {
        if (Object.prototype.hasOwnProperty.call(titles, t)) titleSet[t] = true;
      }
    }

    var buy = [];
    if (!free.length) return { free: free, buy: buy };

    for (var j = 0; j < items.length; j++) {
      var buyItem = items[j];
      if (!itemHasPrefixDiscount(buyItem, prefix)) continue;

      var alreadyFree = free.some(function (f) {
        return f.key && f.key === String(buyItem.key || '');
      });
      if (alreadyFree) continue;

      var buyTitles = matchedPrefixTitles(buyItem, prefix);
      if (!sharesTitle(buyTitles, titleSet)) continue;

      var buyQty = Math.max(1, Number(buyItem.quantity) || 1);
      var buyFinal = Number(buyItem.final_price) || 0;
      var buyOriginal =
        Number(buyItem.original_price) || Number(buyItem.price) || 0;
      var buyFinalLine =
        Number(buyItem.final_line_price) || buyFinal * buyQty;
      var buyOriginalLine =
        Number(buyItem.original_line_price) || buyOriginal * buyQty;
      var absorbed = buyOriginalLine - buyFinalLine;

      if (buyOriginal <= 0 || buyFinal <= 0) continue;
      if (buyFinal <= maxFloorCents) continue;
      // Only tiny floor-absorb lines; full-price extras are untouched.
      if (absorbed <= 0 || absorbed > maxFloorCents * buyQty + 1) continue;

      buy.push({
        key: String(buyItem.key || ''),
        index: j,
        quantity: buyQty,
        originalPrice: buyOriginal,
        originalLinePrice: buyOriginalLine,
        role: 'buy',
      });
    }

    return { free: free, buy: buy };
  }

  function rowCandidates() {
    return dedupeHosts(
      document.querySelectorAll(
        [
          'form[action="/cart"] tr.cart-item',
          'form[action="/cart"] .cart-item',
          '#main-cart-items .cart-item',
          '.cart-items .cart-item',
          'cart-drawer .cart-item',
          '#CartDrawer .cart-item',
          '[id^="CartItem-"]',
          '[id^="CartDrawer-Item-"]',
        ].join(','),
      ),
    );
  }

  function normalizeKey(value) {
    return String(value || '').trim();
  }

  function rowKey(row) {
    return (
      normalizeKey(row.getAttribute('data-key')) ||
      normalizeKey(row.getAttribute('data-cart-item-key')) ||
      normalizeKey(row.getAttribute('data-line-key')) ||
      ''
    );
  }

  /** Dawn CartItem-1 / CartDrawer-Item-1 is 1-based and matches cart.items index. */
  function rowCartIndex(row) {
    var id = String(row.id || '');
    var match =
      id.match(/^CartItem-(\d+)$/i) || id.match(/^CartDrawer-Item-(\d+)$/i);
    if (match) return parseInt(match[1], 10) - 1;

    var qtyInput = row.querySelector('[name="updates[]"][data-index]');
    if (qtyInput) {
      var dataIndex = parseInt(qtyInput.getAttribute('data-index'), 10);
      if (Number.isFinite(dataIndex) && dataIndex >= 1) return dataIndex - 1;
    }
    return -1;
  }

  /**
   * Match by cart line key, then by cart index.
   * Never by variantId — extras/splits of the same product must stay separate.
   */
  function matchRow(row, items, used) {
    var key = rowKey(row);
    if (key) {
      for (var i = 0; i < items.length; i++) {
        if (used[i]) continue;
        if (items[i].key && items[i].key === key) {
          used[i] = true;
          return items[i];
        }
      }
    }

    var index = rowCartIndex(row);
    if (index >= 0) {
      for (var j = 0; j < items.length; j++) {
        if (used[j]) continue;
        if (items[j].index === index) {
          used[j] = true;
          return items[j];
        }
      }
    }

    return null;
  }

  function dedupeHosts(nodes) {
    var list = Array.prototype.slice.call(nodes).filter(Boolean);
    return list.filter(function (node, index) {
      for (var i = 0; i < list.length; i++) {
        if (i === index) continue;
        if (list[i].contains(node)) return false;
      }
      return true;
    });
  }

  function looksLikeMoney(text) {
    var value = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!value || value.length > 80) return false;
    if (/^(Title|Size|Color|Colour|Material|Style)\s*:/i.test(value)) return false;
    return /(?:Rs\.|₹|\$|€|£)?\s*\d{1,3}(?:[.,]\d{3})*[.,]\d{2}/.test(value);
  }

  function firstMoneyProductOption(root, directOnly) {
    var nodes = directOnly
      ? root.children
      : root.querySelectorAll('.product-option');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || el.nodeType !== 1) continue;
      if (!el.classList.contains('product-option')) continue;
      if (el.closest && el.closest('ul.discounts, .discounts')) continue;
      if (looksLikeMoney(el.textContent)) return el;
    }
    return null;
  }

  function backupHtml(node) {
    if (!node.getAttribute(ATTR_ORIG_HTML)) {
      node.setAttribute(ATTR_ORIG_HTML, node.innerHTML);
    }
  }

  function findDetailsPriceNode(row) {
    var details = row.querySelector('.cart-item__details');
    if (!details) return null;

    return (
      details.querySelector('.cart-item__discounted-prices') ||
      firstMoneyProductOption(details, true) ||
      firstMoneyProductOption(details, false)
    );
  }

  function findTotalsWrappers(row) {
    return Array.prototype.slice.call(
      row.querySelectorAll('.cart-item__totals .cart-item__price-wrapper'),
    );
  }

  /** Dawn left Get Y */
  function nativeDetailsGetHtml(compareHtml, zeroHtml) {
    return (
      '<span class="visually-hidden">Regular price</span>' +
      '<s class="cart-item__old-price product-option">' +
      compareHtml +
      '</s>' +
      '<span class="visually-hidden">Sale price</span>' +
      '<strong class="cart-item__final-price product-option"> ' +
      zeroHtml +
      '</strong>'
    );
  }

  /** Dawn left Buy X */
  function nativeDetailsBuyHtml(moneyHtml) {
    return moneyHtml;
  }

  /** Dawn TOTAL Get Y (dl structure) */
  function nativeTotalsGetHtml(compareHtml, zeroHtml) {
    return (
      '<dl class="cart-item__discounted-prices">' +
      '<dt class="visually-hidden">Regular price</dt>' +
      '<dd>' +
      '<s class="cart-item__old-price price price--end">' +
      compareHtml +
      '</s>' +
      '</dd>' +
      '<dt class="visually-hidden">Sale price</dt>' +
      '<dd class="price price--end">' +
      zeroHtml +
      '</dd>' +
      '</dl>'
    );
  }

  /** Dawn TOTAL Buy X */
  function nativeTotalsBuyHtml(moneyHtml) {
    return '<span class="price price--end">' + moneyHtml + '</span>';
  }

  function ensureDetailsGetHost(row) {
    var details = row.querySelector('.cart-item__details');
    if (!details) return null;

    var existing = findDetailsPriceNode(row);
    if (existing) {
      backupHtml(existing);
      if (!existing.classList.contains('cart-item__discounted-prices')) {
        var replacement = document.createElement('div');
        replacement.className = 'cart-item__discounted-prices';
        replacement.setAttribute(ATTR_PRICE, '1');
        existing.parentNode.insertBefore(replacement, existing);
        existing.parentNode.removeChild(existing);
        return replacement;
      }
      existing.setAttribute(ATTR_PRICE, '1');
      return existing;
    }

    var host = document.createElement('div');
    host.className = 'cart-item__discounted-prices';
    host.setAttribute(ATTR_PRICE, '1');
    host.setAttribute('data-bogo-details-price', '1');
    var name = details.querySelector('a.cart-item__name, .cart-item__name');
    if (name) name.insertAdjacentElement('afterend', host);
    else details.insertBefore(host, details.firstChild);
    return host;
  }

  function ensureDetailsBuyHost(row) {
    var details = row.querySelector('.cart-item__details');
    if (!details) return null;

    var existing = findDetailsPriceNode(row);
    if (existing) {
      backupHtml(existing);
      if (existing.classList.contains('cart-item__discounted-prices')) {
        var plain = document.createElement('div');
        plain.className = 'product-option';
        plain.setAttribute(ATTR_PRICE, '1');
        existing.parentNode.insertBefore(plain, existing);
        existing.parentNode.removeChild(existing);
        return plain;
      }
      existing.className = 'product-option';
      existing.setAttribute(ATTR_PRICE, '1');
      return existing;
    }

    var host = document.createElement('div');
    host.className = 'product-option';
    host.setAttribute(ATTR_PRICE, '1');
    host.setAttribute('data-bogo-details-price', '1');
    var name = details.querySelector('a.cart-item__name, .cart-item__name');
    if (name) name.insertAdjacentElement('afterend', host);
    else details.insertBefore(host, details.firstChild);
    return host;
  }

  function applyGetToRow(row, freeItem, config) {
    row.setAttribute(ATTR_FREE_ROW, '1');
    row.removeAttribute(ATTR_BUY_ROW);

    var compareUnit = formatMoney(freeItem.originalPrice, config.moneyFormat);
    var compareLine = formatMoney(freeItem.originalLinePrice, config.moneyFormat);
    var zeroHtml = formatMoney(0, config.moneyFormat);

    var detailsHost = ensureDetailsGetHost(row);
    if (detailsHost) {
      detailsHost.classList.remove('bogo-free-ui-hide');
      detailsHost.innerHTML = nativeDetailsGetHtml(compareUnit, zeroHtml);
    }

    var wrappers = findTotalsWrappers(row);
    if (!wrappers.length) {
      row.querySelectorAll('.cart-item__totals').forEach(function (td) {
        var wrap = td.querySelector('.cart-item__price-wrapper');
        if (!wrap) {
          wrap = document.createElement('div');
          wrap.className = 'cart-item__price-wrapper';
          td.appendChild(wrap);
        }
        wrappers.push(wrap);
      });
    }

    wrappers.forEach(function (wrap) {
      backupHtml(wrap);
      wrap.classList.remove('bogo-free-ui-hide');
      wrap.setAttribute(ATTR_PRICE, '1');
      // Keep loading spinner if present.
      var spinner = wrap.querySelector('.loading__spinner, .loading-spinner');
      wrap.innerHTML = nativeTotalsGetHtml(compareLine, zeroHtml);
      if (spinner) wrap.appendChild(spinner);
    });
  }

  function applyBuyToRow(row, buyItem, config) {
    row.setAttribute(ATTR_BUY_ROW, '1');
    row.removeAttribute(ATTR_FREE_ROW);

    var unitMoney = formatMoney(buyItem.originalPrice, config.moneyFormat);
    var lineMoney = formatMoney(buyItem.originalLinePrice, config.moneyFormat);

    var detailsHost = ensureDetailsBuyHost(row);
    if (detailsHost) {
      detailsHost.classList.remove('bogo-free-ui-hide');
      detailsHost.innerHTML = nativeDetailsBuyHtml(unitMoney);
    }

    var wrappers = findTotalsWrappers(row);
    if (!wrappers.length) {
      row.querySelectorAll('.cart-item__totals').forEach(function (td) {
        var wrap = td.querySelector('.cart-item__price-wrapper');
        if (!wrap) {
          wrap = document.createElement('div');
          wrap.className = 'cart-item__price-wrapper';
          td.appendChild(wrap);
        }
        wrappers.push(wrap);
      });
    }

    wrappers.forEach(function (wrap) {
      backupHtml(wrap);
      wrap.classList.remove('bogo-free-ui-hide');
      wrap.setAttribute(ATTR_PRICE, '1');
      var spinner = wrap.querySelector('.loading__spinner, .loading-spinner');
      wrap.innerHTML = nativeTotalsBuyHtml(lineMoney);
      if (spinner) wrap.appendChild(spinner);
    });
  }

  function restoreRow(row) {
    row.removeAttribute(ATTR_FREE_ROW);
    row.removeAttribute(ATTR_BUY_ROW);
    var hosts = row.querySelectorAll('[' + ATTR_ORIG_HTML + ']');
    Array.prototype.forEach.call(hosts, function (host) {
      var orig = host.getAttribute(ATTR_ORIG_HTML);
      if (orig != null) host.innerHTML = orig;
      host.removeAttribute(ATTR_ORIG_HTML);
      host.removeAttribute(ATTR_PRICE);
      host.classList.remove('bogo-free-ui-hide');
    });
    var injected = row.querySelectorAll('[data-bogo-details-price="1"]');
    Array.prototype.forEach.call(injected, function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function clearStaleRows(activeRows) {
    var marked = document.querySelectorAll(
      '[' + ATTR_FREE_ROW + '="1"], [' + ATTR_BUY_ROW + '="1"]',
    );
    Array.prototype.forEach.call(marked, function (row) {
      if (activeRows.indexOf(row) !== -1) return;
      restoreRow(row);
    });
  }

  function markReady() {
    document.documentElement.classList.remove('bogo-free-ui-pending');
    document.documentElement.classList.add('bogo-free-ui-ready');
  }

  function readEmbeddedCart() {
    var node = document.getElementById('bogo-free-ui-cart');
    if (!node) return null;
    try {
      var parsed = JSON.parse(node.textContent || 'null');
      if (!parsed) return null;
      // Liquid cart json may be the cart object or sometimes only items.
      if (Array.isArray(parsed)) return { items: parsed };
      if (parsed.items) return parsed;
      return null;
    } catch (e) {
      return null;
    }
  }

  var running = false;
  var queued = false;
  var applying = false;

  function applyCart(cart, config) {
    applying = true;
    var classified = classifyItems(cart, config);
    var freeUsed = {};
    var buyUsed = {};
    var activeRows = [];

    rowCandidates().forEach(function (row) {
      var freeMatch = matchRow(row, classified.free, freeUsed);
      if (freeMatch) {
        activeRows.push(row);
        applyGetToRow(row, freeMatch, config);
        return;
      }
      var buyMatch = matchRow(row, classified.buy, buyUsed);
      if (buyMatch) {
        activeRows.push(row);
        applyBuyToRow(row, buyMatch, config);
      }
    });

    clearStaleRows(activeRows);
    markReady();
    window.setTimeout(function () {
      applying = false;
    }, 50);
  }

  function run(useNetwork) {
    var config = readConfig();
    if (!config || isCheckoutPage()) {
      markReady();
      return;
    }
    if (running) {
      queued = true;
      return;
    }
    running = true;

    var embedded = !useNetwork ? readEmbeddedCart() : null;
    var chain = embedded
      ? Promise.resolve(embedded)
      : fetchCart();

    chain
      .then(function (cart) {
        applyCart(cart, config);
      })
      .catch(function () {
        markReady();
      })
      .then(function () {
        running = false;
        if (queued) {
          queued = false;
          schedule(50, true);
        }
      });
  }

  var timer = null;
  function schedule(delay, useNetwork) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      run(Boolean(useNetwork));
    }, delay == null ? 0 : delay);
  }

  function patchFetch() {
    if (!window.fetch || window.fetch.__bogoFreeUiPatched) return;
    var original = window.fetch;
    window.fetch = function () {
      var args = arguments;
      var input = args[0];
      var url = typeof input === 'string' ? input : input && input.url;
      return original.apply(this, args).then(function (response) {
        if (url && /\/cart\/(add|change|update|clear)/.test(String(url))) {
          schedule(250, true);
        }
        return response;
      });
    };
    window.fetch.__bogoFreeUiPatched = true;
  }

  function patchXhr() {
    if (!window.XMLHttpRequest || window.XMLHttpRequest.__bogoFreeUiPatched) {
      return;
    }
    var open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__bogoFreeUiUrl = url;
      return open.apply(this, arguments);
    };
    var send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      this.addEventListener('load', function () {
        if (
          this.__bogoFreeUiUrl &&
          /\/cart\/(add|change|update|clear)/.test(String(this.__bogoFreeUiUrl))
        ) {
          schedule(250, true);
        }
      });
      return send.apply(this, arguments);
    };
    window.XMLHttpRequest.__bogoFreeUiPatched = true;
  }

  function start() {
    if (isCheckoutPage()) {
      markReady();
      return;
    }
    if (!readConfig()) {
      markReady();
      return;
    }
    patchFetch();
    patchXhr();
    // First paint: use Liquid-embedded cart (no network wait).
    schedule(0, false);

    document.addEventListener('cart:updated', function () {
      schedule(100, true);
    });
    document.addEventListener('cart:refresh', function () {
      schedule(100, true);
    });
    document.addEventListener('theme:cart:change', function () {
      schedule(100, true);
    });

    var roots = [
      document.querySelector('cart-drawer'),
      document.getElementById('CartDrawer'),
      document.querySelector('cart-notification'),
      document.querySelector('main'),
      document.body,
    ].filter(Boolean);

    if (window.MutationObserver && roots.length) {
      var observer = new MutationObserver(function () {
        if (applying) return;
        schedule(180, true);
      });
      roots.forEach(function (root) {
        observer.observe(root, { childList: true, subtree: true });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
