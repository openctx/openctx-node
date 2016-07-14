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

var http = require('http');
var request = require('request');
var test = require('tape');

var Context = require('./context');
var SimpleSerializer = require('./simple_serializer');
var serializer = new SimpleSerializer(null, Context);

function makeServer(name, endpoint, handler, done) {
    var server = http.createServer(handle);

    function handle(inreq, outres) {
        inreq.ctx = serializer.deserialize(inreq.headers);
        outres.ctx = new Context();
        outres.ctx.joinWith(inreq.ctx); 
        inreq.ctx.outresctx = outres.ctx;

        console.log('# SERVER ' + name + ' got request: ' + inreq.url);
        if (inreq.url === '/' + endpoint) {
            handler(inreq, outres, done);
        }

        function done(data) {
            var headers = serializer.serialize(outres.ctx);
            outres.writeHead(200, 'ok', headers);
            outres.end(data);
        }
    }

    server.listen(0, onListening);

    function onListening() {
        server.name = name;
        server.port = server.address().port;
        server.url = 'http://127.0.0.1:' + server.port + '/' + endpoint;
        done(server, server.port);
    }

    return server;
}

function ctxRequest(inreqctx, url, done) {
    var outreqctx = inreqctx.createChild(); // implicit outreqctx.joinWith(inreqctx) 
    var headers = serializer.serialize(outreqctx);

    request({headers: headers, url: url}, reqDone);

    function reqDone(error, req, body) {
        var inresctx = serializer.deserialize(req.headers || {});
        inreqctx.joinWith(inresctx);
        inreqctx.outresctx.joinWith(inresctx);

        req.ctx = inresctx;

        done(error, req, body);
    }
}

test('request propagated baggage', function t1(a) {
    var alice = makeServer('alice', 'poke', alicePoked, onReady);
    var bob = makeServer('bob', 'poke', bobPoked, onReady);
    var ready = 0;

    function onReady() {
        ready += 1;
        if (ready === 2) {
            request(bob.url, onBobResponse);
        }
    }

    function bobPoked(inreq, outres, done) {
        inreq.ctx.set('auth', '100');
        ctxRequest(inreq.ctx, alice.url, onReqDone);
        function onReqDone(error, inres, body) {
            done('bob got from alice: ' + body);
        }
    }

    function alicePoked(inreq, outres, done) {
        a.equal(inreq.ctx.get('auth'), '100', 'inreq ctx auth value set');
        done('ow alice does not like poke! auth value: ' + inreq.ctx.get('auth'));
    }

    function onBobResponse(error, inres, body) {
        a.end();
        alice.close();
        bob.close();
    }
});

test('response propagated baggage', function t2(a) {
    var alice = makeServer('alice', 'poke', alicePoked, onReady);
    var bob = makeServer('bob', 'poke', bobPoked, onReady);
    var ready = 0;

    function onReady() {
        ready += 1;
        if (ready === 2) {
            request(bob.url, onBobResponse);
        }
    }

    function bobPoked(inreq, outres, done) {
        ctxRequest(inreq.ctx, alice.url, onReqDone);
        function onReqDone(error, inres, body) {
            done('bob got from alice: ' + body);
        }
    }

    function alicePoked(inreq, outres, done) {
        outres.ctx.set('touched-by-alice', 'true');
        done('alice was poked');
    }

    function onBobResponse(error, inres, body) {
        a.equal(inres.headers['context-touched-by-alice'], 'true', 'res has touched by alice header');
        a.end();
        alice.close();
        bob.close();
    }
});

test('request propagated baggage on a response context', function t3(a) {
    var alice = makeServer('alice', 'poke', alicePoked, onReady);
    var bob = makeServer('bob', 'poke', bobPoked, onReady);
    var chaz = makeServer('chaz', 'poke', chazPoked, onReady);
    var ready = 0;

    function onReady() {
        ready += 1;
        if (ready === 3) {
            request(alice.url, onBobResponse);
        }
    }

    function alicePoked(inreq, outres, done) {
        var bobres;

        ctxRequest(inreq.ctx, bob.url, onBobReqDone);
        function onBobReqDone(error, inres, body) {
            bobres = body;
            a.equal(inreq.ctx.get('auth'), '108faa8fd', 'inreq now has auth prop');
            ctxRequest(inreq.ctx, chaz.url, onChazReqDone);
        }

        function onChazReqDone(error, inres, body) {
            done(bobres + body);
        }
    }

    function bobPoked(inreq, outres, done) {
        outres.ctx.set('auth', '108faa8fd');
        done('bob was poked');
    }

    function chazPoked(inreq, outres, done) {
        a.equal(inreq.ctx.get('auth'), '108faa8fd', 'inreq has auth prop');
        done('chaz was poked');
    }

    function onBobResponse(err, inres, body) {
        a.end();
        alice.close();
        bob.close();
        chaz.close();
    }
});

test('request AND response propagated baggage on a response context', function t3(a) {
    var alice = makeServer('alice', 'poke', alicePoked, onReady);
    var bob = makeServer('bob', 'poke', bobPoked, onReady);
    var chaz = makeServer('chaz', 'poke', chazPoked, onReady);
    var ready = 0;

    function onReady() {
        ready += 1;
        if (ready === 3) {
            request(alice.url, onBobResponse);
        }
    }

    function alicePoked(inreq, outres, done) {
        var bobres;

        ctxRequest(inreq.ctx, bob.url, onBobReqDone);
        function onBobReqDone(error, inres, body) {
            bobres = body;
            a.equal(inreq.ctx.get('auth'), '108faa8fd', 'inreq now has auth prop');
            ctxRequest(inreq.ctx, chaz.url, onChazReqDone);
        }

        function onChazReqDone(error, inres, body) {
            done(bobres + body);
        }
    }

    function bobPoked(inreq, outres, done) {
        outres.ctx.set('auth', '108faa8fd');
        done('bob was poked');
    }

    function chazPoked(inreq, outres, done) {
        a.equal(inreq.ctx.get('auth'), '108faa8fd', 'inreq has auth prop');
        done('chaz was poked');
    }

    function onBobResponse(err, inres, body) {
        var ctx = serializer.deserialize(inres.headers);
        a.equal(ctx.get('auth'), '108faa8fd', 'response ctx has auth');
        a.equal(ctx.keys().length, 1, 'response ctx has 1 key');
        a.end();
        alice.close();
        bob.close();
        chaz.close();
    }
});

test('infectious baggage on a response context', function t3(a) {
    var alice = makeServer('alice', 'poke', alicePoked, onReady);
    var bob = makeServer('bob', 'poke', bobPoked, onReady);
    var chaz = makeServer('chaz', 'poke', chazPoked, onReady);
    var ready = 0;

    function onReady() {
        ready += 1;
        if (ready === 3) {
            request(alice.url, onBobResponse);
        }
    }

    function alicePoked(inreq, outres, done) {
        var bobres;

        ctxRequest(inreq.ctx, bob.url, onBobReqDone);
        function onBobReqDone(error, inres, body) {
            bobres = body;
            a.equal(inreq.ctx.get('clock'), '108faa8fd', 'inreq now has clock prop');
            ctxRequest(inreq.ctx, chaz.url, onChazReqDone);
        }

        function onChazReqDone(error, inres, body) {
            done(bobres + body);
        }
    }

    function bobPoked(inreq, outres, done) {
        outres.ctx.set('clock', '108faa8fd');
        done('bob was poked');
    }

    function chazPoked(inreq, outres, done) {
        a.equal(inreq.ctx.get('clock'), '108faa8fd', 'inreq has clock prop');
        done('chaz was poked');
    }

    function onBobResponse(err, inres, body) {
        var ctx = serializer.deserialize(inres.headers);
        a.equal(ctx.get('clock'), '108faa8fd', 'response ctx has clock');
        a.equal(ctx.keys().length, 1, 'response ctx has 1 key');
        a.end();
        alice.close();
        bob.close();
        chaz.close();
    }
});

