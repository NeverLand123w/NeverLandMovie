// Remove runtime: 'edge' if you are on standard Node, 
// but Edge is usually faster for handshakes.
export const config = { runtime: "edge" };

export const GET = async ({ request }) => {
  const { searchParams, origin } = new URL(request.url);
  const targetUrl = searchParams.get("url");
  const referer = searchParams.get("referer") || "";

  if (!targetUrl) return new Response(null, { status: 400 });

  try {
    const fetchHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Accept-Encoding": "identity", // Prevents source from wasting time compressing
    };

    if (referer) {
      fetchHeaders["Referer"] = referer;
      fetchHeaders["Origin"] = new URL(referer).origin;
    }

    const response = await fetch(targetUrl, { 
      headers: fetchHeaders,
      redirect: 'follow',
    });

    const contentType = response.headers.get("content-type") || "";

    // 1. PLAYLIST: Speed up the parsing
    if (contentType.includes("mpegurl") || targetUrl.includes(".m3u8")) {
      const text = await response.text();
      // Fast rewrite logic
      const rewritten = text.replaceAll(/URI="([^"]+)"/g, (m, p1) => {
        const abs = new URL(p1, targetUrl).href;
        return `URI="${origin}/api/proxy?referer=${encodeURIComponent(referer)}&url=${encodeURIComponent(abs)}"`;
      }).split("\n").map(line => {
        if (!line.trim() || line.startsWith("#")) return line;
        const abs = new URL(line.trim(), targetUrl).href;
        return `${origin}/api/proxy?referer=${encodeURIComponent(referer)}&url=${encodeURIComponent(abs)}`;
      }).join("\n");

      return new Response(rewritten, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, s-maxage=30", 
        }
      });
    }

    // 2. SEGMENTS: THE SPEED BOOST
    // Use an identity pass-through
    return new Response(response.body, {
      headers: {
        "Content-Type": "video/mp2t",
        "Access-Control-Allow-Origin": "*",
        // DRAMATIC CACHE SETTINGS:
        // This makes Vercel's Global CDN act as your own video server.
        // Even if Vidcloud is slow, Vercel will deliver it from its RAM once 1 person watches.
        "Cache-Control": "public, s-maxage=31536000, max-age=31536000, stale-while-revalidate=3600",
      }
    });
  } catch (e) {
    return new Response(null, { status: 504 });
  }
};