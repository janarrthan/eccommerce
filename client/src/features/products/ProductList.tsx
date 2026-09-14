import { useEffect, useState } from "react";

import { productApi } from "../../api/products";
import type { ProductListItem } from "../../shared/types/product";
import styles from "./ProductList.module.css";

type ProductListStatus = "loading" | "ready" | "error";

const categoryFilters = [
  { label: "All", value: "" },
  { label: "Workspace", value: "workspace" },
  { label: "Apparel", value: "apparel" },
  { label: "Accessories", value: "accessories" },
] as const;

type CategoryFilterValue = (typeof categoryFilters)[number]["value"];

export function ProductList() {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [status, setStatus] = useState<ProductListStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryFilterValue>("");
  const [searchTerm, setSearchTerm] = useState("");
  const trimmedSearchTerm = searchTerm.trim();
  const hasActiveFilters =
    selectedCategory !== "" || trimmedSearchTerm.length > 0;

  useEffect(() => {
    let ignoreResult = false;

    productApi
      .listProducts({
        category: selectedCategory || undefined,
        search: trimmedSearchTerm || undefined,
      })
      .then((payload) => {
        if (ignoreResult) {
          return;
        }

        setProducts(payload.products);
        setStatus("ready");
      })
      .catch((requestError: unknown) => {
        if (ignoreResult) {
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load products.",
        );
        setStatus("error");
      });

    return () => {
      ignoreResult = true;
    };
  }, [selectedCategory, trimmedSearchTerm]);

  function beginFilterChange() {
    setStatus("loading");
    setError(null);
  }

  function changeCategory(category: CategoryFilterValue) {
    beginFilterChange();
    setSelectedCategory(category);
  }

  function changeSearchTerm(value: string) {
    beginFilterChange();
    setSearchTerm(value);
  }

  function clearFilters() {
    beginFilterChange();
    setSelectedCategory("");
    setSearchTerm("");
  }

  return (
    <section className={styles.catalog} aria-labelledby="catalog-heading">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Storefront</p>
          <h1 className={styles.title} id="catalog-heading">
            Products
          </h1>
        </div>
        <p className={styles.count}>
          {status === "ready" ? `${products.length} items` : "Demo catalog"}
        </p>
      </div>

      <div className={styles.controls}>
        <div className={styles.categoryFilters} aria-label="Product categories">
          {categoryFilters.map((category) => (
            <button
              className={
                selectedCategory === category.value
                  ? styles.activeFilter
                  : styles.filterButton
              }
              key={category.value || "all"}
              onClick={() => changeCategory(category.value)}
              type="button"
              aria-pressed={selectedCategory === category.value}
            >
              {category.label}
            </button>
          ))}
        </div>

        <label className={styles.searchField}>
          <span className={styles.searchLabel}>Search products</span>
          <input
            className={styles.searchInput}
            onChange={(event) => changeSearchTerm(event.target.value)}
            placeholder="Search by name or description"
            type="search"
            value={searchTerm}
          />
        </label>

        {hasActiveFilters ? (
          <button
            className={styles.clearButton}
            onClick={clearFilters}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </div>

      {status === "loading" ? (
        <CatalogStatus message="Loading products..." />
      ) : null}

      {status === "error" ? (
        <CatalogStatus
          tone="error"
          message={error ?? "Unable to load products."}
        />
      ) : null}

      {status === "ready" && products.length === 0 ? (
        <CatalogStatus
          message={
            hasActiveFilters
              ? "No products match your filters."
              : "No products found."
          }
        />
      ) : null}

      {status === "ready" && products.length > 0 ? (
        <div className={styles.grid}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ProductCard({ product }: { product: ProductListItem }) {
  const coverImage = product.images[0];
  const stock = product.variants.reduce(
    (total, variant) => total + variant.stock,
    0,
  );
  const categoryNames = product.categories
    .map((category) => category.name)
    .join(", ");

  return (
    <article className={styles.card}>
      <div className={styles.imageFrame}>
        {coverImage ? (
          <img
            className={styles.image}
            src={coverImage.url}
            alt={coverImage.altText ?? product.name}
          />
        ) : (
          <div className={styles.imageFallback}>
            {categoryNames || "Uncategorized"}
          </div>
        )}
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardTopline}>
          <span className={styles.category}>
            {categoryNames || "Uncategorized"}
          </span>
          <span className={stock > 0 ? styles.stock : styles.outOfStock}>
            {stock > 0 ? `${stock} in stock` : "Out of stock"}
          </span>
        </div>

        <h2 className={styles.productName}>{product.name}</h2>
        <p className={styles.description}>{product.description}</p>

        <div className={styles.cardFooter}>
          <div>
            {product.variants.length === 0 ? (
              <p className={styles.price}>Unavailable</p>
            ) : (
              product.variants.map((variant) => (
                <p className={styles.price} key={variant.id}>
                  {product.variants.length > 1 ? `${variant.name}: ` : ""}
                  {new Intl.NumberFormat("en-US", {
                    currency: variant.currency,
                    style: "currency",
                  }).format(variant.priceCents / 100)}
                  {variant.stock === 0 ? " (out of stock)" : ""}
                </p>
              ))
            )}
          </div>
          <button className={styles.detailsButton} type="button">
            View
          </button>
        </div>
      </div>
    </article>
  );
}

function CatalogStatus({
  message,
  tone = "neutral",
}: {
  message: string;
  tone?: "neutral" | "error";
}) {
  return (
    <p className={tone === "error" ? styles.errorState : styles.state}>
      {message}
    </p>
  );
}
