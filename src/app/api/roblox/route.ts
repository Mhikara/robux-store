import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  username: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Format username tidak valid." },
        { status: 400 }
      );
    }

    const response = await fetch(
      "https://users.roblox.com/v1/usernames/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernames: [parsed.data.username],
          excludeBannedUsers: false,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Layanan Roblox sedang bermasalah." },
        { status: 502 }
      );
    }

    const result = await response.json();
    const user = result.data?.[0];

    if (!user) {
      return NextResponse.json(
        { error: "Username tidak ditemukan." },
        { status: 404 }
      );
    }

    let avatar: string | null = null;

    try {
      const thumb = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png&isCircular=false`,
        { cache: "no-store", signal: AbortSignal.timeout(8000) }
      );

      if (thumb.ok) {
        const data = await thumb.json();
        avatar = data.data?.[0]?.imageUrl ?? null;
      }
    } catch {}

    return NextResponse.json({
      id: user.id,
      username: user.name,
      displayName: user.displayName,
      avatar,
    });
  } catch {
    return NextResponse.json(
      { error: "Gagal menghubungi layanan Roblox." },
      { status: 500 }
    );
  }
}
