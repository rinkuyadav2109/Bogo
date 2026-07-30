import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useState, useEffect, useMemo} from "preact/hooks";

const ITEM_TYPE_PRODUCTS = "products";
const ITEM_TYPE_COLLECTIONS = "collections";
const PURCHASE_TYPE_ONE_TIME = "one_time";
const PURCHASE_TYPE_SUBSCRIPTION = "subscription";
const PURCHASE_TYPE_BOTH = "both";

export default async () => {
  render(<App />, document.body);
};

function ResourceList({items, itemType, onEdit, onRemove, emptyLabel, i18n}) {
  if (items.length === 0) {
    return <s-text tone="subdued">{emptyLabel}</s-text>;
  }

  const adminPath =
    itemType === ITEM_TYPE_COLLECTIONS ? "collections" : "products";

  return items.map(item => (
    <s-stack
      direction="inline"
      alignItems="center"
      justifyContent="space-between"
      key={item.id}
    >
      <s-link
        href={`shopify://admin/${adminPath}/${item.id.split("/").pop()}`}
        target="_blank"
      >
        {item.title}
      </s-link>
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-button variant="tertiary" onClick={onEdit}>
          {i18n.translate("resources.edit")}
        </s-button>
        <s-button
          variant="tertiary"
          onClick={() => onRemove(item.id)}
          accessibilityLabel="Remove"
        >
          <s-icon type="x-circle" />
        </s-button>
      </s-stack>
    </s-stack>
  ));
}

function CustomerSection({
  heading,
  help,
  quantityLabel,
  quantityDetails,
  quantity,
  onQuantityChange,
  quantityError,
  quantityName,
  itemType,
  onItemTypeChange,
  itemTypeName,
  purchaseType,
  onPurchaseTypeChange,
  purchaseTypeName,
  showPurchaseType,
  i18n,
  items,
  onBrowse,
  onRemove,
  resourceError,
  hiddenIdsName,
  hiddenIdsValue,
}) {
  const isCollections = itemType === ITEM_TYPE_COLLECTIONS;
  const gridColumns = showPurchaseType ? "1fr 1fr 1fr" : "1fr 1fr";

  return (
    <s-section heading={heading}>
      <s-stack gap="base">
        {help ? <s-paragraph>{help}</s-paragraph> : null}

        <s-grid gridTemplateColumns={gridColumns} gap="base">
          <s-number-field
            label={quantityLabel}
            name={quantityName}
            value={quantity === "" ? "" : String(quantity)}
            min={1}
            step={1}
            error={quantityError}
            details={quantityDetails}
            onInput={event => onQuantityChange(event.currentTarget.value)}
            onChange={event => onQuantityChange(event.currentTarget.value)}
          />
          <s-select
            label={i18n.translate("itemType.anyItemsFrom")}
            name={itemTypeName}
            value={itemType}
            onChange={event => onItemTypeChange(event.currentTarget.value)}
          >
            <s-option value={ITEM_TYPE_PRODUCTS}>
              {i18n.translate("itemType.products")}
            </s-option>
            <s-option value={ITEM_TYPE_COLLECTIONS}>
              {i18n.translate("itemType.collections")}
            </s-option>
          </s-select>
          {showPurchaseType ? (
            <s-select
              label={i18n.translate("purchaseType.label")}
              name={purchaseTypeName}
              value={purchaseType}
              onChange={event =>
                onPurchaseTypeChange(event.currentTarget.value)
              }
            >
              <s-option value={PURCHASE_TYPE_ONE_TIME}>
                {i18n.translate("purchaseType.oneTime")}
              </s-option>
              <s-option value={PURCHASE_TYPE_SUBSCRIPTION}>
                {i18n.translate("purchaseType.subscription")}
              </s-option>
              <s-option value={PURCHASE_TYPE_BOTH}>
                {i18n.translate("purchaseType.both")}
              </s-option>
            </s-select>
          ) : null}
        </s-grid>

        <s-box display="none">
          <s-text-field
            label=""
            name={hiddenIdsName}
            value={hiddenIdsValue}
            defaultValue={hiddenIdsValue}
          />
        </s-box>

        <s-stack gap="small-200">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-box inlineSize="100%">
              <s-text-field
                label={
                  isCollections
                    ? i18n.translate("resources.searchCollections")
                    : i18n.translate("resources.searchProducts")
                }
                labelAccessibilityVisibility="exclusive"
                placeholder={
                  isCollections
                    ? i18n.translate("resources.searchCollections")
                    : i18n.translate("resources.searchProducts")
                }
                value=""
                readonly
                error={resourceError}
                onFocus={onBrowse}
              />
            </s-box>
            <s-button onClick={onBrowse}>
              {i18n.translate("resources.browse")}
            </s-button>
          </s-stack>

          <ResourceList
            items={items}
            itemType={itemType}
            onEdit={onBrowse}
            onRemove={onRemove}
            i18n={i18n}
            emptyLabel={
              isCollections
                ? i18n.translate("resources.collectionsEmpty")
                : i18n.translate("resources.productsEmpty")
            }
          />
        </s-stack>
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
    buyQuantity,
    getQuantity,
    onBuyQuantityChange,
    onGetQuantityChange,
    buyItemType,
    getItemType,
    onBuyItemTypeChange,
    onGetItemTypeChange,
    buyPurchaseType,
    getPurchaseType,
    onBuyPurchaseTypeChange,
    onGetPurchaseTypeChange,
    displayName,
    onDisplayNameChange,
    maxUsesEnabled,
    onMaxUsesEnabledChange,
    maxUsesPerOrder,
    onMaxUsesPerOrderChange,
    buyItems,
    getItems,
    onSelectBuyItems,
    onSelectGetItems,
    removeBuyItem,
    removeGetItem,
    loading,
    ensureProductDiscountClass,
    validateForm,
  } = useExtensionData();

  const [error, setError] = useState();
  const [fieldErrors, setFieldErrors] = useState({});
  const [bannerMessages, setBannerMessages] = useState([]);

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
        event.waitUntil?.(
          (async () => {
            const {ok, errors, messages} = validateForm();
            setFieldErrors(errors);
            setBannerMessages(messages);

            if (!ok) {
              throw new Error(messages[0] || i18n.translate("error"));
            }

            setBannerMessages([]);
            await applyExtensionMetafieldChange();
          })(),
        );
      }}
      onReset={() => {
        resetForm();
        setFieldErrors({});
        setBannerMessages([]);
      }}
    >
      <s-stack gap="base">
        {error ? <s-banner tone="critical">{error}</s-banner> : null}

        {bannerMessages.length > 0 ? (
          <s-banner tone="critical" heading={
            bannerMessages.length === 1
              ? i18n.translate("validation.bannerOne")
              : i18n.translate("validation.banner", {
                  count: String(bannerMessages.length),
                })
          }>
            <s-unordered-list>
              {bannerMessages.map(message => (
                <s-list-item key={message}>{message}</s-list-item>
              ))}
            </s-unordered-list>
          </s-banner>
        ) : null}

        <s-heading>{i18n.translate("title")}</s-heading>

        <s-text-field
          label={i18n.translate("displayName.label")}
          name="displayName"
          value={displayName}
          details={i18n.translate("displayName.help")}
          error={fieldErrors.displayName}
          onChange={event => onDisplayNameChange(event.currentTarget.value)}
        />

        <CustomerSection
          heading={i18n.translate("customerBuys.heading")}
          quantityLabel={i18n.translate("customerBuys.quantity")}
          quantityDetails={i18n.translate("customerBuys.quantityHelp")}
          quantity={buyQuantity}
          onQuantityChange={onBuyQuantityChange}
          quantityError={fieldErrors.buyQuantity}
          quantityName="buyQuantity"
          itemType={buyItemType}
          onItemTypeChange={onBuyItemTypeChange}
          itemTypeName="buyItemType"
          purchaseType={buyPurchaseType}
          onPurchaseTypeChange={onBuyPurchaseTypeChange}
          purchaseTypeName="buyPurchaseType"
          showPurchaseType
          i18n={i18n}
          items={buyItems}
          onBrowse={onSelectBuyItems}
          onRemove={removeBuyItem}
          resourceError={fieldErrors.buyResources}
          hiddenIdsName="buyResourceIds"
          hiddenIdsValue={buyItems.map(({id}) => id).join(",")}
        />

        <CustomerSection
          heading={i18n.translate("customerGets.heading")}
          help={i18n.translate("customerGets.help")}
          quantityLabel={i18n.translate("customerGets.quantity")}
          quantityDetails={i18n.translate("customerGets.quantityHelp")}
          quantity={getQuantity}
          onQuantityChange={onGetQuantityChange}
          quantityError={fieldErrors.getQuantity}
          quantityName="getQuantity"
          itemType={getItemType}
          onItemTypeChange={onGetItemTypeChange}
          itemTypeName="getItemType"
          purchaseType={getPurchaseType}
          onPurchaseTypeChange={onGetPurchaseTypeChange}
          purchaseTypeName="getPurchaseType"
          showPurchaseType={false}
          i18n={i18n}
          items={getItems}
          onBrowse={onSelectGetItems}
          onRemove={removeGetItem}
          resourceError={fieldErrors.getResources}
          hiddenIdsName="getResourceIds"
          hiddenIdsValue={getItems.map(({id}) => id).join(",")}
        />

        <s-section heading={i18n.translate("discountValue.heading")}>
          <s-stack gap="base">
            <s-choice-list
              label={i18n.translate("discountValue.heading")}
              labelAccessibilityVisibility="exclusive"
              name="discountType"
              values={["free"]}
              details={i18n.translate("discountValue.freeHelp")}
            >
              <s-choice value="free">
                {i18n.translate("discountValue.free")}
              </s-choice>
            </s-choice-list>
            <s-checkbox
              label={i18n.translate("maxUses.label")}
              name="maxUsesEnabled"
              checked={maxUsesEnabled}
              details={i18n.translate("maxUses.help")}
              onChange={event =>
                onMaxUsesEnabledChange(Boolean(event.currentTarget.checked))
              }
            />
            {maxUsesEnabled ? (
              <s-number-field
                label={i18n.translate("maxUses.quantity")}
                name="maxUsesPerOrder"
                value={String(maxUsesPerOrder || 1)}
                min={1}
                step={1}
                onInput={event =>
                  onMaxUsesPerOrderChange(event.currentTarget.value)
                }
                onChange={event =>
                  onMaxUsesPerOrderChange(event.currentTarget.value)
                }
              />
            ) : null}
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
      </s-stack>
    </s-function-settings>
  );
}

function useExtensionData() {
  const {applyMetafieldChange, i18n, data, resourcePicker, query} = shopify;
  const {discounts} = shopify;

  const metafieldConfig = useMemo(
    () =>
      parseMetafield(
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
  const [buyQuantity, setBuyQuantity] = useState(metafieldConfig.buyQuantity);
  const [getQuantity, setGetQuantity] = useState(metafieldConfig.getQuantity);
  const [initialBuyQuantity, setInitialBuyQuantity] = useState(
    metafieldConfig.buyQuantity,
  );
  const [initialGetQuantity, setInitialGetQuantity] = useState(
    metafieldConfig.getQuantity,
  );
  const [buyItemType, setBuyItemType] = useState(metafieldConfig.buyItemType);
  const [getItemType, setGetItemType] = useState(metafieldConfig.getItemType);
  const [initialBuyItemType, setInitialBuyItemType] = useState(
    metafieldConfig.buyItemType,
  );
  const [initialGetItemType, setInitialGetItemType] = useState(
    metafieldConfig.getItemType,
  );
  const [buyPurchaseType, setBuyPurchaseType] = useState(
    metafieldConfig.buyPurchaseType,
  );
  const [getPurchaseType, setGetPurchaseType] = useState(
    metafieldConfig.getPurchaseType,
  );
  const [initialBuyPurchaseType, setInitialBuyPurchaseType] = useState(
    metafieldConfig.buyPurchaseType,
  );
  const [initialGetPurchaseType, setInitialGetPurchaseType] = useState(
    metafieldConfig.getPurchaseType,
  );
  const [displayName, setDisplayName] = useState(metafieldConfig.displayName);
  const [initialDisplayName, setInitialDisplayName] = useState(
    metafieldConfig.displayName,
  );
  const [maxUsesEnabled, setMaxUsesEnabled] = useState(
    metafieldConfig.maxUsesPerOrder != null,
  );
  const [initialMaxUsesEnabled, setInitialMaxUsesEnabled] = useState(
    metafieldConfig.maxUsesPerOrder != null,
  );
  const [maxUsesPerOrder, setMaxUsesPerOrder] = useState(
    metafieldConfig.maxUsesPerOrder ?? 1,
  );
  const [initialMaxUsesPerOrder, setInitialMaxUsesPerOrder] = useState(
    metafieldConfig.maxUsesPerOrder ?? 1,
  );
  const [buyItems, setBuyItems] = useState([]);
  const [getItems, setGetItems] = useState([]);
  const [initialBuyItems, setInitialBuyItems] = useState([]);
  const [initialGetItems, setInitialGetItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResources = async () => {
      setLoading(true);
      const [buy, get, latestDisplayName] = await Promise.all([
        getResourcesByIds(
          metafieldConfig.buyItemType,
          metafieldConfig.buyItemType === ITEM_TYPE_COLLECTIONS
            ? metafieldConfig.buyCollectionIds
            : metafieldConfig.buyProductIds,
          query,
        ),
        getResourcesByIds(
          metafieldConfig.getItemType,
          metafieldConfig.getItemType === ITEM_TYPE_COLLECTIONS
            ? metafieldConfig.getCollectionIds
            : metafieldConfig.getProductIds,
          query,
        ),
        fetchDiscountDisplayName(data?.id, query),
      ]);
      setBuyItems(buy);
      setGetItems(get);
      setInitialBuyItems(buy);
      setInitialGetItems(get);

      const resolvedDisplayName =
        latestDisplayName || metafieldConfig.displayName || "";
      setDisplayName(resolvedDisplayName);
      setInitialDisplayName(resolvedDisplayName);
      setLoading(false);

      if (
        metafieldConfig.needsVariableMigration ||
        (resolvedDisplayName &&
          resolvedDisplayName !== metafieldConfig.displayName)
      ) {
        await applyMetafieldChange({
          type: "updateMetafield",
          namespace: "$app",
          key: "function-configuration",
          value: JSON.stringify({
            buyProductIds: metafieldConfig.buyProductIds,
            getProductIds: metafieldConfig.getProductIds,
            buyCollectionIds: metafieldConfig.buyCollectionIds,
            getCollectionIds: metafieldConfig.getCollectionIds,
            buyItemType: metafieldConfig.buyItemType,
            getItemType: metafieldConfig.getItemType,
            buyPurchaseType: metafieldConfig.buyPurchaseType,
            getPurchaseType: metafieldConfig.getPurchaseType,
            buyQuantity: metafieldConfig.buyQuantity,
            getQuantity: metafieldConfig.getQuantity,
            floorPrice: metafieldConfig.floorPrice,
            displayName: resolvedDisplayName,
            maxUsesPerOrder: metafieldConfig.maxUsesPerOrder,
          }),
          valueType: "json",
        });
      }
    };
    fetchResources();
  }, [metafieldConfig, query, applyMetafieldChange, data?.id]);

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

  async function buildConfigPayload() {
    const buyIds = buyItems.map(({id}) => id);
    const getIds = getItems.map(({id}) => id);
    const latestDisplayName = await fetchDiscountDisplayName(data?.id, query);
    const resolvedDisplayName = (
      displayName ||
      latestDisplayName ||
      ""
    ).trim();

    return {
      buyProductIds: buyItemType === ITEM_TYPE_PRODUCTS ? buyIds : [],
      getProductIds: getItemType === ITEM_TYPE_PRODUCTS ? getIds : [],
      buyCollectionIds: buyItemType === ITEM_TYPE_COLLECTIONS ? buyIds : [],
      getCollectionIds: getItemType === ITEM_TYPE_COLLECTIONS ? getIds : [],
      buyItemType,
      getItemType,
      buyPurchaseType,
      getPurchaseType,
      buyQuantity: Math.max(1, Math.floor(Number(buyQuantity)) || 1),
      getQuantity: Math.max(1, Math.floor(Number(getQuantity)) || 1),
      floorPrice: Number(floorPrice),
      displayName: resolvedDisplayName,
      maxUsesPerOrder: maxUsesEnabled
        ? Math.max(1, Math.floor(Number(maxUsesPerOrder)) || 1)
        : null,
    };
  }

  function validateForm() {
    const errors = {};
    const messages = [];

    const buyQty = Number(buyQuantity);
    const getQty = Number(getQuantity);
    const trimmedDisplayName = String(displayName || "").trim();

    if (!trimmedDisplayName) {
      const message = i18n.translate("displayName.error");
      errors.displayName = message;
      messages.push(message);
    }

    if (!Number.isFinite(buyQty) || buyQty < 1) {
      const message = i18n.translate("customerBuys.quantityError");
      errors.buyQuantity = message;
      messages.push(message);
    }

    if (buyItems.length === 0) {
      const message =
        buyItemType === ITEM_TYPE_COLLECTIONS
          ? i18n.translate("customerBuys.collectionsError")
          : i18n.translate("customerBuys.productsError");
      errors.buyResources = message;
      messages.push(message);
    }

    if (!Number.isFinite(getQty) || getQty < 1) {
      const message = i18n.translate("customerGets.quantityError");
      errors.getQuantity = message;
      messages.push(message);
    }

    if (getItems.length === 0) {
      const message =
        getItemType === ITEM_TYPE_COLLECTIONS
          ? i18n.translate("customerGets.collectionsError")
          : i18n.translate("customerGets.productsError");
      errors.getResources = message;
      messages.push(message);
    }

    return {ok: messages.length === 0, errors, messages};
  }

  async function applyExtensionMetafieldChange() {
    const payload = await buildConfigPayload();
    await applyMetafieldChange({
      type: "updateMetafield",
      namespace: "$app",
      key: "function-configuration",
      value: JSON.stringify(payload),
      valueType: "json",
    });
    setInitialBuyItems(buyItems);
    setInitialGetItems(getItems);
    setInitialFloorPrice(floorPrice);
    setInitialBuyQuantity(buyQuantity);
    setInitialGetQuantity(getQuantity);
    setInitialBuyItemType(buyItemType);
    setInitialGetItemType(getItemType);
    setInitialBuyPurchaseType(buyPurchaseType);
    setInitialGetPurchaseType(getPurchaseType);
    setDisplayName(payload.displayName);
    setInitialDisplayName(payload.displayName);
    setMaxUsesEnabled(payload.maxUsesPerOrder != null);
    setInitialMaxUsesEnabled(payload.maxUsesPerOrder != null);
    setMaxUsesPerOrder(payload.maxUsesPerOrder ?? 1);
    setInitialMaxUsesPerOrder(payload.maxUsesPerOrder ?? 1);
  }

  const resetForm = () => {
    setBuyItems(initialBuyItems);
    setGetItems(initialGetItems);
    setFloorPrice(initialFloorPrice);
    setBuyQuantity(initialBuyQuantity);
    setGetQuantity(initialGetQuantity);
    setBuyItemType(initialBuyItemType);
    setGetItemType(initialGetItemType);
    setBuyPurchaseType(initialBuyPurchaseType);
    setGetPurchaseType(initialGetPurchaseType);
    setDisplayName(initialDisplayName);
    setMaxUsesEnabled(initialMaxUsesEnabled);
    setMaxUsesPerOrder(initialMaxUsesPerOrder);
  };

  const openResourcePicker = async (type, selectionIds) => {
    return resourcePicker({
      type,
      selectionIds: selectionIds.map(({id}) => ({id})),
      action: "select",
      multiple: true,
    });
  };

  const onSelectBuyItems = async () => {
    const type =
      buyItemType === ITEM_TYPE_COLLECTIONS ? "collection" : "product";
    const selection = await openResourcePicker(type, buyItems);
    if (selection) {
      setBuyItems(selection);
    }
  };

  const onSelectGetItems = async () => {
    const type =
      getItemType === ITEM_TYPE_COLLECTIONS ? "collection" : "product";
    const selection = await openResourcePicker(type, getItems);
    if (selection) {
      setGetItems(selection);
    }
  };

  const onBuyItemTypeChange = value => {
    if (value === buyItemType) {
      return;
    }
    setBuyItemType(value);
    setBuyItems([]);
  };

  const onGetItemTypeChange = value => {
    if (value === getItemType) {
      return;
    }
    setGetItemType(value);
    setGetItems([]);
  };

  return {
    applyExtensionMetafieldChange,
    i18n,
    floorPrice,
    onFloorPriceChange: value => setFloorPrice(Number(value) || 0.5),
    resetForm,
    buyQuantity,
    getQuantity,
    onBuyQuantityChange: value => setBuyQuantity(value === "" ? "" : value),
    onGetQuantityChange: value => setGetQuantity(value === "" ? "" : value),
    buyItemType,
    getItemType,
    onBuyItemTypeChange,
    onGetItemTypeChange,
    buyPurchaseType,
    getPurchaseType,
    onBuyPurchaseTypeChange: setBuyPurchaseType,
    onGetPurchaseTypeChange: setGetPurchaseType,
    displayName,
    onDisplayNameChange: setDisplayName,
    maxUsesEnabled,
    onMaxUsesEnabledChange: setMaxUsesEnabled,
    maxUsesPerOrder,
    onMaxUsesPerOrderChange: value =>
      setMaxUsesPerOrder(value === "" ? "" : value),
    buyItems,
    getItems,
    onSelectBuyItems,
    onSelectGetItems,
    removeBuyItem: id =>
      setBuyItems(prev => prev.filter(item => item.id !== id)),
    removeGetItem: id =>
      setGetItems(prev => prev.filter(item => item.id !== id)),
    loading,
    ensureProductDiscountClass,
    validateForm,
  };
}

function parsePurchaseType(value) {
  if (value === PURCHASE_TYPE_SUBSCRIPTION) {
    return PURCHASE_TYPE_SUBSCRIPTION;
  }
  if (value === PURCHASE_TYPE_BOTH) {
    return PURCHASE_TYPE_BOTH;
  }
  return PURCHASE_TYPE_ONE_TIME;
}

function parseMetafield(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    const buyCollectionIds = parsed.buyCollectionIds ?? [];
    const getCollectionIds = parsed.getCollectionIds ?? [];
    const buyItemType =
      parsed.buyItemType === ITEM_TYPE_COLLECTIONS
        ? ITEM_TYPE_COLLECTIONS
        : ITEM_TYPE_PRODUCTS;
    const getItemType =
      parsed.getItemType === ITEM_TYPE_COLLECTIONS
        ? ITEM_TYPE_COLLECTIONS
        : ITEM_TYPE_PRODUCTS;

    return {
      buyProductIds: parsed.buyProductIds ?? [],
      getProductIds: parsed.getProductIds ?? [],
      buyCollectionIds,
      getCollectionIds,
      buyItemType,
      getItemType,
      buyPurchaseType: parsePurchaseType(parsed.buyPurchaseType),
      getPurchaseType: parsePurchaseType(parsed.getPurchaseType),
      buyQuantity: Number(parsed.buyQuantity ?? 1) || 1,
      getQuantity: Number(parsed.getQuantity ?? 1) || 1,
      floorPrice: Number(parsed.floorPrice ?? 0.5),
      displayName:
        typeof parsed.displayName === "string" ? parsed.displayName.trim() : "",
      // Missing → default 1 use/order. Explicit null → unlimited.
      maxUsesPerOrder: !Object.prototype.hasOwnProperty.call(
        parsed,
        "maxUsesPerOrder",
      )
        ? 1
        : parsed.maxUsesPerOrder === null || parsed.maxUsesPerOrder === ""
          ? null
          : Number(parsed.maxUsesPerOrder) || 1,
      needsVariableMigration:
        !Array.isArray(parsed.buyCollectionIds) ||
        !Array.isArray(parsed.getCollectionIds) ||
        parsed.buyQuantity == null ||
        parsed.getQuantity == null ||
        parsed.buyItemType == null ||
        parsed.getItemType == null ||
        parsed.buyPurchaseType == null ||
        typeof parsed.displayName !== "string" ||
        !Object.prototype.hasOwnProperty.call(parsed, "maxUsesPerOrder"),
    };
  } catch {
    return {
      buyProductIds: [],
      getProductIds: [],
      buyCollectionIds: [],
      getCollectionIds: [],
      buyItemType: ITEM_TYPE_PRODUCTS,
      getItemType: ITEM_TYPE_PRODUCTS,
      buyPurchaseType: PURCHASE_TYPE_ONE_TIME,
      getPurchaseType: PURCHASE_TYPE_ONE_TIME,
      buyQuantity: 1,
      getQuantity: 1,
      floorPrice: 0.5,
      displayName: "",
      maxUsesPerOrder: 1,
      needsVariableMigration: true,
    };
  }
}

async function fetchDiscountDisplayName(discountId, adminApiQuery) {
  if (!discountId) {
    return "";
  }

  const candidateIds = [discountId];
  if (discountId.includes("DiscountAutomaticApp")) {
    candidateIds.push(
      discountId.replace("DiscountAutomaticApp", "DiscountAutomaticNode"),
    );
  }
  if (discountId.includes("DiscountCodeApp")) {
    candidateIds.push(
      discountId.replace("DiscountCodeApp", "DiscountCodeNode"),
    );
  }
  if (discountId.includes("DiscountAutomaticNode")) {
    candidateIds.push(
      discountId.replace("DiscountAutomaticNode", "DiscountAutomaticApp"),
    );
  }
  if (discountId.includes("DiscountCodeNode")) {
    candidateIds.push(
      discountId.replace("DiscountCodeNode", "DiscountCodeApp"),
    );
  }

  const gql = `#graphql
    query DiscountDisplayName($id: ID!) {
      node(id: $id) {
        __typename
        ... on DiscountAutomaticApp {
          title
        }
        ... on DiscountCodeApp {
          title
          codes(first: 1) {
            nodes {
              code
            }
          }
        }
        ... on DiscountAutomaticNode {
          automaticDiscount {
            ... on DiscountAutomaticApp {
              title
            }
          }
        }
        ... on DiscountCodeNode {
          codeDiscount {
            ... on DiscountCodeApp {
              title
              codes(first: 1) {
                nodes {
                  code
                }
              }
            }
          }
        }
      }
      discountNode(id: $id) {
        discount {
          ... on DiscountAutomaticApp {
            title
          }
          ... on DiscountCodeApp {
            title
            codes(first: 1) {
              nodes {
                code
              }
            }
          }
        }
      }
      automaticDiscountNode(id: $id) {
        automaticDiscount {
          ... on DiscountAutomaticApp {
            title
          }
        }
      }
    }
  `;

  for (const id of [...new Set(candidateIds)]) {
    try {
      const result = await adminApiQuery(gql, {variables: {id}});
      const payload = result?.data ?? result;
      const node = payload?.node;
      const fromNode =
        node?.title ||
        node?.automaticDiscount?.title ||
        node?.codeDiscount?.title ||
        node?.codeDiscount?.codes?.nodes?.[0]?.code ||
        node?.codes?.nodes?.[0]?.code;
      const fromDiscountNode =
        payload?.discountNode?.discount?.codes?.nodes?.[0]?.code ||
        payload?.discountNode?.discount?.title;
      const fromAutomatic =
        payload?.automaticDiscountNode?.automaticDiscount?.title;

      const resolved = [fromNode, fromDiscountNode, fromAutomatic].find(
        value => typeof value === "string" && value.trim(),
      );

      if (resolved) {
        return resolved.trim();
      }
    } catch {
      // Try the next ID shape.
    }
  }

  return "";
}

async function getResourcesByIds(itemType, ids, adminApiQuery) {
  if (!ids.length) {
    return [];
  }

  const isCollections = itemType === ITEM_TYPE_COLLECTIONS;
  const gql = isCollections
    ? `#graphql
      query GetCollections($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Collection {
            id
            title
          }
        }
      }
    `
    : `#graphql
      query GetProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
          }
        }
      }
    `;

  const result = await adminApiQuery(gql, {variables: {ids}});
  return (result?.data?.nodes ?? []).filter(Boolean);
}
