import { supabase } from "./supabaseClient.js";

// Deployment compatibility only. Database policies/RPCs independently authorize
// every request; this version string is never an authorization credential.
export const BACKEND_CONTRACT = "20261026.1";
let contractCheck;
export function requireBackendContract() {
  return (contractCheck ||= (async () => {
    const { data, error } = await supabase.rpc("igotu_backend_contract");
    if (
      error ||
      data?.version !== BACKEND_CONTRACT ||
      data?.notifications !== "database"
    ) {
      throw new Error(
        "Account access is temporarily unavailable. Please contact an administrator or try again.",
      );
    }
  })());
}
function arrayResult(result) {
  if (result.error) return result;
  return Array.isArray(result.data)
    ? result
    : {
        data: null,
        error: {
          message:
            "The service response could not be checked. Please try again.",
        },
      };
}
export async function providerRequests(statuses = null, requestId = null) {
  return arrayResult(
    await supabase.rpc("provider_service_requests", {
      p_request_id: requestId,
      p_statuses: statuses,
    }),
  );
}
export async function serviceParticipants(requestIds) {
  const ids = [...new Set(requestIds.filter(Boolean))];
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const result = arrayResult(
      await supabase.rpc("service_participants", {
        p_request_ids: ids.slice(offset, offset + 100),
      }),
    );
    if (result.error) return result;
    rows.push(...result.data);
  }
  return { data: rows, error: null };
}
export async function recommendedCandidates(requestId) {
  return arrayResult(
    await supabase.rpc("recommended_provider_candidates", {
      p_request_id: requestId,
    }),
  );
}
