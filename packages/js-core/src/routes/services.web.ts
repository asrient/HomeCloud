import { RouteGroup } from "../interface";
import photos from "./services/photos";
import thumb from "./services/thumb";
import files from "./services/files";

const api = new RouteGroup();

api.add("/photos", photos.handle);
api.add("/thumb", thumb.handle);
api.add("/files", files.handle);

export default api;
