/** @typedef {{ lineId: string, unitPrice: number }} CartUnit */

export const DEFAULT_FLOOR_PRICE = 0.5;
export const ITEM_TYPE_PRODUCTS = 'products';
export const ITEM_TYPE_COLLECTIONS = 'collections';
export const PURCHASE_TYPE_ONE_TIME = 'one_time';
export const PURCHASE_TYPE_SUBSCRIPTION = 'subscription';
export const PURCHASE_TYPE_BOTH = 'both';

/**
 * @param {unknown} value
 * @param {number | null} fallback
 * @returns {number | null}
 */
function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

/**
 * @param {unknown} value
 * @returns {'products' | 'collections'}
 */
function toItemType(value) {
  return value === ITEM_TYPE_COLLECTIONS
    ? ITEM_TYPE_COLLECTIONS
    : ITEM_TYPE_PRODUCTS;
}

/**
 * @param {unknown} value
 * @returns {'one_time' | 'subscription' | 'both'}
 */
function toPurchaseType(value) {
  if (value === PURCHASE_TYPE_SUBSCRIPTION) {
    return PURCHASE_TYPE_SUBSCRIPTION;
  }
  if (value === PURCHASE_TYPE_BOTH) {
    return PURCHASE_TYPE_BOTH;
  }
  return PURCHASE_TYPE_ONE_TIME;
}

/**
 * @param {string | null | undefined} metafieldValue
 * @returns {{
 *   buyProductIds: Set<string>,
 *   getProductIds: Set<string>,
 *   buyCollectionIds: string[],
 *   getCollectionIds: string[],
 *   buyItemType: 'products' | 'collections',
 *   getItemType: 'products' | 'collections',
 *   buyPurchaseType: 'one_time' | 'subscription' | 'both',
 *   getPurchaseType: 'one_time' | 'subscription' | 'both',
 *   buyQuantity: number,
 *   getQuantity: number,
 *   floorPrice: number,
 *   displayName: string,
 *   maxUsesPerOrder: number | null,
 *   buyVariantIds: Set<string>,
 *   getVariantIds: Set<string>
 * }}
 */
export function parseBogoConfig(metafieldValue) {
  try {
    const parsed = JSON.parse(metafieldValue || '{}');
    // Missing or null → unlimited stacking (native BXGY). Number → that cap.
    const maxUsesRaw = parsed.maxUsesPerOrder;
    const maxUsesPerOrder =
      maxUsesRaw === null ||
      maxUsesRaw === undefined ||
      maxUsesRaw === ''
        ? null
        : toPositiveInt(maxUsesRaw, null);

    return {
      buyProductIds: new Set(parsed.buyProductIds ?? []),
      getProductIds: new Set(parsed.getProductIds ?? []),
      buyVariantIds: new Set(parsed.buyVariantIds ?? []),
      getVariantIds: new Set(parsed.getVariantIds ?? []),
      buyCollectionIds: parsed.buyCollectionIds ?? [],
      getCollectionIds: parsed.getCollectionIds ?? [],
      buyItemType: toItemType(parsed.buyItemType),
      getItemType: toItemType(parsed.getItemType),
      buyPurchaseType: toPurchaseType(parsed.buyPurchaseType),
      getPurchaseType: toPurchaseType(parsed.getPurchaseType),
      buyQuantity: toPositiveInt(parsed.buyQuantity, 1),
      getQuantity: toPositiveInt(parsed.getQuantity, 1),
      floorPrice: Number(parsed.floorPrice ?? DEFAULT_FLOOR_PRICE),
      displayName:
        typeof parsed.displayName === 'string' ? parsed.displayName.trim() : '',
      maxUsesPerOrder,
    };
  } catch {
    return {
      buyProductIds: new Set(),
      getProductIds: new Set(),
      buyVariantIds: new Set(),
      getVariantIds: new Set(),
      buyCollectionIds: [],
      getCollectionIds: [],
      buyItemType: ITEM_TYPE_PRODUCTS,
      getItemType: ITEM_TYPE_PRODUCTS,
      buyPurchaseType: PURCHASE_TYPE_ONE_TIME,
      getPurchaseType: PURCHASE_TYPE_ONE_TIME,
      buyQuantity: 1,
      getQuantity: 1,
      floorPrice: DEFAULT_FLOOR_PRICE,
      displayName: '',
      maxUsesPerOrder: null,
    };
  }
}

/**
 * Cart/checkout label: entered code wins; otherwise the saved discount title.
 *
 * @param {{ displayName?: string }} config
 * @param {string | null | undefined} triggeringDiscountCode
 * @returns {string}
 */
export function resolveDiscountMessage(config, triggeringDiscountCode) {
  const code =
    typeof triggeringDiscountCode === 'string'
      ? triggeringDiscountCode.trim()
      : '';
  if (code) {
    return code;
  }

  const displayName =
    typeof config?.displayName === 'string' ? config.displayName.trim() : '';
  if (displayName) {
    return displayName;
  }

  return '';
}

/**
 * @param {string | number} amount
 * @returns {string}
 */
export function formatDecimal(amount) {
  return Number(amount).toFixed(2);
}

/**
 * @param {{ sellingPlanAllocation?: { sellingPlan?: { id?: string | null } | null } | null } | null | undefined} line
 * @param {'one_time' | 'subscription' | 'both'} purchaseType
 * @returns {boolean}
 */
export function lineMatchesPurchaseType(line, purchaseType) {
  if (purchaseType === PURCHASE_TYPE_BOTH) {
    return true;
  }

  const isSubscription = Boolean(line?.sellingPlanAllocation?.sellingPlan?.id);
  if (purchaseType === PURCHASE_TYPE_SUBSCRIPTION) {
    return isSubscription;
  }
  return !isSubscription;
}

/**
 * @param {{
 *   id?: string | null,
 *   product?: {
 *     id?: string | null,
 *     inBuyCollections?: boolean | null,
 *     inGetCollections?: boolean | null
 *   } | null
 * } | null | undefined} merchandise
 * @param {'products' | 'collections'} itemType
 * @param {Set<string>} productIds
 * @param {Set<string>} variantIds
 * @param {'buy' | 'get'} side
 * @returns {boolean}
 */
export function merchandiseMatchesSelection(
  merchandise,
  itemType,
  productIds,
  variantIds,
  side,
) {
  const product = merchandise?.product;
  if (!product?.id) {
    return false;
  }

  if (itemType === ITEM_TYPE_COLLECTIONS) {
    return side === 'buy'
      ? Boolean(product.inBuyCollections)
      : Boolean(product.inGetCollections);
  }

  // Variant-level selection wins when configured.
  if (variantIds.size > 0) {
    return Boolean(merchandise?.id && variantIds.has(merchandise.id));
  }

  return productIds.has(product.id);
}

/**
 * @deprecated Use merchandiseMatchesSelection
 */
export function productMatchesSelection(product, itemType, productIds, side) {
  return merchandiseMatchesSelection(
    {product},
    itemType,
    productIds,
    new Set(),
    side,
  );
}

/**
 * @param {Array<{
 *   id: string,
 *   quantity: number,
 *   cost: { amountPerQuantity: { amount: string } },
 *   sellingPlanAllocation?: { sellingPlan?: { id?: string | null } | null } | null,
 *   merchandise?: {
 *     id?: string | null,
 *     product?: {
 *       id?: string | null,
 *       inBuyCollections?: boolean | null,
 *       inGetCollections?: boolean | null
 *     } | null
 *   } | null
 * }>} lines
 * @param {(merchandise: {
 *   id?: string | null,
 *   product?: {
 *     id?: string | null,
 *     inBuyCollections?: boolean | null,
 *     inGetCollections?: boolean | null
 *   } | null
 * }) => boolean} matches
 * @param {'one_time' | 'subscription' | 'both'} purchaseType
 * @returns {CartUnit[]}
 */
export function expandCartUnits(lines, matches, purchaseType = PURCHASE_TYPE_BOTH) {
  /** @type {CartUnit[]} */
  const units = [];

  for (const line of lines) {
    if (!lineMatchesPurchaseType(line, purchaseType)) {
      continue;
    }

    const merchandise = line.merchandise;
    if (!merchandise || !matches(merchandise)) {
      continue;
    }

    const unitPrice = Number(line.cost.amountPerQuantity.amount);
    for (let i = 0; i < line.quantity; i++) {
      units.push({lineId: line.id, unitPrice});
    }
  }

  return units;
}

/**
 * @param {Map<string, Map<number, number>>} grouped
 * @param {string} lineId
 * @param {number} amount
 */
function addGroupedDiscount(grouped, lineId, amount) {
  const rounded = Number(formatDecimal(amount));
  if (rounded <= 0) {
    return;
  }

  if (!grouped.has(lineId)) {
    grouped.set(lineId, new Map());
  }

  const byAmount = grouped.get(lineId);
  byAmount.set(rounded, (byAmount.get(rounded) ?? 0) + 1);
}

/**
 * Classic 1:1 floor split (kept for tests / simple pairs).
 *
 * @param {CartUnit[]} buyUnits
 * @param {CartUnit[]} getUnits
 * @param {number} floorPrice
 * @returns {{ buy: Map<string, Map<number, number>>, get: Map<string, Map<number, number>> }}
 */
export function computeBogoDiscountGroups(buyUnits, getUnits, floorPrice) {
  const pairCount = Math.min(buyUnits.length, getUnits.length);
  /** @type {Map<string, Map<number, number>>} */
  const buy = new Map();
  /** @type {Map<string, Map<number, number>>} */
  const get = new Map();

  for (let i = 0; i < pairCount; i++) {
    const buyUnit = buyUnits[i];
    const getUnit = getUnits[i];

    const getDiscount = Math.max(0, getUnit.unitPrice - floorPrice);
    const buyDiscount = Math.min(floorPrice, buyUnit.unitPrice);

    addGroupedDiscount(get, getUnit.lineId, getDiscount);
    addGroupedDiscount(buy, buyUnit.lineId, buyDiscount);
  }

  return {buy, get};
}

/**
 * Split a money amount across N units using integer cents so the parts
 * always sum back to the original total (avoids 0.50/3 → 0.17*3 = 0.51).
 *
 * @param {number} totalAmount
 * @param {number} unitCount
 * @returns {number[]}
 */
export function allocateExactAmounts(totalAmount, unitCount) {
  if (unitCount < 1) {
    return [];
  }

  const totalCents = Math.round(Number(totalAmount) * 100);
  const baseCents = Math.floor(totalCents / unitCount);
  let remainder = totalCents - baseCents * unitCount;
  /** @type {number[]} */
  const amounts = [];

  for (let i = 0; i < unitCount; i++) {
    const cents = baseCents + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }
    amounts.push(cents / 100);
  }

  return amounts;
}

/**
 * Requires full buy:get sets using minimum quantities (native BXGY stacking).
 * Extra buy or get units beyond completed sets stay full price; Shopify can
 * split cart lines when only the qualifying quantity is targeted.
 * Floor absorption is applied only to qualifying buy units (with quantity) so
 * leftover buy units can appear as a separate undiscouned row.
 *
 * @param {CartUnit[]} buyUnits
 * @param {CartUnit[]} getUnits
 * @param {number} buyQuantity
 * @param {number} getQuantity
 * @param {number} floorPrice
 * @param {number | null | undefined} maxUsesPerOrder
 * @returns {{
 *   buyLines: Map<string, { amount: number, quantity: number }>,
 *   get: Map<string, Map<number, number>>
 * } | null}
 */
export function computeQuantityAwareBogoGroups(
  buyUnits,
  getUnits,
  buyQuantity,
  getQuantity,
  floorPrice,
  maxUsesPerOrder = null,
) {
  const safeBuyQty = Math.max(1, Math.floor(buyQuantity));
  const safeGetQty = Math.max(1, Math.floor(getQuantity));

  let sets = Math.min(
    Math.floor(buyUnits.length / safeBuyQty),
    Math.floor(getUnits.length / safeGetQty),
  );

  if (
    maxUsesPerOrder !== null &&
    maxUsesPerOrder !== undefined &&
    Number.isFinite(maxUsesPerOrder) &&
    maxUsesPerOrder >= 1
  ) {
    sets = Math.min(sets, Math.floor(maxUsesPerOrder));
  }

  if (sets < 1) {
    return null;
  }

  /** @type {Map<string, { amount: number, quantity: number }>} */
  const buyLines = new Map();
  /** @type {Map<string, Map<number, number>>} */
  const get = new Map();

  const qualifyingBuyUnits = buyUnits.slice(0, sets * safeBuyQty);
  const rewardGetUnits = getUnits.slice(0, sets * safeGetQty);

  for (const getUnit of rewardGetUnits) {
    const getDiscount = Math.max(0, getUnit.unitPrice - floorPrice);
    addGroupedDiscount(get, getUnit.lineId, getDiscount);
  }

  // Absorb exactly (sets * getQuantity * floor) from qualifying buy units.
  const totalAbsorb = sets * safeGetQty * floorPrice;
  const buyAmounts = allocateExactAmounts(
    totalAbsorb,
    qualifyingBuyUnits.length,
  );
  /** @type {Map<string, { cents: number, quantity: number }>} */
  const buyLineAccum = new Map();

  qualifyingBuyUnits.forEach((buyUnit, index) => {
    const buyDiscount = Math.min(buyAmounts[index] ?? 0, buyUnit.unitPrice);
    const cents = Math.round(buyDiscount * 100);
    const current = buyLineAccum.get(buyUnit.lineId) ?? {
      cents: 0,
      quantity: 0,
    };
    buyLineAccum.set(buyUnit.lineId, {
      cents: current.cents + cents,
      quantity: current.quantity + 1,
    });
  });

  for (const [lineId, {cents, quantity}] of buyLineAccum) {
    buyLines.set(lineId, {amount: cents / 100, quantity});
  }

  return {buyLines, get};
}

/**
 * @param {Map<string, Map<number, number>>} grouped
 * @param {string} message
 * @returns {Array<{
 *   message?: string,
 *   targets: Array<{ cartLine: { id: string, quantity?: number } }>,
 *   value: { fixedAmount: { amount: string, appliesToEachItem: boolean } }
 * }>}
 */
export function groupedDiscountsToCandidates(grouped, message) {
  /** @type {Array<{
   *   message?: string,
   *   targets: Array<{ cartLine: { id: string, quantity?: number } }>,
   *   value: { fixedAmount: { amount: string, appliesToEachItem: boolean } }
   * }>} */
  const candidates = [];
  const label = typeof message === 'string' ? message.trim() : '';

  for (const [lineId, byAmount] of grouped) {
    for (const [amount, quantity] of byAmount) {
      /** @type {{
       *   message?: string,
       *   targets: Array<{ cartLine: { id: string, quantity?: number } }>,
       *   value: { fixedAmount: { amount: string, appliesToEachItem: boolean } }
       * }} */
      const candidate = {
        targets: [{cartLine: {id: lineId, quantity}}],
        value: {
          fixedAmount: {
            amount: formatDecimal(amount),
            appliesToEachItem: true,
          },
        },
      };

      if (label) {
        candidate.message = label;
      }

      candidates.push(candidate);
    }
  }

  return candidates;
}

/**
 * Floor absorb on the qualifying buy quantity only so leftover buy units can
 * split onto a separate undiscouned cart line (native BXGY style).
 *
 * @param {Map<string, { amount: number, quantity: number }>} buyLines
 * @param {string} message
 * @returns {Array<{
 *   message?: string,
 *   targets: Array<{ cartLine: { id: string, quantity?: number } }>,
 *   value: { fixedAmount: { amount: string, appliesToEachItem: boolean } }
 * }>}
 */
export function buyAbsorbDiscountsToCandidates(buyLines, message) {
  /** @type {Array<{
   *   message?: string,
   *   targets: Array<{ cartLine: { id: string, quantity?: number } }>,
   *   value: { fixedAmount: { amount: string, appliesToEachItem: boolean } }
   * }>} */
  const candidates = [];
  const label = typeof message === 'string' ? message.trim() : '';

  for (const [lineId, {amount, quantity}] of buyLines) {
    const rounded = Number(formatDecimal(amount));
    if (rounded <= 0 || quantity < 1) {
      continue;
    }

    /** @type {{
     *   message?: string,
     *   targets: Array<{ cartLine: { id: string, quantity?: number } }>,
     *   value: { fixedAmount: { amount: string, appliesToEachItem: boolean } }
     * }} */
    const candidate = {
      targets: [{cartLine: {id: lineId, quantity}}],
      value: {
        fixedAmount: {
          amount: formatDecimal(rounded),
          appliesToEachItem: false,
        },
      },
    };

    if (label) {
      candidate.message = label;
    }

    candidates.push(candidate);
  }

  return candidates;
}

/**
 * One fixed amount per cart line (appliesToEachItem: false) so multi-qty
 * buy lines stay as a single row in the cart.
 *
 * @param {Map<string, number>} lineTotals
 * @param {string} message
 * @returns {Array<{
 *   message?: string,
 *   targets: Array<{ cartLine: { id: string } }>,
 *   value: { fixedAmount: { amount: string, appliesToEachItem: boolean } }
 * }>}
 */
export function lineTotalDiscountsToCandidates(lineTotals, message) {
  /** @type {Map<string, { amount: number, quantity: number }>} */
  const buyLines = new Map();
  for (const [lineId, amount] of lineTotals) {
    buyLines.set(lineId, {amount, quantity: 1});
  }
  return buyAbsorbDiscountsToCandidates(buyLines, message).map(candidate => {
    const next = {
      ...candidate,
      targets: candidate.targets.map(target => ({
        cartLine: {id: target.cartLine.id},
      })),
    };
    return next;
  });
}

/**
 * @param {{
 *   cart: { lines: Array<{
 *     id: string,
 *     quantity: number,
 *     cost: { amountPerQuantity: { amount: string } },
 *     sellingPlanAllocation?: { sellingPlan?: { id?: string | null } | null } | null,
 *     merchandise?: {
 *       product?: {
 *         id?: string | null,
 *         inBuyCollections?: boolean | null,
 *         inGetCollections?: boolean | null
 *       } | null
 *     } | null
 *   }> },
 *   discount: { metafield?: { value?: string | null } | null },
 *   triggeringDiscountCode?: string | null
 * }} input
 * @returns {Array<{
 *   message: string,
 *   targets: Array<{ cartLine: { id: string, quantity: number } }>,
 *   value: { fixedAmount: { amount: string, appliesToEachItem: boolean } }
 * }>}
 */
export function buildBogoDiscountCandidates(input) {
  const config = parseBogoConfig(input.discount.metafield?.value);
  const message = resolveDiscountMessage(
    config,
    input.triggeringDiscountCode,
  );

  const buyConfigured =
    config.buyItemType === ITEM_TYPE_COLLECTIONS
      ? config.buyCollectionIds.length > 0
      : config.buyProductIds.size > 0 || config.buyVariantIds.size > 0;
  const getConfigured =
    config.getItemType === ITEM_TYPE_COLLECTIONS
      ? config.getCollectionIds.length > 0
      : config.getProductIds.size > 0 || config.getVariantIds.size > 0;

  if (!buyConfigured || !getConfigured) {
    return [];
  }

  const buyUnits = expandCartUnits(
    input.cart.lines,
    merchandise =>
      merchandiseMatchesSelection(
        merchandise,
        config.buyItemType,
        config.buyProductIds,
        config.buyVariantIds,
        'buy',
      ),
    config.buyPurchaseType,
  );
  const getUnits = expandCartUnits(
    input.cart.lines,
    merchandise =>
      merchandiseMatchesSelection(
        merchandise,
        config.getItemType,
        config.getProductIds,
        config.getVariantIds,
        'get',
      ),
    config.getPurchaseType,
  );

  if (buyUnits.length < config.buyQuantity || getUnits.length < config.getQuantity) {
    return [];
  }

  const groups = computeQuantityAwareBogoGroups(
    buyUnits,
    getUnits,
    config.buyQuantity,
    config.getQuantity,
    config.floorPrice,
    config.maxUsesPerOrder,
  );

  if (!groups) {
    return [];
  }

  // Get reward units + qualifying buy absorb (quantity-scoped so leftovers split).
  return [
    ...groupedDiscountsToCandidates(groups.get, message),
    ...buyAbsorbDiscountsToCandidates(groups.buyLines, message),
  ];
}
