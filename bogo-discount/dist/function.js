// node_modules/@shopify/shopify_function/run.ts
function run_default(userfunction) {
  try {
    ShopifyFunction;
  } catch (e) {
    throw new Error(
      "ShopifyFunction is not defined. Please rebuild your function using the latest version of Shopify CLI."
    );
  }
  const input_obj = ShopifyFunction.readInput();
  const output_obj = userfunction(input_obj);
  ShopifyFunction.writeOutput(output_obj);
}

// extensions/bogo-discount/src/bogo-logic.js
var DEFAULT_FLOOR_PRICE = 0.5;
var ITEM_TYPE_PRODUCTS = "products";
var ITEM_TYPE_COLLECTIONS = "collections";
var PURCHASE_TYPE_ONE_TIME = "one_time";
var PURCHASE_TYPE_SUBSCRIPTION = "subscription";
var PURCHASE_TYPE_BOTH = "both";
function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}
function toItemType(value) {
  return value === ITEM_TYPE_COLLECTIONS ? ITEM_TYPE_COLLECTIONS : ITEM_TYPE_PRODUCTS;
}
function toPurchaseType(value) {
  if (value === PURCHASE_TYPE_SUBSCRIPTION) {
    return PURCHASE_TYPE_SUBSCRIPTION;
  }
  if (value === PURCHASE_TYPE_BOTH) {
    return PURCHASE_TYPE_BOTH;
  }
  return PURCHASE_TYPE_ONE_TIME;
}
function parseBogoConfig(metafieldValue) {
  try {
    const parsed = JSON.parse(metafieldValue || "{}");
    const maxUsesPerOrder = !Object.prototype.hasOwnProperty.call(
      parsed,
      "maxUsesPerOrder"
    ) ? 1 : parsed.maxUsesPerOrder === null || parsed.maxUsesPerOrder === "" ? null : toPositiveInt(parsed.maxUsesPerOrder, 1);
    return {
      buyProductIds: new Set(parsed.buyProductIds ?? []),
      getProductIds: new Set(parsed.getProductIds ?? []),
      buyCollectionIds: parsed.buyCollectionIds ?? [],
      getCollectionIds: parsed.getCollectionIds ?? [],
      buyItemType: toItemType(parsed.buyItemType),
      getItemType: toItemType(parsed.getItemType),
      buyPurchaseType: toPurchaseType(parsed.buyPurchaseType),
      getPurchaseType: toPurchaseType(parsed.getPurchaseType),
      buyQuantity: toPositiveInt(parsed.buyQuantity, 1),
      getQuantity: toPositiveInt(parsed.getQuantity, 1),
      floorPrice: Number(parsed.floorPrice ?? DEFAULT_FLOOR_PRICE),
      displayName: typeof parsed.displayName === "string" ? parsed.displayName.trim() : "",
      maxUsesPerOrder
    };
  } catch {
    return {
      buyProductIds: /* @__PURE__ */ new Set(),
      getProductIds: /* @__PURE__ */ new Set(),
      buyCollectionIds: [],
      getCollectionIds: [],
      buyItemType: ITEM_TYPE_PRODUCTS,
      getItemType: ITEM_TYPE_PRODUCTS,
      buyPurchaseType: PURCHASE_TYPE_ONE_TIME,
      getPurchaseType: PURCHASE_TYPE_ONE_TIME,
      buyQuantity: 1,
      getQuantity: 1,
      floorPrice: DEFAULT_FLOOR_PRICE,
      displayName: "",
      maxUsesPerOrder: 1
    };
  }
}
function resolveDiscountMessage(config, triggeringDiscountCode) {
  const code = typeof triggeringDiscountCode === "string" ? triggeringDiscountCode.trim() : "";
  if (code) {
    return code;
  }
  const displayName = typeof config?.displayName === "string" ? config.displayName.trim() : "";
  if (displayName) {
    return displayName;
  }
  return "";
}
function formatDecimal(amount) {
  return Number(amount).toFixed(2);
}
function lineMatchesPurchaseType(line, purchaseType) {
  if (purchaseType === PURCHASE_TYPE_BOTH) {
    return true;
  }
  const isSubscription = Boolean(line?.sellingPlanAllocation?.sellingPlan?.id);
  if (purchaseType === PURCHASE_TYPE_SUBSCRIPTION) {
    return isSubscription;
  }
  return !isSubscription;
}
function productMatchesSelection(product, itemType, productIds, side) {
  if (!product?.id) {
    return false;
  }
  if (itemType === ITEM_TYPE_COLLECTIONS) {
    return side === "buy" ? Boolean(product.inBuyCollections) : Boolean(product.inGetCollections);
  }
  return productIds.has(product.id);
}
function expandCartUnits(lines, matches, purchaseType = PURCHASE_TYPE_BOTH) {
  const units = [];
  for (const line of lines) {
    if (!lineMatchesPurchaseType(line, purchaseType)) {
      continue;
    }
    const product = line.merchandise?.product;
    if (!product || !matches(product)) {
      continue;
    }
    const unitPrice = Number(line.cost.amountPerQuantity.amount);
    for (let i = 0; i < line.quantity; i++) {
      units.push({ lineId: line.id, unitPrice });
    }
  }
  return units;
}
function addGroupedDiscount(grouped, lineId, amount) {
  const rounded = Number(formatDecimal(amount));
  if (rounded <= 0) {
    return;
  }
  if (!grouped.has(lineId)) {
    grouped.set(lineId, /* @__PURE__ */ new Map());
  }
  const byAmount = grouped.get(lineId);
  byAmount.set(rounded, (byAmount.get(rounded) ?? 0) + 1);
}
function allocateExactAmounts(totalAmount, unitCount) {
  if (unitCount < 1) {
    return [];
  }
  const totalCents = Math.round(Number(totalAmount) * 100);
  const baseCents = Math.floor(totalCents / unitCount);
  let remainder = totalCents - baseCents * unitCount;
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
function computeQuantityAwareBogoGroups(buyUnits, getUnits, buyQuantity, getQuantity, floorPrice, maxUsesPerOrder = null) {
  const safeBuyQty = Math.max(1, Math.floor(buyQuantity));
  const safeGetQty = Math.max(1, Math.floor(getQuantity));
  let sets = Math.min(
    Math.floor(buyUnits.length / safeBuyQty),
    Math.floor(getUnits.length / safeGetQty)
  );
  if (maxUsesPerOrder !== null && maxUsesPerOrder !== void 0 && Number.isFinite(maxUsesPerOrder) && maxUsesPerOrder >= 1) {
    sets = Math.min(sets, Math.floor(maxUsesPerOrder));
  }
  if (sets < 1) {
    return null;
  }
  if (buyUnits.length !== sets * safeBuyQty) {
    return null;
  }
  const buyLineTotals = /* @__PURE__ */ new Map();
  const get = /* @__PURE__ */ new Map();
  const qualifyingBuyUnits = buyUnits.slice(0, sets * safeBuyQty);
  const rewardGetUnits = getUnits.slice(0, sets * safeGetQty);
  for (const getUnit of rewardGetUnits) {
    const getDiscount = Math.max(0, getUnit.unitPrice - floorPrice);
    addGroupedDiscount(get, getUnit.lineId, getDiscount);
  }
  const totalAbsorb = sets * safeGetQty * floorPrice;
  const buyAmounts = allocateExactAmounts(
    totalAbsorb,
    qualifyingBuyUnits.length
  );
  const buyLineCents = /* @__PURE__ */ new Map();
  qualifyingBuyUnits.forEach((buyUnit, index) => {
    const buyDiscount = Math.min(buyAmounts[index] ?? 0, buyUnit.unitPrice);
    const cents = Math.round(buyDiscount * 100);
    buyLineCents.set(
      buyUnit.lineId,
      (buyLineCents.get(buyUnit.lineId) ?? 0) + cents
    );
  });
  for (const [lineId, cents] of buyLineCents) {
    buyLineTotals.set(lineId, cents / 100);
  }
  return { buyLineTotals, get };
}
function groupedDiscountsToCandidates(grouped, message) {
  const candidates = [];
  const label = typeof message === "string" ? message.trim() : "";
  for (const [lineId, byAmount] of grouped) {
    for (const [amount, quantity] of byAmount) {
      const candidate = {
        targets: [{ cartLine: { id: lineId, quantity } }],
        value: {
          fixedAmount: {
            amount: formatDecimal(amount),
            appliesToEachItem: true
          }
        }
      };
      if (label) {
        candidate.message = label;
      }
      candidates.push(candidate);
    }
  }
  return candidates;
}
function lineTotalDiscountsToCandidates(lineTotals, message) {
  const candidates = [];
  const label = typeof message === "string" ? message.trim() : "";
  for (const [lineId, amount] of lineTotals) {
    const rounded = Number(formatDecimal(amount));
    if (rounded <= 0) {
      continue;
    }
    const candidate = {
      targets: [{ cartLine: { id: lineId } }],
      value: {
        fixedAmount: {
          amount: formatDecimal(rounded),
          appliesToEachItem: false
        }
      }
    };
    if (label) {
      candidate.message = label;
    }
    candidates.push(candidate);
  }
  return candidates;
}
function buildBogoDiscountCandidates(input) {
  const config = parseBogoConfig(input.discount.metafield?.value);
  const message = resolveDiscountMessage(
    config,
    input.triggeringDiscountCode
  );
  const buyConfigured = config.buyItemType === ITEM_TYPE_COLLECTIONS ? config.buyCollectionIds.length > 0 : config.buyProductIds.size > 0;
  const getConfigured = config.getItemType === ITEM_TYPE_COLLECTIONS ? config.getCollectionIds.length > 0 : config.getProductIds.size > 0;
  if (!buyConfigured || !getConfigured) {
    return [];
  }
  const buyUnits = expandCartUnits(
    input.cart.lines,
    (product) => productMatchesSelection(
      product,
      config.buyItemType,
      config.buyProductIds,
      "buy"
    ),
    config.buyPurchaseType
  );
  const getUnits = expandCartUnits(
    input.cart.lines,
    (product) => productMatchesSelection(
      product,
      config.getItemType,
      config.getProductIds,
      "get"
    ),
    config.getPurchaseType
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
    config.maxUsesPerOrder
  );
  if (!groups) {
    return [];
  }
  return [
    ...groupedDiscountsToCandidates(groups.get, message),
    ...lineTotalDiscountsToCandidates(groups.buyLineTotals, "")
  ];
}

// extensions/bogo-discount/src/cart_lines_discounts_generate_run.js
function cartLinesDiscountsGenerateRun(input) {
  if (!input.cart.lines.length) {
    return { operations: [] };
  }
  const hasProductDiscountClass = input.discount.discountClasses.includes(
    "PRODUCT" /* Product */
  );
  if (!hasProductDiscountClass) {
    return { operations: [] };
  }
  const candidates = buildBogoDiscountCandidates(input);
  if (candidates.length === 0) {
    return { operations: [] };
  }
  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: "ALL" /* All */
        }
      }
    ]
  };
}

// extensions/bogo-discount/src/cart_delivery_options_discounts_generate_run.js
function cartDeliveryOptionsDiscountsGenerateRun(input) {
  const firstDeliveryGroup = input.cart.deliveryGroups[0];
  if (!firstDeliveryGroup) {
    return { operations: [] };
  }
  const hasShippingDiscountClass = input.discount.discountClasses.includes(
    "SHIPPING" /* Shipping */
  );
  if (!hasShippingDiscountClass) {
    return { operations: [] };
  }
  return {
    operations: [
      {
        deliveryDiscountsAdd: {
          candidates: [
            {
              message: "FREE DELIVERY",
              targets: [
                {
                  deliveryGroup: {
                    id: firstDeliveryGroup.id
                  }
                }
              ],
              value: {
                percentage: {
                  value: 100
                }
              }
            }
          ],
          selectionStrategy: "ALL" /* All */
        }
      }
    ]
  };
}

// <stdin>
function cartLinesDiscountsGenerateRun2() {
  return run_default(cartLinesDiscountsGenerateRun);
}
function cartDeliveryOptionsDiscountsGenerateRun2() {
  return run_default(cartDeliveryOptionsDiscountsGenerateRun);
}
export {
  cartDeliveryOptionsDiscountsGenerateRun2 as cartDeliveryOptionsDiscountsGenerateRun,
  cartLinesDiscountsGenerateRun2 as cartLinesDiscountsGenerateRun
};
