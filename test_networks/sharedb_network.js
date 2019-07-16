module.exports = {run_trial: run_trial};
const ShareDB = require('sharedb');
const ShareDBClient = require('sharedb/lib/client');
const ShareDBTypes = require("sharedb/lib/types");
const WebSocket = require('ws');
const WebSocketJSONStream = require('@teamwork/websocket-json-stream');
const ottext = require('ot-text');
const tests = require("../local_modules/tests");
const fs = require('fs');
const sizeof = require('../local_modules/better_sizeof');
const port = 1200;

function run_trial(dl, finished) {
    ShareDBTypes.register(ottext.type)
    var config = {LS: dl.d.LS};
    var clients = {};
    var server = create_server(config, dl.w.next().value.details.text); // Create the server and seed it with the initial text
    for (var cid of dl.client_ids) { // Create clients
        ;(() => {
            var c = create_client(config, cid);
            clients[cid] = c;
        })();
    }
    function ready() {
        clients["server"] = server; // The server needs to get network updates
        tests.read(dl.w, clients, tick, () => {
            tests.good_check(clients, () => { // Make sure the clients are all in sync at the end
                server.doc.whenNothingPending(() => {
                    tick(dl.d.L+1);
                    server.share.close(finished); // Close the server's ShareDB, and then call finished()
                    server.wss.close(); // Close the server's websocket
                    outfile.end();
                })
            })
        })
    }
    outfile = fs.createWriteStream("./Visualization/sharedb_memory.csv");
    outfile.write("eps,ls,c,i,e,server_size,client_size\n");
    var i = 0;
    function tick(e) {
        i++;
        var server_size = sizeof(server);
        var client_size = sizeof(Object.keys(clients).filter(x => x != "server").map(x => clients[x]))
        outfile.write(`${dl.d.EPS},${dl.d.LS},${dl.d.C},${i},${e},${server_size},${client_size}\n`)
    }
    setTimeout(ready, 50); // Give the clients time to get ready I guess
}

function create_client(config, uid) {
    var c = {};
    
    c.ready = false;
    c.messages = [];
    c.has_messages = () => c.messages.length || !c.ready || c.doc.hasPending();
    c.buffers = ["messages"];
    c.connected = false;
    c.uid = uid;
    
    function connect() {
        var wsc = new WebSocket(`ws://localhost:${port}`);
        
        wsc._emit = wsc.emit; // Store the old emit function
        wsc.emit = function(...args) {
            /* When we get a new message on the socket, we want to store it for some number of iterations.
            When the client recieves a "network update" from the dialogue, we can read any new messages that have been waiting sufficiently long.
            This simulates having a fixed amount of latency.
            */
            // Create a function that when called will emit the original message
            var onprocess = () => {
                this._emit(...args);
            };
            // Set the time this function has to wait
            onprocess.time = config.LS;
            c.messages.push(onprocess); // Add it to the messages queue
        }
        var connection = new ShareDBClient.Connection(wsc)
        
        c.doc = connection.get('network', 'edit')
        c.doc.subscribe(() => c.ready = true);

    }
    c.read = () => {
        if (c.doc.data) return c.doc.data;
        return ""
    }
    c.change_frac = (start, ins) => {
        var start_index = Math.floor(start * c.read().length)
        c.doc.submitOp([start_index, {d: ins.length}, ins])
    }
    connect()
    return c
}

function create_server(config, s_text) {
    
    var s = {};
    s.messages = [];
    s.has_messages = () => s.messages.length || s.doc.hasPending();;
    s.buffers = ["messages"];
    
    s.share = new ShareDB({
        disableDocAction: true,
        disableSpaceDelimitedActions: true});
    
    init_doc(start_server);
    
    function init_doc(callback) {
        var connection = s.share.connect();
        s.doc = connection.get('network', 'edit');
        s.doc.subscribe((err) => {
            if (err) throw err;
            if (s.doc.type === null) {
                s.doc.create(s_text, 'text', start_server);
                
                return;
            }
            start_server();
        })
        
    }
    function start_server(err) {
        if (err)
            throw err;
        s.wss = new WebSocket.Server({port: port}); // Recieves join messages
        
        s.wss.on('connection', ws => {
            
            ws._emit = ws.emit
            ws.emit = function(...args) {
                var onprocess = () => {
                    this._emit(...args);
                }
                onprocess.time = config.LS
                s.messages.push(onprocess)
            }
            var stream = new WebSocketJSONStream(ws);
            s.share.listen(stream);
        })
    }
    
    s.read = () => {
        return s.doc.data;
    }
    
    return s
}