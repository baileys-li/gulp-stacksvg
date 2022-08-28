/* global describe, it, before, after, beforeEach, afterEach */

import { stacksvg } from "../index.js"
import assert, { strictEqual, ok } from "assert"
import { load } from "cheerio"
import fancyLog from "fancy-log"
import finalhandler from "finalhandler"
import { createServer } from "http"
import PluginError from "plugin-error"
import { launch } from "puppeteer"
import { createSandbox } from "sinon"
import serveStatic from "serve-static"
import Vinyl from "vinyl"

const sandbox = createSandbox()

describe(`gulp-stacksvg usage test`, () => {
	let browser
	let port
	let page

	const server = createServer((req, res) => {
		serveStatic(`test`)(req, res, finalhandler(req, res))
	})

	before(() => Promise.all([
		launch()
			.then((b) => { browser = b })
			.then(() => browser.newPage())
			.then((p) => { page = p }),
		new Promise((resolve) => {
			server.listen(() => {
				port = server.address().port
				resolve()
			})
		})
	]))

	after(() => Promise.all([
		browser.close(),
		new Promise((resolve) => {
			server.close()
			server.unref()
			resolve()
		})
	]))

	it(`stored image should equal original svg`, () => {
		let screenshot1

		return page.goto(`http://localhost:${port}/src/index.html`)
			.then(() => page.evaluate(() => document.title))
			.then((title) => {
				strictEqual(title, `gulp-stacksvg`, `Test page is not loaded`)
			})
			.then(() => page.screenshot())
			.then((data) => { screenshot1 = data })
			.then(() => page.goto(`http://localhost:${port}/dest/index.html`))
			.then(() => page.screenshot())
			.then((screenshot2) => {
				assert(screenshot1.toString() === screenshot2.toString(), `Screenshots are different`)
			})
	})
})

describe(`gulp-stacksvg unit test`, () => {
	beforeEach(() => { sandbox.stub(fancyLog, `info`) })
	afterEach(() => { sandbox.restore() })

	it(`should not create empty svg file`, (done) => {
		const stream = stacksvg()
		let isEmpty = true

		stream.on(`data`, () => { isEmpty = false })

		stream.on(`end`, () => {
			ok(isEmpty, `Created empty svg`)
			done()
		})

		stream.end()
	})

	it(`should correctly merge svg files`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, (file) => {
			const result = file.contents.toString()
			const target = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><style>:root{visibility:hidden}:target{visibility:visible}</style><svg id="circle" viewBox="0 0 4 4" preserveAspectRatio="xMinYMid meet"><circle cx="2" cy="2" r="1"/></svg><svg id="square"><rect x="1" y="1" width="2" height="2"/></svg></svg>`
			strictEqual(result, target)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg viewBox="0 0 4 4" preserveAspectRatio="xMinYMid meet"><circle cx="2" cy="2" r="1"/></svg>`),
			path: `circle.svg`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg><rect x="1" y="1" width="2" height="2"/></svg>`),
			path: `square.svg`
		}))

		stream.end()
	})

	it(`should not include null or invalid files`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, (file) => {
			const result = file.contents.toString()
			const target = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><style>:root{visibility:hidden}:target{visibility:visible}</style><svg id="circle" viewBox="0 0 4 4"><circle cx="2" cy="2" r="1"/></svg></svg>`
			strictEqual(result, target)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg viewBox="0 0 4 4"><circle cx="2" cy="2" r="1"/></svg>`),
			path: `circle.svg`
		}))

		stream.write(new Vinyl({
			contents: null,
			path: `square.svg`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`not an svg`),
			path: `square.svg`
		}))

		stream.end()
	})

	it(`should merge defs to parent svg file`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, (file) => {
			const result = file.contents.toString()
			const target = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><style>:root{visibility:hidden}:target{visibility:visible}</style><defs><circle id="circ" cx="2" cy="2" r="1"/></defs><svg id="circle" viewBox="0 0 4 4"/></svg>`
			strictEqual(result, target)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg viewBox="0 0 4 4"><defs><circle id="circ" cx="2" cy="2" r="1"/></svg></defs><circle cx="2" cy="2" r="1"/></svg>`),
			path: `circle.svg`
		}))

		stream.end()
	})

	it(`should emit error if files have the same name`, (done) => {
		const stream = stacksvg()

		stream.on(`error`, (error) => {
			ok(error instanceof PluginError)
			strictEqual(error.message, `File name should be unique: circle`)
			done()
		})

		stream.write(new Vinyl({ contents: Buffer.from(`<svg></svg>`), path: `circle.svg` }))
		stream.write(new Vinyl({ contents: Buffer.from(`<svg></svg>`), path: `circle.svg` }))

		stream.end()
	})

	it(`should generate result filename based on base path of the first file`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, (file) => {
			strictEqual(file.relative, `icons.svg`)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg/>`),
			path: `src/icons/circle.svg`,
			base: `src/icons`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg/>`),
			path: `src2/icons2/square.svg`,
			base: `src2/icons2`
		}))

		stream.end()
	})

	it(`should generate stacksvg.svg if base path of the 1st file is dot`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, (file) => {
			strictEqual(file.relative, `stacksvg.svg`)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg/>`),
			path: `circle.svg`,
			base: `.`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg/>`),
			path: `src2/icons2/square.svg`,
			base: `src2`
		}))

		stream.end()
	})

	it(`should include all namespace into final svg`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, (file) => {
			const $resultSvg = load(file.contents.toString(), { xmlMode: true })(`svg`)
			strictEqual($resultSvg.attr(`xmlns`), `http://www.w3.org/2000/svg`)
			strictEqual($resultSvg.attr(`xmlns:xlink`), `http://www.w3.org/1999/xlink`)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>`),
			path: `rect.svg`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 50 50"><rect id="a" width="50" height="10"/><use y="20" xlink:href="#a"/><use y="40" xlink:href="#a"/></svg>`),
			path: `sandwich.svg`
		}))

		stream.end()
	})

	it(`should not include duplicate namespaces into final svg`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, (file) => {
			strictEqual(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><style>:root{visibility:hidden}:target{visibility:visible}</style><svg id="rect"/><svg id="sandwich"/></svg>`, file.contents.toString())
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"/>`),
			path: `rect.svg`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"/>`),
			path: `sandwich.svg`
		}))

		stream.end()
	})

	it(`should transfer svg presentation attributes to a wrapping g element`, (done) => {
		const stream = stacksvg()
		const attrs = `stroke="currentColor" stroke-width="2" stroke-linecap="round" style="fill:#0000"`

		stream.on(`data`, (file) => {
			strictEqual(
				`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><style>:root{visibility:hidden}:target{visibility:visible}</style><svg id="rect"><g ${attrs}><rect width="1" height="1"/></g></svg></svg>`,
				file.contents.toString()
			)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}><rect width="1" height="1"/></svg>`),
			path: `rect.svg`
		}))

		stream.end()
	})

	it(`Warn about duplicate namespace value under different name`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, () => {
			strictEqual(
				`Same namespace value under different names : xmlns:lk and xmlns:xlink.\nKeeping both.`,
				fancyLog.info.getCall(0).args[0]
			)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:lk="http://www.w3.org/1999/xlink"><rect id="a" width="1" height="1"/><use y="2" lk:href="#a"/></svg>`),
			path: `rect.svg`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 50 50"><rect id="a" width="50" height="10"/><use y="20" xlink:href="#a"/><use y="40" xlink:href="#a"/></svg>`),
			path: `sandwich.svg`
		}))

		stream.end()
	})

	it(`Strong warn about duplicate namespace name with different value`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, () => {
			strictEqual(
				`xmlns:xlink namespace appeared multiple times with different value. Keeping the first one : "http://www.w3.org/1998/xlink".\nEach namespace must be unique across files.`,
				fancyLog.info.getCall(0).args[0]
			)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1998/xlink"><rect id="a" width="1" height="1"/><use y="2" xlink:href="#a"/></svg>`),
			path: `rect.svg`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"viewBox="0 0 50 50"><rect id="a" width="50" height="10"/><use y="20" xlink:href="#a"/><use y="40" xlink:href="#a"/></svg>`),
			path: `sandwich.svg`
		}))

		stream.end()
	})
})
