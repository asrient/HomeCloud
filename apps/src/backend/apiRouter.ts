import profile from "./routes/profile";
import root from "./routes/root";

root.add('/profile', profile.handle);

export default root;
