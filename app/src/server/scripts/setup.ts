import App from "../app";

const startText = `\n
*******************************************
   CAUTION:                              
   YOU ARE RUNNING THE SETUP SCRIPT      
*******************************************                                  
\n`;

const action = async () => {
    const app = await App.init();
    app.setupDevice();
};

console.log(startText);

// Take user confirmation before proceeding
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

readline.question('Do you want to proceed? (y/N) ', (answer: string) => {
    if (answer.toLowerCase() === 'y') {
        action();
    }
    else {
        console.log('Exiting...');
    }
    readline.close();
});
