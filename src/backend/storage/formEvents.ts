import { COLLECTIONS, collectionId } from "./collections";
import { elevatedItems } from "./elevatedItems";

export type FormEventRecord = {
  hubId: number;
  formId: string;
  correlationId: string;
  pageUrl?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  occurredAtMs: number;
  receivedAtMs: number;
};

export async function logFormEvent(record: FormEventRecord): Promise<void> {
  await elevatedItems.insert(collectionId(COLLECTIONS.formEvents), record);
}

