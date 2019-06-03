module.exports = {run_trial: run_trial}
var Automerge = require("automerge")
var tests = require("../local_modules/tests")

function run_trial(dl) {

    var n_clients = dl.d.C
    var clients = {}
    var w = dl.w
    
    var server = create_server({
        add_version: (uid, changes) => {
            clients[uid].add_incoming(() => {
                clients[uid].add_version(changes)
            }, dl.d.LS)
        }
    }, w.next().value.details.text)
    
    for (var cid of dl.client_ids) {
        ;(() => {
            var c = create_client({
                join : (uid) => {
                    c.add_outgoing(() => {
                        server.join(uid)
                    }, dl.d.LS)
                },
                add_version : (uid, changes) => {
                    if (c.state == 'connected') {
                        c.add_outgoing(() => {
                            server.add_version(uid, changes)
                        }, dl.d.LS)
                    }
                }
            }, cid)
            clients[c.uid] = c
            
            c.add_version(server.init_changes)
            
        })()
    }
    Object.values(clients).forEach(c => {
        c.state = 'connected'
        c.join()
    })
        
    tests.read(w, clients)
    
    tests.good_check([server].concat(Object.values(clients)))
    
}

function create_client(s_funcs, uid) {
    var c = {}
    c.uid = uid
    c.state = 'disconnected'
    c.incoming = []
    c.outgoing = []
    
    
    c.join = () => {
        s_funcs.join(c.uid)
    }
    c.add_incoming = (f, l) => {
        f.time = l
        c.incoming.push(f)
    }
    c.add_outgoing = (f, l) => {
        f.time = l
        c.outgoing.push(f)
    }
    
    c.a = Automerge.init(c.uid)
    c.add_version = (changes) => {
        c.a = Automerge.applyChanges(c.a, changes)
    }
    
    c.local_add_version = (changes) => {
        // c.a = Automerge.applyChanges(c.a, changes)
        s_funcs.add_version(c.uid, changes)
    }
    
    c.read = () => c.a.text.join('')
    c.change_frac = (start, len, ins) => {
        var oldDoc = c.a
        c.a = Automerge.change(c.a, doc => {
            l = doc.text.length
            start = Math.floor((l - (len % l) - 1) * start)
            for (var i = 0; i < len; i++) {
                
                doc.text.deleteAt(start)
            }
            if (ins) {
                doc.text.insertAt(start, ...ins)
            }
        })
        c.local_add_version(Automerge.getChanges(oldDoc, c.a))
    }
    
    
    return c
}

function create_server(c_funcs, s_text) {
    var s = {}
    
    var root = Automerge.init()
    s.a = Automerge.change(root, doc => {
        doc.text = new Automerge.Text()
        doc.text.insertAt(0, ...s_text)
    })
    s.init_changes = Automerge.getChanges(root, s.a)

    s.peers = {}
    
    s.join = (uid) => {
        var p = s.peers[uid]
        if (!p) s.peers[uid] = p = {}
        p.online = true
    }

    s.add_version = (uid, changes) => {
        s.a = Automerge.applyChanges(s.a, changes)
        Object.entries(s.peers).forEach(x => {
            if (x[0] != uid && x[1].online) {
                c_funcs.add_version(x[0], changes)
            }
        })
    }
    
    s.leave = (uid) => {
        var p = s.peers[uid]
        if (p) p.online = false
    }
    
    s.read = () => s.a.text.join('')
    
    return s
}
    