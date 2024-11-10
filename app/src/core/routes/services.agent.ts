import { RouteGroup } from "../interface";
import files from "./services/files";
import photos from "./services/photos";
import thumb from "./services/thumb";

const api = new RouteGroup();

api.add("/photos", photos.handle);
api.add("/thumb", thumb.handle);
api.add("/files", files.handle);

export default api;
