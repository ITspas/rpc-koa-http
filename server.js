var collect = require('collect-stream'),
	serializeError = require('serialize-error'),
	slice = Array.prototype.slice;

function endWithJson(statusCode, json, cxt, encoding, done) {
	var payload = new Buffer(encoding.stringify(json));
	cxt.set('content-type', 'application/json');
	cxt.set('content-length', payload.length);
	cxt.status = statusCode;
	cxt.body = payload;
	done && done();
}

function error(encoding, err, res, done) {
	endWithJson(500, [serializeError(err)], res, encoding, done)
}

function parseResponse(encoding, stream, callback) {
	collect(stream, function(err, buffer) {
		if (err) return callback(err)
		try {
			callback(null, encoding.parse(buffer.toString()))
		} catch (err) {
			callback(err)
		}
	})
}

function doAliasEncode(alias, aliasMethod, args) {
	if (aliasMethod) {
		var oArgs = args,
			nArgs = [],
			tmpArr;
		typeof aliasMethod == 'string' && (aliasMethod = alias[aliasMethod]);
		if (Array.isArray(aliasMethod)) {
			aliasMethod.forEach(function(k) {
				if (typeof k == 'string') {
					nArgs.push(args[k])
				} else if (Array.isArray(k) && k.length > 1) {
					if (k.length > 2) {
						nArgs.push((tmpArr = []));
						args[k[0]].forEach(function(args) {
							tmpArr.push(doAliasEncode(alias, k[1], args));
						});
					} else {
						nArgs.push(doAliasEncode(alias, k[1], args[k[0]]))
					}
				}
			});
			args = nArgs;
		}
	}
	return args;
}


function doParseRequest(encoding, cxt, fun, alias, aliasMethod) {
	return function(done) {
		parseResponse(encoding, cxt.req, function(err, input) {
			if (err) {
				error(encoding, err, cxt, done);
				return
			}
			try {
				if (input.sync) {
					fun.apply(cxt, input.args)
					done();
				} else {
					input.args.push(function() {
						var args = slice.call(arguments)
						if (args[0]) {
							args[0] = serializeError(args[0])
						}
						if (aliasMethod && args.length > 2) args[2] = doAliasEncode(alias, aliasMethod, args[2])
						endWithJson(200, args, cxt, encoding, done);
					})
					fun.apply(cxt, input.args)
				}
			} catch (ex) {
				error(encoding, ex, cxt, done);
			}
		})
	}
}

module.exports = function(options) {
	var encoding = options.encoding || JSON;
	return function*() {
		options.origin && this.req.headers && this.req.headers.origin && (this.set('Access-Control-Allow-Origin', this.req.headers.origin));
		options.credentials && (this.set('Access-Control-Allow-Credentials', true));
		if (this.url.slice(0, options.url.length) !== options.url) return
		var methodName = this.url.replace(options.url, '').replace(/^\//, ''),
			fun = options.methods[methodName]
		if (!fun) {
			error(encoding, new Error('No method ' + methodName), this)
			return
		}
		yield doParseRequest(encoding, this, fun, options.alias, options.methodsAlias[methodName]);
	}
}