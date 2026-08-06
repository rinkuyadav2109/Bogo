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
    expect(config.maxUsesPerOrder).toBeNull();
  });

  test('parses explicit maxUsesPerOrder and variant ids', () => {
    const config = parseBogoConfig(
      JSON.stringify({
        buyProductIds: ['gid://shopify/Product/1'],
        getProductIds: ['gid://shopify/Product/2'],
        buyVariantIds: ['gid://shopify/ProductVariant/1'],
        getVariantIds: ['gid://shopify/ProductVariant/2'],
        maxUsesPerOrder: 2,
      }),
    );

    expect(config.maxUsesPerOrder).toBe(2);
    expect(config.buyVariantIds.has('gid://shopify/ProductVariant/1')).toBe(
      true,
    );
    expect(config.getVariantIds.has('gid://shopify/ProductVariant/2')).toBe(
      true,
    );
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
    expect(groups?.buyLines.get('line-x')).toEqual({amount: 0.5, quantity: 2});
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

    expect(groups?.buyLines.get('line-x')).toEqual({amount: 0.5, quantity: 3});
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

  test('stacks sets and leaves leftover buy units out of absorb quantity', () => {
    const groups = computeQuantityAwareBogoGroups(
      [
        {lineId: 'line-x', unitPrice: 24.95},
        {lineId: 'line-x', unitPrice: 24.95},
        {lineId: 'line-x', unitPrice: 24.95},
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
    );

    // Buy 5 / Get 2 with buyQty 2 → 2 sets; absorb on 4 buy units only.
    expect(groups?.get.get('line-y')?.get(749.45)).toBe(2);
    expect(groups?.buyLines.get('line-x')).toEqual({amount: 1, quantity: 4});
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
    expect(groups?.buyLines.get('line-x')).toEqual({amount: 0.5, quantity: 2});
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
    expect(candidates[1].message).toBe('Bogo25');
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
    expect(candidates[1].message).toBe('BOGO23');
  });

  test('caps applications with maxUsesPerOrder', () => {
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
            quantity: 4,
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
    const buyCandidate = candidates.find(
      candidate =>
        candidate.targets[0].cartLine.id === 'gid://shopify/CartLine/buy',
    );

    expect(getCandidate?.targets[0].cartLine.quantity).toBe(1);
    expect(buyCandidate?.targets[0].cartLine.quantity).toBe(1);
    expect(getCandidate?.message).toBe('BOGOAUTO');
  });

  test('stacks buy sets and splits leftover buy quantity like native BXGY', () => {
    const candidates = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/buy',
            quantity: 5,
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
            maxUsesPerOrder: null,
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
    const buyCandidate = candidates.find(
      candidate =>
        candidate.targets[0].cartLine.id === 'gid://shopify/CartLine/buy',
    );

    expect(getCandidate?.targets[0].cartLine.quantity).toBe(2);
    expect(buyCandidate?.targets[0].cartLine.quantity).toBe(4);
    expect(buyCandidate?.value.fixedAmount.amount).toBe('1.00');
  });

  test('defaults to unlimited uses when maxUsesPerOrder is omitted', () => {
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

    const getCandidate = candidates.find(
      candidate =>
        candidate.targets[0].cartLine.id === 'gid://shopify/CartLine/get',
    );

    expect(getCandidate?.targets[0].cartLine.quantity).toBe(2);
  });

  test('splits get line when get quantity exceeds reward', () => {
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

  test('matches specific variant ids when configured', () => {
    const candidates = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/buy',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '24.95'}},
            merchandise: {
              id: 'gid://shopify/ProductVariant/buy-selected',
              product: {id: 'gid://shopify/Product/buy'},
            },
          },
          {
            id: 'gid://shopify/CartLine/buy-other',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '24.95'}},
            merchandise: {
              id: 'gid://shopify/ProductVariant/buy-other',
              product: {id: 'gid://shopify/Product/buy'},
            },
          },
          {
            id: 'gid://shopify/CartLine/get',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '600.0'}},
            merchandise: {
              id: 'gid://shopify/ProductVariant/get-selected',
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
            buyVariantIds: ['gid://shopify/ProductVariant/buy-selected'],
            getVariantIds: ['gid://shopify/ProductVariant/get-selected'],
            buyQuantity: 1,
            getQuantity: 1,
            floorPrice: 0.5,
            displayName: 'VAR',
          }),
        },
      },
    });

    expect(candidates).toHaveLength(2);
    expect(
      candidates.some(
        candidate =>
          candidate.targets[0].cartLine.id === 'gid://shopify/CartLine/buy',
      ),
    ).toBe(true);
    expect(
      candidates.some(
        candidate =>
          candidate.targets[0].cartLine.id ===
          'gid://shopify/CartLine/buy-other',
      ),
    ).toBe(false);
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

    expect(buyCandidate?.targets[0].cartLine.quantity).toBe(2);
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
    expect(buyCandidates[0].targets[0].cartLine.quantity).toBe(3);
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

  test('same collection for buy and get does not double-count units', () => {
    // Native BXGY: need 2 units from the collection for Buy 1 Get 1.
    const oneItem = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '100.0'}},
            merchandise: {
              product: {
                id: 'gid://shopify/Product/a',
                inBuyCollections: true,
                inGetCollections: true,
              },
            },
          },
        ],
      },
      discount: {
        metafield: {
          value: JSON.stringify({
            buyCollectionIds: ['gid://shopify/Collection/shared'],
            getCollectionIds: ['gid://shopify/Collection/shared'],
            buyItemType: 'collections',
            getItemType: 'collections',
            buyQuantity: 1,
            getQuantity: 1,
            floorPrice: 0.5,
          }),
        },
      },
    });
    expect(oneItem).toHaveLength(0);

    const twoItems = buildBogoDiscountCandidates({
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/cheap',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '50.0'}},
            merchandise: {
              product: {
                id: 'gid://shopify/Product/cheap',
                inBuyCollections: true,
                inGetCollections: true,
              },
            },
          },
          {
            id: 'gid://shopify/CartLine/pricey',
            quantity: 1,
            cost: {amountPerQuantity: {amount: '200.0'}},
            merchandise: {
              product: {
                id: 'gid://shopify/Product/pricey',
                inBuyCollections: true,
                inGetCollections: true,
              },
            },
          },
        ],
      },
      discount: {
        metafield: {
          value: JSON.stringify({
            buyCollectionIds: ['gid://shopify/Collection/shared'],
            getCollectionIds: ['gid://shopify/Collection/shared'],
            buyItemType: 'collections',
            getItemType: 'collections',
            buyQuantity: 1,
            getQuantity: 1,
            floorPrice: 0.5,
          }),
        },
      },
    });

    expect(twoItems).toHaveLength(2);
    const getCandidate = twoItems.find(
      c => c.targets[0].cartLine.id === 'gid://shopify/CartLine/cheap',
    );
    const buyCandidate = twoItems.find(
      c => c.targets[0].cartLine.id === 'gid://shopify/CartLine/pricey',
    );
    expect(getCandidate?.value.fixedAmount.amount).toBe('49.50');
    expect(buyCandidate?.value.fixedAmount.amount).toBe('0.50');
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
