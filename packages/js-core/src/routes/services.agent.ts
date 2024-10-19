import { RouteGroup } from "../interface";
import photos from "./services/photos";
import thumb from "./services/thumb";

const api = new RouteGroup();

api.add("/photos", photos.handle);
api.add("/thumb", thumb.handle);

export default api;
