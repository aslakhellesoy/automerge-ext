const Automerge = require('automerge')

/**
 * Creates a proxy for a model which automatically syncs its state with other models
 *
 * @param docSet the docSet the Automerge doc lives in
 * @param docId the id of the Automerge doc
 * @param Model constructor of the model to proxy
 * @param changeMethods Array of method names that will change the Automerge document
 * @param exposeAutomergeProperties set to true if `#doc` should expose Automerge properties
 * @returns Proxy
 */
function make(docSet, docId, Model, changeMethods, exposeAutomergeProperties) {
  let doc = docSet.getDoc(docId)
  if (!doc)
    throw new Error(`No doc for docId ${docId}. Make sure it's created first!`)
  const model = new Model()
  model._doc = doc
  for (const changeMethod of changeMethods) {
    if (typeof model[changeMethod] !== 'function') {
      throw new Error(`Not a function: ${changeMethod}`)
    }
  }

  docSet.registerHandler((_docId, doc) => {
    if(_docId === docId) {
      model._doc = doc
    }
  })

  const DocHandler = {
    get(target, key) {
      if (changeMethods.includes(key)) {
        return (...args) => {
          let result = null
          const oldDoc = docSet.getDoc(docId)
          const newDoc = Automerge.change(oldDoc, key, doc => {
            model._doc = doc
            result = model[key](...args)
          })
          docSet.setDoc(docId, newDoc)
          return result
        }
      } else if (key === 'doc') {
        return cleanse(docSet.getDoc(docId))
      } else if (key === 'docUpdated') {
        return function(handler) {
          docSet.registerHandler((_docId) => {
            if(_docId === docId) {
              handler()
            }
          })
        }
      } else {
        const prop = model[key]
        return (typeof prop === 'function') ? prop : cleanse(prop)
      }
    },
  }

  function cleanse(object) {
    if (!object) return object
    if (exposeAutomergeProperties) return object
    // Strip out the Automerge objectId properties.
    return JSON.parse(
      JSON.stringify(
        object,
        (key, value) => (key === '_objectId' ? undefined : value)
      )
    )
  }

  return new Proxy({}, DocHandler)
}

module.exports = { make }
