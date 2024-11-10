import App from "./app";

const startText = `\n
█░█ █▀█ █▀▄▀█ █▀▀ █▀▀ █░░ █▀█ █░█ █▀▄   █░█░█ █▀█ █▀█ █▄▀ █▀▀ █▀█
█▀█ █▄█ █░▀░█ ██▄ █▄▄ █▄▄ █▄█ █▄█ █▄▀   ▀▄▀▄▀ █▄█ █▀▄ █░█ ██▄ █▀▄
\n
🐱 Starting HomeCloud Worker Head...`;

(async () => {
    console.log(startText);
    const app = await App.init();
    app.startWorkerHead();
})();
