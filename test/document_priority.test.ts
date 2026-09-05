import assert from "node:assert/strict";
import test from "node:test";
import { orderForIndexing, type PropertyDocument } from "../src/document_priority.js";

test("an overdue inspection is indexed before routine property records", () => {
  const documents: PropertyDocument[] = [
    { id: "tenant-a", propertyId: "cedar-17", kind: "tenant_document", title: "Lease", text: "Signed lease" },
    { id: "maint-a", propertyId: "cedar-17", kind: "maintenance_request", title: "Tap", text: "Tap drips" },
    { id: "inspect-a", propertyId: "cedar-17", kind: "inspection_reminder", title: "Smoke alarms", text: "Check alarms", dueDate: "2026-08-28" },
  ];

  const ordered = orderForIndexing(documents, "2026-08-31");

  assert.deepEqual(ordered.map((document) => document.id), ["inspect-a", "maint-a", "tenant-a"]);
  assert.deepEqual(documents.map((document) => document.id), ["tenant-a", "maint-a", "inspect-a"]);
});
