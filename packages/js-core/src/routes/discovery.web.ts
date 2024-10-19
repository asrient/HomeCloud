import { ApiRequest, ApiResponse, RouteGroup } from "../interface";
import {
    method,
    validateJson,
    authenticate,
    validateQuery,
} from "../decorators";
import { AgentClient, getAgentInfo } from "../agentKit/client";

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
        // todo: implement scan
        return ApiResponse.json(200, {});
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
        const agentInfo = await getAgentInfo(agentClient);

        return ApiResponse.json(200, agentInfo);
    },
);

export default api;
