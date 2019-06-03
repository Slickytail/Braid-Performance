var automerge_network = require("./test_networks/automerge_network.js")
var sync9_network = require("./test_networks/sync9_network.js")
var random = require("./local_modules/random.js")

function write_dialogue(seed, d) {
    var last_seed = d.seed
    function rand() {
        random.seed('' + last_seed)
        return last_seed = Math.random()
    }
    function Z(n) {
        return Array(n).fill(0) // array of zeroes of length N
    }
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    var clients = Z(d.C).map(() => random.guid())
    function* writer() {
        var starttext = Z(d.N).map(() => alphabet[Math.floor(rand()*alphabet.length)]).join('')
        const full_sync = {
            client: 'all',
            action: 'sync',
            details: {}
        }
        yield {
            client: 'server', // Server doesn't have a UID
            action: 'start',
            details: { text: starttext }
        }
        yield full_sync
        
        var t = 0
        var i = 0
        while (t < d.L) {
            i = (i+1) % d.C
            var c = clients[i] // The UID of the acting client
            var line = { client : c }
            if (rand() < d.EPS) {
                // This is an edit line
                line.action = 'edit'
                var del_length = Math.floor(d.m + (2*rand() - 1) * d.v)
                var start = rand()
                
                var ins_length = Math.floor(d.m + (2*rand() - 1) * d.v)
                var ins = ""
                if (ins_length > 0)
                    ins = Z(ins_length).map(() => alphabet[Math.floor(rand()*alphabet.length)]).join('')
                line.details = {start: start, len: del_length, ins: ins}
                t++
                yield line
            }
            // Network checkin
            line.action = 'net'
            line.details = {}
            yield line
            
        }
        // We've finished the dialogue, let's fullsync and then finish
        yield full_sync
        return
        
    }
    return {client_ids: clients, w: writer(), d: d}
    
}

function run_test(params) {
    /*
    var d = {seed: "iteration",
             N : 200,     // Number of characters initially in document
             m : 20,      // Average number of characters changed per edit
             v : 5,       // Edit Window/2, ie edit size is uniformly distributed on the interval [m-v, m+v]
             L : 100,     // Total number of edit lines in dialogue
             EPS : 0.2,   // Probability of a client making an edit per-pass
             LS : 2,      // Latency
             prune: true, //
             C: 10        // Number of clients
            }
    */
    
    var dialogue = write_dialogue(params)
    var s_am = performance.now()
    automerge_network.run_trial(dialogue)
    var e_am = performance.now()
    console.log(`${d.N},${d.m},${d.L},${d.EPS},${d.LS},${d.C},"Automerge",${(e_am-s_am)/1000}`)
    
    var dialogue = write_dialogue(params)
    var s_s9 = performance.now()
    sync9_network.run_trial(dialogue)
    var e_s9 = performance.now()
    console.log(`${d.N},${d.m},${d.L},${d.EPS},${d.LS},${d.C},"Sync9",${(e_s9-s_s9)/1000}`)
    
}