/* global describe, it, before, after, beforeEach, afterEach */

import { stacksvg } from "../index.js"
import assert, { strictEqual, ok } from "assert"
import { parse } from "node-html-parser"
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
			const target = `<svg xmlns="http://www.w3.org/2000/svg"><style>:root{visibility:hidden}:target{visibility:visible}</style><svg viewBox="0 0 4 4" preserveAspectRatio="xMinYMid meet" id="circle"><circle cx="2" cy="2" r="1"></circle></svg><svg id="square"><rect x="1" y="1" width="2" height="2"></rect></svg></svg>`
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

	it(`should not include null`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, (file) => {
			const result = file.contents.toString()
			const target = `<svg xmlns="http://www.w3.org/2000/svg"><style>:root{visibility:hidden}:target{visibility:visible}</style><svg viewBox="0 0 4 4" id="circle"><circle cx="2" cy="2" r="1"></circle></svg></svg>`
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

		stream.end()
	})

	it(`should not include invalid files`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, (file) => {
			const result = file.contents.toString()
			const target = `<svg xmlns="http://www.w3.org/2000/svg"><style>:root{visibility:hidden}:target{visibility:visible}</style><svg viewBox="0 0 4 4" id="circle"><circle cx="2" cy="2" r="1"></circle></svg></svg>`
			strictEqual(result, target)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg viewBox="0 0 4 4"><circle cx="2" cy="2" r="1"/></svg>`),
			path: `circle.svg`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`not an svg`),
			path: `square.svg`
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

	it(`should generate stack.svg if output filename is not passed`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, (file) => {
			strictEqual(file.relative, `stack.svg`)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg/>`),
			path: `circle.svg`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg/>`),
			path: `square.svg`
		}))

		stream.end()
	})

	it(`should add .svg if passed output doesn't end with this`, (done) => {
		const stream = stacksvg({ output: `test`})

		stream.on(`data`, (file) => {
			strictEqual(file.relative, `test.svg`)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg/>`),
			path: `circle.svg`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg/>`),
			path: `square.svg`
		}))

		stream.end()
	})

	it(`should not add .svg if passed output ends with this`, (done) => {
		const stream = stacksvg({ output: `test.svg`})

		stream.on(`data`, (file) => {
			strictEqual(file.relative, `test.svg`)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg/>`),
			path: `circle.svg`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg/>`),
			path: `square.svg`
		}))

		stream.end()
	})

	it(`should include all namespace into final svg`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, (file) => {
			const stack = parse(file.contents.toString()).querySelector(`svg`)
			strictEqual(stack.getAttribute(`xmlns`), `http://www.w3.org/2000/svg`)
			strictEqual(stack.getAttribute(`xmlns:xlink`), `http://www.w3.org/1999/xlink`)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>`),
			path: `rect.svg`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 50 50"><rect id="a" width="50" height="10"/><use y="20" xlink:href="#a"/><use y="40" xlink:href="#a"/></svg>`),
			path: `sandwich.svg`
		}))

		stream.end()
	})

	it(`should not include duplicate namespaces into final svg`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, (file) => {
			strictEqual(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><style>:root{visibility:hidden}:target{visibility:visible}</style><svg id="rect"></svg><svg id="sandwich"></svg></svg>`, file.contents.toString())
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"/>`),
			path: `rect.svg`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"/>`),
			path: `sandwich.svg`
		}))

		stream.end()
	})

	it(`should replace the space with the hyphen when spacer is not passed`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, (file) => {
			strictEqual(
				`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><style>:root{visibility:hidden}:target{visibility:visible}</style><svg id="icon-like"></svg></svg>`,
				file.contents.toString()
			)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"/>`),
			path: `icon like.svg`
		}))

		stream.end()
	})

	it(`should replace the space with the passed spacer option`, (done) => {
		const stream = stacksvg({ spacer: `--` })

		stream.on(`data`, (file) => {
			strictEqual(
				`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><style>:root{visibility:hidden}:target{visibility:visible}</style><svg id="icon--like"></svg></svg>`,
				file.contents.toString()
			)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"/>`),
			path: `icon like.svg`
		}))

		stream.end()
	})

	it(`Should remove the space if an empty string is passed to spacer option`, (done) => {
		const stream = stacksvg({ spacer: `` })

		stream.on(`data`, (file) => {
			strictEqual(
				`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><style>:root{visibility:hidden}:target{visibility:visible}</style><svg id="iconlike"></svg></svg>`,
				file.contents.toString()
			)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"/>`),
			path: `icon like.svg`
		}))

		stream.end()
	})

	it(`should replace the directory separator with the underscore`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, (file) => {
			strictEqual(
				`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><style>:root{visibility:hidden}:target{visibility:visible}</style><svg id="icons_like"></svg></svg>`,
				file.contents.toString()
			)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"/>`),
			path: `icons/like.svg`
		}))

		stream.end()
	})

	it(`should replace the directory separator with the passed separator option`, (done) => {
		const stream = stacksvg({ separator: `__` })

		stream.on(`data`, (file) => {
			strictEqual(
				`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><style>:root{visibility:hidden}:target{visibility:visible}</style><svg id="icons__like"></svg></svg>`,
				file.contents.toString()
			)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"/>`),
			path: `icons/like.svg`
		}))

		stream.end()
	})

	it(`should remove the directory separator if an empty string is passed to separator option`, (done) => {
		const stream = stacksvg({ separator: `` })

		stream.on(`data`, (file) => {
			strictEqual(
				`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><style>:root{visibility:hidden}:target{visibility:visible}</style><svg id="iconslike"></svg></svg>`,
				file.contents.toString()
			)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"/>`),
			path: `icons/like.svg`
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
			contents: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:lk="http://www.w3.org/1999/xlink"><rect id="a" width="1" height="1"/><use y="2" lk:href="#a"/></svg>`),
			path: `rect.svg`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 50 50"><rect id="a" width="50" height="10"/><use y="20" xlink:href="#a"/><use y="40" xlink:href="#a"/></svg>`),
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
			contents: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1998/xlink"><rect id="a" width="1" height="1"/><use y="2" xlink:href="#a"/></svg>`),
			path: `rect.svg`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"viewBox="0 0 50 50"><rect id="a" width="50" height="10"/><use y="20" xlink:href="#a"/><use y="40" xlink:href="#a"/></svg>`),
			path: `sandwich.svg`
		}))

		stream.end()
	})

	it(`should generate unique inner id`, (done) => {
		const stream = stacksvg()

		stream.on(`data`, (file) => {
			strictEqual(
				`<svg xmlns="http://www.w3.org/2000/svg"><style>:root{visibility:hidden}:target{visibility:visible}</style><svg viewBox="0 0 40 40" id="one"><mask id="one_0"></mask><mask id="one_1"></mask><g><mask id="one_2"></mask></g><path mask="url(#one_0)"></path><g><path mask="url(#one_1)"></path><g><path mask="url(#one_2)"></path></g></g></svg><svg viewBox="0 0 40 40" id="two"><mask id="two_0"></mask><mask id="two_1"></mask><g><mask id="two_2"></mask></g><path mask="url(#two_0)"></path><g><path mask="url(#two_1)"></path><g><path mask="url(#two_2)"></path></g></g></svg></svg>`,
				file.contents.toString()
			)
			done()
		})

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><mask id="a"/><mask id="b"/><g><mask id="c"/></g><path mask="url(#a)"/><g><path mask="url(#b)"/><g><path mask="url(#c)"/></g></g></svg>`),
			path: `one.svg`
		}))

		stream.write(new Vinyl({
			contents: Buffer.from(`<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><mask id="a"/><mask id="b"/><g><mask id="c"/></g><path mask="url(#a)"/><g><path mask="url(#b)"/><g><path mask="url(#c)"/></g></g></svg>`),
			path: `two.svg`
		}))

		stream.end()
	})
})
