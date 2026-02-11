import { items } from "@wix/data";
import { auth } from "@wix/essentials";

/**
 * HubSpot webhooks hit our backend without Wix auth headers.
 * Wix Data operations can require elevated permissions in that context,
 * so we wrap the core operations with `auth.elevate`.
 */
export const elevatedItems = {
  query: auth.elevate(items.query),
  insert: auth.elevate(items.insert),
  update: auth.elevate(items.update),
  remove: auth.elevate(items.remove),
};

