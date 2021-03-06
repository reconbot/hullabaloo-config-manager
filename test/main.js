import path from 'path'

import test from 'ava'
import md5Hex from 'md5-hex'
import proxyquire from 'proxyquire'

import { createConfig, fromConfig, fromDirectory, prepareCache, restoreVerifier } from '../'
import Verifier from '../lib/Verifier'
import fixture from './helpers/fixture'
import runGeneratedCode from './helpers/runGeneratedCode'

function mockCurrentEnv (env = {}) {
  return proxyquire('../', {
    './lib/currentEnv': proxyquire('../lib/currentEnv', {
      process: {
        env
      }
    })
  }).currentEnv
}

test('createConfig() allows dir to be specified separately from source', async t => {
  const dir = fixture('compare')
  const result = await fromConfig(createConfig({
    options: {
      babelrc: false,
      plugins: ['plugin']
    },
    source: 'foo',
    dir
  }))
  const configModule = runGeneratedCode(result.generateModule())

  const pluginIndex = path.join(dir, 'node_modules', 'plugin', 'index.js')
  t.deepEqual(configModule.getOptions(), {
    babelrc: false,
    plugins: [pluginIndex]
  })
})

test('createConfig() can take a fixed hash for the options', async t => {
  const result = await fromConfig(createConfig({
    options: {
      babelrc: false
    },
    source: 'foo',
    hash: 'hash of foo'
  }))

  const verifier = await result.createVerifier()
  t.deepEqual(verifier.cacheKeysForCurrentEnv(), {
    dependencies: md5Hex([]),
    sources: md5Hex(['hash of foo'])
  })
})

test('createConfig() copies options to prevent modification of original input', async t => {
  const options = {
    env: {
      foo: {
        env: {
          bar: {}
        }
      }
    }
  }

  await fromConfig(createConfig({
    options,
    source: fixture()
  }))
  t.deepEqual(options, {
    env: {
      foo: {
        env: {
          bar: {}
        }
      }
    }
  })
})

test('createConfig() throws if options are not provided', t => {
  const err = t.throws(() => createConfig(), TypeError)
  t.is(err.message, "Expected 'options' and 'source' options")
})

test('createConfig() throws if \'options\' option is not provided', t => {
  const err = t.throws(() => createConfig({ source: 'foo' }), TypeError)
  t.is(err.message, "Expected 'options' and 'source' options")
})

test('createConfig() throws if \'source\' option is not provided', t => {
  const err = t.throws(() => createConfig({ options: {} }), TypeError)
  t.is(err.message, "Expected 'options' and 'source' options")
})

test('createConfig() throws if \'options\' option is null', t => {
  const err = t.throws(() => createConfig({ options: null, source: 'foo' }), TypeError)
  t.is(err.message, "Expected 'options' and 'source' options")
})

test('createConfig() throws if \'options\' option is an array', t => {
  const err = t.throws(() => createConfig({ options: [], source: 'foo' }), TypeError)
  t.is(err.message, "'options' must be an actual object")
})

test('createConfig() throws if \'options\' option is not an object', t => {
  const err = t.throws(() => createConfig({ options: 'str', source: 'foo' }), TypeError)
  t.is(err.message, "'options' must be an actual object")
})

test('currentEnv() returns BABEL_ENV, if set', t => {
  const currentEnv = mockCurrentEnv({
    BABEL_ENV: 'foo'
  })
  t.true(currentEnv() === 'foo')
})

test('currentEnv() returns NODE_ENV, if no BABEL_ENV', t => {
  const currentEnv = mockCurrentEnv({
    NODE_ENV: 'foo'
  })
  t.true(currentEnv() === 'foo')
})

test('currentEnv() falls back to "development", if no BABEL_ENV or NODE_ENV', t => {
  const currentEnv = mockCurrentEnv()
  t.true(currentEnv() === 'development')
})

test('fromDirectory() resolves options, dependencies, uses cache, and can generate code', async t => {
  const dir = fixture('compare')
  const cache = prepareCache()
  const result = await fromDirectory(dir, {cache})

  for (const file of [
    fixture('compare', '.babelrc'),
    fixture('compare', 'extended-by-babelrc.json5'),
    fixture('compare', 'package.json')
  ]) {
    t.true(cache.files.has(file))
  }
  t.true(cache.pluginsAndPresets.has(dir))

  const env = {}
  const configModule = runGeneratedCode(result.generateModule(), env)

  const pluginIndex = path.join(dir, 'node_modules', 'plugin', 'index.js')
  const presetIndex = path.join(dir, 'node_modules', 'preset', 'index.js')
  t.deepEqual(configModule.getOptions(), {
    plugins: [
      [
        pluginIndex,
        {
          label: 'plugin@extended-by-babelrc'
        }
      ]
    ],
    presets: [
      [
        presetIndex,
        {
          label: 'preset@extended-by-babelrc'
        }
      ]
    ],
    babelrc: false,
    sourceMaps: false,
    env: {
      development: {
        plugins: [
          [
            pluginIndex,
            {
              label: 'plugin@babelrc'
            }
          ]
        ],
        presets: [
          [
            presetIndex,
            {
              label: 'preset@babelrc'
            }
          ]
        ]
      }
    }
  })

  env.BABEL_ENV = 'foo'
  const envPluginIndex = path.join(dir, 'node_modules', 'env-plugin', 'index.js')
  const pluginDefaultOptsIndex = path.join(dir, 'node_modules', 'plugin-default-opts', 'index.js')
  t.deepEqual(configModule.getOptions(), {
    plugins: [
      [
        pluginIndex,
        {
          label: 'plugin@extended-by-babelrc'
        }
      ]
    ],
    presets: [
      [
        presetIndex,
        {
          label: 'preset@extended-by-babelrc'
        }
      ]
    ],
    babelrc: false,
    sourceMaps: false,
    env: {
      foo: {
        plugins: [
          [
            pluginIndex,
            {
              label: 'plugin@extended-by-babelrc.foo'
            }
          ]
        ],
        presets: [
          [
            presetIndex,
            {
              label: 'preset@extended-by-babelrc.foo'
            }
          ]
        ],
        env: {
          foo: {
            plugins: [
              [
                pluginIndex,
                {
                  label: 'plugin@babelrc'
                }
              ]
            ],
            presets: [
              [
                presetIndex,
                {
                  label: 'preset@babelrc'
                }
              ]
            ],
            env: {
              foo: {
                plugins: [
                  [
                    envPluginIndex,
                    {
                      label: 'plugin@babelrc.foo'
                    }
                  ],
                  pluginDefaultOptsIndex
                ],
                presets: [
                  [
                    presetIndex,
                    {
                      label: 'preset@babelrc.foo'
                    }
                  ]
                ]
              }
            }
          }
        }
      }
    }
  })
})

test('fromDirectory() works without cache', async t => {
  await t.notThrows(fromDirectory(fixture('compare')))
})

test('fromConfig() resolves options, dependencies, uses cache, and can generate code', async t => {
  const dir = fixture('compare')
  const cache = prepareCache()
  const source = fixture('compare', 'virtual.json')
  const result = await fromConfig(createConfig({
    options: require(source), // eslint-disable-line import/no-dynamic-require
    source
  }), { cache })

  for (const file of [
    fixture('compare', '.babelrc'),
    fixture('compare', 'extended-by-babelrc.json5'),
    fixture('compare', 'extended-by-virtual.json5'),
    fixture('compare', 'extended-by-virtual-foo.json5'),
    fixture('compare', 'package.json')
  ]) {
    t.true(cache.files.has(file))
  }
  t.true(cache.pluginsAndPresets.has(dir))

  const env = {}
  const configModule = runGeneratedCode(result.generateModule(), env)

  const pluginIndex = path.join(dir, 'node_modules', 'plugin', 'index.js')
  const presetIndex = path.join(dir, 'node_modules', 'preset', 'index.js')
  const envPluginIndex = path.join(dir, 'node_modules', 'env-plugin', 'index.js')
  const pluginDefaultOptsIndex = path.join(dir, 'node_modules', 'plugin-default-opts', 'index.js')
  t.deepEqual(configModule.getOptions(), {
    plugins: [
      [
        pluginIndex,
        {
          label: 'plugin@extended-by-babelrc'
        }
      ]
    ],
    presets: [
      [
        presetIndex,
        {
          label: 'preset@extended-by-babelrc'
        }
      ]
    ],
    babelrc: false,
    sourceMaps: true,
    env: {
      development: {
        plugins: [
          [
            pluginIndex,
            {
              label: 'plugin@babelrc'
            }
          ]
        ],
        presets: [
          [
            presetIndex,
            {
              label: 'preset@babelrc'
            }
          ]
        ],
        env: {
          development: {
            plugins: [
              [
                pluginIndex,
                {
                  label: 'plugin@extended-by-virtual'
                }
              ]
            ],
            presets: [
              [
                presetIndex,
                {
                  label: 'preset@extended-by-virtual'
                }
              ]
            ],
            env: {
              development: {
                plugins: [
                  [
                    pluginIndex,
                    {
                      label: 'plugin@virtual'
                    }
                  ]
                ],
                presets: [
                  [
                    presetIndex,
                    {
                      label: 'preset@virtual'
                    }
                  ]
                ]
              }
            }
          }
        }
      }
    }
  })

  env.BABEL_ENV = 'foo'
  t.deepEqual(configModule.getOptions(), {
    plugins: [
      [
        pluginIndex,
        {
          label: 'plugin@extended-by-babelrc'
        }
      ]
    ],
    presets: [
      [
        presetIndex,
        {
          label: 'preset@extended-by-babelrc'
        }
      ]
    ],
    babelrc: false,
    sourceMaps: true,
    env: {
      foo: {
        plugins: [
          [
            pluginIndex,
            {
              label: 'plugin@extended-by-babelrc.foo'
            }
          ]
        ],
        presets: [
          [
            presetIndex,
            {
              label: 'preset@extended-by-babelrc.foo'
            }
          ]
        ],
        env: {
          foo: {
            plugins: [
              [
                pluginIndex,
                {
                  label: 'plugin@babelrc'
                }
              ]
            ],
            presets: [
              [
                presetIndex,
                {
                  label: 'preset@babelrc'
                }
              ]
            ],
            env: {
              foo: {
                plugins: [
                  [
                    envPluginIndex,
                    {
                      label: 'plugin@babelrc.foo'
                    }
                  ],
                  pluginDefaultOptsIndex
                ],
                presets: [
                  [
                    presetIndex,
                    {
                      label: 'preset@babelrc.foo'
                    }
                  ]
                ],
                env: {
                  foo: {
                    plugins: [
                      [
                        pluginIndex,
                        {
                          label: 'plugin@extended-by-virtual'
                        }
                      ]
                    ],
                    presets: [
                      [
                        presetIndex,
                        {
                          label: 'preset@extended-by-virtual'
                        }
                      ]
                    ],
                    env: {
                      foo: {
                        plugins: [
                          [
                            pluginIndex,
                            {
                              label: 'plugin@extended-by-virtual.foo'
                            }
                          ]
                        ],
                        presets: [
                          [
                            presetIndex,
                            {
                              label: 'preset@extended-by-virtual.foo'
                            }
                          ]
                        ],
                        env: {
                          foo: {
                            plugins: [
                              [
                                pluginIndex,
                                {
                                  label: 'plugin@virtual'
                                }
                              ]
                            ],
                            presets: [
                              [
                                presetIndex,
                                {
                                  label: 'preset@virtual'
                                }
                              ]
                            ],
                            env: {
                              foo: {
                                plugins: [
                                  [
                                    pluginIndex,
                                    {
                                      label: 'plugin@extended-by-virtual-foo'
                                    }
                                  ]
                                ],
                                presets: [
                                  [
                                    presetIndex,
                                    {
                                      label: 'preset@extended-by-virtual-foo'
                                    }
                                  ]
                                ],
                                env: {
                                  foo: {
                                    plugins: [
                                      [
                                        pluginIndex,
                                        {
                                          label: 'plugin@virtual.foo'
                                        }
                                      ]
                                    ],
                                    presets: [
                                      [
                                        presetIndex,
                                        {
                                          label: 'preset@virtual.foo'
                                        }
                                      ]
                                    ]
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  })
})

test('fromConfig() works without cache', async t => {
  const source = fixture('compare', 'virtual.json')
  await t.notThrows(fromConfig(createConfig({
    options: require(source), // eslint-disable-line import/no-dynamic-require
    source
  })))
})

test('prepareCache()', t => {
  const cache = prepareCache()
  t.deepEqual(Object.keys(cache), ['dependencyHashes', 'fileExistence', 'files', 'pluginsAndPresets', 'sourceHashes'])
  t.true(cache.dependencyHashes instanceof Map)
  t.true(cache.fileExistence instanceof Map)
  t.true(cache.files instanceof Map)
  t.true(cache.pluginsAndPresets instanceof Map)
  t.true(cache.sourceHashes instanceof Map)
})

test('restoreVerifier()', t => {
  const verifier = new Verifier(__dirname, new Set(), [], [])
  const buffer = verifier.toBuffer()

  t.deepEqual(restoreVerifier(buffer), verifier)
})
