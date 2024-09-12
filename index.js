import {dlopen, suffix, ptr, JSCallback, CString} from 'bun:ffi'
const encodeCString = str => ptr(Buffer.from(str + '\0', 'utf8'))
const lib = dlopen(`${import.meta.dir}/build/libwebview.${suffix}`, {
	webview_create: {
		args: ['i32', 'ptr'],
		returns: 'ptr'
	},
	webview_destroy: {
		args: ['ptr']
	},
	webview_run: {
		args: ['ptr']
	},
	webview_terminate: {
		args: ['ptr']
	},
	webview_dispatch: {
		args: ['ptr', 'function', 'ptr']
	},
	webview_get_window: {
		args: ['ptr'],
		returns: 'ptr'
	},
	webview_get_native_handle: {
		args: ['ptr', 'i32'],
		returns: 'ptr'
	},
	webview_set_title: {
		args: ['ptr', 'cstring']
	},
	webview_set_size: {
		args: ['ptr', 'i32', 'i32', 'i32']
	},
	webview_navigate: {
		args: ['ptr', 'cstring']
	},
	webview_set_html: {
		args: ['ptr', 'cstring']
	},
	webview_init: {
		args: ['ptr', 'cstring']
	},
	webview_eval: {
		args: ['ptr', 'cstring']
	},
	webview_bind: {
		args: ['ptr', 'cstring', 'function', 'ptr']
	},
	webview_unbind: {
		args: ['ptr', 'cstring']
	},
	webview_return: {
		args: ['ptr', 'cstring', 'i32', 'cstring']
	}
})
export class Webview {
	#w
	#binds = {}
	constructor(debug, window) {
		this.#w = lib.symbols.webview_create(this.debug = debug ? 1 : 0, window)
	}
	destroy() {
		for (const bind in this.#binds)
			this.unbind(bind)
		lib.symbols.webview_destroy(this.#w)
	}
	run() {
		lib.symbols.webview_run(this.#w)
	}
	terminate() {
		lib.symbols.webview_terminate(this.#w)
		this.destroy()
	}
	dispatch(fn, ...arg) {
		const cb = new JSCallback(() => cb.close(fn(...arg)), {
			args: ['ptr', 'ptr']
		})
		lib.symbols.webview_dispatch(this.#w, cb.ptr)
	}
	get window() {
		return lib.symbols.webview_get_window(this.#w)
	}
	get handle() {
		return lib.symbols.webview_get_native_handle(this.#w)
	}
	set size({width, height, hints = 'none'}) {
		lib.symbols.webview_set_size(this.#w, width, height, ['none', 'min', 'max', 'fixed'].indexOf(hints))
	}
	navigate(url) {
		lib.symbols.webview_navigate(this.#w, encodeCString(url))
	}
	set html(html) {
		lib.symbols.webview_set_html(this.#w, encodeCString(html))
	}
	init(js) {
		lib.symbols.webview_init(this.#w, encodeCString(js))
	}
	eval(js) {
		lib.symbols.webview_eval(this.#w, encodeCString(js))
	}
	set title(title) {
		lib.symbols.webview_set_title(this.#w, encodeCString(title))
	}
	bind(name, fn, ...arg) {
		if (this.#binds[name])
			this.unbind(name)
		lib.symbols.webview_bind(this.#w, encodeCString(name), (
			this.#binds[name] = new JSCallback(async (id, req) => {
				let result, status = 0
				try {
					result = fn(...JSON.parse(new CString(req)), ...arg)
					if (result === undefined)
						result = null
					else if (result instanceof Promise)
						result = await result
				} catch(err) {
					if (this.debug)
						console.error(err)
					result = err.toString()
					status = 1
				}
				lib.symbols.webview_return(this.#w, id, status, encodeCString(JSON.stringify(result)))
			}, {
				args: ['cstring', 'cstring', 'ptr']
			})
		).ptr)
	}
	unbind(name) {
		lib.symbols.webview_unbind(this.#w, encodeCString(name))
		this.#binds[name]?.close()
		delete this.#binds[name]
	}
}