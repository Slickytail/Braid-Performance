module.exports = {read: read_dialogue,
                  fullsync: fullsync,
                  process_network: process_network,
                  good_check: good_check,
                  format_byte: format_bytes}

function read_dialogue(writer, clients, tick, finished) {
    
    function next_line() {
        var w = writer.next()
        var line = w.value
        if (!w.done) {
            if (line.action == 'sync') {
                console.log("Fullsyncing...")
                fullsync(clients, tick)
            }
            if (line.action == 'tick') {
                if (tick) tick("Reading")
            }
            var c = clients[line.client]
            if (c) {
                if (line.action == 'edit') {
                    console.log("Making edit")
                    c.change_frac(line.details.start, line.details.len, line.details.ins)
                } else if (line.action == 'net') {
                    console.log("Doing network line")
                    process_network(c)
                }
            }
            setImmediate(next_line)
        }
        else if (finished) setImmediate(finished)
    }
    next_line();
}

function fullsync(clients, tick) {
    if (Object.values(clients).some(c => c.has_messages())) {
        Object.values(clients).forEach(c => {
            setImmediate(process_network, c)
        })
        if (tick) tick("Fullsync")
        setImmediate(fullsync, clients, tick)
    }
    
}

function process_network(c) {
    console.log(`Processing network for client ${c.uid}`)
    for (var buf of c.buffers) {
        while (c[buf].length && c[buf][0].time == 0) {
            setImmediate(c[buf].shift())
        }
        c[buf].forEach((f, i, a) => a[i].time--)
    }
}


function good_check(nodes, success) {
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
            //console.log(x)
            var val = x.read()
            console.log(val)
        })
        console.log('CHECK GOOD: ' + check_good)
        throw 'Clients desynced'
    } else {
        if (success) setTimeout(success)
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