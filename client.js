var unflatten = require('flat').unflatten,
	makeError = function(obj) {
		var err = new Error(obj.message)
		Object.keys(obj).forEach(function(key) {
			err[key] = obj[key]
		})
		return err
	},
	doAliasDecode = function(alias, aliasMethod, args) {
		if (aliasMethod) {
			var oArgs = args,
				nArgs = {},
				tmpArr;
			typeof aliasMethod == 'string' && (aliasMethod = alias[aliasMethod]);
			if (Array.isArray(aliasMethod)) {
				aliasMethod.forEach(function(k, i) {
					if (typeof k == 'string') {
						nArgs[k] = args[i];
					} else if (Array.isArray(k) && k.length > 1) {
						if (k.length > 2) {
							nArgs[k[0]] = (tmpArr = []);
							args[i].forEach(function(args) {
								tmpArr.push(doAliasDecode(alias, k[1], args));
							});
						} else {
							nArgs[k[0]] = doAliasDecode(alias, k[1], args[i]);
						}
					}
				});
				args = nArgs;
			}
		}
		return args;
	},
	setupClient = function(request) {
		return function(options) {
			var remote = {},
				encoding = options.encoding || JSON
			options.methodNames.forEach(function(name) {
				remote[name] = function() {
					var args = Array.prototype.slice.call(arguments),
						sync = typeof(args[args.length - 1]) !== 'function',
						callback = sync ? undefined : args.pop()
					request({
						url: options.url + '/' + name,
						method: 'POST',
						body: encoding.stringify({
							args: args,
							sync: sync
						}),
						timeout: options.timeout || 30 * 1000,
						withCredentials: options.credentials
					}, function(err, resp, body) {
						var args;
						if (sync) return
						if (err) return callback(err)
						try {
							args = encoding.parse(body)
							if (args[0]) args[0] = makeError(args[0]);
							if (options.methodsAlias[name] && args.length > 2) {
								args[2] = doAliasDecode(options.alias, options.methodsAlias[name], args[2])
							}
						} catch (err) {
							return callback(err)
						}
						callback.apply(null, args)
					})
				}
			})
			return unflatten(remote)
		}
	}
module.exports = setupClient