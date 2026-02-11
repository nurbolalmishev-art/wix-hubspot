import { items } from "@wix/data";
import { auth } from "@wix/essentials";

export const elevatedItems = {
  query: auth.elevate(items.query),
  insert: auth.elevate(items.insert),
  update: auth.elevate(items.update),
  remove: auth.elevate(items.remove),
};

