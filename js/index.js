const fs = require('fs');
const express = require('express');
const https = require('https');
const cors = require("cors");
const { app, shell, Tray, Menu, MenuItem } = require('electron');
const { dirname } = require('path');

const server = express();
server.use(cors());

server.use("/", require("./reception.js").router);
server.use("/sync", require("./sync.js"));

https.createServer({
    key: fs.readFileSync( __dirname + "/../auth/server.key", "utf8"),
    cert: fs.readFileSync( __dirname + "/../auth/server.crt", "utf8"),
}, server)
    .listen(39999, () => //console.log("server listening.."));

app.whenReady().then(() => {
    const tray = new Tray(__dirname + "/../resources/moonlight.ico");
    const contextMenu = new Menu();
    
    contextMenu.append(new MenuItem({
        enabled: false,
        label: "port: 39999",
    }));
    contextMenu.append(new MenuItem({type: "separator"}));
    
    contextMenu.append(new MenuItem({
        click: () => shell.openPath(dirname(__dirname)),
        label: "open folder"
    }));
    contextMenu.append(new MenuItem({
        click: app.quit,
        label: "quit"
    }));
    
    tray.setToolTip("moonlight server");
    tray.setContextMenu(contextMenu);
}));