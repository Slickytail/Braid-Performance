module.exports = {read: read_dialogue,
                  fullsync: fullsync,
                  process_network: process_network,
                  good_check: good_check,
                  format_byte: format_bytes};
var edits = 0;
function read_dialogue(writer, clients, tick, finished) {
    edits=0;
    async function next_line() {
        var w = writer.next();
        var line = w.value;
        if (!w.done) {
            if (line.action == 'sync') {
                await fullsync(clients, tick);
            }
            if (line.action == 'tick') {
                if (clients["server"])
                    process_network(clients["server"]);
                if (tick) tick(edits);
            }
            var c = clients[line.client];
            if (line.action == 'edit') {
                edits++;
                c.change_frac(line.details.start, line.details.ins);
            } else if (line.action == 'net') {
                process_network(c);
            }
            
            setImmediate(next_line);
 
        }
        // If we were given an end-of-dialogue callback, call it
        else if (finished) setImmediate(finished)
    }
    next_line();
}

async function fullsync(clients, tick) {
    return new Promise((resolve, reject) => {
        function net() {
            // If a client has any incoming messages or the clients are out of sync
            if (Object.values(clients).some(c => c.has_messages()) || !in_sync(Object.values(clients))) {
                
                Object.values(clients).forEach(c => {
                    process_network(c);
                })
                if (tick)
                    tick(edits);
                setImmediate(net);
            }
            else {
                resolve();
            }
        }
        net();
    })
}

function process_network(c) {
    for (var buf of c.buffers) {
        while (c[buf].length && c[buf][0].time == 0) {
            // The elements of the buffer are actually functions, so we shift them and then call them to "process" them
            setImmediate(c[buf].shift());
        }
        // Tick down the time on every message in the buffer
        c[buf].forEach((f, i, a) => a[i].time--);
    }
}
function in_sync(nodes) {
    // Do all of the clients have the same text?
    var check_val = nodes[0].read();
    for (var node of nodes) {
        var val = node.read();
        if (val != check_val)
            return false;
    }
    return true;
}

function good_check(nodes, success) {
    if (!in_sync(Object.values(nodes))) {
        nodes.forEach(x => {
            console.log(x.read());
        })
        console.error('Good Check Failed!');
        throw 'Clients desynced';
    } else {
        if (success) success();
    }
}

function format_bytes(n) {
    if (n < 1024)
        return `${n} B`;
    if (n < (1024 * 1024))
        return `${(n / 1024).toFixed(1)} KB`;
    if (n < (1024 * 1024 * 1024))
        return `${(n / 1024 / 1024).toFixed(1)} MB`;
    if (n < (1024 * 1024 * 1024 * 1024))
        return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}