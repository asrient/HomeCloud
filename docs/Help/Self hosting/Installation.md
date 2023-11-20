# How to setup your own self-hosted HomeCloud Server

You can setup your own HomeCloud server instance using Docker.
It is best to run your server in an isolated device that can run 24/7, and is accessable to all your home network.

This guide will walk you through the steps to install and run the server.

## Things you will need

- Docker
- MySQL
- OneAuth Account (optional)

## Installation

1. Install Docker on your machine if you haven't already. \
    [Docker Installation Guide](https://docs.docker.com/engine/install/).

2. Pull the Docker image from Docker Hub:

```bash
    $ docker pull asrient/homecloud
```

3. Run a MySQL database instance:
    - Pull the MySQL image from Docker Hub:
    ```bash
    $ docker pull mysql
    ```
    - Run the MySQL container:
    ```bash
      $ docker run --name homecloud-mysql -e MYSQL_ROOT_PASSWORD=<my-secret-pw> -d mysql
      ```
    - Create a database for HomeCloud:
    ```bash
      $ docker exec -it homecloud-mysql mysql -uroot -p
      ```
    ```sql
      CREATE DATABASE homecloud;
    ```

4. Set up environment variables for the database:
    - Create a .env file in the root directory of your project.
    - Add the necessary environment variables as described in the Environment Variables section.
    - If you don't want to write sensitive information like passwords in the .env file, you can pass them as command line arguments to the docker run command.

5. Run the Docker container:
```bash
    $ docker run --env-file ./.env -d -p 80:5000 --name homecloud-server homecloud
```
This exposes the server on port 80 of your machine. You can change the port number to whatever you want. By default, the server runs on port 5000.

## Environment Variables

Environment variables are required to run the server:

```bash
SERVER_BASE_URL=http://<public-domain-or-ip>/
DB_URL=mysql://root:<password>@localhost:3306/homecloud
SECRET_KEY=<random-string>
# Required if you want to use online services like Google Drive, Dropbox
ONEAUTH_SERVER_URL=https://oneauth.asrient.me
ONEAUTH_APP_ID=<your-oneauth-app-id>
```

Optional environment variables:

```bash
# If you are serving static files from a different domain
CLIENT_BASE_URL=http://<domain-or-ip>/
# If you want to use SSL
SSL=false
SSL_KEY_PATH=/path/to/privkey.pem
SSL_CERT_PATH=/path/to/fullchain.pem
# optional configurations
LIST_PROFILES=false
# username is always required if LIST_PROFILES is false.
REQUIRE_USERNAME=false
# if you want to disable new account signups
ALLOW_SIGNUPS=true
# Available options: required, optional, disabled
PASSWORD_POLICY=optional
# if you want to allow access to private ips and domains for services like WebDav
ALLOW_PRIVATE_URLS=true
# Make every new user an admin
ADMIN_IS_DEFAULT=false
# if you want to disable certain storage services, comma separated list
# Available options: webdav, google, dropbox, local
DISABLED_STORAGE_TYPES=google,local
```

## OneAuth Account

OneAuth is a service that is used by HomeCloud to manage OAuth logins like Google Drive, Dropbox, etc. You can either use the public OneAuth server or host your own instance if you want to.

To use the public OneAuth server, you need to create an app on OneAuth. Follow the steps below to create an app:

1. Go to [OneAuth](https://oneauth.asrient.me) and click on "Login" under Manage your account.
2. Login with either one of the options.
3. Click on "Create" under the "My apps" section.
4. Fill in the details and click on "Create".
    - Provide a name for your app.
    - Set the redirect URL to your server base url. This should be the same as the `SERVER_BASE_URL` environment variable.
5. Copy the app id and paste it in the `ONEAUTH_APP_ID` environment variable.

If you want to self-host your own OneAuth server, you can use the docker image available at [Docker Hub](https://hub.docker.com/r/asrient/oneauth).
