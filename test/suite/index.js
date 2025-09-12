const path = require('path')
const Mocha = require('mocha')

async function run() {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60000 })
  mocha.addFile(path.resolve(__dirname, 'vscode-diagnostics.test.js'))
  mocha.addFile(path.resolve(__dirname, 'vscode-two-blocks.test.js'))
  mocha.addFile(path.resolve(__dirname, 'vscode-inset-management.test.js'))
  return new Promise((resolve, reject) => {
    try {
      mocha.run(failures => {
        if (failures > 0) reject(new Error(`${failures} tests failed`))
        else resolve()
      })
    } catch (err) {
      reject(err)
    }
  })
}

module.exports = { run }


