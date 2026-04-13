module.exports = {
  sourceDir: '.',
  artifactsDir: 'web-ext-artifacts',
  build: {
    overwriteDest: true
  },
  run: {
    firefox: 'firefoxdeveloperedition'
  },
  sign: {
    channel: 'unlisted'
  }
};