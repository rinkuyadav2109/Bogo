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
function parseBogoConfig(metafieldValue) {
  try {
    const parsed = JSON.parse(metafieldValue || "{}");
    return {
      buyProductIds: new Set(parsed.buyProductIds ?? []),
      getProductIds: new Set(parsed.getProductIds ?? []),
      floorPrice: Number(parsed.floorPrice ?? DEFAULT_FLOOR_PRICE)
    };
  } catch {
    return {
      buyProductIds: /* @__PURE__ */ new Set(),
      getProductIds: /* @__PURE__ */ new Set(),
      floorPrice: DEFAULT_FLOOR_PRICE
    };
  }
}
function formatDecimal(amount) {
  return Number(amount).toFixed(2);
}
function expandCartUnits(lines, productIds) {
  const units = [];
  for (const line of lines) {
    const productId = line.merchandise?.product?.id;
    if (!productId || !productIds.has(productId)) {
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
  if (amount <= 0) {
    return;
  }
  if (!grouped.has(lineId)) {
    grouped.set(lineId, /* @__PURE__ */ new Map());
  }
  const byAmount = grouped.get(lineId);
  byAmount.set(amount, (byAmount.get(amount) ?? 0) + 1);
}
function computeBogoDiscountGroups(buyUnits, getUnits, floorPrice) {
  const pairCount = Math.min(buyUnits.length, getUnits.length);
  const buy = /* @__PURE__ */ new Map();
  const get = /* @__PURE__ */ new Map();
  for (let i = 0; i < pairCount; i++) {
    const buyUnit = buyUnits[i];
    const getUnit = getUnits[i];
    const getDiscount = Math.max(0, getUnit.unitPrice - floorPrice);
    const buyDiscount = Math.min(floorPrice, buyUnit.unitPrice);
    addGroupedDiscount(get, getUnit.lineId, getDiscount);
    addGroupedDiscount(buy, buyUnit.lineId, buyDiscount);
  }
  return { buy, get };
}
function groupedDiscountsToCandidates(grouped, message) {
  const candidates = [];
  for (const [lineId, byAmount] of grouped) {
    for (const [amount, quantity] of byAmount) {
      candidates.push({
        message,
        targets: [{ cartLine: { id: lineId, quantity } }],
        value: {
          fixedAmount: {
            amount: formatDecimal(amount),
            appliesToEachItem: true
          }
        }
      });
    }
  }
  return candidates;
}
function buildBogoDiscountCandidates(input) {
  const config = parseBogoConfig(input.discount.metafield?.value);
  if (config.buyProductIds.size === 0 || config.getProductIds.size === 0) {
    return [];
  }
  const buyUnits = expandCartUnits(input.cart.lines, config.buyProductIds);
  const getUnits = expandCartUnits(input.cart.lines, config.getProductIds);
  if (buyUnits.length === 0 || getUnits.length === 0) {
    return [];
  }
  const { buy, get } = computeBogoDiscountGroups(
    buyUnits,
    getUnits,
    config.floorPrice
  );
  return [
    ...groupedDiscountsToCandidates(
      get,
      "Buy X Get Y \u2014 get item at minimum price"
    ),
    ...groupedDiscountsToCandidates(
      buy,
      "Buy X Get Y \u2014 qualifying item adjustment"
    )
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
