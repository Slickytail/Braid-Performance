module.exports = {read: read_dialogue,
                  process_network: process_network,
                  good_check: good_check}

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
        throw 'Clients desynced'
    }
}