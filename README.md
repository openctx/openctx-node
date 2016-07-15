# Open Context for Node.js

This is a simple library for solving the Distributed Context Propagation (DCP)
problem in Node.js programs.

DCP is most beneficial in large service oriented architectures. Each request
has some associated metadata, and we want to make sure that data propagates 
througout the call graph that services the root request.

The `Context` object in this library stores this serializable distributed 
context, called baggage. RPC libraries are responsible for marshaling baggage 
on and off the wire.

OpenCtx supports "joining". Both requests and responses can carry baggage.
Joining a response context with the context in hand carries the baggage forward
throughout subsequent requests and responses. Joining parallel responses may
involve property-specific logic, like taking the lesser of two deadlines,
merging sets of receipts, or computing the latter of logical clocks.

A `Context` object is just a bag of key/value pairs. By having a
common interface, we can support `Context` in different RPC libraries.

## `Context()`

The `Context` object stores arbitrary key/value pairs. The constructor creates
a new blank context.

### `Context#set(key, value)`

Maps `key` to `value` within this context.

### `Context#get(key)`

Gets the value of `key`.

### `Context#keys()`

Gets the list of keys.

### `Context#joinWith(context, mergeFns)`

Joins all properties from `context` into `this` context. If there are 
conflicts, we take the value from `context` unless there is a merge function
specified in `mergeFns` for that property. `mergeFns` is a map of property 
names to functions which take two values for this property and produce a merged
value.

### `Context#createChild(options)`

Creates a dependent child context of this context. It inherits all properties.

## Implementation Guide

### Basic operation

An RPC library wishing to implement Open Context for Distributed Context
Propagation would need to do the following.

A context is created for each incoming request, outgoing response, outgoing
request, and outgoing response. Serialization of the context properties is the
responsibility of the RPC library.

The `inreqctx` (incoming request context) will contain any properties the 
calling service thinks we should propagate throughout the RPC tree. We use
the `createChild` method to make `outreqctx`s, which are serialized into any
outgoing requests to downstream services. These `outreqctx`s will inherit any 
baggage on the `inreqctx`.

We also have an `outresctx` for the properties that we want to be on our
outgoing response. This also inherits from the `inreqctx`.

Every time a downstream request comes back, when we have an `inres`, we join
all properties on the `inresctx` to the `inreqctx` and `outresctx`. This way,
any properties specified on the response of the downstream request will be
passed to any subsequent downstream requests (because those downstream requests
inherit from the `inreqctx`) as well as on our response (because we also joined
with the `outresctx`).

So, a high level description of the operation of this library looks like this,
assuming we have two services, A and B, and A receives a request for which it
needs to make a call to B:

1. RPC request arrives to A. Deserialize its baggage into a new context, 
   the `inreqctx`.
2. Create `outresctx`. Join with `inreqctx`.
3. Use `createChild` to create `outreqctx`, a child context of `inreqctx`.
4. Serialize `outreqctx` to the outgoing request to B.
5. Make the request to B. When the response comes back, deserialize its
   baggage into `inresctx`.
6. Join `inreqctx` with `inresctx`, so any baggage on the incoming response 
   will be sent to subsequent outgoing requests.
7. Join `outresctx` with `inresctx`, so any baggage on the incoming
   response will be sent on our response for the request into A.
8. Serialize `outresctx` into the outgoing response out of A.
9. Send response to caller of A.

### Example Implementation

In the `test.js` there's an example "instrumented RPC library" consisting of
two functions: `ctxRequest(ctx, url, done)` and 
`makeServer(name, endpoint, handler, ready)`.

`ctxRequest` is a function for making an http request using a given context,
`ctx`:

```javascript
function ctxRequest(inreqctx, url, done) {
    // Create new child context; it will inherits all its parents properties
    var outreqctx = inreqctx.createChild(); 
    var headers = serialize(outreqctx); // serialize the context

    // actually perform request, embedding context data
    request({headers: headers, url: url}, reqDone);

    function reqDone(error, req, body) {
        // Deserialize the incoming response's context information
        var inresctx = deserialize(req.headers || {});
        // Join properties into the incoming request context and the outgoing
        // response context
        inreqctx.joinWith(inresctx);
        // We stored the outresctx on the inreqctx so the user wouldn't have
        // to pass both to this method
        inreqctx.outresctx.joinWith(inresctx);

        req.ctx = inresctx;

        done(error, req, body);
    }
}
```

The server side makes a very simple http server that has a single endpoint
called `endpoint`. It accepts http requests with any method to that endpoint,
and calls `handler(req, res, done)` to handle the request. It's expected that
the handler does not write headers or data and simply calls the callback with
the data for the response.

```javascript
function makeServer(name, endpoint, handler, done) {
    var server = http.createServer(handle);

    function handle(inreq, outres) {
        // deserialize context out of http headers
        inreq.ctx = deserialize(inreq.headers);
        outres.ctx = new Context(); // create new outgoing response context
        outres.ctx.joinWith(inreq.ctx); // get all properties from inreq
        // Store outresctx on the inreqctx so the user doesn't have to pass
        // both to ctxRequest above
        inreq.ctx.outresctx = outres.ctx;

        if (inreq.url === '/' + endpoint) {
            handler(inreq, outres, done);
        }

        function done(data) {
            // Serialize baggage to response headers
            var headers = serialize(outres.ctx);
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
```

## License

MIT.
