const fs = require("fs");
const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;
const logPath = "/shared-data/log.txt";
const pingPath = "/shared-data/pingpong.txt";

app.get("/", (req, res) => {
    try {
        const logContent = fs.readFileSync(logPath, "utf8");
        const lines = logContent.trim().split('\n');
        const lastLog = lines[lines.length - 1];
        
        const [timestamp, randomString] = lastLog.split(' ');
        const formattedLog = `${timestamp}: ${randomString}.`;
        
        let pings = 0;
        try {
            pings = fs.readFileSync(pingPath, "utf8").trim();
        } catch (error) {}
        
        res.send(`${formattedLog}\nPing / Pongs: ${pings}\n`);
    } catch (error) {
        res.status(500).send("Log file not available yet");
    }
});

app.listen(PORT, () => {
    console.log(`Server started in port ${PORT}`);
});
