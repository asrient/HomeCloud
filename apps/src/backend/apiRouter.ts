import { RouteGroup } from "./interface";
import manage from "./routes/manage";

const api = new RouteGroup();

api.add('/manage', manage.handle);

export default api;
