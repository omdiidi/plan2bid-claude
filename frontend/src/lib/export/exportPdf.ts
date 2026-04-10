import { pdf } from "@react-pdf/renderer";
import { createElement } from "react";
import { EstimatePdf } from "./EstimatePdf";
import type { ExportData } from "./types";

function slugify(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").slice(0, 40);
}

export async function exportPdf(data: ExportData): Promise<void> {
  const doc = createElement(EstimatePdf, { data });
  const blob = await pdf(doc).toBlob();

  const dateStr = new Date(data.project.generatedAt).toISOString().slice(0, 10);
  const filename = `Plan2Bid - ${data.project.name} - ${dateStr}.pdf`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
