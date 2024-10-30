import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import {
    method,
    validateJson,
    authenticate,
    validateQuery,
} from "../decorators";
import { AgentClient, getAgentInfo } from "../agentKit/client";
import DiscoveryService from "../agentKit/discovery";

const api = new RouteGroup();

const scanSchema = {
    type: "object",
    properties: {
        force: { type: "string" },
    },
};

api.add(
    "/scan",
    [
        method(["GET"]),
        validateQuery(scanSchema),
        authenticate(),
    ],
    async (request: ApiRequest) => {
        const { force } = request.getParams as { force: string };
        const forceScan = force === 'true';
        try {
            const discoveryService = DiscoveryService.getInstace();
            const candidates = discoveryService.getCandidates(forceScan);
            return ApiResponse.json(200, candidates);
        } catch (e) {
            return ApiResponse.fromError(e);
        }
    },
);

const getAgentInfoSchema = {
    type: "object",
    properties: {
        host: { type: "string" },
        fingerprint: { type: "string" },
    },
    required: ["host"],
};

api.add(
    "/agentInfo",
    [
        method(["POST"]),
        validateJson(getAgentInfoSchema),
        authenticate(),
    ],
    async (request: ApiRequest) => {
        const { host, fingerprint } = request.local.json as { host: string; fingerprint: string };

        const agentClient = new AgentClient(host, fingerprint || null, null);
        try {
            const agentInfo = await getAgentInfo(agentClient);
            return ApiResponse.json(200, agentInfo);
        } catch (e) {
            return ApiResponse.fromError(e);
        }
    },
);

export default api;
