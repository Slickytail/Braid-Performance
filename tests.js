function write_dialogue(seed, d) {
    var last_seed = seed
    function rand() {
        Math.randomSeed('' + last_seed)
        return last_seed = Math.random()
    }
    function Z(n) {
        return Array(n).fill(0) // array of zeroes of length N
    }
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    var clients = Z(d.C).map(() => sync9_guid())
    function* writer() {
        var starttext = Z(d.N).map(() => alphabet[Math.floor(rand()*alphabet.length)]).join('')
        const full_sync = {
            client: 'all',
            action: 'sync',
            details: {}
        }
        //console.log("Sending initial text to server")
        yield {
            client: 'server', // Server doesn't have a UID
            action: 'start',
            details: { text: starttext }
        }
        //console.log("Sending initial fullsync")
        yield full_sync
        
        //console.log("Sending dialogue body")
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
        //console.log("Sending final fullsync")
        // We've finished the dialogue, let's fullsync and then finish
        yield full_sync
        //console.log("End of dialogue")
        return
        
    }
    return {client_ids: clients, w: writer(), d: d}
    
}


function read_dialogue(writer, clients) {
    for (var line of writer) {
        if (line.action == 'sync') {
            var i = 0
            while (Object.values(clients).some(c => (c.incoming.length || c.outgoing.length))) {
                i++
                //console.log(`Sync #${i}---`)
                Object.values(clients).forEach(c => {
                    //console.log(`Client ${c.uid} has ${c.incoming.length} incoming and ${c.outgoing.length} outgoing`)
                    process_network(c)
                })
                
            }
            //console.log(`Fullsync took ${i} iterations`)
            continue
        }
        var c = clients[line.client]
        if (line.action == 'edit') {
            c.change_frac(line.details.start, line.details.len, line.details.ins)
        } else if (line.action == 'net') {
            process_network(c)
        }
    }
}

function process_network(c) {
    while (c.incoming.length > 0 && c.incoming[0].time == 0) {
        c.incoming.shift()()
    }
    c.incoming.forEach((f, i, a) => a[i].time--)
    while (c.outgoing.length > 0 && c.outgoing[0].time == 0) {
        c.outgoing.shift()()
    }
    c.outgoing.forEach((f, i, a) => a[i].time--)
    
}


function good_check(nodes) {
    var check_val = null
    var check_good = true
    nodes.forEach((x, i) => {
        var val = x.read()
        if (i == 0)
            check_val = val
        else if (val != check_val)
            check_good = false
    })
    
    if (!check_good) {
        nodes.forEach((x, i) => {
            console.log(x)
            var val = x.read()
            console.log(val)
        })
        console.log('CHECK GOOD: ' + check_good)
        throw 'stop'
    }
    console.log(nodes[0].read())
    
}


function main() {
    console.log("doclength,editsize,editnum,eps,latency,clients,algorithm,time")
    var i = 0
    var d = {N : 200,     // Number of characters initially in document
             m : 20,      // Average number of characters changed per edit
             v : 5,       // Edit Window/2, ie edit size is uniformly distributed on the interval [m-v, m+v]
             L : 100,     // Total number of edit lines in dialogue
             EPS : 0.3,   // Probability of a client making an edit per-pass
             LS : 5,      // Latency
             C: 15,       // Number of clients
            }
    /*
    var dialogue = write_dialogue(`iteration ${i}`, d)
    var s_am = performance.now()
    run_trial_automerge(dialogue)
    var e_am = performance.now()
    console.log(`${d.N},${d.m},${d.L},${d.EPS},${d.LS},${d.C},"Automerge",${(e_am-s_am)/1000}`)
    */
    var dialogue = write_dialogue(`iteration ${i}`, d)
    var s_s9 = performance.now()
    run_trial_sync9(dialogue)
    var e_s9 = performance.now()
    console.log(`${d.N},${d.m},${d.L},${d.EPS},${d.LS},${d.C},"Sync9",${(e_s9-s_s9)/1000}`)

    console.log("\nDone")
    
}