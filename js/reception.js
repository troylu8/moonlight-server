const express = require('express');
const bcrypt = require('bcrypt');
const db = require('better-sqlite3')(__dirname + "/../users.db");


const router = express.Router();

db.pragma('journal_mode = WAL'); 
db.prepare("CREATE TABLE IF NOT EXISTS users (uid TEXT, username TEXT, hash2 TEXT, userdata TEXT)").run();

function exists(searchColumn, value) {
    const query = `SELECT uid FROM users WHERE ${searchColumn}=?`;
    return db.prepare(query).get(value) != undefined;
}

router.post("/create-account-dir/:uid", express.json(), async (req, res) => {
    if (exists("username", req.body.username)) return res.status(409).end("username taken");

    db.prepare("INSERT INTO users VALUES ( ?,?,?,? )").run(
        req.params["uid"],
        req.body.username,
        await bcrypt.hash(req.body.hash1, 11),
        null,
    );
    res.status(200).end();
});

router.post("/sign-in", express.json(), async (req, res) => {
    const row = db.prepare("SELECT uid, hash2 FROM users WHERE username=?").get(req.body.username);
    if (!row) return res.status(404).end();

    if (await bcrypt.compare(req.body.hash1, row.hash2))   
        res.status(200).end(row.uid);
    else 
        res.status(401).end();
});

router.put("/change-username/:uid", express.json(), async (req, res) => {
    const row = db.prepare("SELECT hash2 FROM users WHERE uid=?").get(req.params["uid"]);
    if (!row) return res.status(404).end();

    if (await bcrypt.compare(req.body.hash1, row.hash2)) {
        if (exists("username", req.body.username)) return res.status(409).end();

        db.prepare("UPDATE users SET username=? WHERE uid=?").run(req.body.username, req.params["uid"]);
        
        res.status(200).end();
    }
    else res.status(401).end();
});

router.put("/change-password/:uid", express.json(), async (req, res) => {
    const row = db.prepare("SELECT hash2 FROM users WHERE uid=?").get(req.params["uid"]);
    if (!row) return res.status(404).end();

    if (await bcrypt.compare(req.body.oldHash1, row.hash2)) {

        db.prepare("UPDATE users SET hash2=? WHERE uid=?").run(
            await bcrypt.hash(req.body.newHash1, 11),
            req.params["uid"]
        );
        res.status(200).end();
    }
    else res.status(401).end();
});

router.get("/get-data/:uid/:hash1", express.text(), async (req, res) => {

    const row = db.prepare("SELECT hash2,userdata FROM users WHERE uid=?").get(req.params["uid"]);
    if (!row) return res.status(404).end();
    if (! (await bcrypt.compare(req.params["hash1"], row.hash2)) ) return res.status(401).end();

    res.status(200).end(row.userdata);
});


module.exports = { router, db };