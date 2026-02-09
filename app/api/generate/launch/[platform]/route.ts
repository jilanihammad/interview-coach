import { NextResponse } from "next/server";

import { generateLaunch } from "@/lib/ai";
import { getProductById, updateProduct } from "@/lib/db";
import { isNonEmptyString, stringOrFallback } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedPlatforms = [
  "producthunt",
  "twitter",
  "linkedin",
  "hackernews",
] as const;

type Platform = (typeof allowedPlatforms)[number];

export async function POST(
  request: Request,
  { params }: { params: { platform: string } }
) {
  try {
    const platformParam = params.platform?.toLowerCase();
    const isSupported = allowedPlatforms.includes(platformParam as Platform);

    if (!isSupported) {
      return NextResponse.json(
        { error: "Unsupported platform" },
        { status: 400 }
      );
    }

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

    const platform = platformParam as Platform;
    const launch = generateLaunch({
      name: product.name,
      description: stringOrFallback(description, product.description),
      platform,
    });

    const mergedLaunch = { ...(product.launch ?? {}), ...launch };

    const updated = updateProduct(productId, {
      launch: mergedLaunch,
      progress: { ...product.progress, launchScheduled: true },
    });

    return NextResponse.json({
      launch: mergedLaunch,
      product: updated,
    });
  } catch (error) {
    console.error("Error generating launch content", error);
    return NextResponse.json(
      { error: "Unable to generate launch content" },
      { status: 500 }
    );
  }
}
