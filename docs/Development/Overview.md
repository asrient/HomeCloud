# Development guide

HomeCloud uses a monorepo, consisting of multiple sub projects. The project is mostly written in typescript and javascript. We use electronJs for desktop app and NextJs for frontend. Server runs on NodeJs.

## Frontend

The frontend code for both server and desktop is located at `/web`.
We use NextJs Static Site Generation to create a static bundle which is served by both desktop & server.

## Desktop

The source code for electron app is located at `/apps`. This project folder is shared by both desktop and server, since they share majority of their code. Code specific to desktop app is located at `/apps/src/desktop`. Shared code is at `/apps/src/backend`.

## Server

Same as desktop, with server specific code at `/apps/src/node`.

## OneAuth

To help with OAuth logins like Google Drive, Dropbox, we have a seperate service, seperate from the main application. It's a nodejs/express server, code located at `/authServer`.
