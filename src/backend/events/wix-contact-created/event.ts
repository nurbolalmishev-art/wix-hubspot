import { contacts } from "@wix/crm";
import { handleWixContactChange } from "../../sync/wixToHubspot";

contacts.onContactCreated(async (event) => {
  try {
    await handleWixContactChange(event);
  } catch {
    console.error("Wix contact created handler failed.");
  }
});

