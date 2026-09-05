import { z } from "zod";
import { orderForIndexing, type PropertyDocument } from "./document_priority.js";
import { PropertyDocumentIndex } from "./infrai_document_index.js";

const documentSchema = z.object({
  id: z.string().min(1),
  propertyId: z.string().min(1),
  kind: z.enum(["maintenance_request", "tenant_document", "inspection_reminder"]),
  title: z.string().min(1),
  text: z.string().min(1),
  dueDate: z.string().date().optional(),
}).strict();

const sampleDocuments: PropertyDocument[] = [
  { id: "maint-104", propertyId: "cedar-17", kind: "maintenance_request", title: "Kitchen sink leak", text: "Tenant reported a slow leak under the kitchen sink. Plumber visit is booked for September 2." },
  { id: "tenant-lease-17b", propertyId: "cedar-17", kind: "tenant_document", title: "Lease pet addendum", text: "Unit 17B permits one indoor cat. The addendum was signed by Morgan Lee on June 5." },
  { id: "inspect-smoke-17", propertyId: "cedar-17", kind: "inspection_reminder", title: "Annual smoke alarm inspection", text: "Inspect alarms in every bedroom and record battery replacement dates.", dueDate: "2026-08-28" },
];

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before seeding property documents");

const checked = sampleDocuments.map((document) => documentSchema.parse(document));
const ordered = orderForIndexing(checked, new Date().toISOString().slice(0, 10));
const index = new PropertyDocumentIndex(apiKey);
try {
  const result = await index.index(ordered);
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (process.env.INFRAI_CLEANUP === "true") await index.deleteCollection();
}
