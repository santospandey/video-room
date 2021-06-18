const express = require("express");
const path = require("path");
const app = express();
const http = require('http').createServer(app);

app.use(express.static(path.join(__dirname, "../public")));

http.listen(3000, ()=> {
    console.log("listening on 3000");
});