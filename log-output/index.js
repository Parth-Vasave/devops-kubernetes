const fs = require("fs");
const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;
const filePath = "/shared-data/log.txt";

app.get("/", (req, res) => {
    try {
        const content = fs.readFileSync(filePath, "utf8");
        res.send(content);
    } catch (error) {
        res.status(500).send("Log file not available yet");
    }
});

app.listen(PORT, () => {
    console.log(`Server started in port ${PORT}`);
});
