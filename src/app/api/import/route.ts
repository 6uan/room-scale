import { NextResponse } from "next/server";
import { z } from "zod";
import { readUrl } from "./read-url";

const Body = z.object({ url: z.string().max(2048) });

/**
 * `POST { url }` — fetch one product page and read what can be read from it.
 *
 * Nothing about the project is sent here: only the address that was pasted.
 * Nothing is stored. The result is a proposal the form shows for checking.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { status: "refused", message: "No address was sent." },
      { status: 400 },
    );
  }
  return NextResponse.json(await readUrl(body.data.url));
}
