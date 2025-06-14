# Webdav Client

This folder has been forked from [webdav-client](https://github.com/perry-mitchell/webdav-client), with some fixes to help integrate into the project better. Version used is v5.

## Fixes done

- Get rid of the esm requirement by moving to code into our own build.
- Reduce the number of dependencies and use nodejs APIs where ever possible.
- Remove compatibility abstractions as the code will always run on nodejs.
