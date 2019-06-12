module.exports = {run_trial: run_trial}
const ShareDB = require('sharedb')
const ShareDBClient = require('sharedb/lib/client')
const WebSocket = require('ws')
const WebSocketJSONStream = require('@teamwork/websocket-json-stream')
const Connection = require('sharedb/lib/client/connection')
const sizeof = require('object-sizeof')
const tests = require("../local_modules/tests")
const port = 1200

function run_trial(dl, finished) {

    var config = {LS: dl.d.LS}
    var clients = {}
    var server = create_server(config, dl.w.next().value.details.text)
    for (var cid of dl.client_ids) {
        ;(() => {
            var c = create_client(config, cid)
            clients[cid] = c
        })()
    }
    function ready() {
        tests.read(dl.w, clients, null, () => {
            tests.good_check([server].concat(Object.values(clients)), () => {
                server.wss.close()
                server.share.close(finished)
            })
        })

    }
    setTimeout(ready, 10)
}

function create_client(config, uid) {
    var c = {}
    
    c.ready = false
    c.messages = []
    c.has_messages = () => (c.messages.length > 0 || !c.ready)
    c.buffers = ["messages"]
    c.connected = false
    c.uid = uid
    function connect() {
        var wsc = new WebSocket(`ws://localhost:${port}`)
        
        wsc._emit = wsc.emit
        wsc.emit = function(...args) {
            var onprocess = () => {this._emit(...args);}
            onprocess.time = config.LS
            onprocess.type = args[0]
            c.messages.push(onprocess)
        }
        var connection = new ShareDBClient.Connection(wsc)
        
        c.doc = connection.get('network', 'edit')
        c.doc.subscribe(() => {c.ready = true})
    }
    c.read = () => {
        if (c.doc.data) return c.doc.data.text
        return ""
    }
    c.change_frac = (start, ins) => {
        var start_index = Math.floor(start * c.read().length)
        var delete_text = c.doc.data.text.substring(start_index, start_index + ins.length)
        c.doc.submitOp([{p: ['text', start_index], sd: delete_text},
                        {p: ['text', start_index], si: ins}]);
    }
    connect()
    return c
}

function create_server(config, s_text) {
    var s = {}
    s.messages = []
    s.has_messages = () => s.messages.length
    s.buffers = ["messages"]
    
    s.share = new ShareDB({
        disableDocAction: true,
        disableSpaceDelimitedActions: true})
    
    init_doc(start_server)
    
    function init_doc(callback) {
        var connection = s.share.connect();
        s.doc = connection.get('network', 'edit');
        s.doc.subscribe((err) => {
            if (err) throw err;
            if (s.doc.type === null) {
                s.doc.create({text: s_text}, start_server);
                return
            }
            start_server();
        })
    }
    function start_server() {
        s.wss = new WebSocket.Server({port: port}) // Recieves join messages
        s.wss.on('connection', ws => {
            /* var _emit = ws.emit
            ws.emit = function(...args) {
                var onprocess = () => {_emit(...args)}
                onprocess.time = config.LS
                s.messages.push(onprocess)
            } */
            var stream = new WebSocketJSONStream(ws);
            s.share.listen(stream);
        })
    }
    
    s.read = () => {
        return s.doc.data.text
    }
    
    return s
}
    