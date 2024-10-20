import webRoot from "./routes/root.web";
import agentRoot from "./routes/root.agent";
import storage from "./routes/storage.web";
import fsRoutes from "./routes/fs";
import webServices from "./routes/services.web";
import agentServices from "./routes/services.agent";
import { authenticate } from "./decorators";
import profile from "./routes/profile";
import discovery from "./routes/discovery.web";

// For local web app to consume
webRoot.add("/storage", storage.handle);
webRoot.add("/fs", fsRoutes.handle);
webRoot.add("/services", [authenticate()], webServices.handle);
webRoot.add("/profile", profile.handle);
webRoot.add("/discovery", discovery.handle);

// For agents to consume
agentRoot.add("/fs", fsRoutes.handle);
agentRoot.add("/services", [authenticate()], agentServices.handle);

export {webRoot as webRouter, agentRoot as agentRouter};
