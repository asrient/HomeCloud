import { RouteGroup } from "./interface";
import profile from "./routes/profile";

const api = new RouteGroup();

api.add('/profile', profile.handle);

export default api;
