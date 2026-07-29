/** @typedef {{ lineId: string, unitPrice: number }} CartUnit */

export const DEFAULT_FLOOR_PRICE = 0.5;

/**
 * @param {string | null | undefined} metafieldValue
 * @returns {{ buyProductIds: Set<string>, getProductIds: Set<string>, floorPrice: number }}
 */
export function parseBogoConfig(metafieldValue) {
  try {
    const parsed = JSON.parse(metafieldValue || "{}");
    return {
      buyProductIds: new Set(parsed.buyProductIds ?? []),
      getProductIds: new Set(parsed.getProductIds ?? []),
      floorPrice: Number(parsed.floorPrice ?? DEFAULT_FLOOR_PRICE),
    };
  } catch {
    return {
      buyProductIds: new Set(),
      getProductIds: new Set(),
      floorPrice: DEFAULT_FLOOR_PRICE,
    };
  }
}

/**
 * @param {string | number} amount
 * @returns {string}
 */
export function formatDecimal(amount) {
  return Number(amount).toFixed(2);
}

/**
 * @param {Array<{
 *   id: string,
 *   quantity: number,
 *   cost: { amountPerQuantity: { amount: string } },
 *   merchandise?: { product?: { id: string } | null } | null
 * }>} lines
 * @param {Set<string>} productIds
 * @returns {CartUnit[]}
 */
export function expandCartUnits(lines, productIds) {
  /** @type {CartUnit[]} */
  const units = [];

  for (const line of lines) {
    const productId = line.merchandise?.product?.id;
    if (!productId || !productIds.has(productId)) {
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
  if (amount <= 0) {
    return;
  }

  if (!grouped.has(lineId)) {
    grouped.set(lineId, new Map());
  }

  const byAmount = grouped.get(lineId);
  byAmount.set(amount, (byAmount.get(amount) ?? 0) + 1);
}

/**
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
 * @param {Map<string, Map<number, number>>} grouped
 * @param {string} message
 * @returns {Array<{
 *   message: string,
 *   targets: Array<{ cartLine: { id: string, quantity: number } }>,
 *   value: { fixedAmount: { amount: string, appliesToEachItem: boolean } }
 * }>}
 */
export function groupedDiscountsToCandidates(grouped, message) {
  /** @type {Array<{
   *   message: string,
   *   targets: Array<{ cartLine: { id: string, quantity: number } }>,
   *   value: { fixedAmount: { amount: string, appliesToEachItem: boolean } }
   * }>} */
  const candidates = [];

  for (const [lineId, byAmount] of grouped) {
    for (const [amount, quantity] of byAmount) {
      candidates.push({
        message,
        targets: [{cartLine: {id: lineId, quantity}}],
        value: {
          fixedAmount: {
            amount: formatDecimal(amount),
            appliesToEachItem: true,
          },
        },
      });
    }
  }

  return candidates;
}

/**
 * @param {{
 *   cart: { lines: Array<{
 *     id: string,
 *     quantity: number,
 *     cost: { amountPerQuantity: { amount: string } },
 *     merchandise?: { product?: { id: string } | null } | null
 *   }> },
 *   discount: { metafield?: { value?: string | null } | null }
 * }} input
 * @returns {Array<{
 *   message: string,
 *   targets: Array<{ cartLine: { id: string, quantity: number } }>,
 *   value: { fixedAmount: { amount: string, appliesToEachItem: boolean } }
 * }>}
 */
export function buildBogoDiscountCandidates(input) {
  const config = parseBogoConfig(input.discount.metafield?.value);

  if (config.buyProductIds.size === 0 || config.getProductIds.size === 0) {
    return [];
  }

  const buyUnits = expandCartUnits(input.cart.lines, config.buyProductIds);
  const getUnits = expandCartUnits(input.cart.lines, config.getProductIds);

  if (buyUnits.length === 0 || getUnits.length === 0) {
    return [];
  }

  const {buy, get} = computeBogoDiscountGroups(
    buyUnits,
    getUnits,
    config.floorPrice,
  );

  return [
    ...groupedDiscountsToCandidates(
      get,
      "Buy X Get Y — get item at minimum price",
    ),
    ...groupedDiscountsToCandidates(
      buy,
      "Buy X Get Y — qualifying item adjustment",
    ),
  ];
}
