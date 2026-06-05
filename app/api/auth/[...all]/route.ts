import { auth } from "@/server/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { rateLimit } from "@/utils/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const { GET: originalGET, POST: originalPOST } = toNextJsHandler(auth);

async function applyRateLimit(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<Response>
): Promise<Response> {
  // Use more lenient rate limits for GET requests (read-only)
  const isReadRequest = request.method === 'GET';
  const rateLimitResult = await rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: isReadRequest ? 30 : 10, // 30 for GET, 10 for mutations
    key: isReadRequest ? 'auth:read' : 'auth:write'
  });

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0', 'Retry-After': '60' } }
    );
  }

  const response = await handler(request);
  
  // Add rate limit headers to successful responses
  if (response instanceof NextResponse) {
    response.headers.set('X-RateLimit-Remaining', String(rateLimitResult.remaining));
  }
  
  return response;
}

export async function GET(request: NextRequest): Promise<Response> {
  return applyRateLimit(request, originalGET);
}

export async function POST(request: NextRequest): Promise<Response> {
  return applyRateLimit(request, originalPOST);
}
