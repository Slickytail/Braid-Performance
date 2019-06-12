module.exports = {run_trial: run_trial}
var clone = require('clone')
var sizeof = require('object-sizeof')
var sync9 = require("../local_modules/sync9")
var tests = require("../local_modules/tests")
var random = require("../local_modules/random")
const { PerformanceObserver, performance } = require('perf_hooks');
var debug_data = {
    total_prunes: 0,
    initial_prunes: 0,
    good_prunes: 0,
    nodes_pruned: 0
}

function run_trial(dl, finished) {
    var n_clients = dl.d.C
    var clients = {}
    var w = dl.w
    
    var server = create_server(
        {
            add_version: (uid, vid, parents, changes) => {
                clients[uid].add_incoming(() => {
                    clients[uid].add_version(vid, parents, changes)
                }, dl.d.LS)
            },
            ack: (uid, vid) => {
                clients[uid].add_incoming(() => {
                    clients[uid].ack(vid)
                }, dl.d.LS)
            }
        },
        w.next().value.details.text,
        {
            prune: dl.d.prune,
            prune_freq: dl.d.prune_freq
        }
    )
    
    for (var cid of dl.client_ids) {
        ;(() => {
            var c = create_client({
                join : (uid, leaves) => {
                    c.add_outgoing(() => {
                        server.join(uid, leaves)
                    }, dl.d.LS)
                },
                add_version : (uid, vid, parents, changes) => {
                    if (c.state == 'connected') {
                        c.add_outgoing(() => {
                            server.add_version(uid, vid, parents, changes)
                        }, dl.d.LS)
                    }
                },
                ack : (uid, vid) => {
                    if (c.state == 'connected') {
                        c.add_outgoing(() => {
                            server.ack(uid, vid)
                        }, dl.d.LS)
                    }
                }
            }, cid)
            clients[c.uid] = c
            
        })()
    }
    Object.values(clients).forEach(c => {
        c.state = 'connected'
        c.join()
    })
    var l = 0;
    var debug_frames = []
    var tick = (state) => {
        if (!dl.d.debug) return
        
        server_size = tests.format_byte(sizeof(server))
        unacked_size = tests.format_byte(sizeof(server.peers))
        dag_size = tests.format_byte(sizeof(server.s9))
        prune_info_size = tests.format_byte(sizeof(server.prune_info))
        console.error(`[Sync9 (${dl.d.tag}, ${state})] t=${l}: ` +
                    `Server: ${server_size} (${dag_size} S9, ${prune_info_size} Hist, ${unacked_size} Delete)`)
        var frame = {}
        frame.server_s9 = server.s9
        frame.client_s9s = Object.values(clients).map(c => c.s9)
        frame.tag = state
        debug_frames.push(clone(frame))
        
    }
    
    tests.read(w, clients, tick, () => {
        server.local_add_version('Vf0', clone(server.s9.leaves), [])
        server.local_add_version('Vf1', clone(server.s9.leaves), [])
        tests.fullsync(clients, tick)
        server._force_prune()
        tests.fullsync(clients, tick)
        Object.values(clients).forEach(c => c.prune())
        
        tests.good_check([server].concat(Object.values(clients)))
        console.error(debug_data)
        
        tick("Finished")
        if (dl.d.debug)
            console.log(`var debug_frames = ${JSON.stringify(debug_frames)};`);
        
        if (finished)
            finished()
    })
    
}

function create_client(s_funcs, uid) {
    var c = {}
    
    function init() {
        c.s9 = sync9.create()
        
        sync9.add_version(c.s9, 'v1', {root: true}, [' = ""'])
        sync9.prune(c.s9, (a, b) => true, (a, b) => true)
        delete c.s9.T.v1
        c.s9.leaves = {root: true}
    }
    init()
    
    c.uid = uid
    c.server_leaves = {root: true}
    c.state = 'disconnected'
    c.incoming = []
    c.outgoing = []
    c.unacked = []
    c.delete_us = {}
    c.got_first_version = false
    
    c.join = () => {
        s_funcs.join(c.uid, c.server_leaves)
        c.unacked.forEach(x => s_funcs.add_version(c.uid, x.vid, x.parents, x.changes))
    }
    c.add_incoming = (f, l) => {
        f.time = l
        c.incoming.push(f)
    }
    c.add_outgoing = (f, l) => {
        f.time = l
        c.outgoing.push(f)
    }
    c.has_messages = () => c.incoming.length || c.outgoing.length
    c.buffers = ["incoming", "outgoing"]
    
    c.prune = () => {
        if (Object.keys(c.delete_us).length > 0) {
            var deleted = sync9.prune(c.s9, (a, b) => c.delete_us[b], (a, b) => c.delete_us[a])
            if (!Object.keys(c.delete_us).every(x => deleted[x])) throw 'wtf?'
            if (!Object.keys(deleted).every(x => c.delete_us[x])) throw 'wtf?'
            c.delete_us = {}
        }
        
    }
    c.add_version = (vid, parents, changes) => {
        c.prune()
        
        Object.keys(parents).forEach(p => {
            delete c.server_leaves[p]
        })
        c.server_leaves[vid] = true
        
        if (c.s9.T[vid]) {
            var v = c.unacked.shift()
            if (v.vid != vid) throw 'how?'
            return
        }
        
        if (!c.got_first_version) {
            c.got_first_version = true
            var save = sync9.read(c.s9)
            init()
            sync9.add_version(c.s9, vid, parents, changes)
            c.local_add_version(['[0:0]=' + JSON.stringify(save)])
        } else {
            sync9.add_version(c.s9, vid, parents, changes)
        }
        s_funcs.ack(c.uid, vid)
    }
    
    c.ack = (vid) => {
        s_funcs.ack(c.uid, vid)
        if (!c.s9.T[vid]) return
        
        c.delete_us[vid] = true
        
        if (c.server_leaves[vid]) {
            var ancs = sync9.get_ancestors(c.s9, c.server_leaves)
            Object.keys(c.delete_us).forEach(x => {
                delete ancs[x]
            })
            var not_leaves = {}
            Object.keys(ancs).forEach(x => {
                Object.assign(not_leaves, c.s9.T[x])
            })
            c.server_leaves = {}
            Object.keys(ancs).forEach(x => {
                if (!not_leaves[x])
                    c.server_leaves[x] = true
            })
        }
        
        c.unacked = c.unacked.filter(x => x.vid != vid)
    }
    
    c.local_add_version = (changes) => {
        var x = {
            vid : random.guid(),
            parents : clone(c.s9.leaves),
            changes : changes
        }
        sync9.add_version(c.s9, x.vid, x.parents, x.changes)
        if (c.got_first_version) {
            c.unacked.push(x)
            s_funcs.add_version(c.uid, x.vid, x.parents, x.changes)
        }
        return x
    }
    c.read = () => sync9.read(c.s9)
    c.change_frac = (start, len, ins) => {
        var s = Math.floor(c.read().length * start)
        var changes = [`[${s}:${s + len}] = ` + JSON.stringify(ins)]
        c.local_add_version(changes)
        
    }
    return c
}

function create_server(c_funcs, s_text, config) {
    var s = {}
    
    s.s9 = sync9.create()
    sync9.add_version(s.s9, 'v1', {root : true}, [` = "${s_text}"`])

    s.peers = {}
    s.prune_info = {
        root: {sent: {}, acked: {}},
        v1: {sent: {}, acked: {}}
    }
    s.config = config
    s.p_counter = 0
    s._force_prune = prune
    
    function prune() {
        if (!s.config.prune) return
        debug_data.total_prunes++
        var q = (a, b) => (a != 'root') && !s.s9.leaves[b] && Object.keys(s.prune_info[a].sent).every(x => s.prune_info[b].acked[x])
        
        var s_clone = clone(s.s9)
        var deleted = sync9.prune2(s_clone, q, q)
        
        if (Object.keys(deleted).length == 0)
            return
        debug_data.initial_prunes++
        
        while (Object.keys(deleted).length > 0) {
            var s_clone = clone(s.s9)
            var deleted2 = sync9.prune2(s_clone, (a, b) => q(a, b) && deleted[b], (a, b) => q(a, b) && deleted[a])
            
            if (Object.keys(deleted).some(x => !deleted2[x])) {
                deleted = deleted2
            } else {
                break
            }
        }
        if (Object.keys(deleted).length == 0)
            return

        var backup_parents = {}
        Object.keys(deleted).forEach(x => backup_parents[x] = s.s9.T[x])
        
        var deleted2 = sync9.prune2(s.s9, (a, b) => q(a, b) && deleted[b], (a, b) => q(a, b) && deleted[a])
        
        if (Object.keys(deleted).some(x => !deleted2[x]) || Object.keys(deleted2).some(x => !deleted[x])) {
            throw 'wtf?'
        }
        
        debug_data.good_prunes++
        debug_data.nodes_pruned += Object.keys(deleted).length
        Object.keys(deleted).forEach(deleted => {
            Object.entries(s.peers).forEach(x => {
                if (s.prune_info[deleted].sent[x[0]]) {
                    s.peers[x[0]].unacked_prunes[deleted] = backup_parents[deleted]
                }
                if (x[1].online) {
                    c_funcs.ack(x[0], deleted)
                }
            })
            
            delete s.prune_info[deleted]
        })
    }
    s.join = (uid, leaves) => {
        var p = s.peers[uid]
        if (!p) s.peers[uid] = p = {unacked_prunes: {}}
        p.online = true
        
        Object.keys(p.unacked_prunes).forEach(x => c_funcs.ack(uid, x))
        
        var ancs = {}
        function mark_ancs(key) {
            if (!ancs[key]) {
                ancs[key] = true
                Object.keys(s.s9.T[key] || p.unacked_prunes[key]).forEach(k => mark_ancs(k))
            }
        }
        Object.keys(leaves).forEach(k => mark_ancs(k))
        
        sync9.extract_versions(s.s9, x => ancs[x], x => true).forEach(x => {
            c_funcs.add_version(uid, x.vid, x.parents, x.changes)
            if (s.config.prune) s.prune_info[x.vid].sent[uid] = true
        })
    }
    s.local_add_version = (vid, parents, changes) => {
        if (s.s9.T[vid]) return
        if (s.config.prune) s.prune_info[vid] = {sent: {}, acked: {}}
        sync9.add_version(s.s9, vid, parents, changes)
        Object.entries(s.peers).forEach(x => {
            if (x[1].online) {
                c_funcs.add_version(x[0], vid, parents, changes)
                if (s.config.prune) s.prune_info[vid].sent[x[0]] = true
            }
        })
        
    }
    s.add_version = (uid, vid, parents, changes) => {
        if (s.s9.T[vid]) return
        
        var p = s.peers[uid]
        
        if (s.config.prune) s.prune_info[vid] = {sent: {}, acked: {[uid]: true}}
        
        Object.keys(parents).forEach(x => {
            if (p.unacked_prunes[x]) {
                throw "Parent was deleted but client hadn't acknowledged that delete yet"
                delete parents[x]
                function helper(x) {
                    Object.keys(p.unacked_prunes[x]).forEach(x => {
                        if (p.unacked_prunes[x]) helper(x)
                        else parents[x] = true
                    })
                }
                helper(x)
            }
        })
         
        sync9.add_version(s.s9, vid, clone(parents), changes)
        Object.entries(s.peers).forEach(x => {
            if (x[1].online) {
                c_funcs.add_version(x[0], vid, clone(parents), changes)
                if (s.config.prune) s.prune_info[vid].sent[x[0]] = true
            }
        })
        
        if (s.config.prune) {
            var ancs = sync9.get_ancestors(s.s9, parents)
            Object.keys(ancs).forEach(x => {
                var pi = s.prune_info[x]
                if (pi) pi.acked[uid] = true
            })
        }
    }
    
    s.ack = (uid, vid) => {
        if (!s.config.prune) return
        var p = s.peers[uid]
        if (p.unacked_prunes[vid]) {
            delete p.unacked_prunes[vid]
            return
        }
        s.prune_info[vid].acked[uid] = true
        if (Object.keys(s.prune_info[vid].sent).every(x => s.prune_info[vid].acked[x])) {
            // We've met the prune conditions
            s.p_counter = (s.p_counter + 1) % s.config.prune_freq
            // But we still have to prune only every $prune_freq$ iterations
            if (s.p_counter == 0)
                prune()
        }
        
    }
    
    s.leave = (uid) => {
        var p = s.peers[uid]
        if (p) p.online = false
    }
    s.read = () => sync9.read(s.s9)
    
    return s
}
