module.exports = {read: read_dialogue,
                  fullsync: fullsync,
                  process_network: process_network,
                  good_check: good_check,
                  format_byte: format_bytes};

function read_dialogue(writer, clients, tick, finished) {
    async function next_line() {
        var w = writer.next();
        var line = w.value;
        if (!w.done) {
            if (line.action == 'sync') {
                await fullsync(clients, tick);
            }
            if (line.action == 'tick') {
                if (clients["server"])
                    process_network(clients["server"])
                if (tick) tick("Reading");
            }
            var c = clients[line.client];
            if (line.action == 'edit') {
                c.change_frac(line.details.start, line.details.ins)
            } else if (line.action == 'net') {
                process_network(c);
            }   
            
            setImmediate(next_line);
 
        }
        else if (finished) {finished()}
    }
    next_line();
}

async function fullsync(clients, tick) {
    return new Promise((resolve, reject) => {
        function net() {
            if (Object.values(clients).some(c => c.has_messages()) || !in_sync(Object.values(clients))) {
                
                Object.values(clients).forEach(c => {
                    process_network(c);
                })
                if (tick) tick("Fullsync");
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
            c[buf].shift()()
        }
        c[buf].forEach((f, i, a) => a[i].time--)
    }
}
function in_sync(nodes) {
    var check_val = nodes[0].read()
    for (var node of nodes) {
        var val = node.read()
        if (val != check_val)
            return false
    }
    return true
}

function good_check(nodes, success) {
    if (!in_sync(Object.values(nodes))) {
        nodes.forEach(x => {
            console.log(x.read())
        })
        console.error('Good Check Failed!')
        throw 'Clients desynced'
    } else {
        if (success) success()
    }
}

function format_bytes(n) {
    if (n < 1024)
        return `${n} B`
    if (n < (1024 * 1024))
        return `${(n / 1024).toFixed(1)} KB`
    if (n < (1024 * 1024 * 1024))
        return `${(n / 1024 / 1024).toFixed(1)} MB`
    if (n < (1024 * 1024 * 1024 * 1024))
        return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}