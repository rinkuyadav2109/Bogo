
import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useState, useEffect, useMemo} from "preact/hooks";

export default async () => {
  render(<App />, document.body);
};

function ProductList({products, onRemove, emptyLabel, i18n}) {
  if (products.length === 0) {
    return <s-text tone="subdued">{emptyLabel}</s-text>;
  }

  return products.map(product => (
    <s-stack
      direction="inline"
      alignItems="center"
      justifyContent="space-between"
      key={product.id}
    >
      <s-link
        href={`shopify://admin/products/${product.id.split("/").pop()}`}
        target="_blank"
      >
        {product.title}
      </s-link>
      <s-button variant="tertiary" onClick={() => onRemove(product.id)}>
        <s-icon type="x-circle" />
      </s-button>
    </s-stack>
  ));
}

function ProductSection({
  label,
  products,
  onAdd,
  onRemove,
  emptyLabel,
  i18n,
  hiddenFieldName,
  hiddenValue,
  defaultHiddenValue,
}) {
  return (
    <s-section>
      <s-box display="none">
        <s-text-field
          value={hiddenValue}
          label=""
          name={hiddenFieldName}
          defaultValue={defaultHiddenValue}
        />
      </s-box>
      <s-stack gap="base">
        <s-stack direction="inline" alignItems="end" gap="base">
          <s-text type="strong">{label}</s-text>
          <s-button onClick={onAdd}>{i18n.translate("products.choose")}</s-button>
        </s-stack>
        <ProductList
          products={products}
          onRemove={onRemove}
          emptyLabel={emptyLabel}
          i18n={i18n}
        />
      </s-stack>
    </s-section>
  );
}

function App() {
  const {
    applyExtensionMetafieldChange,
    i18n,
    floorPrice,
    onFloorPriceChange,
    resetForm,
    buyProducts,
    getProducts,
    onSelectBuyProducts,
    onSelectGetProducts,
    removeBuyProduct,
    removeGetProduct,
    loading,
    ensureProductDiscountClass,
  } = useExtensionData();

  const [error, setError] = useState();

  useEffect(() => {
    ensureProductDiscountClass().then(result => {
      if (result && !result.success) {
        setError(i18n.translate("error"));
      }
    });
  }, []);

  if (loading) {
    return <s-text>{i18n.translate("loading")}</s-text>;
  }

  return (
    <s-function-settings
      onSubmit={event => {
        event.waitUntil?.(applyExtensionMetafieldChange());
      }}
      onReset={resetForm}
    >
      <s-heading>{i18n.translate("title")}</s-heading>
      <s-section>
        <s-stack gap="base">
          {error ? <s-banner tone="critical">{error}</s-banner> : null}
          <s-paragraph>{i18n.translate("description")}</s-paragraph>

          <ProductSection
            label={i18n.translate("products.buyLabel")}
            products={buyProducts}
            onAdd={onSelectBuyProducts}
            onRemove={removeBuyProduct}
            emptyLabel={i18n.translate("products.buyEmpty")}
            i18n={i18n}
            hiddenFieldName="buyProductIds"
            hiddenValue={buyProducts.map(({id}) => id).join(",")}
            defaultHiddenValue={buyProducts.map(({id}) => id).join(",")}
          />

          <ProductSection
            label={i18n.translate("products.getLabel")}
            products={getProducts}
            onAdd={onSelectGetProducts}
            onRemove={removeGetProduct}
            emptyLabel={i18n.translate("products.getEmpty")}
            i18n={i18n}
            hiddenFieldName="getProductIds"
            hiddenValue={getProducts.map(({id}) => id).join(",")}
            defaultHiddenValue={getProducts.map(({id}) => id).join(",")}
          />

          <s-number-field
            label={i18n.translate("floorPrice.label")}
            name="floorPrice"
            value={String(floorPrice)}
            min={0.01}
            step={0.01}
            onChange={event =>
              onFloorPriceChange(event.currentTarget.value)
            }
            details={i18n.translate("floorPrice.help")}
          />
        </s-stack>
      </s-section>
    </s-function-settings>
  );
}

function useExtensionData() {
  const {applyMetafieldChange, i18n, data, resourcePicker, query} = shopify;
  const {discounts} = shopify;

  const metafieldConfig = useMemo(
    () => parseMetafield(
      data?.metafields?.find(
        metafield => metafield.key === "function-configuration",
      )?.value,
    ),
    [data?.metafields],
  );

  const [floorPrice, setFloorPrice] = useState(metafieldConfig.floorPrice);
  const [initialFloorPrice, setInitialFloorPrice] = useState(
    metafieldConfig.floorPrice,
  );
  const [buyProducts, setBuyProducts] = useState([]);
  const [getProducts, setGetProducts] = useState([]);
  const [initialBuyProducts, setInitialBuyProducts] = useState([]);
  const [initialGetProducts, setInitialGetProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      const [buy, get] = await Promise.all([
        getProductsByIds(metafieldConfig.buyProductIds, query),
        getProductsByIds(metafieldConfig.getProductIds, query),
      ]);
      setBuyProducts(buy);
      setGetProducts(get);
      setInitialBuyProducts(buy);
      setInitialGetProducts(get);
      setLoading(false);
    };
    fetchProducts();
  }, [metafieldConfig.buyProductIds, metafieldConfig.getProductIds, query]);

  async function ensureProductDiscountClass() {
    const current = discounts?.discountClasses?.value ?? [];
    if (current.length === 1 && current.includes("product")) {
      return {success: true};
    }

    return (
      (await discounts?.updateDiscountClasses?.(["product"])) ?? {
        success: false,
      }
    );
  }

  async function applyExtensionMetafieldChange() {
    await applyMetafieldChange({
      type: "updateMetafield",
      namespace: "$app",
      key: "function-configuration",
      value: JSON.stringify({
        buyProductIds: buyProducts.map(({id}) => id),
        getProductIds: getProducts.map(({id}) => id),
        floorPrice: Number(floorPrice),
      }),
      valueType: "json",
    });
    setInitialBuyProducts(buyProducts);
    setInitialGetProducts(getProducts);
    setInitialFloorPrice(floorPrice);
  }

  const resetForm = () => {
    setBuyProducts(initialBuyProducts);
    setGetProducts(initialGetProducts);
    setFloorPrice(initialFloorPrice);
  };

  const onSelectBuyProducts = async () => {
    const selection = await resourcePicker({
      type: "product",
      selectionIds: buyProducts.map(({id}) => ({id})),
      action: "select",
      multiple: true,
    });
    setBuyProducts(selection ?? []);
  };

  const onSelectGetProducts = async () => {
    const selection = await resourcePicker({
      type: "product",
      selectionIds: getProducts.map(({id}) => ({id})),
      action: "select",
      multiple: true,
    });
    setGetProducts(selection ?? []);
  };

  return {
    applyExtensionMetafieldChange,
    i18n,
    floorPrice,
    onFloorPriceChange: value => setFloorPrice(Number(value) || 0.5),
    resetForm,
    buyProducts,
    getProducts,
    onSelectBuyProducts,
    onSelectGetProducts,
    removeBuyProduct: id =>
      setBuyProducts(prev => prev.filter(product => product.id !== id)),
    removeGetProduct: id =>
      setGetProducts(prev => prev.filter(product => product.id !== id)),
    loading,
    ensureProductDiscountClass,
  };
}

function parseMetafield(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return {
      buyProductIds: parsed.buyProductIds ?? [],
      getProductIds: parsed.getProductIds ?? [],
      floorPrice: Number(parsed.floorPrice ?? 0.5),
    };
  } catch {
    return {
      buyProductIds: [],
      getProductIds: [],
      floorPrice: 0.5,
    };
  }
}

async function getProductsByIds(productGids, adminApiQuery) {
  if (!productGids.length) {
    return [];
  }

  const gql = `#graphql
    query GetProducts($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
        }
      }
    }
  `;
  const result = await adminApiQuery(gql, {variables: {ids: productGids}});
  return (result?.data?.nodes ?? []).filter(Boolean);
}
