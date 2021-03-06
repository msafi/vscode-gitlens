'use strict';
const _isEqual = require('lodash.isequal');

export namespace Objects {
    export function areEquivalent(first: any, second: any): boolean {
        return _isEqual(first, second);
    }

    export function* entries(o: any): IterableIterator<[string, any]> {
        for (const key in o) {
            yield [key, o[key]];
        }
    }

    export function flatten(o: any, prefix: string = '', stringify: boolean = false): { [key: string]: any } {
        const flattened = Object.create(null);
        _flatten(flattened, prefix, o, stringify);
        return flattened;
    }

    function _flatten(flattened: { [key: string]: any }, key: string, value: any, stringify: boolean = false) {
        if (Object(value) !== value) {
            if (stringify) {
                if (value == null) {
                    flattened[key] = null;
                }
                else if (typeof value === 'string') {
                    flattened[key] = value;
                }
                else {
                    flattened[key] = JSON.stringify(value);
                }
            }
            else {
                flattened[key] = value;
            }
        }
        else if (Array.isArray(value)) {
            const len = value.length;
            for (let i = 0; i < len; i++) {
                _flatten(flattened, `${key}[${i}]`, value[i], stringify);
            }
            if (len === 0) {
                flattened[key] = null;
            }
        }
        else {
            let isEmpty = true;
            for (const p in value) {
                isEmpty = false;
                _flatten(flattened, key ? `${key}.${p}` : p, value[p], stringify);
            }
            if (isEmpty && key) {
                flattened[key] = null;
            }
        }
    }

    export function* values<T>(o: any): IterableIterator<T> {
        for (const key in o) {
            yield o[key];
        }
    }
}