import { NextResponse } from "next/server";

import { generatePricing } from "@/lib/ai";
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

    const pricing = generatePricing({
      name: product.name,
      description: stringOrFallback(description, product.description),
    });

    const updated = updateProduct(productId, {
      pricing,
      progress: { ...product.progress, pricingDone: true },
    });

    return NextResponse.json({ pricing, product: updated });
  } catch (error) {
    console.error("Error generating pricing", error);
    return NextResponse.json(
      { error: "Unable to generate pricing" },
      { status: 500 }
    );
  }
}
