import { DiscoveryQueryError, parseOptionsQuery } from "@/lib/benchmark-discovery";
import { serviceError, unavailable } from "@/lib/errors";
import { getStore } from "@/server/store";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  try {
    const { field, query, filters } = parseOptionsQuery(new URL(request.url).searchParams);
    return Response.json(await getStore().listOptions(field, query, filters), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DiscoveryQueryError) return serviceError(400, "invalid_request", error.message);
    return unavailable("Service unavailable.");
  }
}
