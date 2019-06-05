var automerge_network = require("./test_networks/automerge_network.js")
var sync9_network = require("./test_networks/sync9_network.js")
var random = require("./local_modules/random.js")
const { PerformanceObserver, performance } = require('perf_hooks');

function write_dialogue(d) {
    var last_seed = d.seed
    function rand() {
        random.seed('' + last_seed)
        return last_seed = Math.random()
    }
    function Z(n) {
        return Array(n).fill(0) // array of zeroes of length N
    }
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    var clients = Z(d.C).map(() => "CL_"+random.guid())
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
        var total_edits = 0
        var client_num = 0
        var edit_counter = 0
        var next_client = 0
        d.period = 1/d.EPS
        while (total_edits < d.L) {
            client_num = (client_num+1) % d.C
            var c = clients[client_num] // The UID of the acting client
            var line = { client : c }
            edit_counter = (edit_counter + 1) % d.period
            if (edit_counter < 1) {
                // next_client makes an edit
                var ce = clients[next_client]
                var eline = { client: ce }
                eline.action = 'edit'
                var del_length = Math.floor(d.m + (2*rand() - 1) * d.v)
                var start = rand()
                
                var ins_length = Math.floor(d.m + (2*rand() - 1) * d.v)
                var ins = ""
                if (ins_length > 0)
                    ins = Z(ins_length).map(() => alphabet[Math.floor(rand()*alphabet.length)]).join('')
                eline.details = {start: start, len: del_length, ins: ins}
                total_edits++
                next_client = (next_client + 1) % d.C
                
                yield eline
            }
            if (client_num == 0)
                yield {action: "tick"}
            // Network checkin
            line.action = 'net'
            line.details = {}
            yield line
            
        }
        // We've finished the dialogue, let's fullsync and then finish
        console.log("Fullsyncing")
        yield full_sync
        return
        
    }
    return {client_ids: clients, w: writer(), d: d}
    
}

exports.run_test = (params) => {
    var runtimes = {}
    const obs = new PerformanceObserver((items) => {
        var x = items.getEntries()[0]
        runtimes[x.name] = x.duration
        performance.clearMarks();
    });
    obs.observe({ entryTypes: ['measure'] })
    
    /*var dialogue = write_dialogue(params)
    performance.mark("AM_S")
    automerge_network.run_trial(dialogue)
    performance.mark("AM_E")
    performance.measure("Automerge", "AM_S", "AM_E")*/
    
    var dialogue = write_dialogue(params)
    performance.mark("S9_S")
    sync9_network.run_trial(dialogue)
    performance.mark("S9_E")
    performance.measure(`Sync9 (${params.tag})`, "S9_S", "S9_E")
    obs.disconnect()
    
    console.error(runtimes)
    return {
        statusCode: 200,
        body: JSON.stringify(runtimes)
    }
    
}

var d = {"seed": "newseed",
 "N" : 200,
 "m" : 20,
 "v" : 10,
 "L" : 3000,
 "EPS" : 0.45,
 "LS" : 10,
 "C": 20,
 "prune": true,
 "prune_freq": 10,
 "tag": ""
}
if (d.prune) {
    if (d.prune_freq == 1)
        d.tag = "full prune"
    else
        d.tag += `prune 1/${d.prune_freq}`
    
} else {
    d.tag = "no prune"
}

exports.run_test(d)


