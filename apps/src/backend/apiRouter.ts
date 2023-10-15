import profile from "./routes/profile";
import root from "./routes/root";
import storage from "./routes/storage";
import fsRoutes from "./routes/fs";
import services from "./routes/services";
import { authenticate } from "./decorators";

root.add("/profile", profile.handle);
root.add("/storage", storage.handle);
root.add("/fs", fsRoutes.handle);
root.add("/services", [authenticate()], services.handle);

export default root;
