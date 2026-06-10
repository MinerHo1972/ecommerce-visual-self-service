import { NextResponse } from "next/server";
import { sampleLayerTemplates } from "@/lib/sample-data";

export async function GET() {
  return NextResponse.json({ success: true, data: { items: sampleLayerTemplates, page: 1, page_size: sampleLayerTemplates.length, total: sampleLayerTemplates.length }, error: null });
}
