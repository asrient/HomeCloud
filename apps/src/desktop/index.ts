import App from './shell/app';
import MessageHandlers from './shell/messageHandlers';

const homecloudApp = new App();
const messageHandlers = new MessageHandlers(homecloudApp);
messageHandlers.attach();
