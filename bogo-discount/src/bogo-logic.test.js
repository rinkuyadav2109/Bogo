import {describe, expect, test} from 'vitest';
import {
  buildBogoDiscountCandidates,
  computeBogoDiscountGroups,
  computeQuantityAwareBogoGroups,
  parseBogoConfig,
} from './bogo-logic';

describe('parseBogoConfig', () => {
  test('parses buy/get product ids and floor price', () => {
    const config = parseBogoConfig(
      JSON.stringify({
        buyProductIds: ['gid://shopify/Product/1'],
        getProductIds: ['gid://shopify/Product/2'],
        floorPrice: 0.5,
      }),
    );

    expect(config.buyProductIds.has('gid://shopify/Product/1')).toBe(true);
    expect(config.getProductIds.has('gid://shopify/Product/2')).toBe(true);
    expect(config.floorPrice).toBe(0.5);
    expect(config.buyQuantity).toBe(1);
    expect(config.getQuantity).toBe(1);
    expect(config.buyItemType).toBe('products');
    expect(config.buyPurchaseType).toBe('one_time');
    expect(config.maxUsesPerOrder).toBe(1);
  });

  test('treats explicit null maxUsesPerOrder as unlimited', () => {
    const config = parseBogoConfig(
      JSON.stringify({
        buyProductIds: ['gid://shopify/Product/1'],
        getProductIds: ['gid://shopify/Product/2'],
        maxUsesPerOrder: null,
      }),
    );

    expect(config.maxUsesPerOrder).toBeNull();
  });

  test('parses quantities, item types, and collection ids', () => {
    const config = parseBogoConfig(
      JSON.stringify({
        buyCollectionIds: ['gid://shopify/Collection/1'],
        getCollectionIds: ['gid://shopify/Collection/2'],
        buyItemType: 'collections',
        getItemType: 'collections',
        buyPurchaseType: 'both',
        buyQuantity: 2,
        getQuantity: 1,
        floorPrice: 0.5,
      }),
    );

    expect(config.buyCollectionIds).toEqual(['gid://shopify/Collection/1']);
    expect(config.getCollectionIds).toEqual(['gid://shopify/Collection/2']);
    expect(config.buyItemType).toBe('collections');
    expect(config.getItemType).toBe('collections');
    expect(config.buyPurchaseType).toBe('both');
    expect(config.buyQuantity).toBe(2);
    expect(config.getQuantity).toBe(1);
  });
});

describe('computeBogoDiscountGroups', () => {
  test('splits discount between buy and get for 1:1 pair', () => {
    const {buy, get} = computeBogoDiscountGroups(
      [{lineId: 'line-x', unitPrice: 200}],
      [{lineId: 'line-y', unitPrice: 100}],
      0.5,
    );

    expect(get.get('line-y')?.get(99.5)).toBe(1);
    expect(buy.get('line-x')?.get(0.5)).toBe(1);
  });
});

describe('computeQuantityAwareBogoGroups', () => {
  test('requires configured buy quantity before rewarding get units', () => {
    const groups = computeQuantityAwareBogoGroups(
      [
        {lineId: 'line-x', unitPrice: 200},
        {lineId: 'line-x', unitPrice: 200},
      ],
      [{lineId: 'line-y', unitPrice: 100}],
      2,
      1,
      0.5,
    );

    expect(groups?.get.get('line-y')?.get(99.5)).toBe(1);
    // One line-level buy absorb keeps the multi-qty line intact.
    expect(groups?.buyLineTotals.get('line-x')).toBe(0.5);
  });

  test('keeps buy absorption exact when floor does not divide evenly', () => {
    const groups = computeQuantityAwareBogoGroups(
      [
        {lineId: 'line-x', unitPrice: 24.95},
        {lineId: 'line-x', unitPrice: 24.95},
        {lineId: 'line-x', unitPrice: 24.95},
      ],
      [{lineId: 'line-y', unitPrice: 600}],
      3,
      1,
      0.5,
    );

    expect(groups?.buyLineTotals.get('line-x')).toBe(0.5);
    expect(groups?.get.get('line-y')?.get(599.5)).toBe(1);
  });

  test('returns null when buy quantity is not met', () => {
    const groups = computeQuantityAwareBogoGroups(
      [{lineId: 'line-x', unitPrice: 200}],
      [{lineId: 'line-y', unitPrice: 100}],
      2,
      1,
      0.5,
    );

    expect(groups).toBeNull();
  });

  test('returns null when buy quantity is greater than an exact set', () => {
    const groups = computeQuantityAwareBogoGroups(
      [
        {lineId: 'line-x', unitPrice: 24.95},
        {lineId: 'line-x', unitPrice: 24.95},
        {lineId: 'line-x', unitPrice: 24.95},
      ],
      [{lineId: 'line-y', unitPrice: 749.95}],
      2,
      1,
      0.5,
      1,
    );

    expect(groups).toBeNull();
  });

  test('discounts only reward get units when get quantity is greater', () => {
    const groups = computeQuantityAwareBogoGroups(
      [
        {lineId: 'line-x', unitPrice: 24.95},
        {lineId: 'line-x', unitPrice: 24.95},
      ],
      [
        {lineId: 'line-y', unitPrice: 749.95},
        {lineId: 'line-y', unitPrice: 749.95},
      ],
      2,
      1,
      0.5,
      1,
    );

    expect(groups?.get.get('line-y')?.get(749.45)).toBe(1);
    expect(groups?.buyLineTotals.get('line-x')).toBe(0.5);
  });
});

describe('buildBogoDiscountCandidates', () => {
  test('returns paired fixed-amount candidates', () => {
    const config = JSON.stringify({
      buyProductIds: ['gid://shopify/Product/buy'],
      getProductIds: ['gid://shopify/Product/get'],
      buyQuantity: 1,
      getQuantity: 1,
      floorPrice: 0.5,
      displayName: 'Bogo25',
    });

    const candidates = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '200.0'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/buy'},
            },
          },
          {
            id: 'gid://shopify/CartLine/2',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '100.0'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/get'},
            },
          },
        ],
      },
      discount: {metafield: {value: config}},
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0].message).toBe('Bogo25');
    expect(candidates[1].message).toBeUndefined();
    expect(candidates[0].value.fixedAmount.amount).toBe('99.50');
    expect(candidates[1].value.fixedAmount.amount).toBe('0.50');
  });

  test('prefers triggering discount code over display name', () => {
    const candidates = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '200.0'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/buy'},
            },
          },
          {
            id: 'gid://shopify/CartLine/2',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '100.0'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/get'},
            },
          },
        ],
      },
      discount: {
        metafield: {
          value: JSON.stringify({
            buyProductIds: ['gid://shopify/Product/buy'],
            getProductIds: ['gid://shopify/Product/get'],
            displayName: 'Bogo25',
            floorPrice: 0.5,
          }),
        },
      },
      triggeringDiscountCode: 'BOGO23',
    });

    expect(candidates[0].message).toBe('BOGO23');
    expect(candidates[1].message).toBeUndefined();
  });

  test('caps applications with maxUsesPerOrder on an exact set', () => {
    const candidates = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/buy',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '24.95'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/buy'},
            },
          },
          {
            id: 'gid://shopify/CartLine/get',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '600.0'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/get'},
            },
          },
        ],
      },
      discount: {
        metafield: {
          value: JSON.stringify({
            buyProductIds: ['gid://shopify/Product/buy'],
            getProductIds: ['gid://shopify/Product/get'],
            buyQuantity: 1,
            getQuantity: 1,
            maxUsesPerOrder: 1,
            floorPrice: 0.5,
            displayName: 'BOGOAUTO',
          }),
        },
      },
    });

    const getCandidate = candidates.find(
      candidate =>
        candidate.targets[0].cartLine.id === 'gid://shopify/CartLine/get',
    );

    expect(getCandidate?.targets[0].cartLine.quantity).toBe(1);
    expect(getCandidate?.message).toBe('BOGOAUTO');
  });

  test('removes discount when cart buy quantities exceed an exact maxUses set', () => {
    const candidates = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/buy',
            quantity: 4,
            cost: {amountPerQuantity: {amount: '24.95'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/buy'},
            },
          },
          {
            id: 'gid://shopify/CartLine/get',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '600.0'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/get'},
            },
          },
        ],
      },
      discount: {
        metafield: {
          value: JSON.stringify({
            buyProductIds: ['gid://shopify/Product/buy'],
            getProductIds: ['gid://shopify/Product/get'],
            buyQuantity: 1,
            getQuantity: 1,
            maxUsesPerOrder: 1,
            floorPrice: 0.5,
            displayName: 'BOGOAUTO',
          }),
        },
      },
    });

    expect(candidates).toHaveLength(0);
  });

  test('defaults to one use per order when maxUsesPerOrder is omitted', () => {
    const candidates = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/buy',
            quantity: 2,
            cost: {amountPerQuantity: {amount: '24.95'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/buy'},
            },
          },
          {
            id: 'gid://shopify/CartLine/get',
            quantity: 2,
            cost: {amountPerQuantity: {amount: '600.0'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/get'},
            },
          },
        ],
      },
      discount: {
        metafield: {
          value: JSON.stringify({
            buyProductIds: ['gid://shopify/Product/buy'],
            getProductIds: ['gid://shopify/Product/get'],
            buyQuantity: 1,
            getQuantity: 1,
            floorPrice: 0.5,
            displayName: 'BOGOAUTO',
          }),
        },
      },
    });

    // Default maxUses=1 with leftover buy units → remove discount entirely.
    expect(candidates).toHaveLength(0);
  });

  test('splits get line when get quantity exceeds reward with exact buy set', () => {
    const candidates = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/buy',
            quantity: 2,
            cost: {amountPerQuantity: {amount: '24.95'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/buy'},
            },
          },
          {
            id: 'gid://shopify/CartLine/get',
            quantity: 2,
            cost: {amountPerQuantity: {amount: '749.95'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/get'},
            },
          },
        ],
      },
      discount: {
        metafield: {
          value: JSON.stringify({
            buyProductIds: ['gid://shopify/Product/buy'],
            getProductIds: ['gid://shopify/Product/get'],
            buyQuantity: 2,
            getQuantity: 1,
            maxUsesPerOrder: 1,
            floorPrice: 0.5,
            displayName: 'AUTO123',
          }),
        },
      },
    });

    const getCandidate = candidates.find(
      candidate =>
        candidate.targets[0].cartLine.id === 'gid://shopify/CartLine/get',
    );

    expect(getCandidate?.targets[0].cartLine.quantity).toBe(1);
    expect(getCandidate?.value.fixedAmount.amount).toBe('749.45');
    expect(getCandidate?.message).toBe('AUTO123');
  });

  test('allows exact stacking when maxUsesPerOrder is explicitly null', () => {
    const candidates = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/buy',
            quantity: 2,
            cost: {amountPerQuantity: {amount: '24.95'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/buy'},
            },
          },
          {
            id: 'gid://shopify/CartLine/get',
            quantity: 2,
            cost: {amountPerQuantity: {amount: '600.0'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/get'},
            },
          },
        ],
      },
      discount: {
        metafield: {
          value: JSON.stringify({
            buyProductIds: ['gid://shopify/Product/buy'],
            getProductIds: ['gid://shopify/Product/get'],
            buyQuantity: 1,
            getQuantity: 1,
            maxUsesPerOrder: null,
            floorPrice: 0.5,
            displayName: 'BOGOAUTO',
          }),
        },
      },
    });

    const getCandidate = candidates.find(
      candidate =>
        candidate.targets[0].cartLine.id === 'gid://shopify/CartLine/get',
    );

    expect(getCandidate?.targets[0].cartLine.quantity).toBe(2);
  });

  test('removes discount when buy qty is greater than configured buy quantity', () => {
    const candidates = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/buy',
            quantity: 3,
            cost: {amountPerQuantity: {amount: '24.95'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/buy'},
            },
          },
          {
            id: 'gid://shopify/CartLine/get',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '749.95'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/get'},
            },
          },
        ],
      },
      discount: {
        metafield: {
          value: JSON.stringify({
            buyProductIds: ['gid://shopify/Product/buy'],
            getProductIds: ['gid://shopify/Product/get'],
            buyQuantity: 2,
            getQuantity: 1,
            maxUsesPerOrder: 1,
            floorPrice: 0.5,
            displayName: 'AUTO123',
          }),
        },
      },
    });

    expect(candidates).toHaveLength(0);
  });

  test('does not discount when buy quantity 2 is not met', () => {
    const candidates = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '24.95'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/buy'},
            },
          },
          {
            id: 'gid://shopify/CartLine/2',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '600.0'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/get'},
            },
          },
        ],
      },
      discount: {
        metafield: {
          value: JSON.stringify({
            buyProductIds: ['gid://shopify/Product/buy'],
            getProductIds: ['gid://shopify/Product/get'],
            buyQuantity: 2,
            getQuantity: 1,
            floorPrice: 0.5,
          }),
        },
      },
    });

    expect(candidates).toHaveLength(0);
  });

  test('keeps one buy line when quantity 2 is on the same cart line', () => {
    const candidates = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/buy',
            quantity: 2,
            cost: {amountPerQuantity: {amount: '24.95'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/buy'},
            },
          },
          {
            id: 'gid://shopify/CartLine/get',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '600.0'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/get'},
            },
          },
        ],
      },
      discount: {
        metafield: {
          value: JSON.stringify({
            buyProductIds: ['gid://shopify/Product/buy'],
            getProductIds: ['gid://shopify/Product/get'],
            buyQuantity: 2,
            getQuantity: 1,
            floorPrice: 0.5,
          }),
        },
      },
    });

    const buyCandidate = candidates.find(
      candidate =>
        candidate.targets[0].cartLine.id === 'gid://shopify/CartLine/buy',
    );

    expect(buyCandidate?.targets[0].cartLine.quantity).toBeUndefined();
    expect(buyCandidate?.value.fixedAmount.amount).toBe('0.50');
    expect(buyCandidate?.value.fixedAmount.appliesToEachItem).toBe(false);
  });

  test('keeps buy qty 3 on one candidate without per-unit split amounts', () => {
    const candidates = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/buy',
            quantity: 3,
            cost: {amountPerQuantity: {amount: '24.95'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/buy'},
            },
          },
          {
            id: 'gid://shopify/CartLine/get',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '600.0'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/get'},
            },
          },
        ],
      },
      discount: {
        metafield: {
          value: JSON.stringify({
            buyProductIds: ['gid://shopify/Product/buy'],
            getProductIds: ['gid://shopify/Product/get'],
            buyQuantity: 3,
            getQuantity: 1,
            floorPrice: 0.5,
            displayName: 'Bogo25',
          }),
        },
      },
    });

    const buyCandidates = candidates.filter(
      candidate =>
        candidate.targets[0].cartLine.id === 'gid://shopify/CartLine/buy',
    );

    expect(buyCandidates).toHaveLength(1);
    expect(buyCandidates[0].value.fixedAmount.amount).toBe('0.50');
    expect(buyCandidates[0].value.fixedAmount.appliesToEachItem).toBe(false);
  });

  test('matches collections via inAnyCollection flags', () => {
    const candidates = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '200.0'}},
            merchandise: {
              product: {
                id: 'gid://shopify/Product/buy',
                inBuyCollections: true,
                inGetCollections: false,
              },
            },
          },
          {
            id: 'gid://shopify/CartLine/2',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '100.0'}},
            merchandise: {
              product: {
                id: 'gid://shopify/Product/get',
                inBuyCollections: false,
                inGetCollections: true,
              },
            },
          },
        ],
      },
      discount: {
        metafield: {
          value: JSON.stringify({
            buyCollectionIds: ['gid://shopify/Collection/buy'],
            getCollectionIds: ['gid://shopify/Collection/get'],
            buyItemType: 'collections',
            getItemType: 'collections',
            buyQuantity: 1,
            getQuantity: 1,
            floorPrice: 0.5,
          }),
        },
      },
    });

    expect(candidates).toHaveLength(2);
  });

  test('returns empty when buy product is missing from cart', () => {
    const candidates = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/2',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '100.0'}},
            merchandise: {
              product: {id: 'gid://shopify/Product/get'},
            },
          },
        ],
      },
      discount: {
        metafield: {
          value: JSON.stringify({
            buyProductIds: ['gid://shopify/Product/buy'],
            getProductIds: ['gid://shopify/Product/get'],
            floorPrice: 0.5,
          }),
        },
      },
    });

    expect(candidates).toHaveLength(0);
  });
});
