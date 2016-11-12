#!/usr/bin/env node

var http = require('http')
var serve = require('hyperdrive-http')
var hyperdrive = require('hyperdrive')
var swarm = require('hyperdrive-archive-swarm')
var stats = require('hypercore-stats-ui')
var level = require('level')
var raf = require('random-access-file')
var mkdirp = require('mkdirp')
var minimist = require('minimist')
var path = require('path')
var pretty = require('prettier-bytes')
var opn = require('opn')
var os = require('os')
var fs = require('fs')

var TMP = fs.existsSync('/tmp') ? '/tmp' : os.tmpdir()

var argv = minimist(process.argv.slice(2), {
  alias: {port: 'p'},
  default: {port: 10000, 'stats-port': 10001},
  boolean: ['sparse', 'open']
})

if (!argv._[0] || /![0-9a-f]{64}/.test(argv._[0].toLowerCase())) {
  console.error('Usage: hyperdrive-http-server link [options]')
  console.error()
  console.error('  --port, -p   [10000]')
  console.error('  --path       [/tmp/hyperdrive/{link}]')
  console.error('  --stats-port [10001]')
  console.error('  --sparse     use sparse mode')
  console.error('  --open       use server index.html in browser')
  console.error()
  process.exit(argv.help ? 0 : 1)
}

var key = argv._[0]
var p = argv.path || path.join(TMP, 'hyperdrive', key)

mkdirp.sync(p)

var archive = hyperdrive(level(path.join(p, 'db'))).createArchive(key, {
  sparse: argv.sparse,
  file: function (name) {
    return raf(path.join(p, name))
  }
})

archive.metadata.prioritize({
  priority: 5
})

var route = serve(archive)

var statsServer = http.createServer(stats(archive))
var server = http.createServer(function (req, res) { // hack to get html listing on /
  if (req.url.split('?')[0] === '/') return list(res)
  if (req.url.split('?')[0] === '/.json') req.url = '/'
  route(req, res)
})

listen(server, argv.port, function () {
  listen(statsServer, argv['stats-port'], function () {
    console.log('Hyperdrive server is available at: http://localhost:' + server.address().port)
    console.log('Stats server is available at: http://localhost:' + statsServer.address().port)

    if (argv.open) {
      opn('http://localhost:' + statsServer.address().port)
      opn('http://localhost:' + server.address().port)
    }
  })
})

swarm(archive)

function listen (server, port, cb) {
  server.once('listening', cb)
  server.once('error', function () {
    server.listen(0)
  })
  server.listen(port)
}

function list (res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.write('<html><head><title>' + archive.key.toString('hex') + '</title></head><body><h3>' + archive.key.toString('hex') + '</h3><ul>')
  archive.list({live: false})
    .on('data', function (data) {
      if (data.type === 'file') {
        res.write('<li><a href="/' + encodeURI(data.name) + '">' + data.name.replace(/[<>]/g, '') + ' (' + pretty(data.length) + ')</a></li>')
      }
    })
    .on('end', function () {
      res.end('</body>')
    })
}
