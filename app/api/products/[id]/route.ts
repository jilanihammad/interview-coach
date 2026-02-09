import { NextResponse } from "next/server";

import {
  deleteProduct,
  getProductById,
  updateProduct,
  UpdateProductInput,
} from "@/lib/db";
import { isString } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductRouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: ProductRouteContext) {
  const { id } = await context.params;
  const product = getProductById(id);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  return NextResponse.json(product);
}

export async function PUT(request: Request, context: ProductRouteContext) {
  try {
    const { id } = await context.params;
    const body: UpdateProductInput = await request.json();

    if (body.name !== undefined && !isString(body.name)) {
      return NextResponse.json(
        { error: "Name must be a string" },
        { status: 400 }
      );
    }

    if (body.description !== undefined && !isString(body.description)) {
      return NextResponse.json(
        { error: "Description must be a string" },
        { status: 400 }
      );
    }

    const updated = updateProduct(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating product", error);
    return NextResponse.json(
      { error: "Unable to update product" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: ProductRouteContext) {
  try {
    const { id } = await context.params;
    const removed = deleteProduct(id);
    if (!removed) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting product", error);
    return NextResponse.json(
      { error: "Unable to delete product" },
      { status: 500 }
    );
  }
}
