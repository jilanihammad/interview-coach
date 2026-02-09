import { NextResponse } from "next/server";

import { generateOutreach } from "@/lib/ai";
import { getProductById, updateProduct } from "@/lib/db";
import { isNonEmptyString, stringOrFallback } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { productId, description } = body ?? {};

    if (!isNonEmptyString(productId)) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 }
      );
    }

    const product = getProductById(productId);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const outreach = generateOutreach({
      name: product.name,
      description: stringOrFallback(description, product.description),
      icp: product.icp,
    });

    const updated = updateProduct(productId, {
      outreach,
      progress: { ...product.progress, outreachStarted: true },
    });

    return NextResponse.json({ outreach, product: updated });
  } catch (error) {
    console.error("Error generating outreach", error);
    return NextResponse.json(
      { error: "Unable to generate outreach" },
      { status: 500 }
    );
  }
}
