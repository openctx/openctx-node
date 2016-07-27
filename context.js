// Copyright (c) 2016 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';

var errors = require('./errors');

module.exports = Context;

function Context(options) {
    this.dict = Object.create(null);
}

Context.prototype.set = function set(key, value) {
    this.dict[key.toLowerCase()] = value;
    return null;
};

Context.prototype.get = function get(key) {
    return this.dict[key.toLowerCase()];
};

Context.prototype.keys = function keys() {
    return Object.keys(this.dict);
};

Context.prototype.joinWith = function joinWith(context, mergeFns) {
    var i;
    var keys = context.keys();
    var err;
    for (i = 0; i < keys.length; i++) {
        if (mergeFns && (keys[i] in mergeFns)) {
            err = this.set(
                keys[i], 
                mergeFns[keys[i]](this.get(keys[i]), context.get(keys[i]))
            );
        } else {
            err = this.set(keys[i], context.get(keys[i]));
        }
        if (err) {
            return errors.Join(err);
        }
    }
    return this;
};

Context.prototype.createChild = function createChild(options) {
    var newContext = new Context();
    newContext.joinWith(this); 
    return newContext;
};
