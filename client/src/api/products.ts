import type { ProductListItem } from "../shared/types/product";
import { request } from "./client";

const storefrontProductsPath = "/storefront/products";

type ListProductsParams = {
  category?: string;
  search?: string;
};

function buildProductQuery(params: ListProductsParams) {
  const query = new URLSearchParams();

  if (params.category) {
    query.set("category", params.category);
  }

  if (params.search) {
    query.set("search", params.search);
  }

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

export const productApi = {
  listProducts: (params: ListProductsParams = {}) =>
    request<{ products: ProductListItem[] }>(
      `${storefrontProductsPath}${buildProductQuery(params)}`,
    ),

  getProduct: (slug: string) =>
    request<{ product: ProductListItem }>(
      `${storefrontProductsPath}/${encodeURIComponent(slug)}`,
    ),
};
