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
          // Dawn
          'form[action="/cart"] tr.cart-item',
          'form[action="/cart"] .cart-item',
          '#main-cart-items .cart-item',
          '.cart-items .cart-item',
          'cart-drawer .cart-item',
          '#CartDrawer .cart-item',
          '[id^="CartItem-"]',
          '[id^="CartDrawer-Item-"]',
          // Ella theme — cart drawer
          '.previewCartList .previewCartItem',
          '.previewCart .previewCartItem',
          'li.previewCartItem',
          // Ella theme — cart page
          '.cart-list .cart-item',
          '.cart .cart-list .cart-item',
        ].join(','),
      ),
    );
  }

  function normalizeKey(value) {
    return String(value || '').trim();
  }

  function rowKey(row) {
    var fromRow =
      normalizeKey(row.getAttribute('data-key')) ||
      normalizeKey(row.getAttribute('data-cart-item-key')) ||
      normalizeKey(row.getAttribute('data-line-key')) ||
      normalizeKey(row.getAttribute('data-line'));
    if (fromRow) return fromRow;

    // Ella: line key lives on qty input / remove button as data-line.
    var lineNode = row.querySelector(
      '[data-line], [data-cart-remove-id][data-line], input[data-line]',
    );
    if (lineNode) {
      var line = normalizeKey(lineNode.getAttribute('data-line'));
      if (line) return line;
    }
    return '';
  }

  /** Dawn CartItem-1 / CartDrawer-Item-1 is 1-based and matches cart.items index. */
  function rowCartIndex(row) {
    var id = String(row.id || '');
    var match =
      id.match(/^CartItem-(\d+)$/i) || id.match(/^CartDrawer-Item-(\d+)$/i);
    if (match) return parseInt(match[1], 10) - 1;

    var qtyInput = row.querySelector(
      '[name="updates[]"][data-index], input.quantity[data-index], [data-cart-quantity-id][data-index]',
    );
    if (qtyInput) {
      var dataIndex = parseInt(qtyInput.getAttribute('data-index'), 10);
      if (Number.isFinite(dataIndex) && dataIndex >= 1) return dataIndex - 1;
    }
    return -1;
  }

  /**
   * Themes keep both cart page and cart-drawer rows in the DOM. Match free/buy
   * lines per surface so drawer rows do not consume the only match and leave
   * the cart page unstyled.
   */
  function rowSurface(row) {
    if (
      row.closest(
        [
          'cart-drawer',
          '#CartDrawer',
          'cart-notification',
          '#cart-notification',
          // Ella drawer
          '.previewCart',
          '.previewCartList',
          '#halo-cart-sidebar',
          '.halo-cart-sidebar',
          '[data-cart-sidebar]',
        ].join(', '),
      )
    ) {
      return 'drawer';
    }
    if (
      row.closest(
        [
          '#main-cart-items',
          '#CartItems',
          'form[action="/cart"]',
          'cart-items',
          // Ella cart page
          '.cart-list',
          '.template-cart .cart',
          'main .cart',
        ].join(', '),
      )
    ) {
      return 'page';
    }
    return 'other';
  }

  /** Ella drawer (.previewCartItem) vs Ella page (.cart-item-block) vs Dawn. */
  function rowTheme(row) {
    if (
      row.classList.contains('previewCartItem') ||
      row.closest('.previewCartList, .previewCart')
    ) {
      return 'ella-drawer';
    }
    if (
      row.querySelector('.cart-item-total, .cart-item-value, .cart-item-block') ||
      (row.classList.contains('cart-item') && row.closest('.cart-list'))
    ) {
      return 'ella-page';
    }
    return 'dawn';
  }

  function groupRowsBySurface(rows) {
    var groups = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var surface = rowSurface(row);
      if (!groups[surface]) groups[surface] = [];
      groups[surface].push(row);
    }
    return groups;
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

  function setTextAll(nodes, text) {
    Array.prototype.forEach.call(nodes, function (node) {
      if (node) node.textContent = text;
    });
  }

  function hideAll(nodes) {
    Array.prototype.forEach.call(nodes, function (node) {
      if (!node) return;
      node.classList.add('bogo-free-ui-hide');
    });
  }

  function showAll(nodes) {
    Array.prototype.forEach.call(nodes, function (node) {
      if (!node) return;
      node.classList.remove('bogo-free-ui-hide');
    });
  }

  /**
   * Ella cart drawer — .previewCartItem price block.
   * Get Y: strikethrough original + $0. Buy X: original only (no floor).
   */
  function applyEllaDrawerGet(row, freeItem, config) {
    var compareUnit = formatMoney(freeItem.originalPrice, config.moneyFormat);
    var zeroHtml = formatMoney(0, config.moneyFormat);
    var priceRoot = row.querySelector('.previewCartItem-price');
    if (!priceRoot) return;

    backupHtml(priceRoot);
    priceRoot.setAttribute(ATTR_PRICE, '1');
    priceRoot.setAttribute('data-price', '0');
    if (freeItem.originalPrice != null) {
      priceRoot.setAttribute('data-original-price', String(freeItem.originalPrice));
    }

    var saving = priceRoot.querySelector('.previewCartItem-saving-price');
    if (!saving) {
      var priceSpan = priceRoot.querySelector('.price') || priceRoot;
      saving = document.createElement('span');
      saving.className = 'previewCartItem-saving-price';
      priceSpan.insertBefore(saving, priceSpan.firstChild);
    }

    var oldPrice = saving.querySelector(
      '.before-discount-price, [data-item-original-price-display], s',
    );
    if (!oldPrice) {
      oldPrice = document.createElement('s');
      oldPrice.className = 'before-discount-price';
      oldPrice.setAttribute('data-item-original-price-display', '');
      saving.insertBefore(oldPrice, saving.firstChild);
    }
    oldPrice.classList.remove('bogo-free-ui-hide');
    oldPrice.textContent = compareUnit;

    var finalPrice = saving.querySelector(
      '.discounted-price, [data-item-final-price-display]',
    );
    if (!finalPrice) {
      finalPrice = document.createElement('span');
      finalPrice.className = 'discounted-price';
      finalPrice.setAttribute('data-item-final-price-display', '');
      saving.appendChild(finalPrice);
    }
    finalPrice.classList.remove('bogo-free-ui-hide');
    finalPrice.textContent = zeroHtml;
  }

  function applyEllaDrawerBuy(row, buyItem, config) {
    var unitMoney = formatMoney(buyItem.originalPrice, config.moneyFormat);
    var priceRoot = row.querySelector('.previewCartItem-price');
    if (!priceRoot) return;

    backupHtml(priceRoot);
    priceRoot.setAttribute(ATTR_PRICE, '1');
    priceRoot.setAttribute('data-price', String(buyItem.originalPrice));
    priceRoot.setAttribute('data-original-price', String(buyItem.originalPrice));

    // Ella paints .discounted-price / .previewCartItem-saving-price in sale red.
    // Rebuild as regular (non-sale) markup so Buy X matches full-price items.
    var msrp = priceRoot.querySelector('.msrp-wrapper');
    var msrpHtml = msrp ? msrp.outerHTML : '';

    var priceSpan = priceRoot.querySelector('.price');
    if (!priceSpan) {
      priceSpan = document.createElement('span');
      priceSpan.className = 'price';
      priceRoot.appendChild(priceSpan);
    }
    priceSpan.innerHTML =
      '<span data-item-final-price-display="">' +
      unitMoney +
      msrpHtml +
      '</span>';
  }

  /**
   * Ella cart page — .cart-item with unit + line total columns.
   */
  function applyEllaPageGet(row, freeItem, config) {
    var compareUnit = formatMoney(freeItem.originalPrice, config.moneyFormat);
    var zeroHtml = formatMoney(0, config.moneyFormat);

    var priceWrappers = row.querySelectorAll('.cart-item__price-wrapper');
    Array.prototype.forEach.call(priceWrappers, function (wrap) {
      backupHtml(wrap);
      wrap.setAttribute(ATTR_PRICE, '1');
      wrap.classList.remove('bogo-free-ui-hide');

      var oldNodes = wrap.querySelectorAll(
        '.cart-item__old-price, [data-item-original-price-display]',
      );
      if (oldNodes.length) {
        showAll(oldNodes);
        setTextAll(oldNodes, compareUnit);
      } else {
        var dl = wrap.querySelector('.cart-item__discounted-prices') || wrap;
        var s = document.createElement('s');
        s.className = 'cart-item__old-price price price--end';
        s.setAttribute('data-item-original-price-display', '');
        s.textContent = compareUnit;
        dl.insertBefore(s, dl.firstChild);
      }

      var finals = wrap.querySelectorAll('[data-item-final-price-display]');
      if (finals.length) {
        setTextAll(finals, zeroHtml);
      } else {
        var dds = wrap.querySelectorAll('dd.price');
        if (dds.length) dds[dds.length - 1].textContent = zeroHtml;
      }
    });

    var totals = row.querySelectorAll('.cart-item-total');
    Array.prototype.forEach.call(totals, function (total) {
      backupHtml(total);
      total.setAttribute(ATTR_PRICE, '1');
      total.setAttribute('data-price', '0');
      if (freeItem.originalLinePrice != null) {
        total.setAttribute(
          'data-original-price',
          String(freeItem.originalLinePrice),
        );
      }
      var value = total.querySelector(
        '.cart-item-value, [data-item-price-with-quantity-display]',
      );
      if (value) value.textContent = zeroHtml;
      else total.textContent = zeroHtml;
    });
  }

  function applyEllaPageBuy(row, buyItem, config) {
    var unitMoney = formatMoney(buyItem.originalPrice, config.moneyFormat);
    var lineMoney = formatMoney(buyItem.originalLinePrice, config.moneyFormat);

    var priceWrappers = row.querySelectorAll('.cart-item__price-wrapper');
    Array.prototype.forEach.call(priceWrappers, function (wrap) {
      backupHtml(wrap);
      wrap.setAttribute(ATTR_PRICE, '1');
      wrap.classList.remove('bogo-free-ui-hide');

      // Drop sale/discounted markup so unit price uses Ella's regular color.
      var msrp = wrap.querySelector('.msrp-wrapper');
      var msrpHtml = msrp ? msrp.outerHTML : '';
      wrap.innerHTML =
        '<span class="price price--end" data-item-final-price-display="">' +
        unitMoney +
        '</span>' +
        msrpHtml;
    });

    var totals = row.querySelectorAll('.cart-item-total');
    Array.prototype.forEach.call(totals, function (total) {
      backupHtml(total);
      total.setAttribute(ATTR_PRICE, '1');
      total.setAttribute('data-price', String(buyItem.originalLinePrice));
      total.setAttribute(
        'data-original-price',
        String(buyItem.originalLinePrice),
      );
      var value = total.querySelector(
        '.cart-item-value, [data-item-price-with-quantity-display]',
      );
      if (value) value.textContent = lineMoney;
      else total.textContent = lineMoney;
    });
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

    var theme = rowTheme(row);
    if (theme === 'ella-drawer') {
      applyEllaDrawerGet(row, freeItem, config);
      return;
    }
    if (theme === 'ella-page') {
      applyEllaPageGet(row, freeItem, config);
      return;
    }

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

    var theme = rowTheme(row);
    if (theme === 'ella-drawer') {
      applyEllaDrawerBuy(row, buyItem, config);
      return;
    }
    if (theme === 'ella-page') {
      applyEllaPageBuy(row, buyItem, config);
      return;
    }

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
    // Clear hide flags left on Ella old-price nodes outside restored hosts.
    var hidden = row.querySelectorAll('.bogo-free-ui-hide');
    Array.prototype.forEach.call(hidden, function (node) {
      node.classList.remove('bogo-free-ui-hide');
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
    var activeRows = [];
    var bySurface = groupRowsBySurface(rowCandidates());

    Object.keys(bySurface).forEach(function (surface) {
      var freeUsed = {};
      var buyUsed = {};
      bySurface[surface].forEach(function (row) {
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
      // Ella theme cart surfaces
      document.querySelector('.previewCart'),
      document.querySelector('.previewCartList'),
      document.querySelector('.cart-list'),
      document.getElementById('halo-cart-sidebar'),
      document.querySelector('[data-cart-sidebar]'),
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
