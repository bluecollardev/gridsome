const jsYaml = require('js-yaml')
const assign = require('object-assign')

class YamlTransformer {
  static mimeTypes () {
    return ['text/yaml']
  }

  parse (content) {
    const data = jsYaml.load(content)

    return typeof data !== 'object' || Array.isArray(data)
      ? { ...assign({}, data, { fields: data }) }
      : assign({}, data, { fields: data })
  }
}

module.exports = YamlTransformer
