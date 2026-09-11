const crypto = require("crypto");
const fs = require("fs");

const randomString = crypto.randomBytes(8).toString("hex");
const filePath = "/shared-data/log.txt";

const writeLog = () => {
    const timestamp = new Date().toISOString();
    const line = `${timestamp} ${randomString}\n`;

    fs.appendFileSync(filePath, line);
};

writeLog();

setInterval(writeLog, 5000);
