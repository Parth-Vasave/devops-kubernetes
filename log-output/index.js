const crypto = require("crypto");
const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

const randomString = crypto.randomBytes(8).toString("hex");

setInterval(() => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} ${randomString}`);
}, 5000);

app.get("/", (req, res) => {
    const timestamp = new Date().toISOString();
    res.send(`${timestamp} ${randomString}`);
});

app.listen(PORT, () => {
    console.log(`Server started in port ${PORT}`);
});
