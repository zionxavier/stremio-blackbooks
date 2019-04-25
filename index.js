const needle = require('needle')
const package = require('./package')

const booksEndpoint = 'https://stremio-books.cf'

function toStream(type, meta) {
  const stream = {
    title: meta.file + '\n' + meta.reg_date + (meta.filesize ? ' | ' + meta.filesize : '') + (meta.filetype ? ' | ' + meta.filetype : ''),
  }
  stream.title = stream.title.split(',').join('')
  if (type == 'audio')
    stream.url = meta.link.split('\\').join('')
  else
    stream.externalUrl = meta.link.split('\\').join('')
  return stream
}

function search(type, searchQuery) {
  return new Promise((resolve, reject) => {
    needle.post('https://filepursuit.com/jsn/v1/search.php', { searchQuery, type }, (err, resp, body) => {
      if (err)
        reject(err)
      else if (body && Array.isArray(body) && body.length)
        resolve({ streams: body.map(toStream.bind(null, type)), cacheMaxAge: 86400 }) // cache for 1 day
      else
        reject(new Error('Response body is empty'))
    })
  })  
}

function atob(str) {
  return Buffer.from(str, 'base64').toString('binary')
}

function buildQuery(args) {
  const queryJSON = atob(args.id.split(':')[1])
  let query
  try {
    query = JSON.parse(queryJSON)
  } catch(e) {}
  if (query) {
    if (query.name && query.artist) {
      if (query.name.includes(' ('))
        query.name = query.name.substr(0, query.name.indexOf(' ('))
      return query.name + ' ' + query.artist
    }
  }
  return null
}

const { addonBuilder, serveHTTP, publishToCentral }  = require('stremio-addon-sdk')

const addon = new addonBuilder({
  id: 'org.blackbooks',
  version: '0.0.1',
  logo: 'https://t3.ftcdn.net/jpg/00/86/13/24/160_F_86132439_RqAbUUQuGcGn5pFOVJw3ufDv0EiU0yyI.jpg',
  name: 'Black Books',
  description: 'Free eBooks from Open Directories',
  resources: [ 'catalog', 'meta', 'stream' ],
  types: [ 'movie', 'other' ],
  idPrefixes: [ 'ebook:' ],
  catalogs: [
    {
      id: 'ebook-search',
      name: 'eBooks',
      type: 'other',
      extra: [
        { name: 'search', isRequired: true }
      ]
    }, {
      id: 'books-top-paid',
      name: 'Black Books',
      type: 'other'
    }
  ]
})

addon.defineCatalogHandler(args => {
  return new Promise((resolve, reject) => {
    let path
    if (args.extra.search)
      path = '/catalog/' + args.type + '/' + args.id + '/search=' + encodeURIComponent(args.extra.search) + '.json'
    else
      path = '/catalog/' + args.type + '/' + args.id + '.json'
    needle.get(booksEndpoint + path, (err, resp, body) => {
      if (body && body.metas) {
        resolve(body)
      } else {
        reject(new Error('Cannot get catalog for: '+args.id))
      }
    })
  })
})

addon.defineMetaHandler(args => {
  return new Promise((resolve, reject) => {
    const path = '/meta/' + args.type + '/' + args.id + '.json'
    needle.get(booksEndpoint + path, (err, resp, body) => {
      if (body && body.meta) {
        resolve(body)
      } else {
        reject(new Error('Cannot get catalog for: '+args.id))
      }
    })
  })
})

addon.defineStreamHandler(args => {
  // audiobooks prefix is removed from manifest
  // it gave too many wrong results
  const type = args.id.startsWith('audiobook:') ? 'audio' : 'ebook' 
  const query = buildQuery(args)
  return search(type, query)
})

module.exports = addon.getInterface()
