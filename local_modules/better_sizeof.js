var Buffer = require('buffer').Buffer

const ECMA_SIZES = {
    STRING: 2,
    BOOLEAN: 4,
    NUMBER: 8
}

function sizeOfObject (object, s) {
    if (s.has(object))
        return 0;
    s.add(object);
    if (object == null) {
        return 0
    }

    var bytes = 0
    for (var key in object) {
        if (!Object.hasOwnProperty.call(object, key)) {
            continue
        }
        bytes += sizeof(key, s)
        bytes += sizeof(object[key], s)
    }

    return bytes
}

/**
 * Main module's entry point
 * Calculates Bytes for the provided parameter
 * @param object - handles object/string/boolean/buffer
 * @returns {*}
 */
function sizeof (object, s) {
    if (Buffer.isBuffer(object)) {
        return object.length
    }

    var objectType = typeof (object)
    switch (objectType) {
        case 'string':
            if (s.has(object))
                return 0;
            s.add(object);
            return object.length * ECMA_SIZES.STRING
        case 'boolean':
            return ECMA_SIZES.BOOLEAN
        case 'number':
            return ECMA_SIZES.NUMBER
        case 'object':
            return sizeOfObject(object, s)
        default:
            return 0
    }
}
function _sizeof(object) {
    var s = new Set()
    return sizeof(object, s)
}
module.exports = _sizeof