# Node

Node `@pine/node` refers to the backend server that can run on the user's own devices like PCs, dedicated servers, mobiles and provide access to the resources of the host device (eg: storage, peripherals like audio/video, other connected devices). It uses `NodeJs` as the underlying runtime environment and thus is mostly cross-platform. Each node also serves the webapp by default.

## Node Server APIs

Node http apis can be divided into 4 categories according to their functions:

- API relay
- Service Discovery
- Auth & Security
- App APIs (includes settings, fs, app specific services)

### API relay

API relay is a feature where you can send a HTTP request to any node that is a part of the same network (or can be relayed furthur) as the intended node. This is useful then you are on a different network and cannot connect to the intended node directly but is able to connect to another node (it might be that this intermeditery node is the only exposed node, or this node is part of both the disjoint networks). It can also be used to overcome cors restrictions imposed by browsers.

It works by having a particular header `nodeId` set to every request that the node makes, mentioning the intended node. Every node has a unique nodeId which is the hash of their public key they own. When a node receives a request with a nodeId different from theirs, they looks up for the intended node in their local networks using `Service Discovery` and routes the request to it if found.

Another node on the network can as well claim the request if they are able to find the destination node on one of its networks, thus forming a chain of relay nodes.

API paths:

- `/api/*` | auth: None

### Service Discovery

Once you are connected & authenticated to a node, you can look up for available nodes that can been accessed via that node (api relay technique). Actual SD happens over multicast/broadcast UDP over the local network. One can either search for all available nodes or can search for a node with specific id. SD apis are used by the webapp to automatically lookup and connect to devices.

API paths:

- `/api/sd/me` | auth: none | Some info about this node, dev name, icon. It is used by the local nodes and web-app to verify authenticity, i.e the public key is actually owned by the node. The sender sends a challenge c = encrypt(nonce+number), encrypted with the target node's public key. The target node decrypts it, and sends a signature = encrypt(nonce+(number+1)+data) encrypted with its private key. Data represents info like name, icon etc.
- `/api/sd/explore` | auth: auth1 | Find all available nodes nearby, IP addresses are not sent back, only nodeIds and corresponding public keys.
- `/api/sd/find` | auth: auth1 | Same as explore but for only one specific nodeId as requested.

Algorith:
- Web app requests for `/explore` to a already connected node (A).
- Node (A) does a mDNS (bonjour) query and gets back a list of local node's ids and their pk (in txt records). Or returns a cached version of results if possible.
- For each newly discovered node (or ip address change), Node (A) verifies the new node using the `/me` api.
- Now any requests with this nodeId will be redirected to their respective ip addresses in near future. Mechanism should be in place to re-verify the nodes and ip address mapping after some interval of time.
- The web-app receives the list of (nodeId, pk) and again reverifies it using `/me` api and displays more friendly info like name and icon (along with nodeId) to the end user. 

### Auth & Security

`1. Security:` Since the webapp runs on a normal browser, only http calls are allowed and self-signed ssl certificates are not allowed unless added as a root CA. Since its not possible to add each and every publicKey of every node as a trusted root, we are not using ssl for implementing security. Also when using relay nodes, ssl will be of no use. Instead we encrypt our http payload. We to some extent are re-implementing the ssl layer but on application layer itself. ECDSA algorithm is used for node's key pair.

Secure Session Algorithm:

- Client knows the nodeId of the intended server.
- Hits `/api/secure/cert` to get the actual public key. It then verifies the nodeId (which is nothing but pk's hash) with the pk (public key) as well as infos like algorithm version.
- The handshake process uses Diffie-Hellman key exchange. Client generates a temporary ECDH key pair and sends the public key (DH-Pc) to the server encrypted with the server's public key (only server can decode it) `/api/secure/handshake`. The server decodes the message with its private key and generates another pair of ECDH keys and sends back public key part of it (DH-Ps) in plain text. Now both the sides have each other's DH public keys.
- Next step is to compute the final symmetric key (S) that will be used for this session from now on. After this both sides discards the temporary ECDH key pairs never to be used again. This ensures forward-secrecy.
- The secure session is established, all http requests sent using this session now will have its payload encrypted/decrypted by the shared key (S). An additional header is also required to be added in the requests (`sessionId`) which is the hash of the DH-Ps key that got generated by the server.
- `AES` is used for symmetric encryption. Sessions have a expiry. Each http payload also contains a timestamp and an incremental session messageId to prevent replay attacks. These are few bytes of additional payload that gets added and removed automatically before and after encryption.

`2. Authentication:` All the devices (nodes) that a user own can be accessed by the user after providing node's password. Nodes are password protected. There is no concept of multiple user accounts by design, if you need a setup for multiple users using a same device you can setup multiple nodes in a single instance (each having different nodeIds). It should be possible to share certain (or all) resources to others by generating access tokens and sharing them. Any user with such a token can access resources of the node that they have been given permission to. The actual password is never transmitted over the line from client to server instead it uses an algorithm. First a `secure` connection is established.

Auth1 Algorithm:

- `/api/auth/login` (secure): Client sends the password to server for verification.
- The password is stored in the node as (hash(password + salt), salt). To verify node does: hash(received_password + salt) and checks with the stored value.
- If it matches, the current session gets validated as an authenticated one.

### Apps & System APIs

All apps like photos, movies have a backend component running on node. The webapp part of the app is a consumer where as the node part is a producer. Services like audio/video casting, access to file system is a part of the system APIs, these are used by the apps as well as settings ui. Node part of an app is only responsible to expose and maintain data and resources of that particular devices only, it does not need to be aware or connect to other nodes to work. The webapp part is the one that connects to multiple nodes to fetch data and show them to the user.

Apps:

- Photos
- Settings
- Files
- Movies
- Music
- Books
- Notes
- Contacts
- Messages
- Drop In
- Calls

Photos, Movies, Music, Books, Notes app follow a similar paradigm of architecture. They store their contents in separate private directories managed by the node themselves, and users are not supposed to access or change them directly. Users need to import their content manually (except for mobile OSes were it might be managed by the node, eg: photos app on ios and android using the device's camera roll).
Whereas the Files app shows the filesystem of the device itself directly.

Webapp is not supposed to access a database directly at anytime, there should always be a controller layer in the node to relay the required requests.
