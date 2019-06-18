const App = require('../../app/App')
const { BOOTSTRAP_CONFIG, BOOTSTRAP_PAGES } = require('../../utils/constants')

test('add custom GraphQL object types', async () => {
  const app = await createApp(function (api) {
    api.loadSource(({ addContentType, addSchemaTypes, schema }) => {
      addContentType('Post').addNode({
        id: '1',
        title: 'My Post',
        content: 'Value'
      })

      addSchemaTypes([
        schema.createObjectType({
          name: 'Author',
          fields: {
            name: 'String'
          }
        }),
        schema.createObjectType({
          name: 'Post',
          interfaces: ['Node'],
          extensions: {
            infer: true
          },
          fields: {
            id: 'ID!',
            author: {
              type: 'Author',
              resolve: () => ({ name: 'The Author' })
            }
          }
        })
      ])
    })
  })

  const { errors, data } = await app.graphql(`{
    post(id:"1") {
      title
      content
      author {
        name
      }
    }
  }`)

  expect(errors).toBeUndefined()
  expect(data.post.title).toEqual('My Post')
  expect(data.post.content).toEqual('Value')
  expect(data.post.author).toMatchObject({ name: 'The Author' })
})

test('add custom GraphQL union type', async () => {
  const app = await createApp(function (api) {
    api.loadSource(store => {
      store.addContentType('Track').addNode({ id: '1', name: 'A Track' })
      store.addContentType('Album').addNode({ id: '1', name: 'An Album' })
      store.addContentType('Single').addNode({ id: '1', name: 'A Single' })
    })

    api.createSchema(({ addSchemaTypes, schema }) => {
      addSchemaTypes([
        schema.createObjectType({
          name: 'Album',
          interfaces: ['Node'],
          fields: {
            name: 'String'
          }
        }),
        schema.createObjectType({
          name: 'Single',
          interfaces: ['Node'],
          fields: {
            name: 'String'
          }
        }),
        schema.createUnionType({
          name: 'AppearsOnUnion',
          interfaces: ['Node'],
          types: ['Album', 'Single']
        }),
        schema.createObjectType({
          name: 'Track',
          interfaces: ['Node'],
          fields: {
            appearsOn: {
              type: ['AppearsOnUnion'],
              resolve: (_, args, ctx) => {
                const query = { typeName: { $in: ['Album', 'Single'] }}
                return ctx.store.chainIndex(query).data()
              }
            }
          }
        })
      ])
    })
  })

  const { errors, data } = await app.graphql(`{
    track(id:"1") {
      appearsOn {
        __typename
      }
    }
  }`)

  expect(errors).toBeUndefined()
  expect(data.track.appearsOn).toHaveLength(2)
})

test('add custom GraphQL types from SDL', async () => {
  const app = await createApp(function (api) {
    api.loadSource(({ addContentType }) => {
      addContentType('Post').addNode({
        id: '1',
        title: 'My Post',
        content: 'Value'
      })
    })

    api.createSchema(({ addSchemaTypes, addSchemaResolvers }) => {
      addSchemaTypes(`
        type Author {
          name: String
        }
        type Post implements Node @infer {
          proxyContent: String @proxy(from:"content")
          author: Author
        }
      `)

      addSchemaResolvers({
        Post: {
          author: () => ({
            name: 'The Author'
          })
        }
      })
    })
  })

  const { errors, data } = await app.graphql(`{
    post(id:"1") {
      title
      content
      proxyContent
      author {
        name
      }
    }
  }`)

  expect(errors).toBeUndefined()
  expect(data.post.title).toEqual('My Post')
  expect(data.post.content).toEqual('Value')
  expect(data.post.proxyContent).toEqual('Value')
  expect(data.post.author).toMatchObject({ name: 'The Author' })
})

test('add @reference directive', async () => {
  const app = await createApp(function (api) {
    api.loadSource(({ addContentType, addSchemaTypes }) => {
      const tracks = addContentType('Track')
      const albums = addContentType('Album')

      tracks.addNode({ id: '1', name: 'A Track', album: 'first-album', albums: ['second-album', 'third-album'] })
      albums.addNode({ id: '1', name: 'First Album', slug: 'first-album' })
      albums.addNode({ id: '2', name: 'Second Album', slug: 'second-album' })
      albums.addNode({ id: '3', name: 'Third Album', slug: 'third-album' })

      addSchemaTypes(`
        type Track implements Node {
          album: Album @reference(by:"slug")
          albums: [Album] @reference(by:"slug")
        }
      `)
    })
  })

  const { errors, data } = await app.graphql(`{
    track(id:"1") {
      album {
        name
      }
      albums {
        name
      }
    }
  }`)

  expect(errors).toBeUndefined()
  expect(data.track.album.name).toEqual('First Album')
  expect(data.track.albums).toHaveLength(2)
})

test('add custom resolver for invalid field names', async () => {
  const app = await createApp(function (api) {
    api.loadSource(store => {
      store.addContentType('Post').addNode({
        id: '1',
        '123': 4,
        '456-test': 4,
        '789 test': 10
      })
    })

    api.createSchema(({ addSchemaTypes, addSchemaResolvers, schema }) => {
      addSchemaTypes([
        schema.createObjectType({
          name: 'Post',
          interfaces: ['Node'],
          extensions: {
            infer: true
          },
          fields: {
            id: 'ID!',
            _123: {
              type: 'Int',
              resolve: obj => obj['123'] + 6
            },
            proxyField: {
              type: 'Int',
              extensions: {
                proxy: {
                  from: '789 test'
                }
              }
            }
          }
        })
      ])

      addSchemaResolvers({
        Post: {
          _456_test: {
            resolve: obj => obj['456-test'] + 6
          }
        }
      })
    })
  })

  const { errors, data } = await app.graphql(`{
    post(id:"1") {
      _123
      _456_test
      _789_test
      proxyField
    }
  }`)

  expect(errors).toBeUndefined()
  expect(data.post._123).toEqual(10)
  expect(data.post._456_test).toEqual(10)
  expect(data.post._789_test).toEqual(10)
  expect(data.post.proxyField).toEqual(10)
})

test('add custom resolvers for content type', async () => {
  const app = await createApp(function (api) {
    api.loadSource(store => {
      store.addContentType('Post').addNode({ id: '1', title: 'My Post' })
    })
    api.createSchema(({ addSchemaResolvers }) => {
      addSchemaResolvers({
        Post: {
          customField: {
            type: 'String',
            resolve () {
              return 'value'
            }
          }
        }
      })
    })
  })

  const { errors, data } = await app.graphql(`{
    post(id:"1") {
      title
      customField
    }
  }`)

  expect(errors).toBeUndefined()
  expect(data.post.title).toEqual('My Post')
  expect(data.post.customField).toEqual('value')
})

test('disable field inference with SDL', async () => {
  const app = await createApp(function (api) {
    api.loadSource(({ addContentType, addSchemaTypes }) => {
      addContentType('Post').addNode({
        id: '1',
        title: 'My Post',
        content: 'Value'
      })

      addSchemaTypes(`
        type Post implements Node {
          title: String
        }
      `)
    })
  })

  const { errors } = await app.graphql(`{
    post(id:"1") {
      title
      content
    }
  }`)

  expect(errors).toHaveLength(1)
  expect(errors[0].message).toMatch('Cannot query field "content" on type "Post"')
})

test('disable field inference with createObjectType', async () => {
  const app = await createApp(function (api) {
    api.loadSource(({ addContentType, addSchemaTypes, schema }) => {
      addContentType('Post').addNode({
        id: '1',
        title: 'My Post',
        content: 'Value'
      })

      addSchemaTypes([
        schema.createObjectType({
          name: 'Post',
          interfaces: ['Node'],
          fields: {
            title: 'String'
          }
        })
      ])
    })
  })

  const { errors } = await app.graphql(`{
    post(id:"1") {
      title
      content
    }
  }`)

  expect(errors).toHaveLength(1)
  expect(errors[0].message).toMatch('Cannot query field "content" on type "Post"')
})

test('insert default resolvers for SDL', async () => {
  const app = await createApp(function (api) {
    api.loadSource(({ addContentType, addSchemaTypes, addSchemaResolvers, store }) => {
      addContentType('Author').addNode({
        id: '1',
        name: 'An Author'
      })

      addContentType('Post').addNode({
        id: '1',
        title: 'My Post',
        authors: [
          store.createReference('Author', '1')
        ],
        object: {
          year: '2019'
        }
      })

      addSchemaTypes(`
        type PostObject {
          year: Date
        }
        type Post implements Node {
          title: String
          author: Author
          authors: [Author]
          object: PostObject
        }
      `)

      addSchemaResolvers({
        Post: {
          author: {
            resolve (obj, args, ctx, info) {
              return info.originalResolver({
                author: store.createReference('Author', '1')
              }, args, ctx, info)
            }
          }
        }
      })
    })
  })

  const { errors, data } = await app.graphql(`{
    post(id:"1") {
      title
      object {
        year(format:"DD.MM.YYYY")
      }
      author {
        name
      }
      authors {
        name
      }
    }
  }`)

  expect(errors).toBeUndefined()
  expect(data.post.title).toEqual('My Post')
  expect(data.post.author.name).toEqual('An Author')
  expect(data.post.authors).toHaveLength(1)
  expect(data.post.authors[0].name).toEqual('An Author')
  expect(data.post.object.year).toEqual('01.01.2019')
})

test('insert default resolvers with createObjectType', async () => {
  const app = await createApp(function (api) {
    api.loadSource(({ addContentType, addSchemaTypes, addSchemaResolvers, schema }) => {
      addContentType('Post').addNode({ id: '1', title: 'My Post', authors: ['1'] })
      addContentType('Author').addNode({ id: '1', name: 'An Author' })

      addSchemaTypes([
        schema.createObjectType({
          name: 'PostObject',
          fields: {
            year: 'Date'
          }
        }),
        schema.createObjectType({
          name: 'Post',
          interfaces: ['Node'],
          fields: {
            title: 'String',
            author: 'Author',
            authors: ['Author'],
            object: {
              type: 'PostObject',
              resolve: () => ({
                year: '2019'
              })
            }
          }
        })
      ])

      addSchemaResolvers({
        Post: {
          author: {
            resolve (obj, args, ctx, info) {
              return info.originalResolver({ author: '1' }, args, ctx, info)
            }
          }
        }
      })
    })
  })

  const { errors, data } = await app.graphql(`{
    post(id:"1") {
      title
      object {
        year(format:"DD.MM.YYYY")
      }
      author {
        name
      }
      authors {
        name
      }
    }
  }`)

  expect(errors).toBeUndefined()
  expect(data.post.title).toEqual('My Post')
  expect(data.post.author.name).toEqual('An Author')
  expect(data.post.authors).toHaveLength(1)
  expect(data.post.authors[0].name).toEqual('An Author')
  expect(data.post.object.year).toEqual('01.01.2019')
})

test('add custom GraphQL schema', async () => {
  const app = await createApp(function (api) {
    api.createSchema(({ addSchema, ...actions }) => {
      addSchema(new actions.GraphQLSchema({
        query: new actions.GraphQLObjectType({
          name: 'CustomRootQuery',
          fields: {
            customRootValue: {
              type: actions.GraphQLString,
              args: {
                append: {
                  type: actions.GraphQLString,
                  defaultValue: 'foo'
                }
              },
              resolve: (_, args) => 'custom value ' + args.append
            }
          }
        })
      }))
    })
  })

  const { errors, data } = await app.graphql(`{
    value1: customRootValue
    value2: customRootValue(append:"bar")
  }`)

  expect(errors).toBeUndefined()
  expect(data.value1).toEqual('custom value foo')
  expect(data.value2).toEqual('custom value bar')
})

test('merge object types', async () => {
  const { createObjectType } = require('../utils')
  const app = await createApp(null, BOOTSTRAP_CONFIG)

  app.schema.buildSchema({
    types: [
      'type Post { title: String }',
      'type Post { content: String meta: PostMeta }',
      'type PostMeta { status: Boolean }',
      'type PostMeta { id: Boolean }',
      createObjectType({
        name: 'Post',
        fields: {
          authorId: 'String'
        }
      })
    ]
  })

  const typeDefs = app.schema.getSchema().getTypeMap()
  const fields = typeDefs.Post.getFields()
  const metaFields = fields.meta.type.getFields()

  expect(fields.title).toBeDefined()
  expect(fields.content).toBeDefined()
  expect(fields.meta).toBeDefined()
  expect(fields.authorId).toBeDefined()
  expect(metaFields.status).toBeDefined()
  expect(metaFields.id).toBeDefined()
})

test('add deprecated collection field', async () => {
  const app = await createApp(function (api) {
    api.loadSource(store => store.addContentType('test_post'))
  })

  const queryType = app.schema.getSchema().getQueryType()
  const queryFields = queryType.getFields()

  expect(queryFields).toHaveProperty('testPost')
  expect(queryFields).toHaveProperty('allTestPost')
  expect(queryFields).toHaveProperty('alltest_post')
  expect(queryFields.alltest_post.isDeprecated).toEqual(true)
})

function createApp (plugin, phase = BOOTSTRAP_PAGES) {
  const app = new App(__dirname, {
    localConfig: { plugins: plugin ? [plugin] : [] }
  })

  return app.bootstrap(phase)
}
