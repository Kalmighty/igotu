import { supabase } from "./supabaseClient.js";

// Deployment compatibility only. Database policies/RPCs independently authorize
// every request; this version string is never an authorization credential.
export const BACKEND_CONTRACT = "20261026.1";
// Fixed diagnostic codes contain no server payload, identity or credentials.
export class BackendContractError extends Error {
  constructor(code) {
    super(
      "IGotU cannot confirm that the current server supports this version of the application. Please try again later or contact the system administrator.",
    );
    this.name = "BackendContractError";
    this.code = code;
  }
}
let contractCheck;
export function requireBackendContract() {
  return (contractCheck ||= (async () => {
    let result;
    try {
      result = await supabase.rpc("igotu_backend_contract");
    } catch {
      throw new BackendContractError("BACKEND_CONNECTION");
    }
    const { data, error } = result || {};
    if (error) {
      const code = ["PGRST202", "42883"].includes(error.code)
        ? "BACKEND_RPC_UNAVAILABLE"
        : error.code === "42501"
          ? "BACKEND_PERMISSION"
          : ["PGRST301", "PGRST302", "PGRST303"].includes(error.code)
            ? "BACKEND_AUTH"
            : "BACKEND_UNAVAILABLE";
      throw new BackendContractError(code);
    }
    if (data?.version !== BACKEND_CONTRACT)
      throw new BackendContractError("BACKEND_VERSION");
    if (data?.notifications !== "database")
      throw new BackendContractError("BACKEND_NOTIFICATIONS");
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
