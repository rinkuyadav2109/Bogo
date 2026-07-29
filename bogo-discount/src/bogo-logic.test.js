import {describe, expect, test} from 'vitest';
import {
  buildBogoDiscountCandidates,
  computeBogoDiscountGroups,
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

describe('buildBogoDiscountCandidates', () => {
  test('returns paired fixed-amount candidates', () => {
    const config = JSON.stringify({
      buyProductIds: ['gid://shopify/Product/buy'],
      getProductIds: ['gid://shopify/Product/get'],
      floorPrice: 0.5,
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
    expect(candidates[0].value.fixedAmount.amount).toBe('99.50');
    expect(candidates[1].value.fixedAmount.amount).toBe('0.50');
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
