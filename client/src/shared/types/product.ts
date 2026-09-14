export type ProductCategory = {
  id: string;
  name: string;
  slug: string;
};

export type ProductImage = {
  id: string;
  url: string;
  altText: string | null;
  position: number;
};

export type ProductVariant = {
  id: string;
  name: string;
  sku: string;
  priceCents: number;
  currency: string;
  stock: number;
};

export type ProductListItem = {
  id: string;
  name: string;
  slug: string;
  description: string;
  variants: ProductVariant[];
  images: ProductImage[];
  categories: ProductCategory[];
};
