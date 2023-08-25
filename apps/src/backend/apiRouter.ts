import { RouteGroup } from "./interface";
import info from "./routes/info";

const api = new RouteGroup();

api.add('/info', info.handle);

export default api;
