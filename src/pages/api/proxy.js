export const runtime = 'edge';

export const GET = async ({ request }) => {
  const { searchParams, origin } = new URL(request.url);
  const targetUrl = searchParams.get("url");
  const referer = searchParams.get("referer") || "";

  if (!targetUrl) {
    return new Response("Missing URL parameter", { status: 400 });
  }

  try {
    // Forward range header from original request
    const rangeHeader = request.headers.get('range');
    
    const fetchHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Referer": referer,
      "Origin": new URL(referer || targetUrl).origin,
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
    };

    // Add range header if present
    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader;
    }

    const response = await fetch(targetUrl, {
      headers: fetchHeaders,
      redirect: 'follow'
    });

    if (!response.ok) {
      console.error(`Fetch failed: ${response.status} ${response.statusText}`);
      return new Response(`Upstream error: ${response.status}`, { 
        status: response.status 
      });
    }

    const contentType = response.headers.get("content-type") || "";

    // Handle M3U8 playlists
    if (targetUrl.includes(".m3u8") || contentType.includes("mpegurl") || contentType.includes("x-mpegURL")) {
      const text = await response.text();
      
      const rewritten = text.split("\n").map(line => {
        const trimmed = line.trim();
        
        // Empty lines
        if (!trimmed) return "";
        
        // Comment lines - handle URI in EXT-X-KEY
        if (trimmed.startsWith("#")) {
          return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
            try {
              const absoluteUrl = new URL(uri, targetUrl).href;
              return `URI="${origin}/api/proxy?referer=${encodeURIComponent(referer)}&url=${encodeURIComponent(absoluteUrl)}"`;
            } catch (e) {
              console.error('Failed to parse URI:', uri, e);
              return match;
            }
          });
        }
        
        // Resource lines (segments, sub-playlists)
        if (!trimmed.startsWith("#")) {
          try {
            const absoluteUrl = new URL(trimmed, targetUrl).href;
            return `${origin}/api/proxy?referer=${encodeURIComponent(referer)}&url=${encodeURIComponent(absoluteUrl)}`;
          } catch (e) {
            console.error('Failed to parse resource:', trimmed, e);
            return trimmed;
          }
        }
        
        return trimmed;
      }).join("\n");

      return new Response(rewritten, {
        status: response.status,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Range, Content-Type",
          "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Type",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        }
      });
    }

    // Handle video segments (.ts files)
    const responseHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
      "Cache-Control": "public, max-age=31536000, immutable",
    };

    // Copy important headers from upstream
    const contentLength = response.headers.get("content-length");
    const contentRange = response.headers.get("content-range");
    const acceptRanges = response.headers.get("accept-ranges");

    if (contentType) responseHeaders["Content-Type"] = contentType;
    if (contentLength) responseHeaders["Content-Length"] = contentLength;
    if (contentRange) responseHeaders["Content-Range"] = contentRange;
    if (acceptRanges) responseHeaders["Accept-Ranges"] = acceptRanges;

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });

  } catch (err) {
    console.error('Proxy error:', err);
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
};

// Handle OPTIONS for CORS preflight
export const OPTIONS = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Max-Age": "86400",
    }
  });
};