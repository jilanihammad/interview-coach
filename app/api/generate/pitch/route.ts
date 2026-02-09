import { NextResponse } from "next/server";

import { generatePitch } from "@/lib/ai";
import { getProductById, updateProduct } from "@/lib/db";
import { isNonEmptyString, stringOrFallback, stringOrNull } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { productId, description, feedback } = body ?? {};

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

    const pitch = generatePitch({
      name: product.name,
      description: stringOrFallback(description, product.description),
      feedback: stringOrNull(feedback) ?? undefined,
    });

    const updated = updateProduct(productId, {
      pitch,
      progress: { ...product.progress, pitchDone: true },
    });

    return NextResponse.json({ pitch, product: updated });
  } catch (error) {
    console.error("Error generating pitch", error);
    return NextResponse.json(
      { error: "Unable to generate pitch" },
      { status: 500 }
    );
  }
}
