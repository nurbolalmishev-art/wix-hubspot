import { contacts } from "@wix/crm";
import { handleWixContactChange } from "../../sync/wixToHubspot";

contacts.onContactUpdated(async (event) => {
  try {
    await handleWixContactChange(event);
  } catch {
    console.error("Wix contact updated handler failed.");
  }
});

