const express = require('express');
const fs = require('fs');
const Zip = require("adm-zip");
const { join } = require("path");
const { promisify } = require('util');
const { db } = require("./reception.js");
const bcrypt = require('bcrypt');
const { Writable, Duplex, Readable } = require('stream');


fs.mkdir(__dirname + "/../userfiles", {recursive: true}, () => {});

const router = express.Router();

/** @returns {Promise<boolean>} returns `true` if file was created */
async function createFile(path) {
    try {
        await fs.promises.writeFile(path, "", {flag: "ax"});
        return true;
    } catch (err) {
        if (err.code === "EEXIST") return false;
        throw err;
    }
}
async function fileExists(path) {
    try {
        await fs.promises.stat(path);
        return true;
    } catch (err) {
        if (err.code === "ENOENT") return false;
        throw err;
    }
}

/**
 * `entry.getDataAsync` but with `err` first in the callback, so it's promisify-able
 * @param {import('adm-zip').IZipEntry} entry 
 * @param {function(err, data)} cb 
 */
function getDataReversed(entry, cb) {
    entry.getDataAsync((data, err) => cb(err, data));
}
const getDataPromise = promisify(getDataReversed);

class BufferList {
    arr = [];
    add(chunk) { this.arr.push(chunk); }
    concat() { return Buffer.concat(this.arr); }
}

router.put("/userdata/:uid/:username/:hash1", express.text(), async (req, res) => {
    const row = db.prepare("SELECT hash2,username FROM users WHERE uid=? ").get(req.params["uid"]);
    if (!row) return res.status(404).end()
    if ( !(await bcrypt.compare(req.params["hash1"], row.hash2)) ) return res.status(401).end();

    db.prepare("UPDATE users SET userdata=? WHERE uid=?").run(req.body, req.params["uid"]);

    // if username was changed, return it
    res.end((req.params["username"] !== row.username)? row.username : null);
});

/** new files in req.body, files to be deleted in header separated by "-" */
router.put("/edit/:uid/:hash1/:deleteMe", async (req, res) => {
    const start = Date.now();
    console.log("receieved edit req at ", start);

    const row = db.prepare("SELECT hash2 FROM users WHERE uid=? ").get(req.params["uid"]);
    if (!row) return res.status(404).end()
    if ( !(await bcrypt.compare(req.params["hash1"], row.hash2)) ) return res.status(401).end();

    const zipPath = join(__dirname, "../userfiles", req.params["uid"] + ".zip");
    
    const createdNew = await createFile(zipPath);
    const userZip = new Zip(createdNew? null : zipPath);

    //delete
    if (req.params["deleteMe"] === "all") {
        await fs.promises.rm(zipPath);
        return res.end();
    }
    if (req.params["deleteMe"] !== "none") {
        for (const filename of req.params["deleteMe"].split("-")) {
            userZip.deleteFile(filename);
        }
    }

    const bufList = new BufferList();
    req.on("data", (chunk) => {
        bufList.add(chunk);
    });
    req.on("end", async () => {
        console.log("concating received data");
        const receievedZip = new Zip(bufList.concat());

        for (const entry of receievedZip.getEntries()) {
            userZip.addFile(entry.entryName, await getDataPromise(entry));
            console.log("added ", entry.entryName);
        }

        await userZip.writeZipPromise(zipPath);

        const end = Date.now();
        console.log("done editing at", end);
        console.log("total editing time", end - start);
        res.end();
    });

});

router.put('/order/:uid/:hash1', express.json(), async (req, res) => {

    console.log("received order request at ", Date.now());
    console.log("req.body is ", req.body);

    const row = db.prepare("SELECT hash2 FROM users WHERE uid=? ").get(req.params["uid"]);
    if (!row) return res.status(404).end()
    if ( !(await bcrypt.compare(req.params["hash1"], row.hash2)) ) return res.status(401).end();
    
    const zipPath = join(__dirname, "../userfiles", req.params["uid"] + ".zip");
    if (!(await fileExists(zipPath)))  {
        console.log("doesnt exist");
        return res.status(404).end();
    }
    const userZip = new Zip(zipPath);
    
    // send back requested files
    const toClient = new Zip();
    try {
        for (const path of req.body.sendToClient) {
            const entry = userZip.getEntry(path);
            toClient.addFile(entry.entryName, await getDataPromise(entry));
            console.log("preparing to send", entry.entryName);
        }
    } catch (err) {throw err;}

    console.log("beginning return at ", Date.now());
    res.end(await toClient.toBufferPromise());
});

module.exports = router;