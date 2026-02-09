import { NextResponse } from "next/server";

import { CreateProductInput, createProduct, listProducts } from "@/lib/db";
import { isNonEmptyString } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = listProducts();
    return NextResponse.json({ products });
  } catch (error) {
    console.error("Error listing products", error);
    return NextResponse.json(
      { error: "Unable to load products" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body: Partial<CreateProductInput> = await request.json();
    if (!isNonEmptyString(body.name) || !isNonEmptyString(body.description)) {
      return NextResponse.json(
        { error: "Name and description are required" },
        { status: 400 }
      );
    }

    const product = createProduct({
      name: body.name,
      description: body.description,
      status: isNonEmptyString(body.status) ? body.status : undefined,
      pitch: body.pitch,
      pricing: body.pricing,
      icp: body.icp,
      outreach: body.outreach,
      launch: body.launch,
      progress: body.progress,
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Error creating product", error);
    return NextResponse.json(
      { error: "Unable to create product" },
      { status: 500 }
    );
  }
}
