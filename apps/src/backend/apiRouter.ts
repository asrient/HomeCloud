import profile from "./routes/profile";
import root from "./routes/root";
import storage from "./routes/storage";

root.add('/profile', profile.handle);
root.add('/storage', storage.handle);

export default root;
