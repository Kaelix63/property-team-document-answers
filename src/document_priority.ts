export type PropertyDocument = {
  id: string;
  propertyId: string;
  kind: "maintenance_request" | "tenant_document" | "inspection_reminder";
  title: string;
  text: string;
  dueDate?: string;
};

export function orderForIndexing(
  documents: PropertyDocument[],
  today: string,
): PropertyDocument[] {
  const priority = (document: PropertyDocument): number => {
    if (document.kind === "inspection_reminder" && document.dueDate && document.dueDate <= today) return 0;
    if (document.kind === "maintenance_request") return 1;
    if (document.kind === "inspection_reminder") return 2;
    return 3;
  };

  return [...documents].sort((left, right) =>
    priority(left) - priority(right) || left.id.localeCompare(right.id),
  );
}

export function searchableText(document: PropertyDocument): string {
  const due = document.dueDate ? ` Due date: ${document.dueDate}.` : "";
  return `${document.kind}: ${document.title}.${due} ${document.text}`;
}
