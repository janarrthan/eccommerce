export const PERMISSION_CODES = {
  CATALOG_READ: "catalog:read",
  CATALOG_WRITE: "catalog:write",
  INVENTORY_READ: "inventory:read",
  INVENTORY_WRITE: "inventory:write",
  ORDERS_READ: "orders:read",
  ORDERS_WRITE: "orders:write",
  STAFF_READ: "staff:read",
  STAFF_WRITE: "staff:write",
  SETTINGS_READ: "settings:read",
  SETTINGS_WRITE: "settings:write",
} as const;

export type PermissionCode =
  (typeof PERMISSION_CODES)[keyof typeof PERMISSION_CODES];
