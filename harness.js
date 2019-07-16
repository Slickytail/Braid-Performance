const automerge_network = require("./test_networks/automerge_network.js")
const sync9_network = require("./test_networks/sync9_network.js")
const sharedb_network = require("./test_networks/sharedb_network.js")
const random = require("./local_modules/random.js")
const fs = require('fs');
const { PerformanceObserver, performance } = require('perf_hooks');

function write_dialogue(d) {
    var last_seed = d.seed;
    function rand() {
        random.seed('' + last_seed);
        return last_seed = Math.random();
    }
    function Z(n) {
        return Array(n).fill(0); // array of zeroes of length N
    }
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var clients = Z(d.C).map(() => "CL_"+random.guid());
    function* writer() { // Generator that network harnesses can draw commands from
        var starttext = Z(d.N).map(() => alphabet[Math.floor(rand()*alphabet.length)]).join(''); // Random text of length d.N
        const full_sync = { action: 'sync' };
        yield { // Tell the server what the initial text is
            action: 'start',
            details: { text: starttext }
        };
        yield full_sync; // Get all the clients in sync before they start making edits
        var total_edits = 0; // The number of edit lines that have been sent
        var client_num = 0; // Which client is going to do a *network* update
        var edit_counter = 0; // How many clients have done a network update since the last edit
        var next_client = 0; // Next client in line to make an edit
        d.period = 1/d.EPS; // We make an edit every `period` network updates
        while (total_edits < d.L) {
            if (client_num == 0)
                yield {action: "tick"}; // A tick is used for harnesses to log debug info
            
            // Build a network line
            var c = clients[client_num];
            var line = { client : c };
            line.action = 'net';
            yield line;
            client_num = (client_num+1) % d.C;
            
            edit_counter = (edit_counter + 1) % d.period;
            // If we just ticked over d.period then it's time to make an edit
            if (edit_counter < 1) {
                // next_client makes an edit
                var ce = clients[next_client];
                var eline = { client: ce };
                eline.action = 'edit';
                var edit_length = Math.floor(d.m + (2*rand() - 1) * d.v); // Pick a random number of characters for the edit length
                var start = rand(); // Start a random fraction into the string
                
                ins = Z(edit_length).map(() => alphabet[Math.floor(rand()*alphabet.length)]).join(''); // Generate a random string of edit_length
                eline.details = {start: start, ins: ins};
                total_edits++;
                next_client = (next_client + 1) % d.C;
                
                yield eline;
            }
            
        }
        // We've finished the dialogue, let's fullsync and then finish
        yield full_sync;
        return;
        
    }
    return {client_ids: clients, w: writer(), d: d};
    
}

function run_test(params, done) {
    var runtimes = {};
    const obs = new PerformanceObserver((items, observer) => {
        items.getEntries().forEach(x => runtimes[x.name] = +(x.duration / 1000).toFixed(2)); // Add new entries to the dict, in seconds
        performance.clearMarks();
    });
    obs.observe({ entryTypes: ['measure'] });
    
    function automerge(x) {
        var dialogue = write_dialogue(params);
        //console.group("[Automerge]");
        performance.mark("AM_S");
        automerge_network.run_trial(dialogue, () => {
            performance.mark("AM_E");
            performance.measure("Automerge", "AM_S", "AM_E");
            console.log("Automerge finished");
            //console.groupEnd();
            //setImmediate(sharedb);
            setImmediate(x)
            
        });
    }
    function sharedb(x) {
        var dialogue = write_dialogue(params);
        //console.group("[ShareDB]");
        performance.mark("SDB_S");
        sharedb_network.run_trial(dialogue, () => {
            performance.mark("SDB_E");
            performance.measure(`ShareDB`, "SDB_S", "SDB_E");
            console.log("ShareDB finished");
            //console.groupEnd();
            setImmediate(x)
        });
    }
    function sync9(x) {
        var dialogue = write_dialogue(params);
        //console.group("[Sync9]");
        performance.mark("S9_S");
        sync9_network.run_trial(dialogue, () => {
            performance.mark("S9_E");
            performance.measure(`Sync9`, "S9_S", "S9_E");
            console.log("Sync9 finished");
            //console.groupEnd();
            setImmediate(x);
            
        });
    }
    //automerge(() =>
    //sharedb(() =>
    sync9(
    fin)//))

    function fin() {
        obs.disconnect();
        console.log("Finished. Runtimes:", runtimes)
        //console.groupEnd();
        if (done) setImmediate(done);
    }
    
}

global.outfile = fs.createWriteStream("./Visualization/sync9_prune_memory_long_hard.csv");
outfile.write("eps,ls,c,i,e,prune_freq,server_size,client_size\n");
function* space() {
    var d = 
    {
        seed: "Another Seed",
        N : 200,
        m : 30,
        v : 10,
        L : 5000,
        EPS : 0.7,
        LS : 15,
        C: 15,
        prune: true,
        prune_freq: 50,
        tag: ""
    };
    for (var p of [1, 5, 10, 20, 50, 100, 0]) {
        d.prune_freq = p;
        d.prune = p != 0;
        yield d;
    }
}
var x = space();
function p() {
    var z = x.next();
    if (z.done) {
        outfile.end();
    } else {
        run_test(z.value, p)
    }
}
p()