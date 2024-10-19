import profile from "./routes/profile";
import agentRoot from "./routes/root.agent";
import fsRoutes from "./routes/fs";
import services from "./routes/services.agent";
import { authenticate } from "./decorators";

agentRoot.add("/profile", profile.handle);
agentRoot.add("/fs", fsRoutes.handle);
agentRoot.add("/services", [authenticate()], services.handle);

export default agentRoot;
